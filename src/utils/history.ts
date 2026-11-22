/**
 * Lecture et écriture de l'historique (scores et réponses).
 *
 * Deux endroits de stockage :
 * - en ligne (Firestore), pour un joueur connecté : c'est la référence ;
 * - dans le navigateur, un tiroir par joueur. Pour un invité, il contient tout
 *   son historique. Pour un joueur connecté, il ne contient que ce qui n'a pas
 *   encore pu être envoyé en ligne, et se vide dès que l'envoi réussit.
 *
 * Les tiroirs sont séparés par joueur : sur un iPad partagé, les données d'un
 * enfant ne se mélangent jamais à celles d'un autre.
 */
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from "firebase/firestore/lite";
import { GameMode, HighScore, OperationResponse } from "../types";
import { db } from "./firebase";

export const GUEST = "guest";

const LEGACY_OPS_KEY = "multiplication_op_responses";
const LEGACY_SCORES_KEY = "multiplication_highscores";
const GUEST_OFFER_KEY = "mm:v2:guest-offer-declined";
const opsKey = (owner: string) => `mm:v2:ops:${owner}`;
const scoresKey = (owner: string) => `mm:v2:scores:${owner}`;

/** Nombre maximal d'écritures par envoi groupé. */
const BATCH_SIZE = 400;
/** Les règles Firestore refusent un temps supérieur à 1000 s. */
const MAX_SECONDS = 999;

export interface History {
  ops: OperationResponse[];
  scores: HighScore[];
}

export interface LoadedHistory extends History {
  /** false quand l'historique en ligne n'a pas pu être lu : seul le local est affiché. */
  cloudReachable: boolean;
}

export type SaveStatus = "local" | "synced" | "pending";

const EMPTY: History = { ops: [], scores: [] };

// ---------------------------------------------------------------------------
// Stockage dans le navigateur
// ---------------------------------------------------------------------------

function readList<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch (err) {
    console.error(`Lecture locale impossible (${key})`, err);
    return [];
  }
}

function writeList<T>(key: string, list: T[]): void {
  try {
    if (list.length === 0) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(list));
  } catch (err) {
    console.error(`Écriture locale impossible (${key})`, err);
  }
}

function readLocal(owner: string): History {
  return {
    ops: readList<OperationResponse>(opsKey(owner)),
    scores: readList<HighScore>(scoresKey(owner)),
  };
}

function writeLocal(owner: string, history: History): void {
  writeList(opsKey(owner), history.ops);
  writeList(scoresKey(owner), history.scores);
}

/** Réunit plusieurs listes en ne gardant qu'un exemplaire de chaque identifiant. */
export function mergeById<T extends { id: string }>(...lists: T[][]): T[] {
  const byId = new Map<string, T>();
  for (const list of lists) for (const item of list) byId.set(item.id, item);
  return Array.from(byId.values());
}

function appendLocal(owner: string, addition: History): void {
  const current = readLocal(owner);
  writeLocal(owner, {
    ops: mergeById(current.ops, addition.ops),
    scores: mergeById(current.scores, addition.scores),
  });
}

function removeLocal(owner: string, opIds: Set<string>, scoreIds: Set<string>): void {
  const current = readLocal(owner);
  writeLocal(owner, {
    ops: current.ops.filter((o) => !opIds.has(o.id)),
    scores: current.scores.filter((s) => !scoreIds.has(s.id)),
  });
}

/**
 * Reprend les données de l'ancienne version, qui rangeait tous les joueurs
 * dans le même tiroir, et les répartit par joueur. Sans effet les fois suivantes.
 */
export function migrateLegacyStorage(): void {
  const legacyOps = readList<OperationResponse>(LEGACY_OPS_KEY);
  const legacyScores = readList<HighScore>(LEGACY_SCORES_KEY);
  if (legacyOps.length === 0 && legacyScores.length === 0) return;

  const owners = new Map<string, History>();
  const bucket = (userId?: string) => {
    const owner = userId || GUEST;
    if (!owners.has(owner)) owners.set(owner, { ops: [], scores: [] });
    return owners.get(owner)!;
  };
  legacyOps.forEach((op) => bucket(op.userId).ops.push(op));
  legacyScores.forEach((score) => bucket(score.userId).scores.push(score));
  owners.forEach((history, owner) => appendLocal(owner, history));

  try {
    localStorage.removeItem(LEGACY_OPS_KEY);
    localStorage.removeItem(LEGACY_SCORES_KEY);
  } catch (err) {
    console.error("Nettoyage des anciennes données impossible", err);
  }
}

// ---------------------------------------------------------------------------
// Stockage en ligne
// ---------------------------------------------------------------------------

function clampSeconds(value: number): number {
  return Math.min(Math.max(value, 0), MAX_SECONDS);
}

/** Document Firestore d'un score : exactement les champs exigés par firestore.rules. */
function toScoreDoc(score: HighScore, uid: string, displayName: string) {
  return {
    id: score.id,
    userId: uid,
    userDisplayName: displayName || "Joueur",
    date: score.date,
    tables: score.tables,
    gameMode: score.gameMode,
    questionCount: score.questionCount,
    correctCount: score.correctCount,
    scorePercentage: score.scorePercentage,
    averageTime: clampSeconds(score.averageTime),
    createdAt: serverTimestamp(),
    ...(score.profileId ? { profileId: score.profileId } : {}),
  };
}

