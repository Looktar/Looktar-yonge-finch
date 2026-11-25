import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { Kit, ensureKit, loft, chamferBox, lathe, sideExtrude, sectionExtrude, tube, roundRect, bez, polygon } from './kit.js';
import { kitMaterial } from './surf.js';

// Viewmodels built from real-proportion side profiles, extruded with bevels.
// Gun space: -Z toward the muzzle, +Y up, +X to the shooter's right, metres.

function noiseCanvas(size, f) { const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d'); const d = g.createImageData(size, size); for (let i = 0; i < size * size; i++) { const v = f(i % size, (i / size) | 0); d.data[i * 4] = v[0]; d.data[i * 4 + 1] = v[1]; d.data[i * 4 + 2] = v[2]; d.data[i * 4 + 3] = 255; } g.putImageData(d, 0, 0); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; }
let MATS = null;
function mats() {
  if (MATS) return MATS;
  const rough = noiseCanvas(128, () => { const v = 120 + Math.random() * 70; return [v, v, v]; });
  const camo = noiseCanvas(128, (x, y) => { const n = Math.sin(x * 0.11 + Math.sin(y * 0.07) * 3) + Math.sin(y * 0.13 + Math.cos(x * 0.05) * 2); const k = n > 0.9 ? [62, 60, 48] : n > -0.2 ? [74, 76, 60] : n > -1.1 ? [54, 58, 47] : [44, 42, 36]; const j = Math.random() * 10; return [k[0] + j, k[1] + j, k[2] + j]; });
  camo.colorSpace = THREE.SRGBColorSpace; camo.repeat.set(5, 5);
  const knit = noiseCanvas(64, (x, y) => { const v = 40 + ((x + y) % 4 < 2 ? 12 : 0) + Math.random() * 8; return [v, v, v + 2]; }); knit.colorSpace = THREE.SRGBColorSpace; knit.repeat.set(4, 4);
  MATS = {
    metal: new THREE.MeshStandardMaterial({ color: 0x17191b, roughness: 0.42, metalness: 0.65, roughnessMap: rough, envMapIntensity: 1.3 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x2a2c2e, roughness: 0.3, metalness: 0.85, envMapIntensity: 1.5 }),
    poly: new THREE.MeshStandardMaterial({ color: 0x1c1d1e, roughness: 0.78, metalness: 0.0, roughnessMap: rough }),
    fde: new THREE.MeshStandardMaterial({ color: 0x6a5c44, roughness: 0.72, metalness: 0.0, roughnessMap: rough }),
    wood: new THREE.MeshStandardMaterial({ color: 0x4a2c18, roughness: 0.55, metalness: 0.0 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x101010, roughness: 0.95 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x0a1418, roughness: 0.05, metalness: 0.9, transparent: true, opacity: 0.55, envMapIntensity: 2 }),
    brass: new THREE.MeshStandardMaterial({ color: 0xb08a3c, roughness: 0.3, metalness: 1.0 }),
    shell: new THREE.MeshStandardMaterial({ color: 0x8a1a14, roughness: 0.5, metalness: 0.1 }),
    glove: new THREE.MeshStandardMaterial({ color: 0x23241f, roughness: 0.92, map: knit }),
    knuckle: new THREE.MeshStandardMaterial({ color: 0x141412, roughness: 0.6 }),
    sleeve: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, map: camo }),
  };
  for (const k of ['metal', 'poly', 'fde', 'glove', 'steel']) wetGun(MATS[k], k === 'glove' ? 90 : 150);
  return MATS;
}

// extrude a side profile (u = forward, v = up) to a given width, centred on x
function prof(pts, width, bevel = 0.0025, holes = []) {
  const sh = new THREE.Shape(pts.map(([u, v]) => new THREE.Vector2(u, v)));
  for (const h of holes) sh.holes.push(new THREE.Path(h.map(([u, v]) => new THREE.Vector2(u, v))));
  const g = new THREE.ExtrudeGeometry(sh, { depth: Math.max(0.001, width - bevel * 2), bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: 2, curveSegments: 6 });
  g.translate(0, 0, -(width - bevel * 2) / 2); g.rotateY(Math.PI / 2); // shape x(u) -> -z
  return g;
}
const cylZ = (r0, r1, u0, u1, v, seg = 16, x = 0) => { const g = new THREE.CylinderGeometry(r1, r0, u1 - u0, seg); g.rotateX(-Math.PI / 2); g.translate(x, v, -(u0 + u1) / 2); return g; };
const boxU = (w, h, u0, u1, v, x = 0, r = 0) => { const g = r ? new RoundedBoxGeometry(w, h, u1 - u0, 2, r) : new THREE.BoxGeometry(w, h, u1 - u0); g.translate(x, v, -(u0 + u1) / 2); return g; };
const M = (geoms, mat) => { const m = new THREE.Mesh(mergeGeometries(geoms.map(g => g.index ? g.toNonIndexed() : g)), mat); m.frustumCulled = false; return m; };

