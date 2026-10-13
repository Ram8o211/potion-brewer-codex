# Build, deploy, and install

## Production build

Use Node.js 22.12 or newer:

```sh
npm ci
npm test
npm run build
npx playwright install --with-deps chromium
npm run test:browser
npm run preview
```

Deploy the contents of `dist/` to any static HTTPS host. No backend or runtime secrets are needed. Vite uses relative asset URLs, so the build supports the GitHub Pages repository path `/potion-brewer-codex/`. Keep the entire generated directory together, including the manifest, icons, and service worker.

`npm run preview` serves the production build for inspection; it is not a production hosting service. Test through a web server rather than opening `index.html` with a `file:` URL.

## GitHub Pages

The repository contains [.github/workflows/pages.yml](../.github/workflows/pages.yml). Pull requests run unit tests, TypeScript/build validation, and browser tests. A push to `main` or a manual workflow run on `main` also uploads and deploys the built site after those checks pass. CI installs Chromium through Playwright. When needed locally, `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` selects a particular executable; the workspace defaults to `/usr/bin/chromium` and CI uses Playwright's downloaded browser.

An administrator must configure **Repository Settings → Pages → Build and deployment → Source → GitHub Actions**. The build job uses read access to source. Pages configuration and publishing run in the separate deployment job, which has `pages: write` and `id-token: write`. This keeps test/build results separate from any repository hosting-configuration failure. The `github-pages` environment can have repository-specific protection rules; those rules may require additional approval before deployment.

Alternatively, the optional repository Actions secret `PAGES_SETUP_TOKEN` enables the workflow to request initial Pages setup. `actions/configure-pages@v5` requires a token other than the built-in `GITHUB_TOKEN` for this operation: a suitable personal access token with Pages write permission (or classic `repo` scope), or a GitHub App token with `administration:write` and `pages:write`. The workflow uses that secret only if supplied, and otherwise uses the normal workflow token with automatic enablement disabled. No setup secret is needed once Pages is configured through repository settings. Never commit a token to source.

When published with the default repository hostname, the expected address is:

<https://ram8o211.github.io/potion-brewer-codex/>

This is an expected URL, not a declaration that deployment has succeeded. Open the workflow's deployment URL and verify the actual page after GitHub reports success.

If publishing is blocked by repository permissions or invalid credentials, the tested code and deployment workflow remain usable. Obtain authorized GitHub access, push the branch, open a pull request targeting `main`, and merge only after its checks pass. Setting up a workflow locally does not configure repository Pages settings or create a live deployment.

## Deployment smoke check

After deploying:

1. Open the published URL in a mobile browser and confirm the game, styles, and artwork load under the repository subpath.
2. Start a seeded world, add materials, stir, perform an experiment, bottle, and sell a potion.
3. Confirm the manifest and service worker load from the same application path and the worker controls the page.
4. Reload, enable offline mode, and reload again. Confirm the game loads and the saved state remains available.
5. Export a save, restart the page, and import the file. Confirm the world and progression survive.
6. Confirm sound begins after interaction and mute/volume settings persist.

Record the actual deployment URL, commit, browser, and observations. Local tests cannot verify a remote deployment that was never published.

## Installation and offline play

The game must first load over HTTPS, or localhost during development, with network access. Allow the service worker to finish installing before trying offline mode. Use the browser's installation menu; on iOS, use Safari's Share menu and **Add to Home Screen**. Installation UI depends on browser support and eligibility.

The service worker caches bundled game resources. No remote API is needed for brewing, commissions, gathering, or saves. Initial installation and fetching newer versions require connectivity. Export important saves before clearing site storage or moving to a different origin.

## Save handling

Automatic saves belong to the browser profile and site origin. Export/import is the supported way to move progress. A world seed reproduces the world catalogue; a full save also carries progression and cauldron state. Do not treat the seed as a backup of your potion preparation.

Save files use the `potion-brewer` envelope and state version 1. Import rejects files larger than 4,000,000 bytes, invalid values, and unsupported versions. Keep the original exported file when moving between application versions. If import reports an unsupported version or invalid data, the current state remains available; arbitrary JSON is not supported. Automatic saves retain the previous valid local state for recovery, but export is still the portable backup.

## Updating

Publish the complete new `dist/` output atomically where your host permits it. The build generates the worker's exact precache list and a content-derived cache version. A page already running can continue using its existing cached version while a new worker waits for old tabs to close; close all game tabs and reopen to let an installed update activate. Retain the previous tested commit for rollback.
