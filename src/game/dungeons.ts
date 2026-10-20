import { WORLD_CELL_HEIGHT as H, WORLD_CELL_WIDTH as W, type WorldCellEdge } from './worldMap';
import { HUNGER_GEAR, HUNGER_LAIRS, HUNGER_VANGUARD } from './hungerTerritory';
import { GLASSLANDS_LAIRS } from './glasslands';
import { MAIN_BOSS_SITES, REGIONAL_MINI_LAIRS } from './regionalDungeons';
import { DUNGEON_GEAR_REWARDS, MINI_DUNGEON_GEAR_REWARDS } from './regionalGear';
import type { WorldRegionId } from './worldMap';
import type { Item } from './data';

export const DUNGEON_ROWS = 4;
export const DUNGEON_COLUMNS = 8;
export const DRAINHOUSE_ID = 'marches-drainhouse';
export const DRAINHOUSE_KEY = 'sorrow-ward-key';
export const CHIMECRYPT_ID = 'marches-chimecrypt';
export const FLOODVAULT_ID = 'marches-floodvault';
export const MARCHES_KEYS = [DRAINHOUSE_KEY, 'sorrow-chime-key', 'sorrow-counterweight-key'] as const;
export type DungeonRoom = {
  id: string; row: number; column: number; label: string;
  exits: Partial<Record<WorldCellEdge, string>>;
  feature: 'entry' | 'clue' | 'valve' | 'door' | 'chest' | 'rest' | 'boss' | 'hall';
  gearReward?: Item;
};
export type DungeonDefinition = {
  id: string; label: string; entryCellId: string; entryRoomId: string;
  rooms: DungeonRoom[];
  bossName?: string; keyId?: string; puzzle?: 'anchors' | 'mirror' | 'hunt' | 'chimes' | 'weights';
  regionId?: WorldRegionId;
  role?: 'mini' | 'main';
  requiredKeys?: readonly string[];
  storyBoss?: WorldRegionId;
  bossTint?: number;
  discovery?: 'chimes' | 'lantern';
  puzzleClue?: string; bossClue?: string;
  mechanismRooms?: string[];
  sealedEdge?: { roomId: string; edge: WorldCellEdge };
};
export type DungeonVisit = {
  id: string; roomId: string; returnX: number; returnY: number;
};
export type DungeonProgress = {
  discoveredRooms: string[]; openedChests: string[];
  valves: string[]; doorOpen: boolean; entranceOpen: boolean; bossDefeated: boolean;
};
const layout: [number, number, string, DungeonRoom['feature']][] = [
  [3, 0, 'Landing', 'entry'], [2, 0, 'Flood Record', 'clue'],
  [2, 1, 'Intake Wheel', 'valve'], [1, 1, 'Silt Gallery', 'hall'],
  [1, 0, 'Salvage Vault', 'chest'], [0, 1, 'Drain Wheel', 'valve'],
  [0, 2, 'Dry Walk', 'hall'], [1, 2, 'Keeper’s Rest', 'rest'],
  [1, 3, 'Pressure Door', 'door'], [2, 3, 'Spillway', 'hall'],
  [3, 3, 'Sunken Treasury', 'chest'], [2, 4, 'Echo Channel', 'clue'],
  [2, 5, 'Reed Hall', 'hall'], [1, 5, 'Anchor Walk', 'hall'],
  [1, 6, 'Guardian Warning', 'clue'], [0, 6, 'Upper Cistern', 'chest'],
  [1, 7, 'The Anchor Chamber', 'boss'],
];
const rooms: DungeonRoom[] = layout.map(([row, column, label, feature]) => ({
  id: `${row}:${column}`, row, column, label, feature, exits: {},
}));
const links = [
  ['3:0', '2:0'], ['2:0', '2:1'], ['2:1', '1:1'], ['1:1', '1:0'],
  ['1:1', '0:1'], ['0:1', '0:2'], ['0:2', '1:2'], ['1:2', '1:1'],
  ['1:2', '1:3'], ['1:3', '2:3'], ['2:3', '3:3'], ['2:3', '2:4'],
  ['2:4', '2:5'], ['2:5', '1:5'], ['1:5', '1:6'], ['1:6', '0:6'],
  ['1:6', '1:7'],
];
for (const [a, b] of links) {
  const from = rooms.find((r) => r.id === a)!;
  const to = rooms.find((r) => r.id === b)!;
  const edge = to.row < from.row ? 'north' : to.row > from.row ? 'south'
    : to.column > from.column ? 'east' : 'west';
  const opposite = { north: 'south', south: 'north', east: 'west', west: 'east' } as const;
  from.exits[edge] = to.id;
  to.exits[opposite[edge]] = from.id;
}
// Each Marches lair is authored independently, not reflected from the Drainhouse.
function authoredRooms(
  layout: [number, number, string, DungeonRoom['feature']][], links: [string, string][],
): DungeonRoom[] {
  const result = layout.map(([row, column, label, feature]) => ({
    id: `${row}:${column}`, row, column, label, feature,
    exits: {} as DungeonRoom['exits'],
  }));
  for (const [a, b] of links) {
    const from = result.find((room) => room.id === a)!;
    const to = result.find((room) => room.id === b)!;
    const edge = to.row < from.row ? 'north' : to.row > from.row ? 'south'
      : to.column > from.column ? 'east' : 'west';
    from.exits[edge] = b;
    to.exits[({ north: 'south', south: 'north', east: 'west', west: 'east' } as const)[edge]] = a;
  }
  return result;
}
export const MARCHES_LAIRS: readonly DungeonDefinition[] = [
  {
    id: CHIMECRYPT_ID, label: 'The Reed-Chime Crypt', entryCellId: 'sunken-chapel-approach',
    regionId: 'drowned-marches', entryRoomId: '3:1', discovery: 'chimes',
    bossName: 'The Hollow Cantor', keyId: MARCHES_KEYS[1], puzzle: 'chimes',
    mechanismRooms: ['2:0', '0:2', '1:3'], sealedEdge: { roomId: '2:4', edge: 'east' },
    puzzleClue: 'At the chapel approach, follow the three old notes: Reed → Stone → Breath. Ring Reed in 2:0, Stone in 0:2, then Breath in 1:3. A wrong note resets the melody; all three remain reachable before the seal.',
    bossClue: 'The Hollow Cantor marks a wide ring. Stand inside its quiet center or outside the ring before the note lands.',
    rooms: authoredRooms([
      [3, 1, 'Waystone Stair', 'entry'], [2, 1, 'Cantor’s Epitaph', 'clue'],
      [2, 0, 'Reed Chime', 'valve'], [1, 1, 'Procession Hall', 'hall'],
      [0, 1, 'Choir Loft', 'hall'], [0, 2, 'Stone Chime', 'valve'],
      [1, 2, 'Singing Passage', 'hall'], [1, 3, 'Breath Chime', 'valve'],
      [0, 3, 'Cantor’s Offerings', 'chest'], [2, 3, 'Quiet Spring', 'rest'],
      [2, 2, 'Reliquary', 'chest'], [2, 4, 'Melody Seal', 'door'],
      [2, 5, 'Silent Procession', 'hall'], [3, 5, 'Burial Cache', 'chest'],
      [1, 5, 'Ring Warning', 'clue'], [1, 6, 'Last Chorus', 'hall'],
      [0, 6, 'Cantor’s Chamber', 'boss'], [0, 7, 'Choir Treasury', 'chest'],
    ], [
      ['3:1', '2:1'], ['2:1', '2:0'], ['2:1', '1:1'], ['1:1', '0:1'],
      ['0:1', '0:2'], ['0:2', '1:2'], ['1:2', '1:1'], ['1:2', '1:3'],
      ['1:3', '0:3'], ['1:3', '2:3'], ['2:3', '2:2'], ['2:3', '2:4'],
      ['2:4', '2:5'], ['2:5', '3:5'], ['2:5', '1:5'], ['1:5', '1:6'],
      ['1:6', '0:6'], ['0:6', '0:7'],
    ]),
  },
  {
    id: FLOODVAULT_ID, label: 'The Counterweight Vault', entryCellId: 'northbound-sluice',
    regionId: 'drowned-marches', entryRoomId: '0:0', discovery: 'lantern',
    bossName: 'Sluice Ironclad', keyId: MARCHES_KEYS[2], puzzle: 'weights',
    mechanismRooms: ['1:1', '3:1', '3:3'], sealedEdge: { roomId: '1:4', edge: 'east' },
    puzzleClue: 'Set the three counterweights with B. Each cycles Low → Middle → High → Low. West (1:1) must be High, Deep (3:1) Middle, East (3:3) High. The seal checks their settings, not their order.',
    bossClue: 'Sluice Ironclad alternates a marked horizontal surge and a vertical surge. Move out of the marked lane before it strikes.',
    rooms: authoredRooms([
      [0, 0, 'Floodgate Ladder', 'entry'], [0, 1, 'Weight Diagram', 'clue'],
      [1, 1, 'West Counterweight', 'valve'], [1, 0, 'Worker’s Cache', 'chest'],
      [2, 1, 'Chain Gallery', 'hall'], [3, 1, 'Deep Counterweight', 'valve'],
      [3, 2, 'Lower Gantry', 'hall'], [2, 2, 'Restoration Spring', 'rest'],
      [3, 3, 'East Counterweight', 'valve'], [2, 3, 'Upper Gantry', 'hall'],
      [1, 3, 'Survey Record', 'clue'], [1, 4, 'Balanced Seal', 'door'],
      [1, 5, 'Overflow Hall', 'hall'], [0, 5, 'Flood Warning', 'clue'],
      [0, 6, 'Ironclad Walk', 'hall'], [0, 7, 'Sluice Engine', 'boss'],
      [2, 5, 'Paymaster’s Cache', 'chest'], [3, 5, 'Abandoned Bunks', 'hall'],
      [3, 6, 'Engine Treasury', 'chest'],
    ], [
      ['0:0', '0:1'], ['0:1', '1:1'], ['1:1', '1:0'], ['1:1', '2:1'],
      ['2:1', '3:1'], ['3:1', '3:2'], ['3:2', '2:2'], ['2:2', '2:1'],
      ['3:2', '3:3'], ['3:3', '2:3'], ['2:3', '1:3'], ['1:3', '1:4'],
      ['1:4', '1:5'], ['1:5', '0:5'], ['0:5', '0:6'], ['0:6', '0:7'],
      ['1:5', '2:5'], ['2:5', '3:5'], ['3:5', '3:6'],
    ]),
  },
];
const GLASS_DUNGEON_LAYOUT: [number, number, string, DungeonRoom['feature']][] = [
  [3, 0, 'Arrival Gallery', 'entry'], [2, 0, 'Keeper’s Inscription', 'clue'],
  [2, 1, 'West Chime', 'valve'], [1, 1, 'Singing Hall', 'hall'],
  [1, 0, 'Moth Reliquary', 'chest'], [0, 1, 'East Chime', 'valve'],
  [0, 2, 'Prism Walk', 'hall'], [1, 2, 'Quiet Spring', 'rest'],
  [1, 3, 'Facet Seal', 'door'], [2, 3, 'Shiver Gallery', 'hall'],
  [3, 3, 'Garden Cache', 'chest'], [2, 4, 'Second Inscription', 'clue'],
  [2, 5, 'Mirror Procession', 'hall'], [1, 5, 'Warning Walk', 'clue'],
  [1, 6, 'Last Reflection', 'hall'], [0, 6, 'Keeper’s Gift', 'chest'],
  [1, 7, 'Mini-boss Chamber', 'boss'],
];
const GLASS_DUNGEON_LINKS: [string, string][] = [
  ['3:0', '2:0'], ['2:0', '2:1'], ['2:1', '1:1'], ['1:1', '1:0'],
  ['1:1', '0:1'], ['0:1', '0:2'], ['0:2', '1:2'], ['1:2', '1:1'],
  ['1:2', '1:3'], ['1:3', '2:3'], ['2:3', '3:3'], ['2:3', '2:4'],
  ['2:4', '2:5'], ['2:5', '1:5'], ['1:5', '1:6'], ['1:6', '0:6'],
  ['1:6', '1:7'],
];
const glasslandsDungeons: DungeonDefinition[] = GLASSLANDS_LAIRS.map((lair, index) => {
  const horizontal = index === 1;
  const vertical = index === 2;
  const transform = (row: number, column: number) => ({
    row: vertical ? 3 - row : row,
    column: horizontal ? 7 - column : column,
  });
  const idFor = (oldId: string) => {
    const [row, column] = oldId.split(':').map(Number);
    const point = transform(row!, column!);
    return `${point.row}:${point.column}`;
  };
  const layout: [number, number, string, DungeonRoom['feature']][] = GLASS_DUNGEON_LAYOUT.map(([row, column, label, feature]) => {
      const point = transform(row, column);
      return [point.row, point.column, `${lair.label} · ${label}`, feature];
    });
  const links: [string, string][] = GLASS_DUNGEON_LINKS.map(([from, to]) => [idFor(from), idFor(to)]);
  const rooms = authoredRooms(layout, links);
  return {
    id: lair.id, label: lair.label, entryCellId: lair.cellId,
    entryRoomId: idFor('3:0'), rooms, bossName: lair.boss, keyId: lair.key,
    puzzle: lair.puzzle, regionId: 'glasslands', role: 'mini',
    mechanismRooms: ['2:1', '0:1'].map(idFor),
    puzzleClue: lair.clue,
    bossClue: `${lair.boss} marks its strike before it lands. Move out of the warning.`,
    sealedEdge: { roomId: idFor('1:3'), edge: vertical ? 'north' : 'south' },
  };
});

