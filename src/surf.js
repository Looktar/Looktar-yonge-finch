// Procedural surfaces, after Saltline's texture families: each family is a GLSL function of a tileable uv that
// returns albedo, a tint mask, AO / roughness / metalness and a height; it is baked once at start into three
// small RGBA8 textures (albedo+tint, orm+height, normal from height). kitMaterial() then maps them triplanar in
// object space onto Kit meshes and adds edge wear from the per-vertex `kit` attribute.
import * as THREE from 'three';

const LIB = `
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
vec2 h22(vec2 p){ float a = h21(p); return vec2(a, h21(p + a * 17.1)); }
/* periodic value noise: P = cells per tile */
float vn(vec2 uv, float P){ vec2 p = uv * P, i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  float a = h21(mod(i, P)), b = h21(mod(i + vec2(1, 0), P)), c = h21(mod(i + vec2(0, 1), P)), d = h21(mod(i + vec2(1, 1), P));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y); }
float fbm(vec2 uv, float P, int oct){ float v = 0.0, a = 0.5, s = 0.0; for (int i = 0; i < 7; i++){ if (i >= oct) break; v += a * vn(uv, P); s += a; P *= 2.0; a *= 0.5; } return v / s; }
/* periodic Voronoi: x = F1 distance, y = cell id hash */
vec2 vor(vec2 uv, float P){ vec2 p = uv * P, i = floor(p), f = fract(p); float d = 9.0, id = 0.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++){ vec2 g = vec2(x, y), c = mod(i + g, P); vec2 o = h22(c); float e = length(g + o - f); if (e < d){ d = e; id = h21(c + 3.1); } }
  return vec2(d, id); }
/* thin random scratches: one segment per cell on a P x P grid, tileable */
float scratches(vec2 uv, float P, float w){ vec2 p = uv * P, i = floor(p); float s = 0.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++){ vec2 g = i + vec2(x, y), c = mod(g, P); if (h21(c + 9.7) > 0.55) continue;
    vec2 a = g + h22(c), dir = normalize(h22(c + 4.4) - 0.5), b = a + dir * (0.4 + 0.9 * h21(c + 2.2));
    vec2 pa = p - a, ba = b - a; float t = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); s = max(s, 1.0 - smoothstep(0.0, w, length(pa - ba * t))); }
  return s; }
`;

