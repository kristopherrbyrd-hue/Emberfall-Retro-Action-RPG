# Emberfall v0.3: Character creator, modular art, movement and world performance

## Included

- **Eight playable visual bases:** male and female versions of Warrior, Rogue, Adept and Mage, using compact transparent RGBA atlases in `public/modular-heroes/`.
- **Four directional views:** down, left, right and up. Seven columns per facing: idle + six walking poses. Each 128-pixel tile scales cleanly to the game's 256-pixel hero canvas without smoothing.
- **Indexed material region atlases** (`*-regions.png`) for skin, hair, main cloth, secondary cloth, trim, leather and metal. The same regions can be recolored with full hexadecimal color pickers, with no new shape files required.
- **New creator options:** male/female, hair style, facial hair, headwear, continuous skin/hair/eye/cloth/trim/secondary/leather/metal color controls, four-direction live character preview and a walk-preview toggle.
- **Player save compatibility:** the existing optional `bodyType` in character config is kept, defaulting older saves to the male version. New colors are optional.
- **More efficient overworld:** the existing 3×3 terrain streaming stays intact, nearby dynamic props/enemies are camera-filtered, static props are refreshed around 10 times a second, and guide pathfinding no longer runs on every render frame.
- **Existing Android status bar/cutout fix:** retained in `scripts/setup_android.py`.

## Asset layout

`public/modular-heroes/<class>-<male|female>.png`: 896×512 RGBA. Columns: `idle`, `walk-0` ... `walk-5`. Rows: `down`, `left`, `right`, `up`.

`public/modular-heroes/<class>-<male|female>-regions.png`: identical dimensions with material ID in the red channel: 40=skin, 80=hair, 100=secondary fabric, 120=main cloth, 160=trim, 200=leather, 240=metal. 0=untinted / outline.

Original generated concept boards are included in `art-reference/`; they are NOT game-ready separated art layers.

## Art limitations to test/refine

**This is a functional first-pass integration, not hand-polished animation.** The generated contact sheets overlapped some front- and rear-view frames with adjoining sprite rows, so the vertical walk cycles currently use an intact base idle with a small bob. This is intentional to avoid missing limbs or overlaid text in-game. The LEFT and RIGHT rows contain the exported six drawn poses and should be checked frame by frame for believable *alternating* legs. The accessory module shapes are an initial procedural set that should be replaced with individually hand-drawn overlay sprites aligned to each class and direction before shipping. Existing attack poses still use the original attack artwork, pending matching female/male attack sheets. The indexed material masks are automated and may need pixel-by-pixel cleanup to avoid recoloring unintended highlights.

## Verification completed

- All 8 RGBA atlases and mask atlases checked for the expected dimensions, no missing 4×7 cells and distinct side-walk poses using `python scripts/check_modular_assets.py`.
- TypeScript checked for `src/game/data.ts`, `src/game/modularHero.ts`, `src/game/heroAppearance.ts` independently; syntax transpilation checked for the UI, world, simulation, and rendering files.
- **Full `npm install`, complete test suite, APK compilation and on-phone gameplay are NOT verified in this container.** Dependency installation stalled; run these in Codex or GitHub Actions before merging.

## Instructions for Codex / code reviewer

Work in the existing `kristopherrbyrd-hue/Emberfall-Retro-Action-RPG` repository on the `fix/emberfall-android-ui-animation` development branch. Apply the contents of the companion PATCH ZIP, preserving paths. Keep the user's existing working `main` branch untouched. Then run `npm install`, `npm run typecheck`, `npm test`, `npm run build`; build an Android APK using the existing workflow and test on a phone. Correct any failures. Verify all 8 class/body pairings, palette customization/save and load, side-walk animation, quest progression, dungeon transition, and performance. Do not claim the procedural accessories or incomplete vertical walk frames are final art.

To build locally after dependencies are installed: `npm run build`, `npx cap add android`, `npx cap sync android`, `python3 scripts/setup_android.py`, `cd android && ./gradlew assembleDebug`.