function regionalDungeonMap(label: string, index: number) {
  const horizontal = index % 2 === 1;
  const vertical = index % 3 === 2;
  const transform = (row: number, column: number) => ({
    row: vertical ? 3 - row : row,
    column: horizontal ? 7 - column : column,
  });
  const idFor = (oldId: string) => {
    const [row, column] = oldId.split(':').map(Number);
    const point = transform(row!, column!);
    return `${point.row}:${point.column}`;
  };
  const transformedLayout = GLASS_DUNGEON_LAYOUT.map(([row, column, roomLabel, feature]) => {
    const point = transform(row, column);
    return [point.row, point.column, `${label} · ${roomLabel}`, feature] as
      [number, number, string, DungeonRoom['feature']];
  });
  const transformedLinks = GLASS_DUNGEON_LINKS.map(([from, to]) => [idFor(from), idFor(to)] as [string, string]);
  return {
    rooms: authoredRooms(transformedLayout, transformedLinks),
    entryRoomId: idFor('3:0'),
    mechanismRooms: ['2:1', '0:1'].map(idFor),
    sealedEdge: { roomId: idFor('1:3'), edge: vertical ? 'north' as const : 'south' as const },
  };
}

const regionalMiniDungeons: DungeonDefinition[] = REGIONAL_MINI_LAIRS.map((lair, index) => {
  const map = regionalDungeonMap(lair.label, index);
  const gearReward = MINI_DUNGEON_GEAR_REWARDS[lair.id];
  const rewardRoom = map.rooms.find((room) => room.feature === 'chest');
  if (gearReward && rewardRoom) rewardRoom.gearReward = gearReward;
  return {
    id: lair.id, label: lair.label, entryCellId: lair.cellId, regionId: lair.regionId,
    role: 'mini', entryRoomId: map.entryRoomId, rooms: map.rooms,
    bossName: lair.boss, keyId: lair.keyId, puzzle: lair.puzzle,
    mechanismRooms: map.mechanismRooms,
    puzzleClue: lair.clue,
    bossClue: `${lair.boss} gives a clear warning before each heavy strike. Leave the marked space before it lands.`,
    sealedEdge: map.sealedEdge,
  };
});

