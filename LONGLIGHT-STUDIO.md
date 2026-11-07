# Longlight Interactive: studio catalogue

> **Snapshot: 7 November 2026.** One reference file for every Longlight game.
> The same file is dropped into each game repo. Versions and details drift;
> when something matters, check the live repo. A game's own `CLAUDE.md` always
> wins over this file inside that game's repo.
>
> **Public edition.** It covers the ten games on the studio site and leaves
> out Kelbo's private and parked repos. Ask Kelbo about those.

---

## 1. What this file is for

Kelbo makes his games as Longlight Interactive. Each game lives in its own
repo, keeps its own look and is built by Claude sessions that usually can't see
the other games. This file gives every session the full studio picture so it
can do three jobs:

1. **Reuse first.** Before building a system (save codes, graphics tiers, a
   tutorial, a share card, a balance bot), check the **Reuse map** (section 10).
   Another game has often solved it already. Copy and adapt it; don't rewrite it.
2. **Pitch away from what exists.** When Kelbo asks for new game ideas, a new
   setting, new names or a new look, check **Names already taken** (section 8)
   and **Genres, looks and open space** (section 9) so the pitch is fresh, not a
   repeat of another Longlight game.
3. **Pitch improvements.** Each profile ends with gaps and improvement ideas,
   and section 12 lists studio-wide ones. A good idea from one game (say, daily
   seeds in The Whip) can often be pitched to another (Red Skies).

**Ground rules**

- **Read other repos, don't change them.** From a session in one game, never
  push to another game's repo unless Kelbo asks for that in so many words.
  Pitch the change to Kelbo instead.
- **Copy, don't link.** Never import code across repos or hotlink another
  game's files. Copy the file in, adapt it, and add a comment at the top:
  `// Adapted from <Repo> <path> (<date>)`.
- **Carry credits with assets.** If a copied model, sound or texture is
  third-party, copy its line from that repo's `CREDITS.md` / `ATTRIBUTION.md`
  / `LICENSES.md` too.
- **Use the name Kelbo only.** Never a real name, initials or email, in any repo.
- **Ask about real design decisions.** This file helps you pitch; Kelbo decides.

---

## 2. How to look at the other repos

Every game is a public repo under **github.com/Jxstrr0**, served by GitHub Pages
at **https://jxstrr0.github.io/<Repo>/**.

