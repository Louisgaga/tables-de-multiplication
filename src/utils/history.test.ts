import { beforeEach, describe, expect, it, vi } from "vitest";
import { GameMode, HighScore, OperationResponse } from "../types";

/**
 * Fausse base en ligne, en mémoire. Elle imite les règles de sécurité sur les
 * points qui comptent ici : champs exacts, pas de modification d'un document
 * existant, pas de suppression d'un document absent.
 */
const fake = vi.hoisted(() => ({
  cloud: {
    highscores: new Map<string, Record<string, unknown>>(),
    operation_responses: new Map<string, Record<string, unknown>>(),
  } as Record<string, Map<string, Record<string, unknown>>>,
  failReads: false,
  failWrites: false,
  readGate: null as Promise<void> | null,
  commits: 0,
}));

const SCORE_KEYS = [
  "averageTime", "correctCount", "createdAt", "date", "gameMode", "id",
  "questionCount", "scorePercentage", "tables", "userDisplayName", "userId",
];
const OP_KEYS = [
  "correctAnswer", "createdAt", "date", "id", "isCorrect",
  "num1", "num2", "timeTaken", "userAnswer", "userId",
];

vi.mock("./firebase", () => ({ db: {} }));

vi.mock("firebase/firestore/lite", () => {
  type Ref = { name: string; id: string };
  const checkSet = (ref: Ref, data: Record<string, unknown>) => {
    if (fake.cloud[ref.name].has(ref.id)) throw new Error("refusé : document déjà existant");
    // Comme firestore.rules : les champs d'origine, avec ou sans le profil de l'enfant.
    const base = ref.name === "highscores" ? SCORE_KEYS : OP_KEYS;
    const expected = "profileId" in data ? [...base, "profileId"].sort() : base;
    if ("profileId" in data && !/^[a-zA-Z0-9_-]{1,128}$/.test(String(data.profileId))) {
      throw new Error("refusé : profil mal formé");
    }
    if (JSON.stringify(Object.keys(data).sort()) !== JSON.stringify(expected)) {
      throw new Error(`refusé : champs inattendus ${Object.keys(data).sort().join(",")}`);
    }
    const time = (ref.name === "highscores" ? data.averageTime : data.timeTaken) as number;
    if (time < 0 || time > 1000) throw new Error("refusé : temps hors limites");
  };
  const checkDelete = (ref: Ref) => {
    if (!fake.cloud[ref.name].has(ref.id)) throw new Error("refusé : document absent");
  };
  return {
    collection: (_db: unknown, name: string) => ({ name }),
    where: (field: string, _op: string, value: unknown) => ({ field, value }),
    query: (col: { name: string }, w: { field: string; value: unknown }) => ({ name: col.name, w }),
    getDocs: async (q: { name: string; w: { field: string; value: unknown } }) => {
      if (fake.readGate) await fake.readGate;
      if (fake.failReads) throw new Error("hors ligne");
      const docs = [...fake.cloud[q.name].values()]
        .filter((d) => d[q.w.field] === q.w.value)
        .map((d) => ({ data: () => d }));
      return { docs };
    },
    doc: (_db: unknown, name: string, id: string) => ({ name, id }),
    serverTimestamp: () => "HEURE_SERVEUR",
    writeBatch: () => {
      const writes: { type: "set" | "delete"; ref: Ref; data?: Record<string, unknown> }[] = [];
      return {
        set: (ref: Ref, data: Record<string, unknown>) => writes.push({ type: "set", ref, data }),
        delete: (ref: Ref) => writes.push({ type: "delete", ref }),
        commit: async () => {
          if (fake.failWrites) throw new Error("hors ligne");
          fake.commits++;
          // Un envoi groupé est tout ou rien : on vérifie tout avant d'écrire.
          for (const w of writes) {
            if (w.type === "set") checkSet(w.ref, w.data!);
            else checkDelete(w.ref);
          }
          for (const w of writes) {
            if (w.type === "set") fake.cloud[w.ref.name].set(w.ref.id, w.data!);
            else fake.cloud[w.ref.name].delete(w.ref.id);
          }
        },
      };
    },
    deleteDoc: async (ref: Ref) => {
      if (fake.failWrites) throw new Error("hors ligne");
      checkDelete(ref);
      fake.cloud[ref.name].delete(ref.id);
    },
  };
});

import {
  adoptGuestGames,
  clearOps,
  clearScores,
  declineGuestOffer,
  deleteScore,
  guestGamesToOffer,
  loadHistory,
  migrateLegacyStorage,
  saveGame,
} from "./history";

