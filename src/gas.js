// The gas station at 5571 Yonge St (OSM way 33743058, 24 h), south-east of the intersection: canopy with a
// striped fascia and LED soffit, two pump islands with dispensers / hoses / bollards, a street pylon with LED
// prices, a concrete apron and the clutter around the kiosk. Brand-neutral (no trademarked logos).
// Built as a Saltline-style part list (kit.js) in the canopy's own frame: local x along its long side.
import * as THREE from 'three';
import { Kit, chamferBox, lathe, tube } from './kit.js';
import { kitMaterial } from './surf.js';

// canopy from OSM (centre, long-side direction), footprint ~18.5 x 11 m
export const GAS = { c: [42.6, 176.2], dir: [16.0, -3.0], lot: [24, 155, 63, 197] };
const UP = [Math.PI / 2, 0, 0];

function priceTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 512; const g = c.getContext('2d');
  g.fillStyle = '#f2f2ee'; g.fillRect(0, 0, 256, 512);
  g.fillStyle = '#c8102e'; g.fillRect(0, 0, 256, 120); g.fillStyle = '#fff'; g.font = 'bold 64px Arial'; g.textAlign = 'center'; g.fillText('GAS', 128, 72); g.font = 'bold 30px Arial'; g.fillText('24 HR', 128, 108);
  const rows = [['REGULAR', '151.9'], ['MID', '165.9'], ['PREMIUM', '173.9'], ['DIESEL', '162.9']];
  rows.forEach(([n, p], i) => { const y = 140 + i * 90; g.fillStyle = '#111'; g.fillRect(14, y, 228, 78); g.fillStyle = '#e8e8e2'; g.font = 'bold 18px Arial'; g.textAlign = 'left'; g.fillText(n, 22, y + 22); g.fillStyle = '#ff8a1e'; g.font = 'bold 46px "Courier New", monospace'; g.textAlign = 'right'; g.fillText(p, 236, y + 68); });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

