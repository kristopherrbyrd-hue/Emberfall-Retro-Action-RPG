import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AdventureEngine,
  BOSS_MONSTER_SPEED_MAX,
  FIELD_MONSTER_SPEED_MAX,
  FIELD_MONSTER_SPEED_MIN,
  maelisSoloXpReward,
  type SavedRun,
} from './simulation';
import { BELL_REGION_IDS, WORLD_CELLS, WORLD_REGION_IDS, WORLD_REGIONS,
  worldCellAt, worldCellOrigin, getWorldPathDirection, type WorldCellEdge } from './worldMap';
import { HUNGER_REGION, HUNGER_ENTRY, HUNGER_ARENA, MAELIS_HUB,
  HUNGER_SPRING, HUNGER_GEAR,
  HUNGER_VANGUARD_ID, HUNGER_VANGUARD_KEY } from './hungerTerritory';
import { dungeonById, dungeonBlocked, dungeonRoomOrigin, initialDungeonProgress } from './dungeons';
import { getWorldColorProfile, normalizeWorldProgress } from './worldProgress';
import type { ClassId } from './data';
import { inspectSavedRun } from './session';
import { HUNGER_BALANCE } from './finale';

function setup(classId: ClassId = 'warrior', level = 25, bells = [...BELL_REGION_IDS]) {
  const engine = new AdventureEngine();
  engine.startNewGame({ name: 'Endgame tester', classId, skin: '#d99168',
    hairStyle: 'cropped', hairColor: '#3a2926', clothingColor: '#d36345' });
  const save = engine.exportSave()!;
  save.state.player!.level = level;
  save.progress.world!.silencedBells = bells;
  save.progress.world!.unlockedRegions = [...BELL_REGION_IDS];
  const resumed = new AdventureEngine();
  assert.ok(resumed.loadSave(save));
  return resumed;
}