function reticleTex() { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,60,40,1)'); gr.addColorStop(0.12, 'rgba(255,40,30,0.9)'); gr.addColorStop(0.3, 'rgba(255,20,10,0.15)'); gr.addColorStop(1, 'rgba(255,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); }
let RET = null;
let MARK = null;
function markTex() {
  if (MARK) return MARK; const c = document.createElement('canvas'); c.width = 512; c.height = 100; const g = c.getContext('2d');
  g.fillStyle = 'rgba(190,192,188,0.85)'; g.font = '600 34px "Oswald", Arial, sans-serif'; g.fillText('YF-15  CAL 5.56 NATO', 8, 40);
  g.font = '500 24px Arial, sans-serif'; g.fillText('SN 0417-NY  ·  NORTH YORK ARMS', 8, 78); g.fillText('SAFE  SEMI  AUTO', 340, 40);
  MARK = new THREE.CanvasTexture(c); MARK.colorSpace = THREE.SRGBColorSpace; MARK.anisotropy = 4; return MARK;
}
// rain droplets beaded on the gun after the shower: cellular dots in object space, glossy and slightly domed
function wetGun(mat, size = 140) {
  mat.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vOp;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvOp = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vOp; float gDrop; vec3 gDn;
      float dh(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      { vec3 q = vOp * ${size.toFixed(1)}; vec3 c = floor(q); vec3 f = fract(q) - 0.5; float h = dh(c); vec3 o = vec3(dh(c + 1.3), dh(c + 2.7), dh(c + 4.1)) - 0.5;
        vec3 d = f - o * 0.5; float r = 0.08 + 0.14 * dh(c + 7.7); float dist = length(d); gDrop = step(0.72, h) * (1.0 - smoothstep(r * 0.7, r, dist)); gDn = d / max(r, 1e-3);
        roughnessFactor = mix(roughnessFactor, 0.28, gDrop); diffuseColor.rgb *= mix(1.0, 0.8, gDrop); }`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      normal = normalize(normal + (viewMatrix * vec4(gDn, 0.0)).xyz * gDrop * 0.6);`);
  };
  mat.customProgramCacheKey = () => 'wetgun' + size;
  return mat;
}

// ---------- hands ----------
// gloved fist built from lofts (Saltline's way): pillow palm, four fingers wrapping a vertical grip phalanx by
// phalanx, thumb over the index finger, rubber knuckle guards, cuff with a hook-and-loop strap.
// Same local frame as before: grip along y, palm on the +x side (right hand), fingers curl across -z.
function kitHand(side, curl = 1) {
  const K = kmats(), k = new Kit(), sx = side;
  // palm: a flattened loft from the wrist (+z, low) to the knuckle line (-z)
  k.add(loft([[sx * 0.003, -0.012, 0.034], [sx * 0.004, -0.004, 0.012], [sx * 0.003, 0.0, -0.012], [sx * 0.001, 0.0, -0.03]], [[0.016, 0.034], [0.017, 0.042], [0.016, 0.044], [0.014, 0.042]], 14, { up: [1, 0, 0] }), K.glove);
  // fingers: index (top) to little (bottom); each wraps around the grip in front of the palm
  const fy = [0.03, 0.01, -0.01, -0.03], fr = [0.0098, 0.0102, 0.0096, 0.0086], fl = [1, 1.06, 1.0, 0.86];
  for (let i = 0; i < 4; i++) {
    const y = fy[i], r = fr[i], L = fl[i] * (0.85 + 0.15 * curl);
    const path = [[sx * 0.002, y, -0.03], [-sx * 0.012 * L, y + 0.001, -0.046], [-sx * 0.03 * L, y, -0.046 * (0.7 + 0.3 * L)], [-sx * 0.041 * L, y - 0.001, -0.03 * L], [-sx * 0.043 * L, y - 0.002, -0.013 * L]];
    k.add(loft(path, [[r, r * 0.92], [r * 0.98, r * 0.9], [r * 0.92, r * 0.86], [r * 0.86, r * 0.8], [r * 0.8, r * 0.74]], 10, { up: [0, 1, 0] }), K.glove);
    k.add(chamferBox(0.008, 0.013, 0.012, 0.003), K.rub, { at: [sx * 0.012, y, -0.036], rot: [0, -sx * 0.5, 0], ao: 0.9 }); // knuckle guard
  }
  // thumb: from the side of the palm, over the index finger
  k.add(loft([[-sx * 0.006, 0.03, 0.012], [-sx * 0.016, 0.044, -0.004], [-sx * 0.03, 0.05, -0.02], [-sx * 0.042, 0.047, -0.03]], [[0.013, 0.012], [0.011, 0.0105], [0.0098, 0.0092], [0.0088, 0.0082]], 10, { up: [0, 0, 1] }), K.glove);
  // cuff and strap
  k.add(loft([[sx * 0.004, -0.03, 0.04], [sx * 0.004, -0.05, 0.035], [sx * 0.004, -0.075, 0.03]], [[0.022, 0.03], [0.024, 0.031], [0.025, 0.032]], 14, { up: [1, 0, 0], caps: false }), K.glove);
  k.add(chamferBox(0.052, 0.014, 0.064, 0.004), K.rub, { at: [sx * 0.004, -0.046, 0.036], rot: [0.1, 0, 0], ao: 0.85 });
  const g = k.build('hand'); g.userData.side = side; return g;
}

