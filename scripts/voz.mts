/**
 * Voz de la plantilla `dato` con msedge-tts.
 *   npx tsx scripts/voz.mts <id> <ruta-guion.json>
 * Genera public/voz/<id>/<n>.mp3 (0 = gancho, 1..n = escenas, n+1 = remate) y
 * public/voz/<id>/tiempos.json con duración y límites de palabra de cada línea.
 * Cachea por hash(texto + voz): si la línea no cambió, no vuelve a llamar al servicio.
 */
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import { parseFile } from 'music-metadata';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GuionDato } from '../src/plantillas/dato/guion';
import { VOZ_POR_DEFECTO } from '../src/plantillas/dato/guion';
import { armarTiempos, estimarPalabras, normalizar, textosDelGuion, tokenizar, type Palabra, type Tiempos } from '../src/plantillas/dato/plan';

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FORMATO_AUDIO = OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3;
/** Un poco más rápido que la lectura neutra: los Shorts piden ritmo. */
const PROSODIA = { rate: '+6%' };
const REINTENTOS = 3;

type Sidecar = { hash: string; voz: string; duracionAudio: number; palabras: Palabra[]; reales: boolean; texto: string };

const hashDe = (texto: string, voz: string) => crypto.createHash('sha256').update(`${voz}\n${JSON.stringify(PROSODIA)}\n${texto}`).digest('hex').slice(0, 16);

/** Lee un guion: acepta el envoltorio {plantilla, props} o las props sueltas. */
export const leerGuion = (ruta: string): GuionDato => {
  const crudo = JSON.parse(fs.readFileSync(ruta, 'utf8'));
  return GuionDato.parse(crudo.plantilla ? crudo.props : crudo);
};

type Limite = { Type: string; Data: { Offset: number; Duration: number; text: { Text: string } } };

/** Alinea los límites del servicio (sin puntuación) con los tokens visibles del texto. */
const alinear = (texto: string, limites: Limite[], duracionAudio: number): { palabras: Palabra[]; reales: boolean } => {
  const tokens = tokenizar(texto);
  const habladas = limites.filter((l) => l.Type === 'WordBoundary').map((l) => ({ texto: l.Data.text.Text, inicio: l.Data.Offset / 1e7, fin: (l.Data.Offset + l.Data.Duration) / 1e7 }));
  if (habladas.length === 0) return { palabras: estimarPalabras(texto, duracionAudio), reales: false };
  const palabras: Palabra[] = [];
  let j = 0;
  for (let i = 0; i < tokens.length; i++) {
    const nt = normalizar(tokens[i]);
    // El servicio a veces parte o junta tokens ("8:20", "mil-millones"): buscamos coincidencia cercana.
    let k = -1;
    for (let m = j; m < Math.min(habladas.length, j + 3); m++) {
      const nh = normalizar(habladas[m].texto);
      if (nh === nt || (nh && nt.startsWith(nh)) || (nt && nh.startsWith(nt))) { k = m; break; }
    }
    if (k >= 0) {
      // Si el token visible abarca varias palabras habladas (ej. "8:20" → "8", "20"), extendemos el fin.
      let fin = habladas[k].fin;
      let m = k + 1;
      let resto = nt.slice(normalizar(habladas[k].texto).length);
      while (resto.length && m < habladas.length && resto.startsWith(normalizar(habladas[m].texto))) { resto = resto.slice(normalizar(habladas[m].texto).length); fin = habladas[m].fin; m++; }
      palabras.push({ texto: tokens[i], inicio: habladas[k].inicio, fin });
      j = m;
    } else {
      // Sin coincidencia: interpolamos entre la anterior y la siguiente conocida.
      const prev = palabras[palabras.length - 1];
      const sig = habladas[j];
      const inicio = prev ? prev.fin + 0.02 : 0.1;
      const fin = sig ? Math.max(inicio + 0.08, sig.inicio - 0.02) : Math.min(duracionAudio, inicio + 0.25);
      palabras.push({ texto: tokens[i], inicio, fin });
    }
  }
  return { palabras, reales: true };
};

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

const sintetizar = async (tts: MsEdgeTTS, texto: string): Promise<{ audio: Buffer; limites: Limite[] }> => {
  const { audioStream, metadataStream } = tts.toStream(texto, PROSODIA);
  const partes: Buffer[] = [];
  const limites: Limite[] = [];
  const metaListo = new Promise<void>((resolve) => {
    if (!metadataStream) return resolve();
    metadataStream.on('data', (c: Buffer) => { try { limites.push(...(JSON.parse(c.toString()).Metadata as Limite[])); } catch { /* trozo no JSON: se ignora */ } });
    metadataStream.once('close', () => resolve());
    metadataStream.once('end', () => resolve());
    metadataStream.once('error', () => resolve());
  });
  const limite = setTimeout(() => audioStream.destroy(new Error('tiempo agotado en la síntesis')), 60000);
  try { for await (const c of audioStream) partes.push(c as Buffer); } finally { clearTimeout(limite); }
  await Promise.race([metaListo, esperar(1500)]);
  const audio = Buffer.concat(partes);
  if (audio.length < 1000) throw new Error('audio vacío');
  return { audio, limites };
};

