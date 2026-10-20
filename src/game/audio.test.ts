import assert from 'node:assert/strict';
import test from 'node:test';
import { GameAudio, AUDIO_PREFERENCES_KEY, type MusicScene } from './audio';

const scene: MusicScene = { playing: true, region: 'hearthglen', saturation: 1, tense: false, dungeon: false, boss: false };
function fakeContext() {
  const parameter = () => ({
    value: 0,
    setValueAtTime(value: number) { this.value = value; return this; },
    linearRampToValueAtTime(value: number) { this.value = value; return this; },
    exponentialRampToValueAtTime(value: number) { this.value = value; return this; },
  });
  const gains: { gain: ReturnType<typeof parameter>; connect: () => void; disconnect: () => void }[] = [];
  const filters: { frequency: ReturnType<typeof parameter>; Q: ReturnType<typeof parameter>; connect: () => void; disconnect: () => void }[] = [];
  const sources: {
    buffer: unknown; loop: boolean; startAt: number | null; offset: number | null; stopCount: number;
    connect: () => void; disconnect: () => void; start: (at?: number, offset?: number) => void; stop: () => void;
  }[] = [];
  const voices: { type: string; frequency: number }[] = [];
  const musicBuffer = { duration: 180 };
  let tones = 0;
  let noise = 0;
  const context = {
    currentTime: 0, sampleRate: 44100, destination: {}, state: 'running',
    createGain() { const node = { gain: parameter(), connect() {}, disconnect() {} }; gains.push(node); return node; },
    createBuffer(_channels: number, length: number) { return { getChannelData: () => new Float32Array(length) }; },
    createOscillator() {
      const oscillator = {
        frequency: parameter(), type: 'sine', onended: null,
        connect() {}, disconnect() {},
        start(at: number) {
          tones++;
          voices.push({ type: this.type, frequency: this.frequency.value });
        },
        stop() {},
      };
      return oscillator;
    },
    createBufferSource() {
      const source = {
        buffer: null as unknown, loop: false, startAt: null as number | null, offset: null as number | null, stopCount: 0,
        connect() {}, disconnect() {},
        start(at = 0, offset = 0) {
          this.startAt = at;
          this.offset = offset;
          if (this.buffer !== musicBuffer) noise++;
        },
        stop() { this.stopCount++; },
      };
      sources.push(source);
      return source;
    },
    createBiquadFilter() {
      const filter = { frequency: parameter(), Q: parameter(), connect() {}, disconnect() {} };
      filters.push(filter);
      return filter;
    },
    async resume() { this.state = 'running'; },
    async close() { this.state = 'closed'; },
  };
  return { context, gains, filters, sources, musicBuffer, voices, tones: () => tones, noise: () => noise };
}
function storage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); } };
}

function createAudio(fake: ReturnType<typeof fakeContext>, saved = storage()) {
  return new GameAudio(
    saved,
    () => fake.context as unknown as AudioContext,
    '/audio/test-world-theme.mp3',
    async () => fake.musicBuffer as unknown as AudioBuffer,
  );
}

test('three-minute exploration score plays continuously across realm changes without restarting', async () => {
  const fake = fakeContext();
  const audio = createAudio(fake);
  assert.ok(await audio.unlock());
  audio.update(scene);
  const musicSources = () => fake.sources.filter((source) => source.buffer === fake.musicBuffer);
  assert.equal(musicSources().length, 1);
  assert.equal(musicSources()[0].loop, true);
  assert.equal(fake.musicBuffer.duration, 180);

  for (const region of ['drowned-marches', 'ashen-peaks', 'glasslands', 'fallen-capital', 'first-hunger', 'hearthglen'] as const) {
    fake.context.currentTime += 22;
    audio.update({ ...scene, region, dungeon: region === 'fallen-capital', tense: region === 'first-hunger' });
    assert.equal(musicSources().length, 1, `${region} should continue the same evolving score`);
  }
  audio.dispose();
  assert.equal(fake.context.state, 'closed');
});

