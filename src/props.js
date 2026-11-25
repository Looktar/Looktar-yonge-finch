// Street props as Saltline-style part lists (see kit.js / surf.js). Every builder returns a Kit centred on its
// footprint with y = 0 on the pavement; street.js instances them along the roads (one InstancedMesh per material).
import * as THREE from 'three';
import { Kit, chamferBox, lathe, sectionExtrude, tube, polygon } from './kit.js';
import { kitMaterial } from './surf.js';

let M = null;
function mats() {
  if (M) return M;
  M = {
    concrete: kitMaterial('concrete', { scale: 1.6, wear: 1, wearColor: 0xb3ada2, wearRough: 0.95, wearMetal: 0, ground: 0.22 }),
    rust: kitMaterial('paint', { color: 0x5a3a26, scale: 6, wear: 0.6, wearColor: 0x3a2618, wearRough: 0.8, wearMetal: 0.2, ground: 0 }),
    orange: kitMaterial('poly', { color: 0xff5a14, scale: 3, normal: 0.25, wear: 0.4, wearColor: 0xc8a080, wearRough: 0.7, wearMetal: 0, ground: 0.12 }),
    white: kitMaterial('poly', { color: 0xf0efe6, scale: 3, normal: 0.2, wear: 0.3, wearColor: 0xb8b4a8, wearRough: 0.6, wearMetal: 0, ground: 0 }),
    rubber: kitMaterial('rubber', { scale: 4, wear: 0, ground: 0.1 }),
    hole: new THREE.MeshStandardMaterial({ color: 0x0b0b0a, roughness: 0.95 }),
    red: kitMaterial('paint', { color: 0xa8141a, scale: 5, wear: 1, wearColor: 0x6a5a4c, wearRough: 0.7, wearMetal: 0.3, ground: 0.12 }),
    silver: kitMaterial('paint', { color: 0xb8bcbe, scale: 5, wear: 0.8, wearColor: 0x4a3a2c, wearRough: 0.7, wearMetal: 0.2 }),
    steelGrey: kitMaterial('paint', { color: 0x4a5257, scale: 3, wear: 0.9, wearColor: 0x8c8f90, wearRough: 0.35, wearMetal: 1, ground: 0.18 }),
    darkGrey: kitMaterial('paint', { color: 0x2c3134, scale: 3, wear: 0.9, wearColor: 0x7c7f80, wearRough: 0.35, wearMetal: 1, ground: 0.15 }),
    green: kitMaterial('paint', { color: 0x1e5b3a, scale: 3, wear: 1, wearColor: 0x8c8f90, wearRough: 0.35, wearMetal: 1, ground: 0.15 }),
    blue: kitMaterial('paint', { color: 0x1f4f9a, scale: 3, wear: 0.6, wearColor: 0xc0c4c8, wearRough: 0.4, wearMetal: 0 }),
    yellow: new THREE.MeshStandardMaterial({ color: 0xffc21a, roughness: 0.35, emissive: 0x3a2600 }), // retro-reflector
    glass: new THREE.MeshStandardMaterial({ color: 0x1a2226, roughness: 0.08, metalness: 0.2, envMapIntensity: 1.4 }),
  };
  return M;
}
const UP = [Math.PI / 2, 0, 0]; // lathes run along -Z; this stands them up along +Y

// ---- Ontario F-shape concrete barrier, 3.0 m ----
export function jerseyKit() {
  const m = mats(), k = new Kit();
  const sec = [[-0.3, 0], [0.3, 0], [0.3, 0.075], [0.12, 0.25], [0.085, 0.81], [-0.085, 0.81], [-0.12, 0.25], [-0.3, 0.075]];
  k.add(sectionExtrude(sec, -1.5, 1.5, 0.025), m.concrete);
  for (const z of [-0.85, 0.85]) k.add(chamferBox(0.62, 0.085, 0.36, 0.01), m.hole, { at: [0, 0.055, z], edge: 0 }); // forklift slots
  k.add(chamferBox(0.62, 0.06, 0.22, 0.008), m.hole, { at: [0, 0.03, 0], edge: 0 }); // drain scupper
  for (const z of [-1.53, 1.53]) { // steel connector loops, rusted
    k.add(tube([[0, 0.52, z], [0, 0.6, z + Math.sign(z) * 0.05], [0, 0.7, z + Math.sign(z) * 0.05], [0, 0.78, z]], 0.012, 6, 12), m.rust);
    k.add(chamferBox(0.012, 0.05, 0.09, 0.002), m.yellow, { at: [0.1, 0.7, z * 0.93], rot: [0, 0, -0.07] });
  }
  return k;
}

