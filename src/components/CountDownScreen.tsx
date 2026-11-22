import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import Mascot from "./Mascot";
import { Sheet } from "./paper";
import { playSound } from "../utils/audio";
import { COUNTDOWN_TIPS, pick } from "../utils/mascot";

interface CountDownScreenProps {
  onFinish: () => void;
}

const STEPS: (number | string)[] = [3, 2, 1, "C’est parti !"];
/** Durée d'affichage de chaque étape, en millisecondes. */
const STEP_MS = 800;
/** Le « C'est parti ! » reste un peu plus longtemps avant le début de la partie. */
const LAST_STEP_MS = 700;

export default function CountDownScreen({ onFinish }: CountDownScreenProps) {
  const [step, setStep] = useState(0);
  const [tip] = useState(() => pick(COUNTDOWN_TIPS));
  // Toujours la dernière version de onFinish, sans relancer le compte à rebours.
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;

  useEffect(() => {
    const value = STEPS[step];
    if (typeof value === "number") playSound.tick();
    else playSound.victory();

    const isLast = step === STEPS.length - 1;
    const timer = setTimeout(
      () => (isLast ? onFinishRef.current() : setStep(step + 1)),
      isLast ? LAST_STEP_MS : STEP_MS
    );
    return () => clearTimeout(timer);
  }, [step]);

  const value = STEPS[step];

  return (
    <div className="flex flex-col items-center justify-center max-w-sm mx-auto text-center" id="countdown-screen">
      <div className="mb-4 phone-land:mb-1 phone-land:[&_svg]:size-16">
        <Mascot expression="thinking" size={143} />
      </div>
      <h3 className="text-2xl font-black text-ink mb-4 phone-land:mb-2">Prépare-toi…</h3>
      {/* Le compte à rebours : le chiffre en grand sur une feuille poire. */}
      <Sheet tone="pear" torn="bottom" seed={17} className="w-full h-40 flex items-center justify-center phone-land:h-24">
        {/* Sortie très courte : chaque étape doit avoir le temps d'entrer avant la suivante. */}
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0, transition: { duration: 0.18 } }}
            exit={{ opacity: 0, y: -12, transition: { duration: 0.12 } }}
            className={`font-black text-accent-ink leading-none tabular-nums ${
              typeof value === "number" ? "text-8xl phone-land:text-6xl" : "text-4xl phone-land:text-3xl"
            }`}
            id={`countdown-value-${step}`}
            aria-live="assertive"
          >
            {value}
          </motion.div>
        </AnimatePresence>
      </Sheet>
      <p className="text-muted text-sm md:text-base font-bold mt-5 phone-land:mt-2">
        {tip}
      </p>
    </div>
  );
}
