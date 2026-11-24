import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

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
const roundRect = (u0, v0, u1, v1, r, n = 4) => { const p = []; const c = [[u1 - r, v1 - r, 0], [u0 + r, v1 - r, Math.PI / 2], [u0 + r, v0 + r, Math.PI], [u1 - r, v0 + r, Math.PI * 1.5]]; for (const [cu, cv, a0] of c) for (let i = 0; i <= n; i++) { const a = a0 + i / n * Math.PI / 2; p.push([cu + Math.cos(a) * r, cv + Math.sin(a) * r]); } return p; };
const bez = (a, b, c, n = 8) => { const p = []; for (let i = 0; i <= n; i++) { const t = i / n; p.push([(1 - t) ** 2 * a[0] + 2 * (1 - t) * t * b[0] + t * t * c[0], (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * b[1] + t * t * c[1]]); } return p; };
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
        vec3 d = f - o * 0.5; float r = 0.12 + 0.22 * dh(c + 7.7); float dist = length(d); gDrop = step(0.55, h) * (1.0 - smoothstep(r * 0.75, r, dist)); gDn = d / max(r, 1e-3);
        roughnessFactor = mix(roughnessFactor, 0.04, gDrop); diffuseColor.rgb *= mix(1.0, 0.75, gDrop); }`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      normal = normalize(normal + (viewMatrix * vec4(gDn, 0.0)).xyz * gDrop * 0.6);`);
  };
  mat.customProgramCacheKey = () => 'wetgun' + size;
  return mat;
}

// ---------- hands ----------
function hand(side, curl = 1) { // fist shape around a vertical grip, palm facing -x for right hand
  const m = mats(); const g = new THREE.Group();
  const palm = new THREE.Mesh(new RoundedBoxGeometry(0.03, 0.085, 0.075, 3, 0.012), m.glove); g.add(palm);
  for (let i = 0; i < 4; i++) { // fingers wrap around the front of the grip
    const f = new THREE.Group(); f.position.set(-side * 0.004, 0.03 - i * 0.021, -0.036);
    const a = new THREE.Mesh(new THREE.CapsuleGeometry(0.0095, 0.022, 4, 8), m.glove); a.rotation.z = Math.PI / 2; a.position.x = -side * 0.016; f.add(a);
    const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.0088, 0.018, 4, 8), m.glove); b.rotation.x = Math.PI / 2; b.position.set(-side * 0.036, 0, 0.012 * curl); f.add(b);
    const k = new THREE.Mesh(new RoundedBoxGeometry(0.012, 0.016, 0.01, 2, 0.003), m.knuckle); k.position.set(-side * 0.002, 0, -0.004); f.add(k);
    g.add(f);
  }
  const th = new THREE.Mesh(new THREE.CapsuleGeometry(0.01, 0.035, 4, 8), m.glove); th.position.set(-side * 0.03, 0.04, -0.01); th.rotation.set(0.4, 0, side * 0.9); g.add(th);
  const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.032, 0.04, 12), m.glove); cuff.position.set(side * 0.004, -0.06, 0.01); g.add(cuff);
  g.traverse(o => o.frustumCulled = false); return g;
}
function forearm(from, to) { // sleeve from wrist (from) to elbow (to)
  const m = mats(); const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to); const L = a.distanceTo(b);
  const geo = new THREE.CylinderGeometry(0.033, 0.043, L, 14, 4); const pos = geo.attributes.position; for (let i = 0; i < pos.count; i++) { const y = pos.getY(i); const ang = Math.atan2(pos.getZ(i), pos.getX(i)); const wr = 1 + Math.sin(ang * 3 + y * 40) * 0.05; pos.setX(i, pos.getX(i) * wr); pos.setZ(i, pos.getZ(i) * wr); } geo.computeVertexNormals();
  const me = new THREE.Mesh(geo, m.sleeve); me.position.copy(a).add(b).multiplyScalar(0.5); me.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), a.clone().sub(b).normalize()); me.frustumCulled = false; return me;
}

