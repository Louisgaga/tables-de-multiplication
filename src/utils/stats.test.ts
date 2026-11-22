import { describe, expect, it } from "vitest";
import { GameMode, GameSettings, OperationResponse, QuestionResult } from "../types";
import {
  buildFocusSession,
  buildGameRecord,
  buildQuestions,
  calcKey,
  computeAchievements,
  computeFactMastery,
  factKey,
  factLevel,
  calculationsInTables,
  factStatus,
  focusQuotas,
  isMissingFactorAnswer,
  makeQuestion,
  masteryOf,
  medalsByTable,
  statusWeight,
  tableMasteredCount,
} from "./stats";

/** Générateur pseudo-aléatoire reproductible, pour des tests stables. */
function seeded(seed: number) {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function settings(overrides: Partial<GameSettings> = {}): GameSettings {
  return {
    selectedTables: [2, 5, 10],
    gameMode: GameMode.TIMED,
    questionCount: 10,
    timeLimitPerQuestion: 15,
    includeReverse: true,
    adaptiveDifficulty: true,
    ...overrides,
  };
}

let opCounter = 0;
function op(
  num1: number,
  num2: number,
  isCorrect: boolean,
  date: string,
  timeTaken = 2
): OperationResponse {
  return {
    id: `op-test-${opCounter++}`,
    num1,
    num2,
    userAnswer: isCorrect ? num1 * num2 : 0,
    correctAnswer: num1 * num2,
    isCorrect,
    timeTaken,
    date,
  };
}

describe("factKey", () => {
  it("ne dépend pas de l'ordre des facteurs", () => {
    expect(factKey(7, 8)).toBe(factKey(8, 7));
    expect(factKey(3, 3)).toBe("3x3");
    expect(factKey(2, 10)).not.toBe(factKey(2, 1));
  });
});

describe("statusWeight", () => {
  it("donne plus de poids aux calculs ratés la dernière fois, moins aux maîtrisés", () => {
    expect(statusWeight("review")).toBeGreaterThan(statusWeight("progress"));
    expect(statusWeight("new")).toBe(statusWeight("progress"));
    expect(statusWeight("mastered")).toBeLessThan(statusWeight("progress"));
  });
});

describe("buildQuestions", () => {
  it("tire le nombre demandé de questions, toutes dans les tables choisies", () => {
    const questions = buildQuestions(settings(), [], seeded(1));
    expect(questions).toHaveLength(10);
    for (const q of questions) {
      expect([2, 5, 10].some((t) => q.num1 === t || q.num2 === t)).toBe(true);
      expect(q.correctAnswer).toBe(q.num1 * q.num2);
      expect(Math.max(q.num1, q.num2)).toBeLessThanOrEqual(10);
      expect(Math.min(q.num1, q.num2)).toBeGreaterThanOrEqual(1);
    }
  });

  it("ne pose jamais deux fois exactement la même question quand les tables suffisent", () => {
    for (let seed = 1; seed <= 50; seed++) {
      const questions = buildQuestions(settings({ selectedTables: [3, 4, 6, 7, 8], questionCount: 30 }), [], seeded(seed));
      expect(questions).toHaveLength(30);
      const labels = questions.map((q) => `${q.num1}x${q.num2}`);
      expect(new Set(labels).size).toBe(labels.length);
    }
  });

  it("atteint toujours le nombre demandé, en reposant des calculs si besoin", () => {
    for (const tables of [[7], [2, 5, 10], [1, 2]]) {
      for (let seed = 1; seed <= 40; seed++) {
        const questions = buildQuestions(
          settings({ selectedTables: tables, questionCount: 30, gameMode: GameMode.CHALLENGE, adaptiveDifficulty: false }),
          [],
          seeded(seed)
        );
        expect(questions).toHaveLength(30);
        // Toujours dans les tables choisies, avec la bonne réponse attendue.
        for (const q of questions) {
          expect(tables.some((t) => q.num1 === t || q.num2 === t)).toBe(true);
          expect(q.correctAnswer).toBe(q.num1 * q.num2);
        }
        // Jamais deux fois le même calcul à la suite.
        for (let i = 1; i < questions.length; i++) {
          expect(factKey(questions[i].num1, questions[i].num2)).not.toBe(
            factKey(questions[i - 1].num1, questions[i - 1].num2)
          );
        }
        // Identifiants uniques.
        expect(new Set(questions.map((q) => q.id)).size).toBe(30);
      }
    }
  });

  it("répartit les répétitions : une seule table donne ses 19 calculs, 1 ou 2 fois sur 30", () => {
    const questions = buildQuestions(settings({ selectedTables: [7], questionCount: 30 }), [], seeded(5));
    const counts = new Map<string, number>();
    for (const q of questions) counts.set(calcKey(q.num1, q.num2), (counts.get(calcKey(q.num1, q.num2)) ?? 0) + 1);
    expect(counts.size).toBe(19);
    expect([...counts.values()].every((c) => c === 1 || c === 2)).toBe(true);
  });

  it("donne le même tirage pour le même aléa", () => {
    const a = buildQuestions(settings(), [], seeded(42));
    const b = buildQuestions(settings(), [], seeded(42));
    expect(a).toEqual(b);
  });

  it("fait revenir plus souvent un calcul raté qu'un calcul réussi", () => {
    const history = [
      ...Array.from({ length: 6 }, () => op(7, 8, false, "2026-01-01T10:00:00.000Z")),
      ...Array.from({ length: 6 }, () => op(7, 2, true, "2026-01-01T10:00:00.000Z")),
    ];
    let hard = 0;
    let easy = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const questions = buildQuestions(
        settings({ selectedTables: [7], questionCount: 5 }),
        history,
        seeded(seed)
      );
      if (questions.some((q) => calcKey(q.num1, q.num2) === calcKey(7, 8))) hard++;
      if (questions.some((q) => calcKey(q.num1, q.num2) === calcKey(7, 2))) easy++;
    }
    expect(hard).toBeGreaterThan(easy * 2);
  });

  it("ignore l'historique quand le mode adaptatif est coupé", () => {
    const history = Array.from({ length: 6 }, () => op(7, 8, false, "2026-01-01T10:00:00.000Z"));
    const withHistory = buildQuestions(
      settings({ selectedTables: [7], adaptiveDifficulty: false }),
      history,
      seeded(9)
    );
    const without = buildQuestions(
      settings({ selectedTables: [7], adaptiveDifficulty: false }),
      [],
      seeded(9)
    );
    expect(withHistory).toEqual(without);
  });
});

