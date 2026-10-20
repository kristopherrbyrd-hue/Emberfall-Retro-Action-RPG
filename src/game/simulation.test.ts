import assert from 'node:assert/strict'
;

import test from 'node:test'
;
import { RESTORATION_DURATION_MS } from './finale';
import { GLASSLANDS_LAIRS } from './glasslands';
import { initialDungeonProgress } from './dungeons';
import { REGIONAL_MONSTERS } from './regionalMonsters';
import { getTrainingXpForShards } from './shopEconomy';

import type 
{
 CharacterConfig, ClassId, GameSnapshot 
}
 from './data.ts'
;

import 
{
 CLASSES, WEAPON_FINDS 
}
 from './data.ts'
;

import 
{
 CLASS_DISCIPLINES,
 getRankedPowerAmount
}
 from './disciplines.ts'
;

import 
{
 AdventureEngine, ENEMY_RESPAWN_DELAY_MS, getRowanTravelStop, SAVE_KEY, SAVE_SLOT_KEYS
}
 from './simulation.ts'
;

import 
{
 inspectSavedRun, inspectSaveSlots, parseSavedRun
}
 from './session.ts'
;

import 
{
 WORLD_CELLS, worldCellAt, worldCellOrigin 
}
 from './worldMap.ts'
;

import 
{

  getColorMatrixSaturationAdjustment,
  getFirstHungerRenderCameras,
  getWorldColorProfile,
  normalizeWorldProgress,
}
 from './worldProgress.ts'
;


const createEngine = (classId: ClassId = 'warrior') => 
{

  const engine = new AdventureEngine()
;

  const config: CharacterConfig = 
{

    name: 'Test Wayfarer',
    classId,
    skin: '#d99168',
    hairStyle: 'cropped',
    hairColor: '#3a2926',
    clothingColor: '#d36345',
  
}
;

  engine.startNewGame(config)
;

  return engine
;

}
;


const moveToProp = (engine: AdventureEngine, propId: string) => 
{

  const prop = engine.getProps().find((entry) => entry.id === propId)
;

  assert.ok(prop, `Expected to find world prop ${propId}`)
;

  const player = engine.getState().player
;

  assert.ok(player, 'Expected an active player')
;

  player.x = prop.x
;

  player.y = prop.y
;

  engine.pressButton('context')
;

}
;


const travelToCell = (engine: AdventureEngine, cellId: string) => 
{

  const player = engine.getState().player
;

  assert.ok(player, 'Expected an active player')
;

  const origin = worldCellOrigin(cellId)
;

  player.x = origin.x + 320
;

  player.y = origin.y + 240
;

  engine.setDirection('right', true)
;

  engine.tick(16)
;

  engine.releaseAllDirections()
;

}
;

const createGlasslandsEngine = (cellId: string) => {
  const engine = createEngine();
  const save = engine.exportSave();
  assert.ok(save?.progress.world);
  const origin = worldCellOrigin(cellId);
  save.state.player!.x = origin.x + 320;
  save.state.player!.y = origin.y + 240;
  save.progress.world.unlockedRegions.push('glasslands');
  save.progress.world.dungeons = Object.fromEntries(
    GLASSLANDS_LAIRS.map((lair) => [lair.id, initialDungeonProgress()]),
  );
  save.state.quest = {
    title: 'The Silent Bell',
    description: 'Find the Bell of Joy.',
    step: 'Find the Bell of Joy in the Glasslands',
  };
  assert.equal(engine.loadSave(save), true);
  return engine;
};

type WorldTestEdge = 'north' | 'south' | 'east' | 'west';

const walkAcrossWorldExit = (
  engine: AdventureEngine,
  fromCellId: string,
  edge: WorldTestEdge,
  expectedCellId: string,
) => {
  const player = engine.getState().player;
  assert.ok(player, 'Expected an active player');
  const origin = worldCellOrigin(fromCellId);
  const start = {
    north: { x: origin.x + 320, y: origin.y + 24 },
    south: { x: origin.x + 320, y: origin.y + 456 },
    east: { x: origin.x + 616, y: origin.y + 240 },
    west: { x: origin.x + 24, y: origin.y + 240 },
  }[edge];
  const direction = { north: 'up', south: 'down', east: 'right', west: 'left' }[edge];
  player.x = start.x;
  player.y = start.y;
  assert.equal(worldCellAt(player.x, player.y)?.id, fromCellId);

  engine.setDirection(direction, true);
  for (let tick = 0; tick < 20 && worldCellAt(player.x, player.y)?.id === fromCellId; tick += 1) {
    engine.tick(50);
  }
  engine.releaseAllDirections();
  assert.equal(
    worldCellAt(player.x, player.y)?.id,
    expectedCellId,
    `${fromCellId} ${edge} exit should physically reach ${expectedCellId}`,
  );
};


const assertWeaponEquipped = (engine: AdventureEngine, weaponName: string) => 
{

  const state = engine.getState()
;

  assert.equal(state.player?.weapon, weaponName)
;

  const equippedWeapons = state.inventory.filter((item) => item.kind === 'weapon' && item.equipped)
;

  assert.equal(equippedWeapons.length, 1)
;

  assert.equal(equippedWeapons[0]?.name, weaponName)
;

}
;


const collectSpear = (engine: AdventureEngine) => 
{

  for (const runeId of ['rune-sun', 'rune-star', 'rune-moon']) 
{

    moveToProp(engine, runeId)
;

  
}

  moveToProp(engine, 'key-chest')
;

}
;

test('active boss name is included in the music scene', () => {
  const engine = createEngine();
  engine.getState().enemies.push({
    id: 'audio-test-boss', name: 'Cinderhorn', hp: 300, maxHp: 300, boss: true,
  });

  const audioScene = engine.getAudioScene();
  assert.equal(audioScene.boss, true);
  assert.equal(audioScene.tense, true);
  assert.equal(audioScene.bossName, 'Cinderhorn');
});

test('defeating a live overworld boss returns the music scene to its regional exploration score', () => {
  const engine = createEngine();
  const template = engine.getEnemies()[0];
  const player = engine.getState().player;
  assert.ok(template);
  assert.ok(player);

  travelToCell(engine, 'cinderwatch-approach');
  const region = engine.getAudioScene().region;
  assert.equal(region, 'ashen-peaks');
  assert.equal(engine.getAudioScene().boss, false);

  player.facing = 'right';
  engine.getEnemies().splice(0);
  const boss = {
    ...template,
    id: 'audio-test-live-boss',
    name: 'Cinderhorn',
    hp: 1,
    maxHp: 300,
    boss: true,
    x: player.x + 36,
    y: player.y,
    stunnedMs: 10_000,
    knockbackX: 0,
    knockbackY: 0,
  };
  engine.getEnemies().push(boss);
  engine.tick(0);

  const battleScene = engine.getAudioScene();
  assert.equal(battleScene.boss, true);
  assert.equal(battleScene.tense, true);
  assert.equal(battleScene.bossName, 'Cinderhorn');
  assert.equal(battleScene.region, 'ashen-peaks');

  engine.pressButton('attack');

  const explorationScene = engine.getAudioScene();
  assert.equal(explorationScene.boss, false);
  assert.equal(explorationScene.tense, false);
  assert.equal(explorationScene.bossName, undefined);
  assert.equal(explorationScene.region, region);
  assert.equal(explorationScene.dungeon, false);
  assert.equal(explorationScene.playing, true);
});

test('saved journey inspection distinguishes missing, unreadable, and usable saves', () =>
{
  assert.deepEqual(inspectSavedRun(null), { status: 'missing' });
  assert.deepEqual(inspectSavedRun('{broken json'), { status: 'unreadable' });
  assert.deepEqual(inspectSavedRun(JSON.stringify({ version: 999, state: {}, progress: {}, actors: [] })), { status: 'unreadable' });
  assert.deepEqual(inspectSavedRun(JSON.stringify({ version: 9, state: {}, progress: {}, actors: [] })), { status: 'unreadable' });
  assert.deepEqual(inspectSavedRun(JSON.stringify({ version: 8, state: {}, progress: {}, actors: [] })), { status: 'unreadable' });

  const save = createEngine().exportSave();
  assert.ok(save);
  assert.deepEqual(inspectSavedRun(JSON.stringify(save)), { status: 'available', save });
  assert.equal(parseSavedRun(null), null);
  assert.equal(
    new AdventureEngine().loadSave({ ...save, version: 999 } as typeof save),
    false,
    'the engine should reject the first unsupported save version',
  );
});

test('three save slots stay independent and slot one preserves the original save key', () => {
  assert.equal(SAVE_SLOT_KEYS.length, 3);
  assert.equal(SAVE_SLOT_KEYS[0], SAVE_KEY);
  assert.equal(new Set(SAVE_SLOT_KEYS).size, 3);

  const save = createEngine().exportSave();
  assert.ok(save);
  const storage = new Map<string, string>([
    [SAVE_SLOT_KEYS[0], JSON.stringify(save)],
    [SAVE_SLOT_KEYS[1], '{broken'],
  ]);
  const slots = inspectSaveSlots((key) => storage.get(key) ?? null);
  assert.deepEqual(slots.map(({ status }) => status), ['available', 'unreadable', 'missing']);
  assert.deepEqual(slots[0].status === 'available' ? slots[0].save : null, save);
  assert.deepEqual(
    inspectSaveSlots((key) => {
      if (key === SAVE_SLOT_KEYS[1]) throw new Error('storage blocked');
      return storage.get(key) ?? null;
    }).map(({ status }) => status),
    ['available', 'storage-unavailable', 'missing'],
  );
});

test('version 3 through 8 saves preserve player, actor, and world progress during migration', () => {
  const cell = WORLD_CELLS.find((entry) => entry.id === 'northwood');
  assert.ok(cell);

  for (const version of [3, 4, 5, 6, 7, 8] as const) {
    const save = createEngine().exportSave();
    assert.ok(save);
    save.version = version;
    save.state.player!.x = cell.x + 128;
    save.state.player!.y = cell.y + 174;
    save.state.player!.level = 5;
    save.state.player!.xp = 432;
    save.state.player!.coins = 89;
    save.state.quest = {
      title: 'The road north',
      description: 'Follow the marks.',
      step: 'Find Maelis’s trail mark',
    };

    const savedActor = save.actors.find((actor) => actor.id !== 'moss-slime-a');
    assert.ok(savedActor);
    savedActor.x = cell.x + 311;
    savedActor.y = cell.y + 221;
    savedActor.hp = Math.max(1, savedActor.hp - 1);

    save.progress.collectedIds = ['northwood-cache'];
    save.progress.defeatedIds = ['moss-slime-a'];
    save.progress.world = {
      ...save.progress.world!,
      unlockedRegions: ['hearthglen', 'drowned-marches', 'ashen-peaks'],
      silencedBells: ['hearthglen', 'drowned-marches'],
      discoveredDungeons: ['sunken-chapel'],
      completedDungeons: ['sunken-chapel'],
      destroyedObstacles: ['northwood-root-door'],
      obstacleDamage: {},
      chapelPuzzleProgress: 2,
      chapelGateOpen: true,
      marchesTide: 'high',
      marchesTideRemainingMs: 12_345,
    };

    if (version < 5) {
      delete save.progress.respawns;
    } else {
      save.progress.respawns = [
        { id: 'moss-slime-a', remainingMs: 45_000, generation: 2 },
      ];
    }

    const parsed = parseSavedRun(JSON.stringify(save));
    assert.ok(parsed, `version ${version} should be accepted by the session reader`);
    assert.equal(parsed.version, version);

    const restored = new AdventureEngine();
    assert.equal(restored.loadSave(parsed), true, `version ${version} should load`);

    const player = restored.getState().player;
    assert.ok(player);
    assert.deepEqual({ x: player.x, y: player.y }, { x: cell.x + 128, y: cell.y + 174 });
    assert.equal(player.level, 5);
    assert.equal(player.xp, 432);
    assert.equal(player.coins, 89);
    assert.equal(restored.getState().quest?.step, 'Find Maelis’s trail mark');

    const restoredActor = restored.getEnemies().find((actor) => actor.id === savedActor.id);
    assert.ok(restoredActor, `version ${version} should restore its saved world actor`);
    assert.deepEqual(
      { x: restoredActor.x, y: restoredActor.y, hp: restoredActor.hp },
      { x: cell.x + 311, y: cell.y + 221, hp: savedActor.hp },
    );

    const restoredSave = restored.exportSave();
    assert.ok(restoredSave);
    assert.deepEqual(restoredSave.progress.collectedIds, ['northwood-cache']);
    assert.deepEqual(restored.getWorldProgress().unlockedRegions, [
      'hearthglen',
      'drowned-marches',
      'ashen-peaks',
    ]);
    assert.deepEqual(restored.getWorldProgress().silencedBells, ['hearthglen', 'drowned-marches']);
    assert.deepEqual(restored.getWorldProgress().completedDungeons, ['sunken-chapel']);
    assert.deepEqual(restored.getWorldProgress().destroyedObstacles, ['northwood-root-door']);
    assert.equal(restored.getWorldProgress().chapelPuzzleProgress, 2);
    assert.equal(restored.getWorldProgress().chapelGateOpen, true);
    assert.equal(restored.getWorldProgress().marchesTide, 'high');

    const respawn = restoredSave.progress.respawns?.find((entry) => entry.id === 'moss-slime-a');
    if (version === 3) {
      assert.deepEqual(respawn, {
        id: 'moss-slime-a',
        remainingMs: ENEMY_RESPAWN_DELAY_MS,
        generation: 1,
      });
    } else if (version === 4) {
      assert.equal(respawn, undefined, 'version 4 should not synthesize the version 3 respawn fallback');
    } else {
      assert.deepEqual(respawn, {
        id: 'moss-slime-a',
        remainingMs: 45_000,
        generation: 2,
      });
    }
  }
});


test('version 1 and 2 saves remain resumable without shifting player or actor positions', () => 
{

  const currentCell = WORLD_CELLS.find((cell) => cell.label === 'High Briarwood')
;

  assert.ok(currentCell)
;


  for (const version of [1, 2] as const) 
{

    const engine = createEngine()
;

    const save = engine.exportSave()
;

    assert.ok(save)
;

    save.version = version
;

    save.state.roomId = 'woodland'
;

    save.state.location = 'High Briarwood'
;


    const savedPlayer = save.state.player
;

    const savedActor = save.actors[0]
;

    assert.ok(savedPlayer)
;

    assert.ok(savedActor)
;

    savedPlayer.x = 128
;

    savedPlayer.y = 174
;

    savedActor.x = 311
;

    savedActor.y = 221
;


    const parsed = parseSavedRun(JSON.stringify(save))
;

    assert.ok(parsed, `version ${version} should be recognized by the session reader`)
;

    assert.equal(parsed.version, version)
;


    const restored = new AdventureEngine()
;

    assert.equal(restored.loadSave(parsed), true, `version ${version} should load`)
;

    assert.deepEqual(
      
{
 x: restored.getState().player?.x, y: restored.getState().player?.y 
}
,
      
{
 x: currentCell.x + 128, y: currentCell.y + 174 
}
,
      `version ${version} player should keep its position within the migrated cell`,
    )
;

    const restoredActor = restored.getEnemies().find((actor) => actor.id === savedActor.id)
;

    assert.ok(restoredActor, `version ${version} saved world actor should be restored`)
;

    assert.deepEqual(
      
{
 x: restoredActor.x, y: restoredActor.y 
}
,
      
{
 x: currentCell.x + 311, y: currentCell.y + 221 
}
,
      `version ${version} actor should keep its position within the migrated cell`,
    )
;

  
}

}
)
;


const prepareEnemyInFront = (engine: AdventureEngine, distanceFromPlayer: number) => 
{

  const target = engine.getEnemies().find((enemy) => enemy.id === 'moss-slime-a')
;

  assert.ok(target, 'Expected a woodland enemy')
;

  const player = engine.getState().player
;

  assert.ok(player, 'Expected an active player')
;

  target.hp = 1000
;

  target.maxHp = 1000
;

  target.stunnedMs = 0
;

  target.knockbackX = 0
;

  target.knockbackY = 0
;

  player.x = target.x - distanceFromPlayer
;

  player.y = target.y
;

  player.facing = 'right'
;

  engine.setDirection('right', true)
;

  engine.releaseAllDirections()
;

  return target
;

}
;


const preparePowerTest = (
  classId: ClassId,
  power: (typeof CLASS_DISCIPLINES)[ClassId][number]['powers'][number],
) => 
{

  const engine = createEngine(classId)
;

  const target = prepareEnemyInFront(engine, 42)
;

  engine.getEnemies().splice(0, engine.getEnemies().length, target)
;

  target.hp = 1000
;

  target.maxHp = 1000
;

  target.attackMs = 100_000
;

  target.stunnedMs = 100_000
;

  target.knockbackX = 0
;

  target.knockbackY = 0
;


  const state = engine.getState()
;

  const player = state.player
;

  assert.ok(player)
;

  player.hp = player.maxHp - 80
;

  player.resource = Math.min(player.maxResource, power.cost + 12)
;

  state.trainedPowers[power.id] = 1
;

  engine.equipAbility(0, power.id)
;

  assert.equal(state.abilities[0]?.id, power.id, `${classId} ${power.name} should be bindable`)
;


  return { engine, player, target, slot: state.abilities[0]! };

}
;


const pointEnemyAhead = (
  engine: AdventureEngine,
  target: ReturnType<typeof prepareEnemyInFront>,
  distance: number,
) => 
{

  const player = engine.getState().player
;

  assert.ok(player)
;

  player.x = target.x - distance
;

  player.y = target.y
;

  player.facing = 'right'
;

  target.attackMs = 100_000
;

  target.stunnedMs = 100_000
;

  target.knockbackX = 0
;

  target.knockbackY = 0
;

  engine.setDirection('right', true)
;

  engine.releaseAllDirections()
;

}
;


