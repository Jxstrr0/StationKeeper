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
- **Data:** `src/data/modules.json` (core, solar array, battery pack, guest habitat; power stats, ports, grey-box hints) and `src/data/scenario.json` (start date, orbit, thresholds, layout; since session 9, `src/data/scenarios/longlight-one.json`). Both are validated at load.
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

## Session 6 (Slice 6): money and contracts

### What was built

- **Sim (`src/sim/systems/economy.ts`):**
  - **Cash and a loan.** The station starts with $40M cash and a $60M loan at 3% a quarter. Money is in millions throughout.
  - **Income.** Guests pay $1.5M each a day while their habitat runs. Throttled counts as running; shed, tripped, failed or switched off doesn't.
  - **Costs.** Operations cost $1.8M a day. Interest accrues every minute. Everything is booked in a ledger by category: guests, contracts, operations, interest, construction, spare parts and penalties.
  - **Quarters** close every in-game day with a `quarterReport` event. Each report has the ledger, net, cash, loan, contracts delivered and failed, guest habitat uptime and breakdowns.
  - **Research contracts** need a Research Lab, which runs one contract at a time.
    - Up to three offers are open at once. A new one arrives every 8 hours, and each lapses after 20.
    - Each contract asks for some lab hours before a deadline. The lab earns one hour per hour powered and 0.6 an hour while throttled. "Steady loop" contracts earn nothing while the loop is throttled.
    - A delivered contract pays its reward. A missed or abandoned one costs its penalty.
    - There are six fictional sponsors and jobs in `scenario.json`.
  - **Launches.** Ordering a module charges its price at once. It docks 6 hours later, and its port is reserved until then. You need the cash to order.
  - **Spare parts.** A service costs 2% of the module's price and a repair 6%. Parts are charged when the work starts and refunded if it's cancelled. Repairs may push cash below zero, because a broken station shouldn't be stuck for want of money.
  - **Repaying the loan** comes out of cash and lowers the interest.
- **New modules:**
  - **Research Lab:** $14M, 3 kW, Commercial tier. It docks by its fore port and passes an aft port on.
  - **Docking Node:** $5M. It uses one port and offers three. Without it the starting station could take only three more modules.
- **Warnings** now include money:
  - a habitat that isn't running ("guests aren't paying ($6.0M a day)", traced to why it's down);
  - a contract at risk of missing its deadline, traced to its lab or a hot loop;
  - overdrawn cash.
  - A new root cause, **"batteries at their power limit"**, explains loads shed while the battery still has charge.
- **UI:**
  - **Finance button** (bottom centre): shows cash, with a dot when there are offers to look at and a pulse when a contract is at risk. It opens a sheet with:
    - cash, the loan with Repay $5M / $20M / all, and the running net a day;
    - this quarter's ledger;
    - contracts under way, with progress bars, and offers with Accept;
    - launches in transit;
    - last quarter.
  - **Build tray** shows prices and strikes through what you can't afford. The preview shows the price and delivery time, and a new row: **"Income, less running costs"** over the next two orbits. The confirm button says Order.
  - **Quarterly report:** pauses the game with the quarter's numbers and a one-line verdict from the board, then Continue resumes at the same speed.
  - **Toasts:** order placed, module docked, contract signed, delivered or failed.
  - **Modules on order** show as a faint outline at their port until they dock. Build mode treats them as solid, so nothing can be ordered into the space they'll take.
- **Tests (116 total):**
  - `tests/economy.test.ts`: income and costs, the quarter report, offers and lapsing, accepting and refusing, lab progress (powered, throttled, steady-loop), delivery and failure, abandoning, repaying, launches and port reservation, parts charged and refunded, and the money warnings.
  - `tests/financePanel.test.ts` and `tests/format.test.ts`: ledger rows, contract text, money formatting, the report verdict.
  - Build tests: the docking node.

### Balance (by design)

These figures come from a scripted player who repairs anything failed or over 85% worn, signs the best-paying offer per lab hour, and buys from a list when cash allows. Three seeds were run, over 6–8 in-game days.

- **Neglect sinks the station.** With no repairs, a failure soon takes the habitat down for good. The station then loses $3.6M a day: operations plus interest.
- **A tended starting station roughly breaks even**, give or take $2M a quarter, depending on breakdowns. The single battery sheds the habitat for part of each eclipse, which costs income. A second battery ($8M) makes it slightly profitable.
- **A lab needs support.** Bought on its own, it is shed at eclipse (battery limit) and pushes the loop into throttling, which also throttles the habitat. Lab first, then battery, radiator, node and a second array grows cash from $40M to about $70–77M over 8 days, with 12–15 contracts delivered and few failed. Building the support first is safer but slower: the lab arrives around day 7.
- The build preview shows all of this before you commit: battery low point, loop peak, income over two orbits, failure chance.

