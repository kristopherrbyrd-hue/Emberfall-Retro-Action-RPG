import type { WorldRegionId } from './worldMap';

export type RegionalMonster = {
  id: string;
  name: string;
  maxHp: number;
  damage: number;
  speed: number;
  tint: number;
  radius: number;
  combatStyle?: 'rush' | 'blink';
};

/**
 * Each realm has its own native field-creature roster. Stats step upward with
 * the intended level gates; the final territory keeps three distinct strains.
 */
export const REGIONAL_MONSTERS: Readonly<Record<WorldRegionId, readonly RegionalMonster[]>> = {
  hearthglen: [
    { id: 'briarback-whelp', name: 'Briarback Whelp', maxHp: 48, damage: 7, speed: 43, tint: 0x8ca95f, radius: 14 },
    { id: 'sunleaf-mote', name: 'Sunleaf Mote', maxHp: 38, damage: 7, speed: 52, tint: 0xe3bd58, radius: 11 },
    { id: 'root-tortoise', name: 'Root Tortoise', maxHp: 52, damage: 8, speed: 34, tint: 0x8a7750, radius: 16 },
    { id: 'moon-stag', name: 'Moon Stag', maxHp: 40, damage: 8, speed: 82, tint: 0x9ac7a6, radius: 12, combatStyle: 'rush' },
  ],
  'drowned-marches': [
    { id: 'siltback-skitter', name: 'Siltback Skitter', maxHp: 72, damage: 11, speed: 42, tint: 0x638b82, radius: 15 },
    { id: 'drownlight-eel', name: 'Drownlight Eel', maxHp: 61, damage: 10, speed: 46, tint: 0x70bfd0, radius: 13 },
    { id: 'mire-gulper', name: 'Mire Gulper', maxHp: 84, damage: 12, speed: 38, tint: 0x9b885b, radius: 18 },
    { id: 'fen-stalker', name: 'Fen Stalker', maxHp: 70, damage: 11, speed: 64, tint: 0x739ca0, radius: 13, combatStyle: 'blink' },
  ],
  'ashen-peaks': [
    { id: 'basalt-burrower', name: 'Basalt Burrower', maxHp: 112, damage: 15, speed: 33, tint: 0xb7644c, radius: 17 },
    { id: 'frostash-harrier', name: 'Frost-ash Harrier', maxHp: 84, damage: 14, speed: 60, tint: 0xc4d5d4, radius: 12 },
    { id: 'slagback-ram', name: 'Slagback Ram', maxHp: 128, damage: 17, speed: 48, tint: 0xa96a4d, radius: 19, combatStyle: 'rush' },
    { id: 'rime-screecher', name: 'Rime Screecher', maxHp: 90, damage: 16, speed: 76, tint: 0xb5d4df, radius: 12, combatStyle: 'blink' },
  ],
  glasslands: [
    { id: 'glassroot-scuttler', name: 'Glassroot Scuttler', maxHp: 126, damage: 17, speed: 43, tint: 0x88c9aa, radius: 16 },
    { id: 'prism-moth', name: 'Prism Moth', maxHp: 92, damage: 15, speed: 56, tint: 0xe5cf7d, radius: 12 },
    { id: 'shardback-tortoise', name: 'Shardback Tortoise', maxHp: 144, damage: 19, speed: 34, tint: 0xd2a9bc, radius: 19 },
    { id: 'mirage-viper', name: 'Mirage Viper', maxHp: 106, damage: 17, speed: 68, tint: 0x71c8c5, radius: 13, combatStyle: 'blink' },
  ],
  'fallen-capital': [
    { id: 'clockwork-husk', name: 'Clockwork Husk', maxHp: 154, damage: 20, speed: 36, tint: 0x9e87ad, radius: 18 },
    { id: 'archive-wraith', name: 'Archive Wraith', maxHp: 112, damage: 18, speed: 45, tint: 0xb7a9c5, radius: 14 },
    { id: 'clockwork-mite', name: 'Clockwork Mite', maxHp: 170, damage: 22, speed: 62, tint: 0xb68a52, radius: 14, combatStyle: 'rush' },
    { id: 'archive-moth', name: 'Archive Moth', maxHp: 116, damage: 19, speed: 56, tint: 0xa99aa9, radius: 16, combatStyle: 'blink' },
  ],
  'first-hunger': [
    { id: 'marrow-scavenger', name: 'Marrow Scavenger', maxHp: 190, damage: 23, speed: 54, tint: 0xd3c5b0, radius: 18 },
    { id: 'rain-wraith', name: 'Rain Wraith', maxHp: 172, damage: 22, speed: 43, tint: 0x7cabbc, radius: 16 },
    { id: 'vein-reaver', name: 'Vein Reaver', maxHp: 214, damage: 25, speed: 50, tint: 0xb94054, radius: 18 },
  ],
};

export const RANGED_MONSTER_NAMES: ReadonlySet<string> = new Set([
  'Sunleaf Mote',
  'Drownlight Eel',
  'Frost-ash Harrier',
  'Prism Moth',
  'Archive Wraith',
  'Rain Wraith',
  'Reflection Stalker',
  'Covenant Shade',
]);
