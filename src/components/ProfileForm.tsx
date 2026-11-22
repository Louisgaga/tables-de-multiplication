/**
 * Formulaires des profils : créer ou modifier un profil (prénom et couleur de la pastille), et
 * confirmer la suppression d'un profil en écrivant son prénom.
 */
import { FormEvent, KeyboardEvent, ReactNode, useId, useState } from "react";
import { motion } from "motion/react";
import { Profile } from "../types";
import { AVATARS, cleanName, MAX_NAME, sameName } from "../utils/profiles";
import { playSound } from "../utils/audio";
import { Avatar, AVATAR_TONES, Sheet } from "./paper";

/** Fenêtre posée par-dessus l'écran : une feuille de carton sur un fond d'encre atténué. */
export function Modal({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <div className="fixed inset-0 bg-ink/60 z-50 flex items-center justify-center p-4 overflow-y-auto" id={id}>
      <motion.div
        initial={{ y: 12, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 12, opacity: 0 }}
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-md my-auto"
      >
        {children}
      </motion.div>
    </div>
  );
}

const LABEL = "block text-sm font-bold text-muted";
const ALERT = "mt-4 px-3 py-2 rounded-2xl bg-error-soft text-ink text-sm font-bold leading-snug";
const ACTION = "flex-1 h-12 px-4 max-sm:px-2 leading-tight";

interface ProfileFormProps {
  title: string;
  intro?: ReactNode;
  submitLabel: string;
  /** Valeurs de départ (modification, ou prénom proposé). */
  initial?: { name: string; avatar?: string };
  /** Les autres profils du compte : deux enfants ne peuvent pas avoir le même prénom. */
  others: Profile[];
  onSubmit: (values: { name: string; avatar: string }) => Promise<void>;
  /** Absent : on ne peut pas annuler (premier profil d'un compte). */
  onCancel?: () => void;
  /** Lien discret sous le formulaire (« Se déconnecter » au premier passage). */
  footer?: ReactNode;
  id?: string;
}

/** Prénom et couleur de la pastille d'un enfant. */
export function ProfileForm({ title, intro, submitLabel, initial, others, onSubmit, onCancel, footer, id }: ProfileFormProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [avatar, setAvatar] = useState(initial?.avatar ?? AVATARS[0]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const colourLabel = useId();

  const cleaned = cleanName(name);
  const duplicate = others.some((p) => sameName(p.name, cleaned));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!cleaned) return setError("Écris un prénom.");
    if (duplicate) return setError("Ce prénom existe déjà dans ce compte.");
    playSound.click();
    setSaving(true);
    setError(null);
    try {
      await onSubmit({ name: cleaned, avatar });
    } catch (err) {
      console.error("Enregistrement du profil impossible", err);
      setError("Impossible d’enregistrer : vérifie la connexion internet, puis réessaie.");
      setSaving(false);
    }
  };

  /** La pastille qui reçoit le focus au clavier : celle qui est choisie, sinon la première. */
  const reachable = Math.max(AVATARS.indexOf(avatar), 0);

  /** Groupe de boutons radio : les flèches passent d'une couleur à la suivante. */
  const pickByKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const forward = e.key === "ArrowRight" || e.key === "ArrowDown";
    const backward = e.key === "ArrowLeft" || e.key === "ArrowUp";
    if (!forward && !backward) return;
    e.preventDefault();
    const next = (reachable + (forward ? 1 : -1) + AVATARS.length) % AVATARS.length;
    playSound.click();
    setAvatar(AVATARS[next]);
    e.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]')[next]?.focus();
  };

  return (
    <form onSubmit={submit} className="sheet w-full p-6 max-sm:p-5" id={id}>
      <h3 className="text-2xl font-black text-ink leading-tight">{title}</h3>
      {intro && <div className="mt-2 text-muted text-base font-bold leading-snug">{intro}</div>}

      <label className="block mt-5">
        <span className={LABEL}>Prénom</span>
        <input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
          maxLength={MAX_NAME + 10}
          autoComplete="off"
          autoCapitalize="words"
          enterKeyHint="done"
          className="field mt-1 text-lg"
          id="profile-name"
        />
      </label>

      {/* Douze papiers de couleur : chaque pastille porte déjà l'initiale de l'enfant. */}
      <div className="mt-4">
        <span className={LABEL} id={colourLabel}>
          Ta couleur
        </span>
        <div
          role="radiogroup"
          aria-labelledby={colourLabel}
          onKeyDown={pickByKey}
          className="mt-2 grid grid-cols-6 max-sm:grid-cols-4 gap-2 justify-items-center"
        >
          {AVATARS.map((a, i) => (
            <button
              key={a}
              type="button"
              role="radio"
              aria-checked={avatar === a}
              aria-label={`Couleur ${AVATAR_TONES[i].name}`}
              tabIndex={i === reachable ? 0 : -1}
              onClick={() => {
                playSound.click();
                setAvatar(a);
              }}
              className={`h-12 w-12 rounded-full bg-none flex items-center justify-center cursor-pointer transition-[translate] duration-150 active:translate-y-0.5 ${
                avatar === a ? "ring-3 ring-ink" : ""
              }`}
            >
              <Avatar avatar={a} name={name} size={44} />
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p className={ALERT} role="alert">
          {error}
        </p>
      )}

      <div className="mt-6 flex gap-3">
        {onCancel && (
          <button type="button" onClick={onCancel} className={`btn ${ACTION}`}>
            Annuler
          </button>
        )}
        <button type="submit" disabled={saving} className={`btn btn-primary ${ACTION}`} id="profile-submit">
          {saving ? "Un instant…" : submitLabel}
        </button>
      </div>
      {footer && <div className="mt-4 text-center">{footer}</div>}
    </form>
  );
}