test('every class has four six-power disciplines', () => 
{

  for (const classId of Object.keys(CLASSES) as ClassId[]) 
{

    const disciplines = CLASS_DISCIPLINES[classId]
;

    assert.equal(disciplines.length, 4, `${classId} discipline count`)
;

    for (const discipline of disciplines) 
{

      assert.equal(discipline.powers.length, 6, `${classId} ${discipline.name} power count`)
;

      assert.deepEqual(
        discipline.powers.map((power) => power.tier),
        [1, 2, 3, 4, 5, 6],
        `${classId} ${discipline.name} tier order`,
      )
;

    
}

  
}

}
)
;


test('leveling grants training points without increasing health or resource', () => 
{

  const engine = createEngine()
;

  const player = engine.getState().player
;

  assert.ok(player)
;

  const enemy = prepareEnemyInFront(engine, 42)
;

  const initialMaxHp = player.maxHp
;

  const initialMaxResource = player.maxResource
;

  player.xp = 69
;

  enemy.hp = 1
;

  enemy.maxHp = 1
;


  engine.pressButton('attack')
;


  assert.equal(player.level, 2)
;

  assert.equal(player.trainingPoints, 1)
;
  assert.match(engine.getState().hint, /Hero tree is unlocked/)
;

  assert.equal(player.maxHp, initialMaxHp)
;

  assert.equal(player.maxResource, initialMaxResource)
;

  engine.trainPower('shield-bash')
;

  assert.equal(player.trainingPoints, 0)
;

  assert.equal(engine.getState().trainedPowers['shield-bash'], 2)
;

  assert.equal(engine.getState().abilities[0]?.rank, 2)
;

}
)
;


test('new discipline powers activate and rank-ups increase their damage', () => 
{

  const engine = createEngine()
;

  const player = engine.getState().player
;

  assert.ok(player)
;

  player.trainingPoints = 3
;

  engine.trainPower('whirlwind')
;

  engine.trainPower('cleaving-arc')
;

  engine.equipAbility(1, 'cleaving-arc')
;

  const target = prepareEnemyInFront(engine, 42)
;


  engine.pressButton('ability1')
;

  assert.equal(target.hp, 964, 'the newly unlocked cut should deal its defined base damage')
;


  player.trainingPoints = 1
;

  engine.trainPower('cleaving-arc')
;

  assert.equal(engine.getState().abilities[1]?.rank, 2)
;

  target.hp = 1000
;

  const boundPower = engine.getState().abilities[1]
;

  assert.ok(boundPower)
;

  boundPower.remainingMs = 0
;

  engine.pressButton('ability1')
;

  assert.equal(target.hp, 955, 'rank two should increase the power damage by 25%')
;

}
)
;


test('every class power applies its expected combat or support effect', () => 
{

  for (const classId of Object.keys(CLASSES) as ClassId[]) 
{

    for (const discipline of CLASS_DISCIPLINES[classId]) 
{

      for (const power of discipline.powers) 
{

        const 
{
 engine, player, target, slot 
}
 = preparePowerTest(classId, power)
;

        const hpBefore = player.hp
;

        const resourceBefore = player.resource
;

        const targetHpBefore = target.hp
;

        const damage = getRankedPowerAmount(power, slot.rank, player.level, classId)
;

        const expectedResourceGain = power.id === 'inner-focus'
          ? 38
          : power.effect === 'restore'
            ? damage
            : ['heal', 'guard', 'empower'].includes(power.effect)
              ? power.resourceRestore ?? 0
              : 0
;


        if (power.effect === 'dash') 
{

          if (power.baseDamage === 0) 
{

            target.x = player.x + (power.movement ?? 105) + 50
;

          
}
 else 
{

            target.x = player.x + (power.movement ?? 195)
;

            target.y = player.y + 35
;

          
}

        
}
 else if (power.effect === 'projectile') 
{

          pointEnemyAhead(engine, target, 130)
;

        
}
 else if (power.effect === 'dash-strike') 
{

          pointEnemyAhead(engine, target, 140)
;

        
}
 else if (power.effect === 'empower' && power.movement) 
{

          pointEnemyAhead(engine, target, 150)
;

        
}
 else if (power.effect === 'shadow') 
{

          player.x = target.x + 42
;

          player.y = target.y
;

          player.facing = 'right'
;

          engine.setDirection('right', true)
;

          engine.releaseAllDirections()
;

        
}


        const playerStart = 
{
 x: player.x, y: player.y 
}
;

        const beforeCastTargetHp = target.hp
;

        const beforeCastX = player.x
;

        const beforeCastY = player.y
;

        engine.pressButton('ability0')
;

        assert.equal(slot.remainingMs, slot.cooldownMs, `${classId} ${power.name} should enter cooldown`)
;

        assert.equal(
          player.resource,
          Math.min(player.maxResource, resourceBefore - (power.id === 'inner-focus' ? 0 : slot.cost) + expectedResourceGain),
          `${classId} ${power.name} should charge and restore the defined resource`,
        )
;


        switch (power.effect) 
{

          case 'front':
          case 'area':
          case 'dash-strike':
            assert.ok(target.hp < beforeCastTargetHp, `${classId} ${power.name} should damage its target`)
;

            if (power.stunMs) 
{

              assert.ok(target.stunnedMs >= power.stunMs, `${classId} ${power.name} should apply its defined stun`)
;

            
}

            break
;

          case 'projectile': 
{

            const projectile = engine.getProjectiles()[0]
;

            assert.ok(projectile, `${classId} ${power.name} should launch a projectile`)
;

            assert.equal(projectile.damage, damage, `${classId} ${power.name} projectile should scale with rank`)
;

            for (let elapsed = 0
;
 elapsed < 1500 && engine.getProjectiles().length > 0
;
 elapsed += 50) 
{

              engine.tick(50)
;

            
}

            assert.ok(target.hp < beforeCastTargetHp, `${classId} ${power.name} projectile should hit an enemy`)
;

            if (power.slowMs) 
{

              assert.ok(target.slowedMs >= power.slowMs, `${classId} ${power.name} should slow on impact`)
;

            
}

            break
;

          
}

          case 'heal':
            assert.equal(
              player.hp - hpBefore,
              Math.min(player.maxHp - hpBefore, damage),
              `${classId} ${power.name} should restore its rank-scaled health`,
            )
;

            if (power.guardStyle === 'ward') 
{

              target.x = player.x + target.radius + 10
;

              target.y = player.y
;

              target.attackMs = 0
;

              target.stunnedMs = 0
;

              target.knockbackX = 0
;

              target.knockbackY = 0
;

              engine.tick(50)
;

              assert.equal(
                player.hp,
                hpBefore + Math.min(player.maxHp - hpBefore, damage),
                `${classId} ${power.name} should ward its next hit`,
              )
;

            
}

            break
;

          case 'guard': 
{

            target.x = player.x + target.radius + 10
;

            target.y = player.y
;

            target.attackMs = 0
;

            target.stunnedMs = 0
;

            target.knockbackX = 0
;

            target.knockbackY = 0
;

            engine.tick(50)
;

            if (power.guardStyle === 'ward') 
{

              assert.equal(player.hp, hpBefore, `${classId} ${power.name} should absorb the next hit`)
;

            
}
 else 
{

              assert.ok(player.hp < hpBefore, `${classId} ${power.name} should allow a reduced hit`)
;

              assert.ok(player.hp > hpBefore - target.damage, `${classId} ${power.name} should reduce incoming damage`)
;

            
}

            break
;

          
}

          case 'empower': 
{

            if (power.movement) 
{

              assert.ok(player.x !== beforeCastX || player.y !== beforeCastY,
                `${classId} ${power.name} should apply its movement`)
;

            
}

            pointEnemyAhead(engine, target, 42)
;

            const targetHp = target.hp
;

            engine.pressButton('attack')
;

            if (classId === 'mage') 
{

              assert.equal(engine.getProjectiles()[0]?.damage, CLASSES[classId].attackDamage + 10,
                `${classId} ${power.name} should empower the next spell`)
;

            
}
 else 
{

              assert.ok(target.hp <= targetHp - CLASSES[classId].attackDamage - 10,
                `${classId} ${power.name} should empower the next weapon strike`)
;

            
}

            break
;

          
}

          case 'dash':
            assert.ok(player.x !== playerStart.x || player.y !== playerStart.y,
              `${classId} ${power.name} should move the player`)
;

            if (power.baseDamage > 0) 
{

              assert.ok(target.hp < beforeCastTargetHp, `${classId} ${power.name} should deliver its force burst`)
;

            
}

            break
;

          case 'control':
            assert.ok(target.stunnedMs > 0, `${classId} ${power.name} should interrupt nearby enemies`)
;

            if (damage > 0) 
{

              assert.ok(target.hp < beforeCastTargetHp, `${classId} ${power.name} should deal its defined damage`)
;

            
}

            break
;

          case 'slow':
            assert.ok(target.slowedMs >= (power.slowMs ?? 0), `${classId} ${power.name} should slow nearby enemies`)
;

            assert.ok(target.hp < beforeCastTargetHp, `${classId} ${power.name} should damage its target`)
;

            break
;

          case 'poison': 
{

            if (power.id !== 'poison-blade') 
{

              assert.ok(target.hp < beforeCastTargetHp, `${classId} ${power.name} should poison-strike its target`)
;

            
}

            pointEnemyAhead(engine, target, 42)
;

            const targetHp = target.hp
;

            engine.pressButton('attack')
;

            assert.ok(target.hp <= targetHp - CLASSES[classId].attackDamage - damage,
              `${classId} ${power.name} should add poison damage to the next weapon hit`)
;

            break
;

          
}

          case 'restore':
            assert.ok(player.resource > resourceBefore - slot.cost,
              `${classId} ${power.name} should restore fighting spirit`)
;

            break
;

          case 'shadow': 
{

            assert.ok(player.x !== beforeCastX || player.y !== beforeCastY,
              `${classId} ${power.name} should reposition the player`)
;

            if (damage > 0) 
{

              assert.ok(target.hp < beforeCastTargetHp, `${classId} ${power.name} should strike its target`)
;

            
}

            target.x = player.x + target.radius + 10
;

            target.y = player.y
;

            target.attackMs = 0
;

            target.stunnedMs = 0
;

            target.knockbackX = 0
;

            target.knockbackY = 0
;

            engine.tick(50)
;

            assert.equal(player.hp, hpBefore, `${classId} ${power.name} should evade the next hit`)
;

            break
;

          
}

        
}

      
}

    
}

  
}

}
)
;


test('rank-three starting powers deal rank-scaled damage for every class', () => 
{

  for (const classId of Object.keys(CLASSES) as ClassId[]) 
{

    const engine = createEngine(classId)
;

    const player = engine.getState().player
;

    assert.ok(player)
;

    const power = CLASS_DISCIPLINES[classId][0]!.powers[0]!
;

    player.trainingPoints = 2
;

    engine.trainPower(power.id)
;

    engine.trainPower(power.id)
;

    assert.equal(engine.getState().abilities[0]?.rank, 3, `${classId} should bind its rank-three power`)
;


    const target = prepareEnemyInFront(engine, 42)
;

    engine.getEnemies().splice(0, engine.getEnemies().length, target)
;

    target.hp = 1000
;

    target.maxHp = 1000
;

    target.stunnedMs = 100_000
;

    target.attackMs = 100_000
;

    const expectedDamage = getRankedPowerAmount(power, 3, player.level, classId)
;

    engine.pressButton('ability0')
;

    if (power.effect === 'projectile') 
{

      for (let elapsed = 0
;
 elapsed < 1000 && engine.getProjectiles().length > 0
;
 elapsed += 50) 
{

        engine.tick(50)
;

      
}

    
}

    assert.equal(target.hp, 1000 - expectedDamage,
      `${classId} ${power.name} should deal 150% damage at rank three`)
;

  
}

}
)
;


test('rank preview damage and healing use the same increase as combat', () => {
  const powers = CLASS_DISCIPLINES.warrior.flatMap((discipline) => discipline.powers);
  const damagingPower = powers.find((power) => power.baseDamage > 0 && power.effect !== 'heal');
  const healingPower = powers.find((power) => power.effect === 'heal');
  assert.ok(damagingPower && healingPower);
  assert.equal(getRankedPowerAmount(damagingPower, 1), damagingPower.baseDamage);
  assert.equal(getRankedPowerAmount(damagingPower, 2), Math.round(damagingPower.baseDamage * 1.25));
  assert.equal(getRankedPowerAmount(healingPower, 1), healingPower.baseDamage);
  assert.equal(getRankedPowerAmount(healingPower, 2), Math.round(healingPower.baseDamage * 1.25));
});

test('trained power damage and healing scale with player level for every class', () => {
  const mageSpell = CLASS_DISCIPLINES.mage[0]!.powers[0]!;
  const levelOneMageDamage = getRankedPowerAmount(mageSpell, 1, 1, 'mage');

  assert.ok(levelOneMageDamage > mageSpell.baseDamage);
  assert.ok(getRankedPowerAmount(mageSpell, 1, 20, 'mage') > levelOneMageDamage);

  for (const classId of Object.keys(CLASSES) as ClassId[]) {
    const powers = CLASS_DISCIPLINES[classId].flatMap((discipline) => discipline.powers);
    const damagingPower = powers.find((power) => power.baseDamage > 0 && power.effect !== 'heal');
    assert.ok(damagingPower, `${classId} should have a damaging power`);
    const levelOneAmount = getRankedPowerAmount(damagingPower, 3, 1, classId);
    const realmFiveAmount = getRankedPowerAmount(damagingPower, 3, 25, classId);
    const endgameAmount = getRankedPowerAmount(damagingPower, 3, 60, classId);
    assert.ok(realmFiveAmount > levelOneAmount, `${classId} rank-three power should grow by realm five`);
    assert.ok(endgameAmount > realmFiveAmount, `${classId} rank-three power should keep growing into endgame`);
  }

  const warriorHeal = CLASS_DISCIPLINES.warrior.flatMap((discipline) => discipline.powers)
    .find((power) => power.effect === 'heal');
  assert.ok(warriorHeal);
  assert.ok(getRankedPowerAmount(warriorHeal, 3, 25, 'warrior') >
    getRankedPowerAmount(warriorHeal, 3, 1, 'warrior'),
  'rank-three healing should also grow with level');
});

test('rank-three powers use the higher level-scaled amount in actual combat', () => {
  for (const classId of Object.keys(CLASSES) as ClassId[]) {
    const engine = createEngine(classId);
    const player = engine.getState().player;
    assert.ok(player);
    const power = CLASS_DISCIPLINES[classId][0]!.powers[0]!;
    assert.ok(power.baseDamage > 0);

    player.trainingPoints = 2;
    engine.trainPower(power.id);
    engine.trainPower(power.id);
    player.level = 30;

    const target = prepareEnemyInFront(engine, 42);
    engine.getEnemies().splice(0, engine.getEnemies().length, target);
    target.hp = 5000;
    target.maxHp = 5000;
    target.stunnedMs = 100_000;
    target.attackMs = 100_000;

    const expectedDamage = getRankedPowerAmount(power, 3, player.level, classId);
    engine.pressButton('ability0');
    if (power.effect === 'projectile') {
      for (let elapsed = 0; elapsed < 1000 && engine.getProjectiles().length > 0; elapsed += 50) {
        engine.tick(50);
      }
    }
    assert.equal(target.hp, 5000 - expectedDamage,
      `${classId} fully trained power should use its level-scaled damage in combat`);
  }
});

test('every class can unlock, bind, rank up, and reload its own powers', () =>
{

  for (const classId of Object.keys(CLASSES) as ClassId[]) 
{

    const engine = createEngine(classId)
;

    const player = engine.getState().player
;

    assert.ok(player)
;

    const disciplines = CLASS_DISCIPLINES[classId]
;

    const startingPowers = disciplines.map((tree) => tree.powers[0])
;

    assert.deepEqual(
      engine.getState().abilities.map((slot) => slot?.id),
      startingPowers.map((power) => power.id),
      `${classId} should begin with one power from each discipline`,
    )
;

    assert.equal(engine.getState().abilities.length, 4, `${classId} should have four binding slots`)
;


    const firstTree = disciplines[0]!
;

    const firstPower = firstTree.powers[0]!
;

    const nextPower = firstTree.powers[1]!
;

    const lockedPower = firstTree.powers[2]!
;

    player.trainingPoints = 10
;

    engine.trainPower(nextPower.id)
;

    assert.equal(engine.getState().trainedPowers[nextPower.id], undefined,
      `${classId} should not unlock a tier without investing in its discipline`)
;

    assert.equal(player.trainingPoints, 10, `${classId} should not charge points for a locked power`)
;

    engine.equipAbility(0, nextPower.id)
;

    assert.equal(engine.getState().abilities[0]?.id, firstPower.id,
      `${classId} should not bind a locked power`)
;


    engine.trainPower(firstPower.id)
;

    engine.trainPower(nextPower.id)
;

    engine.trainPower(nextPower.id)
;

    assert.equal(engine.getState().trainedPowers[nextPower.id], 2,
      `${classId} should rank up an unlocked power`)
;

    engine.equipAbility(3, nextPower.id)
;

    assert.equal(engine.getState().abilities[3]?.id, nextPower.id,
      `${classId} should bind an unlocked power into the fourth slot`)
;

    assert.equal(engine.getState().abilities[3]?.icon, nextPower.icon,
      `${classId} should expose the newly bound power's icon to its button`)
;

    engine.equipAbility(0, nextPower.id)
;

    assert.equal(engine.getState().abilities[0]?.id, nextPower.id,
      `${classId} should rebind a power into another slot`)
;

    assert.equal(engine.getState().abilities[0]?.icon, nextPower.icon,
      `${classId} should update the moved power's button icon`)
;

    assert.equal(engine.getState().abilities[3]?.id, firstPower.id,
      `${classId} should move the displaced ability without creating a duplicate`)
;

    engine.equipAbility(4, firstPower.id)
;

    assert.equal(engine.getState().abilities.length, 4, `${classId} should reject a fifth slot`)
;

    engine.equipAbility(2, lockedPower.id)
;

    assert.notEqual(engine.getState().abilities[2]?.id, lockedPower.id,
      `${classId} should not bind a later tier before its prerequisites`)
;


    player.trainingPoints = 1
;

    engine.trainPower(nextPower.id)
;

    assert.equal(engine.getState().trainedPowers[nextPower.id], 3,
      `${classId} should allow a power to reach rank three`)
;

    assert.equal(engine.getState().abilities.find((slot) => slot?.id === nextPower.id)?.rank, 3,
      `${classId} should update the bound rank`)
;

    engine.trainPower(nextPower.id)
;

    assert.equal(player.trainingPoints, 0, `${classId} should not spend a point beyond maximum rank`)
;


    const boundSlot = engine.getState().abilities.find((slot) => slot?.id === nextPower.id)
;

    assert.ok(boundSlot)
;

    boundSlot.remainingMs = 2345
;

    const save = engine.exportSave()
;

    assert.ok(save)
;

    const restored = new AdventureEngine()
;

    assert.equal(restored.loadSave(save), true, `${classId} should load its saved journey`)
;

    assert.equal(restored.getState().player?.classId, classId)
;

    assert.equal(restored.getState().trainedPowers[nextPower.id], 3,
      `${classId} should preserve the power rank`)
;

    assert.deepEqual(
      restored.getState().abilities.map((slot) => slot?.id),
      engine.getState().abilities.map((slot) => slot?.id),
      `${classId} should preserve its four bindings`,
    )
;

    assert.equal(
      restored.getState().abilities.find((slot) => slot?.id === nextPower.id)?.rank,
      3,
      `${classId} should restore the bound rank`,
    )
;

    assert.equal(
      restored.getState().abilities.find((slot) => slot?.id === nextPower.id)?.remainingMs,
      2345,
      `${classId} should preserve the power cooldown`,
    )
;

  
}

}
)
;


