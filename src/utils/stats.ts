/**
 * Calculs purs sur l'historique : tirage des questions, enregistrement d'une
 * partie, niveau de maîtrise. Aucun accès au réseau ni au navigateur ici, pour
 * que tout soit testable.
 */
import {
  GameMode,
  GameSettings,
  HighScore,
  MissingPart,
  OperationResponse,
  Question,
  QuestionResult,
} from "../types";

/** Nombre de dernières réponses regardées pour juger la maîtrise d'un calcul. */
export const MASTERY_WINDOW = 3;
/** Temps moyen maximal (secondes) pour qu'une réponse juste compte comme rapide. */
export const FAST_SECONDS = 10;
/** Les règles Firestore refusent un temps supérieur à 1000 s. */
const MAX_RECORDED_SECONDS = 999;

export type Random = () => number;

/**
 * Clé d'un calcul, dans le sens où il est posé : 7 × 8 et 8 × 7 sont deux calculs
 * différents, chacun avec sa propre maîtrise. Il y en a 100 en tout.
 */
export function calcKey(a: number, b: number): string {
  return `${a}x${b}`;
}

/**
 * Clé d'une paire de nombres, sans ordre. Sert seulement à éviter que 7 × 8 et 8 × 7
 * tombent l'un juste après l'autre dans une partie.
 */
export function factKey(a: number, b: number): string {
  return a <= b ? `${a}x${b}` : `${b}x${a}`;
}

/**
 * Poids d'un calcul dans le tirage des tables choisies (mode Entraînement), d'après
 * ses dernières réponses, comme la maîtrise : un calcul raté la dernière fois revient
 * souvent, un calcul maîtrisé rarement.
 */
export function statusWeight(status: FactStatus): number {
  switch (status) {
    case "review":
      return 3.0;
    case "working":
      return 2.0;
    case "progress":
      return 1.0;
    case "new":
      return 1.0;
    case "mastered":
      return 0.15;
  }
}

/**
 * Tire les questions d'une partie. Chaque table choisie apporte ses calculs dans
 * les deux sens (19 pour une table). En mode adaptatif, les calculs ratés la
 * dernière fois ont plus de chances de sortir, les calculs maîtrisés moins.
 */
export function buildQuestions(
  settings: GameSettings,
  history: OperationResponse[],
  random: Random = Math.random
): Question[] {
  // Tous les calculs des tables choisies, chacun une fois, dans les deux sens.
  const pool = calculationsInTables(settings.selectedTables).map(([a, b]) => ({ n1: a, n2: b }));

  const mastery = settings.adaptiveDifficulty ? computeFactMastery(history) : null;

  // Tirage pondéré sans remise : score = aléa^(1/poids), on garde les plus hauts.
  const ranked = pool
    .map((p) => {
      const weight = mastery ? statusWeight(factStatus(mastery, p.n1, p.n2)) : 1.0;
      return { p, score: Math.pow(random(), 1 / weight) };
    })
    .sort((a, b) => b.score - a.score)
    .map((item) => item.p);

  const count =
    settings.questionCount === "all" ? Math.min(ranked.length, 30) : settings.questionCount;

  let chosen = ranked.slice(0, count);
  if (chosen.length < count) {
    // Pas assez de calculs différents dans les tables choisies (une seule table en
    // donne 19) : on en repose certains pour atteindre le nombre demandé, puis on mélange.
    while (chosen.length < count) {
      const reshuffled = ranked
        .map((p) => ({ p, r: random() }))
        .sort((a, b) => a.r - b.r)
        .map(({ p }) => p);
      chosen = [...chosen, ...reshuffled.slice(0, count - chosen.length)];
    }
    chosen = chosen
      .map((p) => ({ p, r: random() }))
      .sort((a, b) => a.r - b.r)
      .map(({ p }) => p);
  }
  // 5 × 10 et 10 × 5 peuvent sortir tous les deux : jamais l'un juste après l'autre.
  chosen = spreadOut(chosen);

  return chosen.map((p, index) => {
    const missing: MissingPart =
      settings.missingFactors && random() < 1 / 3 ? (random() < 0.5 ? "factor1" : "factor2") : "product";
    return makeQuestion(`q-${index}-${p.n1}x${p.n2}`, p.n1, p.n2, missing);
  });
}

