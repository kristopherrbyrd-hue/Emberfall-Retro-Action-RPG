import assert from 'node:assert/strict';
import test from 'node:test';
import {
  RESTORATION_DURATION_MS, RESTORATION_SHOTS, getRestorationShot,
  getRestorationCaption, normalizeFinale,
} from './finale';
import { cinematicActors, cinematicCamera, drawCinematicFx, CINE_COLORS, CINE_POOL } from './finaleCinematic';
import type Phaser from 'phaser';
import { AdventureEngine } from './simulation';
import { BELL_REGION_IDS, WORLD_CELLS, worldCellOrigin } from './worldMap';
import { getWorldColorProfile, normalizeWorldProgress } from './worldProgress';
import { HUNGER_ARENA } from './hungerTerritory';
import { DUNGEONS, dungeonRoomOrigin } from './dungeons';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { GameMenu } from './GameMenu';

function restoring(allied: boolean, ms = 0) {
  const source = new AdventureEngine();
  source.startNewGame({ name: 'Traveler', classId: 'mage', skin: '#d99168',
    hairStyle: 'cropped', hairColor: '#3a2926', clothingColor: '#d36345' });
  const save = source.exportSave()!;
  const origin = worldCellOrigin(HUNGER_ARENA);
  Object.assign(save.state.player!, { x: origin.x + 320, y: origin.y + 330, level: 25 });
  save.state.bossDefeated = true;
  save.state.quest = { title: 'The bells below', step: 'Journey complete', description: 'Humanity is free.' };
  save.progress.world!.silencedBells = [...BELL_REGION_IDS];
  save.progress.world!.unlockedRegions = [...BELL_REGION_IDS, 'first-hunger'];
  save.progress.world!.finale = { stage: 'restoring', allied, restorationMs: ms,
    restorationDurationMs: RESTORATION_DURATION_MS };
  save.progress.collectedIds = ['kept-treasure'];
  save.progress.defeatedIds = ['first-hunger-sanctum:first-hunger'];
  save.state.overlay = 'inventory';
  const engine = new AdventureEngine();
  assert.ok(engine.loadSave(save));
  return engine;
}

function savedJourney(engine: AdventureEngine) {
  return JSON.parse(JSON.stringify(engine.exportSave()));
}

test('ending replay is unavailable until completion and is never serialized', () => {
  const fresh = new AdventureEngine();
  assert.equal(fresh.startRestorationReplay(), false);
  fresh.startNewGame({ name: 'Traveler', classId: 'mage', skin: '#d99168',
    hairStyle: 'cropped', hairColor: '#3a2926', clothingColor: '#d36345' });
  assert.equal(fresh.startRestorationReplay(), false);
  const engine = restoring(true, 700);
  const before = savedJourney(engine);
  assert.equal(engine.startRestorationReplay(), false);
  assert.deepEqual(savedJourney(engine), before);
  assert.deepEqual(engine.getRestorationPresentation(), { ms: 700, allied: true, replay: false });
});

test('postgame replay preserves the entire journey through every shot on both alliance paths', () => {
  for (const allied of [true, false]) for (const inDungeon of [false, true]) {
    const engine = restoring(allied, RESTORATION_DURATION_MS - 50);
    engine.tick(50);
    const save = savedJourney(engine);
    // Move away from the initial postgame spawn: replay must not hand off again.
    const origin = worldCellOrigin('canopy');
    Object.assign(save.state.player, { x: origin.x + 320, y: origin.y + 240 });
    if (inDungeon) {
      const dungeon = DUNGEONS[0];
      const room = dungeon.rooms.find((r) => r.id === dungeon.entryRoomId)!;
      const roomOrigin = dungeonRoomOrigin(room);
      save.progress.world.activeDungeon = { id: dungeon.id, roomId: room.id,
        returnX: save.state.player.x, returnY: save.state.player.y };
      Object.assign(save.state.player, { x: roomOrigin.x + 320, y: roomOrigin.y + 240 });
    }
    assert.ok(engine.loadSave(save));
    engine.openMenu('settings');
    const before = savedJourney(engine);
    const colorBefore = getWorldColorProfile(engine.getWorldProgress());
    assert.equal(engine.startRestorationReplay(), true);
    assert.equal(engine.startRestorationReplay(), false, 'cannot restart an active replay');
    assert.equal(engine.getState().overlay, null);
    for (let ms = 0; ms < RESTORATION_DURATION_MS; ms += 50) {
      assert.deepEqual(engine.getRestorationPresentation(), { ms, allied, replay: true });
      engine.setDirection('right', true);
      engine.setAnalogMovement(1, 1);
      engine.pressButton('attack');
      engine.pressButton('context');
      engine.pressButton('ability0');
      engine.openMenu('map');
      engine.dismissDialog();
      assert.equal(engine.requestGuide(), false);
      assert.equal(engine.returnToLastWell(), false);
      engine.tick(50);
      if (ms % 7000 === 0) assert.deepEqual(savedJourney(engine), before);
    }
    assert.equal(engine.getRestorationPresentation(), null, 'returns automatically to exploration');
    assert.deepEqual(savedJourney(engine), before, 'no combat, timers, rewards, color, teleport or discovery changes');
    assert.deepEqual(getWorldColorProfile(engine.getWorldProgress()), colorBefore);
    assert.ok(engine.startRestorationReplay(), 'can watch again');
    engine.tick(50);
    const resumed = new AdventureEngine();
    assert.ok(resumed.loadSave(savedJourney(engine)));
    assert.equal(resumed.getRestorationPresentation(), null, 'reload resumes exploration, not replay');
    engine.closeMenu(); // Escape follows this same path.
    assert.equal(engine.getRestorationPresentation(), null);
    assert.deepEqual(savedJourney(engine), before, 'Escape ends only presentation');
    assert.ok(engine.startRestorationReplay());
    engine.stopRestorationReplay();
    assert.deepEqual(savedJourney(engine), before, 'explicit return ends only presentation');
    engine.setAnalogMovement(1, 0);
    engine.tick(50);
    assert.ok(engine.getState().player!.x > before.state.player.x, 'exploration controls resume');
  }
});

