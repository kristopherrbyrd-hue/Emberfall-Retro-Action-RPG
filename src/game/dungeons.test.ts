import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DungeonMap } from './DungeonMap';
import { createInitialWorldProgress } from './worldProgress';
import { AdventureEngine, type SavedRun } from './simulation';
import { DUNGEONS, DRAINHOUSE_ID, DRAINHOUSE_KEY, MARCHES_LAIRS, dungeonById, dungeonBlocked, dungeonRoomAt,
  dungeonRoomOrigin, dungeonPassageState, initialDungeonProgress } from './dungeons';
import { worldCellAt, worldCellOrigin, WORLD_REGION_IDS } from './worldMap';
import type { ClassId } from './data';
import { inspectSavedRun } from './session';
import { GLASSLANDS_GEAR, GLASSLANDS_LAIRS } from './glasslands';
import { HUNGER_GEAR, HUNGER_VANGUARD, HUNGER_VANGUARD_ID } from './hungerTerritory';
import { REGIONAL_MONSTERS } from './regionalMonsters';
import { DUNGEON_GEAR_REWARDS, MINI_DUNGEON_GEAR_REWARDS, REGIONAL_FIELD_GEAR } from './regionalGear';
import { MAIN_BOSS_SITES } from './regionalDungeons';

test('the first five realms keep three lairs; the finale uses one short guardian route and its own key', () => {
  const realms = ['hearthglen', 'drowned-marches', 'ashen-peaks', 'glasslands', 'fallen-capital', 'first-hunger'] as const;
  for (const regionId of realms) {
    const miniLairs = DUNGEONS.filter((entry) => entry.regionId === regionId && entry.role === 'mini');
    const activeMiniLairs = regionId === 'first-hunger'
      ? miniLairs.filter((entry) => entry.id === HUNGER_VANGUARD_ID)
      : miniLairs;
    const mainDungeons = DUNGEONS.filter((entry) => entry.regionId === regionId && entry.role === 'main');
    assert.equal(activeMiniLairs.length, regionId === 'first-hunger' ? 1 : 3,
      `${regionId} has the intended number of active mini-boss dungeons`);
    assert.equal(mainDungeons.length, 1, `${regionId} has one main-boss dungeon`);
    assert.equal(mainDungeons[0]!.requiredKeys?.length, regionId === 'first-hunger' ? 1 : 3,
      `${regionId} main dungeon requires the correct lair keys`);
    if (regionId !== 'first-hunger') {
      assert.equal(new Set(mainDungeons[0]!.requiredKeys).size, 3, `${regionId} gate keys are distinct`);
      assert.ok(mainDungeons[0]!.rooms.some((room) => room.gearReward), `${regionId} main dungeon contains hidden stat gear`);
    }
    const fieldGearCount = REGIONAL_FIELD_GEAR.filter((entry) => entry.regionId === regionId).length +
      (regionId === 'glasslands' ? GLASSLANDS_GEAR.length : 0) +
      (regionId === 'first-hunger' ? HUNGER_GEAR.length : 0);
    const miniGearCount = miniLairs.filter((lair) => lair.rooms.some((room) => room.gearReward)).length;
    assert.ok(fieldGearCount + miniGearCount + Number(!!DUNGEON_GEAR_REWARDS[regionId]) >= 3,
      `${regionId} has at least three unique gear finds`);
    for (const lair of miniLairs) assert.ok(lair.keyId, `${lair.label} awards a main-dungeon key`);
  }
  const echo = DUNGEONS.find((entry) => entry.id === HUNGER_VANGUARD_ID)!;
  assert.equal(echo.rooms.filter((room) => room.gearReward).length, 3,
    'the shortened final route keeps its three hidden equipment finds inside the guardian lair');
  assert.ok(echo.rooms.length < 24, 'the First Echo lair stays compact');
  assert.equal(DUNGEONS.find((entry) => entry.id === 'first-hunger-maw')!.rooms.length, 3,
    'the final battle uses a separate small arena map');
});

test('main boss dungeon portal remains sealed until all three regional keys are carried', () => {
  const site = MAIN_BOSS_SITES.find((entry) => entry.regionId === 'hearthglen')!;
  const engine = create();
  const origin = worldCellOrigin(site.cellId);
  const player = engine.getState().player!;
  player.x = origin.x + 320;
  player.y = origin.y + 180;
  const portalId = `main-boss-entry-${site.dungeonId}`;
  operate(engine, portalId);
  assert.equal(engine.getWorldProgress().activeDungeon, null);
  assert.match(engine.getState().hint ?? '', /three mini-boss dungeons/i);

  for (const id of site.requiredKeys) {
    engine.getState().inventory.push({ id, name: id, kind: 'key', equipped: false, description: '' });
  }
  operate(engine, portalId);
  assert.equal(engine.getWorldProgress().activeDungeon?.id, site.dungeonId);
  assert.equal(engine.getWorldProgress().activeDungeon?.roomId, dungeonById(site.dungeonId)!.entryRoomId);
});

