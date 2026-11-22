/**
 * Ce que dit la mascotte, et la bouille qui va avec. Fonctions pures : le hasard est passé
 * en paramètre, pour que tout soit testable.
 */
import type { Question } from "../types";

/** Les bouilles du robot (voir Mascot.tsx). */
export type MascotExpression =
  | "neutral"
  | "correct"
  | "incorrect"
  | "victory"
  | "thinking"
  | "wink"
  | "cool"
  | "wow"
  | "love"
  | "determined"
  | "dizzy"
  | "laugh"
  | "silly"
  | "starry"
  | "proud"
  | "pizza";

export interface Reaction {
  text: string;
  expression: MascotExpression;
}

export type Random = () => number;

export function pick<T>(list: readonly T[], random: Random = Math.random): T {
  return list[Math.min(list.length - 1, Math.floor(random() * list.length))];
}

// ---------------------------------------------------------------------------
// Bonne réponse
// ---------------------------------------------------------------------------

/** Les compliments de tous les jours. « Pizza » vient de la toute première version de l'app. */
export const PRAISES: readonly Reaction[] = [
  { text: "Incroyable !", expression: "correct" },
  { text: "Génial !", expression: "correct" },
  { text: "Tu es au top !", expression: "wink" },
  { text: "Parfait !", expression: "correct" },
  { text: "Pizzas !", expression: "pizza" },
  { text: "Parfait, comme une pizza !", expression: "pizza" },
  { text: "Une part de pizza pour toi !", expression: "pizza" },
  { text: "Ça mérite une pizza !", expression: "pizza" },
  { text: "Mais oui !", expression: "correct" },
  { text: "Excellent !", expression: "correct" },
  { text: "C’est la bonne réponse !", expression: "correct" },
  { text: "Bien joué !", expression: "wink" },
  { text: "Exactement !", expression: "correct" },
  { text: "Trop fort !", expression: "cool" },
  { text: "Dans le mille !", expression: "wink" },
  { text: "Bingo !", expression: "correct" },
  { text: "Tu gères !", expression: "cool" },
  { text: "Bip bip, c’est juste !", expression: "correct" },
  { text: "Calcul validé !", expression: "wink" },
  { text: "Mes antennes frétillent !", expression: "correct" },
  { text: "Mon écran brille de joie !", expression: "love" },
  { text: "Youpi !", expression: "laugh" },
  { text: "Ha ha, trop facile !", expression: "laugh" },
  { text: "Mes boulons font la fête !", expression: "laugh" },
  { text: "Même mon grille-pain est épaté !", expression: "laugh" },
  { text: "Miam, un calcul tout chaud !", expression: "silly" },
  { text: "Bip bop, réponse au top !", expression: "silly" },
  { text: "Ding ding, gagné !", expression: "starry" },
  { text: "Mes circuits applaudissent !", expression: "starry" },
  { text: "Cocorico !", expression: "proud" },
  { text: "Hop, dans la poche !", expression: "wink" },
  { text: "Cerveau turbo activé !", expression: "cool" },
];

/** Réponse éclair (3 secondes au plus). */
export const FAST_PRAISES: readonly string[] = [
  "Rapide comme l’éclair !",
  "Quelle vitesse !",
  "Turbo !",
  "Tu vas plus vite que moi !",
  "Même pas eu le temps de cligner !",
  "Fusée !",
  "Zoum !",
  "Plus rapide qu’une pizza livrée !",
];

/** Un calcul raté plus tôt dans la partie, réussi quand il revient. */
export const RETRY_PRAISES: readonly string[] = [
  "Cette fois, c’est la bonne !",
  "Tu l’as retenu !",
  "Revu et réussi !",
  "Je suis fier de toi !",
  "Et voilà, retenu !",
];

/** Un calcul à trous réussi. */
export const HOLE_PRAISES: readonly string[] = ["Bien trouvé !", "Le nombre caché, c’est lui !", "Trou bouché !"];

/** Seuil d'une réponse éclair, en secondes. */
export const FLASH_SECONDS = 3;

