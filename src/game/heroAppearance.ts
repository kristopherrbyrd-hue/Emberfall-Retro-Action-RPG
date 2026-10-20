import { renderModularHeroFrame } from './modularHero';
import type { CharacterConfig, Direction } from './data';

export type HeroAppearance = Pick<
  CharacterConfig,
  'classId' | 'bodyType' | 'skin' | 'hairStyle' | 'hairColor' | 'clothingColor' | 'eyeColor' | 'trimColor' | 'clothingSecondary' | 'leatherColor' | 'metalColor' | 'facialHair' | 'headwear'
> & { weapon?: string };

export const HERO_WALK_POSES = ['walk-0', 'walk-1', 'walk-2', 'walk-3', 'walk-4', 'walk-5'] as const;
export const WALK_FRAME_DURATION_MS = 96;
export type HeroPose = 'idle' | (typeof HERO_WALK_POSES)[number] | 'attack';
export type HeroFrameOptions = { pose?: HeroPose; modularAtlas?: CanvasImageSource; modularMask?: CanvasImageSource };

export const HERO_FRAME_SIZE = 256;

export function walkPoseAtTime(elapsedMs: number): (typeof HERO_WALK_POSES)[number] {
  const phase = Math.max(0, elapsedMs);
  return HERO_WALK_POSES[Math.floor(phase / WALK_FRAME_DURATION_MS) % HERO_WALK_POSES.length];
}

const directionCell: Record<Direction, { x: number; y: number }> = {
  down: { x: 0, y: 0 },
  up: { x: 1, y: 0 },
  left: { x: 0, y: 1 },
  right: { x: 1, y: 1 },
};

export const heroTextureKey = (direction: Direction, pose: HeroPose = 'idle') =>
  `emberfall-player-${direction}-${pose}`;

