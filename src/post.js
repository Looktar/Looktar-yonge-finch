// Final "camera" pass, modelled on Saltline's post chain: works on the HDR (linear) frame after bloom and does
// sun shafts (radial scatter of the bright sky around the sun), an anamorphic streak on highlights, auto exposure,
// ACES/AgX blended tone mapping, a contrast/saturation look, chromatic aberration, unsharp sharpening, film grain
// and vignette, then outputs sRGB. Replaces three's OutputPass.
import * as THREE from 'three';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

export const LOOK = { agx: 0.25, pow: 1.18, sat: 1.22, ca: 0.0013, sharpen: 0.3, grain: 0.02, vignette: 0.3, shafts: 0.55, streak: 0.05, key: 0.16, minExp: 0.6, maxExp: 2.0, tau: 1.5 };

export function makeFinalPass() {
  const pass = new ShaderPass({
    uniforms: {
      tDiffuse: { value: null }, toneMappingExposure: { value: 1 }, uTexel: { value: new THREE.Vector2(1 / 1024, 1 / 1024) }, uTime: { value: 0 },
      uSun: { value: new THREE.Vector3(0.5, 0.5, 0) }, uShafts: { value: LOOK.shafts }, uStreak: { value: LOOK.streak },
      uAgx: { value: LOOK.agx }, uPow: { value: LOOK.pow }, uSat: { value: LOOK.sat }, uCA: { value: LOOK.ca }, uSharpen: { value: LOOK.sharpen }, uGrain: { value: LOOK.grain }, uVig: { value: LOOK.vignette },
      uSunCol: { value: new THREE.Color(1.0, 0.62, 0.34) },
    },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      #include <common>
      #include <tonemapping_pars_fragment>
      #include <colorspace_pars_fragment>
      uniform sampler2D tDiffuse; uniform vec2 uTexel; uniform float uTime; uniform vec3 uSun; uniform float uShafts, uStreak, uAgx, uPow, uSat, uCA, uSharpen, uGrain, uVig; uniform vec3 uSunCol;
      varying vec2 vUv;
      float lum(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
      vec3 hdr(vec2 uv){ return texture2D(tDiffuse, uv).rgb; }
      vec3 tone(vec3 c){ vec3 a = ACESFilmicToneMapping(c); vec3 g = AgXToneMapping(c); return mix(a, g, uAgx); }
      vec3 grade(vec3 c){ c = pow(max(c, 0.0), vec3(uPow)); float l = lum(c); return max(mix(vec3(l), c, uSat), 0.0); }
      vec3 shade(vec2 uv){
        vec2 d = uv - 0.5; float r = length(d);
        // chromatic aberration grows towards the edges
        vec2 ca = d * uCA * (1.0 + 3.0 * r);
        vec3 c = vec3(hdr(uv + ca).r, hdr(uv).g, hdr(uv - ca).b);
        return c;
      }
      void main(){
        vec2 uv = vUv; vec3 c = shade(uv);
        // sun shafts: march toward the sun, gathering only the very bright sky
        if (uSun.z > 0.001 && uShafts > 0.0) {
          vec2 dv = (uSun.xy - uv) / 18.0; vec2 p = uv; float acc = 0.0, w = 1.0;
          for (int i = 0; i < 18; i++) { p += dv; float b = max(lum(hdr(p)) - 1.6, 0.0); acc += min(b, 6.0) * w; w *= 0.93; }
          float fall = 1.0 - smoothstep(0.0, 0.9, length((uv - uSun.xy) * vec2(uTexel.y / uTexel.x, 1.0)));
          c += uSunCol * acc / 18.0 * uShafts * uSun.z * (0.35 + 0.65 * fall);
        }
        // anamorphic streak on highlights (lamps, signal heads, sun)
        if (uStreak > 0.0) {
          vec3 st = vec3(0.0);
          for (int i = -7; i <= 7; i++) { if (i == 0) continue; float o = float(i) * 0.018; vec3 s = hdr(uv + vec2(o, 0.0)); st += max(s - 2.5, 0.0) * (1.0 - abs(float(i)) / 8.0); }
          c += st * vec3(0.55, 0.7, 1.0) * uStreak;
        }
        // tone map (exposure is applied by the chunk via toneMappingExposure), then the look
        vec3 t = tone(c);
        // unsharp mask on the tone-mapped neighbours
        vec3 nb = tone((hdr(uv + vec2(uTexel.x, 0.0)) + hdr(uv - vec2(uTexel.x, 0.0)) + hdr(uv + vec2(0.0, uTexel.y)) + hdr(uv - vec2(0.0, uTexel.y))) * 0.25);
        t = max(t + (t - nb) * uSharpen, 0.0);
        t = grade(t);
        vec2 d = uv - 0.5; t *= 1.0 - uVig * smoothstep(0.25, 0.95, length(d * vec2(1.0, 0.8)) * 1.35);
        vec4 o = sRGBTransferOETF(vec4(clamp(t, 0.0, 1.0), 1.0));
        float g = fract(sin(dot(uv * 1000.0 + uTime * 13.7, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
        o.rgb += g * uGrain;
        gl_FragColor = vec4(o.rgb, 1.0);
      }`,
  });
  // auto exposure: read a 16x16 copy of the HDR frame every few frames and ease toward key / average luminance
  const small = new THREE.WebGLRenderTarget(16, 16, { type: THREE.HalfFloatType, depthBuffer: false });
  const copy = new THREE.ShaderMaterial({ uniforms: { t: { value: null } }, vertexShader: 'varying vec2 v; void main(){ v = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }', fragmentShader: 'uniform sampler2D t; varying vec2 v; void main(){ gl_FragColor = texture2D(t, v); }', depthTest: false, depthWrite: false });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), copy); const qs = new THREE.Scene(); qs.add(quad); const qc = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const buf = new Uint16Array(16 * 16 * 4); let n = 0, exp = 1, auto = true;
  const half = h => { const s = (h & 0x8000) ? -1 : 1, e = (h >> 10) & 31, f = h & 1023; return e === 0 ? s * 6.1e-5 * (f / 1024) : e === 31 ? 0 : s * Math.pow(2, e - 15) * (1 + f / 1024); };
  const sv = new THREE.Vector3();
  pass.update = (renderer, readTex, dt, camera, sunDir) => {
    const U = pass.uniforms; U.uTime.value += dt;
    if (auto && (n++ % 15) === 0 && readTex) {
      copy.uniforms.t.value = readTex; const prev = renderer.getRenderTarget(); renderer.setRenderTarget(small); renderer.render(qs, qc); renderer.readRenderTargetPixels(small, 0, 0, 16, 16, buf); renderer.setRenderTarget(prev);
      let s = 0; for (let i = 0; i < buf.length; i += 4) { const l = 0.2126 * half(buf[i]) + 0.7152 * half(buf[i + 1]) + 0.0722 * half(buf[i + 2]); s += Math.log(1e-4 + Math.max(0, l)); }
      pass.avg = Math.exp(s / 256);
    }
    if (pass.avg) { const target = THREE.MathUtils.clamp(LOOK.key / pass.avg, LOOK.minExp, LOOK.maxExp); exp += (target - exp) * (1 - Math.exp(-dt * 15 / LOOK.tau / 15)); }
    U.toneMappingExposure.value = exp;
    // sun position on screen (z = visibility)
    sv.copy(camera.position).addScaledVector(sunDir, 1000).project(camera);
    const vis = sv.z < 1 ? THREE.MathUtils.clamp(1.4 - Math.max(Math.abs(sv.x), Math.abs(sv.y)) * 0.8, 0, 1) : 0;
    U.uSun.value.set(sv.x * 0.5 + 0.5, sv.y * 0.5 + 0.5, vis);
  };
  pass.setAuto = v => { auto = v; if (!v) exp = 1; };
  pass.setSize = (w, h) => pass.uniforms.uTexel.value.set(1 / w, 1 / h);
  return pass;
}
