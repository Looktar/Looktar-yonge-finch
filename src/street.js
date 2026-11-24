import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { X } from './data_x.js';
import { T as CITY_TREES } from './data_t.js';

const decAbs = s => { const v = s.split(',').map(Number); return [v[0] / 2, v[1] / 2]; };
const decD = s => { const v = s.split(',').map(Number); const p = []; let x = 0, z = 0; for (let i = 0; i < v.length; i += 2) { x += v[i]; z += v[i + 1]; p.push([x / 2, z / 2]); } return p; };

export function parseX() {
  const out = { S: [], X: [], L: [], l: [], F: [], W: [], C: [], T: [], p: [], H: [], K: [], O: [], Q: [] };
  for (const line of X.split('\n')) {
    const f = line.split('|'); const k = f[0];
    if ('TpHKOQ'.includes(k)) out[k].push(decAbs(f[2])); else out[k].push({ a: f[1], p: decD(f[2]) });
  }
  return out;
}

// nearest road direction helper
export function nearestRoad(roads, x, z, types) {
  let best = 1e9, dir = null, foot = null, road = null;
  for (const r of roads) {
    if (types && !types.includes(r.t)) continue;
    for (let i = 0; i < r.p.length - 1; i++) {
      const a = r.p[i], b = r.p[i + 1]; const dx = b[0] - a[0], dz = b[1] - a[1]; const L2 = dx * dx + dz * dz || 1; let t = ((x - a[0]) * dx + (z - a[1]) * dz) / L2; t = Math.max(0, Math.min(1, t));
      const fx = a[0] + dx * t, fz = a[1] + dz * t; const d = Math.hypot(x - fx, z - fz);
      if (d < best) { best = d; const L = Math.sqrt(L2); dir = [dx / L, dz / L]; foot = [fx, fz]; road = r; }
    }
  }
  return { d: best, dir, foot, road };
}

function catenary(a, b, ya, yb, sag, segs, out) {
  for (let i = 0; i < segs; i++) {
    const t0 = i / segs, t1 = (i + 1) / segs;
    const y0 = ya + (yb - ya) * t0 - sag * 4 * t0 * (1 - t0), y1 = ya + (yb - ya) * t1 - sag * 4 * t1 * (1 - t1);
    out.push(a[0] + (b[0] - a[0]) * t0, y0, a[1] + (b[1] - a[1]) * t0, a[0] + (b[0] - a[0]) * t1, y1, a[1] + (b[1] - a[1]) * t1);
  }
}

function stopTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  g.fillStyle = '#b5121b'; g.beginPath(); for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + i * Math.PI / 4; g.lineTo(64 + Math.cos(a) * 62, 64 + Math.sin(a) * 62); } g.closePath(); g.fill();
  g.strokeStyle = '#eee'; g.lineWidth = 5; g.beginPath(); for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + i * Math.PI / 4; g.lineTo(64 + Math.cos(a) * 55, 64 + Math.sin(a) * 55); } g.closePath(); g.stroke();
  g.fillStyle = '#eee'; g.font = 'bold 36px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('STOP', 64, 66);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function fenceTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); g.strokeStyle = '#fff'; g.lineWidth = 2;
  for (let i = -64; i < 128; i += 12) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 64, 64); g.stroke(); g.beginPath(); g.moveTo(i + 64, 0); g.lineTo(i, 64); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}

