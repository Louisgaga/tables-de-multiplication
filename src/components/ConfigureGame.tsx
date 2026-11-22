import React, { useEffect, useMemo, useState } from "react";
import { GameMode, GameSettings, HighScore, OperationResponse } from "../types";
import { Play, Volume2, VolumeX } from "lucide-react";
import { playSound, setMute, getMute } from "../utils/audio";
import { MEDAL_LABEL, buildFocusSession, computeFactMastery, medalsByTable } from "../utils/stats";
import { Medal, Sheet } from "./paper";
import { currentStreak } from "../utils/report";

interface ConfigureGameProps {
  onStartGame: (settings: GameSettings) => void;
  onViewLeaderboard: () => void;
  onViewReport: () => void;
  /** Réponses du joueur (médailles, points faibles). */
  history: OperationResponse[];
  /** Parties du joueur (série de jours). */
  scores: HighScore[];
  /** Identifiant du joueur, pour mémoriser ses réglages sur cet appareil. */
  playerKey: string;
  /** Prénom de l'enfant qui joue (compte famille), pour l'accueillir. */
  playerName?: string;
}

/** Quels calculs : choisis par l'app d'après l'historique, ou tables choisies à la main. */
type Selection = "focus" | "manual";

interface Prefs {
  tables: number[];
  holes: boolean;
  selection: Selection;
}

const DEFAULT_PREFS: Prefs = { tables: [2, 5, 10], holes: false, selection: "focus" };
const prefsKey = (player: string) => `mm:v2:prefs:${player}`;

/** Nombre de calculs de la session rapide. */
const DAILY_SIZE = 20;
const COUNTS = [10, 20, 30];

