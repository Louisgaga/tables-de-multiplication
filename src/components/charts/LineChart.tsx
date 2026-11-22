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

interface LineChartProps {
  title: string;
  points: ChartPoint[];
  /** Mise en forme d'une valeur dans la lecture. */
  formatValue: (value: number) => string;
  /** Mise en forme courte des graduations. */
  formatTick?: (value: number) => string;
  /** Graduations imposées (par exemple 0 à 100 pour un pourcentage). */
  ticks?: number[];
  /** Texte affiché pour un point sans donnée. */
  emptyLabel?: string;
  height?: number;
  id?: string;
}

const PAD = { top: 12, right: 14, bottom: 28, left: 44 };

/** La courbe des progrès : menthe foncée, un voile de menthe dessous. */
const LINE = "var(--color-success-ink)";
const AREA = "var(--color-success)";
/** Le point choisi passe à l'encre ; chaque point est cerné du papier de la feuille. */
const PICKED = "var(--color-ink)";
const SHEET = "var(--color-card)";

export default function LineChart({
  title,
  points,
  formatValue,
  formatTick = (v) => String(v),
  ticks: fixedTicks,
  emptyLabel = "Pas de partie",
  height = 190,
  id,
}: LineChartProps) {
  const { ref, width } = useElementWidth<HTMLDivElement>();
  const [selected, setSelected] = useState(() => defaultIndex(points));
  useEffect(() => setSelected(defaultIndex(points)), [points]);

  const values = points.map((p) => p.value).filter((v): v is number => v !== null);
  const ticks = fixedTicks ?? niceTicks(Math.max(...values, 0));
  const lo = ticks[0];
  const hi = ticks[ticks.length - 1];
  const plotW = Math.max(width - PAD.left - PAD.right, 10);
  const plotH = height - PAD.top - PAD.bottom;
  const slot = plotW / Math.max(points.length, 1);
  const x = (i: number) => PAD.left + slot * i + slot / 2;
  const y = (v: number) => PAD.top + plotH - ((v - lo) / (hi - lo || 1)) * plotH;
  const shownLabels = labelIndices(points.length, slot);

  // Segments continus : une absence de donnée coupe la courbe au lieu d'inventer une valeur.
  const segments: { i: number; v: number }[][] = [];
  let run: { i: number; v: number }[] = [];
  points.forEach((p, i) => {
    if (p.value === null) {
      if (run.length) segments.push(run);
      run = [];
    } else {
      run.push({ i, v: p.value });
    }
  });
  if (run.length) segments.push(run);

  const pick = (clientX: number, target: SVGSVGElement) => {
    const rect = target.getBoundingClientRect();
    const px = ((clientX - rect.left) / rect.width) * width - PAD.left;
    setSelected(Math.min(points.length - 1, Math.max(0, Math.floor(px / slot))));
  };
  const onPointer = (e: PointerEvent<SVGSVGElement>) => pick(e.clientX, e.currentTarget);
  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key === "ArrowLeft") setSelected((i) => Math.max(0, i - 1));
    if (e.key === "ArrowRight") setSelected((i) => Math.min(points.length - 1, i + 1));
  };

  const current = points[selected];
  const showMarkers = points.length <= 31;

  return (
    <figure className="m-0 min-w-0" id={id}>
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-3 mb-1">
        <span className="text-sm font-black text-ink">{title}</span>
        {current && (
          <span className="text-sm text-muted font-bold" aria-live="polite">
            <span className="text-base font-black text-ink tabular-nums">
              {current.value === null ? emptyLabel : formatValue(current.value)}
            </span>
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
          aria-label={`${title}. Touche la courbe pour voir une valeur.`}
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
                {formatTick(t)}
              </text>
            </g>
          ))}

          {/* Repère vertical sur le point sélectionné */}
          {current && (
            <line
              x1={x(selected)}
              x2={x(selected)}
              y1={PAD.top}
              y2={PAD.top + plotH}
              stroke={CHART.crosshair}
              strokeWidth={1}
            />
          )}

          {segments.map((seg, s) => {
            const line = seg.map((p, k) => `${k === 0 ? "M" : "L"}${x(p.i)},${y(p.v)}`).join(" ");
            const area =
              seg.length > 1
                ? `${line} L${x(seg[seg.length - 1].i)},${y(lo)} L${x(seg[0].i)},${y(lo)} Z`
                : null;
            return (
              <g key={s}>
                {area && <path d={area} fill={AREA} opacity={0.2} />}
                <path
                  d={line}
                  fill="none"
                  stroke={LINE}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              </g>
            );
          })}

          {points.map((p, i) => {
            if (p.value === null) return null;
            const isSelected = i === selected;
            if (!showMarkers && !isSelected) return null;
            return (
              <circle
                key={i}
                cx={x(i)}
                cy={y(p.value)}
                r={isSelected ? 6 : 4}
                fill={isSelected ? PICKED : LINE}
                stroke={SHEET}
                strokeWidth={2}
              />
            );
          })}

          {points.map((p, i) =>
            shownLabels.has(i) ? (
              <text
                key={i}
                x={x(i)}
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
              <td>{p.value === null ? emptyLabel : formatValue(p.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
