# Potion Brewer

A portrait-first alchemy game for the browser. Run a fantasy potion shop, gather ingredients, brew in an interactive cauldron, test real samples, and earn reputation by satisfying customer commissions. A separate sandbox lets you experiment without spending shop resources.

The project is original TypeScript, Canvas 2D, CSS, and synthesized audio, with bundled DM Sans and Fraunces typefaces. Gameplay runs locally; it does not require a server, external API, account, or GitHub connection. Vite, font packaging, and the test tools are development dependencies.

Repository: <https://github.com/Ram8o211/potion-brewer-codex>

## Run locally

Use Node.js 22.12 or newer and npm.

```sh
npm ci
npm run dev
```

Open the URL printed by Vite. On a phone on the same network, use the host computer's local network address and Vite's port. Browser installation and service-worker offline support require HTTPS or localhost.

```sh
npm test
npm run build
npx playwright install --with-deps chromium
npm run test:browser
npm run preview
```

`npm test` runs model tests. `npm run build` checks TypeScript and produces `dist/`. `npm run test:browser` runs browser gameplay and mobile-layout checks. The browser tests can use an installed Chromium or Playwright's downloaded Chromium; see [development and verification notes](docs/DEVELOPMENT_REPORT.md).

## Play

1. Read the current customer's requested effects and limits.
2. Inspect ingredient properties and gather or buy supplies.
3. Add measured ingredients to the cauldron. Drag the stirring tool through the material; heat, cool, crush, or close the lid when appropriate.
4. Visit the experiment room and consume a measured sample on a subject. Read the observed properties in the journal.
5. Refine the mixture and test again. Bottle a portion and deliver it to the customer.
6. Spend your earnings on supplies and functional laboratory upgrades.

Ingredient effects are clues. Mixture effects remain unverified until an appropriate experiment records them. Saved recipes record ingredients, preparation steps, and observed results; preparation still happens in the simulation.

Use Settings for sound, graphics quality, motion preferences, and save export/import. Audio begins after a user interaction. Keep an exported save if you need to move devices or clear browser storage. Shop and sandbox are separate: sandbox supplies and experiments do not change shop finances. Saves preserve the shop even while you are in the sandbox; the sandbox itself lasts for the current session.

## Install and save

After opening a deployed HTTPS build online, use your browser's installation action or “Add to Home Screen.” A successful service-worker installation caches the bundled game for later offline use. The first visit and updates require network access. Browser storage is local to that browser and origin; it is not cloud backup.

A world seed regenerates the same ingredient catalogue and reactions. A save additionally preserves progression, discoveries, bottles, settings, and the cauldron snapshot. Identical seeds alone do not reproduce different preparation histories.

## Engineering notes

The bounded cellular simulation calculates material movement, composition, temperature, phase changes, and reaction products. Potion outcomes come from actual sampled material. It is an interactive game model with deliberate approximations, not scientific CFD. Mobile frame-rate targets require measurement on physical devices and are not claimed as achieved.

Local verification passed 55 model tests, 9 Chromium browser tests, and the production build. Browser checks include the full commission loop, four viewport sizes, save export/import, and brewing through a sale after an actual offline reload. See the development report for seeds, measured performance, and verification limits.

- [Architecture](docs/ARCHITECTURE.md)
- [Deployment and installation](docs/DEPLOYMENT.md)
- [Development report, verification, and limitations](docs/DEVELOPMENT_REPORT.md)

The GitHub Actions workflow validates the project and can publish `dist/` to GitHub Pages. Repository Pages configuration and valid GitHub permissions are required. A configured workflow is not evidence of a successful live deployment.

## License

Original project code, generated geometry, interface artwork, and synthesized sound are released under the [MIT License](LICENSE). Bundled fonts retain their SIL Open Font License notices: [DM Sans](docs/licenses/DM-Sans.txt) and [Fraunces](docs/licenses/Fraunces.txt). Development dependencies retain their own licenses.
