import assert from 'node:assert/strict';
import test from 'node:test';
import { Children, createElement, isValidElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AdventureEngine, type SavedRun } from './simulation';
import { saveJourneyAndReturnToTitle } from './session';
import { WELLS, DEFAULT_WELL_ID, normalizeWell } from './wells';
import { BELL_REGION_IDS, WORLD_CELLS, worldCellOrigin } from './worldMap';
import { DUNGEONS, dungeonRoomOrigin, initialDungeonProgress } from './dungeons';
import { GameMenu } from './GameMenu';

function ready() {
  const engine = new AdventureEngine();
  engine.startNewGame({ name: 'Traveler', classId: 'warrior', skin: '#d99168',
    hairStyle: 'cropped', hairColor: '#3a2926', clothingColor: '#d36345' });
  const save = engine.exportSave()!;
  save.state.player!.level = 25;
  save.progress.world!.silencedBells = [...BELL_REGION_IDS];
  save.progress.world!.unlockedRegions = [...BELL_REGION_IDS, 'first-hunger'];
  assert.ok(engine.loadSave(save));
  engine.getState().dialog = null;
  return engine;
}

test('every realm has an arrival well, a pre-boss well, and every dungeon has an entry well', () => {
  for (const regionId of [...BELL_REGION_IDS, 'first-hunger']) {
    const worldWells = WELLS.filter((well) => !well.dungeonId &&
      WORLD_CELLS.find((cell) => cell.id === well.cellId)?.regionId === regionId);
    assert.equal(worldWells.length, 2, regionId);
    assert.ok(worldWells.every((well) => WORLD_CELLS.find((cell) => cell.id === well.cellId)?.contentReady));
  }
  for (const dungeon of DUNGEONS.filter((entry) =>
    WORLD_CELLS.some((cell) => cell.id === entry.entryCellId && cell.contentReady))) assert.ok(WELLS.some((well) =>
    well.dungeonId === dungeon.id && well.roomId === dungeon.entryRoomId));
});

test('all overworld wells can actually be used with B and recalled after saving', () => {
  for (const well of WELLS.filter((well) => !well.dungeonId)) {
    const engine = ready();
    const player = engine.getState().player!;
    player.x = well.x; player.y = well.y + 40;
    engine.tick(1);
    player.hp = 3; player.resource = 1;
    engine.pressButton('context');
    assert.equal(engine.getWorldProgress().lastWell.id, well.id, well.label);
    assert.equal(player.hp, player.maxHp);
    assert.equal(player.resource, player.maxResource);
    assert.ok(engine.consumeCheckpointSaveRequest());
    assert.equal(engine.consumeCheckpointSaveRequest(), false);
    const save = engine.exportSave()!;
    const elsewhere = worldCellOrigin(well.cellId === 'village' ? 'ruins' : 'village');
    save.state.player!.x = elsewhere.x + 320;
    save.state.player!.y = elsewhere.y + 344;
    const resumed = new AdventureEngine();
    assert.ok(resumed.loadSave(JSON.parse(JSON.stringify(save))));
    assert.ok(resumed.returnToLastWell());
    assert.equal(resumed.getState().player!.x, well.x);
    assert.equal(resumed.getState().player!.y, well.y + 40);
    resumed.setAnalogMovement(1, 0);
    resumed.tick(50);
    assert.ok(resumed.getState().player!.x > well.x, `${well.label}: return point must allow movement`);
  }
});

test('death returns the player to the last activated well and preserves the journey', () => {
  const engine = ready();
  const checkpoint = WELLS.find((well) => well.id === 'well:chapel-forecourt');
  assert.ok(checkpoint);
  const save = engine.exportSave()!;
  const village = worldCellOrigin('village');
  save.state.player!.x = village.x + 320;
  save.state.player!.y = village.y + 344;
  save.state.player!.hp = 1;
  save.state.player!.coins = 25;
  save.progress.world!.lastWell = { id: checkpoint.id };
  assert.ok(engine.loadSave(save));

  const damagePlayer = (engine as unknown as { damagePlayer: (amount: number) => void }).damagePlayer;
  damagePlayer.call(engine, 1);

  const player = engine.getState().player!;
  assert.equal(player.x, checkpoint.x);
  assert.equal(player.y, checkpoint.y + 40);
  assert.equal(player.hp, player.maxHp);
  assert.equal(player.resource, player.maxResource);
  assert.equal(player.coins, 15, 'death keeps the existing 10-shard penalty');
  assert.match(engine.getState().hint, /returned to Chapel approach well/);
  assert.equal(engine.getWorldProgress().lastWell.id, checkpoint.id);
});

