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

## Session 11: a third scenario, catalogues, and a record of wins

### What was built

- **Halyard Sunward** (`src/data/scenarios/halyard.json`), a hotel on an orbit that never enters Earth's shadow:
  - 520 km at beta 78°;
  - $30M cash and a $40M loan;
  - guests pay $2.2M a day each;
  - two engineers and no scientists;
  - the goal is $90M in cash within 10 days.
  - Power is never short, but radiators only shed 66% of their rating in sunlight, and here it is always sunlight. The starting station already runs too hot for its one radiator, so the habitat throttles within hours.
- **Catalogues.** A scenario can list the modules it sells (`catalogue`). Without one, everything with a price is for sale.
  - Halyard sells no Research Lab and offers no contracts. Its Finance sheet leaves the contracts section out, and its crew sheet only hires engineers.
  - The sim refuses a catalogue that names an unknown or unpriced module. `buildProblem` explains a module that isn't sold ("not for sale to this station").
  - The build tray only shows what's for sale.
- **Contract pools can be empty.** A scenario with a contracts goal and an empty pool is refused when loaded.
- **A record of wins** (`src/records.ts`, localStorage key `stationkeeper.records`). For each scenario it keeps:
  - wins;
  - the fastest win, in game time;
  - losses, and how the last one ended.
  - The record outlives saves: starting a new station doesn't touch it.
  - Each scenario card in the picker shows a line such as "✓ Won once, fastest in 4 d 5 h · 1 station lost".
- **HUD:** an orbit with no shadow reads "No eclipse on this orbit" instead of "Eclipse in —".
- **Tests (156):**
  - catalogue parsing, the sale rules, and bad catalogues;
  - a contracts goal with no pool is refused;
  - Halyard: never in shadow, no labs, offers or scientists, and too hot for one radiator;
  - records: counting, the fastest win, junk in storage, and the picker text.

### Balance (by design)

Halyard was simulated over 10 days on four seeds:

| Strategy | Result |
| --- | --- |
| Neglect | Evacuated in 1.3–2.3 days; the heat trips everything. |
| Repairs only | About $62M at day 10; the board replaces you. |
| A second radiator | About $56–67M; still replaced. |
| A radiator, then a second habitat | Goal reached in 8.2–9.2 days. |
| A radiator, a habitat, then a third radiator | Goal reached in 8.6–10.0 days. |
| Two radiators before the habitat | Replaced at $73–88M; the habitat came too late. |
| A second habitat before any radiator | Evacuated in 5.4–7.8 days. |
| A third habitat (plus life support and a node) | Worse: it costs more than it earns back in 10 days. |

The lesson is to get the second habitat up early, with just enough cooling for it.

### How to test on a phone

1. Finance → Start a new station → Halyard Sunward.
2. The top bar says there is no eclipse. Within a few hours the coolant passes 24 °C and the habitat throttles.
3. Build: the tray has no Research Lab. Buy a Radiator Array, then a Guest Habitat when cash allows.
4. Win or lose any scenario, then open the picker again. Its card shows the record.

### Choices made

- **Records are per device, like the save.** There's no account to sync them to.
- **A win is counted when the goal is reached**, even if the player keeps going and loses later. That later loss is counted too.
- **The catalogue is a plain allowlist**, not per-scenario prices. Different prices can come if a scenario needs them.
- **The third scenario reuses the existing modules.** What makes it different is the orbit, the catalogue and the goal, so no new art was needed.

### Known gaps

- Hiring a scientist is still possible where labs are for sale but none is built; that is intended.
- The picker is a plain list. With many more scenarios it would want sorting or an unlock order.

## Session 12: crew needs

### What was built

- **Shifts and fatigue.** Each person's fatigue (0–100%) rises 7% an hour on shift and falls 10% an hour off it.
  - Engineers are on shift while a repair or service is under way. Scientists are on shift while a lab runs a contract.
  - Rested people already on shift carry on. Past 70% a worker hands over to a colleague below 30%, if there is one; otherwise they carry on.
  - At 100% they're **exhausted** and off duty until they're back under 30%: 14 h of straight work, then about 7 h of rest.
  - So one scientist can't run a lab around the clock, and two can.
- **Fit to work.** Only engineers aboard, well and not exhausted are repair teams. The same goes for scientists running labs.
  - "No engineers aboard" now also fires as "No engineer fit to work", and it links to the exhaustion or illness behind it.
- **Morale** (0–100%) drifts towards a settling point, closing about 8% of the gap an hour.
  - The point starts at 80%, less 10 for tired, 35 for exhausted, 20 for ill, 30 for bad air (CO₂ high, oxygen or water low) and 15 for a hot coolant loop.
  - Under 40% a warning names the unhappiest person.
  - Under 25% for 12 h straight, they **resign** and take the next flight down. The warning turns into an alarm with a countdown.
- **Illness.** Each person has a 3% chance a day of falling ill, doubled while tired and tripled in bad air. Someone ill is off duty for 12 h.
  - Illness rolls on its own seeded dice, so the station's failure rolls and contract offers are exactly as they were.