function readPrefs(player: string): Prefs {
  try {
    const raw = localStorage.getItem(prefsKey(player));
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<Prefs>;
    const tables = Array.isArray(parsed.tables)
      ? parsed.tables.filter((t) => Number.isInteger(t) && t >= 1 && t <= 10)
      : [];
    return {
      tables: tables.length > 0 ? tables : DEFAULT_PREFS.tables,
      holes: parsed.holes === true,
      selection: parsed.selection === "manual" ? "manual" : "focus",
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

function writePrefs(player: string, prefs: Prefs): void {
  try {
    localStorage.setItem(prefsKey(player), JSON.stringify(prefs));
  } catch {
    // Stockage indisponible : les réglages vaudront seulement pour cette visite.
  }
}

/**
 * Ligne sous « Session rapide ». Un seul type de calcul : le nombre une fois
 * (« 20 nouveaux calculs, choisis pour toi »). Plusieurs : le détail
 * (« 20 calculs choisis pour toi : 12 à travailler, 4 nouveaux et 4 en révision »).
 */
function dailySummary(plan: { questions: unknown[]; practice: number; fresh: number; revision: number }): string {
  const total = plan.questions.length;
  const s = total > 1 ? "s" : "";
  const kinds = [plan.practice, plan.fresh, plan.revision].filter((n) => n > 0).length;
  if (kinds === 1) {
    if (plan.fresh) return `${total} nouveau${total > 1 ? "x" : ""} calcul${s}, choisi${s} pour toi`;
    if (plan.practice) return `${total} calcul${s} à travailler, choisi${s} pour toi`;
    return `${total} calcul${s} en révision, choisi${s} pour toi`;
  }
  return `${total} calcul${s} choisi${s} pour toi : ${describePlan(plan)}`;
}

/** « 12 à travailler, 4 nouveaux et 4 en révision » */
function describePlan(plan: { practice: number; fresh: number; revision: number }): string {
  const parts: string[] = [];
  if (plan.practice) parts.push(`${plan.practice} à travailler`);
  if (plan.fresh) parts.push(`${plan.fresh} nouveau${plan.fresh > 1 ? "x" : ""}`);
  if (plan.revision) parts.push(`${plan.revision} en révision`);
  return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} et ${parts[parts.length - 1]}` : parts.join("");
}

/**
 * Les deux façons de jouer. Chaque mode est décrit par les mêmes trois points, dans le même
 * ordre : le temps, ce qui arrive après une erreur, et si la partie compte pour les médailles.
 * Chaque bouton porte le premier point (sauf sur téléphone, faute de place) ; le mode choisi
 * affiche ses trois points dessous, le premier surligné.
 */
const MODES: {
  mode: GameMode;
  id: string;
  title: string;
  /** Mot placé devant les trois points (« Examen : … »). */
  lead?: string;
  facts: [string, string, string];
}[] = [
  {
    mode: GameMode.TIMED,
    id: "mode-timed-label",
    title: "Entraînement",
    facts: ["Chrono sans limite", "Tes erreurs reviennent", "Compte pour les médailles"],
  },
  {
    mode: GameMode.CHALLENGE,
    id: "mode-challenge-label",
    title: "Évaluation",
    lead: "Examen",
    facts: ["30 calculs, 15 s chacun", "Pas de 2e chance", "Compte pour les médailles"],
  },
];

const PRESETS: { type: "easy" | "hard" | "all"; label: string }[] = [
  // Espaces insécables : sur téléphone, la parenthèse passe entière à la ligne.
  { type: "easy", label: "Faciles (1,\u00a02,\u00a05,\u00a010)" },
  { type: "hard", label: "Difficiles (6\u00a0à\u00a09)" },
  { type: "all", label: "Toutes" },
];

export default function ConfigureGame({
  onStartGame,
  onViewLeaderboard,
  onViewReport,
  history,
  scores,
  playerKey,
  playerName,
}: ConfigureGameProps) {
  // Réglages mémorisés pour chaque joueur : quels calculs, ses tables, les calculs à trous.
  const [prefs, setPrefs] = useState<Prefs>(() => readPrefs(playerKey));
  const [gameMode, setGameMode] = useState<GameMode>(GameMode.TIMED);
  const [questionCount, setQuestionCount] = useState<number>(10);
  const [muted, setMuted] = useState<boolean>(getMute());

  // Changement de joueur pendant que l'accueil est affiché.
  useEffect(() => setPrefs(readPrefs(playerKey)), [playerKey]);

  const updatePrefs = (next: Prefs) => {
    setPrefs(next);
    writePrefs(playerKey, next);
  };
  const selectedTables = prefs.tables;
  const setSelectedTables = (tables: number[]) => updatePrefs({ ...prefs, tables });

  const isChallenge = gameMode === GameMode.CHALLENGE;
  // L'évaluation porte toujours sur des tables choisies : un test se compare d'une fois à l'autre.
  const selection: Selection = isChallenge ? "manual" : prefs.selection;

  const medals = useMemo(() => medalsByTable(computeFactMastery(history)), [history]);
  const streak = useMemo(() => currentStreak(scores, new Date()), [scores]);
  // Session rapide : 20 calculs choisis d'après l'historique, dans toutes les tables.
  const dailyPlan = useMemo(() => buildFocusSession(history, DAILY_SIZE), [history]);

  const toggleTable = (num: number) => {
    playSound.click();
    if (selectedTables.includes(num)) {
      if (selectedTables.length > 1) {
        setSelectedTables(selectedTables.filter((t) => t !== num));
      }
    } else {
      setSelectedTables([...selectedTables, num].sort((a, b) => a - b));
    }
  };

  const selectPreset = (type: "all" | "easy" | "hard") => {
    playSound.click();
    switch (type) {
      case "all":
        setSelectedTables(Array.from({ length: 10 }, (_, i) => i + 1));
        break;
      case "easy":
        setSelectedTables([1, 2, 5, 10]);
        break;
      case "hard":
        setSelectedTables([6, 7, 8, 9]);
        break;
    }
  };

  const startDaily = () => {
    playSound.click();
    onStartGame({
      selectedTables: dailyPlan.tables,
      gameMode: GameMode.TIMED,
      questionCount: dailyPlan.questions.length,
      timeLimitPerQuestion: 15,
      includeReverse: true,
      adaptiveDifficulty: false,
      fixedQuestions: dailyPlan.questions,
      focus: true,
      sessionLabel: "Session rapide",
    });
  };

  const handleStart = (e: React.FormEvent) => {
    e.preventDefault();
    playSound.click();

    if (selection === "focus") {
      const plan = buildFocusSession(history, questionCount, Math.random, { extraHoles: prefs.holes });
      onStartGame({
        selectedTables: plan.tables,
        gameMode,
        questionCount: plan.questions.length,
        timeLimitPerQuestion: 15,
        includeReverse: true,
        adaptiveDifficulty: false,
        missingFactors: prefs.holes,
        fixedQuestions: plan.questions,
        focus: true,
        sessionLabel: "Points faibles",
      });
      return;
    }

    onStartGame({
      selectedTables,
      gameMode,
      questionCount: isChallenge ? 30 : questionCount,
      timeLimitPerQuestion: 15,
      includeReverse: true,
      adaptiveDifficulty: gameMode === GameMode.TIMED,
      missingFactors: !isChallenge && prefs.holes,
    });
  };

  const toggleSound = () => {
    const newState = !muted;
    setMuted(newState);
    setMute(newState);
    playSound.click();
  };

  const selectionButton = (value: Selection, label: string, id: string) => {
    const active = selection === value;
    const disabled = value === "focus" && isChallenge;
    return (
      <button
        type="button"
        role="radio"
        aria-checked={active}
        disabled={disabled}
        onClick={() => {
          playSound.click();
          updatePrefs({ ...prefs, selection: value });
        }}
        className={`btn h-11 px-3 md:px-4 text-sm md:text-base whitespace-nowrap ${active ? "btn-chosen" : ""}`}
        id={id}
      >
        {label}
      </button>
    );
  };

  const currentMode = MODES.find((m) => m.mode === gameMode) ?? MODES[0];
  const holesOn = prefs.holes && !isChallenge;

  return (
    <div className="w-full flex flex-col gap-5 wide:gap-4 max-sm:gap-4" id="config-form-container">
      {/* Le titre sur le papier, la série de jours, et les portes vers le rapport et les records */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h2
            className="text-3xl md:text-4xl wide:text-3xl max-sm:text-2xl font-black text-ink leading-tight"
            id="main-title"
          >
            À toi de jouer{playerName ? `, ${playerName}` : ""} !
          </h2>
          <p className="text-muted text-sm md:text-base mt-1 font-bold wide:hidden">
            Entraîne-toi et décroche une médaille pour chaque table !
          </p>
        </div>
        <div className="flex flex-wrap items-start gap-2 max-sm:w-full">
          {streak > 0 && (
            <span
              className="h-11 px-4 rounded-full flex items-center justify-center bg-success-soft text-success-ink text-sm md:text-base font-black whitespace-nowrap max-sm:w-full max-sm:h-9"
              id="home-streak"
            >
              {streak > 1 ? `${streak} jours d’affilée` : "1 jour, continue demain !"}
            </span>
          )}
          <button
            type="button"
            onClick={() => {
              playSound.click();
              onViewReport();
            }}
            className="btn h-11 px-4 text-sm whitespace-nowrap max-sm:flex-1 max-sm:px-2"
            id="view-report"
          >
            Mon rapport
          </button>
          <button
            type="button"
            onClick={() => {
              playSound.click();
              onViewLeaderboard();
            }}
            className="btn h-11 px-4 text-sm whitespace-nowrap max-sm:flex-1 max-sm:px-2"
            id="view-records"
          >
            Records
          </button>
          <button
            type="button"
            onClick={toggleSound}
            aria-pressed={!muted}
            aria-label={muted ? "Sons coupés : toucher pour les activer" : "Sons actifs : toucher pour les couper"}
            className="btn h-11 w-11 shrink-0"
            id="toggle-audio"
          >
            {muted ? <VolumeX className="text-muted" size={20} /> : <Volume2 size={20} />}
          </button>
        </div>
      </div>

      {/* Session rapide : la feuille poire de l'écran. 20 calculs choisis pour l'enfant, en un appui. */}
      <Sheet tone="pear" torn="bottom" seed={3} className="transition-[translate] duration-150 active:translate-y-0.5">
        <button
          type="button"
          onClick={startDaily}
          className="w-full min-h-[92px] wide:min-h-[84px] max-sm:min-h-[84px] pl-6 pr-5 pt-3 pb-5 max-sm:pl-4 max-sm:pr-3 rounded-[28px] flex items-center gap-4 text-left text-accent-ink cursor-pointer"
          id="daily-session-btn"
        >
          <span className="flex-1 min-w-0 flex flex-col gap-0.5">
            <span className="text-2xl md:text-3xl font-black leading-tight">Session rapide</span>
            <span className="text-sm md:text-base font-bold leading-snug" id="daily-session-summary">
              {dailySummary(dailyPlan)}
            </span>
          </span>
          <span
            className="h-14 w-14 shrink-0 rounded-full bg-ink stock text-accent flex items-center justify-center shadow-cut"
            aria-hidden="true"
          >
            <Play size={24} className="fill-current ml-0.5" />
          </span>
        </button>
      </Sheet>

      {/*
        Séparation entre la session rapide (tout est choisi pour l'enfant) et la partie qu'il compose
        lui-même en dessous, lancée par « C'est parti ! ».
      */}
      <div className="flex items-center gap-3 -my-1 wide:-my-1.5" id="custom-game-divider">
        <span className="h-0.5 flex-1 rounded-full bg-edge" aria-hidden="true" />
        <span className="text-sm md:text-base font-black text-muted whitespace-nowrap">ou prépare ta partie</span>
        <span className="h-0.5 flex-1 rounded-full bg-edge" aria-hidden="true" />
      </div>

      <form
        onSubmit={handleStart}
        className="grid gap-5 wide:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] wide:gap-x-7 max-sm:gap-4"
      >
        {/* 1. Quels calculs ? Les tables sont des tuiles de carton sur une bande de kraft. */}
        <section className="flex flex-col gap-3 min-w-0" aria-labelledby="selection-title">
          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
            <h3 className="h-11 flex items-center text-lg md:text-xl font-black text-ink" id="selection-title">
              1. Quels calculs ?
            </h3>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-labelledby="selection-title">
              {selectionButton("focus", "Mes points faibles", "selection-focus")}
              {selectionButton("manual", "Mes tables", "selection-manual")}
            </div>
          </div>

          <Sheet tone="strip" torn="both" seed={11} radius="rounded-[20px]" className="flex-1 px-4 pt-5 pb-5 max-sm:px-3">
            {selection === "focus" ? (
              <div className="flex flex-col gap-3" id="focus-panel">
                <p className="text-sm md:text-base font-bold text-ink leading-snug">
                  L’app choisit pour toi : d’abord tes erreurs, puis quelques nouveaux calculs et des révisions.
                </p>
                {/* Médailles : à voir, pas à toucher. Posées à même le kraft, sans carton ni bord de bouton. */}
                <p className="text-sm md:text-base font-black text-ink leading-relaxed" id="medals-title">
                  Mes médailles{" "}
                  <span className="font-bold">
                    (<Medal medal="bronze" size={16} className="align-[-3px] mr-1" />
                    bronze à 5 calculs maîtrisés, <Medal medal="silver" size={16} className="align-[-3px] mr-1" />
                    argent à 8, <Medal medal="gold" size={16} className="align-[-3px] mr-1" />
                    or à 10)
                  </span>
                </p>
                <ul className="grid grid-cols-5 gap-2" aria-labelledby="medals-title">
                  {medals.map((medal, i) => (
                    <li
                      key={i}
                      className="h-11 flex items-center justify-center gap-2 text-lg font-black text-ink tabular-nums"
                      aria-label={`Table de ${i + 1} : ${MEDAL_LABEL[medal].toLowerCase()}`}
                    >
                      <span>{i + 1}</span>
                      <Medal medal={medal} size={22} />
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="flex flex-col gap-3" id="manual-panel">
                <div className="flex flex-wrap gap-2 max-sm:grid max-sm:grid-cols-3">
                  {PRESETS.map((preset) => (
                    <button
                      key={preset.type}
                      type="button"
                      onClick={() => selectPreset(preset.type)}
                      className="btn h-11 px-3 text-sm max-sm:h-auto max-sm:min-h-11 max-sm:px-2 max-sm:py-1 max-sm:leading-tight"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-5 gap-2.5 md:gap-3">
                  {Array.from({ length: 10 }, (_, i) => i + 1).map((num) => {
                    const selected = selectedTables.includes(num);
                    const medal = medals[num - 1];
                    return (
                      <button
                        key={num}
                        type="button"
                        onClick={() => toggleTable(num)}
                        aria-pressed={selected}
                        aria-label={`Table de ${num}${medal !== "none" ? `, ${MEDAL_LABEL[medal].toLowerCase()}` : ""}`}
                        className={`btn relative flex-col gap-0.5 h-16 md:h-[68px] wide:h-[60px] ${selected ? "btn-chosen" : ""}`}
                        id={`table-selector-btn-${num}`}
                      >
                        {medal !== "none" && <Medal medal={medal} size={22} className="absolute -top-2 -right-1.5" />}
                        <span className="text-xs leading-none font-bold">Table</span>
                        <span className="text-2xl md:text-3xl wide:text-2xl leading-none tabular-nums">{num}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </Sheet>
        </section>

        {/* 2. Comment jouer ? Trois pastilles, et les règles du mode choisi en une phrase. */}
        <section className="flex flex-col gap-3 min-w-0" aria-labelledby="mode-selection-title">
          <h3 className="h-11 flex items-center text-lg md:text-xl font-black text-ink" id="mode-selection-title">
            2. Comment jouer ?
          </h3>
          <div
            className="grid grid-cols-2 gap-2"
            role="radiogroup"
            aria-labelledby="mode-selection-title"
          >
            {MODES.map((m) => {
              const selected = gameMode === m.mode;
              return (
                <button
                  key={m.mode}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => {
                    playSound.click();
                    setGameMode(m.mode);
                  }}
                  className={`btn relative flex-col gap-1 h-[76px] px-2 text-sm md:text-base leading-tight max-sm:h-14 max-sm:text-xs max-sm:px-1 ${
                    selected ? "btn-chosen" : ""
                  }`}
                  id={m.id}
                >
                  <span>{m.title}</span>
                  <span className="text-xs font-bold leading-tight max-sm:sr-only">
                    {m.lead ? `${m.lead} : ` : ""}
                    {m.facts[0]}
                  </span>
                  <span className="sr-only">
                    , {m.facts[1]}, {m.facts[2]}
                  </span>
                </button>
              );
            })}
          </div>
          <p
            className="min-h-[3.25rem] text-base md:text-lg wide:text-base font-bold text-ink leading-relaxed"
            id="mode-facts"
          >
            {currentMode.lead && <span className="font-black">{currentMode.lead} : </span>}
            <span className="hl">{currentMode.facts[0]}.</span> {currentMode.facts[1]}. {currentMode.facts[2]}.
          </p>

          {/* Calculs à trous */}
          <button
            type="button"
            role="switch"
            aria-checked={holesOn}
            disabled={isChallenge}
            onClick={() => {
              playSound.click();
              updatePrefs({ ...prefs, holes: !prefs.holes });
            }}
            className="btn w-full h-12 px-4 justify-between gap-3 text-left"
            id="toggle-holes"
          >
            <span className="text-sm md:text-base font-black">
              Calculs à trous{" "}
              <span className="font-bold text-muted">{isChallenge ? "(pas en évaluation)" : "(7 × ? = 56)"}</span>
            </span>
            <span
              className={`w-12 h-7 shrink-0 rounded-full p-1 transition-colors ${holesOn ? "bg-ink" : "bg-control-off"}`}
              aria-hidden="true"
            >
              <span
                className={`block w-5 h-5 rounded-full transition-transform ${
                  holesOn ? "translate-x-5 bg-accent" : "bg-card"
                }`}
              />
            </span>
          </button>

          {/* Nombre de calculs et lancement */}
          <div className="mt-auto pt-1 flex items-center gap-3 max-sm:flex-wrap">
            <div className="flex items-center gap-1.5 max-sm:w-full" role="radiogroup" aria-labelledby="question-count-label">
              <span className="text-sm font-black text-muted mr-1 mb-[5px]" id="question-count-label">
                Calculs
              </span>
              {COUNTS.map((c) => {
                const active = isChallenge ? c === 30 : questionCount === c;
                return (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    disabled={isChallenge && c !== 30}
                    onClick={() => {
                      playSound.click();
                      setQuestionCount(c);
                    }}
                    className={`btn h-14 w-14 wide:w-12 text-xl tabular-nums max-sm:flex-1 max-sm:h-12 ${active ? "btn-chosen" : ""}`}
                    id={`qcount-btn-${c}`}
                  >
                    {c}
                  </button>
                );
              })}
            </div>

            <button
              type="submit"
              className="btn btn-primary flex-1 h-16 md:h-[68px] wide:h-16 max-sm:basis-full rounded-[20px] px-3 text-xl md:text-2xl wide:text-xl whitespace-nowrap"
              id="start-game-btn"
            >
              C’est parti !
            </button>
          </div>
        </section>
      </form>
    </div>
  );
}
