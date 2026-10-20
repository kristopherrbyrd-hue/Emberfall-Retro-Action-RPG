import type { WorldRegionId } from './worldMap';

export type BattleSound = 'strike' | 'spell' | 'hit' | 'hurt' | 'defeat' | 'victory' | 'well';
export type AudioPreferences = {
  musicMuted: boolean;
  battleMuted: boolean;
  musicVolume: number;
  battleVolume: number;
};
export type MusicScene = {
  playing: boolean; region: WorldRegionId; saturation: number; tense: boolean; dungeon: boolean; boss: boolean;
  bossName?: string;
};
export const AUDIO_PREFERENCES_KEY = 'emberfall-audio-preferences';

type MusicAssetLoader = (context: AudioContext, url: string) => Promise<AudioBuffer>;
type RegionScale = { root: number; intervals: readonly number[] };
type ScoreDegree = number | null;

const regionScales: Record<WorldRegionId, RegionScale> = {
  hearthglen: { root: 55, intervals: [0, 2, 4, 5, 7, 9, 11] },
  'drowned-marches': { root: 50, intervals: [0, 2, 3, 5, 7, 9, 10] },
  'ashen-peaks': { root: 45, intervals: [0, 2, 3, 5, 7, 8, 10] },
  glasslands: { root: 53, intervals: [0, 2, 4, 5, 7, 9, 11] },
  'fallen-capital': { root: 52, intervals: [0, 2, 3, 5, 7, 8, 10] },
  'first-hunger': { root: 48, intervals: [0, 1, 3, 5, 7, 8, 10] },
};

const bossLeadBars: readonly (readonly ScoreDegree[])[] = [
  [4, null, 7, 9, 11, null, 9, 7, 5, null, 7, 9, 11, 9, 7, null],
  [0, 4, 7, null, 9, 11, 9, 7, 5, 7, 9, null, 7, 4, 2, null],
];

const bossMotifs: Record<string, readonly ScoreDegree[]> = {
  Cinderhorn: [0, null, 3, 4, null, 7, 5, null, 4, null, 2, 3, null, 5, 0, null],
  'Fury Bellkeeper': [7, null, 6, 4, 3, null, 4, null, 0, 2, null, 4, 7, null, 3, null],
  'Prism Bellkeeper': [0, 4, null, 7, 11, null, 9, 7, null, 11, 9, 4, null, 7, 4, null],
  'Oathbound Bellkeeper': [4, null, 2, 0, 7, null, 5, 4, 2, null, 0, 2, 4, null, 7, null],
  'Drowned Bellkeeper': [0, null, 2, 5, null, 7, 5, null, 3, null, 5, 2, 0, null, 2, null],
  'The Hollow Cantor': [4, null, 7, null, 9, 7, null, 5, 4, null, 2, null, 4, 7, null, 9],
  'Sluice Ironclad': [0, 0, null, 4, null, 4, 7, null, 7, 4, null, 2, 0, null, 0, null],
  'Anchor Warden': [0, null, 4, 7, null, 4, 2, null, 0, 2, null, 4, 7, null, 4, null],
  'Marrow Collector': [7, null, 5, 4, null, 2, 0, null, 2, null, 4, 5, null, 7, 4, null],
  'Reflection Eater': [0, 7, null, 11, 9, null, 7, 4, null, 9, 11, null, 7, 5, 4, null],
  'The Pulse That Remains': [0, null, 0, 3, 5, null, 7, null, 5, 3, null, 4, 7, 9, null, 7],
  'The Laughing Shard': [0, 4, 7, null, 11, 9, 7, null, 4, 7, null, 9, 11, null, 9, 7],
  'The Facet Weaver': [0, null, 4, 2, 7, null, 11, 9, 7, null, 5, 7, 9, null, 4, 2],
  'The Joyless Bloom': [0, null, 3, 5, 8, null, 7, 5, 3, null, 2, 4, 7, null, 5, 3],
  'Maelis, Last Bellkeeper': [7, 4, null, 0, 2, null, 4, 7, 9, null, 7, 5, 4, null, 2, 0],
  'The First Hunger': [0, 1, null, 3, 5, null, 8, 7, 5, null, 3, 1, 0, null, 1, null],
};