- **Data:** `crew.needs` in each scenario, validated on load.
- **Save:** members carry fatigue, morale, shift, exhaustion, illness and low-morale timers. The crew's dice are saved too. `SAVE_VERSION` is now 5.
- **Events:** `crewExhausted`, `crewFellIll` and `crewRecovered`. `crewLeft` gains a `reason` (`dismissed` or `resigned`).
- **Crew sheet:** each person shows what they're doing (on shift, tiring, off shift, exhausted, ill with time left, in flight) and their fatigue and morale. It turns clay when something is wrong, and counts down to a resignation.
- **Toasts** for exhaustion, illness, recovery and resignation.
- **Warnings:** `crewExhausted`, `crewSick` (info) and `moraleLow`.
- **Tests (172):**
  - shift hand-over rules;
  - two scientists sharing a lab without wearing out, and one wearing out on the expected schedule;
  - an exhausted engineer not repairing until rested;
  - illness: off duty, recovery, its own dice, and determinism through a save;
  - the morale settling point;
  - resignation, and life support following it;
  - morale recovering;
  - needs validation;
  - crew sheet and warning text.

### Balance (by design)

Traced on four seeds per line:

- **Unchanged:**
  - Halyard's winning line: identical cash and goal days.
  - Longlight neglect: still evacuated in about a day.
  - Kittiwake with a battery and radiator: goal in 3.7–4.9 days, against 3.2–4.9 before.
- **Morale** stayed between 42% and 65% in tended play, so no one resigned in any trace. Resignation takes days of compounded neglect, and the air usually kills first.
- **The new pressure is one engineer.** A scripted Longlight builder that spends down to almost nothing lost two of four seeds once its only engineer could be ill or exhausted when something broke.
  - The same script with a second engineer hired survived on all four seeds.

### How to test on a phone

1. Longlight: build a Research Lab and take a contract. Open the crew sheet: one scientist is on shift. About 10 h later they hand over to the other.
2. Send one scientist home and keep the contract running. About 14 h in, the other is exhausted, the lab slows, and a warning says why.
3. Let CO₂ climb (switch off the Life Support Rack for a while): morale falls for everyone, and illness becomes more likely.

### Choices made

- **Shifts follow work, not the clock.** Nobody works when there's nothing to do, so a quiet station rests everyone.
- **Crew condition (air and water) stays shared, and illness is personal.** The station-wide condition is still what evacuates everyone.
- **Morale doesn't slow work, it only ends in a resignation.** One clear consequence is easier to read than a hidden slowdown.
- **Guests have no needs.** They pay, breathe, and complain only to each other.

### Known gaps

- There's nothing that raises morale above its settling point: no galley, gym or day off. (Session 13 added a galley and a bonus.)
- Exhausted and ill people still draw full pay.

## Session 13: morale comforts

### What was built

- **Galley** (`galley` in `src/data/modules.json`), a new module kind:
  - $8M, 2 kW, Commercial tier, 30 m³ of cabin.
  - While it runs (powered or throttled), it lifts where everyone's morale settles by 12%.
  - It seats six. With more people aboard than seats, the lift is shared out: 9 aboard get 6/9 of it.
  - Several comforts don't stack: the best lift counts, and the seats add up.
  - Every scenario sells it; Halyard's catalogue now lists it.
- **Crew bonus**, a new command (`payBonus`):
  - Costs $300k a head for everyone aboard, booked under wages.
  - Lifts each person's morale by 15% at once. Anyone lifted back above the resignation line stops their countdown.
  - Once a day at most: "Another bonus so soon would set a precedent."
  - Set per scenario in `crew.bonus` (`perPerson`, `morale`, `cooldownHours`).
- **Data:** a module's `comfort` takes `morale` (a fraction) and `seats` (a whole number above 0). `crew.bonus` is required and validated.
- **Save:** version 6, because the crew now remembers when the last bonus was paid.
- **UI:**
  - The build card says "+12% crew morale, seats 6".
  - The crew sheet has a Morale section: what comforts are doing (or that there are none), and a "Pay everyone a bonus · $900k" button. The note under it gives the lift, or the hours until the next bonus, or why it's refused.
  - A toast confirms the payment.
- **Tests:** 179, up from 172 (`tests/comforts.test.ts`): sharing seats, the galley lifting morale only while it runs, the bonus's cost, lift, cooldown across a save, rescue from a resignation, refusal without cash, and data validation.

### Balance (by design)

Traced on four seeds per line:

- **Unchanged:** Halyard's winning line (a radiator, then a second habitat) reaches the goal in 8.2–9.2 days, as before.
- **The galley is a luxury with a cost:**
  - Tended Longlight with a second engineer: the lowest morale seen rose from 42–58% to 53–65%, for about $10M less cash at day 8.
  - In Kittiwake, buying it before the goal delayed or lost the goal on three of four seeds: the money mattered more.
  - In Halyard, its heat tipped an already hot loop over, and two of four seeds were evacuated late on.
- **The bonus is cheap insurance.** A script that pays whenever anyone falls below 50% paid at most three times in eight days and never changed an outcome.