const mainBossDungeons: DungeonDefinition[] = MAIN_BOSS_SITES.map((site, index) => {
  if (site.regionId === 'first-hunger') {
    return {
      id: site.dungeonId,
      label: site.label,
      entryCellId: site.cellId,
      regionId: site.regionId,
      role: 'main',
      storyBoss: site.regionId,
      requiredKeys: site.requiredKeys,
      entryRoomId: '2:0',
      rooms: authoredRooms([
        [2, 0, 'Maw Threshold', 'entry'],
        [2, 1, 'The Heartless Road', 'hall'],
        [1, 1, 'The First Hunger', 'boss'],
      ], [['2:0', '2:1'], ['2:1', '1:1']]),
      bossName: site.bossName,
      puzzle: 'hunt',
      bossTint: 0xf033bc,
      puzzleClue: 'The threshold opens after the First Echo falls. Read the warnings, then face the creature in the inner chamber.',
      bossClue: 'The First Hunger cycles through five attack shapes. Leave the marked space before each strike.',
    };
  }
  const map = regionalDungeonMap(site.label, index + 1);
  const gearReward = DUNGEON_GEAR_REWARDS[site.regionId];
  const rewardRoom = map.rooms.find((room) => room.feature === 'chest');
  if (gearReward && rewardRoom) rewardRoom.gearReward = gearReward;
  return {
    id: site.dungeonId, label: site.label, entryCellId: site.cellId, regionId: site.regionId,
    role: 'main', storyBoss: site.regionId, requiredKeys: site.requiredKeys,
    entryRoomId: map.entryRoomId, rooms: map.rooms,
    bossName: site.bossName, puzzle: (['chimes', 'weights', 'anchors', 'mirror', 'hunt', 'anchors'] as const)[index],
    bossTint: [0xc58f50, 0x5799a8, 0xe07042, 0xa5c9d5, 0x8571a7, 0xf033bc][index],
    mechanismRooms: map.mechanismRooms, puzzleClue: 'Explore the connected rooms, read the inscriptions, and open the sealed passage before approaching the bellkeeper.',
    bossClue: `${site.bossName} telegraphs every dangerous attack. Move beyond the marked lanes before the strike lands.`,
    sealedEdge: map.sealedEdge,
  };
});

