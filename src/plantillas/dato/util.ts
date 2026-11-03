import { PALETA, NEONES } from '../../marca/tokens';
import type { GuionDato } from './guion';

export const colorDe = (nombre: GuionDato['color'] | string | undefined, porDefecto: string): string => {
  if (!nombre) return porDefecto;
  const n = (PALETA.neon as Record<string, string>)[nombre];
  return n ?? nombre;
};

/** Neón distinto al principal para el item i (cicla la paleta saltándose el principal). */
export const neonSecundario = (principal: string, i: number) => {
  const otros = NEONES.filter((c) => c !== principal);
  return otros[i % otros.length];
};

/** Formato de número en español: 384.400 · 7,2 · 2.900.000.000 */
export const formatear = (v: number, decimales: number) => {
  const fijo = Math.abs(v).toFixed(decimales);
  const [ent, dec] = fijo.split('.');
  const conPuntos = ent.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (v < 0 ? '-' : '') + (dec ? `${conPuntos},${dec}` : conPuntos);
};

export const decimalesDe = (v: number) => {
  const s = String(v);
  const i = s.indexOf('.');
  return i < 0 ? 0 : Math.min(2, s.length - i - 1);
};

/** Tamaño de fuente que cabe: parte de `base` y baja según el largo del texto. */
export const tamanoPorLargo = (texto: string, base: number, minimo: number, largoComodo: number) =>
  Math.max(minimo, Math.min(base, base - Math.max(0, texto.length - largoComodo) * (base / largoComodo) * 0.7));
