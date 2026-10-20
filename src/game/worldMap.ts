import type { RoomId } from './data';
import { HUNGER_ARENA, HUNGER_ENTRY, HUNGER_SITES } from './hungerTerritory';
import { GLASSLANDS_CELLS } from './glasslands';

export const WORLD_CELL_WIDTH = 640;
export const WORLD_CELL_HEIGHT = 480;
export const WORLD_REGION_COLUMNS = 10;
export const WORLD_REGION_ROWS = 6;
export const WORLD_REGION_CELL_COUNT = WORLD_REGION_COLUMNS * WORLD_REGION_ROWS;
export const WORLD_COLUMNS = WORLD_REGION_COLUMNS;
export const WORLD_ROWS = WORLD_REGION_ROWS * 6;
export const WORLD_WIDTH = WORLD_CELL_WIDTH * WORLD_COLUMNS;
export const WORLD_HEIGHT = WORLD_CELL_HEIGHT * WORLD_ROWS;
export const WORLD_CELL_BORDER_THICKNESS = 18;
export const WORLD_CELL_OPENING = {
  horizontal: { start: 200, end: 280 },
  vertical: { start: 270, end: 370 },
} as const;

export const WORLD_REGION_IDS = [
  'hearthglen',
  'drowned-marches',
  'ashen-peaks',
  'glasslands',
  'fallen-capital',
  'first-hunger',
] as const;
// Realm 6 has no bell. Keep bell progression separate from territory indexing.
export const BELL_REGION_IDS = WORLD_REGION_IDS.filter((id) => id !== 'first-hunger');

export type WorldRegionId = (typeof WORLD_REGION_IDS)[number];
export type WorldCellEdge = 'north' | 'south' | 'east' | 'west';
export type MarchesTide = 'low' | 'high';
export type WorldRegionDefinition = {
  id: WorldRegionId;
  name: string;
  bell: 'Wonder' | 'Sorrow' | 'Fury' | 'Joy' | 'Resolve' | null;
  color: string;
  summary: string;
  index: number;
};

export const WORLD_REGIONS: readonly WorldRegionDefinition[] = [
  {
    id: 'hearthglen',
    name: 'Hearthglen & Briarwood',
    bell: 'Wonder',
    color: '#d3aa52',
    summary: 'Lush forest paths, quiet villages, and roots older than the bells.',
    index: 0,
  },
  {
    id: 'drowned-marches',
    name: 'The Drowned Marches',
    bell: 'Sorrow',
    color: '#628dba',
    summary: 'Flooded towns and submerged stonework remember what the living cannot.',
    index: 1,
  },
  {
    id: 'ashen-peaks',
    name: 'The Ashen Peaks',
    bell: 'Fury',
    color: '#c55f4d',
    summary: 'Snow passes, old mines, and volcanic halls test the will to resist.',
    index: 2,
  },
  {
    id: 'glasslands',
    name: 'The Glasslands',
    bell: 'Joy',
    color: '#7eaa67',
    summary: 'Petrified gardens and mirrored ruins hold a fading kind of delight.',
    index: 3,
  },
  {
    id: 'fallen-capital',
    name: 'The Fallen Capital',
    bell: 'Resolve',
    color: '#8a75a8',
    summary: 'A silent city keeps the last records of the bellkeepers.',
    index: 4,
  },
  {
    id: 'first-hunger', name: 'The First Hunger’s Territory', bell: null,
    color: '#977f91', summary: 'Maelis, one last guardian, a recovery spring, and the Hunger beyond.', index: 5,
  },
] as const;

export const WORLD_REGION_PORTALS: Readonly<Record<WorldRegionId, {
  entranceCellId: string;
  exitCellId: string;
}>> = {
  hearthglen: { entranceCellId: 'village', exitCellId: 'mournwater-crossing' },
  'drowned-marches': { entranceCellId: 'drowned-marches-01-01', exitCellId: 'northbound-sluice' },
  'ashen-peaks': { entranceCellId: 'frostline-stair', exitCellId: 'glassward-gate' },
  glasslands: { entranceCellId: 'glassward-entry', exitCellId: 'capital-road' },
  'fallen-capital': { entranceCellId: 'capital-south-gate', exitCellId: 'first-hunger-sanctum' },
  'first-hunger': { entranceCellId: HUNGER_ENTRY, exitCellId: HUNGER_ARENA },
};

export type WorldCell = {
  id: string;
  regionId: WorldRegionId;
  roomId: RoomId;
  label: string;
  x: number;
  y: number;
  row: number;
  column: number;
  contentReady: boolean;
  exits: Readonly<Record<WorldCellEdge, boolean>>;
};

const OPPOSITE_EDGE: Record<WorldCellEdge, WorldCellEdge> = {
  north: 'south',
  south: 'north',
  east: 'west',
  west: 'east',
};

