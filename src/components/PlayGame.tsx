import { useState, useEffect, useRef, ReactNode } from "react";
import { GameMode, GameSettings, Question, QuestionResult, OperationResponse } from "../types";
import { getMute, playSound, setMute } from "../utils/audio";
import { buildQuestions } from "../utils/stats";
import { RETYPE_OK, Reaction, correctReaction, mistakeReaction, pick, promptText } from "../utils/mascot";
import Mascot from "./Mascot";
import Numpad, { NumpadAction } from "./Numpad";
import Confetti from "./Confetti";
import { ChallengeBar, ChallengePill, ElapsedPill } from "./GameClock";
import { Volume2, VolumeX } from "lucide-react";
import { Sheet } from "./paper";
import { motion, AnimatePresence } from "motion/react";

interface PlayGameProps {
  settings: GameSettings;
  onFinish: (results: QuestionResult[]) => void;
  onQuit: () => void;
  opResponses?: OperationResponse[];
  /** Prénom de l'enfant : la mascotte le dit de temps en temps. */
  playerName?: string;
}

/** Un calcul raté revient après 3 autres questions. */
const RETRY_GAP = 3;

type AnswerStatus = "pending" | "correct" | "incorrect" | "timeout";

export default function PlayGame({ settings, onFinish, onQuit, opResponses, playerName }: PlayGameProps) {
  // Questions tirées une seule fois, à l'ouverture de la partie. La liste ne change
  // ensuite que pour faire revenir un calcul raté.
  const [questions, setQuestions] = useState<Question[]>(
    () => settings.fixedQuestions ?? buildQuestions(settings, opResponses ?? [])
  );
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [typedInput, setTypedInput] = useState<string>("");

  const [answerStatus, setAnswerStatus] = useState<AnswerStatus>("pending");
  /** Après une erreur, l'enfant retape la bonne réponse avant de continuer. */
  const [retyping, setRetyping] = useState<boolean>(false);
  const [retypeOk, setRetypeOk] = useState<boolean>(false);
  const [retypeMiss, setRetypeMiss] = useState<boolean>(false);
  /** Réponse fausse de l'enfant, montrée barrée à côté de la correction. */
  const [wrongAnswer, setWrongAnswer] = useState<number | null>(null);
  /** Ce que dit la mascotte après la réponse, avec sa bouille. */
  const [reaction, setReaction] = useState<Reaction | null>(null);
  const [retypeOkText, setRetypeOkText] = useState<string>(RETYPE_OK[0]);
  /** Bonnes réponses d'affilée, pour fêter les séries. */
  const streakRef = useRef(0);
  const [muted, setMuted] = useState<boolean>(getMute());
  const [showConfetti, setShowConfetti] = useState<boolean>(false);

  /** Début du calcul en cours et moment de la réponse, pour les chronomètres. */
  const [startedAt, setStartedAt] = useState<number>(() => Date.now());
  const [stoppedAt, setStoppedAt] = useState<number | null>(null);
  const timeLimit = settings.timeLimitPerQuestion;
  // L'évaluation reste un test : pas de seconde chance.
  const retryMistakes = settings.gameMode !== GameMode.CHALLENGE;

  // Références à jour, lues par les minuteries (qui gardent sinon d'anciennes valeurs).
  const questionsRef = useRef<Question[]>(questions);
  const indexRef = useRef<number>(0);
  const resultsRef = useRef<QuestionResult[]>([]);
  /** Minuteries de l'évaluation : deux bips d'alerte, puis la fin du temps. */
  const limitTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  /** Passage automatique au calcul suivant. */
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const questionStartTimeRef = useRef<number>(0);

  useEffect(() => {
    startQuestion(questionsRef.current[0]);
    return () => stopAllTimers();
    // Démarrage unique de la partie.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Arrête le chrono du calcul en cours (réponse donnée ou temps écoulé). */
  const stopClock = () => {
    limitTimersRef.current.forEach(clearTimeout);
    limitTimersRef.current = [];
    setStoppedAt(Date.now());
  };

  const stopAllTimers = () => {
    limitTimersRef.current.forEach(clearTimeout);
    limitTimersRef.current = [];
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  const startQuestion = (q: Question | undefined) => {
    if (!q) return;
    setTypedInput("");
    setAnswerStatus("pending");
    setReaction(null);
    setRetyping(false);
    setRetypeOk(false);
    setRetypeMiss(false);
    setWrongAnswer(null);
    setShowConfetti(false);

    stopAllTimers();
    const now = Date.now();
    questionStartTimeRef.current = now;
    setStartedAt(now);
    setStoppedAt(null);

    if (settings.gameMode === GameMode.CHALLENGE) {
      limitTimersRef.current = [
        setTimeout(() => playSound.warning(), Math.max(0, timeLimit - 2) * 1000),
        setTimeout(() => playSound.warning(), Math.max(0, timeLimit - 1) * 1000),
        setTimeout(() => handleTimeout(q), timeLimit * 1000),
      ];
    }
  };

  const recordResult = (result: QuestionResult) => {
    resultsRef.current = [...resultsRef.current, result];
  };

  const handleTimeout = (q: Question) => {
    stopClock();
    playSound.wrong();
    setAnswerStatus("timeout");
    streakRef.current = 0;
    setReaction(mistakeReaction(q, null));
    recordResult({ question: q, userAnswer: null, isCorrect: false, timeTaken: timeLimit, isTimedOut: true });
  };

  /** Remet le calcul raté plus loin dans la partie (une seule fois par calcul). */
  const scheduleRetry = (q: Question) => {
    if (q.isRetry) return;
    const list = questionsRef.current;
    const position = Math.min(indexRef.current + RETRY_GAP + 1, list.length);
    const copy: Question = { ...q, id: `${q.id}-r`, isRetry: true };
    const next = [...list.slice(0, position), copy, ...list.slice(position)];
    questionsRef.current = next;
    setQuestions(next);
  };

  /**
   * Passe au calcul suivant, une seule fois par calcul : `from` est le calcul affiché au
   * moment de la demande. Si le passage automatique et un appui sur « Calcul suivant »
   * tombent au même instant, le second est ignoré au lieu de sauter un calcul.
   */
  const goToNextQuestion = (from: number) => {
    if (from !== indexRef.current) return;
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    const nextIndex = indexRef.current + 1;
    if (nextIndex < questionsRef.current.length) {
      indexRef.current = nextIndex;
      setCurrentIndex(nextIndex);
      startQuestion(questionsRef.current[nextIndex]);
    } else {
      // Partie terminée : un second appel (même course) ne l'enregistre pas une deuxième fois.
      indexRef.current = nextIndex;
      stopAllTimers();
      onFinish(resultsRef.current);
    }
  };

  const checkRetype = () => {
    const q = questionsRef.current[indexRef.current];
    if (parseInt(typedInput, 10) === q.correctAnswer) {
      playSound.correct();
      setRetyping(false);
      setRetypeOkText(pick(RETYPE_OK));
      setRetypeOk(true);
      const from = indexRef.current;
      timeoutRef.current = setTimeout(() => goToNextQuestion(from), 800);
    } else {
      playSound.wrong();
      setTypedInput("");
      setRetypeMiss(true);
    }
  };

  const handleValidate = () => {
    if (typedInput.trim() === "") return;
    if (retyping) {
      checkRetype();
      return;
    }
    if (answerStatus !== "pending") return;

    stopClock();
    const q = questionsRef.current[indexRef.current];
    const userNum = parseInt(typedInput, 10);
    const isCorrect = userNum === q.correctAnswer;
    const timeTaken = parseFloat(((Date.now() - questionStartTimeRef.current) / 1000).toFixed(1));
    recordResult({ question: q, userAnswer: userNum, isCorrect, timeTaken, isTimedOut: false });

    if (isCorrect) {
      playSound.correct();
      setAnswerStatus("correct");
      streakRef.current += 1;
      setReaction(
        correctReaction({
          streak: streakRef.current,
          seconds: timeTaken,
          isRetry: q.isRetry,
          hole: q.missing === "factor1" || q.missing === "factor2",
          name: playerName,
        })
      );
      setShowConfetti(true);
      const from = indexRef.current;
      timeoutRef.current = setTimeout(() => goToNextQuestion(from), 1400);
    } else {
      playSound.wrong();
      setAnswerStatus("incorrect");
      streakRef.current = 0;
      setReaction(mistakeReaction(q, userNum));
      setWrongAnswer(userNum);
      if (retryMistakes) {
        setRetyping(true);
        setTypedInput("");
        scheduleRetry(q);
      }
    }
  };

  const canType = answerStatus === "pending" || retyping;

  const handleBackspace = () => {
    if (!canType) return;
    setTypedInput((prev) => prev.slice(0, -1));
  };

  const handleClear = () => {
    if (!canType) return;
    setTypedInput("");
  };

  const handleNumberPress = (num: number) => {
    if (!canType) return;
    setRetypeMiss(false);
    setTypedInput((prev) => (prev.length < 4 ? prev + num : prev));
  };

  // Clavier (utile avec un clavier branché sur l'iPad ou sur ordinateur)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!canType) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          playSound.click();
          goToNextQuestion(currentIndex);
        }
        return;
      }
      if (e.key >= "0" && e.key <= "9") {
        handleNumberPress(parseInt(e.key, 10));
      } else if (e.key === "Backspace") {
        handleBackspace();
      } else if (e.key === "Enter") {
        e.preventDefault();
        handleValidate();
      } else if (e.key === "Escape") {
        onQuit();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  const currentQ = questions[currentIndex];
  if (!currentQ) return null;

  /**
   * Calculs choisis au départ. Un calcul raté qui revient ne change ni le total ni la barre :
   * l'enfant voit toujours « x / 10 », jamais une partie qui s'allonge à chaque erreur.
   */
  const plannedCount = questions.filter((q) => !q.isRetry).length;
  const plannedDone = questions.slice(0, currentIndex + 1).filter((q) => !q.isRetry).length;

  const missing = currentQ.missing ?? "product";
  const product = currentQ.num1 * currentQ.num2;
  const isWrong = answerStatus === "incorrect" || answerStatus === "timeout";

  const getMascotExpression = () => {
    if (retypeOk) return "wink";
    if (retyping && retypeMiss) return "determined";
    if ((answerStatus !== "pending" || retyping) && reaction) return reaction.expression;
    if (typedInput.length > 0) return "thinking";
    return "neutral";
  };

  /**
   * La bulle de la mascotte. Après une erreur, elle dit la cause probable (« Une fois de trop ! ») :
   * la bande corail dessous montre la correction et ce qu'il faut taper.
   */
  const bubble = (): { key: string; text: string; className: string } => {
    if (retypeOk) return { key: "retype-ok", text: retypeOkText, className: "text-success-ink" };
    if (retyping && retypeMiss) return { key: "retype-miss", text: "Pas tout à fait… regarde bien !", className: "text-error-ink" };
    if ((retyping || isWrong) && reaction) return { key: `wrong-${currentIndex}`, text: reaction.text, className: "text-error-ink" };
    if (answerStatus === "correct" && reaction) return { key: `correct-${currentIndex}`, text: reaction.text, className: "text-success-ink" };
    if (typedInput) return { key: "typed", text: "Appuie sur « Valider »", className: "text-muted" };
    return {
      key: `prompt-${currentIndex}`,
      text: promptText(currentQ, currentIndex),
      className: currentQ.isRetry ? "text-ink" : "text-muted",
    };
  };
  const message = bubble();

  /**
   * Le calcul est fait de tuiles de carton posées sur une bande de kraft. La tuile de la réponse
   * change de papier : pointillés tant qu'elle est vide, encre quand l'enfant tape, menthe si
   * c'est juste, corail si c'est faux.
   */
  const TILE =
    "h-20 md:h-24 wide:h-28 rounded-2xl flex items-center justify-center font-black tabular-nums select-none max-sm:h-16 max-sm:rounded-xl phone-land:h-16 phone-land:rounded-xl";
  const answerTone =
    answerStatus === "correct" || retypeOk
      ? "bg-success stock shadow-cut text-ink"
      : isWrong && !retyping
      ? "bg-error stock shadow-cut text-ink"
      : typedInput
      ? "bg-ink stock shadow-cut text-paper"
      : retyping
      ? "border-[3px] border-dashed border-ink text-muted"
      : "border-[3px] border-dashed border-muted text-muted";
  const answerBox = (
    <div
      className={`${TILE} min-w-[112px] md:min-w-[150px] wide:min-w-[170px] px-3 text-5xl md:text-6xl wide:text-7xl transition-colors duration-150 max-sm:px-2 max-sm:min-w-[clamp(4.5rem,22vw,6rem)] max-sm:text-[length:clamp(2rem,10vw,2.5rem)] phone-land:min-w-24 phone-land:text-4xl ${
        retypeMiss ? "animate-shake" : ""
      } ${answerTone}`}
      id="answer-box"
    >
      {typedInput || "?"}
    </div>
  );

  const numberCell = (value: number): ReactNode => (
    <span
      className={`${TILE} bg-card stock shadow-cut px-4 md:px-5 text-6xl md:text-7xl wide:text-8xl text-ink max-sm:px-2 max-sm:text-[length:clamp(2rem,10vw,2.75rem)] phone-land:px-2 phone-land:text-5xl`}
    >
      {value}
    </span>
  );
  const sign = (s: string) => (
    <span className="text-5xl md:text-6xl wide:text-7xl font-black text-ink select-none max-sm:text-[length:clamp(1.625rem,8vw,2.25rem)] phone-land:text-4xl">{s}</span>
  );

  const action: NumpadAction =
    canType
      ? {
          label: "Valider",
          onPress: handleValidate,
          tone: "validate",
          id: "numpad-btn-validate",
          disabled: typedInput === "",
        }
      : {
          label: "Calcul suivant",
          onPress: () => goToNextQuestion(currentIndex),
          tone: "next",
          id: "next-question-btn",
        };

  const toggleSound = () => {
    const next = !muted;
    setMuted(next);
    setMute(next);
    if (!next) playSound.click();
  };

  const solved = answerStatus === "correct" || retypeOk;

  return (
    <div
      className="relative w-full mx-auto phone-land:grid phone-land:grid-cols-[minmax(0,1fr)_auto] phone-land:grid-rows-[auto_auto_1fr] phone-land:gap-x-4"
      id="workspace-layout"
    >
      <Confetti active={showConfetti} />

      {/* Barre du haut : retour au menu, progression, mode et chrono */}
      <div className="flex items-start justify-between gap-3 mb-2 max-sm:gap-2 max-sm:mb-1 phone-land:col-start-1 phone-land:gap-2 phone-land:mb-1">
        <button onClick={onQuit} className="btn h-11 px-4 max-sm:px-3 text-sm" id="quit-current-game">
          Menu
        </button>

        <span
          className={`h-11 px-4 flex items-center rounded-full text-ink font-black text-base select-none whitespace-nowrap tabular-nums max-sm:px-3 phone-land:px-3 ${
            currentQ.isRetry ? "bg-sugar" : "bg-paper-3"
          }`}
          id="question-counter"
          aria-label={
            currentQ.isRetry
              ? `Calcul revu, en plus des ${plannedCount}`
              : `Calcul ${plannedDone} sur ${plannedCount}`
          }
        >
          {currentQ.isRetry ? "En plus" : `${plannedDone} / ${plannedCount}`}
        </span>

        <div className="flex items-start gap-2">
          {settings.gameMode === GameMode.TIMED && (
            <ElapsedPill
              startedAt={startedAt}
              stoppedAt={stoppedAt}
              label={settings.sessionLabel ?? "Entraînement"}
            />
          )}

          {settings.gameMode === GameMode.CHALLENGE && (
            <ChallengePill startedAt={startedAt} stoppedAt={stoppedAt} limit={timeLimit} />
          )}

          {/* Couper ou remettre le son sans quitter la partie */}
          <button
            type="button"
            onClick={toggleSound}
            aria-pressed={muted}
            aria-label={muted ? "Remettre le son" : "Couper le son"}
            title={muted ? "Remettre le son" : "Couper le son"}
            className={`btn h-11 w-11 shrink-0 ${muted ? "text-muted" : ""}`}
            id="game-toggle-sound"
          >
            {muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
          </button>
        </div>
      </div>

      {/* Barre de progression : une bande de papier qui avance (temps restant en évaluation) */}
      <div className="w-full bg-paper-3 h-3 rounded-full mb-4 md:mb-5 overflow-hidden max-sm:mb-2 phone-land:col-start-1 phone-land:mb-2">
        {settings.gameMode === GameMode.CHALLENGE ? (
          <ChallengeBar startedAt={startedAt} stoppedAt={stoppedAt} limit={timeLimit} />
        ) : (
          <div
            className="bg-leaf h-full w-full origin-left transition-transform duration-300"
            style={{ transform: `scaleX(${plannedDone / plannedCount})` }}
          />
        )}
      </div>

      <div className="grid gap-4 md:gap-5 wide:grid-cols-[1fr_auto] wide:gap-7 wide:items-stretch max-sm:gap-2 phone-land:contents">
        {/* Calcul et correction */}
        <div className="flex flex-col gap-4 wide:justify-center max-sm:gap-2 phone-land:col-start-1 phone-land:justify-center phone-land:gap-2">
          <Sheet
            tone={solved ? "mintSoft" : isWrong ? "coralSoft" : "card"}
            torn="bottom"
            seed={5}
            className="px-4 pt-3 pb-5 md:px-6 md:pt-4 md:pb-7 text-center max-sm:px-2 max-sm:pt-2 max-sm:pb-3 phone-land:px-2 phone-land:pt-2 phone-land:pb-3"
          >
            {/* Mascotte et petit message, hauteur fixe */}
            <div className="flex items-center justify-center gap-3 h-[70px] md:h-20 mb-2 max-sm:h-11 max-sm:mb-1 max-sm:gap-2 max-sm:[&_svg]:size-11 short:hidden phone-land:hidden">
              <Mascot expression={getMascotExpression()} size={70} />
              <div className="min-w-[10rem] text-left">
                <AnimatePresence mode="wait">
                  <motion.p
                    key={message.key}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.12 }}
                    className={`font-black text-lg md:text-xl max-sm:text-base ${message.className}`}
                    id="mascot-message"
                  >
                    {message.text}
                  </motion.p>
                </AnimatePresence>
              </div>
            </div>

            {/* Le calcul, avec la case à remplir à la bonne place */}
            <Sheet tone="strip" torn="both" seed={9} radius="rounded-2xl" flat>
              <div
                className="flex items-center justify-center gap-3 md:gap-4 px-3 py-5 md:py-6 max-sm:gap-1.5 max-sm:px-1.5 max-sm:py-3 phone-land:gap-2 phone-land:py-3"
                id="current-math-calculation"
                data-missing={missing}
              >
                {missing === "factor1" ? answerBox : numberCell(currentQ.num1)}
                {sign("×")}
                {missing === "factor2" ? answerBox : numberCell(currentQ.num2)}
                {sign("=")}
                {missing === "product" ? answerBox : numberCell(product)}
              </div>
            </Sheet>
          </Sheet>

          {/* Correction : place réservée, pour que rien ne bouge quand elle apparaît. Quand le pavé est
              sous le calcul (portrait), elle passe au-dessus : le calcul reste collé au pavé. */}
          <div className="order-first wide:order-none phone-land:order-none min-h-[96px] max-sm:min-h-(--fix-h) phone-land:min-h-[88px] flex items-center justify-center" aria-live="polite">
            <AnimatePresence>
              {isWrong && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="w-full bg-error stock shadow-cut p-3 md:p-4 rounded-[20px] font-black text-ink flex flex-col items-center justify-center max-sm:px-2 max-sm:py-1.5 max-sm:rounded-2xl phone-land:px-2 phone-land:py-1.5 phone-land:rounded-2xl"
                  id="correction-helper"
                >
                  <div className="flex flex-wrap items-center justify-center gap-2 text-lg md:text-xl max-sm:text-sm max-sm:gap-x-1.5 max-sm:gap-y-0.5 phone-land:text-sm">
                    {/* La réponse de l'enfant, à côté de la bonne : il voit ce qui change (sans rature, illisible). */}
                    {wrongAnswer !== null ? (
                      <span>
                        La réponse n’est pas{" "}
                        <span className="tabular-nums" id="wrong-answer">
                          {wrongAnswer}
                        </span>
                        , mais :
                      </span>
                    ) : (
                      <span>La correction :</span>
                    )}
                    <span className="bg-ink text-paper px-3 py-0.5 rounded-full inline-block font-black tabular-nums">
                      {currentQ.num1} × {currentQ.num2} = {product}
                    </span>
                  </div>
                  <p className="text-sm font-bold mt-1 max-sm:text-xs max-sm:mt-0.5 max-sm:text-center phone-land:text-xs phone-land:mt-0.5 phone-land:text-center">
                    {retyping || retypeOk
                      ? `Tape ${currentQ.correctAnswer} pour continuer.${currentQ.isRetry ? "" : " Ce calcul reviendra un peu plus tard."}`
                      : "Mémorise-la bien avant de continuer !"}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Pavé numérique, toujours à la même place (à droite sur toute la hauteur, téléphone à l'horizontale) */}
        <div className="flex items-center justify-center phone-land:col-start-2 phone-land:row-start-1 phone-land:row-span-3">
          <Numpad
            onNumberPress={handleNumberPress}
            onBackspace={handleBackspace}
            onClear={handleClear}
            disabled={!canType}
            action={action}
          />
        </div>
      </div>
    </div>
  );
}
