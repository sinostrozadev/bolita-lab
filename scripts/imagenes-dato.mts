/**
 * Imágenes de archivo para la plantilla `dato` (Wikimedia Commons, solo licencias claras).
 *   npx tsx scripts/imagenes-dato.mts <ruta-guion.json>
 * Lo llama `preparar-dato.mts`. Para cada línea con `imagen` (gancho = `imagenGancho`, escenas =
 * `escenas[i].imagen`, remate = `imagenRemate`) busca en Commons y elige la PRIMERA que:
 *   - sea jpg/png, con ≥ 1200 px en el lado mayor,
 *   - tenga licencia Public domain, CC0, CC BY o CC BY-SA (rechaza NC, ND y desconocidas).
 * Descarga una miniatura de 1280 px a public/imagenes/<id>/<n>.<ext> (n como la voz: 0 = gancho,
 * 1..n = escenas, n+1 = remate) y devuelve los metadatos (página, autor, licencia) para el json de
 * props y el texto de créditos para la descripción. Sin imagen válida, la línea se queda sin
 * imagen y la escena usa su visual de siempre: nunca rompe el render.
 * Caché: public/imagenes/<id>/imagenes.json. Si la búsqueda no cambió y el archivo existe, se
 * reutiliza sin red (la búsqueda de Commons cambia con el tiempo; así el video es reproducible).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { GuionDato, ImagenEscena, ImagenResuelta, ImagenesDato } from '../src/plantillas/dato/guion';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://commons.wikimedia.org/w/api.php';
/** Wikimedia pide un User-Agent descriptivo con contacto: https://meta.wikimedia.org/wiki/User-Agent_policy */
const USER_AGENT = 'BolitaLabShorts/1.0 (canal de YouTube Bolita Lab; contacto: sinostrozadev@gmail.com) node-fetch';
const LADO_MINIMO = 1200;
const ANCHO_DESCARGA = 1280; // suficiente para la tarjeta (960 px) y el fondo (1080 px); más grande gasta RAM en el render
const RESULTADOS = 20;

type Clase = 'libre' | 'atribucion';

/** Clasifica la licencia corta de Commons. null = no se usa (NC, ND, desconocida). */
export const clasificarLicencia = (corta: string | undefined): Clase | null => {
  const s = (corta ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!s) return null;
  if (/\bnc\b|\bnd\b|non-?commercial|no ?deriv/.test(s)) return null;
  if (/^(public domain|dominio p[uú]blico|pd($|[ -])|cc0|cc-zero|no restrictions)/.test(s)) return 'libre';
  if (/^cc[ -]by(?:[ -]sa)?(?:[ -]\d(?:\.\d)?)?(?:[ -][a-z]{2,3})?$/.test(s)) return 'atribucion';
  return null;
};

const sinHtml = (h: string) => h.replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

const pedir = async (url: string): Promise<Response> => {
  for (let intento = 1; ; intento++) {
    const r = await fetch(url, { headers: { 'User-Agent': USER_AGENT, 'Api-User-Agent': USER_AGENT } });
    if (r.ok || intento >= 3 || (r.status !== 429 && r.status < 500)) return r;
    await espera(1500 * intento);
  }
};

type Pagina = {
  index?: number;
  title: string;
  categories?: { title: string }[];
  imageinfo?: { url: string; thumburl?: string; descriptionurl: string; width: number; height: number; mime: string; extmetadata?: Record<string, { value: string }> }[];
};

/** Categorías que descartan un archivo aunque la licencia del archivo sea libre. */
const CATEGORIAS_PROHIBIDAS = /trademark|nudity|nude\b|pornograph/i;

export const consultar = async (img: ImagenEscena): Promise<Pagina[]> => {
  const p = new URLSearchParams({
    action: 'query', format: 'json', formatversion: '1',
    prop: 'imageinfo|categories', cllimit: 'max',
    iiprop: 'url|extmetadata|size|mime', iiurlwidth: String(ANCHO_DESCARGA),
    iiextmetadatafilter: 'LicenseShortName|LicenseUrl|Artist|Credit|ObjectName',
  });
  if (img.archivo) p.set('titles', img.archivo.startsWith('File:') ? img.archivo : `File:${img.archivo}`);
  else { p.set('generator', 'search'); p.set('gsrsearch', `${img.buscar} filetype:bitmap`); p.set('gsrnamespace', '6'); p.set('gsrlimit', String(RESULTADOS)); }
  const r = await pedir(`${API}?${p}`);
  if (!r.ok) throw new Error(`Commons respondió ${r.status}`);
  const d = (await r.json()) as { query?: { pages?: Record<string, Pagina> } };
  return Object.values(d.query?.pages ?? {}).sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
};

