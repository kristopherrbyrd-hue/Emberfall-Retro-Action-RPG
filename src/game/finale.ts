export type FinaleStage = 'unseen' | 'duel' | 'choice' | 'solo-duel' | 'battle' | 'restoring' | 'complete';
export type FinaleProgress = {
  stage: FinaleStage;
  allied: boolean | null;
  restorationMs: number;
  restorationDurationMs?: number;
};

// Presentation data only: a replay must never become saved finale progress.
export type RestorationPresentation = {
  ms: number;
  allied: boolean | null;
  replay: boolean;
};

// One saved clock drives camera cuts, actor choreography, captions and saturation.
// Keeping shots deterministic makes a mid-cinematic reload resume, not replay.
export const RESTORATION_SHOTS = [
  { id: 'eruption', cellId: 'hunger-0-3', label: 'The First Hunger', emotion: 'release', tint: 0xffffff, startMs: 0, durationMs: 7000,
    caption: 'The Hunger breaks. Every stolen feeling bursts free.' },
  { id: 'wonder', cellId: 'village', label: 'Hearthglen', emotion: 'wonder', tint: 0xffd64a, startMs: 7000, durationMs: 7000,
    caption: 'In Hearthglen, children reach for golden light. The old look up in wonder.' },
  { id: 'grief', cellId: 'drowned-ferry', label: 'Mournwater · Drowned Marches', emotion: 'grief', tint: 0x49aaff, startMs: 14000, durationMs: 7000,
    caption: 'At Mournwater, tears come at last. Neighbors hold one another and remember the lost.' },
  { id: 'courage', cellId: 'cinderwatch-approach', label: 'Cinderwatch · Ashen Peaks', emotion: 'courage', tint: 0xff4b55, startMs: 21000, durationMs: 7000,
    caption: 'Cinderwatch stands together. Fear remains—but so does the courage to take another step.' },
  { id: 'laughter', cellId: 'petrified-garden', label: 'Glasslands', emotion: 'laughter', tint: 0x56f286, startMs: 28000, durationMs: 7000,
    caption: 'Laughter crosses the Glasslands. Friends dance, and the gardens wake in living color.' },
  { id: 'resolve', cellId: 'capital-south-gate', label: 'Fallen Capital', emotion: 'resolve', tint: 0xad64ff, startMs: 35000, durationMs: 7000,
    caption: 'In the Capital, hands lift fallen stones. Resolve is not an order: it is a choice to rebuild.' },
  { id: 'companions', cellId: 'hunger-0-3', label: 'After the Hunger', emotion: 'release', tint: 0xffffff, startMs: 42000, durationMs: 6000,
    caption: 'The last stolen colors leave the empty prison.' },
  { id: 'freedom', cellId: 'village', label: 'Emberfall · Free to feel', emotion: 'celebration', tint: 0xffd64a, startMs: 48000, durationMs: 8000,
    caption: 'The bells are no longer necessary. Humanity is free to feel.' },
] as const;
export const RESTORATION_DURATION_MS = 56_000;

export function getRestorationShot(restorationMs: number) {
  const time = Math.max(0, Math.min(RESTORATION_DURATION_MS, restorationMs));
  return RESTORATION_SHOTS.find((shot) => time < shot.startMs + shot.durationMs)
    ?? RESTORATION_SHOTS[RESTORATION_SHOTS.length - 1];
}

export function getRestorationCaption(restorationMs: number, allied: boolean | null): string {
  const shot = getRestorationShot(restorationMs);
  if (shot.id !== 'companions') return shot.caption;
  return allied
    ? 'Maelis fought beside you. Now she lowers her weapon: “No keepers. No borrowed feelings. We are free.”'
    : 'You faced the Hunger alone. At her Vigil, Maelis sees the colors return. Humanity needs neither keepers nor bells.';
}
// Level-25, three-piece endgame gear, and trained class powers. The Hunger
// resists ordinary stagger so rapid input cannot disable its attack phases.
export const HUNGER_BALANCE = {
  health: 54000, damage: 48,
} as const;
export const MAELIS_OPENING = '“The bells return feelings stolen by the First Hunger. They do not create them. Every generation has lived on what the creature releases through its prison.”\n\nYou answer: “And your solution drains the emotion and color from everyone. Look at this world!”\n\n“I know what I have cost them,” Maelis says. “But this dependence must end. If you would stop me, draw your weapon.”';
export const MAELIS_OFFER = 'Maelis lowers her weapon, wounded but still standing.\n\n“I am not trying to empty the world. I am freeing it. The Hunger holds our true emotions. Destroy it, and humanity will feel freely again—without bells, without keepers.”\n\nShe looks toward the creature stirring beyond her.\n\n“I cannot ask you to forgive me. Will you fight beside me?”';
export const RESTORATION_LINES = RESTORATION_SHOTS.map((shot) => shot.caption);

export function normalizeFinale(value: unknown, colorsRestored: boolean): FinaleProgress {
  const saved = value && typeof value === 'object' ? value as Partial<FinaleProgress> : {};
  const stages: FinaleStage[] = ['unseen', 'duel', 'choice', 'solo-duel', 'battle', 'restoring', 'complete'];
  const oldDuration = Number.isFinite(saved.restorationDurationMs) && saved.restorationDurationMs! > 0
    ? saved.restorationDurationMs! : 15_000;
  const savedTime = Number.isFinite(saved.restorationMs) ? saved.restorationMs! : 0;
  return {
    stage: colorsRestored ? 'complete' : stages.includes(saved.stage as FinaleStage) ? saved.stage! : 'unseen',
    allied: typeof saved.allied === 'boolean' ? saved.allied : null,
    restorationMs: Math.max(0, Math.min(RESTORATION_DURATION_MS,
      oldDuration === RESTORATION_DURATION_MS ? savedTime : savedTime / oldDuration * RESTORATION_DURATION_MS)),
    restorationDurationMs: RESTORATION_DURATION_MS,
  };
}
