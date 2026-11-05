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

## Session 2 (Slice 2): thermal

### What was built

- **Sim (`src/sim/systems/thermal.ts`):** one shared coolant loop.
  - **Heat in:** every kW a module actually draws becomes a kW of heat in the loop.
  - **Heat out:** radiators reject up to `rejectKw` in full eclipse, falling to `rejectKw × sunlitFactor` in full sunlight, because the Sun and Earth glare warm the panels. The radiator valves hold the loop at its setpoint (18 °C) when there is capacity to spare, and never chill it below.
  - **Hysteresis bands on loop temperature** (`scenario.json` → `thermal`):
    - **Throttle:** Commercial loads run at 60% of their draw above 24 °C, and the throttle clears below 21 °C.
    - **Trips:** Commercial above 30 °C (back below 25), Essential above 36 (back below 30), Critical above 45 (back below 38). A lower tier never runs while a higher one is tripped.
  - **Never tripped:** radiators, since tripping the cooling would only cook the station faster.
  - **Module temperatures:** each module sits above the loop by `riseCPerKw × its heat` and follows that target with an 8-minute lag. These feed the Heat overlay.
  - **Cascade:**
    - Power runs first, using last tick's throttle and trip flags.
    - Thermal then runs on what actually drew power.
    - Tripped modules draw nothing next tick ("overheated" status).
    - Radiator pumps are an Essential power load, so a deep power shortage stops the radiators and the loop warms.
- **Data:** every module has a `thermal` block. New **Radiator Array** module (0.8 kW Essential pumps, 15 kW rejection, 0.66 in sunlight) on the core's port side. Both data files are validated, including band order and throttle factor range.
- **View:**
  - **Radiator grey-box:** a truss with a T of six white panels. They face the orbit normal, so they stay edge-on to the Sun, as real radiators are steered to.
  - **Heat overlay:** the **Heat** button in the power card. Each module swaps to its own tint material coloured from a shared scale (blue below setpoint, lilac healthy, peach to red when hot), with a legend. Draw calls don't change.
  - **Status lights:** pale clay when throttled; red and blinking when tripped. Habitat windows dim when throttled.
- **UI:**
  - **Power card:** a coolant loop row showing the temperature, a gauge from setpoint to first trip with a tick at the throttle point, and "Warming / Cooling / Holding" with kW.
  - **Notes:** "Running hot" and "Overheating" join the shedding note.
  - **Module sheet:** Temperature and Heat to loop rows; radiators show "Rejecting". Draw shows "throttled from" when throttled.
  - **Toasts:** throttle, trips, and recoveries.
- **Tests (`tests/thermal.test.ts`, 40 total):**
  - Radiators reject more in eclipse.
  - Heat equals power drawn.
  - The loop warms in sunlight and returns to setpoint in eclipse.
  - Throttling cuts Commercial draw to the throttle factor.
  - Trip order is throttle → Commercial → Essential → Critical, with Critical only at 45 °C, and radiators are never tripped.
  - Tripped modules draw nothing and come back once cooled.
  - Switching the radiators off overheats the station.
  - The default scenario throttles but never trips.

### Thermal balance (by design)

Heat is 12.5 kW with everything on, against 15 kW of rejection in eclipse and 9.9 kW in sunlight. The loop climbs about 6 °C over each day pass. In the last few minutes of sunlight it crosses 24 °C and the Guest Habitat throttles for about 20 minutes, into the start of eclipse, until the loop is back under 21 °C. Later in the same eclipse the battery runs low and the habitat is power-shed around sunrise. Each orbit now has two different problems, at two different times, from two systems. A second radiator or a bigger battery is the obvious fix once build mode lands.

### How to test on a phone

1. Press **20×**. Watch the coolant loop warm through the day and cool in eclipse. Near sunset the habitat light turns pale clay, a "Running hot" note appears, and a toast fires.
2. Tap **Heat** to tint the station by temperature, and tap it again to turn the tint off.
3. Open the Radiator Array sheet and switch it off. Within a few minutes the habitat throttles, then trips (red blinking light). Switch it back on and everything recovers.

### Choices made

- **One loop for the whole station.** Separate internal and external loops can come later, when a second loop has a gameplay reason to exist.
- **Thermal doesn't use `network.ts`.** The power solver's hard feasibility limit would hide heat that modules really produced that tick, so thermal uses its own energy-conserving loop update plus temperature hysteresis. If life support has the same supply/store/loads shape as power, it can reuse `network.ts`.
- **Trips act one tick (one in-game minute) late**, so power and thermal each solve once per tick with no circular dependency.
- **Sun heating is folded into `sunlitFactor`.** There is no separate absorbed-flux model yet.

### Known gaps

- No battery charge and discharge losses, no battery cold limit, and no heater power.
- The overlay tints modules evenly; there are no per-part hot spots.
- The Pages deploy needs a check on a real device.

## Next slice: Life support

Oxygen, CO2, and water, with power and water costs, plus a crew count that consumes them. The likely approach is to put each consumable on `network.ts` (O2 generation as supply, tanks as stores, crew as loads), with crew health effects when tanks run dry. Add a life-support rack module whose power and heat feed the existing systems, so a power or thermal problem becomes a breathing problem.
