import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  ButtonId,
  CharacterConfig,
  Direction,
  GameSnapshot,
  MenuId,
} from './data';
import {
  AdventureEngine,
  SAVE_SLOT_KEYS,
  SUPPORTED_SAVE_VERSIONS,
  type SavedRun,
} from './simulation';
import { GameAudio, type AudioPreferences } from './audio';

export function saveJourneyAndReturnToTitle(engine: AdventureEngine, write: (save: SavedRun) => void): boolean {
  const save = engine.exportSave();
  if (!save) return false;
  try { write(save); } catch { return false; }
  engine.returnToTitle();
  return true;
}

export type SavedRunReadResult =
  | { status: 'available'; save: SavedRun }
  | { status: 'missing' | 'unreadable' | 'storage-unavailable' };
export type SaveSlot = SavedRunReadResult & { index: number };

export const inspectSavedRun = (raw: string | null): SavedRunReadResult => {
  if (raw === null) return { status: 'missing' };
  try {
    const value: unknown = JSON.parse(raw);
    const isRecord = (entry: unknown): entry is Record<string, unknown> =>
      typeof entry === 'object' && entry !== null && !Array.isArray(entry);
    if (
      !isRecord(value) ||
      typeof value.version !== 'number' ||
      !SUPPORTED_SAVE_VERSIONS.has(value.version) ||
      !isRecord(value.state) ||
      !isRecord(value.state.player) ||
      !Array.isArray(value.state.inventory) ||
      !Array.isArray(value.state.log) ||
      !Array.isArray(value.state.discoveredRooms) ||
      !isRecord(value.progress) ||
      !Array.isArray(value.progress.defeatedIds) ||
      !Array.isArray(value.progress.collectedIds) ||
      !Array.isArray(value.actors)
    ) return { status: 'unreadable' };
    return { status: 'available', save: value as SavedRun };
  } catch {
    return { status: 'unreadable' };
  }
};

export const parseSavedRun = (raw: string | null): SavedRun | null => {
  const result = inspectSavedRun(raw);
  return result.status === 'available' ? result.save : null;
};

const readSave = (slotIndex: number): SavedRunReadResult => {
  try {
    return inspectSavedRun(window.localStorage.getItem(SAVE_SLOT_KEYS[slotIndex]));
  } catch {
    return { status: 'storage-unavailable' };
  }
};

export const inspectSaveSlots = (read: (key: string) => string | null): SaveSlot[] =>
  SAVE_SLOT_KEYS.map((key, index) => {
    try {
      return { ...inspectSavedRun(read(key)), index };
    } catch {
      return { status: 'storage-unavailable', index };
    }
  });

const readSaveSlots = (): SaveSlot[] => inspectSaveSlots((key) => window.localStorage.getItem(key));

const refreshSnapshot = (engine: AdventureEngine): GameSnapshot =>
  JSON.parse(JSON.stringify(engine.getState())) as GameSnapshot;

