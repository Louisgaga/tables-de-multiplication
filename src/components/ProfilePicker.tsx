/**
 * « Qui joue ? » : chaque enfant du compte choisit son profil. On peut aussi ajouter un enfant,
 * et, en mode gestion, renommer ou supprimer un profil.
 */
import { useState } from "react";
import { Pencil, RotateCcw, Trash2 } from "lucide-react";
import { Profile } from "../types";
import { MAX_PROFILES } from "../utils/profiles";
import { playSound } from "../utils/audio";
import { Avatar, Sheet } from "./paper";

interface ProfilePickerProps {
  profiles: Profile[];
  /** Profil en cours, s'il y en a un (mis en valeur). */
  currentId: string | null;
  /** Nom du compte Google connecté. */
  accountName: string;
  onChoose: (profile: Profile) => void;
  onAdd: () => void;
  onEdit: (profile: Profile) => void;
  onReset: (profile: Profile) => void;
  onDelete: (profile: Profile) => void;
  onSwitchAccount: () => void;
  onAbout: () => void;
}

/**
 * Une tuile de carton par enfant : 2 par ligne sur téléphone, 3 puis 4 au-delà. Une ligne
 * incomplète reste centrée. Le demi-pixel retiré évite qu'un arrondi fasse passer la dernière
 * tuile à la ligne.
 */
const TILE_SLOT =
  "flex min-w-0 basis-[calc((100%_-_0.75rem)_/_2_-_0.5px)] sm:basis-[calc((100%_-_1.5rem)_/_3_-_0.5px)] md:basis-[calc((100%_-_3rem)_/_4_-_0.5px)]";
const TILE = "btn w-full min-h-32 sm:min-h-44 flex-col p-3";

export default function ProfilePicker({
  profiles,
  currentId,
  accountName,
  onChoose,
  onAdd,
  onEdit,
  onReset,
  onDelete,
  onSwitchAccount,
  onAbout,
}: ProfilePickerProps) {
  const [managing, setManaging] = useState(false);
  const canAdd = profiles.length < MAX_PROFILES;

  return (
    <div className="w-full wide:max-w-4xl wide:mx-auto" id="profile-picker">
      {/* Le titre est posé à même le papier de la page. */}
      <h2 className="text-5xl max-sm:text-4xl font-black text-ink text-center leading-none">
        {managing ? "Gérer les profils" : "Qui joue ?"}
      </h2>
      <p className="mt-3 max-w-xl mx-auto text-muted text-lg max-sm:text-base font-bold text-center leading-snug text-pretty">
        {managing
          ? "Change le prénom ou la couleur d’un enfant, remets ses statistiques à zéro, ou supprime son profil."
          : "Touche ton prénom."}
      </p>

      {managing ? (
        /*
         * Gestion : une seule feuille, une ligne par enfant avec ses trois boutons. Une colonne
         * (8 lignes tiennent sur un iPad debout), deux sur un grand écran couché. Sur un petit
         * téléphone, les boutons passent sous le prénom plutôt que de l'écraser.
         */
        <Sheet
          tone="card"
          torn="bottom"
          seed={7}
          className="mt-6 max-w-xl mx-auto wide:max-w-none px-5 pt-2 pb-4 max-sm:px-3"
        >
          <ul className="grid grid-cols-1 wide:grid-cols-2 wide:gap-x-8">
            {profiles.map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2 border-t border-line first:border-t-0 wide:nth-2:border-t-0"
              >
                <div className="flex-auto min-w-0 flex items-center gap-3">
                  <Avatar avatar={p.avatar} name={p.name} size={44} />
                  <span className="min-w-0 text-lg font-black text-ink break-words leading-tight">{p.name}</span>
                </div>
                <div className="shrink-0 ml-auto flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      playSound.click();
                      onEdit(p);
                    }}
                    className="btn h-12 w-12"
                    aria-label={`Modifier le profil de ${p.name}`}
                    title="Modifier"
                    id={`edit-profile-${p.id}`}
                  >
                    <Pencil size={18} />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      playSound.click();
                      onReset(p);
                    }}
                    className="btn h-12 w-12"
                    aria-label={`Remettre ${p.name} à zéro`}
                    title="Remettre à zéro"
                    id={`reset-profile-${p.id}`}
                  >
                    <RotateCcw size={18} />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      playSound.click();
                      onDelete(p);
                    }}
                    className="btn h-12 w-12"
                    aria-label={`Supprimer le profil de ${p.name}`}
                    title="Supprimer"
                    id={`delete-profile-${p.id}`}
                  >
                    <Trash2 size={18} className="text-error-ink" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </Sheet>
      ) : (
        /* Choix : de grandes tuiles de carton, la pastille de l'enfant et son prénom. */
        <ul className="mt-6 flex flex-wrap justify-center gap-3 md:gap-4">
          {profiles.map((p) => (
            <li key={p.id} className={TILE_SLOT}>
              <button
                type="button"
                onClick={() => {
                  playSound.click();
                  onChoose(p);
                }}
                className={`${TILE} ${p.id === currentId ? "btn-chosen" : ""}`}
                id={`choose-profile-${p.id}`}
              >
                {/* La pastille prend sa taille en px : une petite pour le téléphone, une grande au-delà. */}
                <Avatar avatar={p.avatar} name={p.name} size={56} className="sm:hidden" />
                <Avatar avatar={p.avatar} name={p.name} size={80} className="max-sm:hidden" />
                <span className="w-full text-xl max-sm:text-lg font-black text-center break-words leading-tight">
                  {p.name}
                </span>
              </button>
            </li>
          ))}

          {canAdd && (
            <li className={TILE_SLOT}>
              <button
                type="button"
                onClick={() => {
                  playSound.click();
                  onAdd();
                }}
                className={TILE}
                id="add-profile"
              >
                {/* La place de la prochaine pastille : un rond en pointillés. */}
                <span
                  className="size-14 sm:size-20 shrink-0 rounded-full border-2 border-dashed border-muted flex items-center justify-center text-3xl sm:text-4xl font-black text-muted leading-none"
                  aria-hidden="true"
                >
                  +
                </span>
                <span className="w-full text-base font-black text-muted text-center leading-tight">
                  Ajouter un enfant
                </span>
              </button>
            </li>
          )}
        </ul>
      )}

      <div className="mt-6 pt-4 border-t border-line flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <button
          type="button"
          onClick={() => {
            playSound.click();
            setManaging(!managing);
          }}
          className={`btn h-12 px-5 text-sm ${managing ? "btn-primary" : ""}`}
          aria-pressed={managing}
          id="manage-profiles"
        >
          {managing ? "Terminé" : "Gérer les profils"}
        </button>

        <p className="min-w-0 text-sm font-bold text-muted flex flex-wrap items-center gap-x-2">
          <span className="min-w-0 wrap-anywhere">
            Compte : <span className="text-muted">{accountName}</span>
          </span>
          <button
            type="button"
            onClick={onSwitchAccount}
            className="h-11 bg-none underline underline-offset-2 text-info-ink font-black cursor-pointer"
            id="switch-account"
          >
            Changer de compte
          </button>
        </p>
      </div>

      <p className="mt-2 text-center">
        <button
          type="button"
          onClick={onAbout}
          className="h-11 px-2 bg-none underline underline-offset-2 text-info-ink text-sm font-black cursor-pointer"
          id="open-about"
        >
          À propos de l’app
        </button>
      </p>
    </div>
  );
}
