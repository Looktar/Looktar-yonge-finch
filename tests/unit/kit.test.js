import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { chamferBox, lathe, sideExtrude, sectionExtrude, polygon, Kit } from '../../src/kit.js';

// every face of a closed convex part must face away from its centre
function outward(g, c = [0, 0, 0]) {
  const p = g.attributes.position.array; let bad = 0;
  for (let i = 0; i < p.length; i += 9) {
    const a = new THREE.Vector3(p[i], p[i + 1], p[i + 2]), b = new THREE.Vector3(p[i + 3], p[i + 4], p[i + 5]), d = new THREE.Vector3(p[i + 6], p[i + 7], p[i + 8]);
    const n = new THREE.Vector3().crossVectors(b.clone().sub(a), d.clone().sub(a)); const m = a.add(b).add(d).divideScalar(3).sub(new THREE.Vector3(...c));
    if (n.dot(m) <= 0) bad++;
  }
  return bad;
}
describe('kit primitives', () => {
  it('chamfer box: 26 faces, all outward, right size, chamfers marked', () => {
    const g = chamferBox(0.2, 0.1, 0.4, 0.01);
    expect(g.attributes.position.count).toBe((6 * 2 + 12 * 2 + 8) * 3);
    expect(outward(g)).toBe(0);
    g.computeBoundingBox(); const s = g.boundingBox.getSize(new THREE.Vector3());
    expect(s.x).toBeCloseTo(0.2, 5); expect(s.y).toBeCloseTo(0.1, 5); expect(s.z).toBeCloseTo(0.4, 5);
    const e = g.attributes.edge.array; expect(e.filter(v => v === 1).length).toBe((12 * 2 + 8) * 3);
  });
  it('lathe runs along -Z from z0', () => {
    const g = lathe([[0, 0], [0.01, 0], [0.01, 0.1], [0, 0.1]], 12, { z0: 0.2 }); g.computeBoundingBox();
    expect(g.boundingBox.max.z).toBeCloseTo(-0.2, 4); expect(g.boundingBox.min.z).toBeCloseTo(-0.3, 4);
  });
  it('side extrusion has the given width along X', () => {
    const g = sideExtrude([[0, 0], [0.1, 0], [0.1, 0.05], [0, 0.05]], 0.03); g.computeBoundingBox();
    expect(g.boundingBox.max.x - g.boundingBox.min.x).toBeCloseTo(0.03, 4); expect(g.boundingBox.min.z).toBeCloseTo(-0.1, 2); // the bevel grows the outline by ~bevel
  });
  it('section extrusion faces outward (mirrored along Z)', () => {
    const g = sectionExtrude(polygon(8, 0.03), 0.1, 0.3, 0.002);
    expect(outward(g, [0, 0, -0.2])).toBe(0);
    g.computeBoundingBox(); expect(g.boundingBox.max.z).toBeCloseTo(-0.1, 3); expect(g.boundingBox.min.z).toBeCloseTo(-0.3, 3);
  });
  it('side extrusion faces outward', () => { expect(outward(sideExtrude([[0, 0], [0.1, 0], [0.1, 0.05], [0, 0.05]], 0.03), [0, 0.025, -0.05])).toBe(0); });
  it('kit merges one mesh per material and keeps ao/edge per vertex', () => {
    const a = new THREE.MeshStandardMaterial(), b = new THREE.MeshStandardMaterial(), k = new Kit();
    k.add(chamferBox(0.1, 0.1, 0.1), a, { at: [1, 0, 0], ao: 0.5 }).add(chamferBox(0.1, 0.1, 0.1), a).add(lathe([[0.01, 0], [0.01, 0.1]], 8), b);
    const g = k.build(); expect(g.children.length).toBe(2); expect(k.parts).toBe(3);
    const ka = g.children[0].geometry.attributes.kit; expect(ka.getX(0)).toBe(0.5); expect(ka.getX(ka.count - 1)).toBe(1);
    g.children[0].geometry.computeBoundingBox(); expect(g.children[0].geometry.boundingBox.max.x).toBeCloseTo(1.05, 5);
  });
});
describe('edge marks', () => {
  it('extrusions mark only the bevels, not the flat sides or walls', () => {
    const g = sideExtrude([[0, 0], [0.1, 0], [0.1, 0.05], [0, 0.05]], 0.03, 0.003);
    const n = g.attributes.normal, e = g.attributes.edge; let flat = 0, flatMarked = 0, bev = 0;
    for (let i = 0; i < n.count; i++) { const ax = Math.abs(n.getX(i)); if (ax > 0.99 || ax < 0.01) { flat++; if (e.getX(i)) flatMarked++; } else bev += e.getX(i); }
    expect(flat).toBeGreaterThan(0); expect(flatMarked).toBe(0); expect(bev).toBeGreaterThan(0);
  });
});
