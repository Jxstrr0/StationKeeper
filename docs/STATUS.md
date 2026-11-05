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

## Session 3 (Slice 3): life support

### What was built

- **Sim (`src/sim/systems/lifeSupport.ts`):**
  - **People:** 7 aboard (3 crew in the core, 4 guests in the habitat), counted from each module's `cabin`.
  - **Use per person per day:** 0.84 kg O₂, 1.0 kg CO₂ breathed out, and 3.5 kg of water (`scenario.json` → `lifeSupport.perPerson`).
  - **Life Support Rack** (new module, 2 kW **Essential**). While it has power, it:
    - makes up to 7.2 kg O₂ a day by electrolysis, spending 1.125 kg of water per kg of O₂;
    - scrubs up to 14 kg CO₂ a day, holding 2.0 mmHg;
    - recovers 90% of used water.
  - **Tanks:** 24 kg O₂ and 420 kg water.
  - **CO₂ is stored as mass.** Partial pressure comes from the ideal gas law over the station's pressurised volume (185 m³, so 1 kg ≈ 2.26 mmHg), so a bigger station dilutes it.
  - **Crew condition (0–100%):** falls with CO₂ above 8 mmHg (per mmHg over), much faster with no O₂, and slowly with no water. It recovers when CO₂ is under 4 mmHg.
  - **Alarms with hysteresis:** CO₂ elevated (4) and dangerous (8), O₂ low (25%) and empty, water low (20%) and empty, crew condition low (50%).
- **Timescales (by design):**
  - With the rack off, CO₂ climbs about 0.66 mmHg an hour, so it's dangerous in about 9 hours. With the rack back on it falls at the same rate.
  - O₂ lasts about 3 days without electrolysis.
  - Water drains about 10.6 kg a day even with recovery, roughly 30 days of supply. Resupply comes with traffic.
- **Cascade:** the rack is Essential. A deep power shortage sheds it and a hot loop trips it, and either way the air goes stale. Both cases are tested.
- **Balance:** the core drops from 5 kW to 3 kW (its description had claimed the life support racks), so total draw and heat are unchanged and the Slice 1–2 orbit cycle still holds.
- **Fix:** the network solver now snaps rounding crumbs in a store to exactly zero, so "empty" is empty everywhere.
- **View:** a Life Support Rack grey-box on the core's aft port: a short pressurised can with two O₂ spheres and a water tank.
- **UI:**
  - **Power card:** a life support row with CO₂ mmHg, O₂ %, water %, and crew condition plus who's aboard. Values turn peach for a warning and clay for an alarm.
  - **Notes and toasts:** life support alarms.
  - **Sheet:** the rack shows O₂ made, CO₂ scrubbed, and tank levels; the core and habitat show who's aboard.
- **Tests (`tests/lifeSupport.test.ts`, 50 total):**
  - Head count and cabin volume.
  - The rack holds CO₂ and refills O₂.
  - Water use matches recovery plus electrolysis.
  - With the rack off, O₂ use and CO₂ rise match the per-person rates and the ideal-gas conversion.
  - Alarms fire in order; crew condition falls and then recovers.
  - Running out of O₂ is worse than high CO₂ alone.
  - Power-shortage and overheat cascades.
  - A bigger cabin dilutes CO₂.

### How to test on a phone

1. The power card's bottom row shows CO₂ 2.0 mmHg, O₂, water, and crew 100%.
2. Tap the Life Support Rack (the short can aft of the core with white spheres) and switch it off. Press **20×**. CO₂ turns peach at 4 mmHg and clay at 8, crew condition starts to fall, and toasts fire. Switch the rack back on and watch CO₂ come down and the crew recover.

### Choices made

- **Life support doesn't use `network.ts`.** Tier shedding of breathing makes no sense, and CO₂ is a level rather than a supply. Each consumable is a tank or air mass with set-point control, like the coolant loop. `network.ts` stays the solver for tiered loads (power).
- **Guests count as occupants whatever the habitat's power state.** People don't leave when the lights go out.
- **Crew condition is one station-wide number for now.** Named crew with roles and individual health land with the crew slice.
- **Station totals are shown on the rack's sheet.** There is only one rack; with several, the sheet should show each one's share.

## Session 4 (Slice 4): build mode

### What was built

