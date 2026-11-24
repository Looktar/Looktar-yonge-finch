// Buildings: real OSM footprints + City of Toronto massing heights, dressed per-building to match the
// real Yonge & Finch streetscape (North American Centre's bronze-glass twin towers with sloped glass crowns,
// precast condo towers with balconies, glass towers, 1970s brick slabs, strip retail with shop signs,
// brick / stucco / siding houses with gable or hip roofs, the TTC & GO terminals).
import * as THREE from 'three';
import { B } from './data_b.js';
import { HM, BX } from './data_x.js';
import { nearestRoad } from './street.js';
import { wallArrays, TILE, WALL_LAYERS } from './pbr.js';

const dec = s => { const v = s.split(',').map(Number); const p = []; let x = 0, z = 0; for (let i = 0; i < v.length; i += 2) { x += v[i]; z += v[i + 1]; p.push([x / 2, z / 2]); } return p; };
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const area = p => { let s = 0; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; };
const pip = (x, z, p) => { let c = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const a = p[i], b = p[j]; if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
const centroid = p => { let x = 0, z = 0; for (const q of p) { x += q[0]; z += q[1]; } return [x / p.length, z / p.length]; };
const pick = (r, a) => a[Math.floor(r() * a.length) % a.length];

// style ids (shared with the facade shader)
export const ST = { HB: 0, HS: 1, HV: 2, CONDO: 3, GLASS: 4, RIB: 5, NAC: 6, RET: 7, BRK: 8, TRN: 9, INST: 10, MECH: 11, SLAB: 12, RFLAT: 14, RSH: 15, RGL: 16, PAR: 18 };
const HOUSE = { de: 1, ho: 1, se: 1, te: 1 };

const PALS = {
  brick: ['#8c4c38', '#7b4535', '#9a5a44', '#a9865f', '#b99b74', '#6f4b3d', '#8f6a52'],
  buff: ['#b49a74', '#a98d68', '#c2a983', '#9e8462'],
  brown: ['#6e4a3a', '#7a5643', '#664536'],
  stucco: ['#cdc2ac', '#d8cfbc', '#bcb19e', '#c9bead', '#aaa59b', '#d2c7b0'],
  siding: ['#c8ccce', '#a9b2b7', '#d5d1c3', '#8e999d', '#dfdcd2', '#9aa59a'],
  white: ['#d8d5ce', '#cfccc4', '#e1ded6', '#c9c7c1'],
  beige: ['#cbb99b', '#c2b193', '#d1c2a6'],
  grey: ['#9e9f9e', '#8b8e90', '#adaeaa', '#7f8386'],
  roof: ['#2b2a2b', '#36302c', '#3e3a37', '#22252a', '#4a4038'],
  glass: { teal: '#3c6e6c', blue: '#4b5d70', green: '#40685a', dark: '#1d242c', bronze: '#6e4b33', silver: '#7f8b95', clear: '#2a333b' },
};
// colour / material tags from OpenStreetMap (building:colour, building:material) and known landmarks
const TAGS = [
  [-21, 292, 'white'], [-30, 237, 'white'], [-22, 265, 'white'], [-16, 264, 'white'], [17, -348, 'grey'], [30, -280, 'grey'],
  [-107, -241, 'grey-office'], [-37, -303, 'glass-office'], [-58, -423, 'white'], [-50, -382, 'white'], [102, -14, 'brown'],
  [80, -127, 'white'], [88, -126, 'white'], [171, -120, 'beige'], [164, -88, 'beige'], [172, -151, 'beige'], [199, 124, 'olive'],
];
// shop signs at their real addresses
const NAMED_SIGNS = [[-36, 189, 0], [50, 217, 1], [54, 175, 2], [0, -24, 3], [-21, -159, 4], [49, -36, 5], [20, -157, 4]];

function parseBuildings() {
  const list = []; const hm = HM.split(';');
  B.split('\n').forEach((line, i) => {
    const f = line.split('|'); const t = f[1]; const p = dec(f[5]); if (p.length < 3) return;
    const h = f[2] ? +f[2] : 0, lv = f[3] ? +f[3] : 0, mh = f[4] ? +f[4] : 0;
    const m = hm[i] ? hm[i].split('/').map(Number) : null;
    list.push({ t, h, lv, mh, m, p: area(p) < 0 ? p.slice().reverse() : p, part: t === 'P' });
  });
  for (const line of BX.split('\n')) { const f = line.split('|'); const p = dec(f[5]); const a = +f[2]; list.push({ t: a > 20 ? 'ap' : 'ye', h: 0, lv: 0, mh: 0, m: [0, a, 0], p: area(p) < 0 ? p.slice().reverse() : p, part: false, src: 'city' }); }
  const parts = list.filter(b => b.part);
  const keep = list.filter(b => b.part || !parts.some(q => { const c = centroid(q.p); return pip(c[0], c[1], b.p); }));
  const stats = { city: 0, osm: 0, est: 0 };
  for (const b of keep) {
    let H, est;
    if (b.h) est = b.h; else if (b.lv) est = b.lv * 3.1 + (HOUSE[b.t] ? 0.4 : 1.2);
    b.house = !!HOUSE[b.t] && Math.abs(area(b.p)) < 420 && b.p.length <= 12;
    b.rh = 2.3;
    const avg = b.m ? b.m[1] : 0, mx = b.m ? b.m[0] : 0;
    if (b.part && est) { H = est; stats.osm++; } // building parts share their parent's massing record: trust the part's own height
    else if (avg > 0.5 && !(est && Math.abs(avg - est) / est > 0.6)) {
      if (b.house) { H = Math.max(2.8, avg - 1.0); b.rh = mx > 0 ? Math.min(4.5, Math.max(1.4, mx - H)) : 2.3; }
      else H = avg;
      if (b.m[2] > 1 && !b.mh) b.mh = b.m[2];
      stats.city++;
    } else if (est) { H = est; stats.osm++; }
    else { H = { de: 6.2, ho: 6.2, se: 6.2, te: 7, ap: 11, of: 14, re: 5.5, co: 6, ye: 4.5, tr: 6, sc: 8, sh: 6, P: 6 }[b.t] || 6; stats.est++; }
    b.H = Math.max(H, b.mh + 2.5);
    b.c = centroid(b.p); b.A = Math.abs(area(b.p));
  }
  keep.stats = stats;
  return keep;
}

const C = (hex) => new THREE.Color(hex).convertSRGBToLinear();
function tagAt(c) { let best = null, bd = 14; for (const t of TAGS) { const d = Math.hypot(t[0] - c[0], t[1] - c[1]); if (d < bd) { bd = d; best = t[2]; } } return best; }

function assignStyle(b, r) {
  const [cx, cz] = b.c; const tag = tagAt(b.c);
  b.fh = 3.0; b.acc = C(PALS.glass.clear); b.balc = null; b.roofKind = 'flat';
  const nac = cx > -118 && cx < -22 && cz > -98 && cz < 88;
  if (nac && b.H > 40) { // North American Centre: rose granite bands + bronze reflective glass, sloped glass crowns
    b.st = ST.NAC; b.wall = C('#cbbfb6'); b.acc = C('#7d6a58'); b.fh = 3.9; b.res = false; b.noSigns = true; // pale warm-grey granite (Street View), bronze-grey glass
    if (b.part && Math.abs(b.h - 84) < 1) b.crown = { h: 14, dir: cz < 0 ? 35 : 125 };
    return;
  }
  if (nac && (b.t === 'co' || b.part)) { b.st = ST.NAC; b.wall = C('#c8bcb3'); b.acc = C('#7d6a58'); b.fh = 4.4; b.noSigns = true; if (b.part && b.H < 10) b.crown = { h: 3.5, dir: 35 }; return; }
  const near = (x, z, d) => Math.hypot(cx - x, cz - z) < d;
  if (b.t === 'tr' || (b.t === 'ye' && (near(-21, -159, 12) || near(20, -157, 12)))) {
    b.st = ST.TRN; b.fh = 4; b.wall = C(near(-21, -159, 12) || near(20, -157, 12) ? '#d6d6d0' : '#9c998f'); b.acc = C('#34434b'); return;
  }
  if (b.house) {
    const k = r(); b.st = k < 0.45 ? ST.HB : k < 0.8 ? ST.HS : ST.HV; b.fh = 2.9;
    b.wall = C(pick(r, b.st === ST.HB ? (r() < 0.3 ? PALS.buff : PALS.brick) : b.st === ST.HS ? PALS.stucco : PALS.siding));
    b.roof = C(pick(r, PALS.roof)); b.roofKind = 'pitched'; b.acc = C('#161b20'); return;
  }
  if (b.t === 'sc') { b.st = ST.INST; b.fh = 3.7; b.wall = C(pick(r, PALS.buff)); b.acc = C(PALS.glass.blue); return; }
  if (b.t === 'of' || tag === 'grey-office' || tag === 'glass-office') {
    if (tag === 'glass-office') { b.st = ST.GLASS; b.wall = C('#4f5a60'); b.acc = C(PALS.glass.green); }
    else { b.st = ST.RIB; b.wall = C(pick(r, PALS.grey)); b.acc = C(r() < 0.5 ? PALS.glass.blue : PALS.glass.dark); }
    b.fh = 3.8; return;
  }
  if (['re', 'co', 'sh'].includes(b.t) || (b.t === 'ye' && b.H < 10 && b.A > 90)) {
    b.st = ST.RET; b.fh = 4.6; b.wall = C(pick(r, r() < 0.5 ? PALS.stucco : PALS.buff)); b.acc = C('#1a1d21'); b.retail = true;
    if (b.lv && b.lv <= 2 && !b.part) b.H = Math.min(b.H, b.lv * 3.6 + 1.4); // one / two-storey strip retail (Street View), the massing average includes rooftop units
    return;
  }
  if (b.t === 'ye' || b.H < 4.5) { b.st = ST.SLAB; b.wall = C(pick(r, PALS.grey)); return; }
  // residential & mixed
  const tall = b.H > 30;
  b.res = true;
  if (b.part && b.H < 14) { b.st = ST.RIB; b.fh = 4.2; b.wall = C(pick(r, PALS.white)); b.acc = C(PALS.glass.blue); return; }
  if (!tall) { // low & mid-rise apartments: brick with punched windows; balconies when 4+ storeys
    b.st = ST.BRK; b.fh = 2.85; b.wall = C(pick(r, r() < 0.5 ? PALS.brick : PALS.buff)); b.acc = C('#1a2026');
    if (b.H > 12) b.balc = { kind: 'stack', solid: true, d: 1.3 }; return;
  }
  b.fh = 2.9;
  const choose = () => { const k = r(); return k < 0.32 ? 'white' : k < 0.5 ? 'beige' : k < 0.7 ? 'teal' : k < 0.84 ? 'dark' : 'buff'; };
  const kind = tag === 'white' || tag === 'grey' || tag === 'beige' || tag === 'brown' || tag === 'olive' ? tag : choose();
  if (kind === 'brown' || kind === 'buff') { // 1970s-80s brick slab with stacked concrete balconies
    b.st = ST.BRK; b.wall = C(pick(r, kind === 'brown' ? PALS.brown : PALS.buff)); b.acc = C('#1c2228'); b.balc = { kind: 'stack', solid: true, d: 1.5 };
  } else if (kind === 'teal' || kind === 'dark' || kind === 'olive') { // glass tower, glass balconies
    b.st = ST.GLASS; b.wall = C(kind === 'olive' ? '#3a3e43' : kind === 'teal' ? '#5d7f7c' : '#2a3038');
    b.acc = C(kind === 'teal' ? PALS.glass.teal : kind === 'olive' ? PALS.glass.silver : PALS.glass.dark);
    b.balc = { kind: kind === 'olive' ? 'wrap' : r() < 0.5 ? 'wrap' : 'stack', solid: false, d: 1.6, slab: kind === 'olive' ? C('#e4e2dc') : null };
  } else { // precast condo with window walls and glass balconies (the Yonge corridor default)
    b.st = ST.CONDO; b.wall = C(pick(r, PALS[kind] || PALS.white)); b.acc = C(r() < 0.55 ? PALS.glass.teal : r() < 0.5 ? PALS.glass.blue : PALS.glass.green);
    b.balc = { kind: r() < 0.5 ? 'wrap' : 'stack', solid: false, d: 1.5 };
  }
}

// ---------- geometry builder ----------
class GB {
  constructor() { this.P = []; this.N = []; this.F = []; this.I = []; this.Cc = []; this.A = []; }
  // poly: array of [x,y,z,u,v]; n: expected outward normal (orientation is fixed to match it)
  face(poly, n, inf, col, acc) {
    const a = poly[0], b = poly[1], c = poly[2];
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    const flip = cx * n[0] + cy * n[1] + cz * n[2] < 0;
    for (let i = 1; i < poly.length - 1; i++) {
      const tri = flip ? [poly[0], poly[i + 1], poly[i]] : [poly[0], poly[i], poly[i + 1]];
      for (const q of tri) { this.P.push(q[0], q[1], q[2]); this.N.push(n[0], n[1], n[2]); this.F.push(q[3], q[4]); this.I.push(inf[0], inf[1], inf[2], inf[3]); this.Cc.push(col.r, col.g, col.b); this.A.push(acc.r, acc.g, acc.b); }
    }
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.N, 3));
    g.setAttribute('aFac', new THREE.Float32BufferAttribute(this.F, 2));
    g.setAttribute('aInfo', new THREE.Float32BufferAttribute(this.I, 4));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.Cc, 3));
    g.setAttribute('aAcc', new THREE.Float32BufferAttribute(this.A, 3));
    g.computeBoundingSphere(); return g;
  }
}

