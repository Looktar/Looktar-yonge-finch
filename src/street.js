import * as THREE from 'three';
import { jerseyKit, coneKit, drumKit, hydrantKit, binKit, benchKit, newsboxKit, utilityPoleKit } from './props.js';
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
    if (parts.length) { const m = new THREE.Mesh(mergeGeometries(parts), new THREE.MeshStandardMaterial({ color: 0xb4b4ad, roughness: 0.62, polygonOffset: true, polygonOffsetFactor: -6 })); m.renderOrder = 4; scene.add(m); }
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
    const parts = [], pil = []; const mat = new THREE.MeshStandardMaterial({ color: 0x6a7076, roughness: 0.45, metalness: 0.55 });
    for (const s of D.C) { const p = s.p; if (p.length < 3) continue; const h = s.a ? Math.max(3.2, +s.a * 3.6) : 4.2;
      // a solid slab with fascia edges (two bare planes read as floating boards)
      const sh = new THREE.Shape(p.map(q2 => new THREE.Vector2(q2[0], q2[1])));
      const g = new THREE.ExtrudeGeometry(sh, { depth: 0.32, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 1 });
      g.rotateX(Math.PI / 2); g.translate(0, h + 0.32, 0); parts.push(g.toNonIndexed());
      for (let i = 0; i < p.length; i += Math.max(1, Math.floor(p.length / 6))) { pil.push(new THREE.BoxGeometry(0.22, h, 0.22).translate(p[i][0], h / 2, p[i][1])); col.addPoly([[p[i][0] - 0.12, p[i][1] - 0.12], [p[i][0] + 0.12, p[i][1] - 0.12], [p[i][0] + 0.12, p[i][1] + 0.12], [p[i][0] - 0.12, p[i][1] + 0.12]], false); } }
    if (parts.length) { const m = new THREE.Mesh(mergeGeometries(parts.map(g => { g.deleteAttribute('uv'); return g; })), mat); m.castShadow = m.receiveShadow = true; scene.add(m); scene.add(new THREE.Mesh(mergeGeometries(pil.map(g => g.toNonIndexed())), mat)); }
  }
  // ---- utility poles (wood) + local power lines ----
  const wireMat = new THREE.LineBasicMaterial({ color: 0x0b0c0d, transparent: true, opacity: 0.85 });
  const poles = D.p.filter(([x, z]) => inPlay(x, z, 40));
  {
    const pl = poles.map(([x, z]) => { const nr = nearestRoad(roads, x, z); const ang = nr.dir ? Math.atan2(nr.dir[0], nr.dir[1]) + Math.PI / 2 : r() * 6; col.addPoly([[x - 0.18, z - 0.18], [x + 0.18, z - 0.18], [x + 0.18, z + 0.18], [x - 0.18, z + 0.18]], false); return [x, z, ang]; });
    scene.add(utilityPoleKit().instanced(pl, 'utilityPoles'));
    const w = [];
    for (const s of D.l) { const p = s.p; if (!p.some(q2 => inPlay(q2[0], q2[1], 60))) continue; for (let i = 0; i < p.length - 1; i++) { const a = p[i], b = p[i + 1]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 2 || L > 90) continue; const nx = -(b[1] - a[1]) / L, nz = (b[0] - a[0]) / L;
      for (const [o, h] of [[-1.05, 10.5], [1.05, 10.5], [0, 10.52], [0, 9.0]]) catenary([a[0] + nx * o, a[1] + nz * o], [b[0] + nx * o, b[1] + nz * o], h, h, 0.25 + L * 0.012, 8, w); } }
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
    const hl = hyd.map(([x, z]) => { const nr = nearestRoad(roads, x, z); const a = nr.foot ? Math.atan2(nr.foot[0] - x, nr.foot[1] - z) + Math.PI : r() * 6; col.addPoly([[x - 0.15, z - 0.15], [x + 0.15, z - 0.15], [x + 0.15, z + 0.15], [x - 0.15, z + 0.15]], false); return [x, z, a]; });
    scene.add(hydrantKit().instanced(hl, 'hydrants')); // pumper outlet faces the street
    // sidewalk furniture on Yonge / Finch: grey-and-green City of Toronto bins, benches, newspaper boxes
    {
      const spots = [];
      for (const rd of roads) {
        if (rd.t !== 'pri' && rd.t !== 'sec') continue;
        for (let i = 0; i < rd.p.length - 1; i++) {
          const a = rd.p[i], b = rd.p[i + 1]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); const tx = (b[0] - a[0]) / L, tz = (b[1] - a[1]) / L;
          for (let s = 6 + r() * 20; s < L - 4; s += 28 + r() * 30) for (const side of [-1, 1]) {
            if (r() < 0.45) continue;
            const off = (rd.w || 12) / 2 + 1.1; const x = a[0] + tx * s - tz * off * side, z = a[1] + tz * s + tx * off * side;
            const ox = x - tz * 2.2 * side, oz = z + tx * 2.2 * side; // a little further out: another carriageway there means this is a median
            if (!inPlay(x, z, 0) || col.isBlocked(x, z) || onRoad(x, z) || onRoad(ox, oz) || spots.some(o => (o[0] - x) ** 2 + (o[1] - z) ** 2 < 36)) continue;
            spots.push([x, z, Math.atan2(tx, tz) + (side > 0 ? Math.PI / 2 : -Math.PI / 2), r()]);
          }
        }
      }
      const kinds = [[binKit, 0.5], [benchKit, 0.8], [newsboxKit, 1.01]];
      let lo = 0;
      for (const [kit, hi] of kinds) {
        const sel = spots.filter(sp => sp[3] >= lo && sp[3] < hi); lo = hi; if (!sel.length) continue;
        sel.forEach(([x, z]) => col.addPoly([[x - 0.35, z - 0.35], [x + 0.35, z - 0.35], [x + 0.35, z + 0.35], [x - 0.35, z + 0.35]], false));
        scene.add(kit().instanced(sel.map(([x, z, a]) => [x, z, a + Math.PI]), 'furniture')); // fronts face the road
      }
    }
    const signPoleMat = new THREE.MeshStandardMaterial({ color: 0x8f969b, metalness: 0.7, roughness: 0.4 });
    const stops = D.O.filter(([x, z]) => inPlay(x, z, 30));
    const sp = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.035, 0.035, 2.6, 6).translate(0, 1.3, 0), signPoleMat, Math.max(1, stops.length + D.Q.length));
    const octG = new THREE.CircleGeometry(0.38, 8).rotateZ(Math.PI / 8); octG.translate(0, 2.3, 0.04);
    const so = new THREE.InstancedMesh(octG, new THREE.MeshStandardMaterial({ map: stopTexture(), roughness: 0.4, emissive: 0x220000, side: THREE.DoubleSide }), Math.max(1, stops.length));
    let k = 0;
    stops.forEach(([x, z], i) => { const nr = nearestRoad(roads, x, z, ['res', 'ter', 'sec', 'pri', 'unc', 'ser']); const ang = nr.dir ? Math.atan2(nr.dir[0], nr.dir[1]) + (r() < 0.5 ? 0 : Math.PI) : 0; m4.compose(v.set(x, 0, z), q.setFromEuler(e.set(0, ang, 0)), one); sp.setMatrixAt(k++, m4); so.setMatrixAt(i, m4); col.addPoly([[x - 0.06, z - 0.06], [x + 0.06, z - 0.06], [x + 0.06, z + 0.06], [x - 0.06, z + 0.06]], false); });
    const busG = new THREE.PlaneGeometry(0.45, 0.6).translate(0, 2.25, 0.04);
    const busSign = (() => { const c = document.createElement('canvas'); c.width = 64; c.height = 86; const g = c.getContext('2d'); g.fillStyle = '#f2f2f0'; g.fillRect(0, 0, 64, 86); g.fillStyle = '#da251d'; g.fillRect(0, 0, 64, 34); g.fillStyle = '#fff'; g.font = 'bold 24px Arial'; g.textAlign = 'center'; g.fillText('TTC', 32, 26); g.fillStyle = '#da251d'; g.font = 'bold 12px Arial'; g.fillText('STOP', 32, 54); g.fillStyle = '#222'; g.font = '10px Arial'; g.fillText('36 FINCH W', 32, 74); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
    const bs = new THREE.InstancedMesh(busG, new THREE.MeshStandardMaterial({ map: busSign, roughness: 0.5, side: THREE.DoubleSide }), Math.max(1, D.Q.length));
    D.Q.forEach(([x, z], i) => { const nr = nearestRoad(roads, x, z); const ang = nr.dir ? Math.atan2(nr.dir[0], nr.dir[1]) : 0; m4.compose(v.set(x, 0, z), q.setFromEuler(e.set(0, ang, 0)), one); sp.setMatrixAt(k++, m4); bs.setMatrixAt(i, m4); });
    sp.count = k; for (const m of [sp, so, bs]) { m.instanceMatrix.needsUpdate = true; scene.add(m); }
    // TTC glass shelters at the stops on arterials: steel frame, glass sides and back, a lit ad panel at one end
    const sh = [], shGlass = [], shAd = [];
    for (const [x, z] of D.Q) {
      const nr = nearestRoad(roads, x, z, ['pri', 'sec']); if (!nr.road || !nr.foot || nr.d > (nr.road.w || 12) / 2 + 6) continue;
      let ax = x - nr.foot[0], az = z - nr.foot[1]; const L = Math.hypot(ax, az) || 1; ax /= L; az /= L; // away from the road
      const ang = Math.atan2(nr.dir[0], nr.dir[1]); const cx = x + ax * 1.6, cz = z + az * 1.6;
      const put = (g, list) => { g.rotateY(ang); if ((-Math.sin(ang) * ax - Math.cos(ang) * az) > 0) g.rotateY(0); g.translate(cx, 0, cz); list.push(g.toNonIndexed()); };
      // local frame: +z along the road, +x across; back wall on the side away from the road
      const bx = Math.sign(Math.cos(ang) * ax - Math.sin(ang) * az) || 1;
      for (const [px, pz] of [[-0.7, -1.8], [-0.7, 1.8], [0.7, -1.8], [0.7, 1.8]]) put(new THREE.BoxGeometry(0.06, 2.4, 0.06).translate(px, 1.2, pz), sh);
      put(new THREE.BoxGeometry(1.6, 0.08, 3.8).translate(0, 2.42, 0), sh);
      put(new THREE.BoxGeometry(0.02, 2.0, 3.6).translate(bx * 0.7, 1.15, 0), shGlass);
      put(new THREE.BoxGeometry(1.4, 2.0, 0.02).translate(0, 1.15, -1.8), shGlass);
      put(new THREE.BoxGeometry(1.4, 1.75, 0.08).translate(0, 1.1, 1.8), shAd);
    }
    if (sh.length) {
      scene.add(new THREE.Mesh(mergeGeometries(sh), new THREE.MeshStandardMaterial({ color: 0x5c6166, metalness: 0.7, roughness: 0.4 })));
      scene.add(new THREE.Mesh(mergeGeometries(shGlass), new THREE.MeshStandardMaterial({ color: 0x9fb4b8, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.28, depthWrite: false })));
      const ac = document.createElement('canvas'); ac.width = 256; ac.height = 320; const ag = ac.getContext('2d');
      const gr = ag.createLinearGradient(0, 0, 0, 320); gr.addColorStop(0, '#c8442f'); gr.addColorStop(1, '#5a1630'); ag.fillStyle = gr; ag.fillRect(0, 0, 256, 320);
      ag.fillStyle = '#ffffff'; ag.font = 'bold 40px "Helvetica Neue", Arial, sans-serif'; ag.fillText('WINTER', 24, 70); ag.fillText('IS COMING', 24, 116);
      ag.font = '22px "Helvetica Neue", Arial, sans-serif'; ag.fillText('Parkas & boots — 40% off', 24, 160); ag.fillStyle = '#f6d36b'; ag.fillRect(24, 250, 150, 44); ag.fillStyle = '#5a1630'; ag.font = 'bold 22px Arial'; ag.fillText('SHOP NOW', 40, 280);
      const at = new THREE.CanvasTexture(ac); at.colorSpace = THREE.SRGBColorSpace;
      scene.add(new THREE.Mesh(mergeGeometries(shAd), new THREE.MeshStandardMaterial({ map: at, emissiveMap: at, emissive: 0xffffff, emissiveIntensity: 0.55, roughness: 0.3 })));
    }
  }
  // ---- construction clutter (Yonge & Finch has had road / TTC work for years): concrete Jersey barriers in short
  // runs along the curb, orange cones, and a few tall plastic barrels with reflective bands ----
  {
    const B = [], Cn = [], Dr = [];
    for (const rd of roads) {
      if (rd.t !== 'pri' && rd.t !== 'sec') continue;
      for (let i = 0; i < rd.p.length - 1; i++) {
        const a = rd.p[i], b = rd.p[i + 1]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 8) continue; const tx = (b[0] - a[0]) / L, tz = (b[1] - a[1]) / L;
        for (let s0 = 10 + r() * 20; s0 < L - 10; s0 += 45 + r() * 60) {
          if (r() < 0.55) continue; const side = r() < 0.5 ? -1 : 1, off = (rd.w || 12) / 2 - 0.5, n = 2 + Math.floor(r() * 4);
          const x0 = a[0] + tx * s0 - tz * off * side, z0 = a[1] + tz * s0 + tx * off * side; if (!inPlay(x0, z0, 0) || Math.hypot(x0 - 0, z0 - 92) > 260) continue;
          const ang = Math.atan2(tx, tz);
          for (let k = 0; k < n; k++) { const x = x0 + tx * k * 3.05, z = z0 + tz * k * 3.05; if (col.isBlocked(x, z)) break; B.push([x, z, ang + (r() - 0.5) * 0.04]); col.addPoly([[x - 0.35, z - 0.35], [x + 0.35, z - 0.35], [x + 0.35, z + 0.35], [x - 0.35, z + 0.35]], false); }
          for (let k = 0; k < 2 + Math.floor(r() * 3); k++) { const t = -2 - k * 2.2, x = x0 + tx * t - tz * 0.4 * side, z = z0 + tz * t + tx * 0.4 * side; (r() < 0.7 ? Cn : Dr).push([x, z, r() * 6]); }
        }
      }
    }
    scene.add(jerseyKit().instanced(B, 'barriers'), coneKit().instanced(Cn, 'cones'), drumKit().instanced(Dr, 'drums'));
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