type Candidata = Omit<ImagenResuelta, 'src' | 'forma' | 'encuadre'> & { descarga: string; ext: string; clase: Clase };

/** Primera página que cumple formato, tamaño, licencia y categorías. */
export const elegir = (paginas: Pagina[]): { candidata?: Candidata; rechazos: string[] } => {
  const rechazos: string[] = [];
  for (const pg of paginas) {
    const ii = pg.imageinfo?.[0];
    if (!ii) continue;
    const m = ii.extmetadata ?? {};
    const corta = m.LicenseShortName?.value;
    const motivo =
      !/^image\/(jpeg|png)$/.test(ii.mime) ? `formato ${ii.mime}`
      : Math.max(ii.width, ii.height) < LADO_MINIMO ? `chica (${ii.width}×${ii.height})`
      : !clasificarLicencia(corta) ? `licencia "${corta ?? '?'}"`
      : pg.categories?.some((c) => CATEGORIAS_PROHIBIDAS.test(c.title)) ? 'categoría prohibida'
      : '';
    if (motivo) { rechazos.push(`${pg.title}: ${motivo}`); continue; }
    const descarga = ii.thumburl ?? ii.url;
    const k = Math.min(1, ANCHO_DESCARGA / ii.width);
    return {
      candidata: {
        titulo: pg.title.replace(/^File:/, '').replace(/\.[a-z]+$/i, ''),
        pagina: ii.descriptionurl,
        autor: sinHtml(m.Artist?.value ?? '') || sinHtml(m.Credit?.value ?? '') || 'Autor desconocido (Wikimedia Commons)',
        licencia: corta!.trim(),
        licenciaUrl: m.LicenseUrl?.value,
        ancho: Math.round(ii.width * k),
        alto: Math.round(ii.height * k),
        descarga,
        ext: ii.mime === 'image/png' ? 'png' : 'jpg',
        clase: clasificarLicencia(corta)!,
      },
      rechazos,
    };
  }
  return { rechazos };
};

type Manifiesto = Record<string, { clave: string; imagen: ImagenResuelta }>;

/** Qué imagen pide cada línea, con el índice de la voz. */
export const pedidosDe = (g: GuionDato): { indice: number; img: ImagenEscena; formaPorDefecto: ImagenResuelta['forma'] }[] => {
  const n = g.escenas.length;
  const salida: { indice: number; img: ImagenEscena; formaPorDefecto: ImagenResuelta['forma'] }[] = [];
  if (g.imagenGancho) salida.push({ indice: 0, img: g.imagenGancho, formaPorDefecto: 'completa' });
  g.escenas.forEach((e, i) => { if (e.imagen) salida.push({ indice: i + 1, img: e.imagen, formaPorDefecto: 'marco' }); });
  if (g.imagenRemate) salida.push({ indice: n + 1, img: g.imagenRemate, formaPorDefecto: 'completa' });
  return salida;
};

/** Texto de créditos para la descripción del video (vacío si no hay imágenes). */
export const textoCreditos = (imagenes: ImagenesDato): string => {
  const vistas = new Set<string>();
  const lineas: string[] = [];
  for (const im of Object.values(imagenes)) {
    if (vistas.has(im.pagina)) continue;
    vistas.add(im.pagina);
    // TASL: título, autor, fuente y licencia (con su enlace cuando la licencia pide atribución).
    const conEnlace = im.licenciaUrl && clasificarLicencia(im.licencia) === 'atribucion' ? ` (${im.licenciaUrl})` : '';
    lineas.push(`- ${im.titulo} · ${im.autor} · ${im.licencia}${conEnlace} · ${im.pagina}`);
  }
  return lineas.length ? `Imágenes: Wikimedia Commons\n${lineas.join('\n')}` : '';
};