### How to test on a phone

1. Longlight: open the crew sheet. The Morale section says nothing is running and suggests a galley.
2. Build a Galley. Once it's running, the sheet says "Comforts lift morale 12% · seats for 6", and morale climbs past 80% over the next day.
3. Tap "Pay everyone a bonus". Cash drops by $900k, everyone's morale jumps, and the button greys out with a 24 h countdown.

### Choices made

- **Morale still only matters through resignation.** So the galley is insurance, not income. If play-testing shows that's too weak a reason to build one, the next step is letting low morale slow work.
- **The best comfort counts, not the sum.** Two galleys give more seats, not a happier crew. That leaves room for a different comfort later without stacking into 100% morale. (Session 15: different kinds now stack at diminishing weight; the same kind still only adds seats.)
- **A bonus is a lump, not a rate.** The cooldown, not the price, stops it being bought every hour.

### Known gaps

- Only one comfort so far. A gym or a cupola could have different seats, power or heat.
- Morale doesn't change work pace. (Session 14 adds this.)

## Session 14: morale sets the pace of work

### What was built

- **Work pace** (`workPace` in `src/sim/systems/crew.ts`). Each person's morale sets how fast they work:
  - 60% of full speed at 0 morale.
  - Full speed at 65%, about where a crew lives day to day.
  - 120% when entirely content.
  - The curve is linear either side of 65%. It is set per scenario in `crew.needs.morale.pace` (`floor`, `steadyAt`, `best`) and validated.
- **Repairs:** each repair team works at its engineer's pace, and the fastest engineer takes the first job in the queue. A job under way shows clock time left at that pace; a queued job shows its work-hours.
- **Labs:** each lab works at its scientist's pace, with the fastest scientist on the fastest lab. A contract is capped at its lab's rate, so a cheerful scientist can push a lab past 100%. An unstaffed lab still works at half speed.
- **Snapshot:** each crew member carries `pace`.
- **UI:**
  - A crew member's readings add "pace 94%" whenever they aren't at full speed.
  - The Morale section opens with the crew's average pace ("working slower than they could: 92% pace").
  - The low-morale warning adds "and their work is slowing".
- **Save:** unchanged at version 6. Pace comes from morale, which is already saved.
- **Tests:** 184, up from 179.
  - New `tests/pace.test.ts`: the curve; a glum engineer's slower service and its honest clock; a content crew's extra lab hours; the crew-sheet line; data validation.
  - Tests that count exact work-hours now use `flatPace` from `tests/helpers.ts`, which holds pace at 1 whatever the morale.

### Balance (by design)

Traced on four seeds per line, against the same lines with pace held flat:

- **Average pace without a galley is about 100%** (97–104% by run), so the change isn't a blanket nerf. A first try put full speed at 80% morale. That left everyday crews at 91–95% and added evacuations, so full speed moved down to 65%.
- **A galley now pays its way where work matters.** Crews average 101–109% pace with one.
  - Halyard with the galley: the goal was reached on all four seeds, in 8.6–9.8 days. With pace held flat, two of the four were evacuated.
  - Halyard's plain winning line: three of four seeds still win, in 8.5–9.2 days. One seed (5581) was evacuated at day 8.4, just before the goal. Repairs land at different minutes now, and this station runs close to the edge.
- **Kittiwake and Longlight lab lines** are within noise. The scripted policies there are crude, so they say little about a human player.

### How to test on a phone

1. Longlight: open the crew sheet. A fresh crew starts at 80% morale and works a little above full speed. The Morale section says so.
2. Switch the Life Support Rack off for a few hours. As CO₂ climbs, morale falls, each person shows a pace under 100%, and a repair takes longer than its listed hours.
3. Build a Galley. Morale settles higher, and the pace line climbs past 100%.

### Choices made

- **Full speed sits at everyday morale, not at 'nothing wrong'.** A crew with nothing wrong (80% morale) works about 9% fast, and the usual mix of tired shifts and warm loops brings that back to about 100%.
- **The fastest worker takes the first job.** Who is actually on shift isn't tracked per job. Morale is nearly the same across a crew, so the difference is small and the rule is simple.
- **Work-hours stay the unit of a job.** Pace changes the clock, not the size of the job, so a queued job still shows its listed hours.

### Known gaps

- Still only one comfort. A gym or a cupola could now earn its place by pace as well as by resignations. (Session 15 adds the cupola.)

## Session 15: an observation cupola, and comforts that stack

### What was built

- **Observation Cupola** (`cupola` in `src/data/modules.json`), a new module kind:
  - $5M, 0.3 kW on the Commercial tier, and very little heat.
  - Lifts morale 8% and seats three.
  - It has one port, so it is a dead end: nothing builds onto it.
  - Every scenario sells it; Halyard's catalogue lists it.
