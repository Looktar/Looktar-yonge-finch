import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { B } from './data_b.js';
import { R } from './data_r.js';
import { A, N } from './data_a.js';
import { X } from './data_x.js';
import { buildCity } from './buildings.js';
import { addStreetscape, cityTrees, parseX, nearestRoad } from './street.js';

// ---------- helpers ----------
export const dec = s => { const v = s.split(',').map(Number); const p = []; let x = 0, z = 0; for (let i = 0; i < v.length; i += 2) { x += v[i]; z += v[i + 1]; p.push([x / 2, z / 2]); } return p; };
export function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const area = p => { let s = 0; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; };
export const pip = (x, z, p) => { let c = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const a = p[i], b = p[j]; if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
const centroid = p => { let x = 0, z = 0; for (const q of p) { x += q[0]; z += q[1]; } return [x / p.length, z / p.length]; };

export const EXT = 470;           // half extent of the world grid (m)
export const CELL = 2;            // nav grid cell (m)
export const GN = Math.ceil(EXT * 2 / CELL);
export const ECELL = 8;           // edge grid cell (m)
export const EN = Math.ceil(EXT * 2 / ECELL);
export const PLAY_C = [0, 60], PLAY_R = 380;   // playable circle
export const START = [-6, 128];
export const XING = [-3, 92];     // Yonge & Finch intersection

// ---------- collision system ----------
export class Collision {
  constructor() { this.edges = []; this.cells = new Map(); this.blocked = new Uint8Array(GN * GN); this.polys = []; }
  addPoly(p, block = true) {
    if (area(p) < 0) p = p.slice().reverse();
    this.polys.push(p);
    for (let i = 0; i < p.length; i++) {
      const a = p[i], b = p[(i + 1) % p.length]; const id = this.edges.length / 4; this.edges.push(a[0], a[1], b[0], b[1]);
      const x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]), z0 = Math.min(a[1], b[1]), z1 = Math.max(a[1], b[1]);
      for (let ix = Math.floor((x0 + EXT) / ECELL); ix <= Math.floor((x1 + EXT) / ECELL); ix++)
        for (let iz = Math.floor((z0 + EXT) / ECELL); iz <= Math.floor((z1 + EXT) / ECELL); iz++) {
          const k = ix + iz * EN; let c = this.cells.get(k); if (!c) this.cells.set(k, c = []); c.push(id);
        }
    }
    if (!block) return;
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const q of p) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); z0 = Math.min(z0, q[1]); z1 = Math.max(z1, q[1]); }
    for (let ix = Math.max(0, Math.floor((x0 + EXT) / CELL)); ix <= Math.min(GN - 1, Math.floor((x1 + EXT) / CELL)); ix++)
      for (let iz = Math.max(0, Math.floor((z0 + EXT) / CELL)); iz <= Math.min(GN - 1, Math.floor((z1 + EXT) / CELL)); iz++) {
        const cx = ix * CELL - EXT + CELL / 2, cz = iz * CELL - EXT + CELL / 2;
        if (pip(cx, cz, p)) this.blocked[ix + iz * GN] = 1;
      }
  }
  addLine(a, b) {
    const id = this.edges.length / 4; this.edges.push(a[0], a[1], b[0], b[1]);
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]); const seen = new Set();
    for (let s = 0; s <= L; s += 1) { const x = a[0] + (b[0] - a[0]) * s / L, z = a[1] + (b[1] - a[1]) * s / L;
      const k = Math.floor((x + EXT) / ECELL) + Math.floor((z + EXT) / ECELL) * EN; if (!seen.has(k)) { seen.add(k); let c = this.cells.get(k); if (!c) this.cells.set(k, c = []); c.push(id); }
      const ix = Math.floor((x + EXT) / CELL), iz = Math.floor((z + EXT) / CELL); if (ix >= 0 && iz >= 0 && ix < GN && iz < GN) this.blocked[ix + iz * GN] = 1; }
  }
  isBlocked(x, z) { const ix = Math.floor((x + EXT) / CELL), iz = Math.floor((z + EXT) / CELL); if (ix < 0 || iz < 0 || ix >= GN || iz >= GN) return true; return this.blocked[ix + iz * GN] === 1; }
  // push a circle out of walls; returns true if collided
  resolve(p, r) {
    let hit = false; const E = this.edges;
    for (let it = 0; it < 2; it++) {
      const ix0 = Math.floor((p.x - r + EXT) / ECELL), ix1 = Math.floor((p.x + r + EXT) / ECELL), iz0 = Math.floor((p.z - r + EXT) / ECELL), iz1 = Math.floor((p.z + r + EXT) / ECELL);
      for (let ix = ix0; ix <= ix1; ix++) for (let iz = iz0; iz <= iz1; iz++) {
        const c = this.cells.get(ix + iz * EN); if (!c) continue;
        for (const id of c) {
          const ax = E[id * 4], az = E[id * 4 + 1], bx = E[id * 4 + 2], bz = E[id * 4 + 3];
          const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1e-9;
          let t = ((p.x - ax) * dx + (p.z - az) * dz) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
          const qx = ax + dx * t, qz = az + dz * t; let ox = p.x - qx, oz = p.z - qz; const d2 = ox * ox + oz * oz;
          if (d2 < r * r) {
            let d = Math.sqrt(d2);
            if (d < 1e-5) { ox = dz; oz = -dx; d = Math.hypot(ox, oz); }
            p.x = qx + ox / d * r; p.z = qz + oz / d * r; hit = true;
          }
        }
      }
    }
    return hit;
  }
  // first wall hit distance along a horizontal ray
  ray(ox, oz, dx, dz, maxD) {
    const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L; let best = maxD; const seen = new Set(); const E = this.edges;
    for (let s = 0; s <= maxD + ECELL; s += ECELL / 3) {
      if (s > best + ECELL) break;
      const x = ox + dx * s, z = oz + dz * s; const k = Math.floor((x + EXT) / ECELL) + Math.floor((z + EXT) / ECELL) * EN;
      if (seen.has(k)) continue; seen.add(k); const c = this.cells.get(k); if (!c) continue;
      for (const id of c) {
        const ax = E[id * 4], az = E[id * 4 + 1], ex = E[id * 4 + 2] - ax, ez = E[id * 4 + 3] - az;
        const den = dx * ez - dz * ex; if (Math.abs(den) < 1e-9) continue;
        const t = ((ax - ox) * ez - (az - oz) * ex) / den, u = ((ax - ox) * dz - (az - oz) * dx) / den;
        if (t > 0 && u >= 0 && u <= 1 && t < best) best = t;
      }
    }
    return best;
  }
}

