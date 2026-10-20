import { renderModularHeroFrame } from '@/game/modularHero';
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react';
import {
  ArrowDown, ArrowLeft, ArrowRight, ArrowUp, BookOpen, Check, Compass, Menu,
  ChevronLeft, ChevronRight, Map as MapIcon, Shield, Sparkles, Swords, Backpack, X, Zap, Play, RotateCcw, Lock, Unlock,
  ShoppingBag, Coins, GraduationCap,
} from 'lucide-react';
import { useEmberfallSession } from '@/game/session';
import { PhaserWorld } from '@/game/GameWorld';
import { DungeonMap } from '@/game/DungeonMap';
import { PostgameWaveBadge } from '@/game/PostgameWaveBadge';
import { GameMenu } from '@/game/GameMenu';
import '@/game/GameMenu.css';
import { wellById } from '@/game/wells';
import { getOverworldMapMarkers } from '@/game/overworldMapMarkers';
import { describePostgameWave, type PostgameWaveStatus } from '@/game/postgame';
import type { AudioPreferences } from '@/game/audio';
import { CLASSES, getSalvageXp, isLockableGear, requiresSalvageConfirmation, type PowerDefinition } from '@/game/data';
import {
  CLASS_DISCIPLINES,
  getDisciplineInvestment,
  getRankedPowerAmount,
  HERO_TREE_ID,
  HERO_TREE_UNLOCK_LEVEL,
  HERO_UPGRADES,
  heroUpgradeEffect,
  getHeroUpgradeRank,
  MAX_POWER_RANK,
} from '@/game/disciplines';
import type { AdventureEngine } from '@/game/simulation';
import { getRestorationCaption, getRestorationShot, RESTORATION_DURATION_MS, type RestorationPresentation } from '@/game/finale';
import { getWorldColorProfile, type WorldProgress } from '@/game/worldProgress';
import { createCustomizedHeroFrame, WALK_FRAME_DURATION_MS, type HeroPose } from '@/game/heroAppearance';
import { getItemSellPrice, getTrainingXpForShards, shopStockForCell } from '@/game/shopEconomy';
import {
  WORLD_CELLS,
  WORLD_REGION_PORTALS,
  getVisibleWorldConnections,
  getWorldRegion,
  worldCellAt,
} from '@/game/worldMap';

type ClassId = 'warrior' | 'rogue' | 'adept' | 'mage';
type Direction = 'up' | 'down' | 'left' | 'right';
type ButtonAction = 'attack' | 'context' | 'ability0' | 'ability1' | 'ability2' | 'ability3';
type MenuId = 'inventory' | 'character' | 'map' | 'abilities' | 'settings' | 'shop' | 'training';
type Action = Direction | ButtonAction;

const classInfo: { id: ClassId; name: string; epithet: string; detail: string; sigil: string; color: string }[] = [
  { id: 'warrior', name: 'Warrior', epithet: 'Hold the line', detail: 'A steady blade, built for close quarters and standing your ground.', sigil: '✦', color: '#d66c4e' },
  { id: 'rogue', name: 'Rogue', epithet: 'Strike unseen', detail: 'Quick footwork and precise hits turn every opening into an advantage.', sigil: '⌁', color: '#78a27c' },
  { id: 'adept', name: 'Adept', epithet: 'Borrow the wild', detail: 'Shape raw life into a flexible rhythm of recovery and force.', sigil: '❋', color: '#dfa94d' },
  { id: 'mage', name: 'Mage', epithet: 'Make a little ruin', detail: 'A bright, deliberate kind of magic with reach and room to breathe.', sigil: '✷', color: '#7895ae' },
];
const TOWN_CELL_IDS = new Set(['village', 'mournwater-town', 'gleamharbor', 'capital-survivors-hold']);
const skinTones = ['#f6d9b7', '#f0c49a', '#d99168', '#bd7b56', '#a96949', '#89583e', '#754b3b', '#513a30'];
const hairTones = ['#1e1b20', '#3a2926', '#765042', '#b9633e', '#d5a34c', '#f1d28b', '#d3d1c5', '#74558b', '#557b72'];
const clothTones = ['#d36345', '#487b64', '#526e91', '#b58a3e', '#8c5d76', '#5b4940', '#b6a690', '#6e566b', '#4e8484'];
const hairStyles = ['Cropped', 'Waved', 'Topknot', 'Long', 'Braided', 'Mohawk', 'Shaved'];
const eyeTones = ['#537894', '#4b7e63', '#865638', '#9a774a', '#787078', '#72b5ba', '#b4aa90'];
const trimTones = ['#cfa659', '#939fa9', '#b06b54', '#609489', '#9372a7', '#ded3bd'];
const facialHairStyles = ['None', 'Stubble', 'Mustache', 'Beard'];
const headwearStyles = ['None', 'Headband', 'Circlet', 'Earring'];
const menuNames: Record<MenuId, string> = { inventory: 'Satchel', character: 'Hero', map: 'Field map', abilities: 'Power Trees', settings: 'Journey menu', shop: 'Town market', training: 'Field training' };

function powerAmountLabel(power: PowerDefinition, rank: number, level: number, classId: ClassId, resourceName: string) {
  const amount = getRankedPowerAmount(power, rank, level, classId);
  const effects: string[] = [];

  if (amount > 0) {
    if (power.effect === 'heal') effects.push(`Heals up to ${amount} HP`);
    else if (power.effect === 'restore') effects.push(`Restores ${amount} ${resourceName}`);
    else if (power.effect === 'poison') effects.push(`Adds up to ${amount} poison damage`);
    else effects.push(`Hits for ${amount} damage`);
  }

  switch (power.effect) {
    case 'guard':
      effects.push(power.guardStyle === 'ward' ? 'Wards the next hit' : 'Reduces incoming damage');
      break;
    case 'empower':
      effects.push('Empowers your attacks');
      break;
    case 'dash':
      effects.push('Dashes in your facing direction');
      break;
    case 'shadow':
      effects.push('Evades danger and empowers your next attack');
      break;
    case 'control':
      effects.push('Stuns nearby enemies');
      break;
    case 'slow':
      effects.push('Slows nearby enemies');
      break;
    case 'poison':
      effects.push('Coats up to five weapon strikes in poison');
      break;
    case 'restore':
      if (amount <= 0) effects.push(`Restores ${resourceName}`);
      break;
    case 'heal':
      if (amount <= 0) effects.push('Restores health');
      break;
    case 'dash-strike':
      effects.push('Rushes into a target');
      break;
    default:
      break;
  }

  if (power.stunMs) effects.push(`Stuns for ${(power.stunMs / 1000).toFixed(power.stunMs % 1000 ? 1 : 0)}s`);
  if (power.slowMs) effects.push(`Slows for ${(power.slowMs / 1000).toFixed(power.slowMs % 1000 ? 1 : 0)}s`);
  if (power.durationMs) effects.push(`Lasts ${(power.durationMs / 1000).toFixed(power.durationMs % 1000 ? 1 : 0)}s`);
  if (power.movement) effects.push(`Moves ${power.movement} units`);
  if (power.resourceRestore) effects.push(`Restores ${power.resourceRestore} ${resourceName}`);

  return effects.join(' · ') || power.description;
}

function currentPowerEffect(power: PowerDefinition, rank: number, level: number, classId: ClassId, resourceName: string) {
  return rank > 0 ? powerAmountLabel(power, rank, level, classId, resourceName) : 'Not trained yet';
}

function nextPowerEffect(power: PowerDefinition, rank: number, level: number, classId: ClassId, resourceName: string) {
  if (rank >= MAX_POWER_RANK) return 'Maximum rank';
  if (rank === 0) return `On unlock: ${powerAmountLabel(power, 1, level, classId, resourceName)}`;
  return `1 training point: ${powerAmountLabel(power, rank + 1, level, classId, resourceName)}`;
}