test('regular monsters return after 90 seconds with stronger saved generations', () => 
{

  const engine = createEngine()
;

  const player = engine.getState().player
;

  const original = engine.getEnemies().find((enemy) => enemy.id === 'canopy:canopy-slime-a')
;

  assert.ok(player)
;

  assert.ok(original)
;

  const baseMaxHp = original.maxHp
;

  const baseDamage = original.damage
;

  player.x = original.x - 42
;

  player.y = original.y
;

  player.facing = 'right'
;

  engine.setDirection('right', true)
;

  original.hp = 1
;

  original.maxHp = 1
;

  engine.pressButton('attack')
;

  assert.equal(engine.getEnemies().some((enemy) => enemy.id === original.id), false)
;


  player.x = 320
;

  player.y = 1784
;

  const save = engine.exportSave()
;

  assert.ok(save)
;

  assert.deepEqual(save.progress.respawns?.find((respawn) => respawn.id === original.id), 
{

    id: original.id,
    remainingMs: ENEMY_RESPAWN_DELAY_MS,
    generation: 1,
  
}
)
;

  const restored = new AdventureEngine()
;

  assert.equal(restored.loadSave(save), true)
;

  for (let tick = 0
;
  tick < 1799
;
 tick += 1) restored.tick(50)
;

  assert.equal(restored.getEnemies().some((enemy) => enemy.id === original.id), false)
;

  restored.tick(50)
;


  const respawned = restored.getEnemies().find((enemy) => enemy.id === original.id)
;

  assert.ok(respawned)
;

  assert.equal(respawned.generation, 1)
;

  assert.equal(respawned.maxHp, Math.ceil(baseMaxHp * 1.05))
;

  assert.equal(respawned.damage, Math.ceil(baseDamage * 1.05))
;

}
)
;


test('exploration chests grant and equip a weapon at each journey milestone', () => 
{

  const engine = createEngine()
;


  moveToProp(engine, 'village-chest')
;

  assertWeaponEquipped(engine, 'Hearthguard mace')
;

  assert.equal(engine.getState().inventory.find((item) => item.id === 'hearthguard-mace')?.bonusAttack, 4)
;


  moveToProp(engine, 'forest-chest')
;

  assertWeaponEquipped(engine, 'Briar-edge')
;

  assert.equal(engine.getState().inventory.find((item) => item.id === 'briar-edge')?.bonusAttack, 6)
;


  for (const runeId of ['rune-sun', 'rune-star', 'rune-moon']) 
{

    moveToProp(engine, runeId)
;

  
}

  moveToProp(engine, 'key-chest')
;

  assertWeaponEquipped(engine, 'Starfall spear')
;

  assert.ok(engine.getState().inventory.some((item) => item.id === 'brass-key'))
;


  engine.getState().bossDefeated = true
;

  moveToProp(engine, 'sanctum-coffer')
;

  assertWeaponEquipped(engine, 'Cinderwake staff')
;

  assert.ok(engine.getState().inventory.some((item) => item.id === 'cinderheart'))
;


  const save = engine.exportSave()
;

  assert.ok(save)
;

  assert.equal(save.state.player?.weapon, 'Cinderwake staff')
;

  assert.equal(save.state.inventory.find((item) => item.id === 'cinderwake-staff')?.equipped, true)
;

}
)
;

test('the Oldroot tree secret sits off trail, takes attacks without Briar-edge, and saves its damage', () => {
  const engine = createEngine();
  const door = engine.getProps().find((entry) => entry.id === 'northwood-root-door');
  assert.ok(door, 'Expected the optional tree seal in High Briarwood');
  const player = engine.getState().player;
  assert.ok(player);

  player.x = door.x;
  player.y = door.y - 52;
  player.weapon = 'Unarmed';
  engine.setDirection('down', true);
  assert.equal(engine.requestGuide(), true);
  assert.match(engine.getState().guideMessage, /at most 5 strikes/i);
  engine.pressButton('context');
  assert.match(engine.getState().hint, /0\/5 hits/i);
  assert.equal(engine.getProps().find((entry) => entry.id === 'northwood-root-cache')?.visible, false);
  assert.ok(!engine.getWorldProgress().destroyedObstacles.includes('northwood-root-door'));
  engine.pressButton('attack');
  const partialDamage = engine.getProps().find((entry) => entry.id === 'northwood-root-door')?.damageTaken ?? 0;
  assert.ok(partialDamage > 0 && partialDamage < (door.damageRequired ?? Infinity));
  assert.equal(engine.getProps().find((entry) => entry.id === door.id)?.hitsTaken, 1);

  const partialSave = engine.exportSave();
  assert.ok(partialSave);
  const resumed = new AdventureEngine();
  assert.equal(resumed.loadSave(partialSave), true);
  assert.equal(resumed.getProps().find((entry) => entry.id === 'northwood-root-door')?.damageTaken, partialDamage);
  assert.equal(resumed.getProps().find((entry) => entry.id === door.id)?.hitsTaken, 1);
  const resumedPlayer = resumed.getState().player;
  assert.ok(resumedPlayer);
  for (let hit = 0; hit < 4 && !resumed.getProps().find((entry) => entry.id === 'northwood-root-door')?.activated; hit += 1) {
    resumed.pressButton('attack');
  }
  assert.ok(resumed.getWorldProgress().destroyedObstacles.includes('northwood-root-door'));
  assert.equal(resumed.getProps().find((entry) => entry.id === 'northwood-root-cache')?.visible, true);
  const coinsBeforeCache = resumedPlayer.coins;
  moveToProp(resumed, 'northwood-root-cache');
  assert.equal(resumedPlayer.coins, coinsBeforeCache + 45);
  assert.ok(resumed.getState().inventory.some((item) => item.id === 'oldroot-token'));

  const foundCacheSave = resumed.exportSave();
  assert.ok(foundCacheSave);
  const finalResume = new AdventureEngine();
  assert.equal(finalResume.loadSave(foundCacheSave), true);
  assert.equal(finalResume.getProps().find((entry) => entry.id === 'northwood-root-cache')?.activated, true);
  assert.ok(finalResume.getState().inventory.some((item) => item.id === 'oldroot-token'));
  const finalCoins = finalResume.getState().player?.coins;
  moveToProp(finalResume, 'northwood-root-cache');
  assert.equal(finalResume.getState().player?.coins, finalCoins, 'the saved cache must not pay out twice');

  const hearthglenSave = finalResume.exportSave();
  assert.ok(hearthglenSave?.state.player);
  hearthglenSave.state.quest = {
    title: 'The bells below',
    description: 'Return Cinderheart to Elder Rowan.',
    step: 'Return to Hearthglen',
  };
  const hearthglenOrigin = worldCellOrigin('village');
  hearthglenSave.state.player.x = hearthglenOrigin.x + 320;
  hearthglenSave.state.player.y = hearthglenOrigin.y + 244;
  const returningToRowan = new AdventureEngine();
  assert.equal(returningToRowan.loadSave(hearthglenSave), true);
  moveToProp(returningToRowan, 'rowan');
  const returnDialog = returningToRowan.getState().dialog ?? '';
  assert.match(returnDialog, /Bell of Wonder rings once—and falls silent/);
  assert.match(returnDialog, /Rowan recognizes the seed-heart token/);
  assert.equal(returningToRowan.getState().quest.step, 'Travel to the Mournwater Crossing');

  const villageSave = returningToRowan.exportSave();
  assert.ok(villageSave);
  const resumedVisit = new AdventureEngine();
  assert.equal(resumedVisit.loadSave(villageSave), true);
  assert.ok(resumedVisit.getState().inventory.some((item) => item.id === 'oldroot-token'));
  moveToProp(resumedVisit, 'rowan');
  const resumedDialog = resumedVisit.getState().dialog ?? '';
  assert.match(resumedDialog, /first bell has fallen silent/);
  assert.match(resumedDialog, /Rowan recognizes the seed-heart token/);
  assert.equal(resumedVisit.getState().quest.step, 'Travel to the Mournwater Crossing');
});

test('the Riverbank thorn seal opens after five strikes with any weapon and preserves progress and rewards', () => {
  const engine = createEngine();

  const seal = engine.getProps().find((entry) => entry.id === 'riverbank-briar-seal');
  const carving = engine.getProps().find((entry) => entry.id === 'riverbank-briar-inscription');
  const cache = engine.getProps().find((entry) => entry.id === 'riverbank-briar-cache');
  assert.ok(seal && carving && cache);
  assert.equal(worldCellAt(seal.x, seal.y)?.id, 'riverbank');
  assert.equal(worldCellAt(seal.x, seal.y)?.contentReady, true);
  assert.equal(cache.visible, false);

  moveToProp(engine, 'riverbank-briar-inscription');
  assert.match(engine.getState().dialog ?? '', /Five strikes/i);
  assert.match(engine.getState().hint, /any weapon/i);
  engine.dismissDialog();

  const player = engine.getState().player;
  assert.ok(player);
  player.x = seal.x;
  player.y = seal.y - 48;
  assert.equal(seal.hitsRequired, 5);
  assert.equal(seal.requiredWeaponId, undefined);
  engine.setDirection('down', true);
  engine.releaseAllDirections();
  engine.pressButton('attack');
  assert.equal(engine.getProps().find((entry) => entry.id === 'riverbank-briar-seal')?.hitsTaken, 1);
  assert.match(engine.getState().hint, /1\/5 hits/i);
  engine.pressButton('attack');
  assert.equal(engine.getProps().find((entry) => entry.id === 'riverbank-briar-seal')?.hitsTaken, 2);

  const partialSave = engine.exportSave();
  assert.ok(partialSave);
  const resumed = new AdventureEngine();
  assert.equal(resumed.loadSave(partialSave), true);
  assert.equal(resumed.getProps().find((entry) => entry.id === 'riverbank-briar-seal')?.hitsTaken, 2);
  for (let hit = 3; hit <= 5; hit += 1) {
    resumed.pressButton('attack');
    const currentSeal = resumed.getProps().find((entry) => entry.id === 'riverbank-briar-seal');
    assert.equal(currentSeal?.hitsTaken, hit);
    assert.equal(currentSeal?.activated, hit === 5);
  }
  assert.ok(resumed.getWorldProgress().destroyedObstacles.includes('riverbank-briar-seal'));
  assert.equal(resumed.getProps().find((entry) => entry.id === 'riverbank-briar-cache')?.visible, true);

  const rewardPlayer = resumed.getState().player;
  assert.ok(rewardPlayer);
  const coinsBeforeCache = rewardPlayer.coins;
  moveToProp(resumed, 'riverbank-briar-cache');
  assert.equal(rewardPlayer.coins, coinsBeforeCache + 55);
  assert.ok(resumed.getState().inventory.some((item) => item.id === 'riverheart-charm'));

  const claimedSave = resumed.exportSave();
  assert.ok(claimedSave);
  const finalResume = new AdventureEngine();
  assert.equal(finalResume.loadSave(claimedSave), true);
  assert.ok(finalResume.getWorldProgress().destroyedObstacles.includes('riverbank-briar-seal'));
  assert.equal(finalResume.getProps().find((entry) => entry.id === 'riverbank-briar-seal')?.activated, true);
  assert.equal(finalResume.getProps().find((entry) => entry.id === 'riverbank-briar-cache')?.activated, true);
  const savedCoins = finalResume.getState().player?.coins;
  moveToProp(finalResume, 'riverbank-briar-cache');
  assert.equal(finalResume.getState().player?.coins, savedCoins, 'the saved cache must not pay out twice');

  const coinsBeforeRowan = finalResume.getState().player?.coins;
  moveToProp(finalResume, 'rowan');
  assert.match(finalResume.getState().dialog ?? '', /Rowan recognizes the Riverheart charm/);
  assert.equal(finalResume.getState().player?.coins, coinsBeforeRowan);
  assert.equal(finalResume.getState().inventory.filter((item) => item.id === 'riverheart-charm').length, 1);

  moveToProp(finalResume, 'rowan');
  assert.match(finalResume.getState().dialog ?? '', /Rowan recognizes the Riverheart charm/);
  assert.equal(finalResume.getState().player?.coins, coinsBeforeRowan);
  assert.equal(finalResume.getState().inventory.filter((item) => item.id === 'riverheart-charm').length, 1);

  const rowanVisitSave = finalResume.exportSave();
  assert.ok(rowanVisitSave);
  const resumedRowanVisit = new AdventureEngine();
  assert.equal(resumedRowanVisit.loadSave(rowanVisitSave), true);
  moveToProp(resumedRowanVisit, 'rowan');
  assert.match(resumedRowanVisit.getState().dialog ?? '', /Rowan recognizes the Riverheart charm/);
  assert.equal(resumedRowanVisit.getState().player?.coins, coinsBeforeRowan);
  assert.equal(resumedRowanVisit.getState().inventory.filter((item) => item.id === 'riverheart-charm').length, 1);
});

test('every class can break the thornbound seal with exactly five starter-weapon strikes', () => {
  for (const classId of ['warrior', 'rogue', 'adept', 'mage'] as const) {
    const engine = createEngine(classId);
    const seal = engine.getProps().find((entry) => entry.id === 'riverbank-briar-seal');
    const player = engine.getState().player;
    assert.ok(seal && player);
    player.x = seal.x;
    player.y = seal.y - 48;
    engine.setDirection('down', true);
    engine.releaseAllDirections();
    assert.match(engine.getContextHint(), /0\/5 hits/);
    for (let hit = 1; hit <= 5; hit += 1) {
      engine.pressButton('attack');
      assert.equal(engine.getProps().find((entry) => entry.id === seal.id)?.hitsTaken, hit, classId);
      assert.equal(engine.getProps().find((entry) => entry.id === seal.id)?.activated, hit === 5, classId);
      assert.match(engine.getContextHint(), hit < 5 ? new RegExp(`${hit}/5 hits`) : /is open/);
    }
  }
});

test('all breakable vegetation opens within five hits even when its damage target is very high', () => {
  for (const classId of ['warrior', 'rogue', 'adept', 'mage'] as const) {
    for (const id of ['northwood-root-door', 'riverbank-briar-seal']) {
      const engine = createEngine(classId);
      const getProps = engine.getProps.bind(engine);
      // Model a later-region tree whose damage requirement exceeds starter gear.
      engine.getProps = () => getProps().map((prop) =>
        prop.kind === 'treeGate' ? { ...prop, damageRequired: 10000 } : prop);
      const gate = engine.getProps().find((prop) => prop.id === id);
      const player = engine.getState().player;
      assert.ok(gate && player);
      assert.equal(gate.hitsRequired, 5);
      player.x = gate.x;
      player.y = gate.y - 48;
      engine.setDirection('down', true);
      engine.releaseAllDirections();
      for (let hit = 1; hit <= 5; hit += 1) {
        engine.pressButton('attack');
        const current = engine.getProps().find((prop) => prop.id === id);
        assert.equal(current?.activated, hit === 5, `${classId}: ${id}, strike ${hit}`);
        assert.equal(current?.hitsTaken, hit);
      }
      assert.ok(engine.getWorldProgress().destroyedObstacles.includes(id));
    }
  }
});

test('old thornbound-seal damage migrates into partial hit progress without losing other obstacle damage', () => {
  const progress = normalizeWorldProgress({
    obstacleDamage: { 'riverbank-briar-seal': 22, 'northwood-root-door': 18 },
  });
  assert.equal(progress.obstacleHits['riverbank-briar-seal'], 2);
  assert.equal(progress.obstacleDamage['northwood-root-door'], 18);
  assert.equal(progress.obstacleHits['northwood-root-door'], 2);
  assert.equal(progress.destroyedObstacles.includes('riverbank-briar-seal'), false);
  const reloaded = normalizeWorldProgress({ ...progress, obstacleHits: { 'riverbank-briar-seal': 3 } });
  assert.equal(reloaded.obstacleHits['riverbank-briar-seal'], 3);
});