describe("buildGameRecord", () => {
  const results: QuestionResult[] = [
    {
      question: { id: "q-0", num1: 7, num2: 8, correctAnswer: 56 },
      userAnswer: 56,
      isCorrect: true,
      timeTaken: 2.4,
      isTimedOut: false,
    },
    {
      question: { id: "q-1", num1: 6, num2: 9, correctAnswer: 54 },
      userAnswer: 56,
      isCorrect: false,
      timeTaken: 4.2,
      isTimedOut: false,
    },
    {
      question: { id: "q-2", num1: 3, num2: 4, correctAnswer: 12 },
      userAnswer: null,
      isCorrect: false,
      timeTaken: 5000,
      isTimedOut: true,
    },
  ];
  const now = new Date("2026-11-19T08:00:00.000Z");

  it("résume la partie dans le score", () => {
    const { score } = buildGameRecord(results, GameMode.TIMED, [3, 6, 7], { uid: "u1" }, now);
    expect(score.questionCount).toBe(3);
    expect(score.correctCount).toBe(1);
    expect(score.scorePercentage).toBeCloseTo(33.33, 1);
    expect(score.date).toBe("2026-11-19T08:00:00.000Z");
    expect(score.tables).toEqual([3, 6, 7]);
    expect(score.userId).toBe("u1");
  });

  it("crée une réponse par question, à la même date que le score", () => {
    const { score, ops } = buildGameRecord(results, GameMode.TIMED, [3, 6, 7], {}, now);
    expect(ops).toHaveLength(3);
    expect(ops.every((o) => o.date === score.date)).toBe(true);
    expect(new Set(ops.map((o) => o.id)).size).toBe(3);
    expect(ops[1]).toMatchObject({ num1: 6, num2: 9, userAnswer: 56, correctAnswer: 54 });
    expect(ops[2].userAnswer).toBeNull();
  });

  it("produit des identifiants et des temps acceptés par les règles de la base", () => {
    const { score, ops } = buildGameRecord(results, GameMode.TIMED, [3, 6, 7], {}, now);
    const validId = /^[a-zA-Z0-9_-]+$/;
    expect(score.id).toMatch(validId);
    for (const o of ops) {
      expect(o.id).toMatch(validId);
      expect(o.timeTaken).toBeLessThanOrEqual(1000);
      expect(o.timeTaken).toBeGreaterThanOrEqual(0);
    }
    expect(score.averageTime).toBeLessThanOrEqual(1000);
  });

  it("compte le score sur les calculs choisis, sans le calcul raté qui revient", () => {
    const withRetry: QuestionResult[] = [
      ...results.slice(0, 2),
      {
        question: { id: "q-1-r", num1: 6, num2: 9, correctAnswer: 54, isRetry: true },
        userAnswer: 54,
        isCorrect: true,
        timeTaken: 3,
        isTimedOut: false,
      },
    ];
    const { score, ops } = buildGameRecord(withRetry, GameMode.TIMED, [6, 7], {}, now);
    // 2 calculs choisis, 1 juste du premier coup : 1 / 2, pas 2 / 3.
    expect(score.questionCount).toBe(2);
    expect(score.correctCount).toBe(1);
    expect(score.scorePercentage).toBe(50);
    expect(score.averageTime).toBeCloseTo(3.3, 5);
    // La réponse au calcul revu reste gardée pour la maîtrise.
    expect(ops).toHaveLength(3);
    expect(ops[2]).toMatchObject({ num1: 6, num2: 9, isCorrect: true });
  });
});

