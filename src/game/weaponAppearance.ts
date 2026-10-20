import { CLASSES, type ClassId, type Direction } from './data';

type WeaponForm = 'sword' | 'dagger' | 'staff' | 'spear' | 'axe' | 'mace' | 'bow' | 'wraps';

type WeaponStyle = {
  form: WeaponForm;
  blade: string;
  highlight: string;
  grip: string;
  accent: string;
  length: number;
  variant: number;
  briarEdge: boolean;
};

const palettes = [
  { blade: '#cbd9d6', highlight: '#fff4d2', grip: '#694432', accent: '#d1a653' },
  { blade: '#73b9bd', highlight: '#d9ffff', grip: '#493c4f', accent: '#c6a5e5' },
  { blade: '#e08d63', highlight: '#ffe0a8', grip: '#513628', accent: '#e7bd5c' },
  { blade: '#aab5dd', highlight: '#f0eaff', grip: '#3d425b', accent: '#c49bda' },
  { blade: '#8dbb7b', highlight: '#e1f2b7', grip: '#4a3c2e', accent: '#d8b978' },
  { blade: '#d7b96c', highlight: '#fff1bd', grip: '#5a382b', accent: '#e88762' },
  { blade: '#849db1', highlight: '#e1f0f7', grip: '#3e3439', accent: '#d19c5f' },
  { blade: '#cb8fb0', highlight: '#ffe0f1', grip: '#48344b', accent: '#8ad0bd' },
] as const;

const inferredForms: WeaponForm[] = ['sword', 'dagger', 'staff', 'spear', 'axe', 'mace', 'bow'];
const namedWeaponStyles: Record<string, Omit<WeaponStyle, 'briarEdge'>> = {
  'hearthguard mace': {
    form: 'mace',
    blade: '#d8ad5a',
    highlight: '#fff0b2',
    grip: '#5f382b',
    accent: '#bd7541',
    length: 34,
    variant: 1,
  },
  'starfall spear': {
    form: 'spear',
    blade: '#82b7db',
    highlight: '#e4f6ff',
    grip: '#42334e',
    accent: '#e1bd78',
    length: 44,
    variant: 2,
  },
  'cinderwake staff': {
    form: 'staff',
    blade: '#ed714c',
    highlight: '#ffe4a0',
    grip: '#563627',
    accent: '#f2b04b',
    length: 45,
    variant: 1,
  },
};

const weaponAnchors: Record<ClassId, Record<Direction, { x: number; y: number; angle: number }>> = {
  warrior: {
    down: { x: 49, y: 178, angle: 1.73 },
    up: { x: 207, y: 178, angle: 1.41 },
    left: { x: 48, y: 178, angle: 1.77 },
    right: { x: 208, y: 178, angle: 1.35 },
  },
  rogue: {
    down: { x: 210, y: 143, angle: 0.76 },
    up: { x: 46, y: 143, angle: 2.38 },
    left: { x: 48, y: 151, angle: 2.25 },
    right: { x: 210, y: 151, angle: 0.89 },
  },
  adept: {
    down: { x: 207, y: 145, angle: 0.63 },
    up: { x: 49, y: 145, angle: 2.51 },
    left: { x: 49, y: 147, angle: 2.29 },
    right: { x: 207, y: 147, angle: 0.85 },
  },
  mage: {
    down: { x: 39, y: 145, angle: 1.55 },
    up: { x: 217, y: 145, angle: 1.59 },
    left: { x: 39, y: 145, angle: 1.55 },
    right: { x: 217, y: 145, angle: 1.59 },
  },
};

function stableHash(value: string) {
  let hash = 2166136261;
  for (const character of value.toLowerCase()) {
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  }
  return hash >>> 0;
}

