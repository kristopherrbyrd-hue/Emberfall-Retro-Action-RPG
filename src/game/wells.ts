import { WORLD_CELLS, worldCellOrigin } from './worldMap';
import { DUNGEONS, dungeonRoomOrigin } from './dungeons';
import { HUNGER_ENTRY } from './hungerTerritory';

export type WellDefinition = {
  id: string; label: string; cellId: string; x: number; y: number;
  dungeonId?: string; roomId?: string;
};
export type WellCheckpoint = { id: string; returnX?: number; returnY?: number };

const placements = [
  ['village', 'Hearthglen well'],
  ['ruins', 'Ember Sanctum approach well'],
  ['drowned-marches-01-01', 'Marches arrival well'],
  ['chapel-forecourt', 'Chapel approach well'],
  ['frostline-stair', 'Ashen Peaks arrival well'],
  ['blackglass-pass', 'Ash Marshal approach well'],
  ['glassward-entry', 'Glasslands arrival well'],
  ['petrified-garden', 'Prism Conservatory approach well'],
  ['capital-south-gate', 'Capital arrival well'],
  ['fallen-archive', 'Last Bell approach well'],
  [HUNGER_ENTRY, 'Hunger territory arrival well'],
  ['hunger-0-2', 'The Vigil Spring'],
] as const;

export const WELLS: WellDefinition[] = [
  ...placements.map(([cellId, label]) => {
    const origin = worldCellOrigin(cellId);
    return { id: `well:${cellId}`, label, cellId,
      x: origin.x + (cellId === HUNGER_ENTRY ? 440 : 320), y: origin.y + 320 };
  }),
  ...DUNGEONS.filter((dungeon) => WORLD_CELLS.some((cell) =>
    cell.id === dungeon.entryCellId && cell.contentReady)).map((dungeon) => {
    const room = dungeon.rooms.find((entry) => entry.id === dungeon.entryRoomId)!;
    const origin = dungeonRoomOrigin(room);
    return { id: `well:dungeon:${dungeon.id}`, label: `${dungeon.label} well`,
      cellId: dungeon.entryCellId, dungeonId: dungeon.id, roomId: room.id,
      x: origin.x + 320, y: origin.y + 320 };
  }),
];

export const DEFAULT_WELL_ID = 'well:village';
export const wellById = (id: string) => WELLS.find((well) => well.id === id);

export function normalizeWell(saved?: WellCheckpoint): WellCheckpoint {
  const well = saved && wellById(saved.id);
  if (!well) return { id: DEFAULT_WELL_ID };
  const returnCell = WORLD_CELLS.find((cell) => Number.isFinite(saved.returnX) &&
    Number.isFinite(saved.returnY) && saved.returnX! >= cell.x && saved.returnX! < cell.x + 640 &&
    saved.returnY! >= cell.y && saved.returnY! < cell.y + 480 && cell.contentReady);
  return well.dungeonId && returnCell
    ? { id: well.id, returnX: saved.returnX, returnY: saved.returnY } : { id: well.id };
}