const EDGE_OFFSET: Record<WorldCellEdge, { row: number; column: number }> = {
  north: { row: -1, column: 0 },
  south: { row: 1, column: 0 },
  east: { row: 0, column: 1 },
  west: { row: 0, column: -1 },
};

const TIDE_SHORTCUT = {
  from: 'reedveil-crossing',
  edge: 'south' as const,
  to: 'bellkeeper-causeway',
  openAt: 'low' as const,
};

const FIRST_REGION_CELLS: Record<string, Pick<WorldCell, 'id' | 'roomId' | 'label'>> = {
  '0:0': { id: 'canopy', roomId: 'woodland', label: 'Old Canopy' },
  '0:1': { id: 'sanctum', roomId: 'sanctum', label: 'Ember Sanctum' },
  '1:0': { id: 'northwood', roomId: 'woodland', label: 'High Briarwood' },
  '1:1': { id: 'ruins', roomId: 'ruins', label: 'Rootbound Ruins' },
  '1:2': { id: 'eastwood', roomId: 'woodland', label: 'Mossmere' },
  '2:0': { id: 'briarwood', roomId: 'woodland', label: 'Briarwood Trail' },
  '2:1': { id: 'fernwood', roomId: 'woodland', label: 'Fernwood' },
  '2:2': { id: 'riverbend', roomId: 'woodland', label: 'Riverbend' },
  '3:0': { id: 'village', roomId: 'village', label: 'Hearthglen' },
  '3:1': { id: 'southfield', roomId: 'woodland', label: 'Southfield' },
  '3:2': { id: 'riverbank', roomId: 'woodland', label: 'Riverbank' },
  '1:7': { id: 'heartwood-burrow', roomId: 'woodland', label: 'Heartwood Burrow' },
  '3:8': { id: 'forgotten-watch', roomId: 'woodland', label: 'Forgotten Watch' },
  '5:6': { id: 'weeping-hollow', roomId: 'woodland', label: 'Weeping Hollow' },
  '0:8': { id: 'briar-hidden-grove', roomId: 'woodland', label: 'Briar Hidden Grove' },
  '4:0': { id: 'mournwater-road', roomId: 'woodland', label: 'Mournwater Road' },
  '4:1': { id: 'bellward-pass', roomId: 'woodland', label: 'Bellward Pass' },
  '5:0': { id: 'mournwater-crossing', roomId: 'woodland', label: 'Mournwater Crossing' },
};
const DROWNED_START_CELLS: Record<string, Pick<WorldCell, 'id' | 'roomId' | 'label'>> = {
  '0:0': { id: 'drowned-marches-01-01', roomId: 'woodland', label: 'West Causeway' },
  '0:1': { id: 'mournwater-town', roomId: 'village', label: 'Mournwater' },
  '1:0': { id: 'drowned-marches-02-01', roomId: 'woodland', label: 'Tidemark Track' },
  '1:1': { id: 'drowned-ferry', roomId: 'woodland', label: 'Driftwood Ferry' },
  '1:2': { id: 'sunken-chapel-approach', roomId: 'woodland', label: 'Sunken Chapel Approach' },
  '2:2': { id: 'reedveil-crossing', roomId: 'woodland', label: 'Reedveil Crossing' },
  '2:3': { id: 'chapel-forecourt', roomId: 'woodland', label: 'Chapel Forecourt' },
  '3:3': { id: 'sunken-chapel', roomId: 'chapel', label: 'The Sunken Chapel' },
  '3:2': { id: 'bellkeeper-causeway', roomId: 'woodland', label: 'Bellkeeper Causeway' },
  '3:1': { id: 'drowned-waystones', roomId: 'woodland', label: 'Drowned Waystones' },
  '3:0': { id: 'wreckers-reach', roomId: 'woodland', label: 'Wrecker’s Reach' },
  '4:0': { id: 'old-floodgate', roomId: 'woodland', label: 'Old Floodgate' },
  '5:0': { id: 'northbound-sluice', roomId: 'woodland', label: 'Northbound Sluice' },
  '4:8': { id: 'reedveil-alders', roomId: 'woodland', label: 'Reedveil Alders' },
};
const ASHEN_START_CELLS: Record<string, Pick<WorldCell, 'id' | 'roomId' | 'label'>> = {
  '0:0': { id: 'frostline-stair', roomId: 'woodland', label: 'Frostline Stair' },
  '0:1': { id: 'cinderwatch-approach', roomId: 'woodland', label: 'Cinderwatch Approach' },
  '1:1': { id: 'ashbound-trail', roomId: 'woodland', label: 'Ashbound Trail' },
  '2:1': { id: 'blackglass-pass', roomId: 'woodland', label: 'Blackglass Pass' },
  '3:1': { id: 'last-ash-watch', roomId: 'woodland', label: 'Last Ash Watch' },
  '4:1': { id: 'glassward-slope', roomId: 'woodland', label: 'Glassward Slope' },
  '5:1': { id: 'glassward-gate', roomId: 'woodland', label: 'Glassward Gate' },
  '0:6': { id: 'ironvein-mine', roomId: 'woodland', label: 'Ironvein Mine' },
  '2:8': { id: 'gale-spire', roomId: 'woodland', label: 'Gale Spire' },
  '4:8': { id: 'buried-barracks', roomId: 'woodland', label: 'Buried Barracks' },
  '0:3': { id: 'ashbark-shelf', roomId: 'woodland', label: 'Ashbark Shelf' },
};
const GLASSLANDS_START_CELLS: Record<string, Pick<WorldCell, 'id' | 'roomId' | 'label'>> = {
  '0:1': { id: 'glassward-entry', roomId: 'woodland', label: 'Glassward Entry' },
  '1:1': { id: 'petrified-garden', roomId: 'woodland', label: 'Petrified Garden' },
  '2:1': { id: 'joy-bell-sanctum', roomId: 'woodland', label: 'Prism Conservatory' },
  '3:1': { id: 'mirrorwalk', roomId: 'woodland', label: 'Mirrorwalk' },
  '4:1': { id: 'stillwater-glass', roomId: 'woodland', label: 'Stillwater Glass' },
  '5:1': { id: 'capital-road', roomId: 'woodland', label: 'Road to the Capital' },
};
const FALLEN_CAPITAL_START_CELLS: Record<string, Pick<WorldCell, 'id' | 'roomId' | 'label'>> = {
  '0:1': { id: 'capital-south-gate', roomId: 'woodland', label: 'South Gate of the Capital' },
  '1:1': { id: 'fallen-archive', roomId: 'woodland', label: 'Fallen Archive' },
  '1:2': { id: 'capital-survivors-hold', roomId: 'woodland', label: 'Survivors’ Stronghold' },
  '2:1': { id: 'resolve-bell-sanctum', roomId: 'woodland', label: 'Hall of the Last Record' },
  '3:1': { id: 'first-hunger-sanctum', roomId: 'sanctum', label: 'The First Hunger’s Hollow' },
  '0:8': { id: 'archive-of-ash', roomId: 'woodland', label: 'Archive of Ash' },
  '2:8': { id: 'silent-amphitheater', roomId: 'woodland', label: 'Silent Amphitheater' },
  '5:7': { id: 'clockwork-vault', roomId: 'woodland', label: 'Clockwork Vault' },
  '1:8': { id: 'ivory-tree-court', roomId: 'woodland', label: 'Ivory Tree Court' },
};