function position(engine: AdventureEngine, cellId: string) {
  const origin = worldCellOrigin(cellId);
  Object.assign(engine.getState().player!, { x: origin.x + 320, y: origin.y + 330 });
  engine.setDirection('right', true); engine.tick(1); engine.releaseAllDirections();
}
function operate(engine: AdventureEngine, id: string) {
  const prop = engine.getProps().find((p) => p.id === id);
  assert.ok(prop, `missing interaction ${id}`);
  Object.assign(engine.getState().player!, { x: prop.x, y: prop.y + 24 });
  engine.pressButton('context'); engine.dismissDialog();
}
function enter(engine: AdventureEngine) {
  position(engine, 'first-hunger-sanctum');
  operate(engine, 'hunger-entry');
}
function reload(engine: AdventureEngine) {
  const save = JSON.parse(JSON.stringify(engine.exportSave())) as SavedRun;
  assert.equal(inspectSavedRun(JSON.stringify(save)).status, 'available');
  const resumed = new AdventureEngine();
  assert.ok(resumed.loadSave(save));
  assert.deepEqual(resumed.getWorldProgress(), engine.getWorldProgress());
  const restoredById = new Map(resumed.getEnemies().map((actor) => [actor.id, actor]));
  for (const actor of engine.getEnemies()) {
    const restored = restoredById.get(actor.id);
    assert.ok(restored, `${actor.id} remains present after saving`);
    assert.deepEqual(
      { hp: restored.hp, maxHp: restored.maxHp, x: restored.x, y: restored.y },
      { hp: actor.hp, maxHp: actor.maxHp, x: actor.x, y: actor.y },
      `${actor.id} keeps its health and location`,
    );
  }
  return resumed;
}
function walk(engine: AdventureEngine, edge: WorldCellEdge) {
  const visit = engine.getWorldProgress().activeDungeon!;
  const room = dungeonById(visit.id)!.rooms.find((r) => r.id === visit.roomId)!;
  const origin = dungeonRoomOrigin(room);
  Object.assign(engine.getState().player!, {
    x: origin.x + (edge === 'east' ? 605 : edge === 'west' ? 35 : 320),
    y: origin.y + (edge === 'south' ? 445 : edge === 'north' ? 35 : 240),
  });
  engine.setDirection(({ north: 'up', south: 'down', east: 'right', west: 'left' } as const)[edge], true);
  for (let i = 0; i < 13; i++) engine.tick(50);
  engine.releaseAllDirections();
  assert.equal(engine.getWorldProgress().activeDungeon!.roomId, room.exits[edge]);
}
function travel(engine: AdventureEngine, target: string) {
  const visit = engine.getWorldProgress().activeDungeon!;
  const dungeon = dungeonById(visit.id)!;
  const progress = engine.getWorldProgress().dungeons[visit.id];
  const queue = [{ id: visit.roomId, path: [] as WorldCellEdge[] }];
  const seen = new Set([visit.roomId]);
  while (queue.length) {
    const current = queue.shift()!;
    if (current.id === target) { for (const edge of current.path) walk(engine, edge); return; }
    const room = dungeon.rooms.find((r) => r.id === current.id)!;
    const origin = dungeonRoomOrigin(room);
    for (const [edge, next] of Object.entries(room.exits) as [WorldCellEdge, string][]) {
      const x = origin.x + (edge === 'east' ? 635 : edge === 'west' ? 5 : 320);
      const y = origin.y + (edge === 'south' ? 475 : edge === 'north' ? 5 : 240);
      if (!seen.has(next) && !dungeonBlocked(visit.id, progress, x, y)) {
        seen.add(next); queue.push({ id: next, path: [...current.path, edge] });
      }
    }
  }
  assert.fail(`no playable dungeon route to ${target}`);
}
function attack(engine: AdventureEngine) {
  engine.setAnalogMovement(1, 0); engine.tick(1); engine.releaseAllDirections();
  engine.pressButton('attack');
}
function defeatCurrent(engine: AdventureEngine) {
  for (let i = 0; i < 240 && engine.getEnemies().length; i++) {
    const target = engine.getEnemies()[0];
    const player = engine.getState().player!;
    if (target.telegraph) {
      const room = dungeonById(engine.getWorldProgress().activeDungeon!.id)!.rooms.find(
        (r) => r.id === engine.getWorldProgress().activeDungeon!.roomId)!;
      const origin = dungeonRoomOrigin(room);
      // Both axes leave the cross; the diagonal also leaves the circle.
      const x = target.telegraph.x - origin.x < 320 ? 520 : 220;
      const y = target.telegraph.y - origin.y < 240 ? 320 : 160;
      player.x = origin.x + x; player.y = origin.y + y;
    } else {
      player.x = target.x - 43; player.y = target.y; player.facing = 'right';
      attack(engine);
    }
    if (player.hp < player.maxHp - 35) engine.equipItem('small-tonic');
    for (let tick = 0; tick < 10; tick++) engine.tick(50);
    assert.ok(player.hp > 0, 'expected endgame gear must survive the lair with avoided marks');
  }
  assert.equal(engine.getEnemies().length, 0);
}
test('Realm 6 is the compact First Hunger route with separate lairs and a five-bell story', () => {
  const cells = WORLD_CELLS.filter((c) => c.regionId === HUNGER_REGION && c.contentReady);
  assert.equal(cells.length, 4);
  assert.deepEqual(cells.map((cell) => cell.id), [HUNGER_ENTRY, MAELIS_HUB, HUNGER_SPRING, HUNGER_ARENA]);
  assert.ok(cells.every((c) => c.contentReady));
  assert.equal(WORLD_REGIONS.find((r) => r.id === HUNGER_REGION)!.bell, null);
  assert.equal(BELL_REGION_IDS.length, 5);
  assert.deepEqual(worldCellOrigin('first-hunger-sanctum'), { x: 640, y: 27 * 480 });
  for (const cell of cells) {
    if (cell.id !== HUNGER_ENTRY) assert.ok(getWorldPathDirection(HUNGER_ENTRY, cell.id, WORLD_REGION_IDS, true, true, 'low', BELL_REGION_IDS));
  }
  assert.equal(getWorldColorProfile(normalizeWorldProgress({ silencedBells: [...WORLD_REGION_IDS] })).silencedBellCount, 5);
  const echo = dungeonById(HUNGER_VANGUARD_ID)!;
  const finalDungeon = dungeonById('first-hunger-maw')!;
  assert.ok(echo.rooms.some((room) => room.feature === 'boss'));
  assert.equal(echo.rooms.filter((room) => room.feature === 'chest').length, 3);
  assert.equal(finalDungeon.rooms.filter((room) => room.feature === 'boss').length, 1);
  for (const dungeon of [echo, finalDungeon]) {
    assert.ok(dungeon.rooms.every((room) => room.row < 4 && room.column < 8));
    assert.equal(dungeonBlocked(dungeon.id, initialDungeonProgress(), 99999, 0), true);
  }
});

test('entry checks level 25 and every bell, in both gate failure cases', () => {
  for (const engine of [setup('warrior', 24), setup('warrior', 25, BELL_REGION_IDS.slice(0, 4))]) {
    enter(engine);
    assert.equal(worldCellAt(engine.getState().player!.x, engine.getState().player!.y)!.id, 'first-hunger-sanctum');
    assert.ok(!engine.getWorldProgress().unlockedRegions.includes(HUNGER_REGION));
  }
  const engine = setup();
  enter(engine);
  assert.equal(worldCellAt(engine.getState().player!.x, engine.getState().player!.y)!.id, HUNGER_ENTRY);
  operate(engine, 'hunger-leave');
  assert.equal(worldCellAt(engine.getState().player!.x, engine.getState().player!.y)!.id, 'first-hunger-sanctum');
});