- **Grey-box model:** a short collar, then a six-sided frustum of windows that glows while the cupola is lit, framed in slate.
- **Comfort stacking** (`comfortLift` in `src/sim/systems/crew.ts`):
  - Each kind of comfort is shared out by its own seats.
  - More of the same kind still only adds seats.
  - Different kinds stack, biggest lift first, each further kind counting for `crew.comfortStack` (0.5) of the one before. A galley and a cupola for three people lift morale 12% + 4% = 16%.
- **Snapshot:** `crew.comforts` lists each running kind with its lift after sharing and stacking, and its seats.
- **UI:** the crew sheet names each comfort, e.g. "Comforts lift morale 16%: Galley +12%, 6 seats · Observation Cupola +4%, 3 seats.", and says which ones are shared thin.
- **Data:** `crew.comfortStack` is required, a fraction from 0 to 1.
- **Save:** unchanged at version 6.
- **Tests:** 186, up from 184: stacking order and weights, seats shared per kind, the cupola as a dead end, a galley and cupola settling the crew happier than a galley alone, and validation of `comfortStack`.

### Balance (by design)

Traced on four seeds per line:

- **Longlight, tended, with a second engineer:**
  - The cupola alone lifts average pace from 100–102% to 104–107%, for $3–6M less cash at day 8.
  - Galley and cupola together reach 104–109%, for $10–15M less.
  - The cupola is the cheap comfort; the galley is the big one.
- **Halyard:**
  - The galley alone is still the best buy: the goal on all four seeds, in 8.6–9.8 days.
  - The cupola alone reached the goal on three of four seeds, in 8.5–9.2 days.
  - Both together reached the goal on all four, but late (9.6–10.0 days): the extra $5M and the heat cost more than the extra pace saved.
- **Kittiwake:** one seed with a cupola was evacuated on day 1.9. With another module aboard, the station's failure rolls fall differently. In that run the radiator failed while the only engineer was exhausted, the loop overheated, and CO₂ climbed. The cupola's own load played no part.

### How to test on a phone

1. Build: the tray lists the Observation Cupola under Crew comfort, "+8% crew morale, seats 3".
2. Build a Galley, then a Cupola. The cupola sits at the end of whatever it was built on, and its windows glow.
3. Crew sheet → Morale: "Comforts lift morale 16%: Galley +12%, 6 seats · Observation Cupola +4%, 3 seats."
4. Hire past three crew: the cupola's line says its seats are shared thin.

### Choices made

- **Kinds stack by halves, biggest first.** Comforts reward variety, but can't add up to a permanently euphoric crew.
- **A kind is its module type, by name.** Two cupolas are one kind with six seats.
- **The cupola doesn't earn money from guests.** A view for paying guests would suit a hotel scenario; it's left for one.

### Known gaps

- Comforts help only the crew. Guests don't notice them yet. (Session 16 adds guest fares.)

## Session 16: guests pay for comforts

### What was built

- **Guest fares** (`fareLift` in `src/sim/systems/economy.ts`). A comfort may carry `guestFare`, the share it adds to every guest's fare while it runs:
  - The Observation Cupola adds 12%: guests pay for the view.
  - The Galley adds 4%: a hot meal.
  - Kinds stack like crew morale, biggest first, each further kind at `crew.comfortStack` (0.5). A cupola and galley together add 12% + 2% = 14%.
  - More of the same kind adds nothing.
- **Economy:** guest income, the running net, and each habitat's income per day include the lift. The snapshot carries `economy.fareLift`.
- **UI:**
  - The build card adds "+12% guest fares".
  - The finance summary gains a Guest fares line: "Base rate" or "+12% from comforts". It is hidden on a station with no guest habitat.
- **Data:** `comfort.guestFare` is optional, a fraction.
- **Save:** unchanged at version 6.
- **Tests:** 189, up from 186: stacking and repeats, a lit cupola raising guest income by its share over most of a day, the finance and build text, and data validation.

### Balance (by design)

Traced on four seeds per line:

- **Halyard, the hotel, now has a smart first buy.**
  - Cupola first, then the radiator and habitat: the goal on all four seeds, in 7.7–8.5 days.
  - The plain winning line: three of four, in 8.5–9.2 days.
  - Radiator, habitat, cupola: the goal on all four seeds, in 7.5–8.9 days, though one seed was evacuated half a day after reaching it.
  - Galley and cupola together: four of four, in 8.0–9.0 days.
- **Longlight, tended:** the cupola now roughly pays for itself in fares, ending day 8 within $5M of not buying it, with a faster crew (104–107% pace).
- **Kittiwake:** unchanged from session 15.

### How to test on a phone

1. Longlight: open Finance. The summary says "Guest fares · Base rate".
2. Build an Observation Cupola. When it docks and lights, the line reads "+12% from comforts", and the running income rises by about $0.7M a day.
3. Switch the cupola off: fares drop back to the base rate.

### Choices made

- **Guests pay for the view whether or not there's a seat.** Seats share out crew morale only. Fares are a flat share per kind of comfort, so the money is easy to read.
- **The lift sits in the comfort, not the habitat.** Any scenario with guests gets it, and a new comfort sets its own fare share in data.

### Known gaps

- Guests don't care about anything else yet: heat, bad air, or a shed habitat cost them their fare but not their mood.