describe("computeFactMastery", () => {
  const d = (day: number) => `2026-03-${String(day).padStart(2, "0")}T10:00:00.000Z`;

  it("considère maîtrisé un calcul juste et rapide 3 fois de suite", () => {
    const mastery = computeFactMastery([op(7, 8, true, d(1)), op(7, 8, true, d(2)), op(7, 8, true, d(3))]);
    expect(masteryOf(mastery, 7, 8)).toBe("mastered");
    expect(mastery.get(calcKey(7, 8))?.attempts).toBe(3);
  });

  it("traite 7 × 8 et 8 × 7 comme deux calculs différents", () => {
    const mastery = computeFactMastery([
      op(7, 8, true, d(1)),
      op(8, 7, false, d(2)),
      op(7, 8, true, d(3)),
      op(7, 8, true, d(4)),
    ]);
    expect(masteryOf(mastery, 7, 8)).toBe("mastered");
    expect(masteryOf(mastery, 8, 7)).toBe("learning");
    expect(factStatus(mastery, 8, 7)).toBe("review");
    expect(masteryOf(mastery, 6, 7)).toBe("new");
  });

  it("distingue « en bonne voie » (aucune erreur) de « on travaille » (une erreur récente)", () => {
    const mastery = computeFactMastery([
      // Deux réponses justes : pas encore assez pour être maîtrisé.
      op(3, 4, true, d(1)),
      op(3, 4, true, d(2)),
      // Une erreur, puis deux réponses justes : l'erreur est encore dans les 3 dernières.
      op(6, 7, false, d(1)),
      op(6, 7, true, d(2)),
      op(6, 7, true, d(3)),
      // Une vieille erreur, sortie des 3 dernières, mais des réponses trop lentes.
      { ...op(2, 9, false, d(1)) },
      { ...op(2, 9, true, d(2)), timeTaken: 14 },
      { ...op(2, 9, true, d(3)), timeTaken: 14 },
      { ...op(2, 9, true, d(4)), timeTaken: 14 },
      // La dernière réponse est fausse.
      op(8, 8, true, d(1)),
      op(8, 8, false, d(2)),
    ]);
    expect(factStatus(mastery, 3, 4)).toBe("progress");
    expect(factStatus(mastery, 6, 7)).toBe("working");
    expect(factStatus(mastery, 2, 9)).toBe("progress");
    expect(factStatus(mastery, 8, 8)).toBe("review");
    expect(statusWeight("working")).toBeGreaterThan(statusWeight("progress"));
    expect(statusWeight("working")).toBeLessThan(statusWeight("review"));
  });

  it("ne regarde que les 3 dernières réponses", () => {
    const mastery = computeFactMastery([
      op(6, 9, false, d(1)),
      op(6, 9, false, d(2)),
      op(6, 9, true, d(3)),
      op(6, 9, true, d(4)),
      op(6, 9, true, d(5)),
    ]);
    expect(masteryOf(mastery, 6, 9)).toBe("mastered");
  });

  it("garde en apprentissage un calcul trop récent, raté ou lent", () => {
    const tooFew = computeFactMastery([op(3, 4, true, d(1)), op(3, 4, true, d(2))]);
    expect(masteryOf(tooFew, 3, 4)).toBe("learning");

    const lastWrong = computeFactMastery([
      op(3, 4, true, d(1)),
      op(3, 4, true, d(2)),
      op(3, 4, false, d(3)),
    ]);
    expect(masteryOf(lastWrong, 3, 4)).toBe("learning");

    const slow = computeFactMastery([
      op(3, 4, true, d(1), 12),
      op(3, 4, true, d(2), 11),
      op(3, 4, true, d(3), 10),
    ]);
    expect(masteryOf(slow, 3, 4)).toBe("learning");
  });

  it("maîtrise un calcul à 10 secondes de moyenne au plus", () => {
    const justInTime = computeFactMastery([
      op(3, 4, true, d(1), 12),
      op(3, 4, true, d(2), 10),
      op(3, 4, true, d(3), 8),
    ]);
    expect(masteryOf(justInTime, 3, 4)).toBe("mastered");

    const justOver = computeFactMastery([
      op(3, 4, true, d(1), 12),
      op(3, 4, true, d(2), 10),
      op(3, 4, true, d(3), 8.3),
    ]);
    expect(masteryOf(justOver, 3, 4)).toBe("learning");
  });

  it("signale un calcul jamais rencontré", () => {
    expect(masteryOf(computeFactMastery([]), 9, 9)).toBe("new");
  });

  it("remet les réponses dans l'ordre des dates", () => {
    const mastery = computeFactMastery([
      op(5, 5, true, d(3)),
      op(5, 5, false, d(1)),
      op(5, 5, true, d(4)),
      op(5, 5, true, d(2)),
    ]);
    expect(masteryOf(mastery, 5, 5)).toBe("mastered");
  });

  it("peut donner l'état à une date passée", () => {
    const history = [
      op(4, 6, false, d(1)),
      op(4, 6, true, d(10)),
      op(4, 6, true, d(11)),
      op(4, 6, true, d(12)),
    ];
    expect(masteryOf(computeFactMastery(history, d(5)), 4, 6)).toBe("learning");
    expect(masteryOf(computeFactMastery(history, d(12)), 4, 6)).toBe("mastered");
  });
});

