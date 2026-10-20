import type { Item } from './data';

export const GLASSLANDS_CELLS: Record<string, {
  id: string; roomId: 'woodland'; label: string;
}> = {
  '0:0': { id: 'prism-outlook', roomId: 'woodland', label: 'Prism Outlook' },
  '0:2': { id: 'lumen-fields', roomId: 'woodland', label: 'Lumen Fields' },
  '1:0': { id: 'gleamharbor', roomId: 'woodland', label: 'Gleamharbor' },
  '1:2': { id: 'singing-orchard', roomId: 'woodland', label: 'Singing Orchard' },
  '1:3': { id: 'glassmakers-trail', roomId: 'woodland', label: 'Glassmaker’s Trail' },
  '2:0': { id: 'chimevault-steps', roomId: 'woodland', label: 'Chimevault Steps' },
  '2:2': { id: 'echoing-orchard', roomId: 'woodland', label: 'Echoing Orchard' },
  '2:3': { id: 'prism-stair', roomId: 'woodland', label: 'Prism Stair' },
  '3:0': { id: 'shatterbrook', roomId: 'woodland', label: 'Shatterbrook' },
  '3:2': { id: 'moonpool-walk', roomId: 'woodland', label: 'Moonpool Walk' },
  '3:3': { id: 'dawn-passage', roomId: 'woodland', label: 'Dawn Passage' },
  '3:4': { id: 'brightroot-walk', roomId: 'woodland', label: 'Brightroot Walk' },
  '3:5': { id: 'sunshard-bluff', roomId: 'woodland', label: 'Sunshard Bluff' },
  '4:0': { id: 'petrified-aqueduct', roomId: 'woodland', label: 'Petrified Aqueduct' },
  '4:2': { id: 'orchard-of-moths', roomId: 'woodland', label: 'Orchard of Moths' },
  '4:3': { id: 'glassmakers-crossing', roomId: 'woodland', label: 'Glassmaker’s Crossing' },
  '4:4': { id: 'heartglass-door', roomId: 'woodland', label: 'Heartglass Door' },
  '4:5': { id: 'glintwater-steps', roomId: 'woodland', label: 'Glintwater Steps' },
  '5:0': { id: 'sunlit-verge', roomId: 'woodland', label: 'Sunlit Verge' },
  '5:2': { id: 'last-mirror-grove', roomId: 'woodland', label: 'Last Mirror Grove' },
  '5:3': { id: 'glassward-causeway', roomId: 'woodland', label: 'Glassward Causeway' },
  '5:5': { id: 'reflected-terrace', roomId: 'woodland', label: 'Reflected Terrace' },
};

export const GLASSLANDS_LAIRS = [
  {
    id: 'glasslands-chimevault', label: 'The Chimevault', cellId: 'chimevault-steps',
    boss: 'The Laughing Shard', key: 'joy-chime-key', puzzle: 'anchors',
    entrancePuzzle: 'anchors', clue: 'Release both buried chimes in either order. The Chimevault opens; its keeper carries a key to the Bell road.',
  },
  {
    id: 'glasslands-parallax', label: 'The Parallax Garden', cellId: 'dawn-passage',
    boss: 'The Facet Weaver', key: 'joy-parallax-key', puzzle: 'mirror',
    entrancePuzzle: 'mirror', clue: 'Turn the garden lens until it faces the second horizon. Inside, two inner mirrors open the seal.',
  },
  {
    id: 'glasslands-heartglass', label: 'The Heartglass Grotto', cellId: 'heartglass-door',
    boss: 'The Joyless Bloom', key: 'joy-heartglass-key', puzzle: 'hunt',
    entrancePuzzle: 'hunt', clue: 'Defeat the glass warden on these steps, then release its entrance ward. Clear the inner echoes to open the seal.',
  },
] as const;

export const GLASSLANDS_GEAR: readonly {
  cellId: string; puzzle: 'tree' | 'loom' | 'chimes'; item: Item;
}[] = [
  {
    cellId: 'echoing-orchard', puzzle: 'tree', item: {
      id: 'gleamthorn-spear', name: 'Gleamthorn spear', kind: 'weapon', equipped: false,
      bonusAttack: 8, combatEffect: 'long-reach',
      description: 'A bright point forged from a singing bough. +8 basic attack; extended melee reach.',
    },
  },
  {
    cellId: 'orchard-of-moths', puzzle: 'loom', item: {
      id: 'mothglass-mantle', name: 'Mothglass mantle', kind: 'armor', equipped: false,
      bonusHp: 38, description: 'Light-catching armor stitched by orchard keepers. +38 maximum health.',
    },
  },
  {
    cellId: 'last-mirror-grove', puzzle: 'chimes', item: {
      id: 'laughter-prism', name: 'Laughter prism', kind: 'jewelry', equipped: false,
      bonusHp: 14, bonusAttack: 3,
      description: 'A warm shard that remembers the garden’s laughter. +14 maximum health and +3 basic attack when worn.',
    },
  },
];