const EXPANDED_REGION_NAMES: Partial<Record<WorldRegionId, {
  roots: readonly string[];
  places: readonly string[];
}>> = {
  hearthglen: {
    roots: ['Briar', 'Moss', 'Fern', 'Willow', 'Elder', 'Thorn', 'Moonlit', 'Fox', 'Lantern', 'Root'],
    places: ['Glen', 'Hollow', 'Ford', 'Rise', 'Glade', 'Way'],
  },
  'drowned-marches': {
    roots: ['Reed', 'Mire', 'Drowned', 'Eel', 'Silt', 'Blackwater', 'Flood', 'Willow', 'Bog', 'Moon'],
    places: ['Marsh', 'Fen', 'Reach', 'Ford', 'Grove', 'Mire'],
  },
  'ashen-peaks': {
    roots: ['Cinder', 'Basalt', 'Soot', 'Frost', 'Ember', 'Iron', 'Rime', 'Gale', 'Char', 'Blackglass'],
    places: ['Shelf', 'Spur', 'Pass', 'Crag', 'Mine', 'Ridge'],
  },
  glasslands: {
    roots: ['Prism', 'Lumen', 'Glass', 'Shatter', 'Sunshard', 'Bright', 'Moth', 'Mirror', 'Silver', 'Echo'],
    places: ['Orchard', 'Walk', 'Bluff', 'Grove', 'Step', 'Fields'],
  },
  'fallen-capital': {
    roots: ['Last', 'Silent', 'Broken', 'Ivory', 'Clock', 'Pale', 'Oath', 'Ash', 'Echo', 'Lantern'],
    places: ['Archive', 'Ward', 'Court', 'Avenue', 'Rise', 'Square'],
  },
};

