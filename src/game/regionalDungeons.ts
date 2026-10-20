import type { WorldRegionId } from './worldMap';
import { HUNGER_ARENA, HUNGER_VANGUARD_KEY } from './hungerTerritory';

export type RegionalPuzzle = 'anchors' | 'mirror' | 'hunt' | 'chimes' | 'weights';

export type RegionalMiniLair = {
  id: string;
  regionId: WorldRegionId;
  cellId: string;
  label: string;
  boss: string;
  keyId: string;
  puzzle: RegionalPuzzle;
  entrancePuzzle: 'anchors' | 'mirror' | 'hunt' | 'tree' | 'tree-sequence' | 'fragments';
  clue: string;
};

export const REGIONAL_MINI_LAIRS: readonly RegionalMiniLair[] = [
  { id: 'heartwood-burrow', regionId: 'hearthglen', cellId: 'heartwood-burrow',
    label: 'Heartwood Burrow', boss: 'Briarclaw', keyId: 'wonder-burrow-key',
    puzzle: 'anchors', entrancePuzzle: 'tree',
    clue: 'A hollowed heartwood tree hides the burrow stair. Strike its trunk with any weapon.' },
  { id: 'forgotten-watch', regionId: 'hearthglen', cellId: 'forgotten-watch',
    label: 'Forgotten Watch', boss: 'Ash Sentinel', keyId: 'wonder-watch-key',
    puzzle: 'mirror', entrancePuzzle: 'tree-sequence',
    clue: 'The watch carving reads: Amber → Split → Root. Strike the three marked trunks in that order.' },
  { id: 'weeping-hollow', regionId: 'hearthglen', cellId: 'weeping-hollow',
    label: 'Weeping Hollow', boss: 'Root Widow', keyId: 'wonder-hollow-key',
    puzzle: 'hunt', entrancePuzzle: 'fragments',
    clue: 'Three bent-key pieces were hidden in the hollow’s scattered caches. Find all three to reveal the stair.' },

  { id: 'ironvein-mine', regionId: 'ashen-peaks', cellId: 'ironvein-mine',
    label: 'Ironvein Mine', boss: 'Forge Husk', keyId: 'fury-forge-key',
    puzzle: 'anchors', entrancePuzzle: 'anchors',
    clue: 'Free the two counterweights in either order to uncover the mine stair.' },
  { id: 'gale-spire', regionId: 'ashen-peaks', cellId: 'gale-spire',
    label: 'Gale Spire', boss: 'Skyrend Harpy', keyId: 'fury-spire-key',
    puzzle: 'mirror', entrancePuzzle: 'mirror',
    clue: 'Turn the broken weather vane toward the clearest gap in the clouds.' },
  { id: 'buried-barracks', regionId: 'ashen-peaks', cellId: 'buried-barracks',
    label: 'Buried Barracks', boss: 'Ironbound Captain', keyId: 'fury-barracks-key',
    puzzle: 'hunt', entrancePuzzle: 'hunt',
    clue: 'The barracks ward is held by its restless patrol. Clear the sentries, then release it.' },

  { id: 'archive-of-ash', regionId: 'fallen-capital', cellId: 'archive-of-ash',
    label: 'Archive of Ash', boss: 'Memory Scribe', keyId: 'resolve-archive-key',
    puzzle: 'anchors', entrancePuzzle: 'anchors',
    clue: 'Two archive weights keep the index sealed; release either one first.' },
  { id: 'silent-amphitheater', regionId: 'fallen-capital', cellId: 'silent-amphitheater',
    label: 'Silent Amphitheater', boss: 'Echo Colossus', keyId: 'resolve-amphitheater-key',
    puzzle: 'mirror', entrancePuzzle: 'mirror',
    clue: 'Turn the stage mirror until it reflects the empty western gallery.' },
  { id: 'clockwork-vault', regionId: 'fallen-capital', cellId: 'clockwork-vault',
    label: 'Clockwork Vault', boss: 'Keeper Construct', keyId: 'resolve-clockwork-key',
    puzzle: 'hunt', entrancePuzzle: 'hunt',
    clue: 'The vault’s sentries guard the release lever. Defeat them before operating it.' },
] as const;

export type MainBossSite = {
  regionId: WorldRegionId;
  cellId: string;
  dungeonId: string;
  label: string;
  bossName: string;
  requiredKeys: readonly string[];
};

export const MAIN_BOSS_SITES: readonly MainBossSite[] = [
  { regionId: 'hearthglen', cellId: 'sanctum', dungeonId: 'hearthglen-ember-sanctum',
    label: 'Ember Sanctum', bossName: 'Cinderhorn',
    requiredKeys: ['wonder-burrow-key', 'wonder-watch-key', 'wonder-hollow-key'] },
  { regionId: 'drowned-marches', cellId: 'sunken-chapel', dungeonId: 'sunken-chapel-boss',
    label: 'Bell Tower of Tides', bossName: 'The Drowned Bellkeeper',
    requiredKeys: ['sorrow-ward-key', 'sorrow-chime-key', 'sorrow-counterweight-key'] },
  { regionId: 'ashen-peaks', cellId: 'last-ash-watch', dungeonId: 'ashen-peaks-bell',
    label: 'Crucible Bastion', bossName: 'The Fury Bellkeeper',
    requiredKeys: ['fury-forge-key', 'fury-spire-key', 'fury-barracks-key'] },
  { regionId: 'glasslands', cellId: 'joy-bell-sanctum', dungeonId: 'glasslands-bell',
    label: 'Palace of Glass', bossName: 'The Prism Bellkeeper',
    requiredKeys: ['joy-chime-key', 'joy-parallax-key', 'joy-heartglass-key'] },
  { regionId: 'fallen-capital', cellId: 'resolve-bell-sanctum', dungeonId: 'fallen-capital-bell',
    label: 'The First Bell Citadel', bossName: 'The Oathbound Bellkeeper',
    requiredKeys: ['resolve-archive-key', 'resolve-amphitheater-key', 'resolve-clockwork-key'] },
  { regionId: 'first-hunger', cellId: HUNGER_ARENA, dungeonId: 'first-hunger-maw',
    label: 'The First Hunger’s Maw', bossName: 'The First Hunger',
    requiredKeys: [HUNGER_VANGUARD_KEY] },
] as const;

export const regionalLairAt = (cellId: string) =>
  REGIONAL_MINI_LAIRS.find((lair) => lair.cellId === cellId);

export const mainBossAt = (cellId: string) =>
  MAIN_BOSS_SITES.find((site) => site.cellId === cellId);