test('Rowan keeps both optional relic acknowledgments across visits and save/load', () => {
  const source = createEngine();
  const save = source.exportSave();
  assert.ok(save);
  save.state.inventory.push(
    {
      id: 'oldroot-token',
      name: 'Oldroot token',
      kind: 'relic',
      description: 'A seed-heart token from Oldroot’s grove.',
      equipped: false,
    },
    {
      id: 'riverheart-charm',
      name: 'Riverheart charm',
      kind: 'relic',
      description: 'A living charm from the riverbank clearing.',
      equipped: false,
    },
  );

  const engine = new AdventureEngine();
  assert.equal(engine.loadSave(save), true);

  const assertBothAcknowledgments = () => {
    const dialogue = engine.getState().dialog ?? '';
    assert.match(dialogue, /Rowan recognizes the seed-heart token/);
    assert.match(dialogue, /Rowan recognizes the Riverheart charm/);
  };

  moveToProp(engine, 'rowan');
  assertBothAcknowledgments();

  moveToProp(engine, 'rowan');
  assertBothAcknowledgments();

  const visitSave = engine.exportSave();
  assert.ok(visitSave);
  const resumed = new AdventureEngine();
  assert.equal(resumed.loadSave(visitSave), true);
  moveToProp(resumed, 'rowan');

  const resumedDialogue = resumed.getState().dialog ?? '';
  assert.match(resumedDialogue, /Rowan recognizes the seed-heart token/);
  assert.match(resumedDialogue, /Rowan recognizes the Riverheart charm/);
});

test('backpack salvage awards XP, protects equipped gear, and loaded quest items stay unique', () => {
  const source = createEngine();
  const save = source.exportSave();
  assert.ok(save?.state.player);
  save.state.player.xp = 0;
  save.state.inventory.push(
    { id: 'salvage-blade', name: 'Spare blade', kind: 'weapon', description: 'An unequipped test weapon.', bonusAttack: 4 },
    { id: 'salvage-tonic', name: 'Small tonic', kind: 'consumable', description: 'A stack of tonics.', quantity: 2 },
    { id: 'kept-weapon', name: 'Bound blade', kind: 'weapon', description: 'Still equipped.', equipped: true },
    { id: 'one-quest-seal', name: 'Quest seal', kind: 'relic', description: 'A unique story item.' },
    { id: 'one-quest-seal', name: 'Quest seal copy', kind: 'relic', description: 'An old duplicate from a save.' },
  );
  const engine = new AdventureEngine();
  assert.equal(engine.loadSave(save), true);
  assert.equal(engine.getState().inventory.filter((item) => item.id === 'one-quest-seal').length, 1);

  engine.salvageItem('salvage-blade');
  engine.salvageItem('salvage-tonic');
  engine.salvageItem('kept-weapon');
  engine.salvageItem('one-quest-seal');
  const inventory = engine.getState().inventory;
  assert.ok(!inventory.some((item) => item.id === 'salvage-blade'));
  assert.equal(inventory.find((item) => item.id === 'salvage-tonic')?.quantity, 1);
  assert.ok(inventory.some((item) => item.id === 'kept-weapon'));
  assert.ok(inventory.some((item) => item.id === 'one-quest-seal'));
  assert.equal(engine.getState().player?.xp, 30, 'blade yields 24 XP and one tonic yields 6 XP');
});

test('players can lock gear against salvage and the lock survives saving and loading', () => {
  const source = createEngine();
  const save = source.exportSave();
  assert.ok(save?.state.player);
  save.state.inventory.push(
    { id: 'favorite-blade', name: 'Favorite blade', kind: 'weapon', description: 'A plain but treasured blade.', bonusAttack: 4 },
    { id: 'favorite-coat', name: 'Favorite coat', kind: 'armor', description: 'A well-worn coat.', bonusHp: 8 },
  );
  const engine = new AdventureEngine();
  assert.equal(engine.loadSave(save), true);

  engine.toggleGearLock('favorite-blade');
  engine.toggleGearLock('favorite-coat');
  assert.equal(engine.getState().inventory.find((item) => item.id === 'favorite-blade')?.locked, true);
  assert.equal(engine.getState().inventory.find((item) => item.id === 'favorite-coat')?.locked, true);
  engine.salvageItem('favorite-blade');
  engine.salvageItem('favorite-blade', true);
  assert.ok(engine.getState().inventory.some((item) => item.id === 'favorite-blade'), 'confirmation must not bypass the lock');

  const lockedSave = engine.exportSave();
  assert.ok(lockedSave);
  const resumed = new AdventureEngine();
  assert.equal(resumed.loadSave(lockedSave), true);
  assert.equal(resumed.getState().inventory.find((item) => item.id === 'favorite-blade')?.locked, true);
  assert.equal(resumed.getState().inventory.find((item) => item.id === 'favorite-coat')?.locked, true);

  resumed.toggleGearLock('favorite-blade');
  resumed.salvageItem('favorite-blade');
  assert.ok(!resumed.getState().inventory.some((item) => item.id === 'favorite-blade'), 'unlocked gear can be salvaged normally');
  assert.ok(resumed.getState().inventory.some((item) => item.id === 'favorite-coat'), 'other locked gear remains protected');
});

test('salvaging valuable gear requires explicit confirmation while ordinary gear stays quick', () => {
  const source = createEngine();
  const save = source.exportSave();
  assert.ok(save?.state.player);
  save.state.player.xp = 0;
  save.state.inventory.push(
    { id: 'rare-effect-blade', name: 'Cinderwake staff', kind: 'weapon', description: 'A rare staff.', bonusAttack: 10, combatEffect: 'ember-bolt' },
    { id: 'strong-armor', name: 'Highguard coat', kind: 'armor', description: 'Sturdy armor.', bonusHp: 20 },
    { id: 'ordinary-blade', name: 'Plain blade', kind: 'weapon', description: 'An ordinary weapon.', bonusAttack: 4 },
  );
  const engine = new AdventureEngine();
  assert.equal(engine.loadSave(save), true);

  engine.salvageItem('rare-effect-blade');
  engine.salvageItem('strong-armor');
  assert.ok(engine.getState().inventory.some((item) => item.id === 'rare-effect-blade'));
  assert.ok(engine.getState().inventory.some((item) => item.id === 'strong-armor'));
  assert.equal(engine.getState().player?.xp, 0, 'unconfirmed valuable gear must not grant XP');

  engine.salvageItem('ordinary-blade');
  assert.ok(!engine.getState().inventory.some((item) => item.id === 'ordinary-blade'));
  engine.salvageItem('rare-effect-blade', true);
  engine.salvageItem('strong-armor', true);
  assert.ok(!engine.getState().inventory.some((item) => item.id === 'rare-effect-blade'));
  assert.ok(!engine.getState().inventory.some((item) => item.id === 'strong-armor'));
  assert.equal(engine.getState().player?.xp, 18, 'the 88 total XP includes the 70 XP needed for a level-up');
  assert.equal(engine.getState().player?.level, 2, 'salvage XP continues through the normal level-up flow');
});

test('tree collision allows passing beneath the canopy but still blocks the trunk', () => {
  const engine = createEngine();
  engine.getEnemies().splice(0);
  const tree = engine.getProps().find((prop) => prop.id === 'northwood-root-door');
  const player = engine.getState().player;
  assert.ok(tree && player);

  player.x = tree.x - 20;
  player.y = tree.y - 26;
  engine.setDirection('down', true);
  for (let step = 0; step < 20; step += 1) engine.tick(50);
  engine.releaseAllDirections();
  assert.ok(player.y > tree.y + 20, 'the canopy edge should not act like a solid wall');

  player.x = tree.x;
  player.y = tree.y + 8;
  engine.setDirection('down', true);
  for (let step = 0; step < 20; step += 1) engine.tick(50);
  engine.releaseAllDirections();
  assert.ok(player.y < tree.y + 30, 'the trunk center should remain solid');
});

test('the field map records claimed treasure and keeps its marker after a save is loaded', () => {
  const engine = createEngine();
  moveToProp(engine, 'village-chest');

  assert.ok(engine.getWorldProgress().foundTreasureCells.includes('village'));
  const save = engine.exportSave();
  assert.ok(save);
  assert.ok(save.progress.world.foundTreasureCells.includes('village'));

  const resumed = new AdventureEngine();
  resumed.loadSave(save);
  assert.ok(resumed.getWorldProgress().foundTreasureCells.includes('village'));
});

test('first-temple pillars block only at their narrow bases', () => {
  const engine = createEngine();
  engine.getEnemies().splice(0);
  const ruins = WORLD_CELLS.find((cell) => cell.roomId === 'ruins' && cell.contentReady);
  const player = engine.getState().player;
  assert.ok(ruins && player);
  const origin = worldCellOrigin(ruins.id);

  player.x = origin.x + 80;
  player.y = origin.y + 100;
  engine.setDirection('down', true);
  for (let step = 0; step < 30; step += 1) engine.tick(50);
  engine.releaseAllDirections();
  assert.ok(player.y > origin.y + 150, 'the wide pillar artwork should not block its clear edge');

  player.x = origin.x + 99;
  player.y = origin.y + 100;
  engine.setDirection('down', true);
  for (let step = 0; step < 20; step += 1) engine.tick(50);
  engine.releaseAllDirections();
  assert.ok(player.y < origin.y + 140, 'the center of the pillar base should remain solid');
});


test('an automatically equipped chest weapon increases basic attack damage', () => 
{

  const engine = createEngine('warrior')
;

  moveToProp(engine, 'village-chest')
;


  const target = engine.getEnemies().find((enemy) => enemy.id === 'moss-slime-a')
;

  assert.ok(target, 'Expected a woodland enemy')
;

  const player = engine.getState().player
;

  assert.ok(player)
;

  player.x = target.x - 40
;

  player.y = target.y
;

  player.facing = 'right'
;

  engine.setDirection('right', true)
;


  const hpBefore = target.hp
;

  engine.pressButton('attack')
;

  assert.equal(target.hp, hpBefore - CLASSES.warrior.attackDamage - 4)
;

}
)
;


test('Hearthguard mace staggers a struck enemy for longer than a normal hit', () => 
{

  const engine = createEngine()
;

  moveToProp(engine, 'village-chest')
;

  const target = prepareEnemyInFront(engine, 42)
;


  engine.pressButton('attack')
;


  assert.ok(target.stunnedMs >= 1050)
;

  assert.match(engine.getState().hint, /Hearthguard mace staggers/)
;

  assert.ok(engine.getEffects().some((effect) => effect.tint === 0xffc45c))
;


  engine.setDirection('down', true)
;

  engine.tick(50)
;

  assert.match(engine.getState().hint, /Hearthguard mace staggers/, 'Combat feedback should remain visible while moving')
;

}
)
;


test('Briar-edge applies a visible thorn bleed that deals damage over time', () => 
{

  const engine = createEngine()
;

  moveToProp(engine, 'forest-chest')
;

  assertWeaponEquipped(engine, WEAPON_FINDS.forest.name)
;

  const target = prepareEnemyInFront(engine, 42)
;


  engine.pressButton('attack')
;


  const hpAfterHit = target.hp
;

  assert.ok(target.damageOverTime.some((effect) => effect.kind === 'thorn-bleed'))
;

  assert.match(engine.getState().hint, /Briar-edge thorns leave .* bleeding/)
;

  assert.ok(engine.getEffects().some((effect) => effect.tint === 0x9bd45e))
;

  for (let tick = 0
;
 tick < 12
;
 tick += 1) engine.tick(50)
;

  assert.ok(target.hp < hpAfterHit, 'Thorn bleed should continue damaging the enemy after the strike')
;

}
)
;


test('Starfall spear extends reach only while it is the equipped weapon', () => 
{

  const engine = createEngine()
;

  moveToProp(engine, 'village-chest')
;

  collectSpear(engine)
;

  assertWeaponEquipped(engine, WEAPON_FINDS.ruins.name)
;


  const target = prepareEnemyInFront(engine, 92)
;

  const hpBefore = target.hp
;

  engine.equipItem(WEAPON_FINDS.supply.id)
;

  engine.pressButton('attack')
;

  assert.equal(target.hp, hpBefore, 'The unequipped spear should not extend mace reach')
;


  engine.equipItem(WEAPON_FINDS.ruins.id)
;

  engine.pressButton('attack')
;

  assert.ok(target.hp < hpBefore)
;

  assert.match(engine.getState().hint, /Starfall spear strikes .* extended range/)
;

  assert.ok(engine.getEffects().some((effect) => effect.tint === 0x8fdaf5))
;

}
)
;


test('basic attacks forgive a small angular miss, but do not hit enemies outside the aim arc', () => {
  const assisted = createEngine();
  const nearLine = prepareEnemyInFront(assisted, 52);
  nearLine.y += 11;
  const assistedHp = nearLine.hp;
  assisted.pressButton('attack');
  assert.ok(nearLine.hp < assistedHp, 'the target falls inside the 20-degree aiming window');

  const strict = createEngine();
  const outsideArc = prepareEnemyInFront(strict, 52);
  const strictPlayer = strict.getState().player!;
  outsideArc.x = strictPlayer.x + 39;
  outsideArc.y = strictPlayer.y + 40;
  const outsideHp = outsideArc.hp;
  strict.pressButton('attack');
  assert.equal(outsideArc.hp, outsideHp, 'aim assist should not snap onto a target far off-axis');
});

test('projectile spells steer toward enemies inside the aim arc and still hit them', () => {
  const projectilePower = CLASS_DISCIPLINES.mage
    .flatMap((discipline) => discipline.powers)
    .find((power) => power.effect === 'projectile');
  assert.ok(projectilePower, 'the Mage has a projectile spell to validate');
  const { engine, player, target } = preparePowerTest('mage', projectilePower);
  player.x = target.x - 140;
  target.y += 25;

  engine.pressButton('ability0');
  const projectile = engine.getProjectiles()[0];
  assert.ok(projectile);
  assert.ok(projectile.vx > 0 && projectile.vy > 0, 'the projectile corrects toward the in-cone target');
  for (let tick = 0; tick < 16; tick++) engine.tick(50);
  assert.ok(target.hp < target.maxHp, 'the corrected spell connects without exact pixel alignment');
});

test('Cinderwake staff fires a scorching ember projectile only while equipped', () => 
{

  const engine = createEngine()
;

  moveToProp(engine, 'village-chest')
;

  engine.getState().bossDefeated = true
;

  moveToProp(engine, 'sanctum-coffer')
;

  assertWeaponEquipped(engine, WEAPON_FINDS.sanctum.name)
;

  const target = prepareEnemyInFront(engine, 140)
;


  engine.pressButton('attack')
;

  const ember = engine.getProjectiles()[0]
;

  assert.ok(ember)
;

  assert.equal(ember.tint, 0xff6a32)
;

  assert.equal(ember.impactEffect, 'ember-burn')
;

  assert.match(engine.getState().hint, /scorching ember bolt/)
;


  for (let tick = 0
;
 tick < 12
;
 tick += 1) engine.tick(50)
;

  assert.ok(target.damageOverTime.some((effect) => effect.kind === 'ember-burn'))
;

  assert.match(engine.getState().hint, /Cinderwake ember scorches/)
;

  assert.ok(engine.getEffects().some((effect) => effect.tint === 0xff6a32))
;


  engine.equipItem(WEAPON_FINDS.supply.id)
;

  target.hp = 1000
;

  target.x = 300
;

  target.y = 300
;

  const player = engine.getState().player
;

  assert.ok(player)
;

  player.x = target.x - 140
;

  player.y = target.y
;

  player.facing = 'right'
;

  engine.setDirection('right', true)
;

  engine.releaseAllDirections()
;

  engine.pressButton('attack')
;

  assert.equal(engine.getProjectiles().length, 0, 'The unequipped staff should not fire an ember bolt')
;

  assert.equal(target.hp, 1000)
;

}
)
;


test('previously saved found weapons gain their combat effect when loaded', () => 
{

  const engine = createEngine()
;

  moveToProp(engine, 'village-chest')
;

  const save = engine.exportSave()
;

  assert.ok(save)
;

  const savedMace = save.state.inventory.find((item) => item.id === WEAPON_FINDS.supply.id)
;

  assert.ok(savedMace)
;

  delete savedMace.combatEffect
;


  const loadedEngine = new AdventureEngine()
;

  assert.equal(loadedEngine.loadSave(save), true)
;

  const target = prepareEnemyInFront(loadedEngine, 42)
;

  loadedEngine.pressButton('attack')
;


  assert.ok(target.stunnedMs >= 1050)
;

  assert.match(loadedEngine.getState().hint, /Hearthguard mace staggers/)
;

}
)
;


test('world discovery and the version 8 world-state migration survive save and load', () => 
{

  const engine = createEngine()
;

  const player = engine.getState().player
;

  assert.ok(player)
;

  player.x = 635
;

  player.y = 1440 + 240
;

  engine.setDirection('right', true)
;

  engine.tick(50)
;

  engine.releaseAllDirections()
;


  const save = engine.exportSave()
;

  assert.ok(save)
;

  assert.equal(save.version, 10)
;

  assert.ok(save.state.discoveredWorldCells.includes('southfield'))
;

  assert.deepEqual(save.progress.world?.unlockedRegions, ['hearthglen'])
;


  save.version = 4
;

  delete save.progress.world
;

  delete (save.state as Omit<GameSnapshot, 'discoveredWorldCells'> & 
{
 discoveredWorldCells?: string[] 
}
).discoveredWorldCells
;

  const loaded = new AdventureEngine()
;

  assert.equal(loaded.loadSave(save), true)
;

  assert.ok(loaded.getState().discoveredWorldCells.includes('southfield'))
;

  assert.deepEqual(loaded.getWorldProgress().unlockedRegions, ['hearthglen'])
;

  assert.equal(loaded.getWorldProgress().marchesTide, 'low')
;

}
)
;


