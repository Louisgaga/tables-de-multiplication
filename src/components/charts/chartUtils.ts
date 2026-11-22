import { useEffect, useRef, useState } from "react";

export interface ChartPoint {
  /** Libellé complet, affiché quand le point est sélectionné. */
  label: string;
  /** Libellé court, sous l'axe. */
  shortLabel: string;
  value: number | null;
}

/** Couleurs partagées des graphiques : grille, textes des axes et repère du point choisi. */
export const CHART = {
  grid: "var(--color-grid)",
  axisText: "var(--color-muted)",
  crosshair: "var(--color-line-strong)",
};

export const AXIS_FONT_SIZE = 13;

/** Largeur d'un élément, mise à jour quand il change de taille (rotation de l'iPad). */
export function useElementWidth<T extends HTMLElement>(fallback = 600) {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth || fallback);
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setWidth(w);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [fallback]);
  return { ref, width };
}

/** Graduations « rondes » de 0 à au moins `max` : pas de 1, 2 ou 5 × 10ⁿ, environ 4 intervalles. */
export function niceTicks(max: number, target = 4): number[] {
  if (!(max > 0)) return [0, 1];
  const rough = max / target;
  const power = Math.pow(10, Math.floor(Math.log10(rough)));
  const step = [1, 2, 5, 10].map((m) => m * power).find((s) => s >= rough) ?? 10 * power;
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top + step / 2; v += step) ticks.push(Number(v.toFixed(6)));
  return ticks;
}

/** Indices des libellés à afficher sous l'axe, sans chevauchement, le dernier toujours visible. */
export function labelIndices(count: number, slot: number, minSpacing = 40): Set<number> {
  const step = Math.max(1, Math.ceil(minSpacing / Math.max(slot, 1)));
  const shown = new Set<number>();
  for (let i = count - 1; i >= 0; i -= step) shown.add(i);
  return shown;
}

/** Index par défaut : le dernier point qui a une valeur, sinon le dernier. */
export function defaultIndex(points: ChartPoint[]): number {
  for (let i = points.length - 1; i >= 0; i--) {
    if (points[i].value !== null && points[i].value !== 0) return i;
  }
  return Math.max(0, points.length - 1);
}
