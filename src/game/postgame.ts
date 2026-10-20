import { WORLD_CELLS } from './worldMap';
import { DUNGEONS } from './dungeons';

export const POSTGAME_GEAR_CLEAR_INTERVAL = 3;
const MAX_CLEAR_BOUNTY_XP = 10_000;
const MAX_CLEAR_BOUNTY_SHARDS = 5_000;

export type PostgameProgress = {
  started: boolean;
  cellClears: Record<string, number>;
};

const encounterCells = new Set([
  ...WORLD_CELLS.map((cell) => cell.id),
  ...DUNGEONS.flatMap((dungeon) => dungeon.rooms.map((room) => `${dungeon.id}/${room.id}`)),
]);

export type PostgameWaveStatus = {
  clearCount: number;
  nextWaveMultiplier: number;
  remainingMs: number | null;
};

export function isPostgameEncounterCell(cell: string): boolean {
  return encounterCells.has(cell);
}

export function postgameWaveMultiplier(clearCount: number): number {
  return Math.min(Number.MAX_SAFE_INTEGER, 1.25 ** clearCount);
}

export function postgameCellClearReward(clearCount: number): { xp: number; shards: number } {
  const tier = Number.isSafeInteger(clearCount) ? Math.max(0, clearCount - 1) : 0;
  const multiplier = postgameWaveMultiplier(tier);
  return {
    xp: Math.min(MAX_CLEAR_BOUNTY_XP, Math.ceil(80 * multiplier)),
    shards: Math.min(MAX_CLEAR_BOUNTY_SHARDS, Math.ceil(35 * multiplier)),
  };
}

export function describePostgameWave(status: PostgameWaveStatus): string {
  const multiplier = `×${status.nextWaveMultiplier.toFixed(2)}`;
  const timer = status.remainingMs === null
    ? 'wave active'
    : `${Math.ceil(status.remainingMs / 1000)} seconds until wave returns`;
  return `Cleared ${status.clearCount} times · next wave ${multiplier} health and damage · ${timer}`;
}

export function normalizePostgame(saved?: Partial<PostgameProgress>): PostgameProgress {
  return {
    started: saved?.started === true,
    cellClears: Object.fromEntries(Object.entries(saved?.cellClears ?? {})
      .filter(([cell, count]) => encounterCells.has(cell) && Number.isSafeInteger(count) && count >= 0)),
  };
}

/** Normal adventures retain their existing balance; the restored world is an elite challenge. */
export function postgameEnemyStats(
  base: { maxHp: number; damage: number; speed: number },
  cell: string,
  progress: PostgameProgress,
) {
  if (!progress.started) return base;
  const escalation = 1.25 ** (progress.cellClears[cell] ?? 0);
  const wholeStat = (value: number) => Math.min(Number.MAX_SAFE_INTEGER, Math.ceil(value));
  return {
    maxHp: wholeStat(Math.max(600, base.maxHp * 6) * escalation),
    damage: wholeStat(Math.max(50, base.damage * 4) * escalation),
    speed: base.speed === 0 ? 0 : Math.max(65, base.speed * 1.3),
  };
}
