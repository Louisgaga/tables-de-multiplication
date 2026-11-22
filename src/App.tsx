import { lazy, ReactNode, Suspense, useEffect, useRef, useState } from "react";
import { GameMode, GameSettings, Profile, QuestionResult } from "./types";
import ConfigureGame from "./components/ConfigureGame";
import CountDownScreen from "./components/CountDownScreen";
import PlayGame from "./components/PlayGame";
import GameResults from "./components/GameResults";
import ProfilePicker from "./components/ProfilePicker";
import { Modal, ProfileForm, WipeProfileConfirm } from "./components/ProfileForm";
// Rapport et records : chargés à part, seulement quand on en a besoin.
const loadReport = () => import("./components/Report");
const loadLeaderboard = () => import("./components/Leaderboard");
const Report = lazy(loadReport);
const Leaderboard = lazy(loadLeaderboard);

/** Pendant le chargement d'un écran : une carte vide de la même allure, sans saut. */
function ScreenLoading() {
  return (
    <div className="w-full sheet p-10 flex items-center justify-center">
      <div className="h-10 w-10 rounded-full border-4 border-ink border-t-transparent animate-spin" aria-label="Chargement" />
    </div>
  );
}
import { motion, AnimatePresence, MotionConfig } from "motion/react";
import { auth, completeRedirectSignIn, isCancelledSignIn, signInWithGoogle } from "./utils/firebase";
import { signOut, onAuthStateChanged, User } from "firebase/auth";
import { LogIn, LogOut, RefreshCw } from "lucide-react";
import { Avatar } from "./components/paper";
import {
  History,
  SaveStatus,
  adoptGuestGames,
  clearOps,
  clearScores,
  declineGuestOffer,
  guestGamesToOffer,
  loadHistory,
  mergeById,
  saveGame,
} from "./utils/history";
import { Achievements, buildFocusSession, buildGameRecord, computeAchievements } from "./utils/stats";
import {
  cleanName,
  createProfile,
  deleteProfile,
  historyFor,
  loadProfiles,
  resetProfile,
  updateProfile,
} from "./utils/profiles";
import { playSound } from "./utils/audio";

type AppScreen = "CONFIG" | "COUNTDOWN" | "PLAY" | "RESULTS" | "LEADERBOARD" | "REPORT";

