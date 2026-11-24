// Gun feel (src/feel.js): Saltline's recoil split and recovery, springs that settle, no NaN at low frame rates.
import { describe, it, expect } from 'vitest';
import { Feel, TUNE } from '../../src/feel.js';

describe('recoil', () => {
  it('keeps 35 % of each shot in the aim and recovers the rest', () => {
    const f = new Feel(), pl = { pitch: 0, yaw: 0 };
    f.fire(pl, 0.02, 1, 0);
    expect(pl.pitch).toBeCloseTo(0.02 * TUNE.keep, 6);
    let off = 0; for (let i = 0; i < 300; i++) off = f.update(1 / 60, 0).pitch;
    expect(Math.abs(off)).toBeLessThan(1e-4);
  });
  it('stays finite and settles even at 5 fps with large inputs', () => {
    const f = new Feel(), pl = { pitch: 0, yaw: 0 };
    for (let i = 0; i < 30; i++) { f.fire(pl, 0.05, 3, 0); f.look(400, -300); f.landed(9); const o = f.update(0.2, 7); for (const v of Object.values(o).concat(Object.values(f.vm()))) expect(Number.isFinite(v)).toBe(true); }
    for (let i = 0; i < 600; i++) f.update(1 / 60, 0);
    for (const v of Object.values(f.vm())) expect(Math.abs(v)).toBeLessThan(1e-3);
  });
});
