import { defineConfig } from "vitest/config";

// Tests des règles Firestore : ils tournent sur l'émulateur (npm run test:rules), pas avec npm test.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.rules.test.ts"],
    testTimeout: 20000,
    hookTimeout: 60000,
  },
});
