import assert from 'node:assert/strict';
import test from 'node:test';
import { getOverworldMapMarkers } from './overworldMapMarkers';
import {
  WORLD_CELLS,
  WORLD_HEIGHT,
  WORLD_REGION_CELL_COUNT,
  WORLD_REGION_IDS,
  WORLD_REGION_PORTALS,
  WORLD_REGION_ROWS,
  WORLD_WIDTH,
  adjacentWorldCell,
  canCrossWorldBoundary,
  cellEdgeHasOpening,
  getVisibleWorldConnections,
  getWorldPathDirection,
  oppositeWorldEdge,
} from './worldMap.ts';
import { DUNGEONS } from './dungeons.ts';

const EDGES = ['north', 'south', 'east', 'west'] as const;

type RouteStage = {
  name: string;
  unlockedRegions: readonly (typeof WORLD_REGION_IDS)[number][];
  silencedBells: readonly (typeof WORLD_REGION_IDS)[number][];
  objectives: readonly string[];
};

function findPlayableRoute(
  fromCellId: string,
  targetCellId: string,
  unlockedRegions: RouteStage['unlockedRegions'],
  silencedBells: RouteStage['silencedBells'],
  gateOpen = false,
  keyFound = false,
): string[] | null {
  const pending = [[fromCellId]];
  const visited = new Set([fromCellId]);

  while (pending.length) {
    const route = pending.shift();
    assert.ok(route);
    const currentId = route[route.length - 1];
    if (currentId === targetCellId) return route;
    assert.ok(currentId);

    for (const edge of EDGES) {
      const neighbor = adjacentWorldCell(currentId, edge);
      if (
        !neighbor ||
        visited.has(neighbor.id) ||
        !canCrossWorldBoundary(
          currentId,
          neighbor.id,
          320,
          240,
          gateOpen,
          keyFound,
          unlockedRegions,
          'high',
          silencedBells,
        )
      ) continue;
      visited.add(neighbor.id);
      pending.push([...route, neighbor.id]);
    }
  }

  return null;
}

test('the world data contains six 6-by-10 regions without coordinate collisions', () => {
  assert.equal(WORLD_REGION_IDS.length, 6);
  assert.equal(WORLD_CELLS.length, 6 * WORLD_REGION_CELL_COUNT);
  assert.equal(WORLD_REGION_ROWS, 6);
  assert.equal(new Set(WORLD_CELLS.map(({ id }) => id)).size, WORLD_CELLS.length);
  assert.equal(new Set(WORLD_CELLS.map(({ x, y }) => `${x}:${y}`)).size, WORLD_CELLS.length);
  for (const cell of WORLD_CELLS) {
    assert.ok(cell.x >= 0 && cell.x < WORLD_WIDTH, `${cell.id} x is in bounds`);
    assert.ok(cell.y >= 0 && cell.y < WORLD_HEIGHT, `${cell.id} y is in bounds`);
  }
});

test('every realm entrance and exit marker points to a playable screen in that realm', () => {
  for (const regionId of WORLD_REGION_IDS) {
    const markers = WORLD_REGION_PORTALS[regionId];
    const entrance = WORLD_CELLS.find((cell) => cell.id === markers.entranceCellId);
    const exit = WORLD_CELLS.find((cell) => cell.id === markers.exitCellId);

    assert.ok(entrance, `${regionId} entrance marker has a map cell`);
    assert.ok(exit, `${regionId} exit marker has a map cell`);
    assert.equal(entrance.regionId, regionId, `${regionId} entrance belongs to its region`);
    assert.equal(exit.regionId, regionId, `${regionId} exit belongs to its region`);
    assert.ok(entrance.contentReady, `${regionId} entrance is on a playable screen`);
    assert.ok(exit.contentReady, `${regionId} exit is on a playable screen`);
  }
});