const cellKey = (row: number, column: number) => `${row}:${column}`;
const regionCellKey = (regionId: WorldRegionId, row: number, column: number) =>
  `${regionId}:${row}:${column}`;

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function authoredCellAt(regionId: WorldRegionId, row: number, column: number):
  Pick<WorldCell, 'id' | 'roomId' | 'label'> | undefined {
  const key = cellKey(row, column);
  const special = regionId === 'hearthglen'
    ? FIRST_REGION_CELLS[key]
    : regionId === 'drowned-marches' ? DROWNED_START_CELLS[key]
      : regionId === 'ashen-peaks' ? ASHEN_START_CELLS[key]
        : regionId === 'glasslands'
          ? GLASSLANDS_START_CELLS[key] ?? GLASSLANDS_CELLS[key]
        : regionId === 'fallen-capital' ? FALLEN_CAPITAL_START_CELLS[key]
          : regionId === 'first-hunger' && row === 0 && column < 4
            ? HUNGER_SITES.find((site) => site.row === row && site.column === column)
            : undefined;
  if (!special) return undefined;
  return {
    id: special.id,
    roomId: 'roomId' in special ? special.roomId : 'woodland',
    label: special.label,
  };
}

function playableCellsStayConnected(edges: Map<string, Set<WorldCellEdge>>, blocked: Set<string>): boolean {
  const playable = [...edges.keys()].filter((key) => !blocked.has(key));
  if (!playable.length) return false;
  const reached = new Set([playable[0]!]);
  const pending = [playable[0]!];
  while (pending.length) {
    const current = pending.pop()!;
    const [row, column] = current.split(':').map(Number);
    for (const edge of edges.get(current) ?? []) {
      const offset = EDGE_OFFSET[edge];
      const neighbor = cellKey(row! + offset.row, column! + offset.column);
      if (!blocked.has(neighbor) && !reached.has(neighbor)) {
        reached.add(neighbor);
        pending.push(neighbor);
      }
    }
  }
  return reached.size === playable.length;
}

function selectUnbuiltCells(region: WorldRegionDefinition, edges: Map<string, Set<WorldCellEdge>>): Set<string> {
  if (!EXPANDED_REGION_NAMES[region.id]) return new Set();
  const protectedCells = new Set(
    Array.from({ length: WORLD_REGION_ROWS }, (_, row) =>
      Array.from({ length: WORLD_REGION_COLUMNS }, (_, column) =>
        authoredCellAt(region.id, row, column) ? cellKey(row, column) : null,
      ),
    ).flat().filter((key): key is string => key !== null),
  );
  const candidates = [...edges.keys()]
    .filter((key) => !protectedCells.has(key))
    .map((key) => ({ key, degree: edges.get(key)?.size ?? 0 }))
    .sort((a, b) =>
      a.degree - b.degree ||
      stableHash(`${region.id}:leave-closed:${a.key}`) - stableHash(`${region.id}:leave-closed:${b.key}`));
  const blocked = new Set<string>();
  const blockCount = WORLD_REGION_CELL_COUNT - 54;
  for (const { key } of candidates) {
    blocked.add(key);
    if (!playableCellsStayConnected(edges, blocked)) blocked.delete(key);
    if (blocked.size === blockCount) return blocked;
  }
  throw new Error(`Could not leave six connected cells unbuilt in ${region.id}`);
}

