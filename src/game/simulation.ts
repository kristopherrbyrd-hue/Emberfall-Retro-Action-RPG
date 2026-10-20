import { DRAINHOUSE_ID, DRAINHOUSE_KEY, DUNGEONS, MARCHES_LAIRS, MARCHES_KEYS, dungeonById, dungeonRoomAt, dungeonRoomOrigin,
  dungeonBlocked, initialDungeonProgress, type DungeonDefinition, type DungeonProgress } from './dungeons';
import { MAIN_BOSS_SITES, REGIONAL_MINI_LAIRS, mainBossAt, regionalLairAt } from './regionalDungeons';
import { DUNGEON_GEAR_REWARDS, REGIONAL_FIELD_GEAR } from './regionalGear';
import {
  isPostgameEncounterCell,
  postgameCellClearReward,
  postgameEnemyStats,
  POSTGAME_GEAR_CLEAR_INTERVAL,
  postgameWaveMultiplier,
  type PostgameWaveStatus,
} from './postgame';
import { WELLS, wellById, type WellDefinition } from './wells';
import type { BattleSound, MusicScene } from './audio';
import {
  CLASSES,
  getSalvageXp,
  isLockableGear,
  POSTGAME_GEAR,
  requiresSalvageConfirmation,
  RUNE_ORDER,
  RUNE_SEQUENCE,
  ROOM_NAMES,
  WEAPON_FINDS,
  type AbilitySlot,
  type ButtonId,
  type CharacterConfig,
  type Direction,
  type EnemyHud,
  type GameSnapshot,
  type Item,
  type RoomId,
  type WeaponCombatEffect,
} from './data';
import {
  CLASS_DISCIPLINES,
  HERO_TREE_UNLOCK_LEVEL,
  HERO_UPGRADES,
  findClassPower,
  getDisciplineInvestment,
  getHeroUpgradeRank,
  getHeroTrainingBonuses,
  getRankedPowerAmount,
  getStartingPowerRanks,
  MAX_POWER_RANK,
  type HeroUpgradeDefinition,
} from './disciplines';
import {
  ROOM_ORIGINS,
  WORLD_CELLS,
  WORLD_CELL_HEIGHT,
  WORLD_CELL_WIDTH,
  BELL_REGION_IDS,
  WORLD_REGION_IDS,
  WORLD_HEIGHT as MAP_WORLD_HEIGHT,
  WORLD_WIDTH as MAP_WORLD_WIDTH,
  WORLD_CELL_BORDER_THICKNESS,
  canCrossWorldBoundary,
  getWorldPathDirection,
  isWithinCellEdgeOpening,
  worldCellOrigin,
  roomAt,
  worldCellAt,
  type WorldCellEdge,
  type WorldRegionId,
} from './worldMap';
import {
  createInitialWorldProgress,
  MARCHES_TIDE_DURATION_MS,
  MAX_VEGETATION_HITS,
  normalizeWorldProgress,
  getWorldColorProfile,
  THORNBOUND_SEAL_HITS,
  type WorldProgress,
} from './worldProgress';
import { HUNGER_BALANCE, MAELIS_OPENING, MAELIS_OFFER, RESTORATION_DURATION_MS, RESTORATION_LINES, getRestorationCaption, type RestorationPresentation } from './finale';
import { HUNGER_ARENA, HUNGER_ENTRY, HUNGER_GEAR, HUNGER_KEYS, HUNGER_LEVEL, HUNGER_REGION,
  HUNGER_SPRING, HUNGER_VANGUARD_ID, HUNGER_VANGUARD_KEY,
  MAELIS_HUB, hungerSite } from './hungerTerritory';
import { GLASSLANDS_GEAR, GLASSLANDS_LAIRS } from './glasslands';
import { REGIONAL_MONSTERS, RANGED_MONSTER_NAMES } from './regionalMonsters';
import { getItemSellPrice, getTrainingXpForShards, shopStockForCell } from './shopEconomy';

export const SAVE_KEY = 'emberfall-save-v1';
export const SAVE_SLOT_KEYS = [
  SAVE_KEY,
  'emberfall-save-slot-2-v1',
  'emberfall-save-slot-3-v1',
] as const;
export const WORLD_WIDTH = MAP_WORLD_WIDTH;
export const WORLD_HEIGHT = MAP_WORLD_HEIGHT;
export const SUPPORTED_SAVE_VERSIONS: ReadonlySet<number> = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
export const ENEMY_RESPAWN_DELAY_MS = 90_000;
export const POSTGAME_WAVE_DELAY_MS = 120_000;
export const BOSS_HEALTH_MULTIPLIER = 9;
export const BOSS_DAMAGE_MULTIPLIER = 1.35;
export const BOSS_SPEED_MULTIPLIER = 1.7;
export const BOSS_MONSTER_SPEED_MIN = 104;
export const BOSS_MONSTER_SPEED_MAX = 110;
export const FIELD_MONSTER_SPEED_MIN = 100;
export const FIELD_MONSTER_SPEED_MAX = 110;
export const SOLO_MAELIS_LEVEL_REWARD = 15;

export function maelisSoloXpReward(level: number): number {
  let total = 0;
  const firstLevel = Math.max(1, Math.floor(level));
  for (let offset = 0; offset < SOLO_MAELIS_LEVEL_REWARD; offset += 1) {
    total += 70 + (firstLevel + offset - 1) * 60;
  }
  return total;
}

function tunedEnemySpeed(speed: number, boss = false): number {
  if (!Number.isFinite(speed) || speed <= 0) return speed;
  return boss
    ? Math.max(BOSS_MONSTER_SPEED_MIN, Math.min(BOSS_MONSTER_SPEED_MAX, speed * BOSS_SPEED_MULTIPLIER))
    : Math.max(FIELD_MONSTER_SPEED_MIN, Math.min(FIELD_MONSTER_SPEED_MAX, speed * 2.2));
}

function boundedSavedEnemySpeed(speed: number, boss = false): number {
  if (!Number.isFinite(speed) || speed <= 0) return speed;
  const min = boss ? BOSS_MONSTER_SPEED_MIN : FIELD_MONSTER_SPEED_MIN;
  const max = boss ? BOSS_MONSTER_SPEED_MAX : FIELD_MONSTER_SPEED_MAX;
  return Math.max(min, Math.min(max, speed));
}

function insideBossSwingArc(
  originX: number, originY: number, aimX: number, aimY: number, targetX: number, targetY: number,
): boolean {
  const aimLength = Math.hypot(aimX - originX, aimY - originY) || 1;
  const targetDx = targetX - originX;
  const targetDy = targetY - originY;
  const targetLength = Math.hypot(targetDx, targetDy) || 1;
  const facing = ((aimX - originX) * targetDx + (aimY - originY) * targetDy) /
    (aimLength * targetLength);
  return targetLength <= 138 && facing >= Math.cos(Math.PI / 4);
}

export type EnemyActor = EnemyHud & {
  telegraph?: { x: number; y: number; remainingMs: number; pattern: 'circle' | 'cross' | 'ring' | 'horizontal' | 'vertical' | 'swing' };
  volley?: number;
  x: number;
  y: number;
  speed: number;
  damage: number;
  tint: number;
  radius: number;
  attackMs: number;
  stunnedMs: number;
  slowedMs: number;
  knockbackX: number;
  knockbackY: number;
  generation: number;
  damageOverTime: EnemyDamageOverTime[];
  combatStyle?: 'rush' | 'blink';
  blinkCooldownMs?: number;
  blinkMs?: number;
};

type BossTelegraphPattern = NonNullable<EnemyActor['telegraph']>['pattern'];
const AIM_ASSIST_HALF_ANGLE = (10 * Math.PI) / 180;
const BOSS_ATTACK_PATTERNS: Readonly<Record<string, readonly BossTelegraphPattern[]>> = {
  Cinderhorn: ['horizontal', 'circle', 'cross'],
  Briarclaw: ['circle', 'cross'],
  'Ash Sentinel': ['ring', 'vertical'],
  'Root Widow': ['cross', 'ring'],
  'The Floodgate Maw': ['horizontal', 'vertical'],
  'The Hollow Cantor': ['ring', 'circle'],
  'Sluice Ironclad': ['horizontal', 'vertical', 'cross'],
  'The Drowned Bellkeeper': ['ring', 'horizontal', 'circle'],
  'Forge Husk': ['horizontal', 'circle'],
  'Skyrend Harpy': ['vertical', 'cross'],
  'Ironbound Captain': ['cross', 'horizontal', 'vertical'],
  'Fury Bellkeeper': ['horizontal', 'cross', 'circle'],
  'The Laughing Shard': ['circle', 'ring'],
  'The Facet Weaver': ['cross', 'vertical'],
  'The Joyless Bloom': ['ring', 'circle', 'cross'],
  'Prism Bellkeeper': ['cross', 'ring', 'vertical'],
  'Memory Scribe': ['vertical', 'ring'],
  'Echo Colossus': ['horizontal', 'circle'],
  'Keeper Construct': ['cross', 'horizontal', 'vertical'],
  'Oathbound Bellkeeper': ['vertical', 'cross', 'ring'],
  'The Hunger’s First Echo': ['ring', 'circle', 'cross'],
  'The First Hunger': ['ring', 'cross', 'horizontal', 'vertical', 'circle'],
  'Marrow Collector': ['circle', 'cross'],
  'Reflection Eater': ['ring', 'vertical'],
  'The Pulse That Remains': ['horizontal', 'circle', 'cross'],
};

type EnemyDamageOverTime = {
  kind: 'thorn-bleed' | 'ember-burn';
  remainingMs: number;
  untilTickMs: number;
  tickMs: number;
  damage: number;
};

type EnemySpawnTemplate = Omit<
  EnemyActor,
  'attackMs' | 'stunnedMs' | 'slowedMs' | 'knockbackX' | 'knockbackY' | 'generation' | 'damageOverTime'
>;

type RespawnRecord = {
  remainingMs: number;
  generation: number;
  cell?: string;
  dungeonId?: string;
  roomId?: string;
};

export type Projectile = {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  tint: number;
  radius: number;
  lifeMs: number;
  aoe: number;
  playerOwned: boolean;
  impactEffect?: 'ember-burn';
  slowMs?: number;
};

export type WorldProp = {
  id: string;
  kind: 'npc' | 'chest' | 'rune' | 'gate' | 'treeGate' | 'portal' | 'shrine' | 'inscription';
  x: number;
  y: number;
  label: string;
  interactable?: boolean;
  activated?: boolean;
  visible?: boolean;
  guideClue?: string;
  damageRequired?: number;
  damageTaken?: number;
  hitsRequired?: number;
  hitsTaken?: number;
  requiredWeaponId?: string;
  requiredWeaponName?: string;
  facing?: Direction;
  attacking?: boolean;
};

const TREE_GATE_DAMAGE: Record<WorldRegionId, number> = {
  hearthglen: 55,
  'drowned-marches': 72,
  'ashen-peaks': 89,
  glasslands: 106,
  'fallen-capital': 123,
  'first-hunger': 140,
};

export const getTreeGateDamageRequired = (regionId: WorldRegionId): number =>
  TREE_GATE_DAMAGE[regionId];

const vegetationHitLimit = (requested?: number): number =>
  typeof requested === 'number' && Number.isFinite(requested)
    ? Math.max(1, Math.min(MAX_VEGETATION_HITS, Math.floor(requested)))
    : MAX_VEGETATION_HITS;

type RowanTravelStop = {
  afterBell: WorldRegionId;
  cellId: string;
  x: number;
  y: number;
  dialogue: string;
};

const ROWAN_TRAVEL_STOPS: readonly RowanTravelStop[] = [
  {
    afterBell: 'hearthglen',
    cellId: 'mournwater-crossing',
    x: 320,
    y: 244,
    dialogue: 'I took the southern road ahead of you. The first bell has fallen silent, and its loss is already reaching the Marches. Maelis’s trail leads toward the Sunken Chapel. You will not need to return to Hearthglen to find me again.',
  },
  {
    afterBell: 'drowned-marches',
    cellId: 'frostline-stair',
    x: 320,
    y: 244,
    dialogue: 'The Bell of Sorrow has fallen silent. I came north through the old sluice; the next trail climbs toward Cinderwatch and the Bell of Fury.',
  },
  {
    afterBell: 'ashen-peaks',
    cellId: 'glassward-entry',
    x: 320,
    y: 244,
    dialogue: 'The Bell of Fury is quiet. I followed the glassward trail ahead of you. The Prism Conservatory holds the Bell of Joy.',
  },
  {
    afterBell: 'glasslands',
    cellId: 'capital-south-gate',
    x: 320,
    y: 244,
    dialogue: 'The Bell of Joy has fallen silent. I reached the Capital by the southern road. Maelis’s records—and the Bell of Resolve—wait beyond the archive.',
  },
  {
    afterBell: 'fallen-capital',
    cellId: 'resolve-bell-sanctum',
    x: 320,
    y: 244,
    dialogue: 'The Bell of Resolve is silent. The First Hunger is no longer bound. Maelis’s final record points beyond this hall.',
  },
];

const NPC_SAFE_WORLD_CELLS = new Set([
  'village',
  'mournwater-town',
  'drowned-ferry',
  'gleamharbor',
  'capital-survivors-hold',
  MAELIS_HUB,
  ...ROWAN_TRAVEL_STOPS.map((stop) => stop.cellId),
]);
const HUNGER_SAFE_WORLD_CELLS = new Set([HUNGER_ENTRY, MAELIS_HUB, HUNGER_SPRING, HUNGER_ARENA]);

export const getRowanTravelStop = (
  silencedBells: readonly string[],
): RowanTravelStop | null => {
  let currentStop: RowanTravelStop | null = null;
  for (const stop of ROWAN_TRAVEL_STOPS) {
    if (!silencedBells.includes(stop.afterBell)) break;
    currentStop = stop;
  }
  return currentStop;
};

const isQuestItem = (item: Item): boolean => item.kind === 'key' || item.kind === 'relic';

export type WorldEffect = {
  id: number;
  x: number;
  y: number;
  tint: number;
  radius: number;
  remainingMs: number;
  durationMs: number;
};

export type SavedRun = {
  dungeonActors?: Record<string, EnemyActor[]>;
  version: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;
  state: GameSnapshot;
  actors: EnemyActor[];
  progress: {
    defeatedIds: string[];
    collectedIds: string[];
    puzzleSolved: boolean;
    villageChestOpened: boolean;
    forestChestOpened: boolean;
    shrineUsed: boolean;
    keyChestOpened: boolean;
    respawns?: ({ id: string } & RespawnRecord)[];
    world?: WorldProgress;
  };
};

const startItems = (): Item[] => [
  {
    id: 'wayfinder-cloak',
    name: 'Wayfinder cloak',
    kind: 'armor',
    description: 'A practical cloak with a brass clasp. Adds 12 maximum health.',
    equipped: true,
    bonusHp: 12,
  },
  {
    id: 'small-tonic',
    name: 'Small tonic',
    kind: 'consumable',
    description: 'Restores 35 health.',
    equipped: false,
    quantity: 2,
  },
];

const makeAbilities = (
  classId: CharacterConfig['classId'],
  ranks: Record<string, number>,
): (AbilitySlot | null)[] => [
  ...CLASS_DISCIPLINES[classId].map((tree) => {
    const skill = tree.powers[0];
    return { ...skill, rank: ranks[skill.id] ?? 1, remainingMs: 0 };
  }),
];

const initialSnapshot = (): GameSnapshot => ({
  mode: 'title',
  overlay: null,
  player: null,
  roomId: 'village',
  location: ROOM_NAMES.village,
  hint: 'A new road is waiting.',
  enemies: [],
  abilities: [],
  trainedPowers: {},
  inventory: [],
  quest: {
    title: 'The bells below',
    description: 'Find the old keeper in Hearthglen.',
    step: 'Speak with Elder Rowan',
  },
  log: ['Your story begins in Hearthglen.'],
  puzzleProgress: 0,
  gateOpen: false,
  keyFound: false,
  bossDefeated: false,
  dialog: null,
  dialogSpeaker: null,
  discoveredRooms: ['village'],
  discoveredWorldCells: ['village'],
  guideCooldownMs: 0,
  guideUses: 0,
  guideDirection: null,
  guideCueMs: 0,
});

const enemySpawnsByCell: Partial<Record<string, EnemySpawnTemplate[]>> = {
  canopy: [
    { id: 'canopy-slime-a', name: 'Canopy Mossling', hp: 36, maxHp: 36, boss: false, x: 190, y: 228, speed: 46, damage: 6, tint: 0x7dcf75, radius: 12 },
    { id: 'canopy-wisp', name: 'Sunleaf wisp', hp: 44, maxHp: 44, boss: false, x: 438, y: 170, speed: 40, damage: 8, tint: 0xffc66b, radius: 11 },
  ],
  northwood: [
    { id: 'northwood-slime', name: 'Mossling', hp: 44, maxHp: 44, boss: false, x: 220, y: 178, speed: 46, damage: 7, tint: 0x7dcf75, radius: 13 },
    { id: 'northwood-rootling', name: 'Briar sentinel', hp: 72, maxHp: 72, boss: false, x: 448, y: 312, speed: 34, damage: 10, tint: 0xb87555, radius: 15 },
  ],
  eastwood: [
    { id: 'eastwood-slime', name: 'Mossling', hp: 44, maxHp: 44, boss: false, x: 188, y: 334, speed: 48, damage: 7, tint: 0x7dcf75, radius: 13 },
    { id: 'eastwood-wisp', name: 'Thornwisp', hp: 54, maxHp: 54, boss: false, x: 454, y: 184, speed: 39, damage: 9, tint: 0xffa158, radius: 12 },
    { id: 'eastwood-bat', name: 'Duskleaf bat', hp: 32, maxHp: 32, boss: false, x: 340, y: 258, speed: 64, damage: 6, tint: 0x9e82d4, radius: 11 },
  ],
  briarwood: [
    { id: 'moss-slime-a', name: 'Mossling', hp: 44, maxHp: 44, boss: false, x: 220, y: 178, speed: 46, damage: 7, tint: 0x7dcf75, radius: 13 },
    { id: 'moss-slime-b', name: 'Mossling', hp: 44, maxHp: 44, boss: false, x: 420, y: 310, speed: 48, damage: 7, tint: 0x7dcf75, radius: 13 },
    { id: 'thorn-wisp', name: 'Thornwisp', hp: 54, maxHp: 54, boss: false, x: 492, y: 180, speed: 39, damage: 9, tint: 0xffa158, radius: 12 },
    { id: 'briarwood-bat', name: 'Thicket bat', hp: 38, maxHp: 38, boss: false, x: 156, y: 320, speed: 64, damage: 7, tint: 0x9e82d4, radius: 11 },
  ],
  fernwood: [
    { id: 'fernwood-slime', name: 'Fern Mossling', hp: 48, maxHp: 48, boss: false, x: 188, y: 190, speed: 49, damage: 8, tint: 0x78c97a, radius: 13 },
    { id: 'fernwood-wisp', name: 'Fern wisp', hp: 54, maxHp: 54, boss: false, x: 456, y: 322, speed: 41, damage: 9, tint: 0xe5c86e, radius: 12 },
    { id: 'fernwood-root', name: 'Rootbound sprout', hp: 68, maxHp: 68, boss: false, x: 360, y: 176, speed: 34, damage: 10, tint: 0xb87555, radius: 15 },
  ],
  riverbend: [
    { id: 'riverbend-slime', name: 'Reedling', hp: 46, maxHp: 46, boss: false, x: 194, y: 286, speed: 49, damage: 7, tint: 0x69c8a2, radius: 13 },
    { id: 'riverbend-bat', name: 'River duskwing', hp: 38, maxHp: 38, boss: false, x: 436, y: 198, speed: 66, damage: 7, tint: 0x9e82d4, radius: 11 },
  ],
  southfield: [
    { id: 'southfield-slime', name: 'Field Mossling', hp: 44, maxHp: 44, boss: false, x: 212, y: 204, speed: 48, damage: 7, tint: 0x8bc96b, radius: 13 },
    { id: 'southfield-wisp', name: 'Pollen wisp', hp: 52, maxHp: 52, boss: false, x: 452, y: 318, speed: 40, damage: 8, tint: 0xf0c36a, radius: 12 },
    { id: 'southfield-bat', name: 'Meadow bat', hp: 36, maxHp: 36, boss: false, x: 344, y: 170, speed: 66, damage: 6, tint: 0x9e82d4, radius: 11 },
  ],
  riverbank: [
    { id: 'riverbank-slime', name: 'Bank Mossling', hp: 48, maxHp: 48, boss: false, x: 194, y: 180, speed: 50, damage: 8, tint: 0x6ac49a, radius: 13 },
    { id: 'riverbank-root', name: 'Oldroot sentinel', hp: 76, maxHp: 76, boss: false, x: 452, y: 306, speed: 35, damage: 11, tint: 0xb87555, radius: 15 },
  ],
  ruins: [
    { id: 'ruin-bat-a', name: 'Dustwing', hp: 34, maxHp: 34, boss: false, x: 222, y: 255, speed: 66, damage: 6, tint: 0x9e82d4, radius: 11 },
    { id: 'ruin-bat-b', name: 'Dustwing', hp: 34, maxHp: 34, boss: false, x: 418, y: 255, speed: 68, damage: 6, tint: 0x9e82d4, radius: 11 },
    { id: 'root-guard', name: 'Rootbound sentinel', hp: 88, maxHp: 88, boss: false, x: 320, y: 190, speed: 34, damage: 12, tint: 0xb87555, radius: 16 },
    { id: 'ruins-wisp', name: 'Ashen wisp', hp: 58, maxHp: 58, boss: false, x: 152, y: 352, speed: 42, damage: 10, tint: 0xff9a5c, radius: 12 },
  ],
  sanctum: [
    { id: 'cinderhorn', name: 'Cinderhorn', hp: 300, maxHp: 300, boss: true, x: 320, y: 182, speed: 41, damage: 19, tint: 0xe66c45, radius: 25 },
    { id: 'sanctum-wisp', name: 'Cinder wisp', hp: 60, maxHp: 60, boss: false, x: 180, y: 342, speed: 44, damage: 10, tint: 0xff783e, radius: 12 },
    { id: 'sanctum-bat', name: 'Ember duskwing', hp: 42, maxHp: 42, boss: false, x: 468, y: 340, speed: 68, damage: 8, tint: 0x9e82d4, radius: 11 },
  ],
  'last-ash-watch': [
    { id: 'fury-bellkeeper', name: 'Fury Bellkeeper', hp: 480, maxHp: 480, boss: true, x: 320, y: 236, speed: 42, damage: 20, tint: 0xda6848, radius: 27 },
  ],
  'reedveil-crossing': [
    { id: 'reedveil-leech', name: 'Marsh leech', hp: 62, maxHp: 62, boss: false, x: 196, y: 182, speed: 40, damage: 9, tint: 0x75ad8b, radius: 14 },
    { id: 'reedveil-wisp', name: 'Drowned lantern wisp', hp: 72, maxHp: 72, boss: false, x: 450, y: 318, speed: 42, damage: 10, tint: 0x91d7c7, radius: 13 },
  ],
  'chapel-forecourt': [
    { id: 'forecourt-warden', name: 'Mirebound acolyte', hp: 84, maxHp: 84, boss: false, x: 190, y: 320, speed: 38, damage: 11, tint: 0x879e9a, radius: 15 },
    { id: 'forecourt-wisp', name: 'Grave-light wisp', hp: 68, maxHp: 68, boss: false, x: 454, y: 168, speed: 44, damage: 10, tint: 0x9bc8df, radius: 12 },
  ],
  'drowned-waystones': [
    { id: 'waystone-wisp', name: 'Waystone wisp', hp: 78, maxHp: 78, boss: false, x: 446, y: 186, speed: 43, damage: 11, tint: 0x9bc8df, radius: 13 },
  ],
  'wreckers-reach': [
    { id: 'wreckers-echo', name: 'Wreck-tide echo', hp: 92, maxHp: 92, boss: false, x: 404, y: 315, speed: 39, damage: 12, tint: 0x739da6, radius: 15 },
  ],
  'cinderwatch-approach': [
    { id: 'cinderwatch-sentinel', name: 'Ashbound sentinel', hp: 124, maxHp: 124, boss: false, x: 448, y: 180, speed: 37, damage: 14, tint: 0xc57961, radius: 16 },
  ],
  'joy-bell-sanctum': [
    { id: 'glass-bellkeeper', name: 'Prism Bellkeeper', hp: 460, maxHp: 460, boss: true, x: 320, y: 344, speed: 38, damage: 19, tint: 0x82c9ad, radius: 26 },
  ],
  'singing-orchard': [
    { id: 'singing-orchard-wisp', name: 'Glasswing wisp', hp: 100, maxHp: 100, boss: false, x: 450, y: 188, speed: 45, damage: 13, tint: 0xb6e58c, radius: 13 },
  ],
  'glassmakers-trail': [
    { id: 'glassmakers-trail-echo', name: 'Facet echo', hp: 110, maxHp: 110, boss: false, x: 420, y: 310, speed: 41, damage: 14, tint: 0x94d7c2, radius: 14 },
  ],
  'shatterbrook': [
    { id: 'shatterbrook-crawler', name: 'Shard crawler', hp: 120, maxHp: 120, boss: false, x: 440, y: 190, speed: 38, damage: 15, tint: 0x87c98e, radius: 15 },
  ],
  'prism-stair': [
    { id: 'prism-stair-guardian', name: 'Prism stair guardian', hp: 132, maxHp: 132, boss: false, x: 430, y: 310, speed: 36, damage: 16, tint: 0x8fc9cf, radius: 16 },
  ],
  'heartglass-door': [
    { id: 'heartglass-door-warden', name: 'Heartglass warden', hp: 160, maxHp: 160, boss: false, x: 430, y: 280, speed: 34, damage: 17, tint: 0x9bd987, radius: 17 },
  ],
  'sunshard-bluff': [
    { id: 'sunshard-bluff-moth', name: 'Sunshard moth', hp: 96, maxHp: 96, boss: false, x: 190, y: 210, speed: 52, damage: 13, tint: 0xf2d57d, radius: 12 },
  ],
  'resolve-bell-sanctum': [
    { id: 'capital-bellkeeper', name: 'Oathbound Bellkeeper', hp: 520, maxHp: 520, boss: true, x: 320, y: 344, speed: 40, damage: 21, tint: 0xa891d0, radius: 27 },
  ],
  'sunken-chapel': [
    { id: 'chapel-bellkeeper', name: 'Drowned Bellkeeper', hp: 420, maxHp: 420, boss: true, x: 320, y: 344, speed: 37, damage: 18, tint: 0x6aa8b6, radius: 26 },
    { id: 'chapel-echo', name: 'Tideworn echo', hp: 70, maxHp: 70, boss: false, x: 180, y: 160, speed: 40, damage: 9, tint: 0x91d7c7, radius: 12 },
  ],
};

const FIELD_ENCOUNTER_EXCLUSIONS = new Set(['gleamharbor']);
const REGIONAL_SPAWN_POINTS = [
  { x: 96, y: 96 }, { x: 544, y: 96 },
  { x: 96, y: 384 }, { x: 544, y: 384 },
] as const;

function regionalSpawnHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function regionalFieldSpawns(
  cell: (typeof WORLD_CELLS)[number],
  existing: readonly EnemySpawnTemplate[],
): EnemySpawnTemplate[] {
  if (cell.regionId === HUNGER_REGION || cell.roomId === 'village' ||
      cell.roomId === 'sanctum' || cell.roomId === 'chapel' ||
      FIELD_ENCOUNTER_EXCLUSIONS.has(cell.id) || NPC_SAFE_WORLD_CELLS.has(cell.id) ||
      existing.some((enemy) => enemy.boss)) return [];

  const targetCount = 3;
  const missingCount = Math.max(0, targetCount - existing.length);
  if (missingCount === 0) return [];

  const roster = REGIONAL_MONSTERS[cell.regionId];
  const hash = regionalSpawnHash(cell.id);
  const regionIndex = WORLD_REGION_IDS.indexOf(cell.regionId);
  const previousRegions = WORLD_REGION_IDS.slice(0, regionIndex);
  const usedNames = new Set(existing.map((enemy) => enemy.name));
  const selected: EnemySpawnTemplate[] = [];

  for (let index = 0; index < missingCount; index += 1) {
    const returning = previousRegions.length > 0 && (hash + index * 7) % 5 === 0;
    const olderRegion = returning
      ? previousRegions[(hash + index) % previousRegions.length]
      : undefined;
    const olderRoster = olderRegion ? REGIONAL_MONSTERS[olderRegion] : [];
    const pool = returning ? olderRoster : roster;
    const candidates = pool.filter((monster) =>
      !usedNames.has(monster.name) && !selected.some((spawn) => spawn.name === monster.name));
    const fallback = roster.filter((monster) =>
      !usedNames.has(monster.name) && !selected.some((spawn) => spawn.name === monster.name));
    const choices = candidates.length ? candidates : fallback.length ? fallback : pool.length ? pool : roster;
    const monster = choices[(hash + index) % choices.length]!;
    const orderedPoints = REGIONAL_SPAWN_POINTS.map((_, pointIndex) =>
      REGIONAL_SPAWN_POINTS[(hash + index * 3 + pointIndex) % REGIONAL_SPAWN_POINTS.length]);
    const point = orderedPoints.find((candidate) =>
      [...existing, ...selected].every((enemy) =>
        Math.hypot(enemy.x - candidate.x, enemy.y - candidate.y) >= enemy.radius + monster.radius + 32)) ??
      orderedPoints[0];
    const spawnId = `${monster.id}-${index + 1}`;

    selected.push({
      id: `regional-${spawnId}`,
      name: monster.name,
      hp: monster.maxHp,
      maxHp: monster.maxHp,
      boss: false,
      x: point.x,
      y: point.y,
      speed: monster.speed,
      damage: monster.damage,
      tint: monster.tint,
      radius: monster.radius,
      combatStyle: monster.combatStyle,
    });
    usedNames.add(monster.name);
  }

  return selected;
}

const propsByRoom: Record<RoomId, WorldProp[]> = {
  village: [
    { id: 'rowan', kind: 'npc', x: 320, y: 244, label: 'Elder Rowan' },
    { id: 'village-chest', kind: 'chest', x: 378, y: 308, label: 'Supply chest' },
    { id: 'village-exit', kind: 'portal', x: 320, y: 18, label: 'To Briarwood' },
  ],
  woodland: [
    { id: 'forest-exit-north', kind: 'portal', x: 320, y: 18, label: 'To Hearthglen' },
    { id: 'forest-exit-south', kind: 'portal', x: 320, y: 462, label: 'To the ruins' },
    { id: 'forest-chest', kind: 'chest', x: 534, y: 348, label: 'Fern-hidden cache' },
    { id: 'forest-shrine', kind: 'shrine', x: 126, y: 358, label: 'Wayfarer shrine' },
  ],
  ruins: [
    { id: 'ruins-exit-south', kind: 'portal', x: 320, y: 462, label: 'Back to Briarwood' },
    { id: 'rune-sun', kind: 'rune', x: 260, y: 294, label: 'Sun rune' },
    { id: 'rune-star', kind: 'rune', x: 320, y: 294, label: 'Star rune' },
    { id: 'rune-moon', kind: 'rune', x: 380, y: 294, label: 'Moon rune' },
    { id: 'key-chest', kind: 'chest', x: 320, y: 182, label: 'Sealed coffer' },
    { id: 'ruins-gate', kind: 'gate', x: 320, y: 18, label: 'The Ember Gate', guideClue: 'The Ember Gate needs a brass key and the three runes.' },
  ],
  sanctum: [
    { id: 'sanctum-exit', kind: 'portal', x: 320, y: 462, label: 'Back to the ruins' },
  ],
  chapel: [
    { id: 'chapel-inner-seal', kind: 'gate', x: 320, y: 235, label: 'The tide-locked door', guideClue: 'This seal is not opened with a weapon. Ring the tide bells Low → High → Low.' },
    { id: 'chapel-bell-low-a', kind: 'rune', x: 245, y: 158, label: 'Low tide bell' },
    { id: 'chapel-bell-high', kind: 'rune', x: 320, y: 126, label: 'High tide bell' },
    { id: 'chapel-bell-low-b', kind: 'rune', x: 395, y: 158, label: 'Low tide bell' },
  ],
};

type CollisionRect = [number, number, number, number];

const inRect = (x: number, y: number, rect: CollisionRect) =>
  x > rect[0] && x < rect[2] && y > rect[1] && y < rect[3];

const centerOnlyCollider = (rect: CollisionRect, halfWidth = 8, halfHeight = 9): CollisionRect => {
  const centerX = (rect[0] + rect[2]) / 2;
  const centerY = (rect[1] + rect[3]) / 2;
  return [centerX - halfWidth, centerY - halfHeight, centerX + halfWidth, centerY + halfHeight];
};

const distance = (x1: number, y1: number, x2: number, y2: number) =>
  Math.hypot(x2 - x1, y2 - y1);

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const GUIDE_OBJECTIVE_CELLS: Readonly<Record<string, string>> = {
  'Speak with Elder Rowan': 'village',
  'Find the Rootbound Ruins beyond Briarwood': 'ruins',
  'Open the coffer and enter the Ember Gate': 'sanctum',
  'Enter the Ember Sanctum': 'sanctum',
  'Travel to the Mournwater Crossing': 'mournwater-crossing',
  'Find the stranded ferryman': 'drowned-ferry',
  'Reach the Sunken Chapel approach': 'sunken-chapel-approach',
  "Search the reedbed for Maelis's trail": 'sunken-chapel-approach',
  "Find Maelis's field note at the chapel forecourt": 'chapel-forecourt',
  'Enter the Sunken Chapel and read the tide-bell order': 'sunken-chapel',
  'Ring the three tide bells: Low, High, Low': 'sunken-chapel',
  'Defeat the Drowned Bellkeeper': 'sunken-chapel',
  'Return the drowned bell seal to the ferryman': 'drowned-ferry',
  'Find Maelis’s trail mark at the Northbound Sluice': 'northbound-sluice',
  'Reach Frostline Stair': 'frostline-stair',
  'Search Cinderwatch Approach for Maelis’s next sign': 'cinderwatch-approach',
  'Return to Hearthglen': 'village',
  'Find the Bell of Joy in the Glasslands': 'joy-bell-sanctum',
  'Find the Bell of Resolve in the Fallen Capital': 'resolve-bell-sanctum',
  'Find the Bell of Fury in the Ashen Peaks': 'last-ash-watch',
  'Find The First Hunger in the Hollow': 'first-hunger-sanctum',
  'Defeat The First Hunger': 'first-hunger-sanctum',
};

const GUIDE_OBJECTIVE_PROPS: Readonly<Record<string, string>> = {
  'Speak with Elder Rowan': 'rowan',
  'Return to Hearthglen': 'rowan',
  'Find the stranded ferryman': 'mournwater-ferryman',
  "Search the reedbed for Maelis's trail": 'maelis-trail-mark',
  "Find Maelis's field note at the chapel forecourt": 'maelis-field-note',
  'Enter the Sunken Chapel and read the tide-bell order': 'chapel-bell-low-a',
  'Return the drowned bell seal to the ferryman': 'mournwater-ferryman',
  'Find Maelis’s trail mark at the Northbound Sluice': 'maelis-northbound-mark',
  'Search Cinderwatch Approach for Maelis’s next sign': 'maelis-cinderwatch-mark',
  'Find the Bell of Joy in the Glasslands': 'glass-bell-inscription',
  'Find the Bell of Resolve in the Fallen Capital': 'capital-bell-inscription',
};

const GUIDE_COMPASS_DIRECTIONS: Record<WorldCellEdge, Direction> = {
  north: 'up',
  east: 'right',
  south: 'down',
  west: 'left',
};

export class AdventureEngine {
  private maelisAlly: {
    x: number;
    y: number;
    attackMs: number;
    attackPoseMs: number;
    facing: Direction;
  } | null = null;

  private hungerVolley = 0;

  private maelisAllyStrikeCount = 0;

  private snapshot: GameSnapshot;

  private worldProgress: WorldProgress = createInitialWorldProgress();

  private overworldEnemies: EnemyActor[] = [];

  private dungeonActors: Record<string, EnemyActor[]> = {};

  private heldDirections = new Set<Direction>();

  private analogMovement = { x: 0, y: 0 };

  private aimDirection = { x: 0, y: 1 };

  private enemies: EnemyActor[] = [];

  private projectiles: Projectile[] = [];

  private effects: WorldEffect[] = [];

  private nextProjectileId = 1;

  private nextEffectId = 1;

  private tickRemainder = 0;

  private playerInvulnerableMs = 0;

  private playerStunnedMs = 0;

  private invisibilityMs = 0;

  private battleCryMs = 0;

  private arcaneShieldMs = 0;

  private empoweredMs = 0;

  private poisonCharges = 0;

  private poisonDamageBonus = 6;

  private combatFeedbackMs = 0;

  private combatFeedbackMessage = '';

  private attackAnimationMs = 0;

  private attackAnimationDirection = { x: 0, y: 1 };

  private defeatedIds = new Set<string>();

  private respawns = new Map<string, RespawnRecord>();

  private collectedIds = new Set<string>();

  private puzzleSolved = false;

  private villageChestOpened = false;

  private forestChestOpened = false;

  private shrineUsed = false;

  private keyChestOpened = false;

  private activeRun = false;

  private audioEvents: BattleSound[] = [];

  private checkpointSaveRequested = false;

  private restorationReplayMs: number | null = null;

  private contextHintCache: { x: number; y: number; text: string } | null = null;

  constructor() {
    this.snapshot = initialSnapshot();
  }

  getState(): GameSnapshot {
    return this.snapshot;
  }

  getRestorationPresentation(): RestorationPresentation | null {
    const finale = this.worldProgress.finale;
    if (this.restorationReplayMs !== null) {
      return { ms: this.restorationReplayMs, allied: finale.allied, replay: true };
    }
    return finale.stage === 'restoring'
      ? { ms: finale.restorationMs, allied: finale.allied, replay: false }
      : null;
  }

  startRestorationReplay(): boolean {
    if (!this.activeRun || !this.snapshot.player || this.worldProgress.finale.stage !== 'complete'
      || this.restorationReplayMs !== null) return false;
    this.releaseAllDirections();
    this.snapshot.overlay = null;
    this.restorationReplayMs = 0;
    return true;
  }

  stopRestorationReplay(): void {
    this.restorationReplayMs = null;
    this.releaseAllDirections();
  }

  drainAudioEvents(): BattleSound[] {
    return this.audioEvents.splice(0);
  }

  consumeCheckpointSaveRequest(): boolean {
    const requested = this.checkpointSaveRequested;
    this.checkpointSaveRequested = false;
    return requested;
  }

  getAudioScene(): MusicScene {
    const visit = this.worldProgress.activeDungeon;
    const player = this.snapshot.player;
    const cell = visit ? worldCellAt(visit.returnX, visit.returnY)
      : player ? worldCellAt(player.x, player.y) : null;
    const boss = this.snapshot.enemies.find((enemy) => enemy.boss);
    return {
      playing: this.activeRun && this.snapshot.mode === 'playing',
      region: this.worldProgress.finale.stage === 'restoring' ? 'hearthglen' : cell?.regionId ?? 'hearthglen',
      saturation: getWorldColorProfile(this.worldProgress).saturation,
      tense: !!boss,
      dungeon: !!visit,
      boss: !!boss,
      bossName: boss?.name,
    };
  }

  private sound(event: BattleSound): void {
    if (this.audioEvents.length < 32) this.audioEvents.push(event);
  }