| Game | Repo | Live |
| --- | --- | --- |
| Prairie Engine Works | [Jxstrr0/350Chev](https://github.com/Jxstrr0/350Chev) | https://jxstrr0.github.io/350Chev/ |
| Lombard | [Jxstrr0/Lombard](https://github.com/Jxstrr0/Lombard) | https://jxstrr0.github.io/Lombard/ |
| Escapement | [Jxstrr0/Escapement](https://github.com/Jxstrr0/Escapement) | https://jxstrr0.github.io/Escapement/ |
| Scrapline | [Jxstrr0/Scrapline](https://github.com/Jxstrr0/Scrapline) | https://jxstrr0.github.io/Scrapline/ |
| Ink | [Jxstrr0/Ink](https://github.com/Jxstrr0/Ink) | https://jxstrr0.github.io/Ink/ |
| Station Keeper | [Jxstrr0/StationKeeper](https://github.com/Jxstrr0/StationKeeper) | https://jxstrr0.github.io/StationKeeper/ |
| Season Ticket | [Jxstrr0/SeasonTicket](https://github.com/Jxstrr0/SeasonTicket) | https://jxstrr0.github.io/SeasonTicket/ |
| Frontier Lab | [Jxstrr0/FrontierLab](https://github.com/Jxstrr0/FrontierLab) | https://jxstrr0.github.io/FrontierLab/ |
| The Whip | [Jxstrr0/The-Whip](https://github.com/Jxstrr0/The-Whip) | https://jxstrr0.github.io/The-Whip/ |
| Red Skies | [Jxstrr0/RedSkies](https://github.com/Jxstrr0/RedSkies) | https://jxstrr0.github.io/RedSkies/ |
| Studio site | [Jxstrr0/Kelbo.Website](https://github.com/Jxstrr0/Kelbo.Website) | https://jxstrr0.github.io/Kelbo.Website/ |

Kelbo's private and parked repos are not covered here (section 11).

**Ways to read one**

- **Claude Code in the cloud:** call the `add_repo` tool (owner `Jxstrr0`,
  repo name as in the table), then clone it where the tool says. Don't
  pre-check with curl; just call the tool.
- **Any session with git:** a shallow, read-only copy outside your own repo:
  `git clone --depth 1 https://github.com/Jxstrr0/<Repo>.git /tmp/<repo>`
- **One file:** `https://raw.githubusercontent.com/Jxstrr0/<Repo>/main/<path>`
- **Where to start in a repo:** `CLAUDE.md`, then the design doc it names
  (`docs/DESIGN.md`, `DESIGN.md`, `docs/01-GDD.md`), then the status file
  (`plan/status.md`, `PROGRESS.md`, `docs/PROGRESS.md`, `docs/STATUS.md`).

---

## 3. The studio brand (studio pieces only)

**Each game keeps its own look.** Its fonts, colours and art stay its own, and
game screens are never restyled to match the studio. The Longlight brand
applies only to studio pieces: the logo or splash, the credit line, the studio
block on a credits or about screen, and any link back to the studio site.

| Piece | Rule |
| --- | --- |
| Logo | The horizon lockup: a half-set clay sun on a long horizon line, LONGLIGHT above INTERACTIVE. Use the official files from `Jxstrr0/Kelbo.Website` `assets/press/longlight-logo-dark` and `longlight-logo-light` (SVG, plus 2x PNG); press kit at https://jxstrr0.github.io/Kelbo.Website/press.html. Copy them in. Never hotlink, redraw, recolour or swap the letters for live text. |
| Colours | Clay `#D97757`, Purple `#7B3FC4`, Slate `#141413`, Ivory `#FAF9F5`, Lilac `#B48CE8`. Nothing else in the logo or studio block. |
| Font | Space Grotesk 500/700. Self-host it in a studio piece; no new font host. |
| Name | Always "Longlight Interactive" in full. |
| Credit line | `© <year> Kelbo / Longlight Interactive` (the studio isn't a registered business yet). |
| Studio link | https://jxstrr0.github.io/Kelbo.Website/ |

Some games chose the Longlight colours as their own in-game look too (Prairie
Engine Works, Scrapline, Station Keeper, Lombard's menus). That's their
choice, not a rule.

**Brand drift found in this snapshot** (good small fixes to pitch):

| Game | Drift |
| --- | --- |
| The Whip | `longlightMark()` in `src/ui/text.js`, the loading mark and the favicon are a hand-drawn sun; `--brand #6c46b5` and `--brand-paper #e1ded5` are off-palette. |
| Season Ticket | `src/ui/brand.ts` and `public/icons/` use older colours (purple `#6F45B8`, copper `#C2826A`, ink `#1C1820`, paper `#E1DED7`); no `©` line anywhere. |
| Frontier Lab | Title, boot and credits say only "A Longlight Interactive game": no logo, no `©` line. |
| Station Keeper | Same: no logo, no `©` line, no studio link. No CLAUDE.md or brand section. |
| Red Skies | Credit is text only ("A GAME BY LONGLIGHT INTERACTIVE"); old names "Weapons Hold" and "Prairie Blue Studio" linger in file headers and `dist/` names. |

---

## 4. Rules every Longlight game shares

- **Kelbo** is a beginner-plus coder who tests on his phone from the live site.
  End every task with a plain-language summary and how to test it on a phone.
- **Phone first.** Touch must work before a feature is done. Portrait unless
  the game says otherwise (Season Ticket is landscape; Red Skies is portrait only).
- **Four-number versions**, `Major.Minor.Patch.Build` (Major = overhaul,
  Minor = feature batch, Patch = tweak or fix, Build = republish). npm projects
  keep a three-number `package.json` version that players never see.
- **Fictional names** for people, companies, brands, units and invented
  countries. Some games use real cities (see section 8); check before you do.
- **The sim stays separate from rendering**: no DOM or three.js in sim code,
  seeded RNG only, no `Math.random` or `Date.now` in the sim. Tuning numbers live
  in tables or data files, not inline.
- **Branch, PR, merge on green.** Never push to `main`. Kelbo has given standing
  permission to merge once the repo's checks pass (each CLAUDE.md says which).
  Small PRs he can read on a phone.
- **GitHub Pages deploy**: merging into `main` is the deploy.
- **Save safety** (every current game has it): a save code
  (`PREFIX1:` + compressed JSON + checksum), backup files
  (`<game>-backup-YYYY-MM-DD.txt` through the share sheet or a download),
  `navigator.storage.persist()`, and a reminder after 14 days without a backup.
- **Players' save codes are their personal data**: decode them locally only,
  never send them anywhere, never commit them.
- **No backend, accounts, analytics, ads or API keys** in any game.

---

## 5. The shared origin: storage and cache names already taken

Every game and the studio site live on **one origin, `jxstrr0.github.io`**.
That means one localStorage, one Cache Storage, one IndexedDB space and one
storage quota for all of them.

- Use **your own prefix** for every localStorage key, IndexedDB database and
  cache name.
- **Never clear or delete anything outside your own prefix.** No
  `localStorage.clear()`; a service worker deletes only caches that start with
  its own prefix.
- One `persist()` grant covers every game on the origin.

| Game | localStorage | Caches | Save code |
| --- | --- | --- | --- |
| Studio site | `kelbo.*` | `longlight-*` (now `longlight-3`) | none |
| Prairie Engine Works | `pew2-save`, `pew2-slot1..3`, `pew2-legacy` | `pew-` | `PEW1:` (old `PEW2:` still loads; next is `PEW3:`) |
| Lombard | `lombard.*` (settings) + IndexedDB database `lombard` (careers) | none (no service worker yet; use `lombard-` when one is added) | `LMB1.` (dots, not a colon: `LMB1.<data>.<checksum>`) |
| Escapement | `esc-save`, `esc-slot1..3` | `esc-` | `ESC1:` (next `ESC2:`) |
| Scrapline | `scr-save`, `scr-slot1..3` | `scr-` | `SCR1:` (next `SCR2:`) |
| Ink | `ink-save`, `ink-slot1..3` | `ink-` | `INK1:` |
| Station Keeper | `stationkeeper.*` | none (no service worker) | `SK1:` |
| Season Ticket | `seasonticket.*` | build-time service worker | `ST1:` |
| Frontier Lab | `frontierlab.*` + IndexedDB `frontierlab` | content-hash name | `FL<schema>:` |
| The Whip | `whip:*`; sessionStorage `whip:backup-reminded` | none (no service worker) | no prefix: plain base64 JSON (see profile) |
| Red Skies | `redskies.v1.*` | none (no service worker) | `RS1:` |

> **Fixed on 7 November 2026:** the studio site's `sw.js` used to delete every
> cache that wasn't its own when it updated, which wiped the games' offline
> copies. It now deletes only `longlight-*` caches. Every service worker on the
> origin must follow the same rule.

---

## 6. The games at a glance

Status is Kelbo's label on the studio site (`projects.json`); version is what
the repo's code says on 7 November 2026. Order is Kelbo's own ranking.

| Game | Status | Version | Genre | Setting | Screen | Stack |
| --- | --- | --- | --- | --- | --- | --- |
| Prairie Engine Works | Released | 1.76.78.0 | Engine builder, dyno, ten race events, race-team career | Prairie engine shop (Saskatoon) | Phone, both ways; desktop layout | Classic JS + `build.js`, three r128 (CDN) |
| Lombard | In development (site); repo shipped 1.0.0.0 on 6 Nov | 1.0.0.0 | First-person pawn shop sim: inspect, appraise, haggle; a crime layer | Mostograd, a 2010s Russian river city | Portrait first | TypeScript, Vite, three 0.187 (npm) |
| Escapement | Prototype | 1.0.2.3 | Watchmaking career: build, regulate, certify, sell | The Haldis, Velmark (alpine, 2000–2030) | Portrait (side by side in landscape) | Classic JS + `build.js` (PEW stack), three r128 |
| Scrapline | In development | 0.1.16.2 | Combat-robot builder, arena fights, career | Velmark and the Haldis (shared with Escapement) | Portrait (side by side in landscape) | Classic JS + `build.js` (PEW stack), three r128 |
| Ink | Prototype | 0.1.15.1 | Tattoo artist career: consult, design, tattoo, heal, see it age | Mostograd (shared with Lombard), 2000–2030 | Portrait (landscape layout too) | Classic JS + `build.js` (PEW stack), three r128 |
| Station Keeper | In development | 0.1.2.0 | Space-station tycoon, cascading systems | Real low Earth orbit, 2041–2045 | Any | TypeScript, Vite, three 0.187 |
| Season Ticket | Released | 1.1.2.0 | Football club owner/GM with live tactics | Valmere, a fictional northern republic | **Landscape** | TypeScript, Vite, three 0.186 |
| Frontier Lab | In development | 0.1.63.0 | AI-lab tycoon (fork of Vault Street) | Real cities on procedural maps | Portrait | TypeScript, Preact, 2D canvas/SVG |
| The Whip | Released | 1.0.0.0 | Political career: votes, deals, whip | Dominion of Caledor (Westminster) | Portrait first | ES modules, no build, three 0.160 (CDN) |
| Red Skies | Complete | 1.6.1.0 | SAM air-defence: identify, hold fire | Republic of Varenna | **Portrait only** | Plain JS + inline build, three r128 vendored |

Studio site trading projects (not games): Pre-market brief, AI Trading Journal,
Agent Fleet.

---

## 7. Game profiles

Each profile uses the same headings so you can compare games quickly. Paths
are as of this snapshot.

### Prairie Engine Works (repo `350Chev`)

- **Status:** Released. 1.76.78.0 (`const VERSION` in `src/app/state.js`; the CLAUDE.md header lags behind).
- **Pitch:** a physics engine builder. Pick a layout, choose every part down to the rod bolts, put it on the dyno, race it, or run a shop that supplies race teams a season at a time.
- **Loop:** 19 layouts, 56 part tables (268 options), 96 base engines. Dyno, endurance and over-rev tests. Ten event types: drag, bracket, pull, salt flats, bog, boat, road course, hill climb, oval, 24-hour. Career: supply race teams for 8-round seasons across 27 series, with certification, R&D, crew, sponsors, 3 rival shops and Legacy prestige. A test-cell sandbox.
- **Setting and tone:** a prairie engine shop around Saskatoon ("Section Line Dragway · Saskatoon"). The real Pikes Peak and Bonneville appear. Money in `$` (en-CA). Hands-on gearhead.
- **Look:** "engine shop at night". A 3D engine and garage under the "Shop Glass" UI (`src/css/ui-glass.css`). Fonts: Chakra Petch, Barlow, IBM Plex Mono (Google Fonts).
  - Dark: soot `#141413`, panels `#1c1b19` / `#252421`, chalk `#faf9f5`, muted `#b4b1aa`, orange `#d97757` / `#e8956f`, accent `#b48ce8`. Status colours: good `#5cbf8a`, warn `#e2b24a`, crit `#ee5a5e`, info `#78a9dd`.
  - Light: bg `#faf9f5`, panels `#ffffff`, text `#141413`, orange `#ad4d2a`, accent `#7b3fc4`.
  - Theme: dark, light or auto.
- **Platform:** phone portrait and landscape; a desktop layout (`html.desk`).
- **Stack:** classic JS globals `ENGINE_SIM` / `ENGINE_SOUND` / `ENGINE_VIS`.
  - `build.js` joins the 119 files in `src/manifest.txt` into `index.html` (about 3.8 MB) and writes `sw.js`.
  - three r128 from cdnjs. Post-processing addons and GLTFLoader come from jsdelivr via `PEW_LIBS` / `__pewPost`.
  - Lite/Full/Ultra graphics tiers.
  - No CI. Checks: `node build.js --check` and `node check-savecode.js` (15 checks).
- **Saves:** `pew2-save`, `pew2-slot1..3`, `pew2-legacy`.
  - Code `PEW1:` (LZW + base64url + 6-character FNV checksum). Old one-game `PEW2:` codes still load; the next format is `PEW3:`.
  - Backup file `prairie-engine-works-backup-YYYY-MM-DD.txt`; last backup time in `S.bkAt`.
- **Audio:** an engine synth built from the engine's specs, plus 72 openly licensed recordings (`sounds/CREDITS.md`). A Synth / Real / Blend setting.
- **Reusable:**
  - Build and offline: `build.js` (with `--check`, `--absorb` and a content-hashed `sw.js`), `src/app/pwa.js`.
  - Saves: `src/app/savecode.js` + `check-savecode.js`.
  - Loading and speed: the `#boot` splash in `src/html/head.html`, `src/app/perf.js`.
  - Photos and cards: photo mode (`src/app/photo.js`, `src/vis/photo.js`, `phoSave`); the results card `src/app/rcard.js` (ghost curve, holo trophy).
  - Help and UI: `src/app/help.js` (tour, glossary, 17 lessons), `ui-glass.css`, `src/app/rail.js` (results rail and sheet), `folds.js`.
  - Career pieces: `crew.js`, `rivals.js`, `legacy.js`.
  - Assets: `src/vis/models.js` + `tools/pack-model.py`, `tools/make-icons.js`, `tools/fetch-sounds.js`.
- **Names:**
  - Tracks: Section Line Dragway, Prairie Sky Raceway, 24 Hours of Prairie Sky, Coulee Park, Grain Exchange Street Circuit.
  - Hills: Badlands Grade, Kettle Butte, Ghost Ridge, Thunder Pass.
  - Rival shops: Hollis Hot Rods (Tulsa; owner Dale Hollis), Marlow & Daughters (Duluth), Tidewater Diesel & Marine (Galveston).
  - Sponsors: Blue Heron, Coldwater, Ironhorn, Corvid, Gopher Valley, Red Butte, Gripline, Hollow Ridge, Static Moose, Wild Oat, Northlight. Northwind Tyre appears on signs.
  - 24-hour teams: Moose Jaw Speed, Estevan Oilpatch, Canola Speedworks. Trucks: Prairie Thunder, Sod Buster.
- **Gaps:** turbo spool, supercharger whine and nitrous are still synthesized; there's no Deltic recording; the first load is 3.8 MB.
- **Pitches:**
  - A node sim-test harness like Escapement's `tools/sim-test.js`.
  - "Watch it" replays for pull, bog, boat and hill.
  - Lazy-load chunks of the 3.8 MB page.
  - Escapement's metal materials (`studio.js`, `finish.js`) and its Blender prop scripts.
  - A CI check on PRs (Kelbo's call).

### Lombard

- **Status:** released **1.0.0.0 on 6 November 2026** (`VERSION` file; `package.json` stays at 0.1.0). The studio site still shows "In development" 0.1.1.0. Roadmap M0–M6 are done. Save `STATE_VERSION` is 9.
- **Pitch:** a first-person pawn shop sim. Stand at the counter of a canal-side *lombard*, inspect what people bring in, work out what it's worth and whether they're lying, then haggle.
- **Loop:**
  - Customers: 8 sellers a day, each with an item and a story. Some are walk-ins built from templates; 40 are authored regulars.
  - Inspect: orbit and pinch the 3D item, then use the tools (loupe, scale, UV, magnet, acid, reference book, phone lookup, specialist call). Each tool returns evidence cards; the game never says "FAKE".
  - Decide: buy, give a pawn loan (30 days, interest) or pass. The haggle runs 2–5 rounds with Straight / Evidence / Sympathy / Walk.
  - Between customers: price and display stock, sell to walk-in buyers, take phone calls.
  - Day end: the ledger, the morning paper, reputation by group.
  - Wider systems: 5 specialists on retainer; a crime layer (police heat and Detective Volkova, mob protection, a fence); 8 story arcs plus specialist arcs and 20 regular threads; upgrades; an appraiser hire.
  - Endings: retire from day 90 or hit a forced ending. One of 19 ending titles is picked from 4 hidden axes, then a newspaper epilogue and a card for each character.
- **Setting and tone:**
  - Place: Mostograd, a fictional St Petersburg-like river city, shared with Ink. The shop is on Kanatnaya Street in the Kanal district.
  - Time and money: the career starts 2014-03-03; money is rubles (₽).
  - The default shop name is "Lombard No. 7" (the player can rename it). The player has no name or face.
  - Tone: warm slice-of-life with dark-comedy edges; the crime is grounded. Some signage is in Cyrillic.
- **Look:** a lived-in canal-side shop in warm evening light.
  - 3D: a full Cycles lightmap bake, scripted Blender item models, and Microsoft Rocketbox rigged humans (MIT).
  - UI: 2D DOM in paper tags, receipt mono and worn plastic. Menus and the title use the Longlight palette.
  - Fonts: Space Grotesk 400/500/700 and IBM Plex Mono 400/500/600, self-hosted via `@fontsource`. The newspaper is in Georgia.
  - Palette (`src/style.css`):
    - Base: slate `#141413`, surface `#1c1b19`, card `#1f1e1b`, plastic `#2a2723`, ivory `#faf9f5`, muted `#a39d92`.
    - Paper: `#efe7d4` with ink `#2a241c` / `#6a5f50`, red `#9e2b1f`, green `#2f5a33`. Newsprint `#ece4cf`.
    - Accents: clay `#d97757`, light clay `#e8967a`, purple `#7b3fc4`, lilac `#b48ce8`.
  - Dark only. Settings for reduced motion and text size.
- **Platform:**
  - Layout: portrait phone first (390×844). Landscape and desktop move the dialogue and actions into a right-hand column.
  - Input: Pointer Events. Drag to look; orbit and pinch to inspect; tap and hold to use a tool. The desktop key map is `src/input/keymap.ts`.
  - Budget: 30+ fps on a 2021 mid-range Android; first load 13.9 MiB against a 15 MiB cap.
- **Stack:** TypeScript 5.9 and Vite 8.3.5, with no UI framework.
  - three.js 0.187.0 from npm, split into chunks. Also idb, zod, fflate and stats.js.
  - Dev tools: Vitest, ESLint, Playwright, gltf-transform, KTX2, Draco.
  - Workflows: `deploy.yml` (lint, test, build, Pages); `bake.yml` and `items.yml` (headless Blender).
  - Checks: `npm run lint`, `npm run test`, `npm run build` (with the `scripts/check-bundle.mjs` budget gate), `npm run shots`, `npm run sim -- --days 100 --seeds 10`.
  - URL flags: `?debug=1`, `?perf=1`, `?scenario=`, `?gallery=1&item=`, `?seed=`, `?tier=`, `?time=HH:MM`, `?street=`, `?weather=`, `?life=0`.
- **Saves:**
  - Careers: IndexedDB database `lombard`, store `careers`, 3 slots.
  - Settings: localStorage keys `lombard.*` (`sound`, `ambience`, `lastBackup`, `qualityTier`, `autoTier.v2`, `reduceMotion`, `textScale`, `lookHintSeen`).
  - Save code: `LMB1.` + base64url(deflate JSON) + `.` + a 7-character FNV-1a base36 checksum (`src/game/save/code.ts`). Under about 20 KB.
  - Migrations come with frozen fixtures for v1–v9.
  - Safety: backup file `lombard-backup-YYYY-MM-DD.txt`, `persist()`, a storage line and a 14-day reminder (`src/persist/safety.ts`).
  - **No service worker.**
- **Audio:** WebAudio. `src/audio/cues.ts` is a pure map from state change to sound; `engine.ts` plays them, including a 54 s ambience loop with crossfades. 13 CC0 OpenGameArt recordings as mono MP3, built by `art/audio/build.py`.
- **Reusable:**
  - Saves: `src/game/save/code.ts` (compact deflate codes with readable errors); `src/persist/safety.ts`; `src/persist/autosave.ts` + `src/game/save/slots.ts` + `migrations.ts` (IndexedDB slots with fixture-tested migrations).
  - Speed and loading: `src/render/perf.ts` (tiers; steps down when the median frame rate falls under 45 fps); `#loading` + `src/ui/loading.ts`.
  - Audio: `src/audio/cues.ts` + `engine.ts`, and `art/audio/build.py`.
  - Blender in Actions: `bake/` + `bake.yml` (a headless Cycles bake started from the phone). Builders in `art/items/`, `art/customers/build.py`, `art/street/` and `art/backdrop/`. Packers `scripts/*-pack.mjs` + `copy-decoders.mjs`.
  - Game logic: `src/game/haggle/machine.ts`; `src/game/story/` (a declarative story-arc engine); `src/sim/simulate.ts` + `policies.ts`; `src/game/rng.ts` (mulberry32).
  - Text: `src/data/strings/` (a typed `t()` with Intl plurals, plus a test that catches hard-coded English).
  - Checks and tools: `scripts/shots.mjs`, `scripts/check-bundle.mjs`, `scripts/make-icons.mjs`.
  - Living scene: `src/render/street/` (sprite passers-by, traffic, a boat, weather); `src/render/life/` (wall clock, moving sunlight, steam, a flickering tube); `src/ui/screens/news.ts`.
- **Names:**
  - Specialists: Faina Gelfand, Ilya Semyonovich Brodsky, Gennady Pavlovich Shurygin, Stanislav Edgarovich Lyubimov, Zhenya Kroshkina.
  - Crime and law: Detective Alla Sergeevna Volkova; the fence Veniamin "Venya" Mostovoy; the crew's Eduard Lvovich and Zhora.
  - The shop's people: previous owner Yuri Gusev; appraiser Lev Andreyevich Sablin; landlord Semyon Markovich; caretaker Pyotr Kuzmich Lapshin.
  - Story cast: the Collector Leopold Germanovich Bessmertny (Bessmertny Foundation for Domestic Beauty); Seryozha the roofer; Father Ioann; Edik Sorokin and Ramil; Fedya Ryabov; Zinaida Petrovna.
  - The 40 regulars are in `src/data/regulars/`.
  - Brands:
    - Watches: Rolland, Omeca, Brequet-Fils, Mostochas.
    - Phones: Mangosteen, Galaxia, Vertex.
    - Cameras: Kanon, Nevka.
    - Laptops and VHS: Tosaki.
    - Bags: Louis Vieux, Guccio.
    - Hi-fi: Rubezh, Nakashima. Car audio: Severin.
    - Consoles: Nimbus, Kosmo.
    - Records: Liraphon, Kanal. Books: Mostizdat.
    - Real Soviet makes appear as historical items: Pobeda, Vostok, Zenit.
  - The paper: Вечерний Мостоград / *Evening Mostograd*.
- **Gaps:**
  - Previews render with AgX tone mapping; the game uses ACES.
  - Parked speed work: avatars as KTX2 (about 10 MB decoded each), a smaller HDRI, an ETC1S lightmap.
  - Parked polish: the street door doesn't open; no footsteps, temperament idles, shop cat, clock tick or fan; the landscape haggle bubble covers the item.
  - In the GDD but not built: loan renewals; walk-outs coming back with the remembered offer; neighbourhood reputation changing the customer count (fixed at 8); sports items; a second language.
  - The roadmap doc lags behind the code.
- **Pitches:**
  - A `lombard-` service worker so installed copies work offline.
  - Walk-outs who come back later with the remembered offer, and standing that sets the daily customer count.
  - Temperament idles as haggle tells.
  - A shareable ending card (the `share.js` pattern from Escapement and Ink).
  - Tattoo machines brought in by someone from Sedov's (a crossover with Ink).

### Escapement

- **Status:** the site shows "Prototype" 1.0.1.0; the repo is at 1.0.2.1 (`const VERSION` in `src/app/state.js`). The whole plan is built. Paused until Kelbo answers `docs/OPEN-QUESTIONS.md` (balance and design questions).
- **Pitch:** a watchmaking career. Build mechanical movements part by part, put them on the timegrapher, chase chronometer certification, and grow a shared repair bench into a manufacture with its own calibres.
- **Loop:** PEW's build-test-compete loop, with the race swapped for the market.
  - Build and test: 12 part slots, about 55 options, 17 stress COMBOS. A timegrapher where you regulate, adjust the beat and poise.
  - Certify: a 15-day trial at Bench, Chronometer (BCH) or Observatory grade.
  - Business: repairs, retail, commissions, trade batches, upgrades, staff, a once-only bank loan.
  - Calendar: the Haldis Valley Fair, the Kessel Peak Trial against 5 rivals, two auction nights, the 2015–18 smartwatch slump.
  - R&D: 17 projects, up to 4 calibres.
  - Time: act, then Close week. New game offers Repair bench 2000, Skip ahead 2008, or a Sandbox.
- **Setting and tone:** the Haldis, a watchmaking valley in northern Velmark, an invented alpine country (shared with Scrapline). The city is Velm. 2000–2030. Money: euros, `€4,850` (whole amounts; Kelbo, November 2026). Quiet, warm, gently wry.
- **Look:** dark felt, brass and steel, with a 3D movement, a dial view and a workshop that grows by stage. Fonts: Space Grotesk + JetBrains Mono (Google Fonts).
  - Dark: felt `#121815` / `#0c110f`, panels `#19201c` / `#212a25`, chalk `#f2efe6`, muted `#b3bab4`, brass `#c9a45c` / `#e0c07e`, steel `#9fa8ad`. Status colours: good `#6cc08f`, warn `#e2b24a`, crit `#e0625a`, info `#7fa9d6`.
  - Light ("pale workshop"): felt `#f3efe6`, panel `#fffdf8`, text `#18201b`, brass text `#7a5c1c`.
  - The 3D view stays dark in both themes.
- **Platform:** portrait; side by side in landscape. No haptics.
- **Stack:** the PEW shape, with globals `WATCH_SIM` / `WATCH_VIS` / `WATCH_SOUND` / `WORKSHOP_SOUND`.
  - `index.html` is about 498 KB. three r128 from cdnjs; bloom via `ESC_LIBS` / `__escPost`.
  - Checks: `node build.js --check`, `node check-savecode.js` (16 checks), `node tools/sim-test.js`.
- **Saves:** `esc-save`, `esc-slot1..3`; caches start `esc-`.
  - Code `ESC1:` (the next format is `ESC2:`).
  - Backup file `escapement-backup-YYYY-MM-DD.txt`; last backup time in `S.lastBackup` inside `esc-save`.
- **Audio:** a synthesized tick at any beat rate (`src/sound/tick.js`) and 6 CC0 workshop recordings (`src/sound/workshop.js`).
- **Reusable:**
  - Sharing and cards: `src/app/share.js` (`shareCanvas`, 13 lines); `src/app/cards.js` (1080×1350 certificate and trophy cards).
  - Sound: `tick.js`, `workshop.js`.
  - Materials: `src/vis/studio.js` (an HDRI baked per tier); `src/vis/finish.js` (perlage, Côtes de Genève, `metalMat`, `gemMat`).
  - Tools: `tools/blender/*.py`, `tools/sim-test.js`.
  - Help: `help.js` (`TUT`, `GLOSS`, `data-g`); `CERT_FIX` / `goFix` in `src/app/test.js`.
  - UI and speed: the 60 fps cap `FRAME` (`src/vis/bench.js`); `openSheet` / `sheetHist`.
- **Names:**
  - Places and bodies: Haldis, Velmark, Velm, Kessel Peak, the Haldis Chronometry Bureau (BCH), Kessel Peak Observatory, Haldis Savings Bank.
  - Events: the Haldis Valley Fair, the Kessel Peak Trial; auction house Brugg & Lell.
  - Rivals: Varn & Söhne, Halvard, Atelier Amsel, Kessler, Ostrander Frères. Collectors: Judge Falk, Dr Abelard.
  - Staff: Anneli Brask, Joris Halm, Mette Ostrander, Tobin Vael, Ilse Karrow, Pieter Lund, Saskia Dorn, Emil Fasch, Runa Velt, Kasimir Ott, Lotte Hesse, Bram Iversen.
  - The first calibre: "Haldis 1".
- **Gaps (from the 1.0.2.1 audit):**
  - Balance: prices run away late; trial results ignore skill; a 2008 start can go broke; commission budgets are fixed; the Kessel Peak Trial becomes unwinnable.
  - Missing pieces: no ending at 2030; climate control does nothing; staff have no skills.
  - Blockers: the bench is blocked while a piece is away; trade batches can't be handed back.
  - Polish: font sizes in px; share not tried on a real phone.
- **Pitches:**
  - A 2031 end-of-career card.
  - Trial noise that shrinks with skill and climate control.
  - Six-figure pieces sell only at auction or to top collectors.
  - A ghost curve on the timegrapher, plus haptics.
  - Font sizes from px to rem.

### Scrapline

- **Status:** the site shows "In development" 0.1.12.0; the repo is at 0.1.15.2 (`const VERSION` in `src/app/state.js`). All 10 plan PRs are done. There are no GitHub Releases, so the site lags.
- **Pitch:** build combat robots in a Haldis workshop and fight them in the arena.
- **Loop:**
  - Five weight classes: Ant 150 g, Beetle 1.5 kg, Hobby 5.5 kg, Feather 14 kg, Heavy 110 kg.
  - Build: part slots and a layout grid; six bench tests.
  - Fight: a deterministic 60 Hz fight sim shown in 3D, in 1v1, rumble, tag team and minibot formats. A 60-second pit window, a post-mortem and a replay.
  - Career: 52-week seasons over 4 acts.
- **Setting and tone:** the present day from 2026, in Velmark and the Haldis, **the same world as Escapement**. Money is euros (`€4,850`). Venues: Haldis Gemeindehalle, Stahlbrück, Eisenau, Grauwald, the Eisenhalle. German-flavoured alpine names.
- **Look:** uses the Longlight palette as its own look. Fonts: Space Grotesk + JetBrains Mono (Google Fonts).
  - Dark: base `#141413`, surface `#1C1B19`, card `#1F1E1B`, ink `#F2EFE8`, muted `#ABA79E`, clay `#D97757` (light-theme text `#A8482A`), lilac `#B48CE8` / purple `#6A33AD`. Status colours: good `#4CC38A`, warn `#E2A93B`, crit `#E5484D` (text `#F06A6E`).
  - Light: base `#FAF9F5`, surface `#F1EEE7`, card `#FFFFFF`, ink `#1C1B19`.
  - Theme: dark, light or auto.
- **Platform:** portrait; side by side in landscape. Stick, tap-to-go, keyboard, gamepad and haptics.
- **Stack:** the PEW shape, with globals `SCRAP_SIM` / `SCRAP_VIS` / `SCRAP_SOUND`; `SCR_LIBS` / `__scrPost`.
  - Checks: `node build.js --check`, `check-savecode.js` (16 checks), `tools/sim-test.js` (which also bans `Math.random` and `Date.now`), `tools/fight-test.js`.
- **Saves:** `scr-save`, `scr-slot1..3`; caches start `scr-`; `SAVE_V` 7.
  - Code `SCR1:` (the next format is `SCR2:`).
  - Backup file `scrapline-backup-YYYY-MM-DD.txt`.
- **Audio:** a synth (`src/sound/synth.js`) plus 18 CC0 clang recordings.
- **Reusable:**
  - Fighting: `src/sim/fight.js` (deterministic 2D rigid bodies with a height axis, an input log and `replayFight`) + `tools/fight-test.js`; `src/sim/ai.js` (8 driving styles).
  - Controls and effects: `src/app/controls.js`; `src/vis/fx.js`.
  - Help and reports: `src/app/help.js` (loaner-bot tutorial, `phoSave`, a bot card via `SCRAP_VIS.shot`); `src/app/report.js`.
  - Scene: `src/vis/props.js`.
  - Shared with the PEW line: `src/sim/rng.js`, `build.js`, `savecode.js`, `perf.js`, `pwa.js`.
  - Tools: `tools/blender-arena-kit.py`, `tools/blender-bot-shells.py`, `tools/pack-model.py`, `tools/get-polyhaven.py`, `tools/make-icons.js`.
- **Names:**
  - Rivals: Ottilie Brandt, Rudi Kessler, Mira Vogt, Anselm Huber.
  - Staff: Liesl Amrein, Konrad Fehr, Pia Lötscher, Bruno Zaugg, Jonas Ritter, Vera Hasler.
  - Sponsors: Zahnrad Bräm, Kaffee Alpenrot, Seilbahn Haldis, Stahlbrück Eisenwerk, Radio Velmark, Velmark Bahn.
  - Bots: Zahnrad, Kiesel, Feierabend, Holzwurm, Glockenschlag, Zange, Uhrwerk, Lawine, Hochofen, Walzwerk.
- **Gaps:**
  - Balance: some builds win over 65% of fights.
  - Replays: could drift between browsers (they use `Math.sin`).
  - Fights: no disc-against-disc contact; no pit window in rumble or tag.
  - Rendering: no interpolation between sim steps.
  - Tidying: an `undefined/` screenshot folder is committed.
- **Pitches:**
  - Deterministic maths so replays can be shared (Season Ticket's `det.ts`).
  - Publish GitHub Releases so the studio site updates.
  - Slow-mo replays with commentary.
  - A team post-mortem.
  - Delete `undefined/` and add a studio link.

### Ink

- **Status:** the site shows "Prototype" 0.1.0.0; the repo is at 0.1.15.1 (`const VERSION` in `src/app/state.js`). Every item in `docs/INK-PLAN.md` (PR 0–10) is ticked; no 1.0 has been declared. Playable and live.
- **Pitch:** a tattoo artist career. Start as an apprentice sweeping floors in Mostograd and finish with a two-year waiting list and a body of work that has aged on clients who keep coming back: "the canvas remembers".
- **Loop:** Consult → Design → Stencil → Session → Heal → Years later. Career › Next moves the week on.
  - Consult: a 3–5 line chat that reveals must-haves and dealbreakers ("ID checked, 18+").
  - Design: a board of 135 curated SVG elements in 9 styles over 26 placements, with live ▲/▼ scores (readability, flow, skin contrast, fit) and an aging preview. No freehand drawing.
  - Session: trace the stencil at a target pace; shading and colour are hold-and-swipe meters; pain, fatigue and breaks. A kit build (machine, needles, inks, voltage).
  - Heal: the reveal comes two weeks later.
  - Results: reviews, loyalty, and 3 reputation tracks (walk-ins, peers, collectors).
  - Career in 4 acts: apprentice (years 0–3, which doubles as the tutorial), rented chair (3–8), your own studio with build-out and staff (8–20), legacy (20–30).
  - Events: conventions, guest spots, rivals, social media from 2016, cover-ups, once-per-career reckonings, a TV offer, and a Legacy screen at year 30.
  - Going broke sends you back to a rented chair; there's no game over.
- **Setting and tone:** Mostograd, shared with Lombard, 2000–2030. Rubles, with a `PRICE_INDEX` inflation curve. "A working shop, not dark comedy": no crime or mob. Every client is an adult.
- **Look:** "warm studio light, black ink on a cream board, hand-lettered signage, not neon".
  - Scenes: a 3D studio (5 rooms by career stage) with a seated stylised mannequin wearing the tattoos as UV decals, plus a 2D SVG design board and body diagram.
  - Fonts: Space Grotesk 400/500/700 (UI) and Oswald 500/600 (flash headers), from Google Fonts.
  - Dark: bg `#17130f`, panels `#211c17` / `#2b241d`, line `#3b3229`, text `#f2ebdd`, mute `#a39a8b`. Accents: red `#c8553d` / `#e06a50`, teal `#3f8f86`, gold `#d9a441`. Board `#f3ead8` with ink `#16120e`.
  - Light: bg `#f4efe6`, panel `#fffaf1`, text `#1c1813`, red `#b3432c`.
  - Theme: dark, light or auto; the board stays cream in both.
- **Platform:** phone portrait, with a landscape layout for short screens.
  - Five bottom tabs: Studio, Design, Session, Clients, Career.
  - Touch first: trace, drag, pinch, and drag the stencil onto the 3D body. Handedness and assist settings.
  - The 3D draws only when something changes, capped at 30 fps on Lite.
- **Stack:** the PEW shape. `INK_SIM` (runs in node), `INK_VIS` and `src/app/`.
  - `build.js` writes `index.html` (about 944 KB) and `sw.js`.
  - three r128 from cdnjs. GLTFLoader for Full/Ultra comes via `INK_LIBS`.
  - Checks: `node build.js --check`, `node check-savecode.js`, `node tools/sim-test.js`, `node tools/session-test.js`, `node tools/element-sheet.js`.
- **Saves:** `ink-save`, `ink-slot1..3`; caches start `ink-`.
  - Code `INK1:` (LZW with 9–16-bit codes, base64url, a 6-character checksum). Restore writes all keys or none, with a rollback.
  - Backup file `ink-backup-YYYY-MM-DD.txt`; `persist()` is asked on save.
  - Tattoos are saved as parameters, never as images; old clients are compacted past `CLIENT_CAP` 200.
  - A year-30 save is about 1.5 MB of JSON, or a 0.9 MB code.
  - `S.bkAt` is saved, but no reminder bar reads it yet.
- **Audio:** a Web Audio synth (`src/sound/synth.js`) with a buzz for each machine; its pitch follows your pace and it stutters when you rush. Two Kenney CC0 samples for taps and important toasts.
- **Reusable:**
  - The body: `src/vis/body.js` + `decals.js` + `assets.js` (a coded mannequin with one UV island per zone, decal compositing, and real models swapped in on Full/Ultra with a silent fallback); `src/app/bodymap.js` (the SVG body diagram).
  - Sim: `src/sim/aging.js` (the ink aging model); `src/sim/rng.js` (seeded, with fork).
  - Sharing and help: `src/app/share.js` (1080×1350 share cards, `shSave`); `src/app/help.js` (spotlight tips that show once each).
  - Sound: `src/sound/synth.js`.
  - Blender: `tools/blender/` (`mannequin.py`, `props.py`, `check_mannequin.py`) + `tools/pack-model.py` (with a triangle budget).
  - Tests and tools: `tools/sim-test.js` (with an `advanceWeek` timing check under 50 ms); `tools/element-sheet.js` (validates the SVG library and renders a contact sheet).
  - Shared with the PEW line: `build.js`, `savecode.js`, `perf.js`, `#boot`.
- **Names:**
  - Mentor: Arkady Lvovich Sedov and his shop, Sedov's on Kanatnaya Street.
  - Rival shops: Seventh Bridge Tattoo, the Grey Heron (Lodochnaya Embankment), Atelier Nochnoy (Kanatnaya Street), Konveyer (outer ring).
  - The scene: the Mostograd Tattoo Guild and its Drawbridge Prize; the *Kontur* quarterly; the Mostograd Tattoo Fair at the old port warehouses.
  - The studio sign reads ИГЛА ("needle").
  - Client names are procedural, from `NAMES` in `src/sim/clients.js`.
- **Gaps:**
  - Rib pieces are partly hidden in the seated pose; a raised-arm pose is pending.
  - The Blender models are scripted first versions.
  - The plan has no open questions left, so the next step is unclear.
  - The backup reminder isn't wired up.
- **Pitches:**
  - Port Lombard's 14-day reminder and storage line (`S.bkAt` already exists).
  - Shrink the 0.9 MB save code (deflate via `CompressionStream`; ask Kelbo first).
  - A shop ambience loop using Lombard's crossfade engine.
  - A once-per-career spring flood that matches Lombard's canon.
  - Check the dates on `RECKONINGS.pawn`: it fires from 2010, but Lombard's player only takes over the shop in 2014.
  - A raised-arm pose for rib pieces.

### Station Keeper

- **Status:** In development, 0.1.2.0 (`GAME_VERSION` in `src/version.ts`). **There's no CLAUDE.md**; read `docs/STATUS.md`.
- **Pitch:** a commercial space-station tycoon where one failing system drags down the others.
- **Loop:**
  - Time: 1 sim tick per game minute, and a 92.6-minute orbit with an eclipse.
  - Power: tiered load shedding.
  - Building: 12 module types, a 6-hour delivery wait, and a forecast.
  - Upkeep: cooling, life support, wear, crew.
  - Money: guests, research contracts, a loan.
  - Five postings, then Company mode (endless).
- **Setting and tone:** real low Earth orbit, 2041–2045. Money as `$x.xM`. The company is Longlight Orbital. Stations: Longlight One, Kittiwake Outpost, Halyard Sunward, Saltglass Rest, Velvet Reach.
- **Look:** a shader Earth and grey-box modules. Font: Space Grotesk (Google Fonts).
  - Palette: bg `#141413`, surface `#1c1b19`, card `#1f1e1b`, line `#2e2c28`, text `#faf9f5`, muted `#a8a49b`, clay `#d97757`, lilac `#b48ce8`, purple `#7b3fc4`. Extras: `#e6b48c`, `#ff5a3c`, `#f4d27a`.
  - Dark only.
- **Stack:** TypeScript strict, Vite ~8.3.6, three ~0.187, Vitest, and ESLint (which bans three.js and the DOM in `src/sim`). A deploy workflow. No service worker.
- **Saves:** `stationkeeper.*`.
  - Code `SK1:`: base64url JSON (uncompressed) + an FNV checksum (`src/backup.ts`).
  - Backup file `station-keeper-backup-YYYY-MM-DD.txt`.
  - `tutorial` and `hudCompact` are missing from `BACKUP_KEYS`.
- **Audio:** synth only (`src/audio/sound.ts`).
- **Reusable:**
  - Sim: `src/sim/network.ts` (a tiered resource solver, about 140 lines); `src/sim/orbit.ts`; `fork()` + `src/sim/forecast.ts`; `src/sim/warnings.ts`.
  - 3D: `src/view/earth.ts`, `camera.ts`, `detail.ts` (`mergeStatic`), `wear.ts`, `sparks.ts`.
  - Saves: `src/backup.ts`, `storageCare.ts`, `slots.ts`.
  - UI: `src/ui/bootScreen.ts` (with `compileAsync`), `helpSheet.ts`, `src/tutorial.ts` + `src/ui/coach.ts`, `photoBar.ts` + `download.ts`.
  - Company mode: `src/company/*`.
- **Names:**
  - Sponsors: Halvorsen Biologics, Kestrel Materials, Northmere Agricultural Institute, Lumen Fibreworks, Aster Coast Space Agency, Calder Medical Research Trust.
  - Crew: Ines Varga, Tomas Okafor, Mei Lindqvist, Dara Quinlan, Sefa Moana, Hugo Albrecht, Marguerite Osei, Pavel Rasmussen, Delphine Achebe, Rory Szabo, Ottilie Brandvold, Kwame Ashdown.
- **Gaps:**
  - Testing: no phone playtest yet.
  - Balance: checking in every 12 hours tends to lose; the interest wording is unclear.
  - Tidying: `public/models` is empty; a `pp/` screenshot folder is committed.
  - Brand: no © line or studio link.
- **Pitches:**
  - A service worker and a self-hosted font.
  - An "away mode" for long gaps between check-ins.
  - A crew-morale posting.
  - Modules scripted in Blender.
  - A CLAUDE.md with the brand section, and a fix for `BACKUP_KEYS`.

### Season Ticket

- **Status:** Released. 1.0 launched 2026-10-19; now 1.1.2.0 (`src/data/meta/version.json`).
- **Pitch:** a football club owner/GM sim with a live match engine whose tactics you change mid-game.
- **Loop:**
  - Matches: a spatial 22-player engine, with three match-day modes (full control, game plan and big calls, coach).
  - Squad: transfers with a deadline-day war room; youth, staff, a wage cap.
  - Club: a stadium builder; money with a 5-step lender ladder that ends in receivership.
  - Story: 76 events, press conferences, rivalries, a newspaper and a fan feed.
  - Season: a 30-round league plus a top-6 playoff.
- **Setting and tone:** Valmere (the Valmeran dollar) and the Rivière Valley. The Kestrel Football League has 16 clubs; trophies are the Valmere Shield and the Founders' Cup. Every nation is fictional.
- **Look:** semi-realistic 3D (CC0 Quaternius bodies) with 2D DOM menus. System fonts (Georgia for the newspaper).
  - Palette: bg `#0b1020`, surface `#141b33`, text `#f4f5fa`, muted `#9aa3c2`, gold `#f2c14e`, teal `#4ecdc4`, win `#3ecf8e`, loss `#ef5b5b`.
  - Dark only. `src/ui/brand.ts` still holds older studio colours.
- **Platform:** **landscape**; 44 px tap targets; nothing wider than 640×360.
- **Stack:** TypeScript 7.0.2, Vite 8.3.4, three 0.186.1 (loaded only when a 3D scene opens), fflate, meshoptimizer, Vitest. Background matches run in Web Workers.
  - Checks: `npm test`, `npm run test:perf`, `npm run build`, `npm run check:first-load` (under 200 KB before the title).
- **Saves:** `seasonticket.career` + `.backup`; per-device settings under `seasonticket.*`.
  - Code `ST1:` (zlib JSON, base64). `CAREER_VERSION` 11, with migrations.
  - Backup file `season-ticket-backup-YYYY-MM-DD.txt`.
- **Audio:** a CC0 Freesound crowd, 3 OpenGameArt songs, and synthesized menu sounds (`src/render/audio/synth.ts`, `hub.ts`).
- **Reusable:**
  - Determinism: `src/sim/spatial/det.ts` and its ban test in `tests/spatial.test.ts`; `src/sim/rng.ts`.
  - Saves: `src/game/save.ts` + `saveKey.ts` + `saveCheck.ts`; `src/ui/career/saveSafety.ts`.
  - Speed and loading: `src/render/quality.ts`; `#boot` + `src/ui/bootScreen.ts`.
  - Offline: `src/pwa/serviceWorker.ts` + `register.ts`.
  - Workers: `src/game/matchRunner.ts` + `matchWorker.ts`.
  - Crashes and tips: `src/ui/career/crash.ts` + `report.ts`; `tips.ts`.
  - Story: `src/sim/career/news.ts`, `press.ts`, `story.ts`.
  - 3D: `src/render/stadium/`, `src/render/match/weather.ts`, `lod.ts`.
  - 2D: `src/ui/pitch2d.ts`, `src/ui/views/career/crest.ts`.
  - Checks and assets: `scripts/check-first-load.mjs`, `tests/credits.test.ts`, `scripts/assets/`.
- **Names:**
  - Nations: Esperia, Kaltland, Marrovia, Sundara, Ostenburg, Caravelle, Vostria, Norrvik.
  - Cities: Crowncaster, Port Alder, Cape Fenwick, Saltwater Cove, Sainte-Rivière, Val-Delacroix, Lakehaven, Wrenmoor, Inkwater, Cindervale, Fort Sterling, Silverpeak, Frostbeck, Lumenfell, Prairie Junction, Sunreach.
  - Clubs: Monarchs, Mariners, Gulls, Orcas, Voyageurs, Rouges, Loons, Wranglers, Wolves, Ironsides, Sentinels, Yeti, Huskies, Aurora, Threshers, Grizzlies.
  - Stadiums: Crown Park, Harbourside Park, Lighthouse Road, The Cove, Stade de la Rivière, Stade des Tilleuls, Loon Lake Ground, Wrenmoor Common, Mill Lane, The Foundry, Garrison Park, The Summit, Beckside, Aurora Field, Harvest Park, Sunreach Bowl.
  - Paper: *The Valmere Courier*.
  - Lenders: Harbourline Bank, Greyhollow Capital, Tallow & Finch Credit.
  - Sponsors: Vellicor Telecom, Quorra Air, Halberd Motors, Tidewell Mutual, Ombrine Foods, Corvane Logistics, Pellinore Electric, Copperkettle Brewing, Marrowind Insurance, Bluefen Software, Gallowmere Energy, Stoatley Bakeries.
- **Gaps:**
  - Waiting on others: analytics (waiting on Kelbo); frame-rate numbers from a real phone.
  - Sim drift: the league's average age drifts down; some world generation uses non-deterministic `Math`.
  - Bugs: a two-tab 3D bug.
  - Not built from the design: kit designer, awards, cups, lower divisions and more.
- **Pitches:**
  - The official brand mark and © line.
  - A win-probability readout.
  - End-of-season awards as a *Courier* special.
  - Deterministic world generation for new careers.
  - A kit designer.

### Frontier Lab

- **Status:** the site shows "In development" 0.1.63.0 (`gameVersion` in `package.json`); save schema 39. Live, with post-launch fixes.
- **Lineage:** a fork of Vault Street (a bank tycoon), which was itself a system-for-system remake of the mobile tycoon *Coffee Inc 2*. The upstream remote is read-only. Vault Street save codes are rejected.
- **Pitch:** found an AI lab and grow it into a global company.
- **Loop:**
  - Start: a $1.5M seed and an engraved city map where you open sales offices.
  - Business: the Deal Desk; compute (GPUs, data centres, power); model generations.
  - Oversight: a safety ratio and regulators; HQ floors; a board.
  - Growth: an IPO at $100M ARR; M&A; ventures; travel across 28 cities.
  - Personal: a personal empire and a rich list.
- **Setting and tone:** real cities on procedural maps (20 start cities including Saskatoon; energy sites Fort McMurray, Pilbara, Midland), 2027, with a currency switch. All companies, models and people are fictional.
- **Look:** "Banknote Deco" in 2D canvas and SVG (no three.js). Fonts: Bodoni Moda + Public Sans via `@fontsource`.
  - Palette: vault `#131d33`, deep `#0a1222`, raised `#1c2943`, ivory `#ece8da`, dim `#b3b5ae`, brass `#b8913d` / `#d9be7a`, signal `#3aafbf`, jade `#3e8a73`, oxblood `#9e3d3d`, paper `#dfe7e7`.
  - Each city has its own ink (Saskatoon `#8A6A2C`).
  - Dark only.
- **Platform:** portrait 390×844 first; a side drawer from 900 px.
- **Stack:** TypeScript ~6, Preact + signals, Vite 8, lz-string, Vitest (187 files), ESLint, `npm run balance`.
  - Commits here are authored as Claude (Kelbo's choice for this repo). Auto-merge is on.
- **Saves:** IndexedDB `frontierlab`, with a `frontierlab.*` localStorage fallback.
  - Code `FL<schema>:` (lz-string).
  - Backup file `frontier-lab-backup-YYYY-MM-DD.txt`.
- **Audio:** 4 synth sounds, off by default.
- **Reusable:**
  - Map: `src/art/isoRenderer.ts` + `chunkGrid.ts` / `chunkPainter.ts` / `canvasKit.ts`; `pixelLru.ts`; `citygen.ts`; `lifeLayer.ts`.
  - Engraved art: `engrave.ts`, `guilloche.ts`, `prng.ts`, `logoShapes.ts`, `portraits.ts`.
  - Charts and UI: `src/app/components/` (LineChart, Donut, RadarRosette, Carousel, Toasts).
  - Determinism: `src/sim/detmath.ts`; `src/sim/rng.ts` (sfc32 named streams); cyrb53.
  - Saves: `src/sim/save/slotData.ts`, `backupFile.ts`, `backupReminder.ts`.
  - App shell: `src/app/pwa/`; `#boot` + `boot.ts`; `src/app/tutorial/`.
  - Story and balance: `src/sim/news.ts`; `scripts/balance.ts`.
- **Names:**
  - Paper: *The Weekly Inference*.
  - Rival labs (29): Harbourline AI, Maple Crown Intelligence, Prairie Open Models, Nimbus Labs, Granville Research, Liberty Ridge Labs, Eastgate Intelligence, Copperfield Collective, Fizz, Whitmore Institute, Kingsbury Cognition, Thameside Open Lab, Albion Machine Works, Belgrave Research, Lumière IA, Rheinmark KI, Oranjeburg Labs, Volt, Alpenhaus Research, Helvetic Open Models, Sakuragi Intelligence, Hoshino Labs, Komorebi AI, Southern Cross AI, Wattle Collective, Tidewater AI, Lionport Labs, Jade Harbour AI, Peak Research.
  - Model families: Wren, Lantern, Cobalt, Kestrel, Fathom, Juniper, Halyard, Tessel, Sable, Quarry, Marlin, Ember.
  - Banks: Ashgrove Capital, Whitlock & Rowe, Meridian Partners, Hollis Crane & Co., Sakura Bridge Securities, Southern Gate Advisory.
  - Agencies: Brightwell Creative, Northwind & Pike, Studio Halcyon.
  - Lobbyists: Capitol Bridge Advisors, Parliament Row Partners, Rue Royale Affairs, Harbourline Policy Group.
  - Vendors: Clearline, Northscore Open Voices, Sentinel Guardrails, TrueMark.
  - Jets: Corvid 600, Albatross 8000, Kite 350, Petrel 7500.
  - Universities: Prairie State, Kingsley, Bow River, Pacific Crest, Hudson Polytechnic.
- **Gaps:** no logo or © line.
- **Pitches:**
  - The brand lockup and © line.
  - A scenario mode.
  - Challenge codes.
  - Office renovations.
  - Rename Harbourline (also used by Season Ticket).

### The Whip (repo `The-Whip`)

- **Status:** Released 1.0.0.0 (`src/version.js`), in playtest. **The studio's flagship**: its CLAUDE.md asks for finished, polished work only.
- **Pitch:** a political career sim. Rise from rookie MP to Chief Whip by counting votes, making deals and keeping the caucus in line.
- **Loop:**
  - The week: Mon–Thu sittings, the office each evening, caucus on Wednesday, the riding on Friday.
  - Divisions: the bells ring (30 s or 15 s). From Act 3 they become a chase across the Hill, and the Clerk reads the names.
  - Deals: office talk, then the deal table and ledger, then a DEAL / NO DEAL card.
  - Career: five acts, from Rookie to Chief Whip.
  - Knowledge: the Book of 120 MPs; what you know goes stale after 26 weeks.
  - Modes: career, 3 scenarios, a shared seed, a daily seed.
- **Setting and tone:** the Dominion of Caledor, capital Ostrava, with Canadian Westminster procedure.
  - Provinces: Seaward, Westmark, Brightwater, Lakeshire, Valmont, Brennick, Tidewater, Kestrel Isle, Northern Reaches.
  - 172 ridings; the MPs are generated.
  - No currency. Dry political drama.
- **Look:** oak, green leather and stone in 3D under the "Order Paper" UI. Font: Newsreader, self-hosted.
  - UI: paper `#f3ead8` / `#e9dec6` / `#d9cbae`, ink `#1d1a16` / `#4e463c`, bench green `#2f5a3c`, brass `#b8923a`, red `#a8322d`, amber `#c98f2a`, grey `#6b6f76`, page bg `#15130f`.
  - Brand tokens: `--brand #6c46b5`, `--brand-2 #7b3fc4`, `--brand-ink #141413`, `--brand-sun #d97757`, `--brand-paper #e1ded5`.
  - 3D: oak `#6e4a2b`, leather `#2f5a3c`, stone `#b9b0a0`, brass `#c9a24a`, paper `#ece6d6`.
  - Parties: NU `#2F6DB5`, CP `#C8423B`, LD `#E0A526`, EC `#4FB3BF`, fifth party `#8E6BBF`, independent `#9AA0A6`, with Okabe-Ito alternatives.
  - No dark/light switch. Colour-blind and large-text modes.
- **Platform:** portrait first; a side panel in landscape (`src/framing.js`).
- **Stack:** ES modules with no build step; three 0.160.0 via a jsdelivr import map. Tests in `tests.html` (133 passing, run in a browser). No service worker.
- **Saves:** `whip:save:1..3`, `whip:settings` (with `lastBackup`); `SAVE_VERSION` 2.
  - Export is plain base64 JSON (about 150 KB), with no prefix or checksum.
  - Backup file `the-whip-backup-YYYY-MM-DD.txt`.
- **Audio:** all synthesized (`src/audio.js`); haptics in `src/haptics.js`.
- **Reusable:**
  - State: `src/sim/rng.js`; `src/state.js` + `src/sim/actions.js` (a tiny store).
  - Text: `src/sim/fill.js` + `src/ui/text.js` `t()` + `data/strings.en.json`; `src/ui/gloss.js`.
  - UI: `src/ui/picker.js`; `src/framing.js`; `src/rooms.js`; the Order Paper CSS (grain, stamps).
  - Saves: `src/save.js`.
  - Figure kit: `src/body.js`, `figures.js`, `motion.js`, `faces.js`, `src/office/visitor.js`.
  - 3D helpers: `src/kit3d.js`, `src/look.js`, `src/textures.js`, `src/models.js`, `src/weatherFx.js`, `src/pressPhoto.js` (halftone press photos).
  - Testing and modes: `src/sim/bot.js` + `tests.html`; `src/sim/modes.js` `dailySeed()`.
  - Feel: `src/haptics.js`.
- **Names:**
  - Hill buildings: Halden Block, Ferrier Building, East Block, Centre Block.
  - Parties: National Union, Commonwealth Party, Labour Democrats, Eastern Compact, plus 12 fifth parties (Living Earth Alliance … Tenants' Uprising).
  - Papers: *The Ostrava Ledger*, *The Dominion Standard*, Caledor Press Wire, *The Lakeshire Examiner*, *Valmont Courier*, *The Seaward Tribune*, *Westmark Herald*, *The Brennick Telegraph*, *Tidewater Chronicle*, *The Precinct Report*.
  - Broadcast and post: Dominion Broadcasting; Crown Post.
  - Ridings include Harrow Point and Lantern Island.
- **Gaps:** part two of the week's vote (the UI) isn't built; neither is the player dig, nor the Senate and Leader phases.
- **Pitches:**
  - Build the week's-vote UI.
  - Build the player dig.
  - Move export to an LZW + checksum code under a new prefix, keeping the old import.
  - Swap the hand-drawn sun and off-palette brand colours for the press-kit files.
  - Vendor three.js and add a service worker (needs Kelbo's OK, since the CDN is a hard rule there).

### Red Skies

- **Status:** Complete. 1.6.1.0 (`VERSION`; CLAUDE.md and DESIGN.md lag behind).
- **Pitch:** you're the fire-control officer of SAM battery *Kessel*. Watch the radar, sort friendly jets from hostiles, and hold fire until you're sure.
- **Loop:**
  - On watch: a radar scope and IFF. Classify each track FRIEND or HOSTILE, assign a launcher, and fire under HOLD / TIGHT / FREE rules.
  - Cameras: an EO TV/IR camera and a kill cam.
  - After: a debrief graded A–F.
  - Modes: a 25-step Training Watch, a six-shift campaign with B/C variants and a resupply shop, Free watch, Survival, and 7 medals.
- **Setting and tone:** the Republic of Varenna. Callsigns: Viper, Hammer, Cobra, Saber, Anvil, Lancer, Talon, Heavy, Angel, Dustoff. The currency is "credits". Terse military radio; the ethics of friendly fire.
- **Look:** a realistic 3D operator cabin, with the DOM console projected onto its monitors via `matrix3d` (`src/cabin.js`).
  - Fonts: Russo One + Big Shoulders Display for the title (Google Fonts); system monospace for the UI.
  - Console: bg `#050707`, panel `#0b100e` / `#111a15`, line `#1f2e25`, green `#45ff84`, amber `#ffb020`, cyan `#3ff0d0`, red `#ff4b3a`, text `#b9d6c2`, muted `#6d8a76`.
  - Shelf: `#eef0ec`, text `#1d2327`, green `#16733a`, amber `#a86400`, red `#c0281b`.
  - Scope glass: `#c4e6f2`, with NATO-style symbols.
- **Platform:** **portrait only**; a rotate cover appears below 560 px tall.
- **Stack:** plain JS on `window.RS`. `build.js` inlines the vendored three r128 and the `src/` modules (in its ORDER list) into `index.html` (about 1.6 MB). CI runs the node tests; the Playwright checks run by hand. No service worker.
- **Saves:** `redskies.v1.*` (`campaign`, `settings`, `free`, `survival`, `tutorial`).
  - Code `RS1:` (LZW + base64url + checksum).
  - Backup file `red-skies-backup-YYYY-MM-DD.txt`; `RS.storage`.
- **Audio:** fully procedural (`src/audio.js`, `src/audio_weapons.js`), with haptics.
- **Reusable:**
  - Core: `src/savecode.js`; `RS.bus` (8 lines); `mulberry32`; `RS.storage`; the fixed-step loop in `src/main.js`.
  - Procedural models: `src/models_ground.js` (standalone), `models_jets.js`, `jet_friend.js`, `models_weapons*.js`, `models_launchers.js`.
  - Cabin and camera: `src/cabin.js`, `src/eo.js`.
  - Tutorial: `src/tutorial.js`.
  - Tests and tools: `tools/balance.js`; `test/run.js` + `_browser.js`; `tools/make-icons.js`; `build.js` with its ORDER check.
- **Names:**
  - Weapons: Lance, Dart, Harrow.
  - Aircraft: Kestrel, Wasp, Shade, Anvil, Lantern (hostile); Gyrfalcon (friendly).
  - Stores: Spire, Needle, Ember, Hatchet, Kite, Farstrike, Sable, Sting, Pike, Longbow, Longshot, Boulder, Cinder.
  - Old names still in file headers: "Weapons Hold" (the game) and "Prairie Blue Studio" (the studio).
- **Gaps:**
  - Accessibility (back-burner list): contrast, 36 px rows, no keyboard access, the toast isn't a live region, no `aria-selected`, and blinks ignore reduced motion.
  - Speed: perf ideas that need a device test.
  - Sim: LEAKER and ASSET_HIT events lack attacker ids; the Dustoff landing; the salvo MISS question.
  - Testing: browser checks are off in CI.
- **Pitches:**
  - An accessibility PR.
  - Daily seeds for Free watch and Survival.
  - Self-hosted title fonts and a service worker.
  - Settle salvo MISS and add attacker ids.
  - A docs sync, the press-kit logo, and new wording for the real "Pantsir" mentions in comments.

---

## 8. Names already taken

**Before naming anything new (a country, town, company, person, product,
newspaper), search this section.** Kelbo's games are separate worlds unless
noted, so a repeated name reads as a mistake.

**Worlds and settings in use**

| World | Games |
| --- | --- |
| Velmark, an alpine country; the Haldis valley (money in euros) | Escapement, Scrapline (one shared world on purpose) |
| Mostograd, a fictional 2010s Russian river city; rubles | Lombard, Ink (one shared world on purpose) |
| The prairie, Saskatoon | Prairie Engine Works, the studio site's sky |
| Valmere (Valmeran dollar), Kestrel Football League | Season Ticket |
| Dominion of Caledor, capital Ostrava | The Whip |
| Republic of Varenna, battery and airbase Kessel | Red Skies |
| Real low Earth orbit | Station Keeper |
| Real world cities on procedural maps | Frontier Lab |

**Names used in more than one game** (already clashing; avoid adding more):

| Name | Where |
| --- | --- |
| **Kestrel** | Season Ticket (Kestrel Football League), The Whip (Kestrel Isle province), Red Skies (Kestrel hostile jet), Frontier Lab (Kestrel model family), Station Keeper (Kestrel Materials sponsor). **Retire it.** |
| **Kessel / Kessler** | Red Skies (battery and airbase Kessel), Escapement (Kessel Peak Observatory and Trial; rival Kessler), Scrapline (rival Rudi Kessler) |
| **Harbourline** | Season Ticket (Harbourline Bank), Frontier Lab (Harbourline AI, Harbourline Policy Group) |
| **Hollis** | Prairie Engine Works (Hollis Hot Rods, Dale Hollis), Frontier Lab (Hollis Crane & Co.) |
| **Harrow** | Red Skies (Harrow missile), The Whip (Harrow Point riding) |
| **Lantern** | Red Skies (Lantern hostile aircraft), The Whip (Lantern Island riding), Frontier Lab (Lantern model family) |
| **Halyard** | Station Keeper (Halyard Sunward station), Frontier Lab (Halyard model family) |
| **Sable, Ember, Kite** | Red Skies (stores), Frontier Lab (Sable and Ember models, Kite 350 jet) |
| **Corvid** | Prairie Engine Works (sponsor), Frontier Lab (Corvid 600 jet) |
| **Tidewater** | The Whip (province), Prairie Engine Works (Tidewater Diesel & Marine), Frontier Lab (Tidewater AI) |
| **Northwind** | Prairie Engine Works (Northwind Tyre), Frontier Lab (Northwind & Pike) |
| **Courier** | Season Ticket (*The Valmere Courier*), The Whip (Valmont Courier) |
| **Ledger** | The Whip (*The Ostrava Ledger*), Frontier Lab (the Ledger archive) |
| **Ottilie Brandt / Brandvold** | Scrapline (rival Ottilie Brandt), Station Keeper (crew Ottilie Brandvold) |
| **Ostrander** | Escapement (rival Ostrander Frères and staff Mette Ostrander) |
| **V-countries** | Velmark, Varenna, Valmere, Valmont (a Whip province): four invented places that sound alike. Pick another starting letter. |
| **"Prairie"** | Prairie Engine Works, Prairie Open Models and Prairie State (Frontier Lab), Prairie Junction (Season Ticket) |
| **Nimbus** | Lombard (Nimbus game consoles), Frontier Lab (Nimbus Labs, Nimbus Health) |
| **Heron** | Prairie Engine Works (Blue Heron sponsor), Ink (the Grey Heron rival shop) |

Each game's full name lists are in its profile under **Names**.

**Shared worlds: who owns the canon**

Two worlds are shared on purpose. One game owns each; the other borrows from
it and must not contradict it. Check the owner's file before adding a place,
date or institution.

- **Mostograd** (Lombard owns it): Lombard `docs/01-GDD.md`, the **Setting**
  and **Brands** sections.
  - Shared places so far: Kanatnaya Street (Kanal district), the Old Bridge,
    Lodochnaya Embankment, the Seventh Bridge, the outer ring, the port.
  - Lombard only: the Lion Bridge, the Kupetsky drawbridge (opens 1:25 to
    4:50), Sennaya market, the Sukhov Canal; the paper *Вечерний Мостоград /
    Evening Mostograd*; one spring flood each career, in April.
  - Ink's additions (2000 to 2030): the Mostograd Tattoo Guild, the
    Drawbridge Prize (week 48), Kontur, the Mostograd Tattoo Fair, four rival
    shops, the ИГЛА sign.
  - The one cross-reference so far is Ink's `RECKONINGS.pawn` (a pawn-shop
    event). It fires from 2010, but Lombard's player only takes the shop over
    in 2014, so keep it vague (no owner's name) or move it.
- **Velmark and the Haldis** (Escapement owns it): Escapement
  `docs/DESIGN.md`, the **Setting** and **Money** lines (euros; Kessel Peak; the Haldis Chronometry Bureau). Scrapline borrowed the
  names only: its `CLAUDE.md` says not to read or follow the Escapement repo
  for anything else, and that rule wins inside Scrapline.

---

## 9. Genres, looks and open space

**Genres and loops already taken**

| Family | Games |
| --- | --- |
| Craft career: build or make something part by part, test it, compete or sell, in a workshop that grows | Prairie Engine Works (engines), Escapement (watches), Scrapline (combat robots), Ink (tattoos) |
| Tycoon and management | Season Ticket (football club), Frontier Lab (AI lab), Station Keeper (space station), Lombard (pawn shop) |
| Politics and negotiation | The Whip (parliament) |
| Tense real-time sim | Red Skies (air defence) |

**Shared habits across the line-up** (worth breaking on purpose in a new pitch):

- Almost every game is a **career on a weekly clock** ("act, then Close week").
- Almost every game is **dark-themed** (slate, navy, felt, console green). Only
  The Whip (cream paper) and the light themes of PEW, Escapement, Scrapline
  and Ink break that.
- Most are **single-player management**; only Red Skies and Scrapline's
  fights are real-time action.
- Four games share a near-identical classic-JS stack (PEW, Escapement,
  Scrapline and Ink); the TypeScript games each set up their own.
- All four craft careers share a weekly clock, a workshop that grows and rival
  shops. A new craft game should change at least two of those.

**Looks already in use** (pick something visibly different for a new game)

| Look | Game |
| --- | --- |
| Slate and clay "Shop Glass", Chakra Petch / Barlow / IBM Plex Mono | Prairie Engine Works |
| Dark felt, brass and steel, Space Grotesk / JetBrains Mono | Escapement |
| Longlight slate and clay workshop, Space Grotesk / JetBrains Mono | Scrapline |
| Paper tags, receipts, worn plastic, Space Grotesk / IBM Plex Mono (Longlight menus) | Lombard |
| Warm studio light, black ink on a cream board, red / teal / gold, Space Grotesk / Oswald | Ink |
| Slate, ivory, clay and lilac over a shader Earth, Space Grotesk | Station Keeper |
| Navy, gold and teal, system fonts, semi-realistic 3D | Season Ticket |
| "Banknote Deco": engraved isometric map, Bodoni Moda / Public Sans | Frontier Lab |
| "The Order Paper": cream paper, ink, stamps, Newsreader | The Whip |
| Green radar console in a 3D cabin, Russo One / Big Shoulders | Red Skies |

**Open space** (observations, not decisions; Kelbo picks):

- Bright, daytime or light-first looks; hand-drawn or painterly 2D; pixel art.
- Genres with no Longlight game yet: puzzle, platformer or action, exploration,
  narrative adventure, city or colony builder, farming, logistics and
  transport (trains run across the studio site's sky), fishing or nature,
  cooking, sports other than football (hockey and curling fit the prairie),
  weather and storm chasing, astronomy (the studio site already simulates the
  real sky).
- Shapes that break the weekly career: short daily runs with a shared seed
  (The Whip has the pattern), pass-and-play or local multiplayer, a game you
  finish in an evening.
- Settings not yet used: the sea, the far north, a
  historical era, fantasy, a city at street level, somewhere warm.

---

## 10. Reuse map: where the best version of each system lives

Paths are as of this snapshot. Classic-JS games (PEW, Escapement, Scrapline,
Ink) share globals and one `S` state object; TypeScript games are modules.
Pick the source that matches your stack.

| Need | Best source | Path | Notes |
| --- | --- | --- | --- |
| Save code, classic JS | Red Skies | `src/savecode.js` | Smallest and easiest to lift; needs only load/save/remove helpers. `RS1:` shape = LZW + base64url + 6-char checksum. |
| Save code + backup file + persist + reminder, classic JS | Prairie Engine Works / Escapement / Scrapline | `src/app/savecode.js` + `check-savecode.js` | Atomic restore and node tests with a pretend localStorage. Tied to `S`, `snapshot`/`hydrate`. |
| Save code, TypeScript | Station Keeper | `src/backup.ts`, `src/storageCare.ts`, `src/slots.ts` | `SK1:` with FNV-1a checksum, all-or-nothing restore. Uncompressed; add LZW or fflate for big saves. |
| Compressed save + crash freeze, TypeScript | Season Ticket | `src/game/save.ts`, `saveKey.ts`, `saveCheck.ts` | fflate zlib, 60 MB inflate cap, a backup slot, saving frozen after a crash. |
| Save-safety UI on its own | Season Ticket | `src/ui/career/saveSafety.ts` | Persist, backup file via share sheet, reminder; imports only a JSON config. |
| IndexedDB slots with localStorage fallback | Frontier Lab | `src/sim/save/slotData.ts` | Migrations and `persist()`. |
| Slice build with checks + service worker | Prairie Engine Works (also Escapement, Scrapline) | `build.js` + `src/manifest.txt` | Zero dependencies; `--check` catches stale output, compile errors and duplicate functions; content-hashed cache name. Change the prefix. |
| Inline build with an order check | Red Skies | `build.js` | Inlines vendored three.js and modules into one page. |
| Graphics tiers + auto step-down | Prairie Engine Works | `src/app/perf.js` | Lite/Full/Ultra; drops a tier under about 27 fps for about 8 s. TS: Season Ticket `src/render/quality.ts`. |
| PWA update bar, install, iOS tip | Prairie Engine Works | `src/app/pwa.js` | TS versions: Season Ticket `src/pwa/`, Frontier Lab `src/app/pwa/` (with a `?nosw` escape hatch). |
| Loading screen with real progress | Station Keeper | inline `#boot` in `index.html` + `src/ui/bootScreen.ts` | Shader warm-up and a download-failure catcher. Classic JS: PEW `#boot` in `src/html/head.html`. |
| Seeded RNG with saveable state | The Whip | `src/sim/rng.js` | sfc32 seeded by cyrb128, no imports. Named streams per system: Frontier Lab `src/sim/rng.ts`. |
| Deterministic maths (sin, cos, exp, log, pow) | Season Ticket | `src/sim/spatial/det.ts` | IEEE-exact ops only; its test scans for banned `Math` calls. Also Frontier Lab `src/sim/detmath.ts`. |
| Daily and shared seeds | The Whip | `src/sim/modes.js` `dailySeed()` | |
| Headless balance bot | The Whip `src/sim/bot.js` + `tests.html`; Red Skies `tools/balance.js`; Frontier Lab `scripts/balance.ts`; Scrapline `tools/fight-test.js` | | Pick by stack. |
| Sim test harness with named builds | Escapement | `tools/sim-test.js` | Cuts the sim block from the built page and runs it with `vm`; `--brief` for commit messages. |
| Coach-card tour + tap-to-explain glossary | Escapement | `src/app/help.js` (`TUT`, `GLOSS`, `data-g`) | Also Station Keeper `src/tutorial.ts` + `src/ui/coach.ts` (steps wait for the player), Red Skies `src/tutorial.js`. |
| Glossary tagging in rendered text | The Whip | `src/ui/gloss.js` + `data/glossary.json` | |
| All UI text in data with `{slot}` filling | The Whip | `src/sim/fill.js`, `src/ui/text.js`, `data/strings.en.json` | |
| Sheets the phone's Back button closes | Escapement | `openSheet` / `sheetHist` in `src/app/state.js` | |
| "Where to fix it" jump | Escapement | `CERT_FIX` / `goFix` in `src/app/test.js` | Rings the control to change. |
| Share a canvas (share sheet or download) | Escapement | `src/app/share.js` | 13 lines, standalone. |
| Certificate and trophy cards | Escapement `src/app/cards.js`; PEW `src/app/rcard.js` (ghost curve, holographic tilt) | | |
| Photo mode | Prairie Engine Works `src/app/photo.js` + `src/vis/photo.js`; Station Keeper `src/ui/photoBar.ts` | | |
| Metal materials, studio HDRI | Escapement | `src/vis/studio.js`, `src/vis/finish.js` | Perlage, Côtes de Genève, graining; cheap Lite path. |
| Scripted Blender props (no Blender UI) | Escapement `tools/blender/`; Scrapline `tools/blender-*.py`; Ink `tools/blender`; Lombard bake in Actions | | Commit the `.glb` output. |
| glTF packer for phones | Prairie Engine Works | `tools/pack-model.py` | Shrinks textures, quantizes vertices; needs Pillow and numpy. |
| Home-screen icons from an SVG | PEW / Red Skies / Escapement | `tools/make-icons.js` | Needs Playwright. |
| Instanced crowds of jointed figures | The Whip | `src/body.js`, `src/figures.js`, `src/motion.js` | A full House in about 11 draw calls. |
| Camera framing around a bottom sheet | The Whip | `src/framing.js` | Portrait sheet or landscape side panel. |
| DOM panels projected onto 3D screens | Red Skies | `src/cabin.js` | CSS `matrix3d`. |
| Procedural military models, no textures | Red Skies | `src/models_ground.js` and friends | |
| Shader Earth, no textures | Station Keeper | `src/view/earth.ts` | Clouds, city lights, atmosphere. |
| Grime and scorch shader patch, GPU sparks | Station Keeper | `src/view/wear.ts`, `src/view/sparks.ts` | |
| Canvas textures with bump maps, merged statics | Station Keeper `src/view/detail.ts` | | |
| Procedural modular stadium, instanced crowd | Season Ticket | `src/render/stadium/` | |
| GPU weather particles | Season Ticket `src/render/match/weather.ts`; The Whip `src/weatherFx.js` | | |
| Engraved isometric city map | Frontier Lab | `src/art/isoRenderer.ts` + `chunkGrid.ts` | With `pixelLru.ts` for iOS canvas memory. |
| Engraved portraits, guilloche, hatching | Frontier Lab | `src/art/portraits.ts`, `engrave.ts`, `guilloche.ts` | |
| Preact charts | Frontier Lab | `src/app/components/LineChart.tsx`, `Donut.tsx`, `RadarRosette.tsx` | |
| Resource network solver with load shedding | Station Keeper | `src/sim/network.ts` | Pure TS, about 140 lines. |
| Run the sim ahead to preview a change | Station Keeper | `fork()` + `src/sim/forecast.ts` | |
| Root-cause warnings | Station Keeper | `src/sim/warnings.ts` | |
| Deterministic 2D physics fight + replay log | Scrapline | `src/sim/fight.js` | |
| One input shape from stick, tap, keyboard, gamepad | Scrapline | `src/app/controls.js` | |
| Sparks, flying parts, camera shake | Scrapline | `src/vis/fx.js` | |
| Background sim on Web Workers | Season Ticket | `src/game/matchRunner.ts` + `matchWorker.ts` | Main-thread fallback. |
| Crash screen with save code and report | Season Ticket | `src/ui/career/crash.ts` + `report.ts` | |
| Newspaper and story events from templates | Season Ticket `src/sim/career/news.ts`, `story.ts`; Frontier Lab `src/sim/news.ts` | | Seeded streams. |
| SVG crest builder | Season Ticket | `src/ui/views/career/crest.ts` | |
| First-load size budget check | Season Ticket | `scripts/check-first-load.mjs` | |
| Every asset credited, tested | Season Ticket | `tests/credits.test.ts` | Writes `CREDITS.md`. |
| Procedural audio: SFX and haptics | Red Skies | `src/audio.js`, `src/audio_weapons.js` | |
| Engine voice from the build | Prairie Engine Works | `src/sound/profile.js`, `synth.js`, `samples.js` | |
| Watch tick at any beat rate | Escapement | `src/sound/tick.js` | 53 lines, standalone. |
| Haptics pattern table | The Whip | `src/haptics.js` | |
| Save code, TypeScript, deflate | Lombard | `src/game/save/code.ts` | `LMB1.<data>.<checksum>`: raw deflate (fflate), base64url, FNV-1a in base36. |
| IndexedDB career slots + migration fixtures | Lombard | `src/persist/` + `tests/` | Three slots, settings in localStorage, old saves tested. |
| Save safety (persist, backup file, reminder), TypeScript | Lombard | `src/persist/safety.ts` | Explains the shared-origin risk in its header. |
| Lightmaps baked by headless Blender in Actions | Lombard | `bake/` + `.github/workflows/bake.yml` + `scripts/bake-pack.mjs` | Nobody opens Blender; the workflow bakes and packs. |
| Model and texture packing (Draco + KTX2) | Lombard | `scripts/items-pack.mjs`, `street-pack.mjs`, `backdrop-pack.mjs` | Node scripts; PEW's `tools/pack-model.py` is the Python option. |
| Haggling state machine | Lombard | `src/game/haggle/machine.ts` | Pure, seeded, every number in `tuning.haggle`. |
| Story beats with conditions and effects | Lombard | `src/game/story/` | Scripted visits, pledges, specialists. |
| String table + test that fails on hard-coded UI text | Lombard | `src/data/strings/` + `tests/uiStrings.test.ts` | Ready for translation. |
| Headless screenshot tour for self-review | Lombard | `scripts/shots.mjs` | Plays a seeded day and saves PNGs (portrait, landscape, desktop). |
| Sound cues from state changes (pure, tested) | Lombard | `src/audio/cues.ts` + `engine.ts`; sounds made by `art/audio/build.py` | |
| Living room details: sunlight, clock, tea, flood | Lombard | `src/render/life/` | Time of day and weather for an interior. |
| Street outside a window (sprites, weather) | Lombard | `src/render/street/` | |
| Scripted low-poly people | Lombard | `art/customers/build.py` | Blender script; commit the output. |
| Quality tiers by render resolution + `?perf=1` overlay | Lombard | `src/render/perf.ts` | Auto steps down on the median frame rate. |
| Loading screen | Lombard | `#loading` in `index.html` + `src/ui/loading.ts` | |
| A body you can draw on (UV islands per limb) | Ink | `src/vis/body.js` + `src/vis/decals.js` | Code-built mannequin; ink drawn onto its skin texture with canvas. |
| Tappable front/back body diagram | Ink | `src/app/bodymap.js` | SVG zones, keyboard friendly. |
| Check and contact-sheet an art library | Ink | `tools/element-sheet.js` | Validates the data, renders a PNG sheet, imports SVG icons. |
| 3D that only redraws when something changes | Ink | `src/vis/core.js` (`TIER`) + `src/app/perf.js` | Classic JS. A still scene draws nothing and reports no frame rate, so auto-adjust waits; skin and studio textures repaint only when their contents change. |

---

## 11. Parked and older repos

Kelbo has other repos that are private or parked, and this public edition
leaves them out on purpose. Some hold useful code or names that are already
taken, so before reusing a system or settling a new name, ask Kelbo whether one
of them has it.

---

## 12. Studio-wide improvement ideas

Each is a pitch for Kelbo, not a plan. Repo names in brackets.

1. **Fix brand drift** (The Whip, Season Ticket, Frontier Lab, Station Keeper,
   Red Skies): official logo files, the five colours, and the
   `© <year> Kelbo / Longlight Interactive` line on splash and credits (section 3).
2. **Offline for every installed game**: add a service worker and self-host
   fonts (Station Keeper, The Whip, Red Skies' title fonts). PEW,
   Escapement and Scrapline show the pattern.
3. **Cache cleanup on the shared origin**: done for the studio site on
   7 November 2026 (section 5). Check each game's service worker follows the
   same rule when it's next touched.
4. **Deterministic maths everywhere replays or shared codes matter**: Season
   Ticket's `det.ts` could become the studio standard (Scrapline replays, Season
   Ticket world generation for new careers).
5. **Daily seeds** from The Whip for Red Skies' Free watch and Survival, Frontier
   Lab challenge codes, Scrapline "beat my bot" codes.
6. **One save-code shape**: The Whip's export is uncompressed base64 with no
   prefix or checksum; move it to the LZW + base64url + checksum shape under a
   new prefix, keeping the old import.
7. **Retire the clashing names** in section 8 (Kestrel first, then Harbourline,
   Hollis, Kessel) the next time each game is touched.
8. **Publish a GitHub Release on every version bump** so the studio site shows
   the right version (Scrapline still shows 0.1.12.0; others drift too).
9. **Tidy stray screenshots committed by accident**: Scrapline `undefined/`
   and Station Keeper `pp/`.
10. **Docs drift**: several CLAUDE.md files quote older versions or counts
    (PEW, Red Skies, Season Ticket, Escapement). A docs refresh each release
    keeps sessions from trusting stale numbers.
11. **Station Keeper needs a CLAUDE.md** with the brand section, like every other game.
12. **Lombard offline**: Lombard has no service worker yet. Add one with a
    `lombard-` cache prefix (PEW's pattern, or Season Ticket's for a Vite build).
13. **Ink save safety**: Ink saves `S.bkAt` but never shows the backup
    reminder bar; wire it up like PEW's. Ink's save code also reaches about
    0.9 MB by year 30, which is a lot to paste; trim what the code carries or
    lean on the backup file.
14. **A Mostograd canon file**: Lombard and Ink share a city. A short
    `MOSTOGRAD.md` (places, dates, institutions, who owns what) copied into
    both repos would stop drift, and opens the door to cross-events: the April
    flood in both games, a tattoo machine turning up at the pawn counter.
15. **The studio site lags Lombard**: Lombard shipped 1.0.0.0, but the site's
    `projects.json` still shows it as "In development" 0.1.1.0 with no GitHub
    Release behind it. Publish a release and update its status.

---

## 13. Keeping this file current

- **The master copy lives in Kelbo.Website** at `.github/LONGLIGHT-STUDIO.md`
  (inside `.github`, so it isn't published on the site). Copies in game repos
  are drop-ins; update the master, then recopy.
- This is the **public edition**: every repo it goes into is public, so it
  never names or describes Kelbo's private repos. Kelbo keeps a fuller copy off
  GitHub.
- Refresh it when a game launches, is renamed or parked, changes its look, or
  adds a storage key or save-code prefix.
- To refresh: read each repo's `CLAUDE.md`, design doc, status file, CSS
  variables, version constant and save code, then update the profile, the
  tables in sections 5, 6 and 8, and the snapshot date at the top.
- Facts here are a snapshot. If this file and a repo disagree, the repo is right.