// ---------- textures ----------
function noiseTex(size, fn, repeat = true) {
  const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d'); const img = g.createImageData(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) { const v = fn(x, y); const i = (y * size + x) * 4; img.data[i] = v[0]; img.data[i + 1] = v[1]; img.data[i + 2] = v[2]; img.data[i + 3] = 255; }
  g.putImageData(img, 0, 0); const t = new THREE.CanvasTexture(c); if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; } return t;
}
function valueNoise(seed) {
  const r = rng(seed); const P = 64; const g = new Float32Array(P * P).map(() => r());
  const at = (x, y) => g[((y % P + P) % P) * P + ((x % P + P) % P)];
  return (x, y, f) => { x *= f; y *= f; const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi; const s = t => t * t * (3 - 2 * t);
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1); return a + (b - a) * s(xf) + (c - a) * s(yf) + (a - b - c + d) * s(xf) * s(yf); };
}
function fbm(n, x, y, size) { // tileable-ish fbm sampled with periodic noise
  let v = 0, amp = 0.5, f = 64 / size * 2; for (let o = 0; o < 4; o++) { v += n(x, y, f) * amp; f *= 2; amp *= 0.5; } return v;
}
export function makeTextures() {
  const n1 = valueNoise(7), n2 = valueNoise(13);
  const S = 256;
  // dry asphalt: rough everywhere, slightly polished in the wheel paths
  const roadRough = noiseTex(S, (x, y) => { const v = fbm(n1, x, y, S); const r = 200 + (v - 0.5) * 60 + (n2(x, y, 1) - 0.5) * 24; return [r, r, r]; });
  const roadColor = noiseTex(S, (x, y) => { const v = fbm(n2, x, y, S); const c = 60 + v * 28 + (n1(x, y, 2) - 0.5) * 16 + (n1(x, y, 9) > 0.8 ? -14 : 0); return [c, c, c + 1]; });
  const grass = noiseTex(S, (x, y) => { const v = fbm(n1, x + 31, y + 17, S); const w = n2(x, y, 3); return [38 + v * 30 + w * 10, 44 + v * 30, 30 + v * 14]; });
  const conc = noiseTex(S, (x, y) => { const v = fbm(n2, x + 5, y + 9, S); const seam = (x % 64 < 2 || y % 64 < 2) ? -25 : 0; const c = 100 + v * 40 + seam; return [c, c, c - 3]; });
  const dash = (() => { const c = document.createElement('canvas'); c.width = 4; c.height = 64; const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, 4, 64); g.fillStyle = '#fff'; g.fillRect(0, 0, 4, 22); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; })();
  const pool = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.55)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.12)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c); })();
  const glow = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.4)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
  for (const t of [roadColor, grass, conc]) t.colorSpace = THREE.SRGBColorSpace;
  return { roadRough, roadColor, grass, conc, dash, pool, glow };
}

// ---------- roads ----------
const RW = { pri: 3.3, sec: 3.3, ter: 3.2 };
function roadWidth(t, lanes, oneway) {
  if (RW[t]) return (lanes || (oneway ? 2 : t === 'ter' ? 2 : 4)) * RW[t];
  if (t === 'res' || t === 'unc') return 7.4;
  return (lanes || 1) * 3.2 + 1.4;
}
function parseRoads() {
  return R.split('\n').map(l => { const f = l.split('|'); const p = dec(f[5]); return { t: f[1], lanes: f[2] ? +f[2] : 0, name: f[3], oneway: f[4] === '1', p }; })
    .filter(r => r.p.length >= 2 && Math.hypot(r.p[r.p.length - 1][0] - r.p[0][0], r.p[r.p.length - 1][1] - r.p[0][1]) > 0.5);
}
function ribbon(p, w, y, off, out, uvAlong, along0 = 0) {
  // out: {pos:[], uv:[]}; off = lateral offset of ribbon centre
  const n = p.length; const L = [], R2 = []; let s = along0; const ss = [];
  for (let i = 0; i < n; i++) {
    const a = p[Math.max(0, i - 1)], b = p[Math.min(n - 1, i + 1)];
    let dx = b[0] - a[0], dz = b[1] - a[1]; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    let nx = -dz, nz = dx; let k = 1;
    if (i > 0 && i < n - 1) { const d1 = [p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]]; const l1 = Math.hypot(...d1) || 1; const n1 = [-d1[1] / l1, d1[0] / l1]; const c = n1[0] * nx + n1[1] * nz; k = Math.min(2, 1 / Math.max(0.5, c)); }
    const q = p[i]; L.push([q[0] + nx * (off - w / 2) * k, q[1] + nz * (off - w / 2) * k]); R2.push([q[0] + nx * (off + w / 2) * k, q[1] + nz * (off + w / 2) * k]);
    if (i > 0) s += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); ss.push(s);
  }
  for (let i = 0; i < n - 1; i++) {
    const a = L[i], b = R2[i], c = L[i + 1], d = R2[i + 1];
    const quad = [a, c, b, b, c, d]; const qs = [ss[i], ss[i + 1], ss[i], ss[i], ss[i + 1], ss[i + 1]]; const qu = [0, 0, 1, 1, 0, 1];
    for (let j = 0; j < 6; j++) { out.pos.push(quad[j][0], y, quad[j][1]); if (uvAlong) out.uv.push(qu[j], qs[j] / uvAlong); else out.uv.push(quad[j][0] / 7, quad[j][1] / 7); }
  }
  return s;
}
function geomFrom(out) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(out.pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(out.uv, 2)); const nn = new Float32Array(out.pos.length); for (let i = 1; i < nn.length; i += 3) nn[i] = 1; g.setAttribute('normal', new THREE.BufferAttribute(nn, 3)); g.computeBoundingSphere(); return g; }