test('each region is a connected maze with reciprocal, adjacent exits', () => {
  for (const regionId of WORLD_REGION_IDS) {
    const regionCells = WORLD_CELLS.filter((cell) => cell.regionId === regionId);
    assert.equal(regionCells.length, WORLD_REGION_CELL_COUNT, `${regionId} cell count`);
    const playableCells = regionCells.filter((cell) => cell.contentReady);
    const start = playableCells[0];
    assert.ok(start, `${regionId} has playable screens`);
    const reached = new Set([start.id]);
    const pending = [start];
    for (const cell of regionCells) {
      for (const edge of EDGES) {
        if (!cell.exits[edge]) continue;
        const neighbor = adjacentWorldCell(cell.id, edge);
        assert.ok(neighbor, `${cell.id} ${edge} exit has a neighbor`);
        assert.ok(
          neighbor.regionId === regionId ||
          (cell.id === 'mournwater-crossing' && neighbor.id === 'drowned-marches-01-01') ||
          (cell.id === 'drowned-marches-01-01' && neighbor.id === 'mournwater-crossing') ||
          (cell.id === 'northbound-sluice' && neighbor.id === 'frostline-stair') ||
           (cell.id === 'frostline-stair' && neighbor.id === 'northbound-sluice') ||
           (cell.id === 'glassward-gate' && neighbor.id === 'glassward-entry') ||
           (cell.id === 'glassward-entry' && neighbor.id === 'glassward-gate') ||
           (cell.id === 'capital-road' && neighbor.id === 'capital-south-gate') ||
           (cell.id === 'capital-south-gate' && neighbor.id === 'capital-road'),
          `${cell.id} exit only crosses the authored regional bridge`,
        );
        assert.equal(neighbor.exits[oppositeWorldEdge(edge)], true, `${cell.id} ${edge} is reciprocal`);
      }
    }
    while (pending.length) {
      const cell = pending.pop()!;
      for (const edge of EDGES) {
        if (!cell.exits[edge]) continue;
        const neighbor = adjacentWorldCell(cell.id, edge);
        if (neighbor?.regionId === regionId && neighbor.contentReady && !reached.has(neighbor.id)) {
          reached.add(neighbor.id);
          pending.push(neighbor);
        }
      }
    }
    assert.equal(reached.size, playableCells.length, `${regionId} playable screens are reachable as a maze`);
  }
});

test('the five large realms use at least 90% of their cells and Realm 6 is a four-screen final route', () => {
  const playableByRegion = new Map<WorldRegionId, number>();
  for (const regionId of WORLD_REGION_IDS) {
    playableByRegion.set(regionId, WORLD_CELLS.filter(
      (cell) => cell.regionId === regionId && cell.contentReady,
    ).length);
  }
  for (const regionId of WORLD_REGION_IDS.filter((id) => id !== 'first-hunger')) {
    assert.ok(playableByRegion.get(regionId)! >= 54, `${regionId} must make at least 54 of 60 screens playable`);
  }
  assert.equal(playableByRegion.get('drowned-marches'), 54);
  const finalRoute = WORLD_CELLS.filter((cell) => cell.regionId === 'first-hunger' && cell.contentReady);
  assert.deepEqual(finalRoute.map((cell) => cell.id), [
    'hunger-0-0', 'hunger-0-1', 'hunger-0-2', 'hunger-0-3',
  ]);
  assert.equal(playableByRegion.get('first-hunger'), 4);
  assert.equal(adjacentWorldCell('hunger-0-0', 'east')?.id, 'hunger-0-1');
  assert.equal(adjacentWorldCell('hunger-0-1', 'east')?.id, 'hunger-0-2');
  assert.equal(adjacentWorldCell('hunger-0-2', 'east')?.id, 'hunger-0-3');
});

test('the Fallen Capital survivor camp is a reachable, authored safe map cell', () => {
  const camp = WORLD_CELLS.find((cell) => cell.id === 'capital-survivors-hold');
  assert.ok(camp);
  assert.equal(camp.regionId, 'fallen-capital');
  assert.equal(camp.contentReady, true);
  assert.equal(adjacentWorldCell('fallen-archive', 'east')?.id, camp.id);
  assert.equal(WORLD_CELLS.find((cell) => cell.id === 'fallen-archive')?.exits.east, true);
  assert.equal(camp.exits.west, true);
});