/**
 * Réordonne la liste pour qu'un même calcul (dans un sens ou dans l'autre) ne
 * tombe jamais deux fois à la suite, quand c'est possible.
 */
function spreadOut<T extends { n1: number; n2: number }>(list: T[]): T[] {
  const result = [...list];
  const key = (p: T) => factKey(p.n1, p.n2);
  // L'élément `item` peut-il aller à la position `pos` sans toucher la même paire de nombres ?
  const fits = (pos: number, item: T) =>
    [pos - 1, pos + 1].every((n) => n < 0 || n >= result.length || key(result[n]) !== key(item));

  for (let pass = 0; pass < 3; pass++) {
    let changed = false;
    for (let i = 1; i < result.length; i++) {
      if (key(result[i]) !== key(result[i - 1])) continue;
      // Échange avec un élément éloigné d'au moins deux places, n'importe où dans la liste.
      for (let j = 0; j < result.length; j++) {
        if (Math.abs(j - i) <= 1) continue;
        if (fits(i, result[j]) && fits(j, result[i])) {
          [result[i], result[j]] = [result[j], result[i]];
          changed = true;
          break;
        }
      }
    }
    if (!changed) break;
  }
  return result;
}

/** Crée une question ; la réponse attendue dépend de la partie à trouver. */
export function makeQuestion(id: string, num1: number, num2: number, missing: MissingPart = "product"): Question {
  const correctAnswer = missing === "factor1" ? num1 : missing === "factor2" ? num2 : num1 * num2;
  return missing === "product"
    ? { id, num1, num2, correctAnswer }
    : { id, num1, num2, correctAnswer, missing };
}

/** Une réponse enregistrée vient-elle d'un calcul à trous ? (le facteur était demandé) */
export function isMissingFactorAnswer(op: { num1: number; num2: number; correctAnswer: number }): boolean {
  return op.correctAnswer !== op.num1 * op.num2;
}

export interface GameRecord {
  score: HighScore;
  ops: OperationResponse[];
}

/**
 * Transforme les résultats d'une partie en enregistrements à sauvegarder :
 * un score pour la partie et une ligne par réponse, tous datés du même instant.
 */
export function buildGameRecord(
  results: QuestionResult[],
  gameMode: GameMode,
  selectedTables: number[],
  player: { uid?: string; displayName?: string; profileId?: string } = {},
  now: Date = new Date(),
  random: Random = Math.random
): GameRecord {
  const stamp = now.getTime();
  const date = now.toISOString();
  const times = results.map((r) => Math.min(Math.max(r.timeTaken, 0), MAX_RECORDED_SECONDS));
  // Le score porte sur les calculs choisis, à la première réponse : un calcul raté qui revient
  // en fin de partie ne compte ni dans le score ni dans le temps moyen (il compte dans la maîtrise).
  const firstTries = results.map((r, i) => ({ r, time: times[i] })).filter(({ r }) => !r.question.isRetry);
  const questionCount = firstTries.length;
  const correctCount = firstTries.filter(({ r }) => r.isCorrect).length;
  const totalTime = firstTries.reduce((sum, { time }) => sum + time, 0);

  const score: HighScore = {
    id: `score-${stamp}-${Math.floor(random() * 1000)}`,
    date,
    tables: selectedTables,
    gameMode,
    questionCount,
    correctCount,
    scorePercentage: questionCount > 0 ? (correctCount / questionCount) * 100 : 0,
    averageTime: questionCount > 0 ? parseFloat((totalTime / questionCount).toFixed(2)) : 0,
    userId: player.uid,
    userDisplayName: player.displayName,
    ...(player.profileId ? { profileId: player.profileId } : {}),
  };

  const ops: OperationResponse[] = results.map((r, index) => ({
    id: `op-${stamp}-${Math.floor(random() * 100000)}-${index}`,
    userId: player.uid,
    ...(player.profileId ? { profileId: player.profileId } : {}),
    num1: r.question.num1,
    num2: r.question.num2,
    userAnswer: r.userAnswer,
    correctAnswer: r.question.correctAnswer,
    isCorrect: r.isCorrect,
    timeTaken: times[index],
    date,
  }));

  return { score, ops };
}

