// Street-level storefront depth (Saltline-style part lists, see kit.js): aluminium mullions / transom / head frame
// that line up with the glazing the facade shader draws (2.2 m bays in perimeter-u), stainless kick plates, a door
// with a push bar per shop unit, sign lightboxes, sloped fabric awnings with valance and arms, and the clutter of a
// strip mall: rooftop AC units, electrical meter boxes and downspouts.
import * as THREE from 'three';
import { Kit, chamferBox, lathe, sideExtrude, tube } from './kit.js';
import { kitMaterial } from './surf.js';

let M = null;
function mats() {
  if (M) return M;
  M = {
    frame: kitMaterial('satin', { color: 0x2a2724, scale: 4, wear: 0.5, wearColor: 0x8a8580, wearRough: 0.35, wearMetal: 1 }),
    steel: kitMaterial('park', { scale: 6, wear: 0.6, normal: 0.3 }),
    box: kitMaterial('satin', { color: 0x1c1d1f, scale: 3, wear: 0.4, wearColor: 0x6a6a6a }),
    unit: kitMaterial('paint', { color: 0x9da2a3, scale: 3, wear: 0.7, wearColor: 0x6a5240, wearRough: 0.7, wearMetal: 0.2 }),
    meter: kitMaterial('paint', { color: 0x7d8584, scale: 4, wear: 0.6, wearColor: 0x5a4a3a, wearRough: 0.7, wearMetal: 0.2 }),
    pipe: kitMaterial('paint', { color: 0x3b3f42, scale: 4, wear: 0.5, wearColor: 0x5a4a3a, wearRough: 0.7, wearMetal: 0.2 }),
    hole: new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.9 }),
  };
  M.awn = {}; // fabric per colour
  return M;
}
const awnMat = c => { const m = mats(); if (!m.awn[c]) m.awn[c] = kitMaterial('cloth', { color: new THREE.Color(c).getHex(), scale: 6, wear: 0, normal: 0.5, ground: 0 }); return m.awn[c]; };