test('the three Marches dungeon entrances are on separated map branches', () => {
  const entrances = DUNGEONS
    .filter((dungeon) => dungeon.regionId === 'drowned-marches' && dungeon.role === 'mini')
    .map((dungeon) => {
      const cell = WORLD_CELLS.find((candidate) => candidate.id === dungeon.entryCellId);
      assert.ok(cell, `${dungeon.label} has an overworld entrance`);
      return cell;
    });
  assert.equal(entrances.length, 3);
  for (let i = 0; i < entrances.length; i += 1) {
    for (let j = i + 1; j < entrances.length; j += 1) {
      const a = entrances[i]!;
      const b = entrances[j]!;
      assert.ok(Math.abs(a.row - b.row) + Math.abs(a.column - b.column) > 1,
        `${a.label} and ${b.label} are not adjacent dungeon sites`);
    }
  }
});

test('only authored screens connect in the playable first region and the sanctum stays gated', () => {
  assert.equal(cellEdgeHasOpening('village', 'north'), true);
  assert.equal(cellEdgeHasOpening('village', 'east'), true);
  assert.equal(cellEdgeHasOpening('village', 'west'), false);
  assert.equal(cellEdgeHasOpening('village', 'south'), false);
  assert.equal(cellEdgeHasOpening('mournwater-crossing', 'south'), false);
  assert.equal(cellEdgeHasOpening('mournwater-crossing', 'south', ['hearthglen', 'drowned-marches']), true);
  assert.equal(
    canCrossWorldBoundary('village', 'briarwood', 320, 18, false, false),
    true,
  );
  assert.equal(
    canCrossWorldBoundary('mournwater-crossing', 'drowned-marches-01-01', 320, 462, false, false, ['hearthglen', 'drowned-marches']),
    true,
  );
  assert.equal(
    canCrossWorldBoundary('ruins', 'sanctum', 320, 18, false, false),
    false,
  );
  assert.equal(
    canCrossWorldBoundary('ruins', 'sanctum', 320, 18, true, true),
    true,
  );
  assert.equal(
    canCrossWorldBoundary('village', 'hearthglen-05-01', 320, 462, false, false),
    false,
  );
});

test('field map shows exits from discovered cells into fogged neighboring cells', () => {
  const unlocked = ['hearthglen'] as const;
  const allHearthglenCells = WORLD_CELLS
    .filter((cell) => cell.regionId === 'hearthglen')
    .map((cell) => cell.id);
  const authoredConnections = getVisibleWorldConnections('hearthglen', allHearthglenCells, unlocked);
  assert.ok(authoredConnections.length > 0, 'Hearthglen has authored exits');

  const connection = authoredConnections[0]!;
  const discoveredIds = [connection.from.id];
  assert.ok(!discoveredIds.includes(connection.to.id), 'the far end remains undiscovered');
  assert.ok(getVisibleWorldConnections('hearthglen', discoveredIds, unlocked).some(({ from, to }) =>
    from.id === connection.from.id && to.id === connection.to.id));
  assert.deepEqual(getVisibleWorldConnections('hearthglen', [], unlocked), []);
});

test('overworld dungeon and treasure markers appear when a screen is visited, without interacting', () => {
  const hiddenDungeon = getOverworldMapMarkers('heartwood-burrow', [], []);
  assert.deepEqual(hiddenDungeon.dungeons, []);
  assert.equal(hiddenDungeon.treasure, null);

  const visitedDungeon = getOverworldMapMarkers('heartwood-burrow', ['heartwood-burrow'], []);
  assert.equal(visitedDungeon.dungeons.some((dungeon) => dungeon.id === 'heartwood-burrow'), true);

  const visitedCache = getOverworldMapMarkers('briar-hidden-grove', ['briar-hidden-grove'], []);
  assert.equal(visitedCache.treasure, 'available');
  assert.equal(
    getOverworldMapMarkers('briar-hidden-grove', ['briar-hidden-grove'], ['briar-hidden-grove']).treasure,
    'collected',
  );
});

