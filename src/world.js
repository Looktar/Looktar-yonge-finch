import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { B } from './data_b.js';
import { R } from './data_r.js';
import { A, N } from './data_a.js';
import { X } from './data_x.js';
import { buildCity } from './buildings.js';
import { groundMaterial, ribbonMaterial, tex as tex2 } from './pbr.js';
import { carGeoms, wheelGeoms } from './cars.js';
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
// flat ground ribbons must face up whatever the direction of travel was (a downward triangle is culled from above)
function faceUp(out) { const P = out.pos, U = out.uv; for (let i = 0; i + 8 < P.length; i += 9) { const ax = P[i + 3] - P[i], az = P[i + 5] - P[i + 2], bx = P[i + 6] - P[i], bz = P[i + 8] - P[i + 2]; if (az * bx - ax * bz < 0) { for (let k = 0; k < 3; k++) { const t = P[i + 3 + k]; P[i + 3 + k] = P[i + 6 + k]; P[i + 6 + k] = t; } const j = i / 9 * 6; if (U && U.length > j + 5) for (let k = 0; k < 2; k++) { const t = U[j + 2 + k]; U[j + 2 + k] = U[j + 4 + k]; U[j + 4 + k] = t; } } } }
function geomFrom(out) { faceUp(out); const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(out.pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(out.uv, 2)); const nn = new Float32Array(out.pos.length); for (let i = 1; i < nn.length; i += 3) nn[i] = 1; g.setAttribute('normal', new THREE.BufferAttribute(nn, 3)); g.computeBoundingSphere(); return g; }

