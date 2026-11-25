// Procedural cars (front is +z, ground at y = 0), modelled on real dimensions (Camry, CR-V, Civic hatch).
// Every station along the car has the same 11-key-point cross-section: underside, lower corner, a slightly bulged
// flank, the shoulder at the belt line, then a narrower greenhouse leaning in to the roof edge and the crowned roof.
// Because the topology is the same at every station, the glass is chosen by section segment (side windows between
// belt and roof edge, windscreen / rear glass on the roof segment) and its edges run straight along the car.
import * as THREE from 'three';

const KINDS = {
  sedan: {
    L: 4.85, W: 1.84, wb: 2.82, fo: 0.97, tyre: 0.335, belt: [0.99, 0.93], yb: 0.2, crown: 0.03,
    top: [[-2.425, 0.5], [-2.42, 0.78], [-2.36, 0.95], [-2.0, 0.99], [-1.72, 1.0], [-0.95, 1.4], [-0.55, 1.445], [0.1, 1.44], [0.92, 0.93], [1.6, 0.84], [2.2, 0.75], [2.39, 0.67], [2.425, 0.5]],
    ws: [0.1, 0.92], rg: [-1.72, -0.95], side: [-1.62, 0.84], pillarB: -0.35,
  },
  suv: {
    L: 4.7, W: 1.86, wb: 2.7, fo: 0.93, tyre: 0.36, belt: [1.13, 1.08], yb: 0.24, crown: 0.03,
    top: [[-2.35, 0.62], [-2.34, 1.0], [-2.3, 1.28], [-2.12, 1.53], [-1.75, 1.62], [-0.9, 1.66], [0.45, 1.645], [1.3, 1.1], [1.9, 1.03], [2.28, 0.95], [2.35, 0.66]],
    ws: [0.45, 1.3], rg: [-2.12, -1.75], side: [-1.7, 1.2], pillarB: -0.42,
  },
  hatch: {
    L: 4.4, W: 1.8, wb: 2.7, fo: 0.9, tyre: 0.33, belt: [1.0, 0.95], yb: 0.2, crown: 0.025,
    top: [[-2.2, 0.6], [-2.18, 0.98], [-1.95, 1.12], [-1.25, 1.4], [0.0, 1.425], [0.88, 0.93], [1.6, 0.83], [2.15, 0.71], [2.2, 0.55]],
    ws: [0.0, 0.88], rg: [-1.95, -1.25], side: [-1.85, 0.82], pillarB: -0.45,
  },
};
export const CAR_KINDS = KINDS;