## Session 17: guests remember their stay

### What was built

- **Guest reputation** (`src/sim/systems/guests.ts`). The station has one reputation, from 0 to 1. It drifts towards a target at `guests.perHour` (0.03 of the gap an hour, so a bad day takes most of a day to show). The target starts at `base` (0.75) and drops while guests put up with:
  - a hot station (the coolant loop throttling): −0.2;
  - bad air (the CO2 warning, low oxygen, or low water): −0.3;
  - a habitat gone dark (shed, failed, off, or being serviced): −0.5, scaled by the share of guest places it holds.
- **Fares follow reputation.** Fares are multiplied by `fare.worst` + (`fare.best` − `fare.worst`) × reputation, which is 0.75–1.25. Three stars (0.5) is the going rate. Comfort lifts multiply on top.
- **Reviews.** At each quarter's close, guests post reviews: stars from the quarter's average reputation, and the complaint that lasted longest, if it applied for at least a tenth of the quarter. A toast quotes one, e.g. "Guest reviews are in: ★★☆☆☆. "Paid for a habitat, got a waiting room."".
- **Warning:** "Guest reviews down to ★★☆☆☆: fares at 89% of the going rate". It turns on below `poor.below` (0.3) and off above `poor.above` (0.4). Its causes link to air, heat and dark-habitat warnings.
- **UI:** the finance summary adds a Reviews line, e.g. "★★☆☆☆ · fares 89% · guests say it is too warm, the air is stale and a habitat is dark".
- **Data:** each scenario has a `guests` block.
- **Save:** now version 7. The save carries the guests' opinion, so a version 6 save won't load and the game starts fresh.
- **Tests:** 199, up from 189. They cover the target and its penalties, fares and stars, drift and the poor band, reviews and their complaint, a dark habitat sinking the reviews and raising the warning, fares scaling the ledger, the save, the text, and data validation.

### Balance (by design)

Traced on four seeds per line:

- **Halyard:** a well-run hotel sits at three to four stars, so fares run a little above the going rate.
  - The plain winning line reaches the goal on all four seeds in 7.5–8.6 days, faster than before (three of four seeds, in 8.5–9.2 days).
  - Cupola lines reach the goal in 6.8–7.9 days.
  - Overbuilding radiators still loses. Idling still loses.
- **Longlight and Kittiwake:** reviews sit at three stars and cash moves by under $1.5M. Neither is a hotel.

### How to test on a phone

1. Longlight: open Finance. The summary says "Reviews · ★★★☆☆ · fares 100%".
2. Switch the habitat off and run at 20× for most of a day. The line goes to two stars and says a habitat is dark. A "Guest reviews down" warning appears, pointing at the habitat.
3. At the quarter's close, a review toast quotes a guest.
4. Switch the habitat back on: reputation climbs back over the next day.

### Choices made

- **One reputation for the station, not per guest.** It's easy to read, and it's the thing that sets fares.
- **Reputation drifts slowly.** One eclipse shed shouldn't wreck the reviews. A day of neglect should.
- **The base sits above three stars,** so a station run well earns a small premium, and the comfort lift and the review lift both reward care.
- **Changing scenarios starts each with three stars,** whatever happened before.

### Known gaps


## Session 18: reviews in the quarter report

### What was built

- **The quarter report carries the reviews.** It gains a "Guest reviews" row with the stars: lilac at four or five, clay at one or two. One guest's quote goes under the rows. A station without guests shows neither.
- **The review toast is gone.** The report opens at every quarter's close, so the toast only repeated it.
- **Sim:** `postReviews` returns the review, and the sim puts it on the report (`QuarterReport.reviews`, optional) before the UI hears the close. `GuestReview` is now a named type, shared with the `guestReviews` event.
- **Save:** unchanged at version 7. An old report without reviews shows no reviews row.
- **Tests:** 200, up from 199. They cover reviews on the report, none without guests, and a quote for each star tier.

### How to test on a phone

1. Longlight: switch the habitat off and run to the quarter's close.
2. The report shows "Guest reviews" with the stars, and a guest's quote under the rows.

### Choices made

- **The report holds the quote, not a toast,** so it's read while the game is paused, next to the money it explains.

## Session 19: bookings follow the reviews

### What was built

- **Bookings** (`occupancy` and `bookedGuests` in `src/sim/systems/guests.ts`). Each quarter's reviews set the share of guest places booked for the quarter ahead.
  - No one books at a reputation of `guests.bookings.emptyAt` (0.05) or below.
  - Every place is booked from `fullAt` (0.35), a little over two stars, upwards.
  - In between, the share rises in a straight line, in whole guests per habitat.
  - A station starts with every place booked.
- **Fewer guests pay and fewer breathe.** Income, the running net, each habitat's income, and the life support load all count booked guests, not places.
- **Reputation still moves while places are empty.** It comes from how the station is run, so a neglected station can win its guests back with one good quarter.
- **UI:**
  - The quarter report adds "Booked next quarter: 1 of 4 places", in clay when short.
  - The finance Reviews line adds "· 1 of 4 places booked" when places are empty.
  - The HUD's head count follows bookings, and says "1 guest", not "1 guests".
