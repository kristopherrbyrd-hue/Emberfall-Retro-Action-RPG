import type { CharacterConfig, Direction } from './data';

/** 7 columns (idle + six steps) by 4 rows (down, left, right, up).
 * Each palette mask stores a material-region ID in the red channel.
 * Color changes never affect silhouette or sprite geometry.
 * The source assets have a 128px grid, scaled to 256px without filtering.
 */
const CELL = 128;
const dirs: Record<Direction, number> = { down: 0, left: 1, right: 2, up: 3 };
const regions = [40, 80, 100, 120, 160, 200, 240] as const;

type Settings = Pick<CharacterConfig,
 'skin' | 'hairColor' | 'clothingColor' | 'eyeColor' | 'trimColor' | 'hairStyle' | 'headwear' | 'facialHair'
> & Pick<CharacterConfig, 'clothingSecondary' | 'leatherColor' | 'metalColor'>;

export function appearancePalette(appearance: Settings): Readonly<Record<number, string>> {
  return {
    40: appearance.skin, 80: appearance.hairColor,
    100: appearance.clothingSecondary ?? '#a78364',
    120: appearance.clothingColor, 160: appearance.trimColor ?? '#cfa659',
    200: appearance.leatherColor ?? '#76513b',
    240: appearance.metalColor ?? '#b8bbc6',
  };
}

export function validHex(value: string | undefined, fallback: string): [number, number, number] {
  const normalized = /^#[\da-fA-F]{6}$/.test(value ?? '') ? value! : fallback;
  return [1, 3, 5].map((offset) => Number.parseInt(normalized.slice(offset, offset + 2), 16)) as [number, number, number];
}

function redrawMaterials(
  artwork: ImageData, materialMask: ImageData, colors: Readonly<Record<number, string>>,
) {
  const pixelColors = new Map(regions.map((id) => [id, validHex(colors[id], '#999999')]));
  const image = artwork.data, mask = materialMask.data;
  for (let i = 0; i < image.length; i += 4) {
    if (image[i + 3] === 0 || mask[i + 3] === 0) continue;
    const id = mask[i];
    const selected = pixelColors.get(id as typeof regions[number]);
    if (!selected) continue;
    // Preserve original light/dark shading, never the original hue.
    const originalLight = (image[i] * .27 + image[i + 1] * .55 + image[i + 2] * .18);
    const strength = Math.max(.4, Math.min(1.35, originalLight / 125));
    for (let k = 0; k < 3; k++) image[i + k] = Math.min(255, Math.round(selected[k] * strength));
  }
}

function createPaintContext() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = CELL;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Cannot create the modular sprite canvas.');
  context.imageSmoothingEnabled = false;
  return { canvas, context };
}

function drawAccessories(ctx: CanvasRenderingContext2D, direction: Direction, appearance: Settings) {
  // Pixel-sized accessory layers: cleanly repeatable over every walking frame.
  // Hair and headgear cover the same anchors regardless of movement pose.
  const hair = appearance.hairStyle.toLowerCase();
  const h = validHex(appearance.hairColor, '#303846');
  const hairColor = `rgb(${h.join(',')})`;
  const metal = validHex(appearance.trimColor, '#cfa659');
  const trim = `rgb(${metal.join(',')})`;
  const mid = 64;
  const isBack = direction === 'up';
  ctx.save();
  if (hair === 'topknot' || hair === 'mohawk') {
    ctx.fillStyle = '#161520';
    ctx.fillRect(mid - 6, 8, 12, 8);
    ctx.fillStyle = hairColor;
    ctx.fillRect(mid - (hair === 'mohawk' ? 4 : 5), 7, hair === 'mohawk' ? 8 : 10, 7);
  } else if (hair === 'long' || hair === 'braided') {
    ctx.fillStyle = hairColor;
    const side = direction === 'left' ? mid + 13 : mid - 17;
    ctx.fillRect(side, 27, hair === 'braided' ? 5 : 8, isBack ? 37 : 24);
    if (hair === 'braided') for (let j = 0; j < 4; j++) ctx.fillRect(side - j % 2, 31 + j * 6, 7, 3);
  } else if (hair === 'waved') {
    ctx.fillStyle = hairColor;
    ctx.fillRect(mid - 17, 21, 5, 10);
    ctx.fillRect(mid + 12, 25, 5, 9);
  }
  const hat = (appearance.headwear ?? 'none').toLowerCase();
  if (hat === 'headband' || hat === 'circlet') {
    ctx.fillStyle = trim;
    ctx.fillRect(mid - 14, 26, 28, 3);
    if (hat === 'circlet') {ctx.fillRect(mid - 3, 22, 6, 7);ctx.fillStyle = '#285275';ctx.fillRect(mid-1,24,3,3);}
  } else if (hat === 'hood' || hat === 'helmet') {
    const helmet = hat === 'helmet';
    ctx.fillStyle = helmet ? '#66747b' : '#30435c';
    ctx.fillRect(mid - 17, 14, 34, 13);
    ctx.fillRect(mid - 18, 26, 5, 20);
    ctx.fillRect(mid + 13, 26, 5, 20);
    ctx.fillStyle = helmet ? '#c2c6bd' : trim;
    ctx.fillRect(mid - 14, 23, 28, 3);
  }
  if (!isBack && appearance.facialHair && appearance.facialHair !== 'none') {
    ctx.fillStyle = hairColor;
    const moustache = appearance.facialHair === 'mustache';
    const y = 46;
    ctx.fillRect(mid - 5, y, 10, 2);
    if (!moustache) ctx.fillRect(mid - 7, y + 3, 14, appearance.facialHair === 'beard' ? 6 : 2);
  }
  if (!isBack && appearance.eyeColor) {
    const e = validHex(appearance.eyeColor, '#537894');
    ctx.fillStyle = `rgb(${e.join(',')})`;
    if (direction === 'down') { ctx.fillRect(mid - 7, 39, 2, 2); ctx.fillRect(mid + 5, 39, 2, 2); }
    else ctx.fillRect(direction === 'left' ? mid - 7 : mid + 6, 39, 2, 2);
  }
  ctx.restore();
}

export function renderModularHeroFrame(
  atlas: CanvasImageSource, materialAtlas: CanvasImageSource,
  facing: Direction, appearance: Settings, frame: number,
): HTMLCanvasElement {
  const row = dirs[facing];
  const { canvas, context } = createPaintContext();
  const col = Math.max(0, Math.min(6, Math.floor(frame)));
  context.drawImage(atlas, col * CELL, row * CELL, CELL, CELL, 0, 0, CELL, CELL);
  const masks = createPaintContext();
  masks.context.drawImage(materialAtlas, col * CELL, row * CELL, CELL, CELL, 0, 0, CELL, CELL);
  const base = context.getImageData(0, 0, CELL, CELL);
  redrawMaterials(base, masks.context.getImageData(0, 0, CELL, CELL), appearancePalette(appearance));
  context.putImageData(base, 0, 0);
  drawAccessories(context, facing, appearance);
  const output = document.createElement('canvas');
  output.width = output.height = 256;
  const outCtx = output.getContext('2d');
  if (!outCtx) throw new Error('Cannot scale the modular sprite.');
  outCtx.imageSmoothingEnabled = false;
  outCtx.drawImage(canvas, 0, 0, 256, 256);
  return output;
}
