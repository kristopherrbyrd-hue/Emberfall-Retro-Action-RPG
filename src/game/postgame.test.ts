import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AdventureEngine,
  ENEMY_RESPAWN_DELAY_MS,
  POSTGAME_WAVE_DELAY_MS,
  type EnemyActor,
  type SavedRun,
} from './simulation';
import { RESTORATION_DURATION_MS } from './finale';
import { normalizePostgame, postgameCellClearReward, postgameEnemyStats } from './postgame';
import { BELL_REGION_IDS, WORLD_CELLS, worldCellAt, worldCellOrigin } from './worldMap';
import { DRAINHOUSE_ID, dungeonById, dungeonRoomOrigin, initialDungeonProgress } from './dungeons';
import { CLASSES, POSTGAME_GEAR, type ClassId } from './data';
import type { WorldProgress } from './worldProgress';

function victorious(classId: ClassId = 'warrior') {
  const engine = new AdventureEngine();
  engine.startNewGame({ name: 'Champion', classId, skin: '#d99168', hairStyle: 'cropped',
    hairColor: '#3a2926', clothingColor: '#d36345' });
  const save = engine.exportSave()!;
  Object.assign(save.state.player!, { level: 25, xp: 73, coins: 321, hp: 3 });
  save.state.quest.step = 'Journey complete';
  save.state.bossDefeated = true;
  save.progress.world!.silencedBells = [...BELL_REGION_IDS];
  save.progress.world!.unlockedRegions = [...BELL_REGION_IDS, 'first-hunger'];
  save.progress.world!.finale = { stage: 'restoring', allied: true,
    restorationMs: RESTORATION_DURATION_MS - 50, restorationDurationMs: RESTORATION_DURATION_MS };
  save.progress.collectedIds = ['kept-treasure'];
  save.progress.defeatedIds = ['cinderhorn', 'first-hunger-sanctum:first-hunger', 'canopy:canopy-slime-a'];
  assert.ok(engine.loadSave(save));
  return engine;
}

function reload(engine: AdventureEngine) {
  const resumed = new AdventureEngine();
  assert.ok(resumed.loadSave(JSON.parse(JSON.stringify(engine.exportSave())) as SavedRun));
  return resumed;
}

function defeat(engine: AdventureEngine, enemy: EnemyActor) {
  engine.getProjectiles().push({ id: 100000 + enemy.generation, x: enemy.x, y: enemy.y,
    vx: 0, vy: 0, damage: enemy.maxHp + 10000, playerOwned: true,
    radius: 6, tint: 0xffffff, lifeMs: 1000, aoe: 0 });
  engine.tick(50);
  assert.ok(!engine.getEnemies().some((actor) => actor.id === enemy.id));
}

function wait(engine: AdventureEngine, milliseconds: number) {
  for (let elapsed = 0; elapsed < milliseconds; elapsed += 50) engine.tick(50);
}

test('a saved two-minute respawn is shortened to the new 90-second delay', () => {
  const oldSave = victorious().exportSave()!;
  oldSave.progress.respawns = [
    { id: 'canopy:canopy-slime-a', cell: 'canopy', remainingMs: 120000, generation: 1 },
  ];
  const restored = new AdventureEngine();
  assert.ok(restored.loadSave(oldSave));
  assert.equal(restored.exportSave()!.progress.respawns![0].remainingMs, ENEMY_RESPAWN_DELAY_MS);
});

