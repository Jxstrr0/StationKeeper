# Station Keeper: status

## Session 1 (Slice 1): one station in orbit with real power

### What was built

- **Scaffold:** Vite + TypeScript (strict, ESLint bans `any`) + Three.js + Vitest. `npm run check` runs typecheck, lint, tests, and build.
- **Deploy:** `.github/workflows/deploy.yml` checks out with LFS, runs typecheck, lint, tests, build, then deploys `dist/` to GitHub Pages on pushes to `main` (PRs build and test only). Vite `base` is `/StationKeeper/`.
- **Sim (`src/sim`, pure TS, lint-enforced no DOM/Three.js):**
  - `orbit.ts`: circular 420 km orbit with real constants (period ≈ 92.6 min) and a cylindrical Earth shadow. At beta 0 that gives ≈ 36 min of eclipse per orbit (≈ 39%). A short soft edge avoids a hard light switch.
  - `station.ts`: module graph built from the scenario layout, with port validation (unknown ports, double-used ports, multiple roots).
  - `network.ts`: a generic resource network solver (supply, a store, tiered loads). Tier shedding uses hysteresis on the stored fraction (Commercial below 25%, back above 40%; Essential below 10%, back above 20%). It also enforces a hard limit: Commercial, then Essential, are shed if supply plus the battery's discharge limit can't cover demand. Critical is shed only when the store is empty *and* supply is short.
  - `systems/power.ts`: arrays generate `generationKw × sunlight`, batteries pool their charge, and every module carries one load on a tier.
  - `time.ts` (fixed tick = 1 in-game minute; pause / 1× / 5× / 20×), `rng.ts` (seeded Mulberry32), `events.ts` (typed bus), `simulation.ts` (owns state, `tick()`, `command()`, `snapshot()`).
- **Data:** `src/data/modules.json` (core, solar array, battery pack, guest habitat; power stats, ports, grey-box hints) and `src/data/scenario.json` (start date, orbit, thresholds, layout). Both are validated at load.
- **View (`src/view`):** a procedural shader Earth with clouds, terminator, city lights and an atmosphere rim; a starfield; and a sun sprite plus directional light that track the orbit. The station is placed port-to-port. Status lights are lilac when powered, blink clay when shed, and turn grey when switched off. Habitat windows go dark when shed, and the solar wings track the sun. The camera is touch-first: drag to orbit, pinch to zoom, tap to select. It has limits so it never goes inside Earth.
- **Module models:** `ModuleModelLoader` loads a `.glb` when a module has a `"model"` path and falls back to grey-box otherwise. See `public/models/README.md` for node naming (`status_light`, `gimbal`, `glow*`).
- **UI (`src/ui`, HTML/CSS overlay):** the top bar shows date and time (UTC), speed buttons, sunlight/eclipse with a countdown, generation, load, battery %, and charge/discharge, plus a load-shedding banner. Tapping a module opens a bottom sheet (draw, tier, status, output/stored, switch off/on; swipe down to close). Toasts report shed and restore events, with a little dry humour.
- **Tests (`tests/`, 31):** orbit period and eclipse fraction; the network solver (thresholds, hysteresis, discharge limit, critical rules); eclipse drains the battery; sunlight recharges it; shedding order Commercial → Essential → Critical, with Critical only once the battery is empty; a Commercial shed and restore each normal orbit; switching a module off; determinism; data validation; the clock; rng.

### Power balance (by design)

Generation is 22 kW peak, the load is 11.7 kW, and the battery holds 9 kWh with an 8 kW charge limit. The battery is deliberately a little small. Each eclipse ends with the Guest Habitat (Commercial) shed for roughly the last 3 minutes of darkness and the first ~12 minutes of sunlight. The battery then refills to 100% before the next eclipse. This gives the player a visible problem to solve once build mode lands.

### How to test on a phone

1. Open the Pages URL: `https://jxstrr0.github.io/StationKeeper/`. For a home-screen app feel, use Share → Add to Home Screen.
2. Drag to orbit the camera and pinch to zoom. Tap a module to open its sheet, and tap empty space or swipe the sheet down to close it.
3. Press **20×**. The battery drains in eclipse (the card shows "Eclipse" and a negative kW) and refills in sunlight. Near the end of each eclipse the habitat sheds: a clay blinking light, dark windows, a banner, and a toast.
4. Open the Guest Habitat sheet and switch it off. Load drops by 6 kW and the habitat no longer sheds.

### Choices made (ambiguities)

- **Frame:** the view is in the station's local frame (x along track, y up). Earth, stars, and the sun rotate around the station once per orbit. Earth is scaled down (900 m radius at 60 m altitude) but keeps the real altitude-to-radius ratio, so eclipse timing matches what you see.
- **Tick sunlight:** each tick uses sunlight at the middle of that minute. The view interpolates the orbit phase between ticks, so the light moves smoothly.
- **Speeds:** 1× = 1 game minute per real second (one orbit ≈ 1.5 min); 5× and 20× are the fast speeds. Ticks per frame are capped so a backgrounded tab never stalls the game.
- **Switched-off modules** draw nothing, and a switched-off battery leaves the storage pool. This is a command from the sheet, the first use of the UI → sim command path.
- **Performance:** pixel ratio is capped at 2 and drops by 0.25 steps if frames stay slow (and recovers when fast). Repeated parts (truss, fins, windows) are instanced. Materials are shared. The glTF loader is lazy-loaded.
- **Beta angle** is 0 (the worst-case eclipse). It's in `scenario.json` for later seasons.

### Known gaps

- Penumbra and beta angle are static. No battery efficiency losses yet.
- Verified headless in an emulated Pixel 7 (SwiftShader). Still needs a real-device check of frame rate and touch feel.

## Next slice: Thermal

Every powered module produces heat equal to its draw. Radiators reject heat, more on the night side. Add a thermal store per module or loop through `network.ts`, overheating effects (throttling, then shedding), and a Heat overlay toggle that tints modules. Reuse the network solver for the coolant loop, and add a radiator module to `modules.json`.
