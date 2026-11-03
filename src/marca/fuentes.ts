import { loadFont as cargarBricolage } from '@remotion/google-fonts/BricolageGrotesque';
import { loadFont as cargarInter } from '@remotion/google-fonts/Inter';

let cargadas = false;
/** Carga las dos fuentes de marca una sola vez. Llamar al inicio de cada composición. */
export const cargarFuentes = () => {
  if (cargadas) return;
  cargadas = true;
  cargarBricolage('normal', { weights: ['700', '800'], subsets: ['latin', 'latin-ext'] });
  cargarInter('normal', { weights: ['500', '700'], subsets: ['latin', 'latin-ext'] });
};