### How to test on a phone

1. Tap the **cash** button: $40M, the loan, and contract offers that need a Research Lab.
2. Tap **Build**: prices are on every card. Order a **Research Lab** on a free port. The preview shows its cost, when it docks, and what it does to income. Six hours later (20× makes that 18 minutes) it docks.
3. Open the cash button and **Accept** an offer. Watch the progress bar. At eclipse the lab may be shed: open warnings for the cause.
4. Play to 06:00 the next day for the **quarterly report**. The game pauses until you tap Continue.

### Choices made

- **Quarters are compressed to one in-game day.** Orbit time can't be compressed: eclipse every 92 minutes is the heart of the power game. A real quarter would take 33 hours of play at 20×, so a "quarter" is one day. `quarterDays` is data.
- **Contracts pay for lab hours, not for uptime of any module.** The handoff suggested paying for keeping modules running. Lab hours with a deadline give the same pressure, and they read well in a progress bar. "Steady loop" contracts tie research to thermal.
- **Repairs may overdraw cash; orders may not.** You can always fix what you have, but you can't buy on credit. Overdraft raises an alarm and carries no extra penalty yet.
- **Guests aren't refunded when their habitat goes down.** They simply stop paying, and the warning says how much a day.
- **The loan can only be repaid,** not extended.
- **The quarterly report pauses the game**, so the report is a beat rather than a toast. A scrim covers the screen while it's up, and keys don't reach anything behind it, so the game can't be unpaused under it.

### Known gaps

- There's no game over and no bankruptcy: cash can sink indefinitely after repairs. This needs a design decision, for example the bank taking over below some line.
- Offers don't scale with station size or reputation yet, and every sponsor pays the same rate for the same work.
- Habitat guests are a fixed four per habitat, always present. Occupancy, reviews and pricing could come later.
- Modules can't be sold or removed.
- The build preview checks whether you can afford the module when you tap a port. If income covers the price while the preview is open, tap the port again.

## Session 7: save and load

### What was built

- **Sim:** `Simulation.save()` returns the whole state as plain JSON: layout, clock, rng, and the power, thermal, life support, reliability and economy states, plus orders in transit. Per-module maps are stored as objects. `Simulation.fromSave()` rebuilds it. It refuses a save from another `SAVE_VERSION`, another scenario seed, a module with no state, or a module the data no longer has. `fork()` (used by forecasts) is now built on the same pair, so a field can't be saved by one and forgotten by the other.
- **Browser (`src/persist.ts`):** the save lives in localStorage under `stationkeeper.save`. Every call is wrapped, so a private window or a full quota never stops the game; the player gets one toast saying the station won't survive a reload.
- **When it saves:** every 5 s of real time while the clock has moved, and whenever the page is hidden or closed (phones kill background tabs without warning).
- **On start:** a good save is loaded and the game starts **paused**, with a "Welcome back" toast giving the date. A save that can't be used is discarded with a toast saying so; the reason goes to the console.
- **New station:** at the bottom of the Finance sheet. It takes two taps ("Tap again to scrap this station", armed for 4 s), then clears the save and reloads.
- **Tests (120):** a played sim (failures on, an order docked, a repair, a contract) round-trips through JSON and runs 3000 more ticks identically, dice included. Orders in transit still dock on time. A save is a copy. Bad saves are refused.

### How to test on a phone

1. Play for a few minutes: order something, sign a contract.
2. Close the tab or reload. The station comes back paused, as you left it.
3. Finance → Station → Start a new station, then tap again. A fresh station starts.

### Choices made

- **A snapshot of state, not a replay of commands.** A replay is smaller, but any balance change would make old saves play out differently. A state save keeps working until the shape changes, and then `SAVE_VERSION` discards it cleanly instead of misreading it.
- **One save slot, autosave only.** No manual save or multiple slots yet; a phone game shouldn't need a save button.
- **Saves don't survive a change to the save's shape.** Bump `SAVE_VERSION` when a system state changes; players then start fresh, with a toast. Migrations can come later if saves start to matter.
- **The quarterly report isn't saved as "open".** If the page closes while it's showing, the report is still in Finance under last quarter.

### Known gaps

- No migration between save versions.
- Camera position, heat overlay and speed aren't saved.

## Session 8: an end state

### What was built

- **Ways to lose (`scenario.json` → `endings`):**
  - **Bankrupt:** cash below −$20M, or two quarters in a row closed overdrawn. A quarter that closes in the black resets the count.
  - **Evacuated:** crew condition below 15%.
