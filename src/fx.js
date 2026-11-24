import * as THREE from 'three';

// ---------- particles ----------
export class Particles {
  constructor(scene, max, additive, tex) {
    this.max = max; this.n = 0;
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 4); this.size = new Float32Array(max);
    this.vel = new Float32Array(max * 3); this.life = new Float32Array(max); this.maxLife = new Float32Array(max); this.grav = new Float32Array(max); this.drag = new Float32Array(max); this.grow = new Float32Array(max); this.a0 = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    const m = new THREE.ShaderMaterial({
      uniforms: { map: { value: tex }, uScale: { value: 400 } }, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      vertexShader: 'attribute float size; attribute vec4 color; varying vec4 vC; uniform float uScale; void main(){ vC=color; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize = size*uScale/max(0.1,-mv.z); gl_Position=projectionMatrix*mv; }',
      fragmentShader: 'uniform sampler2D map; varying vec4 vC; void main(){ vec4 t=texture2D(map, gl_PointCoord); gl_FragColor=vec4(vC.rgb, vC.a*t.a); if(gl_FragColor.a<0.01) discard; }',
    });
    this.mat = m; this.pts = new THREE.Points(g, m); this.pts.frustumCulled = false; scene.add(this.pts); this.geo = g;
  }
  emit(x, y, z, vx, vy, vz, life, size, r, g, b, a, grav = 0, drag = 0, grow = 0) {
    let i = this.n < this.max ? this.n++ : Math.floor(Math.random() * this.max);
    this.pos.set([x, y, z], i * 3); this.vel.set([vx, vy, vz], i * 3); this.col.set([r, g, b, a], i * 4);
    this.size[i] = size; this.life[i] = life; this.maxLife[i] = life; this.grav[i] = grav; this.drag[i] = drag; this.grow[i] = grow; this.a0[i] = a;
  }
  update(dt) {
    for (let i = 0; i < this.n; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) { // swap remove
        const j = --this.n; if (i !== j) { for (const [arr, k] of [[this.pos, 3], [this.vel, 3], [this.col, 4]]) for (let c = 0; c < k; c++) arr[i * k + c] = arr[j * k + c]; for (const arr of [this.size, this.life, this.maxLife, this.grav, this.drag, this.grow, this.a0]) arr[i] = arr[j]; }
        this.size[j] = 0; i--; continue;
      }
      const d = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[i * 3] *= d; this.vel[i * 3 + 2] *= d; this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * d - this.grav[i] * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      if (this.pos[i * 3 + 1] < 0.02) { this.pos[i * 3 + 1] = 0.02; this.vel[i * 3 + 1] *= -0.2; this.vel[i * 3] *= 0.5; this.vel[i * 3 + 2] *= 0.5; }
      this.size[i] += this.grow[i] * dt;
      this.col[i * 4 + 3] = this.a0[i] * Math.min(1, this.life[i] / this.maxLife[i] * 1.6);
    }
    this.geo.setDrawRange(0, this.n);
    for (const k of ['position', 'color', 'size']) this.geo.attributes[k].needsUpdate = true;
  }
}