test('postgame map status updates on clear, countdown, respawn and save reload', () => {
  let engine = victorious();
  assert.equal(engine.getPostgameWaveStatus('canopy'), null, 'ordinary adventures do not show wave status');
  engine.tick(50);
  assert.deepEqual(engine.getPostgameWaveStatus('canopy'), {
    clearCount: 0,
    nextWaveMultiplier: 1,
    remainingMs: null,
  });
  assert.equal(engine.getPostgameWaveStatus('unknown-cell'), null);

  const wave = engine.getEnemies().filter((enemy) => enemy.id.startsWith('canopy:'));
  for (const enemy of wave) defeat(engine, enemy);
  const cleared = engine.getPostgameWaveStatus('canopy')!;
  assert.equal(cleared.clearCount, 1);
  assert.equal(cleared.nextWaveMultiplier, 1.25);
  assert.equal(cleared.remainingMs, POSTGAME_WAVE_DELAY_MS);

  engine = reload(engine);
  assert.deepEqual(engine.getPostgameWaveStatus('canopy'), cleared, 'clear status survives save reload');
  wait(engine, 30_000);
  assert.equal(engine.getPostgameWaveStatus('canopy')!.remainingMs, POSTGAME_WAVE_DELAY_MS - 30_000);
  engine = reload(engine);
  assert.equal(engine.getPostgameWaveStatus('canopy')!.remainingMs, POSTGAME_WAVE_DELAY_MS - 30_000);

  wait(engine, POSTGAME_WAVE_DELAY_MS - 30_000);
  assert.ok(engine.getEnemies().some((enemy) => enemy.id.startsWith('canopy:')));
  assert.deepEqual(engine.getPostgameWaveStatus('canopy'), {
    clearCount: 1,
    nextWaveMultiplier: 1.25,
    remainingMs: null,
  });
  engine = reload(engine);
  assert.equal(engine.getPostgameWaveStatus('canopy')!.remainingMs, null);
});

test('every class returns to the original start after the ending with gear, levels, rewards and color intact', () => {
  for (const classId of ['warrior', 'rogue', 'adept', 'mage'] as const) {
    const engine = victorious(classId);
    const before = engine.exportSave()!;
    engine.tick(50);
    const state = engine.getState();
    const player = state.player!;
    const origin = worldCellOrigin('village');
    assert.deepEqual({ x: player.x, y: player.y }, { x: origin.x + 320, y: origin.y + 344 });
    assert.equal(worldCellAt(player.x, player.y)?.id, 'village');
    assert.equal(state.location, 'Hearthglen');
    assert.equal(player.hp, player.maxHp);
    assert.equal(player.resource, player.maxResource);
    assert.equal(player.level, 25);
    assert.equal(player.xp, 73);
    assert.equal(player.coins, 321);
    assert.deepEqual(state.inventory, before.state.inventory);
    assert.deepEqual(state.trainedPowers, before.state.trainedPowers);
    assert.deepEqual(engine.exportSave()!.progress.collectedIds, ['kept-treasure']);
    assert.ok(engine.exportSave()!.progress.defeatedIds.includes('cinderhorn'));
    assert.equal(engine.getWorldProgress().colorsRestored, true);
    assert.equal(engine.getWorldProgress().postgame.started, true);
    assert.ok(engine.getEnemies().some((enemy) => enemy.id === 'canopy:canopy-slime-a'));
    assert.ok(engine.getEnemies().filter((enemy) => !enemy.boss)
      .every((enemy) => enemy.hp >= 600 && enemy.damage >= 50 && enemy.speed >= 65));
    assert.ok(!engine.getEnemies().some((enemy) => ['cinderhorn', 'first-hunger-sanctum:first-hunger'].includes(enemy.id)));
    assert.equal(reload(engine).getWorldProgress().postgame.started, true);
  }
});

test('ordinary monster payouts remain unchanged before the ending', () => {
  const engine = new AdventureEngine();
  engine.startNewGame({
    name: 'Wayfarer',
    classId: 'warrior',
    skin: '#d99168',
    hairStyle: 'cropped',
    hairColor: '#3a2926',
    clothingColor: '#d36345',
  });
  const player = engine.getState().player!;
  const enemy = engine.getEnemies().find((actor) => actor.id === 'canopy:canopy-slime-a')!;
  const xp = player.xp;
  const shards = player.coins;
  defeat(engine, enemy);
  assert.equal(player.xp, xp + 26);
  assert.equal(player.coins, shards + 7);
  assert.equal(engine.getWorldProgress().postgame.started, false);
});

