import { ReactNode, useMemo, useState } from "react";
import { GameMode, HighScore, OperationResponse } from "../types";
import { X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { playSound } from "../utils/audio";
import {
  FactStatus,
  isMissingFactorAnswer,
  MEDAL_LABEL,
  TOTAL_CALCULATIONS,
  computeFactMastery,
  factStatus,
} from "../utils/stats";
import {
  Period,
  PERIOD_LABEL,
  TrendMetric,
  accuracySummary,
  activitySeries,
  activityUnit,
  currentStreak,
  earliestDate,
  formatDuration,
  formatSeconds,
  makeBuckets,
  masteredCountAt,
  periodRanges,
  recentAttempts,
  sessionLog,
  sessionSeconds,
  tableProgress,
  trendSeries,
  trendUnit,
  usageSummary,
} from "../utils/report";
import BarChart from "./charts/BarChart";
import LineChart from "./charts/LineChart";
import { ChartPoint } from "./charts/chartUtils";
import { Medal, Sheet } from "./paper";

interface ReportProps {
  responses: OperationResponse[];
  scores: HighScore[];
  onBack: () => void;
  /**
   * Remise à zéro (tout effacer). Seulement pour l'invité : pour un enfant d'un compte, elle se
   * fait dans « Gérer les profils », hors de portée d'un clic par erreur.
   */
  onReset?: () => Promise<void>;
  /** Date du jour (modifiable pour les tests). */
  now?: Date;
  /** Titre de la page, « Mon rapport d’apprentissage » par défaut. */
  title?: string;
}

const PERIODS: Period[] = ["7d", "30d", "90d", "all"];

const PREVIOUS_LABEL: Record<Exclude<Period, "all">, string> = {
  "7d": "vs les 7 jours d’avant",
  "30d": "vs les 30 jours d’avant",
  "90d": "vs les 3 mois d’avant",
};

const METRICS: { key: TrendMetric; label: string; title: string }[] = [
  { key: "rate", label: "Réussite", title: "Réussite" },
  { key: "speed", label: "Vitesse", title: "Temps moyen d’une bonne réponse" },
  { key: "mastered", label: "Maîtrise", title: "Calculs maîtrisés" },
];

const MODE_LABEL: Record<GameMode, string> = {
  [GameMode.FREE]: "Libre",
  [GameMode.TIMED]: "Entraînement",
  [GameMode.CHALLENGE]: "Évaluation",
};

/**
 * Les couleurs de la grille « Où en es-tu ? », reprises par les demi-cases de « Par table ».
 * Des aplats, du vert foncé (maîtrisé) au corail (à revoir) : ils restent lisibles même
 * sur une demi-case de quelques pixels. Dans la grille, un signe double la couleur.
 */
const STATUS_STYLE: Record<
  FactStatus,
  { cell: string; bar: string; icon: string; label: string; swatch: string; definition: string }
> = {
  mastered: {
    cell: "bg-success-ink text-white",
    bar: "bg-success-ink",
    icon: "★",
    label: "Maîtrisé",
    swatch: "bg-success-ink text-white",
    definition: "les 3 dernières réponses sont justes et rapides (10 secondes en moyenne au plus).",
  },
  progress: {
    cell: "bg-success text-ink",
    bar: "bg-success",
    icon: "✓",
    label: "En bonne voie",
    swatch: "bg-success text-ink",
    definition: "aucune erreur dans les 3 dernières réponses, mais pas encore assez de réponses justes et rapides pour le maîtriser.",
  },
  working: {
    cell: "bg-warn text-ink",
    bar: "bg-warn",
    icon: "~",
    label: "On travaille",
    swatch: "bg-warn text-ink",
    definition: "la dernière réponse est juste, mais il y a eu une erreur dans les 3 dernières.",
  },
  review: {
    cell: "bg-error text-ink",
    bar: "bg-error",
    icon: "!",
    label: "À revoir",
    swatch: "bg-error text-ink",
    definition: "la dernière réponse était fausse, ou le temps s’est écoulé.",
  },
  new: {
    cell: "bg-well text-muted",
    bar: "bg-well-strong",
    icon: "",
    label: "Pas encore vu",
    swatch: "bg-well border-2 border-line",
    definition: "jamais posé en Entraînement ni en Évaluation.",
  },
};

const DATE_TIME = new Intl.DateTimeFormat("fr-FR", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});
const SHORT_DATE = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short" });