test('journey menu offers the optional replay action only when App supplies completion access', () => {
  const props = { preferences: { musicMuted: false, battleMuted: false, musicVolume: 1, battleVolume: 1 },
    changePreferences: () => {}, wellName: 'Hearthglen well', canReturn: true,
    returnToWell: () => true, returnToTitle: () => true, close: () => {},
    audioNotice: null, saveFailed: false };
  assert.doesNotMatch(renderToStaticMarkup(createElement(GameMenu, props)), /button-replay-ending/);
  assert.match(renderToStaticMarkup(createElement(GameMenu, { ...props, replayEnding: () => {} })),
    /button-replay-ending.*Watch ending again/);
});

test('the authored cinematic visits all five real bell regions on a contiguous saved timeline', () => {
  let end = 0;
  const regions = new Set<string>();
  for (const shot of RESTORATION_SHOTS) {
    assert.equal(shot.startMs, end);
    const cell = WORLD_CELLS.find((c) => c.id === shot.cellId);
    assert.ok(cell?.contentReady, `${shot.id} has original authored scenery`);
    regions.add(cell.regionId);
    assert.equal(getRestorationShot(shot.startMs).id, shot.id);
    assert.equal(getRestorationShot(shot.startMs + shot.durationMs - 1).id, shot.id);
    end += shot.durationMs;
  }
  assert.equal(end, RESTORATION_DURATION_MS);
  for (const region of BELL_REGION_IDS) assert.ok(regions.has(region));
  assert.match(getRestorationCaption(48000, true), /bells are no longer necessary.*free to feel/);
  assert.match(getRestorationCaption(42000, true), /Maelis fought beside you/);
  assert.match(getRestorationCaption(42000, false), /faced the Hunger alone.*Vigil/);
});

test('older restoration saves preserve their saturation percentage and completed saves never replay', () => {
  for (const ms of [0, 3000, 5700, 12000, 15000]) {
    const migrated = normalizeFinale({ stage: 'restoring', allied: false, restorationMs: ms }, false);
    assert.equal(migrated.restorationMs / RESTORATION_DURATION_MS, ms / 15000);
    assert.deepEqual(normalizeFinale(migrated, false), migrated, 'clock migration is idempotent');
  }
  const complete = normalizeWorldProgress({ finale: { stage: 'complete', restorationMs: 0 } });
  assert.equal(complete.colorsRestored, true);
  assert.equal(getWorldColorProfile(complete).saturation, 1.18);
});