describe("calculs à trous", () => {
  it("attend le facteur manquant", () => {
    expect(makeQuestion("a", 7, 8, "factor2").correctAnswer).toBe(8);
    expect(makeQuestion("a", 7, 8, "factor1").correctAnswer).toBe(7);
    expect(makeQuestion("a", 7, 8)).toEqual({ id: "a", num1: 7, num2: 8, correctAnswer: 56 });
  });

  it("transforme environ un calcul sur trois quand l'option est active", () => {
    let holes = 0;
    let total = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const questions = buildQuestions(
        settings({ selectedTables: [2, 3, 4, 5, 6, 7, 8, 9], questionCount: 30, missingFactors: true }),
        [],
        seeded(seed)
      );
      total += questions.length;
      holes += questions.filter((q) => q.missing && q.missing !== "product").length;
      for (const q of questions) {
        const expected = q.missing === "factor1" ? q.num1 : q.missing === "factor2" ? q.num2 : q.num1 * q.num2;
        expect(q.correctAnswer).toBe(expected);
      }
    }
    expect(holes / total).toBeGreaterThan(0.25);
    expect(holes / total).toBeLessThan(0.42);
  });

  it("ne pose aucun calcul à trous sans l'option", () => {
    const questions = buildQuestions(settings({ questionCount: 30 }), [], seeded(4));
    expect(questions.every((q) => !q.missing)).toBe(true);
  });

  it("reconnaît une réponse enregistrée à un calcul à trous", () => {
    const answered = buildGameRecord(
      [{ question: makeQuestion("q", 7, 8, "factor2"), userAnswer: 8, isCorrect: true, timeTaken: 2, isTimedOut: false }],
      GameMode.TIMED,
      [7]
    ).ops[0];
    expect(answered).toMatchObject({ num1: 7, num2: 8, correctAnswer: 8 });
    expect(isMissingFactorAnswer(answered)).toBe(true);
    expect(isMissingFactorAnswer({ num1: 7, num2: 8, correctAnswer: 56 })).toBe(false);
  });
});