test('dungeon wells recall the correct entry room and preserve the original overworld exit', () => {
  for (const well of WELLS.filter((well) => well.dungeonId)) {
    const engine = ready();
    const save = engine.exportSave()!;
    const outside = worldCellOrigin(well.cellId);
    const progress = initialDungeonProgress();
    progress.entranceOpen = true;
    save.progress.world!.dungeons[well.dungeonId!] = progress;
    save.progress.world!.activeDungeon = { id: well.dungeonId!, roomId: well.roomId!,
      returnX: outside.x + 320, returnY: outside.y + 344 };
    save.state.player!.x = well.x; save.state.player!.y = well.y + 40;
    assert.ok(engine.loadSave(save));
    engine.getState().dialog = null;
    engine.pressButton('context');
    assert.equal(engine.getWorldProgress().lastWell.id, well.id, well.label);
    const traveled = engine.exportSave()!;
    traveled.progress.world!.activeDungeon = null;
    const home = worldCellOrigin('village');
    traveled.state.player!.x = home.x + 320; traveled.state.player!.y = home.y + 344;
    assert.ok(engine.loadSave(traveled));
    assert.ok(engine.returnToLastWell());
    assert.deepEqual(engine.getWorldProgress().activeDungeon, {
      id: well.dungeonId, roomId: well.roomId,
      returnX: outside.x + 320, returnY: outside.y + 344,
    });
    assert.equal(engine.getState().player!.x, well.x);
    assert.ok(engine.getProps().some((prop) => prop.id === well.id));
  }
});

test('journey menu pauses movement, powers, cooldowns and respawns, then resumes', () => {
  const engine = ready();
  const ticking = engine.exportSave()!;
  ticking.state.abilities[0].remainingMs = 1500;
  ticking.progress.respawns = [{ id: 'canopy:canopy-slime-a', cell: 'canopy', remainingMs: 1000, generation: 1 }];
  ticking.progress.defeatedIds.push('canopy:canopy-slime-a');
  ticking.actors = ticking.actors.filter((actor) => actor.id !== 'canopy:canopy-slime-a');
  assert.ok(engine.loadSave(ticking));
  engine.drainAudioEvents();
  engine.openMenu('settings');
  const before = engine.exportSave()!;
  engine.setAnalogMovement(1, 0);
  engine.pressButton('attack');
  engine.pressButton('ability0');
  engine.tick(1000);
  assert.deepEqual(engine.exportSave(), before);
  assert.deepEqual(engine.drainAudioEvents(), []);
  engine.closeMenu();
  engine.tick(50);
  assert.equal(engine.getState().player!.x, before.state.player!.x, 'paused inputs must not leave movement held');
  engine.setAnalogMovement(1, 0);
  engine.tick(50);
  assert.ok(engine.getState().player!.x > before.state.player!.x);
});

test('recalling an overworld well from a dungeon keeps that room’s enemies and puzzle progress', () => {
  const engine = ready();
  const dungeon = DUNGEONS[0];
  const hall = dungeon.rooms.find((room) => room.feature === 'hall')!;
  const origin = dungeonRoomOrigin(hall);
  const outside = worldCellOrigin(dungeon.entryCellId);
  const save = engine.exportSave()!;
  save.progress.world!.activeDungeon = { id: dungeon.id, roomId: hall.id,
    returnX: outside.x + 320, returnY: outside.y + 344 };
  save.progress.world!.dungeons[dungeon.id] = { ...initialDungeonProgress(), entranceOpen: true, doorOpen: true };
  save.state.player!.x = origin.x + 320; save.state.player!.y = origin.y + 344;
  assert.ok(engine.loadSave(save));
  const wounded = engine.getEnemies().find((enemy) => !enemy.boss)!;
  assert.ok(wounded);
  wounded.hp = 7;
  assert.ok(engine.returnToLastWell());
  assert.equal(engine.getWorldProgress().activeDungeon, null);
  assert.equal(engine.getWorldProgress().dungeons[dungeon.id].doorOpen, true);
  const later = engine.exportSave()!;
  later.progress.world!.activeDungeon = save.progress.world!.activeDungeon;
  later.state.player!.x = origin.x + 320; later.state.player!.y = origin.y + 344;
  assert.ok(engine.loadSave(later));
  assert.equal(engine.getEnemies().find((enemy) => enemy.id === wounded.id)?.hp, 7);
});