test('the Marches tide cycles in-region and its phase and timer survive saving', () => 
{

  const engine = createEngine()
;

  const save = engine.exportSave()
;

  assert.ok(save?.progress.world)
;

  const tidemark = worldCellOrigin('drowned-marches-02-01')
;

  save.state.player!.x = tidemark.x + 320
;

  save.state.player!.y = tidemark.y + 240
;

  save.progress.world.unlockedRegions.push('drowned-marches')
;


  assert.equal(engine.loadSave(save), true)
;

  assert.equal(engine.getWorldProgress().marchesTide, 'low')
;

  for (let tick = 0
;
 tick < 900
;
 tick += 1) engine.tick(50)
;

  assert.equal(engine.getWorldProgress().marchesTide, 'high')
;

  assert.equal(engine.getWorldProgress().marchesTideRemainingMs, 45_000)
;


  const highTideSave = engine.exportSave()
;

  assert.ok(highTideSave)
;

  const resumed = new AdventureEngine()
;

  assert.equal(resumed.loadSave(highTideSave), true)
;

  assert.equal(resumed.getWorldProgress().marchesTide, 'high')
;

  assert.equal(resumed.getWorldProgress().marchesTideRemainingMs, 45_000)
;

}
)
;


test('a high Marches tide leaves the Reedveil causeway open and passable', () => 
{

  const engine = createEngine()
;

  const save = engine.exportSave()
;

  assert.ok(save?.progress.world)
;

  const crossing = worldCellOrigin('reedveil-crossing')
;

  save.state.player!.x = crossing.x + 565
;

  save.state.player!.y = crossing.y + 240
;

  save.progress.world.unlockedRegions.push('drowned-marches')
;

  save.progress.world.marchesTide = 'high'
;


  assert.equal(engine.loadSave(save), true)
;

  engine.getEnemies().forEach((enemy) => 
{

    enemy.stunnedMs = 10_000
;

    enemy.attackMs = 100_000
;

  
}
)
;

  engine.setDirection('right', true)
;

  for (let tick = 0
;
 tick < 30 && worldCellAt(engine.getState().player!.x, engine.getState().player!.y)?.id === 'reedveil-crossing'
;
 tick += 1) 
{

    engine.tick(50)
;

  
}

  engine.releaseAllDirections()
;

  assert.equal(worldCellAt(engine.getState().player!.x, engine.getState().player!.y)?.id, 'chapel-forecourt')
;

}
)
;

test('the low-tide Reedveil ford works and a saved traveller can return when it closes', () => {
  const engine = createEngine();
  const save = engine.exportSave();
  assert.ok(save?.progress.world);

  const reedveil = worldCellOrigin('reedveil-crossing');
  const bellkeeper = worldCellOrigin('bellkeeper-causeway');
  save.state.player!.x = reedveil.x + 320;
  save.state.player!.y = reedveil.y + 440;
  save.progress.world.unlockedRegions.push('drowned-marches');
  save.progress.world.marchesTide = 'low';
  save.progress.world.marchesTideRemainingMs = 45_000;

  assert.equal(engine.loadSave(save), true);
  engine.getEnemies().forEach((enemy) => {
    enemy.stunnedMs = 10_000;
    enemy.attackMs = 100_000;
  });
  engine.setDirection('down', true);
  for (
    let tick = 0;
    tick < 80 &&
    (worldCellAt(engine.getState().player!.x, engine.getState().player!.y)?.id !== 'bellkeeper-causeway' ||
      engine.getState().player!.y < bellkeeper.y + 240);
    tick += 1
  ) engine.tick(50);
  engine.releaseAllDirections();
  assert.equal(worldCellAt(engine.getState().player!.x, engine.getState().player!.y)?.id, 'bellkeeper-causeway');

  const midJourneySave = engine.exportSave();
  assert.ok(midJourneySave?.progress.world);
  midJourneySave.progress.world.marchesTideRemainingMs = 50;
  const resumed = new AdventureEngine();
  assert.equal(resumed.loadSave(midJourneySave), true);
  resumed.tick(50);
  assert.equal(resumed.getWorldProgress().marchesTide, 'high');

  resumed.getEnemies().forEach((enemy) => {
    enemy.stunnedMs = 10_000;
    enemy.attackMs = 100_000;
  });
  resumed.setDirection('up', true);
  for (let tick = 0; tick < 80; tick += 1) resumed.tick(50);
  resumed.releaseAllDirections();
  assert.equal(
    worldCellAt(resumed.getState().player!.x, resumed.getState().player!.y)?.id,
    'bellkeeper-causeway',
    'the closed shortcut blocks crossing back into Reedveil',
  );

  resumed.setDirection('down', true);
  for (
    let tick = 0;
    tick < 60 && resumed.getState().player!.y < bellkeeper.y + 240;
    tick += 1
  ) resumed.tick(50);
  resumed.releaseAllDirections();
  resumed.setDirection('left', true);
  for (
    let tick = 0;
    tick < 80 && worldCellAt(resumed.getState().player!.x, resumed.getState().player!.y)?.id !== 'drowned-waystones';
    tick += 1
  ) resumed.tick(50);
  resumed.releaseAllDirections();
  assert.equal(
    worldCellAt(resumed.getState().player!.x, resumed.getState().player!.y)?.id,
    'drowned-waystones',
    'the permanent west causeway remains a safe return route',
  );
});

test('main-story exits work from a fresh start and across saved regional bridges', () => {
  const fresh = createEngine();
  fresh.getEnemies().splice(0);
  const freshPlayer = fresh.getState().player;
  assert.ok(freshPlayer);
  fresh.setDirection('up', true);
  for (let tick = 0; tick < 80; tick += 1) fresh.tick(50);
  fresh.releaseAllDirections();
  assert.equal(
    worldCellAt(freshPlayer.x, freshPlayer.y)?.id,
    'briarwood',
    'the fresh Hearthglen journey should leave through its authored north exit',
  );

  const firstLegSave = fresh.exportSave();
  assert.ok(firstLegSave);
  const firstLegResume = new AdventureEngine();
  assert.equal(firstLegResume.loadSave(firstLegSave), true);
  firstLegResume.getEnemies().splice(0);
  walkAcrossWorldExit(firstLegResume, 'briarwood', 'south', 'village');

  const bridges: {
    from: string;
    edge: WorldTestEdge;
    to: string;
    unlockedRegions: string[];
    silencedBells: string[];
  }[] = [
    {
      from: 'mournwater-crossing',
      edge: 'south',
      to: 'drowned-marches-01-01',
      unlockedRegions: ['hearthglen', 'drowned-marches'],
      silencedBells: ['hearthglen'],
    },
    {
      from: 'northbound-sluice',
      edge: 'south',
      to: 'frostline-stair',
      unlockedRegions: ['hearthglen', 'drowned-marches', 'ashen-peaks'],
      silencedBells: ['hearthglen', 'drowned-marches'],
    },
    {
      from: 'glassward-gate',
      edge: 'south',
      to: 'glassward-entry',
      unlockedRegions: ['hearthglen', 'drowned-marches', 'ashen-peaks', 'glasslands'],
      silencedBells: ['hearthglen', 'drowned-marches', 'ashen-peaks'],
    },
    {
      from: 'capital-road',
      edge: 'south',
      to: 'capital-south-gate',
      unlockedRegions: [
        'hearthglen',
        'drowned-marches',
        'ashen-peaks',
        'glasslands',
        'fallen-capital',
      ],
      silencedBells: ['hearthglen', 'drowned-marches', 'ashen-peaks', 'glasslands'],
    },
    {
      from: 'resolve-bell-sanctum',
      edge: 'south',
      to: 'first-hunger-sanctum',
      unlockedRegions: [
        'hearthglen',
        'drowned-marches',
        'ashen-peaks',
        'glasslands',
        'fallen-capital',
        'first-hunger',
      ],
      silencedBells: [
        'hearthglen',
        'drowned-marches',
        'ashen-peaks',
        'glasslands',
        'fallen-capital',
      ],
    },
  ];
  const opposite: Record<WorldTestEdge, WorldTestEdge> = {
    north: 'south',
    south: 'north',
    east: 'west',
    west: 'east',
  };

  for (const bridge of bridges) {
    const source = createEngine();
    const save = source.exportSave();
    assert.ok(save?.progress.world);
    const origin = worldCellOrigin(bridge.from);
    save.state.player!.x = origin.x + 320;
    save.state.player!.y = origin.y + 240;
    save.progress.world.unlockedRegions = bridge.unlockedRegions as typeof save.progress.world.unlockedRegions;
    save.progress.world.silencedBells = bridge.silencedBells as typeof save.progress.world.silencedBells;

    const journey = new AdventureEngine();
    assert.equal(journey.loadSave(save), true, `${bridge.from} journey should resume`);
    journey.getEnemies().splice(0);
    walkAcrossWorldExit(journey, bridge.from, bridge.edge, bridge.to);

    const crossingSave = journey.exportSave();
    assert.ok(crossingSave);
    const resumed = new AdventureEngine();
    assert.equal(resumed.loadSave(crossingSave), true, `${bridge.to} should remain reachable after saving`);
    resumed.getEnemies().splice(0);
    walkAcrossWorldExit(resumed, bridge.to, opposite[bridge.edge], bridge.from);
  }
});


test('the Drowned Marches route, Maelis trail, tide-bell puzzle, boss, and chapter ending survive loading', () => 
{

  const engine = createEngine()
;

  const state = engine.getState()
;

  assert.ok(state.player)
;

  state.quest = 
{
 title: 'The bells below', description: '', step: 'Return to Hearthglen' 
}
;

  moveToProp(engine, 'rowan')
;

  travelToCell(engine, 'drowned-marches-01-01')
;

  travelToCell(engine, 'drowned-ferry')
;

  moveToProp(engine, 'mournwater-ferryman')
;

  travelToCell(engine, 'sunken-chapel-approach')
;

  assert.equal(engine.getState().quest.step, "Search the reedbed for Maelis's trail")
;

  moveToProp(engine, 'maelis-trail-mark')
;

  travelToCell(engine, 'reedveil-crossing')
;

  travelToCell(engine, 'chapel-forecourt')
;

  assert.equal(engine.getState().quest.step, "Find Maelis's field note at the chapel forecourt")
;

  moveToProp(engine, 'maelis-field-note')
;

  travelToCell(engine, 'sunken-chapel')
;

  assert.equal(engine.getState().quest.step, 'Ring the three tide bells: Low, High, Low')
;


  moveToProp(engine, 'chapel-bell-low-a')
;

  moveToProp(engine, 'chapel-bell-high')
;

  const puzzleSave = engine.exportSave()
;

  assert.ok(puzzleSave)
;

  assert.equal(puzzleSave.progress.world?.chapelPuzzleProgress, 2)
;

  assert.ok(puzzleSave.progress.world?.discoveredDungeons.includes('sunken-chapel'))
;

  assert.ok(puzzleSave.state.discoveredWorldCells.includes('sunken-chapel'))
;

  const loaded = new AdventureEngine()
;

  assert.equal(loaded.loadSave(puzzleSave), true)
;

  assert.equal(loaded.getWorldProgress().chapelPuzzleProgress, 2)
;

  assert.equal(loaded.getState().location, 'The Sunken Chapel')
;


  moveToProp(loaded, 'chapel-bell-low-a')
;

  assert.equal(loaded.getWorldProgress().chapelPuzzleProgress, 0, 'wrong bell order resets the puzzle')
;

  for (const bell of ['chapel-bell-low-a', 'chapel-bell-high', 'chapel-bell-low-b']) 
{

    moveToProp(loaded, bell)
;

  
}

  assert.equal(loaded.getWorldProgress().chapelGateOpen, true)
;

  assert.equal(loaded.getState().quest.step, 'Defeat the Drowned Bellkeeper')
;

  const boss = loaded.getEnemies().find((enemy) => enemy.id === 'sunken-chapel:chapel-bellkeeper')
;

  assert.ok(boss, 'the seal should summon the chapter boss')
;


  const player = loaded.getState().player
;

  assert.ok(player)
;

  boss.hp = 1
;

  boss.stunnedMs = 10000
;

  player.x = boss.x - 40
;

  player.y = boss.y
;

  player.facing = 'right'
;

  loaded.setDirection('right', true)
;

  loaded.releaseAllDirections()
;

  loaded.pressButton('attack')
;

  assert.ok(loaded.getWorldProgress().completedDungeons.includes('sunken-chapel'))
;

  assert.ok(loaded.getWorldProgress().silencedBells.includes('drowned-marches'))
;

  assert.equal(getWorldColorProfile(loaded.getWorldProgress()).saturation, 0.6)
;

  assert.equal(loaded.getState().quest.step, 'Return the drowned bell seal to the ferryman')
;


  const victorySave = loaded.exportSave()
;

  assert.ok(victorySave)
;

  const resumed = new AdventureEngine()
;

  assert.equal(resumed.loadSave(victorySave), true)
;

  assert.ok(resumed.getWorldProgress().completedDungeons.includes('sunken-chapel'))
;

  assert.ok(resumed.getWorldProgress().silencedBells.includes('drowned-marches'))
;

  assert.equal(getWorldColorProfile(resumed.getWorldProgress()).saturation, 0.6)
;

  travelToCell(resumed, 'drowned-ferry')
;

  moveToProp(resumed, 'mournwater-ferryman')
;

  assert.equal(resumed.getState().quest.step, 'Find Maelis’s trail mark at the Northbound Sluice')
;

  assert.ok(resumed.getState().inventory.some((item) => item.id === 'drowned-bell-seal'))
;

  assert.ok(resumed.getWorldProgress().unlockedRegions.includes('ashen-peaks'))
;


  const routeSave = resumed.exportSave()
;

  assert.ok(routeSave)
;

  const previousEndingSave = JSON.parse(JSON.stringify(routeSave)) as typeof routeSave
;

  previousEndingSave.state.quest = 
{

    title: 'The Silent Bell',
    description: 'The Sunken Chapel is reclaimed.',
    step: 'The Sunken Chapel is reclaimed',
  
}
;

  previousEndingSave.progress.world!.unlockedRegions =
    previousEndingSave.progress.world!.unlockedRegions.filter((region) => region !== 'ashen-peaks')
;

  const migratedEnding = new AdventureEngine()
;

  assert.equal(migratedEnding.loadSave(previousEndingSave), true)
;

  assert.ok(migratedEnding.getWorldProgress().unlockedRegions.includes('ashen-peaks'))
;

  assert.equal(migratedEnding.getState().quest.step, 'Find Maelis’s trail mark at the Northbound Sluice')
;


  const routeResume = new AdventureEngine()
;

  assert.equal(routeResume.loadSave(routeSave), true)
;

  assert.ok(routeResume.getWorldProgress().unlockedRegions.includes('ashen-peaks'))
;

  assert.equal(routeResume.getState().quest.step, 'Find Maelis’s trail mark at the Northbound Sluice')
;


  for (const cellId of ['bellkeeper-causeway', 'drowned-waystones', 'wreckers-reach', 'old-floodgate', 'northbound-sluice']) 
{

    travelToCell(routeResume, cellId)
;

  
}

  assert.ok(routeResume.getState().discoveredWorldCells.includes('northbound-sluice'))
;

  assert.ok(routeResume.getWorldProgress().discoveredDungeons.includes('northbound-floodway'))
;

  moveToProp(routeResume, 'maelis-northbound-mark')
;

  assert.equal(routeResume.getState().quest.step, 'Reach Frostline Stair')
;


  const markSave = routeResume.exportSave()
;

  assert.ok(markSave)
;

  const markResume = new AdventureEngine()
;

  assert.equal(markResume.loadSave(markSave), true)
;

  assert.equal(markResume.getState().quest.step, 'Reach Frostline Stair')
;

  assert.ok(markResume.getWorldProgress().discoveredDungeons.includes('northbound-floodway'))
;

  travelToCell(markResume, 'frostline-stair')
;

  assert.equal(markResume.getState().quest.step, 'Search Cinderwatch Approach for Maelis’s next sign')
;

  travelToCell(markResume, 'cinderwatch-approach')
;

  assert.ok(markResume.getState().discoveredWorldCells.includes('cinderwatch-approach'))
;

  assert.ok(markResume.getWorldProgress().discoveredDungeons.includes('cinderwatch-trail'))
;

  moveToProp(markResume, 'maelis-cinderwatch-mark')
;

  assert.equal(markResume.getState().quest.step, 'Find the Bell of Fury in the Ashen Peaks')
;
  assert.ok(!markResume.getWorldProgress().unlockedRegions.includes('glasslands'))
;

  travelToCell(markResume, 'last-ash-watch')
;
  const fury = markResume.getEnemies().find((enemy) => enemy.id === 'last-ash-watch:fury-bellkeeper')
;
  assert.ok(fury, 'Last Ash Watch should contain the authored Fury Bellkeeper');
  fury.hp = 1;
  fury.stunnedMs = 10_000;
  const furyPlayer = markResume.getState().player;
  assert.ok(furyPlayer);
  furyPlayer.x = fury.x - 40;
  furyPlayer.y = fury.y;
  furyPlayer.facing = 'right';
  markResume.setDirection('right', true);
  markResume.releaseAllDirections();
  markResume.pressButton('attack');
  assert.ok(markResume.getWorldProgress().silencedBells.includes('ashen-peaks'));
  assert.ok(markResume.getWorldProgress().completedDungeons.includes('ashen-peaks-bell'));
  assert.ok(markResume.getWorldProgress().unlockedRegions.includes('glasslands'));
  for (const lair of GLASSLANDS_LAIRS) {
    assert.ok(markResume.getWorldProgress().dungeons[lair.id],
      'a fresh Glasslands save initializes the new lair gates before the next reload');
  }
  assert.ok(!markResume.getWorldProgress().destroyedObstacles.includes('glasslands-legacy-bell-access'));
  assert.equal(markResume.getState().quest.step, 'Find the Bell of Joy in the Glasslands');


  const finalSave = markResume.exportSave()
;

  assert.ok(finalSave)
;

  const finalResume = new AdventureEngine()
;

  assert.equal(finalResume.loadSave(finalSave), true)
;

  assert.equal(finalResume.getState().quest.step, 'Find the Bell of Joy in the Glasslands')
;

  assert.ok(finalResume.getState().discoveredWorldCells.includes('cinderwatch-approach'))
;

}
)
;