const dungeon = DUNGEONS[0];
function create(classId: ClassId = 'warrior') {
  const engine = new AdventureEngine();
  engine.startNewGame({ name: 'Dungeon tester', classId, skin: '#d99168', hairStyle: 'cropped',
    hairColor: '#3a2926', clothingColor: '#d36345' });
  return engine;
}
function operate(engine: AdventureEngine, id: string) {
  const prop = engine.getProps().find((p) => p.id === id);
  assert.ok(prop, `missing playable prop ${id}`);
  Object.assign(engine.getState().player!, { x: prop.x, y: prop.y + 24 });
  engine.pressButton('context');
  engine.dismissDialog();
}
function strike(engine: AdventureEngine, id: string) {
  const prop = engine.getProps().find((entry) => entry.id === id);
  assert.ok(prop, `missing breakable prop ${id}`);
  const player = engine.getState().player!;
  Object.assign(player, { x: prop.x - 28, y: prop.y, facing: 'right' });
  engine.pressButton('attack');
}
function assertMainBossDoorLocked(engine: AdventureEngine, regionId: string) {
  const site = MAIN_BOSS_SITES.find((entry) => entry.regionId === regionId)!;
  const origin = worldCellOrigin(site.cellId);
  Object.assign(engine.getState().player!, { x: origin.x + 320, y: origin.y + 180 });
  const portal = engine.getProps().find((prop) => prop.id === `main-boss-entry-${site.dungeonId}`);
  assert.ok(portal, `${site.label} has a visible but locked dungeon entrance`);
  assert.equal(portal.activated, false, 'one key cannot open a boss dungeon');
}
function enter(engine: AdventureEngine) {
  assert.equal(engine.getProps().some((prop) => prop.id === 'drainhouse-enter'), false,
    'the flooded entrance is not visible');
  strike(engine, 'drainhouse-willow');
  const mid = engine.exportSave()!;
  const reloaded = new AdventureEngine();
  assert.equal(reloaded.loadSave(JSON.parse(JSON.stringify(mid))), true);
  assert.equal(reloaded.getWorldProgress().dungeons[DRAINHOUSE_ID].entranceOpen, true);
  assert.ok(reloaded.getWorldProgress().dungeons[DRAINHOUSE_ID].valves.includes('willow-drained-pool'));
  operate(engine, 'drainhouse-enter');
  assert.equal(engine.getWorldProgress().activeDungeon?.roomId, dungeon.entryRoomId);
}
function roundTrip(engine: AdventureEngine) {
  const save = JSON.parse(JSON.stringify(engine.exportSave())) as SavedRun;
  assert.equal(inspectSavedRun(JSON.stringify(save)).status, 'available');
  const resumed = new AdventureEngine();
  assert.ok(resumed.loadSave(save));
  assert.deepEqual(resumed.getWorldProgress(), engine.getWorldProgress());
  assert.deepEqual(resumed.getState().discoveredWorldCells, engine.getState().discoveredWorldCells,
    'local dungeon coordinates must never reveal unrelated overworld screens');
  assert.deepEqual(resumed.getEnemies(), JSON.parse(JSON.stringify(engine.getEnemies())));
  return resumed;
}
// Walk through actual room boundaries. No room-transition or interaction methods are mocked.
function walkEdge(engine: AdventureEngine, edge: string) {
  const visit = engine.getWorldProgress().activeDungeon!;
  const dungeon = dungeonById(visit.id)!;
  const room = dungeon.rooms.find((r) => r.id === visit.roomId)!;
  const origin = dungeonRoomOrigin(room);
  const player = engine.getState().player!;
  const horizontal = edge === 'east' || edge === 'west';
  player.x = origin.x + (horizontal ? edge === 'east' ? 605 : 35 : 320);
  player.y = origin.y + (horizontal ? 240 : edge === 'south' ? 445 : 35);
  const direction = ({ north: 'up', south: 'down', east: 'right', west: 'left' } as const)[edge as 'north'];
  engine.setDirection(direction, true);
  for (let i = 0; i < 13; i++) engine.tick(50);
  engine.releaseAllDirections();
  assert.equal(engine.getWorldProgress().activeDungeon?.roomId, room.exits[edge as 'north'],
    `door ${room.id}/${edge} to ${room.exits[edge as 'north']} left ${engine.getWorldProgress().activeDungeon?.roomId ?? 'the dungeon'}; HP ${engine.getState().player?.hp ?? 'none'} at ${engine.getState().player?.x}, ${engine.getState().player?.y}`);
}
function travel(engine: AdventureEngine, target: string) {
  const visit = engine.getWorldProgress().activeDungeon!;
  const dungeon = dungeonById(visit.id)!;
  const start = engine.getWorldProgress().activeDungeon!.roomId;
  const queue: { id: string; path: string[] }[] = [{ id: start, path: [] }];
  const seen = new Set([start]);
  while (queue.length) {
    const node = queue.shift()!;
    if (node.id === target) {
      for (const edge of node.path) walkEdge(engine, edge);
      return;
    }
    const room = dungeon.rooms.find((r) => r.id === node.id)!;
    for (const [edge, next] of Object.entries(room.exits)) {
      if (!next || seen.has(next)) continue;
      if (dungeonPassageState(dungeon.id, room, edge as 'north',
          engine.getWorldProgress().dungeons[dungeon.id]) !== 'open') continue;
      seen.add(next); queue.push({ id: next, path: [...node.path, edge] });
    }
  }
  assert.fail(`no playable route to ${target}`);
}

test('independent 4x8 lair has reciprocal exits, a deliberate loop, and solid blank cells', () => {
  const opposite = { north: 'south', south: 'north', east: 'west', west: 'east' } as const;
  for (const room of dungeon.rooms) {
    assert.ok(room.row >= 0 && room.row < 4 && room.column >= 0 && room.column < 8);
    for (const [edge, id] of Object.entries(room.exits)) {
      const neighbor = dungeon.rooms.find((r) => r.id === id)!;
      assert.equal(neighbor.exits[opposite[edge as 'north']], room.id);
      assert.equal(Math.abs(neighbor.row - room.row) + Math.abs(neighbor.column - room.column), 1);
    }
  }
  for (let row = 0; row < 4; row++) for (let col = 0; col < 8; col++) {
    if (!dungeon.rooms.some((r) => r.row === row && r.column === col)) {
      assert.ok(dungeonBlocked(dungeon.id, initialDungeonProgress(), col * 640 + 320, row * 480 + 240));
    }
  }
  const progress = initialDungeonProgress();
  assert.ok(dungeonBlocked(dungeon.id, progress, 3 * 640 + 320, 2 * 480 - 10));
  progress.doorOpen = true;
  assert.equal(dungeonBlocked(dungeon.id, progress, 3 * 640 + 320, 2 * 480 - 10), false);
});