for (const classId of ['warrior', 'rogue', 'adept', 'mage'] as const) {
  test(`${classId}: First Echo rewards hidden gear, a key, and a return route`, () => {
    const save = setup(classId).exportSave()!;
    save.progress.world!.unlockedRegions.push(HUNGER_REGION);
    save.progress.world!.finale = { stage: 'battle', allied: false, restorationMs: 0 };
    let engine = new AdventureEngine();
    assert.ok(engine.loadSave(save));

    position(engine, MAELIS_HUB);
    operate(engine, 'hunger-first-echo');
    const dungeon = dungeonById(HUNGER_VANGUARD_ID)!;
    assert.equal(engine.getWorldProgress().activeDungeon?.id, HUNGER_VANGUARD_ID);
    for (const room of dungeon.rooms.filter((candidate) => candidate.feature === 'chest')) {
      travel(engine, room.id);
      operate(engine, `dungeon-chest-${room.id}`);
    }
    assert.ok(HUNGER_GEAR.every(({ item }) => engine.getState().inventory.some((found) => found.id === item.id)));
    for (const { item } of HUNGER_GEAR) engine.equipItem(item.id);
    engine = reload(engine);
    assert.ok(HUNGER_GEAR.every(({ item }) => engine.getState().inventory.some((found) => found.id === item.id && found.equipped)));

    const bossRoom = dungeon.rooms.find((room) => room.feature === 'boss')!;
    travel(engine, bossRoom.id);
    const boss = engine.getEnemies().find((enemy) => enemy.boss)!;
    assert.equal(boss.name, dungeon.bossName);
    boss.hp = 1;
    defeatCurrent(engine);
    assert.ok(engine.getState().inventory.some((item) => item.id === HUNGER_VANGUARD_KEY));
    operate(engine, 'dungeon-return');
    assert.equal(engine.getWorldProgress().activeDungeon, null);
    assert.equal(worldCellAt(engine.getState().player!.x, engine.getState().player!.y)?.id, MAELIS_HUB);
  });
}

test('legacy duel, choice, allied/solo battle and restoration move to the correct maps without losing decisions', () => {
  for (const stage of ['duel', 'choice', 'battle', 'restoring', 'complete'] as const) {
    for (const allied of [true, false]) {
      const source = setup(); const save = source.exportSave()!;
      save.version = 9;
      const origin = worldCellOrigin('first-hunger-sanctum');
      Object.assign(save.state.player!, { x: origin.x + 320, y: origin.y + 330 });
      save.progress.world!.finale = { stage, allied, restorationMs: stage === 'restoring' ? 5700 : 0 };
      save.progress.world!.colorsRestored = stage === 'complete';
      const engine = new AdventureEngine(); assert.ok(engine.loadSave(save));
      assert.equal(engine.getWorldProgress().finale.stage, stage);
      assert.equal(engine.getWorldProgress().finale.allied, allied);
      if (stage === 'battle') {
        assert.equal(engine.getWorldProgress().activeDungeon?.id, 'first-hunger-maw');
        assert.equal(engine.getWorldProgress().activeDungeon?.roomId,
          dungeonById('first-hunger-maw')!.rooms.find((room) => room.feature === 'boss')!.id);
      } else {
        assert.equal(worldCellAt(engine.getState().player!.x, engine.getState().player!.y)!.id,
          stage === 'complete' ? 'village' : stage === 'restoring' ? HUNGER_ARENA : MAELIS_HUB);
      }
      reload(engine);
    }
  }
});

test('a legacy mid-duel actor retains its health and exact local position in the new Vigil', () => {
  const source = setup();
  const save = source.exportSave()!;
  save.version = 9;
  const old = worldCellOrigin('first-hunger-sanctum');
  Object.assign(save.state.player!, { x: old.x + 275, y: old.y + 240 });
  save.progress.world!.finale.stage = 'duel';
  const maelis = save.actors.find((a) => a.id === 'first-hunger-sanctum:maelis')!;
  Object.assign(maelis, { x: old.x + 340, y: old.y + 210, hp: 152, maxHp: 300, attackMs: 920 });
  const resumed = new AdventureEngine(); assert.ok(resumed.loadSave(save));
  const actor = resumed.getEnemies().find((a) => a.id === maelis.id)!;
  const vigil = worldCellOrigin(MAELIS_HUB);
  assert.equal(actor.hp, 152);
  assert.equal(actor.maxHp, 300);
  assert.equal(actor.attackMs, 920);
  assert.deepEqual({ x: actor.x, y: actor.y }, { x: vigil.x + 340, y: vigil.y + 210 });
  assert.deepEqual({ x: resumed.getState().player!.x, y: resumed.getState().player!.y },
    { x: vigil.x + 275, y: vigil.y + 240 });
});

