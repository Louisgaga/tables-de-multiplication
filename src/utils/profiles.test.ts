import { beforeEach, describe, expect, it, vi } from "vitest";
import { GameMode, HighScore, OperationResponse, Profile } from "../types";

const fake = vi.hoisted(() => ({
  writes: [] as { type: string; path: string; data?: Record<string, unknown> }[],
  clearedOps: [] as string[],
  clearedScores: [] as string[],
  failReads: false,
  docs: [] as Record<string, unknown>[],
}));

vi.mock("./firebase", () => ({ db: {} }));
vi.mock("./history", () => ({
  clearOps: async (_uid: string, ops: { id: string }[]) => {
    fake.clearedOps.push(...ops.map((o) => o.id));
  },
  clearScores: async (_uid: string, scores: { id: string }[]) => {
    fake.clearedScores.push(...scores.map((s) => s.id));
  },
}));
vi.mock("firebase/firestore/lite", () => ({
  collection: (_db: unknown, name: string) => ({ name }),
  where: (field: string, _op: string, value: unknown) => ({ field, value }),
  query: (col: { name: string }, w: { field: string; value: unknown }) => ({ ...col, w }),
  doc: (_db: unknown, name: string, id: string) => ({ path: `${name}/${id}` }),
  serverTimestamp: () => "HEURE_SERVEUR",
  getDocs: async (q: { w: { field: string; value: unknown } }) => {
    if (fake.failReads) throw new Error("hors ligne");
    return { docs: fake.docs.filter((d) => d[q.w.field] === q.w.value).map((d) => ({ data: () => d })) };
  },
  setDoc: async (ref: { path: string }, data: Record<string, unknown>) => {
    fake.writes.push({ type: "set", path: ref.path, data });
  },
  updateDoc: async (ref: { path: string }, data: Record<string, unknown>) => {
    fake.writes.push({ type: "update", path: ref.path, data });
  },
  deleteDoc: async (ref: { path: string }) => {
    fake.writes.push({ type: "delete", path: ref.path });
  },
}));

// Stockage du navigateur, en mémoire.
const store = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
});

const {
  cleanName,
  createProfile,
  deleteProfile,
  hasUnassignedGames,
  historyFor,
  loadProfiles,
  newProfileId,
  resetProfile,
  sameName,
  updateProfile,
} = await import("./profiles");

const lina: Profile = { id: "p-h", name: "Lina", avatar: "🦊", legacy: true };
const jules: Profile = { id: "p-j", name: "Jules", avatar: "🐼", legacy: false };

function op(id: string, profileId?: string): OperationResponse {
  return {
    id,
    num1: 7,
    num2: 8,
    userAnswer: 56,
    correctAnswer: 56,
    isCorrect: true,
    timeTaken: 2,
    date: "2026-11-19T10:00:00.000Z",
    ...(profileId ? { profileId } : {}),
  };
}

function score(id: string, profileId?: string): HighScore {
  return {
    id,
    date: "2026-11-19T10:00:00.000Z",
    tables: [7],
    gameMode: GameMode.TIMED,
    questionCount: 1,
    correctCount: 1,
    scorePercentage: 100,
    averageTime: 2,
    ...(profileId ? { profileId } : {}),
  };
}

// Compte famille : deux anciennes parties sans profil, puis une partie de chaque enfant.
const accountHistory = {
  ops: [op("o-old"), op("o-h", "p-h"), op("o-j", "p-j")],
  scores: [score("s-old"), score("s-h", "p-h"), score("s-j", "p-j")],
};

beforeEach(() => {
  fake.writes = [];
  fake.clearedOps = [];
  fake.clearedScores = [];
  fake.failReads = false;
  fake.docs = [];
  localStorage.clear();
});

describe("prénoms et identifiants", () => {
  it("nettoie les prénoms et les limite à 20 caractères", () => {
    expect(cleanName("  Lina   Marie ")).toBe("Lina Marie");
    expect(cleanName("x".repeat(30))).toHaveLength(20);
    expect(cleanName("   ")).toBe("");
  });

  it("compare les prénoms sans majuscules, accents ni espaces", () => {
    expect(sameName(" lina ", "Lina")).toBe(true);
    expect(sameName("Chloé", "chloe")).toBe(true);
    expect(sameName("Jules", "Julie")).toBe(false);
    expect(sameName("", "")).toBe(false);
  });

  it("produit des identifiants acceptés par les règles", () => {
    for (let i = 0; i < 20; i++) expect(newProfileId()).toMatch(/^[a-zA-Z0-9_-]{1,128}$/);
  });
});