function percent(value: number): string {
  return `${Math.round(value)} %`;
}

// ---------------------------------------------------------------------------
// Petits composants
// ---------------------------------------------------------------------------

/**
 * Une section du rapport : sa propre feuille, posée sur le papier de la page. La première
 * (`lead`) a le bord du bas déchiré ; les autres sont des feuilles à plat.
 */
function Section({ title, aside, children, className = "", id, lead = false }: {
  title: string;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
  lead?: boolean;
}) {
  const content = (
    <>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h3 className="text-xl md:text-2xl font-black text-ink">{title}</h3>
        {aside}
      </div>
      {children}
    </>
  );
  // min-w-0 : sinon un graphique encore à sa largeur par défaut (600 px) élargit la section
  // au-delà de l'écran d'un téléphone.
  if (lead) {
    return (
      <section className={`min-w-0 flex ${className}`} id={id}>
        <Sheet
          tone="card"
          torn="bottom"
          seed={4}
          className="min-w-0 flex-1 flex flex-col gap-4 px-4 pt-4 pb-7 sm:px-5 sm:pt-5 md:px-6 md:pt-6 md:pb-8"
        >
          {content}
        </Sheet>
      </section>
    );
  }
  return (
    <section className={`sheet min-w-0 flex flex-col gap-4 p-4 sm:p-5 md:p-6 ${className}`} id={id}>
      {content}
    </section>
  );
}

/** Un chiffre du rapport : le chiffre en grand, son libellé dessous, puis l'écart s'il y en a un. */
function Figure({ label, value, delta, className = "" }: {
  label: string;
  value: ReactNode;
  delta?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`min-w-0 flex flex-col gap-1 ${className}`}>
      <dt className="order-2 text-sm font-bold text-muted leading-snug">{label}</dt>
      <dd className="order-1 text-3xl wide:text-4xl font-black text-ink leading-none tabular-nums whitespace-nowrap">
        {value}
      </dd>
      {delta && <dd className="order-3 leading-snug">{delta}</dd>}
    </div>
  );
}

/**
 * Écart avec la période précédente. La couleur dit si c'est une bonne nouvelle :
 * plus de réussite, c'est bien ; plus de temps de réponse, c'est moins bien.
 */
