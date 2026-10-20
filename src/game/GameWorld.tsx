import { useEffect } from 'react';
import Phaser from 'phaser';
import { HUNGER_SITES, MAELIS_HUB, HUNGER_ARENA } from './hungerTerritory';
import { DUNGEON_COLUMNS, DUNGEON_ROWS, dungeonById, dungeonPassageState, dungeonRoomAt, dungeonRoomOrigin } from './dungeons';
import type { ClassId, PlayerState, RoomId } from './data';
import {
  AdventureEngine,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  type EnemyActor,
  type WorldEffect,
  type WorldProp,
} from './simulation';
import {
  createCustomizedHeroFrame,
  cropDirectionalSpriteFrame,
  HERO_WALK_POSES,
  WALK_FRAME_DURATION_MS,
  heroTextureKey,
  type HeroPose,
  walkPoseAtTime,
} from './heroAppearance';
import {
  WORLD_CELL_BORDER_THICKNESS,
  WORLD_CELL_HEIGHT,
  WORLD_CELL_OPENING,
  WORLD_CELL_WIDTH,
  WORLD_CELLS,
  cellEdgeHasOpening,
  worldCellAt,
  type MarchesTide,
  type WorldRegionId,
} from './worldMap';
import {
  getColorMatrixSaturationAdjustment,
  getFirstHungerRenderCameras,
  getWorldColorProfile,
} from './worldProgress';
import { BOSS_SPRITES_BY_NAME, ENEMY_SPRITES_BY_NAME, NPC_SPRITES_BY_ID, SPRITE_ASSETS } from './spriteCatalog';

import { getRestorationShot } from './finale';
import { CINE_POOL, CINE_VILLAGER_VARIANTS, cinematicActors, cinematicCamera, drawCinematicFx } from './finaleCinematic';

const CINE_SETTLEMENTS: Record<string, { tint: number; plaza: number; lantern: number; ruin?: boolean }> = {
  'drowned-ferry': { tint: 0xa9d6cf, plaza: 0x9c9a78, lantern: 0xa5d2d0 },
  'cinderwatch-approach': { tint: 0xe3b5a6, plaza: 0xa07e66, lantern: 0xff9b69 },
  'petrified-garden': { tint: 0xcfe8ee, plaza: 0xa2b0b2, lantern: 0xbfe6e0 },
  'capital-south-gate': { tint: 0xc6b8dc, plaza: 0x8f8170, lantern: 0xc9a8ff, ruin: true },
};

const roomGround: Record<RoomId, number> = {
  village: 0x718c5b,
  woodland: 0x54764b,
  ruins: 0x746b59,
  sanctum: 0x463f49,
  chapel: 0x46585c,
};