/** Le mot pour une série de bonnes réponses d'affilée, aux paliers 3, 5, 7, 10, 15... */
export function streakReaction(streak: number): Reaction | null {
  if (streak === 3) return { text: "Trois d’affilée !", expression: "cool" };
  if (streak === 7) return { text: "Sept d’affilée, tu brilles !", expression: "starry" };
  if (streak === 5) return { text: "Cinq à la suite, la classe !", expression: "cool" };
  if (streak === 10) return { text: "Dix sans une erreur !", expression: "love" };
  if (streak > 10 && streak % 5 === 0) return { text: `${streak} à la suite, incroyable !`, expression: "love" };
  return null;
}

/**
 * Le mot de la mascotte après une bonne réponse, du plus rare au plus courant :
 * une série, un calcul revu, une réponse éclair, un calcul à trous, puis un compliment au hasard.
 * Le prénom de l'enfant revient de temps en temps.
 */
export function correctReaction(
  ctx: { streak: number; seconds: number; isRetry?: boolean; hole?: boolean; name?: string },
  random: Random = Math.random
): Reaction {
  const streak = streakReaction(ctx.streak);
  if (streak) return streak;
  if (ctx.isRetry) return { text: pick(RETRY_PRAISES, random), expression: "proud" };
  if (ctx.seconds <= FLASH_SECONDS) return { text: pick(FAST_PRAISES, random), expression: "wow" };
  if (ctx.hole && random() < 0.5) return { text: pick(HOLE_PRAISES, random), expression: "wink" };
  const name = ctx.name?.trim();
  if (name && random() < 0.15) return { text: `Bravo ${name} !`, expression: "love" };
  return pick(PRAISES, random);
}

/** Après une erreur, une fois la bonne réponse recopiée. */
export const RETYPE_OK: readonly string[] = [
  "C’est ça !",
  "Bien recopié !",
  "Tu l’as !",
  "Celui-là, on le retient !",
  "Rangé dans ta mémoire !",
];

// ---------------------------------------------------------------------------
// Erreur et temps écoulé
// ---------------------------------------------------------------------------

/** Erreurs sans indice particulier. */
export const MISTAKES: readonly Reaction[] = [
  { text: "Oups !", expression: "incorrect" },
  { text: "Pas grave, ça arrive !", expression: "incorrect" },
  { text: "On s’accroche !", expression: "determined" },
  { text: "Même les robots se trompent !", expression: "incorrect" },
  { text: "Allez, on le retient !", expression: "determined" },
  { text: "Oh, mes boulons !", expression: "incorrect" },
  { text: "Pas de panique !", expression: "determined" },
  { text: "Ma calculette hésite aussi !", expression: "silly" },
];

export const TIMEOUTS: readonly string[] = [
  "Temps écoulé !",
  "Le temps a filé !",
  "Trop tard pour celui-là !",
  "Le chrono a gagné cette fois !",
];

function reversed(n: number): number {
  return Number(String(n).split("").reverse().join(""));
}

/**
 * Le mot de la mascotte après une réponse fausse. Quand l'erreur a une cause probable,
 * il la nomme : une addition au lieu d'une multiplication, une fois de trop ou de moins
 * (7 × 8 = 63 ou 48), des chiffres inversés, le résultat donné à la place du nombre caché.
 */
export function mistakeReaction(
  q: Pick<Question, "num1" | "num2" | "correctAnswer" | "missing">,
  answer: number | null,
  random: Random = Math.random
): Reaction {
  if (answer === null) return { text: pick(TIMEOUTS, random), expression: "dizzy" };
  const product = q.num1 * q.num2;
  const hole = q.missing === "factor1" || q.missing === "factor2";

  if (hole) {
    if (answer === product) return { text: "Cherche le nombre caché !", expression: "determined" };
    if (Math.abs(answer - q.correctAnswer) === 1) return { text: "Tout près !", expression: "determined" };
    return pick(MISTAKES, random);
  }

  if (answer === q.num1 + q.num2) return { text: "C’est un ×, pas un + !", expression: "wink" };
  if (answer === product + q.num1 || answer === product + q.num2) {
    return { text: "Une fois de trop !", expression: "determined" };
  }
  if (answer === product - q.num1 || answer === product - q.num2) {
    return { text: "Il en manque une fois !", expression: "determined" };
  }
  if (answer >= 10 && reversed(answer) === product) return { text: "Chiffres inversés !", expression: "wink" };
  if (Math.abs(answer - product) <= 2) return { text: "Tout près !", expression: "determined" };
  return pick(MISTAKES, random);
}

