import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { appearancePalette, validHex } from './modularHero';

test('each configurable material has an independent palette index', () => {
  const colors = appearancePalette({
    skin: '#102030', hairColor: '#223344', clothingColor: '#334455',
    clothingSecondary: '#445566', trimColor: '#556677',
    leatherColor: '#667788', metalColor: '#778899', hairStyle: 'cropped',
  });
  assert.deepEqual([40, 80, 100, 120, 160, 200, 240].map(id => colors[id]),
    ['#102030','#223344','#445566','#334455','#556677','#667788','#778899']);
});

test('unrestricted color hex values resolve without changing geometry', () => {
  assert.deepEqual(validHex('#e319cc', '#000000'), [227, 25, 204]);
  assert.deepEqual(validHex('not-a-color', '#a0b0c0'), [160, 176, 192]);
});