test('dungeon rooms spawn regional enemy groups while entrances and rest rooms stay safe', () => {
  const engine = create();
  enter(engine);
  const regionIndex = WORLD_REGION_IDS.indexOf(dungeon.regionId!);
  const rosterRegions = WORLD_REGION_IDS.slice(Math.max(0, regionIndex - 1), regionIndex + 1);
  const rosterNames = new Set(rosterRegions.flatMap((regionId) =>
    REGIONAL_MONSTERS[regionId].map((monster) => monster.name)));

  assert.equal(engine.getEnemies().length, 0, 'the dungeon entrance remains safe');
  const hall = dungeon.rooms.find((room) => room.feature === 'hall')!;
  travel(engine, hall.id);
  assert.equal(engine.getWorldProgress().activeDungeon?.roomId, hall.id);
  assert.equal(engine.getEnemies().length, 5, 'dungeon halls should feel crowded with five regional foes');
  assert.ok(engine.getEnemies().every((enemy) => rosterNames.has(enemy.name)),
    'the Marches dungeon uses Marches species');

  const rest = dungeon.rooms.find((room) => room.feature === 'rest')!;
  travel(engine, rest.id);
  assert.equal(engine.getEnemies().length, 0, 'a rest room remains safe');
});

test('the three Glasslands keepers guard separate keyed 4x8 lairs with reciprocal, sealed routes', () => {
  const lairs = DUNGEONS.filter((entry) => entry.regionId === 'glasslands' && entry.role === 'mini');
  assert.equal(lairs.length, 3);
  assert.equal(new Set(lairs.map((entry) => entry.keyId)).size, 3);
  assert.equal(new Set(lairs.map((entry) => entry.bossName)).size, 3);
  const opposite = { north: 'south', south: 'north', east: 'west', west: 'east' } as const;
  for (const lair of lairs) {
    assert.equal(lair.rooms.length, 17);
    assert.ok(lair.keyId && lair.bossName && lair.mechanismRooms?.length === 2);
    const byId = new Map(lair.rooms.map((room) => [room.id, room]));
    for (const room of lair.rooms) for (const [edge, neighborId] of Object.entries(room.exits)) {
      const neighbor = byId.get(neighborId!);
      assert.ok(neighbor, `${lair.id} connects only authored rooms`);
      assert.equal(neighbor!.exits[opposite[edge as keyof typeof opposite]], room.id);
      assert.equal(Math.abs(neighbor!.row - room.row) + Math.abs(neighbor!.column - room.column), 1);
    }
    const progress = initialDungeonProgress();
    const seal = lair.sealedEdge!;
    const sealedRoom = byId.get(seal.roomId)!;
    assert.equal(dungeonPassageState(lair.id, sealedRoom, seal.edge, progress), 'locked');
    progress.doorOpen = true;
    assert.equal(dungeonPassageState(lair.id, sealedRoom, seal.edge, progress), 'open');
    const reachable = new Set([lair.entryRoomId]);
    const queue = [lair.entryRoomId];
    while (queue.length) {
      const current = byId.get(queue.shift()!)!;
      for (const neighborId of Object.values(current.exits)) {
        if (neighborId && !reachable.has(neighborId)) {
          reachable.add(neighborId);
          queue.push(neighborId);
        }
      }
    }
    assert.equal(reachable.size, lair.rooms.length, `${lair.id} has no isolated rooms`);
    for (let row = 0; row < 4; row++) for (let column = 0; column < 8; column++) {
      if (lair.rooms.some((room) => room.row === row && room.column === column)) continue;
      assert.equal(dungeonBlocked(lair.id, progress, column * 640 + 320, row * 480 + 240), true);
    }
  }
});

test('each Glasslands entrance, inner seal, mini-boss key, return door, and reload is playable', () => {
  for (const lair of GLASSLANDS_LAIRS) {
    let engine = create();
    const save = engine.exportSave()!;
    const origin = worldCellOrigin(lair.cellId);
    save.state.player!.x = origin.x + 320;
    save.state.player!.y = origin.y + 240;
    save.progress.world!.unlockedRegions.push('glasslands');
    save.progress.world!.dungeons = Object.fromEntries(
      GLASSLANDS_LAIRS.map((entry) => [entry.id, initialDungeonProgress()]),
    );
    assert.ok(engine.loadSave(save));

    if (lair.entrancePuzzle === 'anchors') {
      operate(engine, `${lair.id}/anchor-left`);
      engine = roundTrip(engine);
      operate(engine, `${lair.id}/anchor-right`);
    } else if (lair.entrancePuzzle === 'mirror') {
      operate(engine, `${lair.id}/lens`);
      engine = roundTrip(engine);
      operate(engine, `${lair.id}/lens`);
    } else {
      operate(engine, `${lair.id}/ward`);
      const warden = engine.getEnemies().find((enemy) => enemy.id.includes('heartglass-door-warden'));
      assert.ok(warden);
      warden.hp = 1;
      warden.stunnedMs = 10_000;
      Object.assign(engine.getState().player!, { x: warden.x - 42, y: warden.y, facing: 'right' });
      engine.setDirection('right', true);
      engine.tick(1);
      engine.releaseAllDirections();
      engine.pressButton('attack');
      operate(engine, `${lair.id}/ward`);
    }
    assert.equal(engine.getWorldProgress().dungeons[lair.id].entranceOpen, true, `${lair.label} entrance opens`);
    operate(engine, `${lair.id}/enter`);
    engine = roundTrip(engine);
    const definition = dungeonById(lair.id)!;
    assert.equal(engine.getWorldProgress().activeDungeon?.id, lair.id);

    for (const mechanismRoom of definition.mechanismRooms!) {
      travel(engine, mechanismRoom);
      if (definition.puzzle === 'hunt') {
        const echoes = [...engine.getEnemies()];
        assert.ok(echoes.length, `${lair.label} mechanism room has a clearable encounter`);
        for (const [index, echo] of echoes.entries()) {
          echo.hp = 1;
          echo.stunnedMs = 10_000;
          engine.getProjectiles().push({
            id: 90_000 + index, x: echo.x, y: echo.y, vx: 0, vy: 0,
            damage: echo.maxHp + 10, playerOwned: true, radius: 6,
            tint: 0xffffff, lifeMs: 1000, aoe: 0,
          });
        }
        engine.tick(1);
        assert.equal(engine.getEnemies().length, 0);
      }
      operate(engine, `dungeon-wheel-${mechanismRoom}`);
      if (definition.puzzle === 'mirror') operate(engine, `dungeon-wheel-${mechanismRoom}`);
    }
    engine = roundTrip(engine);
    travel(engine, definition.sealedEdge!.roomId);
    operate(engine, 'dungeon-door');
    assert.equal(engine.getWorldProgress().dungeons[lair.id].doorOpen, true);
    engine = roundTrip(engine);
    const bossRoom = definition.rooms.find((room) => room.feature === 'boss')!;
    travel(engine, bossRoom.id);
    engine.tick(1_000);
    const boss = engine.getEnemies().find((enemy) => enemy.boss)!;
    assert.ok(boss, `${lair.boss} is present`);
    boss.hp = 1;
    boss.stunnedMs = 10_000;
    Object.assign(engine.getState().player!, { x: boss.x - 42, y: boss.y, facing: 'right' });
    engine.setDirection('right', true);
    engine.releaseAllDirections();
    engine.pressButton('attack');
    assert.ok(engine.getWorldProgress().dungeons[lair.id].bossDefeated,
      `${lair.id} boss survives a point-blank attack: ${engine.getEnemies().map((enemy) => `${enemy.id} ${enemy.hp}`).join(', ')}`);
    assert.ok(engine.getState().inventory.some((item) => item.id === lair.key), `${lair.boss} drops its key`);
    engine = roundTrip(engine);
    operate(engine, 'dungeon-return');
    assert.equal(engine.getWorldProgress().activeDungeon, null);
    assert.equal(worldCellAt(engine.getState().player!.x, engine.getState().player!.y)?.id, lair.cellId);
  }
});