test('version-10 Maelis saves gain the doubled boss health once without changing their damage ratio', () => {
  const engine = setup();
  enter(engine);
  position(engine, MAELIS_HUB);
  engine.dismissDialog();
  const save = engine.exportSave()!;
  const savedMaelis = save.actors.find((actor) => actor.id === 'first-hunger-sanctum:maelis')!;
  const newMaxHp = savedMaelis.maxHp;
  savedMaelis.maxHp /= 2;
  savedMaelis.hp = Math.round(savedMaelis.maxHp * 0.6);
  const oldRatio = savedMaelis.hp / savedMaelis.maxHp;
  save.version = 10;

  const migrated = new AdventureEngine();
  assert.ok(migrated.loadSave(save));
  const restored = migrated.getEnemies().find((actor) => actor.id === savedMaelis.id)!;
  assert.equal(restored.maxHp, newMaxHp);
  assert.ok(Math.abs(restored.hp / restored.maxHp - oldRatio) < 0.001);
  const currentSave = migrated.exportSave()!;
  assert.equal(currentSave.version, 11);
  const reloaded = new AdventureEngine();
  assert.ok(reloaded.loadSave(currentSave));
  assert.equal(reloaded.getEnemies().find((actor) => actor.id === savedMaelis.id)!.maxHp, newMaxHp,
    'a current-format reload must not apply the health increase a second time');
});

test('an old final-battle save keeps its progress and enters the new boss dungeon without replaying setup', () => {
  const source = setup('warrior', 20);
  const save = source.exportSave()!;
  save.version = 9;
  const home = worldCellOrigin('village');
  const positionBefore = { x: home.x + 320, y: home.y + 330 };
  Object.assign(save.state.player!, positionBefore);
  save.progress.world!.finale = { stage: 'battle', allied: true, restorationMs: 0 };
  const oldArena = worldCellOrigin('first-hunger-sanctum');
  const maelis = save.actors.find((actor) => actor.id === 'first-hunger-sanctum:maelis')!;
  save.actors.push({ ...maelis, id: 'first-hunger-sanctum:first-hunger', name: 'The First Hunger',
    x: oldArena.x + 320, y: oldArena.y + 224, hp: 412, maxHp: 900, attackMs: 1400 });

  let engine = new AdventureEngine();
  assert.ok(engine.loadSave(save));
  assert.deepEqual({ x: engine.getState().player!.x, y: engine.getState().player!.y }, positionBefore);
  assert.ok(engine.getWorldProgress().unlockedRegions.includes(HUNGER_REGION));
  assert.ok(engine.getWorldProgress().destroyedObstacles.includes('hunger-legacy-access'));
  engine = reload(engine);

  position(engine, HUNGER_ARENA);
  operate(engine, 'hunger-arena');
  assert.equal(engine.getWorldProgress().activeDungeon?.id, 'first-hunger-maw');
  const bossRoom = dungeonById('first-hunger-maw')!.rooms.find((room) => room.feature === 'boss')!;
  travel(engine, bossRoom.id);
  const boss = engine.getEnemies().find((actor) => actor.name === 'The First Hunger')!;
  assert.equal(boss.hp, Math.round(HUNGER_BALANCE.health * 412 / 900));
});

test('an active Guide updates toward the next lair when a key is claimed', () => {
  let engine = setup(); enter(engine);
  const save = engine.exportSave()!;
  save.progress.world!.finale.stage = 'battle';
  save.progress.world!.finale.allied = false;
  engine = new AdventureEngine(); assert.ok(engine.loadSave(save));
  engine.getState().quest.step = 'Defeat The First Hunger';
  position(engine, HUNGER_ENTRY);
  assert.ok(engine.requestGuide());
  assert.equal(engine.getState().guideDirection, 'right');
  engine.getState().inventory.push({ id: HUNGER_VANGUARD_KEY, name: 'First Echo key', kind: 'key', description: 'Earned reward', equipped: false });
  engine.tick(50);
  assert.equal(engine.getState().guideDirection, 'right');
  assert.match(engine.getState().guideMessage, /Pale Spring/i);
});

