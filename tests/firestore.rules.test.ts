/**
 * Règles de sécurité Firestore, vérifiées sur l'émulateur avec le vrai fichier firestore.rules.
 * Lancement : npm run test:rules (il faut Java pour l'émulateur).
 */
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";

let env: RulesTestEnvironment;

const FAMILY = "famille";
const OTHER = "voisin";

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-tables-de-multiplication",
    firestore: { rules: readFileSync("firestore.rules", "utf8") },
  });
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
});

const as = (uid: string) => env.authenticatedContext(uid).firestore();

function score(uid: string, extra: Record<string, unknown> = {}) {
  return {
    id: "s1",
    userId: uid,
    userDisplayName: "Lina",
    date: "2026-11-19T10:00:00.000Z",
    tables: [2, 3],
    gameMode: "TIMED",
    questionCount: 10,
    correctCount: 8,
    scorePercentage: 80,
    averageTime: 3.2,
    createdAt: serverTimestamp(),
    ...extra,
  };
}

function op(uid: string, extra: Record<string, unknown> = {}) {
  return {
    id: "o1",
    userId: uid,
    num1: 7,
    num2: 8,
    userAnswer: 56,
    correctAnswer: 56,
    isCorrect: true,
    timeTaken: 2.5,
    date: "2026-11-19T10:00:00.000Z",
    createdAt: serverTimestamp(),
    ...extra,
  };
}

function profile(uid: string, extra: Record<string, unknown> = {}) {
  return {
    id: "p1",
    userId: uid,
    name: "Lina",
    avatar: "🦊",
    legacy: true,
    createdAt: serverTimestamp(),
    ...extra,
  };
}

/** Crée un document sans passer par les règles (état de départ d'un test). */
async function seed(path: string, data: Record<string, unknown>) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), path), { ...data, createdAt: new Date() });
  });
}

describe("parties et réponses", () => {
  it("acceptent toujours l'ancien format, sans profil", async () => {
    await assertSucceeds(setDoc(doc(as(FAMILY), "highscores/s1"), score(FAMILY)));
    await assertSucceeds(setDoc(doc(as(FAMILY), "operation_responses/o1"), op(FAMILY)));
  });

  it("acceptent un profil valide", async () => {
    await assertSucceeds(setDoc(doc(as(FAMILY), "highscores/s1"), score(FAMILY, { profileId: "p1" })));
    await assertSucceeds(setDoc(doc(as(FAMILY), "operation_responses/o1"), op(FAMILY, { profileId: "p-2_b" })));
  });

  it("refusent un profil mal formé ou un champ inconnu", async () => {
    await assertFails(setDoc(doc(as(FAMILY), "highscores/s1"), score(FAMILY, { profileId: "pas bon !" })));
    await assertFails(setDoc(doc(as(FAMILY), "highscores/s1"), score(FAMILY, { profileId: 12 })));
    await assertFails(setDoc(doc(as(FAMILY), "operation_responses/o1"), op(FAMILY, { profileId: "" })));
    await assertFails(setDoc(doc(as(FAMILY), "highscores/s1"), score(FAMILY, { autre: "x" })));
    await assertFails(setDoc(doc(as(FAMILY), "operation_responses/o1"), op(FAMILY, { autre: "x" })));
  });

  it("refusent d'écrire au nom d'un autre compte", async () => {
    await assertFails(setDoc(doc(as(OTHER), "highscores/s1"), score(FAMILY, { profileId: "p1" })));
  });

  it("restent non modifiables, et seul le propriétaire les supprime", async () => {
    await seed("highscores/s1", score(FAMILY, { profileId: "p1" }));
    await assertFails(updateDoc(doc(as(FAMILY), "highscores/s1"), { correctCount: 10 }));
    await assertFails(deleteDoc(doc(as(OTHER), "highscores/s1")));
    await assertSucceeds(deleteDoc(doc(as(FAMILY), "highscores/s1")));
  });
});

