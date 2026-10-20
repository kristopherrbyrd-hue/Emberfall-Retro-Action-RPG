import { BELL_REGION_IDS, WORLD_REGION_IDS, type WorldRegionId } from './worldMap';
import { dungeonById, normalizeDungeons, type DungeonProgress, type DungeonVisit } from './dungeons';
import { normalizeFinale, RESTORATION_DURATION_MS, type FinaleProgress } from './finale';
import { normalizePostgame, type PostgameProgress } from './postgame';
import { normalizeWell, type WellCheckpoint } from './wells';
import { GLASSLANDS_LAIRS } from './glasslands';

export type WorldProgress = {
  activeDungeon: DungeonVisit | null;
  dungeons: Record<string, DungeonProgress>;
  finale: FinaleProgress;
  postgame: PostgameProgress;
  lastWell: WellCheckpoint;
  unlockedRegions: WorldRegionId[];
  silencedBells: WorldRegionId[];
  colorsRestored: boolean;
  discoveredDungeons: string[];
  completedDungeons: string[];
  foundTreasureCells: string[];
  destroyedObstacles: string[];
  obstacleDamage: Record<string, number>;
  obstacleHits: Record<string, number>;
  chapelPuzzleProgress: number;
  chapelGateOpen: boolean;
  glasslandsPuzzleProgress: number;
  fallenCapitalPuzzleProgress: number;
  marchesTide: MarchesTide;
  marchesTideRemainingMs: number;
};

const regionSet = new Set<string>(WORLD_REGION_IDS);
const SATURATION_LOSS_PER_BELL = 0.2;
export const MAX_VEGETATION_HITS = 5;
export const THORNBOUND_SEAL_HITS = MAX_VEGETATION_HITS;

export const MARCHES_TIDE_DURATION_MS = 45_000;
export type WorldColorProfile = {
  silencedBellCount: number;
  saturation: number;
  colorsRestored: boolean;
};

const uniqueStrings = (value: unknown): string[] =>
  Array.isArray(value)
    ? [...new Set(value.filter((entry): entry is string => typeof entry === 'string'))]
    : [];

const validRegions = (value: unknown): WorldRegionId[] =>
  uniqueStrings(value).filter((entry): entry is WorldRegionId => regionSet.has(entry));

export function createInitialWorldProgress(): WorldProgress {
  return {
    activeDungeon: null,
    dungeons: {},
    finale: normalizeFinale(null, false),
    postgame: normalizePostgame(),
    lastWell: normalizeWell(),
    unlockedRegions: ['hearthglen'],
    silencedBells: [],
    colorsRestored: false,
    discoveredDungeons: [],
    completedDungeons: [],
    foundTreasureCells: [],
    destroyedObstacles: [],
    obstacleDamage: {},
    obstacleHits: {},
    chapelPuzzleProgress: 0,
    chapelGateOpen: false,
    glasslandsPuzzleProgress: 0,
    fallenCapitalPuzzleProgress: 0,
    marchesTide: 'low',
    marchesTideRemainingMs: MARCHES_TIDE_DURATION_MS,
  };
}