function capTris(p) { return THREE.ShapeUtils.triangulateShape(p.map(q => new THREE.Vector2(q[0], q[1])), []); }

// ---------- shop sign atlas ----------
export const SIGNS = [
  ['SHOPPERS DRUG MART', '#c8102e', '#ffffff'], ['H MART  한아름', '#d0202a', '#ffffff'], ['CIRCLE K', '#d52b1e', '#ffffff'], ['FINCH STATION', '#2a2c30', '#ffffff', '#da251d'],
  ['Finch GO Bus Terminal', '#1f7a3f', '#ffffff'], ['FINCH BUS TERMINAL', '#2a2c30', '#ffffff', '#da251d'], ['서울갈비 KOREAN BBQ', '#111111', '#ffd23f'], ['نان  PERSIAN BAKERY', '#11706f', '#ffffff'],
  ['PHO 88', '#f4f1ea', '#c3201f'], ['BUBBLE TEA 奶茶', '#f06292', '#ffffff'], ['DENTAL 치과', '#f6f7f9', '#1559a8'], ['OPTICAL', '#f3f3f3', '#121212'],
  ['PHARMACY 약국', '#0f7a3c', '#ffffff'], ['SUSHI 寿司', '#14284b', '#ffffff'], ['KABOB کباب', '#6b1420', '#f2c14e'], ['노래방 KARAOKE', '#0c0c10', '#ff3bd4'],
  ['BEAUTY 미용실', '#5b2a86', '#ffffff'], ['REAL ESTATE 부동산', '#efe6d2', '#1d2f5a'], ['EXCHANGE صرافی', '#0f4d2f', '#ffffff'], ['TRAVEL 여행사', '#e8711c', '#ffffff'],
  ['PIZZA', '#c62026', '#ffffff'], ['TEA HOUSE چای', '#5a3a22', '#f5e6c8'], ['PC방', '#08080a', '#2fe3ff'], ['CONVENIENCE', '#1d4fa0', '#ffffff'],
  ['BANK', '#0d2b52', '#ffffff'], ['NOODLE 拉面', '#b3161d', '#ffd400'], ['FITNESS', '#121212', '#ffffff'], ['LAW OFFICE', '#13254a', '#d9b45a'],
  ['CAFE', '#3b261a', '#ffffff'], ['BOOKS 서점', '#14625d', '#ffffff'], ['DUMPLINGS 饺子', '#f3ead8', '#b3161d'], ['GRILL', '#111111', '#ff8c1a'],
];
function signAtlas() {
  const W = 2048, H = 1024, cw = 512, ch = 128; const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  SIGNS.forEach((s, i) => {
    const x = (i % 4) * cw, y = Math.floor(i / 4) * ch;
    g.fillStyle = s[1]; g.fillRect(x, y, cw, ch);
    if (s[3]) { g.fillStyle = s[3]; g.fillRect(x, y + ch - 22, cw, 14); }
    g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = 4; g.strokeRect(x + 6, y + 6, cw - 12, ch - 12);
    let fs = 70; g.font = `bold ${fs}px "Helvetica Neue", Arial, "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", "Noto Sans Arabic", "PingFang SC", "Microsoft YaHei", sans-serif`;
    let w = g.measureText(s[0]).width; if (w > cw - 50) { fs = Math.floor(fs * (cw - 50) / w); g.font = g.font.replace(/\d+px/, fs + 'px'); }
    g.fillStyle = s[2]; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(s[0], x + cw / 2, y + ch / 2 + (s[3] ? -6 : 2));
  });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

// ---------- facade shader ----------
export function facadeMaterial() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.0, envMapIntensity: 1.0 });
  const WA = wallArrays();
  const U = { uWinI: { value: 1.0 }, uWC: { value: WA.col }, uWN: { value: WA.nor }, uWM: { value: WA.mean } };
  WA.ready.then(a => { U.uWC.value = a.col; U.uWN.value = a.nor; });
  const L = n => WALL_LAYERS.indexOf(n), T = n => TILE[n].toFixed(2);
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U);
    m.userData.shader = sh;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 aFac; attribute vec4 aInfo; attribute vec3 aAcc; varying vec2 vFac; varying vec4 vInfo; varying vec3 vAcc; varying vec3 vWP; varying vec3 vWN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFac = aFac; vInfo = aInfo; vAcc = aAcc; vWP = (modelMatrix * vec4(transformed, 1.0)).xyz; vWN = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec2 vFac; varying vec4 vInfo; varying vec3 vAcc; varying vec3 vWP; varying vec3 vWN; uniform float uWinI;
      uniform highp sampler2DArray uWC; uniform highp sampler2DArray uWN; uniform vec3 uWM[${WALL_LAYERS.length}];
      float gWall; vec3 gWNts;
      float h21(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
      float pI(float x, float lo, float hi){ return floor(x)*(hi-lo) + clamp(fract(x), lo, hi) - lo; }
      // box-filtered pulse train: 1 inside [lo,hi] of every unit cell, exactly antialiased at any distance
      float pulse(float x, float lo, float hi, float w){ w = max(w, 1e-4); return (pI(x+0.5*w, lo, hi) - pI(x-0.5*w, lo, hi)) / w; }
      float gGlass; float gMtl; float gRgh; vec3 gEm; vec2 gCell; float gDet;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
      {
        int st = int(vInfo.y + 0.5); float seed = mod(floor(vInfo.x), 97.0) + 0.5; float flag = floor(vInfo.z + 0.5); float fh = max(vInfo.w, 1.0); // varyings of constants are not exact: quantise before hashing
        float front = mod(flag, 2.0); float blank = step(1.5, flag);
        vec2 F = vFac; vec2 dF = fwidth(F) + 1e-4;
        vec3 base = diffuseColor.rgb; vec3 alb = base; vec3 tint = vAcc;
        float rgh = 0.86, mtl = 0.0; vec3 em = vec3(0.0);
        float win = 0.0; float litF = 0.22; vec3 lc = vec3(1.0, 0.66, 0.36); vec2 cell = vec2(0.0); float far = 0.0;
        float bw = 1.5; vec2 g, dg;
        float noise = h21(floor(F * vec2(0.9, 0.7)) + seed);
        if (st <= 2) { // ---- houses ----
          bw = 3.7; g = F / vec2(bw, fh); dg = dF / vec2(bw, fh); cell = floor(g);
          float has = step(0.32, h21(cell + seed)) * (1.0 - blank);
          float wx = pulse(g.x, 0.3, 0.7, dg.x), wy = pulse(g.y, 0.32, 0.8, dg.y);
          float fr = pulse(g.x, 0.27, 0.73, dg.x) * pulse(g.y, 0.29, 0.83, dg.y);
          win = wx * wy * has; float frame = (fr - wx * wy) * has;
          if (st == 0) {
            float row = F.y / 0.077; float off = mod(floor(row), 2.0) * 0.5; float bx = F.x / 0.21 + off;
            float brick = pulse(row, 0.0, 0.84, dF.y / 0.077) * pulse(bx, 0.0, 0.93, dF.x / 0.21);
            float fade = smoothstep(0.015, 0.05, max(dF.x, dF.y));
            vec3 bc = base * mix(0.8 + 0.4 * h21(vec2(floor(bx), floor(row)) + seed), 1.0, fade);
            alb = mix(vec3(0.5, 0.48, 0.45), bc, mix(brick, 0.86, fade));
          } else if (st == 1) { alb = base * (0.93 + 0.1 * h21(floor(F * 2.0) + seed)); }
          else { float sd = pulse(F.y / 0.21, 0.0, 0.14, dF.y / 0.21); alb = base * (1.0 - 0.3 * sd); }
          alb = mix(alb, vec3(0.36, 0.35, 0.33), 1.0 - step(0.5, F.y));
          alb = mix(alb, vec3(0.86, 0.86, 0.84), frame);
          tint = vec3(0.09, 0.1, 0.12); litF = 0.42;
        } else if (st == 3 || st == 4 || st == 6 || st == 5 || st == 9 || st == 10) { // ---- towers & framed glass ----
          bw = st == 6 ? 1.6 : st == 10 ? 1.25 : 1.5;
          g = F / vec2(bw, fh); dg = dF / vec2(bw, fh); cell = floor(g);
          float mull = pulse(g.x, 0.035, 0.965, dg.x);
          if (st == 3) { // precast condo: piers every few bays, slab-edge bands, window walls
            float per = 4.0 + floor(h21(vec2(seed, 1.0)) * 3.0);
            float pier = 1.0 - pulse(g.x / per, 0.0, 1.0 - 1.0 / per, dg.x / per);
            float band = pulse(g.y, 0.13, 1.0, dg.y);
            win = mull * band * (1.0 - pier);
            alb = base * (0.96 + 0.06 * noise);
            litF = 0.24;
          } else if (st == 4) { // glass curtain wall: spandrel glass + vision glass
            float vis = pulse(g.y, 0.2, 1.0, dg.y);
            win = mull; alb = base;
            tint = mix(tint * 0.55, tint, vis); litF = vis * 0.26;
            if (vis < 0.5) litF = 0.0;
          } else if (st == 5 || st == 6) { // ribbon windows between solid bands (offices; NAC granite)
            float rib = pulse(g.y, st == 6 ? 0.46 : 0.42, st == 6 ? 0.97 : 0.95, dg.y);
            win = rib * mull; alb = base * (0.95 + 0.08 * noise);
            if (st == 6) { win = rib * pulse(g.x, 0.02, 0.98, dg.x); alb = mix(alb, vec3(0.09, 0.08, 0.07), rib); } // NAC: continuous bronze glass bands, slim dark-bronze mullions
            if (st == 6) { float gr = h21(floor(F * vec2(1.6, 4.0)) + seed); alb = base * mix(0.9 + 0.2 * gr, 1.0, smoothstep(0.02, 0.08, dF.y)); }
            litF = st == 6 ? 0.16 : 0.3; lc = vec3(0.95, 0.93, 0.85);
          } else if (st == 9) { // transit pavilion: glass walls under a fascia
            float wallTop = 3.4;
            win = mull * (1.0 - step(wallTop, F.y)) * pulse(F.y / 2.6, 0.12, 0.92, dF.y / 2.6);
            win = max(win, mull * step(F.y, wallTop) * step(2.55, F.y) * pulse(F.y, 2.62, 3.32, dF.y));
            alb = base; litF = 0.9; lc = vec3(0.9, 0.95, 1.0);
          } else { // school / institutional brick with window strips
            float row = F.y / 0.077; float bx = F.x / 0.21 + mod(floor(row), 2.0) * 0.5;
            float brick = pulse(row, 0.0, 0.84, dF.y / 0.077) * pulse(bx, 0.0, 0.93, dF.x / 0.21);
            float fade = smoothstep(0.015, 0.05, max(dF.x, dF.y));
            alb = mix(vec3(0.5, 0.48, 0.45), base, mix(brick, 0.86, fade));
            win = mull * pulse(g.y, 0.3, 0.82, dg.y); litF = 0.15;
          }
          win *= step(0.5, 1.0 - blank);
        } else if (st == 8) { // ---- brick apartments: punched windows & balcony doors ----
          bw = 3.1; g = F / vec2(bw, fh); dg = dF / vec2(bw, fh); cell = floor(g);
          float door = step(0.62, h21(vec2(cell.x, 3.0) + seed));
          float wx = pulse(g.x, door > 0.5 ? 0.18 : 0.22, door > 0.5 ? 0.82 : 0.78, dg.x);
          float wy = pulse(g.y, door > 0.5 ? 0.03 : 0.3, 0.84, dg.y);
          win = wx * wy * (1.0 - blank);
          float row = F.y / 0.077; float bx = F.x / 0.21 + mod(floor(row), 2.0) * 0.5;
          float brick = pulse(row, 0.0, 0.84, dF.y / 0.077) * pulse(bx, 0.0, 0.93, dF.x / 0.21);
          float fade = smoothstep(0.015, 0.05, max(dF.x, dF.y));
          alb = mix(vec3(0.48, 0.46, 0.43), base * (0.92 + 0.12 * noise), mix(brick, 0.86, fade));
          litF = 0.25;
        } else if (st == 7) { // ---- strip retail: block / stucco upper wall ----
          alb = base * (0.94 + 0.08 * noise);
          float row = F.y / 0.2; float blk = pulse(row, 0.0, 0.94, dF.y / 0.2) * pulse(F.x / 0.4 + mod(floor(row), 2.0) * 0.5, 0.0, 0.97, dF.x / 0.4);
          alb *= mix(0.82, 1.0, mix(blk, 0.93, smoothstep(0.02, 0.06, dF.y)));
          if (front < 0.5) { float d = pulse(F.x / 14.0, 0.45, 0.52, dF.x / 14.0) * step(F.y, 2.2); alb = mix(alb, vec3(0.2, 0.22, 0.25), d); }
          // second-floor offices over the shops (dentists, tutors, travel agents): a row of punched windows
          bw = 3.2; g = vec2(F.x / bw, (F.y - 4.9) / 2.6); dg = dF / vec2(bw, 2.6); cell = floor(g);
          win = pulse(g.x, 0.18, 0.82, dg.x) * pulse(g.y, 0.08, 0.86, dg.y) * step(4.9, F.y) * step(F.y, 7.5) * (1.0 - blank); fh = 2.6; litF = 0.4;
        } else if (st == 11) { // ---- rooftop mechanical penthouse: louvres ----
          float lv = pulse(F.y / 0.14, 0.0, 0.5, dF.y / 0.14) * step(0.5, F.y) * step(F.y, fh - 0.6);
          alb = base * (1.0 - 0.35 * lv);
        } else if (st == 14) { // flat roof: membrane / gravel
          float pa = h21(floor(F / 3.0) + seed); alb = base * (0.82 + 0.25 * pa); rgh = 0.95;
        } else if (st == 15) { // asphalt shingles: courses follow world height
          float row = F.y / 0.14; float tab = pulse(row, 0.0, 0.82, dF.y / 0.14);
          float fade = smoothstep(0.02, 0.07, dF.y);
          float tv = h21(vec2(floor(F.x / 0.33 + mod(floor(row), 2.0) * 0.5), floor(row)) + seed);
          alb = base * mix(mix(0.55, 0.85 + tv * 0.35, tab), 0.9, fade); rgh = 0.92;
        } else if (st == 16) { // sloped glass crown
          g = F / vec2(1.6, 1.9); dg = dF / vec2(1.6, 1.9); cell = floor(g);
          win = pulse(g.x, 0.05, 0.95, dg.x) * pulse(g.y, 0.06, 0.94, dg.y); alb = base * 0.6; litF = 0.0;
        } else if (st == 18) { alb = base * 0.92; rgh = 0.7; }
        // photo-scanned wall material at real scale (detail only: divided by its mean so the building keeps its colour)
        int layer = (st == 0 || st == 8 || st == 10) ? ${L('brick')} : (st == 1 || st == 7) ? ${L('stucco')} : st == 6 ? ${L('granite')} : (st == 3 || st == 5 || st == 11 || st == 12 || st == 18) ? ${L('precast')} : -1;
        gWall = 0.0; gWNts = vec3(0.0, 0.0, 1.0);
        if (layer >= 0 && abs(vWN.y) < 0.5) {
          float tl = layer == ${L('brick')} ? ${T('brick')} : layer == ${L('stucco')} ? ${T('stucco')} : layer == ${L('granite')} ? ${T('granite')} : ${T('precast')};
          vec3 uvw = vec3(F.x / tl, -F.y / tl, float(layer));
          vec3 tc = texture(uWC, uvw).rgb / uWM[layer];
          float k = layer == ${L('brick')} ? 1.0 : 0.85;
          vec3 wc = (layer == ${L('brick')} ? base : alb) * mix(vec3(1.0), tc, k);
          if (st <= 2) wc = mix(wc, vec3(0.36, 0.35, 0.33), 1.0 - step(0.5, F.y));
          alb = mix(wc, alb, step(0.5, win) );
          gWall = 1.0 - step(0.5, win); gWNts = texture(uWN, uvw).xyz * 2.0 - 1.0;
        }
        // ground-floor shops: storefront glazing, mullions, kick plate, backlit interiors
        float sfH = st == 7 ? 3.5 : 4.3;
        if (front > 0.5 && F.y < sfH && st != 9) {
          vec2 gs = F / vec2(2.2, 1.0); float m2 = pulse(gs.x, 0.025, 0.975, dF.x / 2.2);
          float vy = pulse(F.y / sfH, 0.42 / sfH, (sfH - 0.22) / sfH, dF.y / sfH);
          float tr = 1.0 - pulse(F.y / sfH, 2.55 / sfH, 2.66 / sfH, dF.y / sfH);
          win = m2 * vy * tr; alb = vec3(0.07, 0.075, 0.08); cell = vec2(floor(F.x / 7.5), 77.0);
          tint = vec3(0.06, 0.07, 0.08); litF = 0.86; lc = mix(vec3(1.0, 0.82, 0.62), vec3(0.85, 0.93, 1.0), step(0.55, h21(cell + seed * 3.1)));
        } else if (st == 7 && F.y < sfH + 1.05 && front > 0.5) { alb = vec3(0.06, 0.065, 0.07); rgh = 0.5; }
        // glass: a dielectric pane (fresnel reflection of the dusk sky) over an interior-mapped room
        bool shop = front > 0.5 && F.y < sfH && st != 9;
        float hs = h21(cell + seed * 1.37); float hs2 = h21(cell.yx * 1.91 + seed * 0.37);
        float lit = step(1.0 - litF, hs);
        if (!shop) lc = mix(lc, vec3(0.82, 0.88, 1.0), step(0.78, hs2)); // some rooms lit by cool LED / TV light
        float detail = shop ? smoothstep(0.35, 1.0, max(dF.x, dF.y) / 2.0) : smoothstep(0.35, 1.0, max(dg.x, dg.y));
        float tinted = (st == 4 || st == 6 || st == 5 || st == 16) ? 1.0 : 0.0;
        vec3 room = vec3(0.0);
        if (win > 0.001 && abs(vWN.y) < 0.5 && detail < 0.999) {
          vec3 Nw = normalize(vWN); vec3 Tw = vec3(-Nw.z, 0.0, Nw.x);
          vec3 V = normalize(vWP - cameraPosition);
          vec3 d = vec3(dot(V, Tw), V.y, -dot(V, Nw)) + 1e-5;
          vec2 cs = shop ? vec2(7.5, sfH) : vec2(bw, fh);
          vec2 lp = shop ? vec2(fract(F.x / 7.5) * 7.5, F.y) : fract(g) * cs;
          float D = shop ? 10.0 : max(3.4, bw * 1.15);
          vec3 tt = (step(0.0, d) * vec3(cs, D) - vec3(lp, 0.0)) / d;
          float t = min(min(tt.x, tt.y), tt.z);
          vec3 hp = vec3(lp, 0.0) + d * t;
          float rr = h21(cell + seed * 2.7), r2 = h21(cell * 1.3 + seed * 4.1);
          vec3 wallc = mix(vec3(0.72, 0.66, 0.56), vec3(0.86, 0.86, 0.83), rr);
          if (shop) wallc = mix(vec3(0.78, 0.74, 0.68), vec3(0.5, 0.52, 0.55), r2);
          vec3 c;
          if (t == tt.z) { // back wall with a piece of furniture / shelving
            c = wallc * 0.92;
            float fur = step(hp.y, (shop ? 2.0 : 0.85) + 0.5 * rr) * step(0.12 * cs.x, hp.x) * step(hp.x, (0.5 + 0.35 * r2) * cs.x);
            c = mix(c, shop ? mix(vec3(0.75, 0.3, 0.2), vec3(0.2, 0.35, 0.6), r2) : vec3(0.28, 0.22, 0.18), fur);
          }
          else if (t == tt.x) c = wallc * 0.78;
          else if (d.y < 0.0) c = shop ? mix(vec3(0.32, 0.3, 0.28), vec3(0.45, 0.36, 0.28), r2) : mix(vec3(0.34, 0.25, 0.18), vec3(0.5, 0.48, 0.45), rr); // floor
          else { c = vec3(0.7); if (shop) { vec2 pq = abs(fract(hp.xz / vec2(2.4, 2.4)) - 0.5); c = mix(vec3(0.55), vec3(3.0), step(pq.x, 0.12) * step(pq.y, 0.3)); } } // ceiling (shops: light panels)
          if (shop && t != tt.y) { // shelving / counters along the walls, and a row of display units mid-floor
            float sh = step(hp.y, 1.9) * (1.0 - step(0.42, fract(hp.y / 0.45)) * 0.7);
            float mid = step(abs(hp.z - D * 0.45), 0.5) * step(hp.y, 1.3);
            c = mix(c, mix(vec3(0.85, 0.82, 0.76), mix(vec3(0.7, 0.2, 0.15), vec3(0.15, 0.4, 0.6), r2), 0.5) * (0.6 + 0.4 * fract(hp.x * 1.7 + r2 * 9.0)), max(sh * step(D * 0.6, hp.z), mid));
          }
          float depth = clamp(hp.z / D, 0.0, 1.0);
          float lamp = lit * (1.0 - 0.6 * depth) * ((t == tt.y && d.y > 0.0) ? 1.5 : 1.0);
          room = c * lc * (lamp + 0.012);
          if (!shop) { // blinds and curtains part-way down some windows
            float bl = step(0.5, r2) * step(1.0 - (0.15 + 0.7 * h21(cell + seed * 5.3)), lp.y / cs.y);
            room = mix(room, mix(vec3(0.86, 0.84, 0.78), vec3(0.62, 0.55, 0.46), rr) * lc * (lit * 0.75 + 0.012), bl);
          }
        }
        room = mix(room, lc * litF * 0.45, detail);
        vec3 trans = mix(vec3(0.92), tint * 3.0 + 0.04, tinted * 0.85);
        alb = mix(alb, tint * mix(0.12, 1.25, tinted * (st == 6 ? 1.0 : 0.6)), win); // reflective coatings: the metal colour tints the reflection
        rgh = mix(rgh, 0.03 + 0.04 * hs2 * (1.0 - detail), win);
        mtl = mix(mtl, tinted * (st == 6 ? 0.85 : 0.55), win);
        em = win * room * trans * (shop ? 0.42 : st == 5 || st == 6 ? 0.22 : 0.85);
        gGlass = win; gMtl = mtl; gRgh = rgh; gEm = em; gCell = cell + seed; gDet = detail;
        diffuseColor.rgb = alb;
      }`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = gRgh;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = gMtl;')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        if (gGlass > 0.5) { vec2 pn = vec2(h21(gCell * 1.7), h21(gCell * 2.3 + 5.1)) - 0.5; normal = normalize(normal + vec3(pn * 0.028 * (1.0 - gDet), 0.0)); }
        else if (gWall > 0.5) { vec3 Nw = normalize(vWN); vec3 Tv = normalize((viewMatrix * vec4(-Nw.z, 0.0, Nw.x, 0.0)).xyz); vec3 Bv = (viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz;
          normal = normalize(Tv * gWNts.x + Bv * gWNts.y + normal * max(gWNts.z, 0.2)); }`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += gEm * uWinI;');
  };
  return m;
}

