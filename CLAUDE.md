# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Language

- Code, comments, README, commit messages and pull request titles/descriptions: **English**.
- All in-game UI text and dialogue: **English**. Japanese appears only as flavour inside the Japan-themed
  levels (level subtitles, in-world signage such as station signs, ema plaques, chalkboards), usually
  paired with English the way real bilingual signs are.
- The maintainer is Japanese; replies in chat should be in Japanese.

## Project

Liminal Drift is a three.js walking game (Vite, plain ES modules, no framework, no TypeScript). There
are no quests: levels are chosen at random and you drift between them via humming doors, holes, or when
the level's signal (a timer) runs out. See README.md for the player-facing description.

Commands:

```bash
npm install
npm run dev     # local dev server
npm run build   # production build to dist/ — run this before committing
```

CI only builds and deploys `main` to GitHub Pages; there is no PR check. There is no test suite. Verify changes by building and, for gameplay changes, by running the game.
For headless checks use Playwright with Chromium (`--use-angle=swiftshader`); software rendering runs at
about 1 fps, so drive gameplay by calling `window.__game.updatePlay(dt)` in a loop rather than waiting
in real time.

## Architecture

- `src/core/grid.js` — the 2.5D tile map every level is built on. Cells have a type (`FLOOR`, `WALL`,
  `WATER`, `DOORWAY`, `VOID`, `HOLE`) and a floor height; ramp cells are stairs. `passable()` decides
  whether you can walk between neighbours (max step 0.55 m). Geometry builders (`buildWallFaces`,
  `buildFloors`, `buildRisers`, `buildStairs`, `buildCellQuads`) turn the grid into merged meshes.
- `src/game/world.js` — a built level: collision (grid + prop boxes + circles, height-aware), the
  `unease(i, j)` gradient, doors to other levels, entities. Stage modules fill it in.
- `src/game/game.js` — renderer, post-processing, reflection probe capture, the drift flow, HUD updates.
- `src/game/player.js` — movement, keyboard turning, steering assist, gravity and falling.
- `src/stages/*.js` — one module per level. Contract: `{ id, code, name, sub, tint, build(world),
  makeDoor(world, destStage) }`. In `build`, carve the grid, set `world.spawn`, call
  `world.finalizeLayout()` (seals unreachable pockets and computes distances), then build geometry,
  lights, props (`decorate` with a prop table), residents and apparitions, and fill `world.env`.
- `src/stages/common.js` — `buildShell`, `ceilingFixtures`, `doorModel`, `decorate`, `stairRun`.
- `src/props/` — `PropKit` builds props from primitives and merges static meshes per material in
  `finish()`; mark animated or individually-changing meshes with `keep()`. `library.js` holds the prop
  builders; each has `place` (`wall`, `high`, `floor`, `clutter`, `ceil`) and an optional footprint `fp`.
- `src/core/assets.js` — photo-scanned CC0 assets from Poly Haven in `public/assets` (1k texture sets as
  WebP, meshopt-compressed GLB models, HDRIs), listed in `manifest.json`. A stage declares what it needs
  in `assets: { textures, models, hdris }`; the game awaits `preload()` before `build`, so builders use
  the synchronous getters (`photo(id, { uvScale })`, `model(id)`, `hdri(id)`). `photo` repeats the
  texture to its real-world size given the geometry's UV scale. `PropKit.model()` and
  `P.modelProp(id)` place models; model materials are shared (`userData.shared`) and never disposed.
- `src/core/surfaces.js` — procedural PBR surfaces (colour + normal + roughness), cached by key.
- `src/core/bake.js` — per-vertex baked lighting and AO (`bake` attribute, applied through a material
  shader patch). `World.bake()` runs after `stage.build`; light pool fixtures are sources automatically,
  extra sources go in `world.bakeSources`, and `world.env.bake` tunes it (`hemi`, `dynamic`, `bounce`,
  `fixtureScale`, `tess`) or disables it (`false`). Geometry from the grid builders is tagged
  `userData.quads` so it can be tessellated before baking.

## Conventions

- Binary assets are CC0 only (Poly Haven) and are fetched and optimized by `node scripts/fetch-assets.mjs`
  (downloads, converts textures to WebP, compresses models, writes the manifest). Add new ones to the
  lists in that script rather than committing hand-made files. Signs, posters and small details stay
  canvas-generated; sounds are Web Audio.
- Keep the number of lights constant within a level (the flashlight always exists, light pools have a
  fixed size) to avoid shader recompiles mid-level.
- Apparitions are never lethal. The game has no fail state.
- New content should respond to unease: use the `min`/`max` thresholds in prop tables and scale
  densities or effects with `world.depth` / `world.unease()`.
- Match the surrounding code style: 2-space indentation, single quotes, semicolons, short comments
  that explain intent.