- **Data:** each scenario's `guests` block has `bookings`.
- **Save:** now version 8, since the save carries the bookings. A version 7 save starts fresh.
- **Tests:** 206, up from 200. They cover the booking curve and whole guests, starting full, a dark quarter booking fewer guests (fewer paying, fewer breathing), a good quarter filling the places again, the save, and data validation. `flatFares` in the test helpers now also keeps every place booked.

### Balance (by design)

- **Every played line traced in session 17 comes out identical.** A station run with any care stays above two stars, so the places stay full.
- **Bookings bite only after a one-star or low two-star quarter.** For example, an idle Halyard loses about $0.4M over ten days.
- Bookings are a penalty for neglect, not a second bonus for care. The fares already reward care.

### How to test on a phone

1. Longlight: switch the habitat off and run at 20× for two or three quarters. On its own, a dark habitat settles reputation near 0.25, which is two stars.
2. At a close, the report shows "Booked next quarter: 3 of 4 places", and the HUD counts 3 guests. Getting to one star and a single booking also takes heat or stale air.
3. Switch the habitat back on: after a good quarter, the places fill again.

### Choices made

- **Bookings change only at a quarter's close.** Guests book ahead on the reviews they read, not on the minute.
- **Rounding is per habitat,** so 4 places at 30% books 1 guest, never 1.2.

## Session 20: Saltglass Rest, a turnaround

### What was built

- **A reviews goal** (`{ "kind": "reviews", "stars": 4, "days": 8 }`). It is reached when a quarter closes with guest reviews of at least that many stars.
  - Finance shows "Last reviews ★☆☆☆☆" as the progress, and the bar moves a step at each close.
  - Before any reviews are posted, the station stands at the stars of `guests.start`.
  - Data validation: stars must be a whole number from 2 to 5, and no higher than guests at their happiest give (`stars(guests.base)`, four at the shipped 0.75).
- **A fourth scenario, Saltglass Rest** (`src/data/scenarios/saltglass.json`). A hotel opening at one star, with two habitats (8 places) and only 2 places booked.
  - One array, one battery and one radiator cannot carry two habitats. In eclipse the battery can't discharge fast enough, so a habitat sheds, and in sunlight the loop runs hot.
  - The radiator, life support and second habitat start worn.
  - $40M cash and a $45M loan.
  - Guests here talk faster (`perHour` 0.04, against 0.03 elsewhere), so a fixed station shows in the reviews within a few days.
- **UI:** the goal line ("Earn 4-star guest reviews within 8 days."), the Finance progress line, and the end sheet's copy for a reviews goal.
- **Tests:** 210, up from 206. They cover the goal being reached only at a close and its progress, data validation, the goal text, and three Saltglass tests: it opens at one star, left alone it is never rated four stars and the owners replace you, and with the three fixes it wins inside the deadline.

### Balance (scripted player, 8 seeds, with failures on)

- **Doing nothing, or buying only a radiator, or a radiator and a battery, loses on every seed.** Reviews stay at two or three stars.
- **A radiator, a battery and a solar array, in any order, wins on 7 of 8 seeds, by day 3 to 8.** The scenario's own seed wins on day 4.
  - Breakdowns and services cost a quarter now and then, so it is not a formality.
  - The losing seed (42) ends just under four stars.
- **A turnaround this costly needed the cash.** At $24M cash, a sensible plan went overdrawn two closes running and the bank took the station.

### How to test on a phone

1. Finance → Start a new station → Saltglass Rest. It opens in eclipse with a habitat shed, and the Finance goal reads "Last reviews ★☆☆☆☆".
2. Buy a radiator, a battery and a solar array early, and service what's worn.
3. Watch the reviews climb at each close; four stars ends it with "4-star reviews".

### Choices made

- **The goal counts posted reviews, not live reputation,** so it lands at a quarter's close, with the report, and can't be met by a lucky hour.
- **No five-star goal is possible yet,** because comforts raise fares, not reputation. A guest-only module that lifts reputation would open it up.

## Session 21: the Guest Lounge

### What was built

- **Guest amenities** (`amenity: { "reputation": 0.15 }` on a module).
  - While the module runs (powered or throttled), the amount is added to where guest reputation settles.
  - Different kinds stack like comforts, using `crew.comfortStack`. A second lounge adds nothing, because guests can only sit in one.
  - Crew get nothing from it.
  - `amenityLift` and `reputationTarget` live in `src/sim/systems/guests.ts`, and `GuestInputs` gains `lift`.
- **The Guest Lounge** (`lounge`, a new module kind, "Guest comfort").
  - $12M, 2.5 kW, Commercial load, with ports fore and aft.
  - It is drawn with the habitat grey-box shape.
  - It lifts reputation by 0.15, from the usual 0.75 to 0.9, so five-star reviews become possible.
  - It is for sale everywhere. Halyard and Saltglass list it in their catalogues.