/** Agrega los créditos a una descripción, antes de la línea final de hashtags si la hay. Idempotente. */
export const agregarCreditos = (descripcion: string, creditos: string | undefined): string => {
  if (!creditos || descripcion.includes('Imágenes: Wikimedia Commons')) return descripcion;
  const partes = descripcion.trimEnd().split('\n\n');
  const ultima = partes[partes.length - 1];
  if (partes.length > 1 && /^#\S+(\s+#\S+)*$/.test(ultima.trim())) {
    partes.splice(partes.length - 1, 0, creditos);
    return partes.join('\n\n');
  }
  return `${descripcion.trimEnd()}\n\n${creditos}`;
};

/** Busca, descarga y devuelve las imágenes del guion. No lanza: lo que falla queda sin imagen. */
export const prepararImagenes = async (id: string, g: GuionDato): Promise<{ imagenes: ImagenesDato; creditos: string }> => {
  const dir = path.join(RAIZ, 'public', 'imagenes', id);
  const rutaManifiesto = path.join(dir, 'imagenes.json');
  let previo: Manifiesto = {};
  try { previo = JSON.parse(fs.readFileSync(rutaManifiesto, 'utf8')) as Manifiesto; } catch { /* primera vez */ }
  const nuevo: Manifiesto = {};
  const imagenes: ImagenesDato = {};
  const pedidos = pedidosDe(g);
  if (pedidos.length) fs.mkdirSync(dir, { recursive: true });
  for (const { indice, img, formaPorDefecto } of pedidos) {
    const forma = img.forma ?? formaPorDefecto;
    const clave = `${img.buscar}|${img.archivo ?? ''}`;
    const enCache = previo[String(indice)];
    if (enCache && enCache.clave === clave && fs.existsSync(path.join(RAIZ, 'public', enCache.imagen.src))) {
      const imagen = { ...enCache.imagen, forma, encuadre: img.encuadre };
      nuevo[String(indice)] = { clave, imagen };
      imagenes[String(indice)] = imagen;
      console.log(`  imagen ${indice}: en caché (${imagen.titulo})`);
      continue;
    }
    try {
      const { candidata, rechazos } = elegir(await consultar(img));
      if (!candidata) {
        console.warn(`  ⚠ imagen ${indice} "${img.buscar}": ninguna válida (${rechazos.length} descartadas: ${rechazos.slice(0, 3).join('; ')}). Queda sin imagen.`);
        continue;
      }
      const r = await pedir(candidata.descarga);
      const tipo = r.headers.get('content-type') ?? '';
      if (!r.ok || !/^image\/(jpeg|png)/.test(tipo)) throw new Error(`descarga ${r.status} ${tipo}`);
      const archivo = `${indice}.${candidata.ext}`;
      // Limpia una versión anterior con otra extensión.
      for (const ext of ['jpg', 'png']) if (ext !== candidata.ext) fs.rmSync(path.join(dir, `${indice}.${ext}`), { force: true });
      fs.writeFileSync(path.join(dir, archivo), Buffer.from(await r.arrayBuffer()));
      const { descarga: _d, ext: _e, clase, ...meta } = candidata;
      const imagen: ImagenResuelta = { ...meta, src: `imagenes/${id}/${archivo}`, forma, encuadre: img.encuadre };
      nuevo[String(indice)] = { clave, imagen };
      imagenes[String(indice)] = imagen;
      console.log(`  imagen ${indice} "${img.buscar}" → ${candidata.titulo} (${candidata.licencia}${clase === 'atribucion' ? ', con atribución' : ''})`);
      await espera(250); // cortesía con la API
    } catch (e) {
      console.warn(`  ⚠ imagen ${indice} "${img.buscar}": ${(e as Error).message}. Queda sin imagen.`);
    }
  }
  if (pedidos.length) fs.writeFileSync(rutaManifiesto, JSON.stringify(nuevo, null, 2) + '\n');
  return { imagenes, creditos: textoCreditos(imagenes) };
};

const esPrincipal = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (esPrincipal) {
  const ruta = process.argv[2];
  if (!ruta) { console.error('uso: npx tsx scripts/imagenes-dato.mts <ruta-guion.json>'); process.exit(2); }
  const { leerGuion } = await import('./voz.mjs');
  const g = leerGuion(path.resolve(ruta));
  const { imagenes, creditos } = await prepararImagenes(g.id, g);
  console.log(`${Object.keys(imagenes).length} imagen(es)\n${creditos}`);
  process.exit(0);
}
