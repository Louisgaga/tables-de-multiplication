/**
 * Chronomètres de l'écran de jeu. Chacun se redessine seul, dix fois par seconde,
 * sans redessiner tout l'écran. Les durées sont lues sur l'horloge réelle : pas de
 * dérive, même si l'iPad est un peu lent.
 */
import { useEffect, useState } from "react";
import { formatSeconds } from "../utils/report";

/** Redessine le composant à intervalle régulier tant que `running` est vrai. */
function useTicker(running: boolean, intervalMs = 100) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setTick((t) => t + 1), intervalMs);
    return () => clearInterval(id);
  }, [running, intervalMs]);
}

interface ClockProps {
  /** Début du calcul en cours (ms). */
  startedAt: number;
  /** Moment de la réponse (ms) ; null tant que l'enfant n'a pas répondu. */
  stoppedAt: number | null;
}

function elapsedSeconds({ startedAt, stoppedAt }: ClockProps): number {
  return Math.max(0, ((stoppedAt ?? Date.now()) - startedAt) / 1000);
}

/** Temps écoulé sur le calcul en cours (mode Entraînement). */
export function ElapsedPill({ startedAt, stoppedAt, label }: ClockProps & { label: string }) {
  useTicker(stoppedAt === null);
  return (
    <span className="h-11 px-3 flex items-center gap-2 rounded-full bg-paper-3 text-ink font-black text-sm tabular-nums whitespace-nowrap">
      <span className="hidden sm:inline phone-land:hidden font-bold text-muted">{label}</span>
      <Time seconds={elapsedSeconds({ startedAt, stoppedAt })} />
    </span>
  );
}

/**
 * Le temps, dans une case de largeur fixe : passer de 9,9 s à 10,0 s n'élargit pas la pastille,
 * donc le compteur de calculs, centré en haut de l'écran, ne bouge pas.
 */
function Time({ seconds }: { seconds: number }) {
  return <span className="inline-block min-w-[5ch] text-right">{formatSeconds(seconds)}</span>;
}

function secondsLeft(props: ClockProps, limit: number): number {
  return Math.max(0, limit - elapsedSeconds(props));
}

/** Temps restant sur le calcul en cours (mode Évaluation). */
export function ChallengePill({ startedAt, stoppedAt, limit }: ClockProps & { limit: number }) {
  useTicker(stoppedAt === null);
  const left = secondsLeft({ startedAt, stoppedAt }, limit);
  const urgent = left <= 2;
  return (
    <span
      className={`h-11 px-3 flex items-center gap-2 rounded-full font-black text-sm text-ink transition-colors tabular-nums whitespace-nowrap ${
        urgent ? "bg-error animate-pulse" : "bg-paper-3"
      }`}
    >
      <span className={`hidden sm:inline phone-land:hidden font-bold ${urgent ? "" : "text-muted"}`}>Évaluation</span>
      <Time seconds={left} />
    </span>
  );
}

/** Barre du temps restant (mode Évaluation). */
export function ChallengeBar({ startedAt, stoppedAt, limit }: ClockProps & { limit: number }) {
  useTicker(stoppedAt === null);
  const left = secondsLeft({ startedAt, stoppedAt }, limit);
  return (
    // Barre pleine réduite par transform (pas d'animation de largeur).
    <div
      className="h-full w-full origin-left bg-error transition-transform duration-100 ease-linear"
      style={{ transform: `scaleX(${left / limit})` }}
    />
  );
}
