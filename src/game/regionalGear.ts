import type { Item } from './data';
import type { WorldRegionId } from './worldMap';

export type FieldGearCache = {
  regionId: WorldRegionId;
  cellId: string;
  item: Item;
  method: 'tree';
  x: number;
  y: number;
  clue: string;
};

export const REGIONAL_FIELD_GEAR: readonly FieldGearCache[] = [
  { regionId: 'hearthglen', cellId: 'briar-hidden-grove', method: 'tree', x: 456, y: 290,
    item: { id: 'briarheart-edge', name: 'Briarheart edge', kind: 'weapon', equipped: false,
      bonusAttack: 4, description: 'A keen blade grown around a heartwood core. +4 basic attack.' },
    clue: 'A lone bough in the hidden grove has a warm gold seam.' },
  { regionId: 'drowned-marches', cellId: 'reedveil-alders', method: 'tree', x: 465, y: 290,
    item: { id: 'sluice-cutter', name: 'Sluice-cutter', kind: 'weapon', equipped: false,
      bonusAttack: 8, description: 'A broad, salt-proof blade from a hidden reedbed cache. +8 basic attack.' },
    clue: 'One alder has a pale band where floodwater could not reach.' },
  { regionId: 'ashen-peaks', cellId: 'ashbark-shelf', method: 'tree', x: 460, y: 286,
    item: { id: 'forgewake-axe', name: 'Forgewake axe', kind: 'weapon', equipped: false,
      bonusAttack: 12, description: 'A heat-tempered axe cached in an ashbark hollow. +12 basic attack.' },
    clue: 'A blackbark trunk carries a thin orange seam, almost hidden by soot.' },
  { regionId: 'fallen-capital', cellId: 'ivory-tree-court', method: 'tree', x: 455, y: 290,
    item: { id: 'oathkeeper-falchion', name: 'Oathkeeper falchion', kind: 'weapon', equipped: false,
      bonusAttack: 16, description: 'A recovered city blade with a silvered edge. +16 basic attack.' },
    clue: 'One pale tree stands at the edge of the court, its bark scored like an old seal.' },
] as const;

export const MINI_DUNGEON_GEAR_REWARDS: Readonly<Record<string, Item>> = {
  'heartwood-burrow': { id: 'mossward-coat', name: 'Mossward coat', kind: 'armor', equipped: false,
    bonusHp: 18, description: 'Soft bark-fiber armor recovered from Heartwood Burrow. +18 maximum health.' },
  'marches-chimecrypt': { id: 'reedwarden-mail', name: 'Reedwarden mail', kind: 'armor', equipped: false,
    bonusHp: 34, description: 'Layered marsh-iron plates hidden in the Reed-Chime Crypt. +34 maximum health.' },
  'ironvein-mine': { id: 'rimeguard-hauberk', name: 'Rimeguard hauberk', kind: 'armor', equipped: false,
    bonusHp: 52, description: 'A quilted hauberk recovered from Ironvein Mine. +52 maximum health.' },
  'archive-of-ash': { id: 'archivist-plate', name: 'Archivist plate', kind: 'armor', equipped: false,
    bonusHp: 72, description: 'A rare, carefully fitted plate harness from the Archive of Ash. +72 maximum health.' },
};

export const DUNGEON_GEAR_REWARDS: Partial<Record<WorldRegionId, Item>> = {
  hearthglen: { id: 'wonderglass-charm', name: 'Wonderglass charm', kind: 'jewelry', equipped: false,
    bonusHp: 10, bonusAttack: 1, description: 'A bright seed-glass charm from the Ember Sanctum. +10 health and +1 attack.' },
  'drowned-marches': { id: 'tideworn-loop', name: 'Tideworn loop', kind: 'jewelry', equipped: false,
    bonusHp: 18, bonusAttack: 2, description: 'A silver loop from the Bell Tower of Tides. +18 health and +2 attack.' },
  'ashen-peaks': { id: 'furybrand-signet', name: 'Furybrand signet', kind: 'jewelry', equipped: false,
    bonusHp: 24, bonusAttack: 3, description: 'A heat-darkened signet from the Crucible Bastion. +24 health and +3 attack.' },
  glasslands: { id: 'prism-regent-ring', name: 'Prism Regent ring', kind: 'jewelry', equipped: false,
    bonusHp: 28, bonusAttack: 3, description: 'A ring from the Palace of Glass. +28 health and +3 attack.' },
  'fallen-capital': { id: 'resolve-seal', name: 'Resolve seal', kind: 'jewelry', equipped: false,
    bonusHp: 34, bonusAttack: 4, description: 'The First Bell Citadel’s last fitting. +34 health and +4 attack.' },
  'first-hunger': { id: 'spectrum-heart', name: 'Spectrum heart', kind: 'jewelry', equipped: false,
    bonusHp: 45, bonusAttack: 5, description: 'A living fragment found in the Maw. +45 health and +5 attack.' },
};
