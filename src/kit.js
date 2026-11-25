// Part-list modelling kit, after Saltline's builders: every prop is a list of small primitives (chamfered boxes,
// lathes, extrusions with holes, tubes) whose transforms are baked in, tagged per vertex with an ambient-occlusion
// tint and an edge-wear weight, then merged into one mesh per material (one draw call each).
// Vertex attribute `kit` = (ao, edge): ao darkens recesses, edge says how exposed a vertex is to wear.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// ---- primitives (all centred on the origin unless stated) ----

// box with 45-degree chamfers on all 12 edges; flat shaded, chamfer faces carry edge = 1
export function chamferBox(w, h, d, c = Math.min(w, h, d) * 0.12) {
  c = Math.min(c, w / 2 - 1e-5, h / 2 - 1e-5, d / 2 - 1e-5);
  const X = w / 2, Y = h / 2, Z = d / 2, pos = [], edge = [];
  const quad = (a, b, cc, dd, e) => { pos.push(...a, ...b, ...cc, ...a, ...cc, ...dd); for (let i = 0; i < 6; i++) edge.push(e); };
  const tri = (a, b, cc, e) => { pos.push(...a, ...b, ...cc); for (let i = 0; i < 3; i++) edge.push(e); };
  // corner point helper: corner (sx,sy,sz), pulled in along the two axes other than `k`
  const P = (sx, sy, sz, k) => [k === 0 ? sx * X : sx * (X - c), k === 1 ? sy * Y : sy * (Y - c), k === 2 ? sz * Z : sz * (Z - c)];
  const oq = (q, want, e) => { const n = new THREE.Vector3().crossVectors(new THREE.Vector3(...q[1]).sub(new THREE.Vector3(...q[0])), new THREE.Vector3(...q[2]).sub(new THREE.Vector3(...q[0]))); if (n.dot(new THREE.Vector3(...want)) > 0) quad(q[0], q[1], q[2], q[3], e); else quad(q[3], q[2], q[1], q[0], e); };
  for (const s of [1, -1]) { // main faces
    oq([P(s, -1, -1, 0), P(s, 1, -1, 0), P(s, 1, 1, 0), P(s, -1, 1, 0)], [s, 0, 0], 0);
    oq([P(-1, s, -1, 1), P(-1, s, 1, 1), P(1, s, 1, 1), P(1, s, -1, 1)], [0, s, 0], 0);
    oq([P(-1, -1, s, 2), P(1, -1, s, 2), P(1, 1, s, 2), P(-1, 1, s, 2)], [0, 0, s], 0);
  }
  // edge chamfers: between face k1 and face k2 for every sign pair
  const pairs = [[0, 1, 2], [0, 2, 1], [1, 2, 0]];
  for (const [a, b, along] of pairs) for (const sa of [1, -1]) for (const sb of [1, -1]) {
    const pt = (sl, k) => { const s = [0, 0, 0]; s[a] = sa; s[b] = sb; s[along] = sl; return P(s[0], s[1], s[2], k); };
    const want = [0, 0, 0]; want[a] = sa; want[b] = sb;
    oq([pt(-1, a), pt(1, a), pt(1, b), pt(-1, b)], want, 1);
  }
  // corner triangles
  for (const sx of [1, -1]) for (const sy of [1, -1]) for (const sz of [1, -1]) {
    const t = [P(sx, sy, sz, 0), P(sx, sy, sz, 1), P(sx, sy, sz, 2)];
    const n = new THREE.Vector3().crossVectors(new THREE.Vector3(...t[1]).sub(new THREE.Vector3(...t[0])), new THREE.Vector3(...t[2]).sub(new THREE.Vector3(...t[0])));
    if (n.dot(new THREE.Vector3(sx, sy, sz)) > 0) tri(t[0], t[1], t[2], 1); else tri(t[2], t[1], t[0], 1);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
  g.setAttribute('edge', new THREE.Float32BufferAttribute(edge, 1)); return g;
}

// lathe around the Z axis (forward = -Z): profile [[r, z], ...] from back to front; edge = 1 at profile corners
export function lathe(profile, seg = 20, { z0 = 0, x = 0, y = 0 } = {}) {
  const pts = profile.map(([r, z]) => new THREE.Vector2(Math.max(r, 0), z));
  const g = new THREE.LatheGeometry(pts, seg); // around Y, profile x = radius, y = height
  // corner weights per profile point: sharp turns wear
  const cw = profile.map((p, i) => { if (i === 0 || i === profile.length - 1) return 1; const a = [p[0] - profile[i - 1][0], p[1] - profile[i - 1][1]], b = [profile[i + 1][0] - p[0], profile[i + 1][1] - p[1]]; const la = Math.hypot(...a) || 1, lb = Math.hypot(...b) || 1; return Math.min(1, (1 - (a[0] * b[0] + a[1] * b[1]) / (la * lb)) * 1.5); });
  const n = g.attributes.position.count, edge = new Float32Array(n);
  for (let i = 0; i < n; i++) edge[i] = cw[i % profile.length];
  g.setAttribute('edge', new THREE.BufferAttribute(edge, 1));
  g.rotateX(-Math.PI / 2); // +Y -> -Z
  g.translate(x, y, -z0); return g;
}

// extrude a side profile (u = forward, v = up) to width along X, centred on x; bevelled; holes punch through
export function sideExtrude(pts, width, bevel = 0.002, holes = [], seg = 2) {
  const sh = new THREE.Shape(pts.map(([u, v]) => new THREE.Vector2(u, v)));
  for (const h of holes) sh.holes.push(new THREE.Path(h.map(([u, v]) => new THREE.Vector2(u, v))));
  const g = new THREE.ExtrudeGeometry(sh, { depth: Math.max(0.0005, width - bevel * 2), bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel * 0.85, bevelSegments: seg, curveSegments: 8 });
  g.translate(0, 0, -(width - bevel * 2) / 2); g.rotateY(Math.PI / 2); // shape x(u) -> -z, extrusion -> x
  return markBevel(g, 0);
}
// extrude a cross-section (x, y) along -Z from z0 to z1 (forward distances), bevelled
export function sectionExtrude(pts, z0, z1, bevel = 0.0015, holes = []) {
  const sh = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  for (const h of holes) sh.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, y))));
  const L = z1 - z0; const g = new THREE.ExtrudeGeometry(sh, { depth: Math.max(0.0005, L - bevel * 2), bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel * 0.85, bevelSegments: 2, curveSegments: 8 });
  g.translate(0, 0, bevel); g.scale(1, 1, -1); g.translate(0, 0, -z0);
  // flip winding after the mirror
  flipWinding(g); g.computeVertexNormals(); return markBevel(g, 2);
}
// reverse every triangle (after a mirroring scale); works for indexed and non-indexed geometry
function flipWinding(g) {
  if (g.index) { const a = g.index.array; for (let i = 0; i < a.length; i += 3) { const t = a[i + 1]; a[i + 1] = a[i + 2]; a[i + 2] = t; } return; }
  for (const name of Object.keys(g.attributes)) { const at = g.attributes[name], k = at.itemSize, a = at.array; for (let i = 0; i < at.count; i += 3) for (let c = 0; c < k; c++) { const t = a[(i + 1) * k + c]; a[(i + 1) * k + c] = a[(i + 2) * k + c]; a[(i + 2) * k + c] = t; } at.needsUpdate = true; }
}
// bevel faces are the ones whose normal is neither along the extrusion axis (caps) nor across it (walls)
function markBevel(g, axis) { if (!g.attributes.normal) g.computeVertexNormals(); const n = g.attributes.normal, e = new Float32Array(n.count); for (let i = 0; i < n.count; i++) { const a = Math.abs(n.getComponent(i, axis)); e[i] = a > 0.12 && a < 0.97 ? 1 : 0; } g.setAttribute('edge', new THREE.BufferAttribute(e, 1)); return g; }