export type MasteryLevel = "new" | "learning" | "mastered";

export interface FactMastery {
  key: string;
  /** Nombre total de réponses données à ce calcul. */
  attempts: number;
  level: MasteryLevel;
  /** Les dernières réponses (au plus MASTERY_WINDOW), de la plus ancienne à la plus récente. */
  recent: OperationResponse[];
}

/**
 * Niveau de maîtrise de chaque calcul déjà rencontré. Un calcul est maîtrisé
 * quand ses 3 dernières réponses sont justes et rapides en moyenne. Avec
 * `until`, on obtient l'état tel qu'il était à cette date (pour mesurer un progrès).
 */
export function computeFactMastery(
  history: OperationResponse[],
  until?: string
): Map<string, FactMastery> {
  const byFact = new Map<string, OperationResponse[]>();
  history
    .filter((op) => !until || op.date <= until)
    .map((op, index) => ({ op, index }))
    // Les réponses d'une même partie ont la même date : on garde leur ordre d'origine.
    .sort((a, b) => a.op.date.localeCompare(b.op.date) || a.index - b.index)
    .forEach(({ op }) => {
      const key = calcKey(op.num1, op.num2);
      const list = byFact.get(key);
      if (list) list.push(op);
      else byFact.set(key, [op]);
    });

  const result = new Map<string, FactMastery>();
  byFact.forEach((attempts, key) => {
    const recent = attempts.slice(-MASTERY_WINDOW);
    const allCorrect = recent.length === MASTERY_WINDOW && recent.every((op) => op.isCorrect);
    const meanTime = recent.reduce((sum, op) => sum + op.timeTaken, 0) / recent.length;
    result.set(key, {
      key,
      attempts: attempts.length,
      level: allCorrect && meanTime <= FAST_SECONDS ? "mastered" : "learning",
      recent,
    });
  });
  return result;
}

/** Niveau d'un calcul précis ("new" s'il n'a jamais été rencontré). */
export function masteryOf(mastery: Map<string, FactMastery>, a: number, b: number): MasteryLevel {
  return mastery.get(calcKey(a, b))?.level ?? "new";
}

/** Nombre de calculs dans les tables de 1 à 10 : 7 × 8 et 8 × 7 comptent pour deux. */
export const TOTAL_CALCULATIONS = 100;

/**
 * Calculs maîtrisés dans une table, sur 10 : table × m compte quand il est maîtrisé
 * dans les deux sens (7 × 8 et 8 × 7). La table n'est complète que si tous ses
 * calculs le sont, dans un sens comme dans l'autre.
 */
export function tableMasteredCount(mastery: Map<string, FactMastery>, table: number): number {
  let count = 0;
  for (let m = 1; m <= 10; m++) {
    if (masteryOf(mastery, table, m) === "mastered" && masteryOf(mastery, m, table) === "mastered") count++;
  }
  return count;
}

/** Nombre total de calculs maîtrisés, sur 100. */
export function masteredCalculationCount(mastery: Map<string, FactMastery>): number {
  let count = 0;
  mastery.forEach((fact) => {
    if (fact.level === "mastered") count++;
  });
  return count;
}

export type Medal = "none" | "bronze" | "silver" | "gold";

/** Médaille d'une table selon ses calculs maîtrisés : bronze à 5, argent à 8, or à 10. */
export function medalFor(masteredInTable: number): Medal {
  if (masteredInTable >= 10) return "gold";
  if (masteredInTable >= 8) return "silver";
  if (masteredInTable >= 5) return "bronze";
  return "none";
}

export const MEDAL_LABEL: Record<Medal, string> = {
  none: "Pas encore de médaille",
  bronze: "Médaille de bronze",
  silver: "Médaille d'argent",
  gold: "Médaille d'or",
};

/**
 * État d'un calcul pour la grille du rapport, d'après ses 3 dernières réponses :
 * - jamais rencontré ;
 * - à revoir : la dernière réponse est fausse ;
 * - on travaille : la dernière est juste, mais il y a une erreur parmi les 3 dernières ;
 * - en bonne voie : aucune erreur, mais pas encore assez de réponses (ou pas assez rapides) ;
 * - maîtrisé.
 */