// ---------- build ----------
export function buildCity(roads, col) {
  const list = parseBuildings();
  const r = rng(99);
  for (const b of list) assignStyle(b, r);
  const gb = new GB();
  const white = new THREE.Color(1, 1, 1);
  const balcSlab = [], balcRail = [], awnings = [], signs = [];
  const fronts = ['pri', 'sec', 'ter'];
  const usedSign = new Set();

  for (const b of list) {
    const p = b.p, y0 = b.mh, H = b.H, seed = Math.floor(r() * 1000) + 0.5;
    const n = p.length;
    // per-edge data
    const edges = [];
    let u = 0;
    for (let i = 0; i < n; i++) {
      const a = p[i], q = p[(i + 1) % n]; const dx = q[0] - a[0], dz = q[1] - a[1]; const L = Math.hypot(dx, dz);
      if (L < 0.01) { edges.push(null); continue; }
      edges.push({ a, q, L, u0: u, nx: dz / L, nz: -dx / L, tx: dx / L, tz: dz / L, front: false }); u += L;
    }
    // which edges face a main street (storefronts, signs)
    const canFront = (b.st === ST.RET || (b.H > 14 && !b.house && b.st !== ST.TRN) || b.st === ST.NAC) && y0 < 1;
    if (canFront) for (const e of edges) {
      if (!e || e.L < 3.5) continue;
      const mx = (e.a[0] + e.q[0]) / 2, mz = (e.a[1] + e.q[1]) / 2;
      const nr = nearestRoad(roads, mx + e.nx * 2, mz + e.nz * 2, fronts); if (!nr.foot) continue;
      const fx = nr.foot[0] - mx, fz = nr.foot[1] - mz, fd = Math.hypot(fx, fz) || 1;
      const facing = (fx * e.nx + fz * e.nz) / fd; const gap = nr.d - (nr.road.w || 12) / 2;
      const lim = b.st === ST.RET ? 30 : (nr.road.t === 'pri' ? 24 : 16);
      if (facing > 0.55 && gap < lim) e.front = true;
    }
    const wallTop = (x, z) => {
      if (!b.crown) return H;
      const th = b.crown.dir * Math.PI / 180, dx = Math.sin(th), dz = -Math.cos(th);
      if (!b._cr) { let lo = 1e9, hi = -1e9; for (const q of p) { const s = q[0] * dx + q[1] * dz; lo = Math.min(lo, s); hi = Math.max(hi, s); } b._cr = { lo, hi, dx, dz }; }
      const t = (x * dx + z * dz - b._cr.lo) / Math.max(1, b._cr.hi - b._cr.lo);
      return H - b.crown.h * t;
    };
    // North American Centre towers stand on a two-storey colonnade: the ground floors are set back behind
    // square granite piers carrying the tower (Street View, Yonge St at Finch)
    const pod = b.st === ST.NAC && y0 < 1 && H > 40 ? { h: 7.8, d: 2.6 } : null;
    // walls
    for (const e of edges) {
      if (!e) continue;
      const nn = [e.nx, 0, e.nz]; const ta = wallTop(e.a[0], e.a[1]), tq = wallTop(e.q[0], e.q[1]);
      const inf = [seed, b.st, e.front ? 1 : 0, b.fh];
      const yb = pod ? pod.h : y0;
      gb.face([[e.a[0], yb, e.a[1], e.u0, yb], [e.q[0], yb, e.q[1], e.u0 + e.L, yb], [e.q[0], tq, e.q[1], e.u0 + e.L, tq], [e.a[0], ta, e.a[1], e.u0, ta]], nn, inf, b.wall, b.acc);
    }
    if (pod) {
      // inset footprint (mitred offset of every vertex)
      const ins = p.map((v, i) => {
        const ea = edges[(i - 1 + n) % n], eb = edges[i]; if (!ea || !eb) return v;
        const mx = ea.nx + eb.nx, mz = ea.nz + eb.nz, k = pod.d / Math.max(0.35, 1 + ea.nx * eb.nx + ea.nz * eb.nz);
        return [v[0] - mx * k, v[1] - mz * k];
      });
      const pinf = [seed, ST.PAR, 0, 1], soff = b.wall.clone().multiplyScalar(0.78);
      let u = 0;
      for (let i = 0; i < n; i++) {
        const e = edges[i]; if (!e) continue; const a2 = ins[i], q2 = ins[(i + 1) % n]; const L2 = Math.hypot(q2[0] - a2[0], q2[1] - a2[1]);
        // recessed lobby glazing (front flag gives it the lit storefront treatment)
        gb.face([[a2[0], 0, a2[1], u, 0], [q2[0], 0, q2[1], u + L2, 0], [q2[0], pod.h, q2[1], u + L2, pod.h], [a2[0], pod.h, a2[1], u, pod.h]], [e.nx, 0, e.nz], [seed, ST.NAC, 1, 4.3], b.wall, b.acc); u += L2;
        // soffit
        gb.face([[e.a[0], pod.h, e.a[1], 0, 0], [e.q[0], pod.h, e.q[1], 0, 0], [q2[0], pod.h, q2[1], 0, 0], [a2[0], pod.h, a2[1], 0, 0]], [0, -1, 0], pinf, soff, white);
        // spandrel band at the soffit edge
        gb.face([[e.a[0], pod.h - 0.9, e.a[1], e.u0, pod.h - 0.9], [e.q[0], pod.h - 0.9, e.q[1], e.u0 + e.L, pod.h - 0.9], [e.q[0], pod.h, e.q[1], e.u0 + e.L, pod.h], [e.a[0], pod.h, e.a[1], e.u0, pod.h]], [e.nx, 0, e.nz], pinf, b.wall, white);
        // piers on the outer line
        const np = Math.max(1, Math.round(e.L / 7.8));
        for (let k = 0; k <= np; k++) {
          if (k === np && edges[(i + 1) % n]) continue; // the next edge places the corner pier
          const t = k / np, cx = e.a[0] + (e.q[0] - e.a[0]) * t - e.nx * 0.45, cz = e.a[1] + (e.q[1] - e.a[1]) * t - e.nz * 0.45;
          const hw = 0.45, tx = e.tx * hw, tz = e.tz * hw, nx = e.nx * hw, nz = e.nz * hw;
          const C4 = [[cx - tx + nx, cz - tz + nz], [cx + tx + nx, cz + tz + nz], [cx + tx - nx, cz + tz - nz], [cx - tx - nx, cz - tz - nz]];
          for (let j = 0; j < 4; j++) { const A = C4[j], Q = C4[(j + 1) % 4]; const fx = (Q[1] - A[1]) / (2 * hw), fz = -(Q[0] - A[0]) / (2 * hw);
            gb.face([[A[0], 0, A[1], j * 0.9, 0], [Q[0], 0, Q[1], j * 0.9 + 0.9, 0], [Q[0], pod.h - 0.9, Q[1], j * 0.9 + 0.9, pod.h - 0.9], [A[0], pod.h - 0.9, A[1], j * 0.9, pod.h - 0.9]], [fx, 0, fz], pinf, b.wall, white); }
        }
      }
    }
    // roofs
    if (b.roofKind === 'pitched') houseRoof(gb, b, edges, seed);
    else if (b.crown) {
      const tri = capTris(p); const th = b.crown.dir * Math.PI / 180; const span = Math.max(1, b._cr.hi - b._cr.lo);
      const nr = new THREE.Vector3(b.crown.h * Math.sin(th) / span, 1, -b.crown.h * Math.cos(th) / span).normalize();
      const inf = [seed, ST.RGL, 0, 2]; const rc = b.acc.clone();
      for (const t of tri) gb.face(t.map(k => [p[k][0], wallTop(p[k][0], p[k][1]), p[k][1], p[k][0], p[k][1]]), [nr.x, nr.y, nr.z], inf, rc, b.acc);
    } else {
      const rc = new THREE.Color().copy(b.st === ST.RET || b.st === ST.SLAB ? C('#6c6a66') : C('#7d7c78'));
      const inf = [seed, ST.RFLAT, 0, 1];
      for (const t of capTris(p)) gb.face(t.map(k => [p[k][0], H, p[k][1], p[k][0], p[k][1]]), [0, 1, 0], inf, rc, white);
      // parapet
      if (H > 3.5 && b.st !== ST.TRN) {
        const ph = H > 20 ? 1.1 : 0.7; const pc = b.wall.clone().multiplyScalar(0.9); const pinf = [seed, ST.PAR, 0, 1];
        for (const e of edges) {
          if (!e) continue;
          gb.face([[e.a[0], H, e.a[1], e.u0, H], [e.q[0], H, e.q[1], e.u0 + e.L, H], [e.q[0], H + ph, e.q[1], e.u0 + e.L, H + ph], [e.a[0], H + ph, e.a[1], e.u0, H + ph]], [e.nx, 0, e.nz], pinf, pc, white);
          const ia = [e.a[0] - e.nx * 0.3, e.a[1] - e.nz * 0.3], iq = [e.q[0] - e.nx * 0.3, e.q[1] - e.nz * 0.3];
          gb.face([[e.a[0], H + ph, e.a[1], 0, 0], [e.q[0], H + ph, e.q[1], 0, 0], [iq[0], H + ph, iq[1], 0, 0], [ia[0], H + ph, ia[1], 0, 0]], [0, 1, 0], pinf, pc, white);
          gb.face([[ia[0], H, ia[1], 0, 0], [iq[0], H, iq[1], 0, 0], [iq[0], H + ph, iq[1], 0, 0], [ia[0], H + ph, ia[1], 0, 0]], [-e.nx, 0, -e.nz], pinf, pc, white);
        }
      }
      // rooftop mechanical penthouse on towers
      if (H > 22 && b.A > 160) penthouse(gb, b, seed, r);
    }
    if (b.mh < 1) col.addPoly(p);

    // balconies (instanced later)
    if (b.balc && H > 12) {
      const fh = b.fh; const nF = Math.floor((H - y0 - 1.5) / fh);
      const slabC = b.balc.slab || (b.balc.solid ? b.wall.clone().multiplyScalar(1.08) : C('#d2d0ca'));
      for (const e of edges) {
        if (!e || e.L < 6) continue;
        const segs = [];
        if (b.balc.kind === 'wrap') segs.push([0.4, e.L - 0.4]);
        else { const sw = 3.4 + (seed % 7) * 0.25, gap = 1.8 + (seed % 5) * 0.4; let s = 0.8 + ((seed * 3) % 3); while (s + sw < e.L - 0.6) { segs.push([s, s + sw]); s += sw + gap; } }
        for (let k = 1; k < nF; k++) {
          const y = y0 + k * fh; if (e.front && y < 6) continue;
          for (const [s0, s1] of segs) {
            const cx = e.a[0] + e.tx * (s0 + s1) / 2 + e.nx * b.balc.d / 2, cz = e.a[1] + e.tz * (s0 + s1) / 2 + e.nz * b.balc.d / 2;
            const ang = Math.atan2(e.tx, e.tz);
            balcSlab.push([cx, y - 0.11, cz, ang, s1 - s0, 0.22, b.balc.d, slabC]);
            const rx = e.a[0] + e.tx * (s0 + s1) / 2 + e.nx * (b.balc.d - 0.04), rz = e.a[1] + e.tz * (s0 + s1) / 2 + e.nz * (b.balc.d - 0.04);
            if (b.balc.solid) balcSlab.push([rx, y + 0.5, rz, ang, s1 - s0, 1.0, 0.1, slabC]);
            else balcRail.push([rx, y + 0.52, rz, ang, s1 - s0, 1.04, 0.03]);
          }
        }
      }
    }

    // shop signs & awnings on street fronts
    for (const e of edges) {
      if (!e || !e.front) continue;
      const retail = b.st === ST.RET; if (b.noSigns || (!retail && r() < 0.35)) continue; // NAC: bank / office lobbies behind a colonnade, no shop signs
      const nU = Math.max(1, Math.round(e.L / 7.5)); const uw = e.L / nU;
      const sy0 = retail ? Math.min(3.62, H - 1.2) : 4.55, sy1 = sy0 + (retail ? 0.85 : 0.75);
      for (let k = 0; k < nU; k++) {
        if (!retail && r() < 0.4) continue;
        const s0 = k * uw + 0.45, s1 = (k + 1) * uw - 0.45; if (s1 - s0 < 2) continue;
        signs.push({ e, s0, s1, y0: sy0, y1: sy1, id: 6 + Math.floor(r() * (SIGNS.length - 6)) });
        if (r() < 0.38) awnings.push({ e, s0, s1, y: Math.min(3.15, sy0 - 0.3), c: pick(r, ['#14321f', '#5b1414', '#1b2741', '#111111', '#7a5a12', '#3a1f3a']) });
      }
    }
  }

  // named signs at their real locations (one big sign on the street-facing side)
  for (const [x, z, id] of NAMED_SIGNS) {
    let best = null, bd = 30;
    for (const b of list) { const d = Math.hypot(b.c[0] - x, b.c[1] - z); if (d < bd && b.H < 20) { bd = d; best = b; } }
    if (!best || usedSign.has(best)) continue; usedSign.add(best);
    // choose the edge facing the nearest main road
    let be = null, bs = -1e9;
    for (let i = 0; i < best.p.length; i++) {
      const a = best.p[i], q = best.p[(i + 1) % best.p.length]; const dx = q[0] - a[0], dz = q[1] - a[1]; const L = Math.hypot(dx, dz); if (L < 4) continue;
      const nx = dz / L, nz = -dx / L, mx = (a[0] + q[0]) / 2, mz = (a[1] + q[1]) / 2;
      const nr = nearestRoad(roads, mx, mz, ['pri', 'sec', 'ter', 'ser']); if (!nr.foot) continue;
      const fx = nr.foot[0] - mx, fz = nr.foot[1] - mz, fd = Math.hypot(fx, fz) || 1; const sc = (fx * nx + fz * nz) / fd * 10 + Math.min(L, 30) * 0.2 - nr.d * 0.15;
      if (sc > bs) { bs = sc; be = { a, q, L, nx, nz, tx: dx / L, tz: dz / L }; }
    }
    if (!be) continue;
    for (let i = signs.length - 1; i >= 0; i--) if (signs[i].e.a === be.a) signs.splice(i, 1);
    const w = Math.min(be.L - 1, id === 0 ? 16 : id <= 2 ? 9 : 12); const s0 = (be.L - w) / 2;
    const hgt = Math.min(1.4, w / 6, best.H * 0.32); const y1 = Math.min(best.H - 0.25, 4.0 + hgt);
    signs.push({ e: be, s0, s1: s0 + w, y0: y1 - hgt, y1, id });
  }

  const geo = gb.geometry();
  const mat = facadeMaterial();
  const mesh = new THREE.Mesh(geo, mat); mesh.matrixAutoUpdate = false; mesh.castShadow = true; mesh.receiveShadow = true;
  const grp = new THREE.Group(); grp.add(mesh);

  // balconies: one instanced slab mesh + one instanced glass-rail mesh
  const box = new THREE.BoxGeometry(1, 1, 1);
  const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), e4 = new THREE.Euler(), v4 = new THREE.Vector3(), s4 = new THREE.Vector3();
  if (balcSlab.length) {
    const im = new THREE.InstancedMesh(box, new THREE.MeshStandardMaterial({ roughness: 0.85 }), balcSlab.length);
    balcSlab.forEach((s, i) => { e4.set(0, s[3], 0); q4.setFromEuler(e4); m4.compose(v4.set(s[0], s[1], s[2]), q4, s4.set(s[6], s[5], s[4])); im.setMatrixAt(i, m4); im.setColorAt(i, s[7]); });
    im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false; grp.add(im);
  }
  if (balcRail.length) {
    const rm = new THREE.MeshStandardMaterial({ color: 0x6f8a8c, roughness: 0.08, metalness: 0.35, transparent: true, opacity: 0.42, depthWrite: false, envMapIntensity: 1.2 });
    const im = new THREE.InstancedMesh(box, rm, balcRail.length);
    balcRail.forEach((s, i) => { e4.set(0, s[3], 0); q4.setFromEuler(e4); m4.compose(v4.set(s[0], s[1], s[2]), q4, s4.set(s[6], s[5], s[4])); im.setMatrixAt(i, m4); });
    im.frustumCulled = false; im.renderOrder = 4; grp.add(im);
  }
  if (awnings.length) {
    const ag = new THREE.BoxGeometry(1, 1, 1);
    const im = new THREE.InstancedMesh(ag, new THREE.MeshStandardMaterial({ roughness: 0.7 }), awnings.length);
    awnings.forEach((a, i) => { const e = a.e; const mid = (a.s0 + a.s1) / 2; e4.set(0, Math.atan2(e.tx, e.tz), 0); q4.setFromEuler(e4); m4.compose(v4.set(e.a[0] + e.tx * mid + e.nx * 0.6, a.y, e.a[1] + e.tz * mid + e.nz * 0.6), q4, s4.set(1.2, 0.14, a.s1 - a.s0)); im.setMatrixAt(i, m4); im.setColorAt(i, C(a.c)); });
    im.castShadow = true; im.frustumCulled = false; grp.add(im);
  }
  // signs: textured, backlit quads
  if (signs.length) {
    const P = [], U = [], Nn = [];
    for (const s of signs) {
      const e = s.e; const o = 0.09; const ax = e.a[0] + e.tx * s.s0 + e.nx * o, az = e.a[1] + e.tz * s.s0 + e.nz * o, bx = e.a[0] + e.tx * s.s1 + e.nx * o, bz = e.a[1] + e.tz * s.s1 + e.nz * o;
      const col0 = (s.id % 4) / 4, row0 = Math.floor(s.id / 4) / 8; const u0 = col0 + 0.002, u1 = col0 + 0.25 - 0.002, v1 = 1 - row0 - 0.004, v0 = 1 - row0 - 0.125 + 0.004;
      // edges run clockwise seen from above, so for a viewer outside, a->q runs right-to-left: mirror u
      const qd = [[ax, s.y0, az, u1, v0], [bx, s.y0, bz, u0, v0], [bx, s.y1, bz, u0, v1], [ax, s.y1, az, u1, v1]];
      for (const k of [0, 2, 1, 0, 3, 2]) { const t = qd[k]; P.push(t[0], t[1], t[2]); U.push(t[3], t[4]); Nn.push(e.nx, 0, e.nz); }
    }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); sg.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); sg.setAttribute('normal', new THREE.Float32BufferAttribute(Nn, 3));
    const at = signAtlas();
    const sm = new THREE.MeshStandardMaterial({ map: at, emissiveMap: at, emissive: 0xffffff, emissiveIntensity: 0.5, roughness: 0.45 });
    const smesh = new THREE.Mesh(sg, sm); smesh.matrixAutoUpdate = false; grp.add(smesh);
  }
  const verts = geo.attributes.position.count;
  return { grp, mesh, mat, list, stats: list.stats, detail: { verts, balconies: balcSlab.length + balcRail.length, signs: signs.length, awnings: awnings.length } };
}