// ---- 71 cm traffic cone with two reflective bands on a square base ----
export function coneKit() {
  const m = mats(), k = new Kit(); const r = h => 0.14 - (0.14 - 0.032) * (h - 0.05) / 0.66;
  k.add(chamferBox(0.38, 0.034, 0.38, 0.012), m.rubber, { at: [0, 0.017, 0] });
  k.add(lathe([[0.155, 0.03], [0.15, 0.05], [r(0.06), 0.06], [r(0.7), 0.7], [0.026, 0.712], [0, 0.714]], 20), m.orange, { rot: UP });
  for (const [h0, h1] of [[0.36, 0.46], [0.52, 0.58]]) k.add(lathe([[r(h0) + 0.0025, h0], [r(h1) + 0.0025, h1]], 20), m.white, { rot: UP });
  return k;
}

// ---- channelizer drum: ribbed orange body, two white bands, lid with handle, rubber ballast ring ----
export function drumKit() {
  const m = mats(), k = new Kit(); const prof = [];
  for (let i = 0; i <= 10; i++) { const h = 0.1 + i * 0.09; prof.push([0.27 + (i % 2 ? 0.014 : 0) - h * 0.03, h]); }
  k.add(lathe([[0.2, 0.08], [0.272, 0.1], ...prof.slice(1), [0.25, 1.02], [0.23, 1.03]], 24), m.orange, { rot: UP });
  for (const [h0, h1] of [[0.55, 0.66], [0.78, 0.88]]) k.add(lathe([[0.284 - h0 * 0.03, h0], [0.284 - h1 * 0.03, h1]], 24), m.white, { rot: UP });
  k.add(lathe([[0, 1.0], [0.23, 1.0], [0.24, 1.035], [0.2, 1.05], [0, 1.045]], 24), m.orange, { rot: UP }); // lid
  k.add(chamferBox(0.2, 0.05, 0.04, 0.012), m.orange, { at: [0, 1.07, 0] });
  k.add(lathe([[0.24, 0.0], [0.38, 0.0], [0.4, 0.04], [0.38, 0.11], [0.3, 0.13], [0.25, 0.11]], 24), m.rubber, { rot: UP });
  return k;
}

// ---- Toronto fire hydrant: red barrel, silver caps with pentagon nuts, chains ----
export function hydrantKit() {
  const m = mats(), k = new Kit();
  k.add(lathe([[0.17, 0.0], [0.17, 0.035], [0.13, 0.05], [0.12, 0.09], [0.135, 0.1], [0.135, 0.13], [0.115, 0.14], [0.11, 0.56], [0.13, 0.57], [0.13, 0.6]], 20), m.red, { rot: UP });
  k.add(lathe([[0.125, 0.6], [0.12, 0.64], [0.09, 0.69], [0.045, 0.715], [0.04, 0.72]], 20), m.silver, { rot: UP }); // bonnet
  k.add(lathe([[0.024, 0.72], [0.024, 0.76], [0, 0.765]], 5), m.silver, { rot: UP }); // operating nut
  const nozzle = (x, z, r, len, rot) => {
    k.add(lathe([[r + 0.008, 0], [r + 0.008, 0.02], [r, 0.03], [r, len]], 16), m.red, { at: [x, 0.42, z], rot });
    k.add(lathe([[r + 0.012, len], [r + 0.012, len + 0.04], [r + 0.004, len + 0.05], [0, len + 0.05]], 16), m.silver, { at: [x, 0.42, z], rot });
    k.add(lathe([[0.018, len + 0.05], [0.018, len + 0.08], [0, len + 0.082]], 5), m.silver, { at: [x, 0.42, z], rot });
  };
  nozzle(0, 0, 0.032, 0.14, [0, Math.PI / 2, 0]); nozzle(0, 0, 0.032, 0.14, [0, -Math.PI / 2, 0]); // hose outlets
  nozzle(0, 0, 0.055, 0.13, [0, 0, 0]); // pumper outlet, toward the street
  for (const sx of [1, -1]) k.add(tube([[sx * 0.11, 0.56, 0.02], [sx * 0.15, 0.45, 0.05], [sx * 0.2, 0.42, 0.02]], 0.004, 5, 14), m.silver);
  return k;
}