  private wellProps(wells: WellDefinition[]): WorldProp[] {
    return wells.map((well) => ({ id: well.id, kind: 'shrine', label: well.label,
      x: well.x, y: well.y, activated: this.worldProgress.lastWell.id === well.id }));
  }

  private restAtWell(well: WellDefinition): void {
    const visit = this.worldProgress.activeDungeon;
    this.worldProgress.lastWell = { id: well.id,
      ...(visit ? { returnX: visit.returnX, returnY: visit.returnY } : {}) };
    if (visit) this.worldProgress.discoveredDungeons = [...new Set([...this.worldProgress.discoveredDungeons, visit.id])];
    const player = this.snapshot.player!;
    player.hp = player.maxHp;
    player.resource = player.maxResource;
    this.playerInvulnerableMs = 2000;
    this.checkpointSaveRequested = true;
    this.sound('well');
    this.snapshot.hint = `${well.label} restores health and spirit. Your return point is marked.`;
    this.addLog(`Rested at ${well.label}. Journey menu can return you here.`);
  }

  returnToLastWell(): boolean {
    if (this.restorationReplayMs !== null) return false;
    const player = this.snapshot.player;
    if (!player || !this.activeRun || ['choice', 'restoring'].includes(this.worldProgress.finale.stage)) return false;
    const checkpoint = this.worldProgress.lastWell;
    const well = wellById(checkpoint.id);
    if (!well) return false;
    if (this.worldProgress.activeDungeon) {
      this.storeDungeonRoom();
      this.enemies = this.overworldEnemies;
    }
    this.worldProgress.activeDungeon = null;
    player.x = well.x; player.y = well.y + 40;
    if (well.dungeonId && well.roomId) {
      const outside = worldCellOrigin(well.cellId);
      this.overworldEnemies = this.enemies;
      this.worldProgress.activeDungeon = { id: well.dungeonId, roomId: well.roomId,
        returnX: checkpoint.returnX ?? outside.x + 320,
        returnY: checkpoint.returnY ?? outside.y + 360 };
      this.activateDungeonRoom();
    } else if (this.worldProgress.finale.stage === 'battle' && this.worldProgress.finale.allied) {
      this.maelisAlly = {
        x: player.x - 52, y: player.y - 34, attackMs: 300, attackPoseMs: 0, facing: player.facing,
      };
    }
    this.releaseAllDirections();
    this.projectiles = []; this.effects = []; this.audioEvents = [];
    this.playerStunnedMs = 0; this.playerInvulnerableMs = 3000;
    this.invisibilityMs = this.battleCryMs = this.arcaneShieldMs = this.empoweredMs = 0;
    this.poisonCharges = 0; this.attackAnimationMs = 0;
    this.snapshot.dialog = null; this.snapshot.dialogSpeaker = null;
    this.snapshot.guideDirection = null; this.snapshot.guideCueMs = 0;
    this.contextHintCache = null; this.combatFeedbackMs = 0; this.combatFeedbackMessage = '';
    player.hp = player.maxHp; player.resource = player.maxResource;
    this.updateWorldRegion(); this.refreshEnemyHud();
    this.sound('well');
    this.snapshot.hint = `Returned to ${well.label}. Your adventure and discoveries are intact.`;
    this.addLog(this.snapshot.hint);
    return true;
  }

  getContextHint(): string {
    if (!this.activeRun || !this.snapshot.player || this.snapshot.overlay) return '';
    const { x, y } = this.snapshot.player;
    // Mechanisms may change without movement; always refresh in and near the lair.
    if (!this.worldProgress.activeDungeon && !['wreckers-reach', ...MARCHES_LAIRS.map((lair) => lair.entryCellId)].includes(worldCellAt(x, y)?.id ?? '') &&
      this.contextHintCache?.x === x && this.contextHintCache.y === y) return this.contextHintCache.text;
    const text = this.contextHint();
    this.contextHintCache = { x, y, text };
    return text;
  }

  getWorldProgress(): WorldProgress {
    const progress = JSON.parse(JSON.stringify(this.worldProgress)) as WorldProgress;
    const foundTreasureCells = new Set(progress.foundTreasureCells);
    const foundById: Record<string, string> = {
      'village-chest': 'village',
      'forest-chest': 'northwood',
      'key-chest': 'ruins',
      'northwood-root-cache': 'northwood',
      'riverbank-briar-cache': 'riverbank',
      'marsh-silt-cache': 'old-floodgate',
      'sanctum-coffer': 'sanctum',
      'hunger-provision': 'hunger-0-0',
    };
    if (this.villageChestOpened) foundTreasureCells.add('village');
    if (this.forestChestOpened) foundTreasureCells.add('northwood');
    if (this.keyChestOpened) foundTreasureCells.add('ruins');
    for (const [treasureId, cellId] of Object.entries(foundById)) {
      if (this.collectedIds.has(treasureId)) foundTreasureCells.add(cellId);
    }
    for (const cache of [...REGIONAL_FIELD_GEAR, ...GLASSLANDS_GEAR, ...HUNGER_GEAR]) {
      if (this.collectedIds.has(cache.item.id)) foundTreasureCells.add(cache.cellId);
    }
    for (const [dungeonId, dungeonProgress] of Object.entries(progress.dungeons)) {
      const entryCellId = dungeonById(dungeonId)?.entryCellId;
      if (entryCellId && dungeonProgress.openedChests.length > 0) foundTreasureCells.add(entryCellId);
    }
    return { ...progress, foundTreasureCells: [...foundTreasureCells] };
  }

  private markFoundTreasureCell(): void {
    const player = this.snapshot.player;
    const activeDungeon = this.worldProgress.activeDungeon;
    const cellId = activeDungeon
      ? dungeonById(activeDungeon.id)?.entryCellId
      : player && worldCellAt(player.x, player.y)?.id;
    if (!cellId || this.worldProgress.foundTreasureCells.includes(cellId)) return;
    this.worldProgress.foundTreasureCells.push(cellId);
  }

  getPostgameWaveStatus(cell: string): PostgameWaveStatus | null {
    if (!this.worldProgress.postgame.started || !isPostgameEncounterCell(cell)) return null;
    const clearCount = this.worldProgress.postgame.cellClears[cell] ?? 0;
    let remainingMs: number | null = null;
    for (const record of this.respawns.values()) {
      if (record.cell !== cell) continue;
      remainingMs = Math.max(remainingMs ?? 0, record.remainingMs);
    }
    return {
      clearCount,
      nextWaveMultiplier: postgameWaveMultiplier(clearCount),
      remainingMs,
    };
  }

  private dungeonProgress(): DungeonProgress {
    const id = this.worldProgress.activeDungeon?.id ?? DRAINHOUSE_ID;
    return this.worldProgress.dungeons[id] ??= initialDungeonProgress();
  }

  private canEnterHunger(): boolean {
    return !!this.snapshot.player &&
      (this.snapshot.player.level >= HUNGER_LEVEL || this.worldProgress.destroyedObstacles.includes('hunger-legacy-access')) &&
      BELL_REGION_IDS.every((id) => this.worldProgress.silencedBells.includes(id));
  }

  private canEnterHungerArena(): boolean {
    return ['battle', 'restoring', 'complete'].includes(this.worldProgress.finale.stage) &&
      (this.worldProgress.destroyedObstacles.includes('hunger-legacy-access') ||
        this.worldProgress.completedDungeons.includes(HUNGER_VANGUARD_ID) ||
        this.snapshot.inventory.some((item) => item.id === HUNGER_VANGUARD_KEY) ||
        HUNGER_KEYS.every((id) => this.snapshot.inventory.some((item) => item.id === id)));
  }

  private hungerGuideTarget(): string {
    if (['unseen', 'duel', 'choice', 'solo-duel'].includes(this.worldProgress.finale.stage)) return MAELIS_HUB;
    return this.canEnterHungerArena() ? HUNGER_SPRING : MAELIS_HUB;
  }

  private hungerTravel(cellId: string): void {
    const player = this.snapshot.player!;
    const origin = worldCellOrigin(cellId);
    player.x = origin.x + 320; player.y = origin.y + 330;
    this.projectiles = []; this.effects = []; this.maelisAlly = null;
    this.releaseAllDirections(); this.updateWorldRegion(); this.prepareFinale();
  }

  private getHungerProps(): WorldProp[] {
    const cell = this.snapshot.player && worldCellAt(this.snapshot.player.x, this.snapshot.player.y);
    if (!cell) return [];
    const prop = (id: string, kind: WorldProp['kind'], label: string, x = 320, y = 160,
      activated = false): WorldProp => ({ id: `hunger-${id}`, kind, label, x: cell.x + x, y: cell.y + y, activated });
    if (cell.id === 'first-hunger-sanctum') return [{
      ...prop('entry', 'portal', 'Cross into Realm 6'),
      guideClue: 'All five bells must be silent and you must reach level 25. The Hollow is now the doorway into the Hunger’s territory.',
    }];
    const site = hungerSite(cell.id);
    if (!site) return [];
    const props: WorldProp[] = [{ ...prop('record', 'inscription', site.label, 220, 170), guideClue: site.clue }];
    if (cell.id === HUNGER_ENTRY) props.push(prop('leave', 'portal', 'Return to the Hollow', 320, 320));
    if (cell.id === MAELIS_HUB &&
        ['battle', 'restoring', 'complete'].includes(this.worldProgress.finale.stage) &&
        !this.worldProgress.completedDungeons.includes(HUNGER_VANGUARD_ID)) {
      props.push({
        ...prop('first-echo', 'portal', 'Enter the First Echo’s lair', 470, 270),
        guideClue: 'The route to the last battle opens when its guardian falls.',
      });
    }
    if (cell.id === HUNGER_SPRING) props.push(prop('spring', 'shrine', 'Vigil spring', 320, 180));
    if (cell.id === HUNGER_ARENA && this.canEnterHungerArena() &&
        !this.worldProgress.completedDungeons.includes('first-hunger-maw')) {
      props.push({
        ...prop('arena', 'portal', 'Enter the final battle', 490, 240, true),
        guideClue: 'Defeat the First Echo, then rest at the spring before entering the final battle.',
      });
      props.push(prop('retreat', 'portal', 'Return to the spring', 320, 395));
    }
    return props;
  }

  private getMournwaterTownProps(): WorldProp[] {
    const player = this.snapshot.player;
    const cell = player && worldCellAt(player.x, player.y);
    if (cell?.id !== 'mournwater-town') return [];
    const origin = worldCellOrigin(cell.id);
    const prop = (id: string, kind: WorldProp['kind'], label: string, x: number, y: number,
      extra: Partial<WorldProp> = {}): WorldProp => ({
      id, kind, label, x: origin.x + x, y: origin.y + y, ...extra,
    });
    return [
      prop('mournwater-apothecary', 'npc', 'Edda · town market', 270, 206),
      prop('mournwater-trainer', 'npc', 'Tamsin · field training', 390, 206),
      prop('mournwater-storyteller', 'npc', 'Old Neri · river stories', 322, 390),
      prop('mournwater-town-record', 'inscription', 'Mournwater notice board', 322, 168, {
        guideClue: 'The chapel approach remembers three reed notes. Far up the northbound sluice, a lantern points the water toward an old vault. At Wrecker’s Reach, a willow’s roots disappear beneath the flooded pool.',
      }),
    ];
  }

  private getGlasslandsProps(): WorldProp[] {
    const player = this.snapshot.player;
    const cell = player && worldCellAt(player.x, player.y);
    if (cell?.regionId !== 'glasslands') return [];
    const origin = worldCellOrigin(cell.id);
    const prop = (id: string, kind: WorldProp['kind'], label: string, x = 320, y = 180,
      extra: Partial<WorldProp> = {}): WorldProp => ({
      id, kind, label, x: origin.x + x, y: origin.y + y, ...extra,
    });
    const props: WorldProp[] = [];
    if (cell.id === 'gleamharbor') {
      props.push(
        prop('glasslands-storyteller', 'npc', 'Mira, the glassmaker', 270, 240),
        prop('glasslands-apothecary', 'npc', 'Glassmaker · town market', 395, 240),
        prop('glasslands-town-record', 'inscription', 'Gleamharbor story', 320, 130, {
          guideClue: 'Gleamharbor’s glassmakers kept laughing even after the Bell of Joy began to fade.',
        }),
      );
    }
    const lair = GLASSLANDS_LAIRS.find((entry) => entry.cellId === cell.id);
    if (lair) {
      const progress = this.worldProgress.dungeons[lair.id] ??= initialDungeonProgress();
      props.push(prop(`${lair.id}/record`, 'inscription', `${lair.label} entrance record`, 230, 138, {
        guideClue: lair.clue,
      }));
      props.push(prop(`${lair.id}/enter`, 'portal',
        progress.entranceOpen ? `Enter ${lair.label}` : `${lair.label} · sealed entrance`,
        320, 210, { activated: progress.entranceOpen }));
      if (lair.entrancePuzzle === 'anchors') {
        for (const [side, x] of [['left', 180], ['right', 460]] as const) {
          props.push(prop(`${lair.id}/anchor-${side}`, 'rune', `Release ${side} buried chime`, x, 330, {
            activated: progress.valves.includes(`entry-${side}`),
          }));
        }
      } else if (lair.entrancePuzzle === 'mirror') {
        const facing = Number(progress.valves.find((entry) => entry.startsWith('entry-facing-'))?.slice(-1) ?? 0);
        props.push(prop(`${lair.id}/lens`, 'rune', `Turn garden lens · ${['North', 'East', 'South', 'West'][facing]}`, 450, 330, {
          activated: progress.entranceOpen,
        }));
      } else {
        props.push(prop(`${lair.id}/ward`, 'rune', 'Release the warden’s entrance ward', 450, 330, {
          activated: progress.entranceOpen,
        }));
      }
    }
    const gear = GLASSLANDS_GEAR.find((entry) => entry.cellId === cell.id);
    if (gear) {
      const treeId = 'glasslands-prism-tree';
      const secretOpen = this.worldProgress.destroyedObstacles.includes(`glasslands-secret-${gear.item.id}`);
      if (!secretOpen && gear.puzzle === 'tree') {
        props.push(prop(treeId, 'treeGate', 'Singing glassbark', 445, 310, {
          hitsRequired: 5,
          hitsTaken: this.worldProgress.obstacleHits[treeId] ?? 0,
          guideClue: 'The orchard keeper hid a spear behind the singing glassbark. Five strikes with any weapon will open it.',
        }));
      } else if (!secretOpen && gear.puzzle === 'loom') {
        props.push(prop('glasslands-moth-loom', 'rune', 'Turn the mothglass loom', 445, 310, {
          guideClue: 'Two turns align the mothglass loom and reveal the hidden mantle.',
        }));
      } else if (!secretOpen && gear.puzzle === 'chimes') {
        for (const [side, x] of [['left', 180], ['right', 460]] as const) {
          props.push(prop(`glasslands-laughter-${side}`, 'rune', `Ring the ${side} garden chime`, x, 310, {
            activated: this.worldProgress.destroyedObstacles.includes(`glasslands-laughter-${side}`),
            guideClue: 'The mirror grove opens when both garden chimes answer.',
          }));
        }
      } else if (secretOpen) {
        props.push(prop(`glasslands-gear-${gear.item.id}`, 'chest', gear.item.name, 445, 310, {
          visible: true,
          activated: this.collectedIds.has(gear.item.id),
        }));
      }
    }
    return props;
  }

  private getCapitalStrongholdProps(): WorldProp[] {
    const player = this.snapshot.player;
    const cell = player && worldCellAt(player.x, player.y);
    if (cell?.id !== 'capital-survivors-hold') return [];
    const origin = worldCellOrigin(cell.id);
    const prop = (id: string, kind: WorldProp['kind'], label: string, x: number, y: number,
      extra: Partial<WorldProp> = {}): WorldProp => ({
      id, kind, label, x: origin.x + x, y: origin.y + y, ...extra,
    });
    return [
      prop('capital-captain', 'npc', 'Captain Ivara · the watch', 320, 150),
      prop('capital-quartermaster', 'npc', 'Kesh · quartermaster', 232, 312),
      prop('capital-instructor', 'npc', 'Renn · field instructor', 410, 312),
      prop('capital-stronghold-record', 'inscription', 'Survivors’ dispatch board', 320, 390, {
        guideClue: 'The old watch kept three records of the city: one in the ash archive, one beneath the amphitheater, and one where the clock towers fell. A pale tree in the eastern court still bears a mark from before the bells.',
      }),
    ];
  }

  private getRegionalLairProps(): WorldProp[] {
    const player = this.snapshot.player;
    const cell = player && worldCellAt(player.x, player.y);
    const lair = cell && regionalLairAt(cell.id);
    if (!cell || !lair) return [];
    const origin = worldCellOrigin(cell.id);
    const progress = this.worldProgress.dungeons[lair.id] ??= initialDungeonProgress();
    const prop = (action: string, kind: WorldProp['kind'], label: string, x: number, y: number,
      activated = false, guideClue?: string): WorldProp => ({
      id: `${lair.id}/${action}`, kind, label, x: origin.x + x, y: origin.y + y,
      activated, ...(guideClue ? { guideClue } : {}),
    });
    const props: WorldProp[] = [
      prop('record', 'inscription', `${lair.label} field record`, 220, 140, false, lair.clue),
    ];
    if (lair.entrancePuzzle === 'tree') {
      if (!progress.entranceOpen) props.push({
        ...prop('tree', 'treeGate', 'Hollow heartwood', 450, 300, false, lair.clue),
        hitsRequired: 1,
      });
    } else if (lair.entrancePuzzle === 'tree-sequence') {
      const names = ['Amber-banded trunk', 'Split trunk', 'Root-wound trunk'];
      names.forEach((name, index) => props.push({
        ...prop(`tree-${index}`, 'treeGate', name, 155 + index * 165, 315,
          progress.valves.includes(`entry-tree-${index}`), lair.clue),
        hitsRequired: 1,
      }));
    } else if (lair.entrancePuzzle === 'fragments') {
      for (let index = 0; index < 3; index += 1) {
        props.push(prop(`fragment-${index}`, 'chest', `Bent-key fragment ${index + 1}`,
          150 + index * 170, 315, progress.valves.includes(`entry-fragment-${index}`), lair.clue));
      }
    }
    if (!['tree', 'tree-sequence', 'fragments'].includes(lair.entrancePuzzle) || progress.entranceOpen) {
      props.push(prop('enter', 'portal', progress.entranceOpen ? `Enter ${lair.label}` : `${lair.label} · sealed`, 320, 200,
        progress.entranceOpen, lair.clue));
    }
    if (lair.entrancePuzzle === 'anchors') {
      for (const [side, x] of [['left', 180], ['right', 460]] as const) {
        props.push(prop(`anchor-${side}`, 'rune', `Release ${side} root-lock`, x, 320,
          progress.valves.includes(`entry-${side}`), lair.clue));
      }
    } else if (lair.entrancePuzzle === 'mirror') {
      const facing = Number(progress.valves.find((entry) => entry.startsWith('entry-facing-'))?.slice(-1) ?? 0);
      props.push(prop('lens', 'rune', `Turn the lens · ${['North', 'East', 'South', 'West'][facing]}`, 455, 320,
        progress.entranceOpen, lair.clue));
    } else {
      props.push(prop('ward', 'rune', 'Release the sentry ward', 455, 320,
        progress.entranceOpen, lair.clue));
    }
    return props;
  }

  private getMainBossProps(): WorldProp[] {
    const player = this.snapshot.player;
    const cell = player && worldCellAt(player.x, player.y);
    const site = cell && mainBossAt(cell.id);
    if (!cell || !site || site.regionId === 'first-hunger' || this.mainBossAlreadyComplete(site)) return [];
    const missing = site.requiredKeys.filter((key) =>
      !this.snapshot.inventory.some((item) => item.id === key));
    const legacyMarchesAccess = site.regionId === 'drowned-marches' &&
      this.worldProgress.chapelGateOpen && this.snapshot.quest?.step === 'Defeat the Drowned Bellkeeper';
    const origin = worldCellOrigin(cell.id);
    return [{
      id: `main-boss-entry-${site.dungeonId}`,
      kind: 'portal',
      label: missing.length && !legacyMarchesAccess ? `${site.label} · ${missing.length} lair keys needed` : `Enter ${site.label}`,
      x: origin.x + 320, y: origin.y + 160,
      activated: missing.length === 0 || legacyMarchesAccess,
      guideClue: missing.length && !legacyMarchesAccess
        ? `The main dungeon opens after all three regional mini-bosses fall. ${missing.length} key${missing.length === 1 ? '' : 's'} remain.`
        : `All three lair keys answer. Enter ${site.label} to face ${site.bossName}.`,
    }];
  }

  private mainBossAlreadyComplete(site: (typeof MAIN_BOSS_SITES)[number]): boolean {
    if (this.worldProgress.completedDungeons.includes(site.dungeonId)) return true;
    if (site.regionId === 'hearthglen') return this.snapshot.bossDefeated;
    if (site.regionId === 'drowned-marches') {
      return this.worldProgress.completedDungeons.includes('sunken-chapel') ||
        this.worldProgress.silencedBells.includes('drowned-marches');
    }
    if (site.regionId === 'first-hunger') {
      return this.worldProgress.finale.stage === 'complete' || this.worldProgress.colorsRestored;
    }
    return false;
  }
  private getRegionalFieldGearProps(): WorldProp[] {
    const player = this.snapshot.player;
    const cell = player && worldCellAt(player.x, player.y);
    if (!cell) return [];
    const cache = REGIONAL_FIELD_GEAR.find((entry) => entry.cellId === cell.id);
    if (!cache) return [];
    const origin = worldCellOrigin(cell.id);
    const treeId = `regional-tree-${cache.item.id}`;
    const revealed = this.worldProgress.destroyedObstacles.includes(treeId);
    const chestId = `regional-gear-${cache.item.id}`;
    if (!revealed) return [{
      id: treeId, kind: 'treeGate', label: 'Unusual hollow tree',
      x: origin.x + cache.x, y: origin.y + cache.y,
      hitsRequired: 5, hitsTaken: this.worldProgress.obstacleHits[treeId] ?? 0,
      guideClue: cache.clue,
    }];
    return [{
      id: chestId, kind: 'chest', label: cache.item.name,
      x: origin.x + cache.x, y: origin.y + cache.y,
      visible: revealed,
      activated: this.collectedIds.has(cache.item.id),
      guideClue: cache.clue,
    }];
  }

  private hungerAction(prop: WorldProp): boolean {
    if (!prop.id.startsWith('hunger-')) return false;
    const player = this.snapshot.player!;
    if (prop.id === 'hunger-entry') {
      if (this.canEnterHunger()) {
        this.worldProgress.unlockedRegions = [...new Set([...this.worldProgress.unlockedRegions, HUNGER_REGION])];
        this.enemies = this.createWorldEnemies(this.enemies);
        this.hungerTravel(HUNGER_ENTRY);
        this.snapshot.hint = 'Realm 6: Maelis waits east. The First Echo guards the final path.';
      } else this.snapshot.hint = 'Realm 6 requires level 25 and all five silenced bells.';
    } else if (prop.id === 'hunger-leave') this.hungerTravel('first-hunger-sanctum');
    else if (prop.id === 'hunger-retreat') this.hungerTravel(HUNGER_SPRING);
    else if (prop.id === 'hunger-arena') {
      if (this.canEnterHungerArena()) {
        this.hungerTravel(HUNGER_ARENA);
        this.enterDungeon('first-hunger-maw');
      }
      else this.snapshot.hint = 'Defeat the First Echo in the lair beyond Maelis, then rest at the spring.';
    } else if (prop.id === 'hunger-first-echo') {
      if (['battle', 'restoring', 'complete'].includes(this.worldProgress.finale.stage)) {
        this.enterDungeon(HUNGER_VANGUARD_ID);
      } else this.snapshot.hint = 'Hear Maelis’s account and choose how to face the Hunger first.';
    } else if (prop.kind === 'inscription') {
      this.snapshot.dialogSpeaker = prop.label; this.snapshot.dialog = prop.guideClue!;
    } else if (prop.id === 'hunger-spring') {
      player.hp = player.maxHp; player.resource = player.maxResource;
      this.snapshot.hint = 'The spring restores health and energy. No merchant or bellkeeper claims it.';
    }
    return true;
  }

  private glasslandsLairAction(prop: WorldProp): boolean {
    const lair = GLASSLANDS_LAIRS.find((entry) => prop.id.startsWith(`${entry.id}/`));
    if (!lair) return false;
    const action = prop.id.slice(lair.id.length + 1);
    const progress = this.worldProgress.dungeons[lair.id] ??= initialDungeonProgress();
    if (action === 'record') {
      this.snapshot.dialogSpeaker = lair.label;
      this.snapshot.dialog = lair.clue;
    } else if (action === 'enter') {
      if (progress.entranceOpen) this.enterDungeon(lair.id);
      else this.snapshot.hint = lair.clue;
    } else if (progress.entranceOpen) {
      this.snapshot.hint = 'The entrance is already open.';
    } else if (lair.entrancePuzzle === 'anchors') {
      const side = action.endsWith('left') ? 'left' : 'right';
      progress.valves = [...new Set([...progress.valves, `entry-${side}`])];
      progress.entranceOpen = ['entry-left', 'entry-right'].every((entry) => progress.valves.includes(entry));
      this.snapshot.hint = progress.entranceOpen
        ? `Both chimes answer. The entrance to ${lair.label} opens.`
        : 'One buried chime answers. Find and ring the other in either order.';
    } else if (lair.entrancePuzzle === 'mirror') {
      const facing = Number(progress.valves.find((entry) => entry.startsWith('entry-facing-'))?.slice(-1) ?? 0);
      const next = (facing + 1) % 4;
      progress.valves = [...progress.valves.filter((entry) => !entry.startsWith('entry-facing-')), `entry-facing-${next}`];
      progress.entranceOpen = next === 2;
      this.snapshot.hint = progress.entranceOpen
        ? 'The second horizon aligns. A path opens into the Parallax Garden.'
        : `The lens faces ${['North', 'East', 'South', 'West'][next]}. Continue until it faces the second horizon.`;
    } else {
      const cellId = worldCellAt(this.snapshot.player!.x, this.snapshot.player!.y)?.id;
      progress.entranceOpen = !this.enemies.some((enemy) =>
        worldCellAt(enemy.x, enemy.y)?.id === cellId && enemy.name === 'Heartglass warden');
      this.snapshot.hint = progress.entranceOpen
        ? 'The warden is gone. Heartglass opens beneath the stair.'
        : 'The Heartglass warden still binds this entrance. Defeat it first.';
    }
    return true;
  }

  private storeDungeonRoom(): void {
    const visit = this.worldProgress.activeDungeon;
    if (visit) this.dungeonActors[`${visit.id}/${visit.roomId}`] = this.enemies;
  }

  private exportDungeonActors(): Record<string, EnemyActor[]> {
    this.storeDungeonRoom();
    return JSON.parse(JSON.stringify(this.dungeonActors));
  }

  private activateDungeonRoom(): void {
    const visit = this.worldProgress.activeDungeon!;
    const dungeon = dungeonById(visit.id)!;
    const room = dungeon.rooms.find((r) => r.id === visit.roomId)!;
    const player = this.snapshot.player!;
    // Corrupt/outdated room coordinates recover to that room, never an overworld cell.
    if (dungeonRoomAt(visit.id, player.x, player.y)?.id !== room.id) {
      const origin = dungeonRoomOrigin(room);
      player.x = origin.x + 320; player.y = origin.y + 240;
    }
    const progress = this.dungeonProgress();
    progress.discoveredRooms = [...new Set([...progress.discoveredRooms, room.id])];
    const key = `${visit.id}/${visit.roomId}`;
    if (visit.id === 'first-hunger-maw' && room.id === '2:1') this.dungeonActors[key] = [];
    else if (!this.dungeonActors[key]) this.dungeonActors[key] = this.createDungeonEnemies(visit.id, room.id);
    this.enemies = this.dungeonActors[key];
    if (this.worldProgress.finale.stage === 'battle' && this.worldProgress.finale.allied) {
      const origin = dungeonRoomOrigin(room);
      if (visit.id === 'first-hunger-maw' && room.id === '2:1') {
        this.maelisAlly = {
          x: origin.x + 320, y: origin.y + 240, attackMs: 0, attackPoseMs: 0, facing: 'down',
        };
      } else if (!this.maelisAlly || dungeonRoomAt(visit.id, this.maelisAlly.x, this.maelisAlly.y)?.id !== room.id) {
        this.maelisAlly = {
          x: clamp(player.x - 52, origin.x + 72, origin.x + 568),
          y: clamp(player.y - 34, origin.y + 72, origin.y + 408),
          attackMs: 300, attackPoseMs: 0, facing: 'down',
        };
      }
    }
    this.projectiles = []; this.effects = [];
    this.refreshEnemyHud();
  }

  private createDungeonEnemies(id: string, roomId: string, generation = 0): EnemyActor[] {
    const dungeon = dungeonById(id);
    const room = dungeon?.rooms.find((entry) => entry.id === roomId);
    if (!dungeon || !room || room.feature === 'entry' || room.feature === 'rest') return [];
    // Keep a quiet pause point immediately before the final battle.
    if (id === 'first-hunger-maw' && roomId === '2:1') return [];

    const key = `${id}/${roomId}`;
    const origin = dungeonRoomOrigin(room);
    const regionId = dungeon.regionId ?? 'drowned-marches';
    const finalBoss = dungeon.storyBoss === 'first-hunger';
    const boss = room.feature === 'boss' && !this.worldProgress.dungeons[id]?.bossDefeated;
    if (room.feature === 'boss' && !boss) return [];

    const actors: EnemyActor[] = [];
    const strength = 1.05 ** generation;
    if (boss) {
      const base = {
        maxHp: Math.ceil((finalBoss ? HUNGER_BALANCE.health : 260 * BOSS_HEALTH_MULTIPLIER) * strength),
        damage: Math.ceil((finalBoss ? HUNGER_BALANCE.damage : 24 * BOSS_DAMAGE_MULTIPLIER) * strength),
        speed: tunedEnemySpeed(finalBoss ? 86 : 54 + regionalSpawnHash(dungeon.bossName ?? id) % 24, true),
      };
      actors.push({
        id: dungeon.storyBoss === 'first-hunger' ? 'first-hunger-sanctum:first-hunger' : `${key}/anchor-warden`,
        name: dungeon.bossName ?? 'Anchor Warden',
        x: origin.x + 420, y: origin.y + 240,
        hp: base.maxHp, ...base, boss: true,
        tint: dungeon.bossTint ?? (dungeon.puzzle === 'chimes' ? 0xb292d6 : dungeon.puzzle === 'weights' ? 0xc6a16b : 0x73bdcd),
        radius: 30, attackMs: 1300, stunnedMs: 0, slowedMs: 0, knockbackX: 0, knockbackY: 0,
        generation, damageOverTime: [],
        combatStyle: 'rush',
      });
    }

    const roster = [...REGIONAL_MONSTERS[regionId]];
    if (roster.length === 0) roster.push(...REGIONAL_MONSTERS['fallen-capital']);
    const regionIndex = WORLD_REGION_IDS.indexOf(regionId);
    if (regionIndex > 0 && regionIndex < 5 && regionalSpawnHash(key) % 4 === 0) {
      const previousRoster = REGIONAL_MONSTERS[WORLD_REGION_IDS[regionIndex - 1]!];
      roster.push(previousRoster[regionalSpawnHash(`${key}:returning`) % previousRoster.length]!);
    }
    const spawnCount = boss ? 0 : room.feature === 'hall' ? 5 : room.feature === 'clue' ? 3 : 4;
    const startIndex = regionalSpawnHash(key) % roster.length;
    const points = [
      { x: 186, y: 166 }, { x: 452, y: 166 }, { x: 186, y: 338 },
      { x: 452, y: 338 }, { x: 320, y: 136 }, { x: 320, y: 372 },
    ] as const;

    for (let index = 0; index < spawnCount; index += 1) {
      const monster = roster[(startIndex + index) % roster.length]!;
      const spawnScale = boss ? 0.82 : room.feature === 'clue' ? 1 : 1.18;
      const base = {
        maxHp: Math.ceil(monster.maxHp * spawnScale * strength),
        damage: Math.ceil(monster.damage * (boss ? 0.84 : 1.08) * strength),
        speed: tunedEnemySpeed(monster.speed),
      };
      const stats = postgameEnemyStats(base, key, this.worldProgress.postgame);
      const point = points[(startIndex + index * 2) % points.length];
      actors.push({
        id: `${key}/${monster.id}-${index + 1}`,
        name: monster.name,
        x: origin.x + point.x, y: origin.y + point.y,
        hp: stats.maxHp, ...stats, speed: tunedEnemySpeed(stats.speed), boss: false,
        tint: monster.tint, radius: monster.radius,
        attackMs: 900 + ((index + startIndex) % spawnCount) * 180,
        stunnedMs: 0, slowedMs: 0, knockbackX: 0, knockbackY: 0,
        generation, damageOverTime: [],
        combatStyle: monster.combatStyle,
        ...(monster.combatStyle === 'blink'
          ? { blinkCooldownMs: 1800 + regionalSpawnHash(`${key}:${index}:blink`) % 1000, blinkMs: 0 }
          : {}),
      });
    }

    return actors;
  }

  private enterDungeon(id: string): void {
    const dungeon = dungeonById(id);
    const player = this.snapshot.player;
    if (!dungeon || !player || this.worldProgress.activeDungeon) return;
    if (dungeon.role === 'main') {
      const missing = (dungeon.requiredKeys ?? []).filter((key) =>
        !this.snapshot.inventory.some((item) => item.id === key));
      const legacyMarchesAccess = dungeon.regionId === 'drowned-marches' &&
        this.worldProgress.chapelGateOpen && this.snapshot.quest?.step === 'Defeat the Drowned Bellkeeper';
      const legacyHungerAccess = dungeon.regionId === 'first-hunger' &&
        (this.worldProgress.destroyedObstacles.includes('hunger-legacy-access') ||
          HUNGER_KEYS.every((key) => this.snapshot.inventory.some((item) => item.id === key)));
      if (missing.length && !legacyMarchesAccess) {
        if (!legacyHungerAccess) {
          this.snapshot.hint = dungeon.regionId === 'first-hunger'
            ? 'The final seal waits for the First Echo’s key.'
            : `The seal needs all three mini-boss keys. ${missing.length} remain.`;
          return;
        }
      }
    }
    this.overworldEnemies = this.enemies;
    this.worldProgress.activeDungeon = {
      id, roomId: dungeon.entryRoomId, returnX: player.x, returnY: player.y + 65,
    };
    this.worldProgress.discoveredDungeons = [...new Set([...this.worldProgress.discoveredDungeons, id])];
    const origin = dungeonRoomOrigin(dungeon.rooms.find((r) => r.id === dungeon.entryRoomId)!);
    player.x = origin.x + 320; player.y = origin.y + 240;
    if (this.worldProgress.finale.stage === 'battle' && this.worldProgress.finale.allied) {
      this.maelisAlly = {
        x: player.x - 52, y: player.y - 34, attackMs: 300, attackPoseMs: 0, facing: 'down',
      };
    }
    this.snapshot.guideDirection = null; this.snapshot.guideCueMs = 0;
    this.activateDungeonRoom(); this.updateWorldRegion(); this.releaseAllDirections();
    this.snapshot.hint = dungeon.puzzleClue ?? (dungeon.keyId ? 'Free both inner mechanisms, then release the seal. The landing remains a safe exit.'
      : 'The drainage wheels free the pressure door. The landing remains a safe exit.');
    this.addLog(`Discovered ${dungeon.label}.`);
  }

  private leaveDungeon(): void {
    const visit = this.worldProgress.activeDungeon;
    const player = this.snapshot.player;
    if (!visit || !player) return;
    this.storeDungeonRoom();
    player.x = visit.returnX; player.y = visit.returnY;
    this.worldProgress.activeDungeon = null;
    if (this.worldProgress.finale.stage === 'battle' && this.worldProgress.finale.allied) {
      this.maelisAlly = {
        x: player.x - 52, y: player.y - 34, attackMs: 300, attackPoseMs: 0, facing: player.facing,
      };
    }
    this.enemies = this.overworldEnemies;
    this.projectiles = []; this.effects = [];
    this.releaseAllDirections(); this.updateWorldRegion(); this.refreshEnemyHud();
  }

  private getDungeonProps(): WorldProp[] {
    const visit = this.worldProgress.activeDungeon!;
    const room = dungeonById(visit.id)!.rooms.find((r) => r.id === visit.roomId)!;
    const origin = dungeonRoomOrigin(room);
    const progress = this.dungeonProgress();
    const dungeon = dungeonById(visit.id)!;
    const prop = (id: string, kind: WorldProp['kind'], label: string, activated = false): WorldProp =>
      ({ id: `dungeon-${id}`, kind, label, activated, x: origin.x + 320, y: origin.y + 160 });
    switch (room.feature) {
      case 'entry': return [prop('exit', 'portal', `Return to ${WORLD_CELLS.find((cell) => cell.id === dungeon.entryCellId)?.label ?? 'the original entrance'}`)];
      case 'valve': return [prop(`wheel-${room.id}`, 'rune',
        dungeon.puzzle === 'chimes' ? `Ring ${room.label}` : dungeon.puzzle === 'weights'
          ? `${room.label}: ${['Low', 'Middle', 'High'][Number(progress.valves.find((value) => value.startsWith(`weight-${room.id}-`))?.slice(-1) ?? 0)]} (cycle)`
          : dungeon.puzzle === 'mirror' ? 'Turn inner lens twice' : dungeon.puzzle === 'hunt' ? 'Free cleared soul ward'
          : dungeon.puzzle === 'anchors' ? 'Release bone anchor' : room.id === '2:1' ? 'Drain intake cistern' : 'Drain outlet cistern',
        dungeon.puzzle === 'weights'
          ? progress.valves.includes(`weight-${room.id}-${dungeon.mechanismRooms!.indexOf(room.id) === 1 ? 1 : 2}`)
          : progress.valves.includes(room.id))];
      case 'door': return [{ ...prop('door', 'gate', dungeon.keyId ? 'Inner seal' : 'Pressure door', progress.doorOpen),
        x: origin.x + (dungeon.sealedEdge?.edge === 'east' ? 585 : dungeon.sealedEdge?.edge === 'west' ? 55 : 320),
        y: origin.y + (dungeon.sealedEdge?.edge === 'north' ? 55 : dungeon.sealedEdge?.edge === 'south' ? 425 : 240) }];
      case 'chest': return [prop(`chest-${room.id}`, 'chest', `${room.label} cache`, progress.openedChests.includes(room.id))];
      case 'rest': return [prop('rest', 'shrine', 'Keeper’s spring')];
      case 'clue': return [{ ...prop('clue', 'inscription', room.label),
        guideClue: dungeon.puzzleClue ? `${dungeon.puzzleClue} ${dungeon.bossClue} Caches and the free spring offer preparation.`
          : dungeon.keyId
          ? `${dungeon.bossName} marks a circle then crossing lanes. ${dungeon.puzzle === 'mirror' ? 'Turn each inner lens twice.' : dungeon.puzzle === 'hunt' ? 'Defeat the echoes in both soul-ward rooms, then free their wards.' : 'Release both bone anchors in either order.'} The inner seal opens only after both mechanisms. Caches and the spring are safe preparation.`
          : room.id === '1:6'
          ? 'The Anchor Warden marks a circle, then crossing lanes. Move outside the marks before its strike.'
          : 'Drain both intake and outlet cisterns using B, in either order. Then release the pressure door. The treasure paths are optional.' }];
      case 'boss': return progress.bossDefeated ? [prop('return', 'portal', 'Victorious return door')] : [];
      default: return [];
    }
  }