- **Reviews goals check against amenities.** A goal of more stars than the station can ever earn is refused when the game starts. "Can ever earn" counts the base plus every amenity aboard or for sale. Before this, the check was made when the scenario file was read.
- **UI:**
  - The build tray reads "Guest reviews +0.6★, guests only".
  - A failed lounge has its own breakdown toast.
- **Tests:** 215, up from 210. They cover the lift and its stacking, five-star reviews while the lounge runs and four once it is off, nothing for the crew, the five-star goal check, the build tray text, and data validation.

### Balance (scripted player, by design)

- **A finishing touch, not a shortcut.**
  - Buying the lounge first at Saltglass loses on 3 of 4 seeds: guests on a station that is hot and shuts down in eclipse ignore the lounge.
  - At Halyard, its 2.5 kW of extra heat makes the cash goal later. Two seeds of a bot that doesn't manage heat ended evacuated.
- **Fares gain little from it** (about +7% at the top), so it is worth buying for reviews, not for the money.
- **Not yet used by a goal.** A five-star scenario, or Saltglass's next posting, could use it.

### Choices made

- **Amenities are a separate field from comforts.** Comforts have seats and morale; an amenity has neither.

## Session 22: Velvet Reach, a five-star posting

### What was built

- **A fifth scenario, Velvet Reach** (`src/data/scenarios/velvet-reach.json`). A working three-star hotel whose owners want five-star reviews within 9 days.
  - Two arrays, one battery, one radiator, one habitat (fully booked) and life support.
  - $30M cash and a $50M loan. Guests pay $2.5M a day each, the most of any posting.
  - Every core port is taken: the first new module goes on the habitat's or the life support rack's free end.
- **The Guest Lounge now lifts reputation by 0.2, not 0.15.** That puts the best target at 0.95 against the five-star line of 0.875.
  - At 0.15 the best target was 0.9, too close to the line. A single radiator service or habitat service in a quarter cost the fifth star, so no plan got there.
  - The build tray now reads "Guest reviews +0.8★".
  - Session 21's Saltglass and Halyard lounge runs were measured at 0.15.
- **Tests:** 219, up from 215. Four Velvet Reach tests: it opens at three stars, fully booked; left alone it never earns five stars; a lounge alone isn't enough; and a lounge, a radiator and a battery win inside the deadline.

### Balance (scripted player, 8 seeds, failures on)

- **Doing nothing, a lounge alone, or a lounge and a radiator: lost on every seed.**
  - Without a second battery the lounge goes dark in eclipse.
  - Without a second radiator the station runs hot while the radiator is serviced.
- **Lounge first, then a radiator and a battery, in either order: won on all 16 runs, by day 4 to 7.**
- **A radiator and a battery first, then the lounge: lost on every seed.** The two take the last free ports, and the scripted player never buys a docking node. A real player would; planning ports is part of the puzzle.

### How to test on a phone

1. Finance → Start a new station → Velvet Reach. Three stars, 4 of 4 places booked.
2. Buy the Guest Lounge first, then a radiator. When the lounge has docked, buy a battery on its free port.
3. Reviews reach four stars after a day or two, and five a few days later, if nothing goes dark or hot for long.

### Choices made

- **Five stars needs a near-perfect quarter.** The goal is to keep everything running for a whole day, not just to fix the station.

## Session 23: camera lens and framing

Play-test feedback: the view felt stretched and out of proportion. The canvas was the right size. The lens was the problem.

### What was built

- **A longer lens.** The field of view was 50° vertical in landscape, which is about 90° across on a phone held sideways, and that bulged whatever was nearest the camera.
  - Now the narrower of the two angles is never under 22° across or 24° up and down, and the camera stands back to compensate.
  - The near solar wing no longer dwarfs the far one.
  - The sun sprite scales with the field of view, so it stays the same size on screen.
- **Framing that knows where the UI is** (`SceneEnv.setInsets`, `fitDistance`). The picture's centre moves into the gap between the HUD and the bottom buttons, so the station isn't half under the power card on a phone.
  - The shift uses `camera.setViewOffset`, so tapping a module still hits the right one.
  - Only UI that crosses the middle third of the screen counts. The top HUD counts only in portrait.
  - The opening distance and the refit after a module docks both use `fitDistance`, not the old 2.4/3.4 multipliers.
  - Zoom limits are now 14 to 420 m, up from 12 to 170, since everything sits further back.
- **A smaller HUD on phones held sideways** (landscape at 500 px tall or less). The HUD is scaled to 72% as a whole and the power card is narrower.
- **The canvas is resized from the frame loop, not only on the window's resize event.** On phones the address bar slides and the screen turns, and the event can fire before layout settles. The browser then stretches a stale drawing buffer to the new shape, which looks like a stretched resolution. `SceneEnv.ensureSize()` compares the laid-out size each frame.
  - Confirmed from a screen recording on an iPhone. Stars showed as vertical streaks and Earth as a tall, narrow dome: the old build had drawn its frame at half the screen's height, and the browser stretched it to fit. The same thing was reproduced in a test browser, and it no longer happens with this build.
  - When the screen changes shape, the camera keeps the player's zoom relative to what fits, so the station doesn't shrink after the address bar slides away. A warning line appearing in the HUD recentres the view but leaves the zoom alone.
