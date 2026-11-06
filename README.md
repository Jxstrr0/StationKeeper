# Station Keeper

A commercial space station tycoon by Longlight Interactive. Build a station module by module and keep it
alive, solvent, and full of paying customers. Power, thermal, life support, structure, crew, traffic, and
economy share one resource network, so failures cascade.

**Play:** https://jxstrr0.github.io/StationKeeper/ (built for phones: drag to orbit, pinch to zoom, tap a module).

## Develop

```bash
npm install
npm run dev      # local server
npm run check    # typecheck, lint, tests, build
```

Pushes to `main` are tested, built, and deployed to GitHub Pages by `.github/workflows/deploy.yml`.

- `src/sim`: pure TypeScript simulation (no DOM or Three.js). Deterministic, one tick per in-game minute.
- `src/view`: Three.js scene that draws sim snapshots.
- `src/ui`: HTML/CSS overlay.
- `src/data`: module stats and the starting scenario.
- `src/backup.ts`: whole-game backups (`SK1:` codes and backup files) for Save and load.
- `docs/STATUS.md`: what's built, how to test, and what's next.

## Version

The game's version lives in `src/version.ts` (`GAME_VERSION`) and shows small on the title screen. It has four
numbers, Major.Minor.Patch.Build, the same as every Longlight game: Major = overhaul, Minor = feature batch,
Patch = tweak or fix, Build = republish. Bump it in the pull request that ships the change. `package.json`
keeps npm's three-number `version`; leave it alone.
