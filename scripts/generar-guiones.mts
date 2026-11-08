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
- Plantilla "dato" = HISTORIA VISUAL, no solo texto: en cada escena (y en imagenGancho / imagenRemate) donde se nombre un sujeto concreto (persona, lugar, objeto, animal, astro, obra), agrega "imagen": { "buscar": "..." } con 2–4 palabras EN INGLÉS como los títulos de Wikimedia Commons ("Cleopatra bust", "Great Pyramid of Giza", "Original iPhone", "Tyrannosaurus rex skeleton", "Full moon"). SIEMPRE pon imagenGancho (el frame 0 debe mostrar ya una imagen además de la frase); si el gancho es abstracto, usa un objeto que lo represente ("hourglass" para el tiempo, "Earth and Moon from space" para distancias). forma: "circulo" para retratos/objetos sueltos/astros, "marco" (por defecto) para escenas y paisajes, "completa" solo en gancho/remate. No pidas imágenes de ideas abstractas ("tiempo", "un billón"), de personas vivas en primer plano ni de logos o marcas: ahí queda el visual tipográfico. Si la búsqueda no da una imagen con licencia libre, la escena usa su visual de siempre.
- Plantillas "bola" y "carrera": sin voz; el gancho es visual (qué va a pasar) y se puede invitar a comentar/apostar. Llevan DOS bloques de texto fijos todo el video (como satisfying.ba11s): props.ganchoArriba = la MECÁNICA o la pregunta en ≤ 9 palabras (bola: "Crece con cada rebote hasta llenar el círculo", "2 bolitas, 1 salida. ¿Cuál escapa?"; carrera: "¿Qué estación gana?") y props.ganchoAbajo = la INTRIGA en ≤ 5 palabras + 1 emoji ("El final no lo esperas 💀", "¿Llega a llenarlo? 💀", "El último te sorprende 💀"). props.gancho sigue siendo obligatorio (pon lo mismo que ganchoArriba).
- Coherencia: el título y la descripción describen EXACTAMENTE lo que pasa en los props (si el título enumera participantes, nombra a todos; si dice "dos bolitas", props.bolas es 2).
- Variedad: no repitas temas, mecánicas, melodías ni títulos de la lista de usados. Cambia de ángulo entre guiones.
- La descripción: 2–4 líneas, natural, SIN hashtags (van en el campo hashtags). hashtags: 4–8, en minúsculas, siempre incluye "#shorts".
- Duración objetivo 25–55 s. Respeta límites de longitud del schema (los .max() son duros).
- Nunca incluyas contenido para niños ("made for kids"), ni música con derechos. Marcas registradas: solo como competidores de una carrera, para identificarlas (nada de patrocinios ni afirmaciones sobre ellas).
- Plantilla "carrera": CADA participante lleva "icono" (identidad visual dentro de la bolita, el marcador y el final):
  · Si el competidor ES una marca → {"tipo":"marca","slug":"<slug de simple-icons>"}: el slug es el nombre del archivo en simpleicons.org en minúsculas y sin espacios (apple, samsung, xiaomi, google para Pixel, motorola, huawei, playstation, steam, tiktok, instagram, youtube, x, facebook, snapchat, netflix, spotify, mcdonalds, cocacola, starbucks...). simple-icons NO tiene xbox, nintendo, microsoft ni windows: para esos usa emoji o texto. Si no estás seguro de que el slug exista, usa emoji o texto.
  · Si no es marca (meses, días, sabores, comidas, mascotas, países, estaciones, signos) → {"tipo":"emoji","valor":"🍫"}: UN emoji que se reconozca al instante (países: su bandera 🇨🇱).
  · Personas reales (futbolistas, artistas): NUNCA su cara; usa la bandera de su país o {"tipo":"texto","valor":"CR7"} (1–3 caracteres).
  · No repitas el mismo emoji dentro de una carrera; el icono y el color deben "contar" lo mismo que la etiqueta.`;

/**
 * Fórmula narrativa de "dato" (desde 2026-11-05), sacada del referente Ñerd (Shorts de mapas/historia,
 * 4,1 M de vistas en su más visto). Solo entra en el prompt de "dato": bola y carrera no tienen voz.
 */
const FORMULA_DATO = `FÓRMULA NARRATIVA DE "dato" (obligatoria; la locución es gancho → escenas[].texto → remate, en ese orden):
1. GANCHO (props.gancho, se ve gigante en el frame 0): empieza con un imperativo visual ("Mira…", "Fíjate en…", "Mira este mapa…") + el dato sorprendente + "¿Por qué?" (o "¿Cómo?"). Máximo 2 frases cortas y ~90 caracteres en total. imagenGancho muestra exactamente lo que se dice que mires.
2. MITO (escena 1): la explicación obvia o la leyenda que la gente cree, y enseguida "La verdad es más rara." / "más simple." / "peor." (elige la que corresponda).
3. MAPA DE RUTA (inicio de escena 2, solo si el dato tiene 2–3 causas): "Todo se explica con dos cosas: X e Y." Luego una escena por causa, abriendo con "Primero, X." / "Segundo, Y."
4. FUENTE NOMBRADA EN LA VOZ: al menos una escena dice la fuente en voz alta, con institución y, si se puede, año ("según la NASA", "según un estudio de la Universidad de Oxford de 2019"). No basta con ponerla en la descripción o en props.fuentes (que siguen siendo obligatorias). Es lo que da valor educativo propio y protege la monetización.
5. GIRO (penúltima o última escena): empieza con "Y aquí está el giro:" y da una consecuencia inesperada o una inversión del dato.
6. REMATE (props.remate, se ve gigante): UNA frase de cierre SIMÉTRICA, dos mitades espejo que reutilizan la misma estructura ("Estados Unidos compró el camino del tren. México se quedó con el camino al mar."). Máximo ~100 caracteres. Nada de "¡Suscríbete!" ni preguntas al público.
7. ESTILO: lenguaje concreto, cifras redondeadas en la voz ("unos 60 km", "casi 32 años"; el visual puede llevar la cifra exacta), cero relleno ("¿sabías que…?", "increíble", "curiosamente"). Cada escena = UNA idea = UNA imagen concreta en "imagen" (si la idea tiene sujeto visible). Total ~90–110 palabras habladas (≈ 30–38 s).
EJEMPLO CORTO (solo la locución; no lo copies):
  gancho: "Mira la frontera de Arizona: se queda a 60 km del mar sin tocarlo. ¿Por qué?"
  escena 1: "Dicen que los topógrafos la trazaron borrachos. La verdad es más rara."
  escena 2: "Todo se explica con dos cosas: un tren y una península. Primero, el tren."
  escena 3: "Según la Oficina del Historiador del Departamento de Estado, Washington quería una ruta al Pacífico por el sur."
  escena 4: "Segundo, la península. México se negó a vender Baja California y su salida al golfo."
  escena 5: "Y aquí está el giro: Estados Unidos vino por medio norte de México y se fue con un desierto."
  remate: "Estados Unidos compró el camino del tren. México se quedó con el camino al mar."`;


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
${plantilla === 'dato' ? `\n${FORMULA_DATO}\n` : ''}
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
