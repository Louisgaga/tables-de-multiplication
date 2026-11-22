import { ReactNode, useMemo } from "react";
import { AVATARS } from "../utils/profiles";
import { Medal as MedalKind, MEDAL_LABEL } from "../utils/stats";

/**
 * Le papier découpé du thème Hum : feuilles au bord déchiré, médailles et pastilles de profil.
 * Rien n'est une image : les déchirures sont des polygones tirés d'un bruit à graine fixe,
 * donc identiques d'un affichage à l'autre.
 */

/** Générateur pseudo-aléatoire à graine (mulberry32). */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Profondeurs (en px) d'une déchirure le long d'un bord : une ondulation lente et un grain fin. */
function tear(seed: number, depth: number, steps: number): number[] {
  const rand = rng(seed);
  const knots = Array.from({ length: Math.ceil(steps / 5) + 2 }, () => rand());
  return Array.from({ length: steps + 1 }, (_, i) => {
    const pos = i / 5;
    const k = Math.floor(pos);
    const f = pos - k;
    const slow = knots[k] * (1 - f) + knots[k + 1] * f;
    return Math.round((slow * 0.6 + rand() * 0.4) * depth * 10) / 10;
  });
}

export type Tear = "none" | "bottom" | "top" | "both";

/** Polygone de découpe : `extra` px de plus pour le cœur pâle qui dépasse sous la feuille. */
function tornPath(seed: number, side: Tear, depth: number, extra: number): string | undefined {
  if (side === "none") return undefined;
  const steps = 40;
  const pts: string[] = [];
  if (side === "top" || side === "both") {
    const top = tear(seed, depth, steps);
    top.forEach((d, i) => pts.push(`${(i / steps) * 100}% ${Math.max(0, d - extra)}px`));
  } else {
    pts.push("0 0", "100% 0");
  }
  if (side === "bottom" || side === "both") {
    const bottom = tear(seed + 101, depth, steps);
    for (let i = steps; i >= 0; i--) {
      pts.push(`${(i / steps) * 100}% calc(100% - ${Math.max(0, bottom[i] - extra)}px)`);
    }
  } else {
    pts.push("100% 100%", "0 100%");
  }
  return `polygon(${pts.join(", ")})`;
}

export type Tone = "card" | "pear" | "strip" | "kraft" | "ink" | "sugar" | "coral" | "mint" | "mintSoft" | "coralSoft";

const TONES: Record<Tone, string> = {
  card: "bg-card",
  pear: "bg-accent",
  strip: "bg-strip",
  kraft: "bg-kraft",
  ink: "bg-ink",
  sugar: "bg-sugar",
  coral: "bg-error",
  mint: "bg-success",
  mintSoft: "bg-success-soft",
  coralSoft: "bg-error-soft",
};

interface SheetProps {
  /** Le papier : carte crème, poire (un seul par écran), bande kraft claire, encre, papier sucre... */
  tone?: Tone;
  /** Bords déchirés. Les autres bords gardent leurs coins arrondis. */
  torn?: Tear;
  /** Graine de la déchirure : deux feuilles voisines prennent deux graines différentes. */
  seed?: number;
  /** Arrondi des coins (classe Tailwind). */
  radius?: string;
  /** Sans ombre portée (feuille posée dans une autre). */
  flat?: boolean;
  className?: string;
  id?: string;
  children?: ReactNode;
}

/**
 * Feuille de papier découpée. Le fond est fait de deux couches : le cœur pâle de la déchirure,
 * et la feuille elle-même, un peu en retrait. L'ombre ne porte que sur ces couches, pas sur
 * le contenu : les boutons posés dessus s'animent sans la redessiner.
 */
export function Sheet({
  tone = "card",
  torn = "bottom",
  seed = 1,
  radius = "rounded-[28px]",
  flat = false,
  className = "",
  id,
  children,
}: SheetProps) {
  const [fill, fringe] = useMemo(() => [tornPath(seed, torn, 7, 0), tornPath(seed, torn, 7, 2.5)], [seed, torn]);
  return (
    <div className={`relative isolate ${className}`} id={id}>
      <span
        aria-hidden="true"
        className="absolute inset-0 -z-10 pointer-events-none"
        style={flat ? undefined : { filter: "var(--shadow-paper)" }}
      >
        {torn !== "none" && <i className={`absolute inset-0 bg-fringe ${radius}`} style={{ clipPath: fringe }} />}
        <i className={`absolute inset-0 stock transition-colors duration-300 ${TONES[tone]} ${radius}`} style={{ clipPath: fill }} />
      </span>
      {children}
    </div>
  );
}

const MEDAL_TONE: Record<Exclude<MedalKind, "none">, string> = {
  bronze: "bg-bronze",
  silver: "bg-silver",
  gold: "bg-gold",
};

/**
 * Médaille : une pastille de papier découpée (bronze, argent ou or), avec son liseré blanc.
 * Sans médaille : un rond en pointillés, la place de la future médaille.
 */
export function Medal({
  medal,
  size = 22,
  label = false,
  className = "",
}: {
  medal: MedalKind;
  size?: number;
  /** Lue par les lecteurs d'écran ; sinon la pastille est décorative. */
  label?: boolean;
  className?: string;
}) {
  const a11y = label ? { role: "img", "aria-label": MEDAL_LABEL[medal] } : { "aria-hidden": true as const };
  if (medal === "none") {
    return (
      <span
        {...a11y}
        className={`inline-block shrink-0 rounded-full border-2 border-dashed border-edge ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      {...a11y}
      className={`inline-block shrink-0 rounded-full stock border-2 border-fringe shadow-coin ${MEDAL_TONE[medal]} ${className}`}
      style={{ width: size, height: size }}
    />
  );
}

/** Une couleur de papier par pastille de profil, dans l'ordre de AVATARS. */
export const AVATAR_TONES: { name: string; className: string }[] = [
  { name: "corail", className: "bg-error text-ink" },
  { name: "encre", className: "bg-ink text-paper" },
  { name: "sable", className: "bg-sand text-ink" },
  { name: "poire", className: "bg-accent text-ink" },
  { name: "menthe", className: "bg-success text-ink" },
  { name: "kraft", className: "bg-kraft text-ink" },
  { name: "bleu", className: "bg-focus text-white" },
  { name: "ciel", className: "bg-sugar text-ink" },
  { name: "rose", className: "bg-coral text-ink" },
  { name: "feuille", className: "bg-leaf text-ink" },
  { name: "nuit", className: "bg-ink-2 text-accent" },
  { name: "rouge", className: "bg-danger text-white" },
];

/** Couleur de la pastille d'un profil (la valeur enregistrée reste celle de AVATARS). */
export function avatarTone(avatar: string) {
  const index = (AVATARS as readonly string[]).indexOf(avatar);
  return AVATAR_TONES[index >= 0 ? index : 0];
}

/**
 * Pastille de profil : un rond de papier de couleur, avec l'initiale de l'enfant.
 * Sans prénom (choix de la couleur), la pastille est vide.
 */
export function Avatar({
  avatar,
  name = "",
  size = 40,
  className = "",
}: {
  avatar: string;
  name?: string;
  size?: number;
  className?: string;
}) {
  const initial = name.trim().charAt(0).toUpperCase();
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-full stock border-2 border-fringe font-black leading-none shadow-cut ${avatarTone(avatar).className} ${className}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.48) }}
    >
      {initial}
    </span>
  );
}
