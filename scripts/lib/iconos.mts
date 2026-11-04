/**
 * Resuelve los iconos de los competidores de una carrera (ver `IconoCompetidor` en
 * src/plantillas/carrera/guion.ts).
 *
 * - `marca`: busca el slug en simple-icons (CC0) e inyecta inline `svg: { path, hex, titulo }`
 *   en los props (así el render no depende de archivos sueltos). Si el slug no existe, cae a
 *   `texto` con las iniciales de la etiqueta y avisa por consola.
 * - Competidor sin icono: `texto` con las iniciales (y aviso), para que ninguna bolita quede vacía.
 */
import * as simpleIcons from 'simple-icons';
import type { GuionCarrera, IconoCompetidor } from '../../src/plantillas/carrera/guion';

interface IconoSimple { slug: string; title: string; hex: string; path: string }

let indice: Map<string, IconoSimple> | null = null;
const porSlug = (slug: string): IconoSimple | undefined => {
  if (!indice) {
    indice = new Map();
    for (const v of Object.values(simpleIcons) as unknown[]) {
      const i = v as Partial<IconoSimple>;
      if (i && typeof i === 'object' && typeof i.slug === 'string' && typeof i.path === 'string') indice.set(i.slug, i as IconoSimple);
    }
  }
  return indice.get(slug.toLowerCase());
};

/**
 * Caja (minX, minY, ancho, alto) de un trazado SVG, aproximada por puntos finales y de control
 * (la envolvente convexa de una Bézier la contiene; a los arcos se les suma su radio por las
 * dudas). Sirve para recortar el viewBox al logo y para detectar logotipos de texto anchos.
 */
export const cajaTrazado = (d: string): [number, number, number, number] => {
  let i = 0;
  const xs: number[] = [], ys: number[] = [];
  const saltar = () => { while (i < d.length && /[\s,]/.test(d[i])) i++; };
  const numero = (): number => {
    saltar();
    const m = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/.exec(d.slice(i));
    if (!m) throw new Error(`trazado SVG ilegible cerca de "${d.slice(i, i + 12)}"`);
    i += m[0].length;
    return parseFloat(m[0]);
  };
  const bandera = (): number => { saltar(); return d[i++] === '1' ? 1 : 0; };
  const hayNumero = () => { saltar(); return i < d.length && /[-+.\d]/.test(d[i]); };
  let x = 0, y = 0, x0 = 0, y0 = 0;
  const punto = (px: number, py: number) => { xs.push(px); ys.push(py); };
  let cmd = '';
  while (i < d.length) {
    saltar();
    if (i >= d.length) break;
    if (/[a-zA-Z]/.test(d[i])) cmd = d[i++];
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    if (C === 'Z') { x = x0; y = y0; continue; }
    do {
      const bx = rel ? x : 0, by = rel ? y : 0;
      if (C === 'M' || C === 'L' || C === 'T') {
        x = bx + numero(); y = by + numero(); punto(x, y);
        if (C === 'M') { x0 = x; y0 = y; cmd = rel ? 'l' : 'L'; }
      } else if (C === 'H') { x = bx + numero(); punto(x, y); }
      else if (C === 'V') { y = by + numero(); punto(x, y); }
      else if (C === 'C') {
        for (let k = 0; k < 2; k++) punto(bx + numero(), by + numero());
        x = bx + numero(); y = by + numero(); punto(x, y);
      } else if (C === 'S' || C === 'Q') {
        punto(bx + numero(), by + numero());
        x = bx + numero(); y = by + numero(); punto(x, y);
      } else if (C === 'A') {
        const rx = Math.abs(numero()), ry = Math.abs(numero()); numero(); bandera(); bandera();
        const nx = bx + numero(), ny = by + numero();
        // Un arco no sale de la caja de sus extremos más su radio.
        const cx = (x + nx) / 2, cy = (y + ny) / 2;
        punto(cx - rx, cy - ry); punto(cx + rx, cy + ry);
        x = nx; y = ny; punto(x, y);
      } else throw new Error(`comando SVG no soportado: ${cmd}`);
    } while (hayNumero());
  }
  const minX = Math.max(0, Math.min(...xs)), minY = Math.max(0, Math.min(...ys));
  const maxX = Math.min(24, Math.max(...xs)), maxY = Math.min(24, Math.max(...ys));
  return [minX, minY, maxX - minX, maxY - minY].map((v) => Math.round(v * 1000) / 1000) as [number, number, number, number];
};

export const existeMarca = (slug: string) => !!porSlug(slug);

/** Iniciales de una etiqueta: "MESSI" → "M", "SAN LUIS" → "SL", "CR7" → "CR7". */
export const iniciales = (etiqueta: string): string => {
  const limpia = etiqueta.trim().toUpperCase();
  if (limpia.length <= 3) return limpia;
  const palabras = limpia.split(/\s+/).filter(Boolean);
  return palabras.length > 1 ? palabras.slice(0, 2).map((p) => [...p][0]).join('') : [...limpia][0];
};

export const resolverIcono = (icono: IconoCompetidor | undefined, etiqueta: string, avisar: (m: string) => void): IconoCompetidor => {
  if (!icono) {
    avisar(`"${etiqueta}" no trae icono: uso texto "${iniciales(etiqueta)}"`);
    return { tipo: 'texto', valor: iniciales(etiqueta) };
  }
  if (icono.tipo !== 'marca') return icono;
  const si = porSlug(icono.slug);
  if (!si) {
    avisar(`el slug "${icono.slug}" (${etiqueta}) no existe en simple-icons: uso texto "${iniciales(etiqueta)}"`);
    return { tipo: 'texto', valor: iniciales(etiqueta) };
  }
  const caja = cajaTrazado(si.path);
  if (caja[2] / caja[3] > 2.2) avisar(`"${etiqueta}" (${si.slug}) es un logotipo de texto ancho: en tamaños chicos (bolita, etiqueta, marcador) se muestra su inicial; el logotipo completo, en el final`);
  return { tipo: 'marca', slug: si.slug, svg: { path: si.path, hex: `#${si.hex}`, titulo: si.title, caja } };
};

/** Devuelve props con todos los iconos resueltos (no muta la entrada). */
export const resolverIconos = (props: GuionCarrera, avisar: (m: string) => void = (m) => console.warn(`[iconos] ⚠ ${m}`)): GuionCarrera => ({
  ...props,
  participantes: props.participantes.map((p) => ({ ...p, icono: resolverIcono(p.icono, p.etiqueta, avisar) })),
});
