import { DUNGEONS, type DungeonDefinition } from './dungeons';
import { GLASSLANDS_GEAR } from './glasslands';
import { HUNGER_GEAR } from './hungerTerritory';
import { REGIONAL_FIELD_GEAR } from './regionalGear';

const treasureCellIds = new Set([
  'village',
  'northwood',
  'ruins',
  'riverbank',
  'old-floodgate',
  'sanctum',
  'hunger-0-0',
  ...REGIONAL_FIELD_GEAR.map(({ cellId }) => cellId),
  ...GLASSLANDS_GEAR.map(({ cellId }) => cellId),
  ...HUNGER_GEAR.map(({ cellId }) => cellId),
]);

export type TreasureMarkerState = 'available' | 'collected' | null;

export function getOverworldMapMarkers(
  cellId: string,
  discoveredWorldCells: readonly string[],
  foundTreasureCells: readonly string[],
): { dungeons: DungeonDefinition[]; treasure: TreasureMarkerState } {
  if (!discoveredWorldCells.includes(cellId)) return { dungeons: [], treasure: null };

  const foundTreasure = foundTreasureCells.includes(cellId);
  return {
    dungeons: DUNGEONS.filter((dungeon) => dungeon.entryCellId === cellId),
    treasure: foundTreasure
      ? 'collected'
      : treasureCellIds.has(cellId) ? 'available' : null,
  };
}
