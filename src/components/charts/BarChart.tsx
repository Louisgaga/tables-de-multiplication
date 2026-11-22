import { KeyboardEvent, PointerEvent, useEffect, useState } from "react";
import {
  AXIS_FONT_SIZE,
  CHART,
  ChartPoint,
  defaultIndex,
  labelIndices,
  niceTicks,
  useElementWidth,
} from "./chartUtils";

interface BarChartProps {
  /** Titre du graphique (aussi utilisé pour l'accessibilité). */
  title: string;
  points: ChartPoint[];
  /** Mise en forme d'une valeur dans la lecture : « 42 calculs ». */
  formatValue: (value: number) => string;
  height?: number;
  id?: string;
}

const PAD = { top: 10, right: 6, bottom: 28, left: 40 };
const MAX_BAR = 24;
const RADIUS = 4;

/** La série neutre du rapport : des barres à l'encre, posées à même la feuille. */
const SERIES = "var(--color-ink)";

/** Barre aux coins supérieurs arrondis, base carrée sur l'axe. */
function barPath(x: number, y: number, w: number, h: number): string {
  const r = Math.min(RADIUS, w / 2, h);
  return [
    `M${x},${y + h}`,
    `V${y + r}`,
    `Q${x},${y} ${x + r},${y}`,
    `H${x + w - r}`,
    `Q${x + w},${y} ${x + w},${y + r}`,
    `V${y + h}`,
    "Z",
  ].join(" ");
}

export default function BarChart({ title, points, formatValue, height = 190, id }: BarChartProps) {
  const { ref, width } = useElementWidth<HTMLDivElement>();
  const [selected, setSelected] = useState(() => defaultIndex(points));

  // Nouvelle période : on revient sur le dernier point.
  useEffect(() => setSelected(defaultIndex(points)), [points]);

  const values = points.map((p) => p.value ?? 0);
  const ticks = niceTicks(Math.max(...values, 0));
  const top = ticks[ticks.length - 1];
  const plotW = Math.max(width - PAD.left - PAD.right, 10);
  const plotH = height - PAD.top - PAD.bottom;
  const slot = plotW / Math.max(points.length, 1);
  const barW = Math.min(MAX_BAR, slot * 0.7);
  const y = (v: number) => PAD.top + plotH - (v / top) * plotH;
  const shownLabels = labelIndices(points.length, slot);

  const pick = (clientX: number, target: SVGSVGElement) => {
    const rect = target.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * width - PAD.left;
    setSelected(Math.min(points.length - 1, Math.max(0, Math.floor(x / slot))));
  };
  const onPointer = (e: PointerEvent<SVGSVGElement>) => pick(e.clientX, e.currentTarget);
  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key === "ArrowLeft") setSelected((i) => Math.max(0, i - 1));
    if (e.key === "ArrowRight") setSelected((i) => Math.min(points.length - 1, i + 1));
  };

  const current = points[selected];

  return (
    <figure className="m-0 min-w-0" id={id}>
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-3 mb-1">
        <span className="text-sm font-black text-ink">{title}</span>
        {current && (
          <span className="text-sm text-muted font-bold" aria-live="polite">
            <span className="text-base font-black text-ink tabular-nums">{formatValue(current.value ?? 0)}</span>
            {" · "}
            {current.label}
          </span>
        )}
      </figcaption>
      <div ref={ref} className="w-full min-w-0">
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={`${title}. Touche une barre pour voir sa valeur.`}
          tabIndex={0}
          onPointerDown={onPointer}
          onPointerMove={(e) => e.buttons > 0 && onPointer(e)}
          onKeyDown={onKey}
          className="block touch-pan-y rounded-xl cursor-pointer"
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke={CHART.grid} strokeWidth={1} />
              <text
                x={PAD.left - 8}
                y={y(t)}
                textAnchor="end"
                dominantBaseline="middle"
                fontSize={AXIS_FONT_SIZE}
                fill={CHART.axisText}
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {t}
              </text>
            </g>
          ))}

          {/* Repère de la barre sélectionnée */}
          {current && (
            <rect
              x={PAD.left + selected * slot}
              y={PAD.top}
              width={slot}
              height={plotH}
              fill={SERIES}
              opacity={0.07}
              rx={4}
            />
          )}

          {points.map((p, i) => {
            const v = p.value ?? 0;
            if (v <= 0) return null;
            const h = Math.max(plotH - (y(v) - PAD.top), 1);
            const x = PAD.left + i * slot + (slot - barW) / 2;
            return (
              <path
                key={i}
                d={barPath(x, y(v), barW, h)}
                fill={SERIES}
              />
            );
          })}

          {points.map((p, i) =>
            shownLabels.has(i) ? (
              <text
                key={i}
                x={PAD.left + i * slot + slot / 2}
                y={height - 8}
                textAnchor="middle"
                fontSize={AXIS_FONT_SIZE}
                fill={i === selected ? "var(--color-ink)" : CHART.axisText}
                fontWeight={i === selected ? 600 : 500}
              >
                {p.shortLabel}
              </text>
            ) : null
          )}
        </svg>
      </div>

      <table className="sr-only">
        <caption>{title}</caption>
        <tbody>
          {points.map((p, i) => (
            <tr key={i}>
              <th scope="row">{p.label}</th>
              <td>{formatValue(p.value ?? 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