function Delta({ diff, format, upIsGood, caption }: {
  diff: number | null;
  format: (v: number) => string;
  upIsGood: boolean;
  caption: string;
}) {
  if (diff === null) {
    return <span className="text-xs font-bold text-muted">Pas de comparaison possible</span>;
  }
  const flat = Math.abs(diff) < 0.05;
  const good = flat ? null : diff > 0 === upIsGood;
  const color = good === null ? "text-muted" : good ? "text-success-ink" : "text-error-ink";
  const sign = flat ? "=" : diff > 0 ? "▲ +" : "▼ −";
  return (
    <span className={`text-xs font-black ${color}`}>
      {sign}
      {flat ? "" : format(Math.abs(diff))} <span className="font-bold text-muted">{caption}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Rapport
// ---------------------------------------------------------------------------

export default function Report({ responses, scores, onBack, onReset, now: nowProp, title }: ReportProps) {
  const [period, setPeriod] = useState<Period>("30d");
  const [metric, setMetric] = useState<TrendMetric>("rate");
  const [selectedFact, setSelectedFact] = useState<{ a: number; b: number } | null>(null);
  const [showWipeConfirm, setShowWipeConfirm] = useState(false);
  const [showAllSessions, setShowAllSessions] = useState(false);

  // La date du jour est figée à l'ouverture du rapport.
  const [now] = useState(() => nowProp ?? new Date());

  const ranges = useMemo(
    () => periodRanges(period, now, earliestDate(responses, scores)),
    [period, now, responses, scores]
  );
  const { current, previous } = ranges;

  const usage = useMemo(() => usageSummary(scores, current), [scores, current]);
  const streak = useMemo(() => currentStreak(scores, now), [scores, now]);

  const activityPoints = useMemo<ChartPoint[]>(() => {
    const buckets = makeBuckets(current, activityUnit(period, current));
    const values = activitySeries(scores, buckets);
    return buckets.map((b, i) => ({ label: b.label, shortLabel: b.shortLabel, value: values[i] }));
  }, [scores, current, period]);
  const activityTitle =
    activityUnit(period, current) === "day"
      ? "Calculs par jour"
      : activityUnit(period, current) === "week"
      ? "Calculs par semaine"
      : "Calculs par mois";

  const accuracy = useMemo(() => accuracySummary(responses, current), [responses, current]);
  const accuracyBefore = useMemo(
    () => (previous ? accuracySummary(responses, previous) : null),
    [responses, previous]
  );
  const masteredNow = useMemo(() => masteredCountAt(responses, current.end), [responses, current]);
  const masteredAtStart = useMemo(() => masteredCountAt(responses, current.start), [responses, current]);

  const trendPoints = useMemo<ChartPoint[]>(() => {
    const buckets = makeBuckets(current, trendUnit(period, current));
    const values = trendSeries(responses, buckets, metric);
    return buckets.map((b, i) => ({ label: b.label, shortLabel: b.shortLabel, value: values[i] }));
  }, [responses, current, period, metric]);

  const tables = useMemo(() => tableProgress(responses, current), [responses, current]);
  const mastery = useMemo(() => computeFactMastery(responses), [responses]);
  const sessions = useMemo(() => sessionLog(scores, current), [scores, current]);

  const comparable = previous !== null;
  const caption = previous ? PREVIOUS_LABEL[period as Exclude<Period, "all">] : "";
  const rateDiff =
    comparable && accuracy.rate !== null && accuracyBefore?.rate != null ? accuracy.rate - accuracyBefore.rate : null;
  const speedDiff =
    comparable && accuracy.meanTime !== null && accuracyBefore?.meanTime != null
      ? accuracy.meanTime - accuracyBefore.meanTime
      : null;

  const metricInfo = METRICS.find((m) => m.key === metric)!;
  const selectedAttempts = selectedFact ? recentAttempts(responses, selectedFact.a, selectedFact.b) : [];
  const selectedStatus = selectedFact ? factStatus(mastery, selectedFact.a, selectedFact.b) : null;

  const isEmpty = responses.length === 0 && scores.length === 0;

  const choosePeriod = (p: Period) => {
    playSound.click();
    setPeriod(p);
    setShowAllSessions(false);
  };

  const confirmWipe = async () => {
    playSound.click();
    await onReset?.();
    setSelectedFact(null);
    setShowWipeConfirm(false);
  };

  return (
    <div className="w-full min-w-0 mx-auto" id="report-view">
      {/* En-tête, à même le papier. Sur téléphone, le titre passe sous les deux boutons. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-4 max-sm:mb-3">
        <button
          onClick={() => {
            playSound.click();
            onBack();
          }}
          className="btn h-11 px-4 text-sm shrink-0"
          id="btn-report-back"
        >
          Retour
        </button>

        <h2 className="min-w-0 flex-1 text-2xl md:text-3xl font-black text-ink max-sm:order-last max-sm:basis-full">
          {title ?? "Mon rapport d’apprentissage"}
        </h2>

        {onReset && (
          <button
            onClick={() => {
              playSound.click();
              setShowWipeConfirm(true);
            }}
            disabled={responses.length === 0 && scores.length === 0}
            className="btn h-11 px-4 text-sm text-error-ink shrink-0 max-sm:ml-auto"
            id="btn-report-clear"
          >
            Réinitialiser
          </button>
        )}
      </div>

      {isEmpty ? (
        <Sheet tone="card" torn="bottom" seed={9} className="px-6 pt-10 pb-12 text-center" id="report-empty-state">
          <h3 className="text-2xl font-black text-ink mb-2">Aucune donnée pour l’instant !</h3>
          <p className="text-muted text-base max-w-md mx-auto leading-relaxed">
            Lance une première partie pour voir ton rapport d’apprentissage.
          </p>
        </Sheet>
      ) : (
        <div className="min-w-0 flex flex-col gap-4 md:gap-5">
          {/* Période : s'applique à tout le rapport */}
          <div className="flex flex-wrap items-center gap-2 max-sm:grid max-sm:grid-cols-4" role="radiogroup" aria-label="Période">
            <span className="text-sm font-bold text-muted mr-1 max-sm:hidden">Période</span>
            {PERIODS.map((p) => (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={period === p}
                onClick={() => choosePeriod(p)}
                className={`btn h-11 px-4 text-sm whitespace-nowrap max-sm:px-1 ${period === p ? "btn-chosen" : ""}`}
                id={`period-${p}`}
              >
                {PERIOD_LABEL[p]}
              </button>
            ))}
          </div>

          <div className="min-w-0 grid grid-cols-1 gap-4 md:gap-5 wide:grid-cols-2 wide:items-start">
            {/* 1. Utilisation */}
            <Section
              lead
              title="Utilisation"
              id="report-usage"
              aside={
                <span
                  className={streak > 0 ? "sticker bg-success text-ink" : "text-sm font-bold text-muted"}
                  id="report-streak"
                >
                  {streak > 1 ? `${streak} jours d’affilée` : streak === 1 ? "1 jour d’affilée" : "Pas de série en cours"}
                </span>
              }
            >
              <dl className="grid grid-cols-2 sm:grid-cols-4 wide:grid-cols-2 gap-x-4 gap-y-4">
                <Figure label="Jours joués" value={String(usage.days)} />
                <Figure label="Parties" value={String(usage.sessions)} />
                <Figure label="Calculs" value={String(usage.questions)} />
                <Figure label="Temps d’entraînement" value={formatDuration(usage.practiceSeconds)} />
              </dl>
              <div className="min-w-0 border-t border-line pt-4">
                <BarChart
                  title={activityTitle}
                  points={activityPoints}
                  formatValue={(v) => (v > 1 ? `${v} calculs` : v === 1 ? "1 calcul" : "Aucun calcul")}
                  id="chart-activity"
                />
              </div>
            </Section>

            {/* 2. Progrès */}
            <Section
              title="Progrès"
              id="report-progress"
              aside={
                <span className="text-sm font-bold text-muted">
                  Modes Entraînement et Évaluation
                </span>
              }
            >
              <dl className="grid grid-cols-1 sm:grid-cols-3 gap-x-4 max-sm:divide-y max-sm:divide-line">
                <Figure
                  className="max-sm:py-3 max-sm:first:pt-0 max-sm:last:pb-0"
                  label="Réussite"
                  value={accuracy.rate === null ? "—" : percent(accuracy.rate)}
                  delta={
                    comparable ? (
                      <Delta diff={rateDiff} format={(v) => `${Math.round(v)} pts`} upIsGood caption={caption} />
                    ) : undefined
                  }
                />
                <Figure
                  className="max-sm:py-3 max-sm:first:pt-0 max-sm:last:pb-0"
                  label="Temps par bonne réponse"
                  value={accuracy.meanTime === null ? "—" : formatSeconds(accuracy.meanTime)}
                  delta={
                    comparable ? (
                      <Delta diff={speedDiff} format={formatSeconds} upIsGood={false} caption={caption} />
                    ) : undefined
                  }
                />
                <Figure
                  className="max-sm:py-3 max-sm:first:pt-0 max-sm:last:pb-0"
                  label="Calculs maîtrisés"
                  value={
                    <>
                      {masteredNow}
                      <span className="text-lg font-bold text-muted"> / {TOTAL_CALCULATIONS}</span>
                    </>
                  }
                  delta={
                    <Delta
                      diff={masteredNow - masteredAtStart}
                      format={(v) => String(v)}
                      upIsGood
                      caption={period === "all" ? "depuis le début" : "sur la période"}
                    />
                  }
                />
              </dl>

              <div className="min-w-0 border-t border-line pt-4 flex flex-col gap-3">
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Courbe affichée">
                  {METRICS.map((m) => (
                    <button
                      key={m.key}
                      type="button"
                      role="radio"
                      aria-checked={metric === m.key}
                      onClick={() => {
                        playSound.click();
                        setMetric(m.key);
                      }}
                      className={`btn h-11 px-4 text-sm ${metric === m.key ? "btn-chosen" : ""}`}
                      id={`metric-${m.key}`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>

                <LineChart
                  title={metricInfo.title}
                  points={trendPoints}
                  ticks={metric === "rate" ? [0, 25, 50, 75, 100] : undefined}
                  formatValue={
                    metric === "rate"
                      ? (v) => `${percent(v)} de réussite`
                      : metric === "speed"
                      ? (v) => formatSeconds(v)
                      : (v) => `${v} / ${TOTAL_CALCULATIONS} maîtrisés`
                  }
                  formatTick={metric === "rate" ? (v) => `${v} %` : metric === "speed" ? (v) => `${v} s` : undefined}
                  id="chart-trend"
                />
              </div>
            </Section>

            {/* 3. Par table : une ligne par table, séparées par un trait */}
            <Section title="Par table" id="report-tables" aside={<span className="text-sm font-bold text-muted">Maîtrisés dans les deux sens, sur 10</span>}>
              <ul className="border-y border-line divide-y divide-line">
                {tables.map((t) => {
                  const gained = t.mastered - t.masteredAtStart;
                  return (
                    <li
                      key={t.table}
                      className="py-2.5 flex items-center gap-3 max-sm:flex-wrap max-sm:gap-x-2 max-sm:gap-y-1.5"
                      id={`table-progress-${t.table}`}
                    >
                      <span className="w-28 shrink-0 text-base font-black text-ink max-sm:w-auto max-sm:flex-1">Table de {t.table}</span>
                      <span className="w-7 flex items-center justify-center" title={MEDAL_LABEL[t.medal]}>
                        <Medal medal={t.medal} label />
                      </span>
                      {/* Sur téléphone, la barre passe sous le nom de la table, sur toute la largeur. */}
                      {/* Une case par calcul de la table : à gauche table × m, à droite m × table,
                          chaque moitié avec sa couleur de la grille « Où en es-tu ? ». */}
                      <span className="flex-1 flex gap-1 max-sm:order-last max-sm:basis-full" aria-hidden="true" id={`table-bar-${t.table}`}>
                        {Array.from({ length: 10 }, (_, i) => (
                          <span key={i} className="flex-1 flex gap-px">
                            <span className={`h-4 flex-1 rounded-l-[5px] ${STATUS_STYLE[factStatus(mastery, t.table, i + 1)].bar}`} />
                            <span className={`h-4 flex-1 rounded-r-[5px] ${STATUS_STYLE[factStatus(mastery, i + 1, t.table)].bar}`} />
                          </span>
                        ))}
                      </span>
                      <span className="w-12 text-right text-base font-black text-ink tabular-nums">{t.mastered}/10</span>
                      <span
                        className={`w-10 text-right text-sm font-black tabular-nums ${gained > 0 ? "text-success-ink" : gained < 0 ? "text-error-ink" : "text-muted"}`}
                        title="Évolution sur la période"
                      >
                        {gained > 0 ? `+${gained}` : gained < 0 ? `−${-gained}` : "="}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <p className="text-sm text-muted font-medium leading-relaxed">
                Chaque case est un calcul de la table, coupée en deux : à gauche dans un sens (7 × 8), à droite
                dans l’autre (8 × 7), avec les couleurs de « Où en es-tu ? ». Il compte quand ses deux moitiés
                sont maîtrisées.{" "}
                <Medal medal="bronze" size={14} className="align-middle mr-1" />
                Bronze à 5, <Medal medal="silver" size={14} className="align-middle mr-1" />
                argent à 8 et <Medal medal="gold" size={14} className="align-middle mr-1" />
                or à 10, quand la table est complète. La colonne de droite montre l’évolution sur la période.
              </p>
            </Section>

            {/* 4. Grille */}
            <Section title="Où en es-tu ?" id="report-grid" aside={<span className="text-sm font-bold text-muted">Touche un calcul</span>}>
              {/* Sur téléphone, la grille entière tient dans la largeur de l'écran, sans défilement :
                  elle déborde un peu sur la marge de la feuille, comme sur iPad à l'horizontale. */}
              <div className="overflow-x-auto max-sm:-mx-2 wide:-mx-3">
                <div className="min-w-[480px] p-[3px] max-sm:min-w-0 wide:min-w-0">
                  <div className="grid grid-cols-[1.5rem_repeat(10,minmax(0,1fr))] gap-[3px] text-center font-black text-sm text-muted mb-1 max-sm:grid-cols-[1.125rem_repeat(10,minmax(0,1fr))] max-sm:gap-[2px] max-sm:text-xs">
                    <div>×</div>
                    {Array.from({ length: 10 }, (_, i) => (
                      <div key={i + 1}>{i + 1}</div>
                    ))}
                  </div>
                  <div className="space-y-[3px] max-sm:space-y-[2px]">
                    {Array.from({ length: 10 }, (_, r) => (
                      <div key={r} className="grid grid-cols-[1.5rem_repeat(10,minmax(0,1fr))] gap-[3px] items-center max-sm:grid-cols-[1.125rem_repeat(10,minmax(0,1fr))] max-sm:gap-[2px]">
                        <div className="text-center font-black text-sm text-muted max-sm:text-xs">{r + 1}</div>
                        {Array.from({ length: 10 }, (_, c) => {
                          const a = r + 1;
                          const b = c + 1;
                          const status = factStatus(mastery, a, b);
                          const style = STATUS_STYLE[status];
                          const isSelected = selectedFact?.a === a && selectedFact?.b === b;
                          return (
                            <button
                              key={b}
                              type="button"
                              onClick={() => {
                                playSound.click();
                                setSelectedFact({ a, b });
                              }}
                              className={`aspect-square w-full min-h-11 rounded-lg text-base font-black flex items-center justify-center cursor-pointer max-sm:min-h-0 max-sm:rounded-md max-sm:text-xs ${style.cell} ${
                                isSelected ? "relative z-10 ring-[3px] ring-ink" : ""
                              }`}
                              aria-label={`${a} × ${b} : ${style.label}`}
                              id={`fact-${a}x${b}`}
                            >
                              {style.icon}
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Légende : chaque état avec sa définition */}
              <dl className="grid gap-2.5 sm:grid-cols-2 wide:grid-cols-1 text-sm max-sm:order-2" id="grid-legend">
                {(["mastered", "progress", "working", "review", "new"] as FactStatus[]).map((s) => (
                  <div key={s} className="flex items-start gap-2.5">
                    <span
                      className={`mt-0.5 w-6 h-6 shrink-0 rounded-md flex items-center justify-center text-xs font-black ${STATUS_STYLE[s].swatch}`}
                      aria-hidden="true"
                    >
                      {STATUS_STYLE[s].icon}
                    </span>
                    <div className="leading-snug">
                      <dt className="inline font-black text-ink">{STATUS_STYLE[s].label}</dt>
                      <dd className="inline font-medium text-muted"> : {STATUS_STYLE[s].definition}</dd>
                    </div>
                  </div>
                ))}
              </dl>
              <p className="text-sm font-medium text-muted leading-snug max-sm:order-2">
                Chaque case est un calcul : la ligne donne le premier nombre, la colonne le second. 7 × 8 et 8 × 7
                sont deux calculs différents, chacun avec sa case.
              </p>

              <AnimatePresence>
                {selectedFact && selectedStatus && (
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    // Le détail reste dans la feuille, séparé par un trait. Sur téléphone, il
                    // s'affiche juste sous la grille, avant la légende.
                    className="border-t border-line pt-4 max-sm:order-1 max-sm:border-b max-sm:pb-4"
                    id="selected-cell-panel"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h4 className="text-2xl font-black text-ink tabular-nums">
                          {selectedFact.a} × {selectedFact.b} = {selectedFact.a * selectedFact.b}
                        </h4>
                        <p className="text-sm font-bold text-muted">
                          {STATUS_STYLE[selectedStatus].label}
                          {selectedStatus === "progress" && " : aucune erreur, encore quelques bonnes réponses rapides pour le maîtriser."}
                          {selectedStatus === "working" && " : une erreur parmi les 3 dernières réponses."}
                          {selectedStatus === "review" && " : la dernière réponse était fausse."}
                          {selectedStatus === "mastered" && " : les 3 dernières réponses étaient justes et rapides."}
                        </p>
                        {selectedFact.a !== selectedFact.b && (
                          <p className="text-sm font-bold text-muted mt-1" id="other-direction">
                            Dans l’autre sens, {selectedFact.b} × {selectedFact.a} :{" "}
                            {STATUS_STYLE[factStatus(mastery, selectedFact.b, selectedFact.a)].label.toLowerCase()}.
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => {
                          playSound.click();
                          setSelectedFact(null);
                        }}
                        className="btn h-11 w-11 shrink-0"
                        aria-label="Fermer"
                      >
                        <X size={20} />
                      </button>
                    </div>
                    {selectedAttempts.length === 0 ? (
                      <p className="mt-2 text-sm font-bold text-muted">Pas encore joué.</p>
                    ) : (
                      <ul className="mt-3 divide-y divide-line" aria-label="Dernières réponses">
                        {selectedAttempts.map((op) => (
                          <li key={op.id} className="py-1.5 flex items-center justify-between gap-3 text-sm font-bold">
                            <span className="text-muted">{SHORT_DATE.format(new Date(op.date))}</span>
                            <span className="flex items-center gap-3">
                              <span className={op.isCorrect ? "text-success-ink" : "text-error-ink"}>
                                {op.isCorrect ? `✓ ${op.userAnswer}` : op.userAnswer === null ? "✗ temps écoulé" : `✗ ${op.userAnswer}`}
                                {isMissingFactorAnswer(op) && <span className="text-muted font-bold"> (à trous)</span>}
                              </span>
                              <span className="w-16 text-right text-muted tabular-nums">{formatSeconds(op.timeTaken)}</span>
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </Section>

            {/* 5. Journal des parties : une ligne par partie */}
            <Section
              title="Journal des parties"
              id="report-sessions"
              className="wide:col-span-2"
              aside={<span className="text-sm font-bold text-muted">{sessions.length} sur la période</span>}
            >
              {sessions.length === 0 ? (
                <p className="text-base font-bold text-muted">Aucune partie sur cette période.</p>
              ) : (
                <>
                  <ul className="border-y border-line divide-y divide-line">
                    {(showAllSessions ? sessions : sessions.slice(0, 8)).map((s) => (
                      // Sur téléphone : la date et le score sur la première ligne, le reste dessous.
                      <li
                        key={s.id}
                        className="py-2.5 grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[1.3fr_1fr_1fr_0.7fr_0.7fr] items-baseline gap-x-3 gap-y-0.5 text-sm font-bold text-ink"
                      >
                        <span className="font-black max-sm:col-start-1 max-sm:row-start-1">{DATE_TIME.format(new Date(s.date))}</span>
                        <span className="text-muted max-sm:col-start-1 max-sm:row-start-2">{MODE_LABEL[s.gameMode]}</span>
                        <span className="text-muted max-sm:col-start-1 max-sm:row-start-3">
                          {s.tables.length === 10 ? "Toutes les tables" : `Tables ${s.tables.join(", ")}`}
                        </span>
                        <span className="font-black tabular-nums text-right max-sm:col-start-2 max-sm:row-start-1">
                          {s.correctCount}/{s.questionCount}
                        </span>
                        <span className="text-muted tabular-nums text-right max-sm:col-start-2 max-sm:row-start-2">{formatDuration(sessionSeconds(s))}</span>
                      </li>
                    ))}
                  </ul>
                  {sessions.length > 8 && (
                    <button
                      type="button"
                      onClick={() => {
                        playSound.click();
                        setShowAllSessions((v) => !v);
                      }}
                      className="btn h-11 self-start px-4 text-sm"
                      id="toggle-sessions"
                    >
                      {showAllSessions ? "Voir moins" : `Voir les ${sessions.length} parties`}
                    </button>
                  )}
                </>
              )}
            </Section>
          </div>
        </div>
      )}

      {/* Confirmation avant d'effacer */}
      <AnimatePresence>
        {showWipeConfirm && (
          <div className="fixed inset-0 bg-ink/60 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ y: 12, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 12, opacity: 0 }}
              className="sheet p-6 max-w-sm w-full relative text-center"
            >
              <h3 className="text-xl font-black text-ink mb-2">Es-tu sûr de vouloir recommencer ?</h3>
              <p className="text-muted text-sm font-bold leading-relaxed mb-6">
                Toutes tes parties et tes réponses seront effacées définitivement : ta réussite, tes calculs
                maîtrisés, tes médailles et tes records repartiront de zéro.
              </p>
              <div className="flex flex-col gap-2">
                <button type="button" onClick={confirmWipe} className="btn btn-danger w-full h-12">
                  Oui, tout effacer
                </button>
                <button
                  type="button"
                  onClick={() => {
                    playSound.click();
                    setShowWipeConfirm(false);
                  }}
                  className="btn w-full h-12 whitespace-nowrap"
                >
                  Non, garder mes étoiles
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
