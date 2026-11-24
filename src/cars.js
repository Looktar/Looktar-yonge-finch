// Procedural cars lofted from cross-sections (front is +z, ground at y = 0).
// Each station along the car is a rounded rectangle whose top follows the real side profile
// (bumper, hood, windshield, roof, rear glass, deck) and whose upper part leans in (tumblehome).
// Triangles are split by height / position into painted body, glass and black trim so the instance
// colour only tints the paint.
import * as THREE from 'three';

// side profiles: [z, top y] control points, linearly interpolated, smoothed by the sampling
const KINDS = {
  sedan: {
    L: 4.7, W: 1.84, base: 2.8, tyre: 0.33, belt: 0.96, cabin: [-1.35, 1.02], pillarB: -0.2,
    top: [[-2.35, 0.62], [-2.3, 0.86], [-2.05, 0.98], [-1.45, 1.0], [-0.95, 1.4], [0.25, 1.44], [1.0, 1.0], [1.95, 0.9], [2.3, 0.74], [2.35, 0.5]],
  },
  suv: {
    L: 4.75, W: 1.92, base: 2.85, tyre: 0.37, belt: 1.12, cabin: [-2.2, 1.25], pillarB: -0.3,
    top: [[-2.38, 0.7], [-2.35, 1.1], [-2.28, 1.72], [0.55, 1.76], [1.3, 1.17], [2.1, 1.06], [2.36, 0.86], [2.38, 0.55]],
  },
  hatch: {
    L: 4.3, W: 1.8, base: 2.65, tyre: 0.32, belt: 0.98, cabin: [-1.95, 0.95], pillarB: -0.4,
    top: [[-2.15, 0.65], [-2.12, 1.0], [-1.95, 1.42], [0.2, 1.48], [0.95, 1.02], [1.85, 0.92], [2.12, 0.74], [2.15, 0.5]],
  },
};

function profile(pts, z) {
  if (z <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) if (z <= pts[i][0]) { const [z0, y0] = pts[i - 1], [z1, y1] = pts[i]; const t = (z - z0) / (z1 - z0); return y0 + (y1 - y0) * (t * t * (3 - 2 * t)); }
  return pts[pts.length - 1][1];
}

export function carGeoms(kind) {
  const K = KINDS[kind]; const hl = K.L / 2, hw0 = K.W / 2, yb = 0.24;
  const NS = 28, NR = 20; // stations along the car, points around each section
  const P = [], rings = [];
  for (let s = 0; s < NS; s++) {
    const z = -hl + K.L * s / (NS - 1);
    const end = Math.abs(z) / hl; const plan = 1 - 0.1 * Math.pow(end, 4); // rounded nose and tail in plan
    const top = profile(K.top, z), hw = hw0 * plan;
    const ring = [];
    for (let k = 0; k < NR; k++) {
      // rounded rectangle via superellipse, k = 0 at the bottom centre going round
      const a = (k / NR) * Math.PI * 2 - Math.PI / 2; const c = Math.cos(a), sn = Math.sin(a);
      const ex = 0.22, ey = 0.3; // roundness
      let x = Math.sign(c) * Math.pow(Math.abs(c), ex) * hw;
      let y = yb + (top - yb) * (0.5 + 0.5 * Math.sign(sn) * Math.pow(Math.abs(sn), ey));
      if (y > K.belt) { const t = (y - K.belt) / Math.max(0.05, top - K.belt); x *= 1 - 0.17 * t; } // tumblehome
      ring.push(P.length / 3); P.push(x, y, z);
    }
    rings.push(ring);
  }
  // end caps
  const capF = P.length / 3; P.push(0, (yb + profile(K.top, hl)) / 2, hl);
  const capR = P.length / 3; P.push(0, (yb + profile(K.top, -hl)) / 2, -hl);
  const tris = [];
  for (let s = 0; s < NS - 1; s++) for (let k = 0; k < NR; k++) {
    const a = rings[s][k], b = rings[s][(k + 1) % NR], c = rings[s + 1][k], d = rings[s + 1][(k + 1) % NR];
    tris.push([a, b, c], [b, d, c]); // outward: the ring runs counter-clockwise seen from the front
  }
  for (let k = 0; k < NR; k++) { tris.push([capF, rings[NS - 1][k], rings[NS - 1][(k + 1) % NR]]); tris.push([capR, rings[0][(k + 1) % NR], rings[0][k]]); }
  // classify triangles
  const parts = { body: [], glass: [], trim: [] };
  const roofTop = Math.max(...K.top.map(p => p[1]));
  for (const t of tris) {
    let cy = 0, cz = 0, cx = 0; for (const i of t) { cx += P[i * 3] / 3; cy += P[i * 3 + 1] / 3; cz += P[i * 3 + 2] / 3; }
    const inCabin = cz > K.cabin[0] && cz < K.cabin[1];
    const glass = inCabin && cy > K.belt + 0.03 && cy < roofTop - 0.05 && Math.abs(cz - K.pillarB) > 0.07;
    const trim = cy < yb + 0.16 || (Math.abs(cz) > hl - 0.1 && cy < yb + 0.3);
    (glass ? parts.glass : trim ? parts.trim : parts.body).push(t);
  }
  // normals must be shared across parts: compute once on the whole shell, then split
  const all = new THREE.BufferGeometry(); all.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); all.setIndex(tris.flat()); all.computeVertexNormals();
  const N = all.attributes.normal.array;
  const split = list => { const pos = [], nor = []; for (const t of list) for (const i of t) { pos.push(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]); nor.push(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]); } const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.computeBoundingSphere(); return g; };
  const body = split(parts.body), glass = split(parts.glass), trim = split(parts.trim);
  // mirrors, front lights, full-width tail light bar
  const fz = hl - 0.06, rz = -hl + 0.05;
  const headY = profile(K.top, hl - 0.25) - 0.1, tailY = profile(K.top, -hl + 0.2) - 0.12;
  const mirror = [-1, 1].map(sx => new THREE.BoxGeometry(0.16, 0.1, 0.2).translate(sx * (hw0 * 0.92 + 0.06), K.belt + 0.06, K.cabin[1] - 0.25).toNonIndexed());
  const trimAll = mergeGeoms([trim, ...mirror]);
  const head = mergeGeoms([-1, 1].map(sx => new THREE.BoxGeometry(0.42, 0.11, 0.06).translate(sx * hw0 * 0.62, headY, fz).toNonIndexed()));
  const tail = mergeGeoms([new THREE.BoxGeometry(hw0 * 1.6, 0.1, 0.06).translate(0, tailY, rz).toNonIndexed()]);
  const wb = K.base / 2, wx = hw0 * 0.86;
  return { body, glass, trim: trimAll, head, tail, wheels: [[-wx, wb], [wx, wb], [-wx, -wb], [wx, -wb]], tyre: K.tyre, len: K.L, wid: K.W };
}

function mergeGeoms(list) {
  const pos = [], nor = [];
  for (const g of list) { const p = g.attributes.position.array, n = g.attributes.normal.array; for (let i = 0; i < p.length; i++) { pos.push(p[i]); nor.push(n[i]); } }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.computeBoundingSphere(); return g;
}

// tyre + alloy rim, axis along x, centred at the origin
export function wheelGeoms(r) {
  const tyre = new THREE.CylinderGeometry(r, r, 0.22, 18).rotateZ(Math.PI / 2).toNonIndexed();
  const rim = mergeGeoms([new THREE.CylinderGeometry(r * 0.62, r * 0.62, 0.235, 14).rotateZ(Math.PI / 2).toNonIndexed()]);
  return { tyre, rim };
}