test('the authored Drowned Marches route reaches a real Sunken Chapel cell', () => {
  const unlocked = ['hearthglen', 'drowned-marches'] as const;
  for (const [cell, edge] of [
    ['sunken-chapel-approach', 'south'],
    ['reedveil-crossing', 'east'],
    ['chapel-forecourt', 'south'],
  ] as const) {
    assert.equal(cellEdgeHasOpening(cell, edge, unlocked), true, `${cell} should continue the chapel route`);
  }
  assert.equal(WORLD_CELLS.find((cell) => cell.id === 'sunken-chapel')?.contentReady, true);
  assert.equal(WORLD_CELLS.find((cell) => cell.id === 'sunken-chapel')?.roomId, 'chapel');
});

test('Mournwater is an authored, connected town branching off the Marches entrance', () => {
  const town = WORLD_CELLS.find((cell) => cell.id === 'mournwater-town');
  assert.ok(town);
  assert.equal(town.regionId, 'drowned-marches');
  assert.equal(town.roomId, 'village');
  assert.equal(town.contentReady, true);
  assert.equal(adjacentWorldCell('drowned-marches-01-01', 'east')?.id, 'mournwater-town');
  assert.equal(adjacentWorldCell('mournwater-town', 'south')?.id, 'drowned-ferry');
  assert.deepEqual(
    findPlayableRoute('drowned-marches-01-01', 'mournwater-town', ['hearthglen', 'drowned-marches'], []),
    ['drowned-marches-01-01', 'mournwater-town'],
  );
  assert.equal(
    findPlayableRoute('drowned-marches-01-01', 'mournwater-town', ['hearthglen'], []),
    null,
  );
});

test('the Reedveil ford is reciprocal at low tide and the permanent return route stays open at high tide', () => {
  const unlocked = ['hearthglen', 'drowned-marches'] as const;

  assert.equal(cellEdgeHasOpening('reedveil-crossing', 'south', unlocked, 'low'), true);
  assert.equal(cellEdgeHasOpening('bellkeeper-causeway', 'north', unlocked, 'low'), true);
  assert.equal(cellEdgeHasOpening('reedveil-crossing', 'south', unlocked, 'high'), false);
  assert.equal(cellEdgeHasOpening('bellkeeper-causeway', 'north', unlocked, 'high'), false);

  assert.equal(
    canCrossWorldBoundary('reedveil-crossing', 'bellkeeper-causeway', 320, 18, false, false, unlocked, 'low'),
    true,
  );
  assert.equal(
    canCrossWorldBoundary('bellkeeper-causeway', 'reedveil-crossing', 320, 462, false, false, unlocked, 'low'),
    true,
  );
  assert.equal(
    canCrossWorldBoundary('reedveil-crossing', 'bellkeeper-causeway', 320, 18, false, false, unlocked, 'high'),
    false,
  );
  assert.equal(getWorldPathDirection('reedveil-crossing', 'bellkeeper-causeway', unlocked, false, false, 'low'), 'south');
  assert.equal(getWorldPathDirection('reedveil-crossing', 'bellkeeper-causeway', unlocked, false, false, 'high'), 'east');
  assert.equal(getWorldPathDirection('bellkeeper-causeway', 'reedveil-crossing', unlocked, false, false, 'high'), 'east');
});

test('the authored floodway reaches the Ashen Peaks without exposing placeholder cells', () => {
  const unlocked = ['hearthglen', 'drowned-marches', 'ashen-peaks'] as const;
  const route = [
    ['sunken-chapel', 'west'],
    ['bellkeeper-causeway', 'west'],
    ['drowned-waystones', 'west'],
    ['wreckers-reach', 'south'],
    ['old-floodgate', 'south'],
    ['northbound-sluice', 'south'],
    ['frostline-stair', 'east'],
  ] as const;
  for (const [cell, edge] of route) {
    assert.equal(cellEdgeHasOpening(cell, edge, unlocked), true, `${cell} should open along the authored route`);
    assert.equal(WORLD_CELLS.find((entry) => entry.id === cell)?.contentReady, true, `${cell} is authored`);
  }
  assert.equal(cellEdgeHasOpening('northbound-sluice', 'south', ['hearthglen', 'drowned-marches']), false);
  assert.equal(cellEdgeHasOpening('northbound-sluice', 'south', unlocked), true);
  assert.equal(WORLD_CELLS.find((cell) => cell.id === 'drowned-marches-06-02')?.contentReady, false);
  assert.ok(WORLD_CELLS.some((cell) => cell.regionId === 'ashen-peaks' && !cell.contentReady),
    'a small number of difficult or unreachable map cells remain unbuilt');
});

