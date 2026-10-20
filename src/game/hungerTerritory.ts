import type { Item } from './data';

export const HUNGER_REGION = 'first-hunger' as const;
export const HUNGER_ENTRY = 'hunger-0-0';
export const MAELIS_HUB = 'hunger-0-1';
export const HUNGER_SPRING = 'hunger-0-2';
export const HUNGER_ARENA = 'hunger-0-3';
export const HUNGER_VANGUARD_ID = 'hunger-vanguard-lair';
export const HUNGER_VANGUARD_KEY = 'hunger-herald-key';
export const HUNGER_LEVEL = 25;
export const HUNGER_KEYS = ['hunger-bone-key', 'hunger-mirror-key', 'hunger-heart-key'] as const;

export type HungerSite = {
  id: string; row: number; column: number; label: string; clue: string;
  landmark: 'rib' | 'mirror' | 'root' | 'obelisk' | 'arena';
  encounter: boolean;
};

// The older six-by-ten territory is retained for save migrations and map notes.
// The playable Realm 6 route uses only its opening row: Maelis, the spring, and
// the final threshold. The former expedition branches are no longer entrances.
const districts = [
  ['Mouth of Silence', 'Maelis’s Vigil', 'The Pale Spring', 'The Final Threshold', 'Broken Covenant', 'Witness Stair', 'Pale Observatory', 'Rib Arch', 'Abandoned Chorus', 'Last Witness'],
  ['Refuge of Breath', 'Boneway Junction', 'Ribbed Causeway', 'Ossuary Anchors', 'Marrow Walk', 'Empty Cradle', 'Bone Sentinel', 'Buried Arsenal', 'Thornless Reliquary', 'Dead-End Memorial'],
  ['Stolen Rain', 'Memory Junction', 'Rain Without Sorrow', 'Dry Fountain', 'Names of the Lost', 'Unlit Lanterns', 'Mirror Footbridge', 'Reflected Sky', 'Shattered Audience', 'Watch of Glass'],
  ['Quiet Root', 'Mirrorway Junction', 'Unsmiling Garden', 'Silver Orchard', 'False Horizon', 'Parallax Lens', 'Prism Scar', 'Mirror Sentinel', 'Woven Shelter', 'Blind Reflection'],
  ['Borrowed Dawn', 'Heartway Junction', 'Vein Crossing', 'Pulse Obelisk', 'Sheltered Spring', 'Hollow Procession', 'Vein Sentinel', 'Forgotten Oath', 'Heart Ward', 'Stilled Heart'],
  ['Road of Return', 'Last Junction', 'Five Freed Shadows', 'Unbroken Promise', 'Crown Footbridge', 'Oath Vault', 'No More Keepers', 'Last Provision', 'Three-Key Threshold', 'The First Hunger’s Maw'],
] as const;
const districtClues = [
  'Follow the short eastern road: speak with Maelis, rest at the pale spring, then face the final threshold. The First Echo holds the single key you need.',
  'Two anchors hold the Ossuary shut. Release either first. Beyond the arsenal, a thornless tree conceals a weapon.',
  'These names belong to people whose sorrow was stolen. The mirror footbridge joins this road to the orchard below.',
  'The Parallax Lens opens when it faces the second horizon. The woven shelter hides armor; turn its loom twice.',
  'The Heart Ward feeds on its sentinel. Defeat the watcher before touching the ward. The sheltered spring restores your strength.',
  'Three lair wardens carry the bone, mirror, and heart keys. The oath vault hides a charm behind two oath stones. Provision before the Maw.',
];
const records = [
  [
    'The road east leads to Maelis’s refuge. Hear her account before deciding what to do.',
    'Maelis waits here to explain why she silenced the bells. The pale spring and final threshold lie east.',
    'Rest at the spring before the final threshold. The First Echo’s key opens the separate battle dungeon.',
    'The final battle begins through the eastern entrance. Return to the spring if you need to recover.',
    'The road bears no keeper’s seal. These people were meant to walk without permission.',
    'A tablet admits that the bells shared emotion but could never return ownership of it.',
    'Witnesses carved their names here so silence could not make them disappear.',
    'The observatory looks south across a bone bridge. That bridge connects the first two expeditions.',
    'The ribs arch over the road without closing it. This is a passage, not a gate.',
    'Each empty seat once belonged to a singer who could remember songs but feel nothing.',
    'The last witness wrote: return west; the southern spine begins at the Vigil.',
  ],
  [
    'Shelter alone cannot end the Hunger. The Vigil’s spring is one junction north.',
    'East leads to the bone anchors; south follows the spine toward the memory road.',
    'The causeway carries the first expedition toward the Ossuary, not toward the Maw.',
    'Release the left and right anchors in either order. They secure the Ossuary entrance.',
    'The bone road continues beyond the Ossuary toward an arsenal and a concealed reliquary.',
    'A cradle survived its family. The Hunger consumed their wonder before their grief.',
    'The broken bridge north joins the witness road. The main return route remains west.',
    'The arsenal’s last smith hid a longer-reaching weapon beneath a tree farther east.',
    'The thornless tree is hollow. Every discipline can break it; five strikes are enough.',
    'A memorial ends this arm of the maze. Turn west rather than searching for a southern door.',
  ],
  [
    'Rain collects in broken vessels, but no one here remembers why rain once brought relief.',
    'This junction leads east through stolen memories or south toward the mirrored orchard.',
    'The names beside the rain belong to people who were denied the right to mourn.',
    'The fountain was drained to build the bells. Its stone basin is no restorative spring.',
    'The archive lists losses without judgments. Grief was never a debt to a bellkeeper.',
    'The lanterns were lit for travelers, not for the Hunger. Their road still runs east.',
    'Footprints point toward the reflected sky and the eastern bridge into the orchard.',
    'The sky in the mirrors is not a new realm. Keep to the marked road.',
    'A bridge south joins the woven shelter road. It is a shortcut around the western junctions.',
    'This watch ends at a sealed cliff. The usable bridge lies one screen west.',
  ],
  [
    'The roots hold no anger. What remains is the shape of a garden waiting for feeling.',
    'East leads to the Parallax Lens. South reaches the heart expedition and its spring.',
    'The gardeners kept working after joy vanished. Their careful paths remain passable.',
    'Silver leaves point east to the lens rather than opening a hidden northern road.',
    'Four horizons reflect in the lens. Only the second reveals the vault entrance.',
    'Turn the Parallax Lens to horizon two. The Reflection Eater carries the mirror key.',
    'The scar marks a failed attempt to feed the Hunger light instead of emotion.',
    'The reflection guards the route to the shelter. The shelter’s treasure is farther east.',
    'Turn the shelter loom twice to unwind the hidden armor. The northern bridge reaches the memory road.',
    'There is no path through this reflection. Return west to the shelter or the spine.',
  ],
  [
    'Dawn here is borrowed from a world that cannot yet feel hope. There is no new bell.',
    'East leads to the Heart Ward. South leads to the final provision road.',
    'The vein carries stolen feeling toward the Maw, but the player’s road remains on stone.',
    'This obelisk records the rhythm of a living heart, not an ordered rune sequence.',
    'The sheltered spring restores health and energy. A bridge south reaches the last road.',
    'The procession followed the bells willingly. Its record asks whether dependence was ever freedom.',
    'A guardian watches the route east. Beyond it lie the final ward and its sentinel.',
    'An oath names the Maw’s three keys: bone, mirror, heart. None requires a sixth bell.',
    'The Heart Sentinel binds this entrance. Defeat it, then release its ward to enter the lair.',
    'The heartbeat stops at the cliff. Turn west for the ward and the route back to the spring.',
  ],
  [
    'This western arm ends at a return marker. The useful road continues east through the last junction.',
    'West is a dead end; north is the return spine; east leads toward the Maw.',
    'Five shadows stand for five feelings. Their outlines are empty until the Hunger falls.',
    'A promise reads: no person must earn permission to feel. It is not a sixth oath gate.',
    'The bridge north leads directly to the sheltered spring. Heal there before returning to the Maw.',
    'Release both oath stones in either order to reveal a charm with health and attack bonuses.',
    'The last keeper scratched out their title. The three warden keys, not a bell, open the Maw.',
    'One last cache holds eight tonics. Take them once and prepare your equipped powers.',
    'The bone, mirror, and heart keys open this door after Maelis’s ally-or-solo choice.',
    'The Hunger resists ordinary stagger. Its volleys tighten below 65% and 30% health. Strike between rings; the southern return door permits retreat.',
  ],
] as const;
const landmark = ['obelisk', 'rib', 'mirror', 'root', 'rib', 'arena'] as const;
const quiet = new Set(['0:0', '0:1', '0:2', '1:0', '1:3', '1:8', '3:5', '3:8', '4:4', '5:5', '5:7', '5:8', '5:9']);
export const HUNGER_SITES: readonly HungerSite[] = districts.flatMap((labels, row) =>
  labels.map((label, column) => ({
    id: `hunger-${row}-${column}`, row, column, label,
    clue: `${records[row][column]}\n\n${districtClues[row]}`,
    landmark: row === 0 && column === 3 ? 'arena' : landmark[row], encounter: !quiet.has(`${row}:${column}`),
  })));

