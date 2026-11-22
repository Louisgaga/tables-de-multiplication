/**
 * Profils des enfants dans un compte (une famille).
 *
 * Un parent se connecte avec le compte de la famille, puis chaque enfant choisit son profil.
 * Les parties et réponses portent l'identifiant du profil (profileId). Celles enregistrées
 * avant l'arrivée des profils n'en ont pas : elles appartiennent au profil « legacy » du compte.
 * Rien n'est donc réécrit en ligne quand on crée ce premier profil.
 */
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore/lite";
import { Profile } from "../types";
import { db } from "./firebase";
import { clearOps, clearScores, History } from "./history";

/** Animaux proposés comme avatar. */
export const AVATARS = ["🦊", "🐼", "🐯", "🦁", "🐸", "🐵", "🐧", "🐰", "🐶", "🐱", "🦄", "🐙"];
export const MAX_PROFILES = 8;
/** Longueur maximale d'un prénom (la même limite est imposée par firestore.rules). */
export const MAX_NAME = 20;

const cacheKey = (uid: string) => `mm:v2:profiles:${uid}`;

// ---------------------------------------------------------------------------
// Fonctions pures
// ---------------------------------------------------------------------------

/** Prénom nettoyé : sans espaces en trop, 20 caractères au plus. */
export function cleanName(raw: string): string {
  return Array.from(raw.replace(/\s+/g, " ").trim()).slice(0, MAX_NAME).join("");
}

/** Même prénom, sans tenir compte des majuscules, des accents ni des espaces autour. */
export function sameName(a: string, b: string): boolean {
  const norm = (s: string) =>
    cleanName(s)
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLocaleLowerCase("fr");
  return norm(a) !== "" && norm(a) === norm(b);
}

/** Identifiant d'un nouveau profil (lettres, chiffres et tirets, comme l'exigent les règles). */
export function newProfileId(random: () => number = Math.random): string {
  const part = () => Math.floor(random() * 36 ** 6).toString(36).padStart(6, "0");
  return `p-${Date.now().toString(36)}-${part()}`;
}

/** Profil qui reçoit les parties enregistrées sans profil. */
export function legacyProfileId(profiles: Profile[]): string | null {
  return profiles.find((p) => p.legacy)?.id ?? null;
}

/** Profil auquel appartient une partie ou une réponse. */
export function profileOf(item: { profileId?: string }, legacyId: string | null): string | null {
  return item.profileId ?? legacyId;
}

/** Historique d'un enfant, extrait de celui du compte. */
export function historyFor(history: History, profileId: string, profiles: Profile[]): History {
  const legacyId = legacyProfileId(profiles);
  const mine = (item: { profileId?: string }) => profileOf(item, legacyId) === profileId;
  return { ops: history.ops.filter(mine), scores: history.scores.filter(mine) };
}

/** Un compte a-t-il des parties qui n'appartiennent encore à aucun profil ? */
export function hasUnassignedGames(history: History, profiles: Profile[]): boolean {
  if (legacyProfileId(profiles)) return false;
  return history.scores.some((s) => !s.profileId) || history.ops.some((o) => !o.profileId);
}

// ---------------------------------------------------------------------------
// Copie sur l'appareil (pour afficher les profils sans connexion)
// ---------------------------------------------------------------------------

function readCache(uid: string): Profile[] {
  try {
    const raw = localStorage.getItem(cacheKey(uid));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as Profile[]) : [];
  } catch {
    return [];
  }
}

function writeCache(uid: string, profiles: Profile[]): void {
  try {
    localStorage.setItem(cacheKey(uid), JSON.stringify(profiles));
  } catch (err) {
    console.error("Mémorisation des profils impossible", err);
  }
}

// ---------------------------------------------------------------------------
// En ligne
// ---------------------------------------------------------------------------

export interface LoadedProfiles {
  profiles: Profile[];
  /** false : la base en ligne n'a pas répondu, ce sont les profils mémorisés sur l'appareil. */
  fromCloud: boolean;
}

/** Profils du compte, du plus ancien au plus récent. */
export async function loadProfiles(uid: string): Promise<LoadedProfiles> {
  try {
    const snap = await getDocs(query(collection(db, "profiles"), where("userId", "==", uid)));
    const rows = snap.docs.map((d) => {
      const data = d.data();
      const created = data.createdAt as { toMillis?: () => number } | undefined;
      return {
        created: created?.toMillis?.() ?? 0,
        profile: {
          id: data.id as string,
          name: data.name as string,
          avatar: data.avatar as string,
          legacy: data.legacy === true,
        },
      };
    });
    const profiles = rows.sort((a, b) => a.created - b.created).map((r) => r.profile);
    writeCache(uid, profiles);
    return { profiles, fromCloud: true };
  } catch (err) {
    console.error("Profils en ligne inaccessibles", err);
    return { profiles: readCache(uid), fromCloud: false };
  }
}

/**
 * Crée un profil. Le premier profil d'un compte est « legacy » : il reçoit les parties
 * déjà enregistrées sans profil. Il faut être en ligne.
 */
export async function createProfile(
  uid: string,
  existing: Profile[],
  input: { name: string; avatar: string }
): Promise<Profile> {
  const profile: Profile = {
    id: newProfileId(),
    name: cleanName(input.name),
    avatar: input.avatar,
    legacy: legacyProfileId(existing) === null,
  };
  await setDoc(doc(db, "profiles", profile.id), {
    id: profile.id,
    userId: uid,
    name: profile.name,
    avatar: profile.avatar,
    legacy: profile.legacy,
    createdAt: serverTimestamp(),
  });
  writeCache(uid, [...existing, profile]);
  return profile;
}

/** Change le prénom ou l'avatar d'un profil. */
export async function updateProfile(
  uid: string,
  existing: Profile[],
  id: string,
  input: { name: string; avatar: string }
): Promise<Profile[]> {
  const name = cleanName(input.name);
  await updateDoc(doc(db, "profiles", id), { name, avatar: input.avatar });
  const profiles = existing.map((p) => (p.id === id ? { ...p, name, avatar: input.avatar } : p));
  writeCache(uid, profiles);
  return profiles;
}

/**
 * Remet un enfant à zéro : efface toutes ses parties et réponses (médailles, records et rapport
 * repartent de zéro), en ligne et sur l'appareil. Le profil, son prénom et son animal restent.
 * Pour le profil « legacy », cela comprend les parties enregistrées avant les profils.
 */
export async function resetProfile(uid: string, existing: Profile[], profile: Profile, accountHistory: History): Promise<History> {
  const theirs = historyFor(accountHistory, profile.id, existing);
  await clearOps(uid, theirs.ops);
  await clearScores(uid, theirs.scores);
  return theirs;
}

/**
 * Supprime un profil et toutes ses parties et réponses, en ligne et sur l'appareil.
 * Pour le profil « legacy », cela comprend les parties enregistrées avant les profils.
 * Les données sont effacées d'abord : si la connexion coupe en route, le profil reste
 * visible et on peut recommencer.
 */
export async function deleteProfile(
  uid: string,
  existing: Profile[],
  profile: Profile,
  accountHistory: History
): Promise<Profile[]> {
  await resetProfile(uid, existing, profile, accountHistory);
  await deleteDoc(doc(db, "profiles", profile.id));
  const profiles = existing.filter((p) => p.id !== profile.id);
  writeCache(uid, profiles);
  return profiles;
}
