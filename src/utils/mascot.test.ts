import { describe, expect, it } from "vitest";
import {
  FAST_PRAISES,
  MISTAKES,
  PRAISES,
  RETRY_PRAISES,
  TIMEOUTS,
  correctReaction,
  mistakeReaction,
  pick,
  promptText,
  resultsReview,
  streakReaction,
} from "./mascot";

const q78 = { num1: 7, num2: 8, correctAnswer: 56 };
const always = (v: number) => () => v;

describe("mascotte : erreurs", () => {
  it("nomme la cause probable d'une erreur", () => {
    expect(mistakeReaction(q78, 15).text).toBe("C’est un ×, pas un + !");
    expect(mistakeReaction(q78, 63).text).toBe("Une fois de trop !");
    expect(mistakeReaction(q78, 64).text).toBe("Une fois de trop !");
    expect(mistakeReaction(q78, 48).text).toBe("Il en manque une fois !");
    expect(mistakeReaction(q78, 49).text).toBe("Il en manque une fois !");
    expect(mistakeReaction(q78, 65).text).toBe("Chiffres inversés !");
    expect(mistakeReaction(q78, 57).text).toBe("Tout près !");
  });

  it("aide sur un calcul à trous", () => {
    const hole = { num1: 7, num2: 8, correctAnswer: 8, missing: "factor2" as const };
    expect(mistakeReaction(hole, 56).text).toBe("Cherche le nombre caché !");
    expect(mistakeReaction(hole, 9).text).toBe("Tout près !");
    expect(MISTAKES.map((m) => m.text)).toContain(mistakeReaction(hole, 3, always(0)).text);
  });

  it("a une bouille qui tourne quand le temps est écoulé", () => {
    const r = mistakeReaction(q78, null, always(0));
    expect(TIMEOUTS).toContain(r.text);
    expect(r.expression).toBe("dizzy");
  });

  it("garde une phrase simple quand l'erreur n'a pas de cause évidente", () => {
    expect(MISTAKES.map((m) => m.text)).toContain(mistakeReaction(q78, 30, always(0.5)).text);
  });
});

describe("mascotte : bonnes réponses", () => {
  it("fête les séries aux paliers 3, 5, 10, puis tous les 5", () => {
    expect(streakReaction(2)).toBeNull();
    expect(streakReaction(3)?.text).toBe("Trois d’affilée !");
    expect(streakReaction(5)?.text).toBe("Cinq à la suite, la classe !");
    expect(streakReaction(7)?.expression).toBe("starry");
    expect(streakReaction(10)?.expression).toBe("love");
    expect(streakReaction(15)?.text).toBe("15 à la suite, incroyable !");
    expect(streakReaction(12)).toBeNull();
  });

  it("choisit le mot le plus rare d'abord", () => {
    expect(correctReaction({ streak: 3, seconds: 1, isRetry: true }).text).toBe("Trois d’affilée !");
    expect(RETRY_PRAISES).toContain(correctReaction({ streak: 1, seconds: 1, isRetry: true }, always(0)).text);
    const fast = correctReaction({ streak: 1, seconds: 2 }, always(0));
    expect(FAST_PRAISES).toContain(fast.text);
    expect(fast.expression).toBe("wow");
    expect(PRAISES.map((p) => p.text)).toContain(correctReaction({ streak: 1, seconds: 6 }, always(0.9)).text);
  });

  it("dit parfois le prénom de l'enfant", () => {
    expect(correctReaction({ streak: 1, seconds: 6, name: "Lina" }, always(0.1)).text).toBe("Bravo Lina !");
    expect(correctReaction({ streak: 1, seconds: 6, name: "" }, always(0.1)).text).not.toContain("Bravo  !");
  });

  it("garde la pizza des débuts, avec sa bouille", () => {
    expect(PRAISES.find((p) => p.text === "Pizzas !")?.expression).toBe("pizza");
  });
});

describe("mascotte : consignes et fin de partie", () => {
  it("change de consigne d'un calcul à l'autre", () => {
    expect(promptText({}, 0)).toBe("Trouve le résultat !");
    expect(promptText({}, 1)).toBe("Combien ça fait ?");
    expect(promptText({ missing: "factor1" }, 0)).toBe("Trouve le nombre qui manque !");
    expect(promptText({ isRetry: true }, 0)).toBe("On revoit celui-là !");
  });

  it("choisit le mot de la fin dans le bon palier", () => {
    expect(resultsReview(100, always(0)).title).toBe("Perfection absolue !");
    expect(resultsReview(85, always(0)).title).toBe("Magnifique travail !");
    expect(resultsReview(60, always(0)).title).toBe("Bravo, bel effort !");
    expect(resultsReview(20, always(0)).title).toBe("Ne lâche rien !");
  });

  it("pioche sans sortir de la liste", () => {
    expect(pick(["a", "b"], always(0.999999))).toBe("b");
  });
});