function generateRegionEdges(region: WorldRegionDefinition): Map<string, Set<WorldCellEdge>> {
  const edges = new Map<string, Set<WorldCellEdge>>();
  for (let row = 0; row < WORLD_REGION_ROWS; row += 1) {
    for (let column = 0; column < WORLD_REGION_COLUMNS; column += 1) {
      edges.set(cellKey(row, column), new Set());
    }
  }

  const connect = (row: number, column: number, edge: WorldCellEdge) => {
    const offset = EDGE_OFFSET[edge];
    const nextRow = row + offset.row;
    const nextColumn = column + offset.column;
    if (
      nextRow < 0 || nextRow >= WORLD_REGION_ROWS ||
      nextColumn < 0 || nextColumn >= WORLD_REGION_COLUMNS
    ) return;
    edges.get(cellKey(row, column))?.add(edge);
    edges.get(cellKey(nextRow, nextColumn))?.add(OPPOSITE_EDGE[edge]);
  };
  const disconnect = (row: number, column: number, edge: WorldCellEdge) => {
    const offset = EDGE_OFFSET[edge];
    const nextRow = row + offset.row;
    const nextColumn = column + offset.column;
    edges.get(cellKey(row, column))?.delete(edge);
    edges.get(cellKey(nextRow, nextColumn))?.delete(OPPOSITE_EDGE[edge]);
  };

  if (region.id === 'first-hunger') {
    // A deliberately short final chapter: Maelis, a recovery spring, and the
    // last threshold. The First Echo's lair is entered directly from the hub.
    connect(0, 0, 'east');
    connect(0, 1, 'east');
    connect(0, 2, 'east');
    return edges;
  }

  const root = region.index === 0 ? { row: 3, column: 0 } : { row: 5, column: 0 };
  const visited = new Set<string>([cellKey(root.row, root.column)]);
  const stack = [root];
  while (stack.length) {
    const current = stack[stack.length - 1];
    const options = (Object.keys(EDGE_OFFSET) as WorldCellEdge[])
      .map((edge) => {
        const offset = EDGE_OFFSET[edge];
        return {
          edge,
          row: current.row + offset.row,
          column: current.column + offset.column,
        };
      })
      .filter(({ row, column }) =>
        row >= 0 && row < WORLD_REGION_ROWS &&
        column >= 0 && column < WORLD_REGION_COLUMNS &&
        !visited.has(cellKey(row, column)))
      .sort((a, b) =>
        stableHash(`${region.id}:${current.row}:${current.column}:${a.edge}`) -
        stableHash(`${region.id}:${current.row}:${current.column}:${b.edge}`));

    const next = options[0];
    if (!next) {
      stack.pop();
      continue;
    }
    connect(current.row, current.column, next.edge);
    visited.add(cellKey(next.row, next.column));
    stack.push({ row: next.row, column: next.column });
  }

  // Add a small number of loops so each region has alternatives and shortcuts.
  for (let row = 0; row < WORLD_REGION_ROWS; row += 1) {
    for (let column = 0; column < WORLD_REGION_COLUMNS; column += 1) {
      for (const edge of ['east', 'south'] as const) {
        const offset = EDGE_OFFSET[edge];
        const nextRow = row + offset.row;
        const nextColumn = column + offset.column;
        if (
          nextRow >= WORLD_REGION_ROWS || nextColumn >= WORLD_REGION_COLUMNS ||
          edges.get(cellKey(row, column))?.has(edge)
        ) continue;
        if (stableHash(`${region.id}:loop:${row}:${column}:${edge}`) % 100 < 12) {
          connect(row, column, edge);
        }
      }
    }
  }

  // Preserve the existing Hearthglen-to-ruins route and its gated sanctum entrance.
  if (region.id === 'hearthglen') {
    connect(0, 0, 'south'); // Old Canopy -> High Briarwood
    connect(3, 0, 'north'); // Hearthglen -> Briarwood Trail
    connect(2, 0, 'north'); // Briarwood -> High Briarwood
    connect(1, 0, 'east');  // High Briarwood -> Rootbound Ruins
    connect(1, 1, 'north'); // Rootbound Ruins -> Ember Sanctum
    connect(1, 1, 'east');  // Rootbound Ruins -> Mossmere
    connect(1, 2, 'south'); // Mossmere -> Riverbend
    connect(2, 0, 'east');  // Briarwood -> Fernwood
    connect(2, 1, 'east');  // Fernwood -> Riverbend
    connect(2, 0, 'south'); // Briarwood -> Hearthglen
    connect(3, 0, 'east');  // Hearthglen -> Southfield
    connect(3, 1, 'east');  // Southfield -> Riverbank
    connect(2, 1, 'south'); // Fernwood -> Southfield
    connect(2, 2, 'south'); // Riverbend -> Riverbank
    connect(3, 1, 'south'); // Southfield -> Bellward Pass
    connect(4, 1, 'west');  // Bellward Pass -> Mournwater Road
    connect(4, 0, 'south'); // Mournwater Road -> Mournwater Crossing
    disconnect(3, 0, 'south'); // Keep the new road off Hearthglen's doorstep.
  } else if (region.id === 'drowned-marches') {
    connect(0, 0, 'south'); // West Causeway -> Tidemark Track
    connect(0, 0, 'east');  // West Causeway -> Mournwater
    connect(0, 1, 'south'); // Mournwater -> Driftwood Ferry
    connect(1, 0, 'east');  // Tidemark Track -> Driftwood Ferry
    connect(1, 1, 'east');  // Driftwood Ferry -> Sunken Chapel Approach
    connect(1, 2, 'south'); // Chapel Approach -> Reedveil Crossing
    connect(2, 2, 'east');  // Reedveil Crossing -> Chapel Forecourt
    connect(2, 3, 'south'); // Chapel Forecourt -> Sunken Chapel entrance
    connect(3, 3, 'west');  // Sunken Chapel -> Bellkeeper Causeway
    connect(3, 2, 'west');  // Bellkeeper Causeway -> Drowned Waystones
    connect(3, 1, 'west');  // Drowned Waystones -> Wrecker's Reach
    connect(3, 0, 'south');  // Wrecker's Reach -> Old Floodgate
    connect(4, 0, 'south');  // Old Floodgate -> Northbound Sluice
  } else if (region.id === 'ashen-peaks') {
    connect(0, 0, 'east');   // Frostline Stair -> Cinderwatch Approach
    for (let row = 0; row < WORLD_REGION_ROWS - 1; row += 1) {
      connect(row, 1, 'south');
    }
  } else if (region.id === 'glasslands') {
    // Keep the original southbound Bell-to-Capital trail, with three authored
    // side routes that rejoin it instead of opening the placeholder grid.
    const routes: [number, number, WorldCellEdge][] = [
      [0, 1, 'south'], [1, 1, 'south'], [2, 1, 'south'],
      [3, 1, 'south'], [4, 1, 'south'],
      [0, 1, 'west'], [0, 1, 'east'], [0, 0, 'south'],
      [1, 0, 'east'], [1, 0, 'south'], [1, 2, 'west'], [1, 2, 'east'],
      [1, 2, 'south'], [1, 3, 'south'], [2, 0, 'south'], [2, 2, 'west'],
      [2, 2, 'south'], [2, 3, 'south'], [3, 0, 'south'], [3, 2, 'west'],
      [3, 2, 'south'], [3, 3, 'east'], [3, 3, 'south'], [3, 4, 'east'],
      [3, 5, 'south'], [4, 0, 'south'], [4, 2, 'east'], [4, 2, 'south'],
      [4, 3, 'east'], [4, 3, 'south'], [4, 4, 'north'], [4, 4, 'east'],
      [4, 5, 'south'], [5, 0, 'east'], [5, 2, 'west'], [5, 2, 'east'],
      [5, 3, 'east'],
    ];
    for (const [row, column, edge] of routes) connect(row, column, edge);
  } else if (region.id === 'fallen-capital') {
    connect(0, 1, 'south');
    connect(1, 1, 'south');
    connect(1, 1, 'east'); // Fallen Archive -> Survivors' Stronghold
    connect(2, 1, 'south');
    disconnect(3, 1, 'east');
    disconnect(3, 1, 'south');
    disconnect(3, 1, 'west');
  }
  return edges;
}