function buildRoads(roads, tex) {
  const asphalt = { pos: [], uv: [] }, walk = { pos: [], uv: [] }, solid = { pos: [], uv: [] }, yellow = { pos: [], uv: [] }, dashed = { pos: [], uv: [] };
  for (const r of roads) {
    const w = roadWidth(r.t, r.lanes, r.oneway); r.w = w;
    const sw = { pri: 1.0, sec: 1.0, ter: 1.0, res: 1.8, unc: 1.8 }[r.t] || 0;
    if (sw) ribbon(r.p, w + sw * 2, 0.012, 0, walk);
    ribbon(r.p, w, 0.03, 0, asphalt);
    if (RW[r.t]) {
      const lanes = r.lanes || (r.oneway ? 2 : r.t === 'ter' ? 2 : 4); const lw = w / lanes;
      if (r.t !== 'ter') { ribbon(r.p, 0.14, 0.042, -w / 2 + 0.35, solid, 0); ribbon(r.p, 0.14, 0.042, w / 2 - 0.35, solid, 0); }
      if (r.oneway) { for (let i = 1; i < lanes; i++) ribbon(r.p, 0.13, 0.044, -w / 2 + i * lw, dashed, 9); }
      else {
        ribbon(r.p, 0.12, 0.044, -0.13, yellow, 0); ribbon(r.p, 0.12, 0.044, 0.13, yellow, 0);
        const half = Math.floor(lanes / 2); for (let i = 1; i < half; i++) { ribbon(r.p, 0.13, 0.044, i * lw, dashed, 9); ribbon(r.p, 0.13, 0.044, -i * lw, dashed, 9); }
      }
    }
  }
  const grp = new THREE.Group();
  const roadMat = new THREE.MeshStandardMaterial({ map: tex.roadColor, roughnessMap: tex.roadRough, roughness: 1, metalness: 0.0, color: 0xe2e2e2, envMapIntensity: 1.0 });
  const walkMat = new THREE.MeshStandardMaterial({ map: tex.conc, roughnessMap: tex.roadRough, roughness: 1, color: 0xf0eee8, envMapIntensity: 1.0 });
  const lineMat = new THREE.MeshStandardMaterial({ color: 0xcfcfc6, roughness: 0.45, emissive: 0x111111, envMapIntensity: 0.6 });
  const yelMat = new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: 0.45, emissive: 0x110c00, envMapIntensity: 0.6 });
  const dashMat = new THREE.MeshStandardMaterial({ color: 0xcfcfc6, roughness: 0.45, alphaMap: tex.dash, alphaTest: 0.5, emissive: 0x111111, envMapIntensity: 0.6 });
  const mk = (o, m, ro) => { if (!o.pos.length) return; const me = new THREE.Mesh(geomFrom(o), m); me.renderOrder = ro; me.matrixAutoUpdate = false; grp.add(me); };
  for (const m of [roadMat, walkMat, lineMat, yelMat, dashMat]) { m.polygonOffset = true; }
  walkMat.polygonOffsetFactor = -1; roadMat.polygonOffsetFactor = -2; lineMat.polygonOffsetFactor = yelMat.polygonOffsetFactor = dashMat.polygonOffsetFactor = -4;
  mk(walk, walkMat, 1); mk(asphalt, roadMat, 2); mk(solid, lineMat, 3); mk(yellow, yelMat, 3); mk(dashed, dashMat, 3);
  return { grp, roadMat, walkMat };
}

