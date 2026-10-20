import type { Item } from './data';

export type ShopStockItem = {
  item: Item;
  price: number;
};

const item = (value: Omit<Item, 'equipped'>): Item => ({ ...value, equipped: false });

const TONIC = item({
  id: 'small-tonic',
  name: 'Small tonic',
  kind: 'consumable',
  description: 'Restores 35 health.',
  quantity: 1,
});

export const TOWN_SHOP_STOCK: Readonly<Record<string, readonly ShopStockItem[]>> = {
  'mournwater-town': [
    { price: 72, item: item({
      id: 'reedline-sabre', name: 'Reedline sabre', kind: 'weapon', bonusAttack: 7,
      description: 'A quick marsh blade, sharpened for the flooded roads. +7 basic attack.',
    }) },
    { price: 92, item: item({
      id: 'peatweave-vest', name: 'Peatweave vest', kind: 'armor', bonusHp: 30,
      description: 'A layered vest sealed against cold marsh water. +30 maximum health.',
    }) },
    { price: 84, item: item({
      id: 'ferry-token-loop', name: 'Ferry-token loop', kind: 'jewelry', bonusHp: 16, bonusAttack: 1,
      description: 'A silver ferry token on a braided loop. +16 health and +1 attack.',
    }) },
    { price: 8, item: TONIC },
  ],
  gleamharbor: [
    { price: 96, item: item({
      id: 'sunshard-knife', name: 'Sunshard knife', kind: 'weapon', bonusAttack: 7,
      description: 'A balanced blade with a sunlit glass edge. +7 basic attack.',
    }) },
    { price: 132, item: item({
      id: 'orchard-mantle', name: 'Orchard mantle', kind: 'armor', bonusHp: 34,
      description: 'A light mantle woven with flexible glass-thread. +34 maximum health.',
    }) },
    { price: 118, item: item({
      id: 'moth-prism-pendant', name: 'Moth-prism pendant', kind: 'jewelry', bonusHp: 12, bonusAttack: 2,
      description: 'A small prism that catches the last green light. +12 health and +2 attack.',
    }) },
    { price: 8, item: TONIC },
  ],
  'capital-survivors-hold': [
    { price: 220, item: item({
      id: 'watchcaptain-falchion', name: 'Watchcaptain falchion', kind: 'weapon', bonusAttack: 15,
      description: 'A serviceable city blade, one step below the old hidden relics. +15 basic attack.',
    }) },
    { price: 245, item: item({
      id: 'wallguard-coat', name: 'Wallguard coat', kind: 'armor', bonusHp: 64,
      description: 'A reinforced coat stitched from salvaged watch uniforms. +64 maximum health.',
    }) },
    { price: 230, item: item({
      id: 'survivors-vow-ring', name: 'Survivor’s vow ring', kind: 'jewelry', bonusHp: 28, bonusAttack: 3,
      description: 'A signet shared among the city’s last watch. +28 health and +3 attack.',
    }) },
    { price: 8, item: TONIC },
  ],
};

export const shopStockForCell = (cellId: string | undefined): readonly ShopStockItem[] =>
  cellId ? TOWN_SHOP_STOCK[cellId] ?? [] : [];

export const getItemSellPrice = (value: Item): number => {
  if (value.kind === 'weapon') return Math.max(1, 8 + (value.bonusAttack ?? 0) * 3);
  if (value.kind === 'armor') return Math.max(1, 8 + Math.floor((value.bonusHp ?? 0) / 3));
  if (value.kind === 'jewelry') return Math.max(1,
    10 + Math.floor((value.bonusHp ?? 0) / 4) + (value.bonusAttack ?? 0) * 2);
  if (value.kind === 'consumable') return 4;
  return 0;
};

export const getTrainingXpForShards = (shards: number): number => {
  if (!Number.isFinite(shards) || shards < 25) return 0;
  const amount = Math.floor(shards);
  const doublingBonuses = Math.floor(Math.log2(amount / 25));
  const efficiencyBonus = 1.25 ** doublingBonuses;
  return Math.floor((amount / 25) * 60 * efficiencyBonus);
};