function rgbFromHex(color: string, fallback: [number, number, number]): [number, number, number] {
  if (!/^#[0-9a-f]{6}$/i.test(color)) return fallback;
  return [
    Number.parseInt(color.slice(1, 3), 16),
    Number.parseInt(color.slice(3, 5), 16),
    Number.parseInt(color.slice(5, 7), 16),
  ];
}

function shadeColor(color: [number, number, number], brightness: number): [number, number, number] {
  const factor = Math.max(0.55, Math.min(1.35, brightness / 145));
  return color.map((channel) => Math.max(0, Math.min(255, Math.round(channel * factor)))) as [number, number, number];
}

/** Reference points measured against each class's actual 256px atlas, not
 * guessed global coordinates. The original illustrations already have
 * excellent shading, so additions must be subtle tapered details, not blocks. */
const headLandmarks: Record<HeroAppearance['classId'], {
  hair: { cx: number; top: number; edge: number; bottom: number };
  eyes: { left: number; right: number; y: number };
  brow: number;
  chin: number;
  ornament: { x: number; y: number };
}> = {
  warrior: { hair: { cx: 134, top: 14, edge: 19, bottom: 36 }, eyes: { left: 125, right: 143, y: 46 }, brow: 41, chin: 69, ornament: { x: 134, y: 34 } },
  rogue: { hair: { cx: 134, top: 49, edge: 15, bottom: 68 }, eyes: { left: 127, right: 144, y: 72 }, brow: 68, chin: 84, ornament: { x: 134, y: 52 } },
  adept: { hair: { cx: 131, top: 27, edge: 23, bottom: 58 }, eyes: { left: 121, right: 140, y: 67 }, brow: 62, chin: 81, ornament: { x: 130, y: 24 } },
  mage: { hair: { cx: 140, top: 59, edge: 23, bottom: 86 }, eyes: { left: 130, right: 151, y: 75 }, brow: 71, chin: 92, ornament: { x: 140, y: 47 } },
};

function paintHairStyle(
  context: CanvasRenderingContext2D,
  hairColor: [number, number, number],
  direction: Direction,
  style: string,
  classId: HeroAppearance['classId'],
) {
  if (style === 'cropped' || style === 'shaved') return;
  const { hair: head } = headLandmarks[classId];
  const shadow = shadeColor(hairColor, 77);
  const shine = shadeColor(hairColor, 167);
  const color = (rgb: [number, number, number], alpha = 1) =>
    `rgba(${rgb.join(',')},${alpha})`;
  // The rogue's hair lives under a hood; the mage's is under a hat.
  // Never paint new hair on top of those items.
  const covered = classId === 'rogue' || classId === 'mage';
  const view = direction === 'left' ? -1 : direction === 'right' ? 1 : 0;
  const cx = head.cx + view * 8;
  context.save();
  context.lineCap = 'round';
  context.lineJoin = 'round';
  const strand = (sx: number, sy: number, ex: number, ey: number, width: number, tone: [number, number, number]) => {
    context.beginPath();
    context.moveTo(sx, sy);
    context.quadraticCurveTo(sx + (ex - sx) * 0.7 - 3, (sy + ey) / 2, ex, ey);
    context.strokeStyle = color(tone, 0.92);
    context.lineWidth = width;
    context.stroke();
    context.beginPath();
    context.moveTo(sx - width * 0.18, sy);
    context.quadraticCurveTo(sx + (ex - sx) * 0.6, (sy + ey) / 2, ex - 1, ey - 2);
    context.lineWidth = Math.max(1, width * 0.3);
    context.strokeStyle = color(shine, 0.48);
    context.stroke();
  };
  if (style === 'waved') {
    // Small curved locks follow the existing fringe instead of covering eyes.
    if (!covered) {
      for (let i = -1; i <= 1; i += 1) {
        const x = cx + i * 9;
        strand(x - 4, head.top + 9, x + 3, head.top + 16 + Math.abs(i) * 2, 3, shadow);
      }
    }
  } else if (style === 'long' || style === 'braided') {
    const sideX = direction === 'left' ? cx + 13 : direction === 'right' ? cx - 15 : cx + head.edge;
    const rootY = covered ? head.bottom - 4 : head.top + 20;
    const endY = classId === 'mage' ? 103 : classId === 'rogue' ? 94 : head.bottom + 31;
    if (style === 'long') {
      strand(sideX, rootY, sideX + 2, endY, covered ? 5 : 7, shadow);
      if (direction === 'down' && !covered) strand(cx - head.edge, rootY, cx - head.edge - 3, endY - 5, 5, shadow);
    } else {
      // Interwoven narrow locks, not a stack of conspicuous rectangles.
      strand(sideX, rootY, sideX + 2, endY, 4, shadow);
      for (let y = rootY + 5; y < endY - 4; y += 7) {
        const offset = Math.round((y - rootY) * 2 / (endY - rootY));
        context.fillStyle = color(y % 2 ? shadow : shine, 0.82);
        context.beginPath();
        context.ellipse(sideX + offset + ((y - rootY) % 14 < 7 ? -2 : 2), y, 2.7, 4, 0.3, 0, Math.PI * 2);
        context.fill();
      }
    }
  } else if (style === 'topknot' && !covered && classId !== 'adept') {
    context.fillStyle = color(shadow);
    context.beginPath();
    context.ellipse(cx, head.top - 2, 8, 7, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = color(shine, 0.45);
    context.beginPath();
    context.ellipse(cx - 2, head.top - 4, 3.5, 2, 0, 0, Math.PI * 2);
    context.fill();
  } else if (style === 'mohawk' && !covered) {
    // A compact swept crest, rooted into the hairline; no detached spikes.
    context.fillStyle = color(shadow, 0.96);
    context.beginPath();
    context.moveTo(cx - 7, head.top + 10);
    context.quadraticCurveTo(cx - 9, head.top, cx - 4, head.top - 5);
    context.quadraticCurveTo(cx + 3, head.top - 9, cx + 8, head.top - 2);
    context.lineTo(cx + 8, head.top + 11);
    context.closePath();
    context.fill();
    strand(cx - 2, head.top + 4, cx + 2, head.top - 5, 2.3, shine);
  }
  context.restore();
}

function recolorChoices(
  context: CanvasRenderingContext2D,
  direction: Direction,
  appearance: HeroAppearance,
) {
  const image = context.getImageData(0, 0, HERO_FRAME_SIZE, HERO_FRAME_SIZE);
  const skin = rgbFromHex(appearance.skin, [217, 165, 123]);
  const hair = rgbFromHex(appearance.hairColor, [58, 41, 38]);
  const cloth = rgbFromHex(appearance.clothingColor, [211, 99, 69]);
  const trim = rgbFromHex(appearance.trimColor ?? '#cfa659', [207, 166, 89]);


  for (let y = 0; y < HERO_FRAME_SIZE; y += 1) {
    for (let x = 0; x < HERO_FRAME_SIZE; x += 1) {
      const index = (y * HERO_FRAME_SIZE + x) * 4;
      if (image.data[index + 3] < 96) continue;
      const red = image.data[index];
      const green = image.data[index + 1];
      const blue = image.data[index + 2];
      const brightness = red * 0.299 + green * 0.587 + blue * 0.114;

      // Restrict hair tint to the painted HAIR. The old global y<104 mask
      // included the mage's blue hat and even the characters' blue irises.
      const landmarks = headLandmarks[appearance.classId];
      const head = landmarks.hair;
      const topLimit = appearance.classId === 'mage' ? 63 : head.top - 5;
      const headZone = y >= topLimit && y < head.bottom + 5 &&
        x >= head.cx - head.edge - 8 && x <= head.cx + head.edge + 8;
      const eyeZone = direction === 'down' && Math.abs(y - landmarks.eyes.y) <= 4 &&
        (Math.abs(x - landmarks.eyes.left) <= 4 || Math.abs(x - landmarks.eyes.right) <= 4);
      const blueHair = headZone && !eyeZone &&
        blue > red * 1.13 && blue > green * 1.02 && red < 155 && brightness < 190;
      const faceZone = direction === 'down'
        ? x >= 82 && x <= 174 && y >= 44 && y <= 101
        : direction === 'left'
          ? x >= 56 && x <= 139 && y >= 44 && y <= 100
          : direction === 'right'
            ? x >= 117 && x <= 200 && y >= 44 && y <= 100
            : false;
      const handZone = y >= 92 && y <= 171 && ((x >= 42 && x <= 91) || (x >= 164 && x <= 214));
      const warmSkin = (faceZone || handZone) &&
        red > green * 1.035 && green > blue * 1.04 &&
        red > 112 && green > 66 && blue > 35 && brightness > 78;
      const tunicZone = y >= 70 && y <= 195 && x >= 58 && x <= 198;
      const coralTunic = tunicZone &&
        red > green * 1.16 && red > blue * 1.12 &&
        red > 88 && red < 235 && green < 165;
      const greenCloak = tunicZone &&
        green > red * 1.08 && green > blue * 1.03 &&
        red < 145 && green < 175 && blue < 150;
      const paleWrap = tunicZone &&
        red > 135 && green > 115 && blue > 75 &&
        red - green < 65 && green - blue < 90;
      const blueRobe = tunicZone && y >= 95 &&
        blue > red * 1.12 && blue > green * 1.04 &&
        red < 145 && brightness < 170;
      const classFabric = appearance.classId === 'warrior'
        ? coralTunic
        : appearance.classId === 'rogue'
          ? greenCloak
          : appearance.classId === 'adept'
            ? paleWrap
            : blueRobe;

      let selected: [number, number, number] | null = null;
      const trimZone = y >= 92 && y <= 191 && x >= 99 && x <= 163;
      const goldAccent = trimZone && red > 120 && green > 85 && blue < green * .78
        && green > red * .46 && red > green * 1.13;
      if (goldAccent) selected = shadeColor(trim, brightness);
      else if (blueHair) selected = appearance.hairStyle.toLowerCase() === 'shaved'
        ? shadeColor(skin, brightness * 0.70) : shadeColor(hair, brightness);
      else if (warmSkin) selected = shadeColor(skin, brightness);
      else if (classFabric) selected = shadeColor(cloth, brightness);
      if (!selected) continue;

      image.data[index] = selected[0];
      image.data[index + 1] = selected[1];
      image.data[index + 2] = selected[2];
    }
  }

  context.putImageData(image, 0, 0);
  paintHairStyle(context, hair, direction, appearance.hairStyle.toLowerCase(), appearance.classId);
  paintFaceAndAccessories(context, direction, appearance, skin, hair, trim);
}

/** Tiny details aligned with the painted face and existing headgear. */
function paintFaceAndAccessories(
  context: CanvasRenderingContext2D,
  direction: Direction,
  appearance: HeroAppearance,
  skin: [number, number, number],
  hair: [number, number, number],
  trim: [number, number, number],
) {
  const anchors = headLandmarks[appearance.classId];
  const front = direction === 'down';
  const side = direction === 'left' || direction === 'right';
  const left = direction === 'left';
  const color = (rgb: [number, number, number], alpha = 1) =>
    `rgba(${rgb.join(',')},${alpha})`;
  context.save();
  // Tint the illustration's iris; do not overlay eyes with 4x3 squares.
  if (appearance.eyeColor && direction !== 'up') {
    const chosen = rgbFromHex(appearance.eyeColor, [83, 120, 148]);
    const dots = front
      ? [anchors.eyes.left, anchors.eyes.right]
      : [anchors.eyes.left + (left ? -9 : 12)];
    for (const x of dots) {
      context.fillStyle = color(shadeColor(chosen, 132), 0.82);
      context.beginPath();
      context.ellipse(x, anchors.eyes.y + (side ? -3 : 0), 1.65, 2.1, 0, 0, 2 * Math.PI);
      context.fill();
      context.fillStyle = 'rgba(255,255,255,0.62)';
      context.fillRect(x - 0.6, anchors.eyes.y - 1.7, 1, 1);
    }
  }
  const facial = appearance.facialHair?.toLowerCase() ?? 'none';
  if (facial !== 'none' && direction !== 'up') {
    const beard = shadeColor(hair, 71);
    if (front) {
      const mid = (anchors.eyes.left + anchors.eyes.right) / 2;
      const y = anchors.chin - 6;
      context.strokeStyle = color(beard, facial === 'stubble' ? 0.42 : 0.8);
      context.lineWidth = facial === 'stubble' ? 2 : 3;
      context.lineCap = 'round';
      context.beginPath();
      context.moveTo(mid - 5, y);
      context.quadraticCurveTo(mid - 2, y - 2, mid, y);
      context.quadraticCurveTo(mid + 2, y - 2, mid + 5, y);
      context.stroke();
      if (facial === 'beard') {
        context.beginPath();
        context.ellipse(mid, anchors.chin - 2, 9, 6, 0, 0, Math.PI);
        context.strokeStyle = color(beard, 0.75);
        context.lineWidth = 4;
        context.stroke();
      }
    } else if (side) {
      context.fillStyle = color(beard, 0.55);
      context.beginPath();
      context.ellipse(left ? anchors.eyes.left - 7 : anchors.eyes.right + 3, anchors.chin - 5, 3, facial === 'beard' ? 6 : 2, 0, 0, Math.PI * 2);
      context.fill();
    }
  }
  const accessory = appearance.headwear?.toLowerCase() ?? 'none';
  if (accessory === 'headband' || accessory === 'circlet') {
    // A fine accent follows the EXISTING headband / hood seam / hat band.
    const { x, y } = anchors.ornament;
    const cx = x + (left ? -10 : direction === 'right' ? 9 : 0);
    if (accessory === 'headband') {
      context.beginPath();
      context.moveTo(cx - 10, y + 1);
      context.quadraticCurveTo(cx, y - 2, cx + 10, y + 1);
      context.strokeStyle = color(shadeColor(trim, 98), 0.7);
      context.lineWidth = 2;
      context.stroke();
    } else {
      context.fillStyle = color(shadeColor(trim, 86));
      context.beginPath();
      context.moveTo(cx, y - 4);
      context.lineTo(cx + 3.5, y);
      context.lineTo(cx, y + 4);
      context.lineTo(cx - 3.5, y);
      context.closePath();
      context.fill();
      context.fillStyle = color(shadeColor(trim, 210), 0.85);
      context.beginPath();
      context.ellipse(cx - 0.5, y - 1, 1.3, 1.5, 0, 0, Math.PI * 2);
      context.fill();
    }
  } else if (accessory === 'earring' && direction !== 'up') {
    const earX = front ? anchors.eyes.right + 11 : left ? anchors.eyes.left - 14 : anchors.eyes.right + 13;
    const earY = anchors.eyes.y + 11;
    context.strokeStyle = color(shadeColor(trim, 125), 0.85);
    context.lineWidth = 1.7;
    context.beginPath();
    context.ellipse(earX, earY, 2, 3, 0, 0, 2 * Math.PI);
    context.stroke();
  }
  context.restore();
}

/**
 * Gentle articulated stride applied to the ORIGINAL, intact drawing.
 *
 * The previous walker cleared rectangles around the boots and pasted them
 * elsewhere. Its source rectangles started part-way down the shins, so the
 * legs visibly disconnected from the body. Here every output pixel samples
 * the complete original image through a continuously varying displacement.
 * At the hips the displacement is zero; at the knee it bends and the foot
 * swings/lifts. No piece of the legs is ever cut out or pasted over the torso.
 * This is a deliberately restrained in-between animation, not hand-painted
 * walk frames; it keeps the original excellent character illustrations intact.
 */
const strideAnatomy: Record<HeroAppearance['classId'], { hips: number; feet: number; center: number; minX: number; maxX: number }> = {
  warrior: { hips: 169, feet: 244, center: 136, minX: 99, maxX: 184 },
  rogue: { hips: 166, feet: 237, center: 135, minX: 96, maxX: 176 },
  adept: { hips: 174, feet: 250, center: 131, minX: 80, maxX: 186 },
  mage: { hips: 203, feet: 249, center: 134, minX: 101, maxX: 169 },
};

const smoothstep = (t: number) => {
  const v = Math.max(0, Math.min(1, t));
  return v * v * (3 - 2 * v);
};

function applyWalkPose(
  context: CanvasRenderingContext2D,
  pose: HeroPose,
  direction: Direction,
  classId: HeroAppearance['classId'],
) {
  const frame = HERO_WALK_POSES.indexOf(pose as (typeof HERO_WALK_POSES)[number]);
  if (frame < 0) return;
  const anatomy = strideAnatomy[classId];
  // Two alternating steps. Each stride has a passing and a planted frame.
  const stride = [0, 0.65, 1, 0, -0.65, -1][frame];
  const bob = [0, -2, -3, 0, -2, -3][frame];
  const source = context.getImageData(0, 0, HERO_FRAME_SIZE, HERO_FRAME_SIZE);
  const output = context.createImageData(HERO_FRAME_SIZE, HERO_FRAME_SIZE);
  output.data.set(source.data);
  const side = direction === 'left' || direction === 'right';
  const facing = direction === 'left' ? -1 : 1;

  if (stride !== 0) {
    for (let y = anatomy.hips; y < HERO_FRAME_SIZE; y += 1) {
      const position = (y - anatomy.hips) / (anatomy.feet - anatomy.hips);
      const flex = smoothstep(position);
      if (flex <= 0) continue;
      const knee = Math.sin(Math.PI * Math.min(1, position));
      for (let x = anatomy.minX; x <= anatomy.maxX; x += 1) {
        // Fade the deformation at its edges. Swords, shield, cape edges and
        // surrounding scenery never move with the legs by accident.
        const edge = Math.min((x - anatomy.minX) / 10, (anatomy.maxX - x) / 10, 1);
        const fade = smoothstep(edge);
        const leg = Math.tanh((x - anatomy.center) / (side ? 8 : 5));
        const footSwing = stride * leg;
        const step = (side ? 8 : 5.5) * footSwing * flex * fade;
        const kneeBend = -stride * leg * 2.5 * knee * fade;
        const lift = Math.max(0, footSwing) * 7 * flex * fade;
        // Inverse sample keeps the silhouette continuous instead of creating
        // a conspicuous rectangular vacancy at the knee/ankle.
        const sx = Math.max(0, Math.min(255, Math.round(x - (step + kneeBend) * (side ? facing : 1))));
        const sy = Math.max(0, Math.min(255, Math.round(y + lift)));
        const dst = (y * HERO_FRAME_SIZE + x) * 4;
        const src = (sy * HERO_FRAME_SIZE + sx) * 4;
        output.data[dst] = source.data[src];
        output.data[dst + 1] = source.data[src + 1];
        output.data[dst + 2] = source.data[src + 2];
        output.data[dst + 3] = source.data[src + 3];
      }
    }
  }
  context.clearRect(0, 0, HERO_FRAME_SIZE, HERO_FRAME_SIZE);
  context.putImageData(output, 0, bob);
}

export function cropDirectionalSpriteFrame(
  atlas: CanvasImageSource,
  direction: Direction,
  frameSize = HERO_FRAME_SIZE,
): HTMLCanvasElement {
  const source = atlas as CanvasImageSource & {
    naturalWidth?: number;
    naturalHeight?: number;
    width?: number;
    height?: number;
  };
  const atlasWidth = source.naturalWidth || source.width || 0;
  const atlasHeight = source.naturalHeight || source.height || 0;
  const cellWidth = atlasWidth / 2;
  const cellHeight = atlasHeight / 2;
  if (!cellWidth || !cellHeight) throw new Error('The sprite atlas has no measurable dimensions.');

  const canvas = document.createElement('canvas');
  canvas.width = frameSize;
  canvas.height = frameSize;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Could not create the sprite canvas.');
  context.imageSmoothingEnabled = false;

  const cell = directionCell[direction];
  context.drawImage(
    atlas,
    cell.x * cellWidth,
    cell.y * cellHeight,
    cellWidth,
    cellHeight,
    0,
    0,
    frameSize,
    frameSize,
  );
  return canvas;
}

/**
 * Crops one complete original class sprite from its 2x2 directional atlas.
 * The class-specific artwork supplies equipment and silhouette; customization
 * applies the player's hair, skin, and outfit choices to each facing and pose.
 */
export function createCustomizedHeroFrame(
  atlas: CanvasImageSource,
  direction: Direction,
  appearance: HeroAppearance,
  options: HeroFrameOptions = {},
): HTMLCanvasElement {
  if (options.modularAtlas && options.modularMask) {
    const step = options.pose?.startsWith('walk-') ? Number(options.pose.slice(5)) + 1 : 0;
    return renderModularHeroFrame(options.modularAtlas, options.modularMask, direction, appearance, step);
  }
  const canvas = cropDirectionalSpriteFrame(atlas, direction);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Could not create the hero sprite canvas.');
  recolorChoices(context, direction, appearance);
  applyWalkPose(context, options.pose ?? 'idle', direction, appearance.classId);
  return canvas;
}

/** Pre-drawn directional art: no rectangular limb cutting or horizontal sliding. */
export const modularHeroAsset = (classId: HeroAppearance['classId'], bodyType: 'male' | 'female',
  facing: Direction, pose: HeroPose) =>
  `modular-heroes/${classId}-${bodyType}-${facing}-${pose === 'attack' ? 'idle' : pose}.png`;

/** Palette substitution preserves contours, highlights and shadow relationships. */
export function colorizeModularHero(source: CanvasImageSource, appearance: HeroAppearance): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = HERO_FRAME_SIZE; canvas.height = HERO_FRAME_SIZE;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(source, 0, 0, HERO_FRAME_SIZE, HERO_FRAME_SIZE);
  const image = ctx.getImageData(0, 0, HERO_FRAME_SIZE, HERO_FRAME_SIZE);
  const hair = rgbFromHex(appearance.hairColor, [55, 80, 157]);
  const cloth = rgbFromHex(appearance.clothingColor, [165, 59, 58]);
  const skin = rgbFromHex(appearance.skin, [215, 165, 120]);
  const trim = rgbFromHex(appearance.trimColor ?? '#cfa659', [207, 166, 89]);
  const data = image.data;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 32) continue;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const light = Math.max(r,g,b) / 255;
    let target: number[] | undefined;
    if (b > r * 1.35 && b > g * 1.12 && b > 45) target = hair;
    else if (r > g * 1.52 && r > b * 1.35 && r > 55) target = cloth;
    else if (r > 105 && g > 58 && r > g * 1.11 && g > b * 1.08) target = skin;
    else if (r > 100 && g > 75 && b < g * 0.62 && r > g * 1.08) target = trim;
    if (target) {
      const shade = 0.32 + light * 0.84;
      data[i] = Math.min(255, target[0] * shade);
      data[i + 1] = Math.min(255, target[1] * shade);
      data[i + 2] = Math.min(255, target[2] * shade);
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}