test('falling in the final dungeon returns to the Vigil spring without losing the Echo key or replaying Maelis', () => {
  const source = setup();
  const save = source.exportSave()!;
  save.progress.world!.unlockedRegions.push(HUNGER_REGION);
  save.progress.world!.lastWell = { id: `well:${HUNGER_SPRING}` };
  save.progress.world!.finale = { stage: 'battle', allied: true, restorationMs: 0 };
  save.state.inventory.push({
    id: HUNGER_VANGUARD_KEY, name: 'First Echo key', kind: 'key', description: 'Earned reward', equipped: false,
  });
  const engine = new AdventureEngine(); assert.ok(engine.loadSave(save));
  position(engine, HUNGER_ARENA);
  operate(engine, 'hunger-arena');
  const bossRoom = dungeonById('first-hunger-maw')!.rooms.find((room) => room.feature === 'boss')!;
  travel(engine, bossRoom.id);
  const player = engine.getState().player!;
  engine.getProjectiles().push({ id: 10000, x: player.x, y: player.y,
    vx: 0, vy: 0, damage: 10000, tint: 0xffffff, radius: 5, lifeMs: 1000, aoe: 0, playerOwned: false });
  engine.tick(50);
  assert.equal(worldCellAt(engine.getState().player!.x, engine.getState().player!.y)?.id, HUNGER_SPRING);
  assert.equal(engine.getWorldProgress().finale.stage, 'battle');
  assert.ok(engine.getState().inventory.some((item) => item.id === HUNGER_VANGUARD_KEY));
  reload(engine);
});

test('Maelis stops at 25%; the First Echo key gates the separate final dungeon', () => {
  const engine = setup(); enter(engine); position(engine, MAELIS_HUB);
  assert.equal(engine.getWorldProgress().finale.stage, 'duel');
  engine.dismissDialog();
  const maelis = engine.getEnemies().find((e) => e.id === 'first-hunger-sanctum:maelis')!;
  maelis.hp = maelis.maxHp * 0.25 + 1;
  Object.assign(engine.getState().player!, { x: maelis.x - 43, y: maelis.y }); attack(engine);
  assert.equal(maelis.hp, maelis.maxHp * 0.25);
  assert.equal(engine.getWorldProgress().finale.stage, 'choice');
  engine.chooseMaelisAlliance(false);
  assert.equal(engine.getWorldProgress().finale.stage, 'solo-duel');
  engine.dismissDialog();
  position(engine, MAELIS_HUB);
  assert.ok(!engine.getProps().some((prop) => prop.id === 'hunger-first-echo'),
    'the First Echo remains sealed until Maelis is defeated');
  const soloMaelis = engine.getEnemies().find((e) => e.id === 'first-hunger-sanctum:maelis')!;
  assert.equal(soloMaelis.hp, Math.round(soloMaelis.maxHp * 0.25));
  soloMaelis.hp = 1;
  const player = engine.getState().player!;
  player.level = 60;
  player.xp = 0;
  player.x = soloMaelis.x - 43;
  player.y = soloMaelis.y;
  player.facing = 'right';
  attack(engine);
  assert.equal(engine.getWorldProgress().finale.stage, 'battle');
  assert.equal(player.level, 75, 'the solo choice grants fifteen complete levels at level 60');
  assert.equal(maelisSoloXpReward(60), 60_450);
  engine.dismissDialog();
  position(engine, MAELIS_HUB);
  assert.ok(engine.getProps().some((prop) => prop.id === 'hunger-first-echo'));
  position(engine, HUNGER_ARENA);
  assert.ok(!engine.getProps().some((prop) => prop.id === 'hunger-arena'));
  // Real movement cannot bypass the key gate at the final threshold.
  const threshold = worldCellOrigin(HUNGER_ARENA);
  Object.assign(engine.getState().player!, { x: threshold.x + 605, y: threshold.y + 240 });
  engine.setDirection('right', true); for (let i = 0; i < 30; i++) engine.tick(50);
  engine.releaseAllDirections();
  assert.equal(worldCellAt(engine.getState().player!.x, engine.getState().player!.y)!.id, HUNGER_ARENA);
  engine.getState().inventory.push({
    id: HUNGER_VANGUARD_KEY, name: 'First Echo key', kind: 'key', equipped: false,
    description: 'Fixture: earned from the guardian',
  });
  assert.ok(engine.getProps().some((prop) => prop.id === 'hunger-arena'));
  operate(engine, 'hunger-arena');
  assert.equal(engine.getWorldProgress().activeDungeon?.id, 'first-hunger-maw');
});

test('open-world bosses telegraph a readable forward sweep that can be dodged', () => {
  const engine = setup(); enter(engine); position(engine, MAELIS_HUB);
  engine.dismissDialog();
  const maelis = engine.getEnemies().find((enemy) => enemy.id === 'first-hunger-sanctum:maelis')!;
  const player = engine.getState().player!;
  Object.assign(player, { x: maelis.x - 100, y: maelis.y, hp: player.maxHp });
  maelis.attackMs = 0;
  engine.tick(50);
  assert.equal(maelis.telegraph?.pattern, 'swing');
  const health = player.hp;
  for (let i = 0; i < 14; i++) engine.tick(50);
  assert.ok(player.hp < health, 'standing in the warned arc takes the reduced melee hit');
});