const EMPTY_HISTORY: History = { ops: [], scores: [] };

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<AppScreen>("CONFIG");
  const [settings, setSettings] = useState<GameSettings | null>(null);
  const [results, setResults] = useState<QuestionResult[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [history, setHistory] = useState<History>(EMPTY_HISTORY);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(true);
  const [cloudReachable, setCloudReachable] = useState<boolean>(true);
  const [saveStatus, setSaveStatus] = useState<SaveStatus | null>(null);
  const [achievements, setAchievements] = useState<Achievements | null>(null);
  const [guestOffer, setGuestOffer] = useState<number>(0);
  const [authError, setAuthError] = useState<string | null>(null);

  // Profils des enfants du compte connecté (null : pas de compte, ou pas encore chargés),
  // enfant qui joue, et écran « Qui joue ? ».
  const [profiles, setProfiles] = useState<Profile[] | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [profileDialog, setProfileDialog] = useState<
    | { kind: "add" }
    | { kind: "edit"; profile: Profile }
    | { kind: "reset"; profile: Profile }
    | { kind: "delete"; profile: Profile }
    | null
  >(null);
  // L'app est restée longtemps en arrière-plan : on redemande qui joue.
  const [backAfterIdle, setBackAfterIdle] = useState(false);

  // Joueur dont l'historique est affiché (null = invité). Sert à ignorer la
  // réponse d'un chargement lancé pour un joueur qui n'est plus le bon.
  const ownerRef = useRef<string | null>(null);
  // Parties jouées depuis le dernier chargement : si celui-ci se termine après
  // une partie, elles sont rajoutées au résultat au lieu d'être écrasées.
  const sessionRef = useRef<History>(EMPTY_HISTORY);

  // Une fois l'accueil affiché, on charge en avance le rapport et les records,
  // pour qu'ils s'ouvrent sans attente.
  useEffect(() => {
    const prefetch = () => {
      loadReport().catch(() => {});
      loadLeaderboard().catch(() => {});
    };
    const w = window as Window & { requestIdleCallback?: (cb: () => void) => number };
    if (w.requestIdleCallback) w.requestIdleCallback(prefetch);
    else setTimeout(prefetch, 2000);
  }, []);

  // Chaque écran s'ouvre par le haut (des résultats vers le rapport, par exemple).
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [currentScreen]);

  // L'historique est chargé une fois par joueur : à l'ouverture, puis à chaque
  // connexion ou déconnexion. Les parties suivantes sont ajoutées en mémoire.
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      const uid = currentUser?.uid ?? null;
      ownerRef.current = uid;
      sessionRef.current = EMPTY_HISTORY;
      setUser(currentUser);
      setHistory(EMPTY_HISTORY);
      setLoadingHistory(true);
      setCloudReachable(true);
      setGuestOffer(0);
      setProfiles(null);
      setProfileId(null);
      setPickerOpen(false);
      setProfileDialog(null);

      // « Qui joue ? » à chaque ouverture dès qu'il y a plusieurs enfants ; un seul : choisi d'office.
      if (uid) {
        loadProfiles(uid).then(({ profiles: loaded }) => {
          if (ownerRef.current !== uid) return;
          setProfiles(loaded);
          if (loaded.length === 1) setProfileId(loaded[0].id);
          else if (loaded.length > 1) setPickerOpen(true);
        });
      }

      loadHistory(uid, currentUser?.displayName ?? "")
        .then((loaded) => {
          if (ownerRef.current !== uid) return;
          setHistory({
            ops: mergeById(loaded.ops, sessionRef.current.ops),
            scores: mergeById(loaded.scores, sessionRef.current.scores),
          });
          setCloudReachable(uid ? loaded.cloudReachable : true);
          if (uid) setGuestOffer(guestGamesToOffer());
        })
        .catch((err) => console.error("Chargement de l’historique impossible", err))
        .finally(() => {
          if (ownerRef.current === uid) setLoadingHistory(false);
        });
    });
    return unsubscribe;
  }, []);

  // Sur l'iPad, l'onglet reste ouvert : après 15 minutes en arrière-plan, on redemande qui joue.
  useEffect(() => {
    let hiddenAt: number | null = null;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
      } else if (hiddenAt !== null) {
        if (Date.now() - hiddenAt > 15 * 60 * 1000) setBackAfterIdle(true);
        hiddenAt = null;
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => {
    if (!backAfterIdle) return;
    setBackAfterIdle(false);
    // Jamais au milieu d'une partie.
    if (profiles && profiles.length > 1 && currentScreen !== "PLAY" && currentScreen !== "COUNTDOWN") {
      setPickerOpen(true);
    }
  }, [backAfterIdle, profiles, currentScreen]);

  // Retour d'une connexion par redirection (téléphone, ou app ouverte depuis l'écran d'accueil).
  useEffect(() => {
    completeRedirectSignIn().catch((err) => {
      console.error("Connexion par redirection impossible", err);
      setAuthError((err as { code?: string })?.code ?? "inconnue");
    });
  }, []);

  // Enfant qui joue, et son historique (extrait de celui du compte). Sans compte : l'invité.
  const currentProfile = profiles?.find((p) => p.id === profileId) ?? null;
  const playerHistory: History =
    user && profiles && currentProfile ? historyFor(history, currentProfile.id, profiles) : history;
  const playerName = currentProfile?.name ?? user?.displayName ?? "";
  // Préférences mémorisées sur l'appareil : le profil legacy garde celles du compte.
  const playerKey = !user
    ? "guest"
    : currentProfile && !currentProfile.legacy
    ? `${user.uid}:${currentProfile.id}`
    : user.uid;

  /** Retire de l'affichage des parties et réponses effacées. */
  const forget = (gone: History) => {
    const opIds = new Set(gone.ops.map((o) => o.id));
    const scoreIds = new Set(gone.scores.map((s) => s.id));
    const keep = (h: History): History => ({
      ops: h.ops.filter((o) => !opIds.has(o.id)),
      scores: h.scores.filter((s) => !scoreIds.has(s.id)),
    });
    sessionRef.current = keep(sessionRef.current);
    setHistory(keep);
  };

  const chooseProfile = (profile: Profile) => {
    setProfileId(profile.id);
    setPickerOpen(false);
    setCurrentScreen("CONFIG");
  };

  // Connexion, ou changement de compte : le choix du compte Google s'ouvre à chaque fois.
  // Appelé directement depuis l'appui, sans attente avant, pour que Safari ouvre la fenêtre.
  const handleSignIn = () => {
    playSound.click();
    setAuthError(null);
    signInWithGoogle().catch((err) => {
      if (isCancelledSignIn(err)) return;
      console.error("Connexion impossible", err);
      setAuthError((err as { code?: string })?.code ?? "inconnue");
    });
  };

  const handleSignOut = async () => {
    playSound.click();
    try {
      await signOut(auth);
    } catch (err) {
      console.error("Sign out failed", err);
    }
  };

  const handleStartGame = (gameSettings: GameSettings) => {
    setSettings(gameSettings);
    setCurrentScreen("COUNTDOWN");
  };

  const handleCountdownFinish = () => {
    setCurrentScreen("PLAY");
  };

  const handleGameFinish = (gameResults: QuestionResult[]) => {
    setResults(gameResults);
    setSaveStatus(null);
    setAchievements(null);
    setCurrentScreen("RESULTS");

    if (!settings || gameResults.length === 0) return;

    const uid = user?.uid ?? null;
    const displayName = playerName;
    const record = buildGameRecord(gameResults, settings.gameMode, settings.selectedTables, {
      uid: user?.uid,
      displayName: displayName || undefined,
      profileId: currentProfile?.id,
    });
    const score = record.score;
    const ops = record.ops;
    if (ops.length > 0) setAchievements(computeAchievements(playerHistory.ops, ops));

    sessionRef.current = {
      ops: [...sessionRef.current.ops, ...ops],
      scores: [...sessionRef.current.scores, score],
    };
    setHistory((prev) => ({ ops: [...prev.ops, ...ops], scores: [...prev.scores, score] }));

    saveGame(uid, displayName, { ops, scores: [score] }).then((status) => {
      if (ownerRef.current === uid) setSaveStatus(status);
    });
  };

  const handleReplay = () => {
    if (!settings) {
      setCurrentScreen("CONFIG");
      return;
    }
    // Points faibles et session rapide : nouveau choix de calculs, avec l'historique à jour.
    if (settings.focus) {
      const size = typeof settings.questionCount === "number" ? settings.questionCount : 20;
      const plan = buildFocusSession(playerHistory.ops, size, Math.random, { extraHoles: settings.missingFactors });
      setSettings({ ...settings, fixedQuestions: plan.questions, selectedTables: plan.tables, questionCount: plan.questions.length });
    }
    setCurrentScreen("COUNTDOWN");
  };

  const handleMainMenu = () => {
    setCurrentScreen("CONFIG");
  };

  // Remise à zéro de l'invité (sans compte, donc sans « Gérer les profils ») : tout ce qui est
  // sur l'appareil. Pour un enfant d'un compte, elle se fait dans « Gérer les profils ».
  const handleResetGuest = async () => {
    const all = history;
    forget(all);
    try {
      await clearOps(null, all.ops);
      await clearScores(null, all.scores);
    } catch (err) {
      console.error("Remise à zéro impossible", err);
    }
  };

  const handleAdoptGuestGames = async () => {
    if (!user || !currentProfile) return;
    playSound.click();
    setGuestOffer(0);
    const uid = user.uid;
    const adopted = await adoptGuestGames(uid, currentProfile.name, currentProfile.id);
    if (ownerRef.current !== uid) return;
    setHistory((prev) => ({
      ops: mergeById(prev.ops, adopted.ops),
      scores: mergeById(prev.scores, adopted.scores),
    }));
  };

  const handleDeclineGuestGames = () => {
    playSound.click();
    declineGuestOffer();
    setGuestOffer(0);
  };

  const firstName = user?.displayName?.split(" ")[0] ?? "";

  // « Changer de joueur » : l'écran « Qui joue ? » du compte (pas la fenêtre Google).
  const openPicker = () => {
    playSound.click();
    if (profiles) setPickerOpen(true);
    else handleSignIn();
  };

  // Compte connecté sans enfant choisi : chargement, premier profil, ou « Qui joue ? ».
  let profileGate: ReactNode = null;
  if (user) {
    const oldScores = history.scores.filter((s) => !s.profileId).length;
    const hasOldGames = oldScores > 0 || history.ops.some((o) => !o.profileId);
    if (profiles === null || (profiles.length === 0 && loadingHistory)) {
      profileGate = <ScreenLoading />;
    } else if (profiles.length === 0) {
      profileGate = (
        <div className="max-w-lg mx-auto">
          <ProfileForm
            key={`first-${user.uid}`}
            id="first-profile"
            title={hasOldGames ? "Ces parties, c’est à qui ?" : "Qui va jouer ?"}
            intro={
              hasOldGames
                ? `${oldScores > 1 ? `${oldScores} parties ont` : oldScores === 1 ? "Une partie a" : "Des parties ont"} déjà été jouées avec ce compte. Écris le prénom de l’enfant qui les a jouées : elles iront dans son profil.`
                : "Ajoute le premier enfant qui va jouer. Tu pourras en ajouter d’autres ensuite."
            }
            submitLabel={hasOldGames ? "Créer son profil" : "Ajouter"}
            initial={{ name: hasOldGames ? cleanName(firstName) : "" }}
            others={[]}
            onSubmit={async (values) => {
              const uid = user.uid;
              const created = await createProfile(uid, [], values);
              if (ownerRef.current !== uid) return;
              setProfiles([created]);
              chooseProfile(created);
            }}
            footer={
              <button
                type="button"
                onClick={handleSignOut}
                className="h-11 text-sm font-black text-info-ink underline underline-offset-2 cursor-pointer"
              >
                Ce n’est pas le bon compte ? Se déconnecter
              </button>
            }
          />
        </div>
      );
    } else if (pickerOpen || !currentProfile) {
      profileGate = (
        <ProfilePicker
          profiles={profiles}
          currentId={profileId}
          accountName={user.displayName || user.email || "Compte Google"}
          onChoose={chooseProfile}
          onAdd={() => setProfileDialog({ kind: "add" })}
          onEdit={(profile) => setProfileDialog({ kind: "edit", profile })}
          onReset={(profile) => setProfileDialog({ kind: "reset", profile })}
          onDelete={(profile) => setProfileDialog({ kind: "delete", profile })}
          onSwitchAccount={handleSignIn}
        />
      );
    }
  }
  /**
   * Pendant la partie, l'en-tête disparaît partout : le téléphone garde toute sa hauteur pour le
   * calcul et le pavé, et sur iPad l'enfant ne peut pas toucher « Se connecter » en plein calcul.
   */
  const immersive = currentScreen === "PLAY" || currentScreen === "COUNTDOWN";

  return (
    // Réglage « Réduire les animations » de l'appareil : les mouvements deviennent de simples fondus.
    <MotionConfig reducedMotion="user">
    <div className="min-h-dvh w-full bg-paper flex flex-col items-center px-4 md:px-6 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] max-sm:px-3 max-sm:pt-[max(0.5rem,env(safe-area-inset-top))] max-sm:pb-[max(0.5rem,env(safe-area-inset-bottom))] phone-land:pt-[max(0.5rem,env(safe-area-inset-top))] phone-land:pb-[max(0.5rem,env(safe-area-inset-bottom))] phone-land:pl-[max(1rem,env(safe-area-inset-left))] phone-land:pr-[max(1rem,env(safe-area-inset-right))] wide:pt-[max(0.75rem,env(safe-area-inset-top))] wide:pb-[max(0.75rem,env(safe-area-inset-bottom))] font-sans">
      <header
        className={`w-full max-w-3xl wide:max-w-6xl flex justify-between items-center gap-3 mb-3 select-none max-sm:gap-2 ${
          immersive ? "hidden" : ""
        }`}
      >
        <div className="flex items-center gap-3 max-sm:gap-2">
          <div className="w-11 h-11 md:w-12 md:h-12 bg-ink stock rounded-2xl flex items-center justify-center shadow-cut -rotate-3" aria-hidden="true">
            <span className="text-accent text-3xl font-black leading-none">×</span>
          </div>
          {/*
            Nom de l’app. Le titre laisse la place au prénom et aux boutons quand un compte est connecté :
            masqué sur téléphone, « Mes tables » seul sur iPad en portrait. Sans compte, sur téléphone,
            « Mes tables » seul aussi.
          */}
          <h1 className={`text-2xl md:text-3xl font-black tracking-tight text-ink max-sm:text-xl ${user ? "max-sm:hidden" : ""}`}>
            Mes tables
            <span className={user ? "hidden wide:inline" : "max-sm:hidden"}> de Multiplication</span>
          </h1>
        </div>

        {user ? (
          <div className="flex items-start gap-2">
            {currentProfile && (
              <>
                <div
                  className="h-11 pl-1.5 pr-3 md:pr-4 rounded-full bg-paper-3 flex items-center gap-2 text-sm md:text-base font-black text-ink max-w-[12rem] max-sm:max-w-[8rem]"
                  id="player-pill"
                >
                  <Avatar avatar={currentProfile.avatar} name={currentProfile.name} size={32} />
                  <span className="truncate">{currentProfile.name}</span>
                </div>
                <button
                  onClick={openPicker}
                  className="btn h-11 px-3 md:px-4 whitespace-nowrap text-sm"
                  id="switch-player"
                >
                  <RefreshCw size={16} className="stroke-[2.5]" />
                  <span className="hidden sm:inline">Changer de joueur</span>
                  <span className="sm:hidden">Changer</span>
                </button>
              </>
            )}
            <button
              onClick={handleSignOut}
              className="btn h-11 w-11 text-muted"
              aria-label="Se déconnecter"
              title="Se déconnecter"
              id="sign-out"
            >
              <LogOut size={18} className="stroke-[2.5]" />
            </button>
          </div>
        ) : (
          <button
            onClick={handleSignIn}
            className="btn h-11 px-4 max-sm:px-3 whitespace-nowrap text-sm md:text-base"
            id="sign-in"
          >
            <LogIn size={18} className="stroke-[2.5]" />
            Se connecter
          </button>
        )}
      </header>

      {authError && (
        <div
          className="w-full max-w-3xl wide:max-w-6xl mb-2 px-4 py-2 rounded-2xl bg-error-soft stock text-ink text-sm font-bold flex items-center justify-between gap-3"
          id="auth-error"
        >
          <span>La connexion n’a pas abouti (erreur : {authError}).</span>
          <button
            onClick={() => setAuthError(null)}
            className="btn h-11 px-3 shrink-0 text-sm"
          >
            Fermer
          </button>
        </div>
      )}

      {user && !loadingHistory && !cloudReachable && (
        <p
          className="w-full max-w-3xl wide:max-w-6xl mb-2 px-4 py-2 rounded-2xl bg-strip stock text-ink text-sm font-bold text-center"
          id="offline-notice"
        >
          Pas de connexion pour le moment : ton historique en ligne n’est pas affiché. Tes
          parties sont gardées sur cet appareil et seront envoyées plus tard.
        </p>
      )}

      {/* Primary Transition Stage */}
      <main className="w-full flex-grow flex items-center justify-center">
        <div className="w-full max-w-3xl wide:max-w-6xl relative">
          {profileGate ?? (
            <AnimatePresence mode="wait">
              {currentScreen === "CONFIG" && (
                <motion.div
                  key="config"
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -15 }}
                  transition={{ duration: 0.25 }}
                >
                  <ConfigureGame
                    history={playerHistory.ops}
                    scores={playerHistory.scores}
                    playerKey={playerKey}
                    playerName={currentProfile?.name}
                    onStartGame={handleStartGame}
                    onViewLeaderboard={() => setCurrentScreen("LEADERBOARD")}
                    onViewReport={() => setCurrentScreen("REPORT")}
                  />
                </motion.div>
              )}

              {currentScreen === "REPORT" && (
                <motion.div
                  key="report"
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -15 }}
                  transition={{ duration: 0.25 }}
                >
                  <Suspense fallback={<ScreenLoading />}>
                    <Report
                      responses={playerHistory.ops}
                      scores={playerHistory.scores}
                      onBack={handleMainMenu}
                      onReset={user ? undefined : handleResetGuest}
                    />
                  </Suspense>
                </motion.div>
              )}

              {currentScreen === "COUNTDOWN" && (
                <motion.div
                  key="countdown"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25 }}
                >
                  <CountDownScreen onFinish={handleCountdownFinish} />
                </motion.div>
              )}

              {currentScreen === "PLAY" && settings && (
                <motion.div
                  key="play"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25 }}
                >
                  <PlayGame
                    settings={settings}
                    onFinish={handleGameFinish}
                    onQuit={handleMainMenu}
                    opResponses={playerHistory.ops}
                    playerName={currentProfile?.name}
                  />
                </motion.div>
              )}

              {currentScreen === "RESULTS" && settings && (
                <motion.div
                  key="results"
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -15 }}
                  transition={{ duration: 0.25 }}
                >
                  <GameResults
                    results={results}
                    gameMode={settings.gameMode}
                    selectedTables={settings.selectedTables}
                    saveStatus={saveStatus}
                    achievements={achievements}
                    onReplay={handleReplay}
                    onMainMenu={handleMainMenu}
                    onViewReport={() => setCurrentScreen("REPORT")}
                  />
                </motion.div>
              )}

              {currentScreen === "LEADERBOARD" && (
                <motion.div
                  key="leaderboard"
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -15 }}
                  transition={{ duration: 0.25 }}
                >
                  <Suspense fallback={<ScreenLoading />}>
                    <Leaderboard
                      scores={playerHistory.scores}
                      loading={loadingHistory}
                      onBack={handleMainMenu}
                    />
                  </Suspense>
                </motion.div>
              )}
            </AnimatePresence>
          )}
        </div>
      </main>

      {/* Ajout, modification et suppression d'un profil */}
      <AnimatePresence>
        {user && profiles && profileDialog?.kind === "add" && (
          <Modal key="add-profile" id="add-profile-dialog">
            <ProfileForm
              title="Ajouter un enfant"
              submitLabel="Ajouter"
              others={profiles}
              onCancel={() => setProfileDialog(null)}
              onSubmit={async (values) => {
                const created = await createProfile(user.uid, profiles, values);
                setProfiles((prev) => [...(prev ?? []), created]);
                setProfileDialog(null);
              }}
            />
          </Modal>
        )}
        {user && profiles && profileDialog?.kind === "edit" && (
          <Modal key="edit-profile" id="edit-profile-dialog">
            <ProfileForm
              title="Modifier le profil"
              submitLabel="Enregistrer"
              initial={profileDialog.profile}
              others={profiles.filter((p) => p.id !== profileDialog.profile.id)}
              onCancel={() => setProfileDialog(null)}
              onSubmit={async (values) => {
                setProfiles(await updateProfile(user.uid, profiles, profileDialog.profile.id, values));
                setProfileDialog(null);
              }}
            />
          </Modal>
        )}
        {user && profiles && profileDialog?.kind === "reset" && (
          <Modal key="reset-profile" id="reset-profile-dialog">
            <WipeProfileConfirm
              mode="reset"
              profile={profileDialog.profile}
              games={historyFor(history, profileDialog.profile.id, profiles).scores.length}
              onCancel={() => setProfileDialog(null)}
              onConfirm={async () => {
                forget(await resetProfile(user.uid, profiles, profileDialog.profile, history));
                setProfileDialog(null);
              }}
            />
          </Modal>
        )}
        {user && profiles && profileDialog?.kind === "delete" && (
          <Modal key="delete-profile" id="delete-profile-dialog">
            <WipeProfileConfirm
              mode="delete"
              profile={profileDialog.profile}
              games={historyFor(history, profileDialog.profile.id, profiles).scores.length}
              onCancel={() => setProfileDialog(null)}
              onConfirm={async () => {
                const gone = historyFor(history, profileDialog.profile.id, profiles);
                const remaining = await deleteProfile(user.uid, profiles, profileDialog.profile, history);
                forget(gone);
                setProfiles(remaining);
                if (profileId === profileDialog.profile.id) setProfileId(null);
                setProfileDialog(null);
              }}
            />
          </Modal>
        )}
      </AnimatePresence>


      {/* Parties jouées sans compte sur cet appareil : à qui sont-elles ? */}
      <AnimatePresence>
        {user && currentProfile && !pickerOpen && guestOffer > 0 && (
          <div
            className="fixed inset-0 bg-ink/60 z-50 flex items-center justify-center p-4"
            id="guest-offer-modal"
          >
            <motion.div
              initial={{ y: 12, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 12, opacity: 0 }}
              className="sheet p-6 max-w-sm w-full relative text-center"
            >
              <h3 className="text-xl font-black text-ink mb-2">
                {guestOffer > 1
                  ? `${guestOffer} parties ont été jouées sans compte`
                  : "Une partie a été jouée sans compte"}
              </h3>
              <p className="text-muted text-sm font-bold leading-relaxed mb-6">
                {`${currentProfile.name}, c’était toi ?`} Si oui, je{" "}
                {guestOffer > 1 ? "les" : "l'"}ajoute à ton historique.
              </p>
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={handleAdoptGuestGames}
                  className="btn btn-primary w-full h-12"
                  id="guest-offer-accept"
                >
                  Oui, c’était moi !
                </button>
                <button
                  type="button"
                  onClick={handleDeclineGuestGames}
                  className="btn w-full h-12"
                  id="guest-offer-decline"
                >
                  Non, ce n’était pas moi
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
    </MotionConfig>
  );
}