test('Gleamharbor sells tonics and zone-tier gear; lair access survives a save', () => {
  const town = createGlasslandsEngine('gleamharbor');
  town.getState().player!.coins = 400;
  moveToProp(town, 'glasslands-apothecary');
  assert.equal(town.getState().overlay, 'shop');
  town.buyShopItem('small-tonic');
  assert.equal(town.getState().player!.coins, 392);
  assert.ok(town.getState().inventory.some((item) => item.id === 'small-tonic'));
  for (const id of ['sunshard-knife', 'orchard-mantle', 'moth-prism-pendant']) {
    town.buyShopItem(id);
    assert.ok(town.getState().inventory.some((item) => item.id === id), `${id} is sold in Gleamharbor`);
  }
  assert.ok(town.getState().player!.coins > 0);
  const townSave = town.exportSave()!;
  const townResume = new AdventureEngine();
  assert.equal(townResume.loadSave(townSave), true);
  assert.equal(townResume.getState().player!.coins, town.getState().player!.coins);
  assert.ok(townResume.getState().inventory.some((item) => item.id === 'small-tonic'));

  const chimevault = createGlasslandsEngine('chimevault-steps');
  moveToProp(chimevault, 'glasslands-chimevault/anchor-left');
  assert.equal(chimevault.getWorldProgress().dungeons['glasslands-chimevault'].entranceOpen, false);
  const entranceSave = chimevault.exportSave()!;
  const resumed = new AdventureEngine();
  assert.equal(resumed.loadSave(entranceSave), true);
  moveToProp(resumed, 'glasslands-chimevault/anchor-right');
  assert.equal(resumed.getWorldProgress().dungeons['glasslands-chimevault'].entranceOpen, true);
  moveToProp(resumed, 'glasslands-chimevault/enter');
  assert.equal(resumed.getWorldProgress().activeDungeon?.id, 'glasslands-chimevault');
  const dungeonSave = resumed.exportSave()!;
  const dungeonResume = new AdventureEngine();
  assert.equal(dungeonResume.loadSave(dungeonSave), true);
  assert.equal(dungeonResume.getWorldProgress().activeDungeon?.id, 'glasslands-chimevault');
  moveToProp(dungeonResume, 'dungeon-exit');
  assert.equal(dungeonResume.getWorldProgress().activeDungeon, null);
  assert.equal(worldCellAt(dungeonResume.getState().player!.x, dungeonResume.getState().player!.y)?.id,
    'chimevault-steps');
});

test('the Parallax lens and Heartglass warden each gate their own Glasslands lair', () => {
  const parallax = createGlasslandsEngine('dawn-passage');
  moveToProp(parallax, 'glasslands-parallax/lens');
  assert.equal(parallax.getWorldProgress().dungeons['glasslands-parallax'].entranceOpen, false);
  const lensSave = parallax.exportSave()!;
  const lensResume = new AdventureEngine();
  assert.equal(lensResume.loadSave(lensSave), true);
  moveToProp(lensResume, 'glasslands-parallax/lens');
  assert.equal(lensResume.getWorldProgress().dungeons['glasslands-parallax'].entranceOpen, true);
  moveToProp(lensResume, 'glasslands-parallax/enter');
  assert.equal(lensResume.getWorldProgress().activeDungeon?.id, 'glasslands-parallax');

  const heartglass = createGlasslandsEngine('heartglass-door');
  moveToProp(heartglass, 'glasslands-heartglass/ward');
  assert.equal(heartglass.getWorldProgress().dungeons['glasslands-heartglass'].entranceOpen, false);
  const warden = heartglass.getEnemies().find((enemy) => enemy.id.includes('heartglass-door-warden'));
  assert.ok(warden, 'the lair entrance is bound by its authored warden');
  warden.hp = 1;
  warden.stunnedMs = 10_000;
  const hero = heartglass.getState().player!;
  hero.x = warden.x - 40;
  hero.y = warden.y;
  hero.facing = 'right';
  heartglass.pressButton('attack');
  assert.equal(heartglass.getEnemies().includes(warden), false);
  moveToProp(heartglass, 'glasslands-heartglass/ward');
  assert.equal(heartglass.getWorldProgress().dungeons['glasslands-heartglass'].entranceOpen, true);
  moveToProp(heartglass, 'glasslands-heartglass/enter');
  assert.equal(heartglass.getWorldProgress().activeDungeon?.id, 'glasslands-heartglass');
});

test('the three hidden Glasslands gear caches reveal through their saved puzzles', () => {
  const orchard = createGlasslandsEngine('echoing-orchard');
  const tree = orchard.getProps().find((prop) => prop.id === 'glasslands-prism-tree');
  assert.ok(tree);
  const player = orchard.getState().player!;
  player.x = tree.x;
  player.y = tree.y - 48;
  orchard.setDirection('down', true);
  orchard.releaseAllDirections();
  for (let hit = 1; hit <= 4; hit += 1) {
    orchard.pressButton('attack');
    assert.equal(orchard.getProps().find((prop) => prop.id === 'glasslands-prism-tree')?.hitsTaken, hit);
  }
  orchard.pressButton('attack');
  assert.equal(orchard.getProps().some((prop) => prop.id === 'glasslands-prism-tree'), false,
    'the fifth strike removes the tree and reveals its cache');
  assert.equal(orchard.getProps().find((prop) => prop.id === 'glasslands-gear-gleamthorn-spear')?.visible, true);
  moveToProp(orchard, 'glasslands-gear-gleamthorn-spear');
  assert.ok(orchard.getState().inventory.some((item) => item.id === 'gleamthorn-spear'));

  const moths = createGlasslandsEngine('orchard-of-moths');
  moveToProp(moths, 'glasslands-moth-loom');
  const loomSave = moths.exportSave()!;
  const loomResume = new AdventureEngine();
  assert.equal(loomResume.loadSave(loomSave), true);
  moveToProp(loomResume, 'glasslands-moth-loom');
  assert.equal(loomResume.getProps().find((prop) => prop.id === 'glasslands-gear-mothglass-mantle')?.visible, true);
  moveToProp(loomResume, 'glasslands-gear-mothglass-mantle');
  assert.ok(loomResume.getState().inventory.some((item) => item.id === 'mothglass-mantle'));

  const grove = createGlasslandsEngine('last-mirror-grove');
  moveToProp(grove, 'glasslands-laughter-left');
  const chimeSave = grove.exportSave()!;
  const chimeResume = new AdventureEngine();
  assert.equal(chimeResume.loadSave(chimeSave), true);
  moveToProp(chimeResume, 'glasslands-laughter-right');
  assert.equal(chimeResume.getProps().find((prop) => prop.id === 'glasslands-gear-laughter-prism')?.visible, true);
  moveToProp(chimeResume, 'glasslands-gear-laughter-prism');
  assert.ok(chimeResume.getState().inventory.some((item) => item.id === 'laughter-prism'));
  const collectedSave = chimeResume.exportSave()!;
  const collectedResume = new AdventureEngine();
  assert.equal(collectedResume.loadSave(collectedSave), true);
  assert.equal(collectedResume.getProps().find((prop) => prop.id === 'glasslands-gear-laughter-prism')?.activated, true);
});

test('the Conservatory final rune waits for all three lair keys, including after reload', () => {
  const engine = createGlasslandsEngine('joy-bell-sanctum');
  const partial = engine.exportSave()!;
  partial.progress.world!.glasslandsPuzzleProgress = 2;
  const resumed = new AdventureEngine();
  assert.equal(resumed.loadSave(partial), true);
  moveToProp(resumed, 'glass-bell-rune-reflection');
  assert.equal(resumed.getWorldProgress().glasslandsPuzzleProgress, 2);
  assert.match(resumed.getState().hint, /three garden keepers/i);
  assert.equal(resumed.getEnemies().some((enemy) => enemy.id.includes('glass-bellkeeper')), false);
  const keyedSave = resumed.exportSave()!;
  keyedSave.state.inventory.push(...GLASSLANDS_LAIRS.map((lair) => ({
    id: lair.key, name: `${lair.label} key`, kind: 'key' as const,
    description: 'Opens the Prism Conservatory seal.', equipped: false,
  })));
  const keyed = new AdventureEngine();
  assert.equal(keyed.loadSave(keyedSave), true);
  moveToProp(keyed, 'glass-bell-rune-reflection');
  assert.equal(keyed.getWorldProgress().glasslandsPuzzleProgress, 3);
  assert.ok(keyed.getEnemies().some((enemy) => enemy.id.includes('glass-bellkeeper')));
});

test('Glasslands and Fallen Capital bells are playable once each and their puzzle progress resumes from saves', () => {
  const engine = createEngine();
  const save = engine.exportSave();
  assert.ok(save?.progress.world);

  const cinderwatch = worldCellOrigin('cinderwatch-approach');
  save.state.player!.x = cinderwatch.x + 320;
  save.state.player!.y = cinderwatch.y + 236;
  save.progress.world.unlockedRegions.push('drowned-marches', 'ashen-peaks', 'glasslands');
  save.progress.world.completedDungeons.push('sunken-chapel', 'ashen-peaks-bell');
  save.progress.world.silencedBells = ['hearthglen', 'drowned-marches', 'ashen-peaks'];
  save.state.quest = {
    title: 'A Trail North',
    description: 'Follow Maelis’s trail.',
    step: 'Follow Maelis’s trail deeper into the Ashen Peaks',
  };
  assert.equal(engine.loadSave(save), true);

  moveToProp(engine, 'maelis-cinderwatch-mark');
  assert.ok(engine.getWorldProgress().unlockedRegions.includes('glasslands'));
  assert.equal(engine.getState().quest.step, 'Find the Bell of Joy in the Glasslands');

  travelToCell(engine, 'joy-bell-sanctum');
  moveToProp(engine, 'glass-bell-inscription');
  moveToProp(engine, 'glass-bell-rune-dawn');
  assert.equal(engine.getWorldProgress().glasslandsPuzzleProgress, 1);
  assert.equal(engine.getProps().find((prop) => prop.id === 'glass-bell-rune-dawn')?.activated, true);
  assert.equal(engine.getContextHint(), 'Dawn rune is lit. Next: Bloom rune.');
  moveToProp(engine, 'glass-bell-rune-dawn');
  assert.equal(engine.getWorldProgress().glasslandsPuzzleProgress, 1, 'reusing the lit Dawn rune must not reset the sequence');
  moveToProp(engine, 'glass-bell-rune-bloom');
  const glassPuzzleSave = engine.exportSave();
  assert.equal(glassPuzzleSave?.progress.world?.glasslandsPuzzleProgress, 2);

  const glassResumed = new AdventureEngine();
  assert.equal(glassResumed.loadSave(glassPuzzleSave!), true);
  assert.equal(glassResumed.getWorldProgress().glasslandsPuzzleProgress, 2);
  moveToProp(glassResumed, 'glass-bell-rune-reflection');
  let boss = glassResumed.getEnemies().find((enemy) => enemy.id === 'joy-bell-sanctum:glass-bellkeeper');
  assert.ok(boss, 'the last glass rune should summon the Prism Bellkeeper');
  let player = glassResumed.getState().player;
  assert.ok(player);
  boss.hp = 1;
  boss.stunnedMs = 10_000;
  player.x = boss.x - 40;
  player.y = boss.y;
  player.facing = 'right';
  glassResumed.setDirection('right', true);
  glassResumed.releaseAllDirections();
  glassResumed.pressButton('attack');

  let progress = glassResumed.getWorldProgress();
  assert.equal(progress.silencedBells.filter((region) => region === 'glasslands').length, 1);
  assert.ok(progress.completedDungeons.includes('glasslands-bell'));
  assert.ok(progress.unlockedRegions.includes('fallen-capital'));
  assert.equal(glassResumed.getState().quest.step, 'Find the Bell of Resolve in the Fallen Capital');
  assert.match(glassResumed.getState().dialog ?? '', /Bell of Joy rings once, then falls silent/);

  const afterGlassSave = glassResumed.exportSave();
  assert.ok(afterGlassSave);
  const capitalJourney = new AdventureEngine();
  assert.equal(capitalJourney.loadSave(afterGlassSave), true);
  assert.ok(capitalJourney.getWorldProgress().unlockedRegions.includes('fallen-capital'));
  travelToCell(capitalJourney, 'resolve-bell-sanctum');
  moveToProp(capitalJourney, 'capital-bell-inscription');
  moveToProp(capitalJourney, 'capital-bell-rune-name');
  moveToProp(capitalJourney, 'capital-bell-rune-oath');
  const capitalPuzzleSave = capitalJourney.exportSave();
  assert.equal(capitalPuzzleSave?.progress.world?.fallenCapitalPuzzleProgress, 2);

  const capitalResumed = new AdventureEngine();
  assert.equal(capitalResumed.loadSave(capitalPuzzleSave!), true);
  moveToProp(capitalResumed, 'capital-bell-rune-vow');
  boss = capitalResumed.getEnemies().find((enemy) => enemy.id === 'resolve-bell-sanctum:capital-bellkeeper');
  assert.ok(boss, 'the last archive rune should summon the Oathbound Bellkeeper');
  player = capitalResumed.getState().player;
  assert.ok(player);
  boss.hp = 1;
  boss.stunnedMs = 10_000;
  player.x = boss.x - 40;
  player.y = boss.y;
  player.facing = 'right';
  capitalResumed.setDirection('right', true);
  capitalResumed.releaseAllDirections();
  capitalResumed.pressButton('attack');

  progress = capitalResumed.getWorldProgress();
  assert.equal(progress.silencedBells.filter((region) => region === 'glasslands').length, 1);
  assert.equal(progress.silencedBells.filter((region) => region === 'fallen-capital').length, 1);
  assert.ok(progress.completedDungeons.includes('fallen-capital-bell'));
  assert.equal(capitalResumed.getState().quest.step, 'Find The First Hunger in the Hollow');
  assert.match(capitalResumed.getState().dialog ?? '', /Bell of Resolve rings once and goes silent/);
  assert.equal(getWorldColorProfile(progress).saturation, 0);

  const completedSave = capitalResumed.exportSave();
  assert.ok(completedSave);
  const finalResume = new AdventureEngine();
  assert.equal(finalResume.loadSave(completedSave), true);
  assert.equal(finalResume.getWorldProgress().silencedBells.filter((region) => region === 'glasslands').length, 1);
  assert.equal(finalResume.getWorldProgress().silencedBells.filter((region) => region === 'fallen-capital').length, 1);
  assert.equal(finalResume.getState().quest.step, 'Find The First Hunger in the Hollow');
});


test('returning Cinderheart to Rowan silences the first bell and opens a clear next objective', () => 
{

  const engine = createEngine()
;

  const state = engine.getState()
;

  assert.ok(state.player)
;

  state.quest = 
{

    title: 'The bells below',
    description: 'Return Cinderheart to Elder Rowan.',
    step: 'Return to Hearthglen',
  
}
;

  moveToProp(engine, 'rowan')
;


  assert.ok(engine.getWorldProgress().silencedBells.includes('hearthglen'))
;

  assert.ok(engine.getWorldProgress().unlockedRegions.includes('drowned-marches'))
;

  assert.equal(engine.getState().quest.step, 'Travel to the Mournwater Crossing')
;

  assert.match(engine.getState().dialog ?? '', /Bell of Wonder rings once—and falls silent/)
;

  assert.match(engine.getState().dialog ?? '', /five great bells.*imprison the Hunger/s)
;

  assert.match(engine.getState().dialog ?? '', /Maelis is the last bellkeeper/)
;

  assert.doesNotMatch(engine.getState().dialog ?? '', /Rowan recognizes the seed-heart token/)
;

  assert.equal(engine.getState().dialogSpeaker, 'Elder Rowan')
;

  assert.deepEqual(engine.getQuestGuidance(), 
{

    objective: 'Travel to the Mournwater Crossing',
    direction: 'Go east from Hearthglen into Southfield.',
  
}
)
;

  const rowanProps = engine.getProps().filter((entry) => entry.id === 'rowan');
  assert.equal(rowanProps.length, 1, 'Rowan should have one active world location');
  assert.equal(worldCellAt(rowanProps[0].x, rowanProps[0].y)?.id, 'mournwater-crossing');
  moveToProp(engine, 'rowan');
  assert.equal(engine.getState().dialogSpeaker, 'Elder Rowan');
  assert.match(engine.getState().dialog ?? '', /You will not need to return to Hearthglen/);

  const save = engine.exportSave()
;

  assert.ok(save?.progress.world)
;

  const resumed = new AdventureEngine()
;

  assert.equal(resumed.loadSave(save), true)
;

  assert.ok(resumed.getWorldProgress().silencedBells.includes('hearthglen'))
;

  const resumedRowan = resumed.getProps().find((entry) => entry.id === 'rowan');
  assert.ok(resumedRowan);
  assert.equal(worldCellAt(resumedRowan.x, resumedRowan.y)?.id, 'mournwater-crossing');

  assert.equal(getWorldColorProfile(resumed.getWorldProgress()).saturation, 0.8)
;

}
)
;

test('Rowan’s waystation advances with the completed bells', () => {
  assert.equal(getRowanTravelStop([]), null);

  const route = [
    { bells: ['hearthglen'], cell: 'mournwater-crossing' },
    { bells: ['hearthglen', 'drowned-marches'], cell: 'frostline-stair' },
    { bells: ['hearthglen', 'drowned-marches', 'ashen-peaks'], cell: 'glassward-entry' },
    { bells: ['hearthglen', 'drowned-marches', 'ashen-peaks', 'glasslands'], cell: 'capital-south-gate' },
    { bells: ['hearthglen', 'drowned-marches', 'ashen-peaks', 'glasslands', 'fallen-capital'], cell: 'resolve-bell-sanctum' },
  ];

  for (const stop of route) {
    assert.equal(getRowanTravelStop(stop.bells)?.cellId, stop.cell);
  }
});

