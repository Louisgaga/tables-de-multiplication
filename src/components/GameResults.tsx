import { useEffect, useRef, useState } from "react";
import { GameMode, QuestionResult } from "../types";
import { playSound } from "../utils/audio";
import { SaveStatus } from "../utils/history";
import { Achievements } from "../utils/stats";
import { formatSeconds } from "../utils/report";
import { resultsReview } from "../utils/mascot";
import Confetti from "./Confetti";
import Mascot from "./Mascot";
import { Medal, Sheet } from "./paper";

interface GameResultsProps {
  results: QuestionResult[];
  gameMode: GameMode;
  selectedTables: number[];
  /** État de la sauvegarde de cette partie (null tant qu'elle est en cours). */
  saveStatus?: SaveStatus | null;
  /** Nouvelles médailles et nouveaux calculs maîtrisés grâce à cette partie. */
  achievements?: Achievements | null;
  onReplay: () => void;
  onMainMenu: () => void;
  /** Ouvre le rapport de l'enfant, sans repasser par le menu. */
  onViewReport: () => void;
}

/** Un chiffre du champ poire : Chillax 600 en grand, à l'encre, chiffres en colonnes. */
const FIGURE =
  "text-6xl font-black text-ink tabular-nums tracking-display leading-none whitespace-nowrap max-sm:text-5xl";
/** Sous le chiffre : son libellé en 500, puis sa précision. Sur la poire, tout est à l'encre. */
const FIGURE_LABEL = "mt-2 text-lg font-bold text-ink leading-tight max-sm:text-base";
const FIGURE_NOTE = "text-sm text-ink";

/** Tuile de carton : le numéro d'une table, un calcul à retenir. */
const TILE = "rounded-xl bg-card stock shadow-cut font-black text-ink tabular-nums whitespace-nowrap";

/** Le détail des réponses passe sur une ligne par calcul dès que sa feuille fait 29 rem de large. */
const ROW =
  "grid grid-cols-[max-content_minmax(0,1fr)] items-baseline gap-x-3 gap-y-1.5 border-t border-line px-5 py-3 first:border-t-0 max-sm:px-4 @min-[29rem]:col-span-full @min-[29rem]:grid-cols-subgrid";

/** Mention d'une réponse : le mot (« Juste ! », « Faux », « Temps dépassé ») sur son papier, menthe ou corail pâle. */
const VERDICT =
  "rounded-lg px-2.5 py-0.5 text-sm font-black whitespace-nowrap @min-[29rem]:justify-self-start";

/** Facteur d'un calcul à trous : souligné, c'est lui que l'enfant devait trouver. */
function Part({ value, asked }: { value: number; asked: boolean }) {
  return asked ? (
    <span className="underline decoration-primary decoration-4 underline-offset-4">{value}</span>
  ) : (
    <>{value}</>
  );
}