describe("répartition de l'historique par enfant", () => {
  it("donne au profil legacy les anciennes parties, sans profil", () => {
    const h = historyFor(accountHistory, "p-h", [lina, jules]);
    expect(h.ops.map((o) => o.id)).toEqual(["o-old", "o-h"]);
    expect(h.scores.map((s) => s.id)).toEqual(["s-old", "s-h"]);
  });

  it("ne donne à un autre enfant que ses propres parties", () => {
    const h = historyFor(accountHistory, "p-j", [lina, jules]);
    expect(h.ops.map((o) => o.id)).toEqual(["o-j"]);
    expect(h.scores.map((s) => s.id)).toEqual(["s-j"]);
  });

  it("repère les parties d'avant les profils, tant qu'aucun profil ne les a reçues", () => {
    expect(hasUnassignedGames(accountHistory, [])).toBe(true);
    expect(hasUnassignedGames(accountHistory, [lina])).toBe(false);
    expect(hasUnassignedGames({ ops: [op("a", "p-j")], scores: [] }, [])).toBe(false);
  });
});

describe("profils en ligne", () => {
  it("crée le premier profil en legacy, les suivants non", async () => {
    const first = await createProfile("famille", [], { name: " Lina ", avatar: "🦊" });
    expect(first.legacy).toBe(true);
    expect(first.name).toBe("Lina");
    expect(fake.writes[0]).toMatchObject({
      type: "set",
      path: `profiles/${first.id}`,
      data: { id: first.id, userId: "famille", name: "Lina", avatar: "🦊", legacy: true, createdAt: "HEURE_SERVEUR" },
    });
    expect(Object.keys(fake.writes[0].data!).sort()).toEqual(["avatar", "createdAt", "id", "legacy", "name", "userId"]);

    const second = await createProfile("famille", [first], { name: "Jules", avatar: "🐼" });
    expect(second.legacy).toBe(false);
  });

  it("ne change que le prénom et l'avatar", async () => {
    const profiles = await updateProfile("famille", [lina, jules], "p-j", { name: " Julot ", avatar: "🐸" });
    expect(fake.writes).toEqual([{ type: "update", path: "profiles/p-j", data: { name: "Julot", avatar: "🐸" } }]);
    expect(profiles.find((p) => p.id === "p-j")).toEqual({ ...jules, name: "Julot", avatar: "🐸" });
  });

  it("supprime un enfant avec ses seules parties", async () => {
    const remaining = await deleteProfile("famille", [lina, jules], jules, accountHistory);
    expect(fake.clearedOps).toEqual(["o-j"]);
    expect(fake.clearedScores).toEqual(["s-j"]);
    expect(fake.writes).toEqual([{ type: "delete", path: "profiles/p-j" }]);
    expect(remaining).toEqual([lina]);
  });

  it("remet un enfant à zéro sans supprimer son profil", async () => {
    const gone = await resetProfile("famille", [lina, jules], lina, accountHistory);
    expect(fake.clearedOps).toEqual(["o-old", "o-h"]);
    expect(fake.clearedScores).toEqual(["s-old", "s-h"]);
    expect(gone.scores.map((s) => s.id)).toEqual(["s-old", "s-h"]);
    expect(fake.writes).toEqual([]);
  });

  it("supprime le profil legacy avec les anciennes parties", async () => {
    await deleteProfile("famille", [lina, jules], lina, accountHistory);
    expect(fake.clearedOps).toEqual(["o-old", "o-h"]);
    expect(fake.clearedScores).toEqual(["s-old", "s-h"]);
  });

  it("charge les profils dans l'ordre de création, et les garde pour le hors ligne", async () => {
    const at = (ms: number) => ({ toMillis: () => ms });
    fake.docs = [
      { id: "p-j", userId: "famille", name: "Jules", avatar: "🐼", legacy: false, createdAt: at(2) },
      { id: "p-h", userId: "famille", name: "Lina", avatar: "🦊", legacy: true, createdAt: at(1) },
      { id: "p-x", userId: "voisin", name: "Autre", avatar: "🐸", legacy: true, createdAt: at(0) },
    ];
    const online = await loadProfiles("famille");
    expect(online).toEqual({ profiles: [lina, jules], fromCloud: true });

    fake.failReads = true;
    expect(await loadProfiles("famille")).toEqual({ profiles: [lina, jules], fromCloud: false });
    expect(await loadProfiles("voisin")).toEqual({ profiles: [], fromCloud: false });
  });
});
