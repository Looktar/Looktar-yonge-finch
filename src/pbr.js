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

// ---- after-rain wet ground: shared by roads, sidewalks and the ground plane ----
// WET.tRefl / uTexMat come from a half-resolution planar mirror of the scene (main.js); puddles are pools of
// near-mirror water placed by world-space noise; everything else is damp (darker, smoother, sheen of the sky)
export const WET = { tRefl: { value: null }, uTexMat: { value: new THREE.Matrix4() }, uWet: { value: 1 }, uReflOn: { value: 0 } };
const WET_NOISE = `
  float wh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float wn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(wh(i), wh(i + vec2(1, 0)), f.x), mix(wh(i + vec2(0, 1)), wh(i + vec2(1, 1)), f.x), f.y); }
  float wetPud(vec2 p){ float n = wn(p * 0.16) * 0.6 + wn(p * 0.55 + 7.3) * 0.28 + wn(p * 2.1 + 3.1) * 0.12; return smoothstep(0.5, 0.555, n); }
  float wetDamp(vec2 p){ return 0.65 + 0.35 * wn(p * 0.045 + 1.7); }`;
export function wetPatch(sh, damp = '1.0', pud = '1.0') { // GLSL expressions: how much this surface holds water
  Object.assign(sh.uniforms, WET);
  sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform mat4 uTexMat; varying vec4 vRuv; varying vec3 vWw;')
    .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n{ vec4 wq = modelMatrix * vec4(transformed, 1.0); vWw = wq.xyz; vRuv = uTexMat * wq; }');
  // everything is injected just before the emissive chunk: after the material's own colour, roughness and normal
  // code (including custom overrides) and before lighting uses them
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
    uniform sampler2D tRefl; uniform float uWet, uReflOn; varying vec4 vRuv; varying vec3 vWw; float wPud, wDamp; ${WET_NOISE}`)
    .replace('#include <emissivemap_fragment>', `{
      wPud = wetPud(vWw.xz) * uWet * (${pud}); wDamp = wetDamp(vWw.xz) * uWet * (${damp});
      diffuseColor.rgb *= mix(1.0, 0.6, wDamp) * mix(1.0, 0.42, wPud);
      roughnessFactor = mix(roughnessFactor, 0.3, wDamp); roughnessFactor = mix(roughnessFactor, 0.03, wPud);
      normal = normalize(mix(normal, normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz), wPud));
    }
    #include <emissivemap_fragment>`)
    .replace('#include <opaque_fragment>', `{
      vec3 Vw = normalize(cameraPosition - vWw); float fres = 0.03 + 0.97 * pow(1.0 - clamp(Vw.y, 0.0, 1.0), 5.0);
      vec2 off = normal.xy * 0.035 * (1.0 - wPud);
      vec3 refl = uReflOn > 0.5 ? texture2DProj(tRefl, vRuv + vec4(off * vRuv.w, 0.0, 0.0)).rgb : vec3(0.0);
      float amt = uReflOn * mix(wDamp * 0.55, 1.0, wPud) * fres;
      outgoingLight = mix(outgoingLight, refl, clamp(amt, 0.0, 1.0));
    }
    #include <opaque_fragment>`);
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
    wetPatch(sh, 'mix(0.25, 0.8, gK)', '0.8 * gK'); // grass soaks it up; puddles only on the paving
  };
  return m;
}

// standard PBR material for ribbons whose uv = world metres / 7 (roads, sidewalks, parking lots)
export function ribbonMaterial(set, opts = {}) {
  // weathered asphalt and concrete are matte: the scans' roughness is for clean samples and makes the street
  // mirror the bright dusk sky at grazing angles, so only the AO channel is used and roughness is fixed high
  const k = 7 / TILE[set];
  const m = new THREE.MeshStandardMaterial(Object.assign({
    map: tex(set + '_col', true, k), normalMap: tex(set + '_nor', false, k),
    roughness: 0.93, metalness: 0, normalScale: new THREE.Vector2(1, 1), envMapIntensity: 0.4,
  }, opts));
  const wk = set === 'road' ? ['1.0', '1.0'] : set === 'walk' ? ['0.8', '0.7'] : ['0.25', '0.0'];
  m.onBeforeCompile = sh => wetPatch(sh, wk[0], wk[1]);
  m.customProgramCacheKey = () => 'wet' + set;
  return m;
}