test('Rowan acknowledges each later silent bell without changing the active journey', () => {
  const starter = createEngine();
  const starterSave = starter.exportSave();
  assert.ok(starterSave);

  const stages = [
    {
      bells: ['hearthglen', 'drowned-marches'],
      cell: 'frostline-stair',
      acknowledgement: /Bell of Sorrow has fallen silent/,
      travelCue: /Cinderwatch and the Bell of Fury/,
      questStep: 'Reach Frostline Stair',
    },
    {
      bells: ['hearthglen', 'drowned-marches', 'ashen-peaks'],
      cell: 'glassward-entry',
      acknowledgement: /Bell of Fury is quiet/,
      travelCue: /Prism Conservatory holds the Bell of Joy/,
      questStep: 'Find the Bell of Fury in the Ashen Peaks',
    },
    {
      bells: ['hearthglen', 'drowned-marches', 'ashen-peaks', 'glasslands'],
      cell: 'capital-south-gate',
      acknowledgement: /Bell of Joy has fallen silent/,
      travelCue: /Maelis’s records—and the Bell of Resolve—wait beyond the archive/,
      questStep: 'Find the Bell of Resolve in the Fallen Capital',
    },
    {
      bells: ['hearthglen', 'drowned-marches', 'ashen-peaks', 'glasslands', 'fallen-capital'],
      cell: 'resolve-bell-sanctum',
      acknowledgement: /Bell of Resolve is silent/,
      travelCue: /Maelis’s final record points beyond this hall/,
      questStep: 'Find The First Hunger in the Hollow',
    },
  ];

  for (const stage of stages) {
    const save = JSON.parse(JSON.stringify(starterSave)) as typeof starterSave;
    assert.ok(save);
    const stop = getRowanTravelStop(stage.bells);
    assert.ok(stop);
    const origin = worldCellOrigin(stage.cell);

    save.progress.world = normalizeWorldProgress({
      ...save.progress.world,
      silencedBells: stage.bells,
    });
    save.state.player!.x = origin.x + stop.x;
    save.state.player!.y = origin.y + stop.y;
    save.state.quest = {
      title: 'The current journey',
      description: 'Continue following Maelis’s trail.',
      step: stage.questStep,
    };
    save.state.hint = `Continue: ${stage.questStep}`;
    const startingQuest = { ...save.state.quest };
    const startingHint = save.state.hint;
    const startingXp = save.state.player!.xp;
    const startingCoins = save.state.player!.coins;

    const engine = new AdventureEngine();
    assert.equal(engine.loadSave(save), true);
    const rowan = engine.getProps().find((prop) => prop.id === 'rowan');
    assert.ok(rowan);
    assert.equal(worldCellAt(rowan.x, rowan.y)?.id, stage.cell);

    moveToProp(engine, 'rowan');
    assert.match(engine.getState().dialog ?? '', stage.acknowledgement);
    assert.match(engine.getState().dialog ?? '', stage.travelCue);
    assert.equal(engine.getState().quest.step, startingQuest.step);
    assert.equal(engine.getState().hint, startingHint);
    assert.equal(engine.getState().player?.xp, startingXp);
    assert.equal(engine.getState().player?.coins, startingCoins);

    const resumed = new AdventureEngine();
    const afterConversation = engine.exportSave();
    assert.ok(afterConversation);
    assert.equal(resumed.loadSave(afterConversation), true);
    moveToProp(resumed, 'rowan');
    assert.match(resumed.getState().dialog ?? '', stage.acknowledgement);
    assert.match(resumed.getState().dialog ?? '', stage.travelCue);
    assert.equal(resumed.getState().quest.step, startingQuest.step);
    assert.equal(resumed.getState().hint, startingHint);
    assert.equal(resumed.getState().player?.xp, startingXp);
    assert.equal(resumed.getState().player?.coins, startingCoins);
  }
});


test('world color stages normalize older saves and restore enhanced color after the final bell', () => 
{

  const oldProgress = normalizeWorldProgress(
{
 silencedBells: ['hearthglen'] 
}
)
;

  assert.equal(oldProgress.colorsRestored, false)
;

  assert.equal(getWorldColorProfile(oldProgress).saturation, 0.8)
;

  const saturationStages = Array.from(
{
 length: 6 
}
, (_, count) =>
    getWorldColorProfile(normalizeWorldProgress(
{

      silencedBells: ['hearthglen', 'drowned-marches', 'ashen-peaks', 'glasslands', 'fallen-capital'].slice(0, count),
    
}
)).saturation)
;

  assert.deepEqual(saturationStages, [1, 0.8, 0.6, 0.4, 0.2, 0])
;

  assert.deepEqual(
    saturationStages.map(getColorMatrixSaturationAdjustment),
    [0, -0.2, -0.4, -0.6, -0.8, -1],
  )
;


  const grayscaleProgress = normalizeWorldProgress(
{

    silencedBells: ['hearthglen', 'drowned-marches', 'ashen-peaks', 'glasslands', 'fallen-capital'],
  
}
)
;

  assert.equal(getWorldColorProfile(grayscaleProgress).saturation, 0)
;


  const restoredProgress = normalizeWorldProgress(
{

    ...grayscaleProgress,
    colorsRestored: true,
  
}
)
;

  assert.equal(getWorldColorProfile(restoredProgress).saturation, 1.18)
;

  assert.equal(getColorMatrixSaturationAdjustment(1.18), 0.18)
;


  const engine = createEngine()
;

  const save = engine.exportSave()
;

  assert.ok(save?.progress.world)
;

  save.progress.world = restoredProgress
;

  save.state.bossDefeated = true
;

  save.state.quest = 
{
 title: 'The bells below', description: '', step: 'Journey complete' 
}
;

  const resumed = new AdventureEngine()
;

  assert.equal(resumed.loadSave(save), true)
;

  assert.equal(getWorldColorProfile(resumed.getWorldProgress()).saturation, 1.18)
;

  assert.equal(resumed.getState().quest?.step, 'Journey complete')
;

}
)
;


test('the First Hunger stays vivid at final silence and its victory restores color after loading', () => {
  const bellIds = [
    'hearthglen',
    'drowned-marches',
    'ashen-peaks',
    'glasslands',
    'fallen-capital',
  ] as const;
  const setupEngine = createEngine();
  const setupSave = setupEngine.exportSave();
  assert.ok(setupSave?.progress.world);
  setupSave.progress.world = normalizeWorldProgress({
    ...setupSave.progress.world,
    silencedBells: [...bellIds],
    colorsRestored: false,
    unlockedRegions: [...bellIds],
    completedDungeons: ['sunken-chapel', 'ashen-peaks-bell', 'glasslands-bell', 'fallen-capital-bell'],
  });
  setupSave.state.player!.level = 25;

  const engine = new AdventureEngine();
  assert.equal(engine.loadSave(setupSave), true);
  assert.equal(getWorldColorProfile(engine.getWorldProgress()).saturation, 0);
  travelToCell(engine, 'first-hunger-sanctum');
  const entrance = engine.getProps().find((p) => p.id === 'hunger-entry')!;
  Object.assign(engine.getState().player!, { x: entrance.x, y: entrance.y + 24 });
  engine.pressButton('context');
  travelToCell(engine, 'hunger-0-1');
  assert.equal(engine.getState().quest?.step, 'Challenge Maelis');
  assert.equal(engine.getWorldProgress().finale.stage, 'duel');
  assert.ok(!engine.getEnemies().some((enemy) => enemy.name === 'The First Hunger'));
  const maelis = engine.getEnemies().find((enemy) => enemy.id === 'first-hunger-sanctum:maelis');
  assert.ok(maelis);
  engine.dismissDialog();
  maelis.hp = maelis.maxHp * 0.25 + 1;
  const duelist = engine.getState().player!;
  duelist.x = maelis.x - 40;
  duelist.y = maelis.y;
  duelist.facing = 'right';
  engine.setDirection('right', true);
  engine.releaseAllDirections();
  engine.pressButton('attack');
  assert.equal(maelis.hp, Math.round(maelis.maxHp * 0.25));
  assert.equal(engine.getWorldProgress().finale.stage, 'choice');
  engine.dismissDialog();
  assert.match(engine.getState().dialog ?? '', /Will you fight beside me/);
  const choiceSave = engine.exportSave();
  assert.ok(choiceSave);
  const choiceReload = new AdventureEngine();
  assert.equal(choiceReload.loadSave(choiceSave), true);
  assert.equal(choiceReload.getWorldProgress().finale.stage, 'choice');
  assert.match(choiceReload.getState().dialog ?? '', /Will you fight beside me/);
  engine.chooseMaelisAlliance(true);
  assert.equal(engine.getWorldProgress().finale.allied, true);
  assert.equal(engine.getState().quest?.step, 'Defeat The First Hunger');
  for (const id of ['hunger-bone-key', 'hunger-mirror-key', 'hunger-heart-key']) {
    engine.getState().inventory.push({ id, name: id, kind: 'key', equipped: false, description: 'Previously earned lair key.' });
  }
  travelToCell(engine, 'hunger-5-9');
  engine.dismissDialog();
  const hpBeforeAlly = engine.getState().player!.hp;
  for (let tick = 0; tick < 35; tick++) engine.tick(50);
  assert.ok(engine.getProps().some((prop) => prop.id === 'maelis-ally'));
  assert.equal(engine.getState().player!.hp, hpBeforeAlly, 'Maelis cannot hurt the player');
  assert.deepEqual(getFirstHungerRenderCameras(0, true), {
    vividCamera: true,
    worldCamera: false,
  });

  const hunger = engine.getEnemies().find((enemy) =>
    enemy.id === 'first-hunger-sanctum:first-hunger');
  assert.ok(hunger, 'all five silent bells should spawn the authored finale boss');
  assert.equal(hunger.name, 'The First Hunger');
  assert.equal(hunger.boss, true);
  assert.ok(hunger.hp < hunger.maxHp, 'Maelis should actually damage the Hunger');
  hunger.hp = 1;
  hunger.stunnedMs = 10_000;

  const player = engine.getState().player;
  assert.ok(player);
  player.x = hunger.x - 40;
  player.y = hunger.y;
  player.facing = 'right';
  engine.setDirection('right', true);
  engine.releaseAllDirections();
  engine.pressButton('attack');

  assert.equal(engine.getState().bossDefeated, true);
  assert.equal(engine.getState().quest?.step, 'Journey complete');
  assert.deepEqual(engine.getWorldProgress().silencedBells, [...bellIds]);
  assert.ok(!engine.getEnemies().some((enemy) => enemy.name === 'The First Hunger'));
  assert.equal(engine.getWorldProgress().finale.stage, 'restoring');
  const restorationSave = engine.exportSave();
  assert.ok(restorationSave);
  const restorationReload = new AdventureEngine();
  assert.equal(restorationReload.loadSave(restorationSave), true);
  assert.equal(restorationReload.getWorldProgress().finale.stage, 'restoring');
  for (let tick = 0; tick < RESTORATION_DURATION_MS / 50; tick++) engine.tick(50);
  assert.equal(engine.getWorldProgress().finale.stage, 'complete');
  engine.dismissDialog();
  assert.equal(getWorldColorProfile(engine.getWorldProgress()).saturation, 1.18);
  assert.deepEqual(getFirstHungerRenderCameras(1.18, true), {
    vividCamera: false,
    worldCamera: true,
  });
  assert.deepEqual(getFirstHungerRenderCameras(1.18, false), {
    vividCamera: false,
    worldCamera: false,
  });

  const victorySave = engine.exportSave();
  assert.ok(victorySave);
  const resumed = new AdventureEngine();
  assert.equal(resumed.loadSave(victorySave), true);
  assert.equal(getWorldColorProfile(resumed.getWorldProgress()).saturation, 1.18);
  assert.equal(resumed.getState().bossDefeated, true);
  assert.equal(resumed.getState().quest?.step, 'Journey complete');
  assert.ok(!resumed.getEnemies().some((enemy) =>
    enemy.id.toLowerCase().includes('first-hunger') ||
    enemy.name.toLowerCase().includes('first hunger')));

  const completedQuest = { ...resumed.getState().quest! };
  const completedHint = resumed.getState().hint;
  const completedXp = resumed.getState().player?.xp;
  const completedCoins = resumed.getState().player?.coins;
  moveToProp(resumed, 'rowan');
  assert.equal(resumed.getState().dialogSpeaker, 'Elder Rowan');
  assert.match(resumed.getState().dialog ?? '', /bells are silent/);
  assert.match(resumed.getState().dialog ?? '', /Humanity is free to feel/);
  assert.doesNotMatch(resumed.getState().dialog ?? '', /bells answer/);
  assert.doesNotMatch(resumed.getState().dialog ?? '', /Bell of Resolve is silent/);
  assert.deepEqual(resumed.getState().quest, completedQuest);
  assert.equal(resumed.getState().hint, completedHint);
  assert.equal(resumed.getState().player?.xp, completedXp);
  assert.equal(resumed.getState().player?.coins, completedCoins);

  const epilogueSave = resumed.exportSave();
  assert.ok(epilogueSave);
  const epilogueReload = new AdventureEngine();
  assert.equal(epilogueReload.loadSave(epilogueSave), true);
  moveToProp(epilogueReload, 'rowan');
  assert.match(epilogueReload.getState().dialog ?? '', /Humanity is free to feel/);
  assert.deepEqual(epilogueReload.getState().quest, completedQuest);
  assert.equal(epilogueReload.getState().hint, completedHint);

  travelToCell(epilogueReload, 'drowned-ferry');
  const ferrymanHint = epilogueReload.getState().hint;
  moveToProp(epilogueReload, 'mournwater-ferryman');
  assert.equal(epilogueReload.getState().dialogSpeaker, 'Stranded Ferryman');
  assert.match(epilogueReload.getState().dialog ?? '', /finally grieve.*We do not need the bells anymore/);
  assert.deepEqual(epilogueReload.getState().quest, completedQuest);
  assert.equal(epilogueReload.getState().hint, ferrymanHint);
  assert.equal(epilogueReload.getState().player?.xp, completedXp);
  assert.equal(epilogueReload.getState().player?.coins, completedCoins);

  const ferrymanEpilogueSave = epilogueReload.exportSave();
  assert.ok(ferrymanEpilogueSave);
  const ferrymanEpilogueReload = new AdventureEngine();
  assert.equal(ferrymanEpilogueReload.loadSave(ferrymanEpilogueSave), true);
  moveToProp(ferrymanEpilogueReload, 'mournwater-ferryman');
  assert.match(ferrymanEpilogueReload.getState().dialog ?? '', /finally grieve.*We do not need the bells anymore/);
  assert.deepEqual(ferrymanEpilogueReload.getState().quest, completedQuest);
  assert.equal(ferrymanEpilogueReload.getState().hint, ferrymanHint);
  assert.equal(ferrymanEpilogueReload.getState().player?.xp, completedXp);
  assert.equal(ferrymanEpilogueReload.getState().player?.coins, completedCoins);
});


test('the solo Maelis duel and post-duel choice persist without an ally', () => {
  const source = createEngine();
  const save = source.exportSave()!;
  save.progress.world = normalizeWorldProgress({
    ...save.progress.world,
    silencedBells: ['hearthglen', 'drowned-marches', 'ashen-peaks', 'glasslands', 'fallen-capital'],
  });
  const setup = new AdventureEngine();
  assert.equal(setup.loadSave(save), true);
  travelToCell(setup, 'first-hunger-sanctum');
  const choice = setup.exportSave()!;
  choice.progress.world!.finale.stage = 'choice';
  let solo = new AdventureEngine();
  assert.equal(solo.loadSave(choice), true);
  solo.chooseMaelisAlliance(false);
  assert.equal(solo.getWorldProgress().finale.stage, 'solo-duel');
  const soloReload = new AdventureEngine();
  assert.equal(soloReload.loadSave(solo.exportSave()!), true);
  solo = soloReload;
  const maelis = solo.getEnemies().find((enemy) => enemy.id === 'first-hunger-sanctum:maelis')!;
  assert.equal(maelis.hp, Math.round(maelis.maxHp * 0.25));
  maelis.hp = 1;
  const player = solo.getState().player!;
  player.x = maelis.x - 43;
  player.y = maelis.y;
  player.facing = 'right';
  solo.setAnalogMovement(1, 0);
  solo.tick(1);
  solo.pressButton('attack');
  solo.setAnalogMovement(0, 0);
  assert.equal(solo.getWorldProgress().finale.stage, 'battle');
  solo.dismissDialog();
  assert.ok(!solo.getProps().some((prop) => prop.id === 'maelis-ally'));
  const resume = new AdventureEngine();
  assert.equal(resume.loadSave(solo.exportSave()!), true);
  assert.equal(resume.getWorldProgress().finale.allied, false);
  assert.equal(resume.getWorldProgress().finale.stage, 'battle');
  assert.ok(!resume.getProps().some((prop) => prop.id === 'maelis-ally'));
});

test('the new road reaches the Drowned Marches, where the ferryman advances the quest', () => 
{

  const engine = createEngine()
;

  const state = engine.getState()
;

  assert.ok(state.player)
;

  state.quest = 
{
 title: 'The bells below', description: '', step: 'Return to Hearthglen' 
}
;

  moveToProp(engine, 'rowan')
;

  assert.ok(engine.getWorldProgress().unlockedRegions.includes('drowned-marches'))
;

  state.player.x = 320
;

  state.player.y = 2878
;

  engine.setDirection('down', true)
;

  engine.tick(50)
;

  engine.releaseAllDirections()
;

  assert.equal(engine.getState().location, 'West Causeway')
;

  assert.equal(engine.getState().quest.step, 'Find the stranded ferryman')
;


  moveToProp(engine, 'mournwater-ferryman')
;

  assert.equal(engine.getState().quest.step, 'Reach the Sunken Chapel approach')
;

  assert.match(engine.getState().dialog ?? '', /Maelis crossed the flooded road/)
;

  assert.equal(engine.getQuestGuidance()?.direction, 'Follow the trail east from Driftwood Ferry.')
;

}
)
;


