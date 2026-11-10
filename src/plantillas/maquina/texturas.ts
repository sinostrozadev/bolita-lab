/**
 * Texturas procedurales deterministas (canvas 2D) para la máquina: madera clara del bastidor, palisandro del bajo,
 * tablas oscuras de la pared y el piso del taller, surcos del platillo, brillo radial para los sprites aditivos.
 * Nada de Math.random: ruido por hash.
 */
import * as THREE from 'three';

export const hash = (n: number) => {
  let x = (n * 374761393 + 668265263) | 0;
  x = Math.imul(x ^ (x >>> 13), 1274126177);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
};

const lienzo = (w: number, h: number) => {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return { c, g: c.getContext('2d')! };
};

const aTextura = (c: HTMLCanvasElement, repetir = true) => {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repetir) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = 4;
  return t;
};

/** Madera con vetas a lo largo de x. `base` y `veta` en hex; `tablas` = franjas (juntas oscuras). */
export const texturaMadera = (base: [number, number, number], veta: [number, number, number], semilla: number, tablas = 0, w = 512, h = 512) => {
  const { c, g } = lienzo(w, h);
  const img = g.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    const tabla = tablas ? Math.floor((y / h) * tablas) : 0;
    const desf = hash(semilla * 31 + tabla) * 1000;
    for (let x = 0; x < w; x++) {
      const yy = y + 9 * Math.sin((x + desf) / 47 + Math.sin((x + desf) / 13) * 0.6) + 4 * Math.sin((x + desf * 2) / 151);
      const anillo = 0.5 + 0.5 * Math.sin(yy / 3.1 + Math.sin(yy / 17 + desf) * 2.2);
      const fino = hash(semilla * 7919 + Math.floor(yy) * 131 + Math.floor(x / 9)) * 0.25;
      let k = Math.pow(anillo, 3) * 0.75 + fino;
      if (tablas) {
        const enTabla = ((y / h) * tablas) % 1;
        if (enTabla < 0.012 || enTabla > 0.988) k = 1.6; // junta
        k += (hash(semilla + tabla * 17) - 0.5) * 0.35;
      }
      const i = (y * w + x) * 4;
      for (let ch = 0; ch < 3; ch++) img.data[i + ch] = Math.max(0, Math.min(255, base[ch] + (veta[ch] - base[ch]) * Math.min(1, k)));
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return aTextura(c);
};

/** Surcos concéntricos del platillo (latón torneado). */
export const texturaPlatillo = () => {
  const { c, g } = lienzo(512, 512);
  const grad = g.createRadialGradient(256, 256, 0, 256, 256, 256);
  grad.addColorStop(0, '#F3D27A'); grad.addColorStop(0.18, '#D9A847'); grad.addColorStop(1, '#C08A2E');
  g.fillStyle = grad; g.fillRect(0, 0, 512, 512);
  for (let r = 40; r < 256; r += 2.2) {
    g.strokeStyle = `rgba(${hash(r * 13) > 0.5 ? '255,235,170' : '90,60,20'},${0.08 + 0.1 * hash(r * 7)})`;
    g.lineWidth = 1;
    g.beginPath(); g.arc(256, 256, r, 0, Math.PI * 2); g.stroke();
  }
  return aTextura(c, false);
};

/** Brillo radial blanco → transparente (sprites aditivos: "bloom" sin posprocesado). */
export const texturaBrillo = () => {
  const { c, g } = lienzo(128, 128);
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.2, 'rgba(255,255,255,0.7)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.18)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  return aTextura(c, false);
};

/** Bokeh: disco suave con borde algo más claro (luces del taller desenfocadas al fondo). */
export const texturaBokeh = () => {
  const { c, g } = lienzo(128, 128);
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 62);
  grad.addColorStop(0, 'rgba(255,255,255,0.55)');
  grad.addColorStop(0.75, 'rgba(255,255,255,0.65)');
  grad.addColorStop(0.9, 'rgba(255,255,255,0.8)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  return aTextura(c, false);
};

/** Parche del bombo: piel clara con el nombre del canal en el borde y un círculo al centro. */
export const texturaParche = (nombre: string) => {
  const { c, g } = lienzo(512, 512);
  const grad = g.createRadialGradient(256, 256, 20, 256, 256, 256);
  grad.addColorStop(0, '#F6EFDF'); grad.addColorStop(0.85, '#E9DEC6'); grad.addColorStop(1, '#CDBE9F');
  g.fillStyle = grad; g.fillRect(0, 0, 512, 512);
  g.strokeStyle = 'rgba(150,40,30,0.85)'; g.lineWidth = 10;
  g.beginPath(); g.arc(256, 256, 150, 0, Math.PI * 2); g.stroke();
  g.fillStyle = '#9C2A1E';
  g.font = 'bold 64px "Bricolage Grotesque", sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(nombre.toUpperCase(), 256, 256);
  return aTextura(c, false);
};