const chordDegrees = [0, 4] as const;
const bassMotion = [0, 4, 2, 4] as const;
const arpeggioMotion = [0, 2, 4, 2] as const;

function scalePitch(root: number, intervals: readonly number[], degree: number): number {
  const octave = Math.floor(degree / intervals.length);
  const index = ((degree % intervals.length) + intervals.length) % intervals.length;
  return root + octave * 12 + intervals[index];
}

export class GameAudio {
  private context: AudioContext | null = null;

  private musicBus: GainNode | null = null;

  private battleBus: GainNode | null = null;

  private musicFilter: BiquadFilterNode | null = null;

  private musicSource: AudioBufferSourceNode | null = null;

  private musicBuffer: AudioBuffer | null = null;

  private musicLoadPromise: Promise<void> | null = null;

  private musicLoadFailed = false;

  private musicOffset = 0;

  private musicStartedAt = 0;

  private bossScoreKey = '';

  private bossNextNote = 0;

  private bossBeat = 0;

  private noise: AudioBuffer | null = null;

  private preferences: AudioPreferences = { musicMuted: false, battleMuted: false, musicVolume: 1, battleVolume: 1 };

  private initialNotice: string | null = null;

  private scene: MusicScene = { playing: false, region: 'hearthglen', saturation: 1, tense: false, dungeon: false, boss: false };

  constructor(
    private storage: Pick<Storage, 'getItem' | 'setItem'> | null = null,
    private createContext?: () => AudioContext,
    private musicAssetUrl = '/audio/emberfall-world-theme.mp3',
    private musicAssetLoader?: MusicAssetLoader,
  ) {
    try {
      if (!this.storage && typeof window !== 'undefined') this.storage = window.localStorage;
      const saved = JSON.parse(this.storage?.getItem(AUDIO_PREFERENCES_KEY) ?? '{}');
      this.preferences = {
        musicMuted: saved?.musicMuted === true,
        battleMuted: saved?.battleMuted === true,
        musicVolume: normalizeVolume(saved?.musicVolume),
        battleVolume: normalizeVolume(saved?.battleVolume),
      };
    } catch { this.initialNotice = 'Audio preferences could not be loaded. Default sound settings are in use.'; }
  }

  getPreferences() { return { ...this.preferences }; }

  getInitialNotice() { return this.initialNotice; }

  setPreferences(preferences: AudioPreferences): boolean {
    this.preferences = {
      ...preferences,
      musicVolume: normalizeVolume(preferences.musicVolume),
      battleVolume: normalizeVolume(preferences.battleVolume),
    };
    this.applyVolumes();
    try {
      if (!this.storage) return false;
      this.storage.setItem(AUDIO_PREFERENCES_KEY, JSON.stringify(this.preferences));
      return true;
    } catch { return false; }
  }

  async unlock(): Promise<boolean> {
    try {
      if (!this.context) {
        const Context = typeof window !== 'undefined'
          ? window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext : null;
        this.context = this.createContext ? this.createContext() : Context ? new Context() : null;
        if (!this.context) return false;
        this.musicBus = this.context.createGain();
        this.battleBus = this.context.createGain();
        this.musicFilter = this.context.createBiquadFilter();
        this.musicFilter.type = 'lowpass';
        this.musicFilter.Q.setValueAtTime(0.65, this.context.currentTime);
        this.musicFilter.connect(this.musicBus);
        this.musicBus.connect(this.context.destination);
        this.battleBus.connect(this.context.destination);
        this.noise = this.context.createBuffer(1, Math.floor(this.context.sampleRate * 0.25), this.context.sampleRate);
        const data = this.noise.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        this.applyVolumes();
      }
      if (this.context.state === 'suspended') await this.context.resume();
      if (this.context.state === 'running') {
        await this.ensureMusicLoaded();
        this.startMusic();
      }
      return this.context.state === 'running';
    } catch { return false; }
  }