// ---------- dusk sky ----------
// sun low in the west-south-west (azimuth ~240 deg, ~7 deg above the horizon): late-November sunset in Toronto
export const SUN = (() => { const az = 240 * Math.PI / 180, el = 7 * Math.PI / 180; return new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize(); })();
export function makeSky() {
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, uniforms: { uSun: { value: SUN.clone() } },
    vertexShader: 'varying vec3 vD; void main(){ vD=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: `varying vec3 vD; uniform vec3 uSun;
      float hh(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); }
      float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(hh(i),hh(i+vec2(1,0)),f.x), mix(hh(i+vec2(0,1)),hh(i+vec2(1,1)),f.x), f.y); }
      float fbm(vec2 p){ float v=0.0, a=0.5; for(int i=0;i<5;i++){ v+=vn(p)*a; p*=2.03; a*=0.5; } return v; }
      void main(){
        vec3 d = normalize(vD); float y = d.y; float s = max(dot(d, uSun), 0.0);
        float az = dot(normalize(d.xz + 1e-5), normalize(uSun.xz)) * 0.5 + 0.5;
        vec3 zen = vec3(0.06, 0.12, 0.30), mid = vec3(0.30, 0.38, 0.60);
        vec3 horSun = vec3(1.25, 0.58, 0.24), horAnti = vec3(0.55, 0.45, 0.58);
        vec3 hor = mix(horAnti, horSun, pow(az, 2.2));
        vec3 c = mix(hor, mid, smoothstep(0.0, 0.28 + 0.12 * az, y));
        c = mix(c, zen, smoothstep(0.25, 0.95, y));
        c += vec3(1.0, 0.55, 0.25) * pow(s, 6.0) * 0.55 + vec3(1.0, 0.72, 0.42) * pow(s, 60.0) * 1.4;
        c += vec3(14.0, 9.0, 5.0) * smoothstep(0.99955, 0.9998, s);
        // broken stratocumulus deck (late-November Toronto): dark violet undersides, edges and thin parts lit
        // orange by the sun just under the deck; plus high cirrus streaks catching the last light
        vec2 cp = d.xz / (y + 0.07);
        float wq = fbm(cp * 0.55 + vec2(1.7, 9.2));
        float n = fbm(cp * 0.9 + wq * 1.6 + vec2(5.0, 2.0));
        float cov = 0.5 - 0.06 * az;
        float dens = smoothstep(cov, cov + 0.2, n) * smoothstep(0.015, 0.11, y) * (1.0 - 0.35 * smoothstep(0.5, 0.95, y));
        float thin = 1.0 - smoothstep(cov + 0.03, cov + 0.26, n);
        vec3 under = mix(vec3(0.17, 0.15, 0.22), vec3(0.42, 0.27, 0.3), pow(az, 1.4)) * (0.85 + 0.3 * fbm(cp * 2.7));
        vec3 rim = vec3(1.9, 0.82, 0.34) * (0.25 + 2.2 * pow(s, 4.0)) * pow(az, 1.8);
        vec3 deck = under + rim * (0.35 + 0.65 * thin);
        vec2 hp = d.xz / (y + 0.2);
        float ci = fbm(hp * vec2(0.3, 1.6) + vec2(3.0, 1.0)); ci = smoothstep(0.55, 0.8, ci) * smoothstep(0.05, 0.3, y) * (1.0 - smoothstep(0.6, 0.95, y));
        c = mix(c, mix(vec3(0.62, 0.45, 0.56), vec3(1.45, 0.7, 0.36), pow(az, 1.4)), ci * 0.5);
        c = mix(c, deck, dens * 0.93);
        // warm haze band hugging the horizon
        c = mix(c, hor * 1.05, (1.0 - smoothstep(0.0, 0.06, y)) * 0.6);
        if (y < 0.0) c = mix(hor * 0.8, vec3(0.16, 0.14, 0.15), smoothstep(0.0, -0.2, y));
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  return new THREE.Mesh(new THREE.SphereGeometry(450, 48, 24), m);
}

