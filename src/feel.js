// Gun feel, after Saltline's player/viewmodel tuning:
// - camera recoil: each shot lifts the aim; 35 % stays (you must pull down), 65 % is a temporary offset the camera
//   chases quickly (rate 34) and that recovers (rate 6.5) once you stop firing for 0.09 s
// - trauma shake: shake amount = trauma^2, trauma decays 1.7 / s
// - the viewmodel rides damped springs: recoil (kick back, rise, yaw, roll), mouse sway (lags the look and swings
//   back), strafe inertia (rolls into the move), landing dip
const damp = (a, b, k, dt) => b + (a - b) * Math.exp(-k * dt);

class Spring { // critically-damped-ish spring around a target
  constructor(k, z) { this.k = k; this.z = z; this.x = 0; this.v = 0; }
  step(dt, t = 0) { const a = -this.k * (this.x - t) - 2 * this.z * Math.sqrt(this.k) * this.v; this.v += a * dt; this.x += this.v * dt; return this.x; }
}

export const TUNE = { keep: 0.35, apply: 34, recover: 6.5, hold: 0.09, shakeDecay: 1.7, shakePitch: 0.03, shakeYaw: 0.03, shakeRoll: 0.045, swayLag: 0.0016, swayMax: 0.075, sprintFov: 6 };

export class Feel {
  constructor() {
    this.recV = 0; this.recY = 0; this.recB = 0; this.recG = 0; this.hold = 0; this.trauma = 0; this.t = 0; this.mdx = 0; this.mdy = 0;
    this.back = new Spring(260, 0.55); this.rise = new Spring(190, 0.5); this.yaw = new Spring(210, 0.5); this.roll = new Spring(170, 0.45); this.up = new Spring(220, 0.55);
    this.swY = new Spring(150, 0.64); this.swP = new Spring(150, 0.64); this.inX = new Spring(120, 0.7); this.inR = new Spring(120, 0.7); this.land = new Spring(300, 0.56);
  }
  look(dx, dy) { this.mdx += dx; this.mdy += dy; }
  // rise in radians of camera kick; kick scales the viewmodel impulse; ads damps both
  fire(player, rise, kick, ads) {
    const a = 1 - 0.45 * ads, yawJ = (Math.random() - 0.5) * rise * 0.7;
    player.pitch = Math.max(-1.45, Math.min(1.45, player.pitch + rise * TUNE.keep * a)); player.yaw += yawJ * TUNE.keep * a;
    this.recV = Math.max(-0.3, Math.min(0.3, this.recV + rise * (1 - TUNE.keep) * a)); this.recY = Math.max(-0.2, Math.min(0.2, this.recY + yawJ * (1 - TUNE.keep) * a)); this.hold = TUNE.hold;
    const k = kick * (1 - 0.55 * ads);
    this.back.v += 16 * k; this.rise.v += 9 * k; this.yaw.v += (Math.random() - 0.5) * 5 * k; this.roll.v += (Math.random() - 0.5) * 9 * k; this.up.v += 8 * k; // peaks ~2.5 cm back, ~3.5 deg rise
    this.shake(0.06 * kick);
  }
  shake(a) { this.trauma = Math.min(1, this.trauma + a); }
  landed(speed) { this.land.v -= Math.min(2.2, speed * 0.32); this.shake(Math.min(0.35, speed * 0.03)); }
  // returns the camera offsets for this frame
  update(dt, strafe) {
    this.t += dt;
    this.hold -= dt; if (this.hold <= 0) { this.recV = damp(this.recV, 0, TUNE.recover, dt); this.recY = damp(this.recY, 0, TUNE.recover, dt); }
    this.recB = damp(this.recB, this.recV, TUNE.apply, dt); this.recG = damp(this.recG, this.recY, TUNE.apply, dt);
    this.trauma = Math.max(0, this.trauma - TUNE.shakeDecay * dt);
    const s = this.trauma * this.trauma, t = this.t;
    const n = (f, o) => Math.sin(t * f + o) * 0.6 + Math.sin(t * f * 2.31 + o * 1.7) * 0.4;
    for (const sp of [this.back, this.rise, this.yaw, this.roll, this.up, this.land]) sp.step(dt);
    this.swY.step(dt, Math.max(-TUNE.swayMax, Math.min(TUNE.swayMax, -this.mdx * TUNE.swayLag)));
    this.swP.step(dt, Math.max(-TUNE.swayMax, Math.min(TUNE.swayMax, -this.mdy * TUNE.swayLag)));
    this.inX.step(dt, -strafe * 0.0045); this.inR.step(dt, -strafe * 0.014);
    this.mdx = 0; this.mdy = 0;
    return { pitch: this.recB + s * TUNE.shakePitch * n(37, 0.3), yaw: this.recG + s * TUNE.shakeYaw * n(31, 2.1), roll: s * TUNE.shakeRoll * n(27, 4.2) };
  }
  // viewmodel offsets (metres / radians, gun space)
  vm() {
    return {
      x: this.inX.x + this.swY.x * 0.25, y: this.up.x * 0.02 + this.land.x * 0.3 - this.swP.x * 0.2, z: this.back.x * 0.025,
      rx: this.rise.x * 0.09 + this.swP.x, ry: this.yaw.x * 0.05 + this.swY.x, rz: this.roll.x * 0.06 + this.inR.x + this.swY.x * 0.5,
    };
  }
}
