import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vitest/config';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Les bibliothèques changent rarement : dans des fichiers à part, elles restent
        // en cache sur l'iPad quand seule l'app est mise à jour.
        manualChunks: {
          react: ['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client'],
          firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore/lite'],
          motion: ['motion/react'],
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