export default function GameResults({
  results,
  gameMode,
  selectedTables,
  saveStatus,
  achievements,
  onReplay,
  onMainMenu,
  onViewReport
}: GameResultsProps) {
  // Score sur les calculs choisis, à la première réponse (comme dans les records). Les calculs
  // ratés qui sont revenus en fin de partie sont comptés à part.
  const firstTries = results.filter((r) => !r.question.isRetry);
  const retries = results.filter((r) => r.question.isRetry);
  const retriesOk = retries.filter((r) => r.isCorrect).length;
  const correctCount = firstTries.filter((r) => r.isCorrect).length;
  const questionCount = firstTries.length;
  const percentage = questionCount > 0 ? (correctCount / questionCount) * 100 : 0;

  const totalTime = firstTries.reduce((acc, curr) => acc + curr.timeTaken, 0);
  const averageTime = questionCount > 0 ? totalTime / questionCount : 0;

  /** Calculs ratés au moins une fois, sans doublon : ce qu'il faut retenir de la partie. */
  const toRemember = results
    .filter((r) => !r.isCorrect)
    .map((r) => r.question)
    .filter((q, i, list) => list.findIndex((o) => o.num1 === q.num1 && o.num2 === q.num2) === i);

  // Petite musique de fin, jouée une seule fois. La sauvegarde de la partie
  // est faite par App, au moment où la partie se termine.
  const playedRef = useRef(false);
  useEffect(() => {
    if (playedRef.current) return;
    playedRef.current = true;
    if (percentage === 100) {
      playSound.victory();
    } else {
      playSound.correct();
    }
  }, [percentage]);

  // Le mot de la fin, tiré une fois pour toutes à l'ouverture de l'écran.
  const [review] = useState(() => resultsReview(percentage));

  /**
   * Vitesse d'une bonne réponse, dite en mots : plus c'est rapide, plus le mot est appuyé.
   * Une réponse fausse a déjà sa mention « Faux » : seul son temps est affiché.
   */
  const getSpeedBadge = (time: number, isCorrect: boolean) => {
    if (!isCorrect) return null;
    if (time <= 2.2) return { text: "Super féroce !", color: "font-black text-ink" };
    if (time <= 5.0) return { text: "Rapide !", color: "text-ink" };
    return { text: "Tranquille", color: "text-muted" };
  };

  return (
    <div className="relative w-full mx-auto" id="results-container">
      <Confetti active={Boolean(achievements && achievements.newMedals.length > 0)} count={60} />
      <div className="grid gap-6 wide:grid-cols-2 wide:items-start wide:gap-8 max-sm:gap-5">
        {/* Le mot de la fin, les chiffres de la partie et les deux actions. */}
        <div className="flex min-w-0 flex-col gap-5 max-sm:gap-4">
          {/* La mascotte et son mot, à même le papier. La marge du haut garde la place de sa couronne. */}
          <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-5 gap-y-2 px-2 pt-7 max-sm:gap-x-3 max-sm:px-1 max-sm:pt-6">
            <div className="max-sm:[&_svg]:size-22 phone-land:[&_svg]:size-22">
              <Mascot expression={review.expression} size={132} />
            </div>
            {/* Sur téléphone, seul le titre reste à côté de la mascotte : la suite prend toute la largeur. */}
            <div className="flex flex-col items-start gap-2 max-sm:contents">
              <h2
                className="text-4xl font-black text-ink leading-[1.05] wide:text-3xl max-sm:text-2xl"
                id="results-headline"
              >
                {review.title}
              </h2>
              <p className="max-w-md text-lg text-muted leading-normal wide:text-base max-sm:col-span-2 max-sm:text-base">
                {review.text}
              </p>
              {achievements && (achievements.newMedals.length > 0 || achievements.newlyMastered > 0) && (
                <div className="mt-1 flex flex-col items-start gap-2 max-sm:col-span-2" id="achievements">
                  {achievements.newMedals.map(({ table, medal }) => (
                    <p key={table} className="flex items-center gap-3 text-xl font-black text-ink max-sm:text-lg">
                      <Medal medal={medal} size={36} label />
                      Nouvelle médaille pour la table de {table} !
                    </p>
                  ))}
                  {achievements.newlyMastered > 0 && (
                    <p className="sticker bg-success stock text-ink text-sm ml-1 mt-1">
                      {achievements.newlyMastered > 1
                        ? `${achievements.newlyMastered} nouveaux calculs maîtrisés`
                        : "1 nouveau calcul maîtrisé"}
                    </p>
                  )}
                </div>
              )}
              {saveStatus === "pending" && (
                <p
                  className="mt-1 rounded-2xl bg-strip stock px-4 py-2.5 text-sm text-ink max-sm:col-span-2"
                  id="save-pending-notice"
                >
                  Pas de connexion : ta partie est gardée sur cet appareil et sera envoyée plus tard.
                </p>
              )}
            </div>
          </div>

          {/* Les chiffres de la partie sur le champ poire, le seul de l'écran. */}
          <Sheet
            tone="pear"
            seed={7}
            className="px-8 pt-7 pb-10 wide:px-7 wide:pt-6 wide:pb-9 max-sm:px-5 max-sm:pt-5 max-sm:pb-8"
            id="stats-dashboard"
          >
            <div className="flex flex-wrap items-start gap-x-10 gap-y-6 max-sm:gap-x-6 max-sm:gap-y-5">
              {/* Score */}
              <div className="flex flex-col">
                <span className={FIGURE} id="results-score-value">
                  {correctCount} / {questionCount}
                </span>
                <span className={FIGURE_LABEL}>Score</span>
                <span className={FIGURE_NOTE}>{Math.round(percentage)} % du premier coup</span>
                {retries.length > 0 && (
                  <span className={FIGURE_NOTE} id="results-retries">
                    {retries.length > 1 ? `${retries.length} calculs revus` : "1 calcul revu"} : {retriesOk} juste{retriesOk > 1 ? "s" : ""}
                  </span>
                )}
              </div>

              {/* Temps moyen */}
              <div className="flex flex-col">
                <span className={FIGURE} id="results-time-value">
                  {averageTime.toFixed(1).replace(".", ",")} <span className="text-2xl font-bold">s</span>
                </span>
                <span className={FIGURE_LABEL}>Temps moyen</span>
                <span className={FIGURE_NOTE}>par question</span>
              </div>

              {/* Tables jouées : une tuile de carton par table. */}
              <div className="flex min-w-0 flex-1 basis-40 flex-col">
                <div className="flex min-h-[60px] flex-wrap items-end gap-1.5 max-sm:min-h-12">
                  {selectedTables.length === 10 ? (
                    <span className="text-5xl font-black text-ink tracking-display leading-none whitespace-nowrap max-sm:text-4xl">
                      Toutes !
                    </span>
                  ) : (
                    selectedTables.map((t) => (
                      // La marge du bas pose la tuile sur la ligne de base des chiffres voisins.
                      <span key={t} className={`${TILE} mb-2 inline-flex h-11 min-w-11 items-center justify-center px-2 text-2xl`}>
                        {t}
                      </span>
                    ))
                  )}
                </div>
                <span className={FIGURE_LABEL}>Tables jouées</span>
              </div>
            </div>
          </Sheet>

          {/* Boutons */}
          <div className="flex flex-col sm:flex-row gap-3 md:gap-4">
            <button
              onClick={onMainMenu}
              className="btn flex-1 max-sm:flex-none h-14 px-4 text-lg"
              id="btn-return-menu"
            >
              Menu
            </button>

            <button
              onClick={() => {
                playSound.click();
                onViewReport();
              }}
              className="btn flex-1 max-sm:flex-none h-14 px-4 text-lg"
              id="btn-view-report"
            >
              Mon rapport
            </button>

            <button
              onClick={onReplay}
              className="btn btn-primary flex-[1.4] max-sm:flex-none h-14 px-4 text-lg"
              id="btn-replay-game"
            >
              Encore une partie
            </button>
          </div>
        </div>

        {/* Ce qu'il faut retenir, puis toutes les réponses : deux feuilles posées l'une sous l'autre. */}
        <div className="flex min-w-0 flex-col gap-5 max-sm:gap-4">
          {/* Les calculs ratés d'abord, avec la bonne réponse : le seul moment corail de l'écran. */}
          {toRemember.length > 0 && (
            <Sheet tone="coral" torn="both" seed={23} className="px-6 py-6 max-sm:px-4 max-sm:py-5" id="to-remember">
              <h4 className="font-extrabold text-ink text-lg mb-3 select-none">À retenir</h4>
              <ul className="flex flex-wrap gap-2">
                {toRemember.map((q) => (
                  <li key={`${q.num1}x${q.num2}`} className={`${TILE} px-3 py-1.5 text-lg`}>
                    {q.num1} × {q.num2} = {q.num1 * q.num2}
                  </li>
                ))}
              </ul>
            </Sheet>
          )}

          {/* Toutes les réponses, en lignes de tableau sur une seule carte. */}
          <div className="sheet @container overflow-hidden">
            <h4 className="px-5 pt-5 pb-3 font-extrabold text-ink text-lg select-none max-sm:px-4 max-sm:pt-4">
              Détail de tes réponses :
            </h4>

            <div className="max-h-[300px] wide:max-h-[460px] overflow-y-auto border-t border-line max-sm:max-h-none max-sm:overflow-visible">
              <div className="pb-2 @min-[29rem]:grid @min-[29rem]:grid-cols-[max-content_minmax(max-content,1fr)_max-content_auto] @min-[29rem]:gap-x-3">
                {results.map((res, idx) => {
                  const padBadge = getSpeedBadge(res.timeTaken, res.isCorrect);
                  return (
                    <div key={idx} className={ROW} id={`result-detail-item-${idx}`}>
                      {/* Numéro et calcul */}
                      <span className="w-7 text-right text-sm text-muted tabular-nums select-none">{idx + 1}</span>

                      <span className="text-lg font-black text-ink tabular-nums whitespace-nowrap">
                        <Part value={res.question.num1} asked={res.question.missing === "factor1"} /> ×{" "}
                        <Part value={res.question.num2} asked={res.question.missing === "factor2"} /> ={" "}
                        {res.question.num1 * res.question.num2}
                        {res.question.isRetry && (
                          <span className="ml-2 text-xs font-bold text-muted" title="Calcul revu">revu</span>
                        )}
                      </span>

                      {/* Réponse et temps : sous le calcul quand la feuille est étroite. */}
                      <div className="col-start-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 @min-[29rem]:contents">
                        {res.isCorrect ? (
                          <span className={`${VERDICT} bg-success-soft text-success-ink`}>
                            Juste ! ({res.userAnswer})
                          </span>
                        ) : (
                          <span className={`${VERDICT} bg-error-soft text-error-ink`}>
                            {res.isTimedOut ? "Temps dépassé" : `Faux (${res.userAnswer ?? "?"})`}
                          </span>
                        )}

                        {padBadge ? (
                          <span className={`text-xs text-right @min-[29rem]:justify-self-end ${padBadge.color}`}>
                            <span className="whitespace-nowrap">{padBadge.text}</span>{" "}
                            <span className="tabular-nums whitespace-nowrap">({formatSeconds(res.timeTaken)})</span>
                          </span>
                        ) : (
                          <span className="text-xs text-right text-muted tabular-nums whitespace-nowrap @min-[29rem]:justify-self-end">
                            {formatSeconds(res.timeTaken)}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
