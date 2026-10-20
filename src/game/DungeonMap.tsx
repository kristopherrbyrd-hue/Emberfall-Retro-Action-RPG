import React from 'react';
import { DUNGEON_COLUMNS, DUNGEON_ROWS, dungeonById, dungeonPassageState, initialDungeonProgress } from './dungeons';
import { PostgameWaveBadge } from './PostgameWaveBadge';
import { describePostgameWave, type PostgameWaveStatus } from './postgame';
import type { WorldCellEdge } from './worldMap';
import type { WorldProgress } from './worldProgress';

export function DungeonMap({ world, getWaveStatus }: {
  world: WorldProgress;
  getWaveStatus?: (cell: string) => PostgameWaveStatus | null;
}) {
  const visit = world.activeDungeon;
  const dungeon = visit && dungeonById(visit.id);
  if (!visit || !dungeon) return null;
  const progress = world.dungeons[visit.id] ?? initialDungeonProgress();
  const known = new Set(progress?.discoveredRooms);
  known.add(visit.roomId);
  const edges: WorldCellEdge[] = ['north', 'south', 'east', 'west'];
  const endpoints = { north: [50, 0], south: [50, 100], east: [100, 50], west: [0, 50] } as const;
  return <div className="overlay-content map-content">
    <div className="map-region-title"><div><span>NESTED LAIR · 4 × 8</span><b>{dungeon.label}</b></div>
      <i>{known.size} / {dungeon.rooms.length} chambers found</i></div>
    <div className="map-paper dungeon-map-paper">
      <div className="overworld-grid dungeon-grid" style={{ gridTemplateColumns: `repeat(${DUNGEON_COLUMNS}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${DUNGEON_ROWS}, minmax(0, 1fr))` }}>
        {Array.from({ length: DUNGEON_ROWS * DUNGEON_COLUMNS }, (_, index) => {
          const room = dungeon.rooms.find((r) => r.row === Math.floor(index / DUNGEON_COLUMNS) && r.column === index % DUNGEON_COLUMNS);
          const discovered = room && known.has(room.id);
          const passages = discovered ? edges.map((edge) => ({
            edge, state: dungeonPassageState(dungeon.id, room, edge, progress),
          })).filter(({ state }) => state !== 'wall') : [];
          const waveStatus = discovered ? getWaveStatus?.(`${dungeon.id}/${room.id}`) ?? null : null;
          const description = discovered
            ? `${room.label}${room.id === visit.roomId ? ', your current location' : ''}. ${passages.map(({ edge, state }) => `${edge} ${state}`).join(', ')}${waveStatus ? `. ${describePostgameWave(waveStatus)}` : ''}`
            : 'Unexplored stone';
          return <div key={index} className={`overworld-cell dungeon-cell ${discovered ? 'is-discovered' : 'is-unknown'} ${room?.id === visit.roomId ? 'is-current' : ''}`}
            aria-label={description} title={description}>
            {discovered && <><svg className="dungeon-passages" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              {passages.map(({ edge, state }) => <line key={edge} data-edge={edge} className={`passage-${state}`}
                x1="50" y1="50" x2={endpoints[edge][0]} y2={endpoints[edge][1]} />)}
              <circle cx="50" cy="50" r="7" />
            </svg><b>{room.label}</b></>}
            {waveStatus && <PostgameWaveBadge status={waveStatus} />}
            {room?.id === visit.roomId && <i>YOU</i>}
          </div>;
        })}
      </div>
    </div>
    <div className="map-legend"><span>Solid lines: open passages. Dashed amber lines: locked doors. Black cells: unexplored stone.</span>
      <span>Current chamber: {dungeon.rooms.find((room) => room.id === visit.roomId)?.label}</span>
      <span>{progress?.doorOpen ? 'Inner door: OPEN' : 'Inner door: SEALED'} · {progress?.bossDefeated ? 'Warden defeated · return door open' : `${dungeon.bossName ?? 'Anchor Warden'} awaits`}</span>
      <small>The landing returns to the original entrance at any time.</small>
    </div>
  </div>;
}