- **Sim:**
  - **`addModule` command** (`{type: 'addModule', defId, to, port}`). `command()` now returns `{ok, moduleId}` or `{ok: false, reason}`, and `buildProblem()` gives the reason without changing anything.
  - **Port checks are shared with layout loading** (`attachProblem` in `station.ts`), so a built station and a loaded one follow the same rules.
  - **A new module mounts by its first port.** Modules are data, so the first port in `modules.json` is the docking end by convention.
  - **New state for new modules:** power and thermal state are created for it, and the life support plant (people, volume, tanks) is recomputed. A new battery arrives half charged. A new rack's tanks add capacity but arrive empty.
  - **`freePorts`** in the snapshot, and **`nextInstanceId`** (for example `battery-pack-2`).
  - **`fork()`** copies the whole sim, rng included. **`forecast(sim, minutes, change?)`** runs a fork ahead and sums it up: lowest battery, hottest loop, minutes shed, throttled and tripped, peak CO₂, people, and water used.
- **View:**
  - **Collision check:** the sim decides port rules; the view checks that the new module's meshes don't run into anything (slightly shrunk world boxes, so touching at a port is fine).
  - **Port markers:** glowing lilac markers on every port where the chosen module fits, with fingertip-sized invisible hit spheres. They pulse and grow with camera distance, so they stay easy to tap when zoomed out.
  - **Ghost:** a see-through copy of the module at the chosen port. It turns clay if blocked.
  - **Camera:** `focus()` eases the camera to the new module after it is built.
- **UI (`src/ui/buildPanel.ts`):**
  - A **Build** button.
  - A **tray** of module cards with the two or three facts that matter.
  - **"Tap a glowing port"** hint.
  - An **effect preview** comparing two orbits with and without the module, with each row marked better or worse. Rows that don't change are hidden except battery and loop temperature.
  - **Build / Back.**
  - Escape leaves build mode. Toasts moved up to clear the Build button.
- **Tests (62 total):**
  - `tests/build.test.ts`: the command checks ports and ids; the new module gets power and thermal state; the plant is recomputed; the fork is independent and deterministic; the forecast matches running the sim.
  - `tests/buildPanel.test.ts`: preview rows and card highlights.

### The trade-offs the preview shows (by design)

- **A second battery** ends the sunrise load shed (lowest charge 17% → 30%, shed 34 → 0 min). But the habitat now stays powered and warm through eclipse, so the loop runs hotter and throttling goes from 21 to 59 minutes.
- **A second radiator** ends the sunset throttle but does nothing for the battery.
- So the "right" next module depends on which problem you want gone first. Money (Slice 6) will make that a real choice.

### How to test on a phone

1. Tap **Build** (bottom right). Pick **Battery Pack**.
2. Glowing markers appear on the free ports where it fits. Tap one; a ghost shows where it goes and the preview shows the effect over two orbits.
3. Tap **Build**. The camera eases to the new module and a toast confirms it. Tap **Back** to try a different port, or × to leave.

### Choices made

- **Building is free and instant for now.** Cost, launch time and delivery come with Money and contracts (Slice 6).
- **No removing modules yet.** Undocking needs rules for what is attached beyond the module, and life support has to cope with lost tanks.
- **Collision is a view check, not a sim rule.** Sim modules have no geometry; the grey-box meshes are the only shape data. If modules gain sim-side sizes, the check should move into the sim.
- **The preview runs on the main thread** (about 2 × 186 ticks, a few ms). It waits a frame so the ghost appears first.

### Known gaps

- Only the first port can mount. Modules with several ports can't be flipped end for end.
- The preview doesn't account for module failures (none exist yet).

## Session 5 (Slice 5): failures and warnings

### What was built

- **Sim (`src/sim/systems/reliability.ts`):**
  - **Wear.** Each module with a `reliability` block wears while it runs, from new (0) to fully worn (1) over `wearDays`. Switched-off, shed, or tripped modules don't wear.
  - **Heat.** Wear and failure chance double for every 8 °C above 25 °C, so a hot loop ages the whole station.
  - **Failure chance per day** = `failPerDay × (0.04 + 0.96 × wear²) × heat factor`. A new module fails at 4% of its worn rate, so worn modules are a gamble.
  - **Failures** are rolled on the sim's seeded rng, one draw per running module per tick, so a run replays exactly from its seed. A failed module drops out of the network: no draw, no output, no storage, no heat rejection.
  - **The crew's list.** `repair` services a working module (offline for `serviceHours`, wear back to 0) or repairs a failed one (2× as long). One team works through the list in order; queued modules keep running. If a module fails while its service waits, the job becomes a repair. `cancelRepair` drops a job and loses the work done.
  - **The core never fails yet.** Its failure needs crew and attitude systems to mean anything.
  - **Starting wear** comes from `scenario.json`. The life support rack starts at 62%, already due for service, so the first decision comes early.
