import { describe, expect, it } from "vitest";
import { GameMode, HighScore, OperationResponse } from "../types";
import {
  accuracySummary,
  activitySeries,
  activityUnit,
  currentStreak,
  dayKey,
  earliestDate,
  formatDuration,
  makeBuckets,
  masteredCountAt,
  periodRanges,
  recentAttempts,
  sessionLog,
  tableProgress,
  trendSeries,
  trendUnit,
  usageSummary,
} from "./report";
import { factStatus, computeFactMastery, medalFor } from "./stats";

// Toutes les dates sont construites en heure locale : les tests ne dépendent pas du fuseau.
const NOW = new Date(2026, 10, 19, 18, 0); // jeudi 19 novembre 2026, 18 h
const at = (daysAgo: number, hour = 10) =>
  new Date(2026, 10, 19 - daysAgo, hour, 0).toISOString();

let n = 0;
function score(daysAgo: number, questionCount = 10, averageTime = 3, mode = GameMode.TIMED, hour = 10): HighScore {
  return {
    id: `score-${n++}`,
    date: at(daysAgo, hour),
    tables: [7],
    gameMode: mode,
    questionCount,
    correctCount: questionCount,
    scorePercentage: 100,
    averageTime,
  };
}
function op(daysAgo: number, a: number, b: number, isCorrect: boolean, timeTaken = 2, hour = 10): OperationResponse {
  return {
    id: `op-${n++}`,
    num1: a,
    num2: b,
    userAnswer: isCorrect ? a * b : 0,
    correctAnswer: a * b,
    isCorrect,
    timeTaken,
    date: at(daysAgo, hour),
  };
}

describe("periodRanges", () => {
  it("couvre les 7 derniers jours, aujourd'hui compris, et la semaine d'avant", () => {
    const { current, previous } = periodRanges("7d", NOW, null);
    expect(dayKey(current.start)).toBe("2026-11-13");
    expect(dayKey(current.end)).toBe("2026-11-20");
    expect(dayKey(previous!.start)).toBe("2026-11-06");
    expect(dayKey(previous!.end)).toBe("2026-11-13");
  });

  it("commence « Tout » au premier jour de l'historique, sans période précédente", () => {
    const { current, previous } = periodRanges("all", NOW, new Date(2026, 8, 3, 15));
    expect(dayKey(current.start)).toBe("2026-09-03");
    expect(previous).toBeNull();
  });
});

describe("utilisation", () => {
  const scores = [
    score(0, 10, 3),
    score(0, 5, 4, GameMode.FREE, 16),
    score(2, 20, 2),
    score(6, 10, 3),
    score(7, 30, 5), // hors des 7 derniers jours
  ];

  it("compte jours, parties, calculs et temps sur la période, mode Libre compris", () => {
    const { current } = periodRanges("7d", NOW, null);
    expect(usageSummary(scores, current)).toEqual({
      days: 3,
      sessions: 4,
      questions: 45,
      practiceSeconds: 30 + 20 + 40 + 30,
    });
  });

  it("calcule la série de jours consécutifs", () => {
    expect(currentStreak([score(0), score(1), score(2), score(4)], NOW)).toBe(3);
    // Pas encore joué aujourd'hui : la série d'hier compte toujours.
    expect(currentStreak([score(1), score(2)], NOW)).toBe(2);
    expect(currentStreak([score(2), score(3)], NOW)).toBe(0);
    expect(currentStreak([], NOW)).toBe(0);
  });

  it("liste les parties de la période, la plus récente d'abord", () => {
    const { current } = periodRanges("7d", NOW, null);
    const log = sessionLog(scores, current);
    expect(log.map((s) => s.id)).toEqual([scores[1].id, scores[0].id, scores[2].id, scores[3].id]);
  });

  it("répartit les calculs par jour", () => {
    const { current } = periodRanges("7d", NOW, null);
    const buckets = makeBuckets(current, activityUnit("7d", current));
    expect(buckets).toHaveLength(7);
    // Du vendredi 13 au jeudi 19 novembre.
    expect(activitySeries(scores, buckets)).toEqual([10, 0, 0, 0, 20, 0, 15]);
  });
});

