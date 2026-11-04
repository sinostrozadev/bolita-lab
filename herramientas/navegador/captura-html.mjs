// Uso: node captura-html.mjs <entrada.html> <salida.png> [ancho] — renderiza un HTML local a PNG (página completa).
import { chromium } from 'playwright';
import path from 'node:path';
const [entrada, salida, ancho = '1400'] = process.argv.slice(2);
const b = await chromium.launch({ args: ['--disable-gpu', '--no-sandbox'] });
const p = await b.newPage({ viewport: { width: Number(ancho), height: 900 }, deviceScaleFactor: 2 });
await p.goto('file://' + path.resolve(entrada)); await p.waitForTimeout(300);
await p.screenshot({ path: salida, fullPage: true }); await b.close(); console.log('PNG:', salida);