test('a full cell clear, not each kill, upgrades its synchronized next wave and persists through reload', () => {
  let engine = victorious(); engine.tick(50);
  const wave = engine.getEnemies().filter((enemy) => enemy.id.startsWith('canopy:'));
  assert.ok(wave.length > 1);
  defeat(engine, wave[0]);
  assert.equal(engine.getWorldProgress().postgame.cellClears.canopy, undefined);
  engine = reload(engine); // A partially cleared wave must still count exactly once.
  for (const enemy of engine.getEnemies().filter((actor) => actor.id.startsWith('canopy:'))) defeat(engine, enemy);
  assert.equal(engine.getWorldProgress().postgame.cellClears.canopy, 1);
  assert.ok(engine.exportSave()!.progress.respawns!.filter((entry) => entry.id.startsWith('canopy:'))
    .every((entry) => entry.remainingMs === POSTGAME_WAVE_DELAY_MS));
  engine = reload(engine);
  wait(engine, POSTGAME_WAVE_DELAY_MS - 50);
  assert.ok(!engine.getEnemies().some((enemy) => enemy.id.startsWith('canopy:')));
  engine.tick(50);
  const next = engine.getEnemies().filter((enemy) => enemy.id.startsWith('canopy:'));
  assert.equal(next.length, wave.length);
  for (const enemy of next) {
    const original = wave.find((actor) => actor.id === enemy.id)!;
    assert.ok(enemy.maxHp >= Math.ceil(original.maxHp * 1.25));
    assert.ok(enemy.damage >= Math.ceil(original.damage * 1.25));
    assert.equal(enemy.generation, 1);
    defeat(engine, enemy);
  }
  assert.equal(engine.getWorldProgress().postgame.cellClears.canopy, 2);
  assert.equal(engine.getWorldProgress().postgame.cellClears.briarwood, undefined);
  engine = reload(engine); wait(engine, POSTGAME_WAVE_DELAY_MS);
  assert.ok(engine.getEnemies().filter((enemy) => enemy.id.startsWith('canopy:'))
    .every((enemy) => enemy.maxHp >= 600 * 1.25 ** 2));
});

test('elite cell bounties wait for a complete wave and scale with that cell’s difficulty', () => {
  let engine = victorious(); engine.tick(50);
  const player = engine.getState().player!;
  const initialXp = player.xp;
  const initialShards = player.coins;
  const wave = engine.getEnemies().filter((enemy) => enemy.id.startsWith('canopy:'));
  assert.ok(wave.length > 1);
  defeat(engine, wave[0]);
  assert.equal(engine.getWorldProgress().postgame.cellClears.canopy, undefined);
  assert.equal(player.xp, initialXp + 26, 'partial kills retain only the existing per-monster XP');
  assert.equal(player.coins, initialShards + 7, 'partial kills retain only the existing per-monster shards');
  assert.ok(!engine.getState().log.some((entry) => entry.startsWith('Elite cell cleared')));

  engine = reload(engine);
  const remaining = engine.getEnemies().filter((enemy) => enemy.id.startsWith('canopy:'));
  for (const enemy of remaining) defeat(engine, enemy);
  assert.equal(engine.getWorldProgress().postgame.cellClears.canopy, 1);
  const kills = wave.length;
  assert.equal(engine.getState().player!.xp, initialXp + kills * 26 + 80);
  assert.equal(engine.getState().player!.coins, initialShards + kills * 7 + 35);
  assert.match(engine.getState().hint, /Elite cell cleared 1 time.*\+80 XP, \+35 shards/);

  const progress = engine.getWorldProgress();
  progress.postgame.cellClears.canopy = 3;
  assert.deepEqual(postgameCellClearReward(progress.postgame.cellClears.canopy), {
    xp: 125,
    shards: 55,
  });
});

