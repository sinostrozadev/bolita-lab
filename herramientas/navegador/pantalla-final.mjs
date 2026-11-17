#!/usr/bin/env node
/**
 * pantalla-final.mjs <videoId> [<videoId>...]
 * Pone la pantalla final de YouTube Studio (plantilla "1 video, 1 subscribe":
 * Subscribe + Video "Best for viewer", ~20 s finales) a videos YA subidos, vía piloto 8777.
 * Idempotente: si el video ya tiene elementos, no toca nada. No cambia visibilidad ni fecha.
 * Requisitos: piloto vivo y la sesión ya en el canal dueño del video (si sale "Oops", cambiar
 * de canal con Switch account). Lanzar dentro de: flock -w 1800 /tmp/piloto.lock node pantalla-final.mjs <id>
 * Probado 2026-11-17 en En Números Rojos (Argentina BQNaK5R-yrk). Funciona igual en cualquier canal.
 */
const P = "http://127.0.0.1:8777";
const get = async (ruta, q = {}) => (await fetch(`${P}${ruta}?${new URLSearchParams(q)}`)).text();
const ev = async (js) => JSON.parse(await get("/eval", { js }));
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

async function uno(id) {
  await get("/ir", { url: `https://studio.youtube.com/video/${id}/edit` });
  await dormir(10000);
  const t = await get("/texto", { max: 400 });
  if (/don't have permission|something went wrong/i.test(t)) return "ERROR: canal equivocado u Oops";
  await get("/clicktexto", { texto: "End screen" });
  await dormir(8000);
  const estado = await ev(`(()=>{
    const pick=[...document.querySelectorAll("ytve-endscreen-template-picker")].some(e=>e.offsetWidth);
    const saved=[...document.querySelectorAll("ytve-endscreen-editor-options-panel, ytve-endscreen-editor *")].some(e=>e.offsetWidth&&/Subscribe element|Video element|Subscribe:/.test(e.innerText||""));
    return {pick,saved}})()`);
  if (!estado.pick) {
    await get("/click", { sel: "tp-yt-paper-dialog ytcp-button#discard-button >> visible=true" }).catch(() => {});
    return "YA TENIA pantalla final (no se toco)";
  }
  await get("/click", { sel: "ytve-endscreen-template-picker .template-preview >> nth=0" });
  await dormir(4000);
  await get("/click", { sel: "tp-yt-paper-dialog ytcp-button#save-button >> visible=true" });
  await dormir(7000);
  return "PUESTA";
}
const ids = process.argv.slice(2);
if (!ids.length) { console.error("uso: pantalla-final.mjs <videoId>..."); process.exit(1); }
for (const id of ids) {
  try { console.log(id, await uno(id)); } catch (e) { console.log(id, "FALLO", e.message); }
}
