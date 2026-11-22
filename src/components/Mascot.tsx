import { motion, Variants } from "motion/react";
import type { MascotExpression } from "../utils/mascot";

interface MascotProps {
  expression: MascotExpression;
  size?: number;
}

/** Œil ouvert avec son reflet. */
function Eye({ cx, cy = 42, r = 6 }: { cx: number; cy?: number; r?: number }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill="var(--color-ink)" />
      <circle cx={cx - r / 3} cy={cy - r / 3} r={r / 3} fill="var(--color-card)" />
    </g>
  );
}

/** Joues roses. */
function Cheeks({ r = 4, y = 50 }: { r?: number; y?: number }) {
  return (
    <>
      <circle cx="24" cy={y} r={r} fill="var(--color-coral)" />
      <circle cx="76" cy={y} r={r} fill="var(--color-coral)" />
    </>
  );
}

/** Cœur centré sur (x, y). */
function heart(x: number, y: number) {
  return `M${x} ${y + 6} C${x - 9} ${y}, ${x - 7} ${y - 8}, ${x} ${y - 3.5} C${x + 7} ${y - 8}, ${x + 9} ${y}, ${x} ${y + 6} Z`;
}

/** Spirale (tête qui tourne) centrée sur (x, y). */
function spiral(x: number, y: number) {
  return `M${x} ${y} A1.5 1.5 0 0 1 ${x + 3} ${y} A3 3 0 0 1 ${x - 3} ${y} A4.5 4.5 0 0 1 ${x + 6} ${y} A6 6 0 0 1 ${x - 6} ${y}`;
}