- **A loss is final.** The sim stops: `tick()` does nothing and every command is refused. The save keeps the ending, so a reload shows the end sheet again. The only way on is "Start a new station".
- **The goal: pay off the loan.** `goalReached` fires once and play carries on. The goal sheet offers "Keep going" or "Start a new station".
- **Sim:**
  - `Simulation.ended`, plus `ending` in the snapshot: outcome, when it ended, when the goal was reached, quarters closed overdrawn, and the limits.
  - New events: `gameOver` and `goalReached`.
  - The ending is part of the save. `SAVE_VERSION` is now 2, so session 7 saves are discarded with a toast.
- **Warnings:**
  - The overdraft alarm now says where the bank steps in ("…the bank takes the station past $20M"). On the last quarter before the bank steps in, it says "end this quarter in the red and the bank takes the station".
  - The crew condition alarm says "below 15% they're evacuated".
- **End sheet (`src/ui/endSheet.ts`):** styled like the quarterly report and laid over it, behind a scrim that blocks taps. It shows a house-tone verdict, time in orbit, modules, cash, loan, and the result over all quarters. If the report and a loss land on the same tick, the end sheet replaces the report, and the report's Continue can't restart a lost game.
- **Tests (126):**
  - both bankruptcy routes, and the count resetting;
  - an ended sim is frozen;
  - evacuation when life support is off;
  - the goal fires once and play carries on;
  - an ended game saves and loads as ended.

### Balance (by design)

A station left completely alone (5 seeds) is lost to **evacuation in 23–42 hours**, not to the bank. The first breakdown goes unrepaired. CO₂ reaches danger about 9 h later, and the crew condition alarm comes about 9 h after that. Evacuation follows 2.6 h after the alarm. That gives the player most of a day of escalating alarms to send in a repair. A tended starting station roughly breaks even (session 6), so the bank only catches poor building or heavy breakdown costs. The trace in session 6 had a good build at $70–77M cash by day 8, so the goal (repaying $60M plus interest) is reachable in the second week.

### How to test on a phone

1. Leave the station alone at 20×. Within a day or two the crew condition alarm warns about evacuation, then the end sheet appears.
2. Reload: the end sheet is still there. Tap Start a new station.
3. For the goal, build a lab and run contracts until cash covers the loan, then Finance → Repay all.

### Choices made

- **A fixed goal (pay off the loan) instead of goals per scenario.** There is one scenario. Goals can move into scenario data when there is a second.
- **Reaching the goal doesn't end the game.** It's a milestone; a sandbox player can keep building.
- **The bank's two routes.** The instant limit stops a runaway overdraft. The two-quarter rule stops a station that sits a little in the red forever.
- **Evacuation, not deaths.** In keeping with the tone: the crew are fine, the station isn't.

### Known gaps

- No score or high-score table.
- No warning dedicated to an overdraft getting near the bank's limit; the overdrawn alarm says the limit instead.

## Session 9: goals per scenario, and a second scenario

### What was built

- **Goals in scenario data (`"goal"`):** one of the following, each with optional `days`:
  - `repayLoan`;
  - `cash` (reach an `amount`);
  - `contracts` (deliver a `count`, counted over the whole game, not per quarter).
- **Board takeover:** a goal with `days` that isn't met by then ends the game with a new outcome, `replaced` ("The board has replaced you"). A goal met in time stays met. The goal sheet's wording follows the goal.
- **Sim:** the snapshot's `ending.goal` gives the kind, where the station stands, the target, progress from 0 to 1, and the deadline. Saves are keyed by scenario id instead of seed, so `SAVE_VERSION` is now 3.
- **Scenarios** now live in `src/data/scenarios/`, each with an `id` and a `blurb`, and are listed in `src/scenarios.ts`:
  - **Longlight One** (as before): $40M cash, a $60M loan, no deadline. Goal: pay off the loan.
  - **Kittiwake Outpost** (new):
    - a lab already aboard;
    - $25M cash and a $20M loan;
    - beta 50°, so shorter eclipses;
    - different starting wear (the battery is the weak point).
    - Goal: deliver 6 contracts within 6 days.
- **Scenario picker:** "Start a new station" (in Finance or on the end sheet) now opens "Choose a posting". Each card shows the name, blurb, goal, cash and loan. The choice is stored for the reload that starts it. A brand-new player still starts on Longlight One.
- **Goal in Finance:** a Goal section at the top, with the goal, a progress bar, the progress, and time left (clay in the last day). A new game opens with a toast naming the goal.
- **Tests (135):**
  - cash and contracts goals;
  - the deadline and its takeover;
  - a goal met in time;
  - every shipped scenario loads and runs;
  - bad goals are refused;
  - the goal wording.

### Balance (by design)

Kittiwake traces, 5 seeds:

- **Left alone:** evacuated in 1.0–2.8 days.
- **Repairing only, never signing a contract:** replaced at day 6 every time.
- **Repairing and keeping the lab busy, but building nothing:** only 1–3 of 6 delivered. A lone battery sheds the lab every eclipse, so most contracts fail.
- **Buying a battery and then a radiator first, then the same:** goal reached in 3.2–5.0 days (the deadline was 5 days for this trace), with 7–10 delivered.

So the deadline asks one thing of the player: notice that the lab needs power through the eclipse. The bot just made it on one seed against 5 days, and a human plays less tightly, so the deadline is 6.

### How to test on a phone

1. Finance → Start a new station → tap again. Pick Kittiwake Outpost.
2. Finance → Goal shows 0 of 6 and the time left. Sign a contract and watch the lab.
3. Order a battery early. Without one, the lab goes dark each eclipse.

### Choices made

- **The goal is fixed per scenario, not chosen by the player.** A posting is the challenge.
- **Contracts count over the whole game.** Quarter stats reset each day, so the goal keeps its own count.
- **No picker on the very first launch.** A new player lands straight in Longlight One; choosing comes with the second game.

### Known gaps

- Two scenarios only, and neither changes the module list or contract pool.
- No record of which scenarios have been won.

## Session 10: crew

### What was built

- **A crew roster** (`scenario.json` → `crew`). Named people, each an **engineer** or a **scientist**. Both scenarios start with 1 engineer and 2 scientists.
- **Engineers are the repair teams.** There is one team per engineer aboard, so `reliability.repairTeams` is gone from the data. With no engineer aboard, the repair queue stands still and an alarm says so.
- **Scientists run the labs.** Each running lab needs one. The fastest labs get the scientists first; a lab with nobody works at `unstaffedLabFactor` (half pace). A warning appears when a contract is under way and a lab has no one.
- **Wages.** Each person costs `wagePerDay` ($0.5M a day) in a new "Crew wages" line of the books. `operationsPerDay` dropped from 1.8 to 0.3, so the starting crew costs exactly what the old flat rate did and the balance is unchanged.
- **Bunks instead of a crew count.** Modules have `cabin.bunks`, and the crew come from the roster. The Core sleeps four. The new **Crew Quarters** module ($10M, 1.5 kW Essential, 45 m³) adds four more.
- **Hiring:** $1M to sign, then the flight up takes 6 h. A hire needs a free bunk (people in flight hold one). New hires take names from the scenario's list.
- **Sending home:** frees the bunk and stops the pay at once. It also works on someone still in flight ("Cancel flight").
- **Life support follows who is aboard.** Arrivals and departures rebuild the plant; the air and tanks keep what they hold.
- **Sim:**
  - `hireCrew` and `dismissCrew` commands;
  - `crewHired`, `crewArrived` and `crewLeft` events;
  - `snapshot.crew`;
  - the roster is in the save. `SAVE_VERSION` is now 4.
- **Crew sheet:** tap the crew reading in the top bar. It shows:
  - who is aboard and in flight;
  - bunks and wages;
  - what each role does;
  - hire buttons, with the reason when blocked;
  - "Send home" (two taps; the last engineer gets a sharper confirm).
- **Toasts** for hires, arrivals, and departures.
- **Tests (144):**
  - the starting roster;
  - a hire's fee, flight and arrival;
  - bunks, and quarters adding room;
  - engineers as repair teams, and an idle queue with none aboard;
  - lab staffing, at the unit level and in play;
  - sending home and cancelling a flight;
  - saves;
  - the crew summary text.

### How to test on a phone

1. Tap the crew reading in the top bar.
2. Hire an engineer. The Core's fourth bunk fills, and the hire buttons explain why they're now blocked.
3. Six in-game hours later the engineer is aboard, and two repairs run at once.
4. Send both scientists home with a lab running a contract. The lab warning appears and the contract slows down.

### Choices made

- **Two roles, not skills or levels.** Each role maps to a system that already exists (repairs and labs), so hiring is a clear trade.
- **Crew condition stays shared.** Everyone breathes the same air; individual health can come later.
- **No fatigue or shifts yet.** An engineer works around the clock. That's generous, but it keeps the repair numbers as they were.
- **Sending someone home is free, and the signing fee is not refunded.**

### Known gaps

- No crew needs beyond air, water and pay: no morale, food or rest.
- New hires always cost the same; the market for engineers is suspiciously calm.

## Next

The planned slices are done. Candidates for what's next, roughly in order of value:

1. **Play-testing on a real phone** to tune pace, readability, and the first ten minutes.
2. **More scenarios**, with their own contract pools or modules, and a record of which have been won.
3. **Crew needs**: rest, morale, and individual health.
4. **Art**: Blender models replacing the grey-boxes (the loader already prefers them).