export type FactStatus = "new" | "review" | "working" | "progress" | "mastered";

export function factStatus(mastery: Map<string, FactMastery>, a: number, b: number): FactStatus {
  const fact = mastery.get(calcKey(a, b));
  if (!fact) return "new";
  if (fact.level === "mastered") return "mastered";
  if (!fact.recent[fact.recent.length - 1].isCorrect) return "review";
  return fact.recent.every((op) => op.isCorrect) ? "progress" : "working";
}

// ---------------------------------------------------------------------------
// « Mes points faibles » (et la session rapide, qui l'utilise)
// ---------------------------------------------------------------------------

export interface FocusPlan {
  questions: Question[];
  /** Calculs déjà rencontrés mais pas encore maîtrisés. */
  practice: number;
  /** Calculs jamais rencontrés. */
  fresh: number;
  /** Calculs maîtrisés, revus sous forme de calcul à trous. */
  revision: number;
  /** Tables concernées (facteurs présents), pour l'enregistrement de la partie. */
  tables: number[];
}

/**
 * Calculs des tables choisies, dans les deux sens et chacun une seule fois : la
 * table de 7 en compte 19 (7 × 1 à 7 × 10, 1 × 7 à 10 × 7, et 7 × 7 une fois).
 */
export function calculationsInTables(tables: number[]): [number, number][] {
  const seen = new Set<string>();
  const calcs: [number, number][] = [];
  const add = (a: number, b: number) => {
    const key = calcKey(a, b);
    if (seen.has(key)) return;
    seen.add(key);
    calcs.push([a, b]);
  };
  for (const t of tables) {
    for (let m = 1; m <= 10; m++) {
      add(t, m);
      add(m, t);
    }
  }
  return calcs;
}

/**
 * Niveau des tables pour découvrir de nouveaux calculs : d'abord 1, 2, 5 et 10,
 * puis 3, 4 et 9, enfin 6, 7 et 8.
 */
const TABLE_LEVEL: Record<number, number> = { 1: 1, 2: 1, 5: 1, 10: 1, 3: 2, 4: 2, 9: 2, 6: 3, 7: 3, 8: 3 };

/** Niveau d'un calcul : celui de la plus facile de ses deux tables (2 × 7 est dans la table de 2). */
export function factLevel(a: number, b: number): number {
  return Math.min(TABLE_LEVEL[a] ?? 3, TABLE_LEVEL[b] ?? 3);
}

/** Répartition visée : 60 % à travailler, 20 % de nouveaux, 20 % de révisions. */
export function focusQuotas(size: number): { practice: number; fresh: number; revision: number } {
  const practice = Math.round(size * 0.6);
  const fresh = Math.round(size * 0.2);
  return { practice, fresh, revision: size - practice - fresh };
}

const ALL_TABLES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

/**
 * « Mes points faibles » : l'app choisit les calculs d'après l'historique.
 * - À travailler (60 %) : les calculs ratés la dernière fois, puis ceux encore travaillés
 *   (une erreur récente), puis ceux en bonne voie.
 * - Nouveaux (20 %) : des calculs jamais vus, en commençant par les tables faciles.
 * - Révisions (20 %) : des calculs maîtrisés, les moins revus récemment, posés à trous.
 * Quand une catégorie manque, les autres complètent. Sans historique, la partie
 * se compose de nouveaux calculs des tables 1, 2, 5 et 10.
 */
