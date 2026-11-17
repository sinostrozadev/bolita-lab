#!/usr/bin/env node
/**
 * related-video.mjs <shortId> <largoId>
 * Pone el "Related video" (enlace al largo sobre el Short) en Studio, vía piloto 8777.
 * Idempotente: si el Short ya tiene related video, no toca nada. No cambia título, fecha ni visibilidad
 * (solo pulsa el Save de la página, que guarda únicamente ese campo). El largo debe ser PÚBLICO.
 * Requisitos: piloto vivo y la sesión ya en el canal dueño de ambos videos ("Oops" => Switch account).
 * Lanzar dentro de: flock -w 1800 /tmp/piloto.lock node related-video.mjs <shortId> <largoId>
 * Para fijar el modo en seco (solo leer): DRY=1.
 * Probado 2026-11-17 en Bolita Lab.
 */
const P = "http://127.0.0.1:8777";
const get = async (ruta, q = {}) => (await fetch(`${P}${ruta}?${new URLSearchParams(q)}`)).text();
const ev = async (js) => JSON.parse(await get("/eval", { js }));
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

const CANAL_ID = process.env.CANAL_ID ?? "UCi1_1_ItZCLY4axLshZcuZQ";
const CANAL_NOMBRE = process.env.CANAL_NOMBRE ?? "Bolita Lab";

// Si Studio está en otro canal de marca de la misma cuenta: Switch account y clic en el nombre del canal.
async function asegurarCanal() {
  await get("/ir", { url: `https://studio.youtube.com/channel/${CANAL_ID}` });
  await dormir(6000);
  const t = await get("/texto", { max: 600 });
  if (!/don't have permission|Oops/i.test(t)) return;
  await get("/clicktexto", { texto: "Switch account", exacto: "1" });
  await dormir(5000);
  await get("/clicktexto", { texto: CANAL_NOMBRE, exacto: "1" });
  await dormir(8000);
}

async function abrir(id, reintento = false) {
  await get("/ir", { url: `https://studio.youtube.com/video/${id}/edit` });
  for (let i = 0; i < 15; i++) {
    await dormir(2000);
    const t = await get("/texto", { max: 600 });
    if (/don't have permission|something went wrong|Oops/i.test(t)) {
      if (reintento) throw new Error("canal equivocado u Oops");
      await asegurarCanal();
      return abrir(id, true);
    }
    if (/Title \(required\)/.test(t)) return;
  }
  throw new Error("Studio no cargó");
}
const titulo = () => ev(`(()=>{const t=document.querySelector("#title-textarea #textbox");return t?t.innerText.trim():null})()`);
const relacionado = () => ev(`(()=>{const t=[...document.querySelectorAll("ytcp-dropdown-trigger")].find(e=>/Related video/.test(e.innerText));return t?t.innerText.replace(/Related video/,"").trim():null})()`);

async function uno(short, largo) {
  await abrir(largo);
  const tl = await titulo();
  if (!tl) throw new Error("no pude leer el título del largo");
  await abrir(short);
  const antes = await relacionado();
  if (antes === null) return "SIN OPCION Related video en este Short";
  if (antes && antes !== "None") return `YA TIENE (${antes.slice(0, 50)}): no se toca`;
  if (process.env.DRY) return `DRY: pondría "${tl.slice(0, 50)}"`;
  const ts = await titulo();
  await ev(`(()=>{const t=[...document.querySelectorAll("ytcp-dropdown-trigger")].find(e=>/Related video/.test(e.innerText));t.scrollIntoView();t.click();return 1})()`);
  await dormir(3000);
  const q = tl.slice(0, 40);
  await get("/escribir", { sel: "ytcp-video-pick-dialog input#search-yours", texto: q });
  await dormir(3000);
  const ok = await ev(`(()=>{const c=[...document.querySelectorAll("ytcp-video-pick-dialog ytcp-entity-card")].filter(e=>e.offsetWidth&&(e.innerText||"").trim().startsWith(${JSON.stringify(tl.slice(0, 30))}));if(c.length!=1)return c.length;c[0].click();return 1})()`);
  if (ok !== 1) {
    await get("/click", { sel: "ytcp-video-pick-dialog ytcp-icon-button >> visible=true >> nth=0" }).catch(() => {});
    throw new Error(`el buscador dio ${ok} coincidencias para el largo`);
  }
  await dormir(2500);
  // Si el diálogo sigue abierto, hay un botón de confirmar/guardar dentro.
  const sigue = await ev(`(()=>{const d=document.querySelector("ytcp-video-pick-dialog");return !!(d&&d.offsetWidth)})()`);
  if (sigue) await ev(`(()=>{const b=[...document.querySelectorAll("ytcp-video-pick-dialog ytcp-button")].find(e=>e.offsetWidth&&/Save|Select|Done|Guardar/i.test(e.innerText));if(b)b.click();return 1})()`);
  await dormir(2500);
  await get("/click", { sel: "ytcp-button#save >> visible=true" });
  await dormir(6000);
  // Reabrir para confirmar que persistió y que el título no cambió.
  await abrir(short);
  const despues = await relacionado();
  const ts2 = await titulo();
  if (!despues || despues === "None") throw new Error("no persistió");
  if (ts2 !== ts) throw new Error("el título cambió (!)");
  return `PUESTO: ${despues.slice(0, 50)}`;
}
const [short, largo] = process.argv.slice(2);
if (!short || !largo) { console.error("uso: related-video.mjs <shortId> <largoId>"); process.exit(1); }
try { console.log(short, await uno(short, largo)); } catch (e) { console.log(short, "FALLO", e.message); process.exit(2); }
