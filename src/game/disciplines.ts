import {
  CLASSES,
  type ClassId,
  type DisciplineDefinition,
  type PowerDefinition,
  type PowerEffect,
} from './data';

type PowerSeed = Omit<PowerDefinition, 'tier'>;
type PowerTuning = Partial<Omit<PowerSeed, 'id' | 'name' | 'icon' | 'description' | 'effect' | 'baseDamage'>>;

const effectDefaults: Record<PowerEffect, { cooldownMs: number; cost: number; radius: number; tint: number }> = {
  front: { cooldownMs: 4800, cost: 16, radius: 94, tint: 0xe7c88f },
  area: { cooldownMs: 7200, cost: 24, radius: 92, tint: 0xe8c47c },
  projectile: { cooldownMs: 6200, cost: 24, radius: 42, tint: 0xffa553 },
  heal: { cooldownMs: 10500, cost: 30, radius: 58, tint: 0x95d89b },
  guard: { cooldownMs: 10500, cost: 28, radius: 58, tint: 0x9eacd3 },
  empower: { cooldownMs: 9500, cost: 18, radius: 52, tint: 0xe8c87c },
  'dash-strike': { cooldownMs: 6500, cost: 24, radius: 82, tint: 0xf2bb68 },
  dash: { cooldownMs: 6800, cost: 22, radius: 42, tint: 0x9bd8e2 },
  control: { cooldownMs: 8200, cost: 28, radius: 94, tint: 0xd8c69d },
  slow: { cooldownMs: 8400, cost: 30, radius: 92, tint: 0x9ad9f2 },
  poison: { cooldownMs: 9000, cost: 28, radius: 52, tint: 0x82d476 },
  restore: { cooldownMs: 10500, cost: 0, radius: 48, tint: 0x8ae0d2 },
  shadow: { cooldownMs: 7800, cost: 26, radius: 54, tint: 0xa998dc },
};

const power = (
  id: string,
  name: string,
  icon: string,
  description: string,
  effect: PowerEffect,
  baseDamage: number,
  tuning: PowerTuning = {},
): PowerSeed => {
  const defaults = effectDefaults[effect];
  return {
    id,
    name,
    icon,
    description,
    effect,
    baseDamage,
    cooldownMs: tuning.cooldownMs ?? defaults.cooldownMs,
    cost: tuning.cost ?? defaults.cost,
    radius: tuning.radius ?? defaults.radius,
    tint: tuning.tint ?? defaults.tint,
    ...tuning,
  };
};

const legacyPower = (
  classId: ClassId,
  index: number,
  effect: PowerEffect,
  baseDamage: number,
  tuning: PowerTuning = {},
): PowerSeed => {
  const legacy = CLASSES[classId].abilities[index];
  return {
    ...legacy,
    effect,
    baseDamage,
    ...tuning,
  };
};

const discipline = (
  id: string,
  name: string,
  icon: string,
  description: string,
  seeds: PowerSeed[],
): DisciplineDefinition => ({
  id,
  name,
  icon,
  description,
  powers: seeds.map((item, index) => ({ ...item, tier: index + 1 })),
});

