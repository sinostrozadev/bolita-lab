/**
 * Genera guiones nuevos para el backlog usando `claude -p` (Claude Code, sesión del usuario).
 *
 *   npx tsx scripts/generar-guiones.mts [--plantilla bola|dato|carrera] [--n 5] [--modelo X]
 *                                        [--schema <archivo>] [--dry-run]
 *
 * Sin --plantilla, genera para la plantilla con menos guiones en backlog (de las que ya
 * tienen schema). El prompt lleva: docs/CONVENCIONES.md, el schema zod de la plantilla tal
 * cual está en src/plantillas/<p>/ (index.tsx o guion.ts), 2 guiones de ejemplo, los títulos
 * ya usados y las reglas editoriales. Se pide SOLO un array JSON; se parsea con tolerancia,
 * se valida (y si se puede importar el schema zod real, también los props) y cada guion
 * queda en contenido/backlog/<plantilla>-<slug>.json con id `pendiente-<plantilla>-<slug>` (el diario
 * lo renombra a `<fecha>-<plantilla>-<slug>` al promoverlo). Títulos de más de 70 caracteres se descartan;
 * si faltan guiones válidos, se reintenta una vez contándole a Claude por qué se descartaron.
 */
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import {
  DIR_BACKLOG, RAIZ, PLANTILLAS, GuionSchema, asegurarDirectorios, capitalizar, cargarCalendario,
  correr, escribirJson, leerBacklog, leerBandeja, leerGuiones, slugificar, type Guion, type Plantilla,
} from './lib/operacion.mjs';