export function buildFocusSession(
  history: OperationResponse[],
  size = 20,
  random: Random = Math.random,
  options: { tables?: number[]; extraHoles?: boolean } = {}
): FocusPlan {
  const mastery = computeFactMastery(history);
  const shuffle = <T,>(list: T[]) =>
    list
      .map((item) => ({ item, r: random() }))
      .sort((a, b) => a.r - b.r)
      .map(({ item }) => item);

  const facts = calculationsInTables(options.tables ?? ALL_TABLES).map(([a, b]) => ({
    a,
    b,
    status: factStatus(mastery, a, b),
    lastSeen: mastery.get(calcKey(a, b))?.recent.slice(-1)[0]?.date ?? "",
  }));
  type Fact = (typeof facts)[number];

  const practicePool = [
    ...shuffle(facts.filter((f) => f.status === "review")),
    ...shuffle(facts.filter((f) => f.status === "working")),
    ...shuffle(facts.filter((f) => f.status === "progress")),
  ];
  // Mélange puis tri stable : au hasard à l'intérieur d'un même niveau.
  const freshPool = shuffle(facts.filter((f) => f.status === "new")).sort(
    (x, y) => factLevel(x.a, x.b) - factLevel(y.a, y.b)
  );
  const revisionPool = shuffle(facts.filter((f) => f.status === "mastered")).sort((x, y) =>
    x.lastSeen.localeCompare(y.lastSeen)
  );

  const quotas = focusQuotas(size);
  const picked: Fact[] = [
    ...practicePool.slice(0, quotas.practice),
    ...freshPool.slice(0, quotas.fresh),
    ...revisionPool.slice(0, quotas.revision),
  ];
  for (const pool of [practicePool, freshPool, revisionPool]) {
    if (picked.length >= size) break;
    picked.push(...pool.filter((f) => !picked.includes(f)).slice(0, size - picked.length));
  }

  // Moins de calculs disponibles que demandé (peu de tables) : on en repose.
  let order: Fact[] = shuffle(picked);
  while (order.length < size && picked.length > 0) {
    order = [...order, ...shuffle(picked).slice(0, size - order.length)];
  }

  // Chaque calcul est posé dans son sens ; 7 × 8 et 8 × 7 ne se suivent jamais.
  const pairs = spreadOut(order.map((f) => ({ f, n1: f.a, n2: f.b })));

  const questions = pairs.map(({ f, n1, n2 }, index) => {
    const hole = (random() < 0.5 ? "factor1" : "factor2") as MissingPart;
    const missing: MissingPart =
      f.status === "mastered"
        ? hole
        : options.extraHoles && f.status !== "new" && random() < 1 / 3
        ? hole
        : "product";
    return makeQuestion(`f-${index}-${n1}x${n2}`, n1, n2, missing);
  });

  const tables = Array.from(new Set(picked.flatMap((f) => [f.a, f.b]))).sort((x, y) => x - y);

  return {
    questions,
    practice: picked.filter((f) => f.status === "review" || f.status === "working" || f.status === "progress").length,
    fresh: picked.filter((f) => f.status === "new").length,
    revision: picked.filter((f) => f.status === "mastered").length,
    tables: tables.length > 0 ? tables : [1],
  };
}

/** Médaille de chaque table (index 0 = table de 1). */
export function medalsByTable(mastery: Map<string, FactMastery>): Medal[] {
  return Array.from({ length: 10 }, (_, i) => medalFor(tableMasteredCount(mastery, i + 1)));
}

const MEDAL_RANK: Record<Medal, number> = { none: 0, bronze: 1, silver: 2, gold: 3 };

export interface Achievements {
  /** Tables qui ont gagné une médaille (ou une meilleure) pendant la partie. */
  newMedals: { table: number; medal: Medal }[];
  /** Calculs devenus maîtrisés pendant la partie. */
  newlyMastered: number;
}

/** Ce que la partie a fait gagner : nouvelles médailles et nouveaux calculs maîtrisés. */
export function computeAchievements(before: OperationResponse[], gameOps: OperationResponse[]): Achievements {
  const masteryBefore = computeFactMastery(before);
  const masteryAfter = computeFactMastery([...before, ...gameOps]);
  const medalsBefore = medalsByTable(masteryBefore);
  const medalsAfter = medalsByTable(masteryAfter);
  return {
    newMedals: medalsAfter
      .map((medal, i) => ({ table: i + 1, medal }))
      .filter(({ table, medal }) => MEDAL_RANK[medal] > MEDAL_RANK[medalsBefore[table - 1]]),
    newlyMastered: Math.max(0, masteredCalculationCount(masteryAfter) - masteredCalculationCount(masteryBefore)),
  };
}
