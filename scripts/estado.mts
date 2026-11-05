/**
 * Resumen del estado de la fábrica: backlog por plantilla, bandeja por estado (con huérfanos),
 * próximas ranuras (con qué video iría en cada una), compilaciones, últimos errores y credenciales.
 *   npx tsx scripts/estado.mts [--sin-marcar]
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

// Lock y errores
const lock = path.join(DIR_SALIDA, 'diario.lock');
if (fs.existsSync(lock)) console.log(`\n⚠ ${rel(lock)} presente (pid ${fs.readFileSync(lock, 'utf8').trim()}): ¿hay un diario corriendo?`);
const errores = ultimosErrores(8);
console.log(`\nÚltimos errores en logs: ${errores.length ? '' : 'ninguno'}`);
for (const l of errores) console.log(`  ${l.slice(0, 170)}`);