test('return to title writes a playable journey first and does not quit when saving fails', () => {
  const engine = ready();
  engine.getState().player!.coins = 432;
  engine.openMenu('settings');
  assert.equal(saveJourneyAndReturnToTitle(engine, () => { throw new Error('Storage full'); }), false);
  assert.equal(engine.getState().mode, 'playing');
  assert.equal(engine.getState().overlay, 'settings');
  let saved: SavedRun | undefined;
  assert.ok(saveJourneyAndReturnToTitle(engine, (save) => { saved = JSON.parse(JSON.stringify(save)); }));
  assert.equal(engine.getState().mode, 'title');
  assert.equal(engine.exportSave(), null);
  const resumed = new AdventureEngine();
  assert.ok(resumed.loadSave(saved!));
  assert.equal(resumed.getState().mode, 'playing');
  assert.equal(resumed.getState().overlay, null);
  assert.equal(resumed.getState().player!.coins, 432);
});

test('legacy and malformed checkpoints safely use Hearthglen; menu exposes all requested controls', () => {
  assert.deepEqual(normalizeWell(), { id: DEFAULT_WELL_ID });
  assert.deepEqual(normalizeWell({ id: 'missing' }), { id: DEFAULT_WELL_ID });
  const engine = ready();
  const legacy = engine.exportSave()!;
  delete (legacy.progress.world as Partial<NonNullable<typeof legacy.progress.world>>).lastWell;
  assert.ok(engine.loadSave(legacy));
  assert.equal(engine.getWorldProgress().lastWell.id, DEFAULT_WELL_ID);
  const markup = renderToStaticMarkup(createElement(GameMenu, {
    preferences: { musicMuted: true, battleMuted: false, musicVolume: 0.4, battleVolume: 0.75 }, changePreferences: () => {},
    wellName: 'Hearthglen well', canReturn: false, returnToWell: () => false,
    returnToTitle: () => false, close: () => {}, audioNotice: null, saveFailed: true,
  }));
  for (const label of ['Music', 'Music volume', 'Battle sounds', 'Battle-sound volume', 'Return to last well', 'Save &amp; return to title',
    'Resume adventure', 'Your journey could not be saved']) assert.ok(markup.includes(label), label);
  assert.ok(markup.includes('aria-checked="false"'));
  assert.ok(markup.includes('aria-checked="true"'));
  assert.ok(markup.includes('disabled=""'));
});

test('menu buttons call the independent audio, recall and title actions', () => {
  let changed: { musicMuted: boolean; battleMuted: boolean; musicVolume: number; battleVolume: number } | undefined;
  let recalled = 0;
  let quit = 0;
  const tree = GameMenu({
    preferences: { musicMuted: true, battleMuted: true, musicVolume: 0.3, battleVolume: 0.8 },
    changePreferences: (preferences) => { changed = preferences; },
    wellName: 'Hearthglen well', canReturn: true,
    returnToWell: () => { recalled++; return true; },
    returnToTitle: () => { quit++; return true; }, close: () => {},
    audioNotice: null, saveFailed: false,
  });
  const clickHandlers = new Map<string, () => void>();
  const changeHandlers = new Map<string, (event: { currentTarget: { value: string } }) => void>();
  const walk = (node: ReactNode) => {
    Children.forEach(node, (child) => {
      if (!isValidElement(child)) return;
      const props = child.props as Record<string, unknown>;
      if (typeof props['data-testid'] === 'string') {
        clickHandlers.set(props['data-testid'], props.onClick as () => void);
        changeHandlers.set(props['data-testid'], props.onChange as (event: { currentTarget: { value: string } }) => void);
      }
      walk(props.children as ReactNode);
    });
  };
  walk(tree);
  clickHandlers.get('toggle-music')!();
  assert.deepEqual(changed, { musicMuted: false, battleMuted: true, musicVolume: 0.3, battleVolume: 0.8 });
  clickHandlers.get('toggle-battle-sounds')!();
  assert.deepEqual(changed, { musicMuted: true, battleMuted: false, musicVolume: 0.3, battleVolume: 0.8 });
  changeHandlers.get('volume-music')!({ currentTarget: { value: '45' } });
  assert.deepEqual(changed, { musicMuted: true, battleMuted: true, musicVolume: 0.45, battleVolume: 0.8 });
  changeHandlers.get('volume-battle')!({ currentTarget: { value: '65' } });
  assert.deepEqual(changed, { musicMuted: true, battleMuted: true, musicVolume: 0.3, battleVolume: 0.65 });
  clickHandlers.get('button-return-well')!(); clickHandlers.get('button-return-title')!();
  assert.equal(recalled, 1);
  assert.equal(quit, 1);
});