// fronts: [{ e, b, sfH }] (edges facing a main street on ground-level buildings); signs / awnings as collected by
// buildCity. Edges are in world space: e.a start, (e.tx, e.tz) along, (e.nx, e.nz) outward, e.u0 perimeter offset.
export function buildStorefronts(fronts, signs, awnings, near) {
  const m = mats(), k = new Kit();
  const at = (e, s, out, y) => [e.a[0] + e.tx * s + e.nx * out, y, e.a[1] + e.tz * s + e.nz * out];
  const rotOf = e => [0, Math.atan2(e.nx, e.nz), 0]; // local +z = outward, local x = along -t (see below)
  for (const { e, b, sfH } of fronts) {
    if (!near(e.a[0], e.a[1])) continue;
    const rot = rotOf(e); const top = sfH - 0.22;
    // frame members proud of the wall by 5 cm
    k.add(chamferBox(e.L, 0.42, 0.1, 0.01), m.steel, { at: at(e, e.L / 2, 0.04, 0.21), rot }); // kick plate / sill
    k.add(chamferBox(e.L, 0.1, 0.12, 0.012), m.frame, { at: at(e, e.L / 2, 0.05, 2.6), rot }); // transom
    k.add(chamferBox(e.L, 0.14, 0.12, 0.012), m.frame, { at: at(e, e.L / 2, 0.05, top + 0.05), rot }); // head
    const off = ((2.2 - (e.u0 % 2.2)) % 2.2);
    for (let s = off; s <= e.L + 1e-3; s += 2.2) k.add(chamferBox(0.065, top - 0.42, 0.12, 0.01), m.frame, { at: at(e, s, 0.05, 0.42 + (top - 0.42) / 2), rot });
    // one door per ~7.5 m shop unit, centred on a bay: frame thickening, push bar, threshold
    const nU = Math.max(1, Math.round(e.L / 7.5));
    for (let u = 0; u < nU; u++) {
      const mid = (u + 0.5) * e.L / nU; const s = off + Math.round((mid - off) / 2.2) * 2.2 + 1.1; if (s < 1 || s > e.L - 1) continue;
      k.add(chamferBox(0.75, 0.035, 0.05, 0.008), m.steel, { at: at(e, s, 0.12, 1.02), rot }); // push bar
      for (const d of [-0.36, 0.36]) k.add(chamferBox(0.03, 0.12, 0.06, 0.006), m.steel, { at: at(e, s + d, 0.09, 1.02), rot });
      k.add(chamferBox(1.0, 0.03, 0.4, 0.008), m.steel, { at: at(e, s, 0.2, 0.015), rot }); // threshold
    }
    // a downspout at each end of the frontage on low retail
    if (b.H < 9) for (const s of [0.25, e.L - 0.25]) k.add(tube([at(e, s, 0.12, b.H + 0.2), at(e, s, 0.12, b.H - 0.3), at(e, s, 0.12, 0.35), at(e, s + (s < 1 ? 0.25 : -0.25), 0.25, 0.05)], 0.05, 8, 8), m.pipe);
  }
  // sign lightboxes (the textured sign quad sits on their face, 0.2 m out)
  for (const s of signs) {
    const e = s.e; if (!near(e.a[0], e.a[1])) continue;
    k.add(chamferBox(s.s1 - s.s0 + 0.12, s.y1 - s.y0 + 0.12, 0.19, 0.02), m.box, { at: at(e, (s.s0 + s.s1) / 2, 0.095, (s.y0 + s.y1) / 2), rot: rotOf(e) });
  }
  // awnings: sloped fabric with a valance, two steel arms (profile across the awning, extruded along the edge)
  for (const a of awnings) {
    const e = a.e; if (!near(e.a[0], e.a[1])) continue; const w = a.s1 - a.s0, mat = awnMat(a.c);
    const g = sideExtrude([[0.0, 0.0], [1.15, -0.5], [1.15, -0.78], [1.12, -0.78], [1.12, -0.53], [0.0, -0.04]], w, 0.01, [], 1);
    // sideExtrude: u -> -z, width -> x; turn so u points outward and width runs along the edge
    k.add(g, mat, { at: at(e, (a.s0 + a.s1) / 2, 0.02, a.y + 0.45), rot: [0, Math.atan2(e.nx, e.nz) + Math.PI, 0] });
    for (const d of [0.15, w - 0.15]) k.add(tube([at(e, a.s0 + d, 0.02, a.y - 0.35), at(e, a.s0 + d, 0.6, a.y - 0.05), at(e, a.s0 + d, 1.1, a.y - 0.03)], 0.015, 5, 6), m.steel);
  }
  // rooftop AC units and wall meter boxes on low retail / commercial buildings
  const done = new Set();
  for (const { e, b } of fronts) {
    if (done.has(b) || b.H > 9 || !near(e.a[0], e.a[1])) continue; done.add(b);
    const n = Math.min(4, Math.max(1, Math.round(b.A / 220)));
    for (let i = 0; i < n; i++) {
      const s = e.L * (0.2 + 0.6 * (i + 0.5) / n), p = at(e, s, -3.2 - (i % 2) * 2.2, b.H);
      k.add(chamferBox(1.25, 0.95, 0.9, 0.04), m.unit, { at: [p[0], b.H + 0.55, p[2]], rot: rotOf(e) });
      k.add(chamferBox(1.35, 0.1, 1.0, 0.02), m.steel, { at: [p[0], b.H + 0.05, p[2]], rot: rotOf(e) }); // rails
      const fan = lathe([[0.36, 0], [0.38, 0.02], [0.3, 0.03], [0, 0.03]], 18); k.add(fan, m.hole, { at: [p[0], b.H + 1.02, p[2]], rot: [Math.PI / 2, 0, 0], edge: 0 });
    }
    // meter bank on the first edge's far end, near the ground
    k.add(chamferBox(0.6, 0.75, 0.22, 0.02), m.meter, { at: at(e, e.L - 1.6, 0.11, 1.35), rot: rotOf(e) });
    k.add(tube([at(e, e.L - 1.6, 0.06, 0.95), at(e, e.L - 1.6, 0.06, 0.0)], 0.03, 6, 2), m.pipe);
  }
  const g = k.build('storefronts'); g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}