const store = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => void store.set(key, value),
  removeItem: (key: string) => void store.delete(key),
});

let counter = 0;
function game(date: string, userId?: string, timeTaken = 2, profileId?: string) {
  const n = counter++;
  const profile = profileId ? { profileId } : {};
  const score: HighScore = {
    id: `score-${n}`,
    date,
    tables: [2, 5],
    gameMode: GameMode.TIMED,
    questionCount: 2,
    correctCount: 1,
    scorePercentage: 50,
    averageTime: timeTaken,
    userId,
    ...profile,
  };
  const ops: OperationResponse[] = [0, 1].map((i) => ({
    id: `op-${n}-${i}`,
    userId,
    num1: 2,
    num2: 5 + i,
    userAnswer: i === 0 ? 10 : null,
    correctAnswer: 2 * (5 + i),
    isCorrect: i === 0,
    timeTaken,
    date,
    ...profile,
  }));
  return { scores: [score], ops };
}

const local = (key: string) => JSON.parse(store.get(key) ?? "[]") as { id: string }[];
const silence = () => vi.spyOn(console, "error").mockImplementation(() => {});

beforeEach(() => {
  store.clear();
  fake.cloud.highscores.clear();
  fake.cloud.operation_responses.clear();
  fake.failReads = false;
  fake.failWrites = false;
  fake.readGate = null;
  fake.commits = 0;
  vi.restoreAllMocks();
});

describe("invité (sans compte)", () => {
  it("garde les parties dans le navigateur, rien en ligne", async () => {
    const g = game("2026-11-01T10:00:00.000Z");
    expect(await saveGame(null, "", g)).toBe("local");
    expect(fake.cloud.highscores.size).toBe(0);

    const loaded = await loadHistory(null);
    expect(loaded.scores.map((s) => s.id)).toEqual([g.scores[0].id]);
    expect(loaded.ops).toHaveLength(2);
  });
});

describe("joueur connecté", () => {
  it("envoie la partie en ligne et vide le tiroir local", async () => {
    const g = game("2026-11-01T10:00:00.000Z", "lea");
    expect(await saveGame("lea", "Léa", g)).toBe("synced");

    expect(fake.cloud.highscores.get(g.scores[0].id)).toMatchObject({
      userId: "lea",
      userDisplayName: "Léa",
      createdAt: "HEURE_SERVEUR",
    });
    expect(fake.cloud.operation_responses.size).toBe(2);
    expect(local("mm:v2:ops:lea")).toEqual([]);
    expect(local("mm:v2:scores:lea")).toEqual([]);
  });

  it("garde la partie en attente si l'envoi échoue, puis la renvoie au chargement suivant", async () => {
    silence();
    const g = game("2026-11-01T10:00:00.000Z", "lea");
    fake.failWrites = true;
    expect(await saveGame("lea", "Léa", g)).toBe("pending");
    expect(local("mm:v2:ops:lea")).toHaveLength(2);
    expect(fake.cloud.operation_responses.size).toBe(0);

    fake.failWrites = false;
    const loaded = await loadHistory("lea", "Léa");
    expect(loaded.cloudReachable).toBe(true);
    expect(loaded.ops).toHaveLength(2);
    expect(loaded.scores).toHaveLength(1);
    expect(fake.cloud.operation_responses.size).toBe(2);
    expect(local("mm:v2:ops:lea")).toEqual([]);

    // Un second chargement ne renvoie rien et ne duplique rien.
    const again = await loadHistory("lea", "Léa");
    expect(again.ops).toHaveLength(2);
    expect(fake.commits).toBe(1);
  });

  it("affiche les parties en attente quand la base en ligne est injoignable", async () => {
    silence();
    const g = game("2026-11-01T10:00:00.000Z", "lea");
    fake.failWrites = true;
    await saveGame("lea", "Léa", g);
    fake.failReads = true;

    const loaded = await loadHistory("lea", "Léa");
    expect(loaded.cloudReachable).toBe(false);
    expect(loaded.ops).toHaveLength(2);
    expect(local("mm:v2:ops:lea")).toHaveLength(2);
  });

  it("ne mélange jamais deux joueurs sur le même appareil", async () => {
    silence();
    await saveGame("lea", "Léa", game("2026-11-01T10:00:00.000Z", "lea"));
    fake.failWrites = true;
    await saveGame("lea", "Léa", game("2026-11-02T10:00:00.000Z", "lea"));
    fake.failWrites = false;
    await saveGame("tom", "Tom", game("2026-11-03T10:00:00.000Z", "tom"));

    const tom = await loadHistory("tom", "Tom");
    expect(tom.scores).toHaveLength(1);
    expect(tom.ops.every((o) => o.userId === "tom")).toBe(true);

    const guest = await loadHistory(null);
    expect(guest.ops).toEqual([]);
  });

  it("limite les temps trop longs, que la base refuserait", async () => {
    const g = game("2026-11-01T10:00:00.000Z", "lea", 5000);
    expect(await saveGame("lea", "Léa", g)).toBe("synced");
    expect(fake.cloud.operation_responses.get(g.ops[0].id)?.timeTaken).toBeLessThanOrEqual(1000);
  });

  it("ne perd pas une partie terminée pendant le chargement de l'historique", async () => {
    silence();
    let openGate = () => {};
    fake.readGate = new Promise<void>((resolve) => (openGate = resolve));
    const loading = loadHistory("lea", "Léa");

    fake.failWrites = true;
    const g = game("2026-11-01T10:00:00.000Z", "lea");
    await saveGame("lea", "Léa", g);

    openGate();
    await loading;
    expect(local("mm:v2:ops:lea")).toHaveLength(2);
    expect(local("mm:v2:scores:lea")).toHaveLength(1);
  });
});