// tube through points [[x,y,z]...]
export function tube(points, r, seg = 8, tubular = 32) {
  const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
  return new THREE.TubeGeometry(curve, tubular, r, seg, false);
}
export function roundRect(u0, v0, u1, v1, r, n = 4) { const p = []; const c = [[u1 - r, v1 - r, 0], [u0 + r, v1 - r, Math.PI / 2], [u0 + r, v0 + r, Math.PI], [u1 - r, v0 + r, Math.PI * 1.5]]; for (const [cu, cv, a0] of c) for (let i = 0; i <= n; i++) { const a = a0 + i / n * Math.PI / 2; p.push([cu + Math.cos(a) * r, cv + Math.sin(a) * r]); } return p; }
export function bez(a, b, c, n = 8) { const p = []; for (let i = 0; i <= n; i++) { const t = i / n; p.push([(1 - t) ** 2 * a[0] + 2 * (1 - t) * t * b[0] + t * t * c[0], (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * b[1] + t * t * c[1]]); } return p; }
export function polygon(n, r, rot = 0) { const p = []; for (let i = 0; i < n; i++) { const a = rot + i / n * Math.PI * 2; p.push([Math.cos(a) * r, Math.sin(a) * r]); } return p; }

// ---- the part list ----
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
export class Kit {
  constructor() { this.buckets = new Map(); }
  // place a primitive: at [x,y,z], rotation [rx,ry,rz] (radians, XYZ), uniform or [sx,sy,sz] scale; ao 0..1 (1 = open), edge multiplier
  add(geo, mat, { at, rot, scale, ao = 1, edge = 1 } = {}) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (at || rot || scale) {
      _q.setFromEuler(_e.set(...(rot || [0, 0, 0]))); _s.set(...(Array.isArray(scale) ? scale : [scale || 1, scale || 1, scale || 1]));
      g.applyMatrix4(_m.compose(_v.set(...(at || [0, 0, 0])), _q, _s));
    }
    const n = g.attributes.position.count, k = new Float32Array(n * 2), ea = g.attributes.edge;
    for (let i = 0; i < n; i++) { k[i * 2] = ao; k[i * 2 + 1] = (ea ? ea.getX(i) : 0) * edge; }
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
    if (!g.attributes.normal) g.computeVertexNormals();
    g.setAttribute('kit', new THREE.BufferAttribute(k, 2));
    if (!this.buckets.has(mat)) this.buckets.set(mat, []);
    this.buckets.get(mat).push(g); return this;
  }
  // merged meshes, one per material
  build(name = 'kit') {
    const grp = new THREE.Group(); grp.name = name;
    for (const [mat, gs] of this.buckets) { const m = new THREE.Mesh(mergeGeometries(gs), mat); m.frustumCulled = false; grp.add(m); }
    return grp;
  }
  // one InstancedMesh per material, placed at [x, z, angle] (or [x, z, angle, y])
  instanced(list, name = 'props') {
    const grp = new THREE.Group(); grp.name = name; if (!list.length) return grp;
    for (const [mat, gs] of this.buckets) {
      const im = new THREE.InstancedMesh(mergeGeometries(gs), mat, list.length);
      list.forEach(([x, z, a, y = 0], i) => { _q.setFromEuler(_e.set(0, a, 0)); im.setMatrixAt(i, _m.compose(_v.set(x, y, z), _q, _s.set(1, 1, 1))); });
      im.instanceMatrix.needsUpdate = true; im.castShadow = im.receiveShadow = true; im.computeBoundingSphere(); grp.add(im);
    }
    return grp;
  }
  get parts() { let n = 0; for (const gs of this.buckets.values()) n += gs.length; return n; }
}

