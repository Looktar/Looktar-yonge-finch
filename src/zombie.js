import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

// Rigged characters: Soldier.glb and Michelle.glb from the three.js examples (Mixamo rigs).
// Both use the same mixamorig skeleton, so the soldier's Walk/Run/Idle clips drive both.
const B = n => 'mixamorig' + n;

export async function loadZombieAssets(onProgress) {
  const loader = new GLTFLoader();
  // iOS refuses blob: and data: URLs for buffers and images inside the claude.ai artifact sandbox. The models are glTF
  // JSON with the buffer inlined as base64 and images as plain files in chars/ (tools/split_char_images.py), so the
  // buffer is decoded here and handed to GLTFLoader as an in-memory GLB: no blob:/data: fetch ever happens.
  const load = async url => {
    const resp = await fetch(url); const txt = await resp.text(); if (onProgress) onProgress({ loaded: txt.length, total: txt.length });
    const json = JSON.parse(txt); const buf = json.buffers[0];
    const raw = atob(buf.uri.slice(buf.uri.indexOf(',') + 1)); const bin = new Uint8Array(raw.length); for (let k = 0; k < raw.length; k++) bin[k] = raw.charCodeAt(k);
    delete buf.uri; buf.byteLength = bin.length;
    const jb = new TextEncoder().encode(JSON.stringify(json)); const jl = (jb.length + 3) & ~3, bl = (bin.length + 3) & ~3;
    const glb = new Uint8Array(12 + 8 + jl + 8 + bl); const dv = new DataView(glb.buffer);
    dv.setUint32(0, 0x46546C67, true); dv.setUint32(4, 2, true); dv.setUint32(8, glb.length, true);
    dv.setUint32(12, jl, true); dv.setUint32(16, 0x4E4F534A, true); glb.set(jb, 20); for (let k = 20 + jb.length; k < 20 + jl; k++) glb[k] = 0x20;
    const bo = 20 + jl; dv.setUint32(bo, bl, true); dv.setUint32(bo + 4, 0x004E4942, true); glb.set(bin, bo + 8);
    return new Promise((res, rej) => loader.parse(glb.buffer, '', res, rej));
  };
  const [sol, mic] = await Promise.all([load('Soldier.json'), load('Michelle.json')]);
  const clips = {};
  for (const c of sol.animations) clips[c.name] = c;
  const strip = (clip, keepY) => {
    const c = clip.clone();
    c.tracks = c.tracks.filter(t => !(t.name.endsWith('.position') && !t.name.includes('Hips')));
    for (const t of c.tracks) if (t.name.endsWith('.position')) {
      if (!keepY) { c.tracks = c.tracks.filter(x => x !== t); continue; }
      const v = t.values; const x0 = v[0], z0 = v[2]; for (let i = 0; i < v.length; i += 3) { v[i] = x0; v[i + 2] = z0; }
    }
    return c;
  };
  // put both rigs in their T-pose so rest orientations line up
  const tpose = gltf => { const c = gltf.animations.find(a => a.name === 'TPose'); if (!c) return; const mx = new THREE.AnimationMixer(gltf.scene); mx.clipAction(c).play(); mx.update(0); gltf.scene.updateMatrixWorld(true); mx.stopAllAction(); };
  tpose(sol); tpose(mic);
  const prep = (gltf, height, cl) => {
    const scene = gltf.scene; scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(scene); const h = box.max.y - box.min.y;
    return { scene, scale: height / h, clips: cl };
  };
  const solClips = { walk: strip(clips.Walk, true), run: strip(clips.Run, true), idle: strip(clips.Idle, true) };
  const micClips = { walk: retarget(sol.scene, mic.scene, strip(clips.Walk, false)), run: retarget(sol.scene, mic.scene, strip(clips.Run, false)), idle: retarget(sol.scene, mic.scene, strip(clips.Idle, false)) };
  tpose(sol); tpose(mic);
  return { soldier: prep(sol, 1.8, solClips), woman: prep(mic, 1.68, micClips) };
}