  private isMaelisConversationRoom(): boolean {
    const visit = this.worldProgress.activeDungeon;
    return this.worldProgress.finale.stage === 'battle' && this.worldProgress.finale.allied === true &&
      visit?.id === 'first-hunger-maw' && visit.roomId === '2:1';
  }

  private maelisCompanionProp(interactable = false): WorldProp | null {
    if (!this.maelisAlly) return null;
    return {
      id: 'maelis-ally', kind: 'npc', label: 'Maelis',
      x: this.maelisAlly.x, y: this.maelisAlly.y, facing: this.maelisAlly.facing,
      attacking: this.maelisAlly.attackPoseMs > 0, interactable,
    };
  }

  private dungeonAction(prop: WorldProp): boolean {
    const player = this.snapshot.player!;
    const regionalLair = REGIONAL_MINI_LAIRS.find((lair) => prop.id.startsWith(`${lair.id}/`));
    if (regionalLair) {
      const progress = this.worldProgress.dungeons[regionalLair.id] ??= initialDungeonProgress();
      const action = prop.id.slice(regionalLair.id.length + 1);
      if (action === 'record') {
        this.snapshot.dialogSpeaker = regionalLair.label;
        this.snapshot.dialog = regionalLair.clue;
      } else if (action === 'enter') {
        if (progress.entranceOpen) this.enterDungeon(regionalLair.id);
        else this.snapshot.hint = regionalLair.clue;
      } else if (action.startsWith('fragment-') && regionalLair.entrancePuzzle === 'fragments') {
        const index = Number(action.slice('fragment-'.length));
        if (!Number.isInteger(index) || index < 0 || index > 2) return true;
        const token = `entry-fragment-${index}`;
        if (!progress.valves.includes(token)) {
          progress.valves.push(token);
          const id = `${regionalLair.id}-key-fragment-${index + 1}`;
          this.addItem({
            id,
            name: `${regionalLair.label} key fragment ${index + 1}`,
            kind: 'key',
            description: `One of three pieces needed to reveal the entrance to ${regionalLair.label}.`,
            equipped: false,
            quantity: 1,
          });
        }
        progress.entranceOpen = [0, 1, 2].every((part) => progress.valves.includes(`entry-fragment-${part}`));
        this.snapshot.hint = progress.entranceOpen
          ? `The three fragments form a key. The entrance to ${regionalLair.label} is revealed.`
          : `Key fragment recovered. ${3 - progress.valves.filter((value) => value.startsWith('entry-fragment-')).length} fragment(s) remain.`;
      } else if (progress.entranceOpen) {
        this.snapshot.hint = 'The entrance is already open.';
      } else if (regionalLair.entrancePuzzle === 'tree' ||
          regionalLair.entrancePuzzle === 'tree-sequence' ||
          regionalLair.entrancePuzzle === 'fragments') {
        return false;
      } else if (regionalLair.entrancePuzzle === 'anchors') {
        const side = action.endsWith('left') ? 'left' : 'right';
        progress.valves = [...new Set([...progress.valves, `entry-${side}`])];
        progress.entranceOpen = ['entry-left', 'entry-right'].every((entry) => progress.valves.includes(entry));
        this.snapshot.hint = progress.entranceOpen
          ? `Both locks release. ${regionalLair.label} is open.`
          : 'One mechanism releases. Find the other; either order works.';
      } else if (regionalLair.entrancePuzzle === 'mirror') {
        const facing = Number(progress.valves.find((entry) => entry.startsWith('entry-facing-'))?.slice(-1) ?? 0);
        const next = (facing + 1) % 4;
        progress.valves = [`entry-facing-${next}`];
        progress.entranceOpen = next === 2;
        this.snapshot.hint = progress.entranceOpen
          ? `${regionalLair.label} opens as the lens catches the second horizon.`
          : `The lens faces ${['North', 'East', 'South', 'West'][next]}. Turn it toward the second horizon.`;
      } else {
        const cellId = worldCellAt(player.x, player.y)?.id;
        const sentriesRemain = this.enemies.some((enemy) =>
          !enemy.boss && worldCellAt(enemy.x, enemy.y)?.id === cellId);
        progress.entranceOpen = !sentriesRemain;
        this.snapshot.hint = progress.entranceOpen
          ? `The sentries fall. The ward to ${regionalLair.label} releases.`
          : 'The ward is held by local sentries. Defeat them, then operate the release lever.';
      }
      return true;
    }
    const mainSite = MAIN_BOSS_SITES.find((site) => prop.id === `main-boss-entry-${site.dungeonId}`);
    if (mainSite) {
      const missing = mainSite.requiredKeys.filter((key) =>
        !this.snapshot.inventory.some((item) => item.id === key));
      const legacyMarchesAccess = mainSite.regionId === 'drowned-marches' &&
        this.worldProgress.chapelGateOpen && this.snapshot.quest?.step === 'Defeat the Drowned Bellkeeper';
      if (missing.length && !legacyMarchesAccess) {
        this.snapshot.hint = `Complete all three mini-boss dungeons first. ${missing.length} lair key${missing.length === 1 ? '' : 's'} remain.`;
        this.snapshot.quest = {
          title: `The Three Keepers of ${mainSite.label}`,
          description: 'Find the three lairs scattered across this realm. Each keeper guards one key to the main dungeon.',
          step: 'Defeat the three lair keepers',
        };
      } else this.enterDungeon(mainSite.dungeonId);
      return true;
    }
    const marchesLair = MARCHES_LAIRS.find((lair) => prop.id.startsWith(`${lair.id}/`));
    if (marchesLair) {
      const progress = this.worldProgress.dungeons[marchesLair.id] ??= initialDungeonProgress();
      const action = prop.id.split('/')[1];
      if (action === 'record') {
        this.snapshot.dialogSpeaker = marchesLair.label;
        this.snapshot.dialog = prop.guideClue!; return true;
      }
      if (action === 'enter') {
        if (progress.entranceOpen) this.enterDungeon(marchesLair.id);
        else this.snapshot.hint = 'Read the entrance record and solve its mechanism with B.';
        return true;
      }
      if (progress.entranceOpen) {
        this.snapshot.hint = 'The entrance is permanently open.'; return true;
      }
      if (marchesLair.discovery === 'chimes') {
        const notes = progress.valves.filter((value) => value.startsWith('entry-note-'));
        if (action === `note-${notes.length}`) progress.valves.push(`entry-note-${notes.length}`);
        else progress.valves = progress.valves.filter((value) => !value.startsWith('entry-note-'));
        progress.entranceOpen = progress.valves.filter((value) => value.startsWith('entry-note-')).length === 3;
        this.snapshot.hint = progress.entranceOpen ? 'The waystone descends. The crypt is open.'
          : 'Entrance melody: Stone → Breath → Reed. A wrong note restarts it.';
      } else {
        const facing = Number(progress.valves.find((value) => value.startsWith('lantern-'))?.slice(-1) ?? 0);
        const next = (facing + 1) % 4;
        progress.valves = [`lantern-${next}`];
        progress.entranceOpen = next === 3;
        this.snapshot.hint = progress.entranceOpen ? 'The westward light reveals the vault ladder.'
          : `Lantern faces ${['North', 'East', 'South', 'West'][next]}. Turn it toward the westward flood scar.`;
      }
      return true;
    }
    const progress = this.dungeonProgress();
    if (prop.id === 'drainhouse-record') {
      this.snapshot.dialogSpeaker = 'Flood record';
      this.snapshot.dialog = prop.guideClue!; return true;
    }
    if (prop.id === 'drainhouse-enter') {
      if (progress.entranceOpen) this.enterDungeon(DRAINHOUSE_ID);
      else this.snapshot.hint = 'The entrance remains flooded. Cut the willow whose roots reach beneath the pool.';
      return true;
    }
    const visit = this.worldProgress.activeDungeon;
    if (!visit || !prop.id.startsWith('dungeon-')) return false;
    if (prop.id === 'dungeon-exit' || (prop.id === 'dungeon-return' && progress.bossDefeated)) {
      this.leaveDungeon(); return true;
    }
    if (prop.kind === 'rune') {
      const dungeon = dungeonById(visit.id)!;
      if (dungeon.puzzle === 'chimes') {
        if (progress.doorOpen) return true;
        const order = dungeon.mechanismRooms!;
        const notes = progress.valves.filter((value) => order.includes(value));
        if (visit.roomId === order[notes.length]) progress.valves.push(visit.roomId);
        else progress.valves = progress.valves.filter((value) => !order.includes(value));
        this.snapshot.hint = progress.valves.filter((value) => order.includes(value)).length === order.length
          ? 'The melody is complete. Release the Melody Seal.'
          : 'Inner melody: Reed → Stone → Breath. A wrong note restarts it.';
        return true;
      }
      if (dungeon.puzzle === 'weights') {
        if (progress.doorOpen) return true;
        const prefix = `weight-${visit.roomId}-`;
        const current = Number(progress.valves.find((value) => value.startsWith(prefix))?.slice(-1) ?? 0);
        progress.valves = [...progress.valves.filter((value) => !value.startsWith(prefix)), `${prefix}${(current + 1) % 3}`];
        this.snapshot.hint = 'Balance West High, Deep Middle, East High, then release the Balanced Seal.';
        return true;
      }
      if (dungeon.puzzle === 'hunt' && this.enemies.length) {
        this.snapshot.hint = 'Defeat the echo before freeing this soul ward.'; return true;
      }
      if (dungeon.puzzle === 'mirror' && !progress.valves.includes(`turned-${visit.roomId}`)) {
        progress.valves.push(`turned-${visit.roomId}`);
        this.snapshot.hint = 'The inner lens has turned once. Turn it again to align.'; return true;
      }
      progress.valves = [...new Set([...progress.valves, visit.roomId])];
      this.snapshot.hint = 'Mechanism released. Both mechanisms are needed at the inner seal.';
    } else if (prop.kind === 'gate') {
      const dungeon = dungeonById(visit.id)!;
      progress.doorOpen = progress.doorOpen || (dungeon.mechanismRooms ?? ['2:1', '0:1'])
        .every((id, index) => progress.valves.includes(dungeon.puzzle === 'weights'
          ? `weight-${id}-${index === 1 ? 1 : 2}` : id));
      this.snapshot.hint = progress.doorOpen ? 'The inner door opens permanently.' : dungeon.puzzleClue ?? 'Release both inner mechanisms first.';
    } else if (prop.kind === 'chest') {
      if (!progress.openedChests.includes(visit.roomId)) {
        progress.openedChests.push(visit.roomId);
        const dungeon = dungeonById(visit.id)!;
        const gear = dungeon.rooms.find((room) => room.id === visit.roomId)?.gearReward;
        player.coins += dungeon.regionId === 'first-hunger' ? 60 : 18;
        this.addItem({ id: 'small-tonic', name: 'Small tonic', kind: 'consumable',
          equipped: false, quantity: dungeon.regionId === 'first-hunger' ? 4 : 1, description: 'Restores 35 health.' });
        if (gear && !this.collectedIds.has(gear.id)) {
          this.collectedIds.add(gear.id);
          this.addItem({ ...gear });
          this.snapshot.hint = `Found ${gear.name}, plus the dungeon supplies. Equip it to improve your stats.`;
          this.addLog(`${prop.label}: ${gear.name}, shards, and tonics recovered.`);
        } else this.addLog(`${prop.label}: shards and tonics recovered.`);
        this.markFoundTreasureCell();
      }
      this.snapshot.hint = 'The cache is empty.';
    } else if (prop.kind === 'shrine') {
      player.hp = player.maxHp; player.resource = player.maxResource;
      this.snapshot.hint = 'The keeper’s spring restores health and energy.';
    } else if (prop.kind === 'inscription') {
      this.snapshot.dialogSpeaker = prop.label; this.snapshot.dialog = prop.guideClue!;
    }
    return true;
  }

  getQuestGuidance(): { objective: string; direction: string } | null {
    if (this.worldProgress.activeDungeon) {
      const dungeon = dungeonById(this.worldProgress.activeDungeon.id)!;
      return { objective: this.dungeonProgress().bossDefeated ? 'Use the victorious return door' : `Find and defeat ${dungeon.bossName ?? 'the Anchor Warden'}`,
        direction: dungeon.keyId ? 'Free both inner mechanisms, open the seal, and seek the warden. The threshold is a safe exit.'
          : 'Drain both cisterns, open the pressure door, and follow the eastward passages. The landing is a safe exit.' };
    }
    const step = this.snapshot.quest?.step;
    const cell = this.snapshot.player
      ? worldCellAt(this.snapshot.player.x, this.snapshot.player.y)
      : undefined;
    if (!step || !cell) return null;
    if (cell.regionId === HUNGER_REGION) {
      return { objective: this.worldProgress.finale.stage === 'unseen' ? 'Confront Maelis at the Vigil'
        : this.canEnterHungerArena() ? 'Enter the final battle' : 'Claim the First Echo’s key',
        direction: hungerSite(cell.id)!.clue };
    }

    const directions: Record<string, Record<string, string>> = {
      'Speak with Elder Rowan': {
        village: 'Go north to Elder Rowan beside Hearthglen’s old well.',
      },
      'Find the Rootbound Ruins beyond Briarwood': {
        village: 'Go north into Briarwood, then follow the trail east.',
        briarwood: 'Follow the northern trail, then turn east at High Briarwood.',
        northwood: 'Follow the trail east to the Rootbound Ruins.',
      },
      'Travel to the Mournwater Crossing': {
        village: 'Go east from Hearthglen into Southfield.',
        southfield: 'Follow the trail south to Bellward Pass.',
        'bellward-pass': 'Follow the trail west to Mournwater Road.',
        'mournwater-road': 'Follow the trail south to Mournwater Crossing.',
        'mournwater-crossing': 'Continue south across the causeway.',
      },
      'Find the stranded ferryman': {
        'drowned-marches-01-01': 'Follow the wet trail south, then east to Driftwood Ferry.',
        'drowned-marches-02-01': 'Follow the trail east to Driftwood Ferry.',
        'drowned-ferry': 'Speak with the ferryman here.',
      },
      'Reach the Sunken Chapel approach': {
        'drowned-ferry': 'Follow the trail east from Driftwood Ferry.',
        'sunken-chapel-approach': 'You have reached the flooded chapel approach.',
      },
      "Search the reedbed for Maelis's trail": {
        'sunken-chapel-approach': 'Read the marks at the waterline.',
      },
      "Find Maelis's field note at the chapel forecourt": {
        'reedveil-crossing': 'Follow the causeway east to the chapel forecourt.',
        'chapel-forecourt': 'Search the stone cairn for Maelis’s field note.',
      },
      'Enter the Sunken Chapel and read the tide-bell order': {
        'chapel-forecourt': 'Take the southern steps into the Sunken Chapel.',
        'sunken-chapel': 'The chapel bells are ahead. Read Maelis’s note for their order.',
      },
      'Ring the three tide bells: Low, High, Low': {
        'sunken-chapel': `Ring the bells in order: Low → High → Low (${this.worldProgress.chapelPuzzleProgress}/3).`,
      },
      'Defeat the Drowned Bellkeeper': {
        'sunken-chapel': 'The tide-locked door is open. Defeat the Drowned Bellkeeper.',
      },
      'Return the drowned bell seal to the ferryman': {
        'sunken-chapel': 'Leave through the chapel entrance and return to Driftwood Ferry.',
        'chapel-forecourt': 'Follow the reeds north to Driftwood Ferry.',
        'reedveil-crossing': 'Follow the wet trail north to Driftwood Ferry.',
        'sunken-chapel-approach': 'Return west through the reeds, then north to Driftwood Ferry.',
        'drowned-ferry': 'Speak with the ferryman.',
      },
      'Find Maelis’s trail mark at the Northbound Sluice': {
        'drowned-ferry': 'Follow the chapel road east, then take the western passage beyond the Sunken Chapel.',
        'sunken-chapel-approach': 'Follow the trail south to Reedveil, east to the forecourt, then south into the chapel.',
        'reedveil-crossing': 'Follow the causeway east to the forecourt, then south into the chapel.',
        'chapel-forecourt': 'Take the southern steps into the chapel, then leave through its western passage.',
        'sunken-chapel': 'Leave the chapel through the western opening and follow the causeway.',
        'bellkeeper-causeway': 'Follow the causeway west toward the drowned waystones.',
        'drowned-waystones': 'Continue west to Wrecker’s Reach.',
        'wreckers-reach': 'Follow the broken road south to the Old Floodgate.',
        'old-floodgate': 'Continue south to the Northbound Sluice.',
        'northbound-sluice': 'Read Maelis’s mark beside the sluice.',
      },
      'Reach Frostline Stair': {
        'northbound-sluice': 'Follow the sluice passage south; it climbs north into the Ashen Peaks.',
        'frostline-stair': 'You have reached the first Ashen Peaks trail.',
      },
      'Search Cinderwatch Approach for Maelis’s next sign': {
        'frostline-stair': 'Follow the mountain track east to Cinderwatch Approach.',
        'cinderwatch-approach': 'Search the broken lookout for Maelis’s signal mirror.',
      },
      'Follow Maelis’s trail deeper into the Ashen Peaks': {
        'cinderwatch-approach': 'The signal mirror points onward from Cinderwatch.',
      },
    };
    return {
      objective: step,
      direction: directions[step]?.[cell.id] ?? this.snapshot.quest.description,
    };
  }

  requestGuide(): boolean {
    if (this.restorationReplayMs !== null) return false;
    if (this.worldProgress.activeDungeon) {
      if (!this.activeRun || !this.snapshot.player || this.snapshot.guideCooldownMs > 0) return false;
      const dungeon = dungeonById(this.worldProgress.activeDungeon.id)!;
      this.snapshot.guideMessage = dungeon.puzzleClue ? `${dungeon.puzzleClue} ${dungeon.bossClue} The threshold always leads outside.`
        : dungeon.keyId
        ? `${dungeon.puzzle === 'mirror' ? 'Turn both inner lenses twice' : dungeon.puzzle === 'hunt' ? 'Defeat the echoes and release both soul wards' : 'Release both bone anchors'}, open the seal, then defeat ${dungeon.bossName}. B operates mechanisms; the threshold always leads outside.`
        : 'Drain both wheels in either order, open the pressure door, then defeat the Anchor Warden. B operates every mechanism; the landing always leads back outside.';
      this.snapshot.hint = this.snapshot.guideMessage;
      this.snapshot.guideUses += 1;
      this.snapshot.guideCooldownMs = Math.min(180_000, 15_000 * this.snapshot.guideUses);
      this.snapshot.guideDirection = null;
      this.snapshot.guideCueKind = 'clue'; this.snapshot.guideCueMs = 8_000;
      return true;
    }
    if (!this.activeRun || !this.snapshot.player || this.snapshot.guideCooldownMs > 0) return false;
    const hungerCell = worldCellAt(this.snapshot.player.x, this.snapshot.player.y);
    if (hungerCell?.regionId === HUNGER_REGION) {
      const target = this.hungerGuideTarget();
      const edge = getWorldPathDirection(hungerCell.id, target, this.worldProgress.unlockedRegions,
        true, true, this.worldProgress.marchesTide, this.worldProgress.silencedBells);
      this.snapshot.guideMessage = hungerCell.id === HUNGER_ARENA
        ? 'The Hunger’s rings tighten below 65% and 30% health. Strike between volleys; use powers, tonics, and retreat if needed.'
        : edge ? `Head ${edge} toward ${hungerSite(target)!.label}. ${hungerSite(hungerCell.id)!.clue}`
          : hungerSite(hungerCell.id)!.clue;
      this.snapshot.guideDirection = edge ? GUIDE_COMPASS_DIRECTIONS[edge] : null;
      this.snapshot.guideCueKind = edge ? 'route' : 'clue'; this.snapshot.guideCueMs = 8000;
      this.snapshot.guideUses++;
      this.snapshot.guideCooldownMs = Math.min(180_000, 15_000 * this.snapshot.guideUses);
      this.snapshot.hint = this.snapshot.guideMessage;
      return true;
    }
    const clue = this.nearbyGuideClue();
    const currentCell = worldCellAt(this.snapshot.player.x, this.snapshot.player.y);
    const currentCellId = currentCell?.id;
    const questSite = MAIN_BOSS_SITES.find((site) =>
      this.snapshot.quest.title === `The Three Keepers of ${site.label}`);
    const nextLair = this.snapshot.quest.step === 'Defeat the three lair keepers'
      ? this.nextRegionalLair(questSite?.regionId ?? currentCell?.regionId)
      : undefined;
    const mainSiteObjective = MAIN_BOSS_SITES.find((site) =>
      this.snapshot.quest.step === `Enter ${site.label}` ||
      (this.snapshot.quest.step === 'Defeat the three lair keepers' &&
        questSite?.regionId === site.regionId && !nextLair));
    const targetCellId = mainSiteObjective?.cellId ?? nextLair?.entryCellId ??
      GUIDE_OBJECTIVE_CELLS[this.snapshot.quest.step];
    const localTarget = !clue && targetCellId === currentCellId
      ? this.getGuideObjectiveTarget(currentCellId) ??
        (mainSiteObjective
          ? (() => {
              const portal = this.getProps().find((prop) => prop.id === `main-boss-entry-${mainSiteObjective.dungeonId}`);
              if (portal) return { x: portal.x, y: portal.y, label: portal.label, reach: 70 };
              const origin = worldCellOrigin(mainSiteObjective.cellId);
              return { x: origin.x + 320, y: origin.y + 160, label: mainSiteObjective.label, reach: 70 };
            })()
          : nextLair
            ? (() => {
              const origin = worldCellOrigin(nextLair.entryCellId);
              return { x: origin.x + 320, y: origin.y + 220, label: nextLair.label, reach: 100 };
            })()
            : null)
      : null;
    const localRoute = localTarget ? this.getGuideLocalRoute(localTarget) : null;
    const guidance = this.getQuestGuidance();
    const routeEdge = clue || localTarget ? null : this.getGuideRouteEdge();
    const nextCell = routeEdge && this.snapshot.player
      ? worldCellAt(this.snapshot.player.x, this.snapshot.player.y)
      : undefined;
    const directionMessage = localRoute?.message ?? (routeEdge && nextCell
      ? `Head ${routeEdge} through ${this.getNextGuideCellLabel(nextCell.id, routeEdge)}.`
      : guidance?.direction ?? this.snapshot.quest.description);
    const message = clue ?? directionMessage;
    const direction = localRoute?.edge
      ? GUIDE_COMPASS_DIRECTIONS[localRoute.edge]
      : routeEdge ? GUIDE_COMPASS_DIRECTIONS[routeEdge] : null;
    const unavailable = !clue && (localTarget
      ? !localRoute?.reachable
      : !direction);
    const unavailableMessage = !targetCellId
      ? 'No onward Guide route is available for this objective yet.'
      : targetCellId === currentCellId
        ? localTarget
          ? `The Guide cannot find an open path to ${localTarget.label}.`
          : `Your objective is in this screen. ${directionMessage}`
        : `The Guide cannot find an open route. ${directionMessage}`;
    const uses = this.snapshot.guideUses + 1;
    if (!unavailable) {
      this.snapshot.guideUses = uses;
      this.snapshot.guideCooldownMs = Math.min(180_000, 15_000 * uses);
    }
    this.snapshot.guideDirection = direction;
    this.snapshot.guideCueMs = 8_000;
    this.snapshot.guideCueKind = clue
      ? 'clue'
      : unavailable
        ? 'unavailable'
        : localRoute?.atTarget
          ? 'objective'
          : 'route';
    this.snapshot.guideMessage = unavailable
      ? unavailableMessage
      : localRoute?.atTarget
        ? localRoute.message
        : message;
    this.snapshot.hint = unavailable ? unavailableMessage : clue ? `Guide clue: ${message}` : `Follow the guide: ${message}`;
    return true;
  }

  private nextRegionalLair(regionId?: WorldRegionId): DungeonDefinition | undefined {
    if (!regionId) return undefined;
    return DUNGEONS.find((dungeon) =>
      dungeon.role === 'mini' &&
      dungeon.regionId === regionId &&
      !this.worldProgress.completedDungeons.includes(dungeon.id) &&
      !this.worldProgress.dungeons[dungeon.id]?.bossDefeated &&
      !(dungeon.keyId && this.snapshot.inventory.some((item) => item.id === dungeon.keyId)));
  }

  private getGuideObjectiveTarget(cellId: string | undefined): { x: number; y: number; label: string; reach: number } | null {
    if (!cellId) return null;
    const step = this.snapshot.quest.step;
    if (step === 'Defeat the Drowned Bellkeeper') {
      const site = MAIN_BOSS_SITES.find((entry) => entry.regionId === 'drowned-marches');
      const portal = site && this.getProps().find((prop) => prop.id === `main-boss-entry-${site.dungeonId}`);
      if (portal) return { x: portal.x, y: portal.y, label: portal.label, reach: 70 };
    }
    let propId = GUIDE_OBJECTIVE_PROPS[step];
    if (step === 'Ring the three tide bells: Low, High, Low') {
      propId = ['chapel-bell-low-a', 'chapel-bell-high', 'chapel-bell-low-b'][this.worldProgress.chapelPuzzleProgress] ?? '';
    } else if (step === 'Find the Bell of Joy in the Glasslands') {
      propId = ['glass-bell-rune-dawn', 'glass-bell-rune-bloom', 'glass-bell-rune-reflection'][this.worldProgress.glasslandsPuzzleProgress]
        ?? 'glass-bell-inscription';
    } else if (step === 'Find the Bell of Resolve in the Fallen Capital') {
      propId = ['capital-bell-rune-name', 'capital-bell-rune-oath', 'capital-bell-rune-vow'][this.worldProgress.fallenCapitalPuzzleProgress]
        ?? 'capital-bell-inscription';
    }

    const prop = propId
      ? this.getProps().find((candidate) =>
        candidate.id === propId &&
        candidate.visible !== false &&
        !candidate.activated &&
        worldCellAt(candidate.x, candidate.y)?.id === cellId)
      : undefined;
    if (prop) return { x: prop.x, y: prop.y, label: prop.label, reach: 50 };

    const bossStep = [
      'Defeat the Drowned Bellkeeper',
      'Find the Bell of Fury in the Ashen Peaks',
      'Find The First Hunger in the Hollow',
      'Defeat The First Hunger',
    ].includes(step);
    if (bossStep) {
      const enemy = this.enemies.find((candidate) =>
        candidate.boss && worldCellAt(candidate.x, candidate.y)?.id === cellId);
      if (enemy) return {
        x: enemy.x,
        y: enemy.y,
        label: enemy.name,
        reach: enemy.radius + 42,
      };
    }
    return null;
  }

  private getGuideLocalRoute(target: { x: number; y: number; label: string; reach: number }):
    { edge: WorldCellEdge | null; message: string; reachable: boolean; atTarget: boolean } | null {
    const player = this.snapshot.player;
    const cell = player ? worldCellAt(player.x, player.y) : undefined;
    if (!player || !cell) return null;

    const spacing = 24;
    const nodes = new Map<string, { x: number; y: number }>();
    const clearance = 12;
    for (let y = cell.y + spacing / 2; y < cell.y + WORLD_CELL_HEIGHT; y += spacing) {
      for (let x = cell.x + spacing / 2; x < cell.x + WORLD_CELL_WIDTH; x += spacing) {
        const hasClearance = [
          [x, y],
          [x - clearance, y],
          [x + clearance, y],
          [x, y - clearance],
          [x, y + clearance],
        ].every(([testX, testY]) => !this.isBlocked(testX!, testY!, testX!, testY!));
        if (hasClearance) nodes.set(`${x},${y}`, { x, y });
      }
    }
    const start = [...nodes.values()]
      .sort((a, b) => distance(player.x, player.y, a.x, a.y) - distance(player.x, player.y, b.x, b.y))[0];
    if (!start) return { edge: null, message: '', reachable: false, atTarget: false };

    const keyFor = (x: number, y: number) => `${x},${y}`;
    const directions: { edge: WorldCellEdge; dx: number; dy: number }[] = [
      { edge: 'north', dx: 0, dy: -spacing },
      { edge: 'east', dx: spacing, dy: 0 },
      { edge: 'south', dx: 0, dy: spacing },
      { edge: 'west', dx: -spacing, dy: 0 },
    ];
    const startKey = keyFor(start.x, start.y);
    const firstEdges = new Map<string, WorldCellEdge | null>([[startKey, null]]);
    const queue = [start];
    for (let index = 0; index < queue.length; index += 1) {
      const node = queue[index]!;
      const nodeKey = keyFor(node.x, node.y);
      if (distance(node.x, node.y, target.x, target.y) <= target.reach) {
        const edge = firstEdges.get(nodeKey) ?? null;
        const atTarget = edge === null;
        return {
          edge,
          message: atTarget
            ? `You are beside ${target.label}. Interact to continue.`
            : `Head ${edge} toward ${target.label}.`,
          reachable: true,
          atTarget,
        };
      }
      for (const direction of directions) {
        const nextX = node.x + direction.dx;
        const nextY = node.y + direction.dy;
        const nextKey = keyFor(nextX, nextY);
        if (!nodes.has(nextKey) || firstEdges.has(nextKey)) continue;
        firstEdges.set(nextKey, nodeKey === startKey ? direction.edge : firstEdges.get(nodeKey)!);
        queue.push(nodes.get(nextKey)!);
      }
    }
    return {
      edge: null,
      message: `The Guide cannot find an open path to ${target.label}.`,
      reachable: false,
      atTarget: false,
    };
  }

  private getGuideRouteEdge(): WorldCellEdge | null {
    const player = this.snapshot.player;
    const targetCellId = GUIDE_OBJECTIVE_CELLS[this.snapshot.quest.step];
    const currentCell = player ? worldCellAt(player.x, player.y) : undefined;
    if (!currentCell || !targetCellId) return null;
    return getWorldPathDirection(
      currentCell.id,
      targetCellId,
      this.worldProgress.unlockedRegions,
      this.snapshot.gateOpen,
      this.snapshot.keyFound,
      this.worldProgress.marchesTide,
      this.worldProgress.silencedBells,
    );
  }

  private getNextGuideCellLabel(cellId: string, edge: WorldCellEdge): string {
    const currentCell = WORLD_CELLS.find((cell) => cell.id === cellId);
    if (!currentCell) return 'the next trail';
    const offsets: Record<WorldCellEdge, [number, number]> = {
      north: [0, -WORLD_CELL_HEIGHT],
      east: [WORLD_CELL_WIDTH, 0],
      south: [0, WORLD_CELL_HEIGHT],
      west: [-WORLD_CELL_WIDTH, 0],
    };
    const [dx, dy] = offsets[edge];
    return worldCellAt(currentCell.x + dx + WORLD_CELL_WIDTH / 2, currentCell.y + dy + WORLD_CELL_HEIGHT / 2)?.label
      ?? 'the next trail';
  }

  private refreshGuideDirection(): void {
    if (this.snapshot.guideCueMs <= 0 || this.snapshot.guideCueKind === 'clue') return;
    const previousDirection = this.snapshot.guideDirection;
    const previousMessage = this.snapshot.guideMessage;
    const previousCueKind = this.snapshot.guideCueKind;
    const hungerCell = this.snapshot.player && worldCellAt(this.snapshot.player.x, this.snapshot.player.y);
    if (hungerCell?.regionId === HUNGER_REGION) {
      const target = this.hungerGuideTarget();
      const edge = getWorldPathDirection(hungerCell.id, target, this.worldProgress.unlockedRegions,
        true, true, this.worldProgress.marchesTide, this.worldProgress.silencedBells);
      this.snapshot.guideDirection = edge ? GUIDE_COMPASS_DIRECTIONS[edge] : null;
      this.snapshot.guideCueKind = edge ? 'route' : 'clue';
      this.snapshot.guideMessage = edge
        ? `Head ${edge} toward ${hungerSite(target)!.label}. ${hungerSite(hungerCell.id)!.clue}`
        : hungerSite(hungerCell.id)!.clue;
      if (this.snapshot.guideDirection !== previousDirection || this.snapshot.guideMessage !== previousMessage) {
        this.snapshot.hint = this.snapshot.guideMessage;
      }
      return;
    }
    const currentCellId = this.snapshot.player
      ? worldCellAt(this.snapshot.player.x, this.snapshot.player.y)?.id
      : undefined;
    const targetCellId = GUIDE_OBJECTIVE_CELLS[this.snapshot.quest.step];
    const localTarget = targetCellId === currentCellId
      ? this.getGuideObjectiveTarget(currentCellId)
      : null;
    if (localTarget) {
      const route = this.getGuideLocalRoute(localTarget);
      this.snapshot.guideDirection = route?.edge ? GUIDE_COMPASS_DIRECTIONS[route.edge] : null;
      this.snapshot.guideCueKind = route?.reachable
        ? route.atTarget ? 'objective' : 'route'
        : 'unavailable';
      this.snapshot.guideMessage = route?.message ?? `The Guide cannot find an open path to ${localTarget.label}.`;
      if (
        this.snapshot.guideDirection !== previousDirection ||
        this.snapshot.guideMessage !== previousMessage ||
        this.snapshot.guideCueKind !== previousCueKind
      ) {
        this.snapshot.hint = this.snapshot.guideCueKind === 'unavailable'
          ? this.snapshot.guideMessage
          : `Follow the guide: ${this.snapshot.guideMessage}`;
      }
      return;
    }
    const edge = this.getGuideRouteEdge();
    this.snapshot.guideDirection = edge ? GUIDE_COMPASS_DIRECTIONS[edge] : null;
    const guidance = this.getQuestGuidance();
    const directionMessage = edge && currentCellId
      ? `Head ${edge} through ${this.getNextGuideCellLabel(currentCellId, edge)}.`
      : guidance?.direction ?? this.snapshot.quest.description;
    if (edge) {
      this.snapshot.guideCueKind = 'route';
      this.snapshot.guideMessage = directionMessage;
    } else {
      this.snapshot.guideCueKind = 'unavailable';
      this.snapshot.guideMessage = !targetCellId
        ? 'No onward Guide route is available for this objective yet.'
        : targetCellId === currentCellId
          ? `Your objective is in this screen. ${directionMessage}`
          : `The Guide cannot find an open route. ${directionMessage}`;
    }
    if (
      this.snapshot.guideDirection !== previousDirection ||
      this.snapshot.guideMessage !== previousMessage ||
      this.snapshot.guideCueKind !== previousCueKind
    ) {
      this.snapshot.hint = this.snapshot.guideCueKind === 'unavailable'
        ? this.snapshot.guideMessage
        : `Follow the guide: ${this.snapshot.guideMessage}`;
    }
  }

  private nearbyGuideClue(): string | null {
    const player = this.snapshot.player;
    if (!player) return null;
    const playerCell = worldCellAt(player.x, player.y)?.id;
    const nearest = this.getProps()
      .filter((prop) =>
        !prop.activated &&
        (prop.guideClue || prop.kind === 'treeGate' || prop.kind === 'gate' || prop.kind === 'inscription') &&
        worldCellAt(prop.x, prop.y)?.id === playerCell &&
        distance(player.x, player.y, prop.x, prop.y) <= 132)
      .sort((a, b) => distance(player.x, player.y, a.x, a.y) - distance(player.x, player.y, b.x, b.y))[0];
    if (!nearest) return null;
    if (nearest.kind === 'treeGate') {
      if (nearest.hitsRequired) {
        return `${nearest.label} opens in at most ${nearest.hitsRequired} strikes (${nearest.hitsTaken ?? 0}/${nearest.hitsRequired} hits). Any weapon or class works.`;
      }
      if (nearest.requiredWeaponName) {
        return `${nearest.label} parts only for ${nearest.requiredWeaponName}.`;
      }
      return `${nearest.label} needs ${nearest.damageRequired ?? 0} total damage from attacks. Keep striking; any weapon or class can break it.`;
    }
    return nearest.guideClue ?? `Look closely at ${nearest.label}; it may reveal what this place needs.`;
  }

  getAttackAnimation(): { remainingMs: number; direction: { x: number; y: number } } | null {
    return this.attackAnimationMs > 0
      ? { remainingMs: this.attackAnimationMs, direction: { ...this.attackAnimationDirection } }
      : null;
  }

  getEnemies(): EnemyActor[] {
    return this.enemies;
  }

  getProjectiles(): Projectile[] {
    return this.projectiles;
  }

  getEffects(): WorldEffect[] {
    return this.effects;
  }

