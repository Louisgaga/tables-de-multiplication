import { playSound } from "../utils/audio";
import { Delete } from "lucide-react";
import { Sheet } from "./paper";

export interface NumpadAction {
  label: string;
  onPress: () => void;
  /** Papier du bouton : validation (poire) ou passage au calcul suivant (encre). */
  tone: "validate" | "next";
  id: string;
  disabled?: boolean;
}

interface NumpadProps {
  onNumberPress: (num: number) => void;
  onBackspace: () => void;
  onClear: () => void;
  /** Gros bouton sous les chiffres. Il change de rôle sans que le pavé bouge. */
  action: NumpadAction;
  /** Chiffres et effacement inactifs (pendant l'affichage de la correction). */
  disabled?: boolean;
}

/** Touche du pavé : un carton qu'on enfonce. Sur téléphone, sa hauteur suit celle de l'écran. */
const KEY =
  "btn h-16 md:h-[76px] wide:h-20 max-sm:h-(--key-h) phone-land:h-(--key-h) select-none tabular-nums";

const ACTION_TONES: Record<NumpadAction["tone"], string> = {
  validate: "btn-primary",
  next: "btn-ink",
};

export default function Numpad({ onNumberPress, onBackspace, onClear, action, disabled = false }: NumpadProps) {
  const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9];

  const handlePress = (fn: () => void) => {
    if (disabled) return;
    playSound.click();
    fn();
  };

  return (
    // Le pavé est posé sur un tapis de papier sucre bleu, comme sur une table de découpage.
    <Sheet
      tone="sugar"
      torn="both"
      seed={21}
      className="w-full max-w-[420px] wide:w-[418px] mx-auto px-3 py-4 md:px-4 md:py-5 max-sm:px-2 max-sm:py-3 phone-land:w-[clamp(15rem,42vw,22rem)] phone-land:px-2 phone-land:py-3"
      id="numpad"
    >
      <div className="grid grid-cols-3 gap-x-2.5 gap-y-1.5 md:gap-x-3 md:gap-y-2 max-sm:gap-x-2 max-sm:gap-y-1 phone-land:gap-x-2 phone-land:gap-y-1">
        {digits.map((digit) => (
          <button
            key={digit}
            type="button"
            disabled={disabled}
            onClick={() => handlePress(() => onNumberPress(digit))}
            className={`${KEY} text-3xl md:text-4xl wide:text-[2.5rem]`}
            id={`numpad-btn-${digit}`}
          >
            {digit}
          </button>
        ))}

        <button
          type="button"
          disabled={disabled}
          onClick={() => handlePress(onClear)}
          className={`${KEY} text-2xl wide:text-[1.65rem] [--btn-bg:var(--color-strip)]`}
          aria-label="Effacer tout"
          id="numpad-btn-clear"
        >
          C
        </button>

        <button
          type="button"
          disabled={disabled}
          onClick={() => handlePress(() => onNumberPress(0))}
          className={`${KEY} text-3xl md:text-4xl wide:text-[2.5rem]`}
          id="numpad-btn-0"
        >
          0
        </button>

        <button
          type="button"
          disabled={disabled}
          onClick={() => handlePress(onBackspace)}
          className={`${KEY} [--btn-bg:var(--color-strip)]`}
          aria-label="Effacer le dernier chiffre"
          id="numpad-btn-backspace"
        >
          <Delete size={30} className="stroke-[2.5] wide:size-[33px]" />
        </button>
      </div>

      <button
        type="button"
        disabled={action.disabled}
        onClick={() => {
          if (action.disabled) return;
          playSound.click();
          action.onPress();
        }}
        className={`btn mt-1.5 md:mt-2 w-full h-16 md:h-[76px] wide:h-20 text-2xl wide:text-[1.65rem] select-none max-sm:mt-1 max-sm:h-14 max-sm:text-xl short:h-12 phone-land:mt-1 phone-land:h-12 phone-land:text-xl ${ACTION_TONES[action.tone]}`}
        id={action.id}
      >
        {action.label}
      </button>
    </Sheet>
  );
}