test('each cinematic shot resumes on both alliance paths without changing earned progress or position', () => {
  for (const allied of [true, false]) for (const shot of RESTORATION_SHOTS) {
    const ms = shot.startMs + 1750;
    const engine = restoring(allied, ms);
    assert.equal(engine.getState().overlay, null);
    const before = engine.exportSave()!;
    const player = engine.getState().player!;
    const stablePlayer = { x: player.x, y: player.y, hp: player.hp, xp: player.xp, coins: player.coins };
    engine.setAnalogMovement(1, 1);
    engine.openMenu('inventory');
    engine.pressButton('attack');
    engine.dismissDialog();
    engine.tick(50);
    assert.equal(engine.getState().overlay, null);
    assert.equal(engine.getWorldProgress().finale.restorationMs, ms + 50);
    assert.equal(engine.getWorldProgress().finale.allied, allied);
    assert.deepEqual({ x: player.x, y: player.y, hp: player.hp, xp: player.xp, coins: player.coins }, stablePlayer);
    assert.deepEqual(engine.getState().inventory, before.state.inventory);
    assert.deepEqual(engine.getState().discoveredWorldCells, before.state.discoveredWorldCells);
    assert.deepEqual(engine.exportSave()!.progress.collectedIds, before.progress.collectedIds);
    assert.deepEqual(engine.getWorldProgress().silencedBells, [...BELL_REGION_IDS]);
    assert.ok(!engine.getEnemies().some((e) => e.name === 'The First Hunger' || e.name === 'Maelis'));
    const resumed = new AdventureEngine();
    assert.ok(resumed.loadSave(engine.exportSave()!));
    assert.equal(resumed.getWorldProgress().finale.restorationMs, ms + 50);
    assert.equal(getRestorationShot(resumed.getWorldProgress().finale.restorationMs).id, shot.id);
    assert.equal(getWorldColorProfile(resumed.getWorldProgress()).saturation,
      getWorldColorProfile(engine.getWorldProgress()).saturation);
  }
});

test('restoration finishes automatically in enhanced color and reload remains safe for exploration', () => {
  for (const allied of [true, false]) {
    const engine = restoring(allied, RESTORATION_DURATION_MS - 100);
    let saturation = getWorldColorProfile(engine.getWorldProgress()).saturation;
    for (let i = 0; i < 2; i++) {
      engine.tick(50);
      const next = getWorldColorProfile(engine.getWorldProgress()).saturation;
      assert.ok(next >= saturation); saturation = next;
    }
    assert.equal(engine.getWorldProgress().finale.stage, 'complete');
    assert.equal(engine.getState().dialog, null);
    assert.equal(saturation, 1.18);
    const resumed = new AdventureEngine();
    assert.ok(resumed.loadSave(engine.exportSave()!));
    assert.equal(resumed.getWorldProgress().finale.stage, 'complete');
    assert.equal(resumed.getState().quest.step, 'Journey complete');
    assert.equal(resumed.getWorldProgress().finale.allied, allied);
    assert.ok(!resumed.getEnemies().some((e) => e.name === 'The First Hunger' || e.name === 'Maelis'));
    const x = resumed.getState().player!.x;
    resumed.setAnalogMovement(1, 0); resumed.tick(50);
    assert.ok(resumed.getState().player!.x > x, 'ordinary postgame movement is available');
  }
});

test('villager choreography is animated, deterministic, bounded and distinguishes the Maelis choice', () => {
  for (const shot of RESTORATION_SHOTS) {
    const first = cinematicActors(shot.id, 1000, shot.durationMs, true);
    const next = cinematicActors(shot.id, 3500, shot.durationMs, true);
    assert.deepEqual(cinematicActors(shot.id, 1000, shot.durationMs, true), first);
    assert.ok(first.actors.length <= CINE_POOL && next.actors.length <= CINE_POOL);
    assert.notDeepEqual(first, next, `${shot.id} is animated rather than a static text page`);
    for (const actor of next.actors) assert.ok(Number.isFinite(actor.x + actor.y + actor.hop + actor.alpha));
  }
  const allied = cinematicActors('companions', 2000, 6000, true).actors;
  const solo = cinematicActors('companions', 2000, 6000, false).actors;
  assert.ok(allied.some((a) => a.role === 'hero') && allied.some((a) => a.role === 'maelis'));
  assert.ok(solo.some((a) => a.role === 'maelis') && !solo.some((a) => a.role === 'hero'));
});

test('reduced motion holds cameras steady without shortening fades or the saved timeline', () => {
  for (const shot of RESTORATION_SHOTS) {
    for (const ms of [0, 250, 1000, shot.durationMs - 1]) {
      const normal = cinematicCamera(shot.id, ms, shot.durationMs);
      assert.deepEqual(normal, cinematicCamera(shot.id, ms, shot.durationMs, false));
      const t = ms / shot.durationMs;
      const e = t * t * (3 - 2 * t);
      const pan: Record<string, number> = { wonder: -50, grief: 40, courage: -70, resolve: -60 };
      assert.equal(normal.px, (pan[shot.id] ?? 0) * (e - 0.5) * 2);
      assert.equal(normal.zoom, shot.id === 'eruption' ? 1.3 - 0.2 * e : 1 + 0.14 * e);
      assert.equal(normal.shake, shot.id === 'eruption' && t > 0.1 ? Math.sin(ms / 33) * 4 * (1 - t) : 0);
      const gentle = cinematicCamera(shot.id, ms, shot.durationMs, true);
      assert.equal(gentle.px, 0);
      assert.equal(gentle.py, shot.id === 'eruption' ? -10 : shot.id === 'freedom' ? 0 : 10);
      assert.equal(gentle.zoom, 1.07);
      assert.equal(gentle.shake, 0);
      assert.equal(gentle.alpha, normal.alpha, 'readable fade has its original timing');
    }
  }
  assert.equal(RESTORATION_DURATION_MS, 56000);
});