describe("reprise des données de l'ancienne version", () => {
  it("répartit l'ancien tiroir commun par joueur", () => {
    const lea = game("2026-10-01T10:00:00.000Z", "lea");
    const tom = game("2026-10-02T10:00:00.000Z", "tom");
    const anonymous = game("2026-10-03T10:00:00.000Z");
    store.set(
      "multiplication_op_responses",
      JSON.stringify([...lea.ops, ...tom.ops, ...anonymous.ops])
    );
    store.set(
      "multiplication_highscores",
      JSON.stringify([...lea.scores, ...tom.scores, ...anonymous.scores])
    );

    migrateLegacyStorage();

    expect(local("mm:v2:ops:lea").map((o) => o.id)).toEqual(lea.ops.map((o) => o.id));
    expect(local("mm:v2:ops:tom").map((o) => o.id)).toEqual(tom.ops.map((o) => o.id));
    expect(local("mm:v2:ops:guest").map((o) => o.id)).toEqual(anonymous.ops.map((o) => o.id));
    expect(local("mm:v2:scores:tom")).toHaveLength(1);
    expect(store.has("multiplication_op_responses")).toBe(false);
    expect(store.has("multiplication_highscores")).toBe(false);
  });

  it("n'affiche à un joueur que ses propres réponses, et ne renvoie pas ce qui est déjà en ligne", async () => {
    const lea = game("2026-10-01T10:00:00.000Z", "lea");
    const tom = game("2026-10-02T10:00:00.000Z", "tom");
    await saveGame("lea", "Léa", lea);
    await saveGame("tom", "Tom", tom);
    const commitsBefore = fake.commits;
    // L'ancienne version gardait aussi une copie locale de tout, tous joueurs confondus.
    store.set("multiplication_op_responses", JSON.stringify([...lea.ops, ...tom.ops]));
    store.set("multiplication_highscores", JSON.stringify([...lea.scores, ...tom.scores]));

    const loaded = await loadHistory("tom", "Tom");

    expect(loaded.ops.map((o) => o.id).sort()).toEqual(tom.ops.map((o) => o.id).sort());
    expect(loaded.scores).toHaveLength(1);
    expect(fake.commits).toBe(commitsBefore);
    expect(local("mm:v2:ops:tom")).toEqual([]);
  });
});

describe("parties jouées sans compte, à la connexion", () => {
  it("propose de les récupérer, puis les attribue au joueur", async () => {
    await saveGame(null, "", game("2026-11-01T10:00:00.000Z"));
    await saveGame(null, "", game("2026-11-02T10:00:00.000Z"));
    expect(guestGamesToOffer()).toBe(2);

    const adopted = await adoptGuestGames("lea", "Léa");

    expect(adopted.scores).toHaveLength(2);
    expect(adopted.ops.every((o) => o.userId === "lea")).toBe(true);
    expect(fake.cloud.highscores.size).toBe(2);
    expect([...fake.cloud.operation_responses.values()].every((d) => d.userId === "lea")).toBe(true);
    expect(guestGamesToOffer()).toBe(0);
    expect((await loadHistory(null)).ops).toEqual([]);
  });

  it("ne repose pas la question après un refus, sauf nouvelle partie sans compte", async () => {
    await saveGame(null, "", game("2026-11-01T10:00:00.000Z"));
    declineGuestOffer();
    expect(guestGamesToOffer()).toBe(0);
    expect((await loadHistory(null)).scores).toHaveLength(1);

    await saveGame(null, "", game("2026-11-05T10:00:00.000Z"));
    expect(guestGamesToOffer()).toBe(2);
  });
});