// ---- City of Toronto litter / recycling bin ----
export function binKit() {
  const m = mats(), k = new Kit();
  k.add(chamferBox(0.6, 0.1, 0.46, 0.012), m.darkGrey, { at: [0, 0.05, 0] }); // plinth
  k.add(chamferBox(0.62, 0.92, 0.46, 0.02), m.steelGrey, { at: [0, 0.55, 0] });
  k.add(chamferBox(0.66, 0.08, 0.5, 0.025), m.darkGrey, { at: [0, 1.05, 0] }); // hood
  for (const x of [-0.15, 0.15]) {
    k.add(chamferBox(0.22, 0.1, 0.02, 0.006), m.hole, { at: [x, 0.9, 0.225], edge: 0 }); // openings
    k.add(chamferBox(0.22, 0.05, 0.006, 0.002), x < 0 ? m.darkGrey : m.blue, { at: [x, 0.8, 0.232] }); // labels
  }
  k.add(chamferBox(0.004, 0.62, 0.006, 0.001), m.hole, { at: [0, 0.48, 0.231], edge: 0 }); // door seam
  for (const x of [-0.26, 0.26]) k.add(chamferBox(0.018, 0.05, 0.012, 0.003), m.darkGrey, { at: [x, 0.6, 0.235] }); // hinges
  return k;
}

// ---- steel bench: two cast legs, five seat slats, three back slats, armrests ----
export function benchKit() {
  const m = mats(), k = new Kit();
  for (const x of [-0.78, 0.78]) {
    k.add(chamferBox(0.06, 0.44, 0.06, 0.012), m.darkGrey, { at: [x, 0.22, 0.12] });
    k.add(chamferBox(0.06, 0.82, 0.06, 0.012), m.darkGrey, { at: [x, 0.41, -0.18], rot: [-0.12, 0, 0] });
    k.add(chamferBox(0.06, 0.04, 0.48, 0.01), m.darkGrey, { at: [x, 0.43, -0.02] });
    k.add(chamferBox(0.07, 0.04, 0.4, 0.012), m.darkGrey, { at: [x, 0.66, 0.0] }); // armrest
    k.add(chamferBox(0.16, 0.012, 0.12, 0.004), m.darkGrey, { at: [x, 0.006, 0.12] }); // floor plates
  }
  for (let i = 0; i < 5; i++) k.add(chamferBox(1.74, 0.03, 0.075, 0.008), m.steelGrey, { at: [0, 0.465, 0.17 - i * 0.085] });
  for (let i = 0; i < 3; i++) k.add(chamferBox(1.74, 0.075, 0.03, 0.008), m.steelGrey, { at: [0, 0.6 + i * 0.1, -0.215 - i * 0.012], rot: [-0.12, 0, 0] });
  return k;
}

// ---- newspaper vending box on short legs ----
export function newsboxKit() {
  const m = mats(), k = new Kit();
  for (const [x, z] of [[-0.2, -0.16], [0.2, -0.16], [-0.2, 0.16], [0.2, 0.16]]) k.add(chamferBox(0.04, 0.3, 0.04, 0.006), m.darkGrey, { at: [x, 0.15, z] });
  k.add(chamferBox(0.5, 0.82, 0.42, 0.02), m.green, { at: [0, 0.71, 0] });
  k.add(chamferBox(0.52, 0.05, 0.44, 0.015), m.green, { at: [0, 1.14, 0] });
  k.add(chamferBox(0.38, 0.3, 0.01, 0.004), m.glass, { at: [0, 0.86, 0.212] }); // window
  k.add(chamferBox(0.42, 0.34, 0.012, 0.006), m.darkGrey, { at: [0, 0.86, 0.208] }); // window frame
  k.add(chamferBox(0.08, 0.12, 0.03, 0.006), m.silver, { at: [0.16, 0.6, 0.22] }); // coin box
  k.add(chamferBox(0.03, 0.006, 0.01, 0.001), m.hole, { at: [0.16, 0.63, 0.236], edge: 0 });
  k.add(chamferBox(0.16, 0.025, 0.04, 0.008), m.silver, { at: [-0.05, 0.68, 0.225] }); // handle
  return k;
}
export { polygon };
