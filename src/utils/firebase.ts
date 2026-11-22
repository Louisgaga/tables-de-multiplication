import { initializeApp } from "firebase/app";
import {
  connectAuthEmulator,
  getAuth,
  getRedirectResult,
  GoogleAuthProvider,
  signInWithCredential,
  signInWithPopup,
  signInWithRedirect,
} from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore/lite";
import firebaseConfig from "../../firebase-applet-config.json";

/** L'app est-elle ouverte depuis son icône sur l'écran d'accueil (plein écran) ? */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/**
 * Adresses servies par Firebase Hosting (le site et ses versions d'essai, en .web.app ou
 * .firebaseapp.com) : elles fournissent la page de connexion /__/auth/handler.
 */
const APP_HOST = /\.(web\.app|firebaseapp\.com)$/;

const onAppHost = typeof location !== "undefined" && APP_HOST.test(location.hostname);

/** Téléphone (iPhone, Android) : une fenêtre surgissante y devient un nouvel onglet. */
function isPhone(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPod|Android.+Mobile/i.test(navigator.userAgent);
}

/**
 * Connexion par redirection en plein écran (une fenêtre surgissante ne revient pas dans
 * l'app) et sur téléphone (la fenêtre devient un onglet où la connexion se perd).
 * Ailleurs (iPad dans Safari, ordinateur) : fenêtre surgissante.
 */
const useRedirect = onAppHost && (isStandalone() || isPhone());

const app = initializeApp({
  ...firebaseConfig,
  // Sur les adresses de l'app, la connexion passe par l'app elle-même (/__/auth/handler,
  // servi par Firebase Hosting) et non par <projet>.firebaseapp.com : Safari et
  // Chrome sur iPhone isolent les données d'un autre domaine, et la connexion échouait
  // (« missing initial state »). Chaque adresse doit figurer dans les URI de redirection
  // du client OAuth (voir le README).
  authDomain: onAppHost ? location.hostname : firebaseConfig.authDomain,
});

// La base est celle de firestoreDatabaseId : « (default) », ou une base nommée.
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

/**
 * Mode test (npm run emulators, puis npm run dev:test) : l'app parle aux émulateurs Firebase
 * de l'ordinateur, jamais à la vraie base. Dans la console du navigateur,
 * __signInAs("Famille Test") connecte un faux compte Google. Absent de la version publiée.
 */
if (import.meta.env.DEV && import.meta.env.VITE_EMULATORS === "1") {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8181);
  (window as Window & { __signInAs?: (name: string) => Promise<unknown> }).__signInAs = (name: string) => {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const claims = { sub: slug, email: `${slug}@example.com`, name, email_verified: true };
    return signInWithCredential(auth, GoogleAuthProvider.credential(JSON.stringify(claims)));
  };
}

const googleProvider = new GoogleAuthProvider();
// Toujours proposer le choix du compte : indispensable sur un iPad partagé.
googleProvider.setCustomParameters({ prompt: "select_account" });

/**
 * Ouvre la connexion Google avec le choix du compte. Sert aussi à changer de joueur :
 * se connecter avec un autre compte remplace simplement le joueur actuel.
 * À appeler directement depuis un appui, sans attente avant : sinon Safari bloque la fenêtre.
 */
export function signInWithGoogle(): Promise<unknown> {
  return useRedirect ? signInWithRedirect(auth, googleProvider) : signInWithPopup(auth, googleProvider);
}

/** Résultat d'une connexion par redirection, à lire au démarrage (erreur éventuelle). */
export function completeRedirectSignIn(): Promise<unknown> {
  return useRedirect ? getRedirectResult(auth) : Promise.resolve(null);
}

/** Codes d'erreur qui correspondent à un abandon volontaire, à ne pas signaler. */
export function isCancelledSignIn(err: unknown): boolean {
  const code = (err as { code?: string })?.code ?? "";
  return code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request";
}