  getProps(): WorldProp[] {
    const visit = this.worldProgress.activeDungeon;
    if (visit) return [...this.getDungeonProps(),
      ...this.wellProps(WELLS.filter((well) => well.dungeonId === visit.id && well.roomId === visit.roomId)),
      ...(this.worldProgress.finale.stage === 'battle' && this.worldProgress.finale.allied
        ? [this.maelisCompanionProp(this.isMaelisConversationRoom())].filter((prop): prop is WorldProp => prop !== null)
        : [])];
    const rowanStop = getRowanTravelStop(this.worldProgress.silencedBells);
    const props = (Object.entries(propsByRoom) as [RoomId, WorldProp[]][]).flatMap(([room, templates]) => {
      const propCell = room === 'village' ? 'village'
        : room === 'woodland' ? 'briarwood'
          : room === 'chapel' ? 'sunken-chapel'
            : room;
      const origin = worldCellOrigin(propCell);
      return templates
        .filter((prop) =>
          prop.kind !== 'portal' &&
          !(prop.id === 'rowan' && rowanStop))
        .map((prop) => ({ ...prop, x: prop.x + origin.x, y: prop.y + origin.y }));
    });
    props.push(...this.getHungerProps());
    props.push(...this.getGlasslandsProps());
    props.push(...this.getMournwaterTownProps());
    props.push(...this.getCapitalStrongholdProps());
    props.push(...this.getRegionalLairProps(), ...this.getMainBossProps(), ...this.getRegionalFieldGearProps());
    if (this.worldProgress.finale.stage === 'battle' && this.worldProgress.finale.allied && this.maelisAlly) {
      const companion = this.maelisCompanionProp(false);
      if (companion) props.push(companion);
    } else if (this.worldProgress.finale.stage === 'choice' && this.maelisAlly) {
      const companion = this.maelisCompanionProp(true);
      if (companion) props.push(companion);
    }
    if (rowanStop) {
      const origin = worldCellOrigin(rowanStop.cellId);
      props.push({
        id: 'rowan',
        kind: 'npc',
        x: origin.x + rowanStop.x,
        y: origin.y + rowanStop.y,
        label: 'Elder Rowan',
      });
    }
    const northwood = worldCellOrigin('northwood');
    const drainEntry = worldCellOrigin('wreckers-reach');
    const drain = this.worldProgress.dungeons[DRAINHOUSE_ID] ??= initialDungeonProgress();
    props.push(
      { id: 'drainhouse-record', kind: 'inscription', x: drainEntry.x + 240, y: drainEntry.y + 180, label: 'Drainhouse flood record',
        guideClue: 'A dead willow leans over the flooded intake. Its roots reach beneath the old stone pool; cut it to draw the water away.' },
      ...(!drain.entranceOpen ? [{
        id: 'drainhouse-willow', kind: 'treeGate' as const, x: drainEntry.x + 475, y: drainEntry.y + 315,
        label: 'Flood-root willow', hitsRequired: 1,
        guideClue: 'The willow’s roots disappear beneath the flooded pool. One clean strike may open the old drain.',
      }] : []),
      ...(drain.entranceOpen ? [{
        id: 'drainhouse-enter', kind: 'portal' as const, x: drainEntry.x + 320, y: drainEntry.y + 160,
        label: 'Enter Drowned Drainhouse', activated: true,
      }] : []),
    );
    const floodgate = worldCellOrigin('old-floodgate');
    const siltTreeOpen = this.worldProgress.destroyedObstacles.includes('marsh-silt-tree');
    props.push(
      { id: 'marsh-silt-tree', kind: 'treeGate', x: floodgate.x + 485, y: floodgate.y + 320,
        label: 'Silt-hollow willow', hitsRequired: 1, activated: siltTreeOpen,
        guideClue: 'The old willow stands beside a shallow silt pool. A single strike could reveal what the flood buried.' },
      { id: 'marsh-silt-cache', kind: 'chest', x: floodgate.x + 485, y: floodgate.y + 370,
        label: 'Poolside coffer', visible: siltTreeOpen, activated: this.collectedIds.has('marsh-silt-cache') },
    );
    for (const lair of MARCHES_LAIRS) {
      const origin = worldCellOrigin(lair.entryCellId);
      const progress = this.worldProgress.dungeons[lair.id] ??= initialDungeonProgress();
      const prop = (action: string, kind: WorldProp['kind'], label: string, x: number, y: number, activated = false): WorldProp =>
        ({ id: `${lair.id}/${action}`, kind, label, x: origin.x + x, y: origin.y + y, activated });
      props.push(
        { ...prop('record', 'inscription', `${lair.label} record`, 230, 160),
          guideClue: lair.discovery === 'chimes'
            ? 'The waystones sing Stone → Breath → Reed. Ring those entrance chimes with B. Inside, the epitaph teaches a different melody.'
            : 'The old flood scar lies west. Turn the survey lantern North → East → South → West with B to reveal a ladder. The inner weights have their own diagram.' },
        prop('enter', 'portal', progress.entranceOpen ? `Enter ${lair.label}` : `${lair.label}: hidden entrance`, 320, 160, progress.entranceOpen),
      );
      if (lair.discovery === 'chimes') {
        for (const [index, name] of ['Stone', 'Breath', 'Reed'].entries()) {
          props.push(prop(`note-${index}`, 'rune', `Ring entrance ${name} chime`, 180 + index * 140, 290,
            progress.valves.includes(`entry-note-${index}`)));
        }
      } else {
        const facing = Number(progress.valves.find((value) => value.startsWith('lantern-'))?.slice(-1) ?? 0);
        props.push(prop('lantern', 'rune', `Turn survey lantern (facing ${['North', 'East', 'South', 'West'][facing]})`,
          320, 290, progress.entranceOpen));
      }
    }
    const rootDoorOpened = this.worldProgress.destroyedObstacles.includes('northwood-root-door');
    const treeGateRegion = worldCellAt(northwood.x + 490, northwood.y + 358)?.regionId ?? 'hearthglen';
    const treeGateDamageRequired = getTreeGateDamageRequired(treeGateRegion);
    props.push(
      {
        id: 'northwood-root-door',
        kind: 'treeGate',
        x: northwood.x + 490,
        y: northwood.y + 358,
        label: 'The oldroot seal',
        activated: rootDoorOpened,
        damageRequired: treeGateDamageRequired,
        damageTaken: this.worldProgress.obstacleDamage['northwood-root-door'] ?? 0,
      },
      {
        id: 'northwood-root-cache',
        kind: 'chest',
        x: northwood.x + 490,
        y: northwood.y + 398,
        label: 'Oldroot cache',
        visible: rootDoorOpened,
        activated: this.collectedIds.has('northwood-root-cache'),
      },
    );
    const riverbank = worldCellOrigin('riverbank');
    const briarSealOpened = this.worldProgress.destroyedObstacles.includes('riverbank-briar-seal');
    props.push(
      {
        id: 'riverbank-briar-seal',
        kind: 'treeGate',
        x: riverbank.x + 320,
        y: riverbank.y + 246,
        label: 'The thornbound seal',
        activated: briarSealOpened,
        hitsRequired: THORNBOUND_SEAL_HITS,
        hitsTaken: briarSealOpened ? THORNBOUND_SEAL_HITS : this.worldProgress.obstacleHits['riverbank-briar-seal'] ?? 0,
        guideClue: 'Five strikes loosen the river roots. Any weapon can break the thornbound seal.',
      },
      {
        id: 'riverbank-briar-inscription',
        kind: 'inscription',
        x: riverbank.x + 320,
        y: riverbank.y + 146,
        label: 'Thornbound carving',
        guideClue: 'The carving reads: “Five strikes loosen what the river roots have bound.”',
      },
      {
        id: 'riverbank-briar-cache',
        kind: 'chest',
        x: riverbank.x + 320,
        y: riverbank.y + 302,
        label: 'Riverheart cache',
        visible: briarSealOpened,
        activated: this.collectedIds.has('riverbank-briar-cache'),
      },
    );
    if (this.snapshot.bossDefeated) {
      props.push({
        id: 'sanctum-coffer',
        kind: 'chest',
        x: worldCellOrigin('sanctum').x + 320,
        y: worldCellOrigin('sanctum').y + 236,
        label: 'Cinderheart relic',
        activated: this.collectedIds.has('cinderheart'),
      });
    }
    if (this.worldProgress.unlockedRegions.includes('drowned-marches')) {
      const ferry = worldCellOrigin('drowned-ferry');
      props.push({
        id: 'mournwater-ferryman',
        kind: 'npc',
        x: ferry.x + 320,
        y: ferry.y + 236,
        label: 'Stranded Ferryman',
      });
      const approach = worldCellOrigin('sunken-chapel-approach');
      const forecourt = worldCellOrigin('chapel-forecourt');
      props.push(
        {
          id: 'maelis-trail-mark',
          kind: 'inscription',
          x: approach.x + 320,
          y: approach.y + 150,
          label: 'Maelis’s trail mark',
        },
        {
          id: 'maelis-field-note',
          kind: 'inscription',
          x: forecourt.x + 320,
          y: forecourt.y + 300,
          label: 'Maelis’s field note',
          visible: this.worldProgress.discoveredDungeons.includes('sunken-chapel'),
        },
      );
    }
    if (
      this.worldProgress.unlockedRegions.includes('ashen-peaks') &&
      this.worldProgress.completedDungeons.includes('sunken-chapel')
    ) {
      const sluice = worldCellOrigin('northbound-sluice');
      const cinderwatch = worldCellOrigin('cinderwatch-approach');
      props.push(
        {
          id: 'maelis-northbound-mark',
          kind: 'inscription',
          x: sluice.x + 320,
          y: sluice.y + 236,
          label: 'Maelis’s floodway mark',
          guideClue: 'Maelis’s trail turns through the sluice and climbs toward Frostline Stair.',
        },
        {
          id: 'maelis-cinderwatch-mark',
          kind: 'inscription',
          x: cinderwatch.x + 320,
          y: cinderwatch.y + 286,
          label: 'Maelis’s signal mirror',
          guideClue: 'A fresh signal from Maelis points farther into the Ashen Peaks.',
        },
      );
    }
    if (this.worldProgress.unlockedRegions.includes('glasslands')) {
      const sanctum = worldCellOrigin('joy-bell-sanctum');
      props.push(
        {
          id: 'glass-bell-inscription',
          kind: 'inscription',
          x: sanctum.x + 320,
          y: sanctum.y + 116,
          label: 'Prism Conservatory inscription',
          guideClue: 'The Conservatory names the order: Dawn → Bloom → Reflection.',
        },
        ...([
          ['glass-bell-rune-dawn', 'Dawn rune', 232, 236],
          ['glass-bell-rune-bloom', 'Bloom rune', 320, 202],
          ['glass-bell-rune-reflection', 'Reflection rune', 408, 236],
        ] as const).map(([id, label, x, y]) => ({
          id,
          kind: 'rune' as const,
          x: sanctum.x + x,
          y: sanctum.y + y,
          label,
        })),
      );
    }
    if (this.worldProgress.unlockedRegions.includes('fallen-capital')) {
      const sanctum = worldCellOrigin('resolve-bell-sanctum');
      props.push(
        {
          id: 'capital-bell-inscription',
          kind: 'inscription',
          x: sanctum.x + 320,
          y: sanctum.y + 116,
          label: 'Last Archive inscription',
          guideClue: 'The archive preserves the order: Name → Oath → Vow.',
        },
        ...([
          ['capital-bell-rune-name', 'Name rune', 232, 236],
          ['capital-bell-rune-oath', 'Oath rune', 320, 202],
          ['capital-bell-rune-vow', 'Vow rune', 408, 236],
        ] as const).map(([id, label, x, y]) => ({
          id,
          kind: 'rune' as const,
          x: sanctum.x + x,
          y: sanctum.y + y,
          label,
        })),
      );
    }
    props.push(...this.wellProps(WELLS.filter((well) => !well.dungeonId)));
    props.forEach((prop) => {
      if (prop.kind === 'treeGate') {
        prop.hitsRequired = vegetationHitLimit(prop.hitsRequired);
        prop.hitsTaken = prop.activated ? prop.hitsRequired
          : Math.min(prop.hitsRequired, this.worldProgress.obstacleHits[prop.id] ?? 0);
      }
      if (prop.kind === 'rune') {
        const index = ['rune-sun', 'rune-star', 'rune-moon'].indexOf(prop.id);
        if (index >= 0) prop.activated = index < this.snapshot.puzzleProgress || this.puzzleSolved;
      }
      if (prop.id === 'key-chest') prop.activated = this.keyChestOpened;
      if (prop.id === 'ruins-gate') prop.activated = this.snapshot.gateOpen;
      if (prop.id === 'village-chest') prop.activated = this.villageChestOpened;
      if (prop.id === 'forest-chest') prop.activated = this.forestChestOpened;
      if (prop.id === 'forest-shrine') prop.activated = this.shrineUsed;
      if (prop.id === 'chapel-inner-seal') prop.activated = this.worldProgress.chapelGateOpen;
      if (prop.id.startsWith('chapel-bell-')) {
        const bellIndex = ['chapel-bell-low-a', 'chapel-bell-high', 'chapel-bell-low-b'].indexOf(prop.id);
        prop.activated = bellIndex >= 0 && bellIndex < this.worldProgress.chapelPuzzleProgress;
      }
      if (prop.id.startsWith('glass-bell-rune-')) {
        const bellIndex = ['glass-bell-rune-dawn', 'glass-bell-rune-bloom', 'glass-bell-rune-reflection'].indexOf(prop.id);
        prop.activated = bellIndex >= 0 && bellIndex < this.worldProgress.glasslandsPuzzleProgress;
      }
      if (prop.id.startsWith('capital-bell-rune-')) {
        const bellIndex = ['capital-bell-rune-name', 'capital-bell-rune-oath', 'capital-bell-rune-vow'].indexOf(prop.id);
        prop.activated = bellIndex >= 0 && bellIndex < this.worldProgress.fallenCapitalPuzzleProgress;
      }
    });
    return props;
  }

  beginCreation(): void {
    this.snapshot.mode = 'creator';
  }

  returnToTitle(): void {
    this.stopRestorationReplay();
    this.releaseAllDirections();
    this.audioEvents = [];
    this.snapshot.overlay = null;
    this.snapshot.dialog = null;
    this.snapshot.dialogSpeaker = null;
    this.snapshot.mode = 'title';
    this.activeRun = false;
  }

  startNewGame(config: CharacterConfig): void {
    this.stopRestorationReplay();
    const classData = CLASSES[config.classId];
    this.snapshot = {
      ...initialSnapshot(),
      mode: 'playing',
      player: {
        ...config,
        name: config.name.trim().slice(0, 18) || 'Wayfarer',
        level: 1,
        xp: 0,
        trainingPoints: 0,
        hp: classData.maxHp + 12,
        maxHp: classData.maxHp + 12,
        resource: classData.maxResource,
        maxResource: classData.maxResource,
        resourceName: classData.resourceName,
        coins: 14,
        x: worldCellOrigin('village').x + 320,
        y: worldCellOrigin('village').y + 344,
        facing: 'down',
        weapon: classData.weapon,
      },
      trainedPowers: getStartingPowerRanks(config.classId),
      abilities: makeAbilities(config.classId, getStartingPowerRanks(config.classId)),
      inventory: startItems(),
      hint: 'Find Elder Rowan near the old well.',
      log: ['The road leads to Hearthglen.', 'Find Elder Rowan near the old well.'],
    };
    this.resetWorld();
    this.enemies = this.createWorldEnemies();
    this.updateWorldRegion();
    this.activeRun = true;
  }

  loadSave(saved: SavedRun): boolean {
    this.stopRestorationReplay();
    const savedPlayer = saved.state?.player;
    if (!SUPPORTED_SAVE_VERSIONS.has(saved.version) || !savedPlayer || !saved.progress) return false;
    const previousLayout = [
      { label: 'High Briarwood', x: 0, y: 0 },
      { label: 'Briarwood Trail', x: 0, y: 480 },
      { label: 'Hearthglen', x: 0, y: 960 },
      { label: 'Rootbound Ruins', x: 640, y: 480 },
      { label: 'Ember Sanctum', x: 640, y: 0 },
      { label: 'Fernwood', x: 640, y: 960 },
    ];
    const remapV2Position = (x: number, y: number) => {
      if (saved.version !== 2) return { x, y };
      const oldCell = previousLayout.find((cell) =>
        x >= cell.x && x < cell.x + 640 && y >= cell.y && y < cell.y + 480);
      const newCell = oldCell && WORLD_CELLS.find((cell) => cell.label === oldCell.label);
      return oldCell && newCell
        ? { x: newCell.x + x - oldCell.x, y: newCell.y + y - oldCell.y }
        : { x, y };
    };
    const v1CellId = saved.state.roomId === 'woodland'
      ? saved.state.location === 'High Briarwood' ? 'northwood'
        : saved.state.location === 'Fernwood' ? 'fernwood' : 'briarwood'
      : saved.state.roomId;
    const v1Cell = WORLD_CELLS.find((cell) => cell.id === v1CellId);
    const legacyOffset = saved.version === 1
      ? v1Cell ? { x: v1Cell.x, y: v1Cell.y } : ROOM_ORIGINS[saved.state.roomId]
      : { x: 0, y: 0 };
    let playerPosition = saved.version === 1
      ? { x: savedPlayer.x + legacyOffset.x, y: savedPlayer.y + legacyOffset.y }
      : remapV2Position(savedPlayer.x, savedPlayer.y);
    const trainedPowers = saved.state.trainedPowers ?? getStartingPowerRanks(savedPlayer.classId);
    const savedAbilities = Array.isArray(saved.state.abilities) ? saved.state.abilities : [];
    const abilities = Array.from({ length: 4 }, (_, slot) => {
      const savedAbility = savedAbilities[slot];
      if (!savedAbility) return null;
      const definition = findClassPower(savedPlayer.classId, savedAbility.id);
      if (!definition) return null;
      return {
        ...definition,
        rank: trainedPowers[definition.id] ?? 1,
        remainingMs: Math.max(0, savedAbility.remainingMs ?? 0),
      };
    });
    const trainingPoints = Number.isFinite(savedPlayer.trainingPoints)
      ? savedPlayer.trainingPoints
      : Math.max(0, savedPlayer.level - 1);
    const restoredWorldProgress = normalizeWorldProgress(saved.progress.world);
    const restoredInventory = saved.state.inventory.map((item) => ({ ...item }));
    let migratedFinalBossActor: EnemyActor | null = null;
    const savedInOldFinalSanctum = !restoredWorldProgress.activeDungeon &&
      restoredWorldProgress.finale.stage === 'battle' &&
      worldCellAt(playerPosition.x, playerPosition.y)?.id === 'first-hunger-sanctum';
    const legacyFinale = saved.version < 10 && restoredWorldProgress.finale.stage !== 'unseen';
    if (legacyFinale) {
      restoredWorldProgress.unlockedRegions = [...new Set([...restoredWorldProgress.unlockedRegions, HUNGER_REGION])];
      // Finale access belongs to story progress, not the current position:
      // the prototype respawned fallen players in Hearthglen and allowed retreat.
      restoredWorldProgress.destroyedObstacles = [...new Set([
        ...restoredWorldProgress.destroyedObstacles, 'hunger-legacy-access',
      ])];
      if (!restoredWorldProgress.activeDungeon &&
          worldCellAt(playerPosition.x, playerPosition.y)?.id === 'first-hunger-sanctum') {
        const battle = ['battle', 'restoring', 'complete'].includes(restoredWorldProgress.finale.stage);
        const old = worldCellOrigin('first-hunger-sanctum');
        const destination = worldCellOrigin(battle ? HUNGER_ARENA : MAELIS_HUB);
        playerPosition.x += destination.x - old.x; playerPosition.y += destination.y - old.y;
      }
    }
    const oldHungerOrigin = worldCellOrigin(HUNGER_ENTRY);
    const oldHungerColumn = Math.floor((playerPosition.x - oldHungerOrigin.x) / WORLD_CELL_WIDTH);
    const oldHungerRow = Math.floor((playerPosition.y - oldHungerOrigin.y) / WORLD_CELL_HEIGHT);
    const insideLegacyHungerMap = oldHungerRow >= 0 && oldHungerRow < 6 &&
      oldHungerColumn >= 0 && oldHungerColumn < 10;
    const firstHungerDungeon = dungeonById('first-hunger-maw')!;
    const firstHungerBossRoom = firstHungerDungeon.rooms.find((room) => room.feature === 'boss')!;
    const firstHungerBossOrigin = dungeonRoomOrigin(firstHungerBossRoom);
    const oldHungerBoss = saved.actors.find((actor) =>
      actor.id === 'first-hunger-sanctum:first-hunger' && actor.hp > 0);
    const finalBossActorKey = `${firstHungerDungeon.id}/${firstHungerBossRoom.id}`;
    if (restoredWorldProgress.finale.stage === 'battle' && oldHungerBoss &&
        !saved.dungeonActors?.[finalBossActorKey]?.length) {
      const healthRatio = Math.min(1, Math.max(0, oldHungerBoss.hp / Math.max(1, oldHungerBoss.maxHp)));
      migratedFinalBossActor = {
        ...oldHungerBoss,
        hp: Math.max(1, Math.round(HUNGER_BALANCE.health * healthRatio)),
        maxHp: HUNGER_BALANCE.health,
        damage: HUNGER_BALANCE.damage,
        speed: 86,
        x: firstHungerBossOrigin.x + 420,
        y: firstHungerBossOrigin.y + 240,
        boss: true,
      };
    }
    const currentSavedCell = worldCellAt(playerPosition.x, playerPosition.y);
    const inRemovedHungerCell = insideLegacyHungerMap &&
      !(currentSavedCell?.regionId === HUNGER_REGION && currentSavedCell.contentReady);
    if (!restoredWorldProgress.activeDungeon && (inRemovedHungerCell || savedInOldFinalSanctum)) {
      const atLegacyFinalArena = (oldHungerRow === 5 && oldHungerColumn === 9 &&
        restoredWorldProgress.finale.stage === 'battle') || savedInOldFinalSanctum;
      if (atLegacyFinalArena) {
        const finalDungeon = dungeonById('first-hunger-maw')!;
        const bossRoom = finalDungeon.rooms.find((room) => room.feature === 'boss')!;
        const origin = dungeonRoomOrigin(bossRoom);
        const spring = worldCellOrigin(HUNGER_SPRING);
        restoredWorldProgress.activeDungeon = {
          id: finalDungeon.id,
          roomId: bossRoom.id,
          returnX: spring.x + 320,
          returnY: spring.y + 360,
        };
        restoredWorldProgress.completedDungeons = [...new Set([
          ...restoredWorldProgress.completedDungeons, HUNGER_VANGUARD_ID,
        ])];
        restoredWorldProgress.destroyedObstacles = [...new Set([
          ...restoredWorldProgress.destroyedObstacles, 'hunger-legacy-access',
        ])];
        if (!restoredInventory.some((item) => item.id === HUNGER_VANGUARD_KEY)) {
          restoredInventory.push({
            id: HUNGER_VANGUARD_KEY, name: 'The First Echo’s key', kind: 'key',
            equipped: false, description: 'The First Echo’s key, recovered during the journey.',
          });
        }
        playerPosition = { x: origin.x + 320, y: origin.y + 240 };
      } else {
        const finaleStage = restoredWorldProgress.finale.stage;
        const hasEchoAccess = restoredWorldProgress.completedDungeons.includes(HUNGER_VANGUARD_ID) ||
          restoredInventory.some((item) => item.id === HUNGER_VANGUARD_KEY) ||
          restoredWorldProgress.destroyedObstacles.includes('hunger-legacy-access') ||
          HUNGER_KEYS.every((key) => restoredInventory.some((item) => item.id === key));
        const destinationCell = finaleStage === 'restoring' ? HUNGER_ARENA
          : finaleStage === 'complete' ? HUNGER_ENTRY
          : finaleStage === 'battle' && hasEchoAccess ? HUNGER_SPRING
          : MAELIS_HUB;
        const oldOrigin = {
          x: oldHungerOrigin.x + oldHungerColumn * WORLD_CELL_WIDTH,
          y: oldHungerOrigin.y + oldHungerRow * WORLD_CELL_HEIGHT,
        };
        const newOrigin = worldCellOrigin(destinationCell);
        playerPosition = {
          x: playerPosition.x + newOrigin.x - oldOrigin.x,
          y: playerPosition.y + newOrigin.y - oldOrigin.y,
        };
      }
    }
    if (restoredWorldProgress.activeDungeon) {
      const activeDungeon = restoredWorldProgress.activeDungeon;
      const activeDefinition = dungeonById(activeDungeon.id);
      if (activeDefinition && !activeDefinition.rooms.some((room) => room.id === activeDungeon.roomId)) {
        const fallbackRoom = activeDefinition.storyBoss === 'first-hunger' &&
          restoredWorldProgress.finale.stage === 'battle'
          ? activeDefinition.rooms.find((room) => room.feature === 'boss')!
          : activeDefinition.rooms.find((room) => room.id === activeDefinition.entryRoomId)!;
        activeDungeon.roomId = fallbackRoom.id;
        const fallbackOrigin = dungeonRoomOrigin(fallbackRoom);
        playerPosition = { x: fallbackOrigin.x + 320, y: fallbackOrigin.y + 240 };
      }
      const returnCell = worldCellAt(activeDungeon.returnX, activeDungeon.returnY);
      const returnColumn = Math.floor((activeDungeon.returnX - oldHungerOrigin.x) / WORLD_CELL_WIDTH);
      const returnRow = Math.floor((activeDungeon.returnY - oldHungerOrigin.y) / WORLD_CELL_HEIGHT);
      const oldReturnCell = returnRow >= 0 && returnRow < 6 && returnColumn >= 0 && returnColumn < 10 &&
        !(returnCell?.regionId === HUNGER_REGION && returnCell.contentReady);
      if (returnCell?.regionId === HUNGER_REGION && !returnCell.contentReady || oldReturnCell) {
        const hasEchoAccess = restoredWorldProgress.completedDungeons.includes(HUNGER_VANGUARD_ID) ||
          restoredInventory.some((item) => item.id === HUNGER_VANGUARD_KEY) ||
          HUNGER_KEYS.every((key) => restoredInventory.some((item) => item.id === key));
        const destination = restoredWorldProgress.finale.stage === 'battle' && hasEchoAccess
          ? HUNGER_SPRING : MAELIS_HUB;
        const oldOrigin = returnCell?.regionId === HUNGER_REGION && !returnCell.contentReady
          ? worldCellOrigin(returnCell.id)
          : { x: oldHungerOrigin.x + returnColumn * WORLD_CELL_WIDTH,
              y: oldHungerOrigin.y + returnRow * WORLD_CELL_HEIGHT };
        const newOrigin = worldCellOrigin(destination);
        activeDungeon.returnX += newOrigin.x - oldOrigin.x;
        activeDungeon.returnY += newOrigin.y - oldOrigin.y;
      }
    }
    this.snapshot = {
      ...saved.state,
      mode: 'playing',
      overlay: null,
      dialog: null,
      dialogSpeaker: null,
      player: {
        ...savedPlayer,
        ...playerPosition,
        trainingPoints,
      },
      guideCooldownMs: Math.max(0, saved.state.guideCooldownMs ?? 0),
      guideUses: Math.max(0, saved.state.guideUses ?? 0),
      guideDirection: null,
      guideCueMs: 0,
      abilities,
      trainedPowers,
      inventory: restoredInventory.reduce<Item[]>((uniqueItems, item) => {
        if (isQuestItem(item) && uniqueItems.some((entry) => entry.id === item.id && isQuestItem(entry))) return uniqueItems;
        uniqueItems.push({ ...item });
        return uniqueItems;
      }, []),
      log: [...saved.state.log],
      discoveredRooms: [...saved.state.discoveredRooms],
      discoveredWorldCells: [...new Set([
        ...(Array.isArray(saved.state.discoveredWorldCells) ? saved.state.discoveredWorldCells : []),
        ...(!restoredWorldProgress.activeDungeon
          ? [worldCellAt(playerPosition.x, playerPosition.y)?.id ?? 'village'] : []),
      ])].filter((id) => WORLD_CELLS.some((cell) => cell.id === id)),
    };
    this.worldProgress = restoredWorldProgress;
    if (this.worldProgress.finale.stage === 'restoring') this.snapshot.overlay = null;
    if (
      this.worldProgress.chapelGateOpen &&
      !this.worldProgress.completedDungeons.includes('sunken-chapel') &&
      ['Enter the Sunken Chapel and read the tide-bell order', 'Ring the three tide bells: Low, High, Low']
        .includes(this.snapshot.quest.step)
    ) {
      this.snapshot.quest = {
        title: 'The Silent Bell',
        description: 'The three separated Marches lairs hold the keys to the Bell Tower of Tides.',
        step: 'Defeat the three lair keepers',
      };
      this.snapshot.hint = 'The tide seal is solved. Find the three Marches lairs and claim their keys.';
    }
    if (
      this.worldProgress.completedDungeons.includes('sunken-chapel') &&
      saved.state.quest?.step === 'The Sunken Chapel is reclaimed'
    ) {
      // Continue saves made after the previous Marches ending into the newly authored route.
      this.worldProgress.unlockedRegions = Array.from(new Set([
        ...this.worldProgress.unlockedRegions,
        'ashen-peaks',
      ]));
      this.snapshot.quest = {
        title: 'A Trail North',
        description: 'The ferryman knows Maelis survived. Follow her marks through the old floodway.',
        step: 'Find Maelis’s trail mark at the Northbound Sluice',
      };
      this.snapshot.hint = 'The Sunken Chapel road turns west toward the Northbound Sluice.';
    }
    if (
      saved.state.quest?.step === 'Journey complete' &&
      saved.state.bossDefeated &&
      !this.worldProgress.colorsRestored &&
      this.worldProgress.finale.stage !== 'restoring'
    ) {
      this.awakenBellOfWonder(false);
    }
    this.defeatedIds = new Set(saved.progress.defeatedIds);
    this.respawns = new Map(
      (saved.progress.respawns ?? (saved.version < 4
        ? [...this.defeatedIds]
            .filter((id) => this.findEnemyTemplate(id)?.template.boss !== true)
            .map((id) => ({ id, remainingMs: ENEMY_RESPAWN_DELAY_MS, generation: 1 }))
        : []))
        .map((respawn) => [respawn.id, {
          remainingMs: Math.min(
            this.worldProgress.postgame.started ? POSTGAME_WAVE_DELAY_MS : ENEMY_RESPAWN_DELAY_MS,
            Math.max(0, respawn.remainingMs),
          ),
          generation: Math.max(1, respawn.generation),
          cell: 'dungeonId' in respawn && typeof respawn.dungeonId === 'string' &&
            'roomId' in respawn && typeof respawn.roomId === 'string'
            ? `${respawn.dungeonId}/${respawn.roomId}`
            : this.findEnemyTemplate(respawn.id)?.cell.id,
          ...('dungeonId' in respawn && typeof respawn.dungeonId === 'string' &&
            'roomId' in respawn && typeof respawn.roomId === 'string'
            ? { dungeonId: respawn.dungeonId, roomId: respawn.roomId } : {}),
        }]),
    );
    const restoredActors = saved.actors
      .filter((actor) => actor.hp > 0)
      .map((actor) => {
        let position = saved.version === 1
          ? { x: actor.x + legacyOffset.x, y: actor.y + legacyOffset.y }
          : remapV2Position(actor.x, actor.y);
        const actorCell = worldCellAt(position.x, position.y);
        const finaleActor = actor.id === 'first-hunger-sanctum:maelis' ? MAELIS_HUB
          : actor.id === 'first-hunger-sanctum:first-hunger' ? HUNGER_ARENA : null;
        if (finaleActor && actorCell?.id === 'first-hunger-sanctum') {
          const old = worldCellOrigin(actorCell.id), next = worldCellOrigin(finaleActor);
          position = { x: position.x + next.x - old.x, y: position.y + next.y - old.y };
        } else if (finaleActor && actorCell?.regionId === HUNGER_REGION && !actorCell.contentReady) {
          const old = worldCellOrigin(actorCell.id), next = worldCellOrigin(finaleActor);
          position = { x: position.x + next.x - old.x, y: position.y + next.y - old.y };
        }
        const upgradedBossMaxHp = saved.version === 10 && actor.boss ? actor.maxHp * 2 : actor.maxHp;
        const healthRatio = actor.hp / Math.max(1, actor.maxHp);
        return {
          ...actor,
          maxHp: upgradedBossMaxHp,
          hp: Math.max(1, Math.round(upgradedBossMaxHp * healthRatio)),
          generation: actor.generation ?? 0,
          damageOverTime: actor.damageOverTime ?? [],
          ...position,
        };
      });
    this.overworldEnemies = this.createWorldEnemies(restoredActors);
    this.dungeonActors = Object.fromEntries(
      Object.entries(saved.dungeonActors ?? {}).map(([key, actors]) => [
        key,
        actors.map((actor) => {
          const maxHp = saved.version === 10 && actor.boss ? actor.maxHp * 2 : actor.maxHp;
          const healthRatio = actor.hp / Math.max(1, actor.maxHp);
          return {
            ...actor,
            speed: boundedSavedEnemySpeed(actor.speed, actor.boss),
            maxHp,
            hp: Math.max(1, Math.round(maxHp * healthRatio)),
          };
        }),
      ]),
    );
    if (migratedFinalBossActor) {
      this.dungeonActors[finalBossActorKey] = [migratedFinalBossActor];
    }
    this.enemies = this.overworldEnemies;
    if (this.worldProgress.activeDungeon) this.activateDungeonRoom();
    this.recalculateEquipment();
    const loadedPlayer = this.snapshot.player;
    if (!loadedPlayer) return false;
    loadedPlayer.resource = Math.min(loadedPlayer.maxResource, loadedPlayer.resource);
    const loadedCell = worldCellAt(playerPosition.x, playerPosition.y);
    const loadedRoom = loadedCell?.roomId ?? roomAt(playerPosition.x, playerPosition.y);
    this.snapshot.roomId = this.worldProgress.activeDungeon ? 'chapel' : loadedRoom;
    this.snapshot.location = this.worldProgress.activeDungeon
      ? dungeonRoomAt(this.worldProgress.activeDungeon.id, loadedPlayer.x, loadedPlayer.y)?.label ?? 'Drainhouse Landing'
      : loadedCell?.label ?? ROOM_NAMES[loadedRoom];
    this.snapshot.discoveredRooms = Array.from(new Set([...this.snapshot.discoveredRooms, this.snapshot.roomId]));
    const [savedAimX, savedAimY] = this.facingVector();
    this.aimDirection = { x: savedAimX, y: savedAimY };
    this.collectedIds = new Set(saved.progress.collectedIds);
    this.puzzleSolved = saved.progress.puzzleSolved;
    this.villageChestOpened = saved.progress.villageChestOpened;
    this.forestChestOpened = saved.progress.forestChestOpened;
    this.shrineUsed = saved.progress.shrineUsed;
    this.keyChestOpened = saved.progress.keyChestOpened;
    this.effects = [];
    this.projectiles = [];
    this.combatFeedbackMs = 0;
    this.combatFeedbackMessage = '';
    this.refreshEnemyHud();
    this.activeRun = true;
    this.maelisAlly = null;
    this.hungerVolley = 0;
    this.prepareFinale();
    if (this.worldProgress.finale.stage === 'complete' && !this.worldProgress.postgame.started) this.beginPostgame();
    return true;
  }

  exportSave(): SavedRun | null {
    if (!this.activeRun || !this.snapshot.player) return null;
    const state: GameSnapshot = JSON.parse(JSON.stringify(this.snapshot)) as GameSnapshot;
    state.mode = 'playing';
    state.overlay = null;
    state.dialog = null;
    state.dialogSpeaker = null;
    state.abilities.forEach((skill) => {
      if (skill) skill.remainingMs = Math.max(0, skill.remainingMs);
    });
    return {
      version: 11,
      dungeonActors: this.exportDungeonActors(),
      state,
      actors: (this.worldProgress.activeDungeon ? this.overworldEnemies : this.enemies).map((actor) => ({ ...actor })),
      progress: {
        defeatedIds: [...this.defeatedIds],
        collectedIds: [...this.collectedIds],
        puzzleSolved: this.puzzleSolved,
        villageChestOpened: this.villageChestOpened,
        forestChestOpened: this.forestChestOpened,
        shrineUsed: this.shrineUsed,
        keyChestOpened: this.keyChestOpened,
        world: this.getWorldProgress(),
        respawns: [...this.respawns].map(([id, record]) => ({
          id,
          remainingMs: record.remainingMs,
          generation: record.generation,
          ...(record.dungeonId ? { dungeonId: record.dungeonId, roomId: record.roomId } : {}),
        })),
      },
    };
  }

  setDirection(direction: Direction, isDown: boolean): void {
    if (isDown && this.restorationReplayMs !== null) return;
    if (isDown && this.snapshot.overlay === 'settings') return;
    if (isDown) {
      this.heldDirections.add(direction);
      const x = Number(this.heldDirections.has('right')) - Number(this.heldDirections.has('left')) + this.analogMovement.x;
      const y = Number(this.heldDirections.has('down')) - Number(this.heldDirections.has('up')) + this.analogMovement.y;
      this.rememberAimDirection(x, y);
    }
    else this.heldDirections.delete(direction);
  }

  setAnalogMovement(x: number, y: number): void {
    if (this.restorationReplayMs !== null) return;
    if (this.snapshot.overlay === 'settings') { this.analogMovement = { x: 0, y: 0 }; return; }
    const inputX = clamp(Number.isFinite(x) ? x : 0, -1, 1);
    const inputY = clamp(Number.isFinite(y) ? y : 0, -1, 1);
    const length = Math.hypot(inputX, inputY);
    const scale = length > 1 ? 1 / length : 1;
    this.analogMovement = { x: inputX * scale, y: inputY * scale };
    this.rememberAimDirection(inputX, inputY);
  }

  releaseAllDirections(): void {
    this.heldDirections.clear();
    this.analogMovement = { x: 0, y: 0 };
  }

  pressButton(button: ButtonId): void {
    if (this.restorationReplayMs !== null) return;
    if (!this.activeRun || !this.snapshot.player || this.snapshot.overlay) return;
    if (['choice', 'restoring'].includes(this.worldProgress.finale.stage)) return;
    this.snapshot.dialog = null;
    if (button === 'attack') this.basicAttack();
    else if (button === 'context') this.contextAction();
    else {
      const index = Number(button.slice('ability'.length));
      if (Number.isInteger(index) && index >= 0 && index < 4) {
        this.activateAbility(index);
      }
    }
    this.contextHintCache = null;
  }

  openMenu(menu: NonNullable<GameSnapshot['overlay']>): void {
    if (this.restorationReplayMs !== null) return;
    if (this.worldProgress.finale.stage === 'restoring') return;
    if (this.activeRun) {
      this.snapshot.overlay = menu;
      this.releaseAllDirections();
    }
  }

  closeMenu(): void {
    if (this.restorationReplayMs !== null) { this.stopRestorationReplay(); return; }
    this.snapshot.overlay = null;
  }

  dismissDialog(): void {
    if (this.restorationReplayMs !== null) return;
    if (['choice', 'restoring'].includes(this.worldProgress.finale.stage)) return;
    this.snapshot.dialog = null;
    this.snapshot.dialogSpeaker = null;
  }

  chooseMaelisAlliance(allied: boolean): void {
    if (this.worldProgress.finale.stage !== 'choice') return;
    this.worldProgress.finale.stage = allied ? 'battle' : 'solo-duel';
    this.worldProgress.finale.allied = allied;
    this.maelisAlly = allied
      ? {
        x: this.snapshot.player?.x ?? 320,
        y: this.snapshot.player?.y ?? 224,
        attackMs: 450,
        attackPoseMs: 0,
        facing: 'down',
      }
      : null;
    this.enemies = this.createWorldEnemies(this.enemies);
    this.projectiles = [];
    const maelis = this.enemies.find((enemy) => enemy.id === 'first-hunger-sanctum:maelis');
    if (maelis && !allied) maelis.attackMs = 650;
    // A battle-stage dialogue freezes simulation and makes allies and bosses
    // appear motionless. Show the choice result in the non-blocking field hint.
    this.snapshot.dialog = null;
    this.snapshot.dialogSpeaker = null;
    this.snapshot.quest = { title: 'The First Hunger', description: 'Break the creature’s hold on humanity.',
      step: 'Defeat The First Hunger' };
    this.snapshot.hint = allied
      ? 'Maelis has joined you. She will follow and fight nearby enemies; you can speak with her before the final battle.'
      : 'Maelis stands between you and the First Echo. Defeat her to continue alone.';
    this.prepareFinale();
    this.refreshEnemyHud();
  }

  private prepareFinale(): void {
    const player = this.snapshot.player;
    if (!player || this.worldProgress.colorsRestored) return;
    const finale = this.worldProgress.finale;
    if (finale.stage === 'battle' && finale.allied && !this.maelisAlly) {
      const visit = this.worldProgress.activeDungeon;
      const room = visit ? dungeonRoomAt(visit.id, player.x, player.y) : undefined;
      const origin = room ? dungeonRoomOrigin(room) : null;
      this.maelisAlly = {
        x: origin ? clamp(player.x - 52, origin.x + 72, origin.x + 568) : player.x - 52,
        y: origin ? clamp(player.y - 34, origin.y + 72, origin.y + 408) : player.y - 34,
        attackMs: 300, attackPoseMs: 0, facing: player.facing,
      };
    }
    if (this.worldProgress.activeDungeon) return;
    const cellId = worldCellAt(player.x, player.y)?.id;
    // A saved pending choice must remain answerable even if an older journey
    // recorded it away from the confrontation; don't silently freeze controls.
    if (finale.stage === 'choice') {
      this.snapshot.dialogSpeaker = 'Maelis';
      this.snapshot.dialog = MAELIS_OFFER;
    }
    if (cellId !== MAELIS_HUB && cellId !== HUNGER_ARENA) return;
    if (finale.stage === 'unseen' && cellId === MAELIS_HUB) {
      finale.stage = 'duel';
      this.snapshot.dialogSpeaker = 'Maelis';
      this.snapshot.dialog = MAELIS_OPENING;
      this.snapshot.quest = { title: 'The Last Bellkeeper', description: 'Confront Maelis about the cost of her plan.',
        step: 'Challenge Maelis' };
      this.releaseAllDirections();
    } else if (finale.stage === 'choice' && cellId === MAELIS_HUB) {
      const cell = WORLD_CELLS.find((candidate) => candidate.id === MAELIS_HUB)!;
      this.maelisAlly ??= {
        x: cell.x + 320, y: cell.y + 224, attackMs: 450, attackPoseMs: 0, facing: 'down',
      };
      this.snapshot.dialogSpeaker = 'Maelis';
      this.snapshot.dialog = MAELIS_OFFER;
    } else if (finale.stage === 'battle' && cellId === HUNGER_ARENA && finale.allied &&
        (!this.maelisAlly || worldCellAt(this.maelisAlly.x, this.maelisAlly.y)?.id !== HUNGER_ARENA)) {
      this.maelisAlly = {
        x: player.x + 44, y: player.y, attackMs: 450, attackPoseMs: 0, facing: 'down',
      };
    }
  }

