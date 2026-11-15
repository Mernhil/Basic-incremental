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
