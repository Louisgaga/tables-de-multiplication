/**
 * « À propos » : ce que fait l'app, en quelques phrases, et le lien vers son code source.
 * Ouvert depuis « Qui joue ? ».
 */
import { ExternalLink } from "lucide-react";
import Mascot from "./Mascot";
import { Sheet } from "./paper";

export const SOURCE_URL = "https://github.com/Louisgaga/tables-de-multiplication";

export default function About({ onBack }: { onBack: () => void }) {
  return (
    <div className="w-full max-w-2xl mx-auto" id="about">
      {/* En-tête, à même le papier, comme les records. Sur téléphone, le titre passe sous le bouton. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-4 max-sm:mb-3">
        <button type="button" onClick={onBack} className="btn h-11 px-4 text-sm shrink-0" id="about-back">
          Retour
        </button>
        <h2 className="min-w-0 flex-1 max-sm:basis-full text-2xl md:text-3xl font-black text-ink">À propos</h2>
      </div>

      <Sheet tone="card" torn="bottom" seed={21} className="px-6 pt-6 pb-8 max-sm:px-4 max-sm:pt-5">
        <div className="flex items-start gap-5 max-sm:flex-col max-sm:items-center max-sm:gap-3">
          <div className="shrink-0" aria-hidden="true">
            <Mascot expression="wink" size={96} />
          </div>
          <div className="min-w-0 space-y-3 text-ink text-lg max-sm:text-base leading-relaxed text-pretty">
            <p>
              <strong className="font-black">Mes tables de Multiplication</strong> aide les enfants de 7 à 10 ans à
              apprendre leurs tables en jouant, sur iPad, sur téléphone ou sur ordinateur.
            </p>
            <p>
              Les parties sont courtes. Après une erreur, l’enfant recopie la bonne réponse, et le calcul revient un
              peu plus tard. L’app repropose les calculs qui résistent, et le rapport montre aux parents les progrès,
              table par table.
            </p>
            <p>
              Avec un compte Google, chaque enfant de la famille a son profil et retrouve ses parties sur tous les
              appareils. Sans compte, tout reste sur l’appareil.
            </p>
          </div>
        </div>

        <div className="mt-6 pt-5 border-t border-line">
          <h3 className="text-xl font-black text-ink">Code source</h3>
          <p className="mt-1 text-muted text-base font-bold leading-snug text-pretty">
            Le code de l’app est libre, sous licence MIT : on peut le lire, le copier ou installer sa propre version.
          </p>
          <a
            href={SOURCE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex min-h-11 items-center gap-2 text-info-ink font-black underline underline-offset-2 wrap-anywhere"
            id="about-source"
          >
            github.com/Louisgaga/tables-de-multiplication
            <ExternalLink size={16} className="shrink-0 stroke-[2.5]" aria-hidden="true" />
          </a>
        </div>
      </Sheet>
    </div>
  );
}