  private applyVolumes() {
    if (!this.context) return;
    const fullness = Math.max(0, Math.min(1, this.scene.saturation));
    this.musicBus?.gain.setValueAtTime(this.preferences.musicMuted || !this.scene.playing
      ? 0 : 0.28 * (0.3 + fullness * 0.7) * this.preferences.musicVolume, this.context.currentTime);
    this.battleBus?.gain.setValueAtTime(this.preferences.battleMuted || !this.scene.playing
      ? 0 : 0.35 * this.preferences.battleVolume, this.context.currentTime);
    this.musicFilter?.frequency.setValueAtTime(1800 + fullness * 16200, this.context.currentTime);
  }

  update(scene: MusicScene) {
    this.scene = scene;
    this.applyVolumes();
    const context = this.context;
    if (!context) return;
    if (!scene.playing) {
      this.stopMusic();
      this.stopBossScore();
      return;
    }
    if (context.state !== 'running') return;
    void this.ensureMusicLoaded();
    this.startMusic();

    if (!scene.boss || this.preferences.musicMuted) {
      this.stopBossScore();
      return;
    }

    const theme = `${scene.region}/${scene.dungeon}/${scene.bossName ?? ''}`;
    if (theme !== this.bossScoreKey) {
      this.bossScoreKey = theme;
      this.bossBeat = 0;
      this.bossNextNote = context.currentTime + 0.035;
    }
    this.bossNextNote = Math.max(this.bossNextNote, context.currentTime + 0.015);
    const score = regionScales[scene.region];
    const bossMotif = bossMotifs[scene.bossName ?? ''];
    const stepDuration = 0.085;
    const fullness = Math.max(0, Math.min(1, scene.saturation));
    while (this.bossNextNote < context.currentTime + 0.12) {
      const step = this.bossBeat % 32;
      const bar = Math.floor(step / 16);
      const beat = step % 16;
      const chord = chordDegrees[bar];
      const leadDegree = bossMotif ? bossMotif[beat] : bossLeadBars[bar][beat];
      const stride = fullness < 0.21 ? 4 : fullness < 0.61 ? 2 : 1;
      const dungeonOffset = scene.dungeon ? -12 : 0;

      if (leadDegree !== null && step % stride === 0) {
        this.tone(
          scalePitch(score.root, score.intervals, leadDegree) + dungeonOffset + 12,
          this.bossNextNote,
          stepDuration * 0.82,
          0.085,
          'square',
          false,
        );
      }
      if (beat % 4 === 0) {
        const bassDegree = chord + bassMotion[beat / 4];
        this.tone(
          scalePitch(score.root - 12, score.intervals, bassDegree),
          this.bossNextNote,
          stepDuration * 2.7,
          0.12,
          'triangle',
          false,
        );
      }
      if (fullness > 0.4 && beat === 0) {
        this.tone(
          scalePitch(score.root, score.intervals, chord + 2) + dungeonOffset,
          this.bossNextNote,
          stepDuration * 3,
          0.035,
          'triangle',
          false,
        );
      }
      if (fullness > 0.4 && beat % 2 === 1) {
        const arpDegree = chord + arpeggioMotion[Math.floor(beat / 2) % arpeggioMotion.length];
        this.tone(
          scalePitch(score.root + 12, score.intervals, arpDegree) + dungeonOffset,
          this.bossNextNote,
          stepDuration * 0.9,
          0.035,
          'triangle',
          false,
        );
      }
      if (scene.tense && beat % 8 === 6) {
        const fillDegree = (leadDegree ?? 4) + 7;
        this.tone(
          scalePitch(score.root, score.intervals, fillDegree) + dungeonOffset,
          this.bossNextNote,
          stepDuration * 0.75,
          0.03,
          'square',
          false,
        );
      }
      this.bossNextNote += stepDuration;
      this.bossBeat++;
    }
  }

  private stopBossScore() {
    this.bossScoreKey = '';
    this.bossBeat = 0;
    this.bossNextNote = (this.context?.currentTime ?? 0) + 0.035;
  }