for (const classId of ['warrior', 'rogue', 'adept', 'mage'] as const) {
  test(`${classId}: entry, every objective, boss, return and reload are playable`, () => {
    let engine = create(classId);
    const before = engine.exportSave()!;
    enter(engine);
    const returnPoint = engine.getWorldProgress().activeDungeon!;
    engine = roundTrip(engine);
    const overworldHp = engine.exportSave()!.actors.map((a) => [a.id, a.hp, a.x, a.y]);
    travel(engine, '1:3');
    operate(engine, 'dungeon-door');
    assert.equal(engine.getWorldProgress().dungeons[DRAINHOUSE_ID].doorOpen, false);
    travel(engine, '0:1');
    operate(engine, 'dungeon-wheel-0:1');
    engine = roundTrip(engine);
    travel(engine, '2:1');
    operate(engine, 'dungeon-wheel-2:1');
    travel(engine, '1:3');
    operate(engine, 'dungeon-door');
    assert.ok(engine.getWorldProgress().dungeons[DRAINHOUSE_ID].doorOpen);
    engine = roundTrip(engine);
    // Every authored room is reachable, with real live enemies and persistent loot.
    for (const room of dungeon.rooms) {
      travel(engine, room.id);
      if (room.feature === 'chest') {
        operate(engine, `dungeon-chest-${room.id}`);
        const coins = engine.getState().player!.coins;
        operate(engine, `dungeon-chest-${room.id}`);
        assert.equal(engine.getState().player!.coins, coins);
        engine = roundTrip(engine);
      }
      if (room.feature === 'rest') operate(engine, 'dungeon-rest');
    }
    assert.equal(engine.getWorldProgress().dungeons[DRAINHOUSE_ID].discoveredRooms.length, dungeon.rooms.length);
    travel(engine, '1:7');
    const boss = engine.getEnemies().find((e) => e.boss)!;
    assert.ok(boss);
    for (let i = 0; i < 100 && !boss.telegraph; i++) engine.tick(50);
    const markedPattern = boss.telegraph?.pattern;
    assert.ok(markedPattern, 'boss attacks have a readable warning');
    engine = roundTrip(engine);
    const restoredBoss = engine.getEnemies().find((e) => e.boss)!;
    assert.equal(restoredBoss.telegraph?.pattern, markedPattern, 'mid-warning save preserves the marked attack');
    const mark = restoredBoss.telegraph!;
    Object.assign(engine.getState().player!, { x: mark.x - 220, y: mark.y + 190 });
    const health = engine.getState().player!.hp;
    for (let i = 0; i < 26; i++) engine.tick(50);
    assert.equal(engine.getState().player!.hp, health, 'telegraphed slam can be avoided');
    for (let i = 0; i < 44; i++) engine.tick(50);
    const nextWarning = engine.getEnemies().find((e) => e.boss)!.telegraph!;
    assert.ok(nextWarning.pattern, 'the next boss attack also has a readable warning');
    const nextBoss = engine.getEnemies().find((e) => e.boss)!;
    const safePosition = nextWarning.pattern === 'swing'
      ? (() => {
          const angle = Math.atan2(nextWarning.y - nextBoss.y, nextWarning.x - nextBoss.x);
          return { x: nextBoss.x - Math.cos(angle) * 90, y: nextBoss.y - Math.sin(angle) * 90 };
        })()
      : nextWarning.pattern === 'circle'
        ? { x: nextWarning.x + 130, y: nextWarning.y + 130 }
        : nextWarning.pattern === 'ring'
          ? { x: nextWarning.x, y: nextWarning.y }
          : nextWarning.pattern === 'horizontal'
            ? { x: nextWarning.x, y: nextWarning.y + 70 }
            : nextWarning.pattern === 'vertical'
              ? { x: nextWarning.x + 70, y: nextWarning.y }
              : { x: nextWarning.x + 65, y: nextWarning.y + 65 };
    Object.assign(engine.getState().player!, safePosition);
    for (let i = 0; i < 26; i++) engine.tick(50);
    assert.equal(engine.getState().player!.hp, health, 'the second named attack can be avoided');
    engine = roundTrip(engine);
    // Use each class's real basic combat, not a direct defeat hook.
    engine.closeMenu();
    engine.dismissDialog();
    engine.getProjectiles().length = 0;
    const bossActor = engine.getEnemies().find((enemy) => enemy.boss)!;
    engine.getEnemies().splice(0, engine.getEnemies().length, bossActor);
    const player = engine.getState().player!;
    for (let hit = 0; hit < 250 && engine.getEnemies().some((e) => e.boss); hit++) {
      const target = engine.getEnemies().find((e) => e.boss)!;
      // The two real telegraphs above cover avoidance; this section isolates
      // normal attack damage and reward persistence from the long health bar.
      player.hp = player.maxHp;
      target.telegraph = undefined;
      target.attackMs = 60_000;
      const attackFromLeft = target.x >= 114;
      Object.assign(player, {
        x: attackFromLeft ? target.x - 42 : target.x + 42,
        y: target.y,
        facing: attackFromLeft ? 'right' : 'left',
      });
      engine.setAnalogMovement(attackFromLeft ? 1 : -1, 0);
      engine.releaseAllDirections();
      engine.pressButton('attack');
      for (let i = 0; i < 5; i++) engine.tick(50);
    }
    const remainingBoss = engine.getEnemies().find((enemy) => enemy.boss);
    assert.ok(engine.getWorldProgress().dungeons[DRAINHOUSE_ID].bossDefeated,
      `combat loop ended with boss ${remainingBoss?.hp ?? 'absent'}/${remainingBoss?.maxHp ?? 'n/a'} in ` +
      `${engine.getWorldProgress().activeDungeon?.roomId ?? 'the overworld'}`);
    assert.ok(engine.getState().inventory.some((i) => i.id === DRAINHOUSE_KEY));
    assert.equal(engine.getState().bossDefeated, before.state.bossDefeated, 'main boss story is unchanged');
    engine = roundTrip(engine);
    operate(engine, 'dungeon-return');
    assert.equal(engine.getWorldProgress().activeDungeon, null);
    assert.equal(engine.getState().player!.x, returnPoint.returnX);
    assert.equal(engine.getState().player!.y, returnPoint.returnY);
    assert.equal(worldCellAt(engine.getState().player!.x, engine.getState().player!.y)?.id, 'wreckers-reach');
    assert.deepEqual(engine.exportSave()!.actors.map((a) => [a.id, a.hp, a.x, a.y]), overworldHp);
    engine = roundTrip(engine);
    operate(engine, 'drainhouse-enter');
    travel(engine, '1:7');
    assert.equal(engine.getEnemies().some((e) => e.boss), false);
    operate(engine, 'dungeon-return');
    operate(engine, 'chapel-inner-seal');
    assert.ok(engine.getWorldProgress().chapelGateOpen, 'reward unlocks the bellkeeper area');
    assert.equal(engine.getState().quest.step, 'Defeat the three lair keepers');
    assert.equal(engine.getEnemies().some((enemy) => enemy.id === 'sunken-chapel:chapel-bellkeeper'), false,
      'the bellkeeper now lives in the three-key main dungeon, never on the field');
    assertMainBossDoorLocked(engine, 'drowned-marches');
  });
}