interface WipeProfileProps {
  /** « delete » : le profil disparaît ; « reset » : il reste, ses parties et réponses sont effacées. */
  mode: "delete" | "reset";
  profile: Profile;
  games: number;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}

/**
 * Suppression ou remise à zéro d'un profil : on écrit le prénom de l'enfant pour confirmer,
 * ce qui évite qu'un enfant efface par erreur les données de son frère ou de sa sœur.
 * La question est posée sur une bande de papier corail déchirée, le seul moment fort de la fenêtre.
 */
export function WipeProfileConfirm({ mode, profile, games, onConfirm, onCancel }: WipeProfileProps) {
  const reset = mode === "reset";
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const matches = sameName(typed, profile.name);

  const confirm = async (e: FormEvent) => {
    e.preventDefault();
    if (!matches) return;
    playSound.click();
    setDeleting(true);
    setError(null);
    try {
      await onConfirm();
    } catch (err) {
      console.error(reset ? "Remise à zéro impossible" : "Suppression du profil impossible", err);
      setError(
        `${reset ? "La remise à zéro" : "La suppression"} n’a pas abouti : vérifie la connexion internet, puis réessaie.`
      );
      setDeleting(false);
    }
  };

  return (
    <form onSubmit={confirm} className="sheet w-full overflow-hidden" id={reset ? "reset-profile" : "delete-profile"}>
      <Sheet
        tone="coral"
        torn="bottom"
        seed={5}
        radius="rounded-none"
        flat
        className="flex items-center gap-4 px-6 pt-6 pb-7 max-sm:gap-3 max-sm:px-5 max-sm:pt-5"
      >
        <Avatar avatar={profile.avatar} name={profile.name} size={56} />
        <h3 className="min-w-0 text-2xl max-sm:text-xl font-black text-ink leading-tight break-words">
          {reset ? `Remettre ${profile.name} à zéro ?` : `Supprimer le profil de ${profile.name} ?`}
        </h3>
      </Sheet>

      <div className="px-6 pt-4 pb-6 max-sm:px-5 max-sm:pb-5">
        <p className="text-ink text-base font-bold leading-snug">
          {games > 0
            ? `Ses ${games} partie${games > 1 ? "s" : ""}, ses réponses, ses médailles et ses records seront effacés définitivement.`
            : reset
            ? "Ce profil n’a encore aucune partie."
            : "Ce profil n’a encore aucune partie. Il sera effacé définitivement."}
          {reset && " Son prénom et sa couleur sont gardés."}
        </p>

        <label className="block mt-5">
          <span className={LABEL}>Pour confirmer, écris « {profile.name} »</span>
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            autoCapitalize="words"
            className="field mt-1 text-lg"
            id={reset ? "reset-profile-name" : "delete-profile-name"}
          />
        </label>

        {error && (
          <p className={ALERT} role="alert">
            {error}
          </p>
        )}

        <div className="mt-6 flex gap-3">
          <button type="button" onClick={onCancel} className={`btn ${ACTION}`}>
            Annuler
          </button>
          <button
            type="submit"
            disabled={!matches || deleting}
            className={`btn btn-danger ${ACTION}`}
            id={reset ? "reset-profile-confirm" : "delete-profile-confirm"}
          >
            {deleting ? (reset ? "Remise à zéro…" : "Suppression…") : reset ? "Remettre à zéro" : "Supprimer"}
          </button>
        </div>
      </div>
    </form>
  );
}
