# Liminal Drift

A first-person walking game about liminal spaces, built with [three.js](https://threejs.org/).
There is nothing to win. You drift from one empty place to the next.

**Play:** https://danishi.github.io/liminal-space/

No image or audio files are shipped: every texture is painted on a canvas at load time (including
PBR normal and roughness maps), and every sound is synthesised with the Web Audio API.

## How it works

- Each level is picked at random and built procedurally, so no two visits look the same.
- You leave a level when its **signal** (top right) fades out, when you walk through a **door that hums**
  (the light behind it hints at where it leads), or when you **fall into a hole**.
- Levels have height: stairs, sunken rooms, raised decks, platforms and pits.
- **Unease** grows with every level you pass through and with distance from where you arrived. The
  deeper you go, the more cluttered and wrong things get: more props and stranger ones, dead and
  flickering lights, murkier water, greyer skies, more holes, and apparitions that stand and watch.
  They never hurt you.
- Some residents will talk to you.

## Levels

| Code | Level | Mood | Residents and things |
| --- | --- | --- | --- |
| LEVEL 0 | The Backrooms | Sterile, uneasy | The Drifter, a ringing phone, a tall figure at the ends of hallways |
| LEVEL 37 | The Poolrooms | Bright, calm | The Big Duck, little ducks you can poke, deep ends you can sink into |
| LEVEL 3.14 | Pastel Dreamscape | Bright, whimsical | Mochi residents, holes that open onto the sky |
| LEVEL 188 | After-School Hallways 黄昏の校舎 | Nostalgic (Japan) | Students who stayed behind; after the chime, someone walks the halls |
| LEVEL 8 | Last-Train Underpass 終電後の地下通路 | Fluorescent, empty (Japan) | The station attendant; don't step onto the tracks |
| LEVEL 1000 | Thousand Gates 千本鳥居 | Mystical, night (Japan) | The white fox, stone lanterns, a thousand torii |
| LEVEL 11 | The Night Hotel | Dark, eerie | The bellboy, a grin in the dark |

## Controls

| Input | Action |
| --- | --- |
| `↑` `↓` / `W` `S` | Walk forward / back |
| `←` `→` | Turn (you can play with the keyboard only) |
| `A` `D` | Step sideways |
| Mouse | Look around (click to capture the pointer) |
| `Shift` | Run |
| `E` / `Space` / left click | Talk, interact, continue dialogue |
| `F` | Flashlight (where available) |
| `M` / `Tab` | Map |
| `Esc` / `P` | Pause |

- **Steering assist** (Settings: Off / Low / Medium / High): while you walk and aren't looking around
  by hand, the view follows the open path around corners and levels itself.
- **Touch:** drag on the left half to move, on the right half to look; on-screen buttons for run,
  interact, light and map.
- **Gamepad:** left stick moves, right stick looks, A interacts, RB/RT runs, Y toggles the light,
  Start pauses, Back opens the map.

Settings (look sensitivity, field of view, volume, graphics quality, steering assist, minimap,
inverted look, head bob, reduced screen effects, FPS counter) are saved in the browser.

## Graphics

- PBR materials with procedural normal and roughness maps
- Per-level reflection probe (PMREM) captured at the arrival point
- Ground-truth ambient occlusion (GTAO) on Medium and High
- Rectangular area lights for fluorescent panels, pooled so only the nearest fixtures are real lights
- AgX / neutral tone mapping, bloom, and a camcorder pass (grain, vignette, chromatic aberration)
- Static props are merged per material, so hundreds of props cost only a few draw calls

## Development

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # outputs dist/
npm run preview
```

## Deployment

`.github/workflows/deploy.yml` builds every push and pull request, and deploys `main` to GitHub
Pages. Pages must use **Settings → Pages → Source: GitHub Actions**.

## Project layout

```
src/
  core/      grid (2.5D height field), procedural surfaces and textures, audio, input,
             post-processing, light pool
  game/      game loop and drifting, player (steering assist, gravity), world (collision, unease, doors)
  entities/  residents (NPC), doors to other levels, apparitions
  props/     prop kit (batched merging), prop library, canvas-painted signs and posters
  stages/    one module per level, plus shared shell/decoration helpers
  ui/        screens, HUD, maps
```
