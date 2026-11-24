import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { N8AOPass } from 'n8ao';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { WET } from './pbr.js';
import { makeFinalPass } from './post.js';
import { Feel, TUNE as FEEL } from './feel.js';
import { buildWorld, makeTextures, EXT, CELL, GN, PLAY_C, PLAY_R, START, rng } from './world.js';
import { Particles, makeSky, Sfx, SUN } from './fx.js';
import { loadZombieAssets, ZombieActor, zombiePose } from './zombie.js';
import { isTouch, initTouch } from './touch.js';
import { buildRifle, buildShotgun, buildPistol, flashTextures, makeFlash, casingGeo, mats } from './weapons.js';

const $ = id => document.getElementById(id);
const QUAL = { high: { pr: 1.5, bloom: true, shadow: 4096, aa: true, ao: 'full', lights: 6, refl: 0.6 }, mid: { pr: 1, bloom: true, shadow: 2048, aa: true, ao: 'half', lights: 4, refl: 0.45 }, low: { pr: 0.75, bloom: false, shadow: 0, aa: false, ao: false, lights: 2, refl: 0 } };
const TOUCH = isTouch(); if (TOUCH) { document.body.classList.add('touch'); QUAL.low.pr = 1; QUAL.mid.pr = 1; }
let Q = TOUCH ? QUAL.low : QUAL.mid; if (TOUCH) $('q-low').checked = true;
try { const s = localStorage.getItem('yf_q'); if (s && QUAL[s]) { Q = QUAL[s]; $('q-' + s).checked = true; } } catch (e) { }

// ---------- renderer / scene ----------
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, Q.pr));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
// dusk aerial perspective: fog turns warm toward the setting sun, cooler overhead
THREE.ShaderChunk.fog_pars_vertex = '#ifdef USE_FOG\n varying float vFogDepth; varying vec3 vFogView;\n#endif';
THREE.ShaderChunk.fog_vertex = '#ifdef USE_FOG\n vFogDepth = - mvPosition.z; vFogView = mvPosition.xyz;\n#endif';
THREE.ShaderChunk.fog_pars_fragment = `#ifdef USE_FOG
  uniform vec3 fogColor; varying float vFogDepth; varying vec3 vFogView;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear; uniform float fogFar;
  #endif
#endif`;
THREE.ShaderChunk.fog_fragment = `#ifdef USE_FOG
  vec3 fogWD = normalize((vec4(vFogView, 0.0) * viewMatrix).xyz);
  float fogSun = max(dot(fogWD, vec3(${SUN.x.toFixed(4)}, ${SUN.y.toFixed(4)}, ${SUN.z.toFixed(4)})), 0.0);
  vec3 fogC = mix(fogColor, vec3(1.0, 0.56, 0.3), pow(fogSun, 4.0) * 0.85);
  #ifdef FOG_EXP2
    float fogFactor = 1.0 - exp(- fogDensity * fogDensity * vFogDepth * vFogDepth);
  #else
    float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
  #endif
  gl_FragColor.rgb = mix(gl_FragColor.rgb, fogC, fogFactor);
#endif`;
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x9c8f9a, 0.0019);
const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.05, 700);
camera.rotation.order = 'YXZ'; scene.add(camera);
const sky = makeSky(); scene.add(sky);

const tex = makeTextures();
const W = buildWorld(scene, tex, Q);
const col = W.col;

// ---- after rain: a planar mirror of the whole scene at y = 0 feeds the wet road / puddle shaders ----
let frameNo = 0;
const mirror = new Reflector(new THREE.PlaneGeometry(2400, 2400), { textureWidth: 512, textureHeight: 512, clipBias: 0.02, multisample: 0 });
mirror.rotateX(-Math.PI / 2); mirror.position.y = 0.035; mirror.material.colorWrite = false; mirror.material.depthWrite = false; mirror.renderOrder = -10; mirror.castShadow = mirror.receiveShadow = false;
{
  const draw = mirror.onBeforeRender; let last = -1; const blank = new THREE.DataTexture(new Uint8Array(4), 1, 1); blank.needsUpdate = true;
  mirror.onBeforeRender = (r, sc, cam, ...rest) => {
    if (cam !== camera || last === frameNo || !(Q.refl > 0)) return; last = frameNo;
    const sm = r.shadowMap.autoUpdate; r.shadowMap.autoUpdate = false; WET.uReflOn.value = 0; WET.tRefl.value = blank; // no feedback loop while drawing the mirror
    draw.call(mirror, r, sc, cam, ...rest);
    r.shadowMap.autoUpdate = sm; WET.tRefl.value = mirror.getRenderTarget().texture; WET.uReflOn.value = 1;
  };
  WET.uTexMat.value = mirror.material.uniforms.textureMatrix.value; WET.tRefl.value = mirror.getRenderTarget().texture;
}
scene.add(mirror);

// environment = the dusk sky itself (glass towers mirror the sunset), dark ground below the horizon
{
  const es = new THREE.Scene(); const s2 = makeSky(); s2.scale.setScalar(0.2); es.add(s2);
  const gnd = new THREE.Mesh(new THREE.CircleGeometry(80, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x4a4542 })); gnd.position.y = -3; es.add(gnd);
  const r = rng(5); const bg = new THREE.BoxGeometry(1, 1, 1);
  for (let i = 0; i < 26; i++) { const a = r() * Math.PI * 2, d = 45 + r() * 25, h = 4 + r() * 10; const m = new THREE.Mesh(bg, new THREE.MeshBasicMaterial({ color: new THREE.Color(0.16 + r() * 0.12, 0.15 + r() * 0.1, 0.15 + r() * 0.1) })); m.position.set(Math.cos(a) * d, h / 2 - 3, Math.sin(a) * d); m.scale.set(8 + r() * 10, h, 8 + r() * 10); m.lookAt(0, m.position.y, 0); es.add(m); }
  const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(es, 0.015, 0.1, 400).texture; scene.environmentIntensity = 1;
}

const hemi = new THREE.HemisphereLight(0x8fa3cf, 0x4a3d34, 2.8); scene.add(hemi);
// low sun in the WSW, as at a late-November sunset over Yonge & Finch
const sun = new THREE.DirectionalLight(0xffa66a, 5.4); scene.add(sun); scene.add(sun.target);
sun.castShadow = Q.shadow > 0; sun.shadow.mapSize.set(Q.shadow || 1024, Q.shadow || 1024);
{ const c = sun.shadow.camera; c.left = -130; c.right = 130; c.top = 70; c.bottom = -70; c.near = 1; c.far = 1200; sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.06; }
function placeSun(x, z) { // follow the player, snapped to shadow texels to avoid shimmering
  const step = 260 / (Q.shadow || 1024); x = Math.round(x / step) * step; z = Math.round(z / step) * step;
  sun.target.position.set(x, 0, z); sun.position.set(x + SUN.x * 600, SUN.y * 600, z + SUN.z * 600);
}
placeSun(0, 60);
// shadows: everything solid receives; things with height cast
scene.traverse(o => { if (!o.isMesh || !o.material || o.material.transparent || o.material.blending === THREE.AdditiveBlending) return; o.receiveShadow = true; if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); const bb = o.geometry.boundingBox; if (bb && bb.max.y - bb.min.y > 0.25) o.castShadow = true; });

// dynamic lamp lights (nearest lamps get real lights)
const lampLights = []; for (let i = 0; i < 6; i++) { const l = new THREE.PointLight(0xffc98a, 0, 24, 2); scene.add(l); lampLights.push(l); }
// fire lights
const fireLights = W.fires.map(f => { const l = new THREE.PointLight(0xff7a2a, 40, 30, 1.6); l.position.set(f.x, 1.8, f.z); scene.add(l); return l; });
// flashlight
const flash = new THREE.SpotLight(0xfff1dc, 60, 60, 0.45, 0.7, 1.5); flash.visible = false; flash.position.set(0.12, -0.12, 0); camera.add(flash); camera.add(flash.target); flash.target.position.set(0.05, -0.2, -6);
const muzzleLight = new THREE.PointLight(0xffb060, 0, 18, 2); camera.add(muzzleLight); muzzleLight.position.set(0.15, -0.1, -0.8);