const { values: opc } = parseArgs({
  args: process.argv.slice(2),
  options: {
    plantilla: { type: 'string' },
    n: { type: 'string', default: '5' },
    modelo: { type: 'string' },
    schema: { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
    'mostrar-prompt': { type: 'boolean', default: false },
  },
});

const rel = (p: string) => path.relative(RAIZ, p);

// ---------------------------------------------------------------- schema
/** Texto del schema zod de la plantilla, leído tal cual del código fuente. */
export const textoSchema = (plantilla: Plantilla): { ruta: string; texto: string } | null => {
  const dir = path.join(RAIZ, 'src', 'plantillas', plantilla);
  if (!fs.existsSync(dir)) return null;
  const candidatos = ['guion.ts', 'index.tsx', ...fs.readdirSync(dir).filter((f) => /\.(ts|tsx)$/.test(f))];
  for (const f of [...new Set(candidatos)]) {
    const ruta = path.join(dir, f);
    if (!fs.existsSync(ruta)) continue;
    const texto = fs.readFileSync(ruta, 'utf8');
    if (/z\.object\(/.test(texto) && new RegExp(`Guion${capitalizar(plantilla)}`).test(texto)) return { ruta, texto };
  }
  return null;
};

interface Validadores { props: z.ZodTypeAny | null; envoltorio: z.ZodTypeAny | null }

/**
 * Importa (con tsx) el schema zod REAL de src/plantillas/<p>/guion.ts: `Guion<P>` valida los props y,
 * si la plantilla lo exporta, `Envoltorio<P>` valida el guion completo. Nunca lanza.
 */
const cargarValidadores = async (plantilla: Plantilla, ruta: string): Promise<Validadores> => {
  const esZod = (x: unknown): x is z.ZodTypeAny => !!x && typeof (x as z.ZodTypeAny).safeParse === 'function';
  try {
    const mod = (await import(pathToFileURL(ruta).href)) as Record<string, unknown>;
    const props = mod[`Guion${capitalizar(plantilla)}`];
    const envoltorio = mod[`Envoltorio${capitalizar(plantilla)}`];
    return { props: esZod(props) ? props : null, envoltorio: esZod(envoltorio) ? envoltorio : null };
  } catch (e) {
    console.error(`  (no pude importar el schema para validar props: ${(e as Error).message.split('\n')[0]})`);
    return { props: null, envoltorio: null };
  }
};

const problemas = (r: z.SafeParseReturnType<unknown, unknown>) =>
  r.success ? '' : r.error.issues.slice(0, 5).map((i) => `${i.path.join('.') || '(raíz)'}: ${i.message}`).join('; ');

// ---------------------------------------------------------------- prompt
const EDITORIAL = `REGLAS EDITORIALES (obligatorias):
- Títulos de MÁXIMO 70 caracteres contando espacios (se descartan los más largos), con gancho REAL (pregunta, dato concreto, apuesta visual). Nada de clickbait falso ni mayúsculas gritadas.
- Español neutro (sin modismos locales), tuteo, frases cortas. Nada de emojis en el título salvo uno al final si aporta.
- Plantilla "dato": SOLO datos verificables; incluye la fuente (institución o estudio, con año) dentro de la descripción y, si el schema lo permite, en los props. Cifras exactas, nada inventado. Si dudas de un dato, elige otro.
- Plantillas "bola" y "carrera": sin voz; el gancho es visual (qué va a pasar) y se puede invitar a comentar/apostar.
- Coherencia: el título y la descripción describen EXACTAMENTE lo que pasa en los props (si el título enumera participantes, nombra a todos; si dice "dos bolitas", props.bolas es 2).
- Variedad: no repitas temas, mecánicas, melodías ni títulos de la lista de usados. Cambia de ángulo entre guiones.
- La descripción: 2–4 líneas, natural, SIN hashtags (van en el campo hashtags). hashtags: 4–8, en minúsculas, siempre incluye "#shorts".
- Duración objetivo 25–55 s. Respeta límites de longitud del schema (los .max() son duros).
- Nunca incluyas contenido para niños ("made for kids"), ni marcas registradas, ni música con derechos.`;

const construirPrompt = (plantilla: Plantilla, n: number, schema: string, rutaSchema: string, ejemplos: Guion[], usados: string[]) => {
  const convenciones = fs.readFileSync(path.join(RAIZ, 'docs', 'CONVENCIONES.md'), 'utf8');
  return `Eres el guionista de "Bolita Lab", un canal de YouTube Shorts. Genera ${n} guion(es) NUEVOS para la plantilla "${plantilla}".

=== CONVENCIONES DEL PROYECTO (docs/CONVENCIONES.md) ===
${convenciones}

=== SCHEMA ZOD DE LOS PROPS (${rutaSchema}, tal cual) ===
Los "props" de cada guion deben validar contra Guion${capitalizar(plantilla)}:
\`\`\`ts
${schema}
\`\`\`

=== FORMA DEL GUION (envoltorio) ===
{ "plantilla": "${plantilla}", "id": "pendiente-${plantilla}-<slug>", "titulo": "...", "descripcion": "...", "hashtags": ["#shorts", ...], "props": { ...según el schema... } }
El campo props.id lleva el mismo valor que el id del envoltorio (el pipeline lo reescribe al publicar).
No incluyas en props campos que calcula el pipeline (p. ej. duracionFrames).

=== EJEMPLOS DE GUIONES EXISTENTES (${ejemplos.length}) ===
${ejemplos.length ? ejemplos.map((g) => JSON.stringify(g, null, 2)).join('\n\n') : '(aún no hay ejemplos: guíate solo por el schema)'}

=== TÍTULOS YA USADOS (no repetir ni parafrasear) ===
${usados.length ? usados.map((t) => `- ${t}`).join('\n') : '(ninguno)'}

${EDITORIAL}

RESPONDE SOLO con un array JSON válido de ${n} objeto(s) con la forma del envoltorio. Sin texto antes ni después, sin comentarios, sin bloque de código markdown.`;
};

// ---------------------------------------------------------------- claude
const llamarClaude = async (prompt: string): Promise<string> => {
  const args = ['-p', '--output-format', 'text'];
  if (opc.modelo) args.push('--model', opc.modelo);
  // El prompt va por stdin (puede ser largo); el argumento corto le dice qué hacer con él.
  args.push('Sigue las instrucciones del texto que recibes por stdin y responde exactamente lo que piden.');
  const r = await correr('claude', args, { silencioso: true, entrada: prompt, env: { CLAUDECODE: '' }, timeoutMs: 10 * 60_000 });
  if (r.codigo !== 0) throw new Error(`claude -p terminó con código ${r.codigo}: ${r.salida.slice(-500)}`);
  return r.salida;
};

/** Extrae el primer array JSON de un texto (tolera texto alrededor y cercos de código). */
export const extraerArray = (texto: string): unknown[] => {
  const sinCercos = texto.replace(/```(?:json)?/g, '');
  const ini = sinCercos.indexOf('[');
  const fin = sinCercos.lastIndexOf(']');
  if (ini < 0 || fin <= ini) throw new Error(`La respuesta no contiene un array JSON:\n${texto.slice(0, 400)}`);
  const candidato = sinCercos.slice(ini, fin + 1);
  try {
    let v: unknown;
    try {
      v = JSON.parse(candidato);
    } catch {
      // Tolerancia: comas colgantes antes de ] o } (error típico de los LLM).
      v = JSON.parse(candidato.replace(/,\s*([\]}])/g, '$1'));
    }
    if (!Array.isArray(v)) throw new Error('no es array');
    return v;
  } catch (e) {
    throw new Error(`No pude parsear el JSON (${(e as Error).message}):\n${candidato.slice(0, 400)}`);
  }
};

// ---------------------------------------------------------------- main
const elegirPlantilla = (): Plantilla => {
  if (opc.plantilla) {
    if (!(PLANTILLAS as readonly string[]).includes(opc.plantilla)) throw new Error(`Plantilla desconocida: ${opc.plantilla} (usa ${PLANTILLAS.join('|')})`);
    return opc.plantilla as Plantilla;
  }
  const backlog = leerBacklog();
  const conSchema = cargarCalendario().rotacion.filter((p) => textoSchema(p) !== null);
  if (conSchema.length === 0) throw new Error('Ninguna plantilla tiene schema zod todavía (src/plantillas/<p>/). Usa --plantilla X --schema <archivo> para probar.');
  return conSchema.map((p) => ({ p, n: backlog.filter((g) => g.plantilla === p).length })).sort((a, b) => a.n - b.n)[0].p;
};

const main = async () => {
  asegurarDirectorios();
  const n = Math.max(1, parseInt(opc.n ?? '5', 10) || 5);
  const plantilla = elegirPlantilla();

  let schema = opc.schema ? { ruta: path.resolve(opc.schema), texto: fs.readFileSync(path.resolve(opc.schema), 'utf8') } : textoSchema(plantilla);
  if (!schema) {
    throw new Error(`La plantilla "${plantilla}" aún no tiene schema zod (Guion${capitalizar(plantilla)}) en src/plantillas/${plantilla}/. Espera a que exista o pasa --schema <archivo>.`);
  }

  const existentes = [...leerGuiones(), ...leerBacklog()];
  // Ejemplos: preferir los guiones curados (contenido/guiones), que ya renderizaron, y luego el backlog.
  const ejemplos = [...leerGuiones(), ...leerBacklog()].filter((g) => g.plantilla === plantilla).slice(0, 2).map(({ ruta: _r, ...g }) => g);
  const usados = [...new Set([...existentes.map((g) => g.titulo), ...leerBandeja(true).map((e) => e.titulo)])];

  const prompt = construirPrompt(plantilla, n, schema.texto, rel(schema.ruta), ejemplos, usados);
  if (opc['mostrar-prompt']) console.log(prompt);
  console.log(`Generando ${n} guion(es) de "${plantilla}" con claude -p (${opc.modelo ?? 'modelo por defecto'}; prompt ${prompt.length} chars, ${ejemplos.length} ejemplos, ${usados.length} títulos usados)…`);
  if (opc['dry-run']) return console.log('[dry-run] no se llama a claude.');

  const validadores = opc.schema ? { props: null, envoltorio: null } : await cargarValidadores(plantilla, schema.ruta);
  if (!validadores.props) console.error('  ⚠ sin schema importable: solo se valida la forma del envoltorio.');

  let escritos = 0;
  const yaUsados = new Set(usados.map((t) => t.toLowerCase()));
  const rechazos: string[] = [];
  // Hasta 2 intentos: el segundo pide solo los que faltan y le cuenta a Claude qué falló.
  for (let intento = 1; intento <= 2 && escritos < n; intento++) {
    const faltan = n - escritos;
    const texto = intento === 1 ? prompt : construirPrompt(plantilla, faltan, schema.texto, rel(schema.ruta), ejemplos, [...yaUsados]) +
      `\n\nEn el intento anterior se descartaron guiones por: ${rechazos.slice(-6).join(' || ')}. Corrígelo.`;
    let crudos: unknown[];
    try {
      crudos = extraerArray(await llamarClaude(texto));
    } catch (e) {
      console.error(`  ✗ intento ${intento}: ${(e as Error).message.split('\n')[0]}`);
      rechazos.push((e as Error).message.split('\n')[0]);
      continue;
    }
    for (const crudo of crudos.slice(0, faltan)) {
      const r = GuionSchema.safeParse({ ...(crudo as object), plantilla });
      if (!r.success) { rechazos.push(`envoltorio: ${problemas(r)}`); console.error(`  ✗ descartado: ${problemas(r)}`); continue; }
      const g = r.data;
      g.titulo = g.titulo.trim();
      if (g.titulo.length > 70) { rechazos.push(`título de ${g.titulo.length} caracteres (>70): "${g.titulo}"`); console.error(`  ✗ título de ${g.titulo.length} chars (>70): "${g.titulo}"`); continue; }
      if (yaUsados.has(g.titulo.toLowerCase())) { rechazos.push(`título repetido: ${g.titulo}`); console.error(`  ✗ título repetido: ${g.titulo}`); continue; }
      g.hashtags = [...new Set(g.hashtags.map((h) => '#' + h.replace(/^#+/, '').replace(/\s+/g, '').toLowerCase()))].filter((h) => h.length > 1);
      if (!g.hashtags.includes('#shorts')) g.hashtags.unshift('#shorts');

      const slug = slugificar(g.titulo);
      let nombre = `${plantilla}-${slug}`;
      for (let k = 2; fs.existsSync(path.join(DIR_BACKLOG, `${nombre}.json`)); k++) nombre = `${plantilla}-${slug}-${k}`;
      g.id = `pendiente-${nombre}`;
      g.props = { ...g.props, id: g.id };

      if (validadores.props) {
        const v = validadores.props.safeParse(g.props);
        if (!v.success) { rechazos.push(`props: ${problemas(v)}`); console.error(`  ✗ props inválidos ("${g.titulo}"): ${problemas(v)}`); continue; }
      }
      if (validadores.envoltorio) {
        const v = validadores.envoltorio.safeParse(g);
        if (!v.success) { rechazos.push(`guion: ${problemas(v)}`); console.error(`  ✗ guion inválido ("${g.titulo}"): ${problemas(v)}`); continue; }
      }
      const destino = path.join(DIR_BACKLOG, `${nombre}.json`);
      escribirJson(destino, g);
      yaUsados.add(g.titulo.toLowerCase());
      escritos++;
      console.log(`  ✓ ${rel(destino)}  — ${g.titulo} (${g.titulo.length} chars)`);
    }
  }
  console.log(`${escritos}/${n} guion(es) escritos en ${rel(DIR_BACKLOG)}.`);
  if (escritos === 0) process.exitCode = 1;
};

main().catch((e) => {
  console.error(`✗ ${(e as Error).message}`);
  process.exit(1);
});