describe("profils", () => {
  it("le compte crée, lit et liste ses propres profils", async () => {
    await assertSucceeds(setDoc(doc(as(FAMILY), "profiles/p1"), profile(FAMILY)));
    await assertSucceeds(getDoc(doc(as(FAMILY), "profiles/p1")));
    await assertSucceeds(getDocs(query(collection(as(FAMILY), "profiles"), where("userId", "==", FAMILY))));
  });

  it("un autre compte ne voit pas ces profils", async () => {
    await seed("profiles/p1", profile(FAMILY));
    await assertFails(getDoc(doc(as(OTHER), "profiles/p1")));
    await assertFails(getDocs(query(collection(as(OTHER), "profiles"), where("userId", "==", FAMILY))));
    await assertFails(getDocs(collection(as(OTHER), "profiles")));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), "profiles/p1")));
  });

  it("refuse un profil invalide", async () => {
    const ref = doc(as(FAMILY), "profiles/p1");
    await assertFails(setDoc(ref, profile(OTHER)));
    await assertFails(setDoc(ref, profile(FAMILY, { name: "" })));
    await assertFails(setDoc(ref, profile(FAMILY, { name: "x".repeat(21) })));
    await assertFails(setDoc(ref, profile(FAMILY, { id: "p2" })));
    await assertFails(setDoc(ref, profile(FAMILY, { legacy: "oui" })));
    await assertFails(setDoc(ref, profile(FAMILY, { createdAt: new Date() })));
    await assertFails(setDoc(ref, profile(FAMILY, { pin: "1234" })));
    await assertFails(setDoc(doc(as(FAMILY), "profiles/pas bon"), profile(FAMILY, { id: "pas bon" })));
  });

  it("seuls le prénom et l'avatar changent, et seulement par le propriétaire", async () => {
    await seed("profiles/p1", profile(FAMILY));
    const ref = doc(as(FAMILY), "profiles/p1");
    await assertSucceeds(updateDoc(ref, { name: "Lina G.", avatar: "🐼" }));
    await assertFails(updateDoc(ref, { name: "" }));
    await assertFails(updateDoc(ref, { legacy: false }));
    await assertFails(updateDoc(ref, { userId: OTHER }));
    await assertFails(updateDoc(doc(as(OTHER), "profiles/p1"), { name: "Pirate" }));
  });

  it("seul le propriétaire supprime un profil", async () => {
    await seed("profiles/p1", profile(FAMILY));
    await assertFails(deleteDoc(doc(as(OTHER), "profiles/p1")));
    await assertSucceeds(deleteDoc(doc(as(FAMILY), "profiles/p1")));
  });
});

describe("aucun accès d'administration", () => {
  // Même un jeton qui porterait un droit « admin » ne lit que ses propres données : l'admin
  // passe par un outil privé avec une clé de serveur, jamais par les règles.
  const asAdmin = () => env.authenticatedContext("admin", { admin: true }).firestore();

  it("un compte ne liste ni ne lit les parties, réponses et profils d'un autre", async () => {
    await seed("highscores/s1", score(FAMILY));
    await seed("operation_responses/o1", op(FAMILY));
    await seed("profiles/p1", profile(FAMILY));
    for (const db of [as(OTHER), asAdmin()]) {
      await assertFails(getDocs(collection(db, "highscores")));
      await assertFails(getDocs(query(collection(db, "operation_responses"), where("userId", "==", FAMILY))));
      await assertFails(getDocs(collection(db, "profiles")));
      await assertFails(getDoc(doc(db, "highscores/s1")));
    }
  });

  it("la collection des fiches de comptes est fermée", async () => {
    const account = { uid: FAMILY, email: "famille@example.com", displayName: "Famille", lastSeenAt: serverTimestamp() };
    await assertFails(setDoc(doc(as(FAMILY), `accounts/${FAMILY}`), account));
    await assertFails(getDocs(collection(asAdmin(), "accounts")));
  });
});