const hungerVanguardRooms = authoredRooms([
  [3, 0, 'Echo Threshold', 'entry'],
  [2, 0, 'Unremembered Passage', 'hall'],
  [2, 1, 'The Last Record', 'clue'],
  [1, 1, 'Hollow Gallery', 'hall'],
  [1, 2, 'Forgotten Blade Cache', 'chest'],
  [2, 2, 'Oathbound Cache', 'chest'],
  [0, 1, 'Sheltered Reliquary', 'chest'],
  [0, 2, 'Approach of the Echo', 'hall'],
  [0, 3, 'The First Echo', 'boss'],
], [
  ['3:0', '2:0'], ['2:0', '2:1'], ['2:1', '1:1'], ['1:1', '1:2'],
  ['2:1', '2:2'], ['1:1', '0:1'], ['0:1', '0:2'], ['0:2', '0:3'],
]);
for (const [roomId, index] of [['1:2', 0], ['2:2', 1], ['0:1', 2]] as const) {
  const room = hungerVanguardRooms.find((candidate) => candidate.id === roomId);
  const reward = HUNGER_GEAR[index]?.item;
  if (room && reward) room.gearReward = reward;
}

const hungerVanguardDungeon: DungeonDefinition = {
  id: HUNGER_VANGUARD.id,
  label: HUNGER_VANGUARD.label,
  entryCellId: HUNGER_VANGUARD.cellId,
  entryRoomId: '3:0',
  regionId: 'first-hunger',
  role: 'mini',
  keyId: HUNGER_VANGUARD.key,
  bossName: HUNGER_VANGUARD.boss,
  puzzle: 'hunt',
  puzzleClue: 'The First Echo guards the only path beyond Maelis. The ruined records mark its lair; no bell-key sequence is needed.',
  bossClue: 'The First Echo folds between the marked strike and its target. Keep moving after the warning fades.',
  rooms: hungerVanguardRooms,
};