test('Guide explains unavailable routes without charging a cooldown', () => {
  const engine = createEngine();
  engine.getState().quest.step = 'Follow Maelis’s trail deeper into the Ashen Peaks';
  assert.equal(engine.requestGuide(), true);
  assert.equal(engine.getState().guideDirection, null);
  assert.equal(engine.getState().guideCueKind, 'unavailable');
  assert.ok(engine.getState().guideCueMs > 0);
  assert.match(engine.getState().guideMessage ?? '', /No onward Guide route/);
  assert.equal(engine.getState().guideCooldownMs, 0);
  assert.equal(engine.getState().guideUses, 0);
});

test('the Guide points toward story characters and clues inside their screen', () => {
  const rowanEngine = createEngine();
  const rowanState = rowanEngine.getState();
  assert.ok(rowanState.player);
  rowanState.quest.step = 'Speak with Elder Rowan';
  const villageOrigin = worldCellOrigin('village');
  rowanState.player.x = villageOrigin.x + 320;
  rowanState.player.y = villageOrigin.y + 400;

  assert.equal(rowanEngine.requestGuide(), true);
  assert.equal(rowanState.guideDirection, 'up');
  assert.match(rowanState.guideMessage ?? '', /Elder Rowan/);

  const save = createEngine().exportSave();
  assert.ok(save?.state.player);
  save.progress.world.unlockedRegions.push('drowned-marches');
  const ferry = worldCellOrigin('drowned-ferry');
  save.state.player.x = ferry.x + 320;
  save.state.player.y = ferry.y + 112;
  save.state.quest.step = 'Find the stranded ferryman';

  const ferryEngine = new AdventureEngine();
  assert.equal(ferryEngine.loadSave(save), true);
  assert.equal(ferryEngine.requestGuide(), true);
  assert.equal(ferryEngine.getState().guideDirection, 'down');
  assert.match(ferryEngine.getState().guideMessage ?? '', /Stranded Ferryman/);
});

test('the Guide routes around blocked terrain and reports when a screen has no open path', () => {
  const village = createEngine();
  const villageState = village.getState();
  assert.ok(villageState.player);
  villageState.quest.step = 'Speak with Elder Rowan';
  const villageOrigin = worldCellOrigin('village');
  villageState.player.x = villageOrigin.x + 510;
  villageState.player.y = villageOrigin.y + 350;

  assert.equal(village.requestGuide(), true);
  assert.ok(
    villageState.guideDirection === 'left' || villageState.guideDirection === 'right',
    'the route should go around the well instead of pointing directly through it',
  );
  assert.match(villageState.guideMessage ?? '', /toward Elder Rowan/);

  const blockedSave = createEngine().exportSave();
  assert.ok(blockedSave?.state.player);
  blockedSave.progress.world.unlockedRegions.push('drowned-marches');
  const chapel = worldCellOrigin('sunken-chapel');
  blockedSave.state.player.x = chapel.x + 110;
  blockedSave.state.player.y = chapel.y + 300;
  blockedSave.state.quest.step = 'Ring the three tide bells: Low, High, Low';

  const blocked = new AdventureEngine();
  assert.equal(blocked.loadSave(blockedSave), true);
  assert.equal(blocked.requestGuide(), true);
  assert.equal(blocked.getState().guideDirection, null);
  assert.equal(blocked.getState().guideCueKind, 'unavailable');
  assert.match(blocked.getState().guideMessage ?? '', /cannot find an open path/i);
  assert.equal(blocked.getState().guideCooldownMs, 0);

  const openSave = createEngine().exportSave();
  assert.ok(openSave?.state.player);
  openSave.progress.world.unlockedRegions.push('drowned-marches');
  openSave.progress.world.chapelGateOpen = true;
  openSave.progress.world.chapelPuzzleProgress = 3;
  openSave.state.player.x = chapel.x + 110;
  openSave.state.player.y = chapel.y + 300;
  openSave.state.quest.step = 'Ring the three tide bells: Low, High, Low';

  const open = new AdventureEngine();
  assert.equal(open.loadSave(openSave), true);
  assert.equal(open.requestGuide(), true);
  assert.ok(
    open.getState().guideDirection === 'right' || open.getState().guideDirection === 'up',
    'the local route should approach and pass through the open center of the sealed wall',
  );
  assert.match(open.getState().guideMessage ?? '', /Drowned Bellkeeper/);
});

test('guide points down the quest route and its saved cooldown grows with each use', () => 
{

  const engine = createEngine()
;

  engine.getState().quest = 
{

    title: 'The Silent Bell',
    description: 'Reach the crossing.',
    step: 'Travel to the Mournwater Crossing',
  
}
;

  assert.equal(engine.requestGuide(), true)
;

  assert.equal(engine.getState().guideDirection, 'right')
;

  assert.equal(engine.getState().guideCooldownMs, 15_000)
;

  assert.equal(engine.requestGuide(), false)
;

  engine.tick(50)
;

  assert.equal(engine.getState().guideCooldownMs, 14_950)
;


  engine.getState().guideCooldownMs = 0
;

  assert.equal(engine.requestGuide(), true)
;

  assert.equal(engine.getState().guideUses, 2)
;

  assert.equal(engine.getState().guideCooldownMs, 30_000)
;


  const save = engine.exportSave()
;

  assert.ok(save)
;

  const restored = new AdventureEngine()
;

  assert.equal(restored.loadSave(save), true)
;

  assert.equal(restored.getState().guideCooldownMs, 30_000)
;

  assert.equal(restored.getState().guideUses, 2)
;

}
)
;

test('an active Guide arrow follows the quest route when the player turns into another screen', () => {
  const engine = createEngine();
  const state = engine.getState();
  assert.ok(state.player);
  state.quest = {
    title: 'The Silent Bell',
    description: 'Reach the crossing.',
    step: 'Travel to the Mournwater Crossing',
  };

  assert.equal(engine.requestGuide(), true);
  assert.equal(state.guideDirection, 'right');

  const southfield = worldCellOrigin('southfield');
  state.player.x = southfield.x + 320;
  state.player.y = southfield.y + 240;
  engine.tick(16);
  assert.equal(state.guideDirection, 'down');
  assert.match(state.guideMessage ?? '', /^Head south through Bellward Pass\./);
  assert.match(state.hint, /Follow the guide: Head south through Bellward Pass\./);
});

test('an active Guide cue updates its arrow and hint when speaking advances the quest', () => {
  const save = createEngine().exportSave();
  assert.ok(save?.state.player);
  save.progress.world.unlockedRegions.push('drowned-marches');
  const ferry = worldCellOrigin('drowned-ferry');
  save.state.player.x = ferry.x + 320;
  save.state.player.y = ferry.y + 112;
  save.state.quest = {
    title: 'The Silent Bell',
    description: 'Find the stranded ferryman.',
    step: 'Find the stranded ferryman',
  };

  const engine = new AdventureEngine();
  assert.equal(engine.loadSave(save), true);
  const state = engine.getState();

  assert.equal(engine.requestGuide(), true);
  assert.equal(state.guideDirection, 'down');
  assert.match(state.guideMessage ?? '', /Stranded Ferryman/);

  moveToProp(engine, 'mournwater-ferryman');
  assert.equal(state.quest.step, 'Reach the Sunken Chapel approach');

  engine.tick(16);
  assert.equal(state.guideDirection, 'right');
  assert.match(state.guideMessage ?? '', /east|Sunken Chapel Approach/i);
  assert.doesNotMatch(state.guideMessage ?? '', /ferryman/i);
  assert.match(state.hint, /Follow the guide:/);
  assert.match(state.hint, /east|Sunken Chapel Approach/i);
  assert.doesNotMatch(state.hint, /ferryman/i);
});

test('an active Guide arrow appears when the player opens a previously blocked route', () => {
  const engine = createEngine();
  const state = engine.getState();
  assert.ok(state.player);
  const ruins = worldCellOrigin('ruins');
  state.player.x = ruins.x + 320;
  state.player.y = ruins.y + 240;
  state.quest = {
    title: 'The bells below',
    description: 'Enter the Ember Sanctum.',
    step: 'Enter the Ember Sanctum',
  };

  assert.equal(engine.requestGuide(), true);
  assert.equal(state.guideDirection, null);
  assert.ok(state.guideCueMs > 0);

  state.gateOpen = true;
  state.keyFound = true;
  engine.tick(16);
  assert.equal(state.guideDirection, 'up');
  assert.match(state.hint, /Follow the guide: Head north through/);
});


test('guide gives a nearby sealed-door clue instead of a misleading direction', () => 
{

  const engine = createEngine()
;

  const player = engine.getState().player
;

  assert.ok(player)
;

  const chapel = worldCellOrigin('sunken-chapel')
;

  player.x = chapel.x + 320
;

  player.y = chapel.y + 235
;

  assert.equal(engine.requestGuide(), true)
;

  assert.equal(engine.getState().guideDirection, null)
;

  assert.match(engine.getState().hint, /not opened with a weapon.*Low → High → Low/i)
;
  const clueHint = engine.getState().hint;
  engine.tick(16);
  assert.equal(engine.getState().hint, clueHint, 'route refreshes must not replace a nearby clue');

}
)
;


test('saves that already completed the old tutorial migrate into the first story objective', () => 
{

  const engine = createEngine()
;

  const save = engine.exportSave()
;

  assert.ok(save)
;

  save.state.bossDefeated = true
;

  save.state.quest = 
{
 title: 'Bells at dawn', description: 'Completed.', step: 'Journey complete' 
}
;

  const loaded = new AdventureEngine()
;


  assert.equal(loaded.loadSave(save), true)
;

  assert.equal(loaded.getState().quest.step, 'Travel to the Mournwater Crossing')
;

  assert.ok(loaded.getWorldProgress().silencedBells.includes('hearthglen'))
;

}
)
;

test('a saved completed tide-bell sequence restores its open seal, quest, and bellkeeper', () => {
  const save = createEngine().exportSave();
  assert.ok(save);
  const origin = worldCellOrigin('sunken-chapel');
  save.progress.world!.chapelPuzzleProgress = 3;
  save.progress.world!.chapelGateOpen = false;
  save.state.quest = {
    title: 'The Silent Bell',
    description: 'Ring the bells to open the inner door.',
    step: 'Ring the three tide bells: Low, High, Low',
  };
  save.state.player!.x = origin.x + 320;
  save.state.player!.y = origin.y + 340;

  const loaded = new AdventureEngine();
  assert.equal(loaded.loadSave(save), true);
  assert.equal(loaded.getWorldProgress().chapelGateOpen, true);
  assert.equal(loaded.getState().quest.step, 'Defeat the Drowned Bellkeeper');
  assert.ok(loaded.getEnemies().some((enemy) => enemy.id === 'sunken-chapel:chapel-bellkeeper'));
});

test('Mournwater sells regional gear, allows sales, scales paid training, and gives Marches clues', () => {
  const shop = createEngine();
  const shopPlayer = shop.getState().player;
  assert.ok(shopPlayer);
  const town = worldCellOrigin('mournwater-town');
  shopPlayer.x = town.x + 320;
  shopPlayer.y = town.y + 240;
  shopPlayer.coins = 8;
  for (const id of ['mournwater-apothecary', 'mournwater-trainer', 'mournwater-storyteller']) {
    assert.ok(shop.getProps().some((prop) => prop.id === id), `${id} is present in town`);
  }
  moveToProp(shop, 'mournwater-apothecary');
  assert.equal(shop.getState().overlay, 'shop');
  assert.equal(shopPlayer.coins, 8, 'opening the market does not buy automatically');
  shop.buyShopItem('small-tonic');
  assert.equal(shopPlayer.coins, 0);
  assert.ok(shop.getState().inventory.some((item) => item.id === 'small-tonic'));

  const market = createEngine();
  const buyer = market.getState().player!;
  buyer.x = town.x + 320;
  buyer.y = town.y + 240;
  buyer.coins = 400;
  market.buyShopItem('reedline-sabre');
  market.buyShopItem('peatweave-vest');
  market.buyShopItem('ferry-token-loop');
  assert.ok(market.getState().inventory.some((item) => item.id === 'reedline-sabre'));
  assert.ok(market.getState().inventory.some((item) => item.id === 'peatweave-vest'));
  assert.ok(market.getState().inventory.some((item) => item.id === 'ferry-token-loop'));
  const sale = market.getState().inventory.find((item) => item.id === 'reedline-sabre')!;
  sale.equipped = false;
  const balanceBeforeSale = buyer.coins;
  market.sellInventoryItem('reedline-sabre');
  assert.equal(buyer.coins, balanceBeforeSale + 29);
  assert.equal(market.getState().inventory.some((item) => item.id === 'reedline-sabre'), false);

  const training = createEngine();
  const trainee = training.getState().player;
  assert.ok(trainee);
  trainee.x = town.x + 320;
  trainee.y = town.y + 240;
  trainee.coins = 25;
  trainee.xp = 20;
  moveToProp(training, 'mournwater-trainer');
  assert.equal(training.getState().overlay, 'training');
  assert.equal(trainee.coins, 25, 'training does not spend before an amount is submitted');
  training.trainForShards(25);
  assert.equal(trainee.coins, 0);
  assert.equal(trainee.level, 2);
  assert.equal(trainee.xp, 10);
  assert.equal(trainee.trainingPoints, 1);

  const scaling = createEngine();
  const traineeWithSavings = scaling.getState().player!;
  traineeWithSavings.x = town.x + 320;
  traineeWithSavings.y = town.y + 240;
  traineeWithSavings.coins = 100;
  scaling.trainForShards(50);
  assert.equal(traineeWithSavings.coins, 50);
  assert.equal(getTrainingXpForShards(25), 60);
  assert.equal(getTrainingXpForShards(50), 150, 'doubling spend improves XP per shard');

  const storyteller = createEngine();
  const listener = storyteller.getState().player;
  assert.ok(listener);
  listener.x = town.x + 320;
  listener.y = town.y + 240;
  moveToProp(storyteller, 'mournwater-storyteller');
  assert.match(storyteller.getState().dialog ?? '', /waystones/i);
  assert.match(storyteller.getState().dialog ?? '', /hidden blade/i);
});

test('the Fallen Capital is a ruined realm with one safe stronghold for services and clues', () => {
  const origin = worldCellOrigin('capital-survivors-hold');
  const camp = createEngine();
  const listener = camp.getState().player!;
  listener.x = origin.x + 320;
  listener.y = origin.y + 240;
  const props = camp.getProps();
  for (const id of ['capital-captain', 'capital-quartermaster', 'capital-instructor', 'capital-stronghold-record']) {
    assert.ok(props.some((prop) => prop.id === id), `${id} is present in the stronghold`);
  }
  assert.equal(
    camp.getEnemies().some((enemy) => worldCellAt(enemy.x, enemy.y)?.id === 'capital-survivors-hold'),
    false,
    'players can speak with the survivors without a roaming encounter',
  );
  moveToProp(camp, 'capital-captain');
  assert.match(camp.getState().dialog ?? '', /one defensible block/i);

  const market = createEngine();
  const buyer = market.getState().player!;
  buyer.x = origin.x + 232;
  buyer.y = origin.y + 312;
  buyer.coins = 1000;
  moveToProp(market, 'capital-quartermaster');
  assert.equal(market.getState().overlay, 'shop');
  for (const id of ['watchcaptain-falchion', 'wallguard-coat', 'survivors-vow-ring', 'small-tonic']) {
    market.buyShopItem(id);
    assert.ok(market.getState().inventory.some((item) => item.id === id), `${id} is sold here`);
  }

  const training = createEngine();
  const trainee = training.getState().player!;
  trainee.x = origin.x + 410;
  trainee.y = origin.y + 312;
  trainee.coins = 25;
  trainee.xp = 20;
  moveToProp(training, 'capital-instructor');
  assert.equal(training.getState().overlay, 'training');
  training.trainForShards(25);
  assert.equal(trainee.coins, 0);
  assert.equal(trainee.level, 2);
  assert.equal(trainee.xp, 10);
});

test('authored non-town field screens have regional encounter groups and realm-native species', () => {
  const engine = createEngine();
  const enemies = engine.getEnemies();
  const npcSafeScreens = new Set([
    'village', 'mournwater-town', 'drowned-ferry', 'gleamharbor',
    'capital-survivors-hold',
    'mournwater-crossing', 'frostline-stair', 'glassward-entry',
    'capital-south-gate', 'resolve-bell-sanctum',
  ]);

  for (const cellId of npcSafeScreens) {
    assert.equal(enemies.some((enemy) => worldCellAt(enemy.x, enemy.y)?.id === cellId), false,
      `${cellId} is clear for talking`);
  }

  const regionNames = new Map<string, Set<string>>();
  const allSpecies = Object.values(REGIONAL_MONSTERS).flatMap((roster) => roster.map((monster) => monster.name));
  assert.equal(new Set(allSpecies).size, allSpecies.length, 'regional rosters do not share ordinary species');
  const bossArenaCells = new Set(['sanctum', 'sunken-chapel', 'last-ash-watch', 'joy-bell-sanctum', 'resolve-bell-sanctum']);
  for (const [regionId, roster] of Object.entries(REGIONAL_MONSTERS)) {
    const names = new Set(roster.map((monster) => monster.name));
    regionNames.set(regionId, new Set(enemies.filter((enemy) => names.has(enemy.name)).map((enemy) => enemy.name)));
    if (regionId !== 'first-hunger') {
      assert.ok(regionNames.get(regionId)!.size > 0, `${regionId} has its own monster species`);
    }
  }

  for (const cell of WORLD_CELLS) {
    if (!cell.contentReady || cell.regionId === 'first-hunger' || npcSafeScreens.has(cell.id) ||
        cell.roomId === 'village' || cell.roomId === 'sanctum' || cell.roomId === 'chapel' ||
        cell.id === 'gleamharbor' || bossArenaCells.has(cell.id)) continue;
    const occupants = enemies.filter((enemy) => worldCellAt(enemy.x, enemy.y)?.id === cell.id);
    if (occupants.some((enemy) => enemy.boss)) continue;
    assert.ok(occupants.filter((enemy) => !enemy.boss).length >= 2,
      `${cell.label} has a field encounter group`);
  }
});
