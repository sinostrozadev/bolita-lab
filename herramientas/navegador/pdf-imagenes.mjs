// Uso: node pdf-imagenes.mjs <salida.pdf> "<titulo>" <img1.png> [leyenda1] <img2.png> [leyenda2] ...
// Junta capturas en un PDF (una por página, con leyenda). Pares imagen/leyenda; la leyenda puede ir vacía ("").
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
const [salida, titulo, ...resto] = process.argv.slice(2);
const paginas = [];
for (let i = 0; i < resto.length; i += 2) paginas.push({ img: resto[i], leyenda: resto[i + 1] || '' });
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const html = `<html><head><meta charset="utf-8"><style>
body{font:12px/1.4 sans-serif;margin:0} .p{page-break-after:always;padding:10mm} h1{font-size:16px;margin:0 0 6px} h2{font-size:13px;margin:0 0 6px;color:#333}
img{max-width:100%;max-height:230mm;border:1px solid #ccc}</style></head><body>` +
  paginas.map((p, i) => `<div class="p"><h1>${esc(titulo)}</h1><h2>${i + 1}. ${esc(p.leyenda)}</h2><img src="data:image/${path.extname(p.img).slice(1) === 'jpg' ? 'jpeg' : path.extname(p.img).slice(1)};base64,${fs.readFileSync(p.img).toString('base64')}"></div>`).join('') + '</body></html>';
const b = await chromium.launch({ args: ['--disable-gpu', '--no-sandbox'] });
const p = await b.newPage(); await p.setContent(html);
await p.pdf({ path: salida, format: 'A4', printBackground: true, margin: { top: '8mm', bottom: '8mm', left: '8mm', right: '8mm' } });
await b.close(); console.log('PDF:', salida, paginas.length, 'páginas');
