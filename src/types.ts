/**
 * Types for the Multiplication Game App
 */

export enum GameMode {
  /** Ancien mode libre (retiré) : il ne reste que dans les parties déjà enregistrées. */
  FREE = "FREE",
  TIMED = "TIMED", // Mode chronométré (moyenne à la fin)
  CHALLENGE = "CHALLENGE" // Mode chronométré avec limite (x secondes max par question)
}

export interface GameSettings {
  selectedTables: number[]; // e.g., [2, 3, 5]
  gameMode: GameMode;
  questionCount: number | "all"; // number of questions or all unique permutations
  timeLimitPerQuestion: number; // in seconds (for CHALLENGE mode)
  includeReverse: boolean; // whether to include reverse calculations, e.g., both 3x4 and 4x3
  adaptiveDifficulty: boolean; // whether to reduce frequently correct and increase frequently incorrect on generation
  /** Environ un calcul sur trois devient un calcul à trous (7 × ? = 56). */
  missingFactors?: boolean;
  /** Questions déjà choisies (points faibles, session rapide) : elles remplacent le tirage. */
  fixedQuestions?: Question[];
  /** Calculs choisis par l'app d'après l'historique (« Mes points faibles »). */
  focus?: boolean;
  /** Nom affiché pendant la partie (« Session rapide », « Points faibles »...). */
  sessionLabel?: string;
}

/** Ce que l'enfant doit trouver : le résultat (7 × 8 = ?) ou un facteur (7 × ? = 56). */
export type MissingPart = "product" | "factor1" | "factor2";

export interface Question {
  id: string;
  num1: number;
  num2: number;
  /** Réponse attendue : le résultat, ou le facteur manquant pour un calcul à trous. */
  correctAnswer: number;
  /** Partie à trouver ; le résultat si absent. */
  missing?: MissingPart;
  /** Calcul raté qui revient plus tard dans la même partie (une seule fois). */
  isRetry?: boolean;
}

export interface QuestionResult {
  question: Question;
  userAnswer: number | null; // null if timed out
  isCorrect: boolean;
  timeTaken: number; // in seconds
  isTimedOut: boolean;
}

export interface HighScore {
  id: string;
  date: string;
  tables: number[];
  gameMode: GameMode;
  questionCount: number;
  correctCount: number;
  scorePercentage: number;
  averageTime: number; // in seconds
  userId?: string;
  userDisplayName?: string;
  /** Enfant qui a joué, dans un compte famille. Absent : profil « legacy » du compte. */
  profileId?: string;
}

export interface OperationResponse {
  id: string;
  userId?: string;
  num1: number;
  num2: number;
  userAnswer: number | null;
  correctAnswer: number;
  isCorrect: boolean;
  timeTaken: number;
  date: string;
  /** Enfant qui a répondu, dans un compte famille. Absent : profil « legacy » du compte. */
  profileId?: string;
}

/** Profil d'un enfant dans un compte (une famille). */
export interface Profile {
  id: string;
  name: string;
  /** Un animal (emoji) choisi par l'enfant. */
  avatar: string;
  /** Les parties enregistrées sans profil (avant l'arrivée des profils) sont les siennes. */
  legacy: boolean;
}