const sm = t => t * t * (3 - 2 * t), clamp01 = t => Math.max(0, Math.min(1, t));
function profile(pts, z) {
  if (z <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) if (z <= pts[i][0]) { const [z0, y0] = pts[i - 1], [z1, y1] = pts[i]; return y0 + (y1 - y0) * sm((z - z0) / (z1 - z0)); }
  return pts[pts.length - 1][1];
}
// key-point cross-section (right half, bottom centre -> roof centre) and how many pieces each segment is cut into
const SUB = [2, 1, 1, 2, 2, 1, 3, 1, 2, 2]; // segment i joins key i and i + 1
export const SEG = { side: 6, roofEdge: 7, roof: [8, 9] };
function section(K, z, hl, axles) {
  const t = Math.max(0, (Math.abs(z) - (hl - 0.42)) / 0.42); const hw = K.W / 2 * (0.84 + 0.16 * Math.sqrt(1 - Math.min(1, t) ** 2)); // tight rounded corners in plan: squarer nose and tail
  const top = profile(K.top, z);
  let yb = K.yb + 0.08 * sm(clamp01((Math.abs(z) - (hl - 0.4)) / 0.4)); // bumper lips rise
  for (const az of axles) { const d = Math.abs(z - az) / (K.tyre + 0.08); if (d < 1) yb = Math.max(yb, K.tyre * 2.06 * Math.sqrt(1 - d * d)); } // wheel arches
  const belt = K.belt[1] + (K.belt[0] - K.belt[1]) * clamp01((hl - z) / K.L); // rises toward the tail
  const sh = Math.max(yb + 0.12, Math.min(belt, top - 0.02)), g = Math.max(0, top - sh), cf = sm(clamp01((g - 0.03) / 0.12));
  // greenhouse narrows with height above the belt: wide at the cowl and the base of the rear glass, A / C pillars lean in
  const gw = hw * (0.9 - 0.17 * sm(clamp01(g / 0.45))), L = (a, b, k) => a + (b - a) * k;
  return [[0, yb], [hw - 0.16, yb], [hw - 0.06, yb + 0.05], [hw * 0.985, yb + Math.min(0.16, (sh - yb) * 0.3)], [hw + 0.01, yb + (sh - yb) * 0.62], [hw, sh - 0.04], [hw * 0.955, sh],
    [L(hw * 0.95, gw, cf), sh + Math.max(g - 0.07, g * 0.45)], [L(hw * 0.86, gw * 0.9, cf), top - 0.012], [L(hw * 0.45, gw * 0.5, cf), top + K.crown], [0, top + K.crown]];
}
function ring(keys) { // subdivide segments, then mirror to a closed ring; returns points and the segment id of each edge
  const half = [], segOf = [];
  for (let i = 0; i < keys.length - 1; i++) for (let s = 0; s < SUB[i]; s++) { const t = s / SUB[i]; half.push([keys[i][0] + (keys[i + 1][0] - keys[i][0]) * t, keys[i][1] + (keys[i + 1][1] - keys[i][1]) * t]); segOf.push(i); }
  half.push(keys[keys.length - 1]);
  // full ring: right half bottom->top, then left half top->bottom (skipping the shared centre points)
  const pts = half.slice(), seg = segOf.slice();
  for (let i = half.length - 2; i >= 1; i--) { pts.push([-half[i][0], half[i][1]]); seg.push(segOf[i]); }
  seg.push(segOf[0]); // closing edge (bottom centre)
  return { pts, seg };
}

