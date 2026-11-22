/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "1" : l'app de développement utilise les émulateurs Firebase (npm run dev:test). */
  readonly VITE_EMULATORS?: string;
}