// meshes built outside a Kit (capsules, cylinders...) get the neutral kit attribute (open, no wear), otherwise the
// missing attribute reads as 0 in the shader and turns them black
export function ensureKit(root) {
  root.traverse(o => { const g = o.geometry; if (!o.isMesh || !g || g.attributes.kit) return; const n = g.attributes.position.count, k = new Float32Array(n * 2); for (let i = 0; i < n; i++) k[i * 2] = 1; g.setAttribute('kit', new THREE.BufferAttribute(k, 2)); });
  return root;
}

// loft: sweep an ellipse along a path (parallel-transport frames), with rounded end caps. path [[x,y,z]...],
// radii: [rx, ry] per point (rx along the frame normal, ry along the binormal) or a single [rx, ry]; up hint for the
// first frame. Saltline builds its hands this way.
export function loft(path, radii, seg = 12, { up = [0, 1, 0], caps = true } = {}) {
  const P = path.map(p => new THREE.Vector3(...p)), n = P.length, R = i => Array.isArray(radii[0]) ? radii[i] : radii;
  const T = P.map((p, i) => new THREE.Vector3().subVectors(P[Math.min(i + 1, n - 1)], P[Math.max(i - 1, 0)]).normalize());
  let N = new THREE.Vector3(...up); if (Math.abs(N.dot(T[0])) > 0.95) N.set(1, 0, 0); N.sub(T[0].clone().multiplyScalar(N.dot(T[0]))).normalize();
  const pos = [], idx = [];
  const ring = (c, t, nn, rx, ry) => { const b = new THREE.Vector3().crossVectors(t, nn); for (let k = 0; k < seg; k++) { const a = k / seg * Math.PI * 2; pos.push(c.x + nn.x * Math.cos(a) * rx + b.x * Math.sin(a) * ry, c.y + nn.y * Math.cos(a) * rx + b.y * Math.sin(a) * ry, c.z + nn.z * Math.cos(a) * rx + b.z * Math.sin(a) * ry); } };
  const frames = [];
  for (let i = 0; i < n; i++) { if (i > 0) N.sub(T[i].clone().multiplyScalar(N.dot(T[i]))).normalize(); frames.push(N.clone()); }
  // end caps: two shrinking rings and a tip, so ends are domes instead of flat discs
  const rings = [];
  if (caps) { const [rx, ry] = R(0), r = Math.min(rx, ry); rings.push([P[0].clone().addScaledVector(T[0], -r * 0.55), T[0], frames[0], rx * 0.6, ry * 0.6]); }
  for (let i = 0; i < n; i++) { const [rx, ry] = R(i); rings.push([P[i], T[i], frames[i], rx, ry]); }
  if (caps) { const [rx, ry] = R(n - 1), r = Math.min(rx, ry); rings.push([P[n - 1].clone().addScaledVector(T[n - 1], r * 0.55), T[n - 1], frames[n - 1], rx * 0.6, ry * 0.6]); }
  for (const r of rings) ring(...r);
  const NR = rings.length;
  for (let j = 0; j < NR - 1; j++) for (let k = 0; k < seg; k++) { const a = j * seg + k, b = j * seg + (k + 1) % seg, c = a + seg, d = b + seg; idx.push(a, b, c, b, d, c); }
  if (caps) { // tips
    const t0 = pos.length / 3; const s = P[0].clone().addScaledVector(T[0], -Math.min(...R(0)) * 0.95); pos.push(s.x, s.y, s.z);
    const t1 = t0 + 1; const e = P[n - 1].clone().addScaledVector(T[n - 1], Math.min(...R(n - 1)) * 0.95); pos.push(e.x, e.y, e.z);
    for (let k = 0; k < seg; k++) { idx.push(t0, (k + 1) % seg, k); const o = (NR - 1) * seg; idx.push(t1, o + k, o + (k + 1) % seg); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
