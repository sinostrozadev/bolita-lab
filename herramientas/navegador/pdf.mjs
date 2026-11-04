// Uso: node pdf.mjs <salida.pdf> <url|archivo.txt> [titulo]  — imprime una URL o un archivo de texto como PDF.
import { chromium } from 'playwright';
import fs from 'node:fs';
const [salida, fuente, titulo = fuente] = process.argv.slice(2);
const b = await chromium.launch({ args: ['--disable-gpu', '--no-sandbox'] });
const p = await b.newPage();
if (/^https?:/.test(fuente)) await p.goto(fuente, { waitUntil: 'networkidle' });
else {
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  await p.setContent(`<html><head><meta charset="utf-8"><style>body{font:10px/1.35 monospace;margin:28px} h1{font:bold 14px sans-serif} pre{white-space:pre-wrap;word-break:break-all}</style></head><body><h1>${esc(titulo)}</h1><pre>${esc(fs.readFileSync(fuente, 'utf8'))}</pre></body></html>`);
}
await p.pdf({ path: salida, format: 'A4', printBackground: true, margin: { top: '15mm', bottom: '15mm', left: '12mm', right: '12mm' } });
await b.close(); console.log('PDF:', salida);
