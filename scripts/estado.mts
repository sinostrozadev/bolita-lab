/**
 * Resumen del estado de la fábrica: backlog por plantilla, bandeja por estado (con huérfanos),
 * próximas ranuras (con qué video iría en cada una), compilaciones, últimos errores y credenciales.
 *   npx tsx scripts/estado.mts [--sin-marcar] [--sin-metricas]
 * Al final cuelga la captura diaria de métricas (scripts/metricas.mts); --sin-metricas la omite.
 * Por defecto marca como 'error' los json 'listo' sin mp4 (huérfanos), igual que el diario.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  ARCHIVO_CLIENTE_YT, ARCHIVO_TOKEN_YT, DIR_SALIDA, RAIZ, PLANTILLAS, caducidadTokenYT,
  cargarCalendario, detectarHuerfanos, existeSecreto, formatoDuracion, formatoLocal, leerBacklog, leerBandeja,
  memoriaDisponibleMb, ordenarParaPublicar, proximasRanuras, siguientePlantilla, ultimosErrores,
} from './lib/operacion.mjs';

const rel = (p: string) => path.relative(RAIZ, p);
const cal = cargarCalendario();
const zona = cal.zonaHoraria;
const marcar = !process.argv.includes('--sin-marcar');

console.log(`BOLITA LAB · estado · ${formatoLocal(new Date(), zona)} · RAM disponible ${memoriaDisponibleMb()} MB\n`);

// Backlog
const backlog = leerBacklog();
console.log(`Backlog: ${backlog.length} guion(es) (mínimo ${cal.minimoBacklog})${backlog.length < cal.minimoBacklog ? '  ⚠ bajo: el diario generará más' : ''}`);
for (const p of PLANTILLAS) {
  const de = backlog.filter((g) => g.plantilla === p);
  console.log(`  ${p.padEnd(8)} ${String(de.length).padStart(2)}  ${de.slice(0, 2).map((g) => g.titulo).join(' · ')}${de.length > 2 ? ' …' : ''}`);
}
console.log(`  próximo render: ${siguientePlantilla(cal)}`);

// Bandeja
const huerfanos = detectarHuerfanos(marcar, marcar ? 10 : 0);
const bandeja = leerBandeja();
const porEstado = (e: string) => bandeja.filter((x) => x.estado === e);
const listos = porEstado('listo').filter((e) => e.mp4Existe);
console.log(`\nBandeja: ${listos.length} listo (mínimo ${cal.minimoBandeja}), ${porEstado('subido').length} subido, ${porEstado('error').length} error`);
for (const p of PLANTILLAS) console.log(`  ${p.padEnd(8)} ${listos.filter((e) => e.plantilla === p).length} listo`);
if (huerfanos.length) console.log(`  ✗ huérfanos (json 'listo' sin mp4)${marcar ? ' → marcados error' : ''}: ${huerfanos.map((e) => e.id).join(', ')}`);
for (const e of porEstado('listo').filter((x) => !x.mp4Existe && !huerfanos.includes(x))) console.log(`  … ${e.id}: json sin mp4 hace < 10 min (¿render en curso?)`);
for (const e of porEstado('subido').slice(-5)) console.log(`  ↑ ${e.id}  youtu.be/${e.videoId}  publica ${e.publicarEn ? formatoLocal(new Date(e.publicarEn), zona) : '?'}`);
for (const e of porEstado('error')) console.log(`  ✗ ${e.id}  ${(e.error ?? '').split('\n')[0].slice(0, 120)}`);
const compilaciones = leerBandeja(true).filter((e) => e.tipo === 'largo');
if (compilaciones.length) console.log(`  compilaciones: ${compilaciones.map((c) => `${c.id} [${c.estado}${c.mp4Existe ? '' : ', sin mp4'}] ${formatoDuracion(c.duracionSeg)}`).join(', ')}`);

// Ranuras
const orden = ordenarParaPublicar(listos, cal);
const ranuras = proximasRanuras(Math.max(6, orden.length), new Date(), cal);
console.log(`\nPróximas ranuras libres (${zona})${cal.dobleHasta ? ` · fase doble (12:00 y 18:00) hasta ${cal.dobleHasta}` : ''}:`);
ranuras.forEach((r, i) => console.log(`  ${formatoLocal(r, zona)}  ${orden[i] ? `← ${orden[i].plantilla.padEnd(7)} ${orden[i].id}` : '(vacía: falta video)'}`));
console.log(`  próxima ranura de video largo: ${formatoLocal(proximasRanuras(1, new Date(), cal, 'largo')[0], zona)}`);

// Credenciales
console.log('\nCredenciales:');
console.log(`  ${existeSecreto(ARCHIVO_CLIENTE_YT) ? '✓' : '✗'} ${rel(ARCHIVO_CLIENTE_YT)}  ${existeSecreto(ARCHIVO_CLIENTE_YT) ? '' : '(docs/SANTIAGO.md paso 2)'}`);
console.log(`  ${existeSecreto(ARCHIVO_TOKEN_YT) ? '✓' : '✗'} ${rel(ARCHIVO_TOKEN_YT)}  ${existeSecreto(ARCHIVO_TOKEN_YT) ? '' : '(npx tsx scripts/subir.mts autorizar)'}`);
if (!existeSecreto(ARCHIVO_TOKEN_YT)) console.log('  → mientras tanto el diario mantiene salida/bandeja/PARA-SUBIR-A-MANO.md');
{
  const cad = caducidadTokenYT();
  if (cad) {
    const dias = (cad.getTime() - Date.now()) / 86_400_000;
    console.log(`  ${dias < 2 ? '✗' : '⚠'} el refresh token caduca el ${formatoLocal(cad, zona)} (${dias.toFixed(1)} días) → antes de eso: npx tsx scripts/subir.mts autorizar`);
  }
}

// Plan semanal (docs/PLAN-SEMANAL.md, skill plan-semanal): bloque ```json con las ranuras de esta semana y la siguiente.
// Hito del miércoles (plan-semanal §5b, orden de Santiago 2026-11-08): todas las ranuras hasta el miércoles siguiente deben
// estar `programado` el jueves; aquí se avisa cuántas faltan.
{
  const archivoPlan = path.join(RAIZ, 'docs', 'PLAN-SEMANAL.md');
  const CON_GUION = ['guion', 'dirigido', 'renderizado', 'programado', 'publicado'];
  const ASEGURADA = ['programado', 'publicado'];
  console.log('\nPlan semanal:');
  try {
    const bloque = fs.readFileSync(archivoPlan, 'utf8').match(/```json\n([\s\S]*?)\n```/);
    if (!bloque) throw new Error('sin bloque ```json');
    const plan = JSON.parse(bloque[1]) as {
      zona?: string;
      ranuras: { fecha: string; hora: string; formato: string; plantilla: string; tema: string; estado: string; bloqueo?: string | null }[];
    };
    // "Ahora" como texto 'AAAA-MM-DD HH:MM' en la zona del plan: se compara como texto, sin offsets.
    const enZona = (d: Date) => new Intl.DateTimeFormat('sv-SE', {
      timeZone: plan.zona ?? zona, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(d).replace('T', ' ');
    const ahora = enZona(new Date());
    const en7d = enZona(new Date(Date.now() + 7 * 86_400_000));
    // Próximo miércoles (si hoy es miércoles, el siguiente: el hito de esta noche cubre hasta allá).
    const diaSemana = new Date(`${ahora.slice(0, 10)}T12:00:00Z`).getUTCDay();
    const hastaMie = ((3 - diaSemana + 7) % 7) || 7;
    const finMie = `${enZona(new Date(Date.now() + hastaMie * 86_400_000)).slice(0, 10)} 23:59`;
    const futuras = plan.ranuras.filter((r) => `${r.fecha} ${r.hora}` > ahora).sort((a, b) => `${a.fecha} ${a.hora}`.localeCompare(`${b.fecha} ${b.hora}`));
    const conGuion = futuras.filter((r) => r.formato === 'short' && CON_GUION.includes(r.estado));
    const shortsFuturos = futuras.filter((r) => r.formato === 'short');
    console.log(`  ${futuras.length} ranura(s) futura(s); Shorts con guion: ${conGuion.length}/${shortsFuturos.length}`);
    if (conGuion.length < 3) console.log(`  ⚠ menos de 3 ranuras futuras con guion → ritual de cierre (skill plan-semanal §5) y encargar guiones`);
    if (!futuras.some((r) => `${r.fecha} ${r.hora}` > en7d)) console.log('  ⚠ ninguna ranura a más de 7 días → falta armar la semana siguiente');
    const hastaHito = futuras.filter((r) => `${r.fecha} ${r.hora}` <= finMie);
    const sinProgramar = hastaHito.filter((r) => !ASEGURADA.includes(r.estado));
    const ultima = plan.ranuras.map((r) => r.fecha).sort().pop() ?? '';
    if (sinProgramar.length === 0 && ultima >= finMie.slice(0, 10)) {
      console.log(`  ✓ semana asegurada hasta el mié ${finMie.slice(0, 10)} (${hastaHito.length} ranuras programadas)`);
    } else {
      if (sinProgramar.length > 0) console.log(`  ⚠ hito del miércoles: ${sinProgramar.length}/${hastaHito.length} ranura(s) hasta el mié ${finMie.slice(0, 10)} sin programar (${sinProgramar.map((r) => `${r.fecha.slice(5)} ${r.hora} ${r.estado}`).join(', ')})`);
      if (ultima < finMie.slice(0, 10)) console.log(`  ⚠ hito del miércoles: el plan termina el ${ultima}; faltan las ranuras hasta el mié ${finMie.slice(0, 10)}`);
    }
    for (const r of futuras.slice(0, 4)) {
      console.log(`  ${r.fecha} ${r.hora}  ${r.plantilla.padEnd(8)} ${r.estado.padEnd(11)} ${r.tema.slice(0, 70)}${r.bloqueo ? `  ⚠ ${r.bloqueo.slice(0, 60)}` : ''}`);
    }
  } catch (e) {
    console.log(`  ✗ ${path.relative(RAIZ, archivoPlan)}: ${(e as Error).message} → armarlo (skill plan-semanal)`);
  }
}

// Lock y errores
const lock = path.join(DIR_SALIDA, 'diario.lock');
if (fs.existsSync(lock)) console.log(`\n⚠ ${rel(lock)} presente (pid ${fs.readFileSync(lock, 'utf8').trim()}): ¿hay un diario corriendo?`);
const errores = ultimosErrores(8);
console.log(`\nÚltimos errores en logs: ${errores.length ? '' : 'ninguno'}`);
for (const l of errores) console.log(`  ${l.slice(0, 170)}`);

// Métricas diarias (skill metricas-diarias): capturas de Studio + salida/metricas/AAAA-MM-DD/metricas.json.
if (!process.argv.includes('--sin-metricas')) {
  const { spawnSync } = await import('node:child_process');
  console.log('\nMétricas diarias:');
  const r = spawnSync(process.execPath, [path.join(RAIZ, 'node_modules', 'tsx', 'dist', 'cli.mjs'), path.join(RAIZ, 'scripts', 'metricas.mts')], { encoding: 'utf8', timeout: 12 * 60_000 });
  console.log(`  ${((r.stdout || '') + (r.stderr || '') || `sin salida (código ${r.status})`).trim().split('\n').join('\n  ')}`);
}