// family: out alb (linear), tint (1 = takes the material colour), ao, rough, metal, h (0..1)
const FAMILIES = {
  // black anodised aluminium / cerakote on receivers and rails: mottled near-black, fine grain, light scratches
  anod: `float m = fbm(uv, 4.0, 5), g = vn(uv, 160.0), sc = scratches(uv, 9.0, 0.018) * (0.4 + 0.6 * vn(uv, 6.0));
    alb = vec3(0.028, 0.029, 0.031) * (0.8 + 0.45 * m) + sc * 0.018; tint = 0.0; ao = 1.0;
    rough = 0.47 + 0.12 * (m - 0.5) + 0.08 * (g - 0.5) - sc * 0.2; metal = 0.22; /* anodising / cerakote: a satin, mostly dielectric coat */ h = 0.5 + 0.25 * (g - 0.5) - sc * 0.25;`,
  // parkerised / nitrided steel: barrel, pins, screws
  park: `float m = fbm(uv, 6.0, 5), g = vn(uv, 220.0), sc = scratches(uv, 7.0, 0.025);
    alb = vec3(0.04, 0.041, 0.04) * (0.75 + 0.5 * m) + sc * 0.03; tint = 0.0; ao = 1.0;
    rough = 0.47 + 0.12 * (m - 0.5) - sc * 0.25; metal = 0.75; h = 0.5 + 0.35 * (g - 0.5) - sc * 0.2;`,
  // textured polymer (grip, magazine, stock): stipple dots, takes the material colour
  poly: `vec2 v = vor(uv, 48.0); float st = 1.0 - smoothstep(0.15, 0.45, v.x), m = fbm(uv, 5.0, 4);
    alb = vec3(0.5) * (0.9 + 0.2 * m - 0.08 * st); tint = 1.0; ao = 1.0 - 0.15 * (1.0 - st);
    rough = 0.72 + 0.1 * (m - 0.5) - 0.1 * st; metal = 0.0; h = 0.35 + 0.45 * st + 0.05 * m;`,
  // rubber: buttons, pads, tyres
  rubber: `float m = fbm(uv, 8.0, 5), g = vn(uv, 200.0);
    alb = vec3(0.022) * (0.85 + 0.3 * m); tint = 0.0; ao = 1.0; rough = 0.88 + 0.08 * (g - 0.5); metal = 0.0; h = 0.5 + 0.3 * (g - 0.5);`,
  // woven fabric: gloves, sleeves, slings; takes the material colour
  cloth: `vec2 p = uv * 64.0; float wx = 0.5 + 0.5 * sin(p.x * 6.2832 * 1.0) * sin(p.y * 3.1416), wy = 0.5 + 0.5 * sin(p.y * 6.2832) * sin(p.x * 3.1416 + 1.57);
    float w = mod(floor(p.x) + floor(p.y), 2.0) < 1.0 ? wx : wy; float m = fbm(uv, 6.0, 5), f = vn(uv, 256.0);
    alb = vec3(0.5) * (0.82 + 0.25 * m + 0.12 * (w - 0.5) + 0.08 * (f - 0.5)); tint = 1.0; ao = 0.85 + 0.15 * w;
    rough = 0.9; metal = 0.0; h = 0.3 + 0.5 * w + 0.1 * f;`,
  // painted steel (poles, cabinets, car parts): paint over metal, chips show primer and rust; takes colour
  paint: `float m = fbm(uv, 4.0, 5), g = vn(uv, 128.0), chip = smoothstep(0.715, 0.735, fbm(uv + 0.37, 16.0, 5));
    alb = mix(vec3(0.5) * (0.9 + 0.2 * m), vec3(0.16, 0.08, 0.045), chip); tint = 1.0 - chip; ao = 1.0;
    rough = mix(0.42 + 0.12 * m, 0.8, chip); metal = 0.0; h = 0.55 - 0.3 * chip + 0.06 * (g - 0.5);`,
  // hot-dip galvanised steel (Toronto poles): mottled zinc spangle, dull metal, rust-free
  galv: `vec2 v = vor(uv, 14.0); float m = fbm(uv, 5.0, 5), g = vn(uv, 200.0);
    alb = vec3(0.56, 0.58, 0.59) * (0.78 + 0.16 * v.y + 0.18 * m); tint = 0.0; ao = 1.0;
    rough = 0.42 + 0.18 * v.y + 0.08 * (g - 0.5); metal = 0.85; h = 0.5 + 0.12 * (v.y - 0.5) + 0.06 * (g - 0.5);`,
  // weathered creosoted wood (utility poles): vertical grain along uv.y, checks (splits), grey bleaching
  wood: `float grain = fbm(vec2(uv.x * 9.0, uv.y * 0.35), 16.0, 5), m = fbm(uv, 3.0, 4), chk = 1.0 - smoothstep(0.0, 0.025, abs(vn(vec2(uv.x * 3.0, uv.y * 0.15), 32.0) - 0.5));
    alb = mix(vec3(0.16, 0.12, 0.09), vec3(0.3, 0.28, 0.25), smoothstep(0.35, 0.75, m)) * (0.75 + 0.4 * grain) * (1.0 - 0.6 * chk); tint = 0.0; ao = 1.0 - 0.4 * chk;
    rough = 0.88 + 0.08 * grain; metal = 0.0; h = 0.5 + 0.25 * (grain - 0.5) - 0.4 * chk;`,
  // satin paint with no chips (alloy wheels, calipers, new street furniture); takes colour
  satin: `float m = fbm(uv, 4.0, 5), g = vn(uv, 160.0);
    alb = vec3(0.5) * (0.94 + 0.12 * m); tint = 1.0; ao = 1.0; rough = 0.38 + 0.1 * m; metal = 0.0; h = 0.5 + 0.08 * (g - 0.5);`,
  // weathered concrete: barriers, bases, kerbs
  concrete: `float m = fbm(uv, 4.0, 6), g = vn(uv, 180.0); vec2 v = vor(uv, 24.0); float pit = 1.0 - smoothstep(0.0, 0.12, v.x);
    float streak = fbm(vec2(uv.x * 1.0, uv.y * 0.12), 24.0, 4); /* rain-washed vertical grime */
    alb = vec3(0.34, 0.335, 0.32) * (0.72 + 0.45 * m) * (1.0 - 0.35 * pit) * (0.78 + 0.3 * smoothstep(0.3, 0.7, streak)) + 0.03 * (g - 0.5); tint = 0.0; ao = 1.0 - 0.4 * pit;
    rough = 0.86 + 0.08 * (g - 0.5); metal = 0.0; h = 0.55 + 0.25 * (m - 0.5) - 0.35 * pit + 0.1 * (g - 0.5);`,
};