const modularAtlasPromises = new Map<string, Promise<[HTMLImageElement, HTMLImageElement]>>();
function loadModularAtlases(classId: ClassId, bodyType: 'male' | 'female') {
  const key = `${classId}-${bodyType}`;
  if (!modularAtlasPromises.has(key)) {
    const load = (path: string) => new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image(); img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Cannot load sprite asset ${path}`));
      img.src = `${import.meta.env.BASE_URL}modular-heroes/${path}`;
    });
    modularAtlasPromises.set(key, Promise.all([load(`${key}.png`), load(`${key}-regions.png`)]));
  }
  return modularAtlasPromises.get(key)!;
}
function PixelHero({ skin, hair, cloth, eyes, trim, secondary, leather, metal, facialHair, headwear,
  walking = false, classId, bodyType = 'male', hairStyle = 'cropped', facing = 'down', large = false }: {
  skin: string; hair: string; cloth: string; eyes?: string; trim?: string;
  secondary?: string; leather?: string; metal?: string;
  facialHair?: string; headwear?: string; walking?: boolean; classId: ClassId;
  bodyType?: 'male' | 'female'; hairStyle?: string; facing?: Direction; large?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let cancelled = false;
    let frame = 0;
    let timer: number | undefined;
    loadModularAtlases(classId, bodyType).then(([atlas, regions]) => {
      if (cancelled) return;
      const draw = () => {
        const canvas = canvasRef.current;
        const context = canvas?.getContext('2d');
        if (!canvas || !context || cancelled) return;
        const painted = renderModularHeroFrame(atlas, regions, facing, {
          skin, hairColor: hair, hairStyle, clothingColor: cloth,
          clothingSecondary: secondary, leatherColor: leather, metalColor: metal,
          eyeColor: eyes, trimColor: trim, facialHair, headwear,
        }, walking ? (frame++ % 6) + 1 : 0);
        context.imageSmoothingEnabled = false;
        context.clearRect(0, 0, 256, 256);
        context.drawImage(painted, 0, 0);
      };
      draw();
      if (walking) timer = window.setInterval(draw, WALK_FRAME_DURATION_MS);
    }).catch(console.error);
    return () => { cancelled = true; if (timer !== undefined) window.clearInterval(timer); };
  }, [skin, hair, cloth, eyes, trim, secondary, leather, metal,
      facialHair, headwear, classId, bodyType, hairStyle, facing, walking]);
  return <div className={`pixel-hero ${large ? 'pixel-hero-large' : ''}`}
    aria-label={`${bodyType} ${classId} ${facing} view`} role="img">
      <canvas ref={canvasRef} className="pixel-art" width={256} height={256} aria-hidden="true" />
    </div>;
}

function Brand({ compact = false }: { compact?: boolean }) {
  return <div className={`brand ${compact ? 'brand-compact' : ''}`}><span className="brand-mark">E</span><span>EMBERFALL</span><i>FIELD NOTES · 04</i></div>;
}

function Meter({ label, value, max, tone }: { label: string; value: number; max: number; tone: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, value / max * 100)) : 0;
  return <div className="meter">
    <div className="meter-caption"><span>{label}</span><b>{Math.round(value)}<small> / {Math.round(max)}</small></b></div>
    <div className="meter-track"><div className="meter-fill" style={{ width: `${pct}%`, backgroundColor: tone }} /></div>
  </div>;
}

// Shared by the saved ending and the presentation-only postgame replay.
function CinematicOverlay({ engine }: { engine: AdventureEngine }) {
  const ref = useRef<HTMLDivElement>(null);
  const [cine, setCine] = useState<RestorationPresentation | null>(null);
  useEffect(() => {
    const poll = () => {
      const presentation = engine.getRestorationPresentation();
      const on = presentation !== null;
      ref.current?.closest('.play-screen')?.setAttribute('data-cinematic', on ? 'on' : 'off');
      setCine((prev) => {
        if (!on) return prev ? null : prev;
        if (prev && presentation && Math.abs(prev.ms - presentation.ms) < 90
          && prev.allied === presentation.allied && prev.replay === presentation.replay) return prev;
        return presentation;
      });
    };
    poll();
    const id = window.setInterval(poll, 100);
    return () => window.clearInterval(id);
  }, [engine]);
  const shot = cine ? getRestorationShot(cine.ms) : null;
  return <div ref={ref} className="cine-overlay" aria-hidden={!cine}>
    {cine && shot && <>
      <i className="cine-bar cine-bar-top" /><i className="cine-bar cine-bar-bottom" />
      <div className="cine-title" key={`t-${shot.id}`}>{shot.label}</div>
      <p className="cine-caption" key={`c-${shot.id}`} role="status" data-testid="text-finale-caption">{getRestorationCaption(cine.ms, cine.allied)}</p>
      <div className="cine-progress"><b style={{ width: `${Math.min(100, cine.ms / RESTORATION_DURATION_MS * 100)}%` }} /></div>
      {cine.replay && <button autoFocus className="cine-return" data-testid="button-exit-ending-replay"
        onClick={() => engine.stopRestorationReplay()}>Return to exploration <X size={14} /></button>}
    </>}
  </div>;
}

function App() {
  const { state, saveSlots, saveNotice, engine, beginCreation, returnToTitle, startNewGame, continueGame, setDirection, setAnalogMovement, pressButton, releaseButton, openMenu, closeMenu, dismissDialog, chooseMaelisAlliance, equipItem, toggleGearLock, salvageItem, equipAbility, trainPower, buyShopItem, sellInventoryItem, trainForShards, requestGuide, audioPreferences, audioNotice, changeAudioPreferences, returnToLastWell, saveAndReturnToTitle } = useEmberfallSession();
  const [name, setName] = useState('');
  const [selectedSlot, setSelectedSlot] = useState(0);
  const [classId, setClassId] = useState<ClassId>('warrior');
  const [bodyType, setBodyType] = useState<'male' | 'female'>('male');
  const [skinIndex, setSkinIndex] = useState(0);
  const [hairIndex, setHairIndex] = useState(0);
  const [clothIndex, setClothIndex] = useState(0);
  const [hairStyle, setHairStyle] = useState('Cropped');
  const [eyeIndex, setEyeIndex] = useState(0);
  const [trimIndex, setTrimIndex] = useState(0);
  const [facialHair, setFacialHair] = useState('None');
  const [headwear, setHeadwear] = useState('None');
  const [customColors, setCustomColors] = useState<Record<string, string>>({});
  const changeColor = (key: string, value: string) =>
    setCustomColors((colors) => ({ ...colors, [key]: value }));
  const chosen = (key: string, presets: string[], index: number) => customColors[key] ?? presets[index];
  const [creating, setCreating] = useState(false);
  const heldSources = useRef(new Map<string, Action>());
  const callbacks = useRef({ setDirection, pressButton, releaseButton });
  callbacks.current = { setDirection, pressButton, releaseButton };
  const activeClass = classInfo.find((item) => item.id === classId) ?? classInfo[0];
  const selectedSlotHasSave = saveSlots.some((slot) => slot.index === selectedSlot && slot.status === 'available');

  const dispatch = (action: Action, down: boolean, source: string) => {
    const held = heldSources.current;
    if (down) {
      if (held.has(source)) return;
      const alreadyDown = [...held.values()].includes(action);
      held.set(source, action);
      if (alreadyDown) return;
      if (action === 'up' || action === 'down' || action === 'left' || action === 'right') callbacks.current.setDirection(action, true);
      else callbacks.current.pressButton(action);
    } else {
      const prior = held.get(source);
      if (!prior) return;
      held.delete(source);
      if ([...held.values()].includes(prior)) return;
      if (prior === 'up' || prior === 'down' || prior === 'left' || prior === 'right') callbacks.current.setDirection(prior, false);
      else callbacks.current.releaseButton(prior);
    }
  };

  useEffect(() => {
    const keyMap: Record<string, Action | 'menu-inventory' | 'menu-character' | 'menu-map' | 'menu-abilities' | 'close'> = {
      ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
      KeyJ: 'attack', Space: 'attack', KeyK: 'context', Enter: 'context',
      Digit1: 'ability0', Digit2: 'ability1', Digit3: 'ability2', Digit4: 'ability3',
      KeyI: 'menu-inventory', KeyC: 'menu-character', KeyM: 'menu-map', KeyQ: 'menu-abilities', Escape: 'close',
    };
    const down = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement) return;
      const value = keyMap[event.code];
      if (!value) return;
      event.preventDefault();
      if (value.startsWith('menu-')) openMenu(value.slice(5) as MenuId);
      else if (value === 'close') closeMenu();
        else dispatch(value as Action, true, `key:${event.code}`);
    };
    const up = (event: KeyboardEvent) => {
      const value = keyMap[event.code];
      if (value && !value.startsWith('menu-') && value !== 'close') dispatch(value as Action, false, `key:${event.code}`);
    };
    const releaseAll = () => {
      for (const source of [...heldSources.current.keys()]) dispatch(heldSources.current.get(source)!, false, source);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', releaseAll);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', releaseAll);
      releaseAll();
    };
  }, [openMenu, closeMenu]);

  const createInSlot = (slotIndex: number) => {
    const slot = saveSlots.find((entry) => entry.index === slotIndex);
    if (slot?.status === 'available' || slot?.status === 'unreadable') {
      if (!window.confirm(`Replace the saved journey in Slot ${slotIndex + 1}? Your other slots will stay untouched.`)) return;
    }
    setSelectedSlot(slotIndex);
    setName('');
    setClassId('warrior');
    setCreating(true);
    beginCreation();
  };

  const newHero = () => {
    startNewGame({
      name: name.trim() || 'Ash',
      classId, bodyType,
      skin: chosen('skin', skinTones, skinIndex),
      hairStyle: hairStyle.toLowerCase(),
      hairColor: chosen('hair', hairTones, hairIndex),
      clothingColor: chosen('clothing', clothTones, clothIndex),
      eyeColor: chosen('eyes', eyeTones, eyeIndex),
      trimColor: chosen('trim', trimTones, trimIndex),
      clothingSecondary: customColors.secondary ?? '#a78364',
      leatherColor: customColors.leather ?? '#76513b',
      metalColor: customColors.metal ?? '#a9b8bf',
      facialHair: facialHair.toLowerCase(),
      headwear: headwear.toLowerCase(),
    }, selectedSlot);
  };

  if (state.mode === 'title' && !creating) return <main className="title-screen game-noise">
    <div className="title-sky"><div className="title-moon" /><div className="title-sun" /><div className="title-ridge ridge-back" /><div className="title-ridge ridge-front" />
      <div className="title-landmark"><span /><span /><span /></div>
      <div className="title-copy screen-in">
        <Brand />
        <p className="eyebrow">A pocket-sized legend, waiting to be found</p>
        <h1>The bells<br /><em>fall silent.</em></h1>
        <p className="title-description">Past the last lantern, the old roads still remember you.</p>
        {saveNotice && <p className="save-notice" role="alert" data-testid="save-notice">
          {saveNotice === 'unreadable'
            ? 'A saved journey was found, but it can’t be read and can’t be resumed. You can begin a new tale.'
            : saveNotice === 'storage-unavailable'
              ? 'This browser isn’t allowing access to saved journeys, so you can’t save or resume progress here.'
              : saveSlots.some((slot) => slot.status === 'available')
                ? 'Your latest progress couldn’t be saved. You can still resume your last saved journey, but recent progress may be lost.'
                : 'Saving isn’t available right now. Your progress may be lost when you leave.'}
        </p>}
        <section className="save-slots" aria-label="Choose a journey">
          <h2>Choose a journey</h2>
          {saveSlots.map((slot) => {
            const player = slot.status === 'available' ? slot.save.state.player : null;
            const heroClass = player ? classInfo.find((item) => item.id === player.classId)?.name ?? player.classId : null;
            return <article className={`save-slot ${slot.status}`} key={slot.index} data-testid={`save-slot-${slot.index + 1}`}>
              <div className="save-slot-details">
                <b>Slot {slot.index + 1}</b>
                {player
                  ? <span>{player.name} · {heroClass} · Lv {player.level}</span>
                  : <span>{slot.status === 'unreadable' ? 'Journey cannot be read' : slot.status === 'storage-unavailable' ? 'Storage unavailable' : 'Empty'}</span>}
                {slot.status === 'available' && <small>{slot.save.state.location}</small>}
              </div>
              <div className="save-slot-actions">
                {player
                  ? <>
                    <button type="button" className="slot-continue" onClick={() => continueGame(slot.index)} data-testid={`button-continue-slot-${slot.index + 1}`}><Play size={13} fill="currentColor" /> Continue</button>
                    <button type="button" className="slot-replace" onClick={() => createInSlot(slot.index)} aria-label={`Start a new journey in Slot ${slot.index + 1}`} data-testid={`button-new-slot-${slot.index + 1}`}>New</button>
                  </>
                  : slot.status === 'storage-unavailable'
                    ? <button type="button" className="slot-continue" disabled>Unavailable</button>
                  : <button type="button" className="slot-continue" onClick={() => createInSlot(slot.index)} data-testid={`button-new-slot-${slot.index + 1}`}>Start new <ArrowRight size={13} /></button>}
              </div>
            </article>;
          })}
        </section>
      </div>
      <div className="title-footer"><span>THE BRAMBLEMERE · YEAR 413</span><span>WASD / ARROWS TO MOVE</span></div>
    </div>
    <section className="title-bottom"><span className="title-bottom-sigil">✳</span><p>Somewhere in the Bramblemere, a little fire is still burning.</p><span className="title-version">EMBERFALL <b>1.04</b></span></section>
  </main>;

  if (state.mode === 'creator') return <Creator
    name={name} setName={setName} classId={classId} setClassId={setClassId} bodyType={bodyType} setBodyType={setBodyType}
    customColors={customColors} changeColor={changeColor}
    skinIndex={skinIndex} setSkinIndex={setSkinIndex} hairIndex={hairIndex} setHairIndex={setHairIndex}
    clothIndex={clothIndex} setClothIndex={setClothIndex} hairStyle={hairStyle} setHairStyle={setHairStyle}
    eyeIndex={eyeIndex} setEyeIndex={setEyeIndex} trimIndex={trimIndex} setTrimIndex={setTrimIndex}
    facialHair={facialHair} setFacialHair={setFacialHair} headwear={headwear} setHeadwear={setHeadwear}
    onStart={newHero} onContinue={() => continueGame(selectedSlot)} saveExists={selectedSlotHasSave} onBack={() => { setCreating(false); returnToTitle(); }}
  />;

  return <PlayScreen
    state={state} engine={engine} dispatch={dispatch} setAnalogMovement={setAnalogMovement} openMenu={openMenu} closeMenu={closeMenu} dismissDialog={dismissDialog} chooseMaelisAlliance={chooseMaelisAlliance}
    equipItem={equipItem} toggleGearLock={toggleGearLock} salvageItem={salvageItem} equipAbility={equipAbility} trainPower={trainPower}
    buyShopItem={buyShopItem} sellInventoryItem={sellInventoryItem} trainForShards={trainForShards} requestGuide={requestGuide}
    audioPreferences={audioPreferences} audioNotice={audioNotice} changeAudioPreferences={changeAudioPreferences}
    returnToLastWell={returnToLastWell} saveAndReturnToTitle={saveAndReturnToTitle} saveFailed={saveNotice === 'write-failed'}
  />;
}

function Creator(props: {
  name: string; setName: (s: string) => void; classId: ClassId; setClassId: (s: ClassId) => void; bodyType: 'male' | 'female'; setBodyType: (v: 'male' | 'female') => void;
  customColors: Record<string, string>; changeColor: (key: string, value: string) => void;
  skinIndex: number; setSkinIndex: (n: number) => void; hairIndex: number; setHairIndex: (n: number) => void;
  clothIndex: number; setClothIndex: (n: number) => void; hairStyle: string; setHairStyle: (s: string) => void;
  eyeIndex: number; setEyeIndex: (n: number) => void; trimIndex: number; setTrimIndex: (n: number) => void;
  facialHair: string; setFacialHair: (s: string) => void; headwear: string; setHeadwear: (s: string) => void;
  onStart: () => void; onContinue: () => void; saveExists: boolean; onBack: () => void;
}) {
  const activeClass = classInfo.find((item) => item.id === props.classId) ?? classInfo[0];
  const editableColor = (key: string, preset: string) => <input type="color"
    className="creator-color-input" aria-label={`Choose custom ${key} color`}
    value={props.customColors[key] ?? preset}
    onChange={(event) => props.changeColor(key, event.target.value)} />;
  const [previewFacing, setPreviewFacing] = useState<Direction>('down');
  const [previewWalking, setPreviewWalking] = useState(false);
  const previewDirections: { facing: Direction; label: string }[] = [
    { facing: 'down', label: 'Front' },
    { facing: 'up', label: 'Back' },
    { facing: 'left', label: 'Left' },
    { facing: 'right', label: 'Right' },
  ];
  return <main className="creator-screen screen-in">
    <header className="creator-top"><button className="creator-back" onClick={props.onBack} aria-label="Back to title">←</button><Brand compact /><span>CHARACTER ATLAS <b>01 / 01</b></span></header>
    <div className="creator-layout">
      <section className="creator-form">
        <div className="eyebrow">Before the first footstep</div>
        <h1>Who finds<br /><em>the old road?</em></h1>
        <label className="field-label" htmlFor="hero-name">Your name <span>· up to 18 letters</span></label>
        <input id="hero-name" className="name-input" maxLength={18} value={props.name} onChange={(e) => props.setName(e.target.value)} placeholder="Name your traveler" autoComplete="off" data-testid="input-hero-name" />
        <div className="field-label class-heading">Choose a calling <span>· each has its own rhythm</span></div>
        <div className="class-list" role="radiogroup" aria-label="Choose your class">
          {classInfo.map((item, i) => <button key={item.id} role="radio" aria-checked={props.classId === item.id} className={`class-row ${props.classId === item.id ? 'selected' : ''}`} onClick={() => props.setClassId(item.id)} data-testid={`button-class-${item.id}`}>
            <span className="class-sigil" style={{ color: item.color }}>{item.sigil}</span><span className="class-copy"><b>{item.name}</b><small>{item.epithet}</small></span>
            <span className="class-bars">{[0, 1, 2, 3].map((bar) => <i key={bar} className={bar <= [3, 2, 2, 1][i] ? 'lit' : ''} />)}</span>
            {props.classId === item.id && <Check size={16} className="class-check" />}
          </button>)}
        </div>
        <div className="field-label">Character body</div>
        <div className="preview-direction-options" role="group" aria-label="Choose male or female character">
          {(['male','female'] as const).map(body => <button key={body} type="button"
            aria-pressed={props.bodyType === body} className={props.bodyType === body ? 'selected' : ''}
            onClick={() => props.setBodyType(body)}>{body === 'male' ? 'Male' : 'Female'}</button>)}
        </div>
        <div className="creator-custom">
          <div className="field-label">Make them yours</div>
          <div className="custom-row"><span>Skin</span><Palette options={skinTones} selected={props.skinIndex} onChange={(index) => { props.setSkinIndex(index); props.changeColor('skin', skinTones[index]); }} label="skin tone" />{editableColor("skin", skinTones[props.skinIndex])}</div>
          <div className="custom-row"><span>Hair</span><Palette options={hairTones} selected={props.hairIndex} onChange={(index) => { props.setHairIndex(index); props.changeColor('hair', hairTones[index]); }} label="hair color" />{editableColor("hair", hairTones[props.hairIndex])}</div>
          <div className="custom-row custom-row-choices"><span>Style</span><ChoiceButtons options={hairStyles} selected={props.hairStyle} onChange={props.setHairStyle} label="hairstyle" /></div>
          <div className="custom-row"><span>Eyes</span><Palette options={eyeTones} selected={props.eyeIndex} onChange={(index) => { props.setEyeIndex(index); props.changeColor('eyes', eyeTones[index]); }} label="eye color" />{editableColor("eyes", eyeTones[props.eyeIndex])}</div>
          <div className="custom-row custom-row-choices"><span>Face</span><ChoiceButtons options={facialHairStyles} selected={props.facialHair} onChange={props.setFacialHair} label="facial hair" /></div>
          <div className="custom-row custom-row-choices"><span>Detail</span><ChoiceButtons options={headwearStyles} selected={props.headwear} onChange={props.setHeadwear} label="accessory" /></div>
          <div className="custom-row"><span>Clothes</span><Palette options={clothTones} selected={props.clothIndex} onChange={(index) => { props.setClothIndex(index); props.changeColor('clothing', clothTones[index]); }} label="clothing color" />{editableColor("clothing", clothTones[props.clothIndex])}</div>
          <div className="custom-row"><span>Trim</span><Palette options={trimTones} selected={props.trimIndex} onChange={(index) => { props.setTrimIndex(index); props.changeColor('trim', trimTones[index]); }} label="trim color" />{editableColor("trim", trimTones[props.trimIndex])}</div>
          <div className="custom-row"><span>Secondary</span>{editableColor('secondary', '#a78364')}</div>
          <div className="custom-row"><span>Leather</span>{editableColor('leather', '#76513b')}</div>
          <div className="custom-row"><span>Metal</span>{editableColor('metal', '#a9b8bf')}</div>
        </div>
        <div className="creator-cta"><button className="button button-primary" onClick={props.onStart} data-testid="button-start-adventure">Set out <ArrowRight size={17} /></button>
          {props.saveExists && <button className="button button-text" onClick={props.onContinue} data-testid="button-resume-save"><RotateCcw size={15} /> Resume saved journey</button>}
        </div>
      </section>
      <aside className="hero-preview">
        <span className="preview-note">CHARACTER PREVIEW <i>01</i></span>
        <div className="preview-halo"><div className="preview-star star-a">✳</div><div className="preview-star star-b">✷</div>
          <div className="preview-ground" />
          <PixelHero skin={props.customColors.skin ?? skinTones[props.skinIndex]} hair={props.customColors.hair ?? hairTones[props.hairIndex]} cloth={props.customColors.clothing ?? clothTones[props.clothIndex]} eyes={props.customColors.eyes ?? eyeTones[props.eyeIndex]} trim={props.customColors.trim ?? trimTones[props.trimIndex]} secondary={props.customColors.secondary} leather={props.customColors.leather} metal={props.customColors.metal} facialHair={props.facialHair.toLowerCase()} headwear={props.headwear.toLowerCase()} walking={previewWalking} classId={props.classId} bodyType={props.bodyType} hairStyle={props.hairStyle.toLowerCase()} facing={previewFacing} large />
        </div>
        <div className="preview-directions">
          <span className="preview-directions-label">VIEW <button type="button" className="preview-walk-toggle" aria-pressed={previewWalking} onClick={() => setPreviewWalking(!previewWalking)} data-testid="button-preview-walk">{previewWalking ? '● Walking' : '▷ Walk'}</button></span>
          <div className="preview-direction-options" role="group" aria-label="Choose hero viewing angle">
            {previewDirections.map(({ facing, label }) => <button
              key={facing}
              type="button"
              className={previewFacing === facing ? 'selected' : ''}
              aria-pressed={previewFacing === facing}
              aria-label={`${label} view`}
              onClick={() => setPreviewFacing(facing)}
              data-testid={`button-view-${label.toLowerCase()}`}
            >{label}</button>)}
          </div>
        </div>
        <div className="preview-card"><span className="preview-card-sigil" style={{ color: activeClass.color }}>{activeClass.sigil}</span><div><small>CALLING · {activeClass.name.toUpperCase()}</small><h2>{props.name.trim() || 'A nameless spark'}</h2><p>{activeClass.detail}</p></div></div>
        <div className="preview-coordinate">BRAMBLEMERE / EASTERN MARCH <span>39° N · 14° E</span></div>
      </aside>
    </div>
  </main>;
}

function ChoiceButtons({ options, selected, onChange, label }: { options: string[]; selected: string; onChange: (value: string) => void; label: string }) {
  return <div className="appearance-options" role="group" aria-label={`Choose ${label}`}>
    {options.map((value) => <button type="button" key={value} className={selected === value ? 'selected' : ''}
      aria-pressed={selected === value} onClick={() => onChange(value)}>{value}</button>)}
  </div>;
}

function Palette({ options, selected, onChange, label }: { options: string[]; selected: number; onChange: (n: number) => void; label: string }) {
  return <div className="palette" role="group" aria-label={`Choose ${label}`}>{options.map((color, i) => <button key={color} className={selected === i ? 'selected' : ''} style={{ '--swatch': color } as CSSProperties} onClick={() => onChange(i)} aria-label={`${label} ${i + 1}`} aria-pressed={selected === i} data-testid={`button-${label.replace(' ', '-')}-${i}`} />)}</div>;
}

function PlayScreen({ state, engine, dispatch, setAnalogMovement, openMenu, closeMenu, dismissDialog, chooseMaelisAlliance, equipItem, toggleGearLock, salvageItem, equipAbility, trainPower, buyShopItem, sellInventoryItem, trainForShards, requestGuide, audioPreferences, audioNotice, changeAudioPreferences, returnToLastWell, saveAndReturnToTitle, saveFailed }: {
  engine: AdventureEngine;
  state: any; dispatch: (action: Action, down: boolean, source: string) => void;
  setAnalogMovement: (x: number, y: number) => void;
  openMenu: (menu: MenuId) => void; closeMenu: () => void; dismissDialog: () => void;
  chooseMaelisAlliance: (allied: boolean) => void;
  equipItem: (id: string) => void; toggleGearLock: (id: string) => void; salvageItem: (id: string, confirmed?: boolean) => void; equipAbility: (slot: number, abilityId: string) => void; trainPower: (powerId: string) => void;
  buyShopItem: (id: string) => void; sellInventoryItem: (id: string) => void; trainForShards: (amount: number) => void;
  requestGuide: () => boolean;
  audioPreferences: AudioPreferences; audioNotice: string | null;
  changeAudioPreferences: (preferences: AudioPreferences) => void;
  returnToLastWell: () => boolean; saveAndReturnToTitle: () => boolean; saveFailed: boolean;
}) {
  const { player, enemies, inventory, abilities, trainedPowers, quest, log, overlay, location, hint, dialog, dialogSpeaker, discoveredWorldCells } = state;
  const questGuidance = engine.getQuestGuidance();
  const contextHint = engine.getContextHint();
  const contextButton = contextHint.match(/^([AB]) · /)?.[1];
  const contextMessage = contextButton ? contextHint.slice(4) : contextHint;
  const worldColor = getWorldColorProfile(engine.getWorldProgress());
  const finaleStage = engine.getWorldProgress().finale.stage;
  const guideCooldownSeconds = Math.ceil(state.guideCooldownMs / 1000);
  const currentCell = worldCellAt(player.x, player.y);
  const marchesTide = !engine.getWorldProgress().activeDungeon && currentCell?.regionId === 'drowned-marches'
    ? engine.getWorldProgress().marchesTide
    : null;
  const guideArrow = state.guideDirection === 'up' ? <ArrowUp /> : state.guideDirection === 'down' ? <ArrowDown /> : state.guideDirection === 'left' ? <ArrowLeft /> : <ArrowRight />;
  const [helpOpen, setHelpOpen] = useState(false);
  const [questTrackerCollapsed, setQuestTrackerCollapsed] = useState(false);
  const [hintToast, setHintToast] = useState('');
  const previousHint = useRef(hint);
  const previousLocation = useRef(location);
  const previousGuideUses = useRef(state.guideUses);
  const suppressHintUntil = useRef(0);
  const seenMessages = useRef(new Set<string>());
  const toastTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const locationChanged = Boolean(location && location !== previousLocation.current);
    const hintChanged = Boolean(hint && hint !== previousHint.current);
    const guideUsed = state.guideUses !== previousGuideUses.current;
    previousLocation.current = location;
    previousHint.current = hint;
    previousGuideUses.current = state.guideUses;
    if (!locationChanged && !hintChanged && !guideUsed) return;
    if (locationChanged) suppressHintUntil.current = performance.now() + 650;
    else if (performance.now() < suppressHintUntil.current) {
      return;
    }
    const message = guideUsed || hintChanged ? hint : location;
    if (!message || (!guideUsed && seenMessages.current.has(message))) return;
    seenMessages.current.add(message);
    setHintToast(message);
    if (toastTimer.current !== undefined) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setHintToast(''), 3200);
  }, [hint, location, state.guideUses]);

  useEffect(() => {
    if (!hint) return;
    seenMessages.current.add(hint);
    setHintToast(hint);
    toastTimer.current = window.setTimeout(() => setHintToast(''), 3200);
  }, []);

  useEffect(() => () => {
    if (toastTimer.current !== undefined) window.clearTimeout(toastTimer.current);
  }, []);

  return <main className="play-screen" style={{ '--world-saturation': worldColor.saturation } as CSSProperties} data-world-saturation={worldColor.saturation}>
    <section className="world-stage">
      <div id="game-viewport" className="game-viewport game-noise" aria-label="Emberfall game world">
        <div id="phaser-game" className="phaser-layer" />
        <PhaserWorld engine={engine} />
        <CinematicOverlay engine={engine} />
        <div className="world-fallback" aria-hidden="true"><div className="world-sky"><span className="world-sun" /></div><div className="distant-peaks" /><div className="world-canopy canopy-left" /><div className="world-canopy canopy-right" /><div className="world-path" /><div className="world-grass" /><div className="world-lantern"><i /></div></div>
        <div className="game-topbar"><button className="game-menu-trigger" onClick={() => openMenu('settings')} aria-label="Open journey menu" data-testid="button-open-settings"><Menu size={16} /><span>MENU</span></button><div className="world-location"><Compass size={14} />{location}</div>
          {marchesTide && <div className={`marches-tide tide-${marchesTide}`} role="status" aria-label={`The Marches tide is ${marchesTide}`}>
            <span aria-hidden="true" /><b>{marchesTide.toUpperCase()}</b><small>TIDE</small>
          </div>}
          <div className="top-actions">{(['map', 'character', 'inventory'] as MenuId[]).map((m) => <button key={m} onClick={() => openMenu(m)} aria-label={menuNames[m]} title={menuNames[m]} data-testid={`button-open-${m}`}>{m === 'map' ? <MapIcon /> : m === 'character' ? <Shield /> : <Backpack />}</button>)}
            <button className="power-trees-trigger" onClick={() => openMenu('abilities')} aria-label={`Power Trees, ${player.trainingPoints} training points`} title={`Power Trees · ${player.trainingPoints} training points`} data-testid="button-open-abilities"><Sparkles />{player.trainingPoints > 0 && <span className="power-point-badge">{player.trainingPoints}</span>}</button>
            <button className="guide-trigger" onClick={requestGuide} disabled={guideCooldownSeconds > 0} aria-label={guideCooldownSeconds ? `Guide recharges in ${guideCooldownSeconds} seconds` : 'Get a direction or nearby clue'} title={guideCooldownSeconds ? `Guide recharges in ${guideCooldownSeconds}s` : 'Get a direction or nearby clue'} data-testid="button-guide"><Compass />{guideCooldownSeconds > 0 && <span className="guide-cooldown">{guideCooldownSeconds}</span>}</button>
            <button className="game-help-trigger" onClick={() => { setHintToast(''); setHelpOpen(true); }} aria-label="Help and controls" title="Help and controls">?</button></div>
        </div>
        <div className="world-player-tag"><span className="tag-dot" />{player.name} · LV {player.level}</div>
        {questGuidance && <div className={`quest-tracker ${questTrackerCollapsed ? 'quest-tracker-collapsed' : ''}`} data-testid="quest-tracker" data-collapsed={questTrackerCollapsed}>
          {!questTrackerCollapsed && <button className="quest-tracker-content" onClick={() => openMenu('map')} aria-label={`Open map. Objective: ${questGuidance.objective}. ${questGuidance.direction}`}>
            <span>FIELD OBJECTIVE</span><strong>{questGuidance.objective}</strong><small>{questGuidance.direction}</small>
          </button>}
          <button
            className="quest-tracker-toggle"
            type="button"
            onClick={() => setQuestTrackerCollapsed((collapsed) => !collapsed)}
            aria-label={questTrackerCollapsed ? 'Show field objective' : 'Hide field objective'}
            aria-expanded={!questTrackerCollapsed}
            title={questTrackerCollapsed ? 'Show field objective' : 'Hide field objective'}
            data-testid="button-toggle-quest-tracker"
          >
            {questTrackerCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>}
        {state.guideCueMs > 0 && <div className={`guide-arrow guide-arrow-${state.guideDirection ?? 'message'}`} role="status" data-testid="guide-result" aria-label={state.guideDirection ? `Guide points ${state.guideDirection}` : 'Guide message'}>
          {state.guideDirection ? guideArrow : <Compass />}
          <span><b>{state.guideDirection ? `GO ${state.guideDirection.toUpperCase()}` : state.guideCueKind === 'clue' ? 'NEARBY CLUE' : state.guideCueKind === 'objective' ? 'OBJECTIVE NEARBY' : 'NO ROUTE ARROW'}</b><small>{state.guideMessage}</small></span>
        </div>}
        {contextHint && contextHint !== 'Find the trail and explore.' && <div className="world-action-hint" role="status" aria-label={contextHint} data-testid="context-action-hint">
          {contextButton && <kbd>{contextButton}</kbd>}
          <span>{contextMessage}</span>
        </div>}
        {hintToast && !helpOpen && <div className="world-toast" role="status" aria-live="polite"><span aria-hidden="true">✦</span>{hintToast}</div>}
         {enemies?.length > 0 && <div className="enemy-strip">{enemies.map((enemy: any) => <div className="enemy-card" key={enemy.id}><span>{enemy.name}</span><div className="enemy-track"><i style={{ width: `${Math.max(0, enemy.hp / enemy.maxHp * 100)}%` }} /></div></div>)}</div>}
         {dialog && <div className="elder-dialogue" role={finaleStage === 'choice' ? 'dialog' : 'status'} aria-label={finaleStage === 'choice' ? 'Maelis alliance choice' : undefined} aria-live="polite"><span>{dialogSpeaker ? dialogSpeaker.toUpperCase() : 'FIELD NOTE'} / {location.toUpperCase()}</span><p>{dialog}</p>
          {finaleStage === 'choice' ? <div className="finale-choices"><button onClick={() => chooseMaelisAlliance(true)}>Fight with Maelis</button><button onClick={() => chooseMaelisAlliance(false)}>Refuse and fight Maelis</button></div>
             : finaleStage !== 'restoring' && <button onClick={dismissDialog}>On with the road <ArrowRight size={14} /></button>}
         </div>}
          {overlay === 'settings' ? <GameMenu preferences={audioPreferences} changePreferences={changeAudioPreferences}
            wellName={wellById(engine.getWorldProgress().lastWell.id)?.label ?? 'Hearthglen well'}
            canReturn={!['choice', 'restoring'].includes(finaleStage)}
            returnToWell={returnToLastWell} returnToTitle={saveAndReturnToTitle} close={closeMenu}
            audioNotice={audioNotice} saveFailed={saveFailed}
            replayEnding={finaleStage === 'complete' ? () => { engine.startRestorationReplay(); } : undefined}
          /> : overlay && <Overlay overlay={overlay} player={player} inventory={inventory ?? []} abilities={abilities ?? []} trainedPowers={trainedPowers ?? {}} quest={quest} log={log ?? []} location={location} discoveredWorldCells={discoveredWorldCells ?? []} worldProgress={engine.getWorldProgress()} getWaveStatus={(cell) => engine.getPostgameWaveStatus(cell)} close={closeMenu} equipItem={equipItem} toggleGearLock={toggleGearLock} salvageItem={salvageItem} equipAbility={equipAbility} trainPower={trainPower} buyShopItem={buyShopItem} sellInventoryItem={sellInventoryItem} trainForShards={trainForShards} />}
        {helpOpen && <div className="help-scrim" onClick={() => setHelpOpen(false)}>
          <section className="help-panel" role="dialog" aria-modal="true" aria-labelledby="help-title" onClick={(event) => event.stopPropagation()}>
            <header className="help-header"><div><span>TRAVELER’S GUIDE</span><h2 id="help-title">Find your way</h2></div><button onClick={() => setHelpOpen(false)} aria-label="Close help"><X size={18} /></button></header>
            <div className="help-grid">
              <article><b>Move</b><p>Use WASD or arrow keys, or drag the touch D-pad. Follow the trail through a hedge opening to reach a neighboring area.</p></article>
              <article><b>Act</b><p>Press J or tap A to attack. Press K or tap B to speak, open a chest, or activate a nearby object.</p></article>
              <article><b>Explore</b><p>Open the field map to see how places connect. Tap the compass for a route arrow or a nearby lock clue; each use lengthens its cooldown.</p></article>
              <article><b>Techniques</b><p>Use 1–4 on a keyboard or tap a skill icon. The character, satchel, and map are always available above.</p></article>
            </div>
            <button className="help-close" onClick={() => setHelpOpen(false)}>Back to the trail <ArrowRight size={14} /></button>
          </section>
        </div>}
      </div>
      <div className="hud-row">
        <div className="player-hud"><div className="hud-portrait"><PixelHero skin={player.skin ?? skinTones[0]} hair={player.hairColor ?? hairTones[0]} cloth={player.clothingColor ?? clothTones[0]} hairStyle={player.hairStyle ?? 'cropped'} eyes={player.eyeColor} trim={player.trimColor} facialHair={player.facialHair} headwear={player.headwear} classId={player.classId ?? 'warrior'} bodyType={player.bodyType ?? 'male'} /></div>
          <div className="hud-player-meta"><div className="hud-name">{player.name}<span>LV {player.level}</span></div><Meter label="VITALITY" value={player.hp} max={player.maxHp} tone="#c8553d" /><Meter label="SPIRIT" value={player.resource} max={player.maxResource} tone="#568779" /></div>
        </div>
        <div className="quest-hud"><span className="quest-kicker"><BookOpen size={13} /> CURRENT THREAD</span><b>{quest?.title}</b><small>{quest?.description}</small></div>
        <div className="coin-hud"><span className="coin-icon">✦</span><b>{player.coins}</b><small>shards</small></div>
      </div>
    </section>
    <Controller abilities={abilities ?? []} classId={player.classId} resource={player.resource} resourceName={player.resourceName} dispatch={dispatch} setAnalogMovement={setAnalogMovement} />
  </main>;
}

function useControl(dispatch: (action: Action, down: boolean, source: string) => void, action: Action) {
  const pointerSources = useRef(new Map<number, string>());
  return {
    onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      const source = `pointer:${event.pointerId}`;
      pointerSources.current.set(event.pointerId, source);
      event.currentTarget.setPointerCapture(event.pointerId);
      dispatch(action, true, source);
    },
    onPointerUp: (event: PointerEvent<HTMLButtonElement>) => {
      const source = pointerSources.current.get(event.pointerId);
      if (source) dispatch(action, false, source);
      pointerSources.current.delete(event.pointerId);
    },
    onPointerCancel: (event: PointerEvent<HTMLButtonElement>) => {
      const source = pointerSources.current.get(event.pointerId);
      if (source) dispatch(action, false, source);
      pointerSources.current.delete(event.pointerId);
    },
    onLostPointerCapture: (event: PointerEvent<HTMLButtonElement>) => {
      const source = pointerSources.current.get(event.pointerId);
      if (source) dispatch(action, false, source);
      pointerSources.current.delete(event.pointerId);
    },
  };
}

function ControlButton({ dispatch, action, className, ariaLabel, title, testId, disabled = false, children }: {
  dispatch: (action: Action, down: boolean, source: string) => void; action: Action; className: string;
  ariaLabel: string; title?: string; testId: string; disabled?: boolean; children: ReactNode;
}) {
  const handlers = useControl(dispatch, action);
  return <button className={className} aria-label={ariaLabel} title={title} disabled={disabled} data-testid={testId} {...handlers}>{children}</button>;
}

function FloatingJoystick({ setAnalogMovement }: { setAnalogMovement: (x: number, y: number) => void }) {
  const [stick, setStick] = useState({ active: false, originX: 0, originY: 0, knobX: 0, knobY: 0 });
  const activePointer = useRef<{ id: number; startX: number; startY: number; originX: number; originY: number; maxRadius: number } | null>(null);
  const horizontal = stick.knobX - stick.originX;
  const vertical = stick.knobY - stick.originY;

  const finish = (pointerId: number) => {
    if (activePointer.current?.id !== pointerId) return;
    activePointer.current = null;
    setAnalogMovement(0, 0);
    setStick({ active: false, originX: 0, originY: 0, knobX: 0, knobY: 0 });
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || activePointer.current) return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const originX = Math.max(0, Math.min(rect.width, event.clientX - rect.left));
    const originY = Math.max(0, Math.min(rect.height, event.clientY - rect.top));
    activePointer.current = {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX,
      originY,
      maxRadius: Math.min(rect.width, rect.height) * 0.4,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setStick({ active: true, originX, originY, knobX: originX, knobY: originY });
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const pointer = activePointer.current;
    if (pointer?.id !== event.pointerId) return;
    event.preventDefault();
    const deltaX = event.clientX - pointer.startX;
    const deltaY = event.clientY - pointer.startY;
    const distance = Math.hypot(deltaX, deltaY);
    const clampedDistance = Math.min(distance, pointer.maxRadius);
    const ratio = clampedDistance / pointer.maxRadius;
    const outputMagnitude = ratio <= 0.12 ? 0 : (ratio - 0.12) / 0.88;
    const directionX = distance > 0 ? deltaX / distance : 0;
    const directionY = distance > 0 ? deltaY / distance : 0;
    const knobX = pointer.originX + directionX * clampedDistance;
    const knobY = pointer.originY + directionY * clampedDistance;
    setAnalogMovement(directionX * outputMagnitude, directionY * outputMagnitude);
    setStick({ active: true, originX: pointer.originX, originY: pointer.originY, knobX, knobY });
  };

  return <div
    className={`dpad ${stick.active ? 'dpad-active' : ''}`}
    role="group"
    aria-label="Floating movement D-pad. Touch anywhere and drag in any direction; release to stop."
    data-testid="movement-dpad"
    onPointerDown={onPointerDown}
    onPointerMove={onPointerMove}
    onPointerUp={(event) => finish(event.pointerId)}
    onPointerCancel={(event) => finish(event.pointerId)}
    onLostPointerCapture={(event) => finish(event.pointerId)}
    style={stick.active ? {
      '--stick-x': `${stick.originX}px`,
      '--stick-y': `${stick.originY}px`,
      '--knob-x': `${stick.knobX}px`,
      '--knob-y': `${stick.knobY}px`,
    } as CSSProperties : undefined}
  >
    <span className="dpad-base" aria-hidden="true">
      <span className={`dpad-arm dpad-up ${stick.active && vertical < -6 ? 'dpad-arm-active' : ''}`}><ArrowUp /></span>
      <span className={`dpad-arm dpad-right ${stick.active && horizontal > 6 ? 'dpad-arm-active' : ''}`}><ArrowRight /></span>
      <span className={`dpad-arm dpad-down ${stick.active && vertical > 6 ? 'dpad-arm-active' : ''}`}><ArrowDown /></span>
      <span className={`dpad-arm dpad-left ${stick.active && horizontal < -6 ? 'dpad-arm-active' : ''}`}><ArrowLeft /></span>
      <span className="dpad-core" />
    </span>
    <span className="dpad-thumb" aria-hidden="true"><i /></span>
  </div>;
}

function Controller({ abilities, classId, resource, resourceName, dispatch, setAnalogMovement }: { abilities: any[]; classId: ClassId; resource: number; resourceName: string; dispatch: (action: Action, down: boolean, source: string) => void; setAnalogMovement: (x: number, y: number) => void }) {
  const iconSets: Record<ClassId, (typeof Swords)[]> = {
    warrior: [Swords, Shield, Zap, Sparkles],
    rogue: [Zap, Compass, Swords, Sparkles],
    adept: [Sparkles, Compass, Shield, Zap],
    mage: [Sparkles, Zap, Shield, Swords],
  };
  const icons = iconSets[classId] ?? iconSets.warrior;
  return <section className="controller" aria-label="Game controls">
    <div className="controller-inner">
      <FloatingJoystick setAnalogMovement={setAnalogMovement} />
      <div className="skill-arc">{[0, 1, 2, 3].map((slot) => {
        const ability = abilities[slot];
        const Icon = icons[slot];
        const cooling = !!ability && ability.remainingMs > 0;
        const canAfford = !!ability && (ability.cost === 0 || resource >= ability.cost);
        const unavailable = !!ability && !cooling && !canAfford;
        const status = cooling ? `, cooldown ${Math.ceil(ability.remainingMs / 1000)} seconds` : unavailable ? `, not enough ${resourceName.toLowerCase()}` : '';
        const buttonTitle = !ability ? 'Unequipped skill' : cooling
          ? `${ability.name} · ${Math.ceil(ability.remainingMs / 1000)}s`
          : unavailable ? `${ability.name} · needs ${ability.cost} ${resourceName}` : ability.name;
        const action = `ability${slot}` as ButtonAction;
        return <ControlButton key={slot} className={`skill-button skill-${slot} ${cooling ? 'cooling' : ''} ${unavailable ? 'unavailable' : ''}`} ariaLabel={ability ? `${ability.name}, ability ${slot + 1}${status}` : `Ability slot ${slot + 1} empty`} title={buttonTitle} disabled={!ability || cooling || !canAfford} testId={`button-ability-${slot + 1}`} dispatch={dispatch} action={action}>
          <span className="skill-glyph" aria-hidden="true">{ability?.icon ?? <Icon size={18} />}</span><span className="skill-name">{ability?.name ?? `${slot + 1}`}</span>{cooling && <i className="cooldown-cover">{Math.ceil(ability.remainingMs / 1000)}</i>}{unavailable && <i className="unavailable-cover">LOW</i>}
        </ControlButton>;
      })}</div>
      <div className="face-buttons">
        <ControlButton className="face-button face-b" ariaLabel="Context action" title="Context action" testId="button-context" dispatch={dispatch} action="context"><span>B</span><small>USE</small></ControlButton>
        <ControlButton className="face-button face-a" ariaLabel="Attack" title="Attack" testId="button-attack" dispatch={dispatch} action="attack"><span>A</span><small>STRIKE</small></ControlButton>
      </div>
      <div className="controller-caption"><span>EMBERFALL / FIELD UNIT</span><span>04 · 13</span></div>
    </div>
  </section>;
}

function Overlay({ overlay, player, inventory, abilities, trainedPowers, quest, log, location, discoveredWorldCells, worldProgress, getWaveStatus, close, equipItem, toggleGearLock, salvageItem, equipAbility, trainPower, buyShopItem, sellInventoryItem, trainForShards }: {
  overlay: MenuId; player: any; inventory: any[]; abilities: any[]; trainedPowers: Record<string, number>; quest: any; log: string[];
  location: string; discoveredWorldCells: string[]; worldProgress: WorldProgress; getWaveStatus: (cell: string) => PostgameWaveStatus | null; close: () => void; equipItem: (id: string) => void; toggleGearLock: (id: string) => void; salvageItem: (id: string, confirmed?: boolean) => void; equipAbility: (slot: number, abilityId: string) => void; trainPower: (powerId: string) => void;
  buyShopItem: (id: string) => void; sellInventoryItem: (id: string) => void; trainForShards: (amount: number) => void;
}) {
  const [equipSlot, setEquipSlot] = useState(0);
  const [inventoryTab, setInventoryTab] = useState<'usable' | 'weapons' | 'quest' | 'locked'>('usable');
  const inventoryTabs = [
    { id: 'usable' as const, label: 'Usable', items: inventory.filter((item) => item.kind === 'consumable' || item.kind === 'armor' || item.kind === 'jewelry') },
    { id: 'weapons' as const, label: 'Weapons', items: inventory.filter((item) => item.kind === 'weapon') },
    { id: 'quest' as const, label: 'Quest', items: inventory.filter((item) => item.kind === 'key' || item.kind === 'relic') },
    { id: 'locked' as const, label: 'Locked', items: inventory.filter((item) => isLockableGear(item) && item.locked) },
  ];
  const selectedInventory = inventoryTabs.find((tab) => tab.id === inventoryTab)!;
  const currentCell = worldCellAt(player.x, player.y);
  const currentCellId = currentCell?.id;
  const currentRegion = getWorldRegion(currentCell?.regionId ?? 'hearthglen');
  const regionCells = WORLD_CELLS.filter((cell) => cell.regionId === currentRegion.id);
  const discovered = new Set(discoveredWorldCells);
  const mapCells = currentRegion.id === 'first-hunger'
    ? regionCells.filter((cell) => cell.contentReady)
    : regionCells;
  const mapColumnCount = currentRegion.id === 'first-hunger' ? 4 : 10;
  const mapRowCount = currentRegion.id === 'first-hunger' ? 1 : 6;
  const completedDungeonIds = new Set(worldProgress.completedDungeons);
  const regionDiscoveryCount = mapCells.filter((cell) => discovered.has(cell.id)).length;
  const worldColor = getWorldColorProfile(worldProgress);
  const mapCellWidth = (364 - 36 - (mapColumnCount - 1) * 2) / mapColumnCount;
  const mapCellHeight = (254 - 36 - (mapRowCount - 1) * 2) / mapRowCount;
  const mapConnections = getVisibleWorldConnections(
    currentRegion.id,
    discoveredWorldCells,
    worldProgress.unlockedRegions,
    worldProgress.marchesTide,
    worldProgress.silencedBells,
  ).map(({ from, to }) => {
    const x1 = 18 + from.column * (mapCellWidth + 2) + mapCellWidth / 2;
    const y1 = 18 + from.row * (mapCellHeight + 2) + mapCellHeight / 2;
    const x2 = 18 + to.column * (mapCellWidth + 2) + mapCellWidth / 2;
    const y2 = 18 + to.row * (mapCellHeight + 2) + mapCellHeight / 2;
    return `M ${x1} ${y1} L ${x2} ${y2}`;
  });
  return <div className="overlay-scrim" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) close(); }}>
    <section className="game-overlay" role="dialog" aria-modal="true" aria-label={menuNames[overlay]}>
      <header className="overlay-header"><div><span className="eyebrow">FIELD JOURNAL / 04</span><h2>{menuNames[overlay]}</h2></div><button className="close-button" onClick={close} aria-label="Close menu" data-testid="button-close-menu"><X size={19} /></button></header>
      {overlay === 'inventory' && <div className="overlay-content">
        <div className="overlay-intro"><Backpack size={17} /><span>What the road has left in your keeping.</span></div>
        <div className="inventory-tabs" role="tablist" aria-label="Backpack categories">
          {inventoryTabs.map((tab) => <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={inventoryTab === tab.id}
            className={inventoryTab === tab.id ? 'inventory-tab active' : 'inventory-tab'}
            onClick={() => setInventoryTab(tab.id)}
            data-testid={`button-inventory-tab-${tab.id}`}
          >{tab.label}<span>{tab.items.length}</span></button>)}
        </div>
        <p className="salvage-note">Lock weapons or armor to keep them safe. Salvage unequipped gear or one usable item from a stack for XP.</p>
        {selectedInventory.items.length ? <div className="item-list" role="tabpanel">
          {selectedInventory.items.map((item) => {
            const isQuest = item.kind === 'key' || item.kind === 'relic';
            const salvageXp = getSalvageXp(item);
            const needsConfirmation = requiresSalvageConfirmation(item);
            return <article className="inventory-item" key={item.id}>
              <span className="item-glyph">{item.kind === 'weapon' ? '✣' : item.kind === 'armor' ? '◇' : item.kind === 'key' ? '⚿' : item.kind === 'relic' ? '✧' : '✦'}</span>
              <div><b>{item.name}{item.quantity ? ` ×${item.quantity}` : ''}</b><p>{item.description}</p><small>{item.kind}{item.equipped ? ' · EQUIPPED' : ''}{item.locked ? ' · LOCKED' : ''}</small></div>
              <div className="inventory-actions">
                {isLockableGear(item) && <button
                  className="mini-button lock-button"
                  onClick={() => toggleGearLock(item.id)}
                  aria-label={`${item.locked ? 'Unlock' : 'Lock'} ${item.name} against salvage`}
                  aria-pressed={Boolean(item.locked)}
                  data-testid={`button-lock-${item.id}`}
                >{item.locked ? <><Unlock size={11} /> Unlock</> : <><Lock size={11} /> Lock</>}</button>}
                {isQuest
                  ? <span className="quest-kept">KEEP</span>
                  : item.kind === 'consumable'
                    ? <button className="mini-button" onClick={() => equipItem(item.id)} disabled={!item.quantity} data-testid={`button-equip-${item.id}`}>Use</button>
                    : <button className="mini-button" onClick={() => equipItem(item.id)} disabled={item.equipped} data-testid={`button-equip-${item.id}`}>{item.equipped ? 'Equipped' : 'Equip'}</button>}
                {!isQuest && <button className="mini-button salvage-button" onClick={() => {
                  if (needsConfirmation && !window.confirm(`Salvage ${item.name} for ${salvageXp} XP? This valuable gear will be permanently removed.`)) return;
                  salvageItem(item.id, needsConfirmation);
                }} disabled={Boolean(item.equipped || item.locked) || salvageXp <= 0} data-testid={`button-salvage-${item.id}`}>
                  {item.locked ? 'Locked' : item.equipped ? 'Unequip first' : `Salvage +${salvageXp} XP`}
                </button>}
              </div>
            </article>;
          })}
        </div> : <EmptyState
          icon={<Backpack />}
          title={inventoryTab === 'quest' ? 'No quest items yet' : inventoryTab === 'locked' ? 'No locked gear' : 'Nothing in this category'}
          copy={inventoryTab === 'quest'
            ? 'Important finds will be kept here and cannot be salvaged.'
            : inventoryTab === 'locked'
              ? 'Lock any weapon or armor to keep it protected from salvage. It will appear here.'
              : 'Find equipment and supplies along the road to fill this section.'}
        />}
      </div>}
      {overlay === 'character' && <div className="overlay-content character-sheet">
        <div className="sheet-hero"><div className="sheet-avatar"><PixelHero skin={player.skin ?? skinTones[0]} hair={player.hairColor ?? hairTones[0]} cloth={player.clothingColor ?? clothTones[0]} hairStyle={player.hairStyle ?? 'cropped'} eyes={player.eyeColor} trim={player.trimColor} facialHair={player.facialHair} headwear={player.headwear} classId={player.classId ?? 'warrior'} bodyType={player.bodyType ?? 'male'} large /></div><div><span className="eyebrow">TRAVELER · LEVEL {player.level}</span><h3>{player.name}</h3><p>{classInfo.find((item) => item.id === player.classId)?.name ?? 'Vanguard'}</p><div className="sheet-equipped-weapon" data-testid="sheet-equipped-weapon"><span>WEAPON</span><b>{player.weapon}</b></div></div></div>
        <div className="stat-pair"><span>Experience <b>{player.xp} xp</b></span><span>Training <b>{player.trainingPoints} pt</b></span><span>Coin <b>{player.coins} shards</b></span></div><Meter label="VITALITY" value={player.hp} max={player.maxHp} tone="#c8553d" /><Meter label="SPIRIT" value={player.resource} max={player.maxResource} tone="#568779" />
        <div className="journal-note"><span>FIELD NOTE</span><b>{quest?.title}</b><p>{quest?.description}</p><small>STEP {quest?.step ?? 1}</small></div>
        {log.length > 0 && <div className="recent-log"><span>RECENT NOTES</span>{log.slice(-3).map((line, i) => <p key={`${i}-${line}`}>{line}</p>)}</div>}
      </div>}
      {overlay === 'map' && worldProgress.activeDungeon && <DungeonMap world={worldProgress} getWaveStatus={getWaveStatus} />}
      {overlay === 'map' && !worldProgress.activeDungeon && <div className="overlay-content map-content">
          <div className="map-region-title"><div><span>REGION {currentRegion.index + 1} · {currentRegion.bell ? `BELL OF ${currentRegion.bell.toUpperCase()}` : 'BEYOND THE FIVE BELLS'}</span><b>{currentRegion.name}</b></div><i>{regionDiscoveryCount} / {mapCells.length} screens found</i></div>
          <div className="map-paper">
          <div className="map-grid" />
          <svg className="map-route" viewBox="0 0 364 254" preserveAspectRatio="none" role="img" aria-label={`Known paths through ${currentRegion.name}`}>
            {mapConnections.map((path, index) => <path key={`${index}-${path}`} d={path} />)}
          </svg>
          <div className={`overworld-grid${currentRegion.id === 'first-hunger' ? ' final-route-grid' : ''}`}
            style={{ gridTemplateColumns: `repeat(${mapColumnCount}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${mapRowCount}, minmax(0, 1fr))` }}>
            {mapCells.map((cell) => {
              const isDiscovered = discovered.has(cell.id);
              const realmWaypoints = WORLD_REGION_PORTALS[currentRegion.id];
              const isRealmEntrance = isDiscovered && cell.id === realmWaypoints.entranceCellId;
              const isRealmExit = isDiscovered && cell.id === realmWaypoints.exitCellId;
              const cellIndex = currentRegion.id === 'first-hunger' ? cell.column + 1 : cell.row * 10 + cell.column + 1;
              const waveStatus = isDiscovered ? getWaveStatus(cell.id) : null;
              const waveDescription = waveStatus ? describePostgameWave(waveStatus) : '';
              const townFound = isDiscovered && (cell.roomId === 'village' || TOWN_CELL_IDS.has(cell.id));
              const mapMarkers = getOverworldMapMarkers(
                cell.id,
                discoveredWorldCells,
                worldProgress.foundTreasureCells,
              );
              const cellDungeons = mapMarkers.dungeons;
              const treasureFound = mapMarkers.treasure === 'collected';
              const treasureVisible = mapMarkers.treasure !== null;
              const markerDescription = [
                isRealmEntrance ? 'realm entrance' : '',
                isRealmExit ? 'realm exit' : '',
                townFound ? 'town' : '',
                ...cellDungeons.map((dungeon) => `${dungeon.label}${completedDungeonIds.has(dungeon.id) ? ' completed' : ' · not cleared'}`),
                treasureVisible ? treasureFound ? 'treasure collected' : 'treasure cache' : '',
              ].filter(Boolean).join(', ');
              const label = isDiscovered
                ? `${cell.label}${markerDescription ? ` · ${markerDescription}` : ''}${currentCellId === cell.id ? ', your current location' : ''}${waveDescription ? `. ${waveDescription}` : ''}`
                : 'Unexplored screen';
              return <div
              key={cell.id}
              style={{
                gridColumn: `${cell.column + 1}`,
                gridRow: `${cell.row + 1}`,
              }}
              className={`overworld-cell ${isDiscovered ? `land-${cell.roomId} area-${cell.id} is-discovered` : 'is-unknown'} ${currentCellId === cell.id ? 'is-current' : ''}`}
              aria-label={label}
              title={isDiscovered ? label : undefined}
            >
              {isDiscovered && <span className="map-symbol" aria-hidden="true">{cell.roomId === 'village' ? '⌂' : cell.roomId === 'ruins' ? '▥' : cell.roomId === 'sanctum' ? '✦' : '♧'}</span>}
              {markerDescription && <span className="map-cell-markers" aria-hidden="true">
                {isRealmEntrance && <span className="map-marker map-marker-realm-entrance" title="Realm entrance">IN</span>}
                {isRealmExit && <span className="map-marker map-marker-realm-exit" title="Realm exit">OUT</span>}
                {townFound && <span className="map-marker map-marker-town" title="Town">⌂</span>}
                {cellDungeons.map((dungeon) => <span key={dungeon.id} className={`map-marker map-marker-dungeon${completedDungeonIds.has(dungeon.id) ? ' is-complete' : ''}`} title={`${dungeon.label}${completedDungeonIds.has(dungeon.id) ? ' · complete' : ''}`}>▣</span>)}
                {treasureVisible && <span className={`map-marker map-marker-treasure${treasureFound ? ' is-found' : ''}`} title={treasureFound ? 'Treasure collected' : 'Treasure cache at this screen'}>◆</span>}
              </span>}
              {isDiscovered && <b>{String(cellIndex).padStart(2, '0')}</b>}
              {waveStatus && <PostgameWaveBadge status={waveStatus} />}
              {currentCellId === cell.id && <i>YOU</i>}
              </div>;
            })}
          </div>
          <span className="map-compass">N <ArrowUp size={15} /></span>
        </div>
        <div className="map-legend">
          <span><i className="legend-dot" /> You are in {location}</span>
          <span><i className="legend-path" /> Known connection</span>
          <span><i className="map-legend-marker map-marker-realm-entrance">IN</i> Realm entrance</span>
          <span><i className="map-legend-marker map-marker-realm-exit">OUT</i> Realm exit</span>
          <span><i className="map-legend-marker map-marker-town">⌂</i> Town</span>
          <span><i className="map-legend-marker map-marker-dungeon">▣</i> Dungeon</span>
          <span><i className="map-legend-marker map-marker-dungeon is-complete">▣</i> Cleared dungeon</span>
          <span><i className="map-legend-marker map-marker-treasure">◆</i> Treasure cache</span>
          <span><i className="map-legend-marker map-marker-treasure is-found">◆</i> Collected cache</span>
          <small>Dungeon and treasure markers appear after you visit their screen.</small>
        </div>
        <div className="map-bell-progress" data-testid="map-bell-progress" aria-label={`Major bells silenced: ${worldColor.silencedBellCount} of 5. World saturation: ${Math.round(worldColor.saturation * 100)} percent${worldColor.colorsRestored ? ', colors restored' : ''}.`}>
          <div className="map-bell-count"><span>MAJOR BELLS SILENCED</span><b>{worldColor.silencedBellCount} <i>/ 5</i></b></div>
          <div className={`map-world-color${worldColor.colorsRestored ? ' is-restored' : ''}`}><span>{worldColor.colorsRestored ? 'COLOR RESTORED' : 'WORLD SATURATION'}</span><b>{Math.round(worldColor.saturation * 100)}%</b></div>
          <small>Major bells only · regions entered and chapel puzzle chimes do not count.</small>
        </div>
      </div>}
      {overlay === 'abilities' && <PowerTreePanel
        classId={player.classId}
        level={player.level}
        resourceName={player.resourceName}
        trainingPoints={player.trainingPoints}
        trainedPowers={trainedPowers}
        abilities={abilities}
        selectedSlot={equipSlot}
        setSelectedSlot={setEquipSlot}
        trainPower={trainPower}
        equipAbility={equipAbility}
      />}
      {overlay === 'shop' && <ShopPanel
        stock={shopStockForCell(currentCellId)}
        inventory={inventory}
        coins={player.coins}
        buyItem={buyShopItem}
        sellItem={sellInventoryItem}
      />}
      {overlay === 'training' && <TrainingPanel
        coins={player.coins}
        level={player.level}
        trainForShards={trainForShards}
      />}
      <footer className="overlay-footer"><span>EMBERFALL · YOUR STORY, STILL UNFOLDING</span><button onClick={close}>Back to the trail <ArrowRight size={14} /></button></footer>
    </section>
  </div>;
}

function ShopPanel({ stock, inventory, coins, buyItem, sellItem }: {
  stock: ReturnType<typeof shopStockForCell>; inventory: any[]; coins: number;
  buyItem: (id: string) => void; sellItem: (id: string) => void;
}) {
  const [tab, setTab] = useState<'buy' | 'sell'>('buy');
  const sellable = inventory.filter((item) => getItemSellPrice(item) > 0);
  return <div className="overlay-content commerce-panel">
    <div className="overlay-intro"><ShoppingBag size={17} /><span>Buy regional gear and supplies, or trade eligible pack items for shards.</span><b><Coins size={13} /> {coins}</b></div>
    <div className="commerce-tabs" role="tablist" aria-label="Market actions">
      <button role="tab" aria-selected={tab === 'buy'} className={tab === 'buy' ? 'active' : ''} onClick={() => setTab('buy')}>Buy</button>
      <button role="tab" aria-selected={tab === 'sell'} className={tab === 'sell' ? 'active' : ''} onClick={() => setTab('sell')}>Sell items</button>
    </div>
    {tab === 'buy' ? <div className="commerce-list">
      {stock.map(({ item, price }) => {
        const owned = item.kind !== 'consumable' && inventory.some((entry) => entry.id === item.id);
        return <article className="commerce-item" key={item.id}>
          <span className="item-glyph">{item.kind === 'weapon' ? '✣' : item.kind === 'armor' ? '◇' : item.kind === 'jewelry' ? '✧' : '✦'}</span>
          <div><b>{item.name}</b><p>{item.description}</p><small>{item.kind.toUpperCase()}</small></div>
          <button className="mini-button" onClick={() => buyItem(item.id)} disabled={owned || coins < price} data-testid={`button-buy-${item.id}`}>
            {owned ? 'Owned' : `${price} shards`}
          </button>
        </article>;
      })}
    </div> : sellable.length ? <div className="commerce-list">
      {sellable.map((item) => {
        const price = getItemSellPrice(item);
        const unavailable = item.equipped || item.locked;
        return <article className="commerce-item" key={item.id}>
          <span className="item-glyph">{item.kind === 'weapon' ? '✣' : item.kind === 'armor' ? '◇' : item.kind === 'jewelry' ? '✧' : '✦'}</span>
          <div><b>{item.name}{item.quantity ? ` ×${item.quantity}` : ''}</b><p>{item.description}</p><small>{unavailable ? item.equipped ? 'UNEQUIP TO SELL' : 'UNLOCK TO SELL' : `MARKET VALUE · ${price} SHARDS`}</small></div>
          <button className="mini-button" onClick={() => sellItem(item.id)} disabled={unavailable} data-testid={`button-sell-${item.id}`}>Sell · {price}</button>
        </article>;
      })}
    </div> : <EmptyState icon={<ShoppingBag />} title="Nothing to sell" copy="Only weapons, armor, jewelry, and usable supplies can be sold. Quest items stay with you." />}
  </div>;
}

function TrainingPanel({ coins, level, trainForShards }: {
  coins: number; level: number; trainForShards: (amount: number) => void;
}) {
  const [amount, setAmount] = useState(25);
  const xp = getTrainingXpForShards(amount);
  const valid = Number.isInteger(amount) && amount >= 25 && amount <= coins;
  return <div className="overlay-content commerce-panel training-panel">
    <div className="overlay-intro"><GraduationCap size={17} /><span>Spend shards on experience. Every time your spend doubles, the XP rate improves.</span><b><Coins size={13} /> {coins}</b></div>
    <label className="training-input-label" htmlFor="training-shards">Shards to spend</label>
    <div className="training-input-row">
      <input id="training-shards" type="number" min={25} max={coins} step={1} value={amount}
        onChange={(event) => setAmount(Math.floor(Number(event.target.value) || 0))}
        data-testid="input-training-shards" />
      <span>shards</span>
    </div>
    <div className="training-preview"><span>YOUR TRAINING</span><b>+{xp} XP</b><small>Level {level} · Base rate: 25 shards = 60 XP</small></div>
    <button className="training-submit" onClick={() => trainForShards(amount)} disabled={!valid} data-testid="button-buy-training">
      Train for {amount} shards
    </button>
    {!valid && <small className="training-validation">{coins < 25 ? 'You need at least 25 shards to train.' : amount > coins ? 'Choose an amount no greater than your shard balance.' : 'Training starts at 25 shards.'}</small>}
  </div>;
}

function PowerTreePanel({
  classId,
  level,
  resourceName,
  trainingPoints,
  trainedPowers,
  abilities,
  selectedSlot,
  setSelectedSlot,
  trainPower,
  equipAbility,
}: {
  classId: ClassId;
  level: number;
  resourceName: string;
  trainingPoints: number;
  trainedPowers: Record<string, number>;
  abilities: any[];
  selectedSlot: number;
  setSelectedSlot: (slot: number) => void;
  trainPower: (powerId: string) => void;
  equipAbility: (slot: number, abilityId: string) => void;
}) {
  const disciplines = CLASS_DISCIPLINES[classId];
  const [disciplineId, setDisciplineId] = useState(disciplines[0].id);
  useEffect(() => setDisciplineId(disciplines[0].id), [classId]);
  const discipline = disciplines.find((item) => item.id === disciplineId) ?? disciplines[0];
  const investment = getDisciplineInvestment(classId, discipline.id, trainedPowers);

  return <div className="overlay-content power-tree-content">
    <div className="overlay-intro"><Sparkles size={17} /><span>Train class disciplines and your Hero’s attributes, then bind up to four class powers.</span></div>
    <div className={`training-summary ${trainingPoints > 0 ? 'has-points' : ''}`}>
      <b>{trainingPoints} training {trainingPoints === 1 ? 'point' : 'points'}</b>
      <span>{trainingPoints > 0 ? 'Spend a point to unlock or improve a power.' : 'Earn 1 point each time you level up.'}</span>
    </div>
    <div className="discipline-tabs" role="tablist" aria-label="Training trees">
      {disciplines.map((item) => (
        <button
          key={item.id}
          role="tab"
          aria-selected={discipline.id === item.id}
          className={discipline.id === item.id ? 'selected' : ''}
          onClick={() => setDisciplineId(item.id)}
          data-testid={`button-discipline-${item.id}`}
        >
          <span>{item.icon}</span><b>{item.name}</b>
        </button>
      ))}
      <button
        role="tab"
        aria-selected={disciplineId === HERO_TREE_ID}
        aria-label={level < HERO_TREE_UNLOCK_LEVEL ? `Hero tree unlocks at level ${HERO_TREE_UNLOCK_LEVEL}` : 'Hero tree'}
        className={disciplineId === HERO_TREE_ID ? 'selected' : ''}
        disabled={level < HERO_TREE_UNLOCK_LEVEL}
        title={level < HERO_TREE_UNLOCK_LEVEL ? `Unlocks at level ${HERO_TREE_UNLOCK_LEVEL}` : 'Train personal stats with level-up points'}
        onClick={() => setDisciplineId(HERO_TREE_ID)}
        data-testid="button-discipline-hero"
      >
        <span>✧</span><b>{level < HERO_TREE_UNLOCK_LEVEL ? `Hero · LV ${HERO_TREE_UNLOCK_LEVEL}` : 'Hero'}</b>
      </button>
    </div>
    <div className="discipline-heading">
      <div>
        <span className="eyebrow">{disciplineId === HERO_TREE_ID ? 'PERSONAL ATTRIBUTES' : `${investment} TRAINING ${investment === 1 ? 'POINT' : 'POINTS'} INVESTED`}</span>
        <h3>{disciplineId === HERO_TREE_ID ? 'Hero' : discipline.name}</h3>
      </div>
      <p>{disciplineId === HERO_TREE_ID
        ? 'Shape the hero beneath the class: speed, force, vitality, and spirit.'
        : discipline.description}</p>
    </div>
    {disciplineId === HERO_TREE_ID ? <div className="power-list hero-upgrade-list">
      {HERO_UPGRADES.map((upgrade) => {
        const rank = getHeroUpgradeRank(trainedPowers[upgrade.id]);
        const canTrain = trainingPoints > 0 && level >= HERO_TREE_UNLOCK_LEVEL;
        return <article className={`power-card hero-upgrade-card ${rank > 0 ? 'power-trained' : ''}`} key={upgrade.id} data-testid={`hero-upgrade-${upgrade.id}`}>
          <span className="power-card-icon">{upgrade.icon}</span>
          <div className="power-card-copy">
            <div className="power-card-title"><b>{upgrade.name}</b><small>RANK {rank}</small></div>
            <p>{upgrade.description}</p>
            <div className="power-impact">
              <span><b>Current:</b> {rank ? heroUpgradeEffect(upgrade, rank) : 'No bonus yet'}</span>
              <span><b>Next:</b> {heroUpgradeEffect(upgrade, rank + 1)}</span>
            </div>
          </div>
          <div className="power-card-actions">
            <button className="mini-button" onClick={() => trainPower(upgrade.id)} disabled={!canTrain} data-testid={`button-train-${upgrade.id}`}>
              {trainingPoints > 0 ? 'Train · 1 pt' : 'Need 1 pt'}
            </button>
          </div>
        </article>;
      })}
    </div> : <>
      <div className="binding-label"><span>CHOOSE A SPEED BUTTON</span><small>Current target: SLOT {selectedSlot + 1}</small></div>
      <div className="slot-selector" aria-label="Choose a speed-button slot">
        {[0, 1, 2, 3].map((slot) => (
          <button key={slot} className={selectedSlot === slot ? 'selected' : ''} onClick={() => setSelectedSlot(slot)} data-testid={`button-select-slot-${slot + 1}`}>
            SLOT {slot + 1}<b>{abilities[slot]?.name ?? 'Empty'}</b>
          </button>
        ))}
      </div>
      <div className="power-list">
      {discipline.powers.map((power) => {
        const rank = trainedPowers[power.id] ?? 0;
        const unlocked = rank > 0 || investment >= power.tier - 1;
        const boundSlot = abilities.findIndex((ability) => ability?.id === power.id);
        const atMaxRank = rank >= MAX_POWER_RANK;
        const canTrain = !atMaxRank && unlocked && trainingPoints > 0;
        const trainLabel = rank === 0 ? 'Unlock · 1 pt' : atMaxRank ? 'Max rank' : 'Train · 1 pt';
        const status = rank > 0
          ? `RANK ${rank} / ${MAX_POWER_RANK} · ${Math.round(power.cooldownMs / 1000)}S RECOVERY`
          : !unlocked
            ? `LOCKED · INVEST ${power.tier - 1 - investment} MORE`
            : 'READY TO UNLOCK';
        return <article className={`power-card ${rank > 0 ? 'power-trained' : ''} ${!unlocked ? 'power-locked' : ''}`} key={power.id} data-testid={`power-card-${power.id}`}>
          <span className="power-card-icon">{power.icon}</span>
          <div className="power-card-copy">
            <div className="power-card-title"><b>{power.name}</b><small>{`POWER ${power.tier}`}</small></div>
            <p>{power.description}</p>
            <div className="power-impact" aria-label={`${power.name} training effects`}>
              <span><b>Current:</b> {currentPowerEffect(power, rank, level, classId, resourceName)}</span>
              <span><b>Next:</b> {nextPowerEffect(power, rank, level, classId, resourceName)}</span>
              <span className="power-resource-cost" data-testid={`power-cost-${power.id}`} aria-label={`Costs ${power.cost} ${resourceName}`}>
                <b>Resource cost:</b> {power.cost} {resourceName}
              </span>
            </div>
            <small className="power-status">{status}</small>
          </div>
          <div className="power-card-actions">
            <button className="mini-button" onClick={() => trainPower(power.id)} disabled={!canTrain} data-testid={`button-train-${power.id}`}>{trainLabel}</button>
            {rank > 0 && <button
              className="mini-button bind-power-button"
              onClick={() => equipAbility(selectedSlot, power.id)}
              disabled={boundSlot === selectedSlot}
              data-testid={`button-bind-ability-${power.id}`}
            >{boundSlot === selectedSlot ? 'Bound' : `Bind ${selectedSlot + 1}`}</button>}
          </div>
        </article>;
      })}
      </div>
    </>}
  </div>;
}

function EmptyState({ icon, title, copy }: { icon: ReactNode; title: string; copy: string }) {
  return <div className="empty-state"><span>{icon}</span><b>{title}</b><p>{copy}</p></div>;
}

export default App;