export function normalizeWorldProgress(value: unknown): WorldProgress {
  const base = createInitialWorldProgress();
  if (!value || typeof value !== 'object') return base;
  const saved = value as Partial<WorldProgress>;
  const unlockedRegions = new Set<WorldRegionId>(['hearthglen']);
  for (const region of validRegions(saved.unlockedRegions)) unlockedRegions.add(region);
  const savedObstacleDamage = saved.obstacleDamage && typeof saved.obstacleDamage === 'object'
    ? Object.entries(saved.obstacleDamage)
    : [];
  const obstacleHits = Object.fromEntries(
    Object.entries(saved.obstacleHits ?? {})
      .filter(([, amount]) => typeof amount === 'number' && Number.isFinite(amount) && amount > 0)
      .map(([id, amount]) => [id, Math.min(MAX_VEGETATION_HITS, Math.floor(amount))]),
  );
  // Preserve partial progress from the former damage-only trees without opening them on load.
  for (const id of ['riverbank-briar-seal', 'northwood-root-door']) {
    const oldDamage = saved.obstacleDamage?.[id];
    if (obstacleHits[id] === undefined &&
        typeof oldDamage === 'number' && Number.isFinite(oldDamage) && oldDamage > 0) {
      obstacleHits[id] = Math.min(MAX_VEGETATION_HITS - 1,
        Math.ceil(oldDamage / 55 * MAX_VEGETATION_HITS));
    }
  }
  const completedDungeons = uniqueStrings(saved.completedDungeons);
  const priorGlasslandsSave = unlockedRegions.has('glasslands') &&
    !GLASSLANDS_LAIRS.some((lair) => saved.dungeons?.[lair.id]);
  const destroyedObstacles = uniqueStrings(saved.destroyedObstacles);
  if (priorGlasslandsSave) destroyedObstacles.push('glasslands-legacy-bell-access');
  const chapelPuzzleProgress = Math.max(0, Math.min(3,
    Number.isInteger(saved.chapelPuzzleProgress) ? saved.chapelPuzzleProgress as number : 0));
  return {
    activeDungeon: saved.activeDungeon &&
      dungeonById(saved.activeDungeon.id)?.rooms.some((r) => r.id === saved.activeDungeon?.roomId) &&
      Number.isFinite(saved.activeDungeon.returnX) && Number.isFinite(saved.activeDungeon.returnY)
      ? { ...saved.activeDungeon } : null,
    dungeons: normalizeDungeons(saved.dungeons),
    finale: normalizeFinale(saved.finale, saved.colorsRestored === true),
    postgame: normalizePostgame(saved.postgame),
    lastWell: normalizeWell(saved.lastWell),
    unlockedRegions: [...unlockedRegions],
    silencedBells: validRegions(saved.silencedBells).filter((id) => id !== 'first-hunger'),
    colorsRestored: saved.colorsRestored === true || saved.finale?.stage === 'complete',
    discoveredDungeons: uniqueStrings(saved.discoveredDungeons),
    completedDungeons,
    foundTreasureCells: uniqueStrings(saved.foundTreasureCells),
    destroyedObstacles: [...new Set(destroyedObstacles)],
    obstacleDamage: Object.fromEntries(savedObstacleDamage.filter(([, amount]) =>
      typeof amount === 'number' && Number.isFinite(amount) && amount > 0)),
    obstacleHits,
    chapelPuzzleProgress,
    chapelGateOpen: saved.chapelGateOpen === true ||
      chapelPuzzleProgress === 3 || completedDungeons.includes('sunken-chapel'),
    glasslandsPuzzleProgress: Math.max(0, Math.min(3,
      Number.isInteger(saved.glasslandsPuzzleProgress) ? saved.glasslandsPuzzleProgress as number : 0)),
    fallenCapitalPuzzleProgress: Math.max(0, Math.min(3,
      Number.isInteger(saved.fallenCapitalPuzzleProgress) ? saved.fallenCapitalPuzzleProgress as number : 0)),
    marchesTide: saved.marchesTide === 'high' ? 'high' : 'low',
    marchesTideRemainingMs: Number.isFinite(saved.marchesTideRemainingMs)
      ? Math.max(1, Math.min(MARCHES_TIDE_DURATION_MS, saved.marchesTideRemainingMs as number))
      : MARCHES_TIDE_DURATION_MS,
  };
}

export function getWorldColorProfile(progress: WorldProgress): WorldColorProfile {
  const silenced = new Set(progress.silencedBells.filter((id) => id !== 'first-hunger' && BELL_REGION_IDS.includes(id)));
  const silencedBellCount = silenced.size;
  const saturation = progress.colorsRestored
    ? 1.18
    : progress.finale.stage === 'restoring'
      ? 1.18 * progress.finale.restorationMs / RESTORATION_DURATION_MS
    : Math.max(0, Math.round((1 - silencedBellCount * SATURATION_LOSS_PER_BELL) * 100) / 100);

  return {
    silencedBellCount,
    saturation,
    colorsRestored: progress.colorsRestored,
  };
}

export function getColorMatrixSaturationAdjustment(saturation: number): number {
  return Math.max(-1, Math.min(1, Math.round((saturation - 1) * 100) / 100));
}

export function getFirstHungerRenderCameras(
  saturation: number,
  hungerPresent: boolean,
): { vividCamera: boolean; worldCamera: boolean } {
  const vividCamera = hungerPresent && saturation === 0;
  return {
    vividCamera,
    worldCamera: hungerPresent && !vividCamera,
  };
}

export type MarchesTide = 'low' | 'high';