export const CLASS_DISCIPLINES: Record<ClassId, DisciplineDefinition[]> = {
  warrior: [
    discipline('bulwark', 'Bulwark', '⛨', 'Hold ground, blunt a strike, and answer with force.', [
      legacyPower('warrior', 0, 'front', 30, { stunMs: 1350 }),
      power('iron-wall', 'Iron Wall', '▣', 'Raise a ward that absorbs the next hit.', 'guard', 0, { guardStyle: 'ward', durationMs: 5200 }),
      power('counter-cut', 'Counter Cut', '⚔', 'A hard forward cut that interrupts its target.', 'front', 39, { stunMs: 600 }),
      power('stone-bastion', 'Stone Bastion', '⬡', 'Brace against incoming attacks for a short time.', 'guard', 0, { guardStyle: 'brace', durationMs: 7600 }),
      power('shield-sweep', 'Shield Sweep', '⟳', 'Drive nearby foes back with a broad sweep.', 'area', 28, { radius: 105 }),
      power('unyielding-stand', 'Unyielding Stand', '✦', 'Recover health and steady yourself under pressure.', 'heal', 34, { durationMs: 4000 }),
    ]),
    discipline('grit', 'Resilience', '✦', 'Recover, endure, and keep fighting when the road turns hard.', [
      legacyPower('warrior', 2, 'guard', 0, { guardStyle: 'brace', durationMs: 6000 }),
      power('second-wind', 'Second Wind', '♡', 'Restore health with a measured breath.', 'heal', 38),
      power('rallying-call', 'Rallying Call', '⚑', 'Empower your next strikes and recover spirit.', 'empower', 0, { durationMs: 7500, resourceRestore: 16 }),
      power('deep-reserves', 'Deep Reserves', '◉', 'Restore a portion of your fighting spirit.', 'restore', 42),
      power('steadfast-heart', 'Steadfast Heart', '◇', 'Take reduced damage for a longer interval.', 'guard', 0, { guardStyle: 'brace', durationMs: 9000 }),
      power('last-light', 'Last Light', '☼', 'A powerful recovery when your health is low.', 'heal', 58, { cooldownMs: 15000, cost: 42 }),
    ]),
    discipline('warcraft', 'Offense', '⚔', 'Put pressure on a single foe or clear space around you.', [
      legacyPower('warrior', 1, 'area', 23, { radius: 92 }),
      power('cleaving-arc', 'Cleaving Arc', '⌒', 'Cut a wide arc through enemies ahead.', 'front', 36, { radius: 108 }),
      power('heavy-blow', 'Heavy Blow', '✹', 'Deliver a slow, punishing strike.', 'front', 48, { cooldownMs: 8200, cost: 30 }),
      power('sundering-spin', 'Sundering Spin', '⟳', 'Strike all nearby enemies with a heavier spin.', 'area', 35, { radius: 100 }),
      power('breaker-wave', 'Breaker Wave', '〰', 'Send a short shockwave through a line of foes.', 'projectile', 38, { projectileSpeed: 190, projectileRadius: 12, areaOfEffect: 34 }),
      power('executioners-mark', 'Executioner’s Mark', '✧', 'Empower your next weapon strike.', 'empower', 0, { durationMs: 10000, resourceRestore: 8 }),
    ]),
    discipline('advance', 'Vanguard', '➤', 'Close distance and turn movement into an attack.', [
      legacyPower('warrior', 3, 'dash-strike', 36, { movement: 126, radius: 82 }),
      power('shoulder-rush', 'Shoulder Rush', '➤', 'Rush forward and stagger the first foe you reach.', 'dash-strike', 34, { movement: 104, stunMs: 500 }),
      power('earthbreaker', 'Earthbreaker', '⌄', 'Leap forward and shake the ground on landing.', 'dash-strike', 42, { movement: 148, radius: 96 }),
      power('pursuit', 'Pursuit', '»', 'Dash toward a nearby foe and cut through them.', 'dash-strike', 45, { movement: 164 }),
      power('rising-storm', 'Rising Storm', '↗', 'Surge forward with a broad impact.', 'dash-strike', 49, { movement: 132, radius: 112 }),
      power('iron-tempest', 'Iron Tempest', '✹', 'Crash into the fray and strike every nearby foe.', 'dash-strike', 56, { movement: 145, radius: 118, cooldownMs: 12000, cost: 40 }),
    ]),
  ],
  rogue: [
    discipline('precision', 'Precision', '⌁', 'Find openings and make every cut count.', [
      legacyPower('rogue', 0, 'dash-strike', 31, { movement: 92 }),
      power('weak-point', 'Weak Point', '✧', 'Slip in a precise, high-damage cut.', 'front', 42, { cooldownMs: 5700 }),
      power('crosscut', 'Crosscut', '⚔', 'Strike twice across a narrow forward arc.', 'front', 38, { radius: 110 }),
      power('marked-prey', 'Marked Prey', '◎', 'Empower your next attack against a nearby foe.', 'empower', 0, { durationMs: 8500, resourceRestore: 10 }),
      power('needle-rush', 'Needle Rush', '➤', 'Dash through a target with a focused strike.', 'dash-strike', 48, { movement: 118 }),
      power('perfect-opening', 'Perfect Opening', '✹', 'Exploit an opening with a devastating lunge.', 'dash-strike', 62, { movement: 138, cooldownMs: 11000, cost: 38 }),
    ]),
    discipline('veil', 'Veilcraft', '◉', 'Avoid notice, break enemy focus, and slip away unseen.', [
      legacyPower('rogue', 1, 'control', 0, { stunMs: 1750, durationMs: 2400, radius: 88 }),
      power('fade', 'Fade', '◌', 'Become difficult to target for a short time.', 'shadow', 0, { durationMs: 3000, movement: 72 }),
      power('blindside', 'Blindside', '⌁', 'Daze nearby enemies and open a safe path.', 'control', 12, { stunMs: 2300, radius: 96 }),
      power('night-cloak', 'Night Cloak', '☾', 'Vanish briefly and empower your next strike.', 'shadow', 0, { durationMs: 4200, movement: 92 }),
      power('vanishing-step', 'Vanishing Step', '✧', 'Evade a strike and reappear behind the pressure.', 'shadow', 0, { durationMs: 5200, movement: 116 }),
      power('ghostwalk', 'Ghostwalk', '〰', 'Disappear, evade damage, and ready a stronger attack.', 'shadow', 0, { durationMs: 6500, movement: 145 }),
    ]),
    discipline('venom', 'Venomcraft', '⌁', 'Build poison into your weapon and wear down stronger prey.', [
      legacyPower('rogue', 2, 'poison', 6, { durationMs: 7500 }),
      power('toxic-edge', 'Toxic Edge', '⌁', 'Coat several attacks with stronger poison.', 'poison', 9, { durationMs: 9000 }),
      power('venom-fan', 'Venom Fan', '✣', 'Fire a poisonous bolt that bursts on impact.', 'projectile', 22, { tint: 0x82d476, projectileSpeed: 220, areaOfEffect: 30 }),
      power('sickening-cloud', 'Sickening Cloud', '◉', 'Poison and slow enemies caught nearby.', 'slow', 18, { tint: 0x82d476, slowMs: 4200, radius: 104 }),
      power('serpent-strike', 'Serpent Strike', '➤', 'Dash in and deliver a heavy venomous hit.', 'dash-strike', 50, { movement: 105, tint: 0x82d476 }),
      power('blackfang', 'Blackfang', '✹', 'Empower several exceptionally damaging poisoned cuts.', 'poison', 15, { durationMs: 11000, cooldownMs: 13000, cost: 40 }),
    ]),
    discipline('footwork', 'Footwork', '➤', 'Control distance with quick steps and decisive movement.', [
      legacyPower('rogue', 3, 'shadow', 0, { durationMs: 6000, movement: 74 }),
      power('quickstep', 'Quickstep', '»', 'Dash in the direction you are facing.', 'dash', 0, { movement: 112, durationMs: 600 }),
      power('backcut', 'Backcut', '↶', 'Slip away and strike the closest pursuer.', 'shadow', 31, { movement: 96, durationMs: 1800 }),
      power('flank', 'Flank', '↗', 'Reposition swiftly and empower the next attack.', 'shadow', 0, { movement: 132, durationMs: 4800 }),
      power('darting-blade', 'Darting Blade', '➤', 'Close the gap with a fast, accurate cut.', 'dash-strike', 46, { movement: 150 }),
      power('wind-between', 'Wind Between', '〰', 'Evade through danger and counter with force.', 'shadow', 0, { movement: 170, durationMs: 7000 }),
    ]),
  ],
  adept: [
    discipline('forms', 'Martial Forms', '✺', 'Turn practiced movement into precise, close-range force.', [
      legacyPower('adept', 0, 'front', 34, { radius: 96 }),
      power('open-palm', 'Open Palm', '✋', 'A focused strike that pushes enemies back.', 'front', 40, { radius: 102 }),
      power('flowing-combination', 'Flowing Combination', '〰', 'Carry a flowing combo through enemies ahead.', 'front', 42, { radius: 112 }),
      power('rising-palm', 'Rising Palm', '✺', 'Lift a foe with a strong spirit-infused blow.', 'front', 48, { stunMs: 650 }),
      power('ring-of-strikes', 'Ring of Strikes', '⟳', 'Strike every foe moving within your reach.', 'area', 36, { radius: 102 }),
      power('mountain-breaker', 'Mountain Breaker', '✹', 'A focused blow with the force of a falling stone.', 'front', 64, { cooldownMs: 10500, cost: 38 }),
    ]),
    discipline('focus', 'Inner Focus', '❋', 'Shape spirit into stronger attacks and reliable reserves.', [
      legacyPower('adept', 1, 'empower', 0, { durationMs: 6000, resourceRestore: 38 }),
      power('centered-breath', 'Centered Breath', '◉', 'Recover spirit and strengthen your next attack.', 'empower', 0, { durationMs: 8000, resourceRestore: 48 }),
      power('spirit-reserve', 'Spirit Reserve', '◇', 'Restore a deeper measure of spirit.', 'restore', 60),
      power('still-mind', 'Still Mind', '❋', 'Focus to empower attacks for a long interval.', 'empower', 0, { durationMs: 11000, resourceRestore: 18 }),
      power('surging-chi', 'Surging Chi', '✦', 'Restore spirit and briefly increase your force.', 'empower', 0, { durationMs: 10500, resourceRestore: 64 }),
      power('perfect-harmony', 'Perfect Harmony', '☼', 'Fully restore spirit and empower your next technique.', 'empower', 0, { durationMs: 14000, resourceRestore: 90, cooldownMs: 15000, cost: 0 }),
    ]),
    discipline('restoration', 'Resilience', '♡', 'Restore vitality and stay present through a long fight.', [
      legacyPower('adept', 2, 'heal', 42),
      power('mending-palm', 'Mending Palm', '♡', 'Restore health with a practiced touch.', 'heal', 52),
      power('living-current', 'Living Current', '〰', 'Restore health and a small amount of spirit.', 'heal', 60, { resourceRestore: 16 }),
      power('renewing-wave', 'Renewing Wave', '❋', 'Send a restorative pulse through your body.', 'heal', 74),
      power('serenity', 'Serenity', '☼', 'Recover health while briefly warding the next blow.', 'heal', 84, { durationMs: 2200, guardStyle: 'ward' }),
      power('life-unbroken', 'Life Unbroken', '✹', 'Restore a large portion of your health.', 'heal', 112, { cooldownMs: 15000, cost: 40 }),
    ]),
    discipline('spiritcraft', 'Spiritcraft', '〰', 'Release spirit at range or disrupt a group of foes.', [
      legacyPower('adept', 3, 'projectile', 26, { projectileSpeed: 208, projectileRadius: 14, areaOfEffect: 24, tint: 0x85e3d3 }),
      power('ripple-strike', 'Ripple Strike', '〰', 'Send a quick spirit bolt toward your aim.', 'projectile', 34, { projectileSpeed: 240, tint: 0x85e3d3 }),
      power('binding-wave', 'Binding Wave', '⌁', 'Damage and slow enemies caught in the wave.', 'slow', 25, { tint: 0x85e3d3, slowMs: 2600, radius: 96 }),
      power('echo-burst', 'Echo Burst', '✺', 'Burst spirit around the nearest group of enemies.', 'area', 38, { radius: 100, tint: 0x85e3d3 }),
      power('spirit-lance', 'Spirit Lance', '➤', 'Launch a fast, piercing spirit lance.', 'projectile', 48, { projectileSpeed: 300, projectileRadius: 10, tint: 0x85e3d3 }),
      power('tide-of-spirits', 'Tide of Spirits', '❋', 'Release a wide, forceful wave of spirit.', 'projectile', 60, { projectileSpeed: 190, projectileRadius: 20, areaOfEffect: 54, tint: 0x85e3d3, cooldownMs: 11000, cost: 40 }),
    ]),
  ],
  mage: [
    discipline('flame', 'Ember Arts', '☄', 'Shape fire into precise bolts and explosive bursts.', [
      legacyPower('mage', 0, 'projectile', 34, { tint: 0xff783e, projectileSpeed: 230, projectileRadius: 9, areaOfEffect: 50 }),
      power('cinder-shot', 'Cinder Shot', '☄', 'Launch a quick, focused ember bolt.', 'projectile', 42, { tint: 0xff783e, projectileSpeed: 270, areaOfEffect: 18 }),
      power('flareburst', 'Flareburst', '✦', 'Detonate a bright fireburst around your target.', 'projectile', 48, { tint: 0xff783e, projectileSpeed: 210, projectileRadius: 12, areaOfEffect: 62 }),
      power('fireline', 'Fireline', '〰', 'Send a line of flame through nearby enemies.', 'projectile', 50, { tint: 0xff783e, projectileSpeed: 240, projectileRadius: 14, areaOfEffect: 36 }),
      power('sunspike', 'Sunspike', '☼', 'Focus heat into a fast, high-damage strike.', 'projectile', 58, { tint: 0xffc15c, projectileSpeed: 320, projectileRadius: 11 }),
      power('phoenix-heart', 'Phoenix Heart', '✹', 'Unleash a powerful ember that erupts on impact.', 'projectile', 76, { tint: 0xff783e, projectileSpeed: 200, projectileRadius: 20, areaOfEffect: 82, cooldownMs: 11500, cost: 42 }),
    ]),
    discipline('frost', 'Frost Weaving', '❄', 'Slow enemies and make space for a deliberate counterattack.', [
      legacyPower('mage', 1, 'slow', 22, { slowMs: 3200, tint: 0x9ad9f2 }),
      power('frost-shard', 'Frost Shard', '❄', 'Launch a chilling shard that slows on impact.', 'projectile', 34, { slowMs: 2000, tint: 0x9ad9f2, projectileSpeed: 250, areaOfEffect: 18 }),
      power('rime-ring', 'Rime Ring', '◌', 'Slow enemies gathered close around you.', 'slow', 30, { slowMs: 4000, radius: 100, tint: 0x9ad9f2 }),
      power('glacier-lance', 'Glacier Lance', '➤', 'Send a piercing lance of ice toward your aim.', 'projectile', 46, { slowMs: 3000, tint: 0x9ad9f2, projectileSpeed: 310, projectileRadius: 11 }),
      power('winter-bloom', 'Winter Bloom', '❄', 'Burst cold through a wider circle of enemies.', 'slow', 42, { slowMs: 4800, radius: 116, tint: 0x9ad9f2 }),
      power('stillwinter', 'Stillwinter', '✧', 'Freeze a broad area with a powerful nova.', 'slow', 60, { slowMs: 6200, radius: 128, tint: 0x9ad9f2, cooldownMs: 13000, cost: 42 }),
    ]),
    discipline('arcana', 'Wayfolding', '✧', 'Bend distance and reposition before danger reaches you.', [
      legacyPower('mage', 2, 'dash', 0, { movement: 105, durationMs: 520 }),
      power('short-fold', 'Short Fold', '✧', 'Blink a short distance in your facing direction.', 'dash', 0, { movement: 135, durationMs: 420 }),
      power('phase-step', 'Phase Step', '◌', 'Blink through danger and briefly evade harm.', 'dash', 0, { movement: 165, durationMs: 650 }),
      power('arcane-drift', 'Arcane Drift', '〰', 'Move swiftly and empower the next spell.', 'empower', 0, { movement: 90, durationMs: 8500, resourceRestore: 16 }),
      power('folded-space', 'Folded Space', '⬡', 'Blink farther and leave a burst of force.', 'dash', 28, { movement: 195, durationMs: 540 }),
      power('farstep', 'Farstep', '➤', 'Cross a long distance in a flash of arcane light.', 'dash', 0, { movement: 230, durationMs: 700, cooldownMs: 12000, cost: 38 }),
    ]),
    discipline('warding', 'Warding', '⬡', 'Protect yourself and turn an enemy’s strike aside.', [
      legacyPower('mage', 3, 'guard', 0, { guardStyle: 'ward', durationMs: 5200 }),
      power('rune-ward', 'Rune Ward', '⬡', 'Absorb the next hit with a stronger ward.', 'guard', 0, { guardStyle: 'ward', durationMs: 6500 }),
      power('aether-shell', 'Aether Shell', '◇', 'Reduce incoming damage for a short interval.', 'guard', 0, { guardStyle: 'brace', durationMs: 7400 }),
      power('reflecting-seal', 'Reflecting Seal', '◉', 'Ward a blow and recover some aether.', 'guard', 0, { guardStyle: 'ward', durationMs: 7000, resourceRestore: 18 }),
      power('sanctuary', 'Sanctuary', '✦', 'Gain a longer ward against a dangerous attack.', 'guard', 0, { guardStyle: 'ward', durationMs: 9000 }),
      power('star-mantle', 'Star Mantle', '☼', 'A powerful ward that steadies your next spell.', 'guard', 0, { guardStyle: 'ward', durationMs: 11000, resourceRestore: 28, cooldownMs: 14000, cost: 40 }),
    ]),
  ],
};

