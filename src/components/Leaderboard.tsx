import { useMemo } from "react";
import { HighScore, GameMode } from "../types";
import { motion, AnimatePresence } from "motion/react";
import { formatSeconds } from "../utils/report";
import { Sheet } from "./paper";

interface LeaderboardProps {
  /** Tous les scores du joueur ; seuls les 10 meilleurs sont affichés. */
  scores: HighScore[];
  loading: boolean;
  onBack?: () => void;
}

// Pas de bouton d'effacement ici : la remise à zéro d'un enfant se fait dans « Gérer les profils ».

export default function Leaderboard({
  scores: allScores,
  loading: isLoading,
  onBack
}: LeaderboardProps) {
  // Classement : meilleur pourcentage, puis temps moyen le plus court, puis le plus récent.
  const scores = useMemo(
    () =>
      allScores
        // Les parties en mode Libre comptent dans le rapport, pas dans les records.
        .filter((s) => s.gameMode !== GameMode.FREE)
        .sort((a, b) => {
          if (b.scorePercentage !== a.scorePercentage) {
            return b.scorePercentage - a.scorePercentage;
          }
          if (a.averageTime !== b.averageTime) {
            return a.averageTime - b.averageTime;
          }
          return new Date(b.date).getTime() - new Date(a.date).getTime();
        })
        .slice(0, 10),
    [allScores]
  );

  const getModeLabel = (mode: GameMode) => {
    switch (mode) {
      case GameMode.FREE:
        return "Libre";
      case GameMode.TIMED:
        return "Entraînement";
      case GameMode.CHALLENGE:
        return "Évaluation";
    }
  };

  return (
    <div className="w-full max-w-3xl wide:max-w-4xl mx-auto" id="leaderboard-container">
      {/* En-tête, à même le papier. Sur téléphone, le titre passe sous le bouton. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-4 max-sm:mb-3">
        {onBack && (
          <button onClick={onBack} className="btn h-11 px-4 text-sm shrink-0" id="leaderboard-back-btn">
            Retour au menu
          </button>
        )}
        <div className="min-w-0 flex-1 max-sm:basis-full">
          <h2 className="text-2xl md:text-3xl font-black text-ink" id="leaderboard-title">
            Tableau des Champions !
          </h2>
          <p className="text-muted text-sm font-bold">Tes 10 meilleurs scores sauvegardés</p>
        </div>
      </div>

      {/* Une seule feuille : le chargement, l'état vide ou le tableau des records. */}
      <Sheet tone="card" torn="bottom" seed={7} className="px-4 pt-2 pb-5 sm:px-5 md:px-6 md:pb-6">
        <AnimatePresence mode="popLayout">
          {isLoading ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-center py-12"
              id="leaderboard-loading"
            >
              <div
                className="h-9 w-9 rounded-full border-4 border-ink border-t-transparent animate-spin mx-auto mb-3"
                aria-hidden="true"
              />
              <p className="text-muted font-bold text-sm">Chargement de tes champions en ligne…</p>
            </motion.div>
          ) : scores.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="text-center py-10 px-4"
              id="empty-leaderboard"
            >
              <p className="text-ink font-black text-xl">Aucune partie enregistrée pour le moment !</p>
              <p className="text-muted text-sm max-w-xs mx-auto mt-1 font-bold">
                Fais une partie et viens battre ton record de vitesse et de précision !
              </p>
            </motion.div>
          ) : (
            <div className="divide-y divide-line">
              {scores.map((score, index) => {
                const dateObj = new Date(score.date);
                const formattedDate = dateObj.toLocaleDateString("fr-FR", {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit"
                });

                return (
                  // Une ligne du tableau : rang, tables et mode, temps moyen, date, score. Sur
                  // téléphone, le score remonte à droite du nom et le reste passe dessous.
                  <motion.div
                    key={score.id}
                    layout
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="py-3 grid grid-cols-[1.75rem_minmax(0,1fr)_auto] md:grid-cols-[2.25rem_minmax(0,1fr)_7rem_8.5rem_minmax(7.5rem,auto)] items-baseline gap-x-3 md:gap-x-4 gap-y-0.5"
                    id={`score-item-${score.id}`}
                  >
                    {/* Rang */}
                    <span className="text-xl font-black text-ink tabular-nums">{index + 1}</span>

                    {/* Tables jouées et mode */}
                    <div className="min-w-0 flex flex-wrap items-baseline gap-x-3 text-left">
                      <span className="font-black text-ink text-base">
                        {score.tables.length === 10
                          ? "Toutes les tables"
                          : `Tables : ${score.tables.join(", ")}`}
                      </span>
                      <span className="text-sm font-bold text-muted">{getModeLabel(score.gameMode)}</span>
                    </div>

                    <span className="text-sm font-bold text-muted tabular-nums max-md:col-start-2 max-md:row-start-2 md:text-right">
                      {formatSeconds(score.averageTime)} de moy.
                    </span>
                    <span className="text-sm font-bold text-muted tabular-nums text-right max-md:col-start-3 max-md:row-start-2">
                      {formattedDate}
                    </span>

                    {/* Score : le record, en tête, est passé au surligneur. */}
                    <div className="text-right whitespace-nowrap max-md:col-start-3 max-md:row-start-1">
                      <span className={`text-lg font-black text-ink tabular-nums ${index === 0 ? "hl" : ""}`}>
                        {score.correctCount} / {score.questionCount}
                      </span>{" "}
                      <span className="text-xs text-muted font-bold tabular-nums">
                        ({Math.round(score.scorePercentage)}{"\u00a0"}%)
                      </span>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </AnimatePresence>
      </Sheet>
    </div>
  );
}