test('the authored Ashen trail reaches playable Glasslands and Fallen Capital bell screens', () => {
  const unlocked = ['hearthglen', 'drowned-marches', 'ashen-peaks', 'glasslands', 'fallen-capital'] as const;
  const route = [
    ['cinderwatch-approach', 'south'],
    ['ashbound-trail', 'south'],
    ['blackglass-pass', 'south'],
    ['last-ash-watch', 'south'],
    ['glassward-slope', 'south'],
    ['glassward-gate', 'south'],
    ['glassward-entry', 'south'],
    ['petrified-garden', 'south'],
    ['joy-bell-sanctum', 'south'],
    ['mirrorwalk', 'south'],
    ['stillwater-glass', 'south'],
    ['capital-road', 'south'],
    ['capital-south-gate', 'south'],
    ['fallen-archive', 'south'],
  ] as const;
  for (const [cellId, edge] of route) {
    assert.equal(cellEdgeHasOpening(cellId, edge, unlocked), true, `${cellId} should continue the authored trail`);
    assert.equal(WORLD_CELLS.find((cell) => cell.id === cellId)?.contentReady, true, `${cellId} is authored`);
  }
  assert.equal(WORLD_CELLS.find((cell) => cell.id === 'resolve-bell-sanctum')?.contentReady, true);
  assert.equal(cellEdgeHasOpening('glassward-gate', 'south', unlocked), true);
  assert.equal(cellEdgeHasOpening('glassward-entry', 'north', unlocked), true);
  assert.equal(cellEdgeHasOpening('capital-road', 'south', unlocked), true);
  assert.equal(cellEdgeHasOpening('capital-south-gate', 'north', unlocked), true);
  assert.equal(cellEdgeHasOpening('glassward-gate', 'south', ['hearthglen', 'drowned-marches', 'ashen-peaks']), false);
  assert.equal(getWorldPathDirection('cinderwatch-approach', 'joy-bell-sanctum', unlocked), 'south');
  assert.notEqual(getWorldPathDirection('joy-bell-sanctum', 'resolve-bell-sanctum', unlocked), null);
});

test('Glasslands maze routes connect the entrance, town, three lairs, hidden caches, and Joy Bell', () => {
  const unlocked = ['hearthglen', 'drowned-marches', 'ashen-peaks', 'glasslands'] as const;
  const glasslands = WORLD_CELLS.filter((cell) => cell.regionId === 'glasslands');
  const authored = glasslands.filter((cell) => cell.contentReady);
  assert.equal(authored.length, 54);
  const requiredSites = [
    'glassward-entry', 'petrified-garden', 'joy-bell-sanctum', 'mirrorwalk',
    'stillwater-glass', 'capital-road', 'gleamharbor', 'chimevault-steps',
    'dawn-passage', 'heartglass-door', 'echoing-orchard', 'orchard-of-moths',
    'last-mirror-grove',
  ];
  for (const id of requiredSites) {
    assert.ok(authored.some((cell) => cell.id === id), `${id} is authored and playable`);
  }
  for (const cell of authored) {
    for (const edge of EDGES) {
      if (!cellEdgeHasOpening(cell.id, edge, unlocked)) continue;
      const neighbor = adjacentWorldCell(cell.id, edge);
      assert.ok(neighbor?.contentReady, `${cell.id} ${edge} does not expose a blank cell`);
      assert.equal(cellEdgeHasOpening(neighbor!.id, oppositeWorldEdge(edge), unlocked), true,
        `${cell.id} ${edge} has a reciprocal opening`);
    }
  }
  assert.ok(findPlayableRoute('glassward-entry', 'joy-bell-sanctum', unlocked, [])?.length);
  for (const target of ['gleamharbor', 'chimevault-steps', 'dawn-passage', 'heartglass-door',
    'echoing-orchard', 'orchard-of-moths', 'last-mirror-grove']) {
    assert.ok(findPlayableRoute('glassward-entry', target, unlocked, []), `${target} has a walkable route`);
  }
  for (const cell of glasslands.filter((entry) => !entry.contentReady)) {
    assert.equal(EDGES.some((edge) => cellEdgeHasOpening(cell.id, edge, unlocked)), false,
      `${cell.id} remains a blocked placeholder`);
  }
});

