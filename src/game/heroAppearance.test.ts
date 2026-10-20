import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { CLASSES, type ClassId, type Direction } from './data.ts';
import {
  createCustomizedHeroFrame,
  HERO_FRAME_SIZE,
  HERO_WALK_POSES,
  WALK_FRAME_DURATION_MS,
  walkPoseAtTime,
} from './heroAppearance.ts';

const classes: ClassId[] = ['warrior', 'rogue', 'adept', 'mage'];
const directions: Direction[] = ['down', 'up', 'left', 'right'];
const hairstyles = ['cropped', 'waved', 'topknot', 'long', 'braided', 'mohawk', 'shaved'];
const customColors = {
  skin: '#48b6e0',
  hairColor: '#dba34a',
  clothingColor: '#d02c9b',
};

test('walk animation advances through six evenly timed poses and loops', () => {
  for (let frame = 0; frame < HERO_WALK_POSES.length; frame += 1) {
    assert.equal(
      walkPoseAtTime(frame * WALK_FRAME_DURATION_MS),
      HERO_WALK_POSES[frame],
    );
  }
  assert.equal(
    walkPoseAtTime(HERO_WALK_POSES.length * WALK_FRAME_DURATION_MS),
    HERO_WALK_POSES[0],
  );
});

type Appearance = {
  classId: ClassId;
  skin: string;
  hairStyle: string;
  hairColor: string;
  clothingColor: string;
  eyeColor?: string;
  trimColor?: string;
  facialHair?: string;
  headwear?: string;
  weapon?: string;
};

async function withCanvasDocument<T>(run: () => Promise<T>): Promise<T> {
  const originalDocument = globalThis.document;
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { createElement: () => createCanvas(1, 1) },
  });
  try {
    return await run();
  } finally {
    if (originalDocument) {
      Object.defineProperty(globalThis, 'document', {
        configurable: true,
        value: originalDocument,
      });
    } else {
      Reflect.deleteProperty(globalThis, 'document');
    }
  }
}

function createFrame(
  atlas: CanvasImageSource,
  direction: Direction,
  appearance: Appearance,
) {
  return createCustomizedHeroFrame(atlas, direction, appearance);
}

function changedPixels(first: HTMLCanvasElement, second: HTMLCanvasElement) {
  const firstPixels = first.getContext('2d')!.getImageData(0, 0, first.width, first.height).data;
  const secondPixels = second.getContext('2d')!.getImageData(0, 0, second.width, second.height).data;
  let changed = 0;
  for (let index = 0; index < firstPixels.length; index += 4) {
    if (
      firstPixels[index] !== secondPixels[index] ||
      firstPixels[index + 1] !== secondPixels[index + 1] ||
      firstPixels[index + 2] !== secondPixels[index + 2] ||
      firstPixels[index + 3] !== secondPixels[index + 3]
    ) changed += 1;
  }
  return changed;
}

function assertFrameSize(frame: HTMLCanvasElement, context: string) {
  assert.equal(frame.width, HERO_FRAME_SIZE, `${context} frame width`);
  assert.equal(frame.height, HERO_FRAME_SIZE, `${context} frame height`);
}

