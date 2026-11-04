# Goblin's Hollow

A small horror platformer built on the **mvGoblin** modular sprite pack.

You are a lone goblin descending into a pitch-black warren to relight the exit
brazier. Your lantern is the only light. Things with red eyes wait outside it.

## Getting started

```bash
pnpm install
pnpm dev        # dev server with hot reload  -> http://localhost:5173
pnpm build      # production build            -> dist/
pnpm preview    # serve the production build  -> http://localhost:4173
```

Requires Node 18+ and pnpm. The game is plain HTML/CSS/JS (ES modules) bundled
with Vite, and has no runtime dependencies.

## Controls

| Input | Action |
| --- | --- |
| `A` / `D` or `←` / `→` | Run |
| `W` / `Space` / `↑` | Jump (hold for a higher jump) |
| `J` / `X` / left click | Sword attack |
| `Esc` / `P` | Pause |
| `R` | Rise again (on the death screen) / restart (on the win screen) |
| `M` | Mute / unmute |

## How to play

1. Find the **three embers** scattered through the warren.
2. Each ember you take is one third of the brazier's fire.
3. With all three, the **exit brazier** wakes up — get back to it to escape.
4. Lantern posts are **checkpoints**. They also restore your health.

You have three hearts. The less health you have, the smaller your lantern and
the louder your heartbeat. Enemy goblins patrol the dark; they will chase you
once you come close. Two sword hits kill one.

## The horror

- **Darkness is the level.** Only a radius around your lantern, torches,
  embers and the lit brazier is visible.
- **Eyes in the dark** are drawn on top of the darkness, so you see enemies
  before you see their bodies.
- **A jump scare** waits in the corridor. Don't stop moving.
- A **looping music track** plays underneath a synthesized WebAudio bed (drone,
  heartbeat, sword whooshes, stings). Footsteps and the jump are real recorded
  clips — stone on the ground, wood on the planks.

## Files

```
index.html          canvas + module entry
package.json        scripts + Vite devDependency
vite.config.js      Vite config (relative base, dist output)
js/config.js        tunable constants (physics, light, combat)
js/input.js         keyboard + mouse state
js/audio.js         looping music + step/jump clips + WebAudio synth
js/assets.js        image loading + modular goblin compositing
js/sprites.js       animation table and sprite drawing
js/level.js         level geometry, pickups, collision
js/entities.js      player, enemies, embers, checkpoints, camera, particles
js/render.js        parallax, tiled stone geometry, darkness, vignette, grain
js/game.js          loop, combat, state machine, HUD, screens
public/assets/goblin/   copied from the mvGoblin pack
public/assets/tiles/    rock.png (copied from Tile Map.png)
public/assets/audio/    music.mp3, jump.wav, steps/ (stone + wood)
```

## Credits

Art:
- The **mvGoblin** asset pack (base body, outfits, hats, weapons).
- The **Tile Map** rock texture, used for the solid ground and platforms.

Audio:
- **Walking SFX** — stone and wood footsteps (`assets/audio/steps/`).
- **Jump.wav** — the jump sound.
- **Game Music** — the looping background track.

Everything else — code, lighting, layout, and the synthesized drone/heartbeat/
sword sounds — is generated for this game. The original files are left untouched
in their own locations.

## Notes

- The ground and platform blocks are filled with the rock texture from
  `public/assets/tiles/rock.png`. The stone body is mirror-tiled into a seamless
  pattern and darkened to match the game's palette, and the mossy top strip
  becomes the platform cap. Wooden one-way ledges and spikes are unchanged.
- The game uses the pack's `base.png` plus `outfits/`, `hats/` and `weapons/`.
  The player is assembled at runtime from body + outfit + hood layers.
- The game is bundled with Vite and uses ES modules, so it is served
  (`pnpm dev` / `pnpm preview`) rather than opened directly as a file.
- No pixel data is read from the images, so there are no canvas-tainting issues.
- Tested in a desktop browser. Keyboard and mouse only.