test('third full elite clear rewards useful class gear that affects combat and survives reload', () => {
  for (const classId of ['warrior', 'rogue', 'adept', 'mage'] as const) {
    const completed = victorious(classId);
    completed.tick(50);
    const seededSave = completed.exportSave()!;
    seededSave.progress.world!.postgame.cellClears = { ruins: 2 };
    const keptKey = {
      id: 'kept-unique-key',
      name: 'Kept key',
      kind: 'key' as const,
      description: 'A unique quest key.',
      equipped: false,
    };
    seededSave.state.inventory.push({ ...keptKey }, { ...keptKey });
    const collectedBefore = [...seededSave.progress.collectedIds];
    const defeatedBefore = [...seededSave.progress.defeatedIds];
    let engine = new AdventureEngine();
    assert.ok(engine.loadSave(seededSave));

    const wave = engine.getEnemies().filter((enemy) => enemy.id.startsWith('canopy:'));
    for (const enemy of wave) defeat(engine, enemy);

    const gear = POSTGAME_GEAR[classId];
    const awarded = engine.getState().inventory.find((item) => item.id === gear.id);
    assert.ok(awarded, `${classId} receives original class-appropriate gear`);
    assert.equal(engine.getState().inventory.filter((item) => item.id === keptKey.id).length, 1);
    assert.deepEqual(engine.exportSave()!.progress.collectedIds, collectedBefore);
    for (const id of defeatedBefore) assert.ok(engine.exportSave()!.progress.defeatedIds.includes(id));
    assert.equal(awarded.kind, 'weapon');
    assert.equal(awarded.equipped, false);
    assert.ok((awarded.bonusAttack ?? 0) >= 13);
    assert.ok(awarded.combatEffect);

    engine = reload(engine);
    engine.equipItem(gear.id);
    engine = reload(engine);
    const equipped = engine.getState().inventory.find((item) => item.id === gear.id)!;
    assert.equal(equipped.equipped, true);
    assert.equal(equipped.combatEffect, gear.combatEffect);

    const target = engine.getEnemies().find((enemy) => !enemy.id.startsWith('canopy:') && !enemy.boss)!;
    const hero = engine.getState().player!;
    hero.x = target.x - 40;
    hero.y = target.y;
    hero.facing = 'right';
    engine.setDirection('right', true);
    engine.pressButton('attack');
    const expectedDamage = CLASSES[classId].attackDamage + gear.bonusAttack;
    if (classId === 'mage') {
      assert.equal(engine.getProjectiles()[0].damage, expectedDamage);
    } else {
      assert.ok(target.hp <= target.maxHp - expectedDamage,
        `${classId} gear bonus contributes to the actual basic attack`);
    }
  }
});

test('the final Hunger route stays compact and leaves combat to its explorable dungeons', () => {
  const engine = victorious(); engine.tick(50);
  const cells = WORLD_CELLS.filter((cell) => cell.regionId === 'first-hunger' && cell.contentReady);
  assert.equal(cells.length, 4, 'the ending route has only its four authored story locations');
  for (const cell of cells) {
    Object.assign(engine.getState().player!, { x: cell.x + 320, y: cell.y + 240 });
    engine.tick(1);
    assert.ok(engine.getEnemies().every((actor) => worldCellAt(actor.x, actor.y)?.id !== cell.id),
      `${cell.id} has no unrelated field encounter`);
  }
});