test('custom hero appearance stays visible in all directions and classes', async (t) => {
  const atlases = new Map<ClassId, CanvasImageSource>();
  for (const classId of classes) {
    const atlasPath = fileURLToPath(new URL(`../../public/class-sprites/${classId}.png`, import.meta.url));
    atlases.set(classId, await loadImage(atlasPath) as unknown as CanvasImageSource);
  }

  await withCanvasDocument(async () => {
    await t.test('generates a full-size, distinct frame for each facing', () => {
      for (const classId of classes) {
        const atlas = atlases.get(classId)!;
        const frames = directions.map((direction) => {
          const frame = createFrame(atlas, direction, {
            classId,
            skin: '#d99168',
            hairStyle: 'cropped',
            hairColor: '#3a2926',
            clothingColor: '#d36345',
          });
          assertFrameSize(frame, `${classId} ${direction}`);
          return frame;
        });
        for (let index = 1; index < frames.length; index += 1) {
          assert.ok(
            changedPixels(frames[0], frames[index]) > 0,
            `${classId} ${directions[index]} should not reuse its down-facing frame`,
          );
        }
      }
    });

    await t.test('animates alternating steps while bobbing the entire sprite consistently', () => {
      assert.equal(HERO_WALK_POSES.length, 6);
      const bobs = [0, -2, -3, 0, -2, -3];
      for (const classId of classes) {
        const atlas = atlases.get(classId)!;
        const appearance: Appearance = {
          classId, skin: '#d99168', hairStyle: 'cropped',
          hairColor: '#3a2926', clothingColor: '#d36345',
        };
        for (const direction of directions) {
          const idle = createFrame(atlas, direction, appearance);
          const frames = HERO_WALK_POSES.map((pose) =>
            createCustomizedHeroFrame(atlas, direction, appearance, { pose }));
          for (let index = 0; index < frames.length; index += 1) {
            assert.ok(
              changedPixels(frames[index], frames[(index + 1) % frames.length]) > 0,
              `${classId} ${direction} walk frame ${index} should advance`,
            );
            // The shoulders, head, and overlays must move *together*. Only the
            // lower body deforms; the upper body moves as one by 0/-2/-3px.
            const expected = createCanvas(HERO_FRAME_SIZE, HERO_FRAME_SIZE);
            expected.getContext('2d')!.drawImage(idle, 0, bobs[index]);
            const expectedUpper = expected.getContext('2d')!.getImageData(0, 0, HERO_FRAME_SIZE, 145).data;
            const actualUpper = frames[index].getContext('2d')!.getImageData(0, 0, HERO_FRAME_SIZE, 145).data;
            assert.deepEqual(actualUpper, expectedUpper,
              `${classId} ${direction} upper body should follow the sprite bounce`,
            );
          }
        }
      }
    });

    await t.test('selected skin, hair, and clothing colors change each facing', () => {
      const classId = 'warrior';
      const atlas = atlases.get(classId)!;
      for (const direction of directions) {
        const base: Appearance = {
          classId,
          skin: '#d99168',
          hairStyle: 'cropped',
          hairColor: '#3a2926',
          clothingColor: '#d36345',
        };
        const original = createFrame(atlas, direction, base);
        for (const [colorKey, color] of Object.entries(customColors) as [keyof typeof customColors, string][]) {
          const customized = createFrame(atlas, direction, { ...base, [colorKey]: color });
          assert.ok(
            changedPixels(original, customized) > 0,
            `${direction} frame should respond to the selected ${colorKey} color`,
          );
        }
      }
    });

    await t.test('every class-specific clothing mask responds in every facing', () => {
      for (const classId of classes) {
        const atlas = atlases.get(classId)!;
        for (const direction of directions) {
          const base: Appearance = {
            classId,
            skin: '#d99168',
            hairStyle: 'cropped',
            hairColor: '#3a2926',
            clothingColor: '#d36345',
          };
          const original = createFrame(atlas, direction, base);
          const recolored = createFrame(atlas, direction, {
            ...base,
            clothingColor: customColors.clothingColor,
          });
          assert.ok(
            changedPixels(original, recolored) > 0,
            `${classId} ${direction} class-specific outfit should respond to its selected color`,
          );
          assertFrameSize(recolored, `${classId} ${direction} class-specific outfit`);
        }
      }
    });

    await t.test('each hairstyle changes the frame in all four facings without resizing it', () => {
      const classId = 'warrior';
      const atlas = atlases.get(classId)!;
      for (const direction of directions) {
        const cropped = createFrame(atlas, direction, {
          classId,
          skin: '#d99168',
          hairStyle: 'cropped',
          hairColor: '#3a2926',
          clothingColor: '#d36345',
        });
        for (const hairStyle of hairstyles) {
          const styled = createFrame(atlas, direction, {
            classId,
            skin: '#d99168',
            hairStyle,
            hairColor: '#3a2926',
            clothingColor: '#d36345',
          });
          assertFrameSize(styled, `${hairStyle} ${direction}`);
          if (hairStyle !== 'cropped') {
            assert.ok(
              changedPixels(cropped, styled) > 0,
              `${hairStyle} hairstyle should change the ${direction} frame`,
            );
          }
        }
      }
    });

    await t.test('new eye, trim, facial hair, and accessory controls visibly change the character', () => {
      const options: Array<Pick<Appearance, 'eyeColor' | 'trimColor' | 'facialHair' | 'headwear'>> = [
        { eyeColor: '#42aaff' },
        { trimColor: '#ff00cc' },
        { facialHair: 'beard' },
        { headwear: 'circlet' },
      ];
      for (const classId of classes) {
        const atlas = atlases.get(classId)!;
        const base: Appearance = {
          classId, skin: '#d99168', hairStyle: 'cropped',
          hairColor: '#3a2926', clothingColor: '#d36345',
        };
        for (const direction of directions) {
          const starter = createFrame(atlas, direction, base);
          for (const option of options) {
            // Eyes/facial hair are not drawn on back-facing portraits.
            if (direction === 'up' && (option.eyeColor || option.facialHair)) continue;
            const modified = createFrame(atlas, direction, { ...base, ...option });
            assertFrameSize(modified, `${classId} ${direction} new appearance`);
            assert.ok(changedPixels(starter, modified) > 0,
              `${classId} ${direction} should respond to ${Object.keys(option)[0]}`);
          }
        }
      }
    });

    await t.test('equipped weapons do not replace the regular class sprite', () => {
      const weaponNames = ['Hearthguard mace', 'Starfall spear', 'Cinderwake staff'];
      for (const classId of classes) {
        const atlas = atlases.get(classId)!;
        for (const direction of directions) {
          const base: Appearance = {
            classId,
            skin: '#d99168',
            hairStyle: 'cropped',
            hairColor: '#3a2926',
            clothingColor: '#d36345',
            weapon: CLASSES[classId].weapon,
          };
          const starter = createFrame(atlas, direction, base);
          for (const weapon of weaponNames) {
            const customized = createFrame(atlas, direction, { ...base, weapon });
            assert.equal(
              changedPixels(starter, customized),
              0,
              `${weapon} should not replace the regular ${classId} sprite facing ${direction}`,
            );
          }
        }
      }
    });
  });
});