  equipAbility(slot: number, abilityId: string): void {
    const player = this.snapshot.player;
    if (!player || !Number.isInteger(slot) || slot < 0 || slot > 3) return;
    const power = findClassPower(player.classId, abilityId);
    const rank = this.snapshot.trainedPowers[abilityId] ?? 0;
    if (!power || rank < 1) return;
    const otherSlot = this.snapshot.abilities.findIndex((item, index) => index !== slot && item?.id === abilityId);
    if (otherSlot >= 0) this.snapshot.abilities[otherSlot] = this.snapshot.abilities[slot] ?? null;
    this.snapshot.abilities[slot] = { ...power, rank, remainingMs: 0 };
    this.addLog(`${power.name} is ready in slot ${slot + 1}.`);
  }

  trainPower(powerId: string): void {
    const player = this.snapshot.player;
    if (!player) return;
    const heroUpgrade = HERO_UPGRADES.find((upgrade) => upgrade.id === powerId);
    if (heroUpgrade) {
      this.trainHeroUpgrade(heroUpgrade);
      return;
    }
    const power = findClassPower(player.classId, powerId);
    if (!power) return;
    const currentRank = this.snapshot.trainedPowers[powerId] ?? 0;
    const discipline = CLASS_DISCIPLINES[player.classId].find((tree) =>
      tree.powers.some((item) => item.id === powerId));
    if (!discipline) return;
    if (currentRank >= MAX_POWER_RANK) {
      this.snapshot.hint = `${power.name} has reached its maximum rank.`;
      return;
    }
    const investment = getDisciplineInvestment(player.classId, discipline.id, this.snapshot.trainedPowers);
    if (currentRank === 0 && investment < power.tier - 1) {
      this.snapshot.hint = `Invest in ${discipline.name} to unlock the next power.`;
      return;
    }
    if (player.trainingPoints < 1) {
      this.snapshot.hint = 'Earn a training point by gaining a level.';
      return;
    }
    player.trainingPoints -= 1;
    this.snapshot.trainedPowers[powerId] = currentRank + 1;
    this.snapshot.abilities = this.snapshot.abilities.map((slot) =>
      slot?.id === powerId ? { ...slot, rank: currentRank + 1 } : slot);
    this.snapshot.hint = `${power.name} trained to rank ${currentRank + 1}.`;
    this.addLog(`Trained ${power.name} to rank ${currentRank + 1}.`);
  }

  buyShopItem(itemId: string): void {
    const player = this.snapshot.player;
    if (!player) return;
    const cellId = worldCellAt(player.x, player.y)?.id;
    const offer = shopStockForCell(cellId).find((entry) => entry.item.id === itemId);
    if (!offer) {
      this.snapshot.hint = 'This item is not sold at the current market.';
      return;
    }
    if (offer.item.kind !== 'consumable' &&
        this.snapshot.inventory.some((entry) => entry.id === itemId)) {
      this.snapshot.hint = `You already own ${offer.item.name}.`;
      return;
    }
    if (player.coins < offer.price) {
      this.snapshot.hint = `You need ${offer.price} shards for ${offer.item.name}.`;
      return;
    }
    player.coins -= offer.price;
    this.addItem({ ...offer.item, equipped: false });
    this.snapshot.hint = `Bought ${offer.item.name} for ${offer.price} shards.`;
    this.addLog(`Bought ${offer.item.name} in ${worldCellAt(player.x, player.y)?.label ?? 'town'} for ${offer.price} shards.`);
  }

  sellInventoryItem(itemId: string): void {
    const player = this.snapshot.player;
    const item = this.snapshot.inventory.find((entry) => entry.id === itemId);
    if (!player || !item) return;
    if (!shopStockForCell(worldCellAt(player.x, player.y)?.id).length) {
      this.snapshot.hint = 'Items can only be sold at a town market.';
      return;
    }
    if (isQuestItem(item)) {
      this.snapshot.hint = 'Quest items cannot be sold.';
      return;
    }
    if (item.locked || item.equipped) {
      this.snapshot.hint = item.locked ? 'Unlock this item before selling it.' : 'Unequip this item before selling it.';
      return;
    }
    const price = getItemSellPrice(item);
    if (price <= 0) {
      this.snapshot.hint = 'The market does not buy this item.';
      return;
    }
    if (item.kind === 'consumable' && (item.quantity ?? 0) > 1) {
      item.quantity = (item.quantity ?? 1) - 1;
    } else {
      this.snapshot.inventory = this.snapshot.inventory.filter((entry) => entry.id !== itemId);
    }
    player.coins += price;
    this.snapshot.hint = `Sold ${item.name} for ${price} shards.`;
    this.addLog(`Sold ${item.name} for ${price} shards.`);
  }

  trainForShards(requestedAmount: number): void {
    const player = this.snapshot.player;
    if (!player) return;
    const trainingCell = worldCellAt(player.x, player.y)?.id;
    if (trainingCell !== 'mournwater-town' && trainingCell !== 'capital-survivors-hold') {
      this.snapshot.hint = 'Field training is available in Mournwater and at the Survivors’ Stronghold.';
      return;
    }
    const amount = Math.floor(requestedAmount);
    if (!Number.isFinite(amount) || amount < 25) {
      this.snapshot.hint = 'Training starts at 25 shards.';
      return;
    }
    if (amount > player.coins) {
      this.snapshot.hint = `You have ${player.coins} shards available.`;
      return;
    }
    const xp = getTrainingXpForShards(amount);
    player.coins -= amount;
    player.xp += xp;
    this.checkLevelUp();
    this.snapshot.hint = `Field training: +${xp} XP for ${amount} shards.`;
    this.addLog(`Spent ${amount} shards on field training and earned ${xp} XP.`);
  }

  private trainHeroUpgrade(upgrade: HeroUpgradeDefinition): void {
    const player = this.snapshot.player;
    if (!player) return;
    if (player.level < HERO_TREE_UNLOCK_LEVEL) {
      this.snapshot.hint = `The Hero tree unlocks at level ${HERO_TREE_UNLOCK_LEVEL}.`;
      return;
    }
    const currentRank = getHeroUpgradeRank(this.snapshot.trainedPowers[upgrade.id]);
    if (player.trainingPoints < 1) {
      this.snapshot.hint = 'Earn a training point by gaining a level.';
      return;
    }
    player.trainingPoints -= 1;
    this.snapshot.trainedPowers[upgrade.id] = currentRank + 1;
    if (upgrade.stat === 'health' || upgrade.stat === 'spirit') this.recalculateEquipment();
    this.snapshot.hint = `${upgrade.name} trained to rank ${currentRank + 1}.`;
    this.addLog(`Trained ${upgrade.name} to rank ${currentRank + 1}.`);
  }

  equipItem(itemId: string): void {
    const item = this.snapshot.inventory.find((entry) => entry.id === itemId);
    const player = this.snapshot.player;
    if (!item || !player) return;
    if (item.kind === 'consumable') {
      if ((item.quantity ?? 0) <= 0) {
        this.snapshot.hint = 'That tonic is empty.';
        return;
      }
      const restored = Math.min(player.maxHp - player.hp, 35);
      player.hp += restored;
      item.quantity = (item.quantity ?? 1) - 1;
      if (item.quantity <= 0) {
        this.snapshot.inventory = this.snapshot.inventory.filter((entry) => entry.id !== item.id);
      }
      this.snapshot.hint = restored > 0 ? `Tonic restored ${restored} health.` : 'Your health is already full.';
      this.addLog('Used a small tonic.');
      return;
    }
    if (item.kind === 'key' || item.kind === 'relic') {
      this.snapshot.hint = item.description;
      return;
    }
    const previous = this.snapshot.inventory.find((entry) => entry.equipped && entry.kind === item.kind);
    if (previous) previous.equipped = false;
    item.equipped = true;
    if (item.kind === 'weapon') player.weapon = item.name;
    this.recalculateEquipment();
    this.snapshot.hint = `${item.name} equipped.`;
    this.addLog(`Equipped ${item.name}.`);
  }

  toggleGearLock(itemId: string): void {
    const item = this.snapshot.inventory.find((entry) => entry.id === itemId);
    if (!item || !isLockableGear(item)) return;
    item.locked = !item.locked;
    this.snapshot.hint = item.locked
      ? `${item.name} locked against salvage.`
      : `${item.name} unlocked.`;
  }

  salvageItem(itemId: string, confirmed = false): void {
    const item = this.snapshot.inventory.find((entry) => entry.id === itemId);
    const player = this.snapshot.player;
    if (!item || !player) return;
    if (isQuestItem(item)) {
      this.snapshot.hint = 'Quest items cannot be salvaged.';
      return;
    }
    if (item.locked) {
      this.snapshot.hint = 'Unlock this gear before salvaging it.';
      return;
    }
    if (item.equipped) {
      this.snapshot.hint = 'Unequip this gear before salvaging it.';
      return;
    }
    const xp = getSalvageXp(item);
    if (xp <= 0) {
      this.snapshot.hint = 'This item cannot be salvaged.';
      return;
    }
    if (requiresSalvageConfirmation(item) && !confirmed) {
      this.snapshot.hint = `Confirm salvaging ${item.name} for ${xp} XP.`;
      return;
    }
    if (item.kind === 'consumable') {
      const quantity = item.quantity ?? 0;
      if (quantity < 1) {
        this.snapshot.hint = 'There is none left to salvage.';
        return;
      }
      item.quantity = quantity - 1;
      if (item.quantity === 0) this.snapshot.inventory = this.snapshot.inventory.filter((entry) => entry.id !== item.id);
    } else {
      this.snapshot.inventory = this.snapshot.inventory.filter((entry) => entry.id !== item.id);
    }
    player.xp += xp;
    this.checkLevelUp();
    this.snapshot.hint = `${item.name} salvaged for ${xp} XP.`;
    this.addLog(`${item.name} salvaged. +${xp} XP.`);
  }

  tick(deltaMs: number): void {
    if (!this.activeRun || !this.snapshot.player) return;
    // Freeze combat, timers, discoveries, rewards and saved progress. Only this
    // transient clock advances; finishing it never invokes the victory handoff.
    if (this.restorationReplayMs !== null) {
      this.restorationReplayMs = Math.min(RESTORATION_DURATION_MS,
        this.restorationReplayMs + Math.min(50, Math.max(0, deltaMs)));
      if (this.restorationReplayMs === RESTORATION_DURATION_MS) this.stopRestorationReplay();
      return;
    }
    if (this.snapshot.overlay === 'settings') return;
    const delta = Math.min(50, Math.max(0, deltaMs));
    const player = this.snapshot.player;
    const dt = delta / 1000;
    const finale = this.worldProgress.finale;
    if (finale.stage === 'restoring') {
      finale.restorationMs = Math.min(RESTORATION_DURATION_MS, finale.restorationMs + delta);
      this.snapshot.dialogSpeaker = 'Emberfall';
      this.snapshot.dialog = getRestorationCaption(finale.restorationMs, finale.allied);
      this.effects = this.effects.map((effect) => ({ ...effect, remainingMs: effect.remainingMs - delta }))
        .filter((effect) => effect.remainingMs > 0);
      if (finale.restorationMs === RESTORATION_DURATION_MS) {
        finale.stage = 'complete';
        this.worldProgress.colorsRestored = true;
        this.snapshot.dialog = null;
        this.snapshot.dialogSpeaker = null;
        this.releaseAllDirections();
        this.beginPostgame();
        this.addLog('The bells are no longer needed. Humanity is free to feel.');
      }
      return;
    }
    if (finale.stage === 'choice' ||
        (this.snapshot.dialog && ['duel', 'solo-duel'].includes(finale.stage))) return;
    this.snapshot.guideCooldownMs = Math.max(0, this.snapshot.guideCooldownMs - delta);
    this.snapshot.guideCueMs = Math.max(0, this.snapshot.guideCueMs - delta);
    if (this.snapshot.guideCueMs === 0) this.snapshot.guideDirection = null;
    this.tickRemainder += delta;
    this.combatFeedbackMs = Math.max(0, this.combatFeedbackMs - delta);
    if (this.combatFeedbackMs === 0) this.combatFeedbackMessage = '';
    this.playerInvulnerableMs = Math.max(0, this.playerInvulnerableMs - delta);
    this.playerStunnedMs = Math.max(0, this.playerStunnedMs - delta);
    this.invisibilityMs = Math.max(0, this.invisibilityMs - delta);
    this.battleCryMs = Math.max(0, this.battleCryMs - delta);
    this.arcaneShieldMs = Math.max(0, this.arcaneShieldMs - delta);
    this.empoweredMs = Math.max(0, this.empoweredMs - delta);
    this.attackAnimationMs = Math.max(0, this.attackAnimationMs - delta);
    this.snapshot.abilities.forEach((skill) => {
      if (skill) skill.remainingMs = Math.max(0, skill.remainingMs - delta);
    });
    player.resource = Math.min(player.maxResource, player.resource + dt * 1.6);
    this.effects = this.effects
      .map((effect) => ({ ...effect, remainingMs: effect.remainingMs - delta }))
      .filter((effect) => effect.remainingMs > 0);

    if (this.playerStunnedMs <= 0 && this.snapshot.overlay === null) {
      const xInput = Number(this.heldDirections.has('right')) - Number(this.heldDirections.has('left')) + this.analogMovement.x;
      const yInput = Number(this.heldDirections.has('down')) - Number(this.heldDirections.has('up')) + this.analogMovement.y;
      if (xInput !== 0 || yInput !== 0) {
        this.rememberAimDirection(xInput, yInput);
        const length = Math.hypot(xInput, yInput) || 1;
        const speed = (player.classId === 'rogue' ? 144 : 122) *
          getHeroTrainingBonuses(this.snapshot.trainedPowers).movementMultiplier;
        const dx = (xInput / length) * speed * dt;
        const dy = (yInput / length) * speed * dt;
        if (Math.abs(dx) > Math.abs(dy)) player.facing = dx > 0 ? 'right' : 'left';
        else if (dy !== 0) player.facing = dy > 0 ? 'down' : 'up';
        this.movePlayer(dx, dy);
      }
    }

    this.advanceMarchesTide(delta);
    this.tickEnemies(delta, dt);
    this.tickMaelisAlly(delta, dt);
    this.tickRespawns(delta);
    this.tickProjectiles(delta, dt);
    if (!this.worldProgress.activeDungeon) this.refreshGuideDirection();
    if (this.tickRemainder >= 240) {
      this.tickRemainder = 0;
      this.refreshEnemyHud();
    }
  }

  private resetWorld(): void {
    this.audioEvents = [];
    this.checkpointSaveRequested = false;
    this.overworldEnemies = [];
    this.dungeonActors = {};
    this.maelisAlly = null;
    this.hungerVolley = 0;
    this.maelisAllyStrikeCount = 0;
    this.enemies = [];
    this.projectiles = [];
    this.effects = [];
    this.defeatedIds.clear();
    this.respawns.clear();
    this.collectedIds.clear();
    this.puzzleSolved = false;
    this.villageChestOpened = false;
    this.forestChestOpened = false;
    this.shrineUsed = false;
    this.keyChestOpened = false;
    this.snapshot.puzzleProgress = 0;
    this.snapshot.gateOpen = false;
    this.snapshot.keyFound = false;
    this.snapshot.bossDefeated = false;
    this.snapshot.discoveredRooms = ['village'];
    this.snapshot.discoveredWorldCells = ['village'];
    this.worldProgress = createInitialWorldProgress();
    this.playerInvulnerableMs = 0;
    this.playerStunnedMs = 0;
    this.invisibilityMs = 0;
    this.battleCryMs = 0;
    this.arcaneShieldMs = 0;
    this.empoweredMs = 0;
    this.poisonCharges = 0;
    this.poisonDamageBonus = 6;
    this.combatFeedbackMs = 0;
    this.combatFeedbackMessage = '';
    this.heldDirections.clear();
    this.analogMovement = { x: 0, y: 0 };
    this.aimDirection = { x: 0, y: 1 };
    this.attackAnimationMs = 0;
    this.attackAnimationDirection = { x: 0, y: 1 };
  }

  private advanceMarchesTide(deltaMs: number): void {
    const player = this.snapshot.player;
    if (worldCellAt(player?.x ?? -1, player?.y ?? -1)?.regionId !== 'drowned-marches') return;

    this.worldProgress.marchesTideRemainingMs -= deltaMs;
    while (this.worldProgress.marchesTideRemainingMs <= 0) {
      this.worldProgress.marchesTide = this.worldProgress.marchesTide === 'low' ? 'high' : 'low';
      this.worldProgress.marchesTideRemainingMs += MARCHES_TIDE_DURATION_MS;
      const tideName = this.worldProgress.marchesTide === 'high' ? 'rises' : 'falls';
      this.snapshot.hint = this.worldProgress.marchesTide === 'high'
        ? 'The tide rises and closes the shallow Reedveil ford. The main causeways stay open.'
        : 'The tide falls and opens the shallow Reedveil ford. The main causeways stay open.';
      this.addLog(`The Marches tide ${tideName}; the Reedveil ford ${this.worldProgress.marchesTide === 'high' ? 'closes' : 'opens'}.`);
    }
  }

  private enemyTemplatesForCell(cell: (typeof WORLD_CELLS)[number]): EnemySpawnTemplate[] {
    if (cell.id === MAELIS_HUB) {
      return ['unseen', 'duel', 'solo-duel'].includes(this.worldProgress.finale.stage)
        ? [{ id: 'maelis', name: 'Maelis, Last Bellkeeper', hp: 850, maxHp: 850, boss: true,
            x: 320, y: 224, speed: 68, damage: 27, tint: 0xac8ed2, radius: 18 }]
        : [];
    }
    if (cell.id === HUNGER_ARENA) return [];
    if (cell.id === 'first-hunger-sanctum') return [];

    if (cell.regionId === HUNGER_REGION && (hungerSite(cell.id)?.encounter || cell.id === 'hunger-4-8')) {
      const primaryName = cell.id === 'hunger-4-8'
        ? 'Heart Sentinel'
        : ['Covenant Shade', 'Marrow Scavenger', 'Rain Wraith', 'Reflection Stalker', 'Vein Reaver', 'Oath Devourer'][cell.row];
      const primaryHp = cell.id === 'hunger-4-8' ? 460 : 180 + cell.row * 22;
      const primary: EnemySpawnTemplate = {
        id: 'hunger-echo', name: primaryName, hp: primaryHp, maxHp: primaryHp, boss: false,
        x: 410, y: 290, speed: 48 + cell.row * 3, damage: 22 + cell.row * 2, tint: 0xa793ac, radius: 18,
      };
      const roster = REGIONAL_MONSTERS[HUNGER_REGION];
      const secondary = primaryName === 'Heart Sentinel'
        ? roster.find((monster) => monster.name === 'Rain Wraith') ?? roster[0]
        : roster.find((monster) => monster.name !== primaryName) ?? roster[0];
      return [
        primary,
        {
          id: `hunger-pursuer-${secondary.id}`,
          name: secondary.name,
          hp: secondary.maxHp,
          maxHp: secondary.maxHp,
          boss: false,
          x: 198, y: 344,
          speed: secondary.speed,
          damage: secondary.damage,
          tint: secondary.tint,
          radius: secondary.radius,
        },
      ];
    }

    const authored = enemySpawnsByCell[cell.id] ?? [];
    return [...authored, ...regionalFieldSpawns(cell, authored)];
  }

  private createWorldEnemies(restoredActors: EnemyActor[] = []): EnemyActor[] {
    const restored = new Map(restoredActors.map((actor) => [actor.id, actor]));
    return WORLD_CELLS.flatMap((cell) =>
      this.enemyTemplatesForCell(cell)
        .filter((template) =>
          (!NPC_SAFE_WORLD_CELLS.has(cell.id) && !HUNGER_SAFE_WORLD_CELLS.has(cell.id)) || template.boss)
        .map((template) => ({ template, id: this.spawnId(cell.id, template.id) }))
        .filter(({ template, id }) =>
          !this.defeatedIds.has(id) &&
          !(template.boss && mainBossAt(cell.id)) &&
          !(id === 'cinderhorn' && this.snapshot.bossDefeated) &&
          !(cell.id === 'sunken-chapel' && template.boss && !this.worldProgress.chapelGateOpen) &&
          !(cell.id === 'sunken-chapel' && this.worldProgress.completedDungeons.includes('sunken-chapel')) &&
          !(cell.id === 'joy-bell-sanctum' && template.boss && this.worldProgress.glasslandsPuzzleProgress < 3) &&
          !(cell.id === 'joy-bell-sanctum' && this.worldProgress.completedDungeons.includes('glasslands-bell')) &&
          !(cell.id === 'resolve-bell-sanctum' && template.boss && this.worldProgress.fallenCapitalPuzzleProgress < 3) &&
          !(cell.id === 'resolve-bell-sanctum' && this.worldProgress.completedDungeons.includes('fallen-capital-bell')) &&
          !(cell.regionId === HUNGER_REGION &&
            !BELL_REGION_IDS.every((region) => this.worldProgress.silencedBells.includes(region))))
          .map(({ template, id }) => {
          const savedActor = restored.get(id);
            if (savedActor) return {
              ...savedActor,
              speed: boundedSavedEnemySpeed(savedActor.speed, savedActor.boss),
            };
          const respawn = this.respawns.get(id);
          const actor = this.createEnemyActor(cell, template, id, respawn?.generation ?? 0);
          if (id === 'first-hunger-sanctum:maelis' && this.worldProgress.finale.stage === 'solo-duel') {
            actor.hp = Math.round(actor.maxHp * 0.25);
          }
          return actor;
        }));
  }

  private spawnId(cellId: string, templateId: string): string {
    if (cellId === MAELIS_HUB || cellId === HUNGER_ARENA) return `first-hunger-sanctum:${templateId}`;
    return cellId === 'briarwood' || cellId === 'ruins' || cellId === 'sanctum'
      ? templateId
      : `${cellId}:${templateId}`;
  }

  private createEnemyActor(
    cell: (typeof WORLD_CELLS)[number],
    template: EnemySpawnTemplate,
    id: string,
    generation: number,
  ): EnemyActor {
    const strength = 1.05 ** generation;
    const base = {
      maxHp: Math.max(1, Math.ceil(template.maxHp * strength *
        (template.boss ? BOSS_HEALTH_MULTIPLIER : 1))),
      damage: Math.max(1, Math.ceil(template.damage * strength *
        (template.boss ? BOSS_DAMAGE_MULTIPLIER : 1))),
      speed: template.speed,
    };
    const rawStats = template.boss ? base : postgameEnemyStats(base, cell.id, this.worldProgress.postgame);
    const stats = { ...rawStats, speed: tunedEnemySpeed(rawStats.speed, template.boss) };
    return {
      ...template,
      ...stats,
      id,
      hp: stats.maxHp,
      x: cell.x + template.x,
      y: cell.y + template.y,
      generation,
      attackMs: template.boss ? 1300 + regionalSpawnHash(id) % 300 : 900 + regionalSpawnHash(id) % 350,
      stunnedMs: 0,
      slowedMs: 0,
      knockbackX: 0,
      knockbackY: 0,
      damageOverTime: [],
      ...(template.combatStyle === 'blink'
        ? { blinkCooldownMs: 1800 + regionalSpawnHash(id) % 1000, blinkMs: 0 }
        : {}),
    };
  }

  private findEnemyTemplate(id: string): {
    cell: (typeof WORLD_CELLS)[number];
    template: EnemySpawnTemplate;
  } | undefined {
    for (const cell of WORLD_CELLS) {
      const template = this.enemyTemplatesForCell(cell)
        .find((item) => this.spawnId(cell.id, item.id) === id);
      if (template) return { cell, template };
    }
    return undefined;
  }

  private tickRespawns(deltaMs: number): void {
    // Normal dungeon visits retain their existing paused overworld behavior.
    if (this.worldProgress.activeDungeon && !this.worldProgress.postgame.started) return;
    for (const [id, record] of this.respawns) {
      record.remainingMs -= deltaMs;
      if (record.remainingMs > 0) continue;
      if (record.dungeonId && record.roomId) {
        const key = `${record.dungeonId}/${record.roomId}`;
        const active = this.worldProgress.activeDungeon;
        const actors = active?.id === record.dungeonId && active.roomId === record.roomId
          ? this.enemies : this.dungeonActors[key] ?? [];
        if (actors.some((enemy) => enemy.id === id)) continue;
        const actor = this.createDungeonEnemies(record.dungeonId, record.roomId, record.generation)
          .find((enemy) => enemy.id === id && !enemy.boss);
        if (actor) {
          actors.push(actor);
          this.dungeonActors[key] = actors;
          this.addLog(`${actor.name} has returned, stronger than before.`);
        }
        this.respawns.delete(id);
        continue;
      }
      const actors = this.worldProgress.activeDungeon ? this.overworldEnemies : this.enemies;
      if (actors.some((enemy) => enemy.id === id)) continue;
      const spawn = this.findEnemyTemplate(id);
      if (!spawn || spawn.template.boss) {
        this.respawns.delete(id);
        continue;
      }
      actors.push(this.createEnemyActor(spawn.cell, spawn.template, id, record.generation));
      this.respawns.delete(id);
      this.defeatedIds.delete(id);
      this.addLog(`${spawn.template.name} has returned, stronger than before.`);
    }
  }

  private recordPostgameClear(cell: string, hasLivingEnemies: boolean): void {
    if (!this.worldProgress.postgame.started || hasLivingEnemies || !this.snapshot.player) return;
    const pending = [...this.respawns].filter(([id, record]) =>
      record.dungeonId ? `${record.dungeonId}/${record.roomId}` === cell
        : this.findEnemyTemplate(id)?.cell.id === cell);
    if (!pending.length) return;
    const clears = (this.worldProgress.postgame.cellClears[cell] ?? 0) + 1;
    this.worldProgress.postgame.cellClears[cell] = clears;
    const reward = postgameCellClearReward(clears);
    const player = this.snapshot.player;
    player.xp += reward.xp;
    player.coins += reward.shards;
    const totalClears = Object.values(this.worldProgress.postgame.cellClears)
      .reduce((sum, count) => sum + count, 0);
    let gearDrop: Item | undefined;
    if (totalClears % POSTGAME_GEAR_CLEAR_INTERVAL === 0) {
      const classGear = POSTGAME_GEAR[player.classId];
      if (!this.snapshot.inventory.some((item) => item.id === classGear.id)) {
        gearDrop = { ...classGear, kind: 'weapon', equipped: false };
        this.addItem(gearDrop);
      }
    }
    // Start a complete, synchronized postgame wave two minutes after the last enemy falls.
    for (const [, record] of pending) record.remainingMs = POSTGAME_WAVE_DELAY_MS;
    this.snapshot.hint = `Elite cell cleared ${clears} time${clears === 1 ? '' : 's'}. +${reward.xp} XP, +${reward.shards} shards. Its next wave gains 25% health and damage.`;
    this.addLog(this.snapshot.hint);
    if (gearDrop) {
      this.snapshot.hint += ` Recovered ${gearDrop.name}; equip it from the backpack.`;
      this.addLog(`Recovered ${gearDrop.name}. Equip it from the backpack.`);
    }
  }

  private beginPostgame(): void {
    if (this.worldProgress.postgame.started || !this.snapshot.player) return;
    this.worldProgress.postgame.started = true;
    this.storeDungeonRoom();
    this.worldProgress.activeDungeon = null;
    // Repopulate ordinary encounters, but retain every defeated boss and all world rewards.
    for (const id of this.defeatedIds) {
      const spawn = this.findEnemyTemplate(id);
      if (spawn && !spawn.template.boss) this.defeatedIds.delete(id);
    }
    this.respawns.clear();
    this.dungeonActors = {};
    this.enemies = this.createWorldEnemies();
    this.overworldEnemies = this.enemies;
    this.projectiles = [];
    this.effects = [];
    this.maelisAlly = null;
    this.releaseAllDirections();
    this.contextHintCache = null;
    this.combatFeedbackMs = 0;
    this.combatFeedbackMessage = '';
    this.playerStunnedMs = 0;
    this.playerInvulnerableMs = 2000;
    this.invisibilityMs = this.battleCryMs = this.arcaneShieldMs = this.empoweredMs = 0;
    this.poisonCharges = 0;
    this.attackAnimationMs = 0;
    this.snapshot.guideDirection = null;
    this.snapshot.guideCueMs = 0;
    const player = this.snapshot.player;
    const origin = worldCellOrigin('village');
    player.x = origin.x + 320;
    player.y = origin.y + 344;
    player.facing = 'down';
    player.hp = player.maxHp;
    player.resource = player.maxResource;
    this.aimDirection = { x: 0, y: 1 };
    this.snapshot.abilities.forEach((skill) => { if (skill) skill.remainingMs = 0; });
    this.snapshot.quest.description = 'Emotion is restored. Explore the elite world: every full cell clear strengthens its next monster wave.';
    this.updateWorldRegion();
    this.refreshEnemyHud();
    this.snapshot.hint = 'Welcome back to Hearthglen. Elite monsters await; every cleared cell returns stronger.';
    this.addLog('Returned to Hearthglen with all gear and progress. The restored world’s elite trials have begun.');
  }

  private updateWorldRegion(): void {
    if (this.worldProgress.activeDungeon) {
      const player = this.snapshot.player!;
      const room = dungeonRoomAt(this.worldProgress.activeDungeon.id, player.x, player.y);
      if (room && room.id !== this.worldProgress.activeDungeon.roomId) {
        this.storeDungeonRoom();
        this.worldProgress.activeDungeon.roomId = room.id;
        this.activateDungeonRoom();
      }
      this.snapshot.roomId = 'chapel';
      this.snapshot.location = room?.label ?? 'The Drowned Drainhouse';
      return;
    }
    const player = this.snapshot.player;
    if (!player) return;
    const cell = worldCellAt(player.x, player.y);
    const room = cell?.roomId ?? roomAt(player.x, player.y);
    const previousRoom = this.snapshot.roomId;
    const location = cell?.label ?? ROOM_NAMES[room];
    const regionChanged = room !== previousRoom;
    const locationChanged = location !== this.snapshot.location;
    const discoveredCell = Boolean(cell && !this.snapshot.discoveredWorldCells.includes(cell.id));
    if (discoveredCell && cell) {
      this.snapshot.discoveredWorldCells = [...this.snapshot.discoveredWorldCells, cell.id];
    }
    if (cell?.id === 'drowned-marches-01-01' && this.snapshot.quest.step === 'Travel to the Mournwater Crossing') {
      this.snapshot.quest = {
        title: 'The Silent Bell',
        description: 'A stranded ferryman saw Maelis pass through the marsh.',
        step: 'Find the stranded ferryman',
      };
      this.snapshot.hint = 'Follow the wet trail south, then east to Driftwood Ferry.';
      this.addLog('You reach the Drowned Marches. A ferryman may know where Maelis went.');
    }
    if (cell?.id === 'sunken-chapel-approach') {
      if (!this.worldProgress.discoveredDungeons.includes('sunken-chapel')) {
        this.worldProgress.discoveredDungeons.push('sunken-chapel');
      }
      if (this.snapshot.quest.step === 'Reach the Sunken Chapel approach') {
        this.snapshot.quest = {
          title: 'The Silent Bell',
          description: 'Follow Maelis’s marks through the flooded reeds.',
          step: "Search the reedbed for Maelis's trail",
        };
        this.addLog('At the chapel approach, you find Maelis’s marks pressed into the reeds.');
      }
    }
    if (
      this.worldProgress.unlockedRegions.includes('ashen-peaks') &&
      cell && ['northbound-sluice', 'frostline-stair', 'cinderwatch-approach'].includes(cell.id)
    ) {
      const discovery = cell.id === 'northbound-sluice' ? 'northbound-floodway' : 'cinderwatch-trail';
      if (!this.worldProgress.discoveredDungeons.includes(discovery)) {
        this.worldProgress.discoveredDungeons.push(discovery);
      }
    }
    if (cell?.id === 'joy-bell-sanctum' &&
      !this.worldProgress.discoveredDungeons.includes('glasslands-bell')) {
      this.worldProgress.discoveredDungeons.push('glasslands-bell');
    }
    const glasslandsLair = cell && GLASSLANDS_LAIRS.find((lair) => lair.cellId === cell.id);
    if (glasslandsLair && !this.worldProgress.discoveredDungeons.includes(glasslandsLair.id)) {
      this.worldProgress.discoveredDungeons.push(glasslandsLair.id);
    }
    if (cell?.id === 'resolve-bell-sanctum' &&
      !this.worldProgress.discoveredDungeons.includes('fallen-capital-bell')) {
      this.worldProgress.discoveredDungeons.push('fallen-capital-bell');
    }
    if (cell?.id === 'sunken-chapel' &&
      this.snapshot.quest.step === 'Enter the Sunken Chapel and read the tide-bell order') {
      this.snapshot.quest = {
        title: 'The Silent Bell',
        description: 'Use the tide-bell order in Maelis’s field note to open the inner door.',
        step: 'Ring the three tide bells: Low, High, Low',
      };
      this.addLog('The Sunken Chapel entrance opens onto a chamber of three tide bells.');
    }
    if (
      cell?.id === 'frostline-stair' &&
      this.snapshot.quest.step === 'Reach Frostline Stair'
    ) {
      this.snapshot.quest = {
        title: 'A Trail North',
        description: 'Maelis’s signal was seen near the Cinderwatch lookout.',
        step: 'Search Cinderwatch Approach for Maelis’s next sign',
      };
      this.addLog('The floodway opens onto Frostline Stair in the Ashen Peaks.');
    }
    if (!regionChanged && !locationChanged && !discoveredCell) return;
    this.snapshot.roomId = room;
    this.snapshot.location = location;
    if (regionChanged) {
      this.snapshot.discoveredRooms = Array.from(new Set([...this.snapshot.discoveredRooms, room]));
    }
    this.refreshEnemyHud();
    this.snapshot.hint = this.roomHint(room, cell?.id);
    if ((cell?.id === MAELIS_HUB || cell?.id === HUNGER_ARENA) && !this.worldProgress.colorsRestored) {
      this.prepareFinale();
    }
    if (!regionChanged) return;
    if (room === 'woodland' && previousRoom === 'village') {
      this.addLog('You follow the old trail into Briarwood.');
    }
    if (room === 'ruins' && !this.snapshot.gateOpen) {
      this.snapshot.quest = {
        title: 'The bells below',
        description: 'Find a path through the old temple.',
        step: 'Light the three runes in the keeper’s order',
      };
    }
    if (cell?.id === 'sanctum') {
      this.snapshot.quest = {
        title: 'The bells below',
        description: 'Defeat the creature guarding the Emberheart.',
        step: this.snapshot.bossDefeated ? 'The sanctum is quiet' : 'Face Cinderhorn in the Ember Sanctum',
      };
    }
  }

  private roomHint(room: RoomId, cellId?: string): string {
    if (room === 'village') return 'Find Elder Rowan near the old well.';
    if (room === 'woodland') {
      if (cellId === 'drowned-marches-02-01' || cellId === 'reedveil-crossing') {
        const tideName = this.worldProgress.marchesTide === 'high' ? 'high' : 'low';
        return cellId === 'reedveil-crossing'
          ? `The tide is ${tideName} at Reedveil Crossing. The shallow ford is ${tideName === 'low' ? 'open' : 'closed'}; the main causeway stays open.`
          : `The tide is ${tideName} along Tidemark Track. Follow the dry central trail.`;
      }
      if (cellId === 'canopy') return 'Old Canopy ends at the stone ridge. Return south to the trail.';
      if (cellId === 'northwood') return 'Briarwood lies south. Follow the worn path east to the Rootbound Ruins.';
      if (cellId === 'briarwood') return 'Hearthglen is south. The old trail climbs north and the ruins lie east.';
      if (cellId === 'fernwood') return 'The trail runs north to the ruins and west toward Hearthglen.';
      if (cellId === 'eastwood') return 'Mossmere opens east. Follow the river path south to Riverbend.';
      if (cellId === 'riverbend') return 'Fernwood lies west. Follow the river south to Riverbank.';
      if (cellId === 'southfield') return 'Hearthglen lies west. Fernwood is north.';
      if (cellId === 'riverbank') return 'Riverbend lies north. The river path leads west to Southfield.';
      if (cellId === 'bellkeeper-causeway') return 'The chapel passage opens west onto the drowned waystones.';
      if (cellId === 'drowned-waystones') return 'Maelis’s marks continue west toward Wrecker’s Reach.';
      if (cellId === 'wreckers-reach') return 'The broken road bends south toward the Old Floodgate.';
      if (cellId === 'old-floodgate') return 'The floodway runs south to Northbound Sluice.';
      if (cellId === 'northbound-sluice') return 'The sluice climbs north into the Ashen Peaks.';
      if (cellId === 'frostline-stair') return 'The mountain track runs east toward Cinderwatch Approach.';
      if (cellId === 'cinderwatch-approach') return 'Maelis’s signal mirror points farther into the Ashen Peaks.';
      if (cellId === 'ashbound-trail') return 'The ashbound trail descends toward the Glasslands.';
      if (cellId === 'blackglass-pass') return 'The peaks give way to glass below.';
      if (cellId === 'last-ash-watch') return 'The Glassward Gate lies south.';
      if (cellId === 'glassward-slope') return 'Continue south through the gate to enter the Glasslands.';
      if (cellId === 'glassward-gate') return 'The Glasslands begin beyond this pass.';
      if (cellId === 'glassward-entry') return 'The Petrified Garden lies south. The Conservatory holds the Bell of Joy.';
      if (cellId === 'petrified-garden') return 'The Prism Conservatory lies south.';
      if (cellId === 'joy-bell-sanctum') return this.worldProgress.completedDungeons.includes('glasslands-bell')
        ? 'The Bell of Joy is silent. The road to the Fallen Capital continues south.'
        : 'Read the Conservatory inscription, ring its runes in order, then face the Prism Bellkeeper.';
      if (cellId === 'mirrorwalk') return 'The road to the Fallen Capital continues south.';
      if (cellId === 'stillwater-glass') return 'The southern road reaches the Fallen Capital.';
      if (cellId === 'capital-road') return 'The Fallen Capital lies south.';
      if (cellId === 'capital-south-gate') return 'The archive lies south. The last bell is deeper in the city.';
      if (cellId === 'fallen-archive') return 'Read the archive inscription before approaching the Bell of Resolve.';
      if (cellId === 'resolve-bell-sanctum') return this.worldProgress.completedDungeons.includes('fallen-capital-bell')
        ? 'The Bell of Resolve is silent. Maelis’s final record points toward the First Hunger.'
        : 'Read the archive inscription, ring its runes in order, then face the Oathbound Bellkeeper.';
      if (cellId === 'last-ash-watch') return this.worldProgress.completedDungeons.includes('ashen-peaks-bell')
        ? 'The Bell of Fury is silent. The road south opens toward the Glasslands.'
        : 'The Fury Bellkeeper guards the Ashen Peaks. Defeat it to open the road south.';
      if (cellId === 'first-hunger-sanctum') return this.worldProgress.colorsRestored
        ? 'The Hunger’s hollow is quiet. Color has returned to Emberfall.'
        : 'The First Hunger waits beyond the silent bells.';
      return 'The trail continues between the neighboring clearings.';
    }
    if (room === 'ruins') return this.snapshot.gateOpen
      ? 'The Ember Gate stands open. Follow the passage north.'
      : `High Briarwood is west. Light the runes: ${RUNE_SEQUENCE.map((index) => RUNE_ORDER[index]).join(' → ')}.`;
    if (room === 'sanctum') return this.snapshot.bossDefeated
      ? 'The shrine is quiet. Your road continues.'
      : 'Something ancient guards the heart of the ruin.';
    if (room === 'chapel') {
      if (this.worldProgress.completedDungeons.includes('sunken-chapel')) return 'The chapel is quiet again. The tide bells remember their song.';
      if (!this.worldProgress.chapelGateOpen) return `The inner door is sealed. Ring Low → High → Low (${this.worldProgress.chapelPuzzleProgress}/3).`;
      if (this.snapshot.quest.step === 'Defeat the Drowned Bellkeeper') {
        return 'The chapel seal is open. Enter the Bell Tower of Tides to face its keeper.';
      }
      const site = MAIN_BOSS_SITES.find((entry) => entry.regionId === 'drowned-marches');
      const missing = site?.requiredKeys.filter((key) => !this.snapshot.inventory.some((item) => item.id === key)).length ?? 0;
      return missing ? `The Bell Tower seal needs all three lair keys (${missing} remain).`
        : 'The three lair keys answer. Enter the Bell Tower of Tides.';
    }
    return '';
  }