export const MAX_POWER_RANK = 3;

export const HERO_TREE_ID = 'hero';
export const HERO_TREE_UNLOCK_LEVEL = 2;

export type HeroUpgradeDefinition = {
  id: string;
  name: string;
  icon: string;
  description: string;
  stat: 'speed' | 'damage' | 'health' | 'spirit';
};

export const HERO_UPGRADES: HeroUpgradeDefinition[] = [
  {
    id: 'hero-speed',
    name: 'Fleet Footwork',
    icon: '➤',
    description: 'Move faster through the field.',
    stat: 'speed',
  },
  {
    id: 'hero-damage',
    name: 'Keen Force',
    icon: '⚔',
    description: 'Increase weapon and power damage.',
    stat: 'damage',
  },
  {
    id: 'hero-health',
    name: 'Deep Vitality',
    icon: '♡',
    description: 'Increase maximum health.',
    stat: 'health',
  },
  {
    id: 'hero-spirit',
    name: 'Steady Spirit',
    icon: '✧',
    description: 'Increase maximum spirit.',
    stat: 'spirit',
  },
];

export type HeroTrainingBonuses = {
  movementMultiplier: number;
  damageMultiplier: number;
  maxHp: number;
  maxResource: number;
};

export function getHeroUpgradeRank(rank: number | undefined): number {
  if (typeof rank !== 'number' || !Number.isFinite(rank)) return 0;
  return Math.max(0, Math.floor(rank));
}

