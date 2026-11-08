// Lee en Studio, por Short, "Stayed to watch" (se quedó a ver), vistas y duración media, con el piloto 8777 (canal Bolita Lab).
//   node herramientas/navegador/retencion-studio.mjs [id1 id2 …]   (sin ids: los últimos 10 publicados de salida/metricas/<hoy>/metricas.json)
// Es la métrica que decide el primer segundo de un Short (meta ≥ 55 %; satisfying ≈ 70 %+). La API de Analytics no la expone.
const B='http://127.0.0.1:8777'; const CANAL='UCi1_1_ItZCLY4axLshZcuZQ'; const NOMBRE='Bolita Lab';
import fs from 'node:fs'; import path from 'node:path';
let ids=process.argv.slice(2);
if(!ids.length){ const dir=path.resolve(import.meta.dirname,'..','..','salida','metricas'); const dias=fs.readdirSync(dir).filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(d)).sort(); const m=JSON.parse(fs.readFileSync(path.join(dir,dias.at(-1),'metricas.json'),'utf8')); const ahora=new Date().toISOString(); ids=m.videos.filter(v=>v.publicarEn&&new Date(v.publicarEn).toISOString()<=ahora&&!v.privado).sort((a,b)=>b.publicarEn.localeCompare(a.publicarEn)).slice(0,10).map(v=>v.id); }
const q=encodeURIComponent; const llamar=async p=>{const r=await fetch(B+p);const t=await r.text();try{return JSON.parse(t)}catch{return t}};
const esperar=ms=>llamar(`/esperar?ms=${ms}`); const texto=async()=>{const t=await llamar('/texto?max=20000');return typeof t==='string'?t:JSON.stringify(t)};
await llamar(`/ir?url=${q(`https://studio.youtube.com/channel/${CANAL}`)}`); await esperar(3000);
for (let i=0;i<2;i++){ const tx=await texto(); if(/don.t have permission/i.test(tx)){ await llamar(`/clicktexto?texto=${q('Switch account')}&exacto=1`); await esperar(4000); await llamar(`/clicktexto?texto=${q(NOMBRE)}&exacto=1`); await esperar(6000); continue;} if(!/Select a channel/i.test(tx)) break; await llamar(`/clicktexto?texto=${q(NOMBRE)}&exacto=1`); await esperar(5000); }
const u=await llamar('/url'); console.log('canal:', JSON.stringify(u));
console.log('id | stayed | swiped | vistas | dur.media | texto clave');
for (const id of ids){
  await llamar(`/ir?url=${q(`https://studio.youtube.com/video/${id}/analytics/tab-overview/period-default`)}`); await esperar(7000);
  let tx=await texto();
  if(!/Stayed to watch|Swiped away/i.test(tx)){ await esperar(5000); tx=await texto(); }
  const g=(re)=>{const m=tx.match(re);return m?m[1]:'-'};
  const stayed=g(/Stayed to watch\s*\n?\s*([\d.,]+%)/i);
  const swiped=g(/Swiped away\s*\n?\s*([\d.,]+%)/i);
  const vistas=g(/Views\s*\n\s*([\d.,K]+)\s*\n/i); const dur=g(/Average view duration\s*\n\s*([\d:]+)/i);
  const idx=tx.search(/Stayed to watch|Swiped away/i); const clave=idx>=0?tx.slice(Math.max(0,idx-80),idx+60).replace(/\n+/g,' | '):'(sin tarjeta)';
  console.log(`${id} | ${stayed} | ${swiped} | ${vistas} | ${dur} | ${clave.slice(0,140)}`);
}