// ---------- AR-15 style carbine with red dot ----------
export function buildRifle() {
  const m = mats(); const g = new THREE.Group();
  // upper receiver
  g.add(M([prof([[0, 0], [0.19, 0], [0.19, 0.052], [0.165, 0.056], [0.03, 0.056], [0.0, 0.05]], 0.026)], m.metal));
  g.add(M([boxU(0.006, 0.02, 0.06, 0.14, 0.03, 0.014), cylZ(0.008, 0.008, 0.012, 0.035, 0.035, 10, 0.017)], m.steel)); // ejection port cover, forward assist
  // lower receiver with magwell and trigger guard
  g.add(M([prof([[0.005, 0], [0.19, 0], [0.19, -0.02], [0.172, -0.024], [0.172, -0.08], [0.104, -0.08], [0.1, -0.03], [0.04, -0.03], [0.005, -0.022]], 0.024),
    prof([[0.035, -0.03], [0.1, -0.03], [0.1, -0.05], [0.04, -0.052], [0.035, -0.045]], 0.012, 0.0015, [roundRect(0.043, -0.047, 0.094, -0.033, 0.004)])], m.metal));
  g.add(M([prof(bez([0.064, -0.033], [0.058, -0.045], [0.068, -0.05], 6).concat([[0.072, -0.049], [0.066, -0.033]]), 0.006, 0.001)], m.steel)); // trigger
  // pistol grip (FDE)
  g.add(M([prof([[0.042, -0.026], [0.012, -0.026], [-0.03, -0.125], [-0.022, -0.133], [0.014, -0.132], [0.024, -0.12], [0.012, -0.1], [0.04, -0.048]], 0.03, 0.004)], m.fde));
  // curved magazine (FDE polymer)
  const front = bez([0.17, -0.078], [0.172, -0.16], [0.21, -0.245], 10), back = bez([0.106, -0.078], [0.11, -0.16], [0.142, -0.238], 10).reverse();
  const mag = M([prof(front.concat([[0.212, -0.256], [0.14, -0.25]], back), 0.021, 0.003), boxU(0.026, 0.012, 0.135, 0.215, -0.254, 0, 0.004).rotateX(0)], m.fde); g.add(mag);
  // free-float handguard with M-LOK slots
  const slots = []; for (let i = 0; i < 6; i++) { const u0 = 0.215 + i * 0.047; slots.push(roundRect(u0, 0.004, u0 + 0.03, 0.016, 0.004)); slots.push(roundRect(u0, -0.022, u0 + 0.03, -0.01, 0.004)); }
  g.add(M([prof([[0.19, -0.034], [0.5, -0.034], [0.505, -0.028], [0.505, 0.05], [0.5, 0.056], [0.19, 0.056]], 0.046, 0.005, slots)], m.metal));
  // top rail with teeth
  const rail = [boxU(0.021, 0.008, 0.005, 0.5, 0.06)]; for (let u = 0.01; u < 0.495; u += 0.01) rail.push(boxU(0.021, 0.005, u, u + 0.005, 0.0665));
  g.add(M(rail, m.metal));
  // barrel, gas block, muzzle brake
  g.add(M([cylZ(0.0095, 0.0095, 0.19, 0.62, 0.016, 14), cylZ(0.0145, 0.0145, 0.60, 0.665, 0.016, 12), boxU(0.024, 0.024, 0.43, 0.46, 0.022)], m.steel));
  g.add(M([boxU(0.031, 0.004, 0.612, 0.62, 0.016), boxU(0.031, 0.004, 0.628, 0.636, 0.016), boxU(0.031, 0.004, 0.644, 0.652, 0.016)], m.rubber));
  // buffer tube + stock (FDE) + butt pad
  g.add(M([cylZ(0.016, 0.016, -0.2, 0.0, 0.024, 16)], m.metal));
  g.add(M([prof([[-0.12, 0.044], [-0.29, 0.05], [-0.3, 0.046], [-0.3, -0.07], [-0.27, -0.072], [-0.21, -0.02], [-0.13, 0.0], [-0.12, 0.004]], 0.04, 0.005)], m.fde));
  g.add(M([boxU(0.042, 0.122, -0.315, -0.298, -0.012, 0, 0.004)], m.rubber));
  // charging handle
  g.add(M([boxU(0.05, 0.008, -0.012, 0.004, 0.05, 0, 0.002)], m.metal));
  // folded back-up sights
  g.add(M([boxU(0.02, 0.012, 0.47, 0.49, 0.072), boxU(0.02, 0.012, 0.02, 0.04, 0.072)], m.metal));
  // red dot sight: mount + tube + lenses + reticle
  const dotV = 0.106, du0 = 0.07, du1 = 0.175;
  // holographic sight (EOTech-style box, as on Saltline's carbine): base with battery tray, hood over the window,
  // side buttons; the window is a thin glass pane with the reticle floating in it
  g.add(M([boxU(0.034, 0.016, 0.06, 0.175, 0.074, 0, 0.003),
    boxU(0.006, 0.05, 0.068, 0.172, dotV - 0.004, -0.0185, 0.002), boxU(0.006, 0.05, 0.068, 0.172, dotV - 0.004, 0.0185, 0.002),
    boxU(0.043, 0.007, 0.064, 0.176, dotV + 0.024, 0, 0.003),
    boxU(0.03, 0.012, 0.16, 0.176, dotV - 0.018, 0, 0.002),
    boxU(0.03, 0.012, 0.064, 0.08, dotV - 0.018, 0, 0.002)], m.metal));
  g.add(M([boxU(0.008, 0.008, 0.085, 0.097, 0.075, 0.021, 0.002), boxU(0.008, 0.008, 0.1, 0.112, 0.075, 0.021, 0.002), boxU(0.01, 0.012, 0.13, 0.15, 0.075, -0.022, 0.003)], m.rubber));
  { const pane = new THREE.PlaneGeometry(0.03, 0.034); pane.translate(0, dotV, -(du1 - 0.004)); g.add(new THREE.Mesh(pane, m.glass)); const p2 = new THREE.PlaneGeometry(0.03, 0.034); p2.translate(0, dotV, -(du0 + 0.008)); g.add(new THREE.Mesh(p2, m.glass)); }
  // weapon light on the right side of the handguard: body, knurled bezel, lens
  { const lx = 0.032, lv = 0.008, l0 = 0.39, l1 = 0.48; const parts = [cylZ(0.0115, 0.0115, l0, l1, lv, 18, lx), cylZ(0.0135, 0.0135, l1, l1 + 0.022, lv, 18, lx), boxU(0.01, 0.018, l0 + 0.02, l0 + 0.06, lv, lx - 0.012, 0.002)];
    for (let k = 0; k < 10; k++) parts.push(cylZ(0.0142, 0.0142, l1 + 0.002 + k * 0.002, l1 + 0.003 + k * 0.002, lv, 18, lx)); g.add(M(parts, m.metal));
    const lens = new THREE.CircleGeometry(0.011, 18); lens.translate(lx, lv, -(l1 + 0.0225)); g.add(new THREE.Mesh(lens, new THREE.MeshStandardMaterial({ color: 0x9aa4a8, roughness: 0.35, metalness: 0.1 }))); }
  // laser-etched markings on the lower receiver (both sides)
  { const mk = markTex(); for (const sx of [1, -1]) { const pl = new THREE.PlaneGeometry(0.11, 0.022); pl.rotateY(sx * Math.PI / 2); pl.translate(sx * 0.0125, -0.012, -0.12); g.add(new THREE.Mesh(pl, new THREE.MeshStandardMaterial({ map: mk, transparent: true, roughness: 0.6, metalness: 0.3, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }))); } }
  RET = RET || reticleTex();
  const ret = new THREE.Mesh(new THREE.PlaneGeometry(0.0045, 0.0045), new THREE.MeshBasicMaterial({ map: RET, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  ret.position.set(0, dotV, -(du1 - 0.01)); g.add(ret);
  // hands & sleeves
  const rh = hand(1); rh.position.set(0.0, -0.075, -0.0); rh.rotation.set(-0.42, 0, 0); g.add(rh);
  const lh = hand(-1, 0.9); lh.position.set(-0.04, -0.012, -0.36); lh.rotation.set(Math.PI / 2, 0, -0.35); g.add(lh);
  g.add(forearm([0.02, -0.13, 0.03], [0.1, -0.26, 0.26]));
  g.add(forearm([-0.05, -0.03, -0.29], [-0.2, -0.24, -0.02]));
  g.traverse(o => o.frustumCulled = false);
  g.userData = { muzzle: new THREE.Vector3(0, 0.016, -0.67), eject: new THREE.Vector3(0.02, 0.03, -0.1), sight: new THREE.Vector3(0, dotV, -0.12), mag, hip: new THREE.Vector3(0.235, -0.155, -0.5), hipYaw: 0.42, hipRoll: 0.1, adsZ: -0.2, fov: 52 }; // canted to show the rail and sight side-on, like Saltline's carbine
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
  const rh = hand(1); rh.position.set(0.0, -0.045, 0.03); rh.rotation.set(-1.1, 0, 0); g.add(rh);
  const lh = hand(-1, 0.9); lh.position.set(-0.04, -0.03, -0.35); lh.rotation.set(Math.PI / 2, 0, -0.35); g.add(lh);
  g.add(forearm([0.0, -0.12, 0.03], [0.1, -0.26, 0.26]));
  g.add(forearm([-0.05, -0.05, -0.28], [-0.2, -0.24, -0.02]));
  g.traverse(o => o.frustumCulled = false);
  g.userData = { muzzle: new THREE.Vector3(0, 0.024, -0.71), eject: new THREE.Vector3(0.02, 0.02, -0.12), sight: new THREE.Vector3(0, 0.05, -0.2), pump: pumpM, hip: new THREE.Vector3(0.15, -0.16, -0.42), adsZ: -0.24, fov: 58 };
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
  const rh = hand(1); rh.position.set(0.004, -0.06, 0.0); rh.rotation.set(-0.3, 0, 0); g.add(rh);
  const lh = hand(-1, 1); lh.position.set(-0.02, -0.07, -0.005); lh.rotation.set(-0.3, 0.3, 0.2); g.add(lh);
  g.add(forearm([0.02, -0.11, 0.03], [0.12, -0.22, 0.24]));
  g.add(forearm([-0.03, -0.12, 0.02], [-0.15, -0.23, 0.22]));
  g.traverse(o => o.frustumCulled = false);
  g.userData = { muzzle: new THREE.Vector3(0, 0.03, -0.195), eject: new THREE.Vector3(0.015, 0.04, -0.06), sight: new THREE.Vector3(0, 0.055, -0.02), slide: slideM, mag, hip: new THREE.Vector3(0.12, -0.13, -0.36), adsZ: -0.26, fov: 60 };
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
