/**
 * Levanta el navegador piloto (:8777) si no responde. Lo llaman los scripts de métricas/estado
 * al inicio, para que un reinicio de WSL no los deje fallando en silencio (2026-11-18).
 * Seguro ante carreras: lock atómico (mkdir) y re-chequeo del puerto; nunca mata procesos.
 */
import fs from 'node:fs';
import { spawn } from 'node:child_process';

const DIR_PILOTO = '/home/santiago/projects/yt/bolita-lab/herramientas/navegador';
const LOCK = '/tmp/piloto-arranque.lock';
const vivo = async (url: string) => {
  try { const r = await fetch(url + '/paginas', { signal: AbortSignal.timeout(4000) }); return r.ok; } catch { return false; }
};

export async function asegurarPiloto(url = process.env.PILOTO_URL ?? 'http://127.0.0.1:8777'): Promise<boolean> {
  if (await vivo(url)) return true;
  if (!url.includes(':8777')) return false; // solo el piloto compartido; otros puertos (8778 Romi) no se tocan
  try { fs.mkdirSync(LOCK); } catch {
    // otro script lo está levantando: esperar hasta 60 s a que responda
    for (let i = 0; i < 20; i++) { await new Promise((r) => setTimeout(r, 3000)); if (await vivo(url)) return true; }
    return false;
  }
  try {
    if (await vivo(url)) return true;
    const env = { ...process.env } as NodeJS.ProcessEnv;
    // Con pantalla (WSLg) si hay; en cron no hay DISPLAY → headless con el mismo perfil.
    if (!env.DISPLAY && !fs.existsSync('/mnt/wslg/.X11-unix/X0')) env.SIN_PANTALLA = '1';
    else env.DISPLAY ??= ':0';
    const log = fs.openSync(`${DIR_PILOTO}/piloto.log`, 'a');
    spawn('node', ['piloto.mjs'], { cwd: DIR_PILOTO, env, detached: true, stdio: ['ignore', log, log] }).unref();
    for (let i = 0; i < 20; i++) { await new Promise((r) => setTimeout(r, 3000)); if (await vivo(url)) return true; }
    return false;
  } finally { try { fs.rmdirSync(LOCK); } catch {} }
}