test('leaving gameplay pauses the score and resuming continues from its saved position', async () => {
  const fake = fakeContext();
  const audio = createAudio(fake);
  await audio.unlock();
  audio.update(scene);
  fake.context.currentTime = 37.5;
  audio.update({ ...scene, playing: false });
  const musicSources = () => fake.sources.filter((source) => source.buffer === fake.musicBuffer);
  assert.equal(musicSources()[0].stopCount, 1);
  audio.update(scene);
  assert.equal(musicSources().length, 2);
  assert.equal(musicSources()[1].offset, 37.5);
  audio.dispose();
});

test('regional boss motifs come and go without interrupting the long-form exploration score', async () => {
  const fake = fakeContext();
  const audio = createAudio(fake);
  await audio.unlock();
  const advance = (frames: number, state: MusicScene) => {
    for (let frame = 0; frame < frames; frame++) {
      fake.context.currentTime += 1 / 60;
      audio.update(state);
    }
  };

  audio.update(scene);
  advance(180, scene);
  const leadNotes = () => fake.voices.filter((voice) => voice.type === 'square').map((voice) => voice.frequency);
  const musicSources = () => fake.sources.filter((source) => source.buffer === fake.musicBuffer);
  assert.equal(musicSources().length, 1);

  const bossScene = { ...scene, tense: true, boss: true };
  const bossStart = leadNotes().length;
  advance(180, bossScene);
  const bossOpening = leadNotes().slice(bossStart, bossStart + 8);
  assert.equal(bossOpening.length, 8);
  assert.ok(bossOpening[0] > 0, 'the boss phrase adds a bright square-wave lead');

  const returnStart = leadNotes().length;
  advance(180, scene);
  assert.equal(leadNotes().length, returnStart, 'no boss notes are scheduled after combat ends');
  assert.equal(musicSources().length, 1, 'the exploration score continues through combat without restarting');
  assert.equal(musicSources()[0].stopCount, 0);

  const marchesStart = leadNotes().length;
  advance(180, { ...bossScene, region: 'drowned-marches' });
  const marchesBossOpening = leadNotes().slice(marchesStart, marchesStart + 8);
  assert.notDeepEqual(marchesBossOpening, bossOpening, 'boss music follows the active region scale');
  audio.dispose();
});

test('named bosses have distinct lead contours that stay inside each region scale', async () => {
  const fake = fakeContext();
  const audio = createAudio(fake);
  await audio.unlock();

  const bossNames = [
    'Cinderhorn', 'Fury Bellkeeper', 'Prism Bellkeeper', 'Oathbound Bellkeeper',
    'Drowned Bellkeeper', 'The Hollow Cantor', 'Sluice Ironclad', 'Anchor Warden',
    'Marrow Collector', 'Reflection Eater', 'The Pulse That Remains',
    'The Laughing Shard', 'The Facet Weaver', 'The Joyless Bloom',
    'Maelis, Last Bellkeeper', 'The First Hunger',
  ];
  const regionScale = [0, 2, 4, 5, 7, 9, 11];
  const baseMidi = 55;
  const leadContours = new Set<string>();
  const advance = (frames: number, state: MusicScene) => {
    for (let frame = 0; frame < frames; frame++) {
      fake.context.currentTime += 1 / 60;
      audio.update(state);
    }
  };

  audio.update(scene);
  for (const bossName of bossNames) {
    const start = fake.voices.length;
    advance(120, { ...scene, boss: true, bossName });
    const notes = fake.voices.slice(start)
      .filter((voice) => voice.type === 'square')
      .slice(0, 8)
      .map((voice) => Math.round(69 + 12 * Math.log2(voice.frequency / 440)));
    assert.equal(notes.length, 8, `${bossName} should play a complete identifying phrase`);
    leadContours.add(notes.join(','));
    for (const note of notes) {
      const interval = ((note - baseMidi) % 12 + 12) % 12;
      assert.ok(regionScale.includes(interval), `${bossName} note ${note} should fit Hearthglen's scale`);
    }
  }
  assert.equal(leadContours.size, bossNames.length, 'each named boss should have its own recognizable contour');
  audio.dispose();
});