// ---------------------------------------------------------------------------
// En attendant la réponse
// ---------------------------------------------------------------------------

const PROMPTS_PRODUCT = [
  "Trouve le résultat !",
  "Combien ça fait ?",
  "À toi de jouer !",
  "Je t’écoute !",
  "Montre-moi ce que tu sais !",
];
const PROMPTS_HOLE = ["Trouve le nombre qui manque !", "Quel nombre se cache ?"];
const PROMPTS_RETRY = ["On revoit celui-là !", "Le revoilà !"];

/** La consigne d'un calcul : elle change d'un calcul à l'autre, jamais pendant un même calcul. */
export function promptText(q: Pick<Question, "missing" | "isRetry">, index: number): string {
  const list = q.isRetry
    ? PROMPTS_RETRY
    : q.missing === "factor1" || q.missing === "factor2"
    ? PROMPTS_HOLE
    : PROMPTS_PRODUCT;
  return list[index % list.length];
}

// ---------------------------------------------------------------------------
// Compte à rebours et fin de partie
// ---------------------------------------------------------------------------

export const COUNTDOWN_TIPS: readonly string[] = [
  "Concentre-toi et réponds le plus vite possible !",
  "Échauffe tes neurones !",
  "Mes circuits sont prêts, et toi ?",
  "Respire, tu connais la musique.",
  "Attache ta ceinture, on décolle !",
  "Mes antennes sont tout ouïe !",
];

export interface Review {
  title: string;
  text: string;
  expression: MascotExpression;
}

const REVIEWS: { min: number; list: readonly Review[] }[] = [
  {
    min: 100,
    list: [
      {
        title: "Perfection absolue !",
        text: "Un parcours sans faute, tu connais tes tables sur le bout des doigts !",
        expression: "victory",
      },
      { title: "Zéro faute !", text: "Mes circuits n’en reviennent pas : tout est juste !", expression: "love" },
      { title: "Sans une erreur !", text: "Tu mérites une pizza entière !", expression: "pizza" },
      { title: "Tout juste !", text: "Mes boulons dansent la java. Quelle partie !", expression: "laugh" },
    ],
  },
  {
    min: 80,
    list: [
      { title: "Magnifique travail !", text: "C’est presque parfait ! Continue comme ça !", expression: "victory" },
      {
        title: "Quelle partie !",
        text: "Presque tout juste. Les calculs ratés reviendront, et tu les auras.",
        expression: "cool",
      },
      { title: "Tu assures !", text: "Encore un petit effort et ce sera le sans-faute.", expression: "cool" },
      { title: "Tu brilles !", text: "Presque tout juste : mes antennes en clignotent encore.", expression: "starry" },
    ],
  },
  {
    min: 50,
    list: [
      {
        title: "Bravo, bel effort !",
        text: "Tu as de bonnes bases, encore un peu d’entraînement et tu seras invincible !",
        expression: "wink",
      },
      {
        title: "C’est en bonne voie !",
        text: "Plus de la moitié juste. Les calculs ratés reviendront pour que tu les retiennes.",
        expression: "neutral",
      },
      { title: "Ça progresse !", text: "Encore quelques parties et ces calculs n’auront plus de secret.", expression: "wink" },
      { title: "C’est du solide !", text: "Plus de la moitié juste. Je suis fier de toi, on continue ?", expression: "proud" },
    ],
  },
  {
    min: 0,
    list: [
      {
        title: "Ne lâche rien !",
        text: "Apprendre prend du temps, chaque calcul te rapproche de la réussite. Relance une partie pour t’améliorer !",
        expression: "determined",
      },
      {
        title: "On s’accroche !",
        text: "Ces calculs sont durs, c’est normal de se tromper. On les retravaille ensemble.",
        expression: "determined",
      },
      {
        title: "Même les robots apprennent !",
        text: "Chaque erreur t’aide à retenir. Relance une partie quand tu veux.",
        expression: "incorrect",
      },
    ],
  },
];

/** Le mot de la fin, selon le score (en %), choisi au hasard parmi ceux de son palier. */
export function resultsReview(percentage: number, random: Random = Math.random): Review {
  const tier = REVIEWS.find((t) => percentage >= t.min) ?? REVIEWS[REVIEWS.length - 1];
  return pick(tier.list, random);
}