test('gentle choreography retains animated regional emotions and both timed Maelis routes', () => {
  for (const allied of [true, false]) for (const shot of RESTORATION_SHOTS) {
    const normal = cinematicActors(shot.id, 1000, shot.durationMs, allied);
    assert.deepEqual(normal, cinematicActors(shot.id, 1000, shot.durationMs, allied, false));
    const first = cinematicActors(shot.id, 1000, shot.durationMs, allied, true);
    const next = cinematicActors(shot.id, 3500, shot.durationMs, allied, true);
    assert.deepEqual(first, cinematicActors(shot.id, 1000, shot.durationMs, allied, true));
    assert.deepEqual(first.actors.map((a) => a.role), normal.actors.map((a) => a.role));
    assert.notDeepEqual(first, next, `${shot.id} retains emotion-return animation`);
    for (const a of [...first.actors, ...next.actors]) {
      assert.ok(Number.isFinite(a.x + a.y + a.hop + a.rot + a.alpha));
      assert.ok(Math.abs(a.hop) <= 2.6, 'no large celebratory hops');
    }
    assert.ok(first.actors.length <= CINE_POOL && next.actors.length <= CINE_POOL);
  }
  for (const ms of [1000, 1801, 4000]) for (const allied of [true, false]) {
    const normal = cinematicActors('companions', ms, 6000, allied).actors;
    const gentle = cinematicActors('companions', ms, 6000, allied, true).actors;
    assert.deepEqual(gentle.map(({ role, facing, alpha }) => ({ role, facing, alpha })),
      normal.map(({ role, facing, alpha }) => ({ role, facing, alpha })));
  }
  for (const ms of [0, 1000, 3500, 6999]) {
    const hunger = cinematicActors('eruption', ms, 7000, true, true).actors[0];
    assert.equal(hunger.x, 320);
    assert.equal(hunger.y, 218);
  }
});

function recordedFx(shotId: string, ms: number, reducedMotion?: boolean, allied = true) {
  const calls: { method: string; args: number[] }[] = [];
  const graphics = Object.fromEntries(
    ['clear', 'fillStyle', 'fillCircle', 'lineStyle', 'strokeCircle', 'lineBetween', 'fillRect', 'fillTriangle']
      .map((method) => [method, (...args: number[]) => { calls.push({ method, args }); return graphics; }]),
  );
  drawCinematicFx(graphics as unknown as Phaser.GameObjects.Graphics, shotId, ms, 7000,
    0xffd64a, 0, 0, allied, [], reducedMotion);
  return calls;
}

test('gentle eruption replaces the white shockwave with gradual five-color glows', () => {
  for (const ms of [0, 250, 1000, 3500, 6999]) {
    const normal = recordedFx('eruption', ms);
    assert.deepEqual(normal, recordedFx('eruption', ms, false));
    const gentle = recordedFx('eruption', ms, true);
    assert.ok(!gentle.some((c) => c.method === 'strokeCircle'));
    const fills = gentle.filter((c) => c.method === 'fillStyle');
    assert.deepEqual([...new Set(fills.map((c) => c.args[0]))], [...CINE_COLORS]);
    assert.ok(fills.every((c) => c.args[1] <= 0.55));
    assert.ok(gentle.filter((c) => c.method === 'fillCircle').every((c) => c.args[2] <= 32));
  }
  assert.ok(recordedFx('eruption', 250).some((c) => c.method === 'strokeCircle'), 'default retains authored flash');
  for (const shot of RESTORATION_SHOTS) for (const allied of [true, false]) {
    assert.notDeepEqual(recordedFx(shot.id, 1000, true, allied), recordedFx(shot.id, 3500, true, allied));
  }
  const hugCount = (ms: number, reduced: boolean) =>
    recordedFx('grief', ms, reduced).filter((c) => c.method === 'lineBetween').length;
  for (const ms of [3200, 3401, 3901, 4401]) assert.equal(hugCount(ms, true), hugCount(ms, false));
});