export default function Mascot({ expression, size = 120 }: MascotProps) {
  // La mascotte : un petit robot à écran rond, seul personnage dessiné de l'app.
  // Ses couleurs viennent des jetons du thème (index.css).

  const renderFace = () => {
    switch (expression) {
      case "correct":
        return (
          <>
            {/* Joyful curved closed eyes */}
            <path
              d="M28 42 Q35 32 42 42"
              fill="none"
              stroke="var(--color-success-ink)"
              strokeWidth="5"
              strokeLinecap="round"
            />
            <path
              d="M58 42 Q65 32 72 42"
              fill="none"
              stroke="var(--color-success-ink)"
              strokeWidth="5"
              strokeLinecap="round"
            />
            {/* Gigantic open smile */}
            <path
              d="M38 58 Q50 72 62 58"
              fill="var(--color-brand)"
              stroke="var(--color-brand)"
              strokeWidth="4"
              strokeLinejoin="round"
            />
            {/* Blushing cheeks */}
            <circle cx="24" cy="50" r="5" fill="var(--color-coral)" opacity="0.8" />
            <circle cx="76" cy="50" r="5" fill="var(--color-coral)" opacity="0.8" />
          </>
        );
      case "incorrect":
        return (
          <>
            {/* Encouraging warm eyes */}
            <circle cx="35" cy="42" r="4" fill="var(--color-ink-2)" />
            <circle cx="65" cy="42" r="4" fill="var(--color-ink-2)" />
            {/* Tiny comforting mouth (small straight line or gentle curve) */}
            <path
              d="M44 56 Q50 60 56 56"
              fill="none"
              stroke="var(--color-ink-2)"
              strokeWidth="4"
              strokeLinecap="round"
            />
            {/* Sweat bead or tear of concentration on the side */}
            <path
              d="M75 35 Q74 42 70 44 Q74 46 76 40 Z"
              fill="var(--color-focus)"
              className="animate-pulse"
            />
          </>
        );
      case "thinking":
        return (
          <>
            {/* Curious eyes: one wide, one narrow, looking up */}
            <ellipse cx="33" cy="38" rx="5" ry="6" fill="var(--color-ink)" />
            <ellipse cx="63" cy="38" rx="5" ry="3" fill="var(--color-ink)" />
            {/* Wavy thinking mouth */}
            <path
              d="M44 56 Q50 50 56 56"
              fill="none"
              stroke="var(--color-ink)"
              strokeWidth="4.5"
              strokeLinecap="round"
            />
            {/* Blushing cheek */}
            <circle cx="22" cy="46" r="4" fill="var(--color-coral)" opacity="0.6" />
          </>
        );
      case "victory":
        return (
          <>
            {/* Des étoiles à la place des yeux */}
            <path
              d="M35 30 L37 36 L43 36 L38 40 L40 46 L35 42 L30 46 L32 40 L27 36 L33 36 Z"
              fill="var(--color-accent-deep)"
            />
            <path
              d="M65 30 L67 36 L73 36 L68 40 L70 46 L65 42 L60 46 L62 40 L57 36 L63 36 Z"
              fill="var(--color-accent-deep)"
            />
            {/* Animated laughter mouth */}
            <path
              d="M40 52 Q50 75 60 52 Z"
              fill="var(--color-danger)"
            />
            {/* Rosy cheeks */}
            <circle cx="22" cy="50" r="6" fill="var(--color-coral)" />
            <circle cx="78" cy="50" r="6" fill="var(--color-coral)" />
          </>
        );
      case "wink":
        return (
          <>
            {/* Clin d'œil */}
            <path d="M27 42 Q34 36 41 42" fill="none" stroke="var(--color-ink)" strokeWidth="4.5" strokeLinecap="round" />
            <Eye cx={66} />
            <path d="M39 55 Q50 68 61 55 Z" fill="var(--color-brand)" stroke="var(--color-brand)" strokeWidth="3" strokeLinejoin="round" />
            <Cheeks />
          </>
        );
      case "cool":
        return (
          <>
            {/* Lunettes de soleil, avec un reflet */}
            <rect x="23" y="35" width="23" height="13" rx="6" fill="var(--color-ink)" />
            <rect x="54" y="35" width="23" height="13" rx="6" fill="var(--color-ink)" />
            <path d="M46 39 H54" stroke="var(--color-ink)" strokeWidth="3" />
            <path d="M28 38 L32 38 M59 38 L63 38" stroke="var(--color-card)" strokeWidth="2" strokeLinecap="round" />
            {/* Sourire en coin */}
            <path d="M41 59 Q51 64 60 56" fill="none" stroke="var(--color-ink)" strokeWidth="4.5" strokeLinecap="round" />
          </>
        );
      case "wow":
        return (
          <>
            {/* Sourcils levés, grands yeux et bouche ronde */}
            <path d="M27 31 Q34 27 41 31 M59 31 Q66 27 73 31" fill="none" stroke="var(--color-ink)" strokeWidth="3.5" strokeLinecap="round" />
            <Eye cx={34} cy={41} r={7} />
            <Eye cx={66} cy={41} r={7} />
            <ellipse cx="50" cy="61" rx="5.5" ry="6.5" fill="var(--color-ink)" />
            <Cheeks r={3.5} y={52} />
          </>
        );
      case "love":
        return (
          <>
            {/* Des cœurs à la place des yeux */}
            <path d={heart(35, 41)} fill="var(--color-error)" />
            <path d={heart(65, 41)} fill="var(--color-error)" />
            <path d="M40 56 Q50 67 60 56" fill="none" stroke="var(--color-ink)" strokeWidth="4.5" strokeLinecap="round" />
            <Cheeks r={5} />
          </>
        );
      case "determined":
        return (
          <>
            {/* Sourcils froncés, regard décidé, petit sourire : on s'accroche */}
            <path d="M27 34 L40 36.5 M73 34 L60 36.5" stroke="var(--color-ink)" strokeWidth="3.5" strokeLinecap="round" />
            <Eye cx={34} cy={44} r={5} />
            <Eye cx={66} cy={44} r={5} />
            <path d="M41 57 Q50 65 59 57" fill="none" stroke="var(--color-ink)" strokeWidth="4.5" strokeLinecap="round" />
            <Cheeks r={3.5} y={52} />
          </>
        );
      case "dizzy":
        return (
          <>
            {/* Yeux en spirale et bouche en vague : le temps a filé */}
            <path d={spiral(35, 42)} fill="none" stroke="var(--color-ink)" strokeWidth="2.2" strokeLinecap="round" />
            <path d={spiral(66, 42)} fill="none" stroke="var(--color-ink)" strokeWidth="2.2" strokeLinecap="round" />
            <path d="M39 60 Q44.5 55 50 60 Q55.5 65 61 60" fill="none" stroke="var(--color-ink)" strokeWidth="4" strokeLinecap="round" />
          </>
        );
      case "laugh":
        return (
          <>
            {/* Yeux plissés de rire et grande bouche ouverte, avec la langue */}
            <path d="M28 36 L39 42 L28 48 M72 36 L61 42 L72 48" fill="none" stroke="var(--color-ink)" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M36 54 Q50 76 64 54 Z" fill="var(--color-danger)" stroke="var(--color-danger)" strokeWidth="3" strokeLinejoin="round" />
            <ellipse cx="50" cy="64" rx="6" ry="3.5" fill="var(--color-coral)" />
            <Cheeks r={5} y={51} />
          </>
        );
      case "silly":
        return (
          <>
            {/* Un œil plus grand que l'autre, et la langue tirée */}
            <Eye cx={34} cy={41} r={7} />
            <Eye cx={66} cy={42} r={4.5} />
            <path d="M46 58 Q46 70 51 70 Q56 70 56 58 Z" fill="var(--color-coral)" stroke="var(--color-danger)" strokeWidth="2" strokeLinejoin="round" />
            <path d="M51 60 V66" stroke="var(--color-danger)" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M39 56 Q50 62 61 56" fill="none" stroke="var(--color-ink)" strokeWidth="4.5" strokeLinecap="round" />
            <Cheeks />
          </>
        );
      case "starry":
        return (
          <>
            {/* Grands yeux brillants, émerveillés */}
            <circle cx="34" cy="42" r="8.5" fill="var(--color-ink)" />
            <circle cx="66" cy="42" r="8.5" fill="var(--color-ink)" />
            <circle cx="31" cy="39" r="3" fill="var(--color-card)" />
            <circle cx="63" cy="39" r="3" fill="var(--color-card)" />
            <circle cx="37" cy="45.5" r="1.4" fill="var(--color-card)" />
            <circle cx="69" cy="45.5" r="1.4" fill="var(--color-card)" />
            <path d="M42 58 Q50 67 58 58" fill="none" stroke="var(--color-ink)" strokeWidth="4.5" strokeLinecap="round" />
            <Cheeks r={4.5} y={53} />
          </>
        );
      case "proud":
        return (
          <>
            {/* Yeux fermés, contents, et petit sourire satisfait */}
            <path d="M27 40 Q34 47 41 40 M59 40 Q66 47 73 40" fill="none" stroke="var(--color-ink)" strokeWidth="4.5" strokeLinecap="round" />
            <path d="M42 57 Q52 64 61 55" fill="none" stroke="var(--color-ink)" strokeWidth="4.5" strokeLinecap="round" />
            <Cheeks r={4.5} />
          </>
        );
      case "pizza":
        return (
          <>
            {/* Yeux rieurs et bouche gourmande : la pizza arrive */}
            <path d="M28 43 Q35 34 42 43 M58 43 Q65 34 72 43" fill="none" stroke="var(--color-ink)" strokeWidth="4.5" strokeLinecap="round" />
            <path d="M39 54 Q50 70 61 54 Z" fill="var(--color-danger)" stroke="var(--color-danger)" strokeWidth="3" strokeLinejoin="round" />
            <path d="M58 61 Q61 66 63 61" fill="none" stroke="var(--color-focus)" strokeWidth="2.5" strokeLinecap="round" />
            <Cheeks r={5} />
          </>
        );
      case "neutral":
      default:
        return (
          <>
            {/* Friendly round eyes with highlights */}
            <g>
              <circle cx="34" cy="42" r="6" fill="var(--color-ink)" />
              <circle cx="32" cy="40" r="2" fill="var(--color-card)" />
            </g>
            <g>
              <circle cx="66" cy="42" r="6" fill="var(--color-ink)" />
              <circle cx="64" cy="40" r="2" fill="var(--color-card)" />
            </g>
            {/* Cheerful wide smile */}
            <path
              d="M40 56 Q50 66 60 56"
              fill="none"
              stroke="var(--color-ink)"
              strokeWidth="4.5"
              strokeLinecap="round"
            />
            {/* Small blushes */}
            <circle cx="24" cy="50" r="4" fill="var(--color-coral)" />
            <circle cx="76" cy="50" r="4" fill="var(--color-coral)" />
          </>
        );
    }
  };

  const animationVariants: Variants = {
    neutral: {
      y: [0, -4, 0],
      transition: { repeat: Infinity, duration: 3, ease: "easeInOut" }
    },
    correct: {
      y: [0, -20, 0],
      transition: { duration: 0.6, ease: "easeInOut" }
    },
    incorrect: {
      x: [0, -8, 8, -8, 8, 0],
      transition: { duration: 0.4 }
    },
    thinking: {
      rotate: [0, -3, 3, 0],
      transition: { repeat: Infinity, duration: 4, ease: "easeInOut" }
    },
    victory: {
      y: [0, -15, 0],
      transition: { repeat: Infinity, duration: 1.2, ease: "easeInOut" }
    },
    wink: {
      y: [0, -12, 0],
      rotate: [0, -4, 0],
      transition: { duration: 0.5, ease: "easeInOut" }
    },
    cool: {
      y: [0, -6, 0],
      rotate: [0, 3, 0],
      transition: { duration: 0.6, ease: "easeInOut" }
    },
    wow: {
      y: [0, -18, 0],
      transition: { duration: 0.45, ease: "easeOut" }
    },
    love: {
      y: [0, -8, 0],
      transition: { repeat: Infinity, duration: 1, ease: "easeInOut" }
    },
    determined: {
      y: [0, -3, 0],
      transition: { repeat: Infinity, duration: 2, ease: "easeInOut" }
    },
    dizzy: {
      rotate: [0, -8, 8, -5, 5, 0],
      transition: { duration: 0.9, ease: "easeInOut" }
    },
    laugh: {
      y: [0, -6, 0, -6, 0],
      rotate: [0, -5, 5, -5, 0],
      transition: { duration: 0.7, ease: "easeInOut" }
    },
    silly: {
      rotate: [0, 8, -4, 0],
      transition: { duration: 0.6, ease: "easeInOut" }
    },
    starry: {
      scale: [1, 1.1, 1],
      transition: { duration: 0.5, ease: "easeOut" }
    },
    proud: {
      y: [0, -6, -6, 0],
      rotate: [0, -6, -6, 0],
      transition: { duration: 1.1, ease: "easeInOut" }
    },
    pizza: {
      y: [0, -14, 0],
      rotate: [0, 4, 0],
      transition: { duration: 0.6, ease: "easeInOut" }
    }
  };

  // Les antennes s'agitent quand la mascotte est contente.
  const happy = ["correct", "victory", "wink", "wow", "love", "laugh", "silly", "starry", "proud", "pizza"].includes(expression);

  return (
    <div className="relative flex flex-col items-center justify-center">
      {/* Mascot Body */}
      <motion.svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        animate={expression}
        variants={animationVariants}
        className="filter drop-shadow-md overflow-visible"
      >
        {/* Couronne de la victoire, dessinée avec la mascotte (elle suit sa taille) */}
        {expression === "victory" && (
          <path
            d="M31 19 L27 3 L40 11 L50 -2 L60 11 L73 3 L69 19 Z"
            fill="var(--color-accent)"
            stroke="var(--color-accent-deep)"
            strokeWidth="3"
            strokeLinejoin="round"
          />
        )}

        {/* Ampoule : la mascotte réfléchit */}
        {expression === "thinking" && (
          <g className="animate-pulse-slow">
            <circle cx="88" cy="8" r="8" fill="var(--color-accent)" stroke="var(--color-accent-deep)" strokeWidth="2.5" />
            <path d="M84.5 18.5 H91.5 M85.5 22 H90.5" stroke="var(--color-accent-deep)" strokeWidth="2.5" strokeLinecap="round" />
          </g>
        )}

        {/* Une part de pizza qui flotte au-dessus de la tête */}
        {expression === "pizza" && (
          <g transform="rotate(-12 88 12)">
            <path d="M77 3 Q88 -1 99 3 L88 26 Z" fill="var(--color-accent)" stroke="var(--color-kraft)" strokeWidth="2" strokeLinejoin="round" />
            <path d="M76.5 2.5 Q88 -2.5 99.5 2.5" fill="none" stroke="var(--color-kraft)" strokeWidth="4.5" strokeLinecap="round" />
            <circle cx="84" cy="9" r="2.6" fill="var(--color-error)" />
            <circle cx="92" cy="10" r="2.3" fill="var(--color-error)" />
            <circle cx="88" cy="17" r="2" fill="var(--color-error)" />
          </g>
        )}

        {/* Cute antennas/ears */}
        <motion.circle
          cx="25"
          cy="20"
          r="6"
          fill="var(--color-mascot-soft)"
          animate={{
            y: happy ? [-2, 2, -2] : 0
          }}
          transition={{ repeat: Infinity, duration: 0.8 }}
        />
        <motion.circle
          cx="75"
          cy="20"
          r="6"
          fill="var(--color-mascot-soft)"
          animate={{
            y: happy ? [2, -2, 2] : 0
          }}
          transition={{ repeat: Infinity, duration: 0.8 }}
        />
        <line x1="25" y1="20" x2="35" y2="28" stroke="var(--color-mascot-soft)" strokeWidth="4" />
        <line x1="75" y1="20" x2="65" y2="28" stroke="var(--color-mascot-soft)" strokeWidth="4" />

        {/* Outer Round Head / Screen Box */}
        <rect
          x="12"
          y="22"
          width="76"
          height="66"
          rx="25"
          fill="var(--color-card)"
          stroke="var(--color-mascot)"
          strokeWidth="6"
        />

        {/* Inner face screen */}
        <rect
          x="18"
          y="28"
          width="64"
          height="54"
          rx="18"
          fill={screenColor(expression)}
          stroke="var(--color-mascot-soft)"
          strokeWidth="2"
        />

        {/* Dynamic Facials */}
        {renderFace()}

        {/* Cute decorative buttons at the bottom of the mascot */}
        <circle cx="50" cy="74" r="3" fill="var(--color-error)" />
        <circle cx="42" cy="74" r="2.5" fill="var(--color-mascot-soft)" />
        <circle cx="58" cy="74" r="2.5" fill="var(--color-accent)" />
      </motion.svg>
    </div>
  );
}

/** Couleur de l'écran du robot selon son humeur. */
function screenColor(expr: MascotExpression) {
  switch (expr) {
    case "correct":
    case "wink":
    case "laugh":
    case "silly":
    case "proud":
      return "var(--color-success-wash)";
    case "incorrect":
    case "dizzy":
      return "var(--color-error-wash)";
    case "thinking":
    case "determined":
      return "var(--color-info-soft)";
    case "victory":
    case "wow":
    case "cool":
    case "love":
    case "starry":
    case "pizza":
      return "var(--color-sun-soft)";
    default:
      return "var(--color-card)";
  }
}