let quad = null;
function bake(renderer, fam, out, size) {
  const rt = new THREE.WebGLRenderTarget(size, size, { type: THREE.UnsignedByteType, wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: true, depthBuffer: false });
  rt.texture.anisotropy = 4;
  const mat = new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3, uniforms: { uOut: { value: out }, uTex: { value: 1 / size } },
    vertexShader: 'in vec3 position; out vec2 vUv; void main(){ vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `precision highp float; in vec2 vUv; uniform int uOut; uniform float uTex; out vec4 o; ${LIB}
      void S(vec2 uv, out vec3 alb, out float tint, out float ao, out float rough, out float metal, out float h){
${FAMILIES[fam]}
}
      float H(vec2 uv){ vec3 a; float t, b, r, m, h; S(uv, a, t, b, r, m, h); return h; }
      void main(){ vec3 alb; float tint, ao, rough, metal, h; S(vUv, alb, tint, ao, rough, metal, h);
        if (uOut == 0) o = vec4(sqrt(clamp(alb, 0.0, 1.0)), tint);       /* albedo stored gamma 2 (less banding in the darks) */
        else if (uOut == 1) o = vec4(clamp(vec3(ao, rough, metal), 0.0, 1.0), clamp(h, 0.0, 1.0));
        else { float k = 6.0; float dx = H(vUv + vec2(uTex, 0)) - H(vUv - vec2(uTex, 0)), dy = H(vUv + vec2(0, uTex)) - H(vUv - vec2(0, uTex));
          o = vec4(normalize(vec3(-dx * k, -dy * k, 1.0)) * 0.5 + 0.5, 1.0); } }`,
    depthTest: false, depthWrite: false,
  });
  if (!quad) { quad = new THREE.Mesh(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3))); quad.frustumCulled = false; }
  quad.material = mat; const sc = new THREE.Scene(); sc.add(quad); const cam = new THREE.Camera();
  const prev = renderer.getRenderTarget(); renderer.setRenderTarget(rt); renderer.render(sc, cam); renderer.setRenderTarget(prev);
  mat.dispose(); return rt.texture;
}

const CACHE = new Map();
let R = null;
export function initSurf(renderer) { R = renderer; }
export function surfTextures(fam, size = 512) {
  if (!R) throw new Error('initSurf(renderer) first');
  if (!CACHE.has(fam)) CACHE.set(fam, { a: bake(R, fam, 0, size), o: bake(R, fam, 1, size), n: bake(R, fam, 2, size) });
  return CACHE.get(fam);
}

// MeshStandardMaterial with a baked family mapped triplanar in object space (`scale` tiles per metre).
// opts: color (for tinted families), wearColor / wearRough / wearMetal (bare material under the finish), wear (0..1),
// normal strength, aoK (how much the kit AO darkens), drops (rain beads, per-metre density, 0 = none)
export function kitMaterial(fam, opts = {}) {
  const o = Object.assign({ color: 0xffffff, scale: 12, wear: 0.8, wearColor: 0x8a8c8e, wearRough: 0.32, wearMetal: 1, normal: 1, aoK: 1, drops: 0, ground: 0, envMapIntensity: 1 }, opts);
  const T = surfTextures(fam); // baked now, never from inside a render
  const m = new THREE.MeshStandardMaterial({ color: o.color, roughness: 1, metalness: 1, envMapIntensity: o.envMapIntensity });
  const U = { sA: { value: null }, sO: { value: null }, sN: { value: null }, sScale: { value: o.scale }, sWear: { value: o.wear }, sWearCol: { value: new THREE.Color(o.wearColor) }, sWearR: { value: o.wearRough }, sWearM: { value: o.wearMetal }, sNrm: { value: o.normal }, sAoK: { value: o.aoK }, sGround: { value: o.ground } };
  m.userData.surf = U; m.userData.fam = fam;
  m.onBeforeCompile = sh => {
    U.sA.value = T.a; U.sO.value = T.o; U.sN.value = T.n; Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 kit; varying vec3 vOp; varying vec3 vOn; varying vec2 vKit; varying mat3 vNM;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvOp = position; vOn = normal; vKit = kit;\n#ifdef USE_INSTANCING\n vNM = normalMatrix * mat3(instanceMatrix);\n#else\n vNM = normalMatrix;\n#endif\n');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      uniform sampler2D sA, sO, sN; uniform float sScale, sWear, sWearR, sWearM, sNrm, sAoK, sGround; uniform vec3 sWearCol; float sGb;
      varying vec3 vOp; varying vec3 vOn; varying vec2 vKit; varying mat3 vNM; vec3 sTw; vec4 sAs, sOs; float sWm;
      float dh(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
      vec4 tri(sampler2D t){ return texture2D(t, vOp.zy * sScale) * sTw.x + texture2D(t, vOp.xz * sScale) * sTw.y + texture2D(t, vOp.xy * sScale) * sTw.z; }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
      { vec3 an = abs(normalize(vOn)); sTw = pow(an, vec3(4.0)); sTw /= dot(sTw, vec3(1.0));
        sAs = tri(sA); sOs = tri(sO); vec3 alb = sAs.rgb * sAs.rgb;
        vec3 base = mix(alb, alb * 2.0 * diffuseColor.rgb, sAs.a);
        /* edge wear: exposed edges, broken up by the height so it reads as chips and rubbed patches */
        sWm = clamp(vKit.y * sWear * smoothstep(0.58, 0.82, 0.4 * sOs.a + 0.25 * dh(floor(vOp * 260.0)) + 0.6 * texture2D(sO, vOp.zy * sScale * 0.29 + vOp.x * 0.3).a), 0.0, 1.0); /* sparse chips, not a uniform rim */
        diffuseColor.rgb = mix(base, sWearCol, sWm) * mix(1.0, vKit.x, sAoK) * sOs.r;
        /* Saltline's ground band: grime and damp in the first centimetres above the pavement */
        sGb = sGround > 0.0 ? 1.0 - smoothstep(0.0, sGround, vOp.y + 0.04 * (sOs.a - 0.5)) : 0.0; diffuseColor.rgb *= mix(1.0, 0.5, sGb); }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      roughnessFactor = mix(mix(sOs.g, sWearR, sWm), 0.35, sGb * 0.7);`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
      metalnessFactor = mix(sOs.b, sWearM, sWm);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      { vec3 nx = texture2D(sN, vOp.zy * sScale).xyz * 2.0 - 1.0, ny = texture2D(sN, vOp.xz * sScale).xyz * 2.0 - 1.0, nz = texture2D(sN, vOp.xy * sScale).xyz * 2.0 - 1.0;
        vec3 on = normalize(vOn) + sNrm * (sTw.x * vec3(0.0, nx.y, nx.x) + sTw.y * vec3(ny.x, 0.0, ny.y) + sTw.z * vec3(nz.x, nz.y, 0.0));
        normal = normalize(vNM * on) * faceDirection; }` + (o.drops ? `
      { vec3 q = vOp * ${o.drops.toFixed(1)}; vec3 c = floor(q); vec3 f = fract(q) - 0.5; float hh = dh(c); vec3 of = vec3(dh(c + 1.3), dh(c + 2.7), dh(c + 4.1)) - 0.5;
        vec3 d = f - of * 0.5; float r = 0.12 + 0.2 * dh(c + 7.7); float dr = step(0.66, hh) * (1.0 - smoothstep(r * 0.7, r, length(d)));
        roughnessFactor = mix(roughnessFactor, 0.05, dr); metalnessFactor = mix(metalnessFactor, 0.0, dr); diffuseColor.rgb *= 1.0 - 0.3 * dr; normal = normalize(normal + vNM * (d / max(r, 1e-3)) * dr * 0.9); }` : ''));
  };
  m.customProgramCacheKey = () => 'kit-' + fam + '-' + o.drops + (o.ground ? 'g' : '');
  return m;
}