function penthouse(gb, b, seed, r) {
  // principal axes of the footprint
  const [cx, cz] = b.c; let sxx = 0, szz = 0, sxz = 0; for (const q of b.p) { const x = q[0] - cx, z = q[1] - cz; sxx += x * x; szz += z * z; sxz += x * z; }
  const th = 0.5 * Math.atan2(2 * sxz, sxx - szz); const ax = [Math.cos(th), Math.sin(th)], az = [-Math.sin(th), Math.cos(th)];
  let a0 = 1e9, a1 = -1e9, b0 = 1e9, b1 = -1e9; for (const q of b.p) { const x = q[0] - cx, z = q[1] - cz; const s = x * ax[0] + z * ax[1], t = x * az[0] + z * az[1]; a0 = Math.min(a0, s); a1 = Math.max(a1, s); b0 = Math.min(b0, t); b1 = Math.max(b1, t); }
  const ha = (a1 - a0) * (0.18 + r() * 0.08), hb = (b1 - b0) * (0.22 + r() * 0.1); const mc = [(a0 + a1) / 2, (b0 + b1) / 2];
  const pc = [cx + ax[0] * mc[0] + az[0] * mc[1], cz + ax[1] * mc[0] + az[1] * mc[1]];
  const corners = [[-ha, -hb], [ha, -hb], [ha, hb], [-ha, hb]].map(([s, t]) => [pc[0] + ax[0] * s + az[0] * t, pc[1] + ax[1] * s + az[1] * t]);
  if (!corners.every(c => pip(c[0], c[1], b.p))) return;
  const y0 = b.H, ph = 3.6 + r() * 2.2, y1 = y0 + ph; const c = C('#8e8d89'); const white = new THREE.Color(1, 1, 1); const inf = [seed, ST.MECH, 0, ph];
  let u = 0;
  for (let i = 0; i < 4; i++) {
    const a = corners[i], q = corners[(i + 1) % 4]; const L = Math.hypot(q[0] - a[0], q[1] - a[1]); const nx = (q[1] - a[1]) / L, nz = -(q[0] - a[0]) / L;
    // outward = away from centre
    const mx = (a[0] + q[0]) / 2 - pc[0], mz = (a[1] + q[1]) / 2 - pc[1]; const sgn = mx * nx + mz * nz > 0 ? 1 : -1;
    gb.face([[a[0], y0, a[1], u, 0], [q[0], y0, q[1], u + L, 0], [q[0], y1, q[1], u + L, ph], [a[0], y1, a[1], u, ph]], [nx * sgn, 0, nz * sgn], inf, c, white); u += L;
  }
  gb.face(corners.map(q => [q[0], y1, q[1], q[0], q[1]]), [0, 1, 0], [seed, ST.RFLAT, 0, 1], C('#6e6d69'), white);
}

