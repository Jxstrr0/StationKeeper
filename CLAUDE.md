# Notes for Claude

Station Keeper is a commercial space station tycoon by Longlight Interactive. Build a station module by
module in low Earth orbit and keep it alive, solvent and full of paying guests. Power, thermal, life support,
structure, crew, traffic and money share one resource network, so failures cascade. Phone-first, free, live at
https://stationkeeper.longlight.games/ (repo https://github.com/Jxstrr0/StationKeeper; the old
jxstrr0.github.io/StationKeeper/ address forwards there).

Read this file first, then `docs/STATUS.md` (every session's build notes, choices and the "Next" list at the
end; it's long, so grep the session you need). `README.md` is the short public guide.

## Stack

- Vite 8.3 + TypeScript 5.9 (strict; ESLint bans `any`), Three.js 0.187 from npm, Vitest 5.1. No UI
  framework: the overlay is plain HTML and CSS in `src/ui`.
- 3D art from Blender would be `.glb` files in `public/models/`, stored with Git LFS (`.gitattributes`). The
  modules are currently procedural grey-boxes with detail; the loader prefers a `.glb` when a module's data
  names one (`public/models/README.md` has the node names).
- CI uses Node 22.

## Commands

```bash
npm ci              # install (npm install also works)
npm run dev         # local server
npm run check       # typecheck, lint, tests, build: run before every push
npm test            # vitest run (tests/*.test.ts)
npm run build       # production build into dist/
npm run preview     # serve dist/ locally
```

## Build, version and deploy

- `.github/workflows/deploy.yml` ("Test and deploy") runs on every pull request and every push to `main`:
  checkout with LFS, `npm ci`, typecheck, lint, tests, build. On `main` it then publishes `dist/` to GitHub
  Pages. On a pull request it stops after the build, so the green check on a PR is that `build` job.
- `vite.config.ts` sets `base: './'` (relative), so the same build works at the root of its own domain
  (`stationkeeper.longlight.games`, the Pages custom domain) and under any sub-path. Asset URLs for
  `public/` files are built from `import.meta.env.BASE_URL` (`./` at runtime), never a hard-coded `/StationKeeper/`.
- The game version is `GAME_VERSION` in `src/version.ts` (now 0.1.2.1), shown small on the title screen. Four
  numbers, Major.Minor.Patch.Build: Major = overhaul, Minor = feature batch, Patch = tweak or fix, Build =
  republish. Bump it in the pull request that ships the change. `package.json` keeps npm's three-number
  `version`; leave it alone.

## Code rules (the code follows these; keep it that way)

- **The sim stays pure.** `src/sim` is plain TypeScript with no DOM, Three.js, view or UI imports; ESLint
  enforces it (`no-restricted-imports` in `eslint.config.js`). It runs headless in the tests.
- **Deterministic.** One tick per in-game minute (`src/sim/time.ts`); randomness only through the seeded
  Mulberry32 in `src/sim/rng.ts`. The same save and commands give the same station.
- **UI talks to the sim through commands** (`simulation.command()`) and reads `snapshot()`. The view
  (`src/view`) draws snapshots and never changes sim state.
- **Data, not magic numbers.** Module stats live in `src/data/modules.json`; each posting (thresholds, orbit,
  layout, goals, resupply) in `src/data/scenarios/*.json`. Both are validated at load (`src/sim/data.ts`).
- **Saves:** localStorage keys all start `stationkeeper.` (`save`, `slot.1` to `slot.N`, `settings`,
  `records`, `company`, `mode`, `tutorial`, `hudCompact`, `nextScenario`, `skipTitle`), every access wrapped
  in try/catch. Backup codes are `SK1:` + base64url(JSON) + a 6-character checksum (`src/backup.ts`); restore
  checks the whole code before writing. A new key that holds progress must go into `BACKUP_KEYS` there. When
  the save shape changes, old saves must keep loading or be refused cleanly (`tests/save.test.ts`,
  `tests/slots.test.ts`, `tests/backup.test.ts`).
- **Own origin, same prefix rule.** Since November 2026 the game has its own origin
  (`stationkeeper.longlight.games`), so its own localStorage, Cache Storage and quota; saves from before the
  move stay on `jxstrr0.github.io`. Still use only the `stationkeeper.` prefix and never clear anything
  outside it.
- **Phone-first.** Touch first (drag to orbit, pinch to zoom, tap a module, swipe sheets down), safe areas,
  portrait and landscape, Reduce Motion respected. Pixel ratio is capped at 2 and steps down when frames
  are slow.
- Comments in plain English say what a file holds and why anything non-obvious is done.

## Where things live

- `index.html`: the page, with the inline loading screen (driven by `src/ui/bootScreen.ts`).
- `src/main.ts`: boot, the game loop, wiring the sim, view and UI together.
- `src/sim/`: `simulation.ts` (owns state, `tick()`, `command()`, `snapshot()`, saves), `orbit.ts`,
  `station.ts` (module graph and ports), `network.ts` (the tiered power solver), `systems/` (power, thermal,
  lifeSupport, crew, guests, economy, reliability), `warnings.ts`, `forecast.ts`, `events.ts`, `time.ts`,
  `rng.ts`, `data.ts`, `types.ts`.
- `src/company/`: company mode (several stations, the board, milestones, its own store).
- `src/view/`: the Three.js scene (Earth, sun, stars, station, build view, camera, wear, cargo, sparks).
- `src/ui/`: the HUD, sheets (module, build, finance, crew, warnings, saves, settings, help, report, end),
  title screen, scenario picker, coach and toasts, plus their CSS.
- `src/audio/sound.ts`: sound. `src/persist.ts`, `slots.ts`, `backup.ts`, `storageCare.ts`
  (`navigator.storage.persist`), `settings.ts`, `records.ts`, `tutorial.ts`, `scenarios.ts`.
- `tests/`: Vitest, one file per system or screen, plus `helpers.ts`.
- `public/`: favicon, home-screen icons, `manifest.webmanifest`, `models/`.
- `docs/STATUS.md`: the build log and what's next.

## How Kelbo works

- Beginner-plus coder who tests on his phone from the live URL. End every task with a plain-language summary
  of what changed and how to test it on a phone.
- Work on a `claude/...` branch and open a pull request into `main`. Never push straight to `main`. Once
  `npm run check` passes locally and the PR check is green, merge it yourself: Kelbo has given standing
  permission.
- Keep pull requests small enough to review on a phone. Add a section to `docs/STATUS.md` for each change.
- Real design decisions get asked, not guessed; record the answer in `docs/STATUS.md`. Small calls: decide
  and note them there.
- Use the name Kelbo only, never a real name or initials, anywhere in the repo.
- Commits: author `Jxstrr0 <322161611+Jxstrr0@users.noreply.github.com>` (never a real email address), and
  keep the Co-Authored-By trailer for Claude.

## Current status (0.1.2.1, November 2026)

- Built and live: power with eclipses and load shedding, thermal, life support with water resupply, crew,
  guests and reviews, money and loans, reliability and repairs, build mode, five scenarios (Longlight One,
  Halyard, Kittiwake, Saltglass, Velvet Reach), company mode, save slots, backup codes and files, settings,
  How to play, sound, visual wear, the home-screen icon and the loading screen.
- Next: see the end of `docs/STATUS.md` (play-testing on a real phone first, then more scenarios, more for
  guests to want, art, sound tuning).

## Longlight brand (studio pieces only)

This game keeps its own look. Its fonts, colours and art style stay as they
are, and game screens are never restyled to match the studio. The Longlight
brand applies only to studio pieces: the studio logo or splash, the
"Longlight Interactive" credit line, the studio block on a credits or about
screen, and any link back to the studio site.

- **Logo:** the horizon lockup, a half-set clay sun on a long horizon line
  with LONGLIGHT above INTERACTIVE. Use the official files from the studio
  site's press kit (https://longlight.games/press.html; the
  files are `assets/press/longlight-logo-dark` and `longlight-logo-light`,
  SVG plus 2x PNG, in `Jxstrr0/Kelbo.Website`). Copy them into this repo;
  never hotlink, redraw or recolour them, or swap the letters for live text.
- **Colours, inside studio pieces only:** Clay `#D97757`, Purple `#7B3FC4`,
  Slate `#141413`, Ivory `#FAF9F5`, Lilac `#B48CE8`. Nothing else in the
  logo or the studio block.
- **Font, inside studio pieces only:** Space Grotesk 500/700. If a studio
  piece uses it, self-host it; don't add a new font host or outside request.
- **Name:** always "Longlight Interactive" in full. Credit line:
  "© year Kelbo / Longlight Interactive" (the studio isn't a registered
  business yet). Never Kelbo's real name or initials.
- **Studio site:** https://longlight.games/

## Studio catalogue

`LONGLIGHT-STUDIO.md` (repo root) covers every Longlight game: looks, names
already taken, storage and cache prefixes (kept from the shared-origin days), a reuse map and
improvement ideas. Read it before pitching new ideas, names or looks, and
before building a system another Longlight game may already have. This file
wins where the two disagree. Don't edit the copy here: the master is
`.github/LONGLIGHT-STUDIO.md` in Jxstrr0/Kelbo.Website; it gets recopied.