test('the Hunger’s hollow opens only after all five bells are silent', () => {
  const unlocked = WORLD_REGION_IDS;
  const fourBells = WORLD_REGION_IDS.filter((region) => region !== 'ashen-peaks');
  const route = [
    ['resolve-bell-sanctum', 'south'],
    ['first-hunger-sanctum', 'north'],
  ] as const;

  assert.equal(WORLD_CELLS.find((cell) => cell.id === 'first-hunger-sanctum')?.contentReady, true);
  assert.equal(WORLD_CELLS.find((cell) => cell.id === 'first-hunger-sanctum')?.roomId, 'sanctum');
  for (const [cellId, edge] of route) {
    assert.equal(cellEdgeHasOpening(cellId, edge, unlocked, 'high', fourBells), false);
    assert.equal(cellEdgeHasOpening(cellId, edge, unlocked, 'high', WORLD_REGION_IDS), true);
  }
  assert.equal(
    getWorldPathDirection('resolve-bell-sanctum', 'first-hunger-sanctum', unlocked, false, false, 'high', fourBells),
    null,
  );
  assert.equal(
    getWorldPathDirection('resolve-bell-sanctum', 'first-hunger-sanctum', unlocked, false, false, 'high', WORLD_REGION_IDS),
    'south',
  );
  assert.equal(
    canCrossWorldBoundary('resolve-bell-sanctum', 'first-hunger-sanctum', 320, 462, false, false, unlocked, 'high', fourBells),
    false,
  );
  assert.equal(
    canCrossWorldBoundary('resolve-bell-sanctum', 'first-hunger-sanctum', 320, 462, false, false, unlocked, 'high', WORLD_REGION_IDS),
    true,
  );
});