test('dungeon room waves scale, save and respawn even after leaving the dungeon', () => {
  const source = victorious(); source.tick(50);
  const save = source.exportSave()!;
  const dungeon = dungeonById(DRAINHOUSE_ID)!;
  const room = dungeon.rooms.find((entry) => entry.feature === 'hall')!;
  const origin = dungeonRoomOrigin(room);
  save.progress.world!.activeDungeon = { id: dungeon.id, roomId: room.id,
    returnX: worldCellOrigin('village').x + 320, returnY: worldCellOrigin('village').y + 344 };
  save.progress.world!.dungeons[dungeon.id] = { ...initialDungeonProgress(), bossDefeated: true, doorOpen: true };
  Object.assign(save.state.player!, { x: origin.x + 320, y: origin.y + 240 });
  let engine = new AdventureEngine(); assert.ok(engine.loadSave(save));
  const roomEnemies = engine.getEnemies().filter((actor) => !actor.boss);
  const enemy = roomEnemies[0];
  assert.ok(enemy.maxHp >= 600 && enemy.damage >= 50);
  const player = engine.getState().player!;
  const xpBeforeClear = player.xp;
  const shardsBeforeClear = player.coins;
  for (const actor of roomEnemies) defeat(engine, actor);
  const key = `${dungeon.id}/${room.id}`;
  assert.equal(engine.getWorldProgress().postgame.cellClears[key], 1);
  assert.equal(player.xp, xpBeforeClear + roomEnemies.length * 26 + 80);
  assert.equal(player.coins, shardsBeforeClear + roomEnemies.length * 7 + 35);
  engine = reload(engine);
  assert.equal(engine.exportSave()!.progress.respawns![0].dungeonId, dungeon.id);
  const entry = dungeonRoomOrigin(dungeon.rooms.find((r) => r.id === dungeon.entryRoomId)!);
  Object.assign(engine.getState().player!, { x: entry.x + 320, y: entry.y + 240 });
  engine.setAnalogMovement(1, 0);
  engine.tick(50);
  engine.releaseAllDirections();
  const exit = engine.getProps().find((prop) => prop.id === 'dungeon-exit')!;
  Object.assign(engine.getState().player!, { x: exit.x, y: exit.y + 34 });
  engine.pressButton('context');
  assert.equal(engine.getWorldProgress().activeDungeon, null);
  wait(engine, POSTGAME_WAVE_DELAY_MS);
  const nextSave = engine.exportSave()!;
  const next = nextSave.dungeonActors![key].find((actor) => actor.id === enemy.id)!;
  assert.ok(next.maxHp >= Math.ceil(enemy.maxHp * 1.25));
  assert.ok(next.damage >= Math.ceil(enemy.damage * 1.25));
  assert.equal(next.generation, 1);
  assert.equal(nextSave.progress.world!.dungeons[dungeon.id].bossDefeated, true);
  assert.ok(!nextSave.progress.respawns!.some((entry) => entry.id === enemy.id));
});

test('older completed saves enter the elite world once; later saves retain their exploration position', () => {
  const source = victorious(); source.tick(50);
  const old = source.exportSave()!;
  delete (old.progress.world as Partial<WorldProgress>).postgame;
  const distant = worldCellOrigin('canopy');
  Object.assign(old.state.player!, { x: distant.x + 320, y: distant.y + 240 });
  const migrated = new AdventureEngine(); assert.ok(migrated.loadSave(old));
  assert.equal(worldCellAt(migrated.getState().player!.x, migrated.getState().player!.y)?.id, 'village');
  Object.assign(migrated.getState().player!, { x: distant.x + 320, y: distant.y + 240 });
  const resumed = reload(migrated);
  assert.equal(worldCellAt(resumed.getState().player!.x, resumed.getState().player!.y)?.id, 'canopy');
  resumed.startNewGame({ name: 'Fresh', classId: 'warrior', skin: '#d99168', hairStyle: 'cropped',
    hairColor: '#3a2926', clothingColor: '#d36345' });
  assert.equal(resumed.getWorldProgress().postgame.started, false);
  assert.deepEqual(resumed.getWorldProgress().postgame.cellClears, {});
});

test('postgame normalization rejects bad cell counters and normal journeys retain their original stats', () => {
  const progress = normalizePostgame({ started: true, cellClears: {
    canopy: 2, 'unknown-cell': 10, village: -2, ruins: NaN, sanctum: 1.5,
  } });
  assert.deepEqual(progress.cellClears, { canopy: 2 });
  const base = { maxHp: 32, damage: 8, speed: 40 };
  assert.deepEqual(postgameEnemyStats(base, 'canopy', normalizePostgame()), base);
  assert.deepEqual(postgameEnemyStats(base, 'canopy', progress), { maxHp: 938, damage: 79, speed: 65 });
  assert.deepEqual(postgameCellClearReward(1), { xp: 80, shards: 35 });
  assert.deepEqual(postgameCellClearReward(Number.MAX_SAFE_INTEGER), {
    xp: 10_000,
    shards: 5_000,
  });
});