function getWeaponStyle(classId: ClassId, weaponName?: string): WeaponStyle | null {
  const name = weaponName?.trim();
  if (!name || name.toLowerCase() === CLASSES[classId].weapon.toLowerCase()) return null;

  const normalized = name.toLowerCase();
  const namedStyle = namedWeaponStyles[normalized];
  if (namedStyle) return { ...namedStyle, briarEdge: false };

  const briarEdge = normalized.includes('briar');
  const hash = stableHash(name);
  const form: WeaponForm = briarEdge
    ? 'sword'
    : /wrap|fist|knuckle|gauntlet/.test(normalized)
      ? 'wraps'
      : /staff|rod|wand/.test(normalized)
        ? 'staff'
        : /dagger|knife|dirk|shiv/.test(normalized)
          ? 'dagger'
          : /spear|pike|lance|halberd/.test(normalized)
            ? 'spear'
            : /axe|hatchet/.test(normalized)
              ? 'axe'
              : /mace|hammer|club|flail/.test(normalized)
                ? 'mace'
                : /bow|crossbow/.test(normalized)
                  ? 'bow'
                  : /sword|blade|saber|sabre/.test(normalized)
                    ? 'sword'
                    : inferredForms[(hash >>> 4) % inferredForms.length];
  const palette = briarEdge
    ? { blade: '#83b56d', highlight: '#e1f2b7', grip: '#4a3c2e', accent: '#4e7d43' }
    : palettes[(hash >>> 2) % palettes.length];
  const baseLength = form === 'staff' || form === 'spear' || form === 'bow'
    ? 43
    : form === 'dagger' || form === 'wraps'
      ? 25
      : 35;

  return {
    form,
    ...palette,
    length: baseLength + ((hash >>> 11) % 3) * 4,
    variant: (hash >>> 8) % 3,
    briarEdge,
  };
}

function drawLine(
  context: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
  width: number,
) {
  context.beginPath();
  context.moveTo(x1, y1);
  context.lineTo(x2, y2);
  context.strokeStyle = color;
  context.lineWidth = width;
  context.stroke();
}

function drawBlade(context: CanvasRenderingContext2D, style: WeaponStyle, length: number) {
  const width = style.variant === 1 ? 6 : 4;
  context.beginPath();
  context.moveTo(7, -width);
  context.lineTo(length - 7, -width * 0.7);
  context.lineTo(length, 0);
  context.lineTo(length - 7, width * 0.7);
  context.lineTo(7, width);
  context.closePath();
  context.fillStyle = '#342c2a';
  context.fill();
  context.beginPath();
  context.moveTo(9, -width + 1.5);
  context.lineTo(length - 8, -width * 0.35);
  context.lineTo(length - 2, 0);
  context.lineTo(length - 8, width * 0.35);
  context.lineTo(9, width - 1.5);
  context.closePath();
  context.fillStyle = style.blade;
  context.fill();
  drawLine(context, 10, -1, length - 3, -0.5, style.highlight, 1.4);
}