const colorNumber = (color: string | undefined, fallback: number) => {
  if (!color || !/^#[0-9a-f]{6}$/i.test(color)) return fallback;
  return Number.parseInt(color.slice(1), 16);
};

class EmberfallScene extends Phaser.Scene {
  private dungeonSignature = '';

  private dungeonFloor?: Phaser.GameObjects.Graphics;

  private dungeonWarnings?: Phaser.GameObjects.Graphics;

  private fieldBossWarnings?: Phaser.GameObjects.Graphics;

  private engine: AdventureEngine;

  private currentFloor?: Phaser.GameObjects.Graphics;

  private get floor(): Phaser.GameObjects.Graphics {
    if (!this.currentFloor) throw new Error('World terrain floor is not available.');
    return this.currentFloor;
  }

  private terrainOrigin = { x: 0, y: 0 };

  private terrainCells = new Map<string, {
    ground: Phaser.GameObjects.TileSprite;
    floor: Phaser.GameObjects.Graphics;
    scenery: Phaser.GameObjects.Image[];
  }>();

  private terrainScenery: Phaser.GameObjects.Image[] = [];

  private visibleCellIds = new Set<string>();
  private cachedWorldProps: WorldProp[] = [];
  private cachedWorldPropsCell = '';
  private worldPropsRefreshedAt = -Infinity;

  private renderedCenterCellId = '';

  private renderedMarchesTide: 'low' | 'high' = 'low';

  private renderedBellSignature = '';

  private colorMatrix!: Phaser.FX.ColorMatrix;

  private hungerCamera!: Phaser.Cameras.Scene2D.Camera;

  private colorProfileSignature = '';

  private propsGraphics!: Phaser.GameObjects.Graphics;

  private actorGraphics!: Phaser.GameObjects.Graphics;

  private effectGraphics!: Phaser.GameObjects.Graphics;

  private playerGraphic!: Phaser.GameObjects.Graphics;

  private attackGraphic!: Phaser.GameObjects.Graphics;

  private playerSprite!: Phaser.GameObjects.Sprite;

  private npcSprites = new Map<string, Phaser.GameObjects.Sprite>();

  private npcShadows = new Map<string, Phaser.GameObjects.Graphics>();

  private propSprites = new Map<string, Phaser.GameObjects.Sprite>();

  private enemySprites = new Map<string, Phaser.GameObjects.Sprite>();

  private enemyMotionPositions = new Map<string, { x: number; y: number }>();

  private enemyShadows = new Map<string, Phaser.GameObjects.Graphics>();

  private enemyHealthBars = new Map<string, Phaser.GameObjects.Graphics>();

  private playerTextureSignature = '';

  private lastPlayerPosition: { x: number; y: number } | null = null;

  private walkCycleMs = 0;

  private lastPlayerDrawTime = 0;

  private cineActive = false;
  private reducedMotion = false;

  private cineCellId = '';

  private cineFx?: Phaser.GameObjects.Graphics;

  private cineShadows?: Phaser.GameObjects.Graphics;

  private cineSprites: Phaser.GameObjects.Sprite[] = [];

  constructor(engine: AdventureEngine) {
    super({ key: 'emberfall' });
    this.engine = engine;
  }

  preload() {
    this.load.spritesheet(
      'emberfall-world-sprites',
      `${import.meta.env.BASE_URL}emberfall-world-sprites.png`,
      { frameWidth: 256, frameHeight: 256 },
    );
    for (const classId of ['warrior', 'rogue', 'adept', 'mage'] as const) {
      this.load.image(
        `hero-class-${classId}`,
        `${import.meta.env.BASE_URL}class-sprites/${classId}.png`,
      );
      this.load.image(
        `hero-attack-${classId}`,
        `${import.meta.env.BASE_URL}class-sprites/${classId}-attack-alpha.png`,
      );
    }
    this.load.image(
      'emberfall-rowan-atlas',
      `${import.meta.env.BASE_URL}emberfall-rowan-atlas.png`,
    );
    this.load.spritesheet(
      'emberfall-world-ground',
      `${import.meta.env.BASE_URL}emberfall-world-ground.png`,
      { frameWidth: 512, frameHeight: 512 },
    );
    this.load.spritesheet(
      'world-character-atlas',
      `${import.meta.env.BASE_URL}emberfall-world-character-atlas.svg`,
      { frameWidth: 128, frameHeight: 144 },
    );
    // Two compact atlases (artwork + palette regions) replace 28 PNG loads.
    const active = this.engine.getState().player;
    const classId = active?.classId ?? 'warrior';
    const bodyType = active?.bodyType ?? 'male';
    this.load.image('hero-modular-active',
      `${import.meta.env.BASE_URL}modular-heroes/${classId}-${bodyType}.png`);
    this.load.image('hero-modular-active-mask',
      `${import.meta.env.BASE_URL}modular-heroes/${classId}-${bodyType}-regions.png`);
    for (const [texture, asset] of Object.entries(SPRITE_ASSETS)) {
      this.load.image(texture, `${import.meta.env.BASE_URL}${asset}`);
    }
  }

  create() {
    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updateMotionPreference = () => { this.reducedMotion = motionPreference.matches; };
    updateMotionPreference();
    motionPreference.addEventListener('change', updateMotionPreference);
    const removeMotionPreferenceListener = () => {
      motionPreference.removeEventListener('change', updateMotionPreference);
    };
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      removeMotionPreferenceListener();
      // Phaser destroys scene display objects at shutdown, but this scene
      // instance is reused on restart. Drop cached references so the ending
      // builds a fresh cinematic actor pool and terrain on its next create.
      this.cineActive = false;
      this.cineCellId = '';
      this.cineFx = undefined;
      this.cineShadows = undefined;
      this.cineSprites = [];
      this.terrainCells.clear();
      this.terrainScenery = [];
      this.visibleCellIds.clear();
      this.renderedCenterCellId = '';
      this.renderedBellSignature = '';
      this.renderedMarchesTide = 'low';
      this.currentFloor = undefined;
      this.terrainOrigin = { x: 0, y: 0 };
      this.dungeonSignature = '';
      this.dungeonFloor = undefined;
      this.dungeonWarnings = undefined;
      this.colorProfileSignature = '';
      this.playerTextureSignature = '';
      this.lastPlayerPosition = null;
      this.walkCycleMs = 0;
      this.lastPlayerDrawTime = 0;
      this.npcSprites.clear();
      this.npcShadows.clear();
      this.propSprites.clear();
      this.enemySprites.clear();
      this.enemyShadows.clear();
      this.enemyHealthBars.clear();
    });
    this.events.once(Phaser.Scenes.Events.DESTROY, removeMotionPreferenceListener);
    this.propsGraphics = this.add.graphics().setDepth(-10);
    this.actorGraphics = this.add.graphics().setDepth(8);
    this.effectGraphics = this.add.graphics().setDepth(20);
    this.playerGraphic = this.add.graphics().setDepth(10);
    this.attackGraphic = this.add.graphics().setDepth(11);
    const initialPlayer = this.engine.getState().player;
    if (initialPlayer) this.createPlayerTextures(initialPlayer);
    this.createRowanTextures();
    this.playerSprite = this.add.sprite(
      0,
      0,
      initialPlayer ? heroTextureKey(initialPlayer.facing) : 'emberfall-world-sprites',
      0,
    )
      .setOrigin(0.5)
      .setDisplaySize(88, 88)
      .setDepth(12);
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.cameras.main.setRoundPixels(true);
    this.colorMatrix = this.cameras.main.postFX.addColorMatrix();
    this.hungerCamera = this.cameras.add(
      0,
      0,
      this.scale.width,
      this.scale.height,
      false,
      'first-hunger-vivid',
    );
    this.hungerCamera.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.hungerCamera.setRoundPixels(true);
    this.hungerCamera.setVisible(false);
    const resizeHungerCamera = (gameSize: Phaser.Structs.Size) => {
      this.hungerCamera.setSize(gameSize.width, gameSize.height);
    };
    this.scale.on('resize', resizeHungerCamera);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off('resize', resizeHungerCamera);
    });
    if (this.engine.getWorldProgress().activeDungeon) this.drawDungeon();
    else this.drawWorldMap(initialPlayer?.x ?? 0, initialPlayer?.y ?? 0);
  }

  private createRowanTextures() {
    const atlas = this.textures.get('emberfall-rowan-atlas').getSourceImage() as CanvasImageSource;
    for (const facing of ['down', 'up', 'left', 'right'] as const) {
      const key = `emberfall-rowan-${facing}`;
      const frame = cropDirectionalSpriteFrame(atlas, facing);
      if (this.textures.exists(key)) this.textures.remove(key);
      const texture = this.textures.addCanvas(key, frame);
      if (!texture) throw new Error(`Could not create the ${facing}-facing Elder Rowan sprite.`);
    }
    for (const variant of CINE_VILLAGER_VARIANTS) {
      if (variant === 'rowan') continue;
      const src = this.textures.get(`hero-class-${variant}`).getSourceImage() as CanvasImageSource;
      for (const facing of ['down', 'up', 'left', 'right'] as const) {
        const key = `cine-villager-${variant}-${facing}`;
        if (this.textures.exists(key)) this.textures.remove(key);
        this.textures.addCanvas(key, cropDirectionalSpriteFrame(src, facing));
      }
    }
    const maelisAtlas = this.textures.get('hero-class-adept').getSourceImage() as CanvasImageSource;
    for (const facing of ['down', 'up', 'left', 'right'] as const) {
      const key = `emberfall-maelis-${facing}`;
      if (this.textures.exists(key)) this.textures.remove(key);
      const texture = this.textures.addCanvas(key, cropDirectionalSpriteFrame(maelisAtlas, facing));
      if (!texture) throw new Error(`Could not create Maelis's ${facing}-facing sprite.`);
    }
  }

  private createPlayerTextures(player: PlayerState) {
    const signature = [
      player.classId, player.bodyType ?? 'male',
      player.skin,
      player.hairStyle,
      player.hairColor,
      player.clothingColor,
      player.eyeColor, player.trimColor, player.clothingSecondary, player.leatherColor, player.metalColor, player.facialHair, player.headwear,
    ].join('|');
    if (signature === this.playerTextureSignature) return;
    const atlas = this.textures.get(`hero-class-${player.classId}`).getSourceImage() as CanvasImageSource;
    const attackAtlas = this.textures.get(`hero-attack-${player.classId}`).getSourceImage() as CanvasImageSource;
    const modularAtlas = this.textures.get('hero-modular-active').getSourceImage() as CanvasImageSource;
    const modularMask = this.textures.get('hero-modular-active-mask').getSourceImage() as CanvasImageSource;
    const poses: HeroPose[] = ['idle', ...HERO_WALK_POSES, 'attack'];
    for (const facing of ['down', 'up', 'left', 'right'] as const) {
      for (const pose of poses) {
        const isAttack = pose === 'attack';
        const frame = createCustomizedHeroFrame(isAttack ? attackAtlas : atlas,
          facing, player, { pose, ...(isAttack ? {} : { modularAtlas, modularMask }) });
        const key = heroTextureKey(facing, pose);
        if (this.textures.exists(key)) this.textures.remove(key);
        const texture = this.textures.addCanvas(key, frame);
        if (!texture) throw new Error(`Could not create the ${facing}-facing ${pose} hero sprite.`);
      }
    }
    this.playerTextureSignature = signature;
  }

  update(_time: number, delta: number) {
    const state = this.engine.getState();
    const player = state.player;
    if (!player) return;
    this.engine.tick(delta);
    const fresh = this.engine.getState();
    const hero = fresh.player;
    if (!hero) return;
    const worldProgress = this.engine.getWorldProgress();
    const cinematic = this.engine.getRestorationPresentation();
    const colorProfile = cinematic?.replay
      ? getWorldColorProfile({ ...worldProgress, colorsRestored: false,
        finale: { ...worldProgress.finale, stage: 'restoring', restorationMs: cinematic.ms } })
      : getWorldColorProfile(worldProgress);
    this.applyWorldColorProfile(colorProfile);
    this.createPlayerTextures(hero);
    if (cinematic) {
      this.updateCinematic(cinematic.ms, cinematic.allied, fresh);
      return;
    }
    if (this.cineActive) this.endCinematic();
    const cellId = worldCellAt(hero.x, hero.y)?.id ?? '';
    const bellSignature = worldProgress.silencedBells.join('|');
    if (bellSignature !== this.renderedBellSignature) {
      for (const terrain of this.terrainCells.values()) {
        terrain.floor.destroy();
        terrain.ground.destroy();
        terrain.scenery.forEach((sprite) => sprite.destroy());
      }
      this.terrainCells.clear();
      this.renderedCenterCellId = '';
    }
    const dungeonVisit = worldProgress.activeDungeon;
    if (dungeonVisit) this.drawDungeon();
    else if (this.dungeonSignature) {
      this.dungeonFloor?.destroy(); this.dungeonWarnings?.destroy();
      this.dungeonFloor = undefined; this.dungeonWarnings = undefined;
      this.dungeonSignature = ''; this.renderedCenterCellId = '';
      this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
      this.cameras.main.setBackgroundColor('#718c5b');
      this.drawWorldMap(hero.x, hero.y);
    }
    else if (cellId && cellId !== this.renderedCenterCellId) this.drawWorldMap(hero.x, hero.y);
    else {
      const tide = worldProgress.marchesTide;
      if (tide !== this.renderedMarchesTide) {
        for (const terrain of this.terrainCells.values()) {
          terrain.floor.destroy();
          terrain.ground.destroy();
          terrain.scenery.forEach((sprite) => sprite.destroy());
        }
        this.terrainCells.clear();
        this.renderedCenterCellId = '';
        this.drawWorldMap(hero.x, hero.y);
      }
    }
    const refreshProps = Boolean(dungeonVisit) || this.cachedWorldPropsCell !== cellId ||
      this.time.now - this.worldPropsRefreshedAt >= 100;
    if (refreshProps) {
      this.cachedWorldProps = this.engine.getProps();
      this.cachedWorldPropsCell = cellId;
      this.worldPropsRefreshedAt = this.time.now;
    }
    const halfW = this.cameras.main.width / (2 * this.cameras.main.zoom) + WORLD_CELL_WIDTH / 2;
    const halfH = this.cameras.main.height / (2 * this.cameras.main.zoom) + WORLD_CELL_HEIGHT / 2;
    const near = (x: number, y: number) => Math.abs(x - hero.x) < halfW && Math.abs(y - hero.y) < halfH;
    const visibleProps = this.cachedWorldProps.filter((prop) => dungeonVisit ||
      (this.visibleCellIds.has(worldCellAt(prop.x, prop.y)?.id ?? '') && near(prop.x, prop.y)));
    if (refreshProps) this.drawWorldProps(visibleProps, fresh.roomId, fresh.keyFound, fresh.gateOpen);
    this.drawPlayer(hero, this.time.now, this.engine.getAttackAnimation());
    const visibleEnemies = this.engine.getEnemies().filter((actor) => {
      if (dungeonVisit) return true;
      const enemyCellId = worldCellAt(actor.x, actor.y)?.id;
      return Boolean(enemyCellId && this.visibleCellIds.has(enemyCellId) && near(actor.x, actor.y));
    });
    this.drawEnemies(visibleEnemies);
    this.drawEffects(this.engine.getProjectiles(), this.engine.getEffects());
    this.drawFieldBossWarnings(dungeonVisit ? [] : visibleEnemies);
    if (dungeonVisit) this.drawDungeonWarnings(visibleEnemies);
    this.cameras.main.centerOn(hero.x, hero.y);
    this.hungerCamera.centerOn(hero.x, hero.y);
    this.updateSelectiveBossRendering(visibleEnemies, colorProfile.saturation);
  }

  private updateCinematic(
    ms: number,
    allied: boolean | null,
    fresh: ReturnType<AdventureEngine['getState']>,
  ) {
    const shot = getRestorationShot(ms);
    const wantedId = shot.id === 'companions' && !allied ? MAELIS_HUB : shot.cellId;
    const cell = WORLD_CELLS.find((c) => c.id === wantedId && c.contentReady);
    if (!cell) throw new Error(`Missing authored cinematic location: ${wantedId}`);
    if (!this.cineActive) {
      this.cineActive = true;
      // A replay can start inside a dungeon. Its floor and warnings are
      // presentation objects; rebuild them at the saved room on return.
      this.dungeonFloor?.destroy();
      this.dungeonWarnings?.destroy();
      this.dungeonFloor = undefined;
      this.dungeonWarnings = undefined;
      this.dungeonSignature = '';
      this.cineFx = this.add.graphics().setDepth(900);
      this.cineShadows = this.add.graphics().setDepth(-90);
      this.cameras.main.ignore(this.cineFx);
      for (let i = 0; i < CINE_POOL; i++) {
        this.cineSprites.push(this.add.sprite(0, 0, 'world-character-atlas', 7).setVisible(false));
      }
      this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
      this.cameras.main.setBackgroundColor('#718c5b');
    }
    if (this.cineCellId !== cell.id) {
      this.cineCellId = cell.id;
      this.clearTerrainCells();
      this.drawWorldMap(cell.x + WORLD_CELL_WIDTH / 2, cell.y + WORLD_CELL_HEIGHT / 2);
    }
    // Hide the live hero and every simulation actor; the saved hero is untouched.
    this.playerSprite.setVisible(false);
    this.playerGraphic.clear();
    this.attackGraphic.clear();
    this.drawWorldProps([], fresh.roomId, fresh.keyFound, fresh.gateOpen);
    this.drawEnemies([]);
    this.drawEffects([], []);

    const local = ms - shot.startMs;
    const { px, py, zoom, shake, alpha } = cinematicCamera(shot.id, local, shot.durationMs, this.reducedMotion);
    for (const cam of [this.cameras.main, this.hungerCamera]) {
      cam.setZoom(zoom);
      cam.centerOn(cell.x + WORLD_CELL_WIDTH / 2 + px + shake, cell.y + WORLD_CELL_HEIGHT / 2 + py);
      cam.setAlpha(alpha);
    }
    this.hungerCamera.setVisible(true);

    const { actors, stones } = cinematicActors(shot.id, local, shot.durationMs, allied, this.reducedMotion);
    const shadows = this.cineShadows!.clear();
    let vividHunger: Phaser.GameObjects.Sprite | undefined;
    this.cineSprites.forEach((sprite, i) => {
      const a = actors[i];
      if (!a) { sprite.setVisible(false); return; }
      const wx = cell.x + a.x; const wy = cell.y + a.y;
      let size = { w: 64, h: 76 };
      if (a.role === 'hunger') {
        sprite.setTexture('world-character-atlas', 7); size = { w: 230, h: 260 };
        vividHunger = sprite;
        this.cameras.main.ignore(sprite);
      } else if (a.role === 'hero') {
        sprite.setTexture(heroTextureKey(a.facing, a.walking ? walkPoseAtTime(local) : 'idle')); size = { w: 88, h: 88 };
      } else if (a.role === 'maelis') {
        sprite.setTexture(`emberfall-maelis-${a.facing}`); size = { w: 80, h: 92 };
      } else {
        const v = CINE_VILLAGER_VARIANTS[a.variant % CINE_VILLAGER_VARIANTS.length];
        sprite.setTexture(v === 'rowan' ? `emberfall-rowan-${a.facing}` : `cine-villager-${v}-${a.facing}`);
      }
      const bob = a.walking && !this.reducedMotion ? Math.abs(Math.sin(local / 120 + i)) * 4 : 0;
      if (a.role !== 'hunger') sprite.cameraFilter &= ~this.cameras.main.id;
      sprite.setVisible(true).setAlpha(a.alpha).setRotation(a.rot)
        .setDisplaySize(size.w * a.scale, size.h * a.scale * a.squash)
        .setPosition(wx, wy - a.hop - bob).setDepth(wy + 30);
      if (a.role !== 'hunger') {
        shadows.fillStyle(0x27362d, 0.4).fillEllipse(wx, wy + 30, 40 * a.scale, 12);
      }
    });
    if (this.cineFx) {
      drawCinematicFx(this.cineFx, shot.id, local, shot.durationMs, shot.tint,
        cell.x, cell.y, allied, stones.map((s) => ({ x: s.x, y: s.y })), this.reducedMotion);
      this.cineFx.cameraFilter &= ~this.hungerCamera.id;
      if (vividHunger) vividHunger.cameraFilter &= ~this.hungerCamera.id;
      this.hungerCamera.ignore(this.children.list.filter((child) => child !== this.cineFx && child !== vividHunger));
    }
  }

  private clearTerrainCells() {
    for (const terrain of this.terrainCells.values()) {
      terrain.floor.destroy();
      terrain.ground.destroy();
      terrain.scenery.forEach((sprite) => sprite.destroy());
    }
    this.terrainCells.clear();
  }

  private isCinematicSettlement(cellId: string) {
    return this.cineActive && cellId === this.cineCellId && CINE_SETTLEMENTS[cellId] !== undefined;
  }

  // Cinematic-only set dressing for the regional shots: original house, well
  // and pillar art around a cleared plaza. Lives and dies with the cell's
  // terrain objects, so it is bounded (2 houses, 1 well, <=2 pillars).
  private drawCinematicDressing(cellId: string) {
    const f = CINE_SETTLEMENTS[cellId];
    if (cellId === 'cinderwatch-approach') {
      this.drawCinderwatchCamp();
      return;
    }
    const g = this.floor;
    g.fillStyle(f.plaza, 0.95).fillEllipse(325, 272, 380, 200);
    g.lineStyle(3, 0x6f5d44, 0.5).strokeEllipse(325, 272, 372, 192);
    g.fillStyle(0x6f5d44, 0.35).fillRect(300, 165, 50, 30);
    const ox = this.terrainOrigin.x;
    const oy = this.terrainOrigin.y;
    this.addWorldSprite(9, ox + 125, oy + 95, 200, 140, oy + 146, f.tint);
    if (f.ruin) {
      this.drawPillar(560, 120);
      this.drawPillar(520, 175);
    } else {
      this.addWorldSprite(9, ox + 515, oy + 95, 198, 140, oy + 146, f.tint);
    }
    this.addWorldSprite(10, ox + 558, oy + 372, 66, 66, oy + 388, f.tint);
    this.drawLantern(190, 190, f.lantern);
    this.drawLantern(460, 345, f.lantern);
  }

  private endCinematic() {
    this.clearTerrainCells();
    this.cineActive = false;
    this.cineCellId = '';
    this.cineFx?.destroy();
    this.cineShadows?.destroy();
    this.cineFx = undefined;
    this.cineShadows = undefined;
    this.cineSprites.forEach((sprite) => sprite.destroy());
    this.cineSprites = [];
    for (const cam of [this.cameras.main, this.hungerCamera]) { cam.setZoom(1); cam.setAlpha(1); }
    this.playerSprite.setVisible(true);
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.renderedCenterCellId = '';
  }

  private applyWorldColorProfile(profile: ReturnType<typeof getWorldColorProfile>) {
    const signature = profile.saturation.toFixed(2);
    if (signature === this.colorProfileSignature) return;
    this.colorProfileSignature = signature;

    this.colorMatrix.saturate(getColorMatrixSaturationAdjustment(profile.saturation));
  }

  private updateSelectiveBossRendering(actors: EnemyActor[], saturation: number) {
    const hunger = actors.find((actor) =>
      actor.id === 'first-hunger-sanctum:first-hunger' ||
      actor.name.toLowerCase().includes('first hunger'));
    const hungerSprite = hunger ? this.enemySprites.get(hunger.id) : undefined;
    const renderCameras = getFirstHungerRenderCameras(saturation, Boolean(hungerSprite));
    this.hungerCamera.setVisible(renderCameras.vividCamera);
    if (!hungerSprite) return;

    if (!renderCameras.worldCamera) this.cameras.main.ignore(hungerSprite);
    else hungerSprite.cameraFilter &= ~this.cameras.main.id;
    hungerSprite.cameraFilter &= ~this.hungerCamera.id;
    this.hungerCamera.ignore(
      this.children.list.filter((child) => child !== hungerSprite),
    );
  }

  private drawWorldMap(playerX: number, playerY: number) {
    const center = worldCellAt(playerX, playerY);
    if (!center) return;
    this.renderedCenterCellId = center.id;
    const unlockedRegions = this.engine.getWorldProgress().unlockedRegions;
    const silencedBells = this.engine.getWorldProgress().silencedBells;
    this.renderedBellSignature = silencedBells.join('|');
    this.renderedMarchesTide = this.engine.getWorldProgress().marchesTide;
    const nearby = WORLD_CELLS.filter((cell) =>
      cell.contentReady &&
      Math.abs(cell.x - center.x) <= WORLD_CELL_WIDTH &&
      Math.abs(cell.y - center.y) <= WORLD_CELL_HEIGHT);
    const nearbyIds = new Set(nearby.map((cell) => cell.id));
    this.visibleCellIds = nearbyIds;

    for (const [cellId, terrain] of this.terrainCells) {
      if (nearbyIds.has(cellId)) continue;
      terrain.floor.destroy();
      terrain.ground.destroy();
      terrain.scenery.forEach((sprite) => sprite.destroy());
      this.terrainCells.delete(cellId);
    }
    for (const cell of nearby) {
      if (this.terrainCells.has(cell.id)) continue;
      this.drawTerrain(cell.roomId, cell.x, cell.y, cell.id, unlockedRegions, silencedBells);
    }
  }

  private drawDungeon() {
    const world = this.engine.getWorldProgress();
    const visit = world.activeDungeon!;
    const room = dungeonRoomAt(visit.id, this.engine.getState().player!.x, this.engine.getState().player!.y)!;
    const progress = world.dungeons[visit.id];
    const signature = `${visit.id}/${room.id}/${progress.doorOpen}`;
    if (signature === this.dungeonSignature) return;
    this.dungeonSignature = signature;
    for (const terrain of this.terrainCells.values()) {
      terrain.floor.destroy(); terrain.ground.destroy();
      terrain.scenery.forEach((sprite) => sprite.destroy());
    }
    this.terrainCells.clear(); this.visibleCellIds.clear();
    this.dungeonFloor?.destroy();
    const g = this.add.graphics().setDepth(-100);
    this.dungeonFloor = g;
    this.cameras.main.setBounds(0, 0, DUNGEON_COLUMNS * WORLD_CELL_WIDTH, DUNGEON_ROWS * WORLD_CELL_HEIGHT);
    this.cameras.main.setBackgroundColor('#000000');
    const { x, y } = dungeonRoomOrigin(room);
    const lairTone = visit.id === 'hunger-ossuary' ? 0x493d3c
      : visit.id === 'hunger-parallax' ? 0x36434f : visit.id === 'hunger-heart' ? 0x49303d
        : visit.id === 'marches-chimecrypt' ? 0x393247 : visit.id === 'marches-floodvault' ? 0x344240 : 0x303039;
    g.fillStyle(lairTone).fillRect(x, y, WORLD_CELL_WIDTH, WORLD_CELL_HEIGHT);
    for (let row = 0; row < 15; row++) for (let col = 0; col < 20; col++) {
      g.lineStyle(1, 0x707078, 0.24).strokeRect(x + col * 32, y + row * 32, 32, 32);
    }
    g.fillStyle(0x8a8580, 0.2).fillRect(x + 20, y + 213, 600, 54)
      .fillRect(x + 294, y + 20, 52, 440);
    g.fillStyle(0x17171b).fillRect(x, y, 640, 18).fillRect(x, y + 462, 640, 18)
      .fillRect(x, y, 18, 480).fillRect(x + 622, y, 18, 480);
    for (const edge of ['north', 'south', 'east', 'west'] as const) {
      const passage = dungeonPassageState(visit.id, room, edge, progress);
      if (passage === 'wall') continue;
      g.fillStyle(passage === 'locked' ? 0x987549 : 0xa9a29a);
      if (edge === 'north' || edge === 'south') g.fillRect(x + 270, y + (edge === 'north' ? 0 : 462), 100, 18);
      else g.fillRect(x + (edge === 'west' ? 0 : 622), y + 200, 18, 80);
    }
    g.fillStyle(0x55545a).fillRect(x + 82, y + 78, 98, 64).fillRect(x + 460, y + 336, 92, 68);
    // Room-specific set dressing, kept away from all routes and interaction points.
    g.fillStyle(room.feature === 'boss' ? 0x976443 : 0x898185, 0.7);
    for (let i = 0; i < 4; i++) g.fillCircle(x + 210 + i * 60, y + 330, room.feature === 'boss' ? 12 : 5);
  }

  private drawDungeonWarnings(enemies: EnemyActor[]) {
    const g = this.dungeonWarnings ??= this.add.graphics().setDepth(7);
    g.clear();
    for (const enemy of enemies) {
      const mark = enemy.telegraph;
      if (!mark) continue;
      const room = dungeonRoomAt(this.engine.getWorldProgress().activeDungeon!.id, enemy.x, enemy.y)!;
      const origin = dungeonRoomOrigin(room);
      g.fillStyle(0xff9955, 0.3).lineStyle(3, 0xffce83, 0.9);
      if (mark.pattern === 'circle') g.fillCircle(mark.x, mark.y, 92).strokeCircle(mark.x, mark.y, 92);
      else if (mark.pattern === 'ring') {
        // A stroked annulus leaves the advertised quiet center unmarked.
        g.lineStyle(86, 0xff9955, 0.3).strokeCircle(mark.x, mark.y, 95);
        g.lineStyle(3, 0xffce83, 0.9).strokeCircle(mark.x, mark.y, 52).strokeCircle(mark.x, mark.y, 138);
      } else if (mark.pattern === 'horizontal') g.fillRect(origin.x + 18, mark.y - 36, 604, 72);
      else if (mark.pattern === 'vertical') g.fillRect(mark.x - 36, origin.y + 18, 72, 444);
      else if (mark.pattern === 'swing') {
        const angle = Math.atan2(mark.y - enemy.y, mark.x - enemy.x);
        const radius = 138;
        const left = { x: enemy.x + Math.cos(angle - Math.PI / 4) * radius,
          y: enemy.y + Math.sin(angle - Math.PI / 4) * radius };
        const right = { x: enemy.x + Math.cos(angle + Math.PI / 4) * radius,
          y: enemy.y + Math.sin(angle + Math.PI / 4) * radius };
        g.fillTriangle(enemy.x, enemy.y, left.x, left.y, right.x, right.y);
        g.lineStyle(3, 0xffce83, 0.95)
          .lineBetween(enemy.x, enemy.y, left.x, left.y)
          .lineBetween(enemy.x, enemy.y, right.x, right.y);
        g.lineStyle(8, 0xff9955, 0.45);
        for (let segment = 0; segment < 10; segment += 1) {
          const a = angle - Math.PI / 4 + (segment / 10) * Math.PI / 2;
          const b = angle - Math.PI / 4 + ((segment + 1) / 10) * Math.PI / 2;
          g.lineBetween(enemy.x + Math.cos(a) * radius, enemy.y + Math.sin(a) * radius,
            enemy.x + Math.cos(b) * radius, enemy.y + Math.sin(b) * radius);
        }
      }
      else {
        g.fillRect(origin.x + 18, mark.y - 28, 604, 56)
          .fillRect(mark.x - 28, origin.y + 18, 56, 444);
      }
    }
  }

  private drawFieldBossWarnings(enemies: EnemyActor[]) {
    const g = this.fieldBossWarnings ??= this.add.graphics().setDepth(7);
    g.clear();
    for (const enemy of enemies) {
      const mark = enemy.telegraph;
      if (!enemy.boss || mark?.pattern !== 'swing') continue;
      const angle = Math.atan2(mark.y - enemy.y, mark.x - enemy.x);
      const radius = 138;
      const left = { x: enemy.x + Math.cos(angle - Math.PI / 4) * radius,
        y: enemy.y + Math.sin(angle - Math.PI / 4) * radius };
      const right = { x: enemy.x + Math.cos(angle + Math.PI / 4) * radius,
        y: enemy.y + Math.sin(angle + Math.PI / 4) * radius };
      g.fillStyle(0xff9955, 0.3).lineStyle(3, 0xffce83, 0.9)
        .fillTriangle(enemy.x, enemy.y, left.x, left.y, right.x, right.y)
        .lineBetween(enemy.x, enemy.y, left.x, left.y)
        .lineBetween(enemy.x, enemy.y, right.x, right.y);
      g.lineStyle(8, 0xff9955, 0.45);
      for (let segment = 0; segment < 10; segment += 1) {
        const a = angle - Math.PI / 4 + (segment / 10) * Math.PI / 2;
        const b = angle - Math.PI / 4 + ((segment + 1) / 10) * Math.PI / 2;
        g.lineBetween(enemy.x + Math.cos(a) * radius, enemy.y + Math.sin(a) * radius,
          enemy.x + Math.cos(b) * radius, enemy.y + Math.sin(b) * radius);
      }
    }
  }

  private drawTerrain(
    room: RoomId,
    offsetX: number,
    offsetY: number,
    cellId: string,
    unlockedRegions: readonly WorldRegionId[],
    silencedBells: readonly WorldRegionId[],
  ) {
    const marchesTide = this.engine.getWorldProgress().marchesTide;
    const colors: Record<RoomId, { base: number; light: number; dark: number; path: number }> = {
      village: { base: 0x7e9c64, light: 0x879f6b, dark: 0x708b5a, path: 0xd0ae75 },
      woodland: { base: 0x527648, light: 0x5e804d, dark: 0x486c43, path: 0xc4a46d },
      ruins: { base: 0x716854, light: 0x7a705c, dark: 0x655d4e, path: 0x93836a },
      sanctum: { base: 0x48414a, light: 0x534b52, dark: 0x413a43, path: 0x696052 },
      chapel: { base: 0x46585c, light: 0x647775, dark: 0x35494e, path: 0x99917a },
    };
    const cellRegion = worldCellAt(offsetX, offsetY)?.regionId;
    const palette = room === 'chapel'
      ? { base: 0x46585c, light: 0x647775, dark: 0x35494e, path: 0x99917a }
      : cellRegion === 'drowned-marches'
        ? { base: 0x54786d, light: 0x638579, dark: 0x45685f, path: 0x9c9a78 }
        : cellRegion === 'ashen-peaks'
          ? { base: 0x625b5d, light: 0x8b7773, dark: 0x403e45, path: 0xb58b70 }
        : cellRegion === 'first-hunger'
          ? { base: 0x49424f, light: 0x897b92, dark: 0x332c3b, path: 0xa69a8d }
        : cellRegion === 'fallen-capital'
          ? { base: 0x625d59, light: 0x77716b, dark: 0x403d3b, path: 0x938b80 }
        : colors[room];
    const regionId = cellRegion ?? 'hearthglen';
    const cellSeed = cellId.split('').reduce((value, letter) => value + letter.charCodeAt(0), 0);
    this.terrainOrigin = { x: offsetX, y: offsetY };
    const groundFrame = cellRegion === 'fallen-capital' ? 3
      : cellId === 'mournwater-town'
      ? 1
      : room === 'village' ? 0 : room === 'woodland' ? 1 : 3;
    const baseTint = room === 'sanctum' ? 0xcab9a6
      : cellRegion === 'drowned-marches' ? 0x8fb7ac
        : cellRegion === 'ashen-peaks' ? 0xc6a49a
          : cellRegion === 'first-hunger' ? 0xb4a0c2
            : cellRegion === 'fallen-capital' ? 0xb8b2aa : 0xffffff;
    const ground = this.add.tileSprite(offsetX, offsetY, WORLD_CELL_WIDTH, WORLD_CELL_HEIGHT, 'emberfall-world-ground', groundFrame)
      .setOrigin(0)
      .setTileScale(1.25)
      .setTint(baseTint)
      .setDepth(-120);
    this.currentFloor = this.add.graphics().setPosition(offsetX, offsetY).setDepth(-100);
    this.terrainScenery = [];
    this.terrainCells.set(cellId, { ground, floor: this.floor, scenery: this.terrainScenery });
    for (let y = 0; y < WORLD_CELL_HEIGHT; y += 32) {
      for (let x = 0; x < WORLD_CELL_WIDTH; x += 32) {
        const seed = (Math.imul(x + offsetX + 17, 73856093) ^ Math.imul(y + offsetY + 31, 19349663) ^ Math.imul(room.length + cellSeed, 83492791)) >>> 0;
        const markX = x + 4 + (seed % 23);
        const markY = y + 4 + ((seed >>> 7) % 23);
        if ((room === 'ruins' || room === 'sanctum') && seed % 7 === 0) {
          this.floor.fillStyle(palette.dark, 0.22);
          this.floor.fillCircle(markX, markY, 2);
          this.floor.fillCircle(markX + 4, markY + 2, 1);
        } else if (room !== 'ruins' && room !== 'sanctum' && seed % 5 === 0) {
          this.floor.fillStyle(palette.light, 0.32);
          this.floor.fillCircle(markX, markY, seed % 2 === 0 ? 1.5 : 1);
        }
        const detailRoom = regionId === 'fallen-capital'
          ? 'ruins'
          : cellId === 'mournwater-town' ? 'woodland' : room;
        this.drawGroundDetail(detailRoom, x, y, seed, regionId);
      }
    }
    if (room === 'village') {
      if (cellId === 'mournwater-town') {
        this.drawMournwaterTown();
      } else {
        this.drawCellTrail(cellId, 0x88714d, palette.path, marchesTide);
        this.drawHouse(50, 52, 172, 110, 0x934f3d, 0xe2bd82);
        this.drawHouse(420, 52, 168, 110, 0x69775a, 0xdfbd7e);
        this.drawWell(510, 328);
        this.drawLantern(267, 302);
        this.drawLantern(375, 196);
      }
    } else if (room === 'woodland') {
      if (regionId === 'fallen-capital') {
        this.drawCapitalRuins(cellId);
        if (cellId === 'capital-survivors-hold') this.drawCapitalStronghold();
      } else {
        this.drawCellTrail(cellId, 0x88714d, palette.path, marchesTide);
      }
      if (regionId === 'fallen-capital') {
        // The Capital is an abandoned city, not another forest biome.
      } else if (regionId === 'ashen-peaks') {
        if (cellId === 'cinderwatch-approach') {
          if (!this.isCinematicSettlement(cellId)) this.drawCinderwatchCamp();
        } else {
          for (const [x, y] of [
            [74, 78], [552, 80], [84, 174], [558, 164], [96, 420], [535, 418], [192, 86], [458, 365],
          ] as const) {
            this.drawPillar(x, y);
          }
          this.drawLantern(128, 357, 0xff9b69);
        }
      } else if (regionId !== 'first-hunger') {
        const treePositions = [
          [48, 78, 1.1], [160, 67, 0.8], [536, 72, 1.08], [84, 170, 0.92], [566, 160, 1.1],
          [186, 356, 0.85], [453, 101, 0.84], [88, 427, 1.02], [514, 426, 0.9],
          [206, 137, 0.65], [412, 330, 0.75], [112, 310, 0.78], [562, 349, 0.82],
        ] as const;
        for (const [x, y, s] of treePositions) {
          if (this.isCinematicSettlement(cellId) && x > 100 && x < 540) continue;
          if (cellId === 'northwood' && [[412, 330], [514, 426], [562, 349]].some(([tx, ty]) => x === tx && y === ty)) continue;
          this.drawTree(x, y, s);
        }
        this.drawLantern(128, 357);
      }
      if (regionId === 'drowned-marches') {
        this.drawMarchesTide(cellId, this.engine.getWorldProgress().marchesTide);
      }
      if (cellId === 'canopy') {
        this.floor.fillStyle(0x514d45, 1);
        this.floor.fillRect(598, 0, 42, WORLD_CELL_HEIGHT);
        this.floor.fillStyle(0x817663, 1);
        for (let y = 8; y < WORLD_CELL_HEIGHT; y += 42) {
          const ledge = (y / 42) % 2 === 0 ? 0 : 8;
          this.floor.fillRect(584 + ledge, y, 56 - ledge, 7);
          this.floor.fillStyle(0x3e4638, 0.75);
          this.floor.fillRect(594 + ledge, y + 8, 8, 22);
          this.floor.fillStyle(0x817663, 1);
        }
      }
    } else if (room === 'ruins') {
      this.floor.fillStyle(0x5f5547, 0.95);
      this.floor.fillRect(0, 212, WORLD_CELL_WIDTH, 56);
      this.floor.fillRect(288, 46, 64, 388);
      this.floor.fillStyle(palette.path, 0.82);
      this.floor.fillRect(0, 216, WORLD_CELL_WIDTH, 48);
      this.floor.fillRect(292, 46, 56, 388);
      this.floor.fillStyle(0x9b8768, 0.36);
      this.floor.fillRect(0, 221, 292, 3);
      this.floor.fillRect(298, 62, 3, 344);
      this.floor.fillStyle(0x5a554b, 1);
      this.floor.fillRect(66, 42, 204, 20);
      this.floor.fillRect(370, 42, 204, 20);
      this.floor.fillRect(46, 42, 20, 158);
      this.floor.fillRect(46, 280, 20, 158);
      this.floor.fillRect(574, 42, 20, 158);
      this.floor.fillRect(574, 280, 20, 158);
      this.floor.fillRect(66, 420, 204, 20);
      this.floor.fillRect(370, 420, 204, 20);
      this.floor.fillStyle(0x91816b, 1);
      this.floor.fillRect(248, 28, 144, 33);
      this.floor.fillStyle(0x575047, 1);
      this.floor.fillRect(274, 35, 92, 10);
      for (let y = 95; y < 240; y += 37) {
        this.drawPillar(99, y);
        this.drawPillar(541, y);
      }
      this.drawLantern(187, 160, 0xf2b75b);
      this.drawLantern(453, 160, 0xf2b75b);
    } else if (room === 'chapel') {
      const sealOpen = this.engine.getWorldProgress().chapelGateOpen;
      this.floor.fillStyle(0x293b40, 0.98);
      this.floor.fillRect(52, 48, 536, 386);
      this.floor.fillStyle(0x6c7770, 0.9);
      this.floor.fillRect(64, 58, 512, 360);
      this.floor.fillStyle(0x7e8276, 0.82);
      this.floor.fillRect(286, 0, 68, 238);
      this.floor.fillRect(292, 0, 56, 238);
      if (sealOpen) {
        this.floor.fillStyle(0x526367, 0.88);
        this.floor.fillRect(72, 220, 206, 30);
        this.floor.fillRect(362, 220, 206, 30);
        this.floor.fillStyle(0x82765f, 0.95);
        this.floor.fillRect(78, 214, 200, 8);
        this.floor.fillRect(362, 214, 200, 8);
        this.floor.fillRect(78, 250, 200, 8);
        this.floor.fillRect(362, 250, 200, 8);
      } else {
        this.floor.fillStyle(0x526367, 0.88);
        this.floor.fillRect(72, 220, 496, 30);
        this.floor.fillStyle(0x82765f, 0.95);
        this.floor.fillRect(78, 214, 484, 8);
        this.floor.fillRect(78, 250, 484, 8);
      }
      this.floor.fillStyle(0x899083, 0.92);
      for (const x of [82, 558]) {
        this.floor.fillRect(x - 11, 62, 22, 332);
        for (const y of [104, 198, 302, 378]) {
          this.floor.fillRect(x - 19, y - 6, 38, 12);
          this.floor.fillStyle(0x4c5c5d, 1);
          this.floor.fillRect(x - 14, y + 6, 28, 7);
          this.floor.fillStyle(0x899083, 0.92);
        }
      }
      this.floor.fillStyle(0x3e676d, 0.46);
      this.floor.fillEllipse(166, 322, 110, 22);
      this.floor.fillEllipse(476, 322, 88, 17);
      this.floor.fillStyle(0x91bab0, 0.45);
      this.floor.fillEllipse(160, 318, 46, 5);
      this.floor.fillEllipse(472, 319, 36, 4);
      this.floor.fillStyle(0x81745d, 0.94);
      this.floor.fillRect(272, 278, 96, 14);
      this.floor.fillStyle(0xc0ac7e, 0.8);
      this.floor.fillRect(280, 270, 80, 7);
      this.floor.lineStyle(2, 0xb9aa83, 0.55);
      this.floor.strokeRect(172, 86, 296, 112);
      this.drawLantern(128, 186, 0xa5d2d0);
      this.drawLantern(512, 186, 0xa5d2d0);
      this.drawPillar(178, 296);
      this.drawPillar(462, 296);
    } else {
      this.floor.fillStyle(0x564c50, 1);
      this.floor.fillRect(26, 28, 32, 425);
      this.floor.fillRect(582, 28, 32, 425);
      this.floor.fillRect(26, 28, 588, 26);
      this.floor.fillRect(26, 434, 244, 20);
      this.floor.fillRect(370, 434, 244, 20);
      this.floor.fillStyle(0x8c6652, 0.4);
      this.floor.fillCircle(320, 188, 104);
      this.floor.fillStyle(0xb97948, 0.2);
      this.floor.fillCircle(320, 188, 72);
      this.drawLantern(112, 195, 0xff8c51);
      this.drawLantern(528, 195, 0xff8c51);
      this.floor.lineStyle(2, 0xcda66c, 0.7);
      this.floor.strokeCircle(320, 188, 108);
      this.floor.lineStyle(1, 0xd99455, 0.5);
      this.floor.strokeCircle(320, 188, 77);
      for (let i = 0; i < 12; i += 1) {
        const angle = (i / 12) * Math.PI * 2;
        this.floor.fillStyle(i % 2 ? 0xe2aa5c : 0x8e7860, 0.7);
        this.floor.fillCircle(320 + Math.cos(angle) * 90, 188 + Math.sin(angle) * 90, 2);
      }
      this.floor.fillStyle(0x88714d, 1);
      this.floor.fillRect(288, 288, 64, 146);
      this.floor.fillStyle(palette.path, 1);
      this.floor.fillRect(292, 288, 56, 146);
    }
    if (regionId === 'first-hunger') this.drawHungerScenery(cellId);
    if (this.isCinematicSettlement(cellId)) this.drawCinematicDressing(cellId);
    this.drawCellHedges(cellId, regionId, unlockedRegions, marchesTide, silencedBells);
    this.floor.setDepth(-100);
  }

  private drawCapitalRuins(cellId: string) {
    const g = this.floor;
    const seed = cellId.split('').reduce((value, letter) => value + letter.charCodeAt(0), 0);
    const stone = [0x827b73, 0x706b65, 0x969084, 0x5c5854] as const;

    // Broad intersecting avenues keep the 6-by-10 city legible as one place.
    g.fillStyle(0x393736, 0.82);
    g.fillRect(0, 205, WORLD_CELL_WIDTH, 70);
    g.fillRect(286, 0, 68, WORLD_CELL_HEIGHT);
    g.fillStyle(0x91877b, 0.85);
    g.fillRect(0, 213, WORLD_CELL_WIDTH, 54);
    g.fillRect(294, 0, 52, WORLD_CELL_HEIGHT);
    g.fillStyle(0xa59a8a, 0.36);
    g.fillRect(0, 216, WORLD_CELL_WIDTH, 3);
    g.fillRect(298, 0, 3, WORLD_CELL_HEIGHT);

    // Broken building foundations sit in the corners, leaving clear routes
    // through the center and toward any open edge.
    const foundations = [
      [36, 34, 180, 116], [424, 36, 178, 114],
      [34, 334, 208, 108], [414, 336, 190, 106],
    ] as const;
    foundations.forEach(([x, y, width, height], index) => {
      g.fillStyle(0x363434, 0.72);
      g.fillRect(x, y, width, height);
      g.fillStyle(0x716a62, 0.88);
      g.fillRect(x + 6, y + 6, width - 12, height - 12);
      g.fillStyle(0x4a4642, 0.9);
      g.fillRect(x + 16, y + 17, width - 30, height - 32);
      for (let i = 0; i < 5; i += 1) {
        const rubbleX = x + 10 + ((seed + index * 23 + i * 31) % Math.max(24, width - 30));
        const rubbleY = y + 10 + ((seed + index * 17 + i * 19) % Math.max(24, height - 28));
        g.fillStyle(stone[(i + index) % stone.length], 0.92);
        g.fillRect(rubbleX, rubbleY, 8 + (i % 3) * 4, 5 + (i % 2) * 3);
      }
    });
    for (const [x, y] of [[72, 176], [566, 300], [236, 300], [408, 178]] as const) {
      this.drawPillar(x, y);
    }
  }

  private drawCapitalStronghold() {
    const g = this.floor;

    // Patchwork tents, stores, and timber defenses mark the one inhabited block.
    for (const [x, y, width, cloth] of [
      [52, 58, 112, 0x79604a],
      [466, 62, 108, 0x6d7770],
    ] as const) {
      g.fillStyle(0x302e2b, 0.9);
      g.fillTriangle(x - 8, y + 12, x + width / 2, y - 32, x + width + 8, y + 12);
      g.fillStyle(cloth, 0.98);
      g.fillTriangle(x, y + 10, x + width / 2, y - 25, x + width, y + 10);
      g.fillStyle(0x36322d, 0.95);
      g.fillRect(x + 8, y + 10, width - 16, 50);
      g.fillStyle(0x9d8a6b, 0.8);
      g.fillRect(x + 14, y + 12, 4, 43);
    }
    g.fillStyle(0x453f39, 0.92);
    g.fillRect(190, 54, 34, 58);
    g.fillRect(410, 54, 34, 58);
    g.fillStyle(0x9a7050, 0.86);
    g.fillRect(196, 61, 21, 46);
    g.fillRect(416, 61, 21, 46);
    for (let i = 0; i < 5; i += 1) {
      g.fillStyle(i % 2 ? 0x5b5248 : 0x807365, 0.96);
      g.fillRect(40 + i * 18, 428, 16, 9);
      g.fillRect(504 + i * 18, 428, 16, 9);
    }
    g.fillStyle(0x40362f, 0.85);
    g.fillEllipse(146, 350, 54, 24);
    g.fillStyle(0xa05f3d, 0.95);
    g.fillEllipse(146, 346, 22, 15);
    g.fillStyle(0xf2b46a, 0.95);
    g.fillEllipse(146, 344, 11, 11);
    g.fillStyle(0xffdc8a, 0.9);
    g.fillCircle(146, 340, 3);
    g.lineStyle(3, 0x7f6145, 0.92);
    g.lineBetween(274, 386, 366, 386);
    g.lineBetween(280, 395, 360, 395);
    g.fillStyle(0xb58858, 0.95);
    g.fillTriangle(268, 382, 284, 382, 277, 360);
    g.fillTriangle(356, 382, 372, 382, 365, 360);
  }

  private drawCinderwatchCamp() {
    const g = this.floor;
    // A high-pass trail camp: canvas shelters flank the route, with gear,
    // trail markers, and a shared fire instead of permanent buildings.
    this.drawHikerTent(92, 104, 110, 72, 0x8c5148, 0xc58d68);
    this.drawHikerTent(530, 108, 100, 68, 0x667477, 0xa7a18d);
    this.drawHikerTent(102, 402, 104, 68, 0xa1845c, 0xc7ac77);
    this.drawHikerTent(520, 398, 112, 74, 0x746359, 0xa68d72);

    // Bedrolls and packed climbing gear sit beside each shelter.
    for (const [x, y, color] of [
      [165, 142, 0x74675a], [478, 144, 0x8d654c], [172, 375, 0x596468], [470, 374, 0x805949],
    ] as const) {
      g.fillStyle(0x28292a, 0.5).fillEllipse(x + 3, y + 7, 30, 12);
      g.fillStyle(color, 0.98).fillEllipse(x, y, 24, 11);
      g.lineStyle(2, 0xd1b98f, 0.7).lineBetween(x - 8, y, x + 8, y);
      g.fillStyle(0x403a34, 1).fillRect(x + 14, y - 7, 18, 16);
      g.lineStyle(1, 0xb4996d, 0.9).strokeRect(x + 14, y - 7, 18, 16);
    }

    // Shared fire ring, deliberately kept off the main east-west trail.
    g.fillStyle(0x383230, 0.7).fillEllipse(236, 337, 62, 32);
    g.lineStyle(3, 0x8f7861, 0.9).strokeEllipse(236, 337, 48, 23);
    g.fillStyle(0x412b26, 0.95).fillEllipse(236, 337, 30, 14);
    g.lineStyle(4, 0x634537, 1).lineBetween(225, 340, 245, 333);
    g.lineStyle(3, 0x8f6240, 1).lineBetween(226, 333, 245, 341);
    g.fillStyle(0xe6723b, 0.94).fillTriangle(230, 339, 237, 315, 242, 339);
    g.fillStyle(0xffc56b, 0.98).fillTriangle(234, 338, 238, 323, 240, 338);
    g.fillStyle(0xffe3a0, 0.9).fillCircle(237, 330, 2);

    // A weathered route board and expedition pennant make the stop readable
    // as a hikers' base camp from the trail.
    g.fillStyle(0x4a3930, 1).fillRect(384, 274, 7, 44);
    g.fillStyle(0xa8865f, 1).fillRect(390, 278, 52, 22);
    g.lineStyle(2, 0x533f31, 0.95).strokeRect(390, 278, 52, 22);
    g.lineStyle(2, 0xe1c18d, 0.75).lineBetween(397, 285, 432, 285);
    g.lineStyle(2, 0xe1c18d, 0.75).lineBetween(397, 292, 424, 292);
    g.lineStyle(3, 0x54473b, 0.95).lineBetween(474, 260, 474, 313);
    g.fillStyle(0xc15d44, 0.95).fillTriangle(475, 262, 507, 273, 475, 283);
    this.drawLantern(394, 320, 0xffa16f);
  }

  private drawHikerTent(
    centerX: number,
    baseY: number,
    width: number,
    height: number,
    shade: number,
    canvas: number,
  ) {
    const g = this.floor;
    g.fillStyle(0x28282a, 0.45).fillEllipse(centerX + 4, baseY + 8, width + 28, 20);
    g.fillStyle(0x4b413b, 0.96)
      .fillTriangle(centerX - width / 2 - 6, baseY, centerX, baseY - height - 7, centerX + width / 2 + 6, baseY);
    g.fillStyle(shade, 1)
      .fillTriangle(centerX - width / 2, baseY, centerX, baseY - height, centerX, baseY);
    g.fillStyle(canvas, 1)
      .fillTriangle(centerX, baseY - height, centerX + width / 2, baseY, centerX, baseY);
    g.lineStyle(2, 0x483b34, 0.92).lineBetween(centerX, baseY - height + 2, centerX, baseY - 1);
    g.fillStyle(0x473a34, 0.98)
      .fillTriangle(centerX - 11, baseY - 2, centerX, baseY - height + 23, centerX + 11, baseY - 2);
    g.lineStyle(1, 0xe1c69b, 0.65).lineBetween(centerX - width / 2 + 12, baseY - 5, centerX - 6, baseY - height + 27);
    g.fillStyle(0x483b34, 0.9).fillEllipse(centerX, baseY + 2, width + 8, 8);
  }

  private drawMarchesTide(cellId: string, tide: 'low' | 'high') {
    if (cellId !== 'drowned-marches-02-01' && cellId !== 'reedveil-crossing') return;
    const g = this.floor;
    const pools = cellId === 'reedveil-crossing'
      ? [[114, 142, 146, 54], [526, 338, 142, 58], [132, 386, 108, 42], [506, 92, 116, 44]]
      : [[136, 334, 138, 52], [512, 128, 134, 48], [112, 112, 96, 36], [526, 382, 106, 38]];
    for (const [x, y, width, height] of pools) {
      if (tide === 'high') {
        g.fillStyle(0x388b91, 0.42);
        g.fillEllipse(x, y, width, height);
        g.lineStyle(2, 0xb5e2d9, 0.62);
        g.strokeEllipse(x, y, width - 8, height - 8);
        g.lineStyle(1, 0xd4e8d9, 0.55);
        g.lineBetween(x - width * 0.2, y, x + width * 0.2, y);
      } else {
        g.fillStyle(0x374b41, 0.45);
        g.fillEllipse(x, y, width, height);
        g.fillStyle(0x99916a, 0.72);
        g.fillEllipse(x, y, width - 16, height - 14);
        g.fillStyle(0xb7a77a, 0.6);
        g.fillEllipse(x - width * 0.12, y - 2, width * 0.32, height * 0.3);
      }
    }
  }

  private drawMournwaterTown() {
    const g = this.floor;
    const drawStiltHut = (x: number, y: number, width: number, height: number, roof: number, wall: number) => {
      g.fillStyle(0x203f3d, 0.32).fillEllipse(x + width / 2, y + height + 26, width + 28, 24);
      g.fillStyle(0x453f32, 1);
      for (const legX of [x + 14, x + width - 22]) {
        g.fillRect(legX, y + height - 18, 8, 45);
      }
      g.fillStyle(0x704f39, 1).fillRect(x, y + 24, width, height - 18);
      g.fillStyle(0x9b7550, 1).fillRect(x + 6, y + 30, width - 12, height - 34);
      g.fillStyle(roof, 1).fillTriangle(x - 10, y + 32, x + width / 2, y - 8, x + width + 10, y + 32);
      g.fillStyle(wall, 0.9).fillTriangle(x + 10, y + 30, x + width / 2, y + 2, x + width - 10, y + 30);
      g.fillStyle(0x3e342d, 1).fillRect(x + width / 2 - 13, y + height - 45, 26, 42);
      g.fillStyle(0xa7d0c0, 0.94).fillRect(x + 22, y + 48, 20, 17);
      g.fillStyle(0x233c3b, 1).fillRect(x + 26, y + 52, 12, 9);
      g.fillStyle(0x73563b, 1).fillRect(x + 6, y + height - 12, width - 12, 8);
      for (let plank = 0; plank < width - 12; plank += 18) {
        g.lineStyle(1, 0x443d32, 0.62).lineBetween(x + 8 + plank, y + height - 11, x + 8 + plank, y + height - 5);
      }
    };

    // Raised boardwalks keep the little settlement legible against the marsh.
    g.fillStyle(0x315a56, 0.62).fillEllipse(92, 185, 152, 44);
    g.fillStyle(0x315a56, 0.62).fillEllipse(526, 206, 148, 50);
    g.fillStyle(0x876847, 1).fillRect(0, 228, 640, 32).fillRect(306, 150, 28, 286);
    g.fillStyle(0xb08a5e, 1).fillRect(0, 230, 640, 25).fillRect(309, 150, 22, 286);
    for (let x = 8; x < 640; x += 22) {
      g.lineStyle(1, 0x634a36, 0.78).lineBetween(x, 231, x, 254);
    }
    for (let y = 158; y < 436; y += 22) {
      g.lineStyle(1, 0x634a36, 0.78).lineBetween(310, y, 330, y);
    }

    drawStiltHut(42, 61, 154, 105, 0x506653, 0x9c8059);
    drawStiltHut(430, 57, 160, 108, 0x596b57, 0x8f7856);

    // An open-sided reed market sits beside the main dock instead of another house.
    g.fillStyle(0x755638, 1).fillRect(224, 311, 192, 9);
    g.fillStyle(0x4b5743, 1).fillTriangle(214, 319, 320, 276, 426, 319);
    g.fillStyle(0x738052, 1).fillTriangle(229, 313, 320, 283, 411, 313);
    g.fillStyle(0x644b35, 1);
    g.fillRect(238, 316, 7, 51).fillRect(395, 316, 7, 51);
    g.fillStyle(0xb78e5a, 1).fillRect(247, 337, 145, 18);
    g.fillStyle(0xd3bd88, 0.95).fillRect(255, 330, 30, 14).fillRect(302, 330, 30, 14).fillRect(350, 330, 30, 14);
    this.drawLantern(210, 207, 0xbfe8df);
    this.drawLantern(430, 208, 0xbfe8df);
  }

  private drawCellTrail(cellId: string, borderColor: number, pathColor: number, marchesTide: MarchesTide) {
    const g = this.floor;
    const openEdges = (['north', 'south', 'east', 'west'] as const)
      .filter((edge) => cellEdgeHasOpening(
        cellId,
        edge,
        this.engine.getWorldProgress().unlockedRegions,
        marchesTide,
        this.engine.getWorldProgress().silencedBells,
      ));
    const arms: Record<'north' | 'south' | 'east' | 'west', [number, number, number, number]> = {
      north: [288, 0, 64, 240],
      south: [288, 240, 64, 240],
      west: [0, 212, 320, 56],
      east: [320, 212, 320, 56],
    };
    const innerArms: Record<'north' | 'south' | 'east' | 'west', [number, number, number, number]> = {
      north: [292, 0, 56, 240],
      south: [292, 240, 56, 240],
      west: [0, 216, 320, 48],
      east: [320, 216, 320, 48],
    };
    g.fillStyle(borderColor, 1);
    for (const edge of openEdges) {
      g.fillRect(...arms[edge]);
    }
    g.fillRect(288, 212, 64, 56);
    g.fillStyle(pathColor, 1);
    for (const edge of openEdges) {
      g.fillRect(...innerArms[edge]);
    }
    g.fillRect(292, 216, 56, 48);
    g.fillStyle(0xe0c58d, 0.28);
    for (const edge of openEdges) {
      if (edge === 'north') g.fillRect(298, 0, 3, 232);
      if (edge === 'south') g.fillRect(298, 248, 3, 232);
      if (edge === 'west') g.fillRect(0, 221, 312, 3);
      if (edge === 'east') g.fillRect(328, 221, 312, 3);
    }
  }

  private drawCellHedges(
    cellId: string,
    regionId: WorldRegionId,
    unlockedRegions: readonly WorldRegionId[],
    marchesTide: MarchesTide,
    silencedBells: readonly WorldRegionId[],
  ) {
    const g = this.floor;
    const thickness = WORLD_CELL_BORDER_THICKNESS;
    const edges = [
      { edge: 'north' as const, vertical: false, x: 0, y: 0, length: WORLD_CELL_WIDTH, gap: WORLD_CELL_OPENING.vertical },
      { edge: 'south' as const, vertical: false, x: 0, y: WORLD_CELL_HEIGHT - thickness, length: WORLD_CELL_WIDTH, gap: WORLD_CELL_OPENING.vertical },
      { edge: 'west' as const, vertical: true, x: 0, y: 0, length: WORLD_CELL_HEIGHT, gap: WORLD_CELL_OPENING.horizontal },
      { edge: 'east' as const, vertical: true, x: WORLD_CELL_WIDTH - thickness, y: 0, length: WORLD_CELL_HEIGHT, gap: WORLD_CELL_OPENING.horizontal },
    ];

    for (const { edge, vertical, x, y, length, gap } of edges) {
      const opening = cellEdgeHasOpening(cellId, edge, unlockedRegions, marchesTide, silencedBells) ? gap : null;
      if (!opening) {
        this.drawBoundaryRun(g, x, y, length, vertical, regionId);
        continue;
      }
      this.drawBoundaryRun(g, x, y, opening.start, vertical, regionId);
      const afterOpening = opening.end;
      const remaining = length - afterOpening;
      this.drawBoundaryRun(
        g,
        vertical ? x : x + afterOpening,
        vertical ? y + afterOpening : y,
        remaining,
        vertical,
        regionId,
      );
    }
  }

  private drawBoundaryRun(
    g: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    length: number,
    vertical: boolean,
    regionId: WorldRegionId,
  ) {
    if (regionId === 'fallen-capital') this.drawRubbleWallRun(g, x, y, length, vertical);
    else this.drawHedgeRun(g, x, y, length, vertical);
  }

  private drawRubbleWallRun(
    g: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    length: number,
    vertical: boolean,
  ) {
    if (length <= 0) return;
    const thickness = WORLD_CELL_BORDER_THICKNESS;
    g.fillStyle(0x3b3836, 1);
    g.fillRect(x, y, vertical ? thickness : length, vertical ? length : thickness);
    const stones = [0x77716b, 0x898278, 0x625e59, 0x9a9083] as const;
    for (let along = 5, index = 0; along < length - 5; along += 19, index += 1) {
      const bx = vertical ? x + (index % 2 ? 1 : 4) : x + along;
      const by = vertical ? y + along : y + (index % 2 ? 1 : 4);
      g.fillStyle(stones[index % stones.length], 1);
      g.fillRect(bx, by, vertical ? 15 : 17, vertical ? 17 : 14);
      g.fillStyle(0xb2a99a, 0.64);
      g.fillRect(bx + 2, by + 2, vertical ? 9 : 10, 2);
    }
  }

  private drawHedgeRun(
    g: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    length: number,
    vertical: boolean,
  ) {
    if (length <= 0) return;
    const thickness = WORLD_CELL_BORDER_THICKNESS;
    g.fillStyle(0x1e3529, 1);
    g.fillRect(x, y, vertical ? thickness : length, vertical ? length : thickness);
    for (let along = 11; along < length - 8; along += 20) {
      const centerX = vertical ? x + thickness / 2 : x + along;
      const centerY = vertical ? y + along : y + thickness / 2;
      g.fillStyle(0x294733, 1);
      g.fillEllipse(centerX, centerY + 1, vertical ? 24 : 24, vertical ? 23 : 20);
      g.fillStyle(0x456c43, 1);
      g.fillEllipse(centerX - 2, centerY - 3, vertical ? 17 : 18, vertical ? 16 : 15);
      g.fillStyle(0x789456, 0.96);
      g.fillEllipse(centerX - 4, centerY - 6, 8, 6);
      g.fillStyle(0xb1b77a, 0.82);
      g.fillCircle(centerX - 5, centerY - 7, 1.4);
    }
  }

  private drawGroundDetail(room: RoomId, x: number, y: number, seed: number, regionId: WorldRegionId) {
    const g = this.floor;
    const mx = x + 5 + (seed * 7) % 18;
    const my = y + 5 + (seed * 11) % 18;
    if (room === 'village') {
      if (seed % 5 === 0) {
        g.lineStyle(1.5, 0x48633f, 0.9);
        g.lineBetween(mx - 2, my + 7, mx - 6, my - 1);
        g.lineBetween(mx, my + 7, mx - 1, my - 5);
        g.lineBetween(mx + 2, my + 7, mx + 5, my - 3);
        g.lineBetween(mx + 4, my + 7, mx + 9, my + 1);
        g.lineStyle(1, 0x92a467, 0.78);
        g.lineBetween(mx - 3, my + 3, mx - 5, my);
        g.lineBetween(mx + 2, my + 1, mx + 4, my - 2);
        if (seed % 3 === 0) {
          g.fillStyle(seed % 5 === 0 ? 0xe7c477 : 0xd9d99a, 0.9);
          g.fillCircle(mx + 5, my - 4, 1.7);
          g.fillCircle(mx + 3, my - 2, 1);
          g.fillCircle(mx + 7, my - 2, 1);
          g.fillStyle(0xf6e6bb, 0.95);
          g.fillCircle(mx + 5, my - 2, 1);
        }
      } else if (seed % 13 === 7) {
        g.fillStyle(0x938365, 0.55);
        g.fillEllipse(mx, my + 2, 7, 4);
        g.fillStyle(0xc2ad7a, 0.7);
        g.fillEllipse(mx - 1, my + 1, 3, 1.5);
      }
    } else if (regionId === 'ashen-peaks') {
      if (seed % 5 === 0) {
        g.fillStyle(0xd4b7aa, 0.42);
        g.fillTriangle(mx - 3, my + 4, mx + 1, my - 4, mx + 5, my + 4);
        g.fillStyle(0xf0d5c4, 0.55);
        g.fillCircle(mx + 1, my - 2, 1.2);
      } else if (seed % 11 === 4) {
        g.fillStyle(0x302f35, 0.65);
        g.fillEllipse(mx + 2, my + 2, 8, 4);
        g.fillStyle(0x9a766a, 0.7);
        g.fillEllipse(mx, my, 3, 2);
      }
    } else if (room === 'woodland') {
      if (seed % 5 === 0) {
        g.fillStyle(0x31563d, 0.72);
        g.fillEllipse(mx + 2, my + 2, 11, 5);
        g.fillStyle(0x709354, 0.9);
        g.fillEllipse(mx - 1, my, 5, 3);
        g.fillEllipse(mx + 4, my - 2, 5, 3);
        g.fillEllipse(mx + 7, my + 1, 4, 3);
        g.lineStyle(1, 0xb2bd7b, 0.75);
        g.lineBetween(mx - 3, my + 3, mx + 3, my);
      } else if (seed % 9 === 2) {
        g.fillStyle(0x65543d, 0.8);
        g.fillEllipse(mx + 2, my + 3, 9, 5);
        g.fillStyle(0x9d835a, 0.85);
        g.fillEllipse(mx + 2, my + 2, 5, 2);
        g.fillStyle(0x5e764a, 1);
        g.fillEllipse(mx + 5, my, 5, 3);
      }
    } else if (room === 'ruins') {
      if (seed % 4 === 0) {
        g.lineStyle(1, 0x443f38, 0.7);
        g.lineBetween(mx, my, mx + 3, my + 2);
        g.lineBetween(mx + 3, my + 2, mx + 5, my + 6);
        g.lineBetween(mx + 3, my + 2, mx + 7, my + 1);
        g.fillStyle(0xb89e73, 0.65);
        g.fillEllipse(mx + 8, my + 6, 4, 2);
      } else if (seed % 11 === 9) {
        g.fillStyle(0x9c805b, 0.6);
        g.fillEllipse(mx, my + 2, 7, 3);
        g.fillStyle(0xc2a67a, 0.5);
        g.fillEllipse(mx + 1, my + 1, 3, 1);
      }
    } else if (room === 'chapel') {
      if (seed % 5 === 0) {
        g.fillStyle(0x31565a, 0.55);
        g.fillEllipse(mx + 3, my + 3, 10, 4);
        g.fillStyle(0x91b4ad, 0.66);
        g.lineStyle(1, 0xaac3b9, 0.5);
        g.lineBetween(mx - 2, my, mx + 2, my - 4);
        g.lineBetween(mx + 2, my - 4, mx + 5, my - 2);
      } else if (seed % 13 === 8) {
        g.fillStyle(0x303f42, 0.58);
        g.fillEllipse(mx, my + 2, 7, 3);
        g.fillStyle(0xa0a18f, 0.6);
        g.fillEllipse(mx + 1, my, 3, 1);
      }
    } else {
      if (seed % 3 === 0) {
        g.fillStyle(0x9b6747, 0.7);
        g.fillEllipse(mx + 2, my + 5, 5, 6);
        g.fillStyle(0xf19a55, 0.78);
        g.fillEllipse(mx + 2, my + 3, 3, 5);
        g.fillStyle(0xffd28a, 0.8);
        g.fillCircle(mx + 1, my + 2, 1);
      } else if (seed % 7 === 6) {
        g.fillStyle(0xb99565, 0.7);
        g.fillEllipse(mx + 2, my, 8, 3);
        g.fillEllipse(mx + 4, my + 3, 4, 5);
      }
    }
  }

  private drawHouse(x: number, y: number, width: number, height: number, roof: number, wall: number) {
    const tint = roof === 0x69775a ? 0xd7dfbd : 0xffffff;
    this.addWorldSprite(
      9,
      this.terrainOrigin.x + x + width / 2,
      this.terrainOrigin.y + y + height / 2,
      width + 30,
      height + 30,
      this.terrainOrigin.y + y + height,
      tint,
    );
  }

  private drawWell(x: number, y: number) {
    this.addWorldSprite(
      10,
      this.terrainOrigin.x + x,
      this.terrainOrigin.y + y,
      66,
      66,
      this.terrainOrigin.y + y + 16,
    );
  }

  private drawTree(x: number, y: number, scale: number) {
    const s = scale;
    this.addWorldSprite(
      8,
      this.terrainOrigin.x + x,
      this.terrainOrigin.y + y - 8 * s,
      82 * s,
      96 * s,
      this.terrainOrigin.y + y + 30 * s,
    );
  }

  private drawPillar(x: number, y: number) {
    this.addWorldSprite(
      15,
      this.terrainOrigin.x + x,
      this.terrainOrigin.y + y + 10,
      46,
      50,
      this.terrainOrigin.y + y + 30,
    );
  }

  private drawLantern(x: number, y: number, glow = 0xffd078) {
    this.addWorldSprite(
      12,
      this.terrainOrigin.x + x,
      this.terrainOrigin.y + y,
      38,
      56,
      this.terrainOrigin.y + y + 24,
      glow === 0xffd078 ? 0xffffff : 0xffe3ad,
    );
  }

  private addWorldSprite(frame: number, x: number, y: number, width: number, height: number, depth: number, tint = 0xffffff) {
    const sprite = this.add.image(x, y, 'emberfall-world-sprites', frame)
      .setDisplaySize(width, height)
      .setDepth(depth)
      .setTint(tint);
    this.terrainScenery.push(sprite);
    return sprite;
  }

  private drawWorldProps(props: WorldProp[], room: RoomId, keyFound: boolean, gateOpen: boolean) {
    const g = this.propsGraphics;
    g.clear();
    for (const sprite of this.npcSprites.values()) sprite.setVisible(false);
    for (const shadow of this.npcShadows.values()) shadow.setVisible(false);
    const activeNpcIds = new Set<string>();
    const activeIds = new Set<string>();
    for (const prop of props) {
      if (prop.visible === false) continue;
      const { x, y } = prop;
      if (prop.id.startsWith('well:')) {
        const texture = 'emberfall-checkpoint-well';
        if (!this.textures.exists(texture)) {
          const art = this.add.graphics();
          art.fillStyle(0x282c27, 0.3).fillEllipse(32, 63, 52, 14);
          art.fillStyle(0x555950).fillRect(12, 47, 40, 14).fillEllipse(32, 60, 40, 17);
          art.fillStyle(0x8e9487).fillRect(14, 48, 36, 11).fillEllipse(32, 59, 36, 14);
          art.lineStyle(2, 0x555b53).lineBetween(15, 54, 49, 54).lineBetween(23, 49, 23, 60).lineBetween(40, 49, 40, 62);
          art.fillStyle(0xb6b9a5).fillEllipse(32, 47, 46, 22);
          art.fillStyle(0x343f3c).fillEllipse(32, 46, 32, 13);
          art.fillStyle(0x59878a).fillEllipse(32, 47, 27, 9);
          art.fillStyle(0xa3cbc1).fillRect(25, 46, 12, 2);
          art.fillStyle(0x513b2a).fillRect(12, 20, 6, 34).fillRect(46, 20, 6, 34).fillRect(13, 26, 38, 5);
          art.fillStyle(0x9b7650).fillRect(14, 22, 2, 28).fillRect(48, 22, 2, 28);
          art.lineStyle(2, 0xc8b27c).lineBetween(32, 29, 32, 45);
          art.fillStyle(0x6c4a34).fillRect(27, 41, 10, 10);
          art.fillStyle(0xb49364).fillRect(27, 42, 10, 2).fillRect(27, 49, 10, 2);
          art.fillStyle(0x382d28).fillTriangle(4, 23, 32, 4, 60, 23);
          art.fillStyle(0x986049).fillTriangle(7, 21, 32, 6, 57, 21);
          art.fillStyle(0xc19162).fillRect(13, 17, 37, 3).fillRect(22, 12, 20, 2);
          art.fillStyle(0x573c2d).fillRect(5, 22, 54, 4);
          art.generateTexture(texture, 64, 72);
          art.destroy();
        }
        activeIds.add(prop.id);
        let sprite = this.propSprites.get(prop.id);
        if (!sprite) { sprite = this.add.sprite(x, y, texture); this.propSprites.set(prop.id, sprite); }
        sprite.setVisible(true).setPosition(x, y).setDisplaySize(58, 65).setDepth(y + 18)
          .setTint(prop.activated ? 0xffefd1 : 0xffffff);
        continue;
      }
      if (prop.kind === 'npc') {
        activeNpcIds.add(prop.id);
        const player = this.engine.getState().player;
        const dx = (player?.x ?? x) - x;
        const dy = (player?.y ?? y) - y;
        // Rowan has authored four-way art. Other named NPCs use a single
        // upright illustration, so keep their pose stable instead of flipping
        // the entire sprite vertically when the player walks behind them.
        const facing = prop.facing ?? (prop.id === 'rowan'
          ? Math.abs(dx) > Math.abs(dy)
            ? dx < 0 ? 'left' : 'right'
            : dy < 0 ? 'up' : 'down'
          : 'down');
        const texture = prop.id === 'rowan' || prop.id === 'maelis-ally'
          ? `emberfall-${prop.id === 'rowan' ? 'rowan' : 'maelis'}-${facing}`
          : NPC_SPRITES_BY_ID[prop.id] ?? 'npc-mournwater-storyteller';
        const source = this.textures.get(texture).getSourceImage() as HTMLImageElement;
        const displayWidth = prop.id.startsWith('capital-')
          ? Math.max(42, Math.min(72, (source.width / source.height) * 100))
          : 88;
        let shadow = this.npcShadows.get(prop.id);
        if (!shadow) {
          shadow = this.add.graphics();
          this.npcShadows.set(prop.id, shadow);
        }
        shadow
          .clear()
          .setPosition(x, y)
          .fillStyle(0x27362d, 0.44)
          .fillEllipse(1, 46, displayWidth * 0.9, 18)
          .setDepth(y + 44)
          .setVisible(true);
        let sprite = this.npcSprites.get(prop.id);
        if (!sprite) {
          sprite = this.add.sprite(x, y, texture)
            .setOrigin(0.5);
          this.npcSprites.set(prop.id, sprite);
        }
        sprite
          .setTexture(texture)
          .setPosition(x, y)
          .setDisplaySize(displayWidth, prop.id === 'maelis-ally' && prop.attacking ? 106 : 100)
          .setDepth(y + 45)
          .setFlipX(false)
          .setFlipY(false)
          .setTint(prop.id === 'maelis-ally' && prop.attacking ? 0xe6ccff : 0xffffff)
          .setRotation(0)
          .setVisible(true);
        continue;
      }
      if (prop.kind === 'treeGate') {
        if (prop.activated) {
          this.propSprites.get(prop.id)?.setVisible(false);
          continue;
        }
        activeIds.add(prop.id);
        let tree = this.propSprites.get(prop.id);
        if (!tree) {
          tree = this.add.sprite(x, y - 8, 'emberfall-world-sprites', 8);
          this.propSprites.set(prop.id, tree);
        }
        tree.setVisible(true).setPosition(x, y - 8).setDisplaySize(82, 96)
          .setDepth(y + 30).setTint(prop.requiredWeaponId ? 0xb5dc84 : 0xd5dfae);
        continue;
      }
      const frame = prop.kind === 'chest' ? 14
        : prop.kind === 'gate' ? 11
        : prop.kind === 'portal' || prop.kind === 'shrine' || prop.kind === 'rune' || prop.kind === 'inscription' ? 13
        : 12;
      const size = prop.kind === 'gate' ? [118, 96]
        : prop.kind === 'chest' ? [52, 48]
        : [68, 68];
      activeIds.add(prop.id);
      let sprite = this.propSprites.get(prop.id);
      if (!sprite) {
        sprite = this.add.sprite(x, y, 'emberfall-world-sprites', frame);
        this.propSprites.set(prop.id, sprite);
      }
      const activeTint = prop.kind === 'rune' || prop.kind === 'shrine'
        ? prop.id.startsWith('glass-bell-rune-')
          ? prop.activated ? 0xb4f0d8 : 0x79b9a8
          : prop.id.startsWith('capital-bell-rune-')
            ? prop.activated ? 0xd8c0ff : 0x9e8bbd
            : prop.activated ? 0xffe3a1 : 0xc7c7b7
        : prop.kind === 'inscription' ? 0xa7ced0
        : prop.kind === 'chest' && prop.activated ? 0xffd687 : 0xffffff;
      sprite.setVisible(true).setFrame(frame).setPosition(x, y)
        .setDisplaySize(size[0], size[1]).setDepth(y + (prop.kind === 'gate' ? 22 : 10))
        .setTint(activeTint)
        .setAlpha(prop.kind === 'gate' && (prop.activated ?? gateOpen) ? 0.45 : 1);
      if (prop.kind === 'gate' && !(prop.activated ?? gateOpen)) {
        g.fillStyle(keyFound ? 0xd4a34c : 0x4b4033, 0.95);
        g.fillRect(x - 28, y - 10, 7, 34);
        g.fillRect(x - 9, y - 10, 7, 34);
        g.fillRect(x + 10, y - 10, 7, 34);
        g.fillStyle(keyFound ? 0xffd77a : 0x9a7b4c, 1);
        g.fillCircle(x + 3, y + 6, 4);
        g.setDepth(y + 24);
      } else if ((prop.kind === 'rune' || prop.kind === 'shrine') && prop.activated) {
        g.fillStyle(0xffd583, 0.14);
        g.fillCircle(x, y, 32);
        g.setDepth(y + 8);
      } else if (prop.kind === 'chest' && prop.activated) {
        g.fillStyle(0xffd27a, 0.7);
        g.fillTriangle(x - 8, y - 8, x, y - 16, x + 8, y - 8);
        g.setDepth(y + 20);
      }
    }
    for (const [id, sprite] of this.propSprites) {
      if (!activeIds.has(id)) sprite.setVisible(false);
    }
    for (const [id, sprite] of this.npcSprites) {
      if (!activeNpcIds.has(id)) sprite.setVisible(false);
    }
    for (const [id, shadow] of this.npcShadows) {
      if (!activeNpcIds.has(id)) shadow.setVisible(false);
    }
    return;

    for (const prop of props) {
      if (prop.visible === false) continue;
      const { x, y } = prop;
      if (prop.kind === 'npc') {
        g.fillStyle(0x334234, 0.35);
        g.fillEllipse(x, y + 12, 26, 9);
        this.drawTinyPerson(g, x, y, 0xe0b57f, 0x52684d);
        g.fillStyle(0xe8d6ae, 1);
        g.fillCircle(x, y - 22, 8);
        g.fillStyle(0x493c33, 1);
        g.fillRect(x - 9, y - 28, 18, 5);
        g.fillRect(x - 6, y - 31, 12, 3);
        g.fillStyle(0xe2c18a, 1);
        g.fillRect(x - 11, y - 24, 22, 3);
        g.fillStyle(0x413d35, 1);
        g.fillRect(x - 4, y - 23, 2, 2);
        g.fillRect(x + 3, y - 23, 2, 2);
        g.fillStyle(0xc45a42, 1);
        g.fillRect(x - 10, y - 11, 20, 3);
        g.fillRect(x + 8, y - 9, 3, 8);
      } else if (prop.kind === 'chest') {
        const open = prop.activated;
        g.fillStyle(0x3e392e, 0.26);
        g.fillEllipse(x, y + 6, 34, 12);
        g.fillStyle(0x5e402e, 1);
        g.fillRect(x - 16, y - 17, 32, 8);
        g.fillStyle(open ? 0x795d39 : 0x95683a, 1);
        g.fillRect(x - 14, y - 13, 28, 20);
        g.fillStyle(open ? 0xceb778 : 0xc8954d, 1);
        g.fillRect(x - 14, y - 17, 28, 7);
        g.fillStyle(0x68462d, 1);
        g.fillRect(x - 13, y - 9, 3, 13);
        g.fillRect(x + 10, y - 9, 3, 13);
        g.fillStyle(0xdaa953, 1);
        g.fillRect(x - 15, y - 17, 4, 7);
        g.fillRect(x + 11, y - 17, 4, 7);
        g.fillRect(x - 15, y + 1, 4, 7);
        g.fillRect(x + 11, y + 1, 4, 7);
        g.fillStyle(0xead18e, 0.9);
        g.fillRect(x - 12, y - 15, 8, 2);
        g.fillRect(x - 13, y - 1, 26, 2);
        g.fillStyle(0xf0d386, 1);
        g.fillRect(x - 3, y - 11, 6, 7);
        g.fillStyle(0x705633, 1);
        g.fillRect(x - 1, y - 9, 2, 3);
      } else if (prop.kind === 'rune') {
        const lit = Boolean(prop.activated);
        const runeColor = lit ? 0xffd37a : 0x98877a;
        g.fillStyle(lit ? 0xf2c773 : 0x514947, lit ? 0.18 : 0.4);
        g.fillCircle(x, y, 23);
        g.lineStyle(2, runeColor, lit ? 0.9 : 0.68);
        g.strokeCircle(x, y, 17);
        g.lineStyle(1, runeColor, lit ? 0.75 : 0.5);
        g.strokeCircle(x, y, 11);
        g.fillStyle(lit ? 0xffe6a0 : 0x98877a, 1);
        g.fillTriangle(x, y - 11, x + 9, y + 8, x - 9, y + 8);
        g.fillStyle(0x49443c, 1);
        g.fillTriangle(x, y - 5, x + 4, y + 4, x - 4, y + 4);
        for (let i = 0; i < 6; i += 1) {
          const angle = (i / 6) * Math.PI * 2 - Math.PI / 2;
          g.fillStyle(i % 2 ? runeColor : 0xd3b587, lit ? 1 : 0.8);
          g.fillRect(x + Math.cos(angle) * 19 - 1, y + Math.sin(angle) * 19 - 1, 3, 3);
        }
        if (lit) {
          g.fillStyle(0xffe6a0, 0.3);
          g.fillCircle(x, y, 29);
        }
      } else if (prop.kind === 'gate') {
        g.fillStyle(0x393633, 1);
        g.fillRect(x - 51, y - 29, 102, 54);
        g.fillStyle(0x8a765a, 1);
        for (let row = 0; row < 3; row += 1) {
          for (let column = 0; column < 5; column += 1) {
            const brickX = x - 48 + column * 20 + (row % 2) * 4;
            g.fillRect(brickX, y - 27 + row * 17, 17, 13);
            g.fillStyle(0x4f463c, 0.7);
            g.fillRect(brickX + 2, y - 25 + row * 17, 12, 2);
            g.fillStyle(0x8a765a, 1);
          }
        }
        g.fillStyle(gateOpen ? 0x201e22 : 0x554738, 1);
        g.fillRect(x - 40, y - 24, 80, 50);
        g.fillStyle(0x2f2a27, 0.9);
        g.fillRect(x - 35, y - 21, 70, 44);
        if (!gateOpen) {
          g.fillStyle(0xb19462, 1);
          for (let barX = x - 32; barX <= x + 32; barX += 16) {
            g.fillRect(barX, y - 23, 5, 51);
            g.fillStyle(0xd6bd80, 0.85);
            g.fillRect(barX, y - 21, 2, 46);
            g.fillStyle(0xb19462, 1);
          }
          g.fillRect(x - 42, y - 12, 84, 5);
          g.fillRect(x - 42, y + 8, 84, 5);
          g.fillStyle(0xe1c783, 1);
          for (const railY of [y - 10, y + 10]) {
            g.fillCircle(x - 37, railY, 2);
            g.fillCircle(x + 37, railY, 2);
          }
          if (keyFound) {
            g.fillStyle(0xf0cb74, 1);
            g.fillCircle(x, y, 6);
            g.fillStyle(0xfff1bd, 1);
            g.fillRect(x - 2, y - 11, 4, 7);
            g.fillRect(x - 7, y - 5, 14, 3);
          }
        } else {
          g.fillStyle(0x372a26, 1);
          g.fillRect(x - 34, y - 21, 68, 44);
          g.fillStyle(0xffbd6c, 0.4);
          g.fillEllipse(x, y + 2, 36, 52);
        }
      } else if (prop.kind === 'portal') {
        if (room === 'village' || room === 'woodland' || room === 'ruins') {
          g.fillStyle(0x3b362b, 0.26);
          g.fillEllipse(x, y, 46, 13);
          g.fillStyle(0x6e604e, 1);
          g.fillRect(x - 14, y - 7, 5, 15);
          g.fillRect(x + 9, y - 7, 5, 15);
          g.fillRect(x - 17, y - 8, 34, 4);
          g.fillStyle(0xd3b676, 0.9);
          g.fillTriangle(x, y - 21, x + 15, y + 4, x - 15, y + 4);
          g.fillStyle(0x413d38, 1);
          g.fillTriangle(x, y - 13, x + 9, y + 2, x - 9, y + 2);
          g.fillStyle(0xf8e0a7, 0.9);
          g.fillRect(x - 2, y - 11, 4, 10);
          g.fillStyle(0xefe0b4, 0.85);
          g.fillRect(x - 12, y - 2, 2, 3);
          g.fillRect(x + 10, y - 2, 2, 3);
        } else {
          g.fillStyle(0xd07947, 0.14);
          g.fillCircle(x, y, 34);
          g.lineStyle(3, 0xb76648, 0.9);
          g.strokeCircle(x, y, 24);
          g.lineStyle(2, 0xf0ba70, 0.9);
          g.strokeCircle(x, y, 16);
          g.fillStyle(0x321f26, 0.94);
          g.fillCircle(x, y, 12);
          g.fillStyle(0xffa45e, 0.75);
          g.fillTriangle(x, y - 10, x + 7, y + 5, x - 7, y + 5);
          g.fillStyle(0xffe3a0, 1);
          g.fillRect(x - 1, y - 4, 2, 5);
        }
      } else if (prop.kind === 'shrine') {
        g.fillStyle(prop.activated ? 0x89be84 : 0x8b7652, 1);
        g.fillRect(x - 19, y - 8, 38, 23);
        g.fillStyle(0x5e5847, 1);
        g.fillRect(x - 16, y - 13, 32, 6);
        g.fillRect(x - 13, y - 19, 26, 6);
        g.fillStyle(0xe2d7b3, 1);
        g.fillTriangle(x, y - 31, x + 12, y - 12, x - 12, y - 12);
        g.fillStyle(prop.activated ? 0xb4e7ad : 0xe4d88d, prop.activated ? 0.95 : 0.6);
        g.fillCircle(x, y - 19, 5);
        g.fillStyle(0x55463c, 0.9);
        g.fillTriangle(x, y - 25, x + 4, y - 17, x - 4, y - 17);
        g.fillStyle(0xe8d39a, 1);
        g.fillRect(x - 3, y + 1, 6, 14);
        g.fillStyle(prop.activated ? 0x89be84 : 0x5f5748, 0.24);
        g.fillCircle(x, y - 19, 27);
        g.fillStyle(0xd2bb7f, 0.9);
        g.fillRect(x - 24, y + 15, 48, 4);
      }
      g.setDepth(y);
    }
  }

  private drawPlayer(player: PlayerState, now: number, attack: ReturnType<AdventureEngine['getAttackAnimation']>) {
    const previous = this.lastPlayerPosition;
    const distance = previous ? Math.hypot(player.x - previous.x, player.y - previous.y) : 0;
    this.lastPlayerPosition = { x: player.x, y: player.y };
    const isWalking = distance > 0.08;
    const elapsed = this.lastPlayerDrawTime > 0 ? Math.min(50, Math.max(0, now - this.lastPlayerDrawTime)) : 0;
    this.lastPlayerDrawTime = now;
    this.walkCycleMs = isWalking
      ? (this.walkCycleMs + elapsed) % (WALK_FRAME_DURATION_MS * HERO_WALK_POSES.length)
      : 0;
    const stepPose = walkPoseAtTime(this.walkCycleMs);
    const attackDuration = player.classId === 'rogue' ? 145 : 210;
    const attackProgress = attack ? 1 - Math.min(1, attack.remainingMs / attackDuration) : 0;
    const pose: HeroPose = attack && attackProgress > 0.14 && attackProgress < 0.86
      ? 'attack'
      : isWalking ? stepPose : 'idle';
    const attackPulse = attack ? Math.sin(attackProgress * Math.PI) : 0;
    const facing = attack
      ? Math.abs(attack.direction.x) > Math.abs(attack.direction.y)
        ? attack.direction.x < 0 ? 'left' : 'right'
        : attack.direction.y < 0 ? 'up' : 'down'
      : player.facing;
    const x = player.x + (attack?.direction.x ?? 0) * attackPulse * 2.5;
    const y = player.y + (attack?.direction.y ?? 0) * attackPulse * 2.5;
    this.playerGraphic.clear();
    this.playerGraphic.fillStyle(0x27362d, 0.44);
    this.playerGraphic.fillEllipse(player.x + 1, player.y + 32, 42, 14);
    this.playerGraphic.setPosition(0, 0).setDepth(player.y + 28);

    this.playerSprite
      .setTexture(heroTextureKey(facing, pose))
      .setPosition(x, y)
      .setRotation(0)
      .setDepth(y + 41);

    this.attackGraphic.clear();
    if (attack) {
      this.drawAttackEffect(this.attackGraphic, player.classId, attack.direction, x, y, attack.remainingMs);
    }
    this.attackGraphic.setPosition(0, 0).setDepth(y + 42);
  }

  private drawAttackEffect(g: Phaser.GameObjects.Graphics, classId: ClassId, direction: { x: number; y: number }, x: number, y: number, remainingMs: number) {
    const fx = direction.x;
    const fy = direction.y;
    const sideX = -fy;
    const sideY = fx;
    const duration = classId === 'rogue' ? 145 : 210;
    const progress = 1 - Math.min(1, remainingMs / duration);
    const alpha = Math.max(0.18, 1 - progress);
    const reach = 8 + progress * 12;

    if (classId === 'warrior') {
      g.lineStyle(5, 0xf4cf78, alpha);
      g.lineBetween(x + fx * reach - sideX * 13, y + fy * reach - sideY * 13, x + fx * (reach + 11) + sideX * 13, y + fy * (reach + 11) + sideY * 13);
      g.lineStyle(1, 0xfff2c1, alpha);
      g.lineBetween(x + fx * reach - sideX * 10, y + fy * reach - sideY * 10, x + fx * (reach + 11) + sideX * 10, y + fy * (reach + 11) + sideY * 10);
    } else if (classId === 'rogue') {
      for (const hand of [-1, 1]) {
        g.lineStyle(3, 0xdaf0d1, alpha);
        g.lineBetween(
          x + fx * 8 + sideX * hand * 9,
          y + fy * 8 + sideY * hand * 9,
          x + fx * (reach + 10) - sideX * hand * 8,
          y + fy * (reach + 10) - sideY * hand * 8,
        );
      }
    } else if (classId === 'adept') {
      g.lineStyle(3, 0x8ce5d2, alpha);
      g.lineBetween(x + fx * 9, y + fy * 9, x + fx * (reach + 18), y + fy * (reach + 18));
      g.fillStyle(0xa9f1dc, alpha * 0.85);
      g.fillCircle(x + fx * (reach + 18), y + fy * (reach + 18), 5 + progress * 3);
    } else {
      g.fillStyle(0xffb65c, alpha);
      g.fillCircle(x + fx * 17, y + fy * 17, 4 + progress * 3);
      g.fillStyle(0xffe0a1, alpha * 0.82);
      g.fillRect(x + fx * 16 - 2, y + fy * 16 - 2, 4, 4);
    }
  }

  private drawWeapon(
    g: Phaser.GameObjects.Graphics,
    classId: ClassId,
    weapon: string,
    attack: NonNullable<ReturnType<AdventureEngine['getAttackAnimation']>>,
    x: number,
    y: number,
  ) {
    const directionLength = Math.hypot(attack.direction.x, attack.direction.y) || 1;
    const directionX = attack.direction.x / directionLength;
    const directionY = attack.direction.y / directionLength;
    const duration = classId === 'rogue' ? 145 : 210;
    const progress = 1 - Math.min(1, attack.remainingMs / duration);
    const swingAngle = (progress - 0.5) * 0.9;
    const cosine = Math.cos(swingAngle);
    const sine = Math.sin(swingAngle);
    const forward = {
      x: directionX * cosine - directionY * sine,
      y: directionX * sine + directionY * cosine,
    };
    const side = { x: -forward.y, y: forward.x };
    const point = (along: number, across = 0) => ({
      x: x + forward.x * along + side.x * across,
      y: y + forward.y * along + side.y * across,
    });
    const item = weapon.toLowerCase();
    const isBriarEdge = item.includes('briar');
    const hasNamedWeaponShape = isBriarEdge || /staff|rod|dagger|knife|wrap|fist|sword|blade|axe|mace|spear/.test(item);
    const isStaff = /staff|rod/.test(item) || (!hasNamedWeaponShape && classId === 'mage');
    const isDagger = /dagger|knife/.test(item) || (!hasNamedWeaponShape && classId === 'rogue');
    const isWrap = /wrap|fist/.test(item) || (!hasNamedWeaponShape && classId === 'adept');

    if (isWrap) {
      for (const hand of [-1, 1]) {
        const wrist = point(5, hand * 12);
        const start = { x: wrist.x - side.x * 5, y: wrist.y - side.y * 5 };
        const end = { x: wrist.x + side.x * 5, y: wrist.y + side.y * 5 };
        g.lineStyle(5, 0x302c2a, 1).lineBetween(start.x, start.y, end.x, end.y);
        g.lineStyle(3, 0x76503c, 1).lineBetween(start.x, start.y, end.x, end.y);
        g.lineStyle(2, 0x9fe1c1, 1).lineBetween(
          wrist.x - side.x * 2,
          wrist.y - side.y * 2,
          wrist.x + side.x * 2,
          wrist.y + side.y * 2,
        );
        g.fillStyle(0xe7c778, 1);
        g.fillRect(wrist.x - 1, wrist.y - 1, 3, 3);
        g.fillStyle(0x8fe5ca, 0.8);
        g.fillCircle(wrist.x, wrist.y, 3);
      }
      return;
    }

    if (isStaff) {
      const base = point(-9, -12);
      const crystal = point(19, -12);
      g.lineStyle(7, 0x2f3029, 1).lineBetween(base.x, base.y, crystal.x, crystal.y);
      g.lineStyle(4, 0x765039, 1).lineBetween(base.x, base.y, crystal.x, crystal.y);
      g.lineStyle(2, 0xc18d53, 1).lineBetween(
        base.x + side.x * 2,
        base.y + side.y * 2,
        crystal.x + side.x * 2,
        crystal.y + side.y * 2,
      );
      for (const distanceAlong of [-3, 5, 12]) {
        const wrap = point(distanceAlong, -12);
        g.fillStyle(0xb8874d, 1);
        g.fillRect(wrap.x - 3, wrap.y - 1, 6, 3);
      }
      g.fillStyle(0x3d302f, 1);
      g.fillCircle(crystal.x, crystal.y, 6);
      g.fillStyle(0x82c7c8, 1);
      g.fillTriangle(
        crystal.x,
        crystal.y - 5,
        crystal.x + 4,
        crystal.y,
        crystal.x,
        crystal.y + 5,
      );
      g.fillTriangle(
        crystal.x,
        crystal.y - 5,
        crystal.x - 4,
        crystal.y,
        crystal.x,
        crystal.y + 5,
      );
      g.fillStyle(0xf3e3a0, 1);
      g.fillRect(crystal.x - 1, crystal.y - 3, 2, 3);
      g.fillStyle(0xc2f2d9, 0.4);
      g.fillCircle(crystal.x, crystal.y, 8);
      return;
    }

    const drawBlade = (offset: number, length: number, accent: number) => {
      const gripBase = point(0, offset);
      const guard = point(5, offset);
      const tip = point(5 + length, offset);
      const bladeNeck = point(8, offset);
      const bladeColor = isBriarEdge ? 0x83b56d : accent;
      const bladeHighlight = isBriarEdge ? 0xe1f2b7 : 0xf0ead4;
      g.lineStyle(isDagger ? 5 : 6, 0x302a29, 1).lineBetween(gripBase.x, gripBase.y, guard.x, guard.y);
      g.lineStyle(3, 0x70442f, 1).lineBetween(gripBase.x, gripBase.y, guard.x, guard.y);
      g.lineStyle(1.5, 0xd6a363, 1).lineBetween(
        gripBase.x + side.x * 2,
        gripBase.y + side.y * 2,
        point(3, offset).x + side.x * 2,
        point(3, offset).y + side.y * 2,
      );
      g.lineStyle(6, 0x3d3430, 1).lineBetween(guard.x, guard.y, tip.x, tip.y);
      g.lineStyle(4, bladeColor, 1).lineBetween(bladeNeck.x, bladeNeck.y, tip.x, tip.y);
      g.lineStyle(1, bladeHighlight, 0.95).lineBetween(
        bladeNeck.x + side.x * 1.5,
        bladeNeck.y + side.y * 1.5,
        tip.x + side.x * 1.5,
        tip.y + side.y * 1.5,
      );
      if (isBriarEdge && !isDagger) {
        const thornOne = point(10, offset + 1);
        const thornTwo = point(15, offset + 1);
        g.fillStyle(0x4e7d43, 1);
        g.fillTriangle(
          thornOne.x,
          thornOne.y,
          thornOne.x + side.x * 7,
          thornOne.y + side.y * 7,
          thornOne.x + forward.x * 5,
          thornOne.y + forward.y * 5,
        );
        g.fillTriangle(
          thornTwo.x,
          thornTwo.y,
          thornTwo.x - side.x * 6,
          thornTwo.y - side.y * 6,
          thornTwo.x + forward.x * 4,
          thornTwo.y + forward.y * 4,
        );
      }
      g.lineStyle(isDagger ? 4 : 5, 0x45312a, 1).lineBetween(
        guard.x - side.x * 6,
        guard.y - side.y * 6,
        guard.x + side.x * 6,
        guard.y + side.y * 6,
      );
      g.lineStyle(2, 0xe3bd69, 1).lineBetween(
        guard.x - side.x * 4,
        guard.y - side.y * 4,
        guard.x + side.x * 4,
        guard.y + side.y * 4,
      );
      g.fillStyle(0xdcb96f, 1);
      g.fillCircle(gripBase.x, gripBase.y, 2);
      g.fillStyle(0xfff1c2, 0.95);
      g.fillCircle(gripBase.x, gripBase.y, 1);
    };

    if (isDagger) {
      drawBlade(-6, 8, 0xc8ddd1);
      drawBlade(6, 8, 0xaec8b9);
    } else {
      drawBlade(-12, 14, 0xdce4dd);
      g.lineStyle(1.5, 0xf6dda0, 0.9).lineBetween(
        point(8, -9).x,
        point(8, -9).y,
        point(17, -9).x,
        point(17, -9).y,
      );
    }
  }

  private drawTinyPerson(g: Phaser.GameObjects.Graphics, x: number, y: number, skin: number, cloth: number) {
    g.fillStyle(0x393c30, 0.32);
    g.fillEllipse(x + 1, y + 9, 23, 10);
    g.fillStyle(0x493b32, 1);
    g.fillEllipse(x - 5, y + 3, 8, 12);
    g.fillEllipse(x + 5, y + 3, 8, 12);
    g.fillStyle(0x70583b, 1);
    g.fillEllipse(x - 5, y + 8, 9, 6);
    g.fillEllipse(x + 5, y + 8, 9, 6);
    g.fillStyle(0x514339, 1);
    g.fillEllipse(x, y - 6, 23, 21);
    g.fillStyle(cloth, 1);
    g.fillEllipse(x, y - 7, 19, 18);
    g.fillTriangle(x - 8, y - 1, x + 8, y - 1, x, y + 9);
    g.fillStyle(0xe4ca91, 0.85);
    g.fillRect(x - 7, y - 1, 14, 2);
    g.fillStyle(0x493d34, 1);
    g.fillEllipse(x - 10, y - 7, 7, 12);
    g.fillEllipse(x + 10, y - 7, 7, 12);
    g.fillStyle(cloth, 1);
    g.fillEllipse(x - 10, y - 8, 5, 10);
    g.fillEllipse(x + 10, y - 8, 5, 10);
    g.fillStyle(skin, 1);
    g.fillEllipse(x - 11, y, 5, 6);
    g.fillEllipse(x + 11, y, 5, 6);
    g.fillRect(x - 3, y - 17, 6, 6);
  }

  private drawEnemies(actors: EnemyActor[]) {
    if (this.textures.exists('world-character-atlas')) {
      this.drawPixelEnemies(actors);
      return;
    }

    const g = this.actorGraphics;
    g.clear();
    const activeIds = new Set<string>();
    for (const actor of actors) {
      const actorId = actor.id.toLowerCase();
      const frame = actor.boss ? 7 : actorId.includes('slime') ? 5 : 6;
      const phase = this.time.now * 0.004 + actor.x * 0.013;
      const bob = Math.sin(phase) * (actor.boss ? 2 : 1.5);
      activeIds.add(actor.id);
      let sprite = this.enemySprites.get(actor.id);
      if (!sprite) {
        sprite = this.add.sprite(actor.x, actor.y, 'emberfall-world-sprites', frame);
        this.enemySprites.set(actor.id, sprite);
      }
      const size = actor.boss ? 104 : Math.max(50, actor.radius * 3.4);
      sprite.setVisible(true).setFrame(frame).setPosition(actor.x, actor.y + bob)
        .setDisplaySize(size, size).setDepth(actor.y + actor.radius);
    }
    for (const [id, sprite] of this.enemySprites) {
      if (!activeIds.has(id)) sprite.setVisible(false);
    }
    return;

    for (const actor of actors) {
      const { x, y, tint, radius, boss } = actor;
      const color = tint;
      const phase = this.time.now * 0.008 + x * 0.03;
      const bob = Math.sin(phase) * (actor.id.includes('slime') ? 2 : 1.5);
      g.fillStyle(0x2c342c, 0.35);
      g.fillEllipse(x, y + radius * 0.64, radius * 2.1, radius * 0.68);
      if (boss) {
        g.fillStyle(0xe86b3f, 0.12 + (Math.sin(phase * 0.7) + 1) * 0.035);
        g.fillCircle(x, y - 2, radius * 1.7);
        for (let i = 0; i < 7; i += 1) {
          const flameY = y - 18 + Math.sin(phase + i * 1.15) * 4;
          const flameX = x - 27 + i * 9;
          g.fillStyle(i % 2 ? 0xc94934 : 0xf28a45, 0.88);
          g.fillTriangle(flameX - 7, flameY + 13, flameX, flameY - 8 - (i % 3) * 3, flameX + 8, flameY + 13);
        }
        g.fillStyle(0x52372e, 1);
        g.fillEllipse(x - 14, y + 11, 11, 19);
        g.fillEllipse(x + 14, y + 11, 11, 19);
        g.fillEllipse(x - 13, y - 6, 10, 18);
        g.fillEllipse(x + 13, y - 6, 10, 18);
        g.fillStyle(0x9f4a35, 1);
        g.fillEllipse(x, y + 1, 47, 34);
        g.fillStyle(color, 1);
        g.fillEllipse(x - 2, y - 3, 38, 27);
        g.fillStyle(0xf08a4a, 0.9);
        g.fillEllipse(x - 8, y - 10, 19, 10);
        g.fillStyle(0x713a32, 1);
        for (let plate = -1; plate <= 1; plate += 1) {
          g.fillEllipse(x + plate * 9, y + 2, 8, 12);
          g.fillStyle(0xc45b3b, 1);
          g.fillEllipse(x + plate * 9 - 1, y, 4, 6);
          g.fillStyle(0x713a32, 1);
        }
        g.fillStyle(0x6e382f, 1);
        g.fillEllipse(x, y - 12, 28, 21);
        g.fillStyle(0xe98249, 1);
        g.fillEllipse(x, y - 12, 21, 14);
        g.fillStyle(0xf4cc8d, 1);
        g.lineStyle(4, 0xf4cc8d, 1);
        g.lineBetween(x - 8, y - 18, x - 15, y - 27);
        g.lineBetween(x - 15, y - 27, x - 22, y - 29);
        g.lineBetween(x + 8, y - 18, x + 15, y - 27);
        g.lineBetween(x + 15, y - 27, x + 22, y - 29);
        g.fillEllipse(x - 8, y - 13, 4, 3);
        g.fillEllipse(x + 8, y - 13, 4, 3);
        g.fillStyle(0x3e2927, 1);
        g.fillEllipse(x - 8, y - 13, 2, 2);
        g.fillEllipse(x + 8, y - 13, 2, 2);
        g.fillStyle(0x592f2a, 1);
        g.fillEllipse(x, y - 4, 12, 8);
        g.fillStyle(0x281f20, 1);
        g.fillEllipse(x - 4, y - 5, 2, 2);
        g.fillEllipse(x + 4, y - 5, 2, 2);
        g.fillStyle(0xf3d39a, 1);
        g.fillTriangle(x - 12, y - 7, x - 9, y + 1, x - 7, y - 6);
        g.fillTriangle(x + 12, y - 7, x + 9, y + 1, x + 7, y - 6);
        g.fillStyle(0xffbd62, 1);
        g.fillEllipse(x, y + 8, 8, 6);
        g.fillStyle(0xffefb2, 0.9);
        g.fillEllipse(x - 1, y + 7, 3, 2);
      } else if (actor.id.includes('slime')) {
        const squash = Math.sin(phase) * 0.06;
        g.fillStyle(0x305342, 0.65);
        g.fillEllipse(x, y + bob + 2, radius * 2.15, radius * (1.65 - squash));
        g.fillStyle(color, 1);
        g.fillEllipse(x, y + bob, radius * 2, radius * (1.8 - squash));
        g.fillStyle(0xd5f1a7, 0.8);
        g.fillEllipse(x - radius * 0.28, y - radius * 0.35 + bob, radius * 0.52, radius * 0.3);
        g.fillStyle(0xefffc7, 0.9);
        g.fillRect(x - radius * 0.3, y - radius * 0.38 + bob, 4, 3);
        g.fillStyle(0x3d5845, 0.85);
        g.fillEllipse(x, y + radius * 0.3 + bob, radius * 0.85, radius * 0.19);
        g.fillStyle(0x274438, 1);
        g.fillRect(x - 5, y - 4 + bob, 3, 6);
        g.fillRect(x + 3, y - 4 + bob, 3, 6);
        g.fillStyle(0xb9e597, 0.9);
        g.fillCircle(x - radius * 0.48, y + bob, 2);
        g.fillCircle(x + radius * 0.43, y + radius * 0.18 + bob, 2);
        g.fillStyle(0xf4d181, 0.75);
        g.fillRect(x - 2, y + radius * 0.25 + bob, 4, 2);
      } else if (actor.id.includes('wisp')) {
        const driftX = Math.sin(phase * 0.55) * 2;
        g.fillStyle(color, 0.12);
        g.fillCircle(x + driftX, y + bob, radius * 2.1);
        g.lineStyle(2, color, 0.45);
        g.strokeCircle(x + driftX, y + bob, radius * 1.2);
        g.fillStyle(color, 0.9);
        g.fillTriangle(x + driftX, y - radius + bob, x + radius + driftX, y + bob, x + driftX, y + radius + bob);
        g.fillTriangle(x + driftX, y - radius + bob, x - radius + driftX, y + bob, x + driftX, y + radius + bob);
        g.fillStyle(0xffe5a0, 1);
        g.fillCircle(x + driftX, y + bob, radius * 0.48);
        g.fillStyle(0x554550, 0.9);
        g.fillRect(x - 4 + driftX, y - 2 + bob, 2, 3);
        g.fillRect(x + 2 + driftX, y - 2 + bob, 2, 3);
        const moteAngle = phase * 0.8;
        g.fillStyle(0xffe39a, 0.85);
        g.fillCircle(x + Math.cos(moteAngle) * radius * 1.45, y + Math.sin(moteAngle) * radius * 1.45 + bob, 2);
        g.fillRect(x - radius - 3, y + radius * 0.8 + bob, 3, 2);
      } else if (actor.id.includes('bat')) {
        const flap = Math.sin(phase * 2) * 5;
        g.fillStyle(0x362f43, 1);
        g.fillTriangle(x - 3, y - 2, x - 20, y - 11 - flap, x - 14, y + 8);
        g.fillTriangle(x + 3, y - 2, x + 20, y - 11 + flap, x + 14, y + 8);
        g.fillStyle(color, 1);
        g.fillTriangle(x - 4, y - 1, x - 17, y - 8 - flap, x - 12, y + 7);
        g.fillTriangle(x + 4, y - 1, x + 17, y - 8 + flap, x + 12, y + 7);
        g.fillStyle(0x372b35, 1);
        g.fillTriangle(x - 7, y - 5, x - 9, y - 15, x - 2, y - 8);
        g.fillTriangle(x + 7, y - 5, x + 9, y - 15, x + 2, y - 8);
        g.fillStyle(color, 1);
        g.fillEllipse(x, y + bob, 16, 15);
        g.fillStyle(0xf4d586, 1);
        g.fillRect(x - 4, y - 2 + bob, 3, 3);
        g.fillRect(x + 2, y - 2 + bob, 3, 3);
        g.fillStyle(0xf1c3a0, 1);
        g.fillTriangle(x - 3, y + 5 + bob, x, y + 10 + bob, x + 2, y + 5 + bob);
      } else if (actor.id.includes('root') || actor.id.includes('guardian')) {
        const gy = y + bob;
        g.fillStyle(0x4a382d, 1);
        g.fillEllipse(x - 5, gy + 12, 13, 15);
        g.fillEllipse(x + 6, gy + 12, 13, 15);
        g.fillStyle(0x73553a, 1);
        g.fillEllipse(x - 7, gy + 18, 13, 5);
        g.fillEllipse(x + 8, gy + 18, 13, 5);
        g.lineStyle(7, 0x49372c, 1);
        g.lineBetween(x - 10, gy - 9, x - 19, gy + 3);
        g.lineBetween(x + 10, gy - 9, x + 19, gy + 3);
        g.lineStyle(4, 0x8a6240, 1);
        g.lineBetween(x - 17, gy + 1, x - 20, gy + 6);
        g.lineBetween(x + 17, gy + 1, x + 20, gy + 6);
        g.fillStyle(0x49372c, 1);
        g.fillEllipse(x, gy - 3, 28, 28);
        g.fillStyle(color, 1);
        g.fillEllipse(x, gy - 8, 25, 26);
        g.fillStyle(0x9a744c, 1);
        g.fillEllipse(x - 5, gy - 8, 5, 18);
        g.fillEllipse(x + 6, gy - 5, 4, 15);
        g.fillStyle(0x526a42, 1);
        g.fillEllipse(x - 12, gy - 15, 12, 9);
        g.fillEllipse(x, gy - 22, 13, 10);
        g.fillEllipse(x + 12, gy - 14, 12, 10);
        g.fillStyle(0x71834c, 1);
        g.fillEllipse(x - 4, gy - 24, 10, 6);
        g.fillCircle(x - 14, gy - 19, 4);
        g.fillCircle(x + 15, gy - 17, 4);
        g.lineStyle(3, 0x60432f, 1);
        g.lineBetween(x - 9, gy - 5, x - 14, gy - 14);
        g.lineBetween(x + 9, gy - 5, x + 14, gy - 13);
        g.fillStyle(0xffd77d, 1);
        g.fillEllipse(x - 5, gy - 11, 4, 3);
        g.fillEllipse(x + 5, gy - 11, 4, 3);
        g.fillStyle(0x3e3530, 1);
        g.fillEllipse(x, gy - 3, 9, 4);
        g.fillStyle(0x465c3d, 1);
        g.fillEllipse(x, gy + 8, 17, 8);
        g.fillStyle(0x9c7650, 0.95);
        g.lineStyle(2, 0x9c7650, 0.95);
        g.lineBetween(x - 3, gy - 17, x + 1, gy - 2);
        g.lineBetween(x + 2, gy + 2, x - 3, gy + 9);
      } else {
        const gy = y + bob;
        g.fillStyle(0x3d342e, 1);
        g.fillEllipse(x - 5, gy + 9, 8, 13);
        g.fillEllipse(x + 5, gy + 9, 8, 13);
        g.fillStyle(0x72563b, 1);
        g.fillEllipse(x - 5, gy + 15, 10, 5);
        g.fillEllipse(x + 5, gy + 15, 10, 5);
        g.fillStyle(0x403832, 1);
        g.fillEllipse(x, gy - 4, 27, 23);
        g.fillStyle(color, 1);
        g.fillEllipse(x, gy - 6, 22, 20);
        g.fillStyle(0x4a3d35, 1);
        g.fillEllipse(x - 11, gy - 6, 8, 14);
        g.fillEllipse(x + 11, gy - 6, 8, 14);
        g.fillStyle(color, 1);
        g.fillEllipse(x - 11, gy - 8, 6, 10);
        g.fillEllipse(x + 11, gy - 8, 6, 10);
        g.fillStyle(0x6a4939, 1);
        g.fillEllipse(x, gy - 20, 19, 18);
        g.fillStyle(color, 1);
        g.fillEllipse(x, gy - 21, 16, 16);
        g.fillStyle(0xc6aa77, 1);
        g.fillEllipse(x, gy - 12, 9, 6);
        g.fillStyle(0x42342f, 1);
        g.fillEllipse(x - 4, gy - 22, 3, 4);
        g.fillEllipse(x + 4, gy - 22, 3, 4);
        g.fillStyle(0xf5d17e, 1);
        g.fillEllipse(x - 4, gy - 20, 3, 3);
        g.fillEllipse(x + 4, gy - 20, 3, 3);
        g.fillStyle(0x392f2d, 1);
        g.fillEllipse(x - 4, gy - 20, 1.5, 2);
        g.fillEllipse(x + 4, gy - 20, 1.5, 2);
        g.fillStyle(0x99845d, 0.9);
        g.fillEllipse(x, gy + 2, 20, 4);
        g.fillStyle(0xd5b677, 1);
        g.fillCircle(x, gy + 2, 2);
        g.fillStyle(0xa08357, 1);
        g.fillEllipse(x - 2, gy - 3, 7, 4);
        g.fillEllipse(x + 2, gy - 3, 7, 4);
        g.fillStyle(0x40342f, 1);
        g.fillEllipse(x, gy - 2, 8, 4);
        g.lineStyle(3, 0x4a3d35, 1);
        g.lineBetween(x - 10, gy - 10, x - 17, gy - 15);
        g.lineBetween(x + 10, gy - 10, x + 17, gy - 15);
      }
      if (actor.hp < actor.maxHp || actor.boss) {
        const barWidth = actor.boss ? 62 : 38;
        g.fillStyle(0x342f2f, 0.86);
        g.fillRect(x - barWidth / 2 - 1, y - radius - 14, barWidth + 2, 7);
        g.fillStyle(0xc9b28d, 0.8);
        g.fillRect(x - barWidth / 2, y - radius - 13, barWidth, 5);
        g.fillStyle(actor.boss ? 0xf16c4c : 0xd75847, 1);
        g.fillRect(x - barWidth / 2 + 1, y - radius - 12, (barWidth - 2) * actor.hp / actor.maxHp, 3);
        g.fillStyle(0xffc282, 0.8);
        g.fillRect(x - barWidth / 2 + 1, y - radius - 12, Math.max(0, (barWidth - 2) * actor.hp / actor.maxHp), 1);
      }
    }
  }

  private drawPixelEnemies(actors: EnemyActor[]) {
    this.actorGraphics.clear().setVisible(false);
    const activeIds = new Set(actors.map(({ id }) => id));
    for (const [id, sprite] of this.enemySprites) {
      if (activeIds.has(id)) continue;
      sprite.destroy();
      this.enemySprites.delete(id);
      this.enemyMotionPositions.delete(id);
      this.enemyShadows.get(id)?.destroy();
      this.enemyShadows.delete(id);
      this.enemyHealthBars.get(id)?.destroy();
      this.enemyHealthBars.delete(id);
    }

    for (const actor of actors) {
      const { x, y, radius } = actor;
      const previous = this.enemyMotionPositions.get(actor.id);
      const travelX = previous ? x - previous.x : 0;
      const travelY = previous ? y - previous.y : 0;
      const travel = Math.hypot(travelX, travelY);
      const bossMoving = Boolean(actor.boss && previous && travel > 0.15 && travel < 24);
      this.enemyMotionPositions.set(actor.id, { x, y });
      const phase = this.time.now * (bossMoving ? 0.019 : 0.008) + x * 0.03;
      const bob = Math.round(Math.sin(phase) *
        (actor.boss ? bossMoving ? 4.5 : 1.6 : actor.id.includes('slime') ? 2 : 1.5));
      const bossLean = bossMoving
        ? Math.max(-0.1, Math.min(0.1, travelX * 0.009))
        : 0;
      const driftX = actor.id.includes('wisp') ? Math.round(Math.sin(phase * 0.55) * 2) : 0;
      const frame = actor.boss
        ? 5
        : actor.id.includes('slime')
          ? 1
          : actor.id.includes('wisp')
            ? 2
            : actor.id.includes('bat')
              ? 3
              : 4;
      const bossTexture = actor.boss ? BOSS_SPRITES_BY_NAME[actor.name] : undefined;
      const enemyTexture = actor.boss ? undefined : ENEMY_SPRITES_BY_NAME[actor.name];
      const spriteTexture = bossTexture ?? enemyTexture;

      let shadow = this.enemyShadows.get(actor.id);
      if (!shadow) {
        shadow = this.add.graphics();
        this.enemyShadows.set(actor.id, shadow);
      }
      shadow
        .clear()
        .setPosition(x, y + bob)
        .setAlpha(actor.blinkMs ? (actor.blinkMs > 130 ? 0.12 : 0.42) : 1)
        .fillStyle(0x27362d, 0.44)
        .fillEllipse(0, radius * 0.64, radius * 2.1, radius * 0.68)
        .setDepth(y + bob + 28)
        .setVisible(true);

      let sprite = this.enemySprites.get(actor.id);
      if (!sprite) {
        sprite = spriteTexture
          ? this.add.sprite(x, y, spriteTexture)
          : this.add.sprite(x, y, 'world-character-atlas', frame);
        sprite
          .setOrigin(0.5)
          .setDisplaySize(actor.boss ? (actor.name === 'The First Hunger' ? 176 : 136) : 64,
            actor.boss ? (actor.name === 'The First Hunger' ? 176 : 148) : 72);
        this.enemySprites.set(actor.id, sprite);
      }
      if (spriteTexture) sprite.setTexture(spriteTexture);
      else sprite.setTexture('world-character-atlas').setFrame(frame);
      sprite
        .setPosition(x + driftX, y + bob)
        .setDepth(y + bob + 29)
        .setVisible(true)
        .setAlpha(actor.blinkMs ? (actor.blinkMs > 130 ? 0.22 : 0.72) : 1)
        .setRotation(actor.boss ? bossLean : 0)
        .setDisplaySize(actor.boss ? (actor.name === 'The First Hunger' ? 176 : 136) : 64,
          actor.boss ? (actor.name === 'The First Hunger' ? 176 : 148) : 72);

      let healthBar = this.enemyHealthBars.get(actor.id);
      if (actor.boss || actor.hp < actor.maxHp) {
        if (!healthBar) {
          healthBar = this.add.graphics();
          this.enemyHealthBars.set(actor.id, healthBar);
        }
        const barWidth = actor.boss ? (actor.name === 'The First Hunger' ? 112 : 88) : 38;
        const healthRatio = Math.max(0, actor.hp / actor.maxHp);
        healthBar
          .clear()
          .setPosition(x, y - radius - 14)
          .fillStyle(0x342f2f, 0.86)
          .fillRect(-barWidth / 2 - 1, -1, barWidth + 2, 7)
          .fillStyle(0xc9b28d, 0.8)
          .fillRect(-barWidth / 2, 0, barWidth, 5)
          .fillStyle(actor.boss ? 0xf16c4c : 0xd75847, 1)
          .fillRect(-barWidth / 2 + 1, 1, (barWidth - 2) * healthRatio, 3)
          .fillStyle(0xffc282, 0.8)
          .fillRect(-barWidth / 2 + 1, 1, Math.max(0, (barWidth - 2) * healthRatio), 1)
          .setDepth(y + bob + 31)
          .setVisible(true);
      } else if (healthBar) {
        healthBar.clear().setVisible(false);
      }
    }
  }

  private drawEffects(projectiles: ReturnType<AdventureEngine['getProjectiles']>, effects: WorldEffect[]) {
    const g = this.effectGraphics;
    g.clear();
    for (const projectile of projectiles) {
      const speed = Math.hypot(projectile.vx, projectile.vy) || 1;
      const tailX = -projectile.vx / speed;
      const tailY = -projectile.vy / speed;
      const phase = this.time.now * 0.018 + projectile.id;
      g.lineStyle(Math.max(2, projectile.radius), projectile.tint, 0.22);
      g.lineBetween(
        projectile.x + tailX * projectile.radius,
        projectile.y + tailY * projectile.radius,
        projectile.x + tailX * projectile.radius * 4,
        projectile.y + tailY * projectile.radius * 4,
      );
      g.fillStyle(projectile.tint, 0.16);
      g.fillCircle(projectile.x, projectile.y, projectile.radius * 2.8);
      g.fillStyle(projectile.tint, 1);
      g.fillCircle(projectile.x, projectile.y, projectile.radius * (0.9 + Math.sin(phase) * 0.08));
      g.fillStyle(0xfff0c1, 0.8);
      g.fillCircle(projectile.x - 2, projectile.y - 2, Math.max(2, projectile.radius / 3));
      g.fillStyle(0xfff0c1, 0.75);
      g.fillRect(projectile.x + tailX * projectile.radius * 2 - 1, projectile.y + tailY * projectile.radius * 2 - 1, 2, 2);
    }
    for (const effect of effects) {
      const progress = 1 - effect.remainingMs / effect.durationMs;
      const life = Math.max(0, 1 - progress);
      const ringRadius = 5 + (effect.radius - 5) * progress;
      g.lineStyle(Math.max(1, 5 * life), effect.tint, 0.72 * life);
      g.strokeCircle(effect.x, effect.y, ringRadius);
      g.lineStyle(Math.max(1, 2 * life), 0xffe7ad, 0.58 * life);
      g.strokeCircle(effect.x, effect.y, Math.max(2, ringRadius * 0.62));
      g.fillStyle(effect.tint, 0.1 * life);
      g.fillCircle(effect.x, effect.y, Math.max(5, effect.radius * progress));
      for (let i = 0; i < 8; i += 1) {
        const angle = (i / 8) * Math.PI * 2 + progress * 0.8;
        const inner = ringRadius * 0.82;
        const outer = ringRadius * (1.12 + (i % 2) * 0.08);
        g.lineStyle(Math.max(1, life * 2), i % 2 ? effect.tint : 0xffe6a0, life * 0.82);
        g.lineBetween(
          effect.x + Math.cos(angle) * inner,
          effect.y + Math.sin(angle) * inner,
          effect.x + Math.cos(angle) * outer,
          effect.y + Math.sin(angle) * outer,
        );
      }
    }
  }

  private drawHungerScenery(cellId: string) {
    const site = HUNGER_SITES.find((s) => s.id === cellId);
    if (!site) return;
    const g = this.floor;
    const seed = site.row * 10 + site.column;
    // Corner rubble matches collision rectangles; centre and exits stay clear.
    g.fillStyle(0x53636a, 1).fillRect(82, 78, 98, 64).fillRect(460, 336, 92, 68);
    g.fillStyle(0x7d8a8c, 0.7).fillRect(90, 84, 40, 20).fillRect(470, 344, 36, 18);
    // Flat reliefs rather than additional collision obstacles. Keep them
    // clear of inscriptions, mechanisms and hidden gear caches as well.
    const spots: [number, number][] = [[230, 100], [410, 110], [210, 390], [420, 90], [100, 300], [550, 160]];
    const tone: Record<string, [number, number]> = {
      rib: [0xd8cdb4, 0x8d806a], mirror: [0xb9d6dc, 0x56777f], root: [0x8a5a58, 0x4a2f33],
      obelisk: [0x9a7f9c, 0x4d3c55], arena: [0xc08a5a, 0x5a3c36],
    };
    const [hi, lo] = tone[site.landmark];
    spots.forEach(([x, y], i) => {
      if ((seed + i) % 3 === 0) return;
      g.fillStyle(0x000000, 0.22).fillEllipse(x, y + 18, 44, 12);
      if (site.landmark === 'rib') {
        g.lineStyle(7, lo, 1).beginPath().arc(x, y + 14, 28, Math.PI, 0).strokePath();
        g.lineStyle(4, hi, 1).beginPath().arc(x, y + 14, 28, Math.PI, 0).strokePath();
      } else if (site.landmark === 'mirror') {
        g.fillStyle(lo, 1).fillRect(x - 15, y - 22, 30, 42);
        g.fillStyle(hi, 0.85).fillRect(x - 11, y - 18, 22, 34);
        g.lineStyle(2, 0xffffff, 0.5).lineBetween(x - 8, y + 10, x + 4, y - 14);
      } else if (site.landmark === 'root') {
        g.lineStyle(8, lo, 1).lineBetween(x - 24, y + 18, x, y - 4).lineBetween(x, y - 4, x + 22, y - 22);
        g.lineStyle(4, hi, 1).lineBetween(x - 24, y + 18, x, y - 4).lineBetween(x, y - 4, x + 22, y - 22);
        g.fillStyle(0xc65f68, 0.8).fillCircle(x, y - 4, 4);
      } else if (site.landmark === 'obelisk') {
        g.fillStyle(lo, 1).fillTriangle(x - 12, y + 18, x + 12, y + 18, x, y - 36);
        g.fillStyle(hi, 0.9).fillTriangle(x - 5, y + 18, x + 8, y + 18, x, y - 30);
        g.fillStyle(0xe6a76a, 0.9).fillCircle(x, y - 6, 3);
      } else {
        g.fillStyle(lo, 1).fillRect(x - 16, y - 8, 32, 26);
        g.fillStyle(hi, 0.9).fillRect(x - 16, y - 14, 32, 8);
      }
    });
    if (cellId === MAELIS_HUB) {
      g.fillStyle(0x2d4a4c, 0.7).fillEllipse(480, 120, 150, 90);
      g.lineStyle(3, 0x9fd2c4, 0.8).strokeEllipse(480, 120, 140, 82);
      g.fillStyle(0xf0c070, 0.85);
      for (let i = 0; i < 5; i++) g.fillCircle(430 + i * 25, 120, 5);
      g.lineStyle(2, 0xe6c88e, 0.6).strokeCircle(160, 380, 48);
    }
    if (cellId === HUNGER_ARENA) {
      g.fillStyle(0x4a2a30, 0.85).fillCircle(320, 240, 118);
      g.fillStyle(0x6a3a38, 0.7).fillCircle(320, 240, 86);
      g.lineStyle(3, 0xe0904f, 0.8).strokeCircle(320, 240, 120);
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        g.fillStyle(i % 2 ? 0xe0904f : 0x8a6a5a, 0.85).fillCircle(320 + Math.cos(a) * 104, 240 + Math.sin(a) * 104, 4);
      }
    }
  }
}

export function PhaserWorld({ engine }: { engine: AdventureEngine }) {
  useEffect(() => {
    const parent = document.getElementById('phaser-game');
    if (!parent) return;
    const game = new Phaser.Game({
      type: Phaser.WEBGL,
      parent,
      width: 256,
      height: 384,
      backgroundColor: '#718c5b',
      render: {
        antialias: false,
        pixelArt: true,
        roundPixels: true,
        transparent: false,
      },
      scale: {
        mode: Phaser.Scale.RESIZE,
        width: 256,
        height: 384,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      scene: [new EmberfallScene(engine)],
      input: { activePointers: 4 },
    });
    const gameHost = parent as HTMLElement & { __emberfallPhaserGame?: Phaser.Game };
    if (import.meta.env.DEV) gameHost.__emberfallPhaserGame = game;
    return () => {
      if (gameHost.__emberfallPhaserGame === game) delete gameHost.__emberfallPhaserGame;
      game.destroy(true);
    };
  }, [engine]);
  return null;
}
