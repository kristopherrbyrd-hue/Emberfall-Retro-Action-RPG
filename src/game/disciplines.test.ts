import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getHeroTrainingBonuses,
  HERO_UPGRADES,
  heroUpgradeEffect,
} from './disciplines';
import { AdventureEngine } from './simulation';

test('the shared Hero tree exposes the four requested passive stats', () => {
  assert.deepEqual(HERO_UPGRADES.map((upgrade) => upgrade.stat), [
    'speed',
    'damage',
    'health',
    'spirit',
  ]);
  assert.deepEqual(getHeroTrainingBonuses({
    'hero-speed': 5,
    'hero-damage': 5,
    'hero-health': 5,
    'hero-spirit': 5,
  }), {
    movementMultiplier: 1.25,
    damageMultiplier: 1.2,
    maxHp: 60,
    maxResource: 40,
  });
});

test('Hero stat effects continue scaling above rank five', () => {
  const speed = HERO_UPGRADES.find((upgrade) => upgrade.id === 'hero-speed')!;
  const health = HERO_UPGRADES.find((upgrade) => upgrade.id === 'hero-health')!;
  assert.equal(heroUpgradeEffect(speed, 0), '+0% movement speed');
  assert.equal(heroUpgradeEffect(speed, 12), '+60% movement speed');
  assert.equal(heroUpgradeEffect(health, 12), '+144 maximum health');
  assert.deepEqual(getHeroTrainingBonuses({
    'hero-speed': 6,
    'hero-damage': 6,
    'hero-health': 6,
    'hero-spirit': 6,
  }), {
    movementMultiplier: 1.3,
    damageMultiplier: 1.24,
    maxHp: 72,
    maxResource: 48,
  });
});

test('Hero stats can be trained past rank five and the higher rank survives saves', () => {
  const engine = new AdventureEngine();
  engine.startNewGame({
    name: 'Traveler',
    classId: 'warrior',
    skin: '#d99168',
    hairStyle: 'cropped',
    hairColor: '#3a2926',
    clothingColor: '#d36345',
  });
  const player = engine.getState().player!;
  player.level = 2;
  player.trainingPoints = 7;
  for (let i = 0; i < 6; i++) engine.trainPower('hero-speed');
  assert.equal(engine.getState().trainedPowers['hero-speed'], 6);
  assert.equal(player.trainingPoints, 1);
  assert.equal(heroUpgradeEffect(HERO_UPGRADES[0]!, 6), '+30% movement speed');

  const resumed = new AdventureEngine();
  assert.ok(resumed.loadSave(JSON.parse(JSON.stringify(engine.exportSave()))));
  assert.equal(resumed.getState().trainedPowers['hero-speed'], 6);
  resumed.trainPower('hero-speed');
  assert.equal(resumed.getState().trainedPowers['hero-speed'], 7);
});

test('Hero training spends points, increases gear-independent health and spirit, and survives saves', () => {
  const engine = new AdventureEngine();
  engine.startNewGame({
    name: 'Traveler',
    classId: 'warrior',
    skin: '#d99168',
    hairStyle: 'cropped',
    hairColor: '#3a2926',
    clothingColor: '#d36345',
  });
  const player = engine.getState().player!;
  const startingMaxHp = player.maxHp;
  const startingMaxResource = player.maxResource;
  player.level = 2;
  player.trainingPoints = 4;

  engine.trainPower('hero-health');
  engine.trainPower('hero-spirit');
  engine.trainPower('hero-speed');
  engine.trainPower('hero-damage');

  assert.equal(player.trainingPoints, 0);
  assert.equal(engine.getState().trainedPowers['hero-speed'], 1);
  assert.equal(engine.getState().trainedPowers['hero-damage'], 1);
  assert.equal(player.maxHp, startingMaxHp + 12);
  assert.equal(player.hp, startingMaxHp + 12);
  assert.equal(player.maxResource, startingMaxResource + 8);
  assert.equal(player.resource, startingMaxResource + 8);

  const save = engine.exportSave()!;
  const resumed = new AdventureEngine();
  assert.ok(resumed.loadSave(JSON.parse(JSON.stringify(save))));
  assert.equal(resumed.getState().trainedPowers['hero-health'], 1);
  assert.equal(resumed.getState().trainedPowers['hero-spirit'], 1);
  assert.equal(resumed.getState().player!.maxHp, startingMaxHp + 12);
  assert.equal(resumed.getState().player!.maxResource, startingMaxResource + 8);
});

test('the Hero tree is unavailable before the first level-up, then accepts training points', () => {
  const engine = new AdventureEngine();
  engine.startNewGame({
    name: 'Traveler',
    classId: 'warrior',
    skin: '#d99168',
    hairStyle: 'cropped',
    hairColor: '#3a2926',
    clothingColor: '#d36345',
  });
  const player = engine.getState().player!;
  player.trainingPoints = 1;
  engine.trainPower('hero-health');
  assert.equal(engine.getState().trainedPowers['hero-health'], undefined);
  assert.equal(player.trainingPoints, 1);

  player.level = 2;
  engine.trainPower('hero-health');
  assert.equal(engine.getState().trainedPowers['hero-health'], 1);
  assert.equal(player.trainingPoints, 0);
});