export function carGeoms(kind) {
  const K = KINDS[kind], hl = K.L / 2, zf = hl - K.fo, zr = zf - K.wb, axles = [zf, zr];
  const NS = 60; const zs = []; for (let s = 0; s < NS; s++) zs.push(-hl + K.L * s / (NS - 1));
  const P = [], rings = []; let segs = null;
  for (const z of zs) { const { pts, seg } = ring(section(K, z, hl, axles)); segs = seg; const r = []; for (const [x, y] of pts) { r.push(P.length / 3); P.push(x, y, z); } rings.push(r); }
  const NR = rings[0].length;
  const capF = P.length / 3; P.push(0, (K.yb + profile(K.top, hl)) / 2 + 0.04, hl + 0.015);
  const capR = P.length / 3; P.push(0, (K.yb + profile(K.top, -hl)) / 2 + 0.04, -hl - 0.015);
  const parts = { body: [], glass: [], trim: [] };
  for (let s = 0; s < NS - 1; s++) for (let k = 0; k < NR; k++) {
    const a = rings[s][k], b = rings[s][(k + 1) % NR], c = rings[s + 1][k], d = rings[s + 1][(k + 1) % NR];
    const zc = (zs[s] + zs[s + 1]) / 2, sg = segs[k];
    let part = 'body';
    if (sg <= 1) part = 'trim'; // underside and lower corner: black plastic / shadow
    else if (sg === 2 && Math.abs(zc) > hl - 0.45) part = 'trim'; // lower bumper fascias
    else if (sg === SEG.side && zc > K.side[0] && zc < K.side[1] && Math.abs(zc - K.pillarB) > 0.055) part = 'glass'; // side windows (B pillar left painted)
    else if ((sg === SEG.roof[0] || sg === SEG.roof[1]) && ((zc > K.ws[0] && zc < K.ws[1] - 0.03) || (zc > K.rg[0] + 0.03 && zc < K.rg[1]))) part = 'glass'; // windscreen, rear glass
    parts[part].push([a, b, c], [b, d, c]);
  }
  for (let k = 0; k < NR; k++) { parts.body.push([capF, rings[NS - 1][k], rings[NS - 1][(k + 1) % NR]]); parts.body.push([capR, rings[0][(k + 1) % NR], rings[0][k]]); }
  // shared normals over the whole shell, then split by part
  const allT = [...parts.body, ...parts.glass, ...parts.trim];
  const all = new THREE.BufferGeometry(); all.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); all.setIndex(allT.flat()); all.computeVertexNormals();
  // make sure the shell faces outward (ring winding): flip if the roof normal points down
  const N = all.attributes.normal.array; const rc = rings[NS >> 1][Math.floor(NR / 2)]; const flip = N[rc * 3 + 1] < 0;
  if (flip) for (let i = 0; i < N.length; i++) N[i] = -N[i];
  const split = list => { const pos = [], nor = []; for (const t0 of list) { const t = flip ? [t0[0], t0[2], t0[1]] : t0; for (const i of t) { pos.push(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]); nor.push(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]); } } const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.computeBoundingSphere(); return g; };
  const body = split(parts.body), glass = split(parts.glass), trimShell = split(parts.trim);
  // small parts: mirrors, arch liners, lights (flush lenses on the nose / tail), plates
  const hw0 = K.W / 2, B = (w, h, d, x, y, z, rx = 0) => { const g = new THREE.BoxGeometry(w, h, d); g.rotateX(rx); g.translate(x, y, z); return g.toNonIndexed(); };
  const beltF = profile(K.top, K.ws[1] - 0.1) - 0.02;
  const mirror = [-1, 1].flatMap(sx => [B(0.04, 0.05, 0.1, sx * (hw0 * 0.93), beltF + 0.04, K.ws[1] - 0.18), B(0.16, 0.11, 0.07, sx * (hw0 * 0.98 + 0.06), beltF + 0.08, K.ws[1] - 0.2)]);
  const liners = [];
  for (const az of axles) for (const sx of [-1, 1]) { const c = new THREE.CylinderGeometry(K.tyre + 0.075, K.tyre + 0.075, 0.32, 14, 1, true, 0, Math.PI); c.rotateZ(Math.PI / 2); c.translate(sx * (hw0 - 0.17), K.tyre, az); const idx = c.index ? c.toNonIndexed() : c; const pos = idx.attributes.position; for (let i = 0; i < pos.count; i++) if (pos.getY(i) < K.tyre) pos.setY(i, K.tyre); liners.push(idx); }
  const trim = mergeGeoms([trimShell, ...mirror, ...liners]);
  const noseY = profile(K.top, hl - 0.12), tailY = profile(K.top, -hl + 0.1);
  const head = mergeGeoms([-1, 1].map(sx => B(0.38, 0.09, 0.08, sx * hw0 * 0.6, noseY - 0.06, hl - 0.06, -0.25)));
  const tail = mergeGeoms([-1, 1].map(sx => B(0.42, 0.1, 0.06, sx * hw0 * 0.62, tailY - 0.09, -hl + 0.02)));
  const plate = mergeGeoms([B(0.52, 0.13, 0.02, 0, K.yb + 0.24, hl + 0.01), B(0.52, 0.13, 0.02, 0, tailY - 0.28, -hl - 0.005)]);
  const wx = hw0 - 0.17;
  return { body, glass, trim, head, tail, plate, wheels: [[-wx, zf], [wx, zf], [-wx, zr], [wx, zr]], tyre: K.tyre, len: K.L, wid: K.W,
    seams: { doors: [K.ws[1] + 0.02, K.pillarB, K.side[0] + 0.05], tops: [K.ws[1] - 0.02, hl - 0.32, K.rg[0] - 0.02, -hl + 0.3], hl, yb: K.yb, belt: (K.belt[0] + K.belt[1]) / 2 } };
}

function mergeGeoms(list) {
  const pos = [], nor = [];
  for (const g of list) { const q = g.index ? g.toNonIndexed() : g; if (!q.attributes.normal) q.computeVertexNormals(); const p = q.attributes.position.array, n = q.attributes.normal.array; for (let i = 0; i < p.length; i++) { pos.push(p[i]); nor.push(n[i]); } }
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