function createWorldCells(): WorldCell[] {
  const cells: WorldCell[] = [];
  for (const region of WORLD_REGIONS) {
    const edges = generateRegionEdges(region);
    const unbuilt = selectUnbuiltCells(region, edges);
    const nameParts = EXPANDED_REGION_NAMES[region.id];
    for (let row = 0; row < WORLD_REGION_ROWS; row += 1) {
      for (let column = 0; column < WORLD_REGION_COLUMNS; column += 1) {
        const special = authoredCellAt(region.id, row, column);
        const index = row * WORLD_REGION_COLUMNS + column;
        const generatedName = nameParts
          ? `${nameParts.roots[column]} ${nameParts.places[row]}`
          : `${region.name} · ${String(index + 1).padStart(2, '0')}`;
        const regionRow = region.index * WORLD_REGION_ROWS + row;
        const exits = edges.get(cellKey(row, column)) ?? new Set<WorldCellEdge>();
        const contentReady = Boolean(special) || (
          Boolean(nameParts) && !unbuilt.has(cellKey(row, column))
        );
        cells.push({
          id: special?.id ?? `${region.id}-${String(row + 1).padStart(2, '0')}-${String(column + 1).padStart(2, '0')}`,
          regionId: region.id,
          roomId: special && 'roomId' in special ? special.roomId : 'woodland',
          label: special?.label ?? generatedName,
          x: column * WORLD_CELL_WIDTH,
          y: regionRow * WORLD_CELL_HEIGHT,
          row,
          column,
          contentReady,
          exits: {
            north: exits.has('north') ||
              (region.id === 'drowned-marches' && row === 0 && column === 0) ||
              (region.id === 'ashen-peaks' && row === 0 && column === 0) ||
              (region.id === 'glasslands' && row === 0 && column === 1) ||
              (region.id === 'fallen-capital' && row === 0 && column === 1),
            south: exits.has('south') ||
              (region.id === 'hearthglen' && row === 5 && column === 0) ||
              (region.id === 'drowned-marches' && row === 5 && column === 0) ||
              (region.id === 'ashen-peaks' && row === 5 && column === 1) ||
              (region.id === 'glasslands' && row === 5 && column === 1),
            east: exits.has('east'),
            west: exits.has('west'),
          },
        });
      }
    }
  }
  return cells;
}

export const WORLD_CELLS: readonly WorldCell[] = createWorldCells();
export const WORLD_CELL_BY_ID: ReadonlyMap<string, WorldCell> = new Map(
  WORLD_CELLS.map((cell) => [cell.id, cell]),
);
const WORLD_CELL_BY_COORDINATE: ReadonlyMap<string, WorldCell> = new Map(
  WORLD_CELLS.map((cell) => [`${cell.x}:${cell.y}`, cell]),
);
export const HEARTHGLEN_CELLS = WORLD_CELLS.filter((cell) => cell.regionId === 'hearthglen');

// Stable origins for saves made before the connected world-map layout.
export const ROOM_ORIGINS: Record<RoomId, { x: number; y: number }> = {
  village: { x: 0, y: WORLD_CELL_HEIGHT * 2 },
  woodland: { x: 0, y: WORLD_CELL_HEIGHT },
  ruins: { x: WORLD_CELL_WIDTH, y: WORLD_CELL_HEIGHT },
  sanctum: { x: WORLD_CELL_WIDTH, y: 0 },
  chapel: { x: WORLD_CELL_WIDTH * 3, y: WORLD_CELL_HEIGHT * 9 },
};

