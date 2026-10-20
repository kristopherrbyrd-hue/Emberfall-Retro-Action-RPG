export type ClassId = 'warrior' | 'rogue' | 'adept' | 'mage';
export type RoomId = 'village' | 'woodland' | 'ruins' | 'sanctum' | 'chapel';
export type Direction = 'up' | 'down' | 'left' | 'right';
export type ButtonId =
  | 'attack'
  | 'context'
  | 'ability0'
  | 'ability1'
  | 'ability2'
  | 'ability3';
export type MenuId = 'inventory' | 'character' | 'map' | 'abilities' | 'settings' | 'shop' | 'training';

export type AbilityDefinition = {
  id: string;
  name: string;
  icon: string;
  description: string;
  cooldownMs: number;
  cost: number;
};

export type PowerEffect =
  | 'front'
  | 'area'
  | 'projectile'
  | 'heal'
  | 'guard'
  | 'empower'
  | 'dash-strike'
  | 'dash'
  | 'control'
  | 'slow'
  | 'poison'
  | 'restore'
  | 'shadow';

export type PowerDefinition = AbilityDefinition & {
  effect: PowerEffect;
  baseDamage: number;
  tier: number;
  radius?: number;
  durationMs?: number;
  projectileSpeed?: number;
  projectileRadius?: number;
  areaOfEffect?: number;
  movement?: number;
  stunMs?: number;
  slowMs?: number;
  resourceRestore?: number;
  guardStyle?: 'ward' | 'brace';
  tint?: number;
};

export type DisciplineDefinition = {
  id: string;
  name: string;
  icon: string;
  description: string;
  powers: PowerDefinition[];
};

export type ClassDefinition = {
  id: ClassId;
  name: string;
  title: string;
  description: string;
  weapon: string;
  attackName: string;
  maxHp: number;
  maxResource: number;
  resourceName: string;
  attackDamage: number;
  abilities: AbilityDefinition[];
};

const ability = (
  id: string,
  name: string,
  icon: string,
  description: string,
  cooldownMs: number,
  cost: number,
): AbilityDefinition => ({ id, name, icon, description, cooldownMs, cost });

export const CLASSES: Record<ClassId, ClassDefinition> = {
  warrior: {
    id: 'warrior',
    name: 'Warrior',
    title: 'Iron resolve',
    description: 'A steadfast front-line fighter with heavy armor and a crushing blade.',
    weapon: 'Wayfarer sword',
    attackName: 'Sword slash',
    maxHp: 120,
    maxResource: 100,
    resourceName: 'Grit',
    attackDamage: 17,
    abilities: [
      ability('shield-bash', 'Shield Bash', '⛨', 'Stun and strike the foe in front of you.', 5400, 22),
      ability('whirlwind', 'Whirlwind', '⟳', 'Spin through every nearby enemy.', 7600, 28),
      ability('battle-cry', 'Battle Cry', '✦', 'Grow stronger and take less damage briefly.', 11000, 30),
      ability('heroic-leap', 'Heroic Leap', '↗', 'Leap forward and strike the ground around you.', 8600, 32),
    ],
  },
  rogue: {
    id: 'rogue',
    name: 'Rogue',
    title: 'Quick as a shadow',
    description: 'An agile duelist who slips through danger and finds a weak point.',
    weapon: 'Twinleaf daggers',
    attackName: 'Quick cut',
    maxHp: 88,
    maxResource: 100,
    resourceName: 'Focus',
    attackDamage: 14,
    abilities: [
      ability('dash-strike', 'Dash Strike', '➤', 'Rush through a foe with a sharp cut.', 5000, 20),
      ability('smoke-bomb', 'Smoke Bomb', '◉', 'Obscure yourself and daze enemies nearby.', 8000, 26),
      ability('poison-blade', 'Poison Blade', '⌁', 'Coat your weapon for several toxic strikes.', 9000, 28),
      ability('shadow-step', 'Shadow Step', '✧', 'Blink away and empower your next strike.', 7400, 26),
    ],
  },
  adept: {
    id: 'adept',
    name: 'Adept',
    title: 'Spirit in motion',
    description: 'A balanced martial artist who turns inner energy into force and healing.',
    weapon: 'Pilgrim wraps',
    attackName: 'Spirit palm',
    maxHp: 102,
    maxResource: 110,
    resourceName: 'Spirit',
    attackDamage: 15,
    abilities: [
      ability('spirit-palm', 'Spirit Palm', '✺', 'Send a powerful short-range burst forward.', 5200, 22),
      ability('inner-focus', 'Inner Focus', '❋', 'Gather spirit and empower your next attack.', 10000, 0),
      ability('healing-pulse', 'Healing Pulse', '♡', 'Restore a portion of your health.', 12000, 34),
      ability('spirit-wave', 'Spirit Wave', '〰', 'Release an energy wave through nearby foes.', 8200, 30),
    ],
  },
  mage: {
    id: 'mage',
    name: 'Mage',
    title: 'Keeper of embers',
    description: 'An elemental scholar who controls space with potent ranged spells.',
    weapon: 'Cinderwood staff',
    attackName: 'Ember bolt',
    maxHp: 78,
    maxResource: 120,
    resourceName: 'Aether',
    attackDamage: 16,
    abilities: [
      ability('fireball', 'Fireball', '☄', 'Launch a fire orb that bursts on impact.', 6200, 28),
      ability('frost-nova', 'Frost Nova', '❄', 'Freeze and damage nearby enemies.', 8400, 32),
      ability('blink', 'Blink', '✧', 'Teleport a short distance in your facing direction.', 6900, 24),
      ability('arcane-shield', 'Arcane Shield', '⬡', 'Absorb damage with a brief magical ward.', 11000, 30),
    ],
  },
};

