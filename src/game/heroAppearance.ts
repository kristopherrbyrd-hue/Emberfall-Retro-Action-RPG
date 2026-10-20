import type { CharacterConfig, Direction } from './data';

export type HeroAppearance = Pick<
  CharacterConfig,
  'classId' | 'skin' | 'hairStyle' | 'hairColor' | 'clothingColor' | 'eyeColor' | 'trimColor' | 'facialHair' | 'headwear'
> & { weapon?: string };

export const HERO_WALK_POSES = ['walk-0', 'walk-1', 'walk-2', 'walk-3', 'walk-4', 'walk-5'] as const;
export const WALK_FRAME_DURATION_MS = 96;
export type HeroPose = 'idle' | (typeof HERO_WALK_POSES)[number] | 'attack';
export type HeroFrameOptions = { pose?: HeroPose };

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

function paintHairStyle(
  context: CanvasRenderingContext2D,
  hairColor: [number, number, number],
  direction: Direction,
  style: string,
) {
  const shadow = shadeColor(hairColor, 78);
  const middle = shadeColor(hairColor, 125);
  const highlight = shadeColor(hairColor, 175);
  const fill = (color: [number, number, number], x: number, y: number, width: number, height: number) => {
    context.fillStyle = `rgb(${color.join(',')})`;
    context.fillRect(x, y, width, height);
  };
  const horizontalShift = direction === 'left' ? -8 : direction === 'right' ? 8 : 0;
  const headCenter = 128 + horizontalShift;
  if (style === 'topknot') {
    fill(shadow, headCenter - 9, 18, 18, 13);
    fill(middle, headCenter - 6, 16, 13, 11);
    fill(highlight, headCenter - 3, 17, 6, 3);
    fill(shadow, headCenter - 4, 27, 10, 4);
  } else if (style === 'long') {
    const locks = direction === 'left'
      ? [144]
      : direction === 'right'
        ? [78]
        : [91, 155];
    for (const x of locks) {
      fill(shadow, x, 53, 11, 56);
      fill(middle, x + 2, 55, 7, 48);
      fill(highlight, x + 3, 58, 3, 30);
      fill(shadow, x - 1, 103, 13, 11);
    }
  } else if (style === 'braided') {
    const braidX = direction === 'left' ? 146 : direction === 'right' ? 85 : 154;
    for (let step = 0; step < 7; step += 1) {
      const y = 65 + step * 7;
      const shift = step % 2 === 0 ? -3 : 2;
      fill(shadow, braidX + shift - 3, y, 13, 9);
      fill(middle, braidX + shift, y + 1, 7, 6);
      fill(highlight, braidX + shift + 1, y + 1, 3, 3);
    }
    fill(shadow, braidX, 112, 5, 8);
  } else if (style === 'mohawk') {
    for (let step = 0; step < 5; step += 1) {
      const height = 12 + (2 - Math.abs(2 - step)) * 4;
      fill(shadow, headCenter - 22 + step * 10, 31 - height, 9, height + 12);
      fill(middle, headCenter - 20 + step * 10, 32 - height, 5, height + 10);
      fill(highlight, headCenter - 19 + step * 10, 34 - height, 3, 8);
    }
  } else if (style === 'shaved') {
    // A close shave leaves a subtle hairline instead of adding another tuft.
    fill(shadow, headCenter - 24, 43, 48, 5);
    fill(middle, headCenter - 20, 46, 40, 2);
  } else if (style === 'waved') {
    const waves = direction === 'left'
      ? [{ x: 90, y: 37 }, { x: 137, y: 36 }]
      : direction === 'right'
        ? [{ x: 89, y: 36 }, { x: 136, y: 37 }]
        : [{ x: 97, y: 37 }, { x: 145, y: 36 }];
    for (const wave of waves) {
      fill(shadow, wave.x, wave.y, 14, 12);
      fill(middle, wave.x + 3, wave.y + 1, 10, 8);
      fill(highlight, wave.x + 6, wave.y + 2, 4, 3);
    }
    fill(middle, 111 + horizontalShift, 47, 30, 5);
  }
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

      const headZone = y < 104 && x > 58 && x < 198;
      const blueHair = headZone && blue > red * 1.13 && blue > green * 1.02 && red < 155 && brightness < 190;
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
      else if (blueHair) selected = shadeColor(hair, brightness);
      else if (warmSkin) selected = shadeColor(skin, brightness);
      else if (classFabric) selected = shadeColor(cloth, brightness);
      if (!selected) continue;

      image.data[index] = selected[0];
      image.data[index + 1] = selected[1];
      image.data[index + 2] = selected[2];
    }
  }

  context.putImageData(image, 0, 0);
  paintHairStyle(context, hair, direction, appearance.hairStyle.toLowerCase());
  paintFaceAndAccessories(context, direction, appearance, skin, hair, trim);
}