export function worldCellOrigin(id: string): { x: number; y: number } {
  const cell = WORLD_CELL_BY_ID.get(id);
  if (!cell) throw new Error(`Unknown world cell: ${id}`);
  return { x: cell.x, y: cell.y };
}

export function worldCellAt(x: number, y: number): WorldCell | undefined {
  if (x < 0 || y < 0 || x >= WORLD_WIDTH || y >= WORLD_HEIGHT) return undefined;
  const column = Math.floor(x / WORLD_CELL_WIDTH);
  const row = Math.floor(y / WORLD_CELL_HEIGHT);
  return WORLD_CELL_BY_COORDINATE.get(`${column * WORLD_CELL_WIDTH}:${row * WORLD_CELL_HEIGHT}`);
}

export function getWorldRegion(id: WorldRegionId): WorldRegionDefinition {
  const region = WORLD_REGIONS.find((candidate) => candidate.id === id);
  if (!region) throw new Error(`Unknown world region: ${id}`);
  return region;
}

export function oppositeWorldEdge(edge: WorldCellEdge): WorldCellEdge {
  return OPPOSITE_EDGE[edge];
}

export function adjacentWorldCell(cellId: string, edge: WorldCellEdge): WorldCell | undefined {
  const cell = WORLD_CELL_BY_ID.get(cellId);
  if (!cell) return undefined;
  const offset = EDGE_OFFSET[edge];
  return WORLD_CELL_BY_COORDINATE.get(
    `${cell.x + offset.column * WORLD_CELL_WIDTH}:${cell.y + offset.row * WORLD_CELL_HEIGHT}`,
  );
}

export function cellEdgeHasOpening(
  cellId: string,
  edge: WorldCellEdge,
  unlockedRegions: readonly WorldRegionId[] = ['hearthglen'],
  marchesTide: MarchesTide = 'high',
  silencedBells: readonly WorldRegionId[] = [],
): boolean {
  const cell = WORLD_CELL_BY_ID.get(cellId);
  const neighbor = adjacentWorldCell(cellId, edge);
  const tideShortcut =
    marchesTide === TIDE_SHORTCUT.openAt &&
    unlockedRegions.includes('drowned-marches') &&
    (
      (cellId === TIDE_SHORTCUT.from && edge === TIDE_SHORTCUT.edge && neighbor?.id === TIDE_SHORTCUT.to) ||
      (cellId === TIDE_SHORTCUT.to && edge === OPPOSITE_EDGE[TIDE_SHORTCUT.edge] && neighbor?.id === TIDE_SHORTCUT.from)
    );
  if (tideShortcut) return true;
  const hungerThreshold =
    (cellId === 'resolve-bell-sanctum' && edge === 'south') ||
    (cellId === 'first-hunger-sanctum' && edge === 'north');
  if (hungerThreshold && !BELL_REGION_IDS.every((region) => silencedBells.includes(region))) {
    return false;
  }

  return Boolean(
    cell?.contentReady &&
    neighbor?.contentReady &&
    cell?.exits[edge] &&
    neighbor?.exits[OPPOSITE_EDGE[edge]] &&
    (cell.regionId === neighbor.regionId ||
      (cell.id === 'mournwater-crossing' && neighbor.id === 'drowned-marches-01-01') ||
      (cell.id === 'drowned-marches-01-01' && neighbor.id === 'mournwater-crossing') ||
      (cell.id === 'northbound-sluice' && neighbor.id === 'frostline-stair') ||
      (cell.id === 'frostline-stair' && neighbor.id === 'northbound-sluice') ||
      (cell.id === 'glassward-gate' && neighbor.id === 'glassward-entry') ||
      (cell.id === 'glassward-entry' && neighbor.id === 'glassward-gate') ||
      (cell.id === 'capital-road' && neighbor.id === 'capital-south-gate') ||
      (cell.id === 'capital-south-gate' && neighbor.id === 'capital-road')) &&
    unlockedRegions.includes(cell.regionId) &&
    unlockedRegions.includes(neighbor.regionId),
  ) || Boolean(
    cell?.id === 'ruins' && edge === 'north' && neighbor?.id === 'sanctum' &&
    cell.exits[edge] && neighbor.exits.south,
  ) || Boolean(
    cell?.id === 'sanctum' && edge === 'south' && neighbor?.id === 'ruins' &&
    cell.exits[edge] && neighbor.exits.north,
  );
}