function drawWeaponShape(context: CanvasRenderingContext2D, style: WeaponStyle) {
  context.lineCap = 'round';
  context.lineJoin = 'round';
  const length = style.length;

  if (style.form === 'wraps') {
    drawLine(context, -2, -5, 9, -5, '#302b29', 7);
    drawLine(context, -2, -5, 9, -5, style.grip, 4);
    drawLine(context, 0, -7, 3, -3, style.accent, 2);
    drawLine(context, 5, -7, 8, -3, style.highlight, 2);
    return;
  }

  if (style.form === 'staff' || style.form === 'spear' || style.form === 'bow') {
    drawLine(context, -10, 0, length, 0, '#302b29', style.form === 'bow' ? 4 : 7);
    drawLine(context, -10, 0, length, 0, style.form === 'bow' ? style.accent : style.grip, style.form === 'bow' ? 2 : 4);
    for (const position of [-2, 8, 18]) {
      drawLine(context, position, -3, position + 2, 3, style.accent, 1.5);
    }
    if (style.form === 'staff') {
      context.fillStyle = '#332c2c';
      context.beginPath();
      context.arc(length, 0, 6, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = style.blade;
      context.beginPath();
      context.moveTo(length, -5);
      context.lineTo(length + 4, 0);
      context.lineTo(length, 5);
      context.lineTo(length - 4, 0);
      context.closePath();
      context.fill();
      drawLine(context, length - 1, -3, length + 1, 0, style.highlight, 1.3);
    } else if (style.form === 'spear') {
      context.beginPath();
      context.moveTo(length - 8, -5);
      context.lineTo(length + 8, 0);
      context.lineTo(length - 8, 5);
      context.closePath();
      context.fillStyle = '#342c2a';
      context.fill();
      context.beginPath();
      context.moveTo(length - 6, -3);
      context.lineTo(length + 6, 0);
      context.lineTo(length - 6, 3);
      context.closePath();
      context.fillStyle = style.blade;
      context.fill();
      drawLine(context, length - 6, -1, length + 5, 0, style.highlight, 1);
    } else {
      context.beginPath();
      context.moveTo(0, -15);
      context.quadraticCurveTo(22, 0, 0, 15);
      context.strokeStyle = '#342c2a';
      context.lineWidth = 5;
      context.stroke();
      context.beginPath();
      context.moveTo(0, -12);
      context.quadraticCurveTo(18, 0, 0, 12);
      context.strokeStyle = style.blade;
      context.lineWidth = 2.5;
      context.stroke();
      drawLine(context, 2, -12, 2, 12, style.highlight, 1);
    }
    return;
  }

  drawLine(context, -9, 0, 9, 0, '#302b29', 8);
  drawLine(context, -9, 0, 9, 0, style.grip, 4.5);
  drawLine(context, -3, -2, 1, 2, style.accent, 1.7);
  drawLine(context, 3, -2, 7, 2, style.accent, 1.7);

  if (style.form === 'dagger') {
    drawLine(context, 7, -6, 7, 6, '#3a302d', 4);
    drawLine(context, 7, -4, 7, 4, style.accent, 2);
    drawBlade(context, style, length);
    if (style.variant === 2) {
      context.save();
      context.translate(-1, 8);
      drawLine(context, 7, -4, 7, 4, '#3a302d', 3);
      drawBlade(context, style, length - 5);
      context.restore();
    }
    return;
  }

  if (style.form === 'axe') {
    drawLine(context, 5, 0, length - 2, 0, '#302b29', 6);
    drawLine(context, 5, 0, length - 2, 0, style.grip, 3.5);
    context.beginPath();
    context.moveTo(length - 9, -13);
    context.quadraticCurveTo(length + 12, -10, length + 6, 0);
    context.quadraticCurveTo(length + 12, 10, length - 9, 13);
    context.lineTo(length - 5, 0);
    context.closePath();
    context.fillStyle = '#342c2a';
    context.fill();
    context.beginPath();
    context.moveTo(length - 7, -10);
    context.quadraticCurveTo(length + 8, -7, length + 3, 0);
    context.quadraticCurveTo(length + 8, 7, length - 7, 10);
    context.lineTo(length - 3, 0);
    context.closePath();
    context.fillStyle = style.blade;
    context.fill();
    drawLine(context, length - 5, -7, length + 1, 0, style.highlight, 1.5);
    return;
  }

  if (style.form === 'mace') {
    drawLine(context, 5, 0, length - 3, 0, '#302b29', 7);
    drawLine(context, 5, 0, length - 3, 0, style.grip, 4);
    context.fillStyle = '#342c2a';
    context.beginPath();
    context.arc(length, 0, 9, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = style.blade;
    context.beginPath();
    context.arc(length, 0, 6, 0, Math.PI * 2);
    context.fill();
    for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
      drawLine(context, length + Math.cos(angle) * 5, Math.sin(angle) * 5, length + Math.cos(angle) * 10, Math.sin(angle) * 10, style.highlight, 2);
    }
    return;
  }

  drawLine(context, 6, -10, 6, 10, '#342c2a', 5);
  drawLine(context, 6, -8, 6, 8, style.accent, 2.5);
  drawBlade(context, style, length);
  if (style.briarEdge) {
    for (const thornX of [15, 25, 34]) {
      context.beginPath();
      context.moveTo(thornX - 2, 0);
      context.lineTo(thornX, -7);
      context.lineTo(thornX + 5, 1);
      context.closePath();
      context.fillStyle = style.accent;
      context.fill();
    }
    context.fillStyle = style.highlight;
    context.fillRect(6, -1, 3, 2);
  } else {
    context.fillStyle = style.accent;
    context.fillRect(4, -1.5, 3, 3);
  }
}

function eraseMageStarterStaff(context: CanvasRenderingContext2D, direction: Direction) {
  const x = direction === 'down' || direction === 'left' ? 39 : 217;
  context.clearRect(x - 9, 58, 18, 166);
}

export function paintEquippedWeapon(
  context: CanvasRenderingContext2D,
  direction: Direction,
  classId: ClassId,
  weaponName?: string,
) {
  const style = getWeaponStyle(classId, weaponName);
  if (!style) return;

  if (classId === 'mage') eraseMageStarterStaff(context, direction);
  const anchor = weaponAnchors[classId][direction];
  context.save();
  context.translate(anchor.x, anchor.y);
  context.rotate(anchor.angle);
  drawWeaponShape(context, style);
  context.restore();
}