  private ensureMusicLoaded(): Promise<void> {
    if (this.musicBuffer || this.musicLoadFailed || !this.context) return Promise.resolve();
    if (this.musicLoadPromise) return this.musicLoadPromise;
    const context = this.context;
    this.musicLoadPromise = (async () => {
      try {
        let buffer: AudioBuffer;
        if (this.musicAssetLoader) {
          buffer = await this.musicAssetLoader(context, this.musicAssetUrl);
        } else {
          const response = await fetch(this.musicAssetUrl);
          if (!response.ok) throw new Error(`Music asset request failed (${response.status})`);
          buffer = await context.decodeAudioData(await response.arrayBuffer());
        }
        if (this.context !== context) return;
        this.musicBuffer = buffer;
      } catch {
        this.musicLoadFailed = true;
        this.initialNotice ??= 'The exploration music could not be loaded. Battle sounds are still available.';
      }
    })().finally(() => { this.musicLoadPromise = null; });
    return this.musicLoadPromise;
  }

  private startMusic() {
    const context = this.context;
    if (!context || context.state !== 'running' || !this.scene.playing ||
        !this.musicBuffer || !this.musicFilter || this.musicSource) return;
    const source = context.createBufferSource();
    source.buffer = this.musicBuffer;
    source.loop = true;
    source.connect(this.musicFilter);
    source.start(0, this.musicOffset);
    this.musicStartedAt = context.currentTime;
    this.musicSource = source;
  }

  private stopMusic() {
    if (!this.musicSource || !this.context) return;
    const duration = this.musicBuffer?.duration ?? 180;
    this.musicOffset = (this.musicOffset + Math.max(0, this.context.currentTime - this.musicStartedAt)) % duration;
    try { this.musicSource.stop(); } catch { /* The browser may have ended the source while the tab was suspended. */ }
    this.musicSource.disconnect();
    this.musicSource = null;
  }

  private tone(note: number, at: number, duration: number, volume: number, type: OscillatorType, battle: boolean, endNote?: number) {
    const context = this.context!;
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(440 * 2 ** ((note - 69) / 12), at);
    if (endNote !== undefined) oscillator.frequency.exponentialRampToValueAtTime(440 * 2 ** ((endNote - 69) / 12), at + duration);
    envelope.gain.setValueAtTime(0.0001, at);
    envelope.gain.linearRampToValueAtTime(volume, at + 0.008);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    oscillator.connect(envelope); envelope.connect(battle ? this.battleBus! : this.musicFilter!);
    oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect(); };
    oscillator.start(at); oscillator.stop(at + duration + 0.01);
  }

  playBattle(events: BattleSound[]) {
    if (!this.context || this.context.state !== 'running' || this.preferences.battleMuted || !this.scene.playing) return;
    events.slice(0, 8).forEach((event, index) => {
      const at = this.context!.currentTime + index * 0.012;
      if (event === 'victory' || event === 'well') {
        [60, 64, 67, 72].forEach((note, i) => this.tone(note, at + i * 0.08, 0.32, 0.15, 'triangle', true));
      } else if (event === 'spell') {
        this.tone(60, at, 0.19, 0.18, 'sine', true, 84);
        this.tone(67, at + 0.035, 0.16, 0.1, 'triangle', true, 91);
      } else {
        const note = event === 'hurt' ? 42 : event === 'defeat' ? 60 : event === 'hit' ? 78 : 84;
        this.tone(note, at, event === 'defeat' ? 0.24 : 0.10, 0.15, 'triangle', true, note - 20);
        const source = this.context!.createBufferSource();
        const envelope = this.context!.createGain();
        source.buffer = this.noise;
        envelope.gain.setValueAtTime(event === 'strike' ? 0.07 : 0.12, at);
        envelope.gain.exponentialRampToValueAtTime(0.0001, at + 0.065);
        source.connect(envelope); envelope.connect(this.battleBus!);
        source.onended = () => { source.disconnect(); envelope.disconnect(); };
        source.start(at); source.stop(at + 0.07);
      }
    });
  }

  dispose() {
    this.stopMusic();
    if (this.context) void this.context.close();
    this.context = null;
    this.musicBus = this.battleBus = null;
    this.musicFilter = null;
    this.musicBuffer = null;
    this.noise = null;
    this.stopBossScore();
  }
}

function normalizeVolume(volume: unknown): number {
  return typeof volume === 'number' && Number.isFinite(volume)
    ? Math.max(0, Math.min(1, volume))
    : 1;
}