// ---------- areas & ground ----------
function buildGround(tex, roadMat) {
  const grp = new THREE.Group();
  const gmat = new THREE.MeshStandardMaterial({ map: tex.grass, roughness: 0.85, color: 0xd0d0b8, envMapIntensity: 0.6 });
  tex.grass.repeat.set(160, 160);
  const g = new THREE.PlaneGeometry(2000, 2000); g.rotateX(-Math.PI / 2);
  const ground = new THREE.Mesh(g, gmat); ground.matrixAutoUpdate = false; grp.add(ground);
  const mats = {
    park: new THREE.MeshStandardMaterial({ map: tex.grass, color: 0xc4d0b0, roughness: 0.9 }),
    gras: new THREE.MeshStandardMaterial({ map: tex.grass, color: 0xccd6b8, roughness: 0.9 }),
    pitc: new THREE.MeshStandardMaterial({ map: tex.grass, color: 0xb0cc9c, roughness: 0.8 }),
    lot: roadMat,
    play: new THREE.MeshStandardMaterial({ color: 0x4a3330, roughness: 0.6 }),
    wate: new THREE.MeshStandardMaterial({ color: 0x0b1014, roughness: 0.05, metalness: 0.2, envMapIntensity: 1.5 }),
    swim: new THREE.MeshStandardMaterial({ color: 0x0d2a33, roughness: 0.08, envMapIntensity: 1.4 }),
    sand: new THREE.MeshStandardMaterial({ color: 0x6b6050, roughness: 0.95 }),
  };
  const Y = { park: 0.004, gras: 0.006, pitc: 0.007, lot: 0.02, play: 0.008, wate: 0.009, swim: 0.009, sand: 0.008 };
  const byKind = {};
  for (const line of A.split('\n')) {
    const f = line.split('|'); const k = f[1]; const p = dec(f[2]); if (p.length < 3 || !mats[k]) continue;
    const tri = THREE.ShapeUtils.triangulateShape(p.map(q => new THREE.Vector2(q[0], q[1])), []);
    const o = byKind[k] || (byKind[k] = { pos: [], uv: [] });
    for (const t of tri) { const a = p[t[0]], b = p[t[1]], c = p[t[2]]; const cr = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]); for (const q of (cr < 0 ? [a, b, c] : [a, c, b])) { o.pos.push(q[0], Y[k], q[1]); o.uv.push(q[0] / 7, q[1] / 7); } }
  }
  for (const k in byKind) { const m = new THREE.Mesh(geomFrom(byKind[k]), mats[k]); m.matrixAutoUpdate = false; if (k === 'lot') { m.renderOrder = 1; } grp.add(m); }
  return grp;
}

// ---------- props ----------
function treeGeoms() {
  const bark = [];
  const mk = (r0, r1, h, x, y, z, rx, rz) => { const g = new THREE.CylinderGeometry(r1, r0, h, 5, 1); g.translate(0, h / 2, 0); g.rotateX(rx); g.rotateZ(rz); g.translate(x, y, z); return g; };
  const variants = [];
  for (let v = 0; v < 3; v++) {
    const r = rng(500 + v); const parts = [mk(0.22, 0.14, 4.2, 0, 0, 0, 0, 0)];
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + r(); const tilt = 0.5 + r() * 0.5; const h = 2.6 + r() * 2.2; const g = mk(0.11, 0.03, h, 0, 0, 0, 0, tilt); g.rotateY(a); g.translate(0, 2.4 + r() * 1.6, 0); parts.push(g);
      for (let j = 0; j < 2; j++) { const t = mk(0.04, 0.01, 1.4 + r(), 0, 0, 0, 0, 0.9 + r() * 0.4); t.rotateY(a + (r() - 0.5) * 1.8); t.translate(Math.sin(a) * 0, 3.6 + r() * 1.8, 0); t.translate(Math.cos(a) * (0.8 + r()) * Math.sin(tilt), 0, -Math.sin(a) * (0.8 + r()) * Math.sin(tilt)); parts.push(t); } }
    variants.push(mergeGeometries(parts.map(g => g.toNonIndexed())));
  }
  const ever = mergeGeometries([new THREE.CylinderGeometry(0.12, 0.16, 1.4, 5).translate(0, 0.7, 0), new THREE.ConeGeometry(1.9, 3.2, 7).translate(0, 2.6, 0), new THREE.ConeGeometry(1.5, 2.8, 7).translate(0, 4.0, 0), new THREE.ConeGeometry(1.0, 2.4, 7).translate(0, 5.3, 0)].map(g => g.toNonIndexed()));
  return { variants, ever };
}

function placeAlong(roads, step, offsetFn, filter, cb) {
  for (const r of roads) {
    if (!filter(r)) continue; let acc = step * 0.5 * Math.random();
    for (let i = 0; i < r.p.length - 1; i++) {
      const a = r.p[i], b = r.p[i + 1]; const dx = b[0] - a[0], dz = b[1] - a[1]; const L = Math.hypot(dx, dz); if (L < 0.1) continue;
      const ux = dx / L, uz = dz / L, nx = -uz, nz = ux;
      while (acc < L) { const x = a[0] + ux * acc, z = a[1] + uz * acc; cb(x, z, nx, nz, ux, uz, r, offsetFn(r)); acc += step; }
      acc -= L;
    }
  }
}