function buildRoads(roads, tex) {
  const asphalt = { pos: [], uv: [] }, walk = { pos: [], uv: [] }, solid = { pos: [], uv: [] }, yellow = { pos: [], uv: [] }, dashed = { pos: [], uv: [] };
  for (const r of roads) {
    const w = roadWidth(r.t, r.lanes, r.oneway); r.w = w;
    const sw = { pri: 1.0, sec: 1.0, ter: 1.0, res: 1.8, unc: 1.8 }[r.t] || 0;
    if (sw) ribbon(r.p, w + sw * 2, 0.012, 0, walk);
    ribbon(r.p, w, 0.03, 0, asphalt);
  }
  // ---- pavement markings (Ontario practice): no edge lines on curbed arterials; double yellow centre line on two-way
  // roads; white 3 m / 6 m lane lines; everything stops 6 m short of a crossing arterial, where a white stop bar goes
  // across the approach lanes with straight / left-turn arrows behind it
  // two rasters: arterials (pri/sec) and everything with lane markings; an arterial only stops for another arterial
  const MS = 0.5, MN = Math.ceil(EXT * 2 / MS), own = new Int16Array(MN * MN).fill(-1), ownA = new Int16Array(MN * MN).fill(-1);
  // one id per street: OSM splits a street into many ways, and its own pieces must not read as a crossing road
  const gid = new Map(); const streetId = r => { const k = r.name ? r.name.replace(/ (East|West|North|South)$/, '') : ('#' + roads.indexOf(r)); if (!gid.has(k)) gid.set(k, gid.size); return gid.get(k); };
  roads.forEach(r0 => {
    if (!RW[r0.t]) return; const r = r0, id = streetId(r0); const h = r.w / 2 + 0.4;
    for (let i = 0; i < r.p.length - 1; i++) { const a = r.p[i], b = r.p[i + 1]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; const ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L;
      for (let t = 0; t <= L; t += 0.25) for (let o = -h; o <= h; o += 0.25) { const ix = Math.floor((a[0] + ux * t - uz * o + EXT) / MS), iz = Math.floor((a[1] + uz * t + ux * o + EXT) / MS); if (ix < 0 || iz < 0 || ix >= MN || iz >= MN) continue; const k = ix + iz * MN; own[k] = own[k] === -1 || own[k] === id ? id : -2; if (r.t === 'pri' || r.t === 'sec') ownA[k] = ownA[k] === -1 || ownA[k] === id ? id : -2; } }
  });
  const foreign = (x, z, id, art) => { const ix = Math.floor((x + EXT) / MS), iz = Math.floor((z + EXT) / MS); if (ix < 0 || iz < 0 || ix >= MN || iz >= MN) return false; const k = (art ? ownA : own)[ix + iz * MN]; return k === -2 || (k >= 0 && k !== id); };
  const arrows = { pos: [], uv: [] };
  const quadOut = (out, A, B, C, D, uvs, y) => { const P = [A, B, C, A, C, D]; const U = uvs ? [uvs[0], uvs[1], uvs[2], uvs[0], uvs[2], uvs[3]] : null; P.forEach((q, j) => { out.pos.push(q[0], y, q[1]); out.uv.push(...(U ? U[j] : [0, 0])); }); };
  roads.forEach(r => {
    if (!RW[r.t]) return; const id = streetId(r);
    const w = r.w, lanes = r.lanes || (r.oneway ? 2 : r.t === 'ter' ? 2 : 4), lw = w / lanes;
    // sample the centre line every 0.5 m: position, direction, distance along
    const S = []; let acc = 0;
    for (let i = 0; i < r.p.length - 1; i++) { const a = r.p[i], b = r.p[i + 1]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 0.01) continue; const ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L;
      for (let t = 0; t < L; t += 0.5) S.push({ x: a[0] + ux * t, z: a[1] + uz * t, ux, uz, s: acc + t }); acc += L; }
    if (S.length < 2) return;
    const art = r.t === 'pri' || r.t === 'sec';
    const clearAt = (q, o) => { const x = q.x - q.uz * o, z = q.z + q.ux * o; return !foreign(x, z, id, art) && !foreign(x + q.ux * 6, z + q.uz * 6, id, art) && !foreign(x - q.ux * 6, z - q.uz * 6, id, art); };
    const line = (o, width, out, dash, y) => {
      for (let i = 0; i < S.length - 1; i++) {
        const q = S[i], q2 = S[i + 1]; if (!clearAt(q, o) || !clearAt(q2, o)) continue;
        if (dash && (q.s % 9) >= 3) continue;
        const P = (p, oo) => [p.x - p.uz * oo, p.z + p.ux * oo];
        quadOut(out, P(q, o - width / 2), P(q2, o - width / 2), P(q2, o + width / 2), P(q, o + width / 2), null, y);
      }
    };
    if (r.oneway) { for (let i = 1; i < lanes; i++) line(-w / 2 + i * lw, 0.13, solid, true, 0.044); }
    else {
      line(-0.12, 0.11, yellow, false, 0.044); line(0.12, 0.11, yellow, false, 0.044);
      const half = Math.floor(lanes / 2); const lw2 = (w / 2) / Math.max(1, half);
      for (let i = 1; i < half; i++) { line(i * lw2, 0.13, solid, true, 0.044); line(-i * lw2, 0.13, solid, true, 0.044); }
    }
    // stop bars + arrows where the road meets a crossing arterial
    for (let i = 1; i < S.length; i++) {
      const was = clearAt(S[i - 1], 0), now = clearAt(S[i], 0); if (was === now) continue;
      const fwd = was && !now; // travelling +s reaches the intersection here
      const q = fwd ? S[i - 1] : S[i]; const sg = fwd ? 1 : -1; // approach direction along +u or -u
      const ux = q.ux * sg, uz = q.uz * sg; // travel direction of the approach lanes
      let o0, o1; // offsets (in the road's own n frame) covered by the approach lanes
      if (r.oneway) { if (!fwd) continue; o0 = -w / 2 + 0.3; o1 = w / 2 - 0.3; }
      else if (fwd) { o0 = 0.3; o1 = w / 2 - 0.3; } else { o0 = -w / 2 + 0.3; o1 = -0.3; }
      const at = (along, o) => [q.x - q.uz * o + ux * along, q.z + q.ux * o + uz * along];
      quadOut(solid, at(-4.4, o0), at(-4.4, o1), at(-3.95, o1), at(-3.95, o0), null, 0.046); // behind the crosswalk, which OSM puts a few metres out
      // arrows, 9 m behind the bar, one per approach lane; the lane nearest the centre turns left
      const nL = Math.max(1, Math.round((o1 - o0) / 3.3)); const lwA = (o1 - o0) / nL;
      for (let k = 0; k < nL; k++) {
        const oc = o0 + lwA * (k + 0.5); const nearCentre = r.oneway ? k === 0 : (fwd ? k === 0 : k === nL - 1);
        const cell = nearCentre && nL >= 2 ? 1 : 0; const u0 = cell * 0.5, u1 = u0 + 0.5;
        const A = at(-15.5, oc - 0.55), B = at(-15.5, oc + 0.55), C = at(-10.5, oc + 0.55), D = at(-10.5, oc - 0.55);
        // arrow texture points along +v; v runs from the far end (-11.5) to the bar end (-6.5)
        const flip = (fwd ? 1 : -1) * (r.oneway ? 1 : 1) < 0;
        quadOut(arrows, A, B, C, D, flip ? [[u1, 0], [u0, 0], [u0, 1], [u1, 1]] : [[u0, 0], [u1, 0], [u1, 1], [u0, 1]], 0.046);
      }
    }
  });
  // ---- curbs: a pale 15 cm concrete kerb with a darker gutter along both edges of every street, broken where the
  // edge runs across another carriageway (intersections, driveways onto arterials)
  const RS = 0.5, RN = Math.ceil(EXT * 2 / RS), cover = new Int16Array(RN * RN).fill(-1); // owner road index, -2 = several
  roads.forEach((r, ri) => { if (!r.w || r.t === 'ser') return; const h = r.w / 2 + 0.05; for (let i = 0; i < r.p.length - 1; i++) { const a = r.p[i], b = r.p[i + 1]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); const ux = (b[0] - a[0]) / (L || 1), uz = (b[1] - a[1]) / (L || 1); for (let s = -h; s <= L + h; s += 0.25) { const x = a[0] + ux * s, z = a[1] + uz * s; for (let o = -h; o <= h; o += 0.25) { const ix = Math.floor((x - uz * o + EXT) / RS), iz = Math.floor((z + ux * o + EXT) / RS); if (ix >= 0 && iz >= 0 && ix < RN && iz < RN) { const kk = ix + iz * RN; cover[kk] = cover[kk] === -1 || cover[kk] === ri ? ri : -2; } } } } });
  const covered = (x, z, self) => { const ix = Math.floor((x + EXT) / RS), iz = Math.floor((z + EXT) / RS); if (ix < 0 || iz < 0 || ix >= RN || iz >= RN) return false; const k = cover[ix + iz * RN]; return k === -2 || (k >= 0 && k !== self); };
  const curb = { pos: [], uv: [], nrm: [] }, gutter = { pos: [], uv: [] };
  const CH = 0.15, CW = 0.22;
  const quad = (o, A, B, C, D, n) => { for (const q of [A, B, C, A, C, D]) { o.pos.push(q[0], q[1], q[2]); o.uv.push(q[3], q[4]); if (o.nrm) o.nrm.push(n[0], n[1], n[2]); } };
  for (const r of roads) {
    if (!RW[r.t] && r.t !== 'res' && r.t !== 'unc') continue;
    for (const side of [-1, 1]) for (let i = 0; i < r.p.length - 1; i++) {
      const a = r.p[i], b = r.p[i + 1]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 0.5) continue;
      const tx = (b[0] - a[0]) / L, tz = (b[1] - a[1]) / L, nx = -tz * side, nz = tx * side;
      const n = Math.ceil(L / 2);
      for (let k = 0; k < n; k++) {
        const s0 = L * k / n, s1 = L * (k + 1) / n, sm = (s0 + s1) / 2;
        const off = r.w / 2, mx = a[0] + tx * sm + nx * (off + 0.4), mz = a[1] + tz * sm + nz * (off + 0.4);
        if (covered(mx, mz, roads.indexOf(r))) continue;
        const P = (s, o, y, u, v) => [a[0] + tx * s + nx * o, y, a[1] + tz * s + nz * o, u, v];
        quad(curb, P(s0, off, 0.03, s0, 0), P(s1, off, 0.03, s1, 0), P(s1, off, CH, s1, 0.15), P(s0, off, CH, s0, 0.15), [-nx, 0, -nz]); // kerb face
        quad(curb, P(s0, off, CH, s0, 0.15), P(s1, off, CH, s1, 0.15), P(s1, off + CW, CH, s1, 0.37), P(s0, off + CW, CH, s0, 0.37), [0, 1, 0]); // kerb top
        quad(curb, P(s0, off + CW, CH, s0, 0.37), P(s1, off + CW, CH, s1, 0.37), P(s1, off + CW, 0.012, s1, 0.5), P(s0, off + CW, 0.012, s0, 0.5), [nx, 0, nz]); // back face
        quad(gutter, P(s0, off - 0.45, 0.036, 0, 0), P(s1, off - 0.45, 0.036, 0, 0), P(s1, off, 0.036, 0, 0), P(s0, off, 0.036, 0, 0), [0, 1, 0]);
      }
    }
  }
  const grp = new THREE.Group();
  if (curb.pos.length) {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(curb.pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(curb.uv, 2)); g.setAttribute('normal', new THREE.Float32BufferAttribute(curb.nrm, 3)); g.computeBoundingSphere();
    const cm = new THREE.MeshStandardMaterial({ color: 0x86837e, roughness: 0.92, side: THREE.DoubleSide });
    const me = new THREE.Mesh(g, cm); me.matrixAutoUpdate = false; me.receiveShadow = true; grp.add(me);
    const gm = new THREE.MeshStandardMaterial({ color: 0x8e8c88, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -5 });
    const gg = geomFrom(gutter); const gme = new THREE.Mesh(gg, gm); gme.matrixAutoUpdate = false; gme.receiveShadow = true; grp.add(gme);
  }
  const roadMat = ribbonMaterial('road', { color: 0x9a9a9a });
  const walkMat = ribbonMaterial('walk', { color: 0xfffcf6 });
  const lineMat = new THREE.MeshStandardMaterial({ color: 0xa8a8a0, roughness: 0.6, envMapIntensity: 0.6 });
  const yelMat = new THREE.MeshStandardMaterial({ color: 0xb08a22, roughness: 0.6, envMapIntensity: 0.6 });
  const dashMat = new THREE.MeshStandardMaterial({ color: 0xa8a8a0, roughness: 0.6, alphaMap: tex.dash, alphaTest: 0.5, envMapIntensity: 0.6 });
  const mk = (o, m, ro) => { if (!o.pos.length) return; const me = new THREE.Mesh(geomFrom(o), m); me.renderOrder = ro; me.matrixAutoUpdate = false; grp.add(me); };
  for (const m of [roadMat, walkMat, lineMat, yelMat, dashMat]) { m.polygonOffset = true; }
  walkMat.polygonOffsetFactor = -1; roadMat.polygonOffsetFactor = -2; lineMat.polygonOffsetFactor = yelMat.polygonOffsetFactor = dashMat.polygonOffsetFactor = -4;
  mk(walk, walkMat, 1); mk(asphalt, roadMat, 2); mk(solid, lineMat, 3); mk(yellow, yelMat, 3); mk(dashed, dashMat, 3);
  { // arrow atlas: straight (left half) and left-turn (right half), white on transparent
    const c = document.createElement('canvas'); c.width = 128; c.height = 512; const g = c.getContext('2d'); g.fillStyle = '#fff';
    const shaft = (x) => g.fillRect(x - 7, 150, 14, 362);
    shaft(32); g.beginPath(); g.moveTo(32, 20); g.lineTo(58, 160); g.lineTo(6, 160); g.closePath(); g.fill();
    g.fillRect(89, 250, 14, 262); g.beginPath(); g.moveTo(103, 264); g.quadraticCurveTo(103, 170, 86, 150); g.lineTo(96, 140); g.quadraticCurveTo(117, 170, 117, 264); g.fill();
    g.beginPath(); g.moveTo(72, 108); g.lineTo(104, 120); g.lineTo(84, 160); g.closePath(); g.fill();
    const t = new THREE.CanvasTexture(c); t.anisotropy = 8;
    const am = new THREE.MeshStandardMaterial({ color: 0xa8a8a0, roughness: 0.6, alphaMap: t, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
    mk(arrows, am, 3);
  }
  return { grp, roadMat, walkMat };
}

// ---------- areas & ground ----------
// where the ground is hard-surfaced: the Yonge corridor is plazas, forecourts and parking around every
// non-house building and along the arterials; lawns stay only around houses and in OSM grass / parks
function pavedMask(roads, bl) {
  const S = 1024, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
  const k = S / (EXT * 2), P = (x, z) => [(x + EXT) * k, (z + EXT) * k];
  g.fillStyle = '#000'; g.fillRect(0, 0, S, S); g.fillStyle = g.strokeStyle = '#fff'; g.lineJoin = g.lineCap = 'round';
  const poly = (p, w) => { g.beginPath(); p.forEach((q, i) => { const [x, y] = P(q[0], q[1]); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.closePath(); g.fill(); if (w) { g.lineWidth = w * k; g.stroke(); } };
  for (const b of bl) if (!b.house && b.mh < 1) poly(b.p, b.H > 20 ? 26 : b.st === 7 ? 30 : 14);
  for (const r of roads) if (r.t === 'pri' || r.t === 'sec') { g.lineWidth = (r.w + 9) * k; g.beginPath(); r.p.forEach((q, i) => { const [x, y] = P(q[0], q[1]); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke(); }
  g.fillStyle = '#000';
  for (const line of A.split('\n')) { const f = line.split('|'); if (f[1] !== 'park' && f[1] !== 'gras' && f[1] !== 'pitc') continue; const p = dec(f[2]); if (p.length >= 3) poly(p, 0); }
  // soften the edges a little
  const c2 = document.createElement('canvas'); c2.width = c2.height = S; const g2 = c2.getContext('2d'); g2.filter = 'blur(1.5px)'; g2.drawImage(c, 0, 0);
  const t = new THREE.CanvasTexture(c2); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.colorSpace = THREE.NoColorSpace; t.flipY = false;
  return { tex: t, x0: -EXT, z0: -EXT, size: EXT * 2 };
}

function buildGround(tex, roadMat, mask) {
  const grp = new THREE.Group();
  const gmat = groundMaterial(mask);
  const g = new THREE.PlaneGeometry(2000, 2000); g.rotateX(-Math.PI / 2);
  const ground = new THREE.Mesh(g, gmat); ground.matrixAutoUpdate = false; grp.add(ground);
  const mats = {
    park: ribbonMaterial('grass', { color: 0xe6e6dc }),
    gras: ribbonMaterial('grass', { color: 0xf0f0e6 }),
    pitc: ribbonMaterial('grass', { color: 0xd6e6c8 }),
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
  // bare late-November street trees (maple / honey locust / linden): recursive limbs that taper, fork and droop
  const variants = []; const up = new THREE.Vector3(0, 1, 0), qq = new THREE.Quaternion();
  const seg = (a, b, r0, r1, sides) => { const d = new THREE.Vector3().subVectors(b, a); const L = d.length(); const g = new THREE.CylinderGeometry(r1, r0, L, sides, 1, true); g.translate(0, L / 2, 0); qq.setFromUnitVectors(up, d.normalize()); g.applyQuaternion(qq); g.translate(a.x, a.y, a.z); return g.toNonIndexed(); };
  for (let v = 0; v < 4; v++) {
    const r = rng(500 + v); const parts = [];
    const grow = (a, dir, len, rad, depth) => {
      // two slightly bent segments per limb
      const mid = a.clone().addScaledVector(dir, len * 0.5); const bend = dir.clone().add(new THREE.Vector3(r() - 0.5, (r() - 0.5) * 0.3, r() - 0.5).multiplyScalar(0.35)).normalize();
      const end = mid.clone().addScaledVector(bend, len * 0.5);
      parts.push(seg(a, mid, rad, rad * 0.82, depth > 1 ? 5 : 3), seg(mid, end, rad * 0.82, rad * 0.62, depth > 1 ? 5 : 3));
      if (depth === 0) return;
      const n = depth === 3 ? 4 + Math.floor(r() * 2) : 2 + Math.floor(r() * 2);
      for (let i = 0; i < n; i++) {
        const t = depth === 3 ? 0.55 + 0.45 * i / n : 0.45 + r() * 0.55; const at = a.clone().lerp(end, t);
        const az = (i / n + r() * 0.3) * Math.PI * 2, spread = depth === 3 ? 0.55 + r() * 0.35 : 0.45 + r() * 0.5;
        const nd = bend.clone().multiplyScalar(Math.cos(spread)).add(new THREE.Vector3(Math.cos(az), 0, Math.sin(az)).multiplyScalar(Math.sin(spread)));
        if (depth <= 1) nd.y -= 0.15 + r() * 0.2; // fine twigs droop
        grow(at, nd.normalize(), len * (0.55 + r() * 0.2), rad * 0.5, depth - 1);
      }
    };
    const h0 = 2.2 + r() * 0.8;
    grow(new THREE.Vector3(0, 0, 0), new THREE.Vector3((r() - 0.5) * 0.08, 1, (r() - 0.5) * 0.08).normalize(), h0 * 1.6, 0.2 + r() * 0.05, 3);
    variants.push(mergeGeometries(parts));
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
  const ground = buildGround(tex, roadMat, pavedMask(roads, bl)); scene.add(ground);
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
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x9a9fa3, roughness: 0.5, metalness: 0.75 }); // galvanised steel, as on Toronto arterials
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
  const sigPole = [], sigLamp = [], sigHead = [], sigNames = [];
  const streetLabel = n => n.toUpperCase().replace(/\bSTREET\b/, 'ST').replace(/\bAVENUE\b/, 'AVE').replace(/\bDRIVE\b/, 'DR').replace(/\bROAD\b/, 'RD').replace(/\bBOULEVARD\b/, 'BLVD').replace(/\bCRESCENT\b/, 'CRES').replace(/\bEAST$/, 'E').replace(/\bWEST$/, 'W');
  for (const [x, z] of sigs) {
    // nudge to roadside if on road
    let px = x, pz = z; for (let k = 0; k < 12 && onRoad(px, pz); k++) { px += (r() - 0.5) * 6; pz += (r() - 0.5) * 6; }
    const ang = Math.atan2(x - px || 0.01, z - pz || 0.01);
    const g1 = new THREE.CylinderGeometry(0.1, 0.12, 6, 6).translate(0, 3, 0); const g2 = new THREE.BoxGeometry(0.12, 0.12, 6).translate(0, 5.9, 3); const g3 = new THREE.BoxGeometry(0.38, 1.1, 0.32).translate(0, 5.3, 4.6); const g4 = new THREE.BoxGeometry(0.38, 1.1, 0.32).translate(0, 5.3, 2.4);
    const l1 = new THREE.SphereGeometry(0.11, 8, 6).translate(0, 5.65, 4.78), l2 = new THREE.SphereGeometry(0.11, 8, 6).translate(0, 5.65, 2.58);
    for (const g of [g1, g2]) { g.rotateY(ang); g.translate(px, 0, pz); sigPole.push(g.toNonIndexed()); }
    for (const g of [g3, g4]) { g.rotateY(ang); g.translate(px, 0, pz); sigHead.push(g.toNonIndexed()); }
    for (const g of [l1, l2]) { g.rotateY(ang); g.translate(px, 0, pz); sigLamp.push(g.toNonIndexed()); }
    col.addPoly([[px - 0.2, pz - 0.2], [px + 0.2, pz - 0.2], [px + 0.2, pz + 0.2], [px - 0.2, pz + 0.2]], false);
    // Toronto street-name blade on the mast arm, naming the street the arm reaches over
    const tip = [px + Math.sin(ang) * 4.5, pz + Math.cos(ang) * 4.5];
    const nr = nearestRoad(roads, tip[0], tip[1], ['pri', 'sec', 'ter', 'res']);
    if (nr.road && nr.road.name && nr.d < 14) sigNames.push({ px, pz, ang, name: streetLabel(nr.road.name) });
  }
  if (sigNames.length) {
    const names = [...new Set(sigNames.map(sn => sn.name))].slice(0, 16); const RH = 64, CW = 512;
    const cv = document.createElement('canvas'); cv.width = CW; cv.height = RH * 16; const g = cv.getContext('2d');
    names.forEach((nm, i) => {
      const y = i * RH; g.fillStyle = '#1d4f9e'; g.fillRect(0, y, CW, RH); g.strokeStyle = '#f4f4f4'; g.lineWidth = 4; g.strokeRect(5, y + 5, CW - 10, RH - 10);
      g.fillStyle = '#ffffff'; g.font = 'bold 38px "Helvetica Neue", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(nm, CW / 2, y + RH / 2 + 1, CW - 40);
    });
    const tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 4;
    const parts = [];
    for (const sn of sigNames) {
      const i = names.indexOf(sn.name); if (i < 0) continue; const v0 = 1 - (i + 1) / 16, v1 = 1 - i / 16;
      for (const side of [1, -1]) {
        const pg = new THREE.PlaneGeometry(1.55, 0.3); const uv = pg.attributes.uv; for (let k = 0; k < 4; k++) uv.setY(k, uv.getY(k) > 0.5 ? v1 : v0);
        pg.rotateY(side * Math.PI / 2).translate(side * 0.07, 6.25, 1.6).rotateY(sn.ang).translate(sn.px, 0, sn.pz); parts.push(pg.toNonIndexed());
      }
    }
    if (parts.length) { const m = new THREE.Mesh(mergeGeometries(parts), new THREE.MeshStandardMaterial({ map: tx, roughness: 0.5, emissive: 0xffffff, emissiveMap: tx, emissiveIntensity: 0.12 })); scene.add(m); }
  }
  const signalMat = new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff2010, emissiveIntensity: 5 });
  if (sigPole.length) { scene.add(new THREE.Mesh(mergeGeometries(sigPole), poleMat)); scene.add(new THREE.Mesh(mergeGeometries(sigHead), new THREE.MeshStandardMaterial({ color: 0xe8b400, roughness: 0.45 }))); /* Toronto's yellow signal heads */ scene.add(new THREE.Mesh(mergeGeometries(sigLamp), signalMat)); }

  // ---- landmarks seen in Street View at the corner: the lit billboard over the south-east corner shops, and the
  // keep-right sign + yellow/black hazard marker on the noses of the Yonge medians ----
  {
    const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 360; const g = cv.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 1024, 0); gr.addColorStop(0, '#0f2a4a'); gr.addColorStop(1, '#1b5d8c'); g.fillStyle = gr; g.fillRect(0, 0, 1024, 360);
    g.fillStyle = '#f6d36b'; g.fillRect(0, 290, 1024, 70); g.fillStyle = '#ffffff'; g.font = 'bold 92px "Helvetica Neue", Arial, sans-serif'; g.fillText('NORTH YORK', 40, 120);
    g.font = '58px "Helvetica Neue", Arial, sans-serif'; g.fillText('Condos at Yonge & Finch', 44, 210); g.fillStyle = '#12324f'; g.font = 'bold 44px Arial, sans-serif'; g.fillText('FROM THE LOW $400s  ·  핀치 분양', 40, 342);
    const bt = new THREE.CanvasTexture(cv); bt.colorSpace = THREE.SRGBColorSpace; bt.anisotropy = 4;
    const bx = 34, bz = 104, face = Math.atan2(XING[0] - bx, XING[1] - bz);
    const frame = mergeGeometries([new THREE.BoxGeometry(0.3, 13, 0.3).translate(-3, 6.5, -0.4), new THREE.BoxGeometry(0.3, 13, 0.3).translate(3, 6.5, -0.4), new THREE.BoxGeometry(10.6, 4.0, 0.25).translate(0, 11.2, -0.25), new THREE.BoxGeometry(10.6, 0.12, 0.9).translate(0, 9.1, 0.3)].map(q => q.toNonIndexed()));
    frame.rotateY(face).translate(bx, 0, bz); scene.add(new THREE.Mesh(frame, poleMat));
    const board = new THREE.PlaneGeometry(10, 3.5).translate(0, 11.2, -0.1).rotateY(face).translate(bx, 0, bz);
    scene.add(new THREE.Mesh(board, new THREE.MeshStandardMaterial({ map: bt, emissiveMap: bt, emissive: 0xffffff, emissiveIntensity: 0.7, roughness: 0.6 })));
    col.addPoly([[bx - 0.5, bz - 0.5], [bx + 0.5, bz - 0.5], [bx + 0.5, bz + 0.5], [bx - 0.5, bz + 0.5]], false);
    const kc = document.createElement('canvas'); kc.width = 128; kc.height = 256; const k = kc.getContext('2d');
    k.fillStyle = '#d2d2cc'; k.fillRect(0, 0, 128, 150); k.strokeStyle = '#111'; k.lineWidth = 5; k.strokeRect(6, 6, 116, 138);
    k.fillStyle = '#111'; k.beginPath(); k.moveTo(48, 120); k.bezierCurveTo(48, 80, 82, 82, 82, 48); k.lineTo(70, 48); k.lineTo(90, 22); k.lineTo(108, 48); k.lineTo(96, 48); k.bezierCurveTo(96, 92, 62, 92, 62, 120); k.closePath(); k.fill();
    k.fillRect(20, 60, 22, 60); // the median island symbol
    for (let i = 0; i < 6; i++) { k.fillStyle = i % 2 ? '#111' : '#f2c400'; k.beginPath(); k.moveTo(0, 156 + i * 18); k.lineTo(128, 156 + i * 18 - 40); k.lineTo(128, 174 + i * 18 - 40); k.lineTo(0, 174 + i * 18); k.fill(); }
    k.clearRect(0, 150, 128, 6);
    const kt = new THREE.CanvasTexture(kc); kt.colorSpace = THREE.SRGBColorSpace;
    const kparts = [], kpost = [];
    for (const [x, z, a] of [[-3.4, 85, Math.PI], [3.2, 101, 0]]) {
      kpost.push(new THREE.CylinderGeometry(0.05, 0.05, 2.4, 6).translate(x, 1.2, z).toNonIndexed());
      const pg = new THREE.PlaneGeometry(0.62, 1.24).translate(0, 1.55, 0.06).rotateY(a).translate(x, 0, z); kparts.push(pg.toNonIndexed());
      col.addPoly([[x - 0.15, z - 0.15], [x + 0.15, z - 0.15], [x + 0.15, z + 0.15], [x - 0.15, z + 0.15]], false);
    }
    scene.add(new THREE.Mesh(mergeGeometries(kpost), poleMat));
    scene.add(new THREE.Mesh(mergeGeometries(kparts), new THREE.MeshStandardMaterial({ map: kt, roughness: 0.55, side: THREE.DoubleSide })));
  }

  // ---- cars ----
  const cars = []; // the GTA's real mix: mostly white, silver, grey and black, a few blue and red
  const carColors = ['#e8e8e6', '#dcdcda', '#f2f2f0', '#b8bcc0', '#a7abb0', '#8a8f96', '#6b6e72', '#4a4d52', '#1b1c1e', '#141516', '#1d2a44', '#7a1515', '#2e3d55', '#c9c2b2'];
  const tryCar = (x, z, ang) => { if (Math.hypot(x - PLAY_C[0], z - PLAY_C[1]) > PLAY_R - 10) return; if (cars.some(c => Math.hypot(c.x - x, c.z - z) < 6.5)) return; if (col.isBlocked(x, z) || Math.hypot(x - START[0], z - START[1]) < 9) return; cars.push({ x, z, a: ang, c: carColors[Math.floor(r() * carColors.length)], burn: false, haz: r() < 0.22 }); };
  placeAlong(roads, 22, rd => rd.w, rd => ['pri', 'sec', 'ter', 'res'].includes(rd.t), (x, z, nx, nz, ux, uz, rd) => {
    const dens = rd.t === 'pri' ? 0.55 : rd.t === 'sec' ? 0.45 : 0.18; if (r() > dens) return;
    const lanes = rd.lanes || 2; const lw = rd.w / lanes; const li = Math.floor(r() * lanes); const off = -rd.w / 2 + lw * (li + 0.5);
    let ang = Math.atan2(ux, uz) + (r() < 0.5 ? 0 : Math.PI); if (r() < 0.25) ang += (r() - 0.5) * 2.2; else ang += (r() - 0.5) * 0.25;
    tryCar(x + nx * off, z + nz * off, ang);
  });
  // surface parking lots (OSM amenity=parking) filled like the Apple Maps imagery: double-loaded rows of
  // 2.7 m x 5.4 m stalls facing each other across 7 m aisles, about two thirds occupied
  {
    let parked = 0;
    for (const line of A.split('\n')) {
      const f = line.split('|'); if (f[1] !== 'lot') continue; const p = dec(f[2]); if (p.length < 3) continue;
      if (!p.some(q => Math.hypot(q[0] - PLAY_C[0], q[1] - PLAY_C[1]) < PLAY_R)) continue;
      let best = 0, ux = 1, uz = 0; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L > best) { best = L; ux = (b[0] - a[0]) / L; uz = (b[1] - a[1]) / L; } }
      const vx = -uz, vz = ux; let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9;
      for (const q of p) { const u = q[0] * ux + q[1] * uz, w = q[0] * vx + q[1] * vz; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, w); v1 = Math.max(v1, w); }
      for (let w = v0 + 3.2; w < v1 - 2.7; w += 17.8) for (const row of [0, 1]) {
        const wc = w + row * 5.4; const ang0 = Math.atan2(vx, vz) + (row ? 0 : Math.PI);
        for (let u = u0 + 2; u < u1 - 1.5; u += 2.7) {
          const x = ux * u + vx * wc, z = uz * u + vz * wc;
          if (!pip(x, z, p) || r() > 0.66 || parked > 420) continue;
          if (Math.hypot(x - PLAY_C[0], z - PLAY_C[1]) > PLAY_R - 10 || col.isBlocked(x, z) || onRoad(x, z)) continue;
          cars.push({ x, z, a: ang0 + (r() - 0.5) * 0.06, c: carColors[Math.floor(r() * carColors.length)], burn: false, haz: false }); parked++;
        }
      }
    }
  }
  // a pile-up at the intersection
  for (let i = 0; i < 6; i++) tryCar(XING[0] + (r() - 0.5) * 26, XING[1] + (r() - 0.5) * 26, r() * Math.PI * 2);
  const bysd = cars.slice().sort((a, b) => Math.hypot(a.x - XING[0], a.z - XING[1]) - Math.hypot(b.x - XING[0], b.z - XING[1]));
  for (let i = 0; i < Math.min(4, bysd.length); i += 1) if (i !== 1) bysd[i].burn = true;
  // lofted procedural cars (src/cars.js): painted shell, glass, black trim + mirrors, lights; alloy wheels
  const KIND = ['sedan', 'suv', 'hatch'].map(k => ({ k, g: carGeoms(k) }));
  const bodyMat = new THREE.MeshPhysicalMaterial({ roughness: 0.42, metalness: 0.3, clearcoat: 1.0, clearcoatRoughness: 0.07, envMapIntensity: 1.0 }); // painted metal under clear coat
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x141b21, roughness: 0.04, metalness: 0.15, envMapIntensity: 1.6 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.75 });
  const headMat = new THREE.MeshStandardMaterial({ color: 0xdfe6ee, emissive: 0xfff2dc, emissiveIntensity: 0.25, roughness: 0.2 });
  const hazMat = new THREE.MeshStandardMaterial({ color: 0x331a00, emissive: 0xff8a10, emissiveIntensity: 0 });
  const tailMat = new THREE.MeshStandardMaterial({ color: 0x3a0505, emissive: 0x700000, emissiveIntensity: 1 });
  const tyreMat = new THREE.MeshStandardMaterial({ color: 0x0e0e0e, roughness: 0.85 }), rimMat = new THREE.MeshStandardMaterial({ color: 0xa9adb2, roughness: 0.3, metalness: 0.85 });
  cars.forEach(c => { const k = r(); c.kind = k < 0.45 ? 0 : k < 0.8 ? 1 : 2; });
  const wg = wheelGeoms(0.34);
  const tyres = new THREE.InstancedMesh(wg.tyre, tyreMat, cars.length * 4), rims = new THREE.InstancedMesh(wg.rim, rimMat, cars.length * 4);
  const meshes = [tyres, rims];
  const hz = cars.filter(c => c.haz && !c.burn).length;
  const hazI = []; // collected per kind so main.js can flash them through hazMat
  const cc = new THREE.Color(), wm = new THREE.Matrix4(), ws = new THREE.Vector3(), wq = new THREE.Quaternion(), wv = new THREE.Vector3();
  let iw = 0;
  KIND.forEach((K, ki) => {
    const mine = cars.filter(c => c.kind === ki); if (!mine.length) return;
    const n = mine.length, nh = mine.filter(c => c.haz && !c.burn).length;
    const body = new THREE.InstancedMesh(K.g.body, bodyMat, n), glass = new THREE.InstancedMesh(K.g.glass, glassMat, n), trim = new THREE.InstancedMesh(K.g.trim, trimMat, n), head = new THREE.InstancedMesh(K.g.head, headMat, n);
    const tail = new THREE.InstancedMesh(K.g.tail, tailMat, Math.max(1, n - nh)), haz = new THREE.InstancedMesh(K.g.tail, hazMat, Math.max(1, nh));
    let it = 0, ih = 0;
    mine.forEach((c, i) => {
      e.set(0, c.a, c.burn ? (r() - 0.5) * 0.05 : 0); q.setFromEuler(e); m4.compose(v.set(c.x, c.burn ? -0.18 : 0, c.z), q, s1);
      body.setMatrixAt(i, m4); glass.setMatrixAt(i, m4); trim.setMatrixAt(i, m4); head.setMatrixAt(i, m4);
      body.setColorAt(i, cc.set(c.burn ? '#0d0b0a' : c.c));
      if (c.haz && !c.burn) haz.setMatrixAt(ih++, m4); else tail.setMatrixAt(it++, m4);
      const sc = K.g.tyre / 0.34;
      for (const [wx, wz] of K.g.wheels) { wm.compose(wv.set(wx, K.g.tyre, wz), wq.identity(), ws.set(1, sc, sc)); wm.premultiply(m4); tyres.setMatrixAt(iw, wm); rims.setMatrixAt(iw++, wm); }
      const ca = Math.cos(c.a), sa = Math.sin(c.a); const hw = K.g.wid / 2 + 0.05, hl = K.g.len / 2;
      const corner = (dx, dz) => [c.x + dx * ca + dz * sa, c.z - dx * sa + dz * ca];
      col.addPoly([corner(-hw, -hl), corner(hw, -hl), corner(hw, hl), corner(-hw, hl)]);
    });
    tail.count = it; haz.count = ih; hazI.push(haz);
    meshes.push(body, glass, trim, head, tail, haz);
  });
  for (const m of meshes) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; m.frustumCulled = false; m.castShadow = true; m.receiveShadow = true; scene.add(m); }
  void hz;
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
  const tg = treeGeoms(); const barkMat = new THREE.MeshStandardMaterial({ color: 0x4b4239, roughness: 0.95 }); const everMat = new THREE.MeshStandardMaterial({ color: 0x1a2a1c, roughness: 0.9 });
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

