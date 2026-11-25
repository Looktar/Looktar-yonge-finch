// Street clutter from Poly Haven photogrammetry (CC0, dist/models/*.glb, packed by tools/fetch_polyhaven.py):
// trash bags, tyres, barrels, cement bags, metal bins and utility / electrical boxes scattered against building walls
// and at sidewalk edges around the intersection, plus wall-mounted AC units. Placement is synchronous (colliders);
// the models stream in afterwards and are drawn as one InstancedMesh per glTF primitive.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// name, footprint radius for the collider (0 = walk-through), how they sit (wall = back against a wall)
const KINDS = {
  trashbag: { r: 0, wall: true, group: [1, 4] },
  old_tyre: { r: 0.35, wall: true, group: [1, 3], lean: true },
  Barrel_01: { r: 0.35, wall: true, group: [1, 2] },
  cement_bag: { r: 0, wall: true, group: [2, 5] },
  metal_trash_can: { r: 0.3, wall: true, group: [1, 2] },
  utility_box_01: { r: 0.45, wall: false, group: [1, 1] },
  utility_box_02: { r: 0.5, wall: false, group: [1, 1] },
};
const MIX = ['trashbag', 'trashbag', 'cement_bag', 'old_tyre', 'Barrel_01', 'metal_trash_can', 'utility_box_01', 'utility_box_02'];

// ctx: { col, onRoad, rng, near: [x, z, R] }
export function placeClutter(scene, ctx, base = '') {
  const { col, onRoad, rng: r } = ctx, [cx, cz, R] = ctx.near;
  const spots = {}; for (const k of Object.keys(KINDS)) spots[k] = [];
  const taken = [];
  const free = (x, z, d) => !col.isBlocked(x, z) && !onRoad(x, z) && !taken.some(t => (t[0] - x) ** 2 + (t[1] - z) ** 2 < d * d);
  for (let i = 0, n = 0; i < 6000 && n < 70; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * R, x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
    if (!free(x, z, 3)) continue;
    // find the nearest wall within 1.6 m by probing 8 directions
    let wall = null; for (let k = 0; k < 8 && !wall; k++) { const t = k / 8 * Math.PI * 2; for (const s of [0.6, 1.0, 1.6]) if (col.isBlocked(x + Math.cos(t) * s, z + Math.sin(t) * s)) { wall = [Math.cos(t), Math.sin(t), s]; break; } }
    const kind = MIX[Math.floor(r() * MIX.length)], K = KINDS[kind];
    if (K.wall && !wall) continue;
    if (!K.wall && (wall || [1, 2.5].every(s => !onRoad(x + s, z) && !onRoad(x - s, z) && !onRoad(x, z + s) && !onRoad(x, z - s)))) continue; // boxes stand at the curb, not against walls
    const face = wall ? Math.atan2(-wall[0], -wall[1]) : r() * Math.PI * 2; // back to the wall
    const g = K.group[0] + Math.floor(r() * (K.group[1] - K.group[0] + 1));
    for (let j = 0; j < g; j++) {
      const ox = wall ? -wall[1] * (j - (g - 1) / 2) * 0.7 : 0, oz = wall ? wall[0] * (j - (g - 1) / 2) * 0.7 : 0;
      const px = x + ox + (wall ? wall[0] * (wall[2] - 0.45) : 0), pz = z + oz + (wall ? wall[1] * (wall[2] - 0.45) : 0);
      if (col.isBlocked(px, pz)) continue;
      spots[kind].push([px, pz, face + (r() - 0.5) * 0.6, K.lean && j === g - 1 ? 1 : 0]);
      if (K.r) col.addPoly([[px - K.r, pz - K.r], [px + K.r, pz - K.r], [px + K.r, pz + K.r], [px - K.r, pz + K.r]], false);
    }
    taken.push([x, z]); n++;
  }
  const grp = new THREE.Group(); grp.name = 'clutter'; scene.add(grp);
  const loader = new GLTFLoader(); const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  const jobs = Object.entries(spots).filter(([, l]) => l.length).map(([name, list]) => loader.loadAsync(base + 'models/' + name + '.glb').then(gltf => {
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse(o => {
      if (!o.isMesh) return;
      const geo = o.geometry.clone().applyMatrix4(o.matrixWorld); const mat = o.material; mat.envMapIntensity = 0.6;
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach(([x, z, a, lean], i) => { e.set(lean ? -1.25 : 0, a, 0); q.setFromEuler(e); im.setMatrixAt(i, m4.compose(v.set(x, lean ? 0.36 : 0, z), q, one)); });
      im.instanceMatrix.needsUpdate = true; im.castShadow = im.receiveShadow = true; im.computeBoundingSphere(); grp.add(im);
    });
  }).catch(err => console.warn('clutter model ' + name + ' failed: ' + err.message)));
  return { count: Object.values(spots).reduce((s, l) => s + l.length, 0), ready: Promise.all(jobs) };
}

// wall-mounted AC units on the street faces of low shops (the storefront module passes candidate spots)
export function placeWallAC(scene, list, base = '') {
  if (!list.length) return;
  new GLTFLoader().loadAsync(base + 'models/exterior_aircon_unit.glb').then(gltf => {
    gltf.scene.updateMatrixWorld(true); const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
    gltf.scene.traverse(o => {
      if (!o.isMesh) return; const im = new THREE.InstancedMesh(o.geometry.clone().applyMatrix4(o.matrixWorld), o.material, list.length);
      list.forEach(([x, y, z, a], i) => { e.set(0, a, 0); q.setFromEuler(e); im.setMatrixAt(i, m4.compose(v.set(x, y, z), q, one)); });
      im.instanceMatrix.needsUpdate = true; im.castShadow = true; im.computeBoundingSphere(); scene.add(im);
    });
  }).catch(err => console.warn('aircon failed: ' + err.message));
}
