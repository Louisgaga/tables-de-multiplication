import { useEffect, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";

interface ConfettiParticle {
  id: number;
  x: number;
  y: number;
  size: number;
  color: string;
  angle: number;
  delay: number;
  /** Tirés une fois à la création : sinon chaque nouvel affichage changerait la forme et la durée. */
  round: boolean;
  duration: number;
}

interface ConfettiProps {
  active: boolean;
  count?: number;
}

/** Des chutes de papier aux couleurs du thème : les jetons de index.css, jamais une couleur en dur. */
const COLORS = [
  "var(--color-accent)", // poire
  "var(--color-error)", // corail
  "var(--color-success)", // menthe
  "var(--color-focus)", // bleu
  "var(--color-sand)", // sable
  "var(--color-sugar)", // papier sucre
  "var(--color-kraft)", // kraft
  "var(--color-coral)" // corail pâle
];

export default function Confetti({ active, count = 40 }: ConfettiProps) {
  const [particles, setParticles] = useState<ConfettiParticle[]>([]);
  // « Réduire les animations » : pas d'explosion de confettis, le son et le message suffisent.
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (active) {
      const newParticles = Array.from({ length: count }).map((_, i) => {
        const angle = Math.random() * Math.PI * 2;
        const velocity = 50 + Math.random() * 150;
        return {
          id: i + Date.now(),
          x: Math.cos(angle) * velocity,
          y: Math.sin(angle) * velocity - 100, // burst upwards slightly
          size: 8 + Math.random() * 12,
          color: COLORS[Math.floor(Math.random() * COLORS.length)],
          angle: Math.random() * 360,
          delay: Math.random() * 0.1,
          round: Math.random() > 0.4,
          duration: 1.8 + Math.random() * 1.0
        };
      });
      setParticles(newParticles);

      // Auto-clear after animations are done
      const timer = setTimeout(() => {
        setParticles([]);
      }, 3000);

      return () => clearTimeout(timer);
    } else {
      setParticles([]);
    }
  }, [active, count]);

  if (reduceMotion) return null;

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden flex items-center justify-center z-50">
      <AnimatePresence>
        {particles.map((p) => (
          <motion.div
            key={p.id}
            // Déplacement et opacité seulement : la chute ne grossit pas et ne tourne pas en vol.
            initial={{ opacity: 1, x: 0, y: 0 }}
            animate={{
              opacity: [1, 1, 0],
              x: p.x * 1.8,
              y: [0, p.y, p.y + 350] // burst up then fall with gravity
            }}
            exit={{ opacity: 0 }}
            transition={{
              duration: p.duration,
              ease: "easeOut",
              delay: p.delay
            }}
            style={{
              position: "absolute",
              width: p.size,
              height: p.size,
              borderRadius: p.round ? "50%" : "28%", // ronds et carrés aux coins arrondis
              backgroundColor: p.color,
              // Chaque chute est tournée une fois pour toutes. Pas d'ombre portée (elle tournerait avec
              // la chute) : un liseré d'encre très léger dessine le bord du papier.
              rotate: p.angle,
              boxShadow: "inset 0 0 0 1px color-mix(in oklab, var(--color-ink) 12%, transparent)"
            }}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}
