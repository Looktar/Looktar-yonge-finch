// Car geometry (src/cars.js): closed shells facing outward, tyres resting on the road, plausible dimensions.
import { describe, it, expect } from 'vitest';
import { carGeoms, wheelGeoms } from '../../src/cars.js';

const box = g => { const p = g.attributes.position.array; const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9]; for (let i = 0; i < p.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[i + k]); hi[k] = Math.max(hi[k], p[i + k]); } return { lo, hi }; };

describe.each(['sedan', 'suv', 'hatch'])('%s', kind => {
  const g = carGeoms(kind);
  it('body normals point outward', () => {
    // radial test from the car's centre; the wheel-arch hollows are concave, so they are left out
    const p = g.body.attributes.position.array, n = g.body.attributes.normal.array; let out = 0, cnt = 0;
    const wb = g.wheels[0][1];
    for (let i = 0; i < p.length; i += 3) {
      const arch = p[i + 1] < g.tyre * 2.2 && (Math.abs(p[i + 2] - wb) < g.tyre + 0.2 || Math.abs(p[i + 2] + wb) < g.tyre + 0.2); if (arch) continue;
      cnt++; if (n[i] * p[i] + n[i + 1] * (p[i + 1] - 0.8) + n[i + 2] * p[i + 2] > 0) out++;
    }
    expect(out / cnt).toBeGreaterThan(0.97);
  });
  it('has real-world size', () => {
    const b = box(g.body); expect(b.hi[2] - b.lo[2]).toBeCloseTo(g.len, 1); expect(b.hi[0] - b.lo[0]).toBeLessThan(g.wid + 0.05); expect(b.hi[1]).toBeGreaterThan(1.3);
  });
  it('tyres touch the road and do not sink into it', () => {
    // world.js places each wheel at y = tyre radius, scaling the unit wheel (radius 0.34) by tyre / 0.34
    const w = box(wheelGeoms(0.34).tyre); const s = g.tyre / 0.34; const bottom = g.tyre + w.lo[1] * s;
    expect(Math.abs(bottom)).toBeLessThan(0.01);
  });
  it('body clears the ground (wheels show under the arches)', () => { expect(box(g.body).lo[1]).toBeGreaterThan(0.15); });
});