// ---------- arms: lofted sleeves (Saltline's hands and arms are lofted rings) ----------
// starts at the glove cuff (taken from the placed hand's matrix), swells along the forearm, folds at the elbow and
// runs on toward the shoulder (off screen); a darker cuff band and a hook-and-loop tab where it meets the glove
// arm as a child of its hand, so it follows the hand during reloads (rigid, like Saltline's unskinned arms)
function armOn(hand, elbow, shoulder) { const a = kitArm(hand, elbow, shoulder); hand.updateMatrix(); a.applyMatrix4(hand.matrix.clone().invert()); hand.add(a); }
function kitArm(hand, elbow, shoulder) {
  const K = kmats(), k = new Kit(); hand.updateMatrix();
  const side = hand.userData.side || 1;
  const W = new THREE.Vector3(side * 0.004, -0.072, 0.032).applyMatrix4(hand.matrix), E = new THREE.Vector3(...elbow), S = new THREE.Vector3(...shoulder);
  const P = (a, b, t) => a.clone().lerp(b, t);
  const dirW = E.clone().sub(W).normalize(), W0 = W.clone().addScaledVector(dirW, -0.012);
  const pts = [W0, W, P(W, E, 0.3), P(W, E, 0.6), P(W, E, 0.82), E.clone(), P(E, S, 0.14), P(E, S, 0.3), P(E, S, 0.55)];
  const r = [0.034, 0.037, 0.045, 0.049, 0.054, 0.05, 0.057, 0.053, 0.058]; // folds: the radius dips and swells near the elbow
  k.add(loft(pts.map(v => v.toArray()), r.map(x => [x, x * 0.92]), 14, { up: [0, 1, 0], caps: true }), K.sleeve);
  const C1 = W.clone().addScaledVector(dirW, 0.03);
  k.add(loft([W0.toArray(), W.toArray(), C1.toArray()], [[0.039, 0.036], [0.041, 0.038], [0.04, 0.037]], 14, { up: [0, 1, 0], caps: false }), K.glove); // cuff band
  const tab = C1.clone().addScaledVector(new THREE.Vector3(0, 1, 0), 0.038);
  k.add(chamferBox(0.03, 0.008, 0.04, 0.003), K.rub, { at: tab.toArray(), rot: [0, Math.atan2(dirW.x, dirW.z), 0] });
  return k.build('arm');
}

