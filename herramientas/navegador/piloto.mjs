// Servidor de control de un Chromium con perfil persistente, visible en el escritorio (WSLg).
// Comandos por HTTP en 127.0.0.1:8777: /ir?url=, /captura, /texto, /click?sel=, /escribir?sel=&texto=, /eval?js=, /url, /esperar?ms=
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';

const perfil = '/home/santiago/.config/bolita-navegador';
fs.mkdirSync(perfil, { recursive: true });
const OPCIONES = {
  headless: process.env.SIN_PANTALLA === '1',
  channel: process.env.SIN_PANTALLA === '1' ? 'chromium' : undefined,
  viewport: { width: 1280, height: 900 },
  locale: 'es-CL',
  timezoneId: 'America/Santiago',
  args: ['--disable-blink-features=AutomationControlled', '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--renderer-process-limit=2'],
  ignoreDefaultArgs: ['--enable-automation'],
};
let ctx = await chromium.launchPersistentContext(perfil, OPCIONES);
let page = ctx.pages()[0] ?? (await ctx.newPage());
let ultimaUrl = 'https://accounts.google.com/v3/signin/identifier?continue=https://www.youtube.com/&flowName=GlifWebSignIn&flowEntry=ServiceLogin';
let rota = false;
const vigilar = (p) => { p.on('crash', () => { console.log('pestaña caída', new Date().toISOString()); rota = true; }); p.on('close', () => { if (p === page) rota = true; }); };
vigilar(page);
ctx.on('page', (p) => { page = p; rota = false; vigilar(p); });
// Si la pestaña murió (OOM), abre otra y vuelve a la última URL conocida.
async function pagina() {
  if (rota || page.isClosed()) {
    try { if (!page.isClosed()) await page.close(); } catch {}
    try { page = await ctx.newPage(); } catch (e) {
      // El navegador entero murió (OOM): relanzar el contexto con el mismo perfil.
      console.log('navegador caído, relanzando', String(e.message ?? e).slice(0, 80));
      try { await ctx.close(); } catch {}
      for (const f of ['SingletonLock', 'SingletonSocket', 'SingletonCookie']) { try { fs.unlinkSync(`${perfil}/${f}`); } catch {} }
      ctx = await chromium.launchPersistentContext(perfil, OPCIONES);
      ctx.on('page', (p) => { page = p; rota = false; vigilar(p); });
      page = ctx.pages()[0] ?? (await ctx.newPage());
    }
    rota = false; vigilar(page);
    await page.goto(ultimaUrl, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
    console.log('pestaña recuperada →', ultimaUrl);
  }
  try { const u = page.url(); if (u && u !== 'about:blank') ultimaUrl = u; } catch {}
  return page;
}

const q = (u) => Object.fromEntries(new URL(u, 'http://x').searchParams);
const responder = (res, cuerpo, tipo = 'application/json') => { res.writeHead(200, { 'content-type': tipo }); res.end(cuerpo); };

http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://x');
  const p = q(req.url);
  try {
    if (pathname !== '/ver' && pathname !== '/paginas' && pathname !== '/salir') await pagina();

    if (pathname === '/ver') return responder(res, `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Bolita Lab · navegador</title>
<style>body{margin:0;background:#0B0B12;color:#F4F4FF;font-family:system-ui}#barra{padding:10px 14px;display:flex;gap:12px;align-items:center;font-size:14px}#barra b{color:#C8FF3D}
#img{display:block;width:1280px;height:900px;cursor:crosshair;outline:none;border-top:1px solid #22223a}</style></head><body>
<div id="barra"><b>Bolita Lab</b> · navegador remoto · haz clic en la imagen y escribe normalmente · <span id="u"></span></div>
<img id="img" tabindex="0" src="/captura?t=0">
<script>
const img=document.getElementById('img');let ocupado=false;
async function refrescar(){ if(!ocupado){ img.src='/captura?t='+Date.now(); } try{const r=await fetch('/url');const j=await r.json();document.getElementById('u').textContent=(j.titulo||'')+' — '+(j.url||'');}catch{} }
setInterval(refrescar,900);
img.addEventListener('click',async e=>{const r=img.getBoundingClientRect();const x=Math.round((e.clientX-r.left)*1280/r.width),y=Math.round((e.clientY-r.top)*900/r.height);img.focus();ocupado=true;await fetch('/clic?x='+x+'&y='+y);ocupado=false;});
img.addEventListener('keydown',async e=>{e.preventDefault();ocupado=true;const k=e.key;const esp={Enter:'Enter',Backspace:'Backspace',Tab:'Tab',Escape:'Escape',ArrowLeft:'ArrowLeft',ArrowRight:'ArrowRight',ArrowUp:'ArrowUp',ArrowDown:'ArrowDown',Delete:'Delete',Home:'Home',End:'End'};
 if(esp[k]) await fetch('/tecla?k='+esp[k]); else if(k.length===1){ if(e.ctrlKey) await fetch('/tecla?k=Control+'+k); else await fetch('/tipear?t='+encodeURIComponent(k)); }
 ocupado=false;});
img.addEventListener('paste',async e=>{const t=(e.clipboardData||window.clipboardData).getData('text');if(t){ocupado=true;await fetch('/tipear?t='+encodeURIComponent(t));ocupado=false;}});
</script></body></html>`, 'text/html; charset=utf-8');
    if (pathname === '/clic') { await page.mouse.click(+p.x, +p.y); await page.waitForTimeout(300); return responder(res, '{"ok":true}'); }
    if (pathname === '/tipear') { await page.keyboard.type(p.t, { delay: 20 }); return responder(res, '{"ok":true}'); }
    if (pathname === '/ir') { await page.goto(p.url, { waitUntil: 'domcontentloaded', timeout: 60000 }); return responder(res, JSON.stringify({ url: page.url(), titulo: await page.title() })); }
    if (pathname === '/url') return responder(res, JSON.stringify({ url: page.url(), titulo: await page.title() }));
    if (pathname === '/captura') { const b = await page.screenshot({ fullPage: p.full === '1' }); return responder(res, b, 'image/png'); }
    if (pathname === '/texto') { const t = await page.evaluate(() => document.body.innerText); return responder(res, t.slice(0, +(p.max ?? 6000)), 'text/plain; charset=utf-8'); }
    if (pathname === '/click') { await page.locator(p.sel).first().click({ timeout: 15000 }); await page.waitForTimeout(800); return responder(res, JSON.stringify({ ok: true, url: page.url() })); }
    if (pathname === '/clicktexto') { await page.getByText(p.texto, { exact: p.exacto === '1' }).first().click({ timeout: 15000 }); await page.waitForTimeout(800); return responder(res, JSON.stringify({ ok: true, url: page.url() })); }
    if (pathname === '/escribir') { const l = page.locator(p.sel).first(); await l.click({ timeout: 15000 }); await l.fill(p.texto); return responder(res, JSON.stringify({ ok: true })); }
    if (pathname === '/tecla') { await page.keyboard.press(p.k); await page.waitForTimeout(500); return responder(res, JSON.stringify({ ok: true })); }
    if (pathname === '/eval') { const r = await page.evaluate(p.js); return responder(res, JSON.stringify(r ?? null)); }
    if (pathname === '/esperar') { await page.waitForTimeout(+(p.ms ?? 1000)); return responder(res, JSON.stringify({ ok: true })); }
    if (pathname === '/archivo') { await page.locator(p.sel).first().setInputFiles(p.ruta); await page.waitForTimeout(1500); return responder(res, JSON.stringify({ ok: true })); }
    if (pathname === '/paginas') return responder(res, JSON.stringify(ctx.pages().map((x) => x.url())));
    // Pestañas: /nueva?url= abre otra y la deja activa; /usar?i=N activa la N-ésima (0 = la primera); /cerrar cierra la activa y vuelve a la primera.
    if (pathname === '/nueva') { page = await ctx.newPage(); rota = false; vigilar(page); if (p.url) await page.goto(p.url, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {}); return responder(res, JSON.stringify({ i: ctx.pages().indexOf(page), url: page.url() })); }
    if (pathname === '/usar') { const x = ctx.pages()[+(p.i ?? 0)]; if (!x || x.isClosed()) return responder(res, '{"error":"no existe esa pestaña"}'); page = x; rota = false; await page.bringToFront(); return responder(res, JSON.stringify({ i: +(p.i ?? 0), url: page.url() })); }
    if (pathname === '/cerrar') { const vieja = page; const otras = ctx.pages().filter((x) => x !== vieja && !x.isClosed()); if (otras.length) { page = otras[0]; rota = false; await page.bringToFront(); } try { await vieja.close(); } catch {} return responder(res, JSON.stringify({ url: page.url(), pestañas: ctx.pages().length })); }
    if (pathname === '/salir') { await ctx.close(); responder(res, '{"ok":true}'); process.exit(0); }
    responder(res, JSON.stringify({ error: 'comando desconocido' }));
  } catch (e) { if (/crashed/i.test(String(e.message ?? e))) rota = true; res.writeHead(500, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: String(e.message ?? e) })); }
}).listen(8777, '127.0.0.1', () => console.log('piloto listo en 127.0.0.1:8777'));