test('open-world bosses reposition instead of standing still between attacks', () => {
  const engine = setup(); enter(engine); position(engine, MAELIS_HUB);
  engine.dismissDialog();
  const maelis = engine.getEnemies().find((enemy) => enemy.id === 'first-hunger-sanctum:maelis')!;
  const player = engine.getState().player!;
  Object.assign(player, { x: maelis.x + 220, y: maelis.y + 90 });
  maelis.attackMs = 60_000;
  const start = { x: maelis.x, y: maelis.y };
  for (let i = 0; i < 12; i++) engine.tick(50);
  assert.ok(Math.hypot(maelis.x - start.x, maelis.y - start.y) > 12,
    'the boss closes distance or circles while waiting for its next attack');
});

test('Maelis damages enemies during the First Echo lair and the final Hunger battle', () => {
  const source = setup();
  const save = source.exportSave()!;
  save.progress.world!.unlockedRegions = [...new Set([...save.progress.world!.unlockedRegions, HUNGER_REGION])];
  save.progress.world!.finale = { stage: 'battle', allied: true, restorationMs: 0 };
  const hub = worldCellOrigin(MAELIS_HUB);
  Object.assign(save.state.player!, { x: hub.x + 320, y: hub.y + 330 });
  const echoEngine = new AdventureEngine();
  assert.ok(echoEngine.loadSave(save));
  position(echoEngine, MAELIS_HUB);
  operate(echoEngine, 'hunger-first-echo');
  assert.equal(echoEngine.getWorldProgress().activeDungeon?.id, HUNGER_VANGUARD_ID);
  const echoHall = dungeonById(HUNGER_VANGUARD_ID)!.rooms.find((room) => room.feature === 'hall')!;
  travel(echoEngine, echoHall.id);
  const hallEnemies = echoEngine.getEnemies();
  assert.ok(hallEnemies.length > 0);
  const beforeEchoHealth = hallEnemies.map((enemy) => enemy.hp);
  let maelisBoltSeen = false;
  for (let i = 0; i < 50; i++) {
    echoEngine.tick(50);
    maelisBoltSeen ||= echoEngine.getProjectiles().some((shot) => shot.playerOwned && shot.tint === 0xd8a3ff);
  }
  assert.ok(echoEngine.getEnemies().some((enemy, index) => enemy.hp < beforeEchoHealth[index]!),
    'Maelis lands attacks on enemies in the First Echo');
  assert.ok(maelisBoltSeen, 'her attacks are visible as purple bolts instead of silent health loss');
  assert.ok(echoEngine.getProps().some((prop) =>
    prop.id === 'maelis-ally' && ['up', 'down', 'left', 'right'].includes(prop.facing ?? '')));

  const hungerSave = source.exportSave()!;
  hungerSave.progress.world!.unlockedRegions = [...new Set([...hungerSave.progress.world!.unlockedRegions, HUNGER_REGION])];
  hungerSave.progress.world!.finale = { stage: 'battle', allied: true, restorationMs: 0 };
  hungerSave.state.inventory.push({
    id: HUNGER_VANGUARD_KEY, name: 'First Echo key', kind: 'key', description: 'Earned lair key', equipped: false,
  });
  const arena = worldCellOrigin(HUNGER_ARENA);
  Object.assign(hungerSave.state.player!, { x: arena.x + 320, y: arena.y + 330 });
  const hungerEngine = new AdventureEngine();
  assert.ok(hungerEngine.loadSave(hungerSave));
  position(hungerEngine, HUNGER_ARENA);
  operate(hungerEngine, 'hunger-arena');
  const bossRoom = dungeonById('first-hunger-maw')!.rooms.find((room) => room.feature === 'boss')!;
  travel(hungerEngine, bossRoom.id);
  const hunger = hungerEngine.getEnemies().find((enemy) => enemy.name === 'The First Hunger')!;
  const beforeHungerHealth = hunger.hp;
  hunger.attackMs = 60_000;
  const startingPosition = { x: hunger.x, y: hunger.y };
  for (let i = 0; i < 60; i++) hungerEngine.tick(50);
  assert.ok(hunger.hp < beforeHungerHealth, 'Maelis also damages The First Hunger itself');
  assert.ok(Math.hypot(hunger.x - startingPosition.x, hunger.y - startingPosition.y) > 12,
    'The First Hunger advances or circles during the encounter');
});

