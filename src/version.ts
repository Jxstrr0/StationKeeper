// The game's version, shown small on the title screen. This is the one place to change it.
//
// Four numbers, Major.Minor.Patch.Build, the same scheme across all Longlight games:
// - Major: an overhaul.
// - Minor: a batch of new features.
// - Patch: a tweak or a fix.
// - Build: a republish with no change players would notice.
// Bump it in the pull request that ships the change. (package.json keeps a three-number "version"
// because npm insists on that; it isn't shown anywhere and doesn't need bumping.)
export const GAME_VERSION = '0.2.0.2';