/** Pixel-aligned overlays remain attached to every pose and viewing angle. */
function paintFaceAndAccessories(
  context: CanvasRenderingContext2D,
  direction: Direction,
  appearance: HeroAppearance,
  skin: [number, number, number],
  hair: [number, number, number],
  trim: [number, number, number],
) {
  const put = (color: [number, number, number], x: number, y: number, w: number, h: number) => {
    context.fillStyle = `rgb(${color.join(',')})`;
    context.fillRect(x, y, w, h);
  };
  const front = direction === 'down';
  const side = direction === 'left' || direction === 'right';
  // Class illustrations do not share facial landmarks (the rogue and mage's
  // heads sit lower). Keep the details on the face rather than on their armor.
  const faceY = appearance.classId === 'warrior' || appearance.classId === 'adept' ? 51 : 70;
  const beardY = faceY + 17;
  const eyes = rgbFromHex(appearance.eyeColor ?? '#537894', [83, 120, 148]);
  if (appearance.eyeColor && direction !== 'up') {
    const iris = shadeColor(eyes, 156);
    const shine = shadeColor(eyes, 202);
    if (front) {
      for (const x of [119, 134]) {
        put(iris, x, faceY, 4, 3);
        put(shine, x + 1, faceY, 1, 1);
      }
    } else if (side) {
      const x = direction === 'left' ? 110 : 143;
      put(iris, x, faceY, 3, 3);
      put(shine, x + 1, faceY, 1, 1);
    }
  }
  const faceStyle = appearance.facialHair?.toLowerCase() ?? 'none';
  const facialColor = shadeColor(hair, 80);
  if (front && faceStyle !== 'none') {
    if (faceStyle === 'stubble') {
      context.fillStyle = `rgba(${hair.join(',')},.5)`;
      for (let i = 0; i < 12; i += 1) {
        const x = 113 + (i * 7) % 27;
        const y = beardY + Math.floor(i / 4) * 3;
        context.fillRect(x, y, 2, 2);
      }
    } else if (faceStyle === 'mustache' || faceStyle === 'beard') {
      put(facialColor, 113, beardY, 12, 3);
      put(facialColor, 130, beardY, 12, 3);
      if (faceStyle === 'beard') {
        put(facialColor, 110, beardY + 4, 7, 10);
        put(facialColor, 137, beardY + 4, 7, 10);
        put(facialColor, 116, beardY + 12, 23, 5);
        put(shadeColor(hair, 120), 119, beardY + 13, 15, 3);
      }
    }
  } else if (side && faceStyle !== 'none') {
    const left = direction === 'left';
    const x = left ? 96 : 153;
    if (faceStyle === 'stubble') {
      context.fillStyle = `rgba(${hair.join(',')},.45)`;
      for (let i = 0; i < 5; i += 1) context.fillRect(x, beardY - 3 + i * 3, 3, 2);
    } else {
      put(facialColor, x, beardY, 7, faceStyle === 'beard' ? 14 : 4);
      if (faceStyle === 'beard') put(facialColor, left ? x + 2 : x - 6, beardY + 11, 11, 4);
    }
  }
  const accessory = appearance.headwear?.toLowerCase() ?? 'none';
  if (accessory === 'headband' || accessory === 'circlet') {
    const metal = accessory === 'circlet';
    const accent = metal ? trim : shadeColor(hair, 115);
    const x = direction === 'left' ? 93 : direction === 'right' ? 115 : 100;
    const w = side ? 43 : 56;
    const headbandY = appearance.classId === 'warrior' ? 37 : appearance.classId === 'adept' ? 36 : appearance.classId === 'rogue' ? 53 : 46;
    put(shadeColor(accent, 85), x, headbandY, w, 5);
    put(accent, x + 2, headbandY + 1, w - 4, 2);
    if (metal && direction !== 'up') put(shadeColor(trim, 180), x + Math.floor(w / 2), headbandY - 1, 5, 5);
  } else if (accessory === 'earring' && direction !== 'up') {
    const x = direction === 'left' ? 95 : direction === 'right' ? 159 : 158;
    const y = faceY + 13;
    put(shadeColor(trim, 90), x, y, 5, 7);
    put(trim, x + 1, y + 1, 3, 4);
    put(skin, x + 2, y + 3, 1, 2);
  }
}

/**
 * Pose changes are continuously warped from the intact original painting,
 * rather than cutting rectangular boot pieces out of the character.
 */
const strideAnatomy: Record<HeroAppearance['classId'], {
  hips: number; feet: number; center: number; minX: number; maxX: number;
}> = {
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
  const stride = [0, 0.65, 1, 0, -0.65, -1][frame];
  const bob = [0, -2, -3, 0, -2, -3][frame];
  const source = context.getImageData(0, 0, HERO_FRAME_SIZE, HERO_FRAME_SIZE);
  const output = context.createImageData(HERO_FRAME_SIZE, HERO_FRAME_SIZE);
  output.data.set(source.data);
  const side = direction === 'left' || direction === 'right';
  const facing = direction === 'left' ? -1 : 1;
  if (stride !== 0) {
    for (let y = anatomy.hips; y < HERO_FRAME_SIZE; y++) {
      const position = (y - anatomy.hips) / (anatomy.feet - anatomy.hips);
      const flex = smoothstep(position);
      if (flex <= 0) continue;
      const knee = Math.sin(Math.PI * Math.min(1, position));
      for (let x = anatomy.minX; x <= anatomy.maxX; x++) {
        const edge = Math.min((x - anatomy.minX) / 10, (anatomy.maxX - x) / 10, 1);
        const fade = smoothstep(edge);
        const leg = Math.tanh((x - anatomy.center) / (side ? 8 : 5));
        const footSwing = stride * leg;
        const step = (side ? 8 : 5.5) * footSwing * flex * fade;
        const kneeBend = -stride * leg * 2.5 * knee * fade;
        const lift = Math.max(0, footSwing) * 7 * flex * fade;
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
  const canvas = cropDirectionalSpriteFrame(atlas, direction);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Could not create the hero sprite canvas.');
  recolorChoices(context, direction, appearance);
  applyWalkPose(context, options.pose ?? 'idle', direction, appearance.classId);
  return canvas;
}