test('music and battle mute controls are independent, immediate, and persistent', async () => {
  const fake = fakeContext();
  const saved = storage();
  const audio = createAudio(fake, saved);
  await audio.unlock();
  audio.update(scene);
  const musicSource = fake.sources.find((source) => source.buffer === fake.musicBuffer);
  assert.ok(musicSource);
  assert.ok(audio.setPreferences({ ...audio.getPreferences(), musicMuted: true }));
  assert.equal(fake.gains[0].gain.value, 0);
  assert.ok(fake.gains[1].gain.value > 0);
  const before = fake.tones();
  audio.playBattle(['strike', 'spell', 'hit', 'hurt', 'defeat', 'victory', 'well']);
  assert.ok(fake.tones() > before);
  assert.ok(fake.noise() >= 4);
  audio.setPreferences({ ...audio.getPreferences(), musicMuted: false, battleMuted: true });
  assert.equal(fake.gains[1].gain.value, 0);
  const muted = fake.tones();
  audio.playBattle(['spell', 'hurt']);
  assert.equal(fake.tones(), muted);
  fake.context.currentTime += 1;
  audio.update(scene);
  assert.equal(fake.tones(), muted);
  assert.equal(fake.sources.filter((source) => source.buffer === fake.musicBuffer).length, 1);
  assert.deepEqual(new GameAudio(saved).getPreferences(), {
    musicMuted: false, battleMuted: true, musicVolume: 1, battleVolume: 1,
  });
  assert.ok(saved.getItem(AUDIO_PREFERENCES_KEY));
  audio.dispose();
});

test('music and battle volumes adjust separate buses and survive reloads independently of save slots', async () => {
  const fake = fakeContext();
  const saved = storage();
  const audio = createAudio(fake, saved);
  await audio.unlock();
  audio.update(scene);

  assert.ok(audio.setPreferences({ ...audio.getPreferences(), musicVolume: 0.25, battleVolume: 0.6 }));
  assert.equal(fake.gains[0].gain.value, 0.28 * 0.25);
  assert.equal(fake.gains[1].gain.value, 0.35 * 0.6);

  audio.setPreferences({ ...audio.getPreferences(), musicMuted: true });
  assert.equal(fake.gains[0].gain.value, 0, 'music mute overrides its volume');
  assert.equal(fake.gains[1].gain.value, 0.35 * 0.6, 'music mute leaves battle sounds unchanged');
  audio.setPreferences({ ...audio.getPreferences(), musicMuted: false, battleMuted: true });
  assert.equal(fake.gains[0].gain.value, 0.28 * 0.25, 'unmuting restores the selected music level');
  assert.equal(fake.gains[1].gain.value, 0, 'battle mute overrides its volume');

  const reloadedAudio = new GameAudio(saved);
  assert.deepEqual(reloadedAudio.getPreferences(), {
    musicMuted: false, battleMuted: true, musicVolume: 0.25, battleVolume: 0.6,
  });
  reloadedAudio.setPreferences({ ...reloadedAudio.getPreferences(), battleMuted: false });
  assert.deepEqual(new GameAudio(saved).getPreferences(), {
    musicMuted: false, battleMuted: false, musicVolume: 0.25, battleVolume: 0.6,
  });
  audio.dispose();
});

test('bell-driven desaturation thins music; failed preference storage remains explicit and playable', async () => {
  const full = fakeContext();
  const faded = fakeContext();
  const rich = createAudio(full);
  const thin = createAudio(faded, { getItem: () => null, setItem: () => { throw new Error('Blocked'); } });
  await rich.unlock(); await thin.unlock();
  rich.update(scene); thin.update({ ...scene, saturation: 0 });
  assert.ok(full.gains[0].gain.value > faded.gains[0].gain.value);
  assert.ok(full.filters[0].frequency.value > faded.filters[0].frequency.value);
  assert.equal(thin.setPreferences({ ...thin.getPreferences(), musicMuted: true, battleMuted: true }), false);
  assert.deepEqual(thin.getPreferences(), {
    musicMuted: true, battleMuted: true, musicVolume: 1, battleVolume: 1,
  });
  assert.equal(faded.gains[0].gain.value, 0);
  assert.equal(faded.gains[1].gain.value, 0);
  rich.dispose(); thin.dispose();
});
