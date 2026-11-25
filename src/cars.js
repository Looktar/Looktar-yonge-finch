// Procedural cars lofted from cross-sections (front is +z, ground at y = 0).
// Each station along the car is a rounded rectangle whose top follows the real side profile
// (bumper, hood, windshield, roof, rear glass, deck) and whose upper part leans in (tumblehome).
// Triangles are split by height / position into painted body, glass and black trim so the instance
// colour only tints the paint.
import * as THREE from 'three';

// side profiles: [z, top y] control points, linearly interpolated, smoothed by the sampling
const KINDS = {
  sedan: {
    L: 4.7, W: 1.84, base: 2.8, tyre: 0.33, belt: 0.96, cabin: [-1.35, 1.02], pillarB: -0.2, doors: [1.05, -0.2, -1.3], tops: [1.0, 2.05, -1.42, -2.05],
    top: [[-2.35, 0.62], [-2.3, 0.86], [-2.05, 0.98], [-1.45, 1.0], [-0.95, 1.4], [0.25, 1.44], [1.0, 1.0], [1.95, 0.9], [2.3, 0.74], [2.35, 0.5]],
  },
  suv: {
    L: 4.75, W: 1.92, base: 2.85, tyre: 0.37, belt: 1.12, cabin: [-2.2, 1.25], pillarB: -0.3, doors: [1.22, -0.3, -1.45], tops: [1.25, 2.12, -2.6, -2.6],
    top: [[-2.38, 0.7], [-2.35, 1.1], [-2.28, 1.72], [0.55, 1.76], [1.3, 1.17], [2.1, 1.06], [2.36, 0.86], [2.38, 0.55]],
  },
  hatch: {
    L: 4.3, W: 1.8, base: 2.65, tyre: 0.32, belt: 0.98, cabin: [-1.95, 0.95], pillarB: -0.4, doors: [0.95, -0.4, -1.35], tops: [0.95, 1.9, -2.6, -2.6],
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
  const NS = 48, NR = 20; // stations along the car, points around each section (dense enough for a smooth A-pillar line)
  const P = [], rings = [];
  for (let s = 0; s < NS; s++) {
    const z = -hl + K.L * s / (NS - 1);
    const end = Math.abs(z) / hl; const plan = 1 - 0.1 * Math.pow(end, 4); // rounded nose and tail in plan
    const top = profile(K.top, z), hw = hw0 * plan;
    // wheel arches: the bottom of the section lifts over each axle so the tyres show from the side
    let ybs = yb; for (const az of [K.base / 2, -K.base / 2]) { const dz = Math.abs(z - az) / (K.tyre + 0.1); if (dz < 1) ybs = Math.max(ybs, yb + (K.tyre * 2.05 - yb) * Math.sqrt(1 - dz * dz)); }
    const ring = [];
    for (let k = 0; k < NR; k++) {
      // rounded rectangle via superellipse, k = 0 at the bottom centre going round
      const a = (k / NR) * Math.PI * 2 - Math.PI / 2; const c = Math.cos(a), sn = Math.sin(a);
      const ex = 0.22, ey = 0.3; // roundness
      let x = Math.sign(c) * Math.pow(Math.abs(c), ex) * hw;
      let y = ybs + (top - ybs) * (0.5 + 0.5 * Math.sign(sn) * Math.pow(Math.abs(sn), ey));
      if (y > K.belt) { const t = (y - K.belt) / Math.max(0.05, top - K.belt); x *= 1 - 0.17 * t; } // tumblehome
      ring.push(P.length / 3); P.push(x, y, z);
    }
    rings.push(ring);
  }
  // end caps
  const capF = P.length / 3; P.push(0, (yb + profile(K.top, hl)) / 2, hl);
  const capR = P.length / 3; P.push(0, (yb + profile(K.top, -hl)) / 2, -hl);
  const tris = [], quadOf = [];
  for (let s = 0; s < NS - 1; s++) for (let k = 0; k < NR; k++) {
    const a = rings[s][k], b = rings[s][(k + 1) % NR], c = rings[s + 1][k], d = rings[s + 1][(k + 1) % NR];
    tris.push([a, b, c], [b, d, c]); quadOf.push(s * NR + k, s * NR + k); // outward: the ring runs counter-clockwise seen from the front
  }
  for (let k = 0; k < NR; k++) { tris.push([capF, rings[NS - 1][k], rings[NS - 1][(k + 1) % NR]]); tris.push([capR, rings[0][(k + 1) % NR], rings[0][k]]); }
  // classify triangles
  const parts = { body: [], glass: [], trim: [] };
  const roofTop = Math.max(...K.top.map(p => p[1]));
  // classify whole quads (both triangles together) so the window line follows the stations, not a sawtooth
  const quadC = new Map();
  tris.forEach((t, ti) => { const qk = ti < quadOf.length ? quadOf[ti] : -1 - ti; const c = quadC.get(qk) || [0, 0, 0, 0]; for (const i of t) { c[0] += P[i * 3]; c[1] += P[i * 3 + 1]; c[2] += P[i * 3 + 2]; c[3]++; } quadC.set(qk, c); });
  for (let ti = 0; ti < tris.length; ti++) {
    const t = tris[ti]; const qc = quadC.get(ti < quadOf.length ? quadOf[ti] : -1 - ti); const cy = qc[1] / qc[3], cz = qc[2] / qc[3];
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
  // details: mirrors, door handles, black bumpers + grille, plates, wheel-arch liners, lights
  const fz = hl - 0.06, rz = -hl + 0.05;
  const headY = profile(K.top, hl - 0.25) - 0.1, tailY = profile(K.top, -hl + 0.2) - 0.12;
  const B = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z).toNonIndexed();
  const mirror = [-1, 1].flatMap(sx => [B(0.05, 0.05, 0.08, sx * (hw0 * 0.86 + 0.03), K.belt + 0.03, K.cabin[1] - 0.22), B(0.17, 0.1, 0.06, sx * (hw0 * 0.92 + 0.07), K.belt + 0.07, K.cabin[1] - 0.25)]);
  const handles = [-1, 1].flatMap(sx => [0.35, -0.75].map(z => B(0.02, 0.025, 0.14, sx * (hw0 * 0.97), K.belt - 0.06, z)));
  const bump = [B(K.W * 0.9, 0.17, 0.12, 0, yb + 0.12, hl - 0.03), B(K.W * 0.9, 0.17, 0.12, 0, yb + 0.12, -hl + 0.03)]; // lower bumper fascias
  const grille = B(K.W * 0.46, 0.13, 0.04, 0, headY - 0.05, fz + 0.01);
  const sideSkirt = [-1, 1].map(sx => B(0.04, 0.08, K.base - K.tyre * 2.4, sx * hw0 * 0.99, yb + 0.07, 0));
  // arch liners: dark half-tubes inside each wheel opening so you never see through the body
  const liners = [];
  for (const az of [K.base / 2, -K.base / 2]) for (const sx of [-1, 1]) { const c = new THREE.CylinderGeometry(K.tyre + 0.07, K.tyre + 0.07, 0.3, 14, 1, true, 0, Math.PI); c.rotateZ(Math.PI / 2); c.rotateX(Math.PI / 2); c.rotateX(-Math.PI / 2); c.translate(sx * hw0 * 0.8, K.tyre, az); liners.push(c.toNonIndexed()); }
  const trimAll = mergeGeoms([trim, ...mirror, ...handles, ...bump, grille, ...sideSkirt, ...liners]);
  const head = mergeGeoms([-1, 1].map(sx => B(0.42, 0.11, 0.06, sx * hw0 * 0.62, headY, fz)));
  const tail = mergeGeoms([B(hw0 * 1.6, 0.1, 0.06, 0, tailY, rz)]);
  const plate = mergeGeoms([B(0.52, 0.13, 0.02, 0, yb + 0.15, hl + 0.035), B(0.52, 0.13, 0.02, 0, tailY - 0.2, -hl - 0.025)]);
  const wb = K.base / 2, wx = hw0 * 0.84;
  return { body, glass, trim: trimAll, head, tail, plate, wheels: [[-wx, wb], [wx, wb], [-wx, -wb], [wx, -wb]], tyre: K.tyre, len: K.L, wid: K.W, seams: { doors: K.doors, tops: K.tops, hl, yb, belt: K.belt } };
}

function mergeGeoms(list) {
  const pos = [], nor = [];
  for (const g of list) { const q = g.index ? g.toNonIndexed() : g; const p = q.attributes.position.array, n = q.attributes.normal.array; for (let i = 0; i < p.length; i++) { pos.push(p[i]); nor.push(n[i]); } }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.computeBoundingSphere(); return g;
}

// car paint over a clear coat: panel gaps (door, hood, boot and bumper shut lines drawn in car space, antialiased),
// road grime sprayed on the lower body that also dulls the clear coat. One material per car kind (seam positions).
export function carPaint(seams) {
  const m = new THREE.MeshPhysicalMaterial({ roughness: 0.42, metalness: 0.3, clearcoat: 1.0, clearcoatRoughness: 0.07, envMapIntensity: 1.0 });
  const U = { uDoors: { value: new THREE.Vector3(...seams.doors) }, uTops: { value: new THREE.Vector4(...seams.tops) }, uCar: { value: new THREE.Vector3(seams.hl, seams.yb, seams.belt) } };
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vCp; varying vec3 vCn;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvCp = position; vCn = normal;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      uniform vec3 uDoors, uCar; uniform vec4 uTops; varying vec3 vCp; varying vec3 vCn; float cGap, cGrime;
      float cl(float d){ float w = fwidth(d) * 1.2; return 1.0 - smoothstep(0.003, 0.003 + w, abs(d)); }
      float ch(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
      float cn(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(ch(i), ch(i + vec3(1, 0, 0)), f.x), mix(ch(i + vec3(0, 1, 0)), ch(i + vec3(1, 1, 0)), f.x), f.y),
                   mix(mix(ch(i + vec3(0, 0, 1)), ch(i + vec3(1, 0, 1)), f.x), mix(ch(i + vec3(0, 1, 1)), ch(i + vec3(1, 1, 1)), f.x), f.y), f.z); }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
      { vec3 p = vCp, n = normalize(vCn); float side = smoothstep(0.5, 0.8, abs(n.x)), top = smoothstep(0.3, 0.6, n.y);
        float band = step(uCar.y + 0.12, p.y) * step(p.y, uCar.z + 0.02); cGap = 0.0;
        cGap = max(cGap, side * band * max(max(cl(p.z - uDoors.x), cl(p.z - uDoors.y)), cl(p.z - uDoors.z)));
        cGap = max(cGap, side * band * cl(abs(p.z) - (uCar.x - 0.36)));                                     /* fender / bumper seams */
        cGap = max(cGap, side * cl(p.y - (uCar.y + 0.17)) * step(uDoors.z, p.z) * step(p.z, uDoors.x));    /* door bottoms */
        cGap = max(cGap, top * max(max(cl(p.z - uTops.x), cl(p.z - uTops.y)), max(cl(p.z - uTops.z), cl(p.z - uTops.w))));
        float nz = cn(p * 3.0) * 0.6 + cn(p * 11.0) * 0.4;
        cGrime = (1.0 - smoothstep(0.22, 0.75, p.y + 0.25 * (nz - 0.5))) * (0.55 + 0.45 * nz);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.075, 0.066, 0.055), cGrime * 0.75) * (1.0 - 0.9 * cGap); }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      roughnessFactor = mix(roughnessFactor, 0.85, max(cGrime, cGap));`)
      .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
      material.clearcoat *= 1.0 - max(cGrime * 0.9, cGap);`);
  };
  m.customProgramCacheKey = () => 'carpaint';
  return m;
}