export function useEmberfallSession() {
  const engine = useMemo(() => new AdventureEngine(), []);
  const audio = useMemo(() => new GameAudio(
    undefined,
    undefined,
    `${import.meta.env.BASE_URL}audio/emberfall-world-theme.mp3`,
  ), []);
  const [audioPreferences, setAudioPreferences] = useState(() => audio.getPreferences());
  const [audioNotice, setAudioNotice] = useState<string | null>(() => audio.getInitialNotice());
  const [state, setState] = useState<GameSnapshot>(() => refreshSnapshot(engine));
  const [saveSlots, setSaveSlots] = useState<SaveSlot[]>([]);
  const [saveNotice, setSaveNotice] = useState<'unreadable' | 'storage-unavailable' | 'write-failed' | null>(null);
  const activeSlotRef = useMemo(() => ({ current: 0 }), []);

  const changeAudioPreferences = useCallback((preferences: AudioPreferences) => {
    setAudioPreferences(preferences);
    setAudioNotice(audio.setPreferences(preferences) ? null
      : 'Audio settings apply now, but could not be saved for your next visit.');
  }, [audio]);

  const persistCurrent = useCallback(() => {
    const saved = engine.exportSave();
    if (!saved) return false;
    try {
      window.localStorage.setItem(SAVE_SLOT_KEYS[activeSlotRef.current], JSON.stringify(saved));
      setSaveSlots((current) => current.map((slot) =>
        slot.index === activeSlotRef.current ? { index: slot.index, status: 'available', save: saved } : slot));
      setSaveNotice(null);
      return true;
    } catch { setSaveNotice('write-failed'); return false; }
  }, [activeSlotRef, engine]);

  const saveAndReturnToTitle = useCallback(() => {
    const success = saveJourneyAndReturnToTitle(engine, (save) =>
      window.localStorage.setItem(SAVE_SLOT_KEYS[activeSlotRef.current], JSON.stringify(save)));
    if (!success) { setSaveNotice('write-failed'); return false; }
    setSaveSlots(readSaveSlots());
    setSaveNotice(null);
    setState(refreshSnapshot(engine));
    audio.update(engine.getAudioScene());
    return true;
  }, [activeSlotRef, engine, audio]);

  const returnToLastWell = useCallback(() => {
    if (!engine.returnToLastWell()) return false;
    if (persistCurrent()) engine.closeMenu();
    setState(refreshSnapshot(engine));
    return true;
  }, [engine, persistCurrent]);

  useEffect(() => {
    const unlock = () => { void audio.unlock().then((available) => {
      const notice = audio.getInitialNotice();
      setAudioNotice((current) => notice ?? (!available
        ? 'Audio could not start in this browser. Check your browser’s sound permissions, then tap again.'
        : current?.startsWith('Audio could not start') ? null : current));
    }); };
    document.addEventListener('pointerdown', unlock);
    document.addEventListener('touchend', unlock, { passive: true });
    document.addEventListener('keydown', unlock);
    const timer = window.setInterval(() => {
      const scene = engine.getAudioScene();
      audio.update({ ...scene, playing: scene.playing && !document.hidden });
      audio.playBattle(engine.drainAudioEvents());
    }, 35);
    return () => {
      document.removeEventListener('pointerdown', unlock);
      document.removeEventListener('touchend', unlock);
      document.removeEventListener('keydown', unlock);
      window.clearInterval(timer);
      audio.dispose();
    };
  }, [audio, engine]);

  const beginCreation = useCallback(() => {
    engine.beginCreation();
    setState(refreshSnapshot(engine));
  }, [engine]);

  const returnToTitle = useCallback(() => {
    engine.returnToTitle();
    setState(refreshSnapshot(engine));
  }, [engine]);

  const startNewGame = useCallback((config: CharacterConfig, slotIndex: number) => {
    activeSlotRef.current = slotIndex;
    engine.startNewGame(config);
    const saved = engine.exportSave();
    if (saved) {
      try {
        window.localStorage.setItem(SAVE_SLOT_KEYS[slotIndex], JSON.stringify(saved));
        setSaveSlots(readSaveSlots());
        setSaveNotice(null);
      } catch {
        setSaveNotice('write-failed');
      }
    }
    setState(refreshSnapshot(engine));
  }, [activeSlotRef, engine]);

  const continueGame = useCallback((slotIndex: number) => {
    const result = readSave(slotIndex);
    if (result.status !== 'available') {
      setSaveSlots(readSaveSlots());
      setSaveNotice(result.status === 'missing' ? null : result.status);
      setState(refreshSnapshot(engine));
      return;
    }
    let loaded = false;
    try {
      loaded = engine.loadSave(result.save);
    } catch {
      // Treat malformed data the engine cannot apply like any other unreadable save.
    }
    if (!loaded) {
      setSaveSlots(readSaveSlots());
      setSaveNotice('unreadable');
      engine.returnToTitle();
      setState(refreshSnapshot(engine));
      return;
    }
    activeSlotRef.current = slotIndex;
    setSaveSlots(readSaveSlots());
    setSaveNotice(null);
    setState(refreshSnapshot(engine));
  }, [activeSlotRef, engine]);

  const setDirection = useCallback((direction: Direction, isDown: boolean) => {
    engine.setDirection(direction, isDown);
  }, [engine]);

  const setAnalogMovement = useCallback((x: number, y: number) => {
    engine.setAnalogMovement(x, y);
  }, [engine]);

  const pressButton = useCallback((button: ButtonId) => {
    engine.pressButton(button);
    if (engine.consumeCheckpointSaveRequest() && !persistCurrent()) {
      engine.getState().hint = 'You rested, but saving failed. Keep this game open and retry saving from Menu.';
    }
    setState(refreshSnapshot(engine));
  }, [engine, persistCurrent]);

  const releaseButton = useCallback((_button: ButtonId) => {
    // Actions fire on press; release is kept in the public input contract for
    // pointer-safe multitouch and future held attacks.
  }, []);

  const openMenu = useCallback((menu: MenuId) => {
    engine.openMenu(menu);
    setState(refreshSnapshot(engine));
  }, [engine]);

  const closeMenu = useCallback(() => {
    engine.closeMenu();
    setState(refreshSnapshot(engine));
  }, [engine]);

  const dismissDialog = useCallback(() => {
    engine.dismissDialog();
    setState(refreshSnapshot(engine));
  }, [engine]);

  const chooseMaelisAlliance = useCallback((allied: boolean) => {
    engine.chooseMaelisAlliance(allied);
    setState(refreshSnapshot(engine));
  }, [engine]);

  const equipItem = useCallback((id: string) => {
    engine.equipItem(id);
    setState(refreshSnapshot(engine));
  }, [engine]);

  const toggleGearLock = useCallback((id: string) => {
    engine.toggleGearLock(id);
    setState(refreshSnapshot(engine));
  }, [engine]);

  const salvageItem = useCallback((id: string, confirmed = false) => {
    engine.salvageItem(id, confirmed);
    setState(refreshSnapshot(engine));
  }, [engine]);

  const equipAbility = useCallback((slot: number, abilityId: string) => {
    engine.equipAbility(slot, abilityId);
    setState(refreshSnapshot(engine));
  }, [engine]);

  const trainPower = useCallback((powerId: string) => {
    engine.trainPower(powerId);
    setState(refreshSnapshot(engine));
  }, [engine]);

  const buyShopItem = useCallback((itemId: string) => {
    engine.buyShopItem(itemId);
    setState(refreshSnapshot(engine));
  }, [engine]);

  const sellInventoryItem = useCallback((itemId: string) => {
    engine.sellInventoryItem(itemId);
    setState(refreshSnapshot(engine));
  }, [engine]);

  const trainForShards = useCallback((amount: number) => {
    engine.trainForShards(amount);
    setState(refreshSnapshot(engine));
  }, [engine]);

  const requestGuide = useCallback(() => {
    const used = engine.requestGuide();
    setState(refreshSnapshot(engine));
    return used;
  }, [engine]);

  useEffect(() => {
    const slots = readSaveSlots();
    setSaveSlots(slots);
    setSaveNotice(slots.some((slot) => slot.status === 'storage-unavailable')
      ? 'storage-unavailable'
      : slots.some((slot) => slot.status === 'unreadable') ? 'unreadable' : null);
    const persist = persistCurrent;
    let lastFinaleStage = engine.getWorldProgress().finale.stage;
    const refreshTimer = window.setInterval(() => {
      if (engine.getState().mode === 'playing') {
        const stage = engine.getWorldProgress().finale.stage;
        // Save victory and the postgame handoff immediately, not at the next
        // autosave interval. A refresh must never resurrect the final battle.
        if (stage !== lastFinaleStage && (stage === 'restoring' || stage === 'complete')) persist();
        lastFinaleStage = stage;
        setState(refreshSnapshot(engine));
      }
    }, 140);
    const saveTimer = window.setInterval(persist, 1800);
    const saveFinaleOnLeave = () => {
      if (['restoring', 'complete'].includes(engine.getWorldProgress().finale.stage)) persist();
    };
    const saveWhenHidden = () => {
      if (document.hidden) saveFinaleOnLeave();
    };
    window.addEventListener('pagehide', saveFinaleOnLeave);
    document.addEventListener('visibilitychange', saveWhenHidden);
    return () => {
      window.removeEventListener('pagehide', saveFinaleOnLeave);
      document.removeEventListener('visibilitychange', saveWhenHidden);
      window.clearInterval(refreshTimer);
      window.clearInterval(saveTimer);
      engine.releaseAllDirections();
    };
  }, [activeSlotRef, engine, persistCurrent]);

  return {
    state,
    saveExists: saveSlots.some((slot) => slot.status === 'available'),
    saveSlots,
    saveNotice,
    engine,
    audioPreferences,
    audioNotice,
    changeAudioPreferences,
    returnToLastWell,
    saveAndReturnToTitle,
    beginCreation,
    returnToTitle,
    startNewGame,
    continueGame,
    setDirection,
    setAnalogMovement,
    pressButton,
    releaseButton,
    openMenu,
    closeMenu,
    dismissDialog,
    chooseMaelisAlliance,
    equipItem,
    toggleGearLock,
    salvageItem,
    equipAbility,
    trainPower,
    buyShopItem,
    sellInventoryItem,
    trainForShards,
    requestGuide,
  };
}
