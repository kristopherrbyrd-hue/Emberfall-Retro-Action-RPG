import type Phaser from 'phaser';

// Pure, deterministic choreography for the restoration cinematic. Every pose and
// particle is a function of the supplied presentation clock (saved restoration
// or transient replay). Coordinates are local to a 640x480 world cell.
export const CINE_POOL = 18;
export const CINE_VILLAGER_VARIANTS = ['rowan', 'warrior', 'rogue', 'mage', 'adept'] as const;
export const CINE_COLORS = [0xffd64a, 0x49aaff, 0xff4b55, 0x56f286, 0xad64ff] as const;

export type CineFacing = 'down' | 'up' | 'left' | 'right';
export type CineActor = {
  role: 'villager' | 'maelis' | 'hero' | 'hunger';
  variant: number; x: number; y: number; facing: CineFacing;
  scale: number; hop: number; rot: number; alpha: number; walking: boolean; squash: number;
};

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const ease = (v: number) => { const t = clamp01(v); return t * t * (3 - 2 * t); };
const fract = (v: number) => v - Math.floor(v);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const actor = (p: Partial<CineActor> & Pick<CineActor, 'x' | 'y'>): CineActor => ({
  role: 'villager', variant: 0, facing: 'down', scale: 1, hop: 0, rot: 0, alpha: 1, walking: false, squash: 1, ...p,
});

// Villagers walk in from beyond the frame, then hold their formation.
function arrive(tx: number, ty: number, ms: number, delay: number, fromX: number, fromY: number, reducedMotion = false) {
  const u = ease((ms - delay) / 1700);
  if (reducedMotion) {
    fromX = lerp(tx, fromX, 0.15);
    fromY = lerp(ty, fromY, 0.15);
  }
  return { x: lerp(fromX, tx, u), y: lerp(fromY, ty, u), walking: u > 0 && u < 1 };
}

function ringDancer(i: number, n: number, ms: number, rx: number, ry: number, cx: number, cy: number, speed: number, hopAmp: number, tilt: number) {
  const a = (i / n) * Math.PI * 2 + ms * speed;
  const s = Math.sin(a);
  return actor({
    variant: i % 5, x: cx + Math.cos(a) * rx, y: cy + s * ry,
    facing: Math.cos(a) * speed > 0 ? (s > 0 ? 'right' : 'left') : (s > 0 ? 'left' : 'right'),
    hop: Math.abs(Math.sin(ms / 210 + i * 1.3)) * hopAmp, rot: Math.sin(ms / 170 + i * 1.7) * tilt,
    scale: i % 4 === 0 ? 0.8 : 1,
  });
}

export const GRIEF_PAIRS = [{ cx: 160, cy: 290 }, { cx: 285, cy: 320 }, { cx: 410, cy: 290 }] as const;

// Only presentation motion changes; narrative beats keep using the saved clock.
export function cinematicCamera(shotId: string, ms: number, durMs: number, reducedMotion = false) {
  const t = clamp01(ms / durMs);
  const e = ease(t);
  const panX: Record<string, number> = { wonder: -50, grief: 40, courage: -70, laughter: 0, resolve: -60, freedom: 0 };
  return {
    px: reducedMotion ? 0 : (panX[shotId] ?? 0) * (e - 0.5) * 2,
    py: shotId === 'eruption' ? -10 : (shotId === 'freedom' ? (reducedMotion ? 0 : 40 * (0.5 - e)) : 10),
    zoom: reducedMotion ? 1.07 : shotId === 'eruption' ? 1.3 - 0.2 * e : 1 + 0.14 * e,
    shake: !reducedMotion && shotId === 'eruption' && t > 0.1 ? Math.sin(ms / 33) * 4 * (1 - t) : 0,
    alpha: 0.1 + 0.9 * Math.min(1, ms / 500),
  };
}

