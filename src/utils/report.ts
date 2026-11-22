/**
 * Calculs du rapport d'apprentissage : utilisation et progrès sur une période.
 * Fonctions pures. Les jours sont ceux de l'appareil (heure locale).
 */
import { HighScore, OperationResponse } from "../types";
import {
  FAST_SECONDS,
  Medal,
  computeFactMastery,
  calcKey,
  masteredCalculationCount,
  medalFor,
  tableMasteredCount,
} from "./stats";

export type Period = "7d" | "30d" | "90d" | "all";

export const PERIOD_LABEL: Record<Period, string> = {
  "7d": "7 jours",
  "30d": "30 jours",
  "90d": "3 mois",
  all: "Tout",
};

const PERIOD_DAYS: Record<Exclude<Period, "all">, number> = { "7d": 7, "30d": 30, "90d": 90 };

/** Intervalle [start, end[ */
export interface Range {
  start: Date;
  end: Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

/** Clé d'un jour local : AAAA-MM-JJ. */
export function dayKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function time(iso: string): number {
  return Date.parse(iso);
}

export function inRange(iso: string, range: Range): boolean {
  const t = time(iso);
  return t >= range.start.getTime() && t < range.end.getTime();
}

/** Date la plus ancienne de l'historique, ou null s'il est vide. */
export function earliestDate(ops: OperationResponse[], scores: HighScore[]): Date | null {
  let min = Infinity;
  for (const item of [...ops, ...scores]) min = Math.min(min, time(item.date));
  return Number.isFinite(min) ? new Date(min) : null;
}

/**
 * Période en cours et période précédente de même durée. La période en cours
 * se termine à la fin de la journée d'aujourd'hui. « Tout » n'a pas de période précédente.
 */
export function periodRanges(
  period: Period,
  now: Date,
  earliest: Date | null
): { current: Range; previous: Range | null } {
  const end = addDays(startOfDay(now), 1);
  if (period === "all") {
    const start = startOfDay(earliest && earliest < end ? earliest : now);
    return { current: { start, end }, previous: null };
  }
  const days = PERIOD_DAYS[period];
  const start = addDays(end, -days);
  return { current: { start, end }, previous: { start: addDays(start, -days), end: start } };
}

// ---------------------------------------------------------------------------
// Utilisation (à partir des parties, anciennes parties en mode Libre comprises)
// ---------------------------------------------------------------------------

export interface UsageSummary {
  /** Jours différents avec au moins une partie. */
  days: number;
  sessions: number;
  questions: number;
  /** Temps passé à répondre, en secondes. */
  practiceSeconds: number;
}

/** Durée d'une partie : temps moyen par calcul × nombre de calculs. */
export function sessionSeconds(score: HighScore): number {
  return Math.max(0, score.averageTime) * score.questionCount;
}

export function usageSummary(scores: HighScore[], range: Range): UsageSummary {
  const inside = scores.filter((s) => inRange(s.date, range));
  return {
    days: new Set(inside.map((s) => dayKey(new Date(s.date)))).size,
    sessions: inside.length,
    questions: inside.reduce((sum, s) => sum + s.questionCount, 0),
    practiceSeconds: inside.reduce((sum, s) => sum + sessionSeconds(s), 0),
  };
}

/**
 * Série en cours : nombre de jours consécutifs avec au moins une partie, en
 * finissant aujourd'hui, ou hier si l'enfant n'a pas encore joué aujourd'hui.
 */
export function currentStreak(scores: HighScore[], now: Date): number {
  const days = new Set(scores.map((s) => dayKey(new Date(s.date))));
  let day = startOfDay(now);
  if (!days.has(dayKey(day))) day = addDays(day, -1);
  let streak = 0;
  while (days.has(dayKey(day))) {
    streak++;
    day = addDays(day, -1);
  }
  return streak;
}

/** Parties de la période, de la plus récente à la plus ancienne. */
export function sessionLog(scores: HighScore[], range: Range): HighScore[] {
  return scores
    .filter((s) => inRange(s.date, range))
    .sort((a, b) => time(b.date) - time(a.date));
}

// ---------------------------------------------------------------------------
// Progrès (à partir des réponses : Entraînement et Évaluation)
// ---------------------------------------------------------------------------

export interface AccuracySummary {
  answers: number;
  correct: number;
  /** Pourcentage de bonnes réponses, null sans réponse. */
  rate: number | null;
  /** Temps moyen d'une bonne réponse, en secondes ; null sans bonne réponse. */
  meanTime: number | null;
}

export function accuracySummary(ops: OperationResponse[], range: Range): AccuracySummary {
  const inside = ops.filter((o) => inRange(o.date, range));
  const correct = inside.filter((o) => o.isCorrect);
  return {
    answers: inside.length,
    correct: correct.length,
    rate: inside.length > 0 ? (correct.length / inside.length) * 100 : null,
    meanTime:
      correct.length > 0 ? correct.reduce((sum, o) => sum + o.timeTaken, 0) / correct.length : null,
  };
}

/** Nombre de calculs maîtrisés avant la date donnée. */
export function masteredCountAt(ops: OperationResponse[], before: Date): number {
  const until = new Date(before.getTime() - 1).toISOString();
  return masteredCalculationCount(computeFactMastery(ops, until));
}

export interface TableProgress {
  table: number;
  /** Calculs maîtrisés aujourd'hui, sur 10. */
  mastered: number;
  /** Calculs maîtrisés au début de la période. */
  masteredAtStart: number;
  medal: Medal;
}

export function tableProgress(ops: OperationResponse[], range: Range): TableProgress[] {
  const now = computeFactMastery(ops);
  const before = computeFactMastery(ops, new Date(range.start.getTime() - 1).toISOString());
  return Array.from({ length: 10 }, (_, i) => {
    const table = i + 1;
    const mastered = tableMasteredCount(now, table);
    return {
      table,
      mastered,
      masteredAtStart: tableMasteredCount(before, table),
      medal: medalFor(mastered),
    };
  });
}

/** Dernières réponses à un calcul, dans le sens où il est posé, de la plus récente à la plus ancienne. */
export function recentAttempts(
  ops: OperationResponse[],
  a: number,
  b: number,
  count = 5
): OperationResponse[] {
  const key = calcKey(a, b);
  return ops
    .map((op, index) => ({ op, index }))
    .filter(({ op }) => calcKey(op.num1, op.num2) === key)
    .sort((x, y) => time(y.op.date) - time(x.op.date) || y.index - x.index)
    .slice(0, count)
    .map(({ op }) => op);
}

/** Une réponse juste est-elle « rapide » ? (même seuil que pour la maîtrise) */
export function isFast(op: OperationResponse): boolean {
  return op.isCorrect && op.timeTaken <= FAST_SECONDS;
}

// ---------------------------------------------------------------------------
// Découpage en jours, semaines ou mois pour les graphiques
// ---------------------------------------------------------------------------

export type BucketUnit = "day" | "week" | "month";

export interface Bucket extends Range {
  /** Libellé complet, pour la lecture d'une valeur. */
  label: string;
  /** Libellé court, sous l'axe. */
  shortLabel: string;
}

const WEEKDAY = new Intl.DateTimeFormat("fr-FR", { weekday: "short" });
const DAY_MONTH = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" });
const LONG_DAY = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" });
const MONTH = new Intl.DateTimeFormat("fr-FR", { month: "short" });
const MONTH_YEAR = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" });

function startOfWeek(d: Date): Date {
  const day = startOfDay(d);
  const offset = (day.getDay() + 6) % 7; // lundi = 0
  return addDays(day, -offset);
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function makeBuckets(range: Range, unit: BucketUnit): Bucket[] {
  const buckets: Bucket[] = [];
  let cursor =
    unit === "day"
      ? startOfDay(range.start)
      : unit === "week"
      ? startOfWeek(range.start)
      : new Date(range.start.getFullYear(), range.start.getMonth(), 1);

  while (cursor < range.end) {
    const next =
      unit === "day"
        ? addDays(cursor, 1)
        : unit === "week"
        ? addDays(cursor, 7)
        : new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    let label: string;
    let shortLabel: string;
    if (unit === "day") {
      label = capitalize(LONG_DAY.format(cursor));
      shortLabel = range.end.getTime() - range.start.getTime() <= 8 * DAY_MS
        ? WEEKDAY.format(cursor).replace(".", "")
        : String(cursor.getDate());
    } else if (unit === "week") {
      label = `Semaine du ${DAY_MONTH.format(cursor)}`;
      shortLabel = DAY_MONTH.format(cursor).replace(".", "");
    } else {
      label = capitalize(MONTH_YEAR.format(cursor));
      shortLabel = MONTH.format(cursor).replace(".", "");
    }
    buckets.push({ start: cursor, end: next, label, shortLabel });
    cursor = next;
  }
  return buckets;
}

/** Graphique d'activité : par jour sur 7 et 30 jours, par semaine au-delà, par mois sur une longue durée. */
export function activityUnit(period: Period, range: Range): BucketUnit {
  if (period === "7d" || period === "30d") return "day";
  if (period === "90d") return "week";
  const days = (range.end.getTime() - range.start.getTime()) / DAY_MS;
  return days <= 31 ? "day" : days <= 26 * 7 ? "week" : "month";
}

/** Courbes de progrès : par jour sur 7 jours, sinon par semaine, par mois sur une longue durée. */
export function trendUnit(period: Period, range: Range): BucketUnit {
  if (period === "7d") return "day";
  if (period === "30d" || period === "90d") return "week";
  const days = (range.end.getTime() - range.start.getTime()) / DAY_MS;
  return days <= 14 ? "day" : days <= 26 * 7 ? "week" : "month";
}

/** Nombre de calculs faits dans chaque intervalle (anciennes parties en mode Libre comprises). */
export function activitySeries(scores: HighScore[], buckets: Bucket[]): number[] {
  return buckets.map((bucket) =>
    scores.filter((s) => inRange(s.date, bucket)).reduce((sum, s) => sum + s.questionCount, 0)
  );
}

export type TrendMetric = "rate" | "speed" | "mastered";

/**
 * Valeur de la courbe de progrès pour chaque intervalle :
 * réussite (%), temps moyen d'une bonne réponse (s) ou calculs maîtrisés à la fin de l'intervalle.
 * null quand l'intervalle ne contient aucune réponse (sauf pour la maîtrise, qui est un état).
 */
export function trendSeries(
  ops: OperationResponse[],
  buckets: Bucket[],
  metric: TrendMetric
): (number | null)[] {
  if (metric === "mastered") {
    return buckets.map((bucket) => masteredCountAt(ops, bucket.end));
  }
  return buckets.map((bucket) => {
    const summary = accuracySummary(ops, bucket);
    return metric === "rate" ? summary.rate : summary.meanTime;
  });
}

// ---------------------------------------------------------------------------
// Mise en forme
// ---------------------------------------------------------------------------

/** « 45 s », « 12 min », « 1 h 05 » */
export function formatDuration(seconds: number): string {
  const total = Math.round(seconds);
  if (total < 60) return `${total} s`;
  const minutes = Math.round(total / 60);
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h} h ${String(m).padStart(2, "0")}`;
}

export function formatSeconds(value: number): string {
  return `${value.toFixed(1).replace(".", ",")} s`;
}