function houseRoof(gb, b, edges, seed) {
  const p = b.p, y1 = b.H, rh = b.rh; const rc = b.roof; const white = new THREE.Color(1, 1, 1); const rinf = [seed, ST.RSH, 0, 1];
  const ov = 0.38;
  if (p.length === 4) { // gable along the long axis
    const L01 = Math.hypot(p[1][0] - p[0][0], p[1][1] - p[0][1]), L12 = Math.hypot(p[2][0] - p[1][0], p[2][1] - p[1][1]);
    const o = L01 >= L12 ? 0 : 1; const A = p[o], Bq = p[(o + 1) % 4], Cq = p[(o + 2) % 4], D = p[(o + 3) % 4]; // long edges A-B and C-D
    const m1 = [(D[0] + A[0]) / 2, (D[1] + A[1]) / 2], m2 = [(Bq[0] + Cq[0]) / 2, (Bq[1] + Cq[1]) / 2];
    const ex = m2[0] - m1[0], ez = m2[1] - m1[1], el = Math.hypot(ex, ez) || 1; const tx = ex / el, tz = ez / el;
    const ext = (q, s) => [q[0] + tx * s * ov, q[1] + tz * s * ov];
    const r1 = ext(m1, -1), r2 = ext(m2, 1); const yE = y1 - 0.22;
    const cx = (m1[0] + m2[0]) / 2, cz = (m1[1] + m2[1]) / 2;
    // P0 lies on the m1 end, P1 on the m2 end
    for (const [P0, P1] of [[A, Bq], [D, Cq]]) {
      const mid = [(P0[0] + P1[0]) / 2, (P0[1] + P1[1]) / 2];
      let ox = mid[0] - cx, oz = mid[1] - cz; const ol = Math.hypot(ox, oz) || 1; ox /= ol; oz /= ol;
      const e0 = ext([P0[0] + ox * ov, P0[1] + oz * ov], -1), e1 = ext([P1[0] + ox * ov, P1[1] + oz * ov], 1);
      const nrm = new THREE.Vector3(ox * rh, ol, oz * rh).normalize();
      gb.face([[e0[0], yE, e0[1], 0, yE], [e1[0], yE, e1[1], 4, yE], [r2[0], y1 + rh, r2[1], 4, y1 + rh], [r1[0], y1 + rh, r1[1], 0, y1 + rh]], [nrm.x, nrm.y, nrm.z], rinf, rc, white);
    }
    // gable end walls (no windows in the attic triangle)
    for (const [P0, P1, M] of [[D, A, m1], [Bq, Cq, m2]]) {
      const dx = P1[0] - P0[0], dz = P1[1] - P0[1], L = Math.hypot(dx, dz) || 1; let nx = dz / L, nz = -dx / L;
      const cx = (m1[0] + m2[0]) / 2, cz = (m1[1] + m2[1]) / 2; if ((M[0] - cx) * nx + (M[1] - cz) * nz < 0) { nx = -nx; nz = -nz; }
      gb.face([[P0[0], y1, P0[1], 0, y1], [P1[0], y1, P1[1], L, y1], [M[0], y1 + rh, M[1], L / 2, y1 + rh]], [nx, 0, nz], [seed, b.st, 2, b.fh], b.wall, b.acc);
    }
    return;
  }
  // hip roof with eaves
  const cc = b.c; const k = 0.38;
  const out = p.map(q => { const dx = q[0] - cc[0], dz = q[1] - cc[1]; const l = Math.hypot(dx, dz) || 1; return [q[0] + dx / l * ov, q[1] + dz / l * ov]; });
  const top = p.map(q => [cc[0] + (q[0] - cc[0]) * k, cc[1] + (q[1] - cc[1]) * k]);
  const yE = y1 - 0.22;
  for (let i = 0; i < p.length; i++) {
    const a = out[i], q = out[(i + 1) % p.length], ta = top[i], tq = top[(i + 1) % p.length];
    const v1 = new THREE.Vector3(q[0] - a[0], 0, q[1] - a[1]), v2 = new THREE.Vector3(ta[0] - a[0], rh, ta[1] - a[1]); const nn = new THREE.Vector3().crossVectors(v2, v1).normalize(); if (nn.y < 0) nn.negate();
    gb.face([[a[0], yE, a[1], 0, yE], [q[0], yE, q[1], 4, yE], [tq[0], y1 + rh, tq[1], 4, y1 + rh], [ta[0], y1 + rh, ta[1], 0, y1 + rh]], [nn.x, nn.y, nn.z], rinf, rc, white);
  }
  for (const t of capTris(top)) gb.face(t.map(i => [top[i][0], y1 + rh, top[i][1], top[i][0], y1 + rh]), [0, 1, 0], rinf, rc, white);
}
