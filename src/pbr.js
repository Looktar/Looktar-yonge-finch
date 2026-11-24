// Photo-scanned CC0 PBR textures (Poly Haven, see CREDITS in README) served next to index.html in tex/.
// Ground sets are 1k colour / OpenGL normal / ARM (AO, roughness, metalness); wall sets are 512 colour + normal
// packed into texture arrays so the single facade shader can pick a material per building.
import * as THREE from 'three';

const loader = new THREE.TextureLoader();
loader.setPath('tex/');
const cache = {};
export function tex(name, srgb, repeat = 1) {
  const key = name + repeat;
  if (cache[key]) return cache[key];
  const t = loader.load(name + '.jpg');
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; t.repeat.set(repeat, repeat);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return (cache[key] = t);
}
// real-world tile sizes of the scans (metres)
export const TILE = { road: 3.0, walk: 2.0, grass: 2.0, brick: 1.0, stucco: 2.0, precast: 2.71, granite: 1.8 };

// wall layers, in the order the facade shader indexes them
export const WALL_LAYERS = ['brick', 'stucco', 'precast', 'granite'];
const WS = 512;
function blank() { const t = new THREE.DataArrayTexture(new Uint8Array(4 * WALL_LAYERS.length).fill(128), 1, 1, WALL_LAYERS.length); t.needsUpdate = true; return t; }

// returns { col, nor, mean: Vector3[], ready: Promise } ; textures start as flat grey and fill in when loaded
export function wallArrays() {
  const out = { col: blank(), nor: blank(), mean: WALL_LAYERS.map(() => new THREE.Vector3(0.5, 0.5, 0.5)) };
  const load = n => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = 'tex/' + n + '.jpg'; });
  const pack = (imgs, srgb) => {
    const c = document.createElement('canvas'); c.width = c.height = WS; const g = c.getContext('2d', { willReadFrequently: true });
    const data = new Uint8Array(WS * WS * 4 * imgs.length); const means = [];
    imgs.forEach((im, i) => {
      g.clearRect(0, 0, WS, WS); g.drawImage(im, 0, 0, WS, WS); const d = g.getImageData(0, 0, WS, WS).data; data.set(d, i * WS * WS * 4);
      let r = 0, gg = 0, b = 0; for (let k = 0; k < d.length; k += 4) { r += d[k]; gg += d[k + 1]; b += d[k + 2]; } const n = d.length / 4;
      means.push([r / n / 255, gg / n / 255, b / n / 255]);
    });
    const t = new THREE.DataArrayTexture(data, WS, WS, imgs.length);
    t.format = THREE.RGBAFormat; t.type = THREE.UnsignedByteType; t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = true; t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true; return { t, means };
  };
  out.ready = Promise.all([Promise.all(WALL_LAYERS.map(n => load(n + '_col'))), Promise.all(WALL_LAYERS.map(n => load(n + '_nor')))]).then(([cs, ns]) => {
    const c = pack(cs, true), n = pack(ns, false);
    // the shader divides by the (linear) mean so the scan only adds detail and the building keeps its own colour
    c.means.forEach((m, i) => out.mean[i].set(...m.map(v => (v < 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)))));
    out.col = c.t; out.nor = n.t; return out;
  }).catch(e => { console.warn('wall textures failed', e); return out; });
  return out;
}

// ground material: photo grass and broom-finished concrete blended by a paved-area mask, both with normals,
// plus a large-scale variation so the 2 m tiles do not visibly repeat
export function groundMaterial(mask) {
  const m = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0, envMapIntensity: 0.5 });
  const U = {
    uGc: { value: tex('grass_col', true) }, uGn: { value: tex('grass_nor', false) }, uGa: { value: tex('grass_arm', false) },
    uCc: { value: tex('walk_col', true) }, uCn: { value: tex('walk_nor', false) }, uCa: { value: tex('walk_arm', false) },
    uMask: { value: mask.tex }, uMaskO: { value: new THREE.Vector3(mask.x0, mask.z0, mask.size) },
  };
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vGW;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvGW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vGW; uniform sampler2D uGc, uGn, uGa, uCc, uCn, uCa, uMask; uniform vec3 uMaskO; float gK; vec3 gNts; float gRo;`)
      .replace('#include <map_fragment>', `{
        vec2 w = vec2(vGW.x, -vGW.z);
        gK = texture2D(uMask, (vGW.xz - uMaskO.xy) / uMaskO.z).r;
        vec2 ug = w / ${TILE.grass.toFixed(1)}, uc = w / ${TILE.walk.toFixed(1)};
        vec3 gc = texture2D(uGc, ug).rgb * (0.75 + 0.5 * texture2D(uGc, ug * 0.071 + 0.3).g / 0.32);
        vec3 cc = texture2D(uCc, uc).rgb * (0.86 + 0.28 * texture2D(uCc, uc * 0.083 + 0.7).r / 0.45);
        cc = mix(vec3(dot(cc, vec3(0.3, 0.55, 0.15))), cc, 0.45) * 1.05; // pale grey Toronto concrete
        // slab joints every 1.5 m in the paved areas (Toronto sidewalks / plazas)
        vec2 jw = fwidth(vGW.xz) + 1e-4; vec2 jj = abs(fract(vGW.xz / 1.5 + 0.5) - 0.5) * 1.5; float joint = 1.0 - min(smoothstep(0.0, 0.012 + jw.x, jj.x), smoothstep(0.0, 0.012 + jw.y, jj.y));
        cc *= 1.0 - 0.16 * joint * (1.0 - smoothstep(0.02, 0.1, max(jw.x, jw.y)));
        diffuseColor.rgb *= mix(gc, cc, gK);
        gNts = mix(texture2D(uGn, ug).xyz, texture2D(uCn, uc).xyz, gK) * 2.0 - 1.0;
        gRo = mix(0.75 + 0.25 * texture2D(uGa, ug).g, 0.8 + 0.2 * texture2D(uCa, uc).g, gK);
      }`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = gRo;')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        { vec3 nw = normalize(vec3(gNts.x, gNts.z, -gNts.y)); normal = normalize((viewMatrix * vec4(nw, 0.0)).xyz); }`);
  };
  return m;
}

// standard PBR material for ribbons whose uv = world metres / 7 (roads, sidewalks, parking lots)
export function ribbonMaterial(set, opts = {}) {
  // weathered asphalt and concrete are matte: the scans' roughness is for clean samples and makes the street
  // mirror the bright dusk sky at grazing angles, so only the AO channel is used and roughness is fixed high
  const k = 7 / TILE[set];
  return new THREE.MeshStandardMaterial(Object.assign({
    map: tex(set + '_col', true, k), normalMap: tex(set + '_nor', false, k),
    roughness: 0.93, metalness: 0, normalScale: new THREE.Vector2(1, 1), envMapIntensity: 0.4,
  }, opts));
}