- **The portrait lens is tighter: at least 22° across.** On a Pixel 7 that's about 43° up and down, down from 62°. The play-test was on a phone.
- `__env` is on `window` in dev builds, next to `__sim`, for checking the camera.
- **Tests:** still 219. This was a view-only change, checked by screenshots on Pixel 7, iPhone 13 (portrait and landscape) and a 1440×900 desktop.

### Choices made

- **The lens leans long, more like a telephoto shot than a wide-angle one.** If the station now feels too distant or flat, the two minimum angles in `src/view/scene.ts` are the knobs.

## Session 24: phone polish

From the iPhone screen recording and a pass over every sheet at 320–440 px wide.

### What was built

- **The power card folds to one row.** It shows Power (generation / load), Battery with a thin bar, Loop and Crew.
  - Tap the Sunlight/Eclipse row, or its chevron, to fold or unfold it.
  - Phones (under 720 px wide) start folded; wider screens start unfolded. The choice is remembered per browser (`stationkeeper.hudCompact` in localStorage, wrapped in try/catch).
  - On an iPhone SE the HUD drops from about 270 px to 145 px of the 667 px screen.
  - Folded, the Crew figure turns amber or red for air and water problems too, since those readings are hidden. The warning line under the card still spells them out.
  - Tapping Crew still opens the crew sheet.
- **The top row fits on narrow phones.** At 375 px and below, the speed buttons ran 4–16 px off the right edge. Under 400 px wide the clock and buttons tighten; under 350 px the "UTC" label goes. Checked at 320, 360, 375 and 390 px.
- **The station reads in eclipse.** In the recording it all but vanished on the night side.
  - The hemisphere fill is brighter (sky `0x55536e`, ground `0x4f73a8`) and strongest in eclipse: intensity 2.0 in eclipse, about 0.65 in full sun.
  - Daylight shading looks the same as before.
- **Tests:** still 219. These are view and CSS changes, checked by screenshots at iPhone SE and iPhone 16 Pro Max sizes. The build, finance, crew, warnings and module sheets were all checked.

### Choices made

- **Folded is the phone default.** The full card is one tap away, and the station gets the screen. If play-testing shows players missing the coolant gauge or the Heat button, flip the default in `initialCompact()` in `src/ui/hud.ts`.

## Session 25: procedural module art

Every grey-box module got surface detail and parts, all still drawn in code: no image or model files.

### What was built

- **Canvas textures with bump maps** (`src/view/detail.ts`), drawn once at startup and shared:
  - plated hull: panel seams, fastener rows, faded panels, a hatch outline;
  - quilted blanket for the inflatable modules: diamond stitching and load straps;
  - crinkled gold foil: battery, radiator pump box, galley filter, life support water tank.
- **Textures stay the same size on every module.** `tileUv()` scales a part's UVs so one repeat covers 6 m, however big the cylinder. The number of repeats round the hull is rounded so the wrap seam lines up.
- **Open lattice trusses** for the solar and radiator booms: four longerons, a frame every 1.2 m bay and alternating diagonals, instead of solid square plates.
- **Docking ports:** every port now has a ring and three guide petals.
- **Gold handrails** on the core, habitats, life support and lab.
- **Fittings:**
  - core: comms dish, thruster quads;
  - solar: wing edge frames and tip bars, a cable down the truss;
  - radiator: coolant lines;
  - battery: grapple fixture;
  - life support: vent, sample port, tank bands;
  - cupola: window shutters.
- **The four inflatable kinds now look different:**
  - guest habitat: a ring of twelve windows;
  - crew quarters: two rows of small portholes;
  - galley: vent stack with a hood, and a filter box;
  - guest lounge: a wide panoramic band of ten large panes.
- **Draw calls are lower than before, despite the detail.** `mergeStatic()` bakes each module's plain meshes into one mesh per material. The solar gimbal is merged separately, since it turns. A 10-module station went from 101 draw calls to 93; without merging it would have been 226.
- **Tests:** still 219 (view only). Checked by close-up screenshots in sunlight and eclipse and in placement mode, with no console errors.

### Choices made

- **Textures over geometry for fine detail.** Seams, rivets and quilting are texture and bump, not polygons, so the triangle count rose about 15% while the station looks far busier up close.
- A `.glb` named in a module's `model` field still replaces its grey-box entirely, as before.

## Next

The planned slices are done. Candidates for what's next, roughly in order of value:

1. **Play-testing on a real phone**, to tune pace, readability, the first ten minutes, and now how often illness and exhaustion bite.
2. **More scenarios**, perhaps with their own modules or prices. Saltglass and Velvet Reach use the reviews goal; a crew-heavy posting where morale is the problem is another idea.
3. **More for guests to want**: perhaps a choice of fare level, or a second amenity to stack with the lounge.
4. **Art**: the grey-boxes now carry procedural detail (session 25). Blender models can still replace any of them; the loader prefers a `.glb`.