describe("mes points faibles", () => {
  const d = (day: number) => `2026-03-${String(day).padStart(2, "0")}T10:00:00.000Z`;
  const masteredFact = (a: number, b: number, day = 1) => [
    op(a, b, true, d(day)),
    op(a, b, true, d(day + 1)),
    op(a, b, true, d(day + 2)),
  ];
  const keysOf = (plan: { questions: { num1: number; num2: number }[] }) =>
    plan.questions.map((q) => calcKey(q.num1, q.num2));

  it("liste les calculs des tables sans doublon", () => {
    // 7 × 1 à 7 × 10 et 1 × 7 à 10 × 7, avec 7 × 7 une seule fois
    expect(calculationsInTables([7])).toHaveLength(19);
    // 7 × 8 et 8 × 7 sont dans les deux tables : comptés une fois chacun
    expect(calculationsInTables([7, 8])).toHaveLength(36);
    expect(calculationsInTables([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])).toHaveLength(100);
  });

  it("vise 60 % à travailler, 20 % de nouveaux et 20 % de révisions", () => {
    expect(focusQuotas(10)).toEqual({ practice: 6, fresh: 2, revision: 2 });
    expect(focusQuotas(20)).toEqual({ practice: 12, fresh: 4, revision: 4 });
    expect(focusQuotas(30)).toEqual({ practice: 18, fresh: 6, revision: 6 });
  });

  it("classe les calculs par niveau : un calcul appartient à la plus facile de ses tables", () => {
    expect(factLevel(2, 7)).toBe(1);
    expect(factLevel(3, 9)).toBe(2);
    expect(factLevel(7, 8)).toBe(3);
  });

  it("sans historique, commence par de nouveaux calculs des tables 1, 2, 5 et 10", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const plan = buildFocusSession([], 20, seeded(seed));
      expect(plan).toMatchObject({ practice: 0, fresh: 20, revision: 0 });
      expect(new Set(keysOf(plan)).size).toBe(20);
      for (const q of plan.questions) expect(factLevel(q.num1, q.num2)).toBe(1);
      expect(plan.questions.every((q) => !q.missing)).toBe(true);
    }
  });

  it("respecte la répartition quand il y a de tout", () => {
    // 15 calculs à travailler, 10 maîtrisés, le reste jamais vu.
    const facts = calculationsInTables([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const toWork = facts.slice(0, 15);
    const mastered = facts.slice(15, 25);
    const history = [
      ...toWork.map(([a, b]) => op(a, b, false, d(5))),
      ...mastered.flatMap(([a, b]) => masteredFact(a, b)),
    ];
    const plan = buildFocusSession(history, 20, seeded(4));
    expect(plan.questions).toHaveLength(20);
    expect(plan).toMatchObject({ practice: 12, fresh: 4, revision: 4 });
    expect(new Set(keysOf(plan)).size).toBe(20);
    // Les révisions sont posées à trous, les autres non (option désactivée).
    const mastery = computeFactMastery(history);
    for (const q of plan.questions) {
      const isHole = Boolean(q.missing && q.missing !== "product");
      expect(isHole).toBe(factStatus(mastery, q.num1, q.num2) === "mastered");
    }
  });

  it("donne la priorité aux calculs ratés la dernière fois, puis à ceux en bonne voie", () => {
    const history = [
      op(7, 8, false, d(5)),
      op(6, 9, false, d(5)),
      ...calculationsInTables([2, 5]).map(([a, b]) => op(a, b, true, d(5))),
    ];
    const plan = buildFocusSession(history, 10, seeded(6));
    expect(keysOf(plan)).toContain(calcKey(7, 8));
    expect(keysOf(plan)).toContain(calcKey(6, 9));
    // Pas de calcul maîtrisé : les 2 places de révision reviennent aux calculs à travailler.
    expect(plan).toMatchObject({ practice: 8, fresh: 2, revision: 0 });
  });

  it("révise d'abord les calculs maîtrisés les moins revus récemment", () => {
    const history = [
      ...masteredFact(3, 3, 1),
      ...masteredFact(4, 4, 10),
      ...masteredFact(9, 9, 20),
      ...calculationsInTables([1, 2, 5, 10, 3, 4, 9, 6, 7, 8])
        .filter(([a, b]) => ![calcKey(3, 3), calcKey(4, 4), calcKey(9, 9)].includes(calcKey(a, b)))
        .map(([a, b]) => op(a, b, false, d(25))),
    ];
    const plan = buildFocusSession(history, 10, seeded(7));
    expect(plan.revision).toBe(2);
    const keys = keysOf(plan);
    expect(keys).toContain(calcKey(3, 3));
    expect(keys).toContain(calcKey(4, 4));
    expect(keys).not.toContain(calcKey(9, 9));
  });

  it("complète quand une catégorie manque", () => {
    const history = calculationsInTables([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]).flatMap(([a, b]) => masteredFact(a, b));
    const plan = buildFocusSession(history, 20, seeded(3));
    expect(plan).toMatchObject({ practice: 0, fresh: 0, revision: 20 });
  });

  it("reste dans les tables demandées et repose des calculs s'il en manque", () => {
    const plan = buildFocusSession([], 20, seeded(9), { tables: [7] });
    expect(plan.questions).toHaveLength(20);
    expect(plan.questions.every((q) => q.num1 === 7 || q.num2 === 7)).toBe(true);
    for (let i = 1; i < plan.questions.length; i++) {
      expect(factKey(plan.questions[i].num1, plan.questions[i].num2)).not.toBe(
        factKey(plan.questions[i - 1].num1, plan.questions[i - 1].num2)
      );
    }
    expect(plan.tables).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("ajoute des calculs à trous ailleurs que sur les nouveaux quand l'option est active", () => {
    const facts = calculationsInTables([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const history = facts.slice(0, 40).map(([a, b]) => op(a, b, true, d(5)));
    let holesOnWork = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const plan = buildFocusSession(history, 20, seeded(seed), { extraHoles: true });
      const mastery = computeFactMastery(history);
      for (const q of plan.questions) {
        const isHole = Boolean(q.missing && q.missing !== "product");
        const status = factStatus(mastery, q.num1, q.num2);
        if (status === "new") expect(isHole).toBe(false);
        if (isHole && status === "progress") holesOnWork++;
      }
    }
    expect(holesOnWork).toBeGreaterThan(0);
  });
});

describe("récompenses de fin de partie", () => {
  const d = (day: number) => `2026-04-${String(day).padStart(2, "0")}T10:00:00.000Z`;

  it("annonce une nouvelle médaille et les calculs nouvellement maîtrisés", () => {
    const before: OperationResponse[] = [];
    // Table de 3 : 3 × 1 à 3 × 4 maîtrisés dans les deux sens, 3 × 5 aussi, 5 × 3 presque.
    for (let m = 1; m <= 4; m++) for (const day of [1, 2, 3]) before.push(op(3, m, true, d(day)), op(m, 3, true, d(day)));
    for (const day of [1, 2, 3]) before.push(op(3, 5, true, d(day)));
    for (const day of [1, 2]) before.push(op(5, 3, true, d(day)));
    const game = [op(5, 3, true, d(10))];

    const result = computeAchievements(before, game);
    expect(result.newMedals).toEqual([{ table: 3, medal: "bronze" }]);
    expect(result.newlyMastered).toBe(1);
  });

  it("ne donne pas de médaille pour un seul sens", () => {
    const before: OperationResponse[] = [];
    for (let m = 1; m <= 10; m++) for (const day of [1, 2, 3]) before.push(op(4, m, true, d(day)));
    const mastery = computeFactMastery(before);
    // Seul 4 × 4 est maîtrisé « dans les deux sens ».
    expect(tableMasteredCount(mastery, 4)).toBe(1);
    expect(medalsByTable(mastery)[3]).toBe("none");

    for (let m = 1; m <= 10; m++) for (const day of [4, 5, 6]) before.push(op(m, 4, true, d(day)));
    const complete = computeFactMastery(before);
    expect(tableMasteredCount(complete, 4)).toBe(10);
    expect(medalsByTable(complete)[3]).toBe("gold");
  });

  it("n'annonce rien quand rien ne change", () => {
    expect(computeAchievements([], [op(9, 9, false, d(1))])).toEqual({ newMedals: [], newlyMastered: 0 });
  });
});