describe("progrès", () => {
  it("mesure la réussite et le temps moyen d'une bonne réponse", () => {
    const ops = [op(1, 7, 8, true, 2), op(1, 6, 9, false, 9), op(2, 3, 4, true, 4), op(10, 2, 2, false)];
    const { current, previous } = periodRanges("7d", NOW, null);
    expect(accuracySummary(ops, current)).toEqual({ answers: 3, correct: 2, rate: (2 / 3) * 100, meanTime: 3 });
    expect(accuracySummary(ops, previous!)).toEqual({ answers: 1, correct: 0, rate: 0, meanTime: null });
  });

  it("compte les calculs maîtrisés à une date donnée, chaque sens à part", () => {
    const ops = [op(9, 7, 8, true), op(8, 7, 8, true), op(2, 7, 8, true), op(1, 8, 7, true), op(1, 3, 3, true)];
    const { current } = periodRanges("7d", NOW, null);
    expect(masteredCountAt(ops, current.start)).toBe(0);
    // 7 × 8 a ses 3 bonnes réponses ; 8 × 7 n'en a qu'une.
    expect(masteredCountAt(ops, current.end)).toBe(1);
  });

  it("donne pour chaque table sa maîtrise, son évolution et sa médaille", () => {
    const ops: OperationResponse[] = [];
    const both = (a: number, b: number, days: number[]) => {
      for (const d of days) ops.push(op(d, a, b, true), op(d, b, a, true));
    };
    // Table de 2 : 5 calculs maîtrisés dans les deux sens il y a 10 jours, puis 3 de plus cette semaine.
    for (let m = 1; m <= 5; m++) both(2, m, [12, 11, 10]);
    for (let m = 6; m <= 8; m++) both(m, 2, [3, 2, 1]);
    // 2 × 9 maîtrisé dans un seul sens : il ne compte pas.
    for (const d of [3, 2, 1]) ops.push(op(d, 2, 9, true));
    const { current } = periodRanges("7d", NOW, null);
    const tables = tableProgress(ops, current);
    expect(tables[1]).toEqual({ table: 2, mastered: 8, masteredAtStart: 5, medal: "silver" });
    expect(tables[5].mastered).toBe(1); // 6 × 2 et 2 × 6 comptent aussi pour la table de 6
    expect(tables[8]).toEqual({ table: 9, mastered: 0, masteredAtStart: 0, medal: "none" });
  });

  it("trace la réussite par jour, et la maîtrise comme un état cumulé", () => {
    const ops = [op(6, 2, 3, true), op(6, 2, 4, false), op(4, 2, 3, true), op(2, 2, 3, true)];
    const { current } = periodRanges("7d", NOW, null);
    const buckets = makeBuckets(current, trendUnit("7d", current));
    expect(trendSeries(ops, buckets, "rate")).toEqual([50, null, 100, null, 100, null, null]);
    expect(trendSeries(ops, buckets, "mastered")).toEqual([0, 0, 0, 0, 1, 1, 1]);
  });

  it("retrouve les dernières réponses à un calcul, dans le sens où il est posé", () => {
    const ops = [op(5, 7, 8, false), op(3, 8, 7, true), op(1, 7, 8, true), op(1, 6, 6, true)];
    expect(recentAttempts(ops, 7, 8, 5).map((o) => o.date)).toEqual([at(1), at(5)]);
    expect(recentAttempts(ops, 8, 7, 5).map((o) => o.date)).toEqual([at(3)]);
  });
});

describe("découpage", () => {
  it("découpe par semaine en commençant le lundi", () => {
    const { current } = periodRanges("30d", NOW, null);
    const weeks = makeBuckets(current, "week");
    expect(weeks[0].start.getDay()).toBe(1);
    expect(dayKey(weeks[weeks.length - 1].start)).toBe("2026-11-16");
    // Du 21 octobre au 19 novembre : semaines des 19 et 26 octobre, 2, 9 et 16 novembre.
    expect(dayKey(weeks[0].start)).toBe("2026-10-19");
    expect(weeks).toHaveLength(5);
  });

  it("choisit l'unité selon la durée", () => {
    const short = periodRanges("all", NOW, new Date(2026, 10, 10)).current;
    const long = periodRanges("all", NOW, new Date(2025, 10, 10)).current;
    expect(activityUnit("all", short)).toBe("day");
    expect(activityUnit("all", long)).toBe("month");
    expect(trendUnit("90d", periodRanges("90d", NOW, null).current)).toBe("week");
  });
});

describe("divers", () => {
  it("trouve la date la plus ancienne", () => {
    expect(earliestDate([], [])).toBeNull();
    expect(earliestDate([op(3, 2, 2, true)], [score(8)])?.toISOString()).toBe(at(8));
  });

  it("écrit les durées simplement", () => {
    expect(formatDuration(42)).toBe("42 s");
    expect(formatDuration(12 * 60 + 10)).toBe("12 min");
    expect(formatDuration(65 * 60)).toBe("1 h 05");
  });

  it("attribue les médailles à 5, 8 et 10 calculs maîtrisés", () => {
    expect([4, 5, 7, 8, 9, 10].map(medalFor)).toEqual(["none", "bronze", "bronze", "silver", "silver", "gold"]);
  });

  it("classe un calcul de la grille selon sa dernière réponse", () => {
    const mastery = computeFactMastery([op(3, 4, 4, true), op(2, 5, 5, true), op(1, 5, 5, false)]);
    expect(factStatus(mastery, 4, 4)).toBe("progress");
    expect(factStatus(mastery, 5, 5)).toBe("review");
    expect(factStatus(mastery, 9, 9)).toBe("new");
  });
});