export const CLASS_LIST = Object.values(CLASSES);

export type CharacterConfig = {
  name: string;
  classId: ClassId;
  skin: string;
  hairStyle: string;
  hairColor: string;
  clothingColor: string;
  eyeColor?: string;
  trimColor?: string;
  facialHair?: string;
  headwear?: string;
};

export type Item = {
  id: string;
  name: string;
  kind: 'weapon' | 'armor' | 'jewelry' | 'consumable' | 'key' | 'relic';
  description: string;
  equipped: boolean;
  bonusHp?: number;
  bonusAttack?: number;
  combatEffect?: WeaponCombatEffect;
  quantity?: number;
  locked?: boolean;
};

export const isLockableGear = (item: Item): boolean =>
  item.kind === 'weapon' || item.kind === 'armor' || item.kind === 'jewelry';

export const getSalvageXp = (item: Item): number => {
  if (item.kind === 'weapon') return 12 + Math.max(0, item.bonusAttack ?? 0) * 3;
  if (item.kind === 'armor' || item.kind === 'jewelry') return 12 + Math.ceil(Math.max(0, item.bonusHp ?? 0) / 2);
  if (item.kind === 'consumable') return 6;
  return 0;
};

export const requiresSalvageConfirmation = (item: Item): boolean =>
  isLockableGear(item) &&
  (Boolean(item.combatEffect) || (item.bonusAttack ?? 0) >= 8 || (item.bonusHp ?? 0) >= 20);

export type WeaponCombatEffect =
  | 'heavy-stagger'
  | 'thorn-bleed'
  | 'long-reach'
  | 'ember-bolt';