/** Genera (o reutiliza) la voz de todas las líneas y escribe tiempos.json. Devuelve los tiempos. */
export const generarVoz = async (id: string, guion: GuionDato): Promise<Tiempos> => {
  const voz = guion.voz ?? VOZ_POR_DEFECTO;
  const dir = path.join(RAIZ, 'public/voz', id);
  fs.mkdirSync(dir, { recursive: true });
  const lineas = textosDelGuion(guion);
  let tts: MsEdgeTTS | null = null;
  const medidas: Parameters<typeof armarTiempos>[2] = [];
  try {
    for (let i = 0; i < lineas.length; i++) {
      const { tipo, texto } = lineas[i];
      const mp3 = path.join(dir, `${i}.mp3`);
      const sidecarRuta = path.join(dir, `${i}.json`);
      const hash = hashDe(texto, voz);
      let sidecar: Sidecar | null = null;
      if (fs.existsSync(mp3) && fs.existsSync(sidecarRuta)) {
        const previo = JSON.parse(fs.readFileSync(sidecarRuta, 'utf8')) as Sidecar;
        if (previo.hash === hash) sidecar = previo;
      }
      if (!sidecar) {
        let ultimoError: unknown = null;
        for (let intento = 1; intento <= REINTENTOS && !sidecar; intento++) {
          try {
            if (!tts) { tts = new MsEdgeTTS({ connectionTimeoutMs: 15000, synthesisTimeoutMs: 30000 }); await tts.setMetadata(voz, FORMATO_AUDIO, { wordBoundaryEnabled: true }); }
            const { audio, limites } = await sintetizar(tts, texto);
            const tmp = `${mp3}.tmp.mp3`;
            fs.writeFileSync(tmp, audio);
            const meta = await parseFile(tmp);
            const duracionAudio = meta.format.duration ?? 0;
            if (!(duracionAudio > 0)) throw new Error('mp3 sin duración válida');
            fs.renameSync(tmp, mp3);
            const { palabras, reales } = alinear(texto, limites, duracionAudio);
            sidecar = { hash, voz, duracionAudio: +duracionAudio.toFixed(3), palabras, reales, texto };
            fs.writeFileSync(sidecarRuta, JSON.stringify(sidecar, null, 2) + '\n');
            console.log(`+ voz ${id}/${i} (${tipo}): ${sidecar.duracionAudio}s, ${palabras.length} palabras${reales ? '' : ' (estimadas)'}`);
          } catch (e) {
            ultimoError = e;
            console.warn(`! voz ${id}/${i} intento ${intento}/${REINTENTOS} falló: ${(e as Error).message}`);
            try { tts?.close(); } catch { /* ya cerrado */ }
            tts = null;
            await esperar(1200 * intento);
          }
        }
        if (!sidecar) throw new Error(`No se pudo sintetizar la línea ${i} ("${texto.slice(0, 40)}…"): ${(ultimoError as Error)?.message}`);
      } else {
        console.log(`= voz ${id}/${i} (${tipo}): en caché`);
      }
      medidas.push({ tipo, texto, archivo: `voz/${id}/${i}.mp3`, duracionAudio: sidecar.duracionAudio, palabras: sidecar.palabras, reales: sidecar.reales });
    }
  } finally {
    try { tts?.close(); } catch { /* nada */ }
  }
  const tiempos = armarTiempos(id, voz, medidas);
  fs.writeFileSync(path.join(dir, 'tiempos.json'), JSON.stringify(tiempos, null, 2) + '\n');
  console.log(`tiempos.json: ${tiempos.lineas.length} líneas, ${tiempos.total.toFixed(2)}s de voz, límites ${tiempos.limitesReales ? 'reales' : 'estimados'}`);
  return tiempos;
};

const esPrincipal = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (esPrincipal) {
  const [id, rutaGuion] = process.argv.slice(2);
  if (!id || !rutaGuion) { console.error('uso: npx tsx scripts/voz.mts <id> <ruta-guion.json>'); process.exit(2); }
  const guion = leerGuion(path.resolve(rutaGuion));
  generarVoz(id, guion).then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
}
