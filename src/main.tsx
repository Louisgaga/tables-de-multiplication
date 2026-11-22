import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
// Police servie avec l'app : pas d'appel à Google Fonts, affichage immédiat.
import './index.css';

// Pas de zoom par pincement ni de page qu'on déplace à deux doigts : sur iPad, Safari ignore
// « user-scalable=no », il faut bloquer le geste lui-même.
for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
  document.addEventListener(type, (e) => e.preventDefault(), {passive: false});
}
document.addEventListener(
  'touchmove',
  (e) => {
    if (e.touches.length > 1) e.preventDefault();
  },
  {passive: false},
);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