/** Document Firestore d'une réponse : exactement les champs exigés par firestore.rules. */
function toOpDoc(op: OperationResponse, uid: string) {
  return {
    id: op.id,
    userId: uid,
    num1: op.num1,
    num2: op.num2,
    userAnswer: op.userAnswer ?? null,
    correctAnswer: op.correctAnswer,
    isCorrect: op.isCorrect,
    timeTaken: clampSeconds(op.timeTaken),
    date: op.date,
    createdAt: serverTimestamp(),
    ...(op.profileId ? { profileId: op.profileId } : {}),
  };
}

async function fetchCloud(uid: string): Promise<History> {
  const [opsSnap, scoresSnap] = await Promise.all([
    getDocs(query(collection(db, "operation_responses"), where("userId", "==", uid))),
    getDocs(query(collection(db, "highscores"), where("userId", "==", uid))),
  ]);

  const ops: OperationResponse[] = opsSnap.docs.map((snap) => {
    const d = snap.data();
    return {
      id: d.id,
      userId: d.userId,
      num1: d.num1,
      num2: d.num2,
      userAnswer: d.userAnswer ?? null,
      correctAnswer: d.correctAnswer,
      isCorrect: d.isCorrect,
      timeTaken: d.timeTaken,
      date: d.date,
      ...(d.profileId ? { profileId: d.profileId as string } : {}),
    };
  });

  const scores: HighScore[] = scoresSnap.docs.map((snap) => {
    const d = snap.data();
    return {
      id: d.id,
      date: d.date,
      tables: d.tables,
      gameMode: d.gameMode as GameMode,
      questionCount: d.questionCount,
      correctCount: d.correctCount,
      scorePercentage: d.scorePercentage,
      averageTime: d.averageTime,
      userId: d.userId,
      userDisplayName: d.userDisplayName,
      ...(d.profileId ? { profileId: d.profileId as string } : {}),
    };
  });

  return { ops, scores };
}

type Write =
  | { kind: "score"; score: HighScore }
  | { kind: "op"; op: OperationResponse };

async function uploadToCloud(uid: string, displayName: string, records: History): Promise<void> {
  const writes: Write[] = [
    ...records.scores.map((score) => ({ kind: "score" as const, score })),
    ...records.ops.map((op) => ({ kind: "op" as const, op })),
  ];
  for (let start = 0; start < writes.length; start += BATCH_SIZE) {
    const batch = writeBatch(db);
    for (const write of writes.slice(start, start + BATCH_SIZE)) {
      if (write.kind === "score") {
        batch.set(doc(db, "highscores", write.score.id), toScoreDoc(write.score, uid, displayName));
      } else {
        batch.set(doc(db, "operation_responses", write.op.id), toOpDoc(write.op, uid));
      }
    }
    await batch.commit();
  }
}

async function deleteFromCloud(collectionName: string, ids: string[]): Promise<void> {
  for (let start = 0; start < ids.length; start += BATCH_SIZE) {
    const batch = writeBatch(db);
    ids.slice(start, start + BATCH_SIZE).forEach((id) => batch.delete(doc(db, collectionName, id)));
    await batch.commit();
  }
}

// ---------------------------------------------------------------------------
// API utilisée par l'application
// ---------------------------------------------------------------------------

/**
 * Charge l'historique d'un joueur (uid) ou de l'invité (null).
 * Pour un joueur connecté, renvoie aussi en ligne ce qui était resté en attente.
 */
export async function loadHistory(uid: string | null, displayName = ""): Promise<LoadedHistory> {
  migrateLegacyStorage();
  if (!uid) return { ...readLocal(GUEST), cloudReachable: false };

  const local = readLocal(uid);
  let cloud: History;
  try {
    cloud = await fetchCloud(uid);
  } catch (err) {
    console.error("Historique en ligne inaccessible", err);
    return { ...local, cloudReachable: false };
  }

  // Ce qui est déjà en ligne n'a plus besoin d'être gardé dans le navigateur.
  // On retire uniquement ces éléments-là : une partie terminée pendant ce
  // chargement a pu être ajoutée au tiroir entre-temps et doit y rester.
  const cloudOpIds = new Set(cloud.ops.map((o) => o.id));
  const cloudScoreIds = new Set(cloud.scores.map((s) => s.id));
  removeLocal(uid, cloudOpIds, cloudScoreIds);

  const pending: History = {
    ops: local.ops.filter((o) => !cloudOpIds.has(o.id)),
    scores: local.scores.filter((s) => !cloudScoreIds.has(s.id)),
  };

  if (pending.ops.length > 0 || pending.scores.length > 0) {
    try {
      await uploadToCloud(uid, displayName, pending);
      removeLocal(
        uid,
        new Set(pending.ops.map((o) => o.id)),
        new Set(pending.scores.map((s) => s.id))
      );
    } catch (err) {
      console.error("Envoi des parties en attente impossible, nouvel essai plus tard", err);
    }
  }

  return {
    ops: [...cloud.ops, ...pending.ops],
    scores: [...cloud.scores, ...pending.scores],
    cloudReachable: true,
  };
}

