import React from 'react';
import type { PostgameWaveStatus } from './postgame';

function formatWaveTimer(remainingMs: number | null): string {
  if (remainingMs === null) return 'LIVE';
  const totalSeconds = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function PostgameWaveBadge({ status }: { status: PostgameWaveStatus }) {
  const multiplier = Number.isFinite(status.nextWaveMultiplier)
    ? `×${status.nextWaveMultiplier.toFixed(2)}`
    : 'MAX';
  return <span className="map-wave-status" aria-hidden="true">
    <span>C{status.clearCount}</span>
    <span>{multiplier}</span>
    <span>{formatWaveTimer(status.remainingMs)}</span>
  </span>;
}
