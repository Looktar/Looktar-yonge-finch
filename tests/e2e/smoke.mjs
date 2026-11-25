// Smoke test: serves dist/, opens the game on desktop and on an emulated iPhone (landscape), starts a run, renders
// one frame from the spawn point and saves it to test-results/smoke/. Fails on any page error or console error.
// Software rendering (swiftshader) runs at ~2 fps, so the main loop is held and frames are rendered by hand.
import { chromium, devices } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve('dist'), OUT = path.resolve('test-results/smoke'), PORT = 8766;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png' };
fs.mkdirSync(OUT, { recursive: true });
const server = http.createServer((q, r) => {
  const f = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname.replace(/\/$/, '/index.html')));
  if (!f.startsWith(ROOT) || !fs.existsSync(f)) { r.writeHead(404); r.end(); return; }
  r.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r);
}).listen(PORT);

const CASES = [
  { name: 'desktop', ctx: { viewport: { width: 1280, height: 720 } }, q: 'mid' },
  { name: 'iphone', ctx: { ...devices['iPhone 13 landscape'] }, q: 'low' },
];
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let failed = 0;
for (const c of CASES) {
  const errors = [], t0 = Date.now();
  const ctx = await browser.newContext(c.ctx), p = await ctx.newPage(); p.setDefaultTimeout(300000);
  p.on('console', m => { if (m.type() === 'error' || /self-test failed/.test(m.text())) errors.push('console: ' + m.text().slice(0, 300)); });
  p.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await p.addInitScript(() => { const raf = window.requestAnimationFrame.bind(window); window.__hold = false; window.requestAnimationFrame = cb => window.__hold ? 0 : raf(cb); });
  try {
    await p.goto(`http://localhost:${PORT}/index.html`);
    await p.waitForFunction(() => !document.getElementById('start').disabled);
    await p.evaluate(q => { const r = document.getElementById('q-' + q); if (r) r.checked = true; setTimeout(() => document.getElementById('start').click(), 0); }, c.q);
    await p.waitForFunction(() => window.__yf && window.__yf.composer);
    await p.waitForTimeout(3000);
    const res = await p.evaluate(() => {
      window.__hold = true; const Y = window.__yf;
      Y.update(0.016); if (Y.placeSun) Y.placeSun(Y.player.x, Y.player.z); Y.composer.render(); Y.composer.render();
      const cv = Y.renderer.domElement, url = cv.toDataURL('image/png');
      // a blank frame (all black / all white) is the classic failure: sample the canvas brightness
      const s = document.createElement('canvas'); s.width = 32; s.height = 18; const g = s.getContext('2d'); g.drawImage(cv, 0, 0, 32, 18);
      const d = g.getImageData(0, 0, 32, 18).data; let sum = 0, sq = 0; for (let i = 0; i < d.length; i += 4) { const l = (d[i] + d[i + 1] + d[i + 2]) / 3; sum += l; sq += l * l; }
      const n = d.length / 4, mean = sum / n;
      return { url, mean, sd: Math.sqrt(sq / n - mean * mean), calls: Y.renderer.info.render.calls };
    });
    fs.writeFileSync(path.join(OUT, c.name + '.png'), Buffer.from(res.url.split(',')[1], 'base64'));
    if (res.mean < 8 || res.mean > 247 || res.sd < 4) errors.push(`frame looks blank (mean ${res.mean.toFixed(1)}, sd ${res.sd.toFixed(1)})`);
    console.log(`${c.name}: mean ${res.mean.toFixed(1)} sd ${res.sd.toFixed(1)} draw calls ${res.calls} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  } catch (e) { errors.push('exception: ' + e.message); }
  if (errors.length) { failed++; console.log(`FAIL ${c.name}\n  ` + errors.join('\n  ')); } else console.log(`ok ${c.name}`);
  await ctx.close();
}
await browser.close(); server.close();
process.exit(failed ? 1 : 0);