  private refreshEnemyHud(): void {
    const player = this.snapshot.player;
    const playerCell = player ? worldCellAt(player.x, player.y)?.id : undefined;
    this.snapshot.enemies = this.enemies
      .filter((enemy) => this.worldProgress.activeDungeon || !playerCell || worldCellAt(enemy.x, enemy.y)?.id === playerCell)
      .map(({ id, name, hp, maxHp, boss }) => ({ id, name, hp, maxHp, boss }));
  }

  private addLog(message: string): void {
    this.snapshot.log = [...this.snapshot.log.slice(-5), message];
  }

  private setCombatFeedback(message: string): void {
    this.combatFeedbackMessage = message;
    this.combatFeedbackMs = 1800;
    this.snapshot.hint = message;
  }

  private movePlayer(dx: number, dy: number): void {
    const player = this.snapshot.player;
    if (!player) return;
    const speed = Math.hypot(dx, dy);
    const testAxis = (axis: 'x' | 'y', amount: number) => {
      const nextX = axis === 'x' ? player.x + amount : player.x;
      const nextY = axis === 'y' ? player.y + amount : player.y;
      if (!this.isBlocked(nextX, nextY, player.x, player.y)) {
        player[axis] += amount;
      }
    };
    if (speed > 0) {
      testAxis('x', dx);
      testAxis('y', dy);
    }
    this.updateWorldRegion();
    this.snapshot.hint = this.combatFeedbackMs > 0
      ? this.combatFeedbackMessage
      : this.contextHint();
  }

  private isBlocked(x: number, y: number, fromX = x, fromY = y): boolean {
    if (this.worldProgress.activeDungeon) return dungeonBlocked(
      this.worldProgress.activeDungeon.id, this.dungeonProgress(), x, y);
    if (!this.snapshot.player) return true;
    if (x < 18 || x > WORLD_WIDTH - 18 || y < 18 || y > WORLD_HEIGHT - 18) return true;
    const cell = worldCellAt(x, y);
    if (!cell) return true;
    const room = cell.roomId;
    const localX = x - cell.x;
    const localY = y - cell.y;
    const fromCell = worldCellAt(fromX, fromY);
    if (cell.id === HUNGER_ARENA && fromCell?.id !== HUNGER_ARENA && !this.canEnterHungerArena()) return true;
    if (
        (localX < WORLD_CELL_BORDER_THICKNESS && !isWithinCellEdgeOpening(cell.id, 'west', localX, localY, this.worldProgress.unlockedRegions, this.worldProgress.marchesTide, this.worldProgress.silencedBells)) ||
        (localX > WORLD_CELL_WIDTH - WORLD_CELL_BORDER_THICKNESS && !isWithinCellEdgeOpening(cell.id, 'east', localX, localY, this.worldProgress.unlockedRegions, this.worldProgress.marchesTide, this.worldProgress.silencedBells)) ||
        (localY < WORLD_CELL_BORDER_THICKNESS && !isWithinCellEdgeOpening(cell.id, 'north', localX, localY, this.worldProgress.unlockedRegions, this.worldProgress.marchesTide, this.worldProgress.silencedBells)) ||
        (localY > WORLD_CELL_HEIGHT - WORLD_CELL_BORDER_THICKNESS && !isWithinCellEdgeOpening(cell.id, 'south', localX, localY, this.worldProgress.unlockedRegions, this.worldProgress.marchesTide, this.worldProgress.silencedBells))
    ) return true;
    if (fromCell && fromCell.id !== cell.id) {
      if (!canCrossWorldBoundary(
        fromCell.id,
        cell.id,
        localX,
        localY,
        this.snapshot.gateOpen,
        this.snapshot.keyFound,
        this.worldProgress.unlockedRegions,
        this.worldProgress.marchesTide,
        this.worldProgress.silencedBells,
      )) return true;
    }
    const obstacles: [number, number, number, number][] =
      cell.regionId === HUNGER_REGION
        ? [[82, 78, 180, 142], [460, 336, 552, 404]]
        : cell.id === 'first-hunger-sanctum'
        ? [
          [26, 28, 58, 452], [582, 28, 614, 452],
          [26, 28, 270, 54], [370, 28, 614, 54],
          [26, 434, 270, 454], [370, 434, 614, 454],
          ...[[54, 70, 116, 142], [524, 70, 586, 142]]
            .map((obstacle) => centerOnlyCollider(obstacle as CollisionRect)),
        ]
        : room === 'chapel'
        ? [
          [46, 28, 66, 452], [574, 28, 594, 452],
          [66, 28, 270, 48], [370, 28, 574, 48],
          [66, 432, 574, 452],
          ...(this.worldProgress.chapelGateOpen
            ? [[66, 220, 278, 250] as [number, number, number, number], [362, 220, 574, 250] as [number, number, number, number]]
            : [[66, 220, 574, 250] as [number, number, number, number]]),
          [102, 80, 146, 118], [494, 80, 538, 118],
        ]
        : room === 'village'
        ? [[48, 56, 220, 166], [420, 56, 590, 166], [90, 390, 220, 432], [454, 394, 570, 444]]
        : room === 'woodland'
          ? [
            ...(cell.id === 'canopy' ? [[582, 0, 640, 480] as [number, number, number, number]] : []),
            ...(cell.id === 'northwood'
              ? [
                [446, 350, 464, 438] as [number, number, number, number],
                [516, 350, 534, 438] as [number, number, number, number],
                [464, 420, 516, 438] as [number, number, number, number],
                ...(!this.worldProgress.destroyedObstacles.includes('northwood-root-door')
                  ? [[482, 380, 498, 396] as CollisionRect]
                  : []),
              ]
              : []),
            ...(cell.id === 'riverbank' && !this.worldProgress.destroyedObstacles.includes('riverbank-briar-seal')
              ? [
                [250, 234, 268, 354] as CollisionRect,
                [372, 234, 390, 354] as CollisionRect,
                [250, 336, 390, 354] as CollisionRect,
                [268, 234, 372, 252] as CollisionRect,
              ]
              : []),
            ...[
              [54, 70, 116, 142], [524, 70, 586, 142],
              [86, 78, 136, 178], [178, 355, 235, 406], [414, 96, 466, 168],
              [480, 274, 524, 316], [112, 274, 158, 316],
            ].map((obstacle) => centerOnlyCollider(obstacle as CollisionRect)),
          ]
          : room === 'ruins'
            ? [
              [46, 42, 66, 200], [46, 280, 66, 438],
              [574, 42, 594, 200], [574, 280, 594, 438],
              [66, 42, 270, 62], [370, 42, 574, 62],
              [91, 117, 107, 131], [533, 117, 549, 131],
              [91, 154, 107, 168], [533, 154, 549, 168],
              [91, 191, 107, 205], [533, 191, 549, 205],
              [91, 228, 107, 242], [533, 228, 549, 242],
              [244, 367, 260, 383], [380, 367, 396, 383],
              [66, 420, 270, 438], [370, 420, 574, 438],
              ...(!this.snapshot.gateOpen ? [[282, 0, 358, 56] as [number, number, number, number]] : []),
            ]
            : [
              [26, 28, 58, 452], [582, 28, 614, 452], [26, 28, 614, 54],
              [26, 434, 270, 454], [370, 434, 614, 454],
              ...[[54, 70, 116, 142], [524, 70, 586, 142]]
                .map((obstacle) => centerOnlyCollider(obstacle as CollisionRect)),
            ];
    if (obstacles.some((obstacle) => inRect(localX, localY, obstacle))) return true;
    if (room === 'village' && distance(localX, localY, 510, 328) < 28) return true;
    if (room === 'sanctum') {
      const boss = this.enemies.find((enemy) => enemy.boss);
      if (boss && distance(x, y, boss.x, boss.y) < boss.radius + 11) return true;
    }
    for (const enemy of this.enemies) {
      if (distance(x, y, enemy.x, enemy.y) < enemy.radius + 10) return true;
    }
    return false;
  }

  private contextHint(): string {
    const player = this.snapshot.player;
    if (!player) return '';
    const nearest = this.getProps()
      .filter((prop) => prop.visible !== false && prop.interactable !== false)
      .map((prop) => ({ prop, dist: distance(player.x, player.y, prop.x, prop.y) }))
      .sort((a, b) => a.dist - b.dist)[0];
    if (nearest && nearest.dist < 64) {
      if (nearest.prop.id.startsWith('dungeon-') || nearest.prop.id.startsWith('drainhouse-') ||
          MARCHES_LAIRS.some((lair) => nearest.prop.id.startsWith(`${lair.id}/`)) ||
          GLASSLANDS_LAIRS.some((lair) => nearest.prop.id.startsWith(`${lair.id}/`))) {
        return `B · ${nearest.prop.label}${nearest.prop.activated ? ' (active)' : ''}`;
      }
      if (nearest.prop.kind === 'npc') return `B · Speak with ${nearest.prop.label}`;
      if (nearest.prop.kind === 'chest') return `B · Open ${nearest.prop.label}`;
      if (nearest.prop.kind === 'rune') {
        if (!nearest.prop.activated) return `B · Light ${nearest.prop.label}`;
        if (nearest.prop.id.startsWith('glass-bell-rune-')) {
          const next = ['Dawn', 'Bloom', 'Reflection'][this.worldProgress.glasslandsPuzzleProgress];
          return next
            ? `${nearest.prop.label} is lit. Next: ${next} rune.`
            : `${nearest.prop.label} is lit. The keeper is awake.`;
        }
        if (nearest.prop.id.startsWith('capital-bell-rune-')) {
          const next = ['Name', 'Oath', 'Vow'][this.worldProgress.fallenCapitalPuzzleProgress];
          return next
            ? `${nearest.prop.label} is lit. Next: ${next} rune.`
            : `${nearest.prop.label} is lit. The keeper is awake.`;
        }
        return `${nearest.prop.label} is already lit.`;
      }
      if (nearest.prop.kind === 'treeGate') {
        return nearest.prop.activated
          ? `${nearest.prop.label} is open`
          : nearest.prop.hitsRequired
          ? `A · Strike ${nearest.prop.label} (${nearest.prop.hitsTaken ?? 0}/${nearest.prop.hitsRequired} hits)`
          : `A · Strike ${nearest.prop.label} (${nearest.prop.damageTaken ?? 0}/${nearest.prop.damageRequired ?? 0})`;
      }
      if (nearest.prop.kind === 'gate') return nearest.prop.id === 'chapel-inner-seal'
        ? this.worldProgress.chapelGateOpen ? 'The tide-locked door is open' : 'The inner door is sealed'
        : this.snapshot.gateOpen ? 'The Ember Gate is open' : 'The sealed gate resists you';
      if (nearest.prop.kind === 'shrine') return `B · Rest at ${nearest.prop.label}`;
      if (nearest.prop.kind === 'inscription') return `B · Read ${nearest.prop.label}`;
    }
    const nearbyEnemy = this.enemies.some((enemy) => distance(player.x, player.y, enemy.x, enemy.y) < 100);
    if (nearbyEnemy) return 'A · Attack';
    return 'Find the trail and explore.';
  }

  private contextAction(): void {
    const player = this.snapshot.player;
    if (!player) return;
    const nearest = this.getProps()
      .filter((prop) => prop.visible !== false && prop.interactable !== false)
      .map((prop) => ({ prop, dist: distance(player.x, player.y, prop.x, prop.y) }))
      .filter((item) => item.dist < 54)
      .sort((a, b) => a.dist - b.dist)[0]?.prop;
    const well = nearest && wellById(nearest.id);
    if (well) { this.restAtWell(well); return; }
    if (nearest && this.hungerAction(nearest)) return;
    if (nearest && this.glasslandsLairAction(nearest)) return;
    if (nearest && this.dungeonAction(nearest)) return;
    if (nearest?.id === 'chapel-inner-seal' && !this.worldProgress.chapelGateOpen &&
        this.snapshot.inventory.some((item) => MARCHES_KEYS.some((key) => key === item.id))) {
      this.openChapelSeal(
        'The Sorrow Ward key opens the bellkeeper’s inner seal.',
        'The Sorrow Ward key opens the Sunken Chapel’s inner seal.',
      );
      return;
    }
    if (nearest?.kind === 'npc') {
      this.snapshot.dialogSpeaker = nearest.label;
      const rowanStop = nearest.id === 'rowan'
        ? getRowanTravelStop(this.worldProgress.silencedBells)
        : null;
      if (nearest.id === 'glasslands-apothecary') {
        this.snapshot.dialog = null;
        this.snapshot.overlay = 'shop';
        this.snapshot.hint = 'Gleamharbor market is open.';
      } else if (nearest.id === 'glasslands-storyteller') {
        this.snapshot.dialog = 'We called this place Gleamharbor before the Bell of Joy began to dim. Three keepers sealed their gardens against the Prism Conservatory; each carries a key. The old gardeners hid a spear in the singing orchard, a mantle beneath the mothglass loom, and a prism where two chimes meet.';
        this.snapshot.hint = 'The three garden lairs hold keys for the Conservatory seal. Hidden gear lies in the orchard, loom, and mirror grove.';
      } else if (nearest.id === 'mournwater-apothecary') {
        this.snapshot.dialog = null;
        this.snapshot.overlay = 'shop';
        this.snapshot.hint = 'Mournwater market is open.';
      } else if (nearest.id === 'mournwater-trainer') {
        this.snapshot.dialog = null;
        this.snapshot.overlay = 'training';
        this.snapshot.hint = 'Choose how many shards to spend on training.';
      } else if (nearest.id === 'mournwater-storyteller') {
        this.snapshot.dialog = 'The old waystones remember songs, and the floodgate remembers weight. Listen at the drowned stones for a melody, and watch which sluice turns when the water shifts. My aunt swore a hidden blade lies where the reeds bend against the current.';
        this.snapshot.hint = 'Search the waystones, floodgate, and bent reeds for the Marches’ hidden paths and gear.';
      } else if (nearest.id === 'capital-quartermaster') {
        this.snapshot.dialog = null;
        this.snapshot.overlay = 'shop';
        this.snapshot.hint = 'Kesh’s salvage market is open.';
      } else if (nearest.id === 'capital-instructor') {
        this.snapshot.dialog = null;
        this.snapshot.overlay = 'training';
        this.snapshot.hint = 'Choose how many shards to spend on training.';
      } else if (nearest.id === 'capital-captain') {
        this.snapshot.dialog = 'We have one defensible block left. The rest of the Capital belongs to the ruins now. Maelis crossed the ash archive, then vanished toward the last bell; our scouts found their trail in three very different places. If you follow it, look for signs the old city left behind, not another set of chimes.';
        this.snapshot.hint = 'The dispatch board and survivors can point toward separated ruins, lairs, and hidden equipment.';
      } else if (nearest.id === 'maelis-ally' && this.isMaelisConversationRoom()) {
        this.snapshot.dialog = '“The Hunger’s first breath is in that chamber. It will try to make you fight alone, even now. Keep close when the colors flare; I will draw its gaze when I can. Whatever happens, the choice to feel again belongs to everyone—not to me, and not to the bells.”';
        this.snapshot.hint = 'Maelis will fight beside you. Enter the chamber when you are ready.';
      } else if (this.worldProgress.colorsRestored) {
        this.snapshot.dialog = nearest.id === 'rowan'
          ? 'The bells are silent, and they may stay silent. They never made our feelings; they only rationed what the Hunger stole. Listen—laughter at the well, tears for those we lost. We need no keeper’s permission now. Humanity is free to feel, and this bright world belongs to all of us.'
          : nearest.id === 'mournwater-ferryman'
            ? 'I can finally grieve the people the flood took. My neighbors held me while I wept; then we laughed at an old story. The water shines blue again, but it is the freedom to feel that matters. We do not need the bells anymore.'
            : nearest.id === 'maelis-ally'
              ? 'I fought beside you, and you ended the Hunger. No more borrowed feelings, no keepers deciding what we may feel. I cannot undo what I cost this world. I can help it rebuild.'
              : 'There is color in the roads again, and feeling in our hearts. We can laugh, mourn, dare, wonder, and choose our own purpose. The bells are no longer needed.';
      } else if (rowanStop) {
        this.snapshot.dialogSpeaker = 'Elder Rowan';
        this.snapshot.dialog = rowanStop.dialogue;
      } else if (nearest.id === 'mournwater-ferryman') {
        if (this.worldProgress.completedDungeons.includes('sunken-chapel') &&
          this.snapshot.quest.step === 'Return the drowned bell seal to the ferryman') {
          this.snapshot.dialog = 'The seal is warm. Maelis survived the flood and went north. The bellkeepers took the old floodway through Northbound Sluice; her marks should still be there.';
          this.snapshot.quest = {
            title: 'A Trail North',
            description: 'Follow Maelis’s marks through the old floodway and into the Ashen Peaks.',
            step: 'Find Maelis’s trail mark at the Northbound Sluice',
          };
          this.worldProgress.unlockedRegions = Array.from(new Set([
            ...this.worldProgress.unlockedRegions,
            'ashen-peaks',
          ]));
          this.addItem({
            id: 'drowned-bell-seal',
            name: 'Drowned bell seal',
            kind: 'relic',
            description: 'The seal that bound the Sunken Chapel’s tide bells.',
            equipped: false,
          });
          const player = this.snapshot.player;
          if (player) {
            player.xp += 90;
            player.coins += 30;
            this.checkLevelUp();
          }
          this.snapshot.hint = 'A new road opens west of the Sunken Chapel.';
          this.addLog('The ferryman accepts the bell seal. Maelis’s northern trail is open. +90 XP, +30 coins.');
        } else if (this.worldProgress.completedDungeons.includes('sunken-chapel')) {
          this.snapshot.dialog = 'The chapel bells still ring softly beneath the water. Maelis survived the flood and went north through the old sluice road.';
          this.snapshot.hint = this.snapshot.quest.step === 'Find Maelis’s trail mark at the Northbound Sluice'
            ? 'Follow the road west of the Sunken Chapel to Northbound Sluice.'
            : 'Maelis’s trail continues beyond Cinderwatch.';
        } else if (this.snapshot.quest.step === 'Find the stranded ferryman') {
          this.snapshot.dialog = 'Maelis crossed the flooded road before the bell fell quiet. The trail runs east to the Sunken Chapel, but the old entrance is choked with water. Look for her marks in the reeds.';
          this.snapshot.quest = {
            title: 'The Silent Bell',
            description: 'Find a way into the Sunken Chapel and follow Maelis’s trail.',
            step: 'Reach the Sunken Chapel approach',
          };
          this.snapshot.hint = 'The chapel approach is east of the ferry.';
          this.addLog('The ferryman saw Maelis heading east toward the Sunken Chapel.');
        } else {
          this.snapshot.dialog = 'The trail runs through Reedveil Crossing to the chapel forecourt. Maelis’s field note tells how to open the inner door.';
          this.snapshot.hint = 'Follow Maelis’s marks east, then south into the chapel.';
        }
      } else if (this.snapshot.quest.step === 'Return to Hearthglen') {
        this.awakenBellOfWonder(true);
      } else if (this.worldProgress.silencedBells.includes('hearthglen')) {
        this.snapshot.dialog = this.firstBellLore();
        this.snapshot.hint = 'Follow the trail south from Southfield to Mournwater Crossing.';
        this.addLog('Rowan points you toward the Drowned Marches.');
      } else {
        this.snapshot.dialog = 'Long ago, three lights opened the passage: Sun, Star, then Moon. Bring the Emberheart back before the bells fall silent.';
        this.snapshot.hint = 'Rune order: Sun → Star → Moon.';
        this.snapshot.quest = {
          title: 'The bells below',
          description: 'Rowan needs the Emberheart from the sealed temple.',
          step: 'Find the Rootbound Ruins beyond Briarwood',
        };
        this.addLog('Elder Rowan told you the order of the three runes.');
      }
      if (nearest.id === 'rowan' && this.snapshot.inventory.some((item) => item.id === 'oldroot-token')) {
        this.snapshot.dialog = `${this.snapshot.dialog ?? ''}\n\nRowan recognizes the seed-heart token. “Oldroot’s grove was among the first to shelter Hearthglen. This is its promise that the forest has not forgotten us.”`;
      }
      if (nearest.id === 'rowan' && this.snapshot.inventory.some((item) => item.id === 'riverheart-charm')) {
        this.snapshot.dialog = `${this.snapshot.dialog ?? ''}\n\nRowan recognizes the Riverheart charm. “The riverbank clearing has kept its old promise. Let this living water guide you through what lies ahead.”`;
      }
    } else if (nearest?.kind === 'rune') {
      this.activateRune(nearest.id);
    } else if (nearest?.kind === 'chest') {
      this.openChest(nearest.id);
    } else if (nearest?.kind === 'shrine') {
      this.shrineUsed = true;
      player.hp = player.maxHp;
      player.resource = player.maxResource;
      this.snapshot.hint = 'The shrine restores your health and spirit.';
      this.addLog('Rested at the wayfarer shrine.');
    } else if (nearest?.kind === 'gate') {
      this.snapshot.hint = nearest.id === 'chapel-inner-seal'
        ? this.worldProgress.chapelGateOpen ? 'The tide-locked door is open.' : 'The tide bells must ring Low → High → Low.'
        : this.snapshot.gateOpen ? 'The Ember Gate is open.' : 'The gate needs a brass key and the three runes.';
    } else if (nearest?.kind === 'treeGate') {
      if (nearest.activated) {
        this.snapshot.hint = `${nearest.label} is already open.`;
      } else if (nearest.hitsRequired) {
        this.snapshot.hint = `${nearest.label}: ${nearest.hitsTaken ?? 0}/${nearest.hitsRequired} hits. Strike with any weapon.`;
      } else if (nearest.requiredWeaponName) {
        this.snapshot.hint = nearest.guideClue
          ?? `${nearest.label} parts only for ${nearest.requiredWeaponName}.`;
      } else {
        this.snapshot.hint = `The roots are holding. Strike them for ${nearest.damageRequired ?? 0} total damage (${nearest.damageTaken ?? 0} dealt).`;
      }
    } else if (nearest?.kind === 'inscription') {
      if (nearest.id === 'riverbank-briar-inscription') {
        this.snapshot.dialogSpeaker = nearest.label;
        this.snapshot.dialog = '“Five strikes loosen what the river roots have bound.” No special blade is needed; strike the seal with your own weapon.';
        this.snapshot.hint = 'Strike the thornbound seal five times with any weapon.';
      } else if (nearest.id === 'maelis-trail-mark') {
        this.snapshot.dialog = 'Three cuts in the reed-stone point east, then south. Maelis passed here carrying a note wrapped in blue cloth.';
        this.snapshot.quest = {
          title: 'The Silent Bell',
          description: 'Find Maelis’s field note at the chapel forecourt.',
          step: "Find Maelis's field note at the chapel forecourt",
        };
        this.snapshot.hint = 'The trail bends east across Reedveil Crossing.';
        this.addLog('Maelis’s marks lead across the reeds toward the chapel forecourt.');
      } else if (nearest.id === 'maelis-field-note') {
        this.snapshot.dialog = 'Maelis’s note: “Low, High, Low. The chapel door answers the drowned bell’s tide.”';
        this.snapshot.quest = {
          title: 'The Silent Bell',
          description: 'Enter the chapel and ring the tide bells in Maelis’s order.',
          step: 'Enter the Sunken Chapel and read the tide-bell order',
        };
        this.snapshot.hint = 'The Sunken Chapel entrance is south of the forecourt.';
        this.addLog('Maelis’s field note gives the tide-bell order: Low, High, Low.');
      } else if (nearest.id === 'maelis-northbound-mark') {
        this.snapshot.dialog = 'Maelis’s cuts are fresh: “The bells are moving north. I found a stair through the floodway. If the ferryman sent help, meet me at Cinderwatch.”';
        this.snapshot.quest = {
          title: 'A Trail North',
          description: 'Follow the floodway into the Ashen Peaks and search Cinderwatch for Maelis.',
          step: 'Reach Frostline Stair',
        };
        this.snapshot.hint = 'Take the passage south through the sluice; it climbs north into the Ashen Peaks.';
        this.addLog('Maelis’s floodway mark points toward Frostline Stair.');
      } else if (nearest.id === 'maelis-cinderwatch-mark') {
        if (this.worldProgress.completedDungeons.includes('fallen-capital-bell')) {
          this.snapshot.dialog = 'The signal mirror is dark now. Maelis’s final record names the First Hunger.';
          if (BELL_REGION_IDS.every((region) => this.worldProgress.silencedBells.includes(region))) {
            this.snapshot.quest = {
              title: 'The Last Record',
              description: 'The five bells are silent. Find The First Hunger in its hollow.',
              step: 'Find The First Hunger in the Hollow',
            };
            this.snapshot.hint = 'The five bells are silent. The First Hunger waits beyond the Hall of the Last Record.';
          } else if (!this.worldProgress.silencedBells.includes('ashen-peaks')) {
            this.snapshot.quest = {
              title: 'The Last Record',
              description: 'The Bell of Fury still burns at Last Ash Watch. Silence it to free the road to The First Hunger.',
              step: 'Find the Bell of Fury in the Ashen Peaks',
            };
            this.snapshot.hint = 'The Bell of Fury still rings at Last Ash Watch. Defeat its keeper before seeking The First Hunger.';
          } else {
            this.snapshot.hint = 'The Bell of Resolve is silent. The First Hunger remains bound until every bell falls quiet.';
          }
        } else if (this.worldProgress.completedDungeons.includes('glasslands-bell')) {
          this.snapshot.dialog = 'The signal mirror is dark now. Maelis’s record points south to the Fallen Capital and its last bell.';
          this.snapshot.quest = {
            title: 'The Last Record',
            description: 'The Fallen Capital holds the Bell of Resolve and Maelis’s final record.',
            step: 'Find the Bell of Resolve in the Fallen Capital',
          };
          this.snapshot.hint = 'Continue south through the Glasslands to the Fallen Capital.';
        } else if (this.worldProgress.completedDungeons.includes('ashen-peaks-bell')) {
          this.snapshot.dialog = 'Maelis’s signal mirror points beyond the Ashen Peaks. Her record names the Bell of Joy in the Glasslands.';
          this.snapshot.quest = {
            title: 'The Last Record',
            description: 'The Glasslands hold the Bell of Joy and the next of Maelis’s records.',
            step: 'Find the Bell of Joy in the Glasslands',
          };
          this.worldProgress.unlockedRegions = Array.from(new Set([
            ...this.worldProgress.unlockedRegions,
            'glasslands',
          ]));
          for (const lair of GLASSLANDS_LAIRS) {
            this.worldProgress.dungeons[lair.id] ??= initialDungeonProgress();
          }
          this.snapshot.hint = 'The glassward trail opens south from the Ashen Peaks.';
          this.addLog('The Fury Bell’s silence opens the southern road to the Glasslands.');
        } else {
          this.snapshot.dialog = 'The signal mirror flashes Maelis’s mark: “I am alive. The Bell of Fury still burns at Last Ash Watch. Silence it, and the road south will open.”';
          this.snapshot.quest = {
            title: 'The Last Record',
            description: 'Defeat the keeper at Last Ash Watch and silence the Bell of Fury.',
            step: 'Find the Bell of Fury in the Ashen Peaks',
          };
          this.snapshot.hint = 'Follow the ash trail south from Cinderwatch to Last Ash Watch.';
          this.addLog('Maelis’s signal mirror points to the unsilenced Bell of Fury at Last Ash Watch.');
        }
      } else if (nearest.id === 'glass-bell-inscription') {
        this.snapshot.dialog = 'A line cut into the glass reads: “Dawn opens the garden. Bloom follows. Reflection closes the circle.”';
        this.snapshot.dialogSpeaker = 'Prism Conservatory';
        this.snapshot.hint = 'Ring the Conservatory runes: Dawn → Bloom → Reflection. Three garden keys are needed to wake the keeper.';
      } else if (nearest.id === 'capital-bell-inscription') {
        this.snapshot.dialog = 'The archive’s last line reads: “Speak the Name. Keep the Oath. Make the Vow.”';
        this.snapshot.dialogSpeaker = 'Fallen Archive';
        this.snapshot.hint = 'Ring the archive runes: Name → Oath → Vow.';
      } else {
        this.snapshot.dialogSpeaker = nearest.label;
        this.snapshot.dialog = nearest.guideClue ?? 'The glass remembers a path through the garden.';
      }
    } else {
      this.dodge();
    }
  }

  private awakenBellOfWonder(rewardPlayer: boolean): void {
    const player = this.snapshot.player;
    if (!player) return;
    this.worldProgress.silencedBells = Array.from(new Set([...this.worldProgress.silencedBells, 'hearthglen']));
    this.worldProgress.unlockedRegions = Array.from(new Set([...this.worldProgress.unlockedRegions, 'drowned-marches']));
    this.snapshot.dialogSpeaker = 'Elder Rowan';
    this.snapshot.dialog = `Hearthglen celebrates the Cinderheart’s return. Then the Bell of Wonder rings once—and falls silent. Its golden light drains from the village.\n\n“Before the Emberfall, the First Hunger devoured our feelings. As wonder, sorrow, fury, joy, and resolve vanished, so did the world’s colors. Five bellkeepers made five great bells to return those feelings and imprison the Hunger. They saved us—but they never destroyed it.\n\n“Maelis is the last bellkeeper. She believes the bells keep the Hunger bound to us, and that silencing them is the only way to free humanity for good. Each bell’s silence drains more color. She may be right, but when the last bell falls, the Hunger will be loose. Find her at Mournwater. Hear her before you decide what must be done.”`;
    this.snapshot.quest = {
      title: 'The Silent Bell',
      description: 'The Bell of Wonder has fallen silent. Follow the witness’s trail into the Drowned Marches.',
      step: 'Travel to the Mournwater Crossing',
    };
    this.snapshot.hint = 'New road open: follow the trail south from Southfield.';
    if (rewardPlayer) {
      player.xp += 80;
      player.coins += 25;
      this.checkLevelUp();
      this.addLog('Elder Rowan thanks you. +80 XP, +25 coins. The Bell of Wonder falls silent.');
    }
  }

  private firstBellLore(): string {
    return `The first bell has fallen silent. Follow the southern road to Mournwater; a witness saw Maelis heading into the Drowned Marches.\n\n“Remember the truth: the First Hunger devoured our feelings, and five bells returned them while keeping the creature imprisoned. Maelis, the last bellkeeper, believes silencing them will free us from that dependence. She may be right—but it risks releasing the Hunger. Find her at Mournwater, and hear her reasons.”`;
  }

  private activateRune(id: string): void {
    if (id.startsWith('chapel-bell-')) {
      this.activateChapelBell(id);
      return;
    }
    if (id.startsWith('glass-bell-rune-') || id.startsWith('capital-bell-rune-')) {
      this.activateRegionalBellRune(id);
      return;
    }
    if (id === 'glasslands-moth-loom') {
      if ((this.worldProgress.obstacleHits[id] ?? 0) >= 1) {
        this.worldProgress.destroyedObstacles = [...new Set([
          ...this.worldProgress.destroyedObstacles, 'glasslands-secret-mothglass-mantle',
        ])];
        delete this.worldProgress.obstacleHits[id];
        this.snapshot.hint = 'The second turn aligns the loom. A hidden mothglass mantle appears.';
      } else {
        this.worldProgress.obstacleHits[id] = 1;
        this.snapshot.hint = 'The loom turns once. Turn it again to reveal what the moths left behind.';
      }
      return;
    }
    if (id === 'glasslands-laughter-left' || id === 'glasslands-laughter-right') {
      this.worldProgress.destroyedObstacles = [...new Set([
        ...this.worldProgress.destroyedObstacles, id,
      ])];
      if (['glasslands-laughter-left', 'glasslands-laughter-right'].every((chime) =>
        this.worldProgress.destroyedObstacles.includes(chime))) {
        this.worldProgress.destroyedObstacles = [...new Set([
          ...this.worldProgress.destroyedObstacles, 'glasslands-secret-laughter-prism',
        ])];
        this.snapshot.hint = 'Both chimes answer. The laughter prism is revealed.';
      } else this.snapshot.hint = 'One chime answers. Find its partner across the mirror grove.';
      return;
    }
    if (this.puzzleSolved) {
      this.snapshot.hint = 'The ancient runes glow in harmony.';
      return;
    }
    const runeIndex = ['rune-sun', 'rune-star', 'rune-moon'].indexOf(id);
    const required = RUNE_SEQUENCE[this.snapshot.puzzleProgress];
    if (runeIndex === required) {
      this.snapshot.puzzleProgress += 1;
      if (this.snapshot.puzzleProgress >= RUNE_SEQUENCE.length) {
        this.puzzleSolved = true;
        this.snapshot.gateOpen = true;
        this.snapshot.hint = 'The runes answer. The stone gate begins to open.';
        this.snapshot.quest = {
          title: 'The bells below',
          description: 'The old gate is open; find the brass key in the sealed coffer.',
          step: 'Open the coffer and enter the Ember Gate',
        };
        this.addLog('Sun, Star, Moon. The runes ring like bells.');
      } else {
        this.snapshot.hint = `${RUNE_ORDER[runeIndex]} rune lit. The next rune answers.`;
      }
    } else {
      this.snapshot.puzzleProgress = 0;
      this.snapshot.hint = 'The runes fade. Read the sequence in Rowan’s clue.';
    }
  }

  private activateChapelBell(id: string): void {
    if (this.worldProgress.chapelGateOpen) {
      this.snapshot.hint = 'The three tide bells are ringing in harmony.';
      return;
    }
    const order = ['chapel-bell-low-a', 'chapel-bell-high', 'chapel-bell-low-b'];
    if (id !== order[this.worldProgress.chapelPuzzleProgress]) {
      this.worldProgress.chapelPuzzleProgress = 0;
      this.snapshot.hint = 'The bells fall silent. Read Maelis’s note: Low, High, Low.';
      this.addLog('The wrong bell resets the chapel’s tide-bell sequence.');
      return;
    }
    this.worldProgress.chapelPuzzleProgress += 1;
    if (this.worldProgress.chapelPuzzleProgress === order.length) {
      this.openChapelSeal(
        'The tide bells answer. The inner door opens and something stirs below.',
        'Low, High, Low: the Sunken Chapel’s inner seal opens.',
      );
      return;
    }
    this.snapshot.hint = `Tide bell ${this.worldProgress.chapelPuzzleProgress}/3 rings true.`;
    this.addLog('A tide bell answers Maelis’s sequence.');
  }

  private openChapelSeal(hint: string, logMessage: string): void {
    this.worldProgress.chapelGateOpen = true;
    this.worldProgress.chapelPuzzleProgress = 3;
    if (!this.worldProgress.completedDungeons.includes('sunken-chapel')) {
      this.snapshot.quest = {
        title: 'The Silent Bell',
        description: 'The tide seal is solved. Clear the three separated Marches lairs to open the Bell Tower of Tides.',
        step: 'Defeat the three lair keepers',
      };
    }
    this.snapshot.hint = hint;
    this.addLog(logMessage);
  }

  private activateRegionalBellRune(id: string): void {
    const isGlasslands = id.startsWith('glass-bell-rune-');
    const order = isGlasslands
      ? ['glass-bell-rune-dawn', 'glass-bell-rune-bloom', 'glass-bell-rune-reflection']
      : ['capital-bell-rune-name', 'capital-bell-rune-oath', 'capital-bell-rune-vow'];
    const dungeonId = isGlasslands ? 'glasslands-bell' : 'fallen-capital-bell';
    const cellId = isGlasslands ? 'joy-bell-sanctum' : 'resolve-bell-sanctum';
    const progressKey = isGlasslands ? 'glasslandsPuzzleProgress' : 'fallenCapitalPuzzleProgress';
    const progress = this.worldProgress[progressKey];

    if (this.worldProgress.completedDungeons.includes(dungeonId)) {
      this.snapshot.hint = isGlasslands
        ? 'The Bell of Joy has fallen silent.'
        : 'The Bell of Resolve has fallen silent.';
      return;
    }
    if (progress >= order.length) {
      this.snapshot.hint = isGlasslands
        ? 'The Prism Bellkeeper waits beyond the ringing runes.'
        : 'The Oathbound Bellkeeper waits beyond the ringing runes.';
      return;
    }
    if (id === order[progress - 1]) {
      const names = isGlasslands ? ['Dawn', 'Bloom', 'Reflection'] : ['Name', 'Oath', 'Vow'];
      this.snapshot.hint = `${names[progress - 1]} rune is already lit. Continue to the ${names[progress]} rune.`;
      return;
    }
    if (id !== order[progress]) {
      this.worldProgress[progressKey] = 0;
      this.snapshot.hint = isGlasslands
        ? 'The glass runes dim. Read the inscription: Dawn → Bloom → Reflection.'
        : 'The archive runes dim. Read the inscription: Name → Oath → Vow.';
      this.addLog('The wrong bell order resets the keeper’s seal.');
      return;
    }

    const legacyGlasslandsAccess = this.worldProgress.destroyedObstacles.includes('glasslands-legacy-bell-access');
    const allGardenKeysCollected = GLASSLANDS_LAIRS.every((lair) =>
      this.snapshot.inventory.some((item) => item.id === lair.key));
    if (isGlasslands && progress === 2 && !allGardenKeysCollected && !legacyGlasslandsAccess) {
      this.snapshot.hint = 'The final Reflection rune stays dark. Defeat the three garden keepers and bring their keys.';
      this.addLog('The Conservatory seal needs the Chimevault, Parallax Garden, and Heartglass keys.');
      return;
    }

    this.worldProgress[progressKey] += 1;
    if (this.worldProgress[progressKey] === order.length) {
      const keeperName = isGlasslands ? 'Prism Bellkeeper' : 'Oathbound Bellkeeper';
      const site = MAIN_BOSS_SITES.find((entry) => entry.cellId === cellId)!;
      const keysReady = site.requiredKeys.every((key) => this.snapshot.inventory.some((item) => item.id === key));
      this.snapshot.hint = keysReady
        ? `${keeperName} waits in the dungeon. Enter ${site.label} after the runes have opened its approach.`
        : `The final rune answers. ${keeperName} remains sealed away until all three regional lair keys are yours.`;
      this.addLog(`The ${isGlasslands ? 'Prism Conservatory' : 'Fallen Archive'} runes are complete.`);
      return;
    }

    this.snapshot.hint = `Bell rune ${this.worldProgress[progressKey]}/3 rings true.`;
    this.addLog('A regional bell rune answers the keeper’s sequence.');
  }