export function buildWorld(scene, tex, quality) {
  const col = new Collision();
  const roads = parseRoads();
  const { grp: rg, roadMat, walkMat } = buildRoads(roads, tex); scene.add(rg);
  const city = buildCity(roads, col); scene.add(city.grp);
  const bl = city.list, bmat = city.mat;
  const ground = buildGround(tex, roadMat); scene.add(ground);
  const r = rng(2024);

  // road proximity grid (to keep props/cars sensible)
  const roadNear = new Uint8Array(GN * GN);
  for (const rd of roads) { if (rd.t === 'ser') continue; for (let i = 0; i < rd.p.length - 1; i++) { const a = rd.p[i], b = rd.p[i + 1]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); for (let s = 0; s <= L; s += 1) { const x = a[0] + (b[0] - a[0]) * s / L, z = a[1] + (b[1] - a[1]) * s / L; const rad = rd.w / 2 + 0.5; for (let ox = -rad; ox <= rad; ox += CELL) for (let oz = -rad; oz <= rad; oz += CELL) { const ix = Math.floor((x + ox + EXT) / CELL), iz = Math.floor((z + oz + EXT) / CELL); if (ix >= 0 && iz >= 0 && ix < GN && iz < GN && ox * ox + oz * oz <= rad * rad) roadNear[ix + iz * GN] = 1; } } } }
  const onRoad = (x, z) => { const ix = Math.floor((x + EXT) / CELL), iz = Math.floor((z + EXT) / CELL); return ix >= 0 && iz >= 0 && ix < GN && iz < GN && roadNear[ix + iz * GN] === 1; };

  // ---- street lamps ----
  const lamps = [];
  const near = (arr, x, z, d) => arr.some(l => (l.x - x) ** 2 + (l.z - z) ** 2 < d * d);
  placeAlong(roads, 30, rd => rd.w / 2 + (rd.t === 'res' ? 1.2 : 1.6), rd => ['pri', 'sec'].includes(rd.t), (x, z, nx, nz, ux, uz, rd, off) => {
    const side = lamps.length % 2 ? 1 : -1;
    const lx = x + nx * off * side, lz = z + nz * off * side;
    if (Math.hypot(lx - PLAY_C[0], lz - PLAY_C[1]) > PLAY_R + 60) return;
    if (col.isBlocked(lx, lz) || onRoad(lx, lz) || near(lamps, lx, lz, 13)) return;
    lamps.push({ x: lx, z: lz, ax: -nx * side, az: -nz * side, on: r() > 0.13, flick: r() < 0.06 });
  });
  // lamps on real utility poles (Toronto side streets light from hydro poles) + real OSM lamp posts
  const XD = parseX();
  for (const [x, z] of XD.p) {
    if (Math.hypot(x - PLAY_C[0], z - PLAY_C[1]) > PLAY_R + 60 || r() < 0.35) continue;
    const nr = nearestRoad(roads, x, z, ['res', 'ter', 'unc', 'sec', 'pri']); if (!nr.dir || nr.d > 12) continue;
    let ax = nr.foot[0] - x, az = nr.foot[1] - z; const L = Math.hypot(ax, az) || 1; ax /= L; az /= L;
    if (near(lamps, x, z, 18)) continue;
    lamps.push({ x, z, ax, az, on: r() > 0.15, flick: r() < 0.06, wood: true });
  }
  for (const [x, z] of XD.K) { const nr = nearestRoad(roads, x, z); let ax = 1, az = 0; if (nr.foot) { ax = nr.foot[0] - x; az = nr.foot[1] - z; const L = Math.hypot(ax, az) || 1; ax /= L; az /= L; } if (!near(lamps, x, z, 4)) lamps.push({ x, z, ax, az, on: r() > 0.1, flick: false }); }
  const poleG = mergeGeometries([new THREE.CylinderGeometry(0.07, 0.11, 7.6, 6).translate(0, 3.8, 0), new THREE.BoxGeometry(0.08, 0.08, 1.8).translate(0, 7.5, 0.9)].map(g => g.toNonIndexed()));
  const headG = new THREE.BoxGeometry(0.28, 0.12, 0.6).translate(0, 7.42, 1.75);
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.6, metalness: 0.5 });
  const headOn = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xffd49a, emissiveIntensity: 3.5 });
  const headOff = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.4 });
  const poles = new THREE.InstancedMesh(poleG, poleMat, lamps.length);
  const onL = lamps.filter(l => l.on && !l.flick), offL = lamps.filter(l => !l.on), fl = lamps.filter(l => l.flick);
  const heads = new THREE.InstancedMesh(headG, headOn, onL.length), headsOff = new THREE.InstancedMesh(headG, headOff, offL.length), headsFl = new THREE.InstancedMesh(headG, headOn.clone(), Math.max(1, fl.length));
  const poolG = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const poolMat = new THREE.MeshBasicMaterial({ map: tex.pool, color: 0xffd9a8, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -8 });
  const pools = new THREE.InstancedMesh(poolG, poolMat, onL.length + fl.length);
  const poolFlMat = poolMat.clone(); const poolsFl = new THREE.InstancedMesh(poolG, poolFlMat, Math.max(1, fl.length));
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s1 = new THREE.Vector3(1, 1, 1), v = new THREE.Vector3();
  let ih = 0, io = 0, ifl = 0, ip = 0;
  lamps.forEach((l, i) => {
    e.set(0, Math.atan2(l.ax, l.az), 0); q.setFromEuler(e); m4.compose(v.set(l.x, 0, l.z), q, s1); poles.setMatrixAt(i, m4);
    l.hx = l.x + l.ax * 1.75; l.hz = l.z + l.az * 1.75;
    if (l.flick) { headsFl.setMatrixAt(ifl, m4); m4.compose(v.set(l.hx + l.ax * 1.5, 0.07, l.hz + l.az * 1.5), q, new THREE.Vector3(16, 1, 16)); poolsFl.setMatrixAt(ifl++, m4); }
    else if (l.on) { heads.setMatrixAt(ih++, m4); m4.compose(v.set(l.hx + l.ax * 1.5, 0.07, l.hz + l.az * 1.5), q, new THREE.Vector3(17, 1, 17)); pools.setMatrixAt(ip++, m4); }
    else headsOff.setMatrixAt(io++, m4);
  });
  pools.count = ip;
  for (const m of [poles, heads, headsOff, headsFl, pools, poolsFl]) { m.instanceMatrix.needsUpdate = true; m.frustumCulled = false; scene.add(m); }
  for (const l of lamps) col.addPoly([[l.x - 0.15, l.z - 0.15], [l.x + 0.15, l.z - 0.15], [l.x + 0.15, l.z + 0.15], [l.x - 0.15, l.z + 0.15]], false);


  // ---- traffic signals ----
  const sigs = N.split('\n').map(l => l.split('|')).filter(f => f[0] === 'traf').map(f => [+f[1] / 2, +f[2] / 2]);
  const sigPole = [], sigLamp = [];
  for (const [x, z] of sigs) {
    // nudge to roadside if on road
    let px = x, pz = z; for (let k = 0; k < 12 && onRoad(px, pz); k++) { px += (r() - 0.5) * 6; pz += (r() - 0.5) * 6; }
    const ang = Math.atan2(x - px || 0.01, z - pz || 0.01);
    const g1 = new THREE.CylinderGeometry(0.1, 0.12, 6, 6).translate(0, 3, 0); const g2 = new THREE.BoxGeometry(0.12, 0.12, 6).translate(0, 5.9, 3); const g3 = new THREE.BoxGeometry(0.38, 1.1, 0.32).translate(0, 5.3, 4.6); const g4 = new THREE.BoxGeometry(0.38, 1.1, 0.32).translate(0, 5.3, 2.4);
    const l1 = new THREE.SphereGeometry(0.11, 8, 6).translate(0, 5.65, 4.78), l2 = new THREE.SphereGeometry(0.11, 8, 6).translate(0, 5.65, 2.58);
    for (const g of [g1, g2, g3, g4]) { g.rotateY(ang); g.translate(px, 0, pz); sigPole.push(g.toNonIndexed()); }
    for (const g of [l1, l2]) { g.rotateY(ang); g.translate(px, 0, pz); sigLamp.push(g.toNonIndexed()); }
    col.addPoly([[px - 0.2, pz - 0.2], [px + 0.2, pz - 0.2], [px + 0.2, pz + 0.2], [px - 0.2, pz + 0.2]], false);
  }
  const signalMat = new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff2010, emissiveIntensity: 5 });
  if (sigPole.length) { scene.add(new THREE.Mesh(mergeGeometries(sigPole), poleMat)); scene.add(new THREE.Mesh(mergeGeometries(sigLamp), signalMat)); }

  // ---- cars ----
  const cars = []; const carColors = ['#5a1414', '#1d2a3a', '#2b2b2b', '#6b6b6b', '#d0d0d0', '#16301f', '#3c2b1a', '#7a5a10', '#101010', '#8a8f96'];
  const tryCar = (x, z, ang) => { if (Math.hypot(x - PLAY_C[0], z - PLAY_C[1]) > PLAY_R - 10) return; if (cars.some(c => Math.hypot(c.x - x, c.z - z) < 6.5)) return; if (col.isBlocked(x, z) || Math.hypot(x - START[0], z - START[1]) < 9) return; cars.push({ x, z, a: ang, c: carColors[Math.floor(r() * carColors.length)], burn: false, haz: r() < 0.22 }); };
  placeAlong(roads, 22, rd => rd.w, rd => ['pri', 'sec', 'ter', 'res'].includes(rd.t), (x, z, nx, nz, ux, uz, rd) => {
    const dens = rd.t === 'pri' ? 0.55 : rd.t === 'sec' ? 0.45 : 0.18; if (r() > dens) return;
    const lanes = rd.lanes || 2; const lw = rd.w / lanes; const li = Math.floor(r() * lanes); const off = -rd.w / 2 + lw * (li + 0.5);
    let ang = Math.atan2(ux, uz) + (r() < 0.5 ? 0 : Math.PI); if (r() < 0.25) ang += (r() - 0.5) * 2.2; else ang += (r() - 0.5) * 0.25;
    tryCar(x + nx * off, z + nz * off, ang);
  });
  // a pile-up at the intersection
  for (let i = 0; i < 6; i++) tryCar(XING[0] + (r() - 0.5) * 26, XING[1] + (r() - 0.5) * 26, r() * Math.PI * 2);
  const bysd = cars.slice().sort((a, b) => Math.hypot(a.x - XING[0], a.z - XING[1]) - Math.hypot(b.x - XING[0], b.z - XING[1]));
  for (let i = 0; i < Math.min(4, bysd.length); i += 1) if (i !== 1) bysd[i].burn = true;
  const bodyG = mergeGeometries([new THREE.BoxGeometry(1.84, 0.62, 4.5).translate(0, 0.62, 0), new THREE.BoxGeometry(1.7, 0.18, 4.4).translate(0, 0.98, 0)].map(g => g.toNonIndexed()));
  const cabG = new THREE.BoxGeometry(1.58, 0.55, 2.3).translate(0, 1.33, -0.2);
  const wheelG = mergeGeometries([[-0.86, 1.45], [0.86, 1.45], [-0.86, -1.4], [0.86, -1.4]].map(([x, z]) => new THREE.CylinderGeometry(0.34, 0.34, 0.24, 10).rotateZ(Math.PI / 2).translate(x, 0.34, z).toNonIndexed()));
  const tailG = mergeGeometries([new THREE.BoxGeometry(0.32, 0.12, 0.05).translate(-0.62, 0.84, -2.26), new THREE.BoxGeometry(0.32, 0.12, 0.05).translate(0.62, 0.84, -2.26), new THREE.BoxGeometry(0.3, 0.12, 0.05).translate(-0.62, 0.78, 2.26), new THREE.BoxGeometry(0.3, 0.12, 0.05).translate(0.62, 0.78, 2.26)].map(g => g.toNonIndexed()));
  const bodyMat = new THREE.MeshStandardMaterial({ roughness: 0.28, metalness: 0.55, envMapIntensity: 1.0 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x07090c, roughness: 0.05, metalness: 0.4, envMapIntensity: 1.4 });
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x0c0c0c, roughness: 0.8 });
  const hazMat = new THREE.MeshStandardMaterial({ color: 0x331a00, emissive: 0xff8a10, emissiveIntensity: 0 });
  const tailMat = new THREE.MeshStandardMaterial({ color: 0x220202, emissive: 0x500000, emissiveIntensity: 1 });
  const bodies = new THREE.InstancedMesh(bodyG, bodyMat, cars.length), cabs = new THREE.InstancedMesh(cabG, glassMat, cars.length), wheels = new THREE.InstancedMesh(wheelG, wheelMat, cars.length);
  const hz = cars.filter(c => c.haz && !c.burn), tl = cars.filter(c => !c.haz || c.burn);
  const hazI = new THREE.InstancedMesh(tailG, hazMat, Math.max(1, hz.length)), tailI = new THREE.InstancedMesh(tailG, tailMat, Math.max(1, tl.length));
  let ih2 = 0, it2 = 0; const cc = new THREE.Color();
  cars.forEach((c, i) => {
    e.set(0, c.a, c.burn ? (r() - 0.5) * 0.05 : 0); q.setFromEuler(e); m4.compose(v.set(c.x, c.burn ? -0.18 : 0, c.z), q, s1);
    bodies.setMatrixAt(i, m4); cabs.setMatrixAt(i, m4); wheels.setMatrixAt(i, m4); bodies.setColorAt(i, cc.set(c.burn ? '#0d0b0a' : c.c));
    if (c.haz && !c.burn) hazI.setMatrixAt(ih2++, m4); else tailI.setMatrixAt(it2++, m4);
    const ca = Math.cos(c.a), sa = Math.sin(c.a); const hw = 1.0, hl = 2.35;
    const corner = (dx, dz) => [c.x + dx * ca + dz * sa, c.z - dx * sa + dz * ca];
    col.addPoly([corner(-hw, -hl), corner(hw, -hl), corner(hw, hl), corner(-hw, hl)]);
  });
  for (const m of [bodies, cabs, wheels, hazI, tailI]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; m.frustumCulled = false; scene.add(m); }
  const fires = cars.filter(c => c.burn).map(c => ({ x: c.x, z: c.z }));

  // ---- trees: City of Toronto street trees (real) + OSM trees + yard fill (approximate) ----
  const trees = []; let realTrees = 0;
  const okTree = (x, z) => !col.isBlocked(x, z) && !onRoad(x, z) && Math.hypot(x - PLAY_C[0], z - PLAY_C[1]) < PLAY_R + 80;
  for (const t of cityTrees(col, onRoad, r)) { if (onRoad(t[0], t[1])) continue; trees.push([t[0], t[1], 0.45 + Math.min(1.2, t[2] / 45), t[3]]); realTrees++; }
  for (const f of N.split('\n').map(l => l.split('|')).filter(f => f[0] === 'tree')) { const x = +f[1] / 2, z = +f[2] / 2; if (okTree(x, z) && !trees.some(t => (t[0] - x) ** 2 + (t[1] - z) ** 2 < 4)) { trees.push([x, z, 0.9, 0]); realTrees++; } }
  // private back-yard trees are not in any open dataset: fill a few, kept well away from streets
  for (let i = 0; i < 3000 && trees.length < realTrees + 450; i++) {
    const x = (r() - 0.5) * 900, z = (r() - 0.5) * 900; if (!okTree(x, z)) continue;
    const ix = Math.floor((x + EXT) / CELL), iz = Math.floor((z + EXT) / CELL); let bnear = false, rnear = false;
    for (let ox = -5; ox <= 5; ox++) for (let oz = -5; oz <= 5; oz++) { const k = (ix + ox) + (iz + oz) * GN; if (Math.abs(ox) <= 3 && Math.abs(oz) <= 3 && col.blocked[k]) bnear = true; if (roadNear[k]) rnear = true; }
    if (bnear && !rnear) trees.push([x, z, 0.8 + r() * 0.5, r() < 0.25 ? 1 : 0]);
  }
  const tg = treeGeoms(); const barkMat = new THREE.MeshStandardMaterial({ color: 0x2a221d, roughness: 0.95 }); const everMat = new THREE.MeshStandardMaterial({ color: 0x1a2a1c, roughness: 0.9 });
  const groups = [[], [], [], []]; for (const t of trees) groups[t[3] ? 3 : Math.floor(r() * 3)].push(t);
  groups.forEach((gr, gi) => {
    if (!gr.length) return; const im = new THREE.InstancedMesh(gi === 3 ? tg.ever : tg.variants[gi], gi === 3 ? everMat : barkMat, gr.length);
    gr.forEach((t, i) => { e.set(0, r() * 6.28, 0); q.setFromEuler(e); const sc = t[2]; m4.compose(v.set(t[0], 0, t[1]), q, new THREE.Vector3(sc, sc * (0.9 + r() * 0.3), sc)); im.setMatrixAt(i, m4); });
    im.instanceMatrix.needsUpdate = true; im.frustumCulled = false; scene.add(im);
  });
  for (const t of trees) col.addPoly([[t[0] - 0.25, t[1] - 0.25], [t[0] + 0.25, t[1] - 0.25], [t[0] + 0.25, t[1] + 0.25], [t[0] - 0.25, t[1] + 0.25]], false);

  // ---- street furniture from OSM: sidewalks, crossings, fences, canopies, poles & wires, hydro towers, hydrants, signs ----
  addStreetscape(scene, { col, roads, onRoad, rng: r, X: XD, walkMat, PLAY_C, PLAY_R });

  // ---- boundary: concrete barriers + tape on roads crossing the ring ----
  const barr = [];
  for (const rd of roads) { if (rd.t === 'ser') continue; for (let i = 0; i < rd.p.length - 1; i++) { const a = rd.p[i], b = rd.p[i + 1]; const da = Math.hypot(a[0] - PLAY_C[0], a[1] - PLAY_C[1]) - PLAY_R, db = Math.hypot(b[0] - PLAY_C[0], b[1] - PLAY_C[1]) - PLAY_R; if (da * db < 0) { const t = da / (da - db); const x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t; const ang = Math.atan2(b[0] - a[0], b[1] - a[1]) + Math.PI / 2; const n = Math.ceil((rd.w + 4) / 2.2); for (let k = 0; k < n; k++) { const o = -((n - 1) * 2.2) / 2 + k * 2.2; barr.push([x + Math.sin(ang) * o, z + Math.cos(ang) * o, ang + (r() - 0.5) * 0.3]); } } } }
  const barG = mergeGeometries([new THREE.BoxGeometry(2.0, 0.35, 0.7).translate(0, 0.17, 0), new THREE.BoxGeometry(2.0, 0.55, 0.3).translate(0, 0.62, 0)].map(g => g.toNonIndexed()));
  const barMat = new THREE.MeshStandardMaterial({ color: 0x8a877e, roughness: 0.9 });
  const barI = new THREE.InstancedMesh(barG, barMat, Math.max(1, barr.length));
  barr.forEach((b, i) => { e.set(0, b[2], 0); q.setFromEuler(e); m4.compose(v.set(b[0], 0, b[1]), q, s1); barI.setMatrixAt(i, m4); });
  barI.instanceMatrix.needsUpdate = true; scene.add(barI);
  const flareG = new THREE.SphereGeometry(0.06, 6, 4); const flareMat = new THREE.MeshBasicMaterial({ color: 0xff2a10 });
  const flares = new THREE.InstancedMesh(flareG, flareMat, Math.max(1, barr.length)); barr.forEach((b, i) => { m4.makeTranslation(b[0], 0.95, b[1]); flares.setMatrixAt(i, m4); }); flares.instanceMatrix.needsUpdate = true; scene.add(flares);

  // ---- minimap image ----
  const MM = 1024, mmS = MM / (EXT * 2); const mm = document.createElement('canvas'); mm.width = mm.height = MM; const g = mm.getContext('2d');
  g.fillStyle = '#0d1012'; g.fillRect(0, 0, MM, MM); const T = (x, z) => [(x + EXT) * mmS, (z + EXT) * mmS];
  for (const line of A.split('\n')) { const f = line.split('|'); const p = dec(f[2]); g.fillStyle = { park: '#1a2a1c', gras: '#16231a', pitc: '#1d311f', lot: '#1d2024' }[f[1]] || '#14181b'; g.beginPath(); p.forEach((q2, i) => { const [a, b] = T(q2[0], q2[1]); i ? g.lineTo(a, b) : g.moveTo(a, b); }); g.fill(); }
  g.lineCap = 'round'; g.lineJoin = 'round';
  for (const rd of roads) { g.strokeStyle = rd.t === 'pri' ? '#9a9a90' : rd.t === 'sec' ? '#808078' : rd.t === 'ser' ? '#3a3d40' : '#5d5f60'; g.lineWidth = Math.max(1, rd.w * mmS); g.beginPath(); rd.p.forEach((q2, i) => { const [a, b] = T(q2[0], q2[1]); i ? g.lineTo(a, b) : g.moveTo(a, b); }); g.stroke(); }
  for (const b of bl) { g.fillStyle = b.H > 20 ? '#4a4f56' : '#383c42'; g.beginPath(); b.p.forEach((q2, i) => { const [a, bb] = T(q2[0], q2[1]); i ? g.lineTo(a, bb) : g.moveTo(a, bb); }); g.fill(); }
  g.strokeStyle = 'rgba(255,60,40,0.7)'; g.lineWidth = 2; g.setLineDash([6, 5]); g.beginPath(); const [cx, cz] = T(PLAY_C[0], PLAY_C[1]); g.arc(cx, cz, PLAY_R * mmS, 0, Math.PI * 2); g.stroke();

  // named segments for location HUD
  const named = []; for (const rd of roads) if (rd.name && rd.name !== 'Finch Bus Terminal') for (let i = 0; i < rd.p.length - 1; i++) named.push([rd.p[i][0], rd.p[i][1], rd.p[i + 1][0], rd.p[i + 1][1], rd.name]);

  const stats = { buildings: bl.length, heights: bl.stats, realTrees, fillTrees: trees.length - realTrees, detail: city.detail };
  return { stats, col, lamps, fires, bmat, signalMat, hazMat, headsFl, poolFlMat, minimap: mm, mmS, named, cars, roads, onRoad };
}