export function getVisibleWorldConnections(
  regionId: WorldRegionId,
  discoveredCellIds: readonly string[],
  unlockedRegions: readonly WorldRegionId[] = ['hearthglen'],
  marchesTide: MarchesTide = 'high',
  silencedBells: readonly WorldRegionId[] = [],
): Array<{ from: WorldCell; to: WorldCell }> {
  const discovered = new Set(discoveredCellIds);
  const connections: Array<{ from: WorldCell; to: WorldCell }> = [];
  for (const cell of WORLD_CELLS) {
    if (cell.regionId !== regionId) continue;
    for (const edge of ['east', 'south'] as const) {
      const neighbor = adjacentWorldCell(cell.id, edge);
      if (!neighbor || neighbor.regionId !== regionId ||
          (!discovered.has(cell.id) && !discovered.has(neighbor.id)) ||
          !cellEdgeHasOpening(cell.id, edge, unlockedRegions, marchesTide, silencedBells)) continue;
      connections.push({ from: cell, to: neighbor });
    }
  }
  return connections;
}

export function getWorldPathDirection(
  fromCellId: string,
  targetCellId: string,
  unlockedRegions: readonly WorldRegionId[] = ['hearthglen'],
  gateOpen = false,
  keyFound = false,
  marchesTide: MarchesTide = 'high',
  silencedBells: readonly WorldRegionId[] = [],
): WorldCellEdge | null {
  if (fromCellId === targetCellId) return null;
  if (!WORLD_CELL_BY_ID.get(targetCellId)?.contentReady) return null;

  const pending: { cellId: string; firstEdge: WorldCellEdge | null }[] = [
    { cellId: fromCellId, firstEdge: null },
  ];
  const visited = new Set([fromCellId]);
  const edges: readonly WorldCellEdge[] = ['north', 'east', 'south', 'west'];

  while (pending.length > 0) {
    const current = pending.shift();
    if (!current) break;

    for (const edge of edges) {
      const neighbor = adjacentWorldCell(current.cellId, edge);
      if (
        !neighbor ||
        visited.has(neighbor.id) ||
        !canCrossWorldBoundary(
          current.cellId,
          neighbor.id,
          WORLD_CELL_WIDTH / 2,
          WORLD_CELL_HEIGHT / 2,
          gateOpen,
          keyFound,
          unlockedRegions,
          marchesTide,
          silencedBells,
        )
      ) continue;

      const firstEdge = current.firstEdge ?? edge;
      if (neighbor.id === targetCellId) return firstEdge;
      visited.add(neighbor.id);
      pending.push({ cellId: neighbor.id, firstEdge });
    }
  }

  return null;
}

export function isWithinCellEdgeOpening(
  cellId: string,
  edge: WorldCellEdge,
  localX: number,
  localY: number,
  unlockedRegions?: readonly WorldRegionId[],
  marchesTide: MarchesTide = 'high',
  silencedBells: readonly WorldRegionId[] = [],
): boolean {
  if (!cellEdgeHasOpening(cellId, edge, unlockedRegions, marchesTide, silencedBells)) return false;
  const range = edge === 'north' || edge === 'south'
    ? WORLD_CELL_OPENING.vertical
    : WORLD_CELL_OPENING.horizontal;
  const position = edge === 'north' || edge === 'south' ? localX : localY;
  return position >= range.start && position <= range.end;
}

export function canCrossWorldBoundary(
  fromCellId: string,
  toCellId: string,
  localX: number,
  localY: number,
  gateOpen: boolean,
  keyFound: boolean,
  unlockedRegions?: readonly WorldRegionId[],
  marchesTide: MarchesTide = 'high',
  silencedBells: readonly WorldRegionId[] = [],
): boolean {
  const fromCell = WORLD_CELL_BY_ID.get(fromCellId);
  const toCell = WORLD_CELL_BY_ID.get(toCellId);
  if (!fromCell || !toCell) return false;

  const columnStep = Math.round((toCell.x - fromCell.x) / WORLD_CELL_WIDTH);
  const rowStep = Math.round((toCell.y - fromCell.y) / WORLD_CELL_HEIGHT);
  if (Math.abs(columnStep) + Math.abs(rowStep) !== 1) return false;
  const edge: WorldCellEdge = rowStep < 0 ? 'north'
    : rowStep > 0 ? 'south'
      : columnStep < 0 ? 'west' : 'east';
  const { start, end } = rowStep === 0
    ? WORLD_CELL_OPENING.horizontal
    : WORLD_CELL_OPENING.vertical;
  const position = rowStep === 0 ? localY : localX;
  if (
    position < start || position > end ||
    !cellEdgeHasOpening(fromCellId, edge, unlockedRegions, marchesTide, silencedBells)
  ) return false;

  if (fromCell.id === 'sanctum' && toCell.id !== 'ruins') return false;
  if (toCell.id === 'sanctum') {
    return fromCell.id === 'ruins' && Math.abs(localX - 320) < 56 && gateOpen && keyFound;
  }
  return true;
}

export function roomAt(x: number, y: number): RoomId {
  return worldCellAt(x, y)?.roomId ?? 'woodland';
}