test('allied Maelis follows and fights local field enemies, with one quiet room for conversation', () => {
  const fieldSave = setup().exportSave()!;
  fieldSave.progress.world!.finale = { stage: 'battle', allied: true, restorationMs: 0 };
  const field = worldCellOrigin('northwood');
  Object.assign(fieldSave.state.player!, { x: field.x + 320, y: field.y + 280 });
  const engine = new AdventureEngine();
  assert.ok(engine.loadSave(fieldSave));
  position(engine, 'northwood');
  const mobTemplate = engine.getEnemies().find((enemy) => !enemy.boss);
  assert.ok(mobTemplate, 'the test field contains a regular monster');
  const player = engine.getState().player!;
  const maelisStart = engine.getProps().find((prop) => prop.id === 'maelis-ally')!;
  assert.ok(maelisStart && maelisStart.interactable === false,
    'Maelis is visible in the field but is not a routine talk prompt');
  engine.getEnemies().splice(0);
  player.x = field.x + 320;
  player.y = field.y + 280;
  const beforeDistance = Math.hypot(player.x - maelisStart.x, player.y - maelisStart.y);
  player.x += 220;
  for (let i = 0; i < 24; i++) engine.tick(50);
  const maelisFollowing = engine.getProps().find((prop) => prop.id === 'maelis-ally')!;
  const afterDistance = Math.hypot(player.x - maelisFollowing.x, player.y - maelisFollowing.y);
  assert.ok(Math.hypot(maelisFollowing.x - maelisStart.x, maelisFollowing.y - maelisStart.y) > 100,
    'Maelis moves with the player rather than remaining behind');
  assert.ok(afterDistance < 110,
    `Maelis rubber-bands back to a close following distance (${beforeDistance.toFixed(1)} before; ${afterDistance.toFixed(1)} after)`);

  player.x = field.x + 320;
  const mob = { ...mobTemplate, id: 'companion-test-mob', x: player.x + 150, y: player.y,
    hp: mobTemplate.maxHp, attackMs: 60_000 };
  engine.getEnemies().push(mob);
  for (let i = 0; i < 40; i++) engine.tick(50);
  assert.ok(mob.hp < mob.maxHp, 'Maelis attacks ordinary nearby field monsters');

  const finalSave = setup().exportSave()!;
  finalSave.progress.world!.unlockedRegions.push(HUNGER_REGION);
  finalSave.progress.world!.finale = { stage: 'battle', allied: true, restorationMs: 0 };
  finalSave.state.inventory.push({
    id: HUNGER_VANGUARD_KEY, name: 'First Echo key', kind: 'key', description: 'Test key', equipped: false,
  });
  const arena = worldCellOrigin(HUNGER_ARENA);
  Object.assign(finalSave.state.player!, { x: arena.x + 320, y: arena.y + 330 });
  const finalEngine = new AdventureEngine();
  assert.ok(finalEngine.loadSave(finalSave));
  position(finalEngine, HUNGER_ARENA);
  operate(finalEngine, 'hunger-arena');
  travel(finalEngine, '2:1');
  assert.equal(finalEngine.getEnemies().length, 0, 'the pause room before the Hunger is kept clear');
  const conversation = finalEngine.getProps().find((prop) => prop.id === 'maelis-ally')!;
  assert.equal(conversation.interactable, true, 'Maelis can be spoken to in this room');
  Object.assign(finalEngine.getState().player!, { x: conversation.x, y: conversation.y + 24 });
  assert.match(finalEngine.getContextHint(), /Speak with Maelis/);
  finalEngine.pressButton('context');
  assert.match(finalEngine.getState().dialog ?? '', /Hunger’s first breath/);
});

test('regular monsters and bosses are slower than untrained Warrior movement', () => {
  const engine = setup('warrior');
  const monsters = engine.getEnemies().filter((enemy) => !enemy.boss);
  assert.ok(monsters.length > 0);
  assert.ok(monsters.every((enemy) =>
    enemy.speed >= FIELD_MONSTER_SPEED_MIN && enemy.speed <= FIELD_MONSTER_SPEED_MAX));
  assert.ok(FIELD_MONSTER_SPEED_MAX < 122,
    'even the fastest field monster is slower than untrained Warrior movement');
  assert.ok(FIELD_MONSTER_SPEED_MAX <= 122 * 0.92,
    'field monsters leave room to turn, aim, and land an attack while retreating');
  assert.ok(BOSS_MONSTER_SPEED_MAX < 122,
    'boss movement also stays slower than untrained Warrior movement');
  assert.ok(BOSS_MONSTER_SPEED_MAX <= 122 * 0.92,
    'bosses leave room for the player to reposition before attacking');
});

