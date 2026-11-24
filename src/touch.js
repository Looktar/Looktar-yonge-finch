// Touch controls: floating left stick (push to the rim to sprint), drag the right half to look,
// fire button that also steers while held (mobile-shooter style), plus ADS / reload / jump / swap / light / pause.
export const isTouch = () => (window.matchMedia && matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window || navigator.maxTouchPoints > 0;

export function initTouch(api) {
  const $ = id => document.getElementById(id);
  const layer = $('touch'); layer.style.display = 'block';
  const base = $('joyBase'), knob = $('joyKnob');
  const R = () => Math.min(70, innerHeight * 0.16);
  const move = { x: 0, y: 0, sprint: false };
  let joyId = null, joyO = null; const look = new Map(); // pointerId -> last pos
  let fireId = null;

  const setJoy = (cx, cy, kx, ky) => { base.style.transform = `translate(${cx - R()}px,${cy - R()}px)`; base.style.width = base.style.height = R() * 2 + 'px'; knob.style.transform = `translate(${kx - 28}px,${ky - 28}px)`; };
  const resetJoy = () => { const cx = 40 + R() + parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sal') || 0), cy = innerHeight - 40 - R(); setJoy(cx, cy, cx, cy); base.classList.remove('on'); move.x = move.y = 0; move.sprint = false; };
  resetJoy(); addEventListener('resize', resetJoy);

  const zone = $('tzone');
  zone.addEventListener('pointerdown', e => {
    if (api.state() !== 'play') return; e.preventDefault(); try { zone.setPointerCapture(e.pointerId); } catch (_) { }
    if (e.clientX < innerWidth * 0.42 && joyId === null) { joyId = e.pointerId; joyO = [e.clientX, e.clientY]; setJoy(e.clientX, e.clientY, e.clientX, e.clientY); base.classList.add('on'); }
    else look.set(e.pointerId, [e.clientX, e.clientY]);
  });
  zone.addEventListener('pointermove', e => {
    if (e.pointerId === joyId) {
      let dx = e.clientX - joyO[0], dy = e.clientY - joyO[1]; const r = R(); const L = Math.hypot(dx, dy);
      if (L > r * 1.6) { joyO[0] += dx * (1 - r * 1.6 / L); joyO[1] += dy * (1 - r * 1.6 / L); dx = e.clientX - joyO[0]; dy = e.clientY - joyO[1]; } // stick follows the thumb
      const l2 = Math.min(r, Math.hypot(dx, dy)); const a = Math.atan2(dy, dx);
      setJoy(joyO[0], joyO[1], joyO[0] + Math.cos(a) * l2, joyO[1] + Math.sin(a) * l2);
      move.x = Math.cos(a) * l2 / r; move.y = Math.sin(a) * l2 / r; move.sprint = Math.hypot(dx, dy) > r * 1.15 && move.y < -0.5;
      base.classList.toggle('sprint', move.sprint);
    } else if (look.has(e.pointerId)) { const p = look.get(e.pointerId); api.look(e.clientX - p[0], e.clientY - p[1]); look.set(e.pointerId, [e.clientX, e.clientY]); }
  });
  const end = e => { if (e.pointerId === joyId) { joyId = null; resetJoy(); } look.delete(e.pointerId); };
  zone.addEventListener('pointerup', end); zone.addEventListener('pointercancel', end);

  // fire: hold to shoot, drag while holding to aim
  const fire = $('tFire'); let fireLast = null;
  fire.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); try { fire.setPointerCapture(e.pointerId); } catch (_) { } fireId = e.pointerId; fireLast = [e.clientX, e.clientY]; api.fire(true); fire.classList.add('on'); });
  fire.addEventListener('pointermove', e => { if (e.pointerId !== fireId) return; api.look(e.clientX - fireLast[0], e.clientY - fireLast[1]); fireLast = [e.clientX, e.clientY]; });
  const fend = e => { if (e.pointerId !== fireId) return; fireId = null; api.fire(false); fire.classList.remove('on'); };
  fire.addEventListener('pointerup', fend); fire.addEventListener('pointercancel', fend);
  const tap = (id, fn, hold) => { const el = $(id); el.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); el.classList.add('on'); fn(true); }); const up = e => { el.classList.remove('on'); if (hold) fn(false); }; el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('pointerleave', up); };
  tap('tAds', () => { api.toggleAds(); $('tAds').classList.toggle('lit', api.ads()); });
  tap('tReload', () => api.reload());
  tap('tJump', d => api.jump(d), true);
  tap('tSwap', () => api.swap());
  tap('tLight', () => api.light());
  tap('tPause', () => api.pause());
  // keep the page from scrolling / zooming under the game
  for (const ev of ['touchstart', 'touchmove']) layer.addEventListener(ev, e => e.preventDefault(), { passive: false });
  return { move, reset: () => { joyId = null; fireId = null; look.clear(); resetJoy(); api.fire(false); } };
}