// ---------- audio (all synthesized) ----------
export class Sfx {
  constructor() { this.ok = false; }
  init() {
    if (this.ok) return; try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
    const c = this.ctx; this.ok = true; this.master = c.createGain(); this.master.gain.value = 0.7; this.master.connect(c.destination);
    const len = c.sampleRate * 2; this.noise = c.createBuffer(1, len, c.sampleRate); const d = this.noise.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // evening city bed: distant traffic rumble + gusting wind (the streets are empty, the city around is not)
    const src = c.createBufferSource(); src.buffer = this.noise; src.loop = true; src.playbackRate.value = 0.6; const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 260; const g = c.createGain(); g.gain.value = 0.2;
    src.connect(f); f.connect(g); g.connect(this.master); src.start();
    const src2 = c.createBufferSource(); src2.buffer = this.noise; src2.loop = true; const f3 = c.createBiquadFilter(); f3.type = 'bandpass'; f3.frequency.value = 700; f3.Q.value = 0.6; const g2 = c.createGain(); g2.gain.value = 0.03;
    const lfo = c.createOscillator(); lfo.frequency.value = 0.09; const lg = c.createGain(); lg.gain.value = 0.025; lfo.connect(lg); lg.connect(g2.gain);
    const lfo2 = c.createOscillator(); lfo2.frequency.value = 0.05; const lg2 = c.createGain(); lg2.gain.value = 300; lfo2.connect(lg2); lg2.connect(f3.frequency);
    src2.connect(f3); f3.connect(g2); g2.connect(this.master); src2.start(); lfo.start(); lfo2.start();
  }
  resume() { if (this.ok && this.ctx.state === 'suspended') this.ctx.resume(); }
  burst(dur, freq, q, gain, type = 'lowpass', pan = 0, delay = 0) {
    const c = this.ctx, t = c.currentTime + delay; const s = c.createBufferSource(); s.buffer = this.noise; s.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; const g = c.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    const p = c.createStereoPanner(); p.pan.value = pan; s.connect(f); f.connect(g); g.connect(p); p.connect(this.master); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }
  tone(f0, f1, dur, gain, type = 'sine', pan = 0, delay = 0) {
    const c = this.ctx, t = c.currentTime + delay; const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); const p = c.createStereoPanner(); p.pan.value = pan;
    o.connect(g); g.connect(p); p.connect(this.master); o.start(t); o.stop(t + dur + 0.05);
  }
  shot(kind) { if (!this.ok) return; if (kind === 1) { this.burst(0.5, 1400, 0.7, 1.2); this.tone(120, 40, 0.35, 0.9); } else if (kind === 2) { this.burst(0.18, 2600, 0.8, 0.7, 'bandpass'); this.tone(200, 60, 0.15, 0.5); } else { this.burst(0.22, 2000, 0.6, 0.85); this.tone(150, 50, 0.18, 0.6); } }
  click() { if (this.ok) this.tone(1800, 1200, 0.04, 0.15, 'square'); }
  reload() { if (!this.ok) return; this.tone(900, 700, 0.05, 0.15, 'square'); this.tone(500, 300, 0.07, 0.15, 'square', 0, 0.35); this.tone(1100, 900, 0.05, 0.18, 'square', 0, 0.9); }
  hit() { if (this.ok) { this.burst(0.12, 700, 1.5, 0.5, 'bandpass'); } }
  head() { if (this.ok) { this.tone(2200, 1800, 0.06, 0.2, 'triangle'); } }
  hurt() { if (this.ok) { this.tone(90, 45, 0.3, 0.8); this.burst(0.2, 400, 1, 0.6); } }
  groan(pan, vol, deep) { if (!this.ok) return; const c = this.ctx, t = c.currentTime; const o = c.createOscillator(); o.type = 'sawtooth'; const f0 = (deep ? 55 : 85) + Math.random() * 40; o.frequency.setValueAtTime(f0, t); o.frequency.linearRampToValueAtTime(f0 * (0.7 + Math.random() * 0.2), t + 1.1);
    const lfo = c.createOscillator(); lfo.frequency.value = 6 + Math.random() * 6; const lg = c.createGain(); lg.gain.value = 8; lfo.connect(lg); lg.connect(o.frequency);
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 500 + Math.random() * 400; f.Q.value = 3; const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.2); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
    const p = c.createStereoPanner(); p.pan.value = pan; o.connect(f); f.connect(g); g.connect(p); p.connect(this.master); o.start(t); lfo.start(t); o.stop(t + 1.3); lfo.stop(t + 1.3); }
  siren(pan) { if (!this.ok) return; const c = this.ctx, t = c.currentTime, D = 9; const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = 900;
    const l = c.createOscillator(); l.frequency.value = 0.32; const lg = c.createGain(); lg.gain.value = 330; l.connect(lg); lg.connect(o.frequency);
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1400; const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.035, t + 3); g.gain.exponentialRampToValueAtTime(0.0001, t + D);
    const p = c.createStereoPanner(); p.pan.value = pan; o.connect(f); f.connect(g); g.connect(p); p.connect(this.master); o.start(t); l.start(t); o.stop(t + D + 0.1); l.stop(t + D + 0.1); }
  step() { if (this.ok) this.burst(0.08, 900, 1, 0.12, 'bandpass'); }
  pickup() { if (this.ok) { this.tone(600, 900, 0.1, 0.25, 'triangle'); this.tone(900, 1300, 0.12, 0.2, 'triangle', 0, 0.08); } }
  wave() { if (this.ok) { this.tone(70, 50, 2.5, 0.6, 'sawtooth'); this.tone(105, 70, 2.5, 0.3, 'sawtooth'); } }
}
