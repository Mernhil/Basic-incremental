# Releasing

Pushing a version tag builds the Windows installer on GitHub Actions and publishes a GitHub Release. Installed copies of the game check for it on launch, download it in the background, and offer a restart.

## Cut a release

1. Make sure `main` is clean and up to date, and `npm run lint && npm test && npm run build` pass.
2. Bump the version (no `v` prefix) without letting npm tag it:

   ```bash
   npm version 0.1.1 --no-git-tag-version
   ```

3. Commit and push:

   ```bash
   git commit -am "Release 0.1.1"
   git push
   ```

4. Tag and push the tag:

   ```bash
   git tag v0.1.1
   git push origin v0.1.1
   ```

5. Watch the **Release** workflow under the repo's Actions tab. When it finishes, the Release contains `basic-incremental-setup-<version>.exe`, its `.blockmap`, and `latest.yml`. Do not delete `latest.yml`: the updater reads it.

The workflow fails if the tag does not match the `package.json` version, so a mismatched tag never publishes.

## Notes

- Versions must increase (semver). The updater only offers a newer version than the one installed.
- The installer is unsigned, so Windows SmartScreen shows a warning on first install ("More info" → "Run anyway"). Auto-updates after that are silent.
- Update events are logged to `%APPDATA%\basic-incremental\logs\updater.log`.
- `npm run dist` builds the installer locally into `release/` without publishing. The Release workflow runs it too, then creates the GitHub Release with `gh release create` in one step. (electron-builder's own publishing could create two Releases for one tag.)
- If a release is bad, publish a newer fixed version. Do not reuse or move a tag.

## Local dev build (testing only, never released)

A private build for testing: "Basic Incremental Dev" has the Dev panel (resources, clears, time, **Game speed** 1x / 2x / 5x / 10x with an always-visible badge, **Reset game** with a backup) although it is packaged. It lives only in the project folder and is never uploaded: `release-dev/` and `out-dev/` are git-ignored, and the Release workflow never builds it.

- Double-click **`Rebuild and Start Dev Build.cmd`** in the repo root to build it from the current code (it runs `npm ci` first when packages are missing) and start it. It takes a few minutes. Run it again after pulling new code.
- Double-click **`Start Dev Build.cmd`** to start the last build without rebuilding.
- Same thing by hand: `npm run dist:dev`, then `release-devwin-unpackedBasic Incremental Dev.exe`.
- Its saves live in `%APPDATA%asic-incremental-devbuild` (never the installed game's `%APPDATA%asic-incremental`), so both can run side by side. Resets leave `save.before-reset-<time>.json` there. It has no auto-updater.
- The cheats are baked in by the build flag `BI_DEV_BUILD=1`, which only `scripts/dist-dev.mjs` sets. `npm run build` and `npm run dist` still fail if the cheats leak.