export const DUNGEONS: readonly DungeonDefinition[] = [{
  id: DRAINHOUSE_ID, label: 'The Drowned Drainhouse', entryCellId: 'wreckers-reach', regionId: 'drowned-marches',
  role: 'mini', keyId: DRAINHOUSE_KEY, bossName: 'The Floodgate Maw',
  entryRoomId: '3:0', rooms,
  sealedEdge: { roomId: '1:3', edge: 'south' },
}, ...MARCHES_LAIRS.map((lair) => {
  const gearReward = MINI_DUNGEON_GEAR_REWARDS[lair.id];
  const rooms = gearReward
    ? lair.rooms.map((room, index) => room.feature === 'chest' && index === lair.rooms.findIndex((entry) => entry.feature === 'chest')
      ? { ...room, gearReward } : room)
    : lair.rooms;
  return { ...lair, role: 'mini' as const, rooms };
}), ...HUNGER_LAIRS.map((lair, index): DungeonDefinition => {
  // Reflect the authored template into genuinely different routes; do not
  // share progress, actors, rewards or physical room coordinates across lairs.
  const transform = (row: number, column: number) => ({
    row: index === 2 ? 3 - row : row,
    column: index === 1 || index === 2 ? 7 - column : column,
  });
  const idFor = (oldId: string) => {
    const [r, c] = oldId.split(':').map(Number);
    const p = transform(r, c); return `${p.row}:${p.column}`;
  };
  const lairRooms: DungeonRoom[] = rooms.map((room) => ({
    ...room, ...transform(room.row, room.column), id: idFor(room.id),
    label: `${lair.label} · ${({
      entry: 'Threshold', clue: 'Warden’s record', valve: lair.puzzle === 'mirror' ? 'Lens' : lair.puzzle === 'hunt' ? 'Soul ward' : 'Bone anchor',
      door: 'Inner seal', chest: 'Memory cache', rest: 'Free spring', boss: lair.boss, hall: 'Guardian passage',
    })[room.feature]}`,
    exits: {},
  }));
  for (const [a, b] of links) {
    const from = lairRooms.find((r) => r.id === idFor(a))!;
    const to = lairRooms.find((r) => r.id === idFor(b))!;
    const edge = to.row < from.row ? 'north' : to.row > from.row ? 'south' : to.column > from.column ? 'east' : 'west';
    from.exits[edge] = to.id;
    to.exits[({ north: 'south', south: 'north', east: 'west', west: 'east' } as const)[edge]] = from.id;
  }
  return { id: lair.id, label: lair.label, entryCellId: lair.cellId, role: 'mini',
    entryRoomId: idFor('3:0'), rooms: lairRooms, bossName: lair.boss,
     regionId: 'first-hunger', keyId: lair.key, puzzle: lair.puzzle, mechanismRooms: [idFor('2:1'), idFor('0:1')],
    sealedEdge: { roomId: idFor('1:3'), edge: index === 2 ? 'north' : 'south' } };
}), hungerVanguardDungeon, ...glasslandsDungeons, ...regionalMiniDungeons, ...mainBossDungeons];
export const dungeonById = (id: string) => DUNGEONS.find((d) => d.id === id);
export const dungeonRoomAt = (id: string, x: number, y: number) =>
  dungeonById(id)?.rooms.find((r) => r.column === Math.floor(x / W) && r.row === Math.floor(y / H));