const pAdd = new Particles(scene, 1500, true, tex.glow);
const pNorm = new Particles(scene, 1500, false, tex.glow);

// viewmodel lives in its own scene/pass: own lighting, never clips into walls
const vmScene = new THREE.Scene(); vmScene.environment = scene.environment; vmScene.environmentIntensity = 0.35;
const vmCam = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.01, 10); vmScene.add(vmCam);
const vmRoot = new THREE.Group(); vmCam.add(vmRoot);
const vmHemi = new THREE.HemisphereLight(0x8fa3cf, 0x3a3029, 0.6); vmScene.add(vmHemi);
const vmKey = new THREE.DirectionalLight(0xffb27a, 0.8); vmScene.add(vmKey);
const vmRim = new THREE.DirectionalLight(0x8fb0ff, 0.35); vmRim.position.set(-1.5, 0.5, -1); vmScene.add(vmRim);
const vmMuzzle = new THREE.PointLight(0xffb060, 0, 2.5, 2); vmScene.add(vmMuzzle);

// ---------- post ----------
const composer = new EffectComposer(renderer);
// scene pass with screen-space ambient occlusion (N8AO): contact shadows where walls meet the ground, in corners,
// under balconies, awnings and cars; tinted cool like the dusk skylight it occludes
const basePass = new RenderPass(scene, camera); composer.addPass(basePass);
const aoPass = new N8AOPass(scene, camera, innerWidth, innerHeight);
Object.assign(aoPass.configuration, { aoRadius: 2.2, distanceFalloff: 1.0, intensity: 2.6, color: new THREE.Color(0x0b0d16), gammaCorrection: false, halfRes: true, screenSpaceRadius: false });
aoPass.setQualityMode('Medium'); composer.addPass(aoPass);
let vmPass = null; // added once vmScene exists
vmPass = new RenderPass(vmScene, vmCam); vmPass.clear = false; vmPass.clearDepth = true; composer.addPass(vmPass);
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.42, 0.5, 0.95); composer.addPass(bloom);
const finalPass = makeFinalPass(); composer.addPass(finalPass); // Saltline-style camera pass (tone map, look, shafts, grain) instead of OutputPass
{ const r0 = finalPass.render.bind(finalPass); let tPrev = performance.now(); finalPass.render = (r, wb, rb, dt, mask) => { const t = performance.now(); finalPass.update(r, rb.texture, Math.min(0.1, (t - tPrev) / 1000), camera, SUN); tPrev = t; r0(r, wb, rb, dt, mask); }; }
const smaa = new SMAAPass(innerWidth, innerHeight); composer.addPass(smaa);
const grade = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uDmg: { value: 0 }, uLow: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime; uniform float uDmg; uniform float uLow; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p,vec2(12.9898,78.233))+uTime*7.0)*43758.5453); }
    void main(){ vec2 d=vUv-0.5; float r=length(d);
      vec3 c; float ca = uDmg*0.006; /* base aberration, vignette and grain now live in the final camera pass */ c.r=texture2D(tDiffuse, vUv+d*ca).r; c.g=texture2D(tDiffuse, vUv).g; c.b=texture2D(tDiffuse, vUv-d*ca).b;
      float l=dot(c,vec3(0.299,0.587,0.114)); c=mix(vec3(l),c,1.0 - uLow*0.55);
      c=mix(c, vec3(0.5,0.0,0.0), smoothstep(0.25,0.75,r)*uDmg*0.9);
      gl_FragColor=vec4(c,1.0);} `,
});
composer.addPass(grade);

function applyQuality() {
  renderer.setPixelRatio(Math.min(devicePixelRatio, Q.pr)); renderer.setSize(innerWidth, innerHeight); composer.setPixelRatio(Math.min(devicePixelRatio, Q.pr)); composer.setSize(innerWidth, innerHeight); if (typeof finalPass !== 'undefined') { const pr = Math.min(devicePixelRatio, Q.pr); finalPass.setSize(innerWidth * pr, innerHeight * pr); }
  bloom.enabled = Q.bloom; lampLights.forEach((l, i) => l.visible = i < Q.lights);
  aoPass.enabled = !!Q.ao; basePass.enabled = !Q.ao; aoPass.configuration.halfRes = Q.ao !== 'full'; smaa.enabled = Q.aa;
  if (typeof mirror !== 'undefined') { mirror.visible = Q.refl > 0; WET.uReflOn.value = Q.refl > 0 ? 1 : 0; const pr = Math.min(devicePixelRatio, Q.pr); mirror.getRenderTarget().setSize(Math.max(64, Math.round(innerWidth * pr * Q.refl)), Math.max(64, Math.round(innerHeight * pr * Q.refl))); }
  if (typeof sun !== 'undefined') { const on = Q.shadow > 0; if (sun.castShadow !== on || (on && sun.shadow.mapSize.x !== Q.shadow)) { sun.castShadow = on; if (on) { sun.shadow.mapSize.set(Q.shadow, Q.shadow); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } } scene.traverse(o => { if (o.material) o.material.needsUpdate = true; }); } }
}
applyQuality();
addEventListener('resize', () => { camera.aspect = vmCam.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); vmCam.updateProjectionMatrix(); applyQuality(); });

// ---------- weapons (viewmodels) ----------
const WEAP = [
  { name: '突击步枪', mag: 30, res: 150, rate: 0.088, dmg: 34, pel: 1, spread: 0.012, reload: 2.1, auto: true, kick: 0.012, snd: 0, vm: buildRifle(), cas: 0 },
  { name: '霰弹枪', mag: 6, res: 30, rate: 0.85, dmg: 17, pel: 9, spread: 0.065, reload: 2.6, auto: false, kick: 0.05, snd: 1, vm: buildShotgun(), cas: 1 },
  { name: '手枪', mag: 12, res: Infinity, rate: 0.17, dmg: 40, pel: 1, spread: 0.009, reload: 1.4, auto: false, kick: 0.025, snd: 2, vm: buildPistol(), cas: 2 },
];

const FT = flashTextures();
for (const w of WEAP) { w.vm.visible = false; vmRoot.add(w.vm); w.flash = makeFlash(FT); w.flash.position.copy(w.vm.userData.muzzle); w.vm.add(w.flash); }
// tracers
const tracers = []; for (let i = 0; i < 8; i++) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(6), 3)); const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xffd090, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })); l.frustumCulled = false; scene.add(l); tracers.push({ l, t: 0 }); }
// ejected casings
const CASN = 48; const casMesh = [casingGeo(0), casingGeo(1), casingGeo(2)].map((g, k) => { const m = new THREE.InstancedMesh(g, k === 1 ? mats().shell : mats().brass, CASN); m.count = 0; m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(m); return m; });
const casings = [];
// bullet holes: dark hole, torn rim and a soot fan, on walls and the ground (pooled instanced quads)
const DECN = 120;
const decals = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 30); gr.addColorStop(0, 'rgba(6,5,5,1)'); gr.addColorStop(0.16, 'rgba(10,9,8,1)'); gr.addColorStop(0.24, 'rgba(70,66,60,0.9)'); gr.addColorStop(0.4, 'rgba(25,22,20,0.55)'); gr.addColorStop(1, 'rgba(20,18,16,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  g.strokeStyle = 'rgba(15,13,12,0.7)'; g.lineWidth = 1.2; for (let i = 0; i < 7; i++) { const a = Math.random() * 6.28; g.beginPath(); g.moveTo(32 + Math.cos(a) * 5, 32 + Math.sin(a) * 5); g.lineTo(32 + Math.cos(a) * (11 + Math.random() * 9), 32 + Math.sin(a) * (11 + Math.random() * 9)); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.16, 0.16), new THREE.MeshStandardMaterial({ map: t, transparent: true, depthWrite: false, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -6 }), DECN);
  m.count = 0; m.frustumCulled = false; m.renderOrder = 5; scene.add(m);
  let i = 0; const q = new THREE.Quaternion(), qr = new THREE.Quaternion(), z = new THREE.Vector3(0, 0, 1), sc = new THREE.Vector3(), mm = new THREE.Matrix4();
  return { add(p, n, size = 1) { q.setFromUnitVectors(z, n); qr.setFromAxisAngle(z, Math.random() * 6.28); q.multiply(qr); sc.setScalar(size * (0.7 + Math.random() * 0.6)); mm.compose(p, q, sc); m.setMatrixAt(i, mm); i = (i + 1) % DECN; m.count = Math.max(m.count, i === 0 ? DECN : i); m.instanceMatrix.needsUpdate = true; } };
})();

// ---------- zombies (rigged, animated characters) ----------
const ZMAX = TOUCH ? 18 : 36;
let ZA = null; const actors = [];
const zombies = [];
const TYPES = { walk: { hp: 100, sp: [1.0, 1.6], dmg: 12, sc: 1 }, run: { hp: 70, sp: [3.6, 4.4], dmg: 9, sc: 0.97 }, brute: { hp: 480, sp: [1.4, 1.7], dmg: 28, sc: 1.4 } };
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _c = new THREE.Color();
const assetsReady = loadZombieAssets(ev => { if (ev && ev.total) $('start').textContent = '加载角色 ' + Math.round(ev.loaded / ev.total * 100) + '%'; }).then(a => {
  ZA = a; for (let i = 0; i < ZMAX; i++) { const ac = new ZombieActor(a, i % 2 ? 'soldier' : 'woman'); ac.root.traverse(o => { if (o.isMesh) o.castShadow = true; }); ac.root.visible = false; ac.free = true; scene.add(ac.root); actors.push(ac); }
  $('start').disabled = false; $('start').textContent = '进入路口';
  if (S.state === 'menu') { for (let i = 0; i < 10; i++) { const px = player.x, pz = player.z; player.x = -3; player.z = 92; spawnZombie('walk'); player.x = px; player.z = pz; } }
}).catch(err => { $('start').disabled = false; $('start').textContent = '进入路口（角色加载失败）'; console.error(err); });

// ---------- flow field toward the player ----------
const dist = new Uint16Array(GN * GN).fill(65535); const queue = new Int32Array(GN * GN);
let ffCell = -1, ffT = 0;
function computeFlow(px, pz) {
  dist.fill(65535); const sx = Math.floor((px + EXT) / CELL), sz = Math.floor((pz + EXT) / CELL); const s = sx + sz * GN;
  let h = 0, t = 0; queue[t++] = s; dist[s] = 0; const B = col.blocked; const LIM = 260;
  while (h < t) { const c = queue[h++]; const d = dist[c]; if (d > LIM) continue; const x = c % GN, z = (c / GN) | 0;
    if (x > 0) { const n = c - 1; if (dist[n] === 65535 && !B[n]) { dist[n] = d + 1; queue[t++] = n; } }
    if (x < GN - 1) { const n = c + 1; if (dist[n] === 65535 && !B[n]) { dist[n] = d + 1; queue[t++] = n; } }
    if (z > 0) { const n = c - GN; if (dist[n] === 65535 && !B[n]) { dist[n] = d + 1; queue[t++] = n; } }
    if (z < GN - 1) { const n = c + GN; if (dist[n] === 65535 && !B[n]) { dist[n] = d + 1; queue[t++] = n; } } }
}
function flowDir(x, z, out) {
  const ix = Math.floor((x + EXT) / CELL), iz = Math.floor((z + EXT) / CELL); let best = 65535, bx = 0, bz = 0;
  for (let ox = -1; ox <= 1; ox++) for (let oz = -1; oz <= 1; oz++) { if (!ox && !oz) continue; const nx = ix + ox, nz = iz + oz; if (nx < 0 || nz < 0 || nx >= GN || nz >= GN) continue; let d = dist[nx + nz * GN]; if (d === 65535) continue; if (ox && oz) { if (col.blocked[ix + ox + iz * GN] || col.blocked[ix + (iz + oz) * GN]) continue; d += 0.4; } if (d < best) { best = d; bx = ox; bz = oz; } }
  if (best === 65535) return false; const L = Math.hypot(bx, bz); out.x = bx / L; out.z = bz / L; return true;
}

// ---------- game state ----------
const S = {
  state: 'menu', hp: 100, stamina: 1, kills: 0, heads: 0, score: 0, wave: 0, toSpawn: 0, alive: 0, waveT: 0, intermission: 4, time: 0,
  wi: 0, ammo: WEAP.map(w => ({ mag: w.mag, res: w.res })), fireT: 0, reloadT: 0, kick: 0, flashT: 0, dmgT: 0, flashOn: false, best: 0,
};
try { S.best = +localStorage.getItem('yf_best') || 0; } catch (e) { }
const player = { x: START[0], z: START[1], vx: 0, vz: 0, y: 1.7, vy: 0, yaw: 0.22, pitch: 0.02, bob: 0 };
const feel = new Feel();
const keys = {}; let mouseDown = false, locked = false, dragLook = false;
const sfx = new Sfx();
const pickups = [];
const pickGeo = new THREE.BoxGeometry(0.4, 0.28, 0.3); const pickMats = { ammo: new THREE.MeshStandardMaterial({ color: 0x1d3a1f, emissive: 0x3cff6a, emissiveIntensity: 0.9 }), med: new THREE.MeshStandardMaterial({ color: 0x3a1010, emissive: 0xff3a3a, emissiveIntensity: 1.2 }) };

function setWeapon(i) { if (S.reloadT > 0) return; S.wi = i; S.swap = 0.25; WEAP.forEach((w, k) => w.vm.visible = k === i); hud(); }

// ---------- input ----------
addEventListener('keydown', e => {
  keys[e.code] = true;
  if (S.state !== 'play') return;
  if (e.code === 'Digit1') setWeapon(0); if (e.code === 'Digit2') setWeapon(1); if (e.code === 'Digit3') setWeapon(2);
  if (e.code === 'KeyR') reload(); if (e.code === 'KeyF') { S.flashOn = !S.flashOn; flash.visible = S.flashOn; sfx.click(); }
  if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
});
addEventListener('keyup', e => { keys[e.code] = false; if (e.code === 'Escape' && S.noLock && S.state === 'play') pause(); });
canvas.addEventListener('contextmenu', e => e.preventDefault());
addEventListener('wheel', e => { if (S.state === 'play') setWeapon((S.wi + (e.deltaY > 0 ? 1 : 2)) % 3); }, { passive: true });
canvas.addEventListener('mousedown', e => { if (S.state !== 'play' || TOUCH) return; if (!locked) tryLock(); if (e.button === 0) mouseDown = true; if (e.button === 2) S.adsHeld = true; dragLook = true; });
addEventListener('mouseup', e => { if (e.button === 0) mouseDown = false; if (e.button === 2) S.adsHeld = false; dragLook = false; });
addEventListener('mousemove', e => {
  if (S.state !== 'play') return; if (!locked && !dragLook) return;
  const sens = 0.0022 * (+$('sens').value || 1) * (camera.fov / 72);
  player.yaw -= e.movementX * sens; player.pitch = Math.max(-1.45, Math.min(1.45, player.pitch - e.movementY * sens)); feel.look(e.movementX, e.movementY);
});
document.addEventListener('pointerlockchange', () => { locked = document.pointerLockElement === canvas; if (!locked && S.state === 'play' && !S.noLock) pause(); });
document.addEventListener('pointerlockerror', () => { S.noLock = true; $('nolock').style.display = 'block'; });
let TC = null;
const touchApi = {
  state: () => S.state,
  look: (dx, dy) => { const k = 0.0042 * (+$('sens').value || 1) * (camera.fov / 72); player.yaw -= dx * k; player.pitch = Math.max(-1.45, Math.min(1.45, player.pitch - dy * k)); feel.look(dx * 1.5, dy * 1.5); },
  fire: on => { mouseDown = on; }, toggleAds: () => { S.adsHeld = !S.adsHeld; }, ads: () => !!S.adsHeld,
  reload: () => reload(), jump: d => { keys.Space = d; }, swap: () => setWeapon((S.wi + 1) % 3),
  light: () => { S.flashOn = !S.flashOn; flash.visible = S.flashOn; sfx.click(); }, pause: () => pause(),
};
document.addEventListener('visibilitychange', () => { if (document.hidden && S.state === 'play') pause(); });
function goFull() { if (!TOUCH) return; try { const el = document.documentElement; const p = (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el, { navigationUI: 'hide' }); if (p && p.then) p.then(() => screen.orientation?.lock?.('landscape').catch(() => { })).catch(() => { }); } catch (e) { } }
function tryLock() { if (TOUCH) return; try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => { S.noLock = true; $('nolock').style.display = 'block'; }); } catch (e) { S.noLock = true; $('nolock').style.display = 'block'; } }
function pause() { S.state = 'pause'; $('pause').style.display = 'flex'; mouseDown = false; if (TC) TC.reset(); }
function resume() { $('pause').style.display = 'none'; S.state = 'play'; sfx.resume(); tryLock(); last = performance.now(); }
$('resume').onclick = resume;
$('start').disabled = true; $('start').textContent = '加载角色…';
$('start').onclick = () => {
  const qs = document.querySelector('input[name=q]:checked').value; Q = QUAL[qs]; try { localStorage.setItem('yf_q', qs); } catch (e) { }
  applyQuality(); sfx.init(); sfx.resume(); $('menu').style.display = 'none'; $('hud').style.display = 'block'; goFull(); if (TOUCH && !TC) TC = initTouch(touchApi); document.body.classList.add('playing'); newGame(); tryLock();
};
$('again').onclick = () => { $('over').style.display = 'none'; $('hud').style.display = 'block'; goFull(); newGame(); tryLock(); };

function newGame() {
  for (const z of zombies) freeActor(z); zombies.length = 0; for (const p of pickups) scene.remove(p.m); pickups.length = 0;
  Object.assign(S, { state: 'play', hp: 100, stamina: 1, kills: 0, heads: 0, score: 0, wave: 0, toSpawn: 0, waveT: 0, intermission: 5, time: 0, fireT: 0, reloadT: 0, ammo: WEAP.map(w => ({ mag: w.mag, res: w.res })) });
  Object.assign(player, { x: START[0], z: START[1], vx: 0, vz: 0, y: 1.7, vy: 0, yaw: 0.22, pitch: 0.02 });
  setWeapon(0); banner('央街 × 芬治大道', '守住路口。第一波即将到来'); hud(); last = performance.now();
}

// ---------- weapons logic ----------
function reload() { const w = WEAP[S.wi], a = S.ammo[S.wi]; if (S.reloadT > 0 || a.mag >= w.mag || a.res <= 0) return; S.reloadT = w.reload; sfx.reload(); }
const ray = new THREE.Vector3(), org = new THREE.Vector3();
function fire() {
  const w = WEAP[S.wi], a = S.ammo[S.wi];
  if (S.reloadT > 0 || S.fireT > 0) return;
  if (a.mag <= 0) { sfx.click(); S.fireT = 0.25; reload(); return; }
  a.mag--; S.fireT = w.rate; feel.fire(player, w.kick, Math.min(3, w.kick / 0.012), S.ads || 0); S.flashT = 0.05; sfx.shot(w.snd);
  camera.getWorldPosition(org); let killedAny = false;
  vmCam.updateMatrixWorld(true); const muzzleW = camera.localToWorld(w.vm.localToWorld(w.vm.userData.muzzle.clone()));
  ejectCasing(w); w.flash.visible = true; w.flash.rotation.z = Math.random() * 6; w.flash.scale.setScalar(0.8 + Math.random() * 0.5); S.fireAnim = 1;
  for (let p = 0; p < w.pel; p++) {
    ray.set(0, 0, -1); const sp = w.spread * (keys.ShiftLeft ? 1.6 : 1) * (Math.hypot(player.vx, player.vz) > 0.5 ? 1.5 : 1) * (1 - 0.75 * (S.ads || 0) * (w.pel > 1 ? 0.4 : 1));
    ray.x += (Math.random() - 0.5) * sp * 2; ray.y += (Math.random() - 0.5) * sp * 2; ray.normalize().applyQuaternion(camera.quaternion);
    if (TOUCH) { // light aim assist for thumbs: bend toward the closest target inside a small cone
      let bestA = 0.09, tgt = null;
      for (const z of zombies) { if (z.dead >= 0) continue; for (const [px, py, pz, k] of [[z.hx, z.hy, z.hz, 0.6], [z.x, 1.15 * z.sc, z.z, 1]]) { _v.set(px - org.x, py - org.y, pz - org.z); const d = _v.length(); if (d > 60) continue; const a = Math.acos(Math.min(1, _v.dot(ray) / d)) * k; if (a < bestA) { bestA = a; tgt = _v.clone().normalize(); } } }
      if (tgt) ray.lerp(tgt, 0.75).normalize();
    }
    const hl = Math.hypot(ray.x, ray.z); let maxT = 220;
    if (hl > 1e-4) maxT = Math.min(maxT, col.ray(org.x, org.z, ray.x, ray.z, 220 * hl) / hl);
    if (ray.y < -1e-4) maxT = Math.min(maxT, -org.y / ray.y);
    let best = null, bt = maxT, head = false;
    for (const z of zombies) {
      if (z.dead >= 0) continue; const dx = z.x - org.x, dz = z.z - org.z; if (dx * dx + dz * dz > bt * bt + 4) continue;
      // head sphere
      const hx = z.hx - org.x, hy = z.hy - org.y, hz = z.hz - org.z; const tb = hx * ray.x + hy * ray.y + hz * ray.z; const r = 0.15 * z.sc;
      if (tb > 0) { const d2 = hx * hx + hy * hy + hz * hz - tb * tb; if (d2 < r * r) { const t = tb - Math.sqrt(r * r - d2); if (t < bt) { bt = t; best = z; head = true; } } }
      // body cylinder
      const rr = 0.3 * z.sc; const A2 = ray.x * ray.x + ray.z * ray.z; const Bq = -2 * (dx * ray.x + dz * ray.z); const C = dx * dx + dz * dz - rr * rr; const disc = Bq * Bq - 4 * A2 * C;
      if (disc > 0 && A2 > 1e-6) { const t = (-Bq - Math.sqrt(disc)) / (2 * A2); const y = org.y + ray.y * t; if (t > 0 && t < bt && y > 0 && y < 1.5 * z.sc) { bt = t; best = z; head = false; } }
    }
    const hx = org.x + ray.x * bt, hy = org.y + ray.y * bt, hz = org.z + ray.z * bt;
    if (best) {
      const dmg = w.dmg * (head ? 2.8 : 1) * (0.9 + Math.random() * 0.2); best.hp -= dmg; best.stag = 0.25; best.flash = 0.08;
      best.x += ray.x * (w.pel > 1 ? 0.12 : 0.18) / best.sc; best.z += ray.z * (w.pel > 1 ? 0.12 : 0.18) / best.sc;
      for (let k = 0; k < (head ? 14 : 7); k++) pNorm.emit(hx, hy, hz, (Math.random() - 0.5) * 3 + ray.x * 2, Math.random() * 2.5, (Math.random() - 0.5) * 3 + ray.z * 2, 0.6 + Math.random() * 0.5, 0.05 + Math.random() * 0.06, 0.22, 0.02, 0.02, 0.95, 9, 0.5);
      hitMark(head);
      if (best.hp <= 0) { killZombie(best, head); killedAny = true; } else if (head) sfx.head(); else sfx.hit();
    } else if (bt < 219) {
      { const ground = hy < 0.08; const nrm = ground ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(-ray.x, 0, -ray.z).normalize(); decals.add(new THREE.Vector3(hx, ground ? 0.045 : hy, hz).addScaledVector(nrm, 0.012), nrm, w.pel > 1 ? 0.6 : 1); }
      for (let k = 0; k < 6; k++) pAdd.emit(hx, hy, hz, (Math.random() - 0.5) * 4 - ray.x * 2, Math.random() * 3, (Math.random() - 0.5) * 4 - ray.z * 2, 0.25 + Math.random() * 0.2, 0.03, 1, 0.75, 0.4, 1, 12, 1);
      for (let k = 0; k < 3; k++) pNorm.emit(hx, hy, hz, (Math.random() - 0.5), Math.random() * 0.8, (Math.random() - 0.5), 0.8, 0.12, 0.35, 0.35, 0.35, 0.35, -0.3, 1, 0.5);
    }
    if (p < 3) { const tr = tracers.find(t => t.t <= 0) || tracers[0]; const a2 = tr.l.geometry.attributes.position; a2.setXYZ(0, muzzleW.x, muzzleW.y, muzzleW.z); a2.setXYZ(1, hx, hy, hz); a2.needsUpdate = true; tr.t = 0.06; }
  }
  // smoke from muzzle
  pNorm.emit(muzzleW.x, muzzleW.y, muzzleW.z, ray.x * 0.5, 0.3, ray.z * 0.5, 0.6, 0.08, 0.5, 0.5, 0.5, 0.18, -0.2, 2, 0.6);
  // gunfire attracts: no-op (all zombies already hunt you)
  hud();
}
function ejectCasing(w) {
  vmCam.updateMatrixWorld(true); const ud = w.vm.userData; const p = camera.localToWorld(w.vm.localToWorld(ud.eject.clone())); const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion); const up = new THREE.Vector3(0, 1, 0);
  const v = right.multiplyScalar(1.8 + Math.random()).add(up.multiplyScalar(1.6 + Math.random())).add(new THREE.Vector3(player.vx, 0, player.vz));
  if (w.cas === 1) return setTimeout(() => casings.push({ k: 1, p: camera.localToWorld(w.vm.localToWorld(ud.eject.clone())), v: new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion).multiplyScalar(1.4).add(new THREE.Vector3(0, 1.2, 0)), r: new THREE.Euler(Math.random() * 6, Math.random() * 6, 0), w: new THREE.Vector3(9, 4, 2), t: 5 }), 280);
  casings.push({ k: w.cas, p, v, r: new THREE.Euler(Math.random() * 6, Math.random() * 6, 0), w: new THREE.Vector3((Math.random() - 0.5) * 30, 12, (Math.random() - 0.5) * 30), t: 5 });
  if (casings.length > CASN * 2) casings.shift();
}
function updateCasings(dt) {
  const cnt = [0, 0, 0];
  for (let i = casings.length - 1; i >= 0; i--) { const c = casings[i]; c.t -= dt; if (c.t <= 0) { casings.splice(i, 1); continue; }
    c.v.y -= 9.8 * dt; c.p.addScaledVector(c.v, dt); if (c.p.y < 0.01) { c.p.y = 0.01; c.v.y *= -0.35; c.v.x *= 0.6; c.v.z *= 0.6; c.w.multiplyScalar(0.6); }
    c.r.x += c.w.x * dt; c.r.y += c.w.y * dt; c.r.z += c.w.z * dt;
    const m = casMesh[c.k]; if (cnt[c.k] >= CASN) continue; _q.setFromEuler(c.r); _m.compose(c.p, _q, _v.set(1, 1, 1)); m.setMatrixAt(cnt[c.k]++, _m); }
  casMesh.forEach((m, k) => { m.count = cnt[k]; m.instanceMatrix.needsUpdate = true; });
}
let hmT = 0; function hitMark(head, kill) { const h = $('hm'); h.className = 'on' + (head ? ' head' : '') + (kill ? ' kill' : ''); hmT = kill ? 0.32 : 0.14;
  try { const sc = kill ? 1.7 : head ? 1.35 : 1.15; h.animate([{ transform: `translate(-50%,-50%) rotate(45deg) scale(${sc})`, opacity: 1 }, { transform: 'translate(-50%,-50%) rotate(45deg) scale(1)', opacity: 1, offset: 0.35 }, { transform: 'translate(-50%,-50%) rotate(45deg) scale(0.9)', opacity: 0 }], { duration: hmT * 1000, easing: 'ease-out' }); } catch (e) { } }

function killZombie(z, head) {
  z.dead = 0; S.kills++; S.alive--; if (head) S.heads++; S.hitStop = head ? 0.06 : 0.04; feel.shake(0.12); hitMark(head, true); S.score += (z.type === 'brute' ? 500 : 100) + (head ? 50 : 0);
  sfx.groan(0, 0.25, z.type === 'brute');
  const r = Math.random(); if (r < 0.14) dropPickup(z.x, z.z, 'ammo'); else if (r < 0.2 || (z.type === 'brute')) dropPickup(z.x, z.z, z.type === 'brute' ? 'med' : 'med');
  hud();
}
function dropPickup(x, z, type) { const m = new THREE.Mesh(pickGeo, pickMats[type]); m.position.set(x, 0.4, z); scene.add(m); pickups.push({ m, type, x, z, t: 0 }); }

// ---------- spawning ----------
function spawnZombie(type) {
  for (let tries = 0; tries < 40; tries++) {
    const a = Math.random() * Math.PI * 2, d = 32 + Math.random() * 48; const x = player.x + Math.sin(a) * d, z = player.z + Math.cos(a) * d;
    if (Math.hypot(x - PLAY_C[0], z - PLAY_C[1]) > PLAY_R - 4) continue; if (col.isBlocked(x, z)) continue;
    const ix = Math.floor((x + EXT) / CELL), iz = Math.floor((z + EXT) / CELL); if (dist[ix + iz * GN] === 65535) continue;
    const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw); const dot = ((x - player.x) * fx + (z - player.z) * fz) / d; if (dot > 0.55 && tries < 25) continue;
    const ac = actors.find(a => a.free); if (!ac) return false;
    const T = TYPES[type]; const zz = { x, z, yaw: 0, type, hp: T.hp, sp: T.sp[0] + Math.random() * (T.sp[1] - T.sp[0]), dmg: T.dmg, sc: T.sc * (0.92 + Math.random() * 0.16), phase: Math.random() * 10, dead: -1, atkT: 0, stag: 0, flash: 0, los: false, losT: Math.random(), groanT: 2 + Math.random() * 6, hx: x, hy: 1.6, hz: z, lean: (Math.random() - 0.5) * 0.3, armOff: Math.random() * 0.25, seed: Math.random() * 9 };
    ac.free = false; ac.root.visible = true; ac.root.rotation.set(0, 0, 0); zz.actor = ac; const sc = zz.sc;
    ac.root.scale.setScalar(sc); const tint = type === 'brute' ? [0.55, 0.42, 0.4] : [0.7 + Math.random() * 0.3, 0.7 + Math.random() * 0.3, 0.7 + Math.random() * 0.3]; ac.uni.uTint.value.setRGB(...tint);
    ac.mixer.timeScale = 1; if (type === 'run') ac.play('run', zz.sp / 4.2); else ac.play('walk', 0.45 + zz.sp * 0.22);
    zombies.push(zz); return true;
  }
  return false;
}
function freeActor(z) { if (z.actor) { z.actor.free = true; z.actor.root.visible = false; z.actor = null; } }
function startWave() {
  S.wave++; const n = S.wave; S.toSpawn = 6 + n * 5; S.waveT = 0; S.spawnT = 0; sfx.wave();
  banner('第 ' + n + ' 波', n === 1 ? '它们从四面八方的街道涌来' : n % 3 === 0 ? '有大家伙出现了' : '剩余子弹要省着用');
  if (n > 1) { S.ammo[0].res += 30; S.ammo[1].res += 6; }
  hud();
}

// ---------- HUD ----------
let bannerT = 0; function banner(a, b) { $('bn1').textContent = a; $('bn2').textContent = b; $('banner').style.opacity = 1; bannerT = 3.2; }
const NAMES = { 'Yonge Street': '央街 Yonge St', 'Finch Avenue East': '芬治大道东 Finch Ave E', 'Finch Avenue West': '芬治大道西 Finch Ave W', 'Finch Avenue': '芬治大道 Finch Ave' };
function locName() {
  let best = [], bd = [1e9, 1e9];
  for (const s of W.named) { const dx = s[2] - s[0], dz = s[3] - s[1]; const L2 = dx * dx + dz * dz || 1; let t = ((player.x - s[0]) * dx + (player.z - s[1]) * dz) / L2; t = Math.max(0, Math.min(1, t)); const d = Math.hypot(player.x - s[0] - dx * t, player.z - s[1] - dz * t);
    const nm = s[4].replace(/ (East|West)$/, m => m); if (d < bd[0] && best[0] !== nm) { if (best[0]) { bd[1] = bd[0]; best[1] = best[0]; } bd[0] = d; best[0] = nm; } else if (nm !== best[0] && d < bd[1]) { bd[1] = d; best[1] = nm; } }
  const nm = n => NAMES[n] || n; const base = n => n.replace(/ (East|West)$/, '');
  if (bd[0] > 40) return '居民区 · 北约克 Willowdale';
  if (best[1] && bd[1] < 26 && base(best[1]) !== base(best[0])) return nm(best[0]) + '  ×  ' + nm(best[1]);
  return nm(best[0]);
}
function hud() {
  const w = WEAP[S.wi], a = S.ammo[S.wi];
  $('hp').style.width = Math.max(0, S.hp) + '%'; $('hpn').textContent = Math.max(0, Math.ceil(S.hp));
  $('st').style.width = S.stamina * 100 + '%';
  $('wn').textContent = w.name; $('am').textContent = S.reloadT > 0 ? '装弹中' : a.mag; $('rs').textContent = a.res === Infinity ? '∞' : a.res;
  $('wv').textContent = S.wave ? '第 ' + S.wave + ' 波' : '准备'; $('zl').textContent = S.wave ? (S.alive + S.toSpawn) + ' 只丧尸' : '';
  $('kl').textContent = S.kills; $('sc').textContent = S.score;
}
{ // compass strip: 3px per degree
  const c = document.createElement('canvas'); c.width = 1080; c.height = 26; const g = c.getContext('2d'); g.fillStyle = 'rgba(233,237,240,.6)'; g.textAlign = 'center'; g.font = '600 13px Oswald, sans-serif';
  const lab = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
  for (let d = 0; d < 360; d += 5) { const x = d * 3; if (lab[d] !== undefined) { g.fillStyle = d % 90 ? 'rgba(233,237,240,.75)' : '#ffb35c'; g.fillText(lab[d], x, 14); } else g.fillRect(x, d % 15 ? 18 : 14, 1, d % 15 ? 5 : 9); g.fillStyle = 'rgba(233,237,240,.6)'; }
  $('cmp').style.backgroundImage = `url(${c.toDataURL()})`;
}
const mm = $('mm'), mmc = mm.getContext('2d');
function drawMinimap() {
  const R = 90, sc = 1.5; mmc.clearRect(0, 0, 180, 180); mmc.save(); mmc.beginPath(); mmc.arc(R, R, R, 0, Math.PI * 2); mmc.clip(); mmc.fillStyle = '#0d1012'; mmc.fillRect(0, 0, 180, 180);
  mmc.translate(R, R); mmc.rotate(player.yaw); const k = sc / W.mmS; mmc.scale(k, k);
  mmc.drawImage(W.minimap, -(player.x + EXT) * W.mmS, -(player.z + EXT) * W.mmS);
  mmc.setTransform(1, 0, 0, 1, 0, 0); mmc.translate(R, R); mmc.rotate(player.yaw);
  for (const z of zombies) { if (z.dead >= 0) continue; const dx = (z.x - player.x) * sc, dz = (z.z - player.z) * sc; if (dx * dx + dz * dz > R * R) continue; mmc.fillStyle = z.type === 'brute' ? '#ff9a2a' : '#ff3a2a'; mmc.beginPath(); mmc.arc(dx, dz, z.type === 'brute' ? 4 : 2.6, 0, Math.PI * 2); mmc.fill(); }
  for (const p of pickups) { mmc.fillStyle = p.type === 'ammo' ? '#4cff7a' : '#ff6a6a'; mmc.fillRect((p.x - player.x) * sc - 2, (p.z - player.z) * sc - 2, 4, 4); }
  mmc.restore();
  mmc.fillStyle = '#fff'; mmc.beginPath(); mmc.moveTo(R, R - 7); mmc.lineTo(R + 5, R + 5); mmc.lineTo(R, R + 2); mmc.lineTo(R - 5, R + 5); mmc.closePath(); mmc.fill();
  const hd = ((-player.yaw * 180 / Math.PI) % 360 + 360) % 360; $('cmp').style.backgroundPositionX = (-hd * 3 + 150) + 'px'; $('hdg').textContent = Math.round(hd) + '°';
}

// ---------- main loop ----------
let last = performance.now(), lampT = 0, locT = 0, sirenT = 14, stepT = 0;
const fwd = new THREE.Vector3(), tmp = { x: 0, z: 0 };
function update(dt) {
  if (S.hitStop > 0) { S.hitStop -= dt; dt *= 0.15; } // a few frames of hit-stop on kills
  S.time += dt;
  // --- player movement ---
  const sprint = (keys.ShiftLeft || keys.ShiftRight || (TC && TC.move.sprint)) && S.stamina > 0.05;
  let mx = 0, mz = 0; if (keys.KeyW || keys.ArrowUp) mz -= 1; if (keys.KeyS || keys.ArrowDown) mz += 1; if (keys.KeyA) mx -= 1; if (keys.KeyD) mx += 1;
  if (keys.ArrowLeft || keys.KeyQ) player.yaw += 2.2 * dt; if (keys.ArrowRight || keys.KeyE) player.yaw -= 2.2 * dt;
  if (TC) { mx += TC.move.x; mz += TC.move.y; } let ml = Math.hypot(mx, mz); const analog = Math.min(1, ml); const spd = (sprint && mz < 0 ? 7.6 : 4.3) * (TC ? Math.max(0.35, analog) : 1);
  let tx = 0, tz = 0; if (ml > 0) { mx /= ml; mz /= ml; const c = Math.cos(player.yaw), s = Math.sin(player.yaw); tx = (mx * c + mz * s) * spd; tz = (-mx * s + mz * c) * spd; }
  const acc = 1 - Math.exp(-dt * 12); player.vx += (tx - player.vx) * acc; player.vz += (tz - player.vz) * acc;
  S.stamina = Math.max(0, Math.min(1, S.stamina + (sprint && ml > 0 ? -0.22 : 0.15) * dt));
  const p = { x: player.x + player.vx * dt, z: player.z + player.vz * dt };
  col.resolve(p, 0.42);
  const dc = Math.hypot(p.x - PLAY_C[0], p.z - PLAY_C[1]); if (dc > PLAY_R) { p.x = PLAY_C[0] + (p.x - PLAY_C[0]) / dc * PLAY_R; p.z = PLAY_C[1] + (p.z - PLAY_C[1]) / dc * PLAY_R; }
  $('edge').style.opacity = dc > PLAY_R - 25 ? 1 : 0;
  player.x = p.x; player.z = p.z;
  const wasAir = player.y > 1.701, vy0 = player.vy;
  if (keys.Space && player.y <= 1.701) player.vy = 4.6; player.vy -= 13 * dt; player.y = Math.max(1.7, player.y + player.vy * dt); if (player.y <= 1.7) player.vy = 0;
  if (wasAir && player.y <= 1.7) feel.landed(-vy0);
  const moving = Math.hypot(player.vx, player.vz); player.bob += moving * dt * 1.9;
  stepT -= moving * dt; if (stepT < 0 && player.y <= 1.71) { stepT = 1.6; sfx.step(); }
  // --- camera ---
  camera.position.set(player.x, player.y + Math.sin(player.bob * 2) * 0.04 * Math.min(1, moving / 4), player.z);
  const strafe = player.vx * Math.cos(player.yaw) - player.vz * Math.sin(player.yaw);
  const fo = feel.update(dt, strafe);
  camera.rotation.set(player.pitch + fo.pitch, player.yaw + fo.yaw, fo.roll + strafe * -0.0025);
  // --- weapon ---
  const w = WEAP[S.wi], a = S.ammo[S.wi];
  S.fireT -= dt;
  if (S.reloadT > 0) { S.reloadT -= dt; if (S.reloadT <= 0) { const need = w.mag - a.mag; const got = Math.min(need, a.res); a.mag += got; if (a.res !== Infinity) a.res -= got; hud(); } }
  if (mouseDown && (w.auto || !S.fired)) { fire(); S.fired = true; } if (!mouseDown) S.fired = false;
  const ud = w.vm.userData; const rp = S.reloadT > 0 ? Math.min(1, (w.reload - S.reloadT) / w.reload) : 0; const rl = S.reloadT > 0 ? Math.sin(rp * Math.PI) : 0;
  const wantAds = S.adsHeld && S.reloadT <= 0 && !(sprint && moving > 5) ? 1 : 0; S.ads = (S.ads || 0) + (wantAds - (S.ads || 0)) * Math.min(1, dt * 12); const ads = S.ads;
  S.swap = Math.max(0, (S.swap || 0) - dt); S.fireAnim = Math.max(0, (S.fireAnim || 0) - dt * 14);
  const bobK = Math.min(1, moving / 4) * (1 - ads * 0.85); const sprintK = sprint && moving > 5 ? 1 : 0;
  const hx = ud.hip.x, hy = ud.hip.y, hz = ud.hip.z, ax = -ud.sight.x, ay = -ud.sight.y, az = ud.adsZ - ud.sight.z; const vo = feel.vm();
  w.vm.position.set(hx + (ax - hx) * ads + Math.sin(player.bob) * 0.012 * bobK + sprintK * 0.03, hy + (ay - hy) * ads - Math.abs(Math.cos(player.bob)) * 0.01 * bobK - rl * 0.08 - S.swap * 0.6 - sprintK * 0.03, hz + (az - hz) * ads + vo.z * (1 - ads * 0.5)); w.vm.position.x += vo.x * (1 - ads * 0.6); w.vm.position.y += vo.y * (1 - ads * 0.6);
  w.vm.rotation.set(vo.rx * (1 - ads * 0.6) + rl * 0.5 - sprintK * 0.35, (1 - ads) * 0.07 + sprintK * 0.55 + vo.ry * (1 - ads * 0.6), rl * 0.6 + sprintK * 0.25 + vo.rz * (1 - ads * 0.5));
  if (ud.mag) { ud.mag.position.y = -Math.max(0, Math.sin(rp * Math.PI * 1.0)) * 0.22 * (rp > 0.2 && rp < 0.85 ? 1 : Math.max(0, Math.sin(rp * Math.PI))); }
  if (ud.pump) { const pa = S.fireT > 0 && w.cas === 1 ? Math.sin(Math.max(0, Math.min(1, (w.rate - S.fireT) / 0.45)) * Math.PI) : 0; ud.pump.position.z = pa * 0.08; }
  if (ud.slide) ud.slide.position.z = S.fireAnim * 0.025;
  const fovT = 72 + (ud.fov - 72) * ads + sprintK * FEEL.sprintFov * (1 - ads); if (Math.abs(camera.fov - fovT) > 0.01) { camera.fov += (fovT - camera.fov) * Math.min(1, dt * 10); camera.updateProjectionMatrix(); vmCam.fov = 66 + (ud.fov - 66) * ads; vmCam.updateProjectionMatrix(); }
  $('xh').style.opacity = 1 - ads;
  w.flash.visible = S.flashT > 0; muzzleLight.intensity = S.flashT > 0 ? 40 : 0; vmMuzzle.intensity = S.flashT > 0 ? 3 : 0; if (S.flashT > 0) { muzzleLight.position.copy(ud.muzzle).applyMatrix4(w.vm.matrix); vmMuzzle.position.copy(muzzleLight.position); } S.flashT -= dt;
  updateCasings(dt);
  for (const t of tracers) { t.t -= dt; t.l.material.opacity = Math.max(0, t.t / 0.06) * 0.8; }
  hmT -= dt; if (hmT <= 0) $('hm').className = '';
  // --- waves ---
  if (S.wave === 0 || (S.toSpawn === 0 && S.alive === 0)) { S.intermission -= dt; $('next').textContent = S.intermission > 0 ? '下一波 ' + Math.ceil(S.intermission) + ' 秒' : ''; if (S.intermission <= 0) { startWave(); S.intermission = 12; } } else $('next').textContent = '';
  const n = S.wave; const maxAlive = Math.min(ZMAX - 4, 10 + n * 4);
  if (S.toSpawn > 0) { S.spawnT -= dt; if (S.spawnT <= 0 && S.alive < maxAlive) { const r = Math.random(); const brute = n >= 3 && r < 0.04 + n * 0.006; const run = !brute && n >= 2 && r < 0.15 + n * 0.05; if (spawnZombie(brute ? 'brute' : run ? 'run' : 'walk')) { S.toSpawn--; S.alive++; hud(); } S.spawnT = Math.max(0.25, 1.4 - n * 0.1); } }
  // --- flow field ---
  ffT -= dt; const pc = Math.floor((player.x + EXT) / CELL) + Math.floor((player.z + EXT) / CELL) * GN; if (pc !== ffCell && ffT <= 0) { computeFlow(player.x, player.z); ffCell = pc; ffT = 0.3; }
  // --- zombies ---
  updateZombies(dt);
  // --- pickups ---
  for (let i = pickups.length - 1; i >= 0; i--) { const pk = pickups[i]; pk.t += dt; pk.m.position.y = 0.45 + Math.sin(pk.t * 3) * 0.1; pk.m.rotation.y += dt * 1.5; if (Math.hypot(pk.x - player.x, pk.z - player.z) < 1.6) { if (pk.type === 'ammo') { S.ammo[0].res += 30; S.ammo[1].res += 6; } else S.hp = Math.min(100, S.hp + 35); sfx.pickup(); scene.remove(pk.m); pickups.splice(i, 1); hud(); } else if (pk.t > 60) { scene.remove(pk.m); pickups.splice(i, 1); } }
  // --- regen ---
  if (S.time - (S.lastHurt || 0) > 6) S.hp = Math.min(100, S.hp + dt * 2);
  S.dmgT = Math.max(0, S.dmgT - dt * 1.5);
  if (S.hp <= 0) gameOver();
  $('hp').style.width = Math.max(0, S.hp) + '%'; $('hpn').textContent = Math.max(0, Math.ceil(S.hp)); $('st').style.width = S.stamina * 100 + '%';
  bannerT -= dt; if (bannerT < 0) $('banner').style.opacity = 0;
  locT -= dt; if (locT <= 0) { $('loc').textContent = locName(); locT = 0.5; }
}

function updateZombies(dt) {
  let drawn = 0; const sep = new Map();
  for (const z of zombies) { if (z.dead >= 0) continue; const k = Math.floor(z.x / 2) + Math.floor(z.z / 2) * 1000; let c = sep.get(k); if (!c) sep.set(k, c = []); c.push(z); }
  let groaned = false;
  for (let i = zombies.length - 1; i >= 0; i--) {
    const z = zombies[i];
    if (z.dead >= 0) { z.dead += dt; if (z.dead > 6) { freeActor(z); zombies.splice(i, 1); continue; } }
    else {
      const dx = player.x - z.x, dz = player.z - z.z, d = Math.hypot(dx, dz);
      z.losT -= dt; if (z.losT <= 0) { z.losT = 0.4 + Math.random() * 0.3; z.los = d < 60 && col.ray(z.x, z.z, dx, dz, d) >= d - 0.5; }
      let mx = 0, mz = 0;
      if (z.los || d < 3) { mx = dx / d; mz = dz / d; } else if (flowDir(z.x, z.z, tmp)) { mx = tmp.x; mz = tmp.z; } else { mx = dx / d; mz = dz / d; }
      const reach = 1.05 * z.sc + 0.35;
      let sp = z.sp * (z.stag > 0 ? 0.25 : 1); z.stag -= dt; z.flash -= dt;
      if (d < reach) { sp = 0; z.atkT -= dt; if (z.atkT <= 0) { z.atkT = z.type === 'run' ? 0.8 : 1.1; z.swing = 0.35; if (S.state === 'play') { S.hp -= z.dmg; S.dmgT = Math.min(1, S.dmgT + 0.6); feel.shake(0.55); S.lastHurt = S.time; sfx.hurt(); } } }
      else z.atkT = Math.min(z.atkT, 0.35);
      z.swing = Math.max(0, (z.swing || 0) - dt);
      const tyaw = Math.atan2(dx, dz); let dy = tyaw - z.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); z.yaw += dy * Math.min(1, dt * 6);
      z.x += mx * sp * dt; z.z += mz * sp * dt;
      // separation
      const k0x = Math.floor(z.x / 2), k0z = Math.floor(z.z / 2);
      for (let ox = -1; ox <= 1; ox++) for (let oz = -1; oz <= 1; oz++) { const c = sep.get(k0x + ox + (k0z + oz) * 1000); if (!c) continue; for (const o of c) { if (o === z) continue; const ex = z.x - o.x, ez = z.z - o.z, e2 = ex * ex + ez * ez, mind = 0.32 * (z.sc + o.sc); if (e2 < mind * mind && e2 > 1e-6) { const e = Math.sqrt(e2); const push = (mind - e) * 0.5; z.x += ex / e * push; z.z += ez / e * push; } } }
      if (d < 0.5 + 0.3 * z.sc) { z.x -= dx / d * (0.5 + 0.3 * z.sc - d); z.z -= dz / d * (0.5 + 0.3 * z.sc - d); }
      const pp = { x: z.x, z: z.z }; col.resolve(pp, 0.32 * z.sc); z.x = pp.x; z.z = pp.z;
      z.phase += dt * (sp > 0 ? (z.type === 'run' ? 9 : 4.2) : 1.2);
      z.groanT -= dt; if (z.groanT <= 0 && d < 30 && !groaned) { z.groanT = 4 + Math.random() * 7; groaned = true; const ang = Math.atan2(dx, dz) - player.yaw; sfx.groan(Math.max(-1, Math.min(1, Math.sin(-ang) * -1)), 0.35 * (1 - d / 32), z.type === 'brute'); }
    }
    // ---- pose (skinned character + procedural zombie layer) ----
    const ac = z.actor; if (!ac) continue;
    const fall = z.dead >= 0 ? Math.min(1, z.dead / 0.7) : 0; const sink = z.dead > 3 ? (z.dead - 3) * 0.25 : 0;
    ac.root.position.set(z.x, -sink, z.z); ac.root.rotation.set(-fall * fall * 1.5, z.yaw, 0, 'YXZ');
    const dd = Math.hypot(z.x - camera.position.x, z.z - camera.position.z);
    if (z.dead >= 0) { if (fall < 1) ac.mixer.update(dt * (1 - fall)); }
    else if (dd < 110 || ((S.frameN + i) & 1)) { ac.mixer.update(dd < 110 ? dt : dt * 2); if (dd < 70) zombiePose(ac, z, S.time + i); else ac.root.updateMatrixWorld(true); if (ac.bones.Head) ac.bones.Head.getWorldPosition(ac.headWorld); }
    ac.uni.uFlash.value = z.flash > 0 ? 0.55 : 0;
    if (z.dead < 0) { z.hx = ac.headWorld.x; z.hy = ac.headWorld.y + 0.09 * z.sc; z.hz = ac.headWorld.z; }
    drawn++;
  }
  S.frameN = (S.frameN || 0) + 1;
}

function gameOver() {
  S.state = 'over'; document.exitPointerLock?.(); mouseDown = false; if (TC) TC.reset();
  const best = Math.max(S.best, S.score); try { localStorage.setItem('yf_best', best); } catch (e) { } S.best = best;
  $('ov-stats').innerHTML = `<div><b>${S.wave}</b><span>坚持到第几波</span></div><div><b>${S.kills}</b><span>击杀</span></div><div><b>${S.heads}</b><span>爆头</span></div><div><b>${S.score}</b><span>得分 · 最高 ${best}</span></div>`;
  $('hud').style.display = 'none'; $('over').style.display = 'flex';
}

function ambient(dt, t) {
  // lamp lights follow the player
  lampT -= dt; if (lampT <= 0) { lampT = 0.25; const on = W.lamps.filter(l => l.on); on.sort((a, b) => ((a.hx - player.x) ** 2 + (a.hz - player.z) ** 2) - ((b.hx - player.x) ** 2 + (b.hz - player.z) ** 2)); lampLights.forEach((l, i) => { const lp = on[i]; if (lp && i < Q.lights) { l.position.set(lp.hx + lp.ax * 0.5, 7.0, lp.hz + lp.az * 0.5); l.intensity = 16; l.userData.f = lp.flick; } else l.intensity = 0; }); }
  for (const l of lampLights) if (l.userData.f) l.intensity = Math.random() < 0.15 ? 0 : 16;
  const fk = Math.random() < 0.12 ? 0.05 : 1; W.headsFl.material.emissiveIntensity = 3.5 * fk; W.poolFlMat.opacity = 0.22 * fk;
  W.signalMat.emissiveIntensity = (Math.floor(t * 1.1) % 2) ? 5 : 0.2;
  W.hazMat.emissiveIntensity = (Math.floor(t * 1.6) % 2) ? 6 : 0;
  // fires
  W.fires.forEach((f, i) => {
    fireLights[i].intensity = 30 + Math.sin(t * 17 + i) * 8 + Math.random() * 14;
    if (Math.hypot(f.x - player.x, f.z - player.z) < 140) {
      for (let k = 0; k < 6; k++) pAdd.emit(f.x + (Math.random() - 0.5) * 1.6, 0.9 + Math.random() * 0.5, f.z + (Math.random() - 0.5) * 3.4, (Math.random() - 0.5) * 0.5, 1.4 + Math.random() * 1.8, (Math.random() - 0.5) * 0.5, 0.35 + Math.random() * 0.45, 0.22 + Math.random() * 0.3, 1, 0.3 + Math.random() * 0.25, 0.06, 0.5, -0.8, 0.6, -0.35);
      if (Math.random() < 0.3) pAdd.emit(f.x + (Math.random() - 0.5) * 1.5, 1.2, f.z + (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 2, 3 + Math.random() * 3, (Math.random() - 0.5) * 2, 1.2, 0.035, 1, 0.55, 0.2, 1, 1.5, 0.3);
      if (Math.random() < 0.5) pNorm.emit(f.x + (Math.random() - 0.5), 2.4, f.z + (Math.random() - 0.5), 0.4 + (Math.random() - 0.5) * 0.4, 1.4, (Math.random() - 0.5) * 0.4, 3.5, 0.9, 0.06, 0.06, 0.06, 0.35, -0.15, 0.2, 0.9);
    }
  });
  // distant sirens over the city
  sirenT -= dt; if (sirenT <= 0) { sirenT = 28 + Math.random() * 40; sfx.siren(Math.random() * 2 - 1); }
  placeSun(camera.position.x, camera.position.z);
  vmKey.position.copy(SUN).applyAxisAngle(new THREE.Vector3(0, 1, 0), -camera.rotation.y).add(new THREE.Vector3(0, 0.6, 0));
  sky.position.copy(camera.position);
}

function frame(now) {
  requestAnimationFrame(frame); frameNo++;
  let dt = Math.min(0.05, (now - last) / 1000); last = now;
  const t = now / 1000;
  if (S.state === 'play') update(dt);
  else if (S.state === 'menu') { // slow attract camera around the intersection
    const a = t * 0.04; camera.position.set(-3 + Math.sin(a) * 60, 14 + Math.sin(t * 0.1) * 2, 92 + Math.cos(a) * 60); camera.lookAt(-3, 6, 92);
  }
  if (S.state === 'play' || S.state === 'menu') { pAdd.update(dt); pNorm.update(dt); }
  if (S.state !== 'pause') ambient(dt, t);
  if (S.state === 'play') drawMinimap();
  grade.uniforms.uTime.value = t; grade.uniforms.uDmg.value = S.state === 'play' ? Math.max(S.dmgT, S.hp < 30 ? 0.35 + Math.sin(t * 6) * 0.1 : 0) : 0; grade.uniforms.uLow.value = S.state === 'play' ? Math.max(0, (40 - S.hp) / 40) : 0;
  if (S.state === 'menu') updateZombies(dt * 0.6);
  vmRoot.visible = S.state === 'play' || S.state === 'pause'; vmPass.enabled = vmRoot.visible;
  composer.render();
  fpsN++; if (now - fpsT > 1000) { $('fps').textContent = fpsN + ' FPS'; fpsN = 0; fpsT = now; }
}
let fpsN = 0, fpsT = 0;
computeFlow(START[0], START[1]);
// a few shamblers for the title screen

requestAnimationFrame(frame);
window.__yf = { S, player, zombies, camera, W, fire, update, renderer, scene, sun, bloom, composer, placeSun, tick: () => frameNo++, mirror, WET, finalPass };