// ---------- AR-15 style carbine with holographic sight, built as a Saltline-style part list ----------
// u = distance forward of the receiver's rear face (gun -Z), v = up, x = right. Every part is a bevelled primitive
// with its own AO tint and edge-wear weight; parts are merged per material (one draw call each).
let KM = null;
function kmats() {
  if (KM) return KM;
  KM = {
    anod: kitMaterial('anod', { scale: 9, wear: 0.9, normal: 0.15, wearColor: 0x7d8186, drops: 150, envMapIntensity: 1.2 }),
    park: kitMaterial('park', { scale: 11, wear: 0.7, normal: 0.2, wearColor: 0x6f7173, drops: 150, envMapIntensity: 1.3 }),
    fde: kitMaterial('poly', { color: 0x7a6748, scale: 10, normal: 0.45, wear: 0.5, wearColor: 0x9c8a68, wearRough: 0.55, wearMetal: 0, drops: 150 }),
    blk: kitMaterial('poly', { color: 0x2a2a2b, scale: 10, normal: 0.5, wear: 0.4, wearColor: 0x454546, wearRough: 0.55, wearMetal: 0 }),
    rub: kitMaterial('rubber', { scale: 10, wear: 0 }),
    hole: new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.9, metalness: 0 }), // fake recesses
    glove: kitMaterial('cloth', { color: 0x24251f, scale: 14, wear: 0, normal: 0.8 }),
    sleeve: kitMaterial('cloth', { color: 0x2a2c24, scale: 9, wear: 0, normal: 0.6 }),
    lens: new THREE.MeshStandardMaterial({ color: 0xc9d2d6, roughness: 0.15, metalness: 0.2, emissive: 0x1a1d1f }),
  };
  return KM;
}
export function buildRifle() {
  const m = mats(), K = kmats(), kit = new Kit(), magKit = new Kit();
  const B = (w, h, u0, u1, v, x = 0, o = {}) => kit.add(chamferBox(w, h, u1 - u0, o.c ?? Math.min(w, h, u1 - u0) * 0.18), o.mat || K.anod, { at: [x, v, -(u0 + u1) / 2], rot: o.rot, ao: o.ao ?? 1, edge: o.edge ?? 1 });
  const Lz = (prof, x, v, mat, o = {}) => kit.add(lathe(prof, o.seg || 20), mat, { at: [x, v, 0], ao: o.ao ?? 1 }); // along the bore
  const Lx = (prof, x, v, u, mat, o = {}) => kit.add(lathe(prof, o.seg || 16), mat, { at: [x, v, -u], rot: [0, Math.sign(x || 1) * -Math.PI / 2, 0], ao: o.ao ?? 1 }); // pointing out of the side
  // --- upper receiver ---
  kit.add(sideExtrude([[0, 0], [0.19, 0], [0.19, 0.05], [0.172, 0.056], [0.022, 0.056], [0, 0.048]], 0.027, 0.0025), K.anod);
  B(0.0016, 0.017, 0.074, 0.136, 0.031, 0.0133, { mat: K.hole, edge: 0 }); // ejection port
  B(0.0022, 0.011, 0.08, 0.13, 0.031, 0.0118, { mat: K.park, ao: 0.55 }); // bolt carrier seen through it
  kit.add(chamferBox(0.0016, 0.018, 0.068, 0.0005), K.anod, { at: [0.0155, 0.0115, -0.105], rot: [0, 0, 0.5], ao: 0.85 }); // dust cover, swung open
  Lz([[0, 0.07], [0.0016, 0.07], [0.0016, 0.14], [0, 0.14]], 0.0136, 0.021, K.park, { seg: 8 }); // its hinge rod
  B(0.009, 0.016, 0.136, 0.156, 0.043, 0.0165, { c: 0.003 }); // brass deflector
  B(0.012, 0.014, 0.004, 0.034, 0.038, 0.017, { c: 0.003 }); // forward-assist housing
  Lz([[0, 0.0], [0.0068, 0.0], [0.0072, 0.003], [0.0072, 0.012], [0.0064, 0.0135], [0.0064, 0.016], [0.0072, 0.0175], [0.0072, 0.024], [0, 0.026]], 0.022, 0.038, K.park, { seg: 18 }); // forward assist plunger
  B(0.048, 0.008, -0.014, 0.006, 0.051, 0, { c: 0.002 }); B(0.012, 0.007, -0.012, 0.004, 0.051, 0.027, { c: 0.002 }); // charging handle + latch
  // --- lower receiver ---
  kit.add(sideExtrude([[0.005, 0], [0.19, 0], [0.19, -0.02], [0.176, -0.024], [0.174, -0.08], [0.102, -0.08], [0.098, -0.03], [0.04, -0.03], [0.005, -0.022]], 0.025, 0.0022), K.anod);
  B(0.031, 0.008, 0.096, 0.18, -0.077, 0, { c: 0.003 }); // flared magwell lip
  kit.add(sideExtrude([[0.035, -0.03], [0.1, -0.03], [0.1, -0.05], [0.04, -0.052], [0.035, -0.045]], 0.012, 0.0015, [roundRect(0.043, -0.047, 0.094, -0.033, 0.004)]), K.anod); // trigger guard
  kit.add(sideExtrude(bez([0.064, -0.033], [0.058, -0.045], [0.068, -0.05], 6).concat([[0.072, -0.049], [0.066, -0.033]]), 0.006, 0.001), K.park); // trigger
  for (const u of [0.012, 0.172]) for (const sx of [1, -1]) Lx([[0, 0], [0.0052, 0], [0.0052, 0.0012], [0.0042, 0.002], [0, 0.002]], sx * 0.0125, -0.011, u, K.park, { seg: 14 }); // takedown / pivot pins
  Lx([[0, 0], [0.0085, 0], [0.0085, 0.0018], [0.007, 0.0028], [0, 0.0028]], -0.0125, -0.006, 0.052, K.anod); // safety selector disc
  kit.add(chamferBox(0.003, 0.006, 0.026, 0.001), K.anod, { at: [-0.0148, -0.0085, -0.044], rot: [0.5, 0, 0] }); // selector lever
  Lx([[0, 0], [0.0055, 0], [0.0055, 0.0025], [0.0045, 0.0035], [0, 0.0035]], 0.0125, -0.017, 0.104, K.park, { seg: 14 }); // magazine release
  B(0.003, 0.016, 0.1, 0.116, -0.003, -0.0135, { c: 0.001 }); // bolt catch paddle
  // --- pistol grip ---
  kit.add(sideExtrude([[0.042, -0.026], [0.012, -0.026], [-0.03, -0.125], [-0.024, -0.134], [0.012, -0.133], [0.024, -0.12], [0.014, -0.1], [0.024, -0.086], [0.04, -0.048]], 0.031, 0.0055, [], 3), K.blk);
  // --- magazine (its own mesh: it drops out on reload) ---
  { const front = bez([0.17, -0.078], [0.172, -0.16], [0.21, -0.245], 12), back = bez([0.106, -0.078], [0.11, -0.16], [0.142, -0.238], 12).reverse();
    magKit.add(sideExtrude(front.concat([[0.212, -0.256], [0.14, -0.25]], back), 0.0225, 0.0028, [], 3), K.fde);
    for (let i = 0; i < 4; i++) { const v = -0.088 - i * 0.008; magKit.add(chamferBox(0.0245, 0.0035, 0.06, 0.001), K.fde, { at: [0, v, -0.139 - i * 0.0009], ao: 0.9 }); } // grip ribs
    magKit.add(chamferBox(0.028, 0.012, 0.082, 0.004), K.fde, { at: [0, -0.255, -0.176], rot: [-0.14, 0, 0] }); // floor plate
    magKit.add(chamferBox(0.0236, 0.003, 0.05, 0.001), K.hole, { at: [0, -0.15, -0.136], rot: [-0.08, 0, 0], ao: 0.5, edge: 0 }); // window slot (fake)
  }
  // --- free-float M-LOK handguard: hollow octagon with slots and a front cap ---
  const hv = 0.014, hr = 0.0315, ap = hr * Math.cos(Math.PI / 8);
  kit.add(sectionExtrude(polygon(8, hr, Math.PI / 8), 0.19, 0.505, 0.0022, [polygon(8, hr - 0.0035, Math.PI / 8)]), K.anod, { at: [0, hv, 0] });
  for (const ang of [0, Math.PI, -Math.PI / 4, -3 * Math.PI / 4, Math.PI / 4, 3 * Math.PI / 4]) for (let i = 0; i < 6; i++) {
    if ((ang === Math.PI / 4 || ang === 3 * Math.PI / 4) && i % 2) continue;
    const u = 0.225 + i * 0.046; kit.add(chamferBox(0.0016, 0.0074, 0.032, 0.0006), K.hole, { at: [Math.cos(ang) * (ap - 0.0004), hv + Math.sin(ang) * (ap - 0.0004), -(u + 0.016)], rot: [0, 0, ang], edge: 0 });
  }
  Lz([[hr * 0.98, 0.503], [hr * 1.02, 0.503], [hr * 1.02, 0.511], [0.012, 0.511], [0.012, 0.506]], 0, hv, K.anod, { seg: 8 }); // end cap
  for (const u of [0.24, 0.45]) for (const sx of [1, -1]) Lx([[0, 0], [0.0035, 0], [0.0035, 0.0012], [0, 0.0016]], sx * (ap + 0.0002), hv, u, K.park, { seg: 10 }); // barrel-nut screws
  Lx([[0.006, 0], [0.0085, 0], [0.0085, 0.003], [0.006, 0.003]], -(ap + 0.0002), hv - 0.008, 0.21, K.park, { seg: 16 }); // QD sling cup
  // --- Picatinny rail: base, 49 teeth, cross slots ---
  B(0.021, 0.0055, 0.004, 0.5, 0.0595, 0, { c: 0.0012 });
  for (let i = 0; i < 49; i++) { const u = 0.008 + i * 0.01; B(0.0212, 0.0034, u, u + 0.0052, 0.0637, 0, { c: 0.0008, edge: 0.35 }); }
  // --- barrel and muzzle brake ---
  Lz([[0, 0.19], [0.0098, 0.19], [0.0098, 0.52], [0.0088, 0.53], [0.0088, 0.598], [0, 0.598]], 0, hv, K.park);
  Lz([[0.0088, 0.596], [0.0112, 0.596], [0.012, 0.6], [0.012, 0.658], [0.0112, 0.666], [0.0062, 0.666], [0.0055, 0.662], [0.0055, 0.64]], 0, hv, K.park, { seg: 24 }); // brake with bore
  Lz([[0.0088, 0.592], [0.0118, 0.592], [0.0118, 0.597], [0.0088, 0.597]], 0, hv, K.park, { seg: 18 }); // crush washer
  for (let i = 0; i < 3; i++) for (const sx of [1, -1]) B(0.0014, 0.0068, 0.61 + i * 0.016, 0.62 + i * 0.016, hv, sx * 0.0115, { mat: K.hole, edge: 0 }); // side ports
  // --- holographic sight: base, body, arched hood (a frame tube), glass, buttons, battery cap, mount lever ---
  const dotV = 0.106;
  B(0.034, 0.012, 0.058, 0.176, 0.0715, 0, { c: 0.002 });
  B(0.04, 0.02, 0.064, 0.176, 0.086, 0, { c: 0.004 });
  kit.add(sectionExtrude(roundRect(-0.0225, 0.078, 0.0225, 0.134, 0.007), 0.07, 0.172, 0.0022, [roundRect(-0.0172, 0.092, 0.0172, 0.127, 0.0045)]), K.anod);
  Lz([[0, 0.168], [0.0085, 0.168], [0.0085, 0.184], [0.0078, 0.186], [0, 0.186]], 0.0, 0.085, K.anod, { seg: 22 }); // battery cap (front)
  for (let k = 0; k < 6; k++) Lz([[0.0082, 0.1705 + k * 0.0025], [0.0089, 0.1712 + k * 0.0025], [0.0082, 0.172 + k * 0.0025]], 0, 0.085, K.anod, { seg: 22 }); // knurl rings
  B(0.009, 0.009, 0.072, 0.082, 0.082, 0.021, { mat: K.rub, c: 0.002 }); B(0.009, 0.009, 0.085, 0.095, 0.082, 0.021, { mat: K.rub, c: 0.002 }); // buttons
  kit.add(chamferBox(0.005, 0.009, 0.034, 0.0015), K.park, { at: [-0.0215, 0.07, -0.12], rot: [0.12, 0, 0] }); // cross-bolt lever
  for (const u of [0.08, 0.16]) Lx([[0, 0], [0.004, 0], [0.004, 0.0018], [0.0028, 0.003], [0, 0.003]], 0.017, 0.07, u, K.park, { seg: 12 }); // mount screws
  { const pane = new THREE.PlaneGeometry(0.034, 0.035); pane.translate(0, (0.092 + 0.127) / 2, -0.171); kit.add(pane, m.glass); const p2 = pane.clone(); p2.translate(0, 0, 0.098); kit.add(p2, m.glass); }
  // --- weapon light on the right flat: lathe body, knurled bezel, lens, mount, cable to a tape switch ---
  { const lx = 0.043, lv = hv - 0.004, l0 = 0.39;
    B(0.012, 0.014, l0 + 0.02, l0 + 0.06, lv, lx - 0.012, { c: 0.002 });
    Lz([[0, l0], [0.0095, l0], [0.0105, l0 + 0.004], [0.0105, l0 + 0.07], [0.0125, l0 + 0.074], [0.0128, l0 + 0.1], [0.0118, l0 + 0.103], [0.009, l0 + 0.103]], lx, lv, K.anod, { seg: 24 });
    for (let k = 0; k < 9; k++) Lz([[0.0128, l0 + 0.077 + k * 0.0025], [0.0135, l0 + 0.078 + k * 0.0025], [0.0128, l0 + 0.079 + k * 0.0025]], lx, lv, K.anod, { seg: 24 });
    const lens = new THREE.CircleGeometry(0.0092, 24); lens.rotateY(Math.PI); kit.add(lens, K.lens, { at: [lx, lv, -(l0 + 0.1015)] });
    Lz([[0, l0 - 0.012], [0.004, l0 - 0.012], [0.004, l0], [0, l0]], lx, lv, K.rub, { seg: 10 }); // tail cap
    kit.add(tube([[lx, lv, -(l0 - 0.012)], [lx + 0.004, lv - 0.006, -(l0 - 0.03)], [lx - 0.004, hv - 0.026, -(l0 - 0.06)], [0.0, hv - 0.033, -(l0 - 0.1)], [-0.02, hv - 0.026, -(l0 - 0.13)]], 0.0017, 6, 28), K.rub);
    kit.add(chamferBox(0.006, 0.014, 0.05, 0.002), K.rub, { at: [-(ap + 0.002), hv - 0.012, -(l0 - 0.15)], rot: [0, 0, -0.39] }); } // tape switch
  // --- folded back-up sights on the rail ---
  B(0.024, 0.013, 0.47, 0.492, 0.071, 0, { c: 0.002 }); B(0.024, 0.013, 0.018, 0.04, 0.071, 0, { c: 0.002 });
  // --- laser-etched markings, reticle ---
  { const mk = markTex(); for (const sx of [1, -1]) { const pl = new THREE.PlaneGeometry(0.11, 0.022); pl.rotateY(sx * Math.PI / 2); pl.translate(sx * 0.0128, -0.012, -0.12); kit.add(pl, new THREE.MeshStandardMaterial({ map: mk, transparent: true, roughness: 0.6, metalness: 0.3, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })); } }
  const g = kit.build('rifle'); g.userData.parts = kit.parts + magKit.parts;
  const mag = magKit.build('mag'); g.add(mag);
  RET = RET || reticleTex();
  const ret = new THREE.Mesh(new THREE.PlaneGeometry(0.0045, 0.0045), new THREE.MeshBasicMaterial({ map: RET, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  ret.position.set(0, dotV + 0.004, -0.16); g.add(ret);
  // hands & sleeves
  const rh = kitHand(1, 1); rh.position.set(0.019, -0.074, 0.016); rh.rotation.set(-0.4, 0, 0); g.add(rh); // finger wrap centred on the grip
  const lh = kitHand(-1, 0.95); lh.position.set(-0.012, -0.016, -0.36); lh.rotation.set(Math.PI / 2, 0, -0.55); g.add(lh); // wraps the handguard from below, fingers up the right side
  armOn(rh, [0.07, -0.29, 0.27], [0.02, -0.1, 0.58]); // right elbow tucked down and back
  armOn(lh, [-0.2, -0.26, -0.1], [-0.4, -0.1, 0.55]); // left arm reaching forward under the handguard
  g.traverse(o => o.frustumCulled = false);
  ensureKit(g);
  // reload: left-hand keyframes [t, pos, euler] (null = its home pose), gun tilt, magazine riding the hand, foley events
  g.userData.reload = { lh, keys: [[0, null], [0.12, null], [0.26, [-0.05, -0.13, -0.16], [1.0, 0.25, -1.35]], [0.3, [-0.05, -0.135, -0.16], [1.0, 0.25, -1.35]],
    [0.45, [-0.07, -0.5, -0.06], [0.7, 0.25, -1.4]], [0.58, [-0.07, -0.5, -0.06], [0.7, 0.25, -1.4]], [0.68, [-0.05, -0.135, -0.16], [1.0, 0.25, -1.35]], [0.72, [-0.05, -0.125, -0.16], [1.0, 0.25, -1.35]],
    [0.8, [-0.04, 0.005, -0.1], [1.57, 0, -1.6]], [0.86, [-0.04, 0.005, -0.1], [1.57, 0, -1.6]], [1, null]],
    gun: { t0: 0.06, t1: 0.88, roll: 0.35, pitch: 0.22, yaw: 0.3, dx: -0.07, dy: 0.09 }, magHand: [0.29, 0.72, [-0.05, -0.135, -0.16]], ev: [[0.3, 'magOut'], [0.72, 'magIn'], [0.8, 'bolt']] };
  Object.assign(g.userData, { muzzle: new THREE.Vector3(0, hv, -0.67), eject: new THREE.Vector3(0.02, 0.03, -0.1), sight: new THREE.Vector3(0, dotV + 0.004, -0.12), mag, hip: new THREE.Vector3(0.2, -0.235, -0.29), hipRoll: 0.08, adsZ: -0.2, fov: 52 }); // framed like Saltline's carbine: big in the lower right, muzzle just under the crosshair
  return g;
}

// ---------- pump shotgun ----------
export function buildShotgun() {
  const m = mats(); const g = new THREE.Group();
  g.add(M([prof([[-0.01, -0.03], [0.2, -0.03], [0.2, 0.035], [0.17, 0.045], [0.02, 0.045], [-0.01, 0.03]], 0.03, 0.004)], m.metal));
  g.add(M([cylZ(0.0115, 0.0115, 0.2, 0.7, 0.024, 16), cylZ(0.011, 0.011, 0.2, 0.6, -0.008, 14), boxU(0.008, 0.006, 0.2, 0.7, 0.037), cylZ(0.003, 0.003, 0.69, 0.7, 0.042, 6)], m.steel));
  const pump = []; pump.push(prof([[0.26, -0.03], [0.45, -0.03], [0.45, 0.012], [0.26, 0.012]], 0.04, 0.006)); for (let u = 0.275; u < 0.44; u += 0.02) pump.push(boxU(0.043, 0.003, u, u + 0.008, -0.009));
  const pumpM = M(pump, m.wood); g.add(pumpM);
  g.add(M([prof([[0.0, 0.03], [-0.31, 0.022], [-0.32, 0.015], [-0.32, -0.095], [-0.305, -0.103], [-0.11, -0.056], [-0.05, -0.048], [0.0, -0.03]], 0.036, 0.006)], m.wood));
  g.add(M([boxU(0.04, 0.1, -0.335, -0.318, -0.015, 0, 0.004)], m.rubber));
  g.add(M([prof([[0.035, -0.03], [0.1, -0.03], [0.1, -0.05], [0.04, -0.052], [0.035, -0.045]], 0.012, 0.0015, [roundRect(0.043, -0.047, 0.094, -0.033, 0.004)])], m.metal));
  const rh = kitHand(1, 1); rh.position.set(0.019, -0.045, 0.045); rh.rotation.set(-1.1, 0, 0); g.add(rh);
  const lh = kitHand(-1, 0.95); lh.position.set(-0.014, -0.03, -0.35); lh.rotation.set(Math.PI / 2, 0, -0.55); g.add(lh);
  armOn(rh, [0.07, -0.27, 0.28], [0.02, -0.1, 0.58]);
  armOn(lh, [-0.2, -0.26, -0.08], [-0.4, -0.1, 0.55]);
  g.traverse(o => o.frustumCulled = false);
  ensureKit(g);
  const P = [[-0.03, -0.075, -0.13], [1.2, 0.2, -1.1]], Q = [[-0.08, -0.42, 0.0], [0.8, 0.2, -1.2]];
  const sgReload = { lh, keys: [[0, null], [0.08, Q[0], Q[1]], [0.2, P[0], P[1]], [0.3, Q[0], Q[1]], [0.42, P[0], P[1]], [0.52, Q[0], Q[1]], [0.64, P[0], P[1]], [0.76, null], [1, null]],
    gun: { t0: 0.04, t1: 0.78, roll: -0.45, pitch: 0.1, yaw: 0.25, dx: -0.04, dy: 0.03 }, pump: [0.82, 0.96], ev: [[0.2, 'shell'], [0.42, 'shell'], [0.64, 'shell'], [0.84, 'rack']] };
  g.userData = { reload: sgReload, muzzle: new THREE.Vector3(0, 0.024, -0.71), eject: new THREE.Vector3(0.02, 0.02, -0.12), sight: new THREE.Vector3(0, 0.05, -0.2), pump: pumpM, hip: new THREE.Vector3(0.15, -0.16, -0.42), adsZ: -0.24, fov: 58 };
  return g;
}

// ---------- polymer-frame pistol ----------
export function buildPistol() {
  const m = mats(); const g = new THREE.Group();
  const slide = []; slide.push(prof([[-0.005, 0.012], [0.18, 0.012], [0.186, 0.02], [0.186, 0.042], [0.178, 0.048], [0.0, 0.048], [-0.005, 0.042]], 0.025, 0.003));
  for (let i = 0; i < 7; i++) slide.push(boxU(0.026, 0.026, 0.004 + i * 0.006, 0.0065 + i * 0.006, 0.031));
  slide.push(boxU(0.006, 0.006, 0.17, 0.176, 0.051), boxU(0.018, 0.007, 0.005, 0.014, 0.051));
  const slideM = M(slide, m.metal); g.add(slideM);
  g.add(M([cylZ(0.006, 0.006, 0.18, 0.19, 0.03, 10)], m.steel));
  g.add(M([prof([[0.17, 0.012], [0.17, 0.0], [0.11, -0.002], [0.1, -0.03], [0.06, -0.03], [0.035, -0.002], [0.02, -0.004], [-0.02, -0.12], [0.008, -0.126], [0.03, -0.12], [0.045, -0.04], [0.05, -0.004], [-0.005, 0.0], [-0.005, 0.012]], 0.024, 0.003, [roundRect(0.062, -0.026, 0.1, -0.006, 0.004)])], m.poly));
  const mag = M([boxU(0.022, 0.012, -0.02, 0.03, -0.124, 0, 0.003)], m.poly); g.add(mag);
  const rh = kitHand(1, 1); rh.position.set(0.02, -0.06, 0.014); rh.rotation.set(-0.3, 0, 0); g.add(rh);
  const lh = kitHand(-1, 1); lh.position.set(-0.03, -0.07, 0.0); lh.rotation.set(-0.3, 0.3, 0.2); g.add(lh);
  armOn(rh, [0.1, -0.24, 0.22], [0.12, -0.08, 0.5]);
  armOn(lh, [-0.13, -0.25, 0.2], [-0.3, -0.08, 0.5]);
  g.traverse(o => o.frustumCulled = false);
  ensureKit(g);
  const pReload = { lh, keys: [[0, null], [0.14, null], [0.32, [-0.05, -0.42, 0.06], [-0.6, 0.3, 0.4]], [0.45, [-0.01, -0.2, 0.02], [-0.3, 0.3, 0.2]], [0.56, [-0.01, -0.165, 0.01], [-0.3, 0.3, 0.2]], [0.68, null], [1, null]],
    gun: { t0: 0.05, t1: 0.9, roll: 0.2, pitch: 0.2, yaw: 0.15, dx: -0.02, dy: 0.02 }, magHide: [0.12, 0.42], magHand: [0.42, 0.56, [-0.01, -0.165, 0.01]], slide: [0.72, 0.86], ev: [[0.12, 'magOut'], [0.56, 'magIn'], [0.74, 'rack']] };
  g.userData = { reload: pReload, muzzle: new THREE.Vector3(0, 0.03, -0.195), eject: new THREE.Vector3(0.015, 0.04, -0.06), sight: new THREE.Vector3(0, 0.055, -0.02), slide: slideM, mag, hip: new THREE.Vector3(0.12, -0.13, -0.36), adsZ: -0.26, fov: 60 };
  return g;
}

// ---------- muzzle flash & casings ----------
export function flashTextures() {
  const star = document.createElement('canvas'); star.width = star.height = 128; const g = star.getContext('2d'); g.translate(64, 64);
  for (let i = 0; i < 9; i++) { g.rotate(Math.PI * 2 / 9); const L = 40 + Math.random() * 24; const gr = g.createLinearGradient(0, 0, L, 0); gr.addColorStop(0, 'rgba(255,240,200,1)'); gr.addColorStop(0.5, 'rgba(255,170,60,0.7)'); gr.addColorStop(1, 'rgba(255,90,20,0)'); g.fillStyle = gr; g.beginPath(); g.moveTo(0, -4); g.lineTo(L, 0); g.lineTo(0, 4); g.fill(); }
  const rg = g.createRadialGradient(0, 0, 0, 0, 0, 24); rg.addColorStop(0, 'rgba(255,255,230,1)'); rg.addColorStop(1, 'rgba(255,160,60,0)'); g.fillStyle = rg; g.fillRect(-64, -64, 128, 128);
  const side = document.createElement('canvas'); side.width = 128; side.height = 32; const s = side.getContext('2d'); const sg = s.createLinearGradient(0, 0, 128, 0); sg.addColorStop(0, 'rgba(255,240,200,1)'); sg.addColorStop(0.4, 'rgba(255,160,50,0.8)'); sg.addColorStop(1, 'rgba(255,80,10,0)'); s.fillStyle = sg; s.beginPath(); s.moveTo(0, 8); s.quadraticCurveTo(64, 0, 128, 16); s.quadraticCurveTo(64, 32, 0, 24); s.fill();
  return { star: new THREE.CanvasTexture(star), side: new THREE.CanvasTexture(side) };
}
export function makeFlash(tex) {
  const g = new THREE.Group(); const mk = (t) => new THREE.MeshBasicMaterial({ map: t, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  const star = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.16), mk(tex.star)); g.add(star);
  for (const r of [0, Math.PI / 2]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.06).translate(0.11, 0, 0), mk(tex.side)); p.rotation.set(r, -Math.PI / 2, 0); p.rotateY(0); g.add(p); }
  g.children[1].rotation.set(0, Math.PI / 2, 0); g.children[2].rotation.set(Math.PI / 2, Math.PI / 2, 0);
  g.traverse(o => o.frustumCulled = false); g.visible = false; return g;
}
export function casingGeo(kind) { return kind === 1 ? new THREE.CylinderGeometry(0.0105, 0.0105, 0.065, 10) : new THREE.CylinderGeometry(0.0048, 0.0048, kind === 2 ? 0.019 : 0.045, 8); }
export { mats };