export function cinematicActors(shotId: string, ms: number, durMs: number, allied: boolean | null, reducedMotion = false) {
  const out: CineActor[] = [];
  const t = clamp01(ms / durMs);
  const motionMs = reducedMotion ? ms * 0.2 : ms;
  const stones: { x: number; y: number }[] = [];
  switch (shotId) {
    case 'eruption': {
      const shake = reducedMotion ? 0 : 1.5 + 9 * t;
      out.push(actor({
        role: 'hunger', x: 320 + Math.sin(ms / 38) * shake, y: 218 + Math.cos(ms / 47) * shake * 0.6,
        scale: 1 + 0.22 * t, alpha: t < 0.4 ? 1 : 1 - ((t - 0.4) / 0.6) * 0.78,
      }));
      break;
    }
    case 'wonder':
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        const tx = 310 + Math.cos(a) * 118; const ty = 290 + Math.sin(a) * 52;
        const p = arrive(tx, ty, ms, i * 120, 310 + Math.cos(a) * 520, 290 + Math.sin(a) * 300, reducedMotion);
        const kid = i % 3 === 0;
        out.push(actor({
          variant: i % 5, x: p.x, y: p.y, facing: p.walking ? (Math.cos(a) > 0 ? 'left' : 'right') : 'up',
          walking: p.walking, scale: kid ? 0.78 : 1,
          hop: !p.walking && kid ? Math.abs(Math.sin(motionMs / 260 + i)) * 14 : 0,
          rot: p.walking ? 0 : Math.sin(motionMs / 700 + i) * 0.05,
        }));
      }
      break;
    case 'grief':
      for (let k = 0; k < 3; k++) {
        const { cx, cy } = GRIEF_PAIRS[k];
        const sob = Math.sin(motionMs / 90 + k) * (reducedMotion ? 0.3 : 1.4);
        const u = ease((ms - 900 - k * 500) / 2400);
        // Kneeling: shorter body, bowed forward, shoulders heaving.
        out.push(actor({
          variant: k, x: cx + sob, y: cy + 12, facing: 'down', squash: 0.7,
          rot: 0.14 + u * 0.1 + Math.sin(motionMs / 130 + k) * 0.03, hop: -Math.abs(Math.sin(motionMs / 160 + k)) * 2,
        }));
        out.push(actor({
          variant: k + 2, x: lerp(cx + (reducedMotion ? 50 : 150), cx + 26, u), y: lerp(cy - (reducedMotion ? 10 : 60), cy + 4, u), facing: 'left',
          walking: u > 0 && u < 1, squash: u >= 1 ? 0.92 : 1, rot: u >= 1 ? -0.2 + Math.sin(motionMs / 500 + k) * 0.02 : 0,
        }));
      }
      for (let i = 0; i < 2; i++) {
        const p = arrive(505 + i * 40, 225 + i * 10, ms, 400 + i * 300, 700, 240, reducedMotion);
        out.push(actor({ variant: i + 1, x: p.x, y: p.y, facing: 'left', walking: p.walking, rot: p.walking ? 0 : 0.07, squash: p.walking ? 1 : 0.95 }));
      }
      break;
    case 'courage':
      for (let i = 0; i < 8; i++) {
        const k = motionMs / 1500 + 0.001;
        const stepPos = Math.floor(k) + ease(Math.min(1, fract(k) / 0.62));
        const lead = i === 0;
        out.push(actor({
          variant: i % 5, x: 130 + (i % 4) * 78 + stepPos * 26 + (lead ? 40 : 0), y: 262 + Math.floor(i / 4) * 54,
          facing: 'right', walking: fract(k) < 0.62, scale: lead ? 1.12 : 1, rot: lead ? 0.07 : 0.02,
          hop: fract(k) < 0.62 ? Math.abs(Math.sin(motionMs / 130 + i)) * 3 : 0,
        }));
      }
      break;
    case 'laughter': {
      for (let i = 0; i < 8; i++) out.push(ringDancer(i, 8, motionMs, 128, 74, 320, 262, 1 / 1000, 16, 0.16));
      for (let i = 0; i < 2; i++) out.push(ringDancer(i, 2, motionMs, 34, 20, 320, 262, -1 / 700, 22, 0.24));
      break;
    }
    case 'resolve':
      for (let i = 0; i < 8; i++) {
        const u = fract(motionMs / 4400 + i / 8);
        const out1 = u < 0.5;
        const q = out1 ? ease(u * 2) : ease((u - 0.5) * 2);
        const sx = 120 + (i % 2) * 24; const sy = 330 + (i % 4) * 22;
        const ex = 430 + (i % 3) * 16; const ey = 250 + (i % 4) * 22;
        const x = out1 ? lerp(sx, ex, q) : lerp(ex, sx, q);
        const y = out1 ? lerp(sy, ey, q) : lerp(ey, sy, q);
        out.push(actor({
          variant: i % 5, x, y, facing: out1 ? 'right' : 'left', walking: q > 0.02 && q < 0.98,
          hop: Math.abs(Math.sin(motionMs / 190 + i)) * 3,
        }));
        if (out1 && q < 0.98) stones.push({ x: x + 6, y: y - 52 - Math.abs(Math.sin(motionMs / 190 + i)) * (reducedMotion ? 0.3 : 3) });
      }
      break;
    case 'companions':
      if (allied) {
        out.push(actor({ role: 'hunger', x: 320, y: 218, scale: 1.22, alpha: 0.22 * (1 - t) }));
        out.push(actor({ role: 'hero', x: 262, y: 330, facing: 'up' }));
        const turned = ms > 1800;
        out.push(actor({ role: 'maelis', x: 372, y: 330, facing: turned ? 'left' : 'up', rot: turned ? -0.04 : 0, hop: 0 }));
      } else {
        out.push(actor({ role: 'maelis', x: 320, y: 300, facing: ms < 1500 ? 'down' : 'up', rot: Math.sin(motionMs / 900) * 0.03 }));
      }
      break;
    default:
      for (let i = 0; i < 8; i++) out.push(ringDancer(i, 8, motionMs, 150, 84, 320, 270, 1 / 1100, 18, 0.15));
      for (let i = 0; i < 6; i++) {
        out.push(actor({
          variant: i % 5, x: 250 + (i % 3) * 70 + Math.sin(motionMs / 400 + i) * (reducedMotion ? 1 : 6), y: 250 + Math.floor(i / 3) * 44,
          facing: 'down', hop: Math.abs(Math.sin(motionMs / 230 + i * 0.9)) * 26, rot: Math.sin(motionMs / 140 + i) * 0.2,
          scale: i % 2 ? 0.8 : 1,
        }));
      }
  }
  return { actors: out.slice(0, CINE_POOL).map((a) => reducedMotion ? { ...a, hop: a.hop * 0.1, rot: a.rot * 0.3 } : a), stones };
}