test('dungeon map and collision share reciprocal open and locked passage states', () => {
  const pressureRoom = dungeon.rooms.find((room) => room.id === '1:3')!;
  const spillway = dungeon.rooms.find((room) => room.id === '2:3')!;
  const progress = initialDungeonProgress();
  assert.equal(dungeonPassageState(dungeon.id, pressureRoom, 'south', progress), 'locked');
  assert.equal(dungeonPassageState(dungeon.id, spillway, 'north', progress), 'locked');
  assert.equal(dungeonPassageState(dungeon.id, pressureRoom, 'east', progress), 'wall');
  assert.equal(dungeonPassageState(dungeon.id, pressureRoom, 'west', progress), 'open');
  progress.doorOpen = true;
  assert.equal(dungeonPassageState(dungeon.id, pressureRoom, 'south', progress), 'open');
  assert.equal(dungeonPassageState(dungeon.id, spillway, 'north', progress), 'open');
  const invalidRoom = { ...pressureRoom, exits: { east: '0:6' } };
  assert.equal(dungeonPassageState(dungeon.id, invalidRoom, 'east', progress), 'wall');
});

test('dungeon connection map fits its 4x8 grid, marks locked doors, and hides unknown room names', () => {
  const world = createInitialWorldProgress();
  world.activeDungeon = { id: dungeon.id, roomId: '1:3', returnX: 10, returnY: 20 };
  world.dungeons[dungeon.id] = {
    ...initialDungeonProgress(), discoveredRooms: ['1:3', '2:3'],
  };
  const locked = renderToStaticMarkup(createElement(DungeonMap, { world }));
  assert.equal((locked.match(/class="overworld-cell dungeon-cell /g) ?? []).length, 32);
  assert.match(locked, /repeat\(8, minmax\(0, 1fr\)\)/);
  assert.match(locked, /south locked/);
  assert.match(locked, /north locked/);
  assert.match(locked, /class="passage-locked"/);
  assert.match(locked, /your current location/);
  assert.doesNotMatch(locked, /Guardian Warning|Salvage Vault|Anchor Chamber/);
  world.dungeons[dungeon.id].doorOpen = true;
  const open = renderToStaticMarkup(createElement(DungeonMap, { world }));
  assert.match(open, /south open/);
  assert.doesNotMatch(open, /class="passage-locked"/);

  const queriedRooms: string[] = [];
  const postgame = renderToStaticMarkup(createElement(DungeonMap, {
    world,
    getWaveStatus: (cell) => {
      queriedRooms.push(cell);
      return { clearCount: 2, nextWaveMultiplier: 1.56, remainingMs: 120_000 };
    },
  }));
  assert.deepEqual(queriedRooms, [`${dungeon.id}/1:3`, `${dungeon.id}/2:3`],
    'status is requested only for discovered rooms');
  assert.equal((postgame.match(/class="map-wave-status"/g) ?? []).length, 2);
  assert.match(postgame, /Cleared 2 times · next wave ×1\.56 health and damage · 120 seconds until wave returns/);
  assert.doesNotMatch(postgame, /Unseen Chamber Name/);
});

test('landing exit works before defeating the Warden and re-entry preserves room enemies', () => {
  let engine = create();
  enter(engine);
  travel(engine, '1:1');
  const crawler = engine.getEnemies()[0];
  crawler.hp = 23;
  crawler.attackMs = 900;
  travel(engine, '0:1');
  const frozen = engine.exportSave()!.dungeonActors![`${DRAINHOUSE_ID}/1:1`];
  for (let i = 0; i < 50; i++) engine.tick(50);
  engine = roundTrip(engine);
  assert.deepEqual(engine.exportSave()!.dungeonActors![`${DRAINHOUSE_ID}/1:1`], frozen, 'inactive rooms do not simulate');
  travel(engine, '1:1');
  assert.equal(engine.getEnemies()[0].hp, 23);
  travel(engine, dungeon.entryRoomId);
  operate(engine, 'dungeon-exit');
  assert.equal(worldCellAt(engine.getState().player!.x, engine.getState().player!.y)?.id, 'wreckers-reach');
});

test('cutting the flood-root willow reveals the Drainhouse and its dungeon walls remain solid', () => {
  const engine = create();
  strike(engine, 'drainhouse-willow');
  assert.ok(engine.getWorldProgress().dungeons[DRAINHOUSE_ID].entranceOpen);
  operate(engine, 'drainhouse-enter');
  const player = engine.getState().player!;
  player.x = 605; player.y = 3 * 480 + 240;
  engine.setDirection('right', true);
  for (let i = 0; i < 50; i++) engine.tick(50);
  engine.releaseAllDirections();
  assert.equal(dungeonRoomAt(DRAINHOUSE_ID, player.x, player.y)?.id, '3:0');
  assert.ok(player.x <= 622);
});

test('regional lair discovery varies across a hidden tree, ordered tree cuts, and key-fragment caches', () => {
  const burrow = create();
  const burrowOrigin = worldCellOrigin('heartwood-burrow');
  Object.assign(burrow.getState().player!, { x: burrowOrigin.x + 320, y: burrowOrigin.y + 240 });
  assert.equal(burrow.getProps().some((prop) => prop.id === 'heartwood-burrow/enter'), false);
  strike(burrow, 'heartwood-burrow/tree');
  assert.equal(burrow.getWorldProgress().dungeons['heartwood-burrow'].entranceOpen, true);
  assert.ok(burrow.getProps().some((prop) => prop.id === 'heartwood-burrow/enter'));

  const watch = create();
  const watchOrigin = worldCellOrigin('forgotten-watch');
  Object.assign(watch.getState().player!, { x: watchOrigin.x + 320, y: watchOrigin.y + 240 });
  strike(watch, 'forgotten-watch/tree-0');
  strike(watch, 'forgotten-watch/tree-2');
  assert.equal(watch.getWorldProgress().dungeons['forgotten-watch'].entranceOpen, false,
    'a wrong cut resets the tree sequence');
  assert.equal(watch.getWorldProgress().dungeons['forgotten-watch'].valves.includes('entry-tree-0'), false);
  strike(watch, 'forgotten-watch/tree-0');
  strike(watch, 'forgotten-watch/tree-1');
  strike(watch, 'forgotten-watch/tree-2');
  assert.equal(watch.getWorldProgress().dungeons['forgotten-watch'].entranceOpen, true);

  const hollow = create();
  const hollowOrigin = worldCellOrigin('weeping-hollow');
  Object.assign(hollow.getState().player!, { x: hollowOrigin.x + 320, y: hollowOrigin.y + 240 });
  assert.equal(hollow.getProps().some((prop) => prop.id === 'weeping-hollow/enter'), false);
  for (const index of [0, 1]) operate(hollow, `weeping-hollow/fragment-${index}`);
  assert.equal(hollow.getWorldProgress().dungeons['weeping-hollow'].entranceOpen, false);
  assert.equal(hollow.getState().inventory.filter((item) => item.name.includes('key fragment')).length, 2);
  operate(hollow, 'weeping-hollow/fragment-2');
  assert.equal(hollow.getWorldProgress().dungeons['weeping-hollow'].entranceOpen, true);
  operate(hollow, 'weeping-hollow/enter');
  assert.equal(hollow.getWorldProgress().activeDungeon?.id, 'weeping-hollow');
});

test('a second marsh willow reveals a poolside treasure instead of a dungeon entrance', () => {
  const engine = create();
  const origin = worldCellOrigin('old-floodgate');
  Object.assign(engine.getState().player!, { x: origin.x + 320, y: origin.y + 240 });
  const coins = engine.getState().player!.coins;
  strike(engine, 'marsh-silt-tree');
  const cache = engine.getProps().find((prop) => prop.id === 'marsh-silt-cache');
  assert.equal(cache?.visible, true);
  operate(engine, 'marsh-silt-cache');
  assert.equal(engine.getState().player!.coins, coins + 24);
  assert.ok(engine.getState().inventory.some((item) => item.id === 'floodgate-tonic'));
});

for (const lair of MARCHES_LAIRS) {
  test(`${lair.label}: authored reciprocal maze has no seal bypass or accessible blank cells`, () => {
    assert.equal(lair.regionId, 'drowned-marches');
    assert.notDeepEqual(lair.rooms.map((room) => room.exits), dungeon.rooms.map((room) => room.exits));
    const progress = initialDungeonProgress();
    const reachable = () => {
      const seen = new Set([lair.entryRoomId]);
      const queue = [lair.entryRoomId];
      while (queue.length) {
        const id = queue.shift()!;
        const room = lair.rooms.find((candidate) => candidate.id === id)!;
        for (const [edge, next] of Object.entries(room.exits)) {
          assert.notEqual(dungeonPassageState(lair.id, room, edge as 'north', { ...progress, doorOpen: true }), 'wall');
          if (!seen.has(next!) && dungeonPassageState(lair.id, room, edge as 'north', progress) === 'open') {
            seen.add(next!); queue.push(next!);
          }
        }
      }
      return seen;
    };
    const before = reachable();
    for (const id of lair.mechanismRooms!) assert.ok(before.has(id), 'every mandatory puzzle is accessible before the seal');
    assert.ok(before.has(lair.sealedEdge!.roomId));
    assert.equal(before.has(lair.rooms.find((room) => room.feature === 'boss')!.id), false, 'cannot bypass mandatory puzzle');
    progress.doorOpen = true;
    assert.equal(reachable().size, lair.rooms.length);
    for (let row = 0; row < 4; row++) for (let col = 0; col < 8; col++) {
      if (!lair.rooms.some((room) => room.row === row && room.column === col)) {
        assert.ok(dungeonBlocked(lair.id, progress, col * 640 + 320, row * 480 + 240));
      }
    }
  });

  for (const classId of ['warrior', 'rogue', 'adept', 'mage'] as const) {
    test(`${lair.label} / ${classId}: discovery, mandatory puzzle, live combat, persistence and own return route`, () => {
      let engine = create(classId);
      const startingSave = engine.exportSave()!;
      const entry = engine.getProps().find((prop) => prop.id === `${lair.id}/enter`)!;
      Object.assign(startingSave.state.player!, { x: entry.x, y: entry.y + 24 });
      assert.ok(engine.loadSave(startingSave));
      const entrance = (action: string) => {
        operate(engine, `${lair.id}/${action}`);
      };
      entrance('enter');
      assert.equal(engine.getWorldProgress().activeDungeon, null);
      entrance('record');
      if (lair.discovery === 'chimes') {
        entrance('note-2');
        assert.equal(engine.getWorldProgress().dungeons[lair.id].entranceOpen, false);
        entrance('note-0');
        engine = roundTrip(engine);
        entrance('note-1'); entrance('note-2');
      } else {
        entrance('lantern');
        engine = roundTrip(engine);
        entrance('lantern');
        assert.equal(engine.getWorldProgress().dungeons[lair.id].entranceOpen, false);
        entrance('lantern');
      }
      assert.ok(engine.getWorldProgress().dungeons[lair.id].entranceOpen);
      assert.ok(engine.getProps().find((prop) => prop.id === `${lair.id}/${lair.discovery === 'chimes' ? 'note-2' : 'lantern'}`)!.activated);
      assert.match(engine.getContextHint(), /\(active\)/, 'mechanism state remains visible without moving');
      assert.equal(engine.getWorldProgress().dungeons[DRAINHOUSE_ID]?.entranceOpen, false);
      entrance(lair.discovery === 'chimes' ? 'note-0' : 'lantern');
      assert.ok(engine.getWorldProgress().dungeons[lair.id].entranceOpen, 'discovery stays open');
      entrance('enter');
      const returnPoint = engine.getWorldProgress().activeDungeon!;
      assert.equal(worldCellAt(returnPoint.returnX, returnPoint.returnY)?.id, lair.entryCellId);
      engine = roundTrip(engine);
      const overworld = engine.exportSave()!.actors;
      travel(engine, lair.sealedEdge!.roomId);
      operate(engine, 'dungeon-door');
      assert.equal(engine.getWorldProgress().dungeons[lair.id].doorOpen, false);
      // The real movement system respects the closed door in both directions.
      const doorRoom = lair.rooms.find((room) => room.id === lair.sealedEdge!.roomId)!;
      const origin = dungeonRoomOrigin(doorRoom);
      Object.assign(engine.getState().player!, { x: origin.x + 605, y: origin.y + 240 });
      engine.setDirection('right', true);
      for (let i = 0; i < 20; i++) engine.tick(50);
      engine.releaseAllDirections();
      assert.equal(engine.getWorldProgress().activeDungeon!.roomId, doorRoom.id);
      assert.ok(engine.getState().player!.x <= origin.x + 622);

      if (lair.puzzle === 'chimes') {
        travel(engine, lair.mechanismRooms![1]);
        operate(engine, `dungeon-wheel-${lair.mechanismRooms![1]}`);
        assert.equal(engine.getWorldProgress().dungeons[lair.id].valves.some((value) => lair.mechanismRooms!.includes(value)), false);
        for (const id of lair.mechanismRooms!) {
          travel(engine, id); operate(engine, `dungeon-wheel-${id}`);
          engine = roundTrip(engine);
        }
      } else {
        // A wrong setting must not count as simply visiting every mechanism.
        for (const id of lair.mechanismRooms!) {
          travel(engine, id); operate(engine, `dungeon-wheel-${id}`);
        }
        travel(engine, lair.sealedEdge!.roomId); operate(engine, 'dungeon-door');
        assert.equal(engine.getWorldProgress().dungeons[lair.id].doorOpen, false);
        for (const id of [lair.mechanismRooms![2], lair.mechanismRooms![0]]) {
          travel(engine, id); operate(engine, `dungeon-wheel-${id}`);
          engine = roundTrip(engine);
        }
      }
      travel(engine, lair.sealedEdge!.roomId); operate(engine, 'dungeon-door');
      assert.ok(engine.getWorldProgress().dungeons[lair.id].doorOpen);
      engine = roundTrip(engine);
      travel(engine, lair.mechanismRooms![0]);
      operate(engine, `dungeon-wheel-${lair.mechanismRooms![0]}`);
      travel(engine, lair.sealedEdge!.roomId); operate(engine, 'dungeon-door');
      assert.ok(engine.getWorldProgress().dungeons[lair.id].doorOpen, 'completed seals cannot relock');

      const hall = lair.rooms.find((room) => room.feature === 'hall')!;
      travel(engine, hall.id);
      engine.getEnemies()[0].hp = 23;
      engine.getEnemies()[0].attackMs = 900;
      travel(engine, lair.entryRoomId);
      const frozen = engine.exportSave()!.dungeonActors![`${lair.id}/${hall.id}`];
      for (let i = 0; i < 50; i++) engine.tick(50);
      engine = roundTrip(engine);
      assert.deepEqual(engine.exportSave()!.dungeonActors![`${lair.id}/${hall.id}`], frozen);
      operate(engine, 'dungeon-exit');
      assert.equal(engine.getState().player!.x, returnPoint.returnX);
      assert.equal(engine.getState().player!.y, returnPoint.returnY);
      entrance('enter');
      travel(engine, hall.id);
      assert.equal(engine.getEnemies()[0].hp, 23);
      for (const room of lair.rooms) {
        travel(engine, room.id);
        if (room.feature === 'chest') {
          operate(engine, `dungeon-chest-${room.id}`);
          const coins = engine.getState().player!.coins;
          engine = roundTrip(engine);
          operate(engine, `dungeon-chest-${room.id}`);
          assert.equal(engine.getState().player!.coins, coins);
        } else if (room.feature === 'rest') operate(engine, 'dungeon-rest');
      }
      assert.equal(engine.getWorldProgress().dungeons[lair.id].discoveredRooms.length, lair.rooms.length);
      travel(engine, lair.rooms.find((room) => room.feature === 'boss')!.id);
      assert.equal(engine.getEnemies().find((enemy) => enemy.boss)!.name, lair.bossName);
      // Bosses have distinct attack rhythms; test the actual warning rather
      // than assuming every dungeon shares one pattern.
      for (let i = 0; i < 150 && !engine.getEnemies()[0].telegraph; i++) engine.tick(50);
      const pattern = engine.getEnemies()[0].telegraph?.pattern;
      assert.ok(pattern, `${lair.label} boss telegraphs an attack`);
      engine = roundTrip(engine);
      const mark = engine.getEnemies()[0].telegraph!;
      assert.equal(mark.pattern, pattern);
      Object.assign(engine.getState().player!, { x: mark.x - 220, y: mark.y + 190 });
      const hp = engine.getState().player!.hp;
      for (let i = 0; i < 26; i++) engine.tick(50);
      assert.equal(engine.getState().player!.hp, hp, 'marked strike is avoidable');
      for (let i = 0; i < 100 && !engine.getEnemies()[0].telegraph; i++) engine.tick(50);
      const nextMark = engine.getEnemies()[0].telegraph!;
      assert.ok(nextMark.pattern, 'the next distinct tell is visible');
      Object.assign(engine.getState().player!, { x: nextMark.x - 220, y: nextMark.y + 190 });
      for (let i = 0; i < 26; i++) engine.tick(50);
      assert.equal(engine.getState().player!.hp, hp);
      const target = engine.getEnemies().find((enemy) => enemy.boss)!;
      target.hp = 1;
      target.stunnedMs = 10_000;
      Object.assign(engine.getState().player!, { x: target.x - 42, y: target.y, facing: 'right' });
      engine.setAnalogMovement(1, 0); engine.tick(1); engine.releaseAllDirections();
      engine.pressButton('attack'); engine.tick(1);
      assert.ok(engine.getWorldProgress().dungeons[lair.id].bossDefeated);
      assert.equal(engine.getState().inventory.filter((item) => item.id === lair.keyId).length, 1);
      assert.equal(engine.getState().inventory.find((item) => item.id === lair.keyId)!.kind, 'key');
      assert.match(engine.getState().inventory.find((item) => item.id === lair.keyId)!.description, /Sunken Chapel/);
      engine = roundTrip(engine);
      operate(engine, 'dungeon-return');
      assert.equal(engine.getWorldProgress().activeDungeon, null);
      assert.equal(engine.getState().player!.x, returnPoint.returnX);
      assert.equal(engine.getState().player!.y, returnPoint.returnY);
      assert.equal(worldCellAt(engine.getState().player!.x, engine.getState().player!.y)?.id, lair.entryCellId);
      assert.deepEqual(engine.exportSave()!.actors, overworld);
      engine = roundTrip(engine);
      entrance('enter');
      travel(engine, lair.rooms.find((room) => room.feature === 'boss')!.id);
      assert.equal(engine.getEnemies().some((enemy) => enemy.boss), false);
      operate(engine, 'dungeon-return');
      assert.ok(engine.getState().inventory.some((item) => item.id === lair.keyId),
        `${lair.label} rewards its key`);
      assert.equal(engine.getEnemies().some((enemy) => enemy.id === 'sunken-chapel:chapel-bellkeeper'), false,
        'the field map never spawns the main boss');
      assertMainBossDoorLocked(engine, 'drowned-marches');
    });
  }

  test(`${lair.label}: connection map names its boss, keeps unseen chambers hidden and shows its sealed east passage`, () => {
    const world = createInitialWorldProgress();
    world.activeDungeon = { id: lair.id, roomId: lair.sealedEdge!.roomId, returnX: 0, returnY: 0 };
    world.dungeons[lair.id] = { ...initialDungeonProgress(), discoveredRooms: [lair.sealedEdge!.roomId] };
    const markup = renderToStaticMarkup(createElement(DungeonMap, { world }));
    assert.match(markup, new RegExp(`${lair.bossName} awaits`));
    assert.match(markup, /east locked/);
    assert.doesNotMatch(markup, new RegExp(lair.rooms.find((room) => room.feature === 'chest')!.label));
  });
}

test('old opened Chapel journeys and the original Drainhouse reward never relock', () => {
  const engine = create();
  const save = engine.exportSave()!;
  save.progress.world!.chapelGateOpen = true;
  delete save.progress.world!.dungeons[MARCHES_LAIRS[0].id];
  delete save.progress.world!.dungeons[MARCHES_LAIRS[1].id];
  const resumed = new AdventureEngine();
  assert.ok(resumed.loadSave(save));
  assert.ok(resumed.getWorldProgress().chapelGateOpen);
  assert.equal(resumed.getWorldProgress().activeDungeon, null);
});