function zombify(mat, uni) {
  const m = mat.clone();
  m.onBeforeCompile = sh => {
    sh.uniforms.uFlash = uni.uFlash; sh.uniforms.uSeed = uni.uSeed; sh.uniforms.uTint = uni.uTint; sh.uniforms.uNS = uni.uNS;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vZP;').replace('#include <skinning_vertex>', '#include <skinning_vertex>\nvZP = transformed;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vZP; uniform float uFlash; uniform float uSeed; uniform vec3 uTint; uniform float uNS;
      float zh(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719)))*43758.5453); }
      float zn(vec3 p){ vec3 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(mix(zh(i),zh(i+vec3(1,0,0)),f.x),mix(zh(i+vec3(0,1,0)),zh(i+vec3(1,1,0)),f.x),f.y),
                   mix(mix(zh(i+vec3(0,0,1)),zh(i+vec3(1,0,1)),f.x),mix(zh(i+vec3(0,1,1)),zh(i+vec3(1,1,1)),f.x),f.y),f.z); }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
      { vec3 c = diffuseColor.rgb; float l = dot(c, vec3(0.299,0.587,0.114));
        float skin = smoothstep(0.03, 0.12, c.r - c.b) * smoothstep(0.0, 0.05, c.r - c.g) * step(0.06, l);
        vec3 dead = vec3(l*0.95, l*1.05, l*0.82) * vec3(0.8, 0.9, 0.72);
        c = mix(c, dead, skin * 0.9);
        c = mix(c, vec3(l) * vec3(0.92, 0.95, 0.9), 0.35);
        vec3 sp = vZP * uNS + uSeed;  /* ~15 cm blobs */
        float grime = zn(sp * 1.0) * 0.7 + zn(sp * 4.0) * 0.3; float blood = smoothstep(0.66, 0.8, zn(sp * 0.6 + 7.0));
        float drip = smoothstep(0.7, 0.85, zn(vec3(sp.x * 2.0, sp.y * 0.25, sp.z * 2.0) + 3.0));
        c *= 0.62 + 0.38 * grime;
        c = mix(c, vec3(0.16, 0.012, 0.01), max(blood, drip * 0.8) * 0.9);
        c *= uTint; c = mix(c, vec3(0.9, 0.85, 0.85), uFlash);
        diffuseColor.rgb = c; }`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = max(roughnessFactor, 0.55);');
  };
  m.customProgramCacheKey = () => 'zomb-' + (mat.map ? 1 : 0) + (mat.normalMap ? 1 : 0) + mat.type;
  return m;
}

// world-space retarget: same world rotation delta from T-pose, re-expressed in the target hierarchy
function retarget(srcScene, tgtScene, clip, fps = 30) {
  const sB = {}; srcScene.traverse(o => { if (o.isBone) sB[o.name] = o; });
  const tB = []; tgtScene.traverse(o => { if (o.isBone) tB.push(o); });
  srcScene.updateMatrixWorld(true); tgtScene.updateMatrixWorld(true);
  const restS = {}, restT = {}, restL = {}; for (const n in sB) restS[n] = sB[n].getWorldQuaternion(new THREE.Quaternion());
  for (const b of tB) { restT[b.name] = b.getWorldQuaternion(new THREE.Quaternion()); restL[b.name] = b.quaternion.clone(); }
  const rootQ = {}; for (const b of tB) if (!b.parent.isBone) rootQ[b.name] = b.parent.getWorldQuaternion(new THREE.Quaternion());
  const mx = new THREE.AnimationMixer(srcScene); const act = mx.clipAction(clip); act.play();
  const n = Math.max(2, Math.round(clip.duration * fps) + 1); const times = []; const vals = {}; for (const b of tB) vals[b.name] = [];
  const W = {}, q = new THREE.Quaternion(), inv = new THREE.Quaternion();
  for (let f = 0; f < n; f++) {
    const t = f / (n - 1) * clip.duration; times.push(t); mx.setTime(t); srcScene.updateMatrixWorld(true);
    for (const b of tB) {
      const pw = b.parent.isBone ? W[b.parent.name] : rootQ[b.name]; const sb = sB[b.name]; let w;
      if (sb) { sb.getWorldQuaternion(q); w = q.clone().multiply(inv.copy(restS[b.name]).invert()).multiply(restT[b.name]); }
      else w = pw.clone().multiply(restL[b.name]);
      W[b.name] = w; const l = inv.copy(pw).invert().multiply(w); vals[b.name].push(l.x, l.y, l.z, l.w);
    }
  }
  mx.stopAllAction(); mx.uncacheRoot(srcScene);
  const tracks = tB.filter(b => sB[b.name]).map(b => new THREE.QuaternionKeyframeTrack(b.name + '.quaternion', times, vals[b.name]));
  return new THREE.AnimationClip(clip.name + '_rt', clip.duration, tracks);
}

const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffa060 });
const eyeGeo = new THREE.SphereGeometry(1, 6, 4);

export class ZombieActor {
  constructor(assets, kind) {
    const src = kind === 'woman' ? assets.woman : assets.soldier; this.kind = kind;
    this.root = new THREE.Group(); this.body = SkeletonUtils.clone(src.scene); this.root.add(this.body);
    this.baseScale = src.scale; this.body.scale.setScalar(src.scale); this.body.rotation.y = Math.PI;
    this.uni = { uFlash: { value: 0 }, uSeed: { value: Math.random() * 50 }, uTint: { value: new THREE.Color(1, 1, 1) }, uNS: { value: 6 } };
    { let ms = 1; this.body.traverse(o => { if (o.isSkinnedMesh) { const w = new THREE.Vector3(); o.updateWorldMatrix(true, false); o.getWorldScale(w); ms = w.x; } }); this.uni.uNS.value = 6 * ms; }
    this.body.traverse(o => { if (o.isMesh) { o.material = zombify(o.material, this.uni); o.frustumCulled = false; } });
    this.bones = {}; for (const n of ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm', 'LeftShoulder', 'RightShoulder']) this.bones[n] = this.body.getObjectByName(B(n));
    this.mixer = new THREE.AnimationMixer(this.body);
    this.actions = {}; for (const k in src.clips) { this.actions[k] = this.mixer.clipAction(src.clips[k]); }
    this.cur = null;
    // glowing eyes on the head bone
    this.root.updateMatrixWorld(true); const hb = this.bones.Head; const hp = hb.getWorldPosition(new THREE.Vector3());
    const ws = new THREE.Vector3(); hb.getWorldScale(ws);
    for (const sx of [-1, 1]) { const e = new THREE.Mesh(eyeGeo, eyeMat); const wp = hp.clone().add(new THREE.Vector3(sx * 0.032, 0.075, 0.095)); hb.worldToLocal(wp); e.position.copy(wp); e.scale.setScalar(0.012 / ws.x); hb.add(e); }
    this.headWorld = new THREE.Vector3();
  }
  play(name, timeScale) {
    const a = this.actions[name]; a.timeScale = timeScale;
    if (this.cur === a) return; if (this.cur) this.cur.fadeOut(0.25); a.reset().fadeIn(0.25).play(); a.time = Math.random() * a.getClip().duration; this.cur = a;
  }
}

// procedural zombie layer on top of the clip
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _ax = new THREE.Vector3();
function rotateWorld(bone, axis, angle) { // apply a world-space rotation to a bone
  bone.parent.getWorldQuaternion(_q2); _q.setFromAxisAngle(axis, angle);
  const w = _q2.clone().multiply(bone.quaternion); w.premultiply(_q); bone.quaternion.copy(_q2.invert().multiply(w)); bone.updateMatrixWorld(true);
}
function aimBone(bone, dirWorld, amount) { // point bone's +Y toward dirWorld (blend)
  bone.getWorldQuaternion(_q); _v.copy(_up).applyQuaternion(_q); const target = _q2.setFromUnitVectors(_v, _v2.copy(dirWorld).normalize()).multiply(_q);
  const w = _q.clone().slerp(target, amount); bone.parent.getWorldQuaternion(_q2); bone.quaternion.copy(_q2.invert().multiply(w)); bone.updateMatrixWorld(true);
}
export function zombiePose(a, z, t) {
  const yaw = z.yaw; const right = _ax.set(Math.cos(yaw), 0, -Math.sin(yaw)); const fwd = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  a.root.updateMatrixWorld(true);
  const b = a.bones; const run = z.type === 'run';
  if (b.Spine1) rotateWorld(b.Spine1, right, (run ? 0.35 : 0.22) + Math.sin(z.phase * 2) * 0.04 + (z.swing > 0 ? 0.2 : 0));
  if (b.Neck) rotateWorld(b.Neck, fwd, Math.sin(t * 0.7 + z.seed) * 0.25 + z.lean);
  if (b.Head) rotateWorld(b.Head, right, -0.25 + Math.sin(t * 1.3 + z.seed) * 0.12);
  // reaching arms (walkers), flailing (runners), swing on attack
  const sw = z.swing > 0 ? Math.sin(z.swing / 0.35 * Math.PI) : 0;
  for (const side of [-1, 1]) {
    const bone = side > 0 ? b.LeftArm : b.RightArm; if (!bone) continue;
    const reach = run ? 0.35 : 0.85;
    const d = fwd.clone().multiplyScalar(1).add(new THREE.Vector3(0, -0.25 - sw * 0.9 + Math.sin(z.phase + side) * 0.12, 0)).add(right.clone().multiplyScalar(side * (0.18 + z.armOff)));
    aimBone(bone, d, reach);
    const fore = side > 0 ? b.LeftForeArm : b.RightForeArm; if (fore && !run) aimBone(fore, fwd.clone().add(new THREE.Vector3(0, -0.15 - sw * 0.6, 0)), 0.6);
  }
  if (b.Head) b.Head.getWorldPosition(a.headWorld);
}