export function addStreetscape(scene, ctx) {
  const { col, roads, onRoad, rng, X: D, walkMat, PLAY_C, PLAY_R } = ctx; const r = rng;
  const inPlay = (x, z, m = 0) => Math.hypot(x - PLAY_C[0], z - PLAY_C[1]) < PLAY_R + m;
  const e = new THREE.Euler(), q = new THREE.Quaternion(), m4 = new THREE.Matrix4(), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);

  // ---- sidewalks (real OSM geometry) ----
  {
    const pos = [], uv = [];
    for (const s of D.S) { const p = s.p; for (let i = 0; i < p.length - 1; i++) { const a = p[i], b = p[i + 1]; const dx = b[0] - a[0], dz = b[1] - a[1]; const L = Math.hypot(dx, dz); if (L < 0.05) continue; const nx = -dz / L * 1.0, nz = dx / L * 1.0; const ex = dx / L * 0.5, ez = dz / L * 0.5;
      const A = [a[0] + nx - ex, a[1] + nz - ez], B2 = [a[0] - nx - ex, a[1] - nz - ez], C = [b[0] + nx + ex, b[1] + nz + ez], Dd = [b[0] - nx + ex, b[1] - nz + ez];
      for (const P of [A, C, B2, B2, C, Dd]) { pos.push(P[0], 0.024, P[1]); uv.push(P[0] / 7, P[1] / 7); } } }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(pos.length).map((_, i) => i % 3 === 1 ? 1 : 0), 3));
    const m = new THREE.Mesh(g, walkMat); m.renderOrder = 1; scene.add(m);
  }
  // ---- crosswalks (real OSM crossing ways) ----
  {
    const parts = [];
    for (const s of D.X) { const p = s.p; for (let i = 0; i < p.length - 1; i++) { const a = p[i], b = p[i + 1]; const dx = b[0] - a[0], dz = b[1] - a[1]; const L = Math.hypot(dx, dz); if (L < 1) continue; const ang = Math.atan2(dx, dz);
      for (let t = 0.6; t < L - 0.3; t += 1.1) { const g = new THREE.PlaneGeometry(3.2, 0.55).rotateX(-Math.PI / 2).rotateY(ang); g.translate(a[0] + dx / L * t, 0.05, a[1] + dz / L * t); parts.push(g); } } }
    if (parts.length) { const m = new THREE.Mesh(mergeGeometries(parts), new THREE.MeshStandardMaterial({ color: 0xd6d6cf, roughness: 0.4, emissive: 0x151515, polygonOffset: true, polygonOffsetFactor: -6 })); m.renderOrder = 4; scene.add(m); }
  }
  // ---- fences & walls ----
  {
    const fenceMat = new THREE.MeshStandardMaterial({ color: 0x8a8f94, metalness: 0.6, roughness: 0.5, alphaMap: fenceTexture(), alphaTest: 0.4, side: THREE.DoubleSide });
    const postMat = new THREE.MeshStandardMaterial({ color: 0x6d7276, metalness: 0.6, roughness: 0.5 });
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x77736c, roughness: 0.9 });
    const fp = [], po = [], wa = [];
    for (const s of D.F) { const p = s.p; if (!p.some(q2 => inPlay(q2[0], q2[1], 30))) continue; for (let i = 0; i < p.length - 1; i++) { const a = p[i], b = p[i + 1]; const dx = b[0] - a[0], dz = b[1] - a[1]; const L = Math.hypot(dx, dz); if (L < 0.2) continue; const g = new THREE.PlaneGeometry(L, 1.6); const uv = g.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * L / 0.9, uv.getY(k) * 1.6 / 0.9); g.rotateY(-Math.atan2(dz, dx)); g.translate((a[0] + b[0]) / 2, 0.8, (a[1] + b[1]) / 2); fp.push(g);
      for (let t = 0; t <= L; t += 3) { po.push(new THREE.CylinderGeometry(0.03, 0.03, 1.7, 5).translate(a[0] + dx / L * t, 0.85, a[1] + dz / L * t)); }
      col.addLine(a, b); } }
    for (const s of D.W) { const p = s.p; for (let i = 0; i < p.length - 1; i++) { const a = p[i], b = p[i + 1]; const dx = b[0] - a[0], dz = b[1] - a[1]; const L = Math.hypot(dx, dz); if (L < 0.2) continue; wa.push(new THREE.BoxGeometry(L, 1.2, 0.25).rotateY(-Math.atan2(dz, dx)).translate((a[0] + b[0]) / 2, 0.6, (a[1] + b[1]) / 2)); col.addLine(a, b); } }
    if (fp.length) scene.add(new THREE.Mesh(mergeGeometries(fp), fenceMat));
    if (po.length) scene.add(new THREE.Mesh(mergeGeometries(po), postMat));
    if (wa.length) scene.add(new THREE.Mesh(mergeGeometries(wa), wallMat));
  }
  // ---- canopies / shelters ----
  {
    const parts = [], pil = []; const mat = new THREE.MeshStandardMaterial({ color: 0x5d636a, roughness: 0.5, metalness: 0.4 });
    for (const s of D.C) { const p = s.p; if (p.length < 3) continue; const h = s.a ? Math.max(3.2, +s.a * 3.6) : 4.2;
      const tri = THREE.ShapeUtils.triangulateShape(p.map(q2 => new THREE.Vector2(q2[0], q2[1])), []);
      const pos = []; for (const t of tri) for (const k of [t[0], t[2], t[1]]) pos.push(p[k][0], h, p[k][1]);
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals(); parts.push(g);
      const g2 = g.clone(); g2.translate(0, 0.25, 0); parts.push(g2);
      for (let i = 0; i < p.length; i += Math.max(1, Math.floor(p.length / 6))) { pil.push(new THREE.BoxGeometry(0.22, h, 0.22).translate(p[i][0], h / 2, p[i][1])); col.addPoly([[p[i][0] - 0.12, p[i][1] - 0.12], [p[i][0] + 0.12, p[i][1] - 0.12], [p[i][0] + 0.12, p[i][1] + 0.12], [p[i][0] - 0.12, p[i][1] + 0.12]], false); } }
    if (parts.length) { const m = new THREE.Mesh(mergeGeometries(parts), mat); m.material.side = THREE.DoubleSide; scene.add(m); scene.add(new THREE.Mesh(mergeGeometries(pil), mat)); }
  }
  // ---- utility poles (wood) + local power lines ----
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x3b2f26, roughness: 0.95 });
  const wireMat = new THREE.LineBasicMaterial({ color: 0x0b0c0d, transparent: true, opacity: 0.85 });
  const poles = D.p.filter(([x, z]) => inPlay(x, z, 40));
  {
    const g = mergeGeometries([new THREE.CylinderGeometry(0.12, 0.17, 11, 7).translate(0, 5.5, 0), new THREE.BoxGeometry(2.0, 0.12, 0.12).translate(0, 10.3, 0), new THREE.CylinderGeometry(0.22, 0.22, 0.7, 8).translate(0.45, 9.3, 0.25)].map(x => x.toNonIndexed()));
    const im = new THREE.InstancedMesh(g, woodMat, Math.max(1, poles.length));
    poles.forEach(([x, z], i) => { const nr = nearestRoad(roads, x, z); const ang = nr.dir ? Math.atan2(nr.dir[0], nr.dir[1]) + Math.PI / 2 : r() * 6; e.set(0, ang, (r() - 0.5) * 0.03); q.setFromEuler(e); m4.compose(v.set(x, 0, z), q, one); im.setMatrixAt(i, m4); col.addPoly([[x - 0.18, z - 0.18], [x + 0.18, z - 0.18], [x + 0.18, z + 0.18], [x - 0.18, z + 0.18]], false); });
    im.instanceMatrix.needsUpdate = true; scene.add(im);
    const w = [];
    for (const s of D.l) { const p = s.p; if (!p.some(q2 => inPlay(q2[0], q2[1], 60))) continue; for (let i = 0; i < p.length - 1; i++) { const a = p[i], b = p[i + 1]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 2 || L > 90) continue; const nx = -(b[1] - a[1]) / L, nz = (b[0] - a[0]) / L;
      for (const [o, h] of [[-0.85, 10.3], [0.85, 10.3], [0, 9.0]]) catenary([a[0] + nx * o, a[1] + nz * o], [b[0] + nx * o, b[1] + nz * o], h, h, 0.25 + L * 0.012, 8, w); } }
    const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(w, 3)); const ls = new THREE.LineSegments(wg, wireMat); ls.frustumCulled = false; scene.add(ls);
  }
  // ---- hydro transmission towers + lines (Finch hydro corridor) ----
  {
    const steel = new THREE.MeshStandardMaterial({ color: 0x5b5f63, metalness: 0.7, roughness: 0.55 });
    const H = 34; const parts = [];
    const leg = (x0, z0, x1, z1, y0, y1) => { const a = new THREE.Vector3(x0, y0, z0), b = new THREE.Vector3(x1, y1, z1); const L = a.distanceTo(b); const g = new THREE.BoxGeometry(0.22, L, 0.22); g.translate(0, L / 2, 0); const dir = b.clone().sub(a).normalize(); g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)); g.translate(a.x, a.y, a.z); parts.push(g.toNonIndexed()); };
    const w0 = 3.6, w1 = 0.9; const corners = (s) => [[-s, -s], [s, -s], [s, s], [-s, s]];
    const lv = [0, 8, 16, 24, H]; const wAt = y => w0 + (w1 - w0) * (y / H);
    for (let k = 0; k < 4; k++) { const [ax, az] = corners(w0)[k], [bx, bz] = corners(w1)[k]; leg(ax, az, bx, bz, 0, H); }
    for (let li = 0; li < lv.length - 1; li++) { const ya = lv[li], yb = lv[li + 1]; const ca = corners(wAt(ya)), cb = corners(wAt(yb)); for (let k = 0; k < 4; k++) { const n = (k + 1) % 4; leg(ca[k][0], ca[k][1], cb[n][0], cb[n][1], ya, yb); leg(ca[n][0], ca[n][1], cb[k][0], cb[k][1], ya, yb); leg(cb[k][0], cb[k][1], cb[n][0], cb[n][1], yb, yb); } }
    for (const y of [22, 28]) { leg(-7, 0, 7, 0, y, y); leg(-7, 0, 0, 0.01, y, y + 3); leg(7, 0, 0, 0.01, y, y + 3); }
    leg(0, 0, 0, 0.01, H, H + 3);
    const tg = mergeGeometries(parts);
    const towers = D.T; const im = new THREE.InstancedMesh(tg, steel, Math.max(1, towers.length));
    // orient each tower across the corridor: find nearest line direction
    const lines = D.L.map(s => s.p);
    const lineDir = (x, z) => { let best = 1e9, d = [1, 0]; for (const p of lines) for (let i = 0; i < p.length - 1; i++) { const a = p[i], b = p[i + 1]; const dx = b[0] - a[0], dz = b[1] - a[1]; const L2 = dx * dx + dz * dz || 1; let t = ((x - a[0]) * dx + (z - a[1]) * dz) / L2; t = Math.max(0, Math.min(1, t)); const dd = Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t); if (dd < best) { best = dd; const L = Math.sqrt(L2); d = [dx / L, dz / L]; } } return d; };
    towers.forEach(([x, z], i) => { const d = lineDir(x, z); e.set(0, Math.atan2(d[0], d[1]) + Math.PI / 2, 0); q.setFromEuler(e); m4.compose(v.set(x, 0, z), q, one); im.setMatrixAt(i, m4); const s = 3.8; col.addPoly([[x - s, z - s], [x + s, z - s], [x + s, z + s], [x - s, z + s]], false); });
    im.instanceMatrix.needsUpdate = true; scene.add(im);
    // conductors: connect consecutive vertices of each line that are near a tower
    const w = [];
    for (const p of lines) { for (let i = 0; i < p.length - 1; i++) { const a = p[i], b = p[i + 1]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 20 || L > 600) continue; if (!inPlay(a[0], a[1], 400) && !inPlay(b[0], b[1], 400)) continue; const nx = -(b[1] - a[1]) / L, nz = (b[0] - a[0]) / L;
      for (const [o, h] of [[-6.5, 22], [6.5, 22], [-6.5, 28], [6.5, 28], [0, 37]]) catenary([a[0] + nx * o, a[1] + nz * o], [b[0] + nx * o, b[1] + nz * o], h, h, L * 0.03, 14, w); } }
    const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(w, 3)); const ls = new THREE.LineSegments(wg, wireMat); ls.frustumCulled = false; scene.add(ls);
  }
  // ---- hydrants, stop signs, bus stop poles ----
  {
    const hyd = D.H.filter(([x, z]) => inPlay(x, z, 30));
    const hg = mergeGeometries([new THREE.CylinderGeometry(0.13, 0.15, 0.6, 10).translate(0, 0.3, 0), new THREE.SphereGeometry(0.13, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.6, 0), new THREE.CylinderGeometry(0.06, 0.06, 0.42, 8).rotateZ(Math.PI / 2).translate(0, 0.42, 0), new THREE.CylinderGeometry(0.2, 0.2, 0.05, 10).translate(0, 0.03, 0)].map(x => x.toNonIndexed()));
    const im = new THREE.InstancedMesh(hg, new THREE.MeshStandardMaterial({ color: 0xa8141a, roughness: 0.45, metalness: 0.2 }), Math.max(1, hyd.length));
    hyd.forEach(([x, z], i) => { m4.compose(v.set(x, 0, z), q.setFromEuler(e.set(0, r() * 6, 0)), one); im.setMatrixAt(i, m4); col.addPoly([[x - 0.15, z - 0.15], [x + 0.15, z - 0.15], [x + 0.15, z + 0.15], [x - 0.15, z + 0.15]], false); });
    im.instanceMatrix.needsUpdate = true; scene.add(im);
    const signPoleMat = new THREE.MeshStandardMaterial({ color: 0x8f969b, metalness: 0.7, roughness: 0.4 });
    const stops = D.O.filter(([x, z]) => inPlay(x, z, 30));
    const sp = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.035, 0.035, 2.6, 6).translate(0, 1.3, 0), signPoleMat, Math.max(1, stops.length + D.Q.length));
    const octG = new THREE.CircleGeometry(0.38, 8).rotateZ(Math.PI / 8); octG.translate(0, 2.3, 0.04);
    const so = new THREE.InstancedMesh(octG, new THREE.MeshStandardMaterial({ map: stopTexture(), roughness: 0.4, emissive: 0x220000, side: THREE.DoubleSide }), Math.max(1, stops.length));
    let k = 0;
    stops.forEach(([x, z], i) => { const nr = nearestRoad(roads, x, z, ['res', 'ter', 'sec', 'pri', 'unc', 'ser']); const ang = nr.dir ? Math.atan2(nr.dir[0], nr.dir[1]) + (r() < 0.5 ? 0 : Math.PI) : 0; m4.compose(v.set(x, 0, z), q.setFromEuler(e.set(0, ang, 0)), one); sp.setMatrixAt(k++, m4); so.setMatrixAt(i, m4); col.addPoly([[x - 0.06, z - 0.06], [x + 0.06, z - 0.06], [x + 0.06, z + 0.06], [x - 0.06, z + 0.06]], false); });
    const busG = new THREE.PlaneGeometry(0.45, 0.6).translate(0, 2.25, 0.04);
    const busSign = (() => { const c = document.createElement('canvas'); c.width = 64; c.height = 86; const g = c.getContext('2d'); g.fillStyle = '#e8e8e8'; g.fillRect(0, 0, 64, 86); g.fillStyle = '#1f3c66'; g.fillRect(4, 4, 56, 40); g.fillStyle = '#fff'; g.font = 'bold 22px Arial'; g.textAlign = 'center'; g.fillText('BUS', 32, 32); g.fillStyle = '#333'; g.font = '11px Arial'; g.fillText('STOP', 32, 62); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
    const bs = new THREE.InstancedMesh(busG, new THREE.MeshStandardMaterial({ map: busSign, roughness: 0.5, side: THREE.DoubleSide }), Math.max(1, D.Q.length));
    D.Q.forEach(([x, z], i) => { const nr = nearestRoad(roads, x, z); const ang = nr.dir ? Math.atan2(nr.dir[0], nr.dir[1]) : 0; m4.compose(v.set(x, 0, z), q.setFromEuler(e.set(0, ang, 0)), one); sp.setMatrixAt(k++, m4); bs.setMatrixAt(i, m4); });
    sp.count = k; for (const m of [sp, so, bs]) { m.instanceMatrix.needsUpdate = true; scene.add(m); }
  }
  return { poles };
}

// City street trees: duplicates share an address point, so spread them along the frontage
export function cityTrees(col, onRoad, rng) {
  const raw = CITY_TREES.split(';').map(s => s.split(',').map(Number)); const groups = new Map();
  for (const t of raw) { const k = t[0] + ',' + t[1]; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(t); }
  const out = [];
  for (const [k, arr] of groups) {
    const [x0, z0] = arr[0]; const x = x0 / 2, z = z0 / 2;
    arr.forEach((t, i) => {
      let px = x, pz = z;
      if (i > 0 || col.isBlocked(px, pz)) { for (let tries = 0; tries < 20; tries++) { const a = rng() * 6.283, d = 2.5 + rng() * (3 + arr.length * 1.2); const cx = x + Math.cos(a) * d, cz = z + Math.sin(a) * d; if (!col.isBlocked(cx, cz) && !onRoad(cx, cz) && !out.some(o => (o[0] - cx) ** 2 + (o[1] - cz) ** 2 < 6)) { px = cx; pz = cz; break; } } }
      if (col.isBlocked(px, pz)) return;
      out.push([px, pz, t[2], t[3], i > 0 ? 1 : 0]);
    });
  }
  return out;
}