describe("profils des enfants", () => {
  it("enregistre le profil avec la partie, et le relit au chargement", async () => {
    const g = game("2026-11-01T10:00:00.000Z", "famille", 2, "p-h");
    expect(await saveGame("famille", "Lina", g)).toBe("synced");
    expect(fake.cloud.highscores.get(g.scores[0].id)?.profileId).toBe("p-h");
    expect(fake.cloud.operation_responses.get(g.ops[0].id)?.profileId).toBe("p-h");

    const loaded = await loadHistory("famille");
    expect(loaded.scores.map((s) => s.profileId)).toEqual(["p-h"]);
    expect(loaded.ops.every((o) => o.profileId === "p-h")).toBe(true);
  });

  it("garde le profil d'une partie en attente jusqu'à son envoi", async () => {
    silence();
    fake.failWrites = true;
    const g = game("2026-11-01T10:00:00.000Z", "famille", 2, "p-j");
    expect(await saveGame("famille", "Jules", g)).toBe("pending");
    fake.failWrites = false;
    await loadHistory("famille");
    expect(fake.cloud.highscores.get(g.scores[0].id)?.profileId).toBe("p-j");
  });

  it("attribue les parties jouées sans compte à l'enfant choisi", async () => {
    await saveGame(null, "", game("2026-11-01T10:00:00.000Z"));
    const adopted = await adoptGuestGames("famille", "Lina", "p-h");
    expect(adopted.scores.every((s) => s.profileId === "p-h")).toBe(true);
    expect([...fake.cloud.operation_responses.values()].every((o) => o.profileId === "p-h")).toBe(true);
  });

  it("n'écrit pas de profil pour un compte sans profils (ancien format)", async () => {
    const g = game("2026-11-01T10:00:00.000Z", "lea");
    await saveGame("lea", "Léa", g);
    expect("profileId" in fake.cloud.highscores.get(g.scores[0].id)!).toBe(false);
  });
});

describe("suppressions", () => {
  it("supprime un score en ligne et en local", async () => {
    const g = game("2026-11-01T10:00:00.000Z", "lea");
    await saveGame("lea", "Léa", g);
    await deleteScore("lea", g.scores[0].id);
    expect(fake.cloud.highscores.size).toBe(0);
  });

  it("ne demande pas en ligne la suppression de ce qui n'y est pas encore", async () => {
    silence();
    const synced = game("2026-11-01T10:00:00.000Z", "lea");
    await saveGame("lea", "Léa", synced);
    fake.failWrites = true;
    const pending = game("2026-11-02T10:00:00.000Z", "lea");
    await saveGame("lea", "Léa", pending);
    fake.failWrites = false;

    await deleteScore("lea", pending.scores[0].id);
    expect(local("mm:v2:scores:lea")).toEqual([]);

    await clearOps("lea", [...synced.ops, ...pending.ops]);
    expect(fake.cloud.operation_responses.size).toBe(0);
    expect(local("mm:v2:ops:lea")).toEqual([]);

    await clearScores("lea", synced.scores);
    expect(fake.cloud.highscores.size).toBe(0);
  });

  it("efface les parties d'un enfant sans toucher à celles en attente de son frère", async () => {
    silence();
    fake.failWrites = true;
    const lina = game("2026-11-01T10:00:00.000Z", "famille", 2, "p-h");
    const jules = game("2026-11-02T10:00:00.000Z", "famille", 2, "p-j");
    await saveGame("famille", "Famille", lina);
    await saveGame("famille", "Famille", jules);
    fake.failWrites = false;

    await clearOps("famille", lina.ops);
    await clearScores("famille", lina.scores);
    expect(local("mm:v2:ops:famille").map((o) => o.id)).toEqual(jules.ops.map((o) => o.id));
    expect(local("mm:v2:scores:famille").map((s) => s.id)).toEqual(jules.scores.map((s) => s.id));
  });

  it("efface les données d'un invité sans toucher à la base en ligne", async () => {
    const g = game("2026-11-01T10:00:00.000Z");
    await saveGame(null, "", g);
    await clearOps(null, g.ops);
    await clearScores(null, g.scores);
    expect((await loadHistory(null)).ops).toEqual([]);
    expect(fake.commits).toBe(0);
  });
});