test('every authored main-story objective has a collision-passable route at its story stage', () => {
  const stages: readonly RouteStage[] = [
    {
      name: 'Hearthglen',
      unlockedRegions: ['hearthglen'],
      silencedBells: [],
      objectives: ['village', 'ruins', 'sanctum'],
    },
    {
      name: 'The Drowned Marches',
      unlockedRegions: ['hearthglen', 'drowned-marches'],
      silencedBells: ['hearthglen'],
      objectives: [
        'mournwater-crossing',
        'drowned-ferry',
        'sunken-chapel-approach',
        'reedveil-crossing',
        'chapel-forecourt',
        'sunken-chapel',
        'bellkeeper-causeway',
        'drowned-waystones',
        'wreckers-reach',
        'old-floodgate',
        'northbound-sluice',
      ],
    },
    {
      name: 'The Ashen Peaks',
      unlockedRegions: ['hearthglen', 'drowned-marches', 'ashen-peaks'],
      silencedBells: ['hearthglen', 'drowned-marches'],
      objectives: [
        'frostline-stair',
        'cinderwatch-approach',
        'ashbound-trail',
        'blackglass-pass',
        'last-ash-watch',
        'glassward-slope',
        'glassward-gate',
      ],
    },
    {
      name: 'The Glasslands',
      unlockedRegions: ['hearthglen', 'drowned-marches', 'ashen-peaks', 'glasslands'],
      silencedBells: ['hearthglen', 'drowned-marches', 'ashen-peaks'],
      objectives: [
        'glassward-entry',
        'petrified-garden',
        'joy-bell-sanctum',
        'mirrorwalk',
        'stillwater-glass',
        'capital-road',
      ],
    },
    {
      name: 'The Fallen Capital',
      unlockedRegions: [
        'hearthglen',
        'drowned-marches',
        'ashen-peaks',
        'glasslands',
        'fallen-capital',
      ],
      silencedBells: ['hearthglen', 'drowned-marches', 'ashen-peaks', 'glasslands'],
      objectives: ['capital-south-gate', 'fallen-archive', 'resolve-bell-sanctum'],
    },
    {
      name: 'The First Hunger',
      unlockedRegions: WORLD_REGION_IDS,
      silencedBells: ['hearthglen', 'drowned-marches', 'ashen-peaks', 'glasslands', 'fallen-capital'],
      objectives: ['first-hunger-sanctum'],
    },
  ];

  for (const stage of stages) {
    for (const objective of stage.objectives) {
      const cell = WORLD_CELLS.find((candidate) => candidate.id === objective);
      assert.ok(cell?.contentReady, `${stage.name}: ${objective} must be authored`);
      const route = findPlayableRoute(
        'village',
        objective,
        stage.unlockedRegions,
        stage.silencedBells,
        objective === 'sanctum',
        objective === 'sanctum',
      );
      assert.ok(route, `${stage.name}: ${objective} must be reachable from the journey start`);

      for (let index = 1; index < route.length; index += 1) {
        const fromId = route[index - 1];
        const toId = route[index];
        assert.ok(fromId && toId);
        const from = WORLD_CELLS.find((candidate) => candidate.id === fromId);
        const to = WORLD_CELLS.find((candidate) => candidate.id === toId);
        assert.ok(from && to);
        assert.ok(
          canCrossWorldBoundary(
            fromId,
            toId,
            320,
            240,
            objective === 'sanctum',
            objective === 'sanctum',
            stage.unlockedRegions,
            'high',
            stage.silencedBells,
          ),
          `${stage.name}: ${fromId} → ${toId} must be passable at the opening`,
        );
      }
    }
  }

  assert.equal(
    findPlayableRoute(
      'village',
      'first-hunger-sanctum',
      ['hearthglen', 'drowned-marches', 'ashen-peaks', 'glasslands', 'fallen-capital'],
      ['hearthglen', 'drowned-marches', 'ashen-peaks', 'glasslands'],
    ),
    null,
    'the final route must remain closed until all five bells are silent',
  );
});

test('Guide finds a shortest route through one of the available maze branches', () => {
  const direction = getWorldPathDirection('village', 'riverbend', ['hearthglen']);
  assert.equal(direction, 'north');
  assert.ok(direction);
  assert.equal(cellEdgeHasOpening('village', direction, ['hearthglen']), true);
  assert.equal(getWorldPathDirection('briarwood', 'riverbend', ['hearthglen']), 'east');
  assert.equal(getWorldPathDirection('southfield', 'riverbend', ['hearthglen']), 'north');
  assert.equal(getWorldPathDirection('village', 'village', ['hearthglen']), null);
});

test('Guide does not point into dead ends, placeholder screens, or a locked gate', () => {
  assert.equal(
    getWorldPathDirection('village', 'hearthglen-05-01', ['hearthglen']),
    null,
  );
  assert.equal(
    getWorldPathDirection('village', 'sanctum', ['hearthglen'], false, false),
    null,
  );
  assert.equal(
    getWorldPathDirection('village', 'frostline-stair', ['hearthglen', 'drowned-marches']),
    null,
  );
  assert.equal(
    getWorldPathDirection('village', 'sanctum', ['hearthglen'], true, true),
    'north',
  );
});

test('Guide recognizes a newly unlocked connection into the Ashen Peaks', () => {
  const lockedRegions = ['hearthglen', 'drowned-marches'] as const;
  const unlockedRegions = [...lockedRegions, 'ashen-peaks'] as const;
  assert.equal(
    getWorldPathDirection('northbound-sluice', 'frostline-stair', lockedRegions),
    null,
  );
  assert.equal(
    getWorldPathDirection('northbound-sluice', 'frostline-stair', unlockedRegions),
    'south',
  );
});