  private openChest(id: string): void {
    const player = this.snapshot.player;
    if (!player) return;
    const coinsBefore = player.coins;
    const collectedBefore = this.collectedIds.size;
    const itemCountBefore = this.snapshot.inventory.length;
    if (id.startsWith('regional-gear-')) {
      const gear = REGIONAL_FIELD_GEAR.find((entry) => id === `regional-gear-${entry.item.id}`);
      if (!gear) return;
      if (this.collectedIds.has(gear.item.id)) {
        this.snapshot.hint = 'This hidden gear cache has already been claimed.';
        return;
      }
      this.collectedIds.add(gear.item.id);
      this.addItem({ ...gear.item });
      this.snapshot.hint = `Found ${gear.item.name}. Equip it from the backpack to improve your stats.`;
      this.addLog(`A hidden ${gear.regionId} cache held ${gear.item.name}.`);
    } else if (id.startsWith('glasslands-gear-')) {
      const gear = GLASSLANDS_GEAR.find((entry) => id === `glasslands-gear-${entry.item.id}`);
      if (!gear) return;
      if (this.collectedIds.has(gear.item.id)) {
        this.snapshot.hint = 'The hidden gear cache is empty.';
        return;
      }
      this.collectedIds.add(gear.item.id);
      this.addItem({ ...gear.item });
      this.snapshot.hint = `Found ${gear.item.name}. Equip it in your inventory.`;
      this.addLog(`The Glasslands cache held ${gear.item.name}.`);
    } else if (id === 'marsh-silt-cache') {
      if (this.collectedIds.has(id)) {
        this.snapshot.hint = 'The poolside coffer has already been emptied.';
        return;
      }
      this.collectedIds.add(id);
      player.coins += 24;
      this.addItem({
        id: 'floodgate-tonic',
        name: 'Floodgate tonic',
        kind: 'consumable',
        description: 'A clear marsh brew. Restores 35 health.',
        equipped: false,
        quantity: 1,
      });
      this.snapshot.hint = 'The willow revealed a coffer beneath the drained silt pool: 24 shards and a tonic.';
      this.addLog('Found 24 shards and a tonic beneath the drained pool at Old Floodgate.');
    } else if (id === 'village-chest') {
      if (this.villageChestOpened) {
        this.snapshot.hint = 'Only the empty chest remains.';
        return;
      }
      this.villageChestOpened = true;
      player.coins += 16;
      this.addItem({
        id: 'field-tonic',
        name: 'Field tonic',
        kind: 'consumable',
        description: 'A bittersweet herbal brew. Restores 35 health.',
        equipped: false,
        quantity: 1,
      });
      this.discoverWeapon(WEAPON_FINDS.supply);
      this.snapshot.hint = `Found and equipped ${WEAPON_FINDS.supply.name}, 16 coins, and a field tonic.`;
      this.addLog(`The supply chest held ${WEAPON_FINDS.supply.name} and a field tonic.`);
    } else if (id === 'forest-chest') {
      if (this.forestChestOpened) {
        this.snapshot.hint = 'This cache has already been found.';
        return;
      }
      this.forestChestOpened = true;
      player.coins += 30;
      this.discoverWeapon(WEAPON_FINDS.forest);
      this.snapshot.hint = `Found and equipped ${WEAPON_FINDS.forest.name}, plus 30 coins.`;
      this.addLog(`A hidden cache held ${WEAPON_FINDS.forest.name}.`);
    } else if (id === 'key-chest') {
      if (!this.puzzleSolved) {
        this.snapshot.hint = 'The coffer is sealed by the three runes.';
        return;
      }
      if (this.keyChestOpened) {
        this.snapshot.hint = 'The brass-key coffer is empty.';
        return;
      }
      this.keyChestOpened = true;
      this.snapshot.keyFound = true;
      this.addItem({
        id: 'brass-key',
        name: 'Brass key',
        kind: 'key',
        description: 'A warm brass key. It fits the Ember Gate.',
        equipped: false,
        quantity: 1,
      });
      this.discoverWeapon(WEAPON_FINDS.ruins);
      this.snapshot.hint = `Found the brass key and equipped ${WEAPON_FINDS.ruins.name}. The northern gate can now open.`;
      this.snapshot.quest = {
        title: 'The bells below',
        description: 'A warm light stirs beyond the old gate.',
        step: 'Enter the Ember Sanctum',
      };
      this.addLog(`The sealed coffer held a brass key and ${WEAPON_FINDS.ruins.name}.`);
    } else if (id === 'northwood-root-cache') {
      if (!this.worldProgress.destroyedObstacles.includes('northwood-root-door')) {
        this.snapshot.hint = 'The Oldroot cache is sealed behind the living roots.';
        return;
      }
      if (this.collectedIds.has(id)) {
        this.snapshot.hint = 'The Oldroot cache has already been claimed.';
        return;
      }
      this.collectedIds.add(id);
      player.coins += 45;
      this.addItem({
        id: 'oldroot-token',
        name: 'Oldroot token',
        kind: 'relic',
        description: 'A polished seed-heart left in the hidden grove. Its warmth remembers the old forest.',
        equipped: false,
      });
      this.snapshot.hint = 'Found the Oldroot token and 45 coins in the hidden cache.';
      this.addLog('The Oldroot cache held a seed-heart token and 45 coins.');
    } else if (id === 'riverbank-briar-cache') {
      if (!this.worldProgress.destroyedObstacles.includes('riverbank-briar-seal')) {
        this.snapshot.hint = 'The Riverheart cache is sealed behind the thornbound roots.';
        return;
      }
      if (this.collectedIds.has(id)) {
        this.snapshot.hint = 'The Riverheart cache has already been claimed.';
        return;
      }
      this.collectedIds.add(id);
      player.coins += 55;
      this.addItem({
        id: 'riverheart-charm',
        name: 'Riverheart charm',
        kind: 'relic',
        description: 'A smooth green stone bound in a thorn loop. It hums softly beside the river.',
        equipped: false,
      });
      this.snapshot.hint = 'Found the Riverheart charm and 55 coins in the hidden cache.';
      this.addLog('The Riverheart cache held a thorn-bound charm and 55 coins.');
    } else if (id === 'sanctum-coffer' && !this.collectedIds.has('cinderheart')) {
      this.collectedIds.add(id);
      this.discoverWeapon(WEAPON_FINDS.sanctum);
      this.addItem({
        id: 'cinderheart',
        name: 'Cinderheart',
        kind: 'relic',
        description: 'A living emberstone. Rowan will know what it means.',
        equipped: false,
      });
      player.coins += 60;
      this.snapshot.hint = `The Emberheart and ${WEAPON_FINDS.sanctum.name} are yours. Hearthglen awaits.`;
      this.snapshot.quest = {
        title: 'The bells below',
        description: 'Return Cinderheart to Elder Rowan.',
        step: 'Return to Hearthglen',
      };
      this.addLog(`Recovered the Cinderheart, ${WEAPON_FINDS.sanctum.name}, and 60 coins.`);
    }
    if (player.coins > coinsBefore || this.collectedIds.size > collectedBefore ||
        this.snapshot.inventory.length > itemCountBefore) {
      this.markFoundTreasureCell();
    }
  }

  private discoverWeapon(
    weapon: Pick<Item, 'id' | 'name' | 'description' | 'bonusAttack' | 'combatEffect'>,
  ): void {
    const player = this.snapshot.player;
    if (!player) return;

    const weaponItem = this.snapshot.inventory.find((item) => item.id === weapon.id);
    this.snapshot.inventory.forEach((item) => {
      if (item.kind === 'weapon') item.equipped = item.id === weapon.id;
    });
    if (weaponItem) {
      Object.assign(weaponItem, weapon, { equipped: true, kind: 'weapon' as const });
    } else {
      this.addItem({ ...weapon, kind: 'weapon', equipped: true });
    }
    player.weapon = weapon.name;
    this.recalculateEquipment();
  }

  private addItem(item: Item): void {
    const existing = this.snapshot.inventory.find((entry) => entry.id === item.id);
    if (isQuestItem(item)) {
      if (!existing) this.snapshot.inventory.push({ ...item, quantity: undefined });
      return;
    }
    if (existing && item.quantity) {
      existing.quantity = (existing.quantity ?? 0) + item.quantity;
      return;
    }
    this.snapshot.inventory.push(item);
  }

  private basicAttack(): void {
    const player = this.snapshot.player;
    if (!player) return;
    const classData = CLASSES[player.classId];
    const weaponEffect = this.equippedWeaponCombatEffect();
    const damage = Math.round(
      (classData.attackDamage + this.equipmentAttackBonus() + (this.empoweredMs > 0 ? 10 : 0)) *
      getHeroTrainingBonuses(this.snapshot.trainedPowers).damageMultiplier,
    );
    const [fx, fy] = this.aimVector();
    this.attackAnimationMs = player.classId === 'rogue' ? 145 : 210;
    this.attackAnimationDirection = { x: fx, y: fy };
    const ranged = player.classId === 'mage' || weaponEffect === 'ember-bolt';
    this.sound(ranged ? 'spell' : 'strike');
    const treeGate = this.getProps()
      .filter((prop) => prop.kind === 'treeGate' && !prop.activated)
      .map((prop) => ({ prop, dist: distance(player.x, player.y, prop.x, prop.y) }))
      .filter(({ prop, dist }) =>
        dist < (ranged ? 104 : 76) && this.isInFront(prop.x, prop.y, 24))
      .sort((a, b) => a.dist - b.dist)[0]?.prop;
    if (treeGate) {
      if (
        treeGate.requiredWeaponId &&
        !this.snapshot.inventory.some((item) =>
          item.kind === 'weapon' && item.equipped && item.id === treeGate.requiredWeaponId)
      ) {
        this.snapshot.hint = treeGate.guideClue
          ?? `${treeGate.label} parts only for ${treeGate.requiredWeaponName ?? 'its required weapon'}.`;
        this.addEffect(treeGate.x, treeGate.y, 0x9bd45e, 28);
        return;
      }
      this.damageTreeGate(treeGate, damage);
      this.empoweredMs = Math.max(0, this.empoweredMs - 3500);
      return;
    }
    if (ranged) {
      const emberStaff = weaponEffect === 'ember-bolt';
      const [aimFx, aimFy] = this.aimVectorWithAssist(420, fx, fy);
      this.spawnProjectile(
        player.x + aimFx * 18,
        player.y + aimFy * 18,
        aimFx * 250,
        aimFy * 250,
        damage,
        emberStaff ? 0xff6a32 : 0xffb655,
        emberStaff ? 9 : 6,
        1700,
        emberStaff ? 24 : 12,
        emberStaff ? 'ember-burn' : undefined,
      );
      if (emberStaff) this.setCombatFeedback('Cinderwake staff launches a scorching ember bolt.');
      this.empoweredMs = Math.max(0, this.empoweredMs - 3500);
      this.poisonCharges = Math.max(0, this.poisonCharges - 1);
      return;
    }
    const attackReach = weaponEffect === 'long-reach'
      ? 112
      : player.classId === 'rogue' ? 50 : 58;
    let target = this.enemies
      .map((enemy) => ({ enemy, dist: distance(player.x, player.y, enemy.x, enemy.y) }))
      .filter(({ enemy, dist }) => dist < attackReach && this.isEnemyInAimArc(enemy, fx, fy))
      .sort((a, b) => a.dist - b.dist)[0]?.enemy;
    if (!target) {
      target = this.enemies
        .map((enemy) => ({ enemy, dist: distance(player.x + fx * 18, player.y + fy * 18, enemy.x, enemy.y) }))
        .filter((entry) => entry.dist < 42)
        .sort((a, b) => a.dist - b.dist)[0]?.enemy;
    }
    if (target) {
      const bonus = player.classId === 'rogue' && Math.random() < 0.2 ? 1.8 : 1;
      const poison = this.poisonCharges > 0 ? this.poisonDamageBonus : 0;
      const staggerMs = weaponEffect === 'heavy-stagger' ? 1050 : 180;
      this.damageEnemy(target, Math.round(damage * bonus) + poison, { stunMs: staggerMs });
      if (this.enemies.includes(target) && weaponEffect === 'thorn-bleed') {
        this.applyDamageOverTime(target, 'thorn-bleed', 3, 2400, 600);
      }
      this.poisonCharges = Math.max(0, this.poisonCharges - 1);
      this.empoweredMs = Math.max(0, this.empoweredMs - 3500);
      this.playerInvulnerableMs = Math.max(this.playerInvulnerableMs, 160);
      const hitTint = weaponEffect === 'heavy-stagger' ? 0xffc45c
        : weaponEffect === 'thorn-bleed' ? 0x9bd45e
          : weaponEffect === 'long-reach' ? 0x8fdaf5
            : player.classId === 'rogue' ? 0xffe18b : 0xfff0c4;
      this.addEffect(target.x, target.y, hitTint, weaponEffect === 'long-reach' ? 38 : 28);
      if (weaponEffect === 'heavy-stagger' && target.hp > 0) {
        this.setCombatFeedback(`Hearthguard mace staggers ${target.name} with a heavy blow.`);
      } else if (weaponEffect === 'thorn-bleed' && target.hp > 0) {
        this.setCombatFeedback(`Briar-edge thorns leave ${target.name} bleeding.`);
      } else if (weaponEffect === 'long-reach') {
        this.setCombatFeedback(`Starfall spear strikes ${target.name} from extended range.`);
      }
    } else {
      this.addEffect(player.x + fx * 28, player.y + fy * 28, 0xffe4a3);
    }
  }

  private damageTreeGate(prop: WorldProp, damage: number): void {
    if (prop.kind !== 'treeGate' || prop.activated) return;
    if (prop.id === 'drainhouse-willow') {
      const progress = this.worldProgress.dungeons[DRAINHOUSE_ID] ??= initialDungeonProgress();
      progress.entranceOpen = true;
      progress.valves = [...new Set([...progress.valves, 'willow-drained-pool'])];
      this.addEffect(prop.x, prop.y, 0x9cdbce, 38);
      this.snapshot.hint = 'The willow roots tear through the old sluice. Water drains from the pool, revealing a stair.';
      this.addLog('Cut the flood-root willow; the drowned entrance emerged from the drained pool.');
      return;
    }
    const lair = REGIONAL_MINI_LAIRS.find((entry) =>
      prop.id === `${entry.id}/tree` || prop.id.startsWith(`${entry.id}/tree-`));
    if (lair && (lair.entrancePuzzle === 'tree' || lair.entrancePuzzle === 'tree-sequence')) {
      const progress = this.worldProgress.dungeons[lair.id] ??= initialDungeonProgress();
      this.addEffect(prop.x, prop.y, 0xc8d69c, 32);
      if (lair.entrancePuzzle === 'tree') {
        progress.entranceOpen = true;
        this.snapshot.hint = `The hollow trunk splits. A concealed stair into ${lair.label} is revealed.`;
        this.addLog(`Opened the hidden tree entrance to ${lair.label}.`);
        return;
      }
      const index = Number(prop.id.slice(`${lair.id}/tree-`.length));
      const sequence = progress.valves.filter((value) => value.startsWith('entry-tree-'));
      if (index === sequence.length) {
        progress.valves.push(`entry-tree-${index}`);
      } else {
        progress.valves = progress.valves.filter((value) => !value.startsWith('entry-tree-'));
        if (index === 0) progress.valves.push('entry-tree-0');
        this.snapshot.hint = index === 0
          ? 'The carving resets. Amber is first; continue with Split, then Root.'
          : 'The trunks shudder back into place. Read the carving and restart the sequence.';
        return;
      }
      progress.entranceOpen = sequence.length >= 2;
      this.snapshot.hint = progress.entranceOpen
        ? `The three marked trees fall in order. A hidden passage into ${lair.label} opens.`
        : `The marked tree answers. ${3 - sequence.length - 1} correct strike(s) remain in the sequence.`;
      if (progress.entranceOpen) this.addLog(`Opened the ordered tree passage to ${lair.label}.`);
      return;
    }
    const requiredHits = vegetationHitLimit(prop.hitsRequired);
    const hits = Math.min(requiredHits, (this.worldProgress.obstacleHits[prop.id] ?? 0) + 1);
    const requiredDamage = prop.damageRequired;
    const totalDamage = requiredDamage
      ? Math.min(requiredDamage, (this.worldProgress.obstacleDamage[prop.id] ?? 0) + Math.max(1, Math.round(damage)))
      : 0;
    this.addEffect(prop.x, prop.y, 0xc8d69c, 32);
    if (hits >= requiredHits || (requiredDamage !== undefined && totalDamage >= requiredDamage)) {
      this.worldProgress.destroyedObstacles = Array.from(new Set([
        ...this.worldProgress.destroyedObstacles,
        prop.id,
        ...(prop.id === 'hunger-secret-tree' ? ['hunger-secret-unbound-edge'] : []),
        ...(prop.id === 'glasslands-prism-tree' ? ['glasslands-secret-gleamthorn-spear'] : []),
      ]));
      delete this.worldProgress.obstacleDamage[prop.id];
      delete this.worldProgress.obstacleHits[prop.id];
      this.snapshot.hint = prop.id === 'marsh-silt-tree'
        ? 'The silt pool drains away from the willow. A coffer is exposed in the mud.'
        : `${prop.label} gives way. A hidden entrance and cache are revealed.`;
      this.addLog(`Broke the ${prop.label} in ${hits} hits and found a hidden cache.`);
      return;
    }
    this.worldProgress.obstacleHits[prop.id] = hits;
    if (requiredDamage !== undefined) this.worldProgress.obstacleDamage[prop.id] = totalDamage;
    this.snapshot.hint = `${prop.label}: ${hits}/${requiredHits} hits. Keep striking.`;
  }

  private activateAbility(index: number): void {
    const player = this.snapshot.player;
    const slot = this.snapshot.abilities[index];
    if (!player || !slot) return;
    if (slot.remainingMs > 0) {
      this.snapshot.hint = `${slot.name} recharges in ${(slot.remainingMs / 1000).toFixed(1)}s.`;
      return;
    }
    const isFreeRestore = slot.id === 'inner-focus';
    if (!isFreeRestore && player.resource < slot.cost) {
      this.snapshot.hint = `Not enough ${player.resourceName.toLowerCase()}.`;
      return;
    }
    if (!isFreeRestore) player.resource = Math.max(0, player.resource - slot.cost);
    slot.remainingMs = slot.cooldownMs;
    this.sound('spell');
    const damage = this.powerDamage(slot);
    const [fx, fy] = this.aimVector();
    const target = this.nearestEnemyInAimArc(160, fx, fy);
    const hitInFront = this.enemies.filter((enemy) =>
      distance(player.x, player.y, enemy.x, enemy.y) < 94 && this.isEnemyInAimArc(enemy, fx, fy));
    const nearby = this.enemies.filter((enemy) => distance(player.x, player.y, enemy.x, enemy.y) < 88);

    switch (slot.id) {
      case 'shield-bash':
        hitInFront.forEach((enemy) => {
          this.damageEnemy(enemy, damage);
          enemy.stunnedMs = 1350;
        });
        this.addEffect(player.x + fx * 34, player.y + fy * 34, 0xe8cf9a, 36);
        break;
      case 'whirlwind':
        nearby.forEach((enemy) => this.damageEnemy(enemy, damage));
        this.addEffect(player.x, player.y, 0xf6e3a6, 68);
        break;
      case 'battle-cry':
        this.battleCryMs = 6000;
        this.addEffect(player.x, player.y, 0xe8aa58, 66);
        break;
      case 'heroic-leap':
        if (target) {
          const dx = target.x - player.x;
          const dy = target.y - player.y;
          const length = Math.hypot(dx, dy) || 1;
          const landingDistance = Math.min(126, Math.max(0, length - target.radius - 12));
          this.movePlayer((dx / length) * landingDistance, (dy / length) * landingDistance);
        } else {
          this.movePlayer(fx * 126, fy * 126);
        }
        this.enemies
          .filter((enemy) => distance(player.x, player.y, enemy.x, enemy.y) < 82)
          .forEach((enemy) => this.damageEnemy(enemy, damage));
        this.addEffect(player.x, player.y, 0xf3bb64, 64);
        break;
      case 'dash-strike':
        if (target) {
          const vx = target.x - player.x;
          const vy = target.y - player.y;
          const d = Math.hypot(vx, vy) || 1;
          this.movePlayer((vx / d) * Math.min(92, d), (vy / d) * Math.min(92, d));
          this.damageEnemy(target, damage);
        } else {
          this.movePlayer(fx * 92, fy * 92);
        }
        this.addEffect(player.x, player.y, 0xffdc8c, 34);
        break;
      case 'smoke-bomb':
        this.invisibilityMs = 2400;
        nearby.forEach((enemy) => { enemy.stunnedMs = 1750; });
        this.addEffect(player.x, player.y, 0xcbb9e8, 74);
        break;
      case 'poison-blade':
        this.poisonCharges = 5;
        this.empoweredMs = 7500;
        this.addEffect(player.x, player.y, 0x82d476, 52);
        break;
      case 'shadow-step': {
        const awayX = target ? Math.sign(player.x - target.x) : -fx;
        const awayY = target ? Math.sign(player.y - target.y) : -fy;
        this.movePlayer(awayX * 74 || -fx * 74, awayY * 74 || -fy * 74);
        this.empoweredMs = 6000;
        this.playerInvulnerableMs = 550;
        this.addEffect(player.x, player.y, 0xa998dc, 54);
        break;
      }
      case 'spirit-palm':
        hitInFront.forEach((enemy) => this.damageEnemy(enemy, damage));
        this.addEffect(player.x + fx * 42, player.y + fy * 42, 0x8ae0d2, 40);
        break;
      case 'inner-focus':
        player.resource = Math.min(player.maxResource, player.resource + 38);
        this.empoweredMs = 6000;
        this.addEffect(player.x, player.y, 0x8ae0d2, 48);
        break;
      case 'healing-pulse': {
        const healed = Math.min(player.maxHp - player.hp, damage);
        player.hp += healed;
        this.addEffect(player.x, player.y, 0x94df9c, 58);
        this.snapshot.hint = healed ? `Healing Pulse restored ${healed} health.` : 'You are already at full health.';
        break;
      }
      case 'spirit-wave':
        {
          const [aimFx, aimFy] = this.aimVectorWithAssist(326, fx, fy);
          this.spawnProjectile(player.x + aimFx * 18, player.y + aimFy * 18,
            aimFx * 208, aimFy * 208, damage, 0x85e3d3, 14, 1450, 24);
        }
        break;
      case 'fireball':
        {
          const [aimFx, aimFy] = this.aimVectorWithAssist(430, fx, fy);
          this.spawnProjectile(player.x + aimFx * 16, player.y + aimFy * 16,
            aimFx * 230, aimFy * 230, damage, 0xff783e, 9, 1650, 50);
        }
        break;
      case 'frost-nova':
        nearby.forEach((enemy) => {
          this.damageEnemy(enemy, damage);
          enemy.slowedMs = 3200;
        });
        this.addEffect(player.x, player.y, 0x9ad9f2, 84);
        break;
      case 'blink':
        this.playerInvulnerableMs = 520;
        this.movePlayer(fx * 105, fy * 105);
        this.addEffect(player.x, player.y, 0x8fd6eb, 40);
        break;
      case 'arcane-shield':
        this.arcaneShieldMs = 5200;
        this.playerInvulnerableMs = 420;
        this.addEffect(player.x, player.y, 0x9d9cec, 58);
        break;
      default:
        this.activateGenericPower(slot, player, fx, fy, target, hitInFront, nearby);
        break;
    }
    this.snapshot.hint = `${slot.name}!`;
  }

  private powerDamage(slot: AbilitySlot): number {
    const player = this.snapshot.player;
    return Math.round(
      getRankedPowerAmount(slot, slot.rank, player?.level ?? 1, player?.classId) *
      getHeroTrainingBonuses(this.snapshot.trainedPowers).damageMultiplier,
    );
  }

  private activateGenericPower(
    slot: AbilitySlot,
    player: NonNullable<GameSnapshot['player']>,
    fx: number,
    fy: number,
    target: EnemyActor | undefined,
    hitInFront: EnemyActor[],
    nearby: EnemyActor[],
  ): void {
    const damage = this.powerDamage(slot);
    const radius = slot.radius ?? 88;
    const inRadius = this.enemies.filter((enemy) =>
      distance(player.x, player.y, enemy.x, enemy.y) < radius);
    const duration = slot.durationMs ?? 3000;
    switch (slot.effect) {
      case 'front':
        hitInFront
          .filter((enemy) => distance(player.x, player.y, enemy.x, enemy.y) < radius)
          .forEach((enemy) => this.damageEnemy(enemy, damage, { stunMs: slot.stunMs }));
        this.addEffect(player.x + fx * 34, player.y + fy * 34, slot.tint ?? 0xe7c88f, Math.max(28, radius * 0.4));
        break;
      case 'area':
        inRadius.forEach((enemy) => this.damageEnemy(enemy, damage, { stunMs: slot.stunMs }));
        this.addEffect(player.x, player.y, slot.tint ?? 0xe8c47c, radius);
        break;
      case 'projectile':
        {
          const speed = slot.projectileSpeed ?? 240;
          const lifeMs = 1700;
          const [aimFx, aimFy] = this.aimVectorWithAssist(speed * lifeMs / 1000 + (slot.areaOfEffect ?? 20), fx, fy);
        this.spawnProjectile(
          player.x + aimFx * 18,
          player.y + aimFy * 18,
          aimFx * speed,
          aimFy * speed,
          damage,
          slot.tint ?? 0xffa553,
          slot.projectileRadius ?? 10,
          1700,
          slot.areaOfEffect ?? 20,
          undefined,
          slot.slowMs,
        );
        }
        break;
      case 'heal': {
        const healed = Math.min(player.maxHp - player.hp, damage);
        player.hp += healed;
        if (slot.resourceRestore) {
          player.resource = Math.min(player.maxResource, player.resource + slot.resourceRestore);
        }
        if (slot.guardStyle === 'ward') this.arcaneShieldMs = Math.max(this.arcaneShieldMs, duration);
        this.addEffect(player.x, player.y, slot.tint ?? 0x95d89b, radius);
        break;
      }
      case 'guard':
        if (slot.guardStyle === 'brace') this.battleCryMs = duration;
        else this.arcaneShieldMs = duration;
        player.resource = Math.min(player.maxResource, player.resource + (slot.resourceRestore ?? 0));
        this.addEffect(player.x, player.y, slot.tint ?? 0x9eacd3, radius);
        break;
      case 'empower':
        if (slot.movement) this.movePlayer(fx * slot.movement, fy * slot.movement);
        this.empoweredMs = duration;
        player.resource = Math.min(player.maxResource, player.resource + (slot.resourceRestore ?? 0));
        this.addEffect(player.x, player.y, slot.tint ?? 0xe8c87c, radius);
        break;
      case 'dash-strike':
        if (target) {
          const dx = target.x - player.x;
          const dy = target.y - player.y;
          const length = Math.hypot(dx, dy) || 1;
          this.movePlayer((dx / length) * Math.min(slot.movement ?? 92, length), (dy / length) * Math.min(slot.movement ?? 92, length));
          this.damageEnemy(target, damage, { stunMs: slot.stunMs });
        } else {
          this.movePlayer(fx * (slot.movement ?? 92), fy * (slot.movement ?? 92));
        }
        this.addEffect(player.x, player.y, slot.tint ?? 0xf2bb68, radius * 0.45);
        break;
      case 'dash':
        this.movePlayer(fx * (slot.movement ?? 105), fy * (slot.movement ?? 105));
        this.playerInvulnerableMs = Math.max(this.playerInvulnerableMs, Math.min(duration, 650));
        if (damage > 0) {
          this.enemies
            .filter((enemy) => distance(player.x, player.y, enemy.x, enemy.y) < radius)
            .forEach((enemy) => this.damageEnemy(enemy, damage));
        }
        this.addEffect(player.x, player.y, slot.tint ?? 0x9bd8e2, radius * 0.45);
        break;
      case 'control':
        nearby
          .filter((enemy) => distance(player.x, player.y, enemy.x, enemy.y) < radius)
          .forEach((enemy) => {
            if (damage > 0) this.damageEnemy(enemy, damage, { stunMs: slot.stunMs });
            enemy.stunnedMs = Math.max(enemy.stunnedMs, slot.stunMs ?? 1500);
          });
        this.addEffect(player.x, player.y, slot.tint ?? 0xd8c69d, radius);
        break;
      case 'slow':
        nearby
          .filter((enemy) => distance(player.x, player.y, enemy.x, enemy.y) < radius)
          .forEach((enemy) => {
            if (damage > 0) this.damageEnemy(enemy, damage, { stunMs: 0 });
            enemy.slowedMs = Math.max(enemy.slowedMs, slot.slowMs ?? duration);
          });
        this.addEffect(player.x, player.y, slot.tint ?? 0x9ad9f2, radius);
        break;
      case 'poison':
        this.poisonCharges = Math.max(this.poisonCharges, 5);
        this.poisonDamageBonus = Math.max(1, damage);
        this.empoweredMs = Math.max(this.empoweredMs, duration);
        if (target && damage > 0) this.damageEnemy(target, damage);
        this.addEffect(player.x, player.y, slot.tint ?? 0x82d476, radius * 0.6);
        break;
      case 'restore':
        player.resource = Math.min(player.maxResource, player.resource + damage);
        this.addEffect(player.x, player.y, slot.tint ?? 0x8ae0d2, radius);
        break;
      case 'shadow': {
        this.invisibilityMs = Math.max(this.invisibilityMs, duration);
        this.playerInvulnerableMs = Math.max(this.playerInvulnerableMs, Math.min(duration, 650));
        if (target && damage > 0) this.damageEnemy(target, damage);
        if (target) {
          const dx = player.x - target.x;
          const dy = player.y - target.y;
          const length = Math.hypot(dx, dy) || 1;
          this.movePlayer((dx / length) * (slot.movement ?? 74), (dy / length) * (slot.movement ?? 74));
        } else {
          this.movePlayer(-fx * (slot.movement ?? 74), -fy * (slot.movement ?? 74));
        }
        this.empoweredMs = Math.max(this.empoweredMs, Math.min(duration, 6000));
        this.addEffect(player.x, player.y, slot.tint ?? 0xa998dc, radius * 0.6);
        break;
      }
    }
  }

  private dodge(): void {
    const [fx, fy] = this.aimVector();
    this.movePlayer(fx * 76, fy * 76);
    this.playerInvulnerableMs = 480;
    this.addEffect(this.snapshot.player?.x ?? 0, this.snapshot.player?.y ?? 0, 0xd7c6a7, 32);
    this.snapshot.hint = 'A quick evasive step.';
  }

  private facingVector(): [number, number] {
    const facing = this.snapshot.player?.facing;
    if (facing === 'left') return [-1, 0];
    if (facing === 'right') return [1, 0];
    if (facing === 'up') return [0, -1];
    return [0, 1];
  }

  private aimVector(): [number, number] {
    const length = Math.hypot(this.aimDirection.x, this.aimDirection.y);
    if (length < 0.0001) return this.facingVector();
    return [this.aimDirection.x / length, this.aimDirection.y / length];
  }