export function getHeroTrainingBonuses(ranks: Record<string, number>): HeroTrainingBonuses {
  const rank = (id: string) => getHeroUpgradeRank(ranks[id]);
  return {
    movementMultiplier: 1 + rank('hero-speed') * 0.05,
    damageMultiplier: 1 + rank('hero-damage') * 0.04,
    maxHp: rank('hero-health') * 12,
    maxResource: rank('hero-spirit') * 8,
  };
}

export function heroUpgradeEffect(upgrade: HeroUpgradeDefinition, rank: number): string {
  const amount = getHeroUpgradeRank(rank);
  switch (upgrade.stat) {
    case 'speed': return `+${amount * 5}% movement speed`;
    case 'damage': return `+${amount * 4}% damage`;
    case 'health': return `+${amount * 12} maximum health`;
    case 'spirit': return `+${amount * 8} maximum spirit`;
  }
}

export const MAGE_SPELL_BASE_DAMAGE_MULTIPLIER = 1.08;
export const POWER_AMOUNT_PER_LEVEL = 0.02;

export function getRankedPowerAmount(
  power: Pick<PowerDefinition, 'baseDamage'>,
  rank: number,
  level = 1,
  classId?: ClassId,
): number {
  const rankMultiplier = 1 + Math.max(0, rank - 1) * 0.25;
  const levelMultiplier = 1 + Math.max(0, level - 1) * POWER_AMOUNT_PER_LEVEL;
  const classMultiplier = classId === 'mage' && power.baseDamage > 0
    ? MAGE_SPELL_BASE_DAMAGE_MULTIPLIER
    : 1;
  return Math.round(power.baseDamage * rankMultiplier * levelMultiplier * classMultiplier);
}

export function getClassPowers(classId: ClassId): PowerDefinition[] {
  return CLASS_DISCIPLINES[classId].flatMap((tree) => tree.powers);
}

export function findClassPower(classId: ClassId, powerId: string): PowerDefinition | undefined {
  return getClassPowers(classId).find((item) => item.id === powerId);
}

export function getStartingPowerRanks(classId: ClassId): Record<string, number> {
  return Object.fromEntries(CLASS_DISCIPLINES[classId].map((tree) => [tree.powers[0].id, 1]));
}

export function getDisciplineInvestment(
  classId: ClassId,
  disciplineId: string,
  ranks: Record<string, number>,
): number {
  const tree = CLASS_DISCIPLINES[classId].find((item) => item.id === disciplineId);
  if (!tree) return 0;
  return tree.powers.reduce((spent, item) => {
    const freeStartingRank = item.tier === 1 ? 1 : 0;
    return spent + Math.max(0, (ranks[item.id] ?? 0) - freeStartingRank);
  }, 0);
}