/**
 * Enregistre une partie. Elle est d'abord écrite dans le navigateur, pour ne
 * jamais être perdue, puis envoyée en ligne si un joueur est connecté.
 */
export async function saveGame(
  uid: string | null,
  displayName: string,
  record: History
): Promise<SaveStatus> {
  appendLocal(uid ?? GUEST, record);
  if (!uid) return "local";
  try {
    await uploadToCloud(uid, displayName, record);
    removeLocal(
      uid,
      new Set(record.ops.map((o) => o.id)),
      new Set(record.scores.map((s) => s.id))
    );
    return "synced";
  } catch (err) {
    console.error("Envoi de la partie impossible, elle sera renvoyée plus tard", err);
    return "pending";
  }
}

// Pour les suppressions : ce qui est encore dans le tiroir d'un joueur connecté
// n'existe pas en ligne, et demander sa suppression en ligne serait refusé.

/** Supprime un score du joueur. */
export async function deleteScore(uid: string | null, id: string): Promise<void> {
  const owner = uid ?? GUEST;
  const onlyLocal = readList<HighScore>(scoresKey(owner)).some((s) => s.id === id);
  removeLocal(owner, new Set(), new Set([id]));
  if (uid && !onlyLocal) await deleteDoc(doc(db, "highscores", id));
}

// Les deux fonctions suivantes ne touchent qu'aux éléments de la liste fournie : dans un
// compte famille, le tiroir local peut aussi contenir des parties d'un autre enfant.

/** Supprime les scores de la liste fournie (ceux d'un enfant, ou tous ceux d'un invité). */
export async function clearScores(uid: string | null, scores: HighScore[]): Promise<void> {
  const owner = uid ?? GUEST;
  const ids = new Set(scores.map((s) => s.id));
  const onlyLocal = new Set(readList<HighScore>(scoresKey(owner)).map((s) => s.id));
  removeLocal(owner, new Set(), ids);
  if (uid) {
    await deleteFromCloud(
      "highscores",
      scores.map((s) => s.id).filter((id) => !onlyLocal.has(id))
    );
  }
}

/** Supprime les réponses de la liste fournie (celles d'un enfant, ou toutes celles d'un invité). */
export async function clearOps(uid: string | null, ops: OperationResponse[]): Promise<void> {
  const owner = uid ?? GUEST;
  const ids = new Set(ops.map((o) => o.id));
  const onlyLocal = new Set(readList<OperationResponse>(opsKey(owner)).map((o) => o.id));
  removeLocal(owner, ids, new Set());
  if (uid) {
    await deleteFromCloud(
      "operation_responses",
      ops.map((o) => o.id).filter((id) => !onlyLocal.has(id))
    );
  }
}

// ---------------------------------------------------------------------------
// Parties jouées sans compte
// ---------------------------------------------------------------------------

function latestDate(history: History): string {
  return [...history.ops, ...history.scores].reduce(
    (latest, item) => (item.date > latest ? item.date : latest),
    ""
  );
}

/**
 * Nombre de parties jouées sans compte sur cet appareil, à proposer au joueur
 * qui vient de se connecter. Renvoie 0 si la proposition a déjà été refusée
 * et qu'aucune partie n'a été jouée sans compte depuis.
 */
export function guestGamesToOffer(): number {
  const guest = readLocal(GUEST);
  const latest = latestDate(guest);
  if (!latest) return 0;
  let declinedUntil = "";
  try {
    declinedUntil = localStorage.getItem(GUEST_OFFER_KEY) ?? "";
  } catch {
    // Stockage indisponible : on repose simplement la question.
  }
  if (latest <= declinedUntil) return 0;
  const games = new Set([...guest.ops, ...guest.scores].map((item) => item.date));
  return games.size;
}

/** Le joueur ne veut pas de ces parties : on ne lui reposera pas la question pour elles. */
export function declineGuestOffer(): void {
  try {
    localStorage.setItem(GUEST_OFFER_KEY, latestDate(readLocal(GUEST)));
  } catch (err) {
    console.error("Mémorisation du refus impossible", err);
  }
}

/**
 * Attribue à l'enfant choisi (profileId) du compte connecté les parties jouées sans
 * compte sur cet appareil, et renvoie ces parties pour les ajouter à l'affichage.
 */
export async function adoptGuestGames(uid: string, displayName: string, profileId?: string): Promise<History> {
  const guest = readLocal(GUEST);
  const profile = profileId ? { profileId } : {};
  const adopted: History = {
    ops: guest.ops.map((op) => ({ ...op, userId: uid, ...profile })),
    scores: guest.scores.map((score) => ({
      ...score,
      userId: uid,
      userDisplayName: displayName || "Joueur",
      ...profile,
    })),
  };
  writeLocal(GUEST, EMPTY);
  await saveGame(uid, displayName, adopted);
  return adopted;
}