export const dungeonRoomOrigin = (room: DungeonRoom) => ({ x: room.column * W, y: room.row * H });
export const initialDungeonProgress = (): DungeonProgress => ({
  discoveredRooms: [], openedChests: [], valves: [], doorOpen: false,
  entranceOpen: false, bossDefeated: false,
});

/** One source of truth for movement, doorway rendering, and the connection map. */
export function dungeonPassageState(
  id: string, room: DungeonRoom, edge: WorldCellEdge, progress: DungeonProgress,
): 'wall' | 'open' | 'locked' {
  const dungeon = dungeonById(id);
  const neighbor = dungeon?.rooms.find((candidate) => candidate.id === room.exits[edge]);
  if (!neighbor) return 'wall';
  const opposite = { north: 'south', south: 'north', east: 'west', west: 'east' } as const;
  const delta = { north: [-1, 0], south: [1, 0], east: [0, 1], west: [0, -1] } as const;
  if (neighbor.exits[opposite[edge]] !== room.id ||
      neighbor.row !== room.row + delta[edge][0] ||
      neighbor.column !== room.column + delta[edge][1]) return 'wall';
  const seal = dungeon?.sealedEdge;
  if (seal && !progress.doorOpen &&
      ((room.id === seal.roomId && edge === seal.edge) ||
       (neighbor.id === seal.roomId && edge === opposite[seal.edge]))) return 'locked';
  return 'open';
}