function swirl(g: Phaser.GameObjects.Graphics, ox: number, oy: number, cx: number, cy: number, ms: number,
  streams: number, per: number, colorOf: (k: number) => number, reach: number, strength: number) {
  for (let k = 0; k < streams; k++) {
    const base = (k / streams) * Math.PI * 2 + 0.4;
    for (let j = 0; j < per; j++) {
      const q = fract(ms / 2600 + j / per + k * 0.137);
      const r = 36 + reach * Math.pow(1 - q, 1.4);
      const a = base + (1 - q) * 1.5 + Math.sin(ms / 900 + k) * 0.12;
      const px = cx + Math.cos(a) * r; const py = cy + Math.sin(a) * r * 0.66;
      const al = strength * (0.25 + 0.75 * q);
      g.fillStyle(colorOf(k), al * 0.28).fillCircle(ox + px, oy + py, 5 + 11 * q);
      g.fillStyle(colorOf(k), al).fillCircle(ox + px, oy + py, 2 + 5 * q);
    }
  }
}

export function drawCinematicFx(
  g: Phaser.GameObjects.Graphics, shotId: string, ms: number, durMs: number, tint: number,
  ox: number, oy: number, allied: boolean | null, stones: { x: number; y: number }[],
  reducedMotion = false,
) {
  g.clear();
  const t = clamp01(ms / durMs);
  const fadeIn = clamp01(ms / 1400);
  const motionMs = reducedMotion ? ms * 0.25 : ms;
  if (shotId === 'eruption' && reducedMotion) {
    // Five stolen emotions return as slowly brightening, local color glows,
    // not a white flash or high-speed rays crossing the whole viewport.
    for (let s = 0; s < 5; s++) {
      const a = -Math.PI / 2 + s / 5 * Math.PI * 2;
      const r = 45 + 35 * ease(t);
      const x = ox + 320 + Math.cos(a) * r;
      const y = oy + 232 + Math.sin(a) * r * 0.7;
      g.fillStyle(CINE_COLORS[s], ease(ms / 2400) * 0.2).fillCircle(x, y, 24 + 8 * ease(t));
      g.fillStyle(CINE_COLORS[s], ease(ms / 2400) * 0.55).fillCircle(x, y, 5 + 3 * ease(t));
    }
    return;
  }
  if (shotId === 'eruption') {
    const flash = clamp01(ms / 1100);
    if (flash < 1) {
      g.lineStyle(10 * (1 - flash) + 1, 0xffffff, 1 - flash).strokeCircle(ox + 320, oy + 232, 30 + flash * 520);
      g.fillStyle(0xffffff, 0.5 * (1 - flash)).fillCircle(ox + 320, oy + 232, 60 + flash * 160);
    }
    for (let s = 0; s < 5; s++) {
      const ang = -Math.PI / 2 + (s / 5) * Math.PI * 2;
      const D = 30 + 1250 * ease((ms - 500) / 5300);
      for (let j = 0; j < 26 && ms > 500; j++) {
        const d = D - j * 22;
        if (d < 0) continue;
        const wob = Math.sin(d / 38 + s * 1.3 + ms / 260) * (16 + d * 0.045);
        const x = ox + 320 + Math.cos(ang) * d - Math.sin(ang) * wob;
        const y = oy + 232 + Math.sin(ang) * d + Math.cos(ang) * wob;
        const r = Math.max(2.5, 14 - j * 0.45);
        g.fillStyle(CINE_COLORS[s], 0.24 * (1 - j / 28)).fillCircle(x, y, r * 2);
        g.fillStyle(CINE_COLORS[s], 1 - j / 28).fillCircle(x, y, r);
      }
    }
    for (let k = 0; k < 22; k++) {
      const d = ms * (0.18 + (k % 5) * 0.07);
      const a = k * 0.62;
      g.fillStyle(CINE_COLORS[k % 5], clamp01(1 - ms / 4600)).fillCircle(ox + 320 + Math.cos(a) * d, oy + 232 + Math.sin(a) * d * 0.8, 2.5 + (k % 3));
    }
    return;
  }
  if (shotId === 'companions') {
    if (allied) {
      for (let j = 0; j < 26; j++) {
        const q = fract(motionMs / 3800 + j / 26);
        g.fillStyle(CINE_COLORS[j % 5], (1 - q) * (1 - t * 0.4)).fillCircle(
          ox + 320 + Math.sin(j * 1.9 + q * 3) * (50 + q * (reducedMotion ? 40 : 160)), oy + 230 - q * (reducedMotion ? 90 : 420), 3 + 5 * (1 - q));
      }
    } else swirl(g, ox, oy, 320, 280, motionMs, 5, 14, (k) => CINE_COLORS[k % 5], reducedMotion ? 90 : 440, fadeIn);
    return;
  }
  if (shotId === 'freedom') {
    swirl(g, ox, oy, 320, 270, motionMs, 10, 10, (k) => CINE_COLORS[k % 5], reducedMotion ? 110 : 520, fadeIn * 0.8);
    if (reducedMotion) return;
    for (let b = 0; b < 6; b++) {
      const bt = ms - 400 - b * 1250;
      if (bt <= 0 || bt > 1500) continue;
      const cx = 120 + ((b * 97) % 400); const cy = 70 + ((b * 53) % 90);
      for (let r = 0; r < 14; r++) {
        const a = (r / 14) * Math.PI * 2; const d = bt * 0.14;
        g.fillStyle(CINE_COLORS[b % 5], 1 - bt / 1500).fillCircle(ox + cx + Math.cos(a) * d, oy + cy + Math.sin(a) * d + bt * 0.01, 3);
      }
    }
    return;
  }
  swirl(g, ox, oy, 320, 270, motionMs, 6, 18, () => tint, reducedMotion ? 100 : 560, fadeIn);
  if (shotId === 'grief') {
    GRIEF_PAIRS.forEach(({ cx, cy }, k) => {
      const hugging = ms > 900 + k * 500 + 2400;
      if (hugging) {
        g.lineStyle(7, 0x7a6a8c, 1).lineBetween(ox + cx + 18, oy + cy - 26, ox + cx - 6, oy + cy - 8);
        g.lineStyle(7, 0x7a6a8c, 1).lineBetween(ox + cx + 22, oy + cy - 18, ox + cx - 2, oy + cy + 2);
        g.fillStyle(0xe4b98d, 1).fillCircle(ox + cx - 7, oy + cy - 8, 4).fillCircle(ox + cx - 3, oy + cy + 2, 4);
      }
      for (let j = 0; j < 3; j++) {
        const q = fract(motionMs / 800 + j / 3 + k * 0.2);
        g.fillStyle(0x7cc2ff, 1 - q).fillCircle(ox + cx + 4 + (j - 1) * 5, oy + cy - 18 + q * 36, 2.5);
      }
    });
  }
  const falling = shotId === 'grief';
  for (let j = 0; j < 24; j++) {
    const q = fract(motionMs / (falling ? 2400 : 3200) + j / 24);
    const x = 320 + Math.sin(j * 2.3) * 240;
    const y = falling ? 120 + q * 280 : 440 - q * 340;
    g.fillStyle(tint, fadeIn * Math.sin(q * Math.PI) * 0.9).fillCircle(ox + x, oy + y, falling ? 3 : 2 + (j % 3));
  }
  if (shotId === 'resolve') {
    const rows = Math.floor(1 + t * 5);
    for (let r = 0; r < rows; r++) for (let c = 0; c < 5; c++) {
      const w = 34;
      g.fillStyle(r % 2 ? 0x8a7aa6 : 0xa592bd, 1).fillRect(ox + 470 + c * w + (r % 2) * 14, oy + 190 - r * 18, w - 2, 16);
    }
    for (const s of stones) g.fillStyle(0xb7a3d0, 1).fillRect(ox + s.x - 9, oy + s.y - 6, 18, 12);
  }
  if (shotId === 'courage') {
    for (let j = 0; j < 8; j++) {
      const x = 130 + j * 70 + motionMs * 0.02;
      g.fillStyle(0xff7a52, 0.9).fillTriangle(ox + x - 5, oy + 206, ox + x + 5, oy + 206, ox + x, oy + 188 - Math.sin(motionMs / 120 + j) * (reducedMotion ? 1 : 4));
    }
  }
}