  private isEnemyInAimArc(enemy: EnemyActor, fx: number, fy: number): boolean {
    const player = this.snapshot.player;
    if (!player) return false;
    const dx = enemy.x - player.x;
    const dy = enemy.y - player.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.001) return true;
    const facingDot = (dx * fx + dy * fy) / dist;
    if (facingDot <= 0) return false;
    const angle = Math.acos(Math.max(-1, Math.min(1, facingDot)));
    const radiusAllowance = Math.asin(Math.min(1, enemy.radius / dist));
    return angle <= AIM_ASSIST_HALF_ANGLE + radiusAllowance;
  }

  private aimVectorWithAssist(range: number, fx: number, fy: number): [number, number] {
    const player = this.snapshot.player;
    if (!player) return [fx, fy];
    const target = this.nearestEnemyInAimArc(range, fx, fy);
    if (!target) return [fx, fy];
    const dx = target.x - player.x;
    const dy = target.y - player.y;
    const length = Math.hypot(dx, dy) || 1;
    return [dx / length, dy / length];
  }

  private nearestEnemyInAimArc(range: number, fx: number, fy: number): EnemyActor | undefined {
    const player = this.snapshot.player;
    if (!player) return undefined;
    return this.enemies
      .map((enemy) => ({
        enemy,
        dist: distance(player.x, player.y, enemy.x, enemy.y),
        angle: Math.acos(Math.max(-1, Math.min(1,
          ((enemy.x - player.x) * fx + (enemy.y - player.y) * fy) /
          Math.max(0.001, distance(player.x, player.y, enemy.x, enemy.y))))),
      }))
      .filter(({ enemy, dist, angle }) =>
        dist <= range + enemy.radius &&
        angle <= AIM_ASSIST_HALF_ANGLE + Math.asin(Math.min(1, enemy.radius / Math.max(1, dist))))
      .sort((a, b) => a.angle - b.angle || a.dist - b.dist)[0]?.enemy;
  }

  private rememberAimDirection(x: number, y: number): void {
    const length = Math.hypot(x, y);
    if (length < 0.12) return;
    this.aimDirection = { x: x / length, y: y / length };
  }

  private isInFront(x: number, y: number, slack: number): boolean {
    const player = this.snapshot.player;
    if (!player) return false;
    const [fx, fy] = this.aimVector();
    const dx = x - player.x;
    const dy = y - player.y;
    return dx * fx + dy * fy >= -slack && Math.abs(dx * fy - dy * fx) < 62 + slack;
  }

  private nearestEnemy(): EnemyActor | undefined {
    const player = this.snapshot.player;
    if (!player) return undefined;
    return this.enemies
      .map((enemy) => ({ enemy, dist: distance(player.x, player.y, enemy.x, enemy.y) }))
      .filter(({ dist }) => dist < 160)
      .sort((a, b) => a.dist - b.dist)[0]?.enemy;
  }

  private damageEnemy(
    enemy: EnemyActor,
    amount: number,
    options: { stunMs?: number; knockback?: boolean } = {},
  ): void {
    if (!this.enemies.includes(enemy)) return;
    enemy.hp = Math.max(0, enemy.hp - amount);
    if (amount > 0) this.sound('hit');
    if (enemy.id === 'first-hunger-sanctum:maelis' &&
        this.worldProgress.finale.stage === 'duel' && enemy.hp <= enemy.maxHp * 0.25) {
      enemy.hp = enemy.maxHp * 0.25;
      this.worldProgress.finale.stage = 'choice';
      this.maelisAlly = null;
      this.enemies = this.enemies.filter((actor) => actor !== enemy);
      this.projectiles = [];
      this.releaseAllDirections();
      this.snapshot.dialogSpeaker = 'Maelis';
      this.snapshot.dialog = MAELIS_OFFER;
      this.snapshot.hint = 'Choose whether to face the Hunger with Maelis or alone.';
      this.refreshEnemyHud();
      return;
    }
    const hunger = enemy.id === 'first-hunger-sanctum:first-hunger';
    enemy.stunnedMs = hunger ? 0 : Math.max(enemy.stunnedMs, options.stunMs ?? 180);
    const player = this.snapshot.player;
    if (player && !hunger && options.knockback !== false) {
      const dx = enemy.x - player.x;
      const dy = enemy.y - player.y;
      const length = Math.hypot(dx, dy) || 1;
      const force = enemy.boss ? 24 : 74;
      enemy.knockbackX = (dx / length) * force;
      enemy.knockbackY = (dy / length) * force;
    }
    if (enemy.hp <= 0) this.defeatEnemy(enemy);
  }

  private defeatEnemy(enemy: EnemyActor): void {
    this.sound(enemy.boss ? 'victory' : 'defeat');
    if (this.worldProgress.activeDungeon) {
      this.enemies = this.enemies.filter((e) => e !== enemy);
      if (enemy.boss) {
        this.dungeonProgress().bossDefeated = true;
        const dungeon = dungeonById(this.worldProgress.activeDungeon.id)!;
        if (dungeon.role === 'main') {
          this.completeMainDungeonBoss(dungeon.storyBoss!);
          this.snapshot.player!.xp += dungeon.storyBoss === 'first-hunger' ? 1400 : 220;
          this.snapshot.player!.coins += dungeon.storyBoss === 'first-hunger' ? 150 : 70;
        } else {
          this.worldProgress.completedDungeons = [...new Set([
            ...this.worldProgress.completedDungeons, this.worldProgress.activeDungeon.id,
          ])];
          const keyId = dungeon.keyId ?? DRAINHOUSE_KEY;
          const keyDescriptions: Partial<Record<WorldRegionId, string>> = {
            hearthglen: 'One of three keys needed to open the Ember Sanctum.',
            'drowned-marches': 'One of three keys needed to open the Sunken Chapel’s Bell Tower of Tides.',
            'ashen-peaks': 'One of three keys needed to open the Crucible Bastion.',
            glasslands: 'One of three keys needed to open the Palace of Glass.',
            'fallen-capital': 'One of three keys needed to open the First Bell Citadel.',
            'first-hunger': 'The First Echo’s key. It opens the final battle after you rest at the spring.',
          };
          if (!this.snapshot.inventory.some((item) => item.id === keyId)) this.addItem({
            id: keyId, name: `${dungeon.bossName ?? 'Keeper'}’s key`, kind: 'key', equipped: false,
            description: keyDescriptions[dungeon.regionId ?? 'drowned-marches'] ?? 'A key from a regional lair.',
          });
          const mainSite = MAIN_BOSS_SITES.find((site) => site.regionId === dungeon.regionId);
          if (mainSite) {
            const allKeysCollected = mainSite.requiredKeys.every((key) =>
              this.snapshot.inventory.some((item) => item.id === key));
            this.snapshot.quest = mainSite.regionId === 'first-hunger'
              ? {
                title: 'The Final Threshold',
                description: 'The First Echo’s key opens the way. Rest at the Vigil Spring, then enter the final battle.',
                step: 'Rest at the Vigil Spring, then enter the final battle',
              }
              : allKeysCollected
              ? {
                title: mainSite.label,
                description: `All three lair keys are yours. Enter ${mainSite.label} to face ${mainSite.bossName}.`,
                step: `Enter ${mainSite.label}`,
              }
              : {
                title: `The Three Keepers of ${mainSite.label}`,
                description: `Find the remaining lairs in this realm. Each keeper guards one key to ${mainSite.label}.`,
                step: 'Defeat the three lair keepers',
              };
          }
          this.snapshot.player!.xp += dungeon.regionId === 'first-hunger' ? 1400 : 150;
          this.snapshot.player!.coins += dungeon.regionId === 'first-hunger' ? 150 : 45;
          const allKeysCollected = mainSite?.requiredKeys.every((key) =>
            this.snapshot.inventory.some((item) => item.id === key));
          this.snapshot.hint = dungeon.regionId === 'first-hunger'
            ? 'The First Echo falls. The path to the Vigil Spring and final threshold is open.'
            : allKeysCollected
            ? `${dungeon.bossName ?? 'Lair keeper'} defeated. All three keys answer the ${mainSite!.label}; return through the opened door.`
            : `${dungeon.bossName ?? 'Lair keeper'} defeated. The key is yours; return through the opened door.`;
          this.addLog(this.snapshot.hint);
        }
      } else {
        this.snapshot.player!.xp += 26;
        this.snapshot.player!.coins += 7;
        if (this.worldProgress.postgame.started) {
          const visit = this.worldProgress.activeDungeon;
          this.respawns.set(enemy.id, {
            remainingMs: POSTGAME_WAVE_DELAY_MS, generation: enemy.generation + 1,
            cell: `${visit.id}/${visit.roomId}`,
            dungeonId: visit.id, roomId: visit.roomId,
          });
        }
      }
      this.storeDungeonRoom();
      const visit = this.worldProgress.activeDungeon;
      if (!enemy.boss) {
        this.recordPostgameClear(`${visit.id}/${visit.roomId}`, this.enemies.some((actor) => actor.hp > 0));
      }
      this.checkLevelUp();
      this.refreshEnemyHud();
      return;
    }
    this.enemies = this.enemies.filter((actor) => actor.id !== enemy.id);
    this.defeatedIds.add(enemy.id);
    const cell = this.findEnemyTemplate(enemy.id)?.cell;
    if (!enemy.boss) {
      this.respawns.set(enemy.id, {
        remainingMs: this.worldProgress.postgame.started ? POSTGAME_WAVE_DELAY_MS : ENEMY_RESPAWN_DELAY_MS,
        generation: enemy.generation + 1,
        ...(cell ? { cell: cell.id } : {}),
      });
    }
    if (cell && !enemy.boss) this.recordPostgameClear(cell.id,
      this.enemies.some((actor) => actor.hp > 0 && this.findEnemyTemplate(actor.id)?.cell.id === cell.id));
    const player = this.snapshot.player;
    if (!player) return;
    if (enemy.id === 'first-hunger-sanctum:maelis' &&
        this.worldProgress.finale.stage === 'solo-duel') {
      const xp = maelisSoloXpReward(player.level);
      player.xp += xp;
      this.worldProgress.finale.stage = 'battle';
      this.worldProgress.finale.allied = false;
      this.maelisAlly = null;
      this.enemies = this.createWorldEnemies(this.enemies);
      this.snapshot.quest = {
        title: 'The First Hunger',
        description: 'Break the creature’s hold on humanity.',
        step: 'Defeat The First Hunger',
      };
      this.snapshot.hint = 'Maelis is defeated. The First Echo’s lair is open; claim its key, rest at the Vigil Spring, then enter the final threshold.';
      this.snapshot.dialogSpeaker = 'Maelis';
      this.snapshot.dialog = `“I still believe the world can be free.” Maelis falls. You gain ${xp.toLocaleString()} XP; the First Echo’s lair is open.`;
      this.addLog(`Maelis defeated. +${xp.toLocaleString()} XP.`);
      this.addEffect(enemy.x, enemy.y, enemy.tint, 90);
      this.checkLevelUp();
      this.refreshEnemyHud();
      return;
    }
    const xp = enemy.boss ? 150 : enemy.id.includes('root-guard') ? 46 : 26;
    const coins = enemy.boss ? 45 : enemy.id.includes('root-guard') ? 12 : 7;
    player.coins += coins;
    player.xp += xp;
    this.addLog(`${enemy.name} defeated. +${xp} XP, +${coins} coins.`);
    this.addEffect(enemy.x, enemy.y, enemy.tint, enemy.boss ? 90 : 34);
    if (enemy.boss) {
      if (
        enemy.id === 'first-hunger-sanctum:first-hunger' ||
        enemy.name.toLowerCase().includes('first hunger')
      ) {
        this.worldProgress.finale.stage = 'restoring';
        this.worldProgress.finale.restorationMs = 0;
        this.worldProgress.finale.restorationDurationMs = RESTORATION_DURATION_MS;
        this.snapshot.overlay = null;
        this.projectiles = [];
        this.releaseAllDirections();
        this.snapshot.bossDefeated = true;
        this.snapshot.quest = {
          title: 'The bells below',
          description: 'The First Hunger is defeated. Humanity’s emotions are free; the bells are no longer needed.',
          step: 'Journey complete',
        };
        this.snapshot.dialogSpeaker = 'Emberfall';
        this.snapshot.dialog = RESTORATION_LINES[0];
        this.snapshot.hint = 'The Hunger fractures. Its stolen emotions return to the world.';
        this.addLog('The First Hunger falls. Its stolen colors erupt into the world.');
      } else if (enemy.id === 'sunken-chapel:chapel-bellkeeper') {
        this.worldProgress.silencedBells = Array.from(new Set([
          ...this.worldProgress.silencedBells,
          'drowned-marches',
        ]));
        this.worldProgress.completedDungeons = Array.from(new Set([
          ...this.worldProgress.completedDungeons,
          'sunken-chapel',
        ]));
        this.snapshot.quest = {
          title: 'The Silent Bell',
          description: 'Bring the drowned bell seal back to the ferryman.',
          step: 'Return the drowned bell seal to the ferryman',
        };
        this.snapshot.hint = 'The Drowned Bellkeeper is defeated. Return its seal to the ferryman.';
        this.addLog('The Sunken Chapel falls quiet. Take the drowned bell seal to the ferryman.');
      } else if (enemy.id === 'last-ash-watch:fury-bellkeeper') {
        this.completeAshenBell();
      } else if (enemy.id === 'joy-bell-sanctum:glass-bellkeeper') {
        this.completeRegionalBell('glasslands');
      } else if (enemy.id === 'resolve-bell-sanctum:capital-bellkeeper') {
        this.completeRegionalBell('fallen-capital');
      } else {
        this.snapshot.bossDefeated = true;
        this.snapshot.quest = {
          title: 'The bells below',
          description: 'Take Cinderheart back to Elder Rowan.',
          step: 'Return to Hearthglen',
        };
        this.snapshot.hint = 'Cinderhorn is defeated. Search the sanctum for its heart.';
      }
    }
    this.checkLevelUp();
    this.refreshEnemyHud();
  }

  private completeMainDungeonBoss(region: WorldRegionId): void {
    if (region === 'hearthglen') {
      this.worldProgress.completedDungeons = [...new Set([
        ...this.worldProgress.completedDungeons, 'hearthglen-ember-sanctum',
      ])];
      this.snapshot.bossDefeated = true;
      this.snapshot.quest = {
        title: 'The bells below',
        description: 'Take Cinderheart back to Elder Rowan.',
        step: 'Return to Hearthglen',
      };
      this.snapshot.hint = 'Cinderhorn is defeated. Search the sanctum for its heart.';
      this.addLog('Cinderhorn falls in the Ember Sanctum. The Cinderheart remains in the relic coffer.');
    } else if (region === 'drowned-marches') {
      this.worldProgress.silencedBells = [...new Set([...this.worldProgress.silencedBells, region])];
      this.worldProgress.completedDungeons = [...new Set([
        ...this.worldProgress.completedDungeons, 'sunken-chapel', 'sunken-chapel-boss',
      ])];
      this.snapshot.quest = {
        title: 'The Silent Bell',
        description: 'Bring the drowned bell seal back to the ferryman.',
        step: 'Return the drowned bell seal to the ferryman',
      };
      this.snapshot.hint = 'The Drowned Bellkeeper falls. Return its seal to the ferryman.';
      this.addLog('The Bell Tower of Tides falls quiet. Return its seal to the ferryman.');
    } else if (region === 'ashen-peaks') this.completeAshenBell();
    else if (region === 'glasslands' || region === 'fallen-capital') this.completeRegionalBell(region);
    else if (region === 'first-hunger') {
      this.worldProgress.completedDungeons = [...new Set([
        ...this.worldProgress.completedDungeons, 'first-hunger-maw',
      ])];
      this.worldProgress.finale.stage = 'restoring';
      this.worldProgress.finale.restorationMs = 0;
      this.worldProgress.finale.restorationDurationMs = RESTORATION_DURATION_MS;
      this.snapshot.overlay = null;
      this.projectiles = [];
      this.releaseAllDirections();
      this.snapshot.bossDefeated = true;
      this.snapshot.quest = {
        title: 'The bells below',
        description: 'The First Hunger is defeated. Humanity’s emotions are free; the bells are no longer needed.',
        step: 'Journey complete',
      };
      this.snapshot.dialogSpeaker = 'Emberfall';
      this.snapshot.dialog = RESTORATION_LINES[0];
      this.snapshot.hint = 'The Hunger fractures. Its stolen emotions return to the world.';
      this.addLog('The First Hunger falls. Its stolen colors erupt into the world.');
    }
  }

  private completeAshenBell(): void {
    if (this.worldProgress.completedDungeons.includes('ashen-peaks-bell')) return;
    this.worldProgress.silencedBells = Array.from(new Set([
      ...this.worldProgress.silencedBells,
      'ashen-peaks',
    ]));
    this.worldProgress.completedDungeons = Array.from(new Set([
      ...this.worldProgress.completedDungeons,
      'ashen-peaks-bell',
    ]));
    this.worldProgress.unlockedRegions = Array.from(new Set([
      ...this.worldProgress.unlockedRegions,
      'glasslands',
    ]));
    for (const lair of GLASSLANDS_LAIRS) {
      this.worldProgress.dungeons[lair.id] ??= initialDungeonProgress();
    }
    this.snapshot.dialogSpeaker = 'Last Ash Watch';
    this.snapshot.dialog = 'The Fury Bellkeeper falls. The Bell of Fury rings once, then goes quiet. Far south, a glass road opens toward the Bell of Joy.';
    this.snapshot.quest = {
      title: 'The Last Record',
      description: 'The Glasslands hold the Bell of Joy and the next of Maelis’s records.',
      step: 'Find the Bell of Joy in the Glasslands',
    };
    this.snapshot.hint = 'The Bell of Fury is silent. The glassward road south is open.';
    this.addLog('The Bell of Fury falls silent. The southern road to the Glasslands opens.');
  }

  private completeRegionalBell(region: 'glasslands' | 'fallen-capital'): void {
    const glasslands = region === 'glasslands';
    const dungeonId = glasslands ? 'glasslands-bell' : 'fallen-capital-bell';
    if (this.worldProgress.completedDungeons.includes(dungeonId)) return;

    this.worldProgress.silencedBells = Array.from(new Set([
      ...this.worldProgress.silencedBells,
      region,
    ]));
    this.worldProgress.completedDungeons = Array.from(new Set([
      ...this.worldProgress.completedDungeons,
      dungeonId,
    ]));
    this.snapshot.dialogSpeaker = glasslands ? 'Prism Conservatory' : 'Fallen Archive';
    if (glasslands) {
      this.worldProgress.unlockedRegions = Array.from(new Set([
        ...this.worldProgress.unlockedRegions,
        'fallen-capital',
      ]));
      this.snapshot.dialog = 'The Prism Bellkeeper breaks apart into light. The Bell of Joy rings once, then falls silent. Behind the keeper’s mask, you find Maelis’s record: “The last account is in the capital. If the final bell falls, the First Hunger will wake.”';
      this.snapshot.quest = {
        title: 'The Last Record',
        description: 'The Fallen Capital holds the Bell of Resolve and Maelis’s final record.',
        step: 'Find the Bell of Resolve in the Fallen Capital',
      };
      this.snapshot.hint = 'The road south from the Glasslands now reaches the Fallen Capital.';
      this.addLog('The Bell of Joy falls silent. The road to the Fallen Capital opens.');
    } else {
      this.snapshot.dialog = 'The Oathbound Bellkeeper falls. The Bell of Resolve rings once and goes silent. Maelis’s final record names the First Hunger—and warns that the last silence will free it.';
      const allBellsSilent = BELL_REGION_IDS.every((regionId) =>
        this.worldProgress.silencedBells.includes(regionId));
      this.snapshot.quest = allBellsSilent
        ? {
          title: 'The Last Record',
          description: 'The five bells are silent. Find The First Hunger in its hollow.',
          step: 'Find The First Hunger in the Hollow',
        }
        : !this.worldProgress.silencedBells.includes('ashen-peaks')
          ? {
            title: 'The Last Record',
            description: 'The Bell of Fury still burns at Last Ash Watch. Silence it to free the road to The First Hunger.',
            step: 'Find the Bell of Fury in the Ashen Peaks',
          }
        : {
          title: 'The Last Record',
          description: 'The Bell of Resolve is silent, but another bell still rings.',
          step: 'The Fallen Capital is reclaimed',
        };
      this.snapshot.hint = allBellsSilent
        ? 'The five bells are silent. The First Hunger waits beyond the Hall of the Last Record.'
        : !this.worldProgress.silencedBells.includes('ashen-peaks')
          ? 'The Bell of Fury still rings at Last Ash Watch. Defeat its keeper before seeking The First Hunger.'
        : 'The Bell of Resolve is silent. Another bell must fall quiet before the First Hunger can be reached.';
      this.addLog('The Bell of Resolve falls silent. Maelis’s final record names the First Hunger.');
    }
  }

  private checkLevelUp(): void {
    const player = this.snapshot.player;
    if (!player) return;
    let unlockedHeroTree = false;
    let needed = 70 + (player.level - 1) * 60;
    while (player.xp >= needed) {
      player.xp -= needed;
      player.level += 1;
      player.trainingPoints += 1;
      if (player.level === HERO_TREE_UNLOCK_LEVEL) unlockedHeroTree = true;
      this.snapshot.hint = `Level ${player.level}! You earned 1 training point. Open Power Trees to spend it.`;
      this.addLog(`Reached level ${player.level}. Gained 1 training point.`);
      needed = 70 + (player.level - 1) * 60;
    }
    if (unlockedHeroTree) {
      this.snapshot.hint = `The Hero tree is unlocked! Spend training points on speed, damage, health, or spirit.`;
      this.addLog('Unlocked the Hero tree.');
    }
  }

  private equipmentAttackBonus(): number {
    return this.snapshot.inventory.reduce((sum, item) =>
      sum + (item.equipped ? item.bonusAttack ?? 0 : 0), 0);
  }

  private equippedWeaponCombatEffect(): WeaponCombatEffect | undefined {
    const equippedWeapon = this.snapshot.inventory.find((item) =>
      item.kind === 'weapon' && item.equipped);
    if (!equippedWeapon) return undefined;
    if (equippedWeapon.combatEffect) return equippedWeapon.combatEffect;
    // Saves created before weapon effects were added still identify found weapons by id.
    return Object.values(WEAPON_FINDS)
      .find((weapon) => weapon.id === equippedWeapon.id)?.combatEffect;
  }

  private recalculateEquipment(): void {
    const player = this.snapshot.player;
    if (!player) return;
    const oldMax = player.maxHp;
    const oldMaxResource = player.maxResource;
    const classHp = CLASSES[player.classId].maxHp;
    const hpBonus = this.snapshot.inventory.reduce((sum, item) =>
      sum + (item.equipped ? item.bonusHp ?? 0 : 0), 0);
    const heroBonuses = getHeroTrainingBonuses(this.snapshot.trainedPowers);
    player.maxHp = classHp + hpBonus + heroBonuses.maxHp;
    player.hp = Math.min(player.maxHp, player.hp + Math.max(0, player.maxHp - oldMax));
    player.maxResource = CLASSES[player.classId].maxResource + heroBonuses.maxResource;
    player.resource = Math.min(player.maxResource, player.resource +
      Math.max(0, player.maxResource - oldMaxResource));
  }

  private spawnProjectile(
    x: number,
    y: number,
    vx: number,
    vy: number,
    damage: number,
    tint: number,
    radius: number,
    lifeMs: number,
    aoe: number,
    impactEffect?: Projectile['impactEffect'],
    slowMs?: number,
  ): void {
    this.projectiles.push({
      id: this.nextProjectileId++,
      x,
      y,
      vx,
      vy,
      damage,
      tint,
      radius,
      lifeMs,
      aoe,
      playerOwned: true,
      impactEffect,
      slowMs,
    });
  }

  private tickProjectiles(delta: number, dt: number): void {
    const player = this.snapshot.player;
    this.projectiles = this.projectiles.filter((projectile) => {
      projectile.lifeMs -= delta;
      if (projectile.lifeMs <= 0) return false;
      projectile.x += projectile.vx * dt;
      projectile.y += projectile.vy * dt;
      if (projectile.playerOwned) {
        const hit = this.enemies.find((enemy) =>
          distance(projectile.x, projectile.y, enemy.x, enemy.y) < enemy.radius + projectile.radius);
        if (hit) {
          const targets = this.enemies.filter((enemy) =>
            distance(hit.x, hit.y, enemy.x, enemy.y) < projectile.aoe + enemy.radius);
          (targets.length ? targets : [hit]).forEach((enemy) => {
            this.damageEnemy(enemy, projectile.damage);
            if (projectile.impactEffect === 'ember-burn' && this.enemies.includes(enemy)) {
              this.applyDamageOverTime(enemy, 'ember-burn', 4, 2000, 500);
              this.setCombatFeedback(`Cinderwake ember scorches ${enemy.name}.`);
            }
            if (projectile.slowMs) enemy.slowedMs = Math.max(enemy.slowedMs, projectile.slowMs);
          });
          if (projectile.aoe > 15) this.addEffect(hit.x, hit.y, projectile.tint, projectile.aoe);
          return false;
        }
      } else if (player && distance(projectile.x, projectile.y, player.x, player.y) < 15) {
        this.damagePlayer(projectile.damage);
        return false;
      }
      return projectile.x > 14 && projectile.x < WORLD_WIDTH - 14 &&
        projectile.y > 14 && projectile.y < WORLD_HEIGHT - 14;
    });
    if (this.worldProgress.finale.stage === 'restoring') this.projectiles = [];
  }

  private moveBossActor(enemy: EnemyActor, player: NonNullable<GameSnapshot['player']>, dt: number, preferredDistance: number): void {
    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    const distanceToPlayer = Math.hypot(dx, dy) || 1;
    // Close bosses hold their ground during the warning/attack cadence instead
    // of orbiting so quickly that melee players cannot land a hit.
    if (distanceToPlayer <= preferredDistance) return;
    const direction = { x: dx / distanceToPlayer, y: dy / distanceToPlayer };
    const stride = enemy.speed * (enemy.slowedMs > 0 ? 0.45 : 1) * dt;
    const moveX = direction.x * stride;
    const moveY = direction.y * stride;
    const activeDungeon = this.worldProgress.activeDungeon;
    const activeRoom = activeDungeon
      ? dungeonById(activeDungeon.id)?.rooms.find((room) => room.id === activeDungeon.roomId)
      : undefined;
    const cell = activeRoom ? null : worldCellAt(enemy.x, enemy.y);
    const origin = activeRoom ? dungeonRoomOrigin(activeRoom)
      : cell ? worldCellOrigin(cell.id) : { x: 0, y: 0 };
    const maxX = origin.x + WORLD_CELL_WIDTH - enemy.radius - 18;
    const maxY = origin.y + WORLD_CELL_HEIGHT - enemy.radius - 18;
    const nextX = clamp(enemy.x + moveX, origin.x + enemy.radius + 18, maxX);
    const nextY = clamp(enemy.y + moveY, origin.y + enemy.radius + 18, maxY);
    if (!this.isEnemyBlocked(enemy, nextX, enemy.y)) enemy.x = nextX;
    if (!this.isEnemyBlocked(enemy, enemy.x, nextY)) enemy.y = nextY;
  }

  private tickEnemies(delta: number, dt: number): void {
    const player = this.snapshot.player;
    if (!player) return;
    const playerCell = worldCellAt(player.x, player.y)?.id;
    for (const enemy of this.enemies) {
      if (!this.worldProgress.activeDungeon && worldCellAt(enemy.x, enemy.y)?.id !== playerCell) continue;
      const previousAttackMs = enemy.attackMs;
      enemy.attackMs = Math.max(0, enemy.attackMs - delta);
      enemy.blinkCooldownMs = Math.max(0, (enemy.blinkCooldownMs ?? 0) - delta);
      enemy.blinkMs = Math.max(0, (enemy.blinkMs ?? 0) - delta);
      enemy.stunnedMs = Math.max(0, enemy.stunnedMs - delta);
      // Explicit class stuns still interrupt briefly, never freeze a whole
      // phase. Maelis's interruption is likewise short and cannot be chained.
      if (enemy.id === 'first-hunger-sanctum:first-hunger') enemy.stunnedMs = Math.min(enemy.stunnedMs, 250);
      enemy.slowedMs = Math.max(0, enemy.slowedMs - delta);
      this.tickDamageOverTime(enemy, delta);
      if (!this.enemies.includes(enemy)) continue;
      if (Math.abs(enemy.knockbackX) + Math.abs(enemy.knockbackY) > 1) {
        const pushX = enemy.knockbackX * dt;
        const pushY = enemy.knockbackY * dt;
        if (!this.isEnemyBlocked(enemy, enemy.x + pushX, enemy.y)) enemy.x += pushX;
        if (!this.isEnemyBlocked(enemy, enemy.x, enemy.y + pushY)) enemy.y += pushY;
        enemy.knockbackX *= 0.78;
        enemy.knockbackY *= 0.78;
      }
      if (enemy.stunnedMs > 0 || this.invisibilityMs > 0) continue;
      if (!this.worldProgress.activeDungeon && enemy.boss) {
        if (enemy.telegraph?.pattern === 'swing') {
          enemy.telegraph.remainingMs -= delta;
          if (enemy.telegraph.remainingMs <= 0) {
            const mark = enemy.telegraph;
            if (insideBossSwingArc(enemy.x, enemy.y, mark.x, mark.y, player.x, player.y)) {
              this.damagePlayer(Math.ceil(enemy.damage * 0.68));
            }
            enemy.telegraph = undefined;
            enemy.attackMs = 900;
          }
          continue;
        }
        if (enemy.attackMs <= 0) {
          enemy.volley = (enemy.volley ?? 0) + 1;
          if (Math.hypot(player.x - enemy.x, player.y - enemy.y) < 220 && enemy.volley % 3 !== 0) {
            enemy.telegraph = { x: player.x, y: player.y, remainingMs: 680, pattern: 'swing' };
            enemy.attackMs = 1250;
            this.snapshot.hint = `${enemy.name} winds up a sweeping strike—move out of its forward arc!`;
          } else {
            this.spawnEnemyProjectile(enemy, player, enemy.damage, 205, 8, 520);
            enemy.attackMs = 1450;
          }
        } else {
          this.moveBossActor(enemy, player, dt, 105);
        }
        continue;
      }
      if (this.worldProgress.activeDungeon && enemy.boss &&
          enemy.id !== 'first-hunger-sanctum:first-hunger') {
        if (enemy.telegraph) {
          enemy.telegraph.remainingMs -= delta;
          if (enemy.telegraph.remainingMs <= 0) {
            const mark = enemy.telegraph;
            const radius = distance(player.x, player.y, mark.x, mark.y);
            const hit = mark.pattern === 'swing'
              ? insideBossSwingArc(enemy.x, enemy.y, mark.x, mark.y, player.x, player.y)
              : mark.pattern === 'circle' ? radius < 92
              : mark.pattern === 'ring' ? radius > 52 && radius < 138
              : mark.pattern === 'horizontal' ? Math.abs(player.y - mark.y) < 36
              : mark.pattern === 'vertical' ? Math.abs(player.x - mark.x) < 36
              : Math.abs(player.x - mark.x) < 28 || Math.abs(player.y - mark.y) < 28;
            if (hit) this.damagePlayer(mark.pattern === 'swing' ? Math.ceil(enemy.damage * 0.68) : enemy.damage);
            enemy.telegraph = undefined;
            enemy.attackMs = mark.pattern === 'swing' ? 900 : 1100;
          }
        } else if (enemy.attackMs <= 0) {
          enemy.volley = (enemy.volley ?? 0) + 1;
          const dungeon = dungeonById(this.worldProgress.activeDungeon.id)!;
          const patterns = BOSS_ATTACK_PATTERNS[enemy.name] ?? ['circle', 'cross'];
          const isSwing = enemy.volley % 3 !== 0;
          enemy.telegraph = {
            x: player.x,
            y: player.y,
            remainingMs: isSwing ? 680 : 720 + regionalSpawnHash(`${enemy.name}:windup`) % 120,
            pattern: isSwing ? 'swing' : patterns[Math.floor((enemy.volley - 1) / 3) % patterns.length]!,
          };
          this.snapshot.hint = enemy.telegraph.pattern === 'swing'
            ? 'The boss draws back for a sweeping strike—dodge out of its forward arc!'
            : dungeon.bossClue ?? (enemy.telegraph.pattern === 'circle'
              ? 'Anchor slam: leave the marked circle!' : 'Flood surge: leave both marked lanes!');
        } else this.moveBossActor(enemy, player, dt, 68);
        continue;
      }
      if (enemy.id === 'first-hunger-sanctum:first-hunger') {
        if (previousAttackMs > 600 && enemy.attackMs <= 600) this.addEffect(enemy.x, enemy.y, 0xffffff, 80);
        if (enemy.telegraph) {
          enemy.telegraph.remainingMs -= delta;
          if (enemy.telegraph.remainingMs <= 0) {
            const mark = enemy.telegraph;
            if (insideBossSwingArc(enemy.x, enemy.y, mark.x, mark.y, player.x, player.y)) {
              this.damagePlayer(Math.ceil(enemy.damage * 0.68));
            }
            enemy.telegraph = undefined;
            enemy.attackMs = 1050;
          }
        } else if (enemy.attackMs <= 0) {
          this.hungerVolley++;
          const phase = enemy.hp / enemy.maxHp < 0.3 ? 3 : enemy.hp / enemy.maxHp < 0.65 ? 2 : 1;
          const colors = [0xffd64a, 0x49aaff, 0xff4b55, 0x56f286, 0xad64ff];
          const tint = colors[this.hungerVolley % colors.length];
          const aim = Math.atan2(player.y - enemy.y, player.x - enemy.x);
          if (this.hungerVolley % 3 === 0) {
            enemy.telegraph = { x: player.x, y: player.y, remainingMs: 680, pattern: 'swing' };
            enemy.attackMs = 1250;
            this.snapshot.hint = 'The Hunger sweeps its claws forward—escape the glowing arc!';
            continue;
          }
          const count = 6 + phase * 2;
          for (let i = 0; i < count; i++) {
            const angle = i * Math.PI * 2 / count + this.hungerVolley * 0.17;
            this.projectiles.push({ id: this.nextProjectileId++, x: enemy.x, y: enemy.y,
              vx: Math.cos(angle) * (90 + phase * 25), vy: Math.sin(angle) * (90 + phase * 25),
              damage: enemy.damage, tint, radius: 6, lifeMs: 3400, aoe: 0, playerOwned: false });
          }
          for (let i = -phase; i <= phase; i++) {
            const angle = aim + i * 0.16;
            this.projectiles.push({ id: this.nextProjectileId++, x: enemy.x, y: enemy.y,
              vx: Math.cos(angle) * (175 + phase * 25), vy: Math.sin(angle) * (175 + phase * 25),
              damage: enemy.damage + phase * 3, tint, radius: 5, lifeMs: 2400, aoe: 0, playerOwned: false });
          }
          enemy.attackMs = 2400 - phase * 300;
        } else {
          this.moveBossActor(enemy, player, dt, 58);
        }
        continue;
      }
      if (!this.worldProgress.activeDungeon) {
        const playerCell = worldCellAt(player.x, player.y);
        const enemyCell = worldCellAt(enemy.x, enemy.y);
        // Field creatures belong to the screen they spawned in; they do not
        // chase the player through a gate or into a town.
        if (playerCell && enemyCell && playerCell.id !== enemyCell.id) continue;
      }
      const dx = player.x - enemy.x;
      const dy = player.y - enemy.y;
      const dist = Math.hypot(dx, dy) || 1;
      const aggro = 220;
      if (dist > aggro) continue;
      if (enemy.combatStyle === 'blink' && (enemy.blinkCooldownMs ?? 0) <= 0 && dist < 205) {
        const retreat = dist < 112;
        const centerAngle = Math.atan2(dy, dx) + (retreat ? Math.PI : 0);
        const jumpDistance = retreat ? 125 : 68;
        const oldX = enemy.x;
        const oldY = enemy.y;
        const offsets = [0, 0.65, -0.65, 1.2, -1.2];
        const destination = offsets.map((offset) => ({
          x: player.x - Math.cos(centerAngle + offset) * jumpDistance,
          y: player.y - Math.sin(centerAngle + offset) * jumpDistance,
        })).find((point) => !this.isEnemyBlocked(enemy, point.x, point.y));
        if (destination) {
          this.addEffect(oldX, oldY, enemy.tint, 34);
          enemy.x = destination.x;
          enemy.y = destination.y;
          enemy.blinkMs = 260;
          enemy.blinkCooldownMs = 2200 + regionalSpawnHash(enemy.id) % 900;
          enemy.attackMs = Math.max(enemy.attackMs, retreat ? 700 : 400);
          this.addEffect(enemy.x, enemy.y, enemy.tint, 48);
          continue;
        }
      }
      if (RANGED_MONSTER_NAMES.has(enemy.name) && dist > 80) {
        if (enemy.attackMs <= 0) {
          this.spawnEnemyProjectile(enemy, player, enemy.damage, 155, 5, 1800);
          enemy.attackMs = 1750;
        }
        continue;
      }
      if (dist > enemy.radius + 22) {
        const speed = enemy.speed * (enemy.slowedMs > 0 ? 0.45 : 1);
        const moveX = (dx / dist) * speed * dt;
        const moveY = (dy / dist) * speed * dt;
        if (!this.isEnemyBlocked(enemy, enemy.x + moveX, enemy.y)) enemy.x += moveX;
        if (!this.isEnemyBlocked(enemy, enemy.x, enemy.y + moveY)) enemy.y += moveY;
      } else if (enemy.attackMs <= 0) {
        if (enemy.boss) {
          enemy.volley = (enemy.volley ?? 0) + 1;
          if (dist < 138 && enemy.volley % 3 !== 0) {
            this.addEffect(enemy.x + (dx / dist) * 42, enemy.y + (dy / dist) * 42, 0xff9955, 58);
            this.damagePlayer(Math.ceil(enemy.damage * 0.68));
          } else {
            this.spawnEnemyProjectile(enemy, player, enemy.damage, 205, 8, 520);
          }
        } else {
          this.damagePlayer(enemy.damage);
        }
        enemy.attackMs = enemy.boss ? 1050 : 1150;
      }
    }
    this.refreshEnemyHud();
  }

  private tickMaelisAlly(delta: number, dt: number): void {
    const ally = this.maelisAlly;
    const player = this.snapshot.player;
    if (!ally || !player || this.worldProgress.finale.stage !== 'battle' ||
        !this.worldProgress.finale.allied) return;
    if (this.isMaelisConversationRoom()) return;
    const activeDungeon = this.worldProgress.activeDungeon;
    const dungeon = activeDungeon ? dungeonById(activeDungeon.id) : undefined;
    const room = activeDungeon
      ? dungeon?.rooms.find((candidate) => candidate.id === activeDungeon.roomId)
      : null;
    const playerCell = activeDungeon ? null : worldCellAt(player.x, player.y);
    const target = this.enemies
      .filter((enemy) => enemy.hp > 0 &&
        (activeDungeon
          ? dungeonRoomAt(activeDungeon.id, enemy.x, enemy.y)?.id === activeDungeon.roomId
          : !playerCell || worldCellAt(enemy.x, enemy.y)?.id === playerCell.id) &&
        distance(player.x, player.y, enemy.x, enemy.y) < 560)
      .sort((a, b) => distance(player.x, player.y, a.x, a.y) - distance(player.x, player.y, b.x, b.y))[0];
    const followOffsets: Record<Direction, { x: number; y: number }> = {
      up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 },
    };
    const facing = followOffsets[player.facing];
    const targetDx = target ? player.x - target.x : 0;
    const targetDy = target ? player.y - target.y : 1;
    const targetLength = Math.hypot(targetDx, targetDy) || 1;
    const goalX = target
      ? target.x + targetDx / targetLength * 136
      : player.x - facing.x * 58;
    const goalY = target
      ? target.y + targetDy / targetLength * 136
      : player.y - facing.y * 44;
    const bounds = room ? dungeonRoomOrigin(room) : null;
    const targetX = bounds ? clamp(goalX, bounds.x + 60, bounds.x + 580) : clamp(goalX, 48, MAP_WORLD_WIDTH - 48);
    const targetY = bounds ? clamp(goalY, bounds.y + 60, bounds.y + 420) : clamp(goalY, 48, MAP_WORLD_HEIGHT - 48);
    const distanceToGoal = distance(ally.x, ally.y, targetX, targetY);
    const allySpeed = distanceToGoal > 420 ? 500 : distanceToGoal > 210 ? 280 : 155;
    if (distanceToGoal > 14) {
      const length = distanceToGoal || 1;
      const step = Math.min(length, allySpeed * dt);
      ally.x += (targetX - ally.x) / length * step;
      ally.y += (targetY - ally.y) / length * step;
    }
    ally.attackMs -= delta;
    ally.attackPoseMs = Math.max(0, ally.attackPoseMs - delta);
    if (target) {
      const aimX = target.x - ally.x;
      const aimY = target.y - ally.y;
      ally.facing = Math.abs(aimX) > Math.abs(aimY)
        ? aimX < 0 ? 'left' : 'right'
        : aimY < 0 ? 'up' : 'down';
    }
    if (target && ally.attackMs <= 0 && distance(ally.x, ally.y, target.x, target.y) < 360) {
      const damage = Math.max(55, Math.round(40 + player.level * 1.35));
      const shotX = target.x - ally.x;
      const shotY = target.y - ally.y;
      const shotLength = Math.hypot(shotX, shotY) || 1;
      const aimX = shotX / shotLength;
      const aimY = shotY / shotLength;
      this.addEffect(ally.x + aimX * 26, ally.y + aimY * 26, 0xd8a3ff, 30);
      this.spawnProjectile(
        ally.x + aimX * 34,
        ally.y + aimY * 34,
        aimX * 340,
        aimY * 340,
        damage,
        0xd8a3ff,
        11,
        1500,
        22,
      );
      ally.attackPoseMs = 380;
      ally.attackMs = 1050;
      this.maelisAllyStrikeCount += 1;
      if (target.id === 'first-hunger-sanctum:first-hunger' && this.maelisAllyStrikeCount % 5 === 0) {
        target.stunnedMs = Math.max(target.stunnedMs, 180);
        this.snapshot.hint = 'Maelis interrupts the Hunger. Press your attack!';
      }
    }
  }

  private applyDamageOverTime(
    enemy: EnemyActor,
    kind: EnemyDamageOverTime['kind'],
    damage: number,
    durationMs: number,
    tickMs: number,
  ): void {
    const existing = enemy.damageOverTime.find((effect) => effect.kind === kind);
    if (existing) {
      existing.remainingMs = durationMs;
      existing.untilTickMs = tickMs;
      existing.damage = damage;
      existing.tickMs = tickMs;
      return;
    }
    enemy.damageOverTime.push({
      kind,
      remainingMs: durationMs,
      untilTickMs: tickMs,
      tickMs,
      damage,
    });
  }

  private tickDamageOverTime(enemy: EnemyActor, delta: number): void {
    enemy.damageOverTime.forEach((effect) => {
      effect.remainingMs -= delta;
      effect.untilTickMs -= delta;
      while (effect.remainingMs >= 0 && effect.untilTickMs <= 0 && enemy.hp > 0) {
        effect.untilTickMs += effect.tickMs;
        this.damageEnemy(enemy, effect.damage, { stunMs: 0, knockback: false });
        const tint = effect.kind === 'thorn-bleed' ? 0x9bd45e : 0xff6a32;
        this.addEffect(enemy.x, enemy.y, tint, 18);
        if (!this.enemies.includes(enemy)) break;
      }
    });
    enemy.damageOverTime = enemy.damageOverTime.filter((effect) => effect.remainingMs > 0);
  }

  private spawnEnemyProjectile(
    enemy: EnemyActor,
    player: NonNullable<GameSnapshot['player']>,
    damage: number,
    speed: number,
    radius: number,
    aoe: number,
  ): void {
    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    const dist = Math.hypot(dx, dy) || 1;
    this.projectiles.push({
      id: this.nextProjectileId++,
      x: enemy.x,
      y: enemy.y,
      vx: (dx / dist) * speed,
      vy: (dy / dist) * speed,
      damage,
      tint: 0xf07553,
      radius,
      lifeMs: 1600,
      aoe,
      playerOwned: false,
    });
  }

  private isEnemyBlocked(enemy: EnemyActor, x: number, y: number): boolean {
    if (this.worldProgress.activeDungeon) {
      return dungeonBlocked(this.worldProgress.activeDungeon.id, this.dungeonProgress(), x, y) ||
        dungeonRoomAt(this.worldProgress.activeDungeon.id, x, y)?.id !== this.worldProgress.activeDungeon.roomId;
    }
    if (x < 28 || x > WORLD_WIDTH - 28 || y < 28 || y > WORLD_HEIGHT - 28) return true;
    const cell = worldCellAt(x, y);
    const enemyCell = worldCellAt(enemy.x, enemy.y);
    if (!cell || cell.id !== enemyCell?.id) return true;
    const localX = x - cell.x;
    const localY = y - cell.y;
    if (cell.roomId === 'chapel') {
      if (
        inRect(localX, localY, [46, 28, 66, 452]) ||
        inRect(localX, localY, [574, 28, 594, 452]) ||
        inRect(localX, localY, [66, 28, 270, 48]) ||
        inRect(localX, localY, [370, 28, 574, 48]) ||
        inRect(localX, localY, [66, 432, 574, 452])
      ) return true;
      const sealedWall = this.worldProgress.chapelGateOpen
        ? inRect(localX, localY, [66, 220, 278, 250]) || inRect(localX, localY, [362, 220, 574, 250])
        : inRect(localX, localY, [66, 220, 574, 250]);
      if (sealedWall) return true;
    }
    if (cell.roomId === 'sanctum' &&
      (inRect(localX, localY, [54, 70, 116, 142]) || inRect(localX, localY, [524, 70, 586, 142]))) return true;
    return this.enemies.some((other) => other !== enemy &&
      worldCellAt(other.x, other.y)?.id === cell.id &&
      distance(x, y, other.x, other.y) < enemy.radius + other.radius - 2);
  }

  private damagePlayer(amount: number): void {
    const player = this.snapshot.player;
    if (!player || this.playerInvulnerableMs > 0 || this.invisibilityMs > 0) return;
    if (this.arcaneShieldMs > 0) {
      this.arcaneShieldMs = 0;
      this.playerInvulnerableMs = 500;
      this.snapshot.hint = 'Your arcane ward absorbed the hit.';
      this.addEffect(player.x, player.y, 0xa9a4f1, 42);
      return;
    }
    const reduction = (this.battleCryMs > 0 ? 0.45 : 1) * 0.8;
    player.hp = Math.max(0, player.hp - Math.ceil(amount * reduction));
    this.sound('hurt');
    this.playerInvulnerableMs = 900;
    this.addEffect(player.x, player.y, 0xe68c6f, 28);
    if (player.hp <= 0) {
      const checkpoint = wellById(this.worldProgress.lastWell.id);
      player.coins = Math.max(0, player.coins - 10);
      this.maelisAlly = null;
      this.returnToLastWell();
      this.snapshot.hint = `You were defeated and returned to ${checkpoint?.label ?? 'your last well'}. You lost 10 shards.`;
      this.addLog(this.snapshot.hint);
    }
  }

  private addEffect(_x: number, _y: number, _tint: number, _radius = 22): void {
    this.effects.push({
      id: this.nextEffectId++,
      x: _x,
      y: _y,
      tint: _tint,
      radius: _radius,
      remainingMs: 320,
      durationMs: 320,
    });
  }
}

export const getRoomProps = (roomId: RoomId): WorldProp[] =>
  propsByRoom[roomId].map((prop) => ({ ...prop }));