export function buildGasStation(col) {
  const M = {
    white: kitMaterial('satin', { color: 0xe9e9e4, scale: 2, wear: 0.3, wearColor: 0x8c8a86, wearRough: 0.6, wearMetal: 0.2, ground: 0.25 }),
    soffit: kitMaterial('satin', { color: 0xd8d8d4, scale: 2, wear: 0 }),
    red: kitMaterial('satin', { color: 0xc01c2a, scale: 2, wear: 0.2 }),
    blue: kitMaterial('satin', { color: 0x13306b, scale: 2, wear: 0.4, wearColor: 0x8c8f90 }),
    grey: kitMaterial('paint', { color: 0x8d9295, scale: 4, wear: 0.6, wearColor: 0x5a4a3a, wearRough: 0.7, wearMetal: 0.2, ground: 0.12 }),
    dark: kitMaterial('satin', { color: 0x1b1c1e, scale: 4, wear: 0.3 }),
    rubber: kitMaterial('rubber', { scale: 6, wear: 0 }),
    steel: kitMaterial('park', { scale: 6, wear: 0.5, normal: 0.3 }),
    yellow: kitMaterial('paint', { color: 0xf2b705, scale: 4, wear: 0.9, wearColor: 0x4a3a2a, wearRough: 0.7, wearMetal: 0.2, ground: 0.15 }),
    concrete: kitMaterial('concrete', { scale: 0.5, wear: 0.6, wearColor: 0xa8a39a, wearRough: 0.95, wearMetal: 0, ground: 0 }),
    screen: new THREE.MeshStandardMaterial({ color: 0x0a1418, emissive: 0x3a7a8a, emissiveIntensity: 0.6, roughness: 0.15 }),
    led: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff4e6, emissiveIntensity: 2.4, roughness: 0.4 }),
    hole: new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.9 }),
  };
  const k = new Kit(), L = 18.6, W = 11.2, Y = 4.9;
  // apron: concrete slab with saw-cut joints every 3 m
  k.add(chamferBox(L + 4, 0.06, W + 4, 0.01), M.concrete, { at: [0, 0.03, 0], edge: 0 });
  for (let x = -L / 2 - 1; x <= L / 2 + 1.01; x += 3) k.add(chamferBox(0.02, 0.005, W + 4, 0.001), M.hole, { at: [x, 0.061, 0], edge: 0 });
  for (let z = -W / 2 - 1; z <= W / 2 + 1.01; z += 3) k.add(chamferBox(L + 4, 0.005, 0.02, 0.001), M.hole, { at: [0, 0.061, z], edge: 0 });
  // canopy: deck, soffit, fascia with a red band and a blue reveal, LED panels
  k.add(chamferBox(L, 0.35, W, 0.02), M.soffit, { at: [0, Y + 0.17, 0] });
  for (const [w, d, x, z] of [[L + 0.3, 0.16, 0, W / 2 + 0.08], [L + 0.3, 0.16, 0, -W / 2 - 0.08], [0.16, W + 0.3, L / 2 + 0.08, 0], [0.16, W + 0.3, -L / 2 - 0.08, 0]]) {
    k.add(chamferBox(w, 1.0, d, 0.02), M.white, { at: [x, Y + 0.5, z] });
    k.add(chamferBox(w + 0.01, 0.3, d + 0.03, 0.01), M.red, { at: [x, Y + 0.62, z] });
    k.add(chamferBox(w + 0.01, 0.1, d + 0.03, 0.01), M.blue, { at: [x, Y + 0.08, z] });
  }
  for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) k.add(chamferBox(1.2, 0.04, 0.6, 0.008), M.led, { at: [-6.6 + i * 4.4, Y - 0.01, -3.3 + j * 3.3], edge: 0 });
  // two pump islands along x, columns on them
  const pts = [];
  for (const z of [-2.6, 2.6]) {
    k.add(chamferBox(7.2, 0.2, 1.25, 0.05), M.concrete, { at: [0, 0.1, z] });
    k.add(chamferBox(7.25, 0.06, 1.3, 0.02), M.yellow, { at: [0, 0.18, z], edge: 0.6 }); // painted curb top
    for (const x of [-3.9, 3.9]) { k.add(lathe([[0.11, 0], [0.11, 1.05], [0.07, 1.12], [0, 1.13]], 12), M.yellow, { at: [x, 0, z], rot: UP }); pts.push([x, z, 0.15]); } // bollards
    k.add(chamferBox(0.5, Y, 0.5, 0.04), M.white, { at: [0, Y / 2, z] }); pts.push([0, z, 0.3]);
    k.add(chamferBox(0.56, 1.0, 0.56, 0.03), M.blue, { at: [0, 0.7, z] }); // column cladding
    for (const x of [-2.0, 2.0]) {
      k.add(chamferBox(1.15, 1.6, 0.55, 0.04), M.grey, { at: [x, 1.0, z] }); // dispenser body
      k.add(chamferBox(1.2, 0.32, 0.6, 0.04), M.white, { at: [x, 1.96, z] }); // header
      k.add(chamferBox(1.21, 0.08, 0.61, 0.01), M.red, { at: [x, 1.86, z] });
      k.add(chamferBox(1.21, 0.06, 0.61, 0.01), M.blue, { at: [x, 2.07, z] });
      for (const s of [-1, 1]) {
        k.add(chamferBox(0.44, 0.3, 0.02, 0.01), M.screen, { at: [x - 0.18, 1.45, z + s * 0.285], edge: 0 }); // display
        k.add(chamferBox(0.2, 0.16, 0.02, 0.01), M.dark, { at: [x + 0.25, 1.45, z + s * 0.285] }); // card reader
        for (const dx of [-0.35, 0, 0.35]) {
          k.add(chamferBox(0.12, 0.2, 0.08, 0.02), M.dark, { at: [x + dx, 1.05, z + s * 0.3] }); // nozzle holster
          k.add(tube([[x + dx, 1.12, z + s * 0.32], [x + dx + 0.05, 0.6, z + s * 0.5], [x + dx * 1.3, 1.3, z + s * 0.36], [x + dx * 0.8, 1.75, z + s * 0.29]], 0.016, 6, 16), M.rubber); // hose
        }
      }
      pts.push([x, z, 0.65]);
    }
    k.add(chamferBox(0.45, 0.85, 0.45, 0.03), M.dark, { at: [-3.2, 0.62, z] }); // trash bin
    k.add(lathe([[0.15, 0], [0.18, 0.4], [0.18, 0.45], [0.16, 0.45], [0.14, 0.05], [0, 0.05]], 12), M.blue, { at: [3.2, 0.2, z], rot: UP }); // squeegee bucket
  }
  // street pylon toward Yonge (local -x end, offset to the road side)
  k.add(chamferBox(1.7, 0.5, 0.6, 0.05), M.concrete, { at: [-L / 2 - 4.5, 0.25, -W / 2 - 2.5] });
  k.add(chamferBox(1.5, 4.8, 0.36, 0.04), M.white, { at: [-L / 2 - 4.5, 2.9, -W / 2 - 2.5] });
  k.add(chamferBox(1.55, 0.25, 0.4, 0.02), M.blue, { at: [-L / 2 - 4.5, 0.62, -W / 2 - 2.5] });
  pts.push([-L / 2 - 4.5, -W / 2 - 2.5, 0.9]);
  // kiosk clutter on the +x side: ice freezer, propane cage, air machine
  k.add(chamferBox(1.6, 1.4, 0.8, 0.05), M.white, { at: [L / 2 + 2.6, 0.7, -3.5] });
  k.add(chamferBox(1.62, 0.25, 0.82, 0.02), M.blue, { at: [L / 2 + 2.6, 1.3, -3.5] });
  k.add(chamferBox(1.4, 1.6, 0.9, 0.02), M.steel, { at: [L / 2 + 2.6, 0.8, 3.8] }); pts.push([L / 2 + 2.6, -3.5, 0.9], [L / 2 + 2.6, 3.8, 0.9]);
  for (let i = 0; i < 4; i++) k.add(lathe([[0.15, 0], [0.15, 0.4], [0.06, 0.5], [0.03, 0.56], [0, 0.56]], 12), M.white, { at: [L / 2 + 2.2 + (i % 2) * 0.45, 0.06, 3.6 + Math.floor(i / 2) * 0.4], rot: UP });
  k.add(chamferBox(0.5, 1.3, 0.4, 0.05), M.red, { at: [-L / 2 - 1.5, 0.65, W / 2 + 1.6] }); pts.push([-L / 2 - 1.5, W / 2 + 1.6, 0.4]); // air / vacuum machine
  // place in the world
  const g = k.build('gasStation'); const ang = Math.atan2(GAS.dir[1], GAS.dir[0]);
  g.position.set(GAS.c[0], 0, GAS.c[1]); g.rotation.y = -ang; g.traverse(o => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } });
  // pylon face: price board on both sides
  const tex = priceTexture(), pm = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.35, roughness: 0.4 });
  for (const s of [1, -1]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 2.6), pm); p.position.set(-L / 2 - 4.5, 3.9, -W / 2 - 2.5 + s * 0.185); p.rotation.y = s > 0 ? 0 : Math.PI; g.add(p); }
  // fascia lettering on the two long sides
  const ft = (() => { const c = document.createElement('canvas'); c.width = 1024; c.height = 64; const x = c.getContext('2d'); x.fillStyle = '#ffffff'; x.font = 'bold 46px Arial'; x.textAlign = 'center'; x.fillText('GAS  ·  CONVENIENCE  ·  24 HR', 512, 48, 1000); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const fm = new THREE.MeshStandardMaterial({ map: ft, transparent: true, emissive: 0xffffff, emissiveMap: ft, emissiveIntensity: 0.3, roughness: 0.5, depthWrite: false });
  for (const s of [1, -1]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(8.0, 1.0), fm); p.position.set(0, Y + 0.62, s * (W / 2 + 0.19)); p.rotation.y = s > 0 ? 0 : Math.PI; g.add(p); }
  // colliders (world space)
  const ca = Math.cos(-ang), sa = Math.sin(-ang);
  for (const [x, z, r] of pts) { const wx = GAS.c[0] + x * ca + z * sa, wz = GAS.c[1] - x * sa + z * ca; col.addPoly([[wx - r, wz - r], [wx + r, wz - r], [wx + r, wz + r], [wx - r, wz + r]], false); }
  return g;
}