// A reproducible endgame difficulty pass: actual analog movement, basic combat,
// class powers, finite earned provisions, and the intended doubled boss health.
// Compare allied and solo routes with the same level-25 gear and starting powers.
for (const classId of ['warrior', 'rogue', 'adept', 'mage'] as const) {
  for (const allied of [false, true]) {
    test(`${classId} ${allied ? 'allied' : 'solo'}: endgame equipment can defeat the Hunger while dodging and spending finite supplies`, () => {
      const source = setup(classId);
      const save = source.exportSave()!;
      const origin = worldCellOrigin(HUNGER_ARENA);
      Object.assign(save.state.player!, { x: origin.x + 320, y: origin.y + 330 });
      save.progress.world!.unlockedRegions.push(HUNGER_REGION);
      save.progress.world!.finale = { stage: 'battle', allied, restorationMs: 0 };
      save.state.inventory = [
        ...HUNGER_GEAR.map(({ item }) => ({ ...item, equipped: true })),
        { id: HUNGER_VANGUARD_KEY, name: 'First Echo key', kind: 'key' as const,
          description: 'Earned lair key', equipped: false },
        { id: 'small-tonic', name: 'Small tonic', kind: 'consumable', description: 'Earned lair provisions', equipped: false, quantity: 44 },
      ];
      // A level-25 journey has 24 earned points; ranking the four equipped
      // starting powers twice costs eight points and leaves room for builds.
      for (const power of save.state.abilities) {
        if (power) save.state.trainedPowers[power.id] = 3;
      }
      const engine = new AdventureEngine(); assert.ok(engine.loadSave(save));
      position(engine, HUNGER_ARENA);
      operate(engine, 'hunger-arena');
      assert.equal(engine.getWorldProgress().activeDungeon?.id, 'first-hunger-maw',
        'the First Echo key opens the dedicated final battle map');
      const finalDungeon = dungeonById('first-hunger-maw')!;
      const bossRoom = finalDungeon.rooms.find((room) => room.feature === 'boss')!;
      const hall = finalDungeon.rooms.find((room) => room.feature === 'hall')!;
      travel(engine, hall.id);
      for (const [index, enemy] of engine.getEnemies().entries()) {
        engine.getProjectiles().push({
          id: 95_000 + index, x: enemy.x, y: enemy.y, vx: 0, vy: 0,
          damage: enemy.maxHp + 10, playerOwned: true, radius: 6,
          tint: 0xffffff, lifeMs: 1000, aoe: 0,
        });
      }
      engine.tick(1);
      assert.equal(engine.getEnemies().length, 0, 'clear the approach before testing the boss itself');
      travel(engine, bossRoom.id);
      assert.equal(engine.getWorldProgress().activeDungeon?.id, 'first-hunger-maw',
        'the player remains inside the battle map after taking the clear route');
      const boss = engine.getEnemies().find((e) => e.name === 'The First Hunger')!;
      const player = engine.getState().player!;
      player.hp = player.maxHp;
      player.resource = player.maxResource;
      assert.equal(boss.maxHp, HUNGER_BALANCE.health);
      assert.ok(boss.damage >= 38);
      let duration = 0, consumed = 0, receivedHits = 0, warningFrames = 0;
      const phases = new Set<number>();
      for (; duration < 180_000 && engine.getWorldProgress().finale.stage === 'battle'; duration += 50) {
        assert.equal(engine.getWorldProgress().activeDungeon?.id, 'first-hunger-maw',
          `battle left its dungeon at ${duration}ms (hp ${player.hp}, x ${player.x}, y ${player.y})`);
        phases.add(boss.hp / boss.maxHp < 0.3 ? 3 : boss.hp / boss.maxHp < 0.65 ? 2 : 1);
        const dx = boss.x - player.x, dy = boss.y - player.y;
        const dist = Math.hypot(dx, dy) || 1;
        const radius = classId === 'mage' ? 145 : 75;
        // Aim at the boss, then move around it; analog facing and attack aim are
        // separate only between these inputs, just as with the handheld controls.
        engine.setAnalogMovement(dx / dist, dy / dist);
        engine.pressButton('attack');
        for (const button of ['ability0', 'ability1', 'ability2', 'ability3'] as const) engine.pressButton(button);
        const radial = (dist - radius) / 45;
        const strafeX = -dy + dx * radial;
        const strafeY = dx + dy * radial;
        const strafeLength = Math.hypot(strafeX, strafeY) || 1;
        engine.setAnalogMovement(strafeX / strafeLength, strafeY / strafeLength);
        const hp = player.hp;
        engine.tick(50);
        if (boss.telegraph) warningFrames++;
        if (player.hp < hp) receivedHits++;
        if (player.hp < player.maxHp - 40 && engine.getState().inventory.some((i) => i.id === 'small-tonic')) {
          engine.equipItem('small-tonic'); consumed++;
        }
      }
      console.info(`Hunger balance: ${classId} ${allied ? 'allied' : 'solo'}, ${duration / 1000}s, ${consumed} tonics, ${receivedHits} hits, boss HP ${boss.hp}`);
      assert.equal(engine.getWorldProgress().finale.stage, 'restoring', `boss remaining ${boss.hp}, duration ${duration}, tonics ${consumed}`);
      assert.deepEqual([...phases].sort(), [1, 2, 3]);
      assert.ok(duration > 25_000, 'the endgame boss must not be erased in a short burst');
      assert.ok(consumed < 44, 'the authored lair provisions leave a margin');
      assert.ok(warningFrames > 0, 'the boss still uses visible attack warnings even when the player dodges well');
    });
  }
}