export function normalizeDungeons(value: unknown): Record<string, DungeonProgress> {
  const result: Record<string, DungeonProgress> = {};
  if (!value || typeof value !== 'object') return result;
  for (const dungeon of DUNGEONS) {
    const raw = (value as Record<string, Partial<DungeonProgress>>)[dungeon.id];
    if (!raw || typeof raw !== 'object') continue;
    const strings = (v: unknown) => Array.isArray(v) ? [...new Set(v.filter((s): s is string => typeof s === 'string'))] : [];
    result[dungeon.id] = {
      discoveredRooms: strings(raw.discoveredRooms).filter((id) => dungeon.rooms.some((r) => r.id === id)),
      openedChests: strings(raw.openedChests), valves: strings(raw.valves),
      doorOpen: raw.doorOpen === true, entranceOpen: raw.entranceOpen === true,
      bossDefeated: raw.bossDefeated === true,
    };
  }
  return result;
}

/** Collision is shared by actors and players; nonexistent cells never become floor. */
export function dungeonBlocked(id: string, progress: DungeonProgress, x: number, y: number): boolean {
  const room = dungeonRoomAt(id, x, y);
  if (!room || x < 18 || y < 18 || x > DUNGEON_COLUMNS * W - 18 || y > DUNGEON_ROWS * H - 18) return true;
  const lx = x - room.column * W, ly = y - room.row * H;
  const open = (edge: WorldCellEdge) => dungeonPassageState(id, room, edge, progress) === 'open';
  if (lx < 18 && (!open('west') || ly < 202 || ly > 278)) return true;
  if (lx > W - 18 && (!open('east') || ly < 202 || ly > 278)) return true;
  if (ly < 18 && (!open('north') || lx < 272 || lx > 368)) return true;
  if (ly > H - 18 && (!open('south') || lx < 272 || lx > 368)) return true;
  // Authored rubble leaves both the central crossing and every exit approach clear.
  return (lx > 82 && lx < 180 && ly > 78 && ly < 142) ||
    (lx > 460 && lx < 552 && ly > 336 && ly < 404);
}