- **Cause tracing (`src/sim/warnings.ts`).** Each snapshot carries `warnings`: a small graph built from the snapshot alone.
  - Every problem lists the problems that cause it, for example CO₂ high ← Essential tripped ← coolant loop hot ← radiator failed (and radiators in sunlight).
  - Roots are failed, serviced, switched-off and worn modules, the eclipse, and sunlit radiators.
  - `rootCauses()` and `effectsOf()` walk the graph.
- **Forecasts** run with failures off. The fork shares the real sim's rng state, so with failures on, a preview would reveal which module breaks and when. Instead the forecast integrates hazard over the run and reports the **chance of a failure**, and the build preview shows it as a row.
- **UI:**
  - **Warnings button** (bottom left): the number of problems, peach for warnings and clay with a pulse for alarms. It opens a sheet that **groups problems by root cause**, with the cascade under each root ("This causes: …") and buttons for Repair, Service, Switch on, and Show (camera to the module and its sheet). A **Crew's list** shows work in progress with Cancel. The list is rebuilt only when the set of problems changes and text updates in place, so buttons don't jump under a finger at 20×.
  - **Module sheet:** wear bar, failure chance a day, the crew's progress, and a Service/Repair/Cancel button beside the switch.
  - **3D:** failed modules blink red-orange; modules under service pulse ivory.
  - **Toasts** for failures (per module kind), due for service, work started, and work done. The HUD note lists failed modules.
- **Dev hook:** on the dev server only, `window.__sim` exposes the sim for console poking. It is stripped from production builds.
- **Deploy fix:** the deploy job cancels stale in-progress Pages deployments first. The very first deployment had stuck "in progress" and blocked every later one. **The site is live** at https://jxstrr0.github.io/StationKeeper/.
- **Tests (84 total):**
  - `tests/reliability.test.ts`: hazard maths; wear only while running; hot modules wear faster; seeded replay of failures; no failures with them off; service and repair timing; queue order; cancel; refusals; a queued service turning into a repair; batteries leaving and rejoining the store; forecasts reporting risk without breaking anything.
  - `tests/warnings.test.ts`: the calm station; the full radiator → loop → trip → CO₂ chain; shedding blamed on a failed battery; a switched-off rack as root cause; no dangling links.
  - `tests/warningsPanel.test.ts`: grouping by root.
  - Data validation tests for the new blocks.
  - Tests of other systems run with failures off (`makeSim` default), so a dice roll can't break them.

### Balance (by design)

- From the shipped start, the first failure lands at a median of about 8 in-game hours (about 24 minutes of play at 20×), with 10% inside 1.5 hours. The rack is first to fail a little over half the time unless serviced.
- **One radiator is a single point of failure.** If it fails, the loop climbs past every trip (Commercial after about 20 minutes, Essential after about 30, Critical after about 75) and the station goes dark until the repair (4 h) finishes. The crew and the radiator's pumps keep going, so it recovers. A second radiator is the insurance, and the build preview shows that.
- A planned service (2–2.5 h) is always quicker than a repair (4–5 h), and a module being serviced is offline on your schedule rather than the dice's.

### How to test on a phone

1. At start the warnings button shows **1**. Tap it: "Life Support Rack due for service (62% worn)". Tap **Service**. The rack pulses ivory, CO₂ creeps up while it's off, and in 2.5 h it is back like new.
2. Play at **20×**. When something fails, a toast fires and the button turns clay. Open it to see what the failure caused, then tap **Repair**.
3. Tap any module: its sheet shows wear, failure chance, and a Service button.

### Choices made

- **Failure means fully offline.** Partial failures (an array at half output, a leaking tank) can come later with more failure modes per kind.
- **Repairs need no power, parts, or money yet.** Spare parts and their cost land with Money and contracts. Crew skills and health could speed repairs or slow them, once the crew slice lands.
- **One repair team.** `repairTeams` is data, so more crew can mean more teams later.
- **Warnings are derived, not stored.** The graph is rebuilt from each snapshot, so it can never disagree with the state. Toasts remain the history.
- **The habitat failure toast jokes that guests moved to the core.** The sim doesn't move them; guests and their effect on money come with Slice 6.

### Known gaps

- No passive cooling: with every radiator down, the loop holds its temperature rather than drifting down.
- Failure chance is shown per day while running. A module that's off shows the chance it would have.

## Next slice: Money and contracts

Research contracts that pay for keeping certain modules running (uptime), launch costs for new modules (build mode charges and takes delivery time), spare parts for repairs, a starting loan with interest, and a quarterly report. The build preview and the warnings feed should show money, for example "Habitat failed: guests refunded $X an hour".