export const HUNGER_VANGUARD = {
  id: HUNGER_VANGUARD_ID,
  label: 'The First Echo’s Lair',
  cellId: MAELIS_HUB,
  boss: 'The Hunger’s First Echo',
  key: HUNGER_VANGUARD_KEY,
} as const;

export const HUNGER_LAIRS = [
  { id: 'hunger-ossuary', label: 'The Ossuary of Want', cellId: 'hunger-1-3',
    boss: 'Marrow Collector', key: HUNGER_KEYS[0], puzzle: 'anchors' },
  { id: 'hunger-parallax', label: 'The Parallax Vault', cellId: 'hunger-3-5',
    boss: 'Reflection Eater', key: HUNGER_KEYS[1], puzzle: 'mirror' },
  { id: 'hunger-heart', label: 'The Unbeating Heart', cellId: 'hunger-4-8',
    boss: 'The Pulse That Remains', key: HUNGER_KEYS[2], puzzle: 'hunt' },
] as const;

export const HUNGER_GEAR: readonly { cellId: string; puzzle: 'tree' | 'loom' | 'oath'; item: Item }[] = [
  { cellId: 'hunger-1-8', puzzle: 'tree', item: {
    id: 'unbound-edge', name: 'Unbound edge', kind: 'weapon', equipped: false,
    bonusAttack: 18, combatEffect: 'long-reach',
    description: 'A weapon for every discipline. +18 basic attack; extended melee reach.',
  } },
  { cellId: 'hunger-3-8', puzzle: 'loom', item: {
    id: 'freeheart-mail', name: 'Freeheart mail', kind: 'armor', equipped: false,
    bonusHp: 70, description: 'Woven from promises freely kept. +70 maximum health.',
  } },
  { cellId: 'hunger-5-5', puzzle: 'oath', item: {
    id: 'unfettered-charm', name: 'Unfettered charm', kind: 'jewelry', equipped: false,
    bonusHp: 25, bonusAttack: 4,
    description: 'Jewelry carrying no keeper’s oath. +25 maximum health and +4 basic attack when worn.',
  } },
];

export const hungerSite = (id: string) => HUNGER_SITES.find((site) => site.id === id);