export const WEAPON_FINDS = {
  supply: {
    id: 'hearthguard-mace',
    name: 'Hearthguard mace',
    description: 'A bronze flanged mace from the old village watch. Adds 4 attack damage and staggers foes with heavy blows.',
    bonusAttack: 4,
    combatEffect: 'heavy-stagger',
  },
  forest: {
    id: 'briar-edge',
    name: 'Briar-edge',
    description: 'A light blade wrapped in living thorns. Adds 6 attack damage and leaves foes bleeding.',
    bonusAttack: 6,
    combatEffect: 'thorn-bleed',
  },
  ruins: {
    id: 'starfall-spear',
    name: 'Starfall spear',
    description: 'A rune-marked spear with a bright, balanced point. Adds 8 attack damage and extends melee reach.',
    bonusAttack: 8,
    combatEffect: 'long-reach',
  },
  sanctum: {
    id: 'cinderwake-staff',
    name: 'Cinderwake staff',
    description: 'A staff carrying a steady ember from the sanctum. Adds 10 attack damage and launches scorching ember bolts.',
    bonusAttack: 10,
    combatEffect: 'ember-bolt',
  },
} satisfies Record<string, Pick<Item, 'id' | 'name' | 'description' | 'bonusAttack' | 'combatEffect'>>;

export const POSTGAME_GEAR: Record<
  ClassId,
  Pick<Item, 'id' | 'name' | 'description' | 'bonusAttack' | 'combatEffect'>
> = {
  warrior: {
    id: 'elite-ironwake-blade',
    name: 'Ironwake blade',
    description: 'A broad blade forged for the restored world. Adds 14 attack damage and staggers foes with heavy blows.',
    bonusAttack: 14,
    combatEffect: 'heavy-stagger',
  },
  rogue: {
    id: 'elite-gloamfang-daggers',
    name: 'Gloamfang daggers',
    description: 'Paired darksteel daggers that open wounds with every clean strike. Adds 13 attack damage and leaves foes bleeding.',
    bonusAttack: 13,
    combatEffect: 'thorn-bleed',
  },
  adept: {
    id: 'elite-starbound-wraps',
    name: 'Starbound wraps',
    description: 'Spirit-threaded wraps that carry a palm strike beyond arm’s length. Adds 14 attack damage and extends melee reach.',
    bonusAttack: 14,
    combatEffect: 'long-reach',
  },
  mage: {
    id: 'elite-cinderstar-staff',
    name: 'Cinderstar staff',
    description: 'A staff that channels a steady starfire ember. Adds 15 attack damage and launches scorching ember bolts.',
    bonusAttack: 15,
    combatEffect: 'ember-bolt',
  },
};

export type AbilitySlot = PowerDefinition & {
  remainingMs: number;
  rank: number;
};

export type PlayerState = CharacterConfig & {
  level: number;
  xp: number;
  trainingPoints: number;
  hp: number;
  maxHp: number;
  resource: number;
  maxResource: number;
  resourceName: string;
  coins: number;
  x: number;
  y: number;
  facing: Direction;
  weapon: string;
};

export type EnemyHud = {
  id: string;
  name: string;
  hp: number;
  maxHp: number;
  boss: boolean;
};

export type GameSnapshot = {
  mode: 'title' | 'creator' | 'playing';
  overlay: MenuId | null;
  player: PlayerState | null;
  roomId: RoomId;
  location: string;
  hint: string;
  enemies: EnemyHud[];
  abilities: (AbilitySlot | null)[];
  trainedPowers: Record<string, number>;
  inventory: Item[];
  quest: { title: string; description: string; step: string };
  log: string[];
  puzzleProgress: number;
  gateOpen: boolean;
  keyFound: boolean;
  bossDefeated: boolean;
  dialog: string | null;
  dialogSpeaker: string | null;
  discoveredRooms: RoomId[];
  discoveredWorldCells: string[];
  guideCooldownMs: number;
  guideUses: number;
  guideDirection: Direction | null;
  guideCueMs: number;
  guideCueKind?: 'route' | 'clue' | 'objective' | 'unavailable';
  guideMessage?: string;
};

export const ROOM_NAMES: Record<RoomId, string> = {
  village: 'Hearthglen Village',
  woodland: 'Briarwood',
  ruins: 'The Rootbound Ruins',
  sanctum: 'The Ember Sanctum',
  chapel: 'The Sunken Chapel',
};

export const RUNE_ORDER = ['Sun', 'Star', 'Moon'];
export const RUNE_SEQUENCE = [0, 1, 2];
