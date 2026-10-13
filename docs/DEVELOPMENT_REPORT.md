# Development report

This report records the implemented behavior, completed local verification, and remaining limitations. GitHub publication and physical-device performance are recorded separately from local test results.

## Delivery approach

Potion Brewer is an original static TypeScript game built with Vite. Rendering uses Canvas 2D and original interface geometry. Sound uses browser synthesis. DM Sans and Fraunces are bundled under the SIL Open Font License, with retained notices in `docs/licenses/`. Gameplay has no required network service or third-party runtime JavaScript library. Development dependencies provide compilation, font packaging, unit tests, and browser automation.

The authoritative cauldron is a bounded 64 × 56 cellular material model. World generation, real-material experiments, commission evaluation, inventory, progression, gathering, recipes, persistence, and sandbox state connect through that model.

## Verification record

The final local verification passed:

| Check | Result |
| --- | --- |
| `npm test` | 55 passed: 22 simulation, 22 world/gameplay, and 11 persistence tests |
| `npm run build` | TypeScript validation and Vite production build passed |
| `npm run test:browser` | 9 passed; 0 failed, flaky, or skipped in headless Chromium |

The browser run finished on 13 October 2026 at 20:28:49 Europe/Rome (18:28:49 UTC), after the final runtime and service-worker changes. Its 63.669-second run includes the production build. Playwright tested the built game at `http://127.0.0.1:4173/potion-brewer-codex/`, using touch-enabled browser emulation. These results establish local behavior under a repository subpath; they do not establish a successful remote deployment or physical-phone behavior.

| Area | Implemented scope | Verification status |
| --- | --- | --- |
| World | Seeded ingredient properties and reaction catalogue; starter feasibility | Model tests reproduce worlds and satisfy the first four commissions across five seeds; browser tests reproduce a world after changing seeds |
| Material transport | Gravity, boundaries, granular settling, viscosity, density separation | Model tests check settling, stable piles, floating oil, viscosity, capacity, and conservation |
| Mixing and tools | Local stirring/crushing, compatible diffusion, measured addition/removal | Model tests check local mixing, immiscible separation, crushing identity/conservation, and the automated paddle; browser flow uses direct touch stirring |
| Heat and phases | Bottom thermal source, local conduction, temperature-based transitions, vapor/lid behavior | Model tests check local gradients, freezing/melting, evaporation, temperature-dependent condensation, drying, and thermal equipment; browser flow uses heat, cooling, and lid controls |
| Reactions | Contact, temperature and agitation conditions; products enter material state | Model tests check conditional product formation, material accounting, ash/smoke, and enclosed oxygen consumption |
| Experiments | Actual consumed sample; subject-specific observations; signature-bound knowledge | Model and browser tests check consumed material, supported measurements, changed signatures, and repeat testing after refinement |
| Shop | Commission scoring, bottling, sales, inventory, money and reputation | Model tests compare poor/excellent rewards and later progression; browser completes a sale, buys an upgrade, and reloads progress |
| Gathering and progression | Regions, regenerated resources, unlocks and equipment | Model tests check free recovery, time-based regeneration, region progression, subjects, and functional upgrades; browser gathers supplies and buys equipment |
| Journal and recipes | Observed results, compositions and preparation history | Model tests check measured recipes, manual steps, merged observations, and distinct hypotheses; browser reads observations and preserves the journal on reload |
| Sandbox | Independent state and unlimited supplies | Model and browser tests preserve shop inventory, money, and its suspended batch through sandbox use and export/import |
| Persistence | Versioned save, cauldron snapshot, JSON export/import | Model tests check snapshot continuation, backup recovery, invalid versions/data, and quota failure; browser tests actual downloads/imports and rejects invalid JSON |
| Mobile UI | Portrait layout, touch tools, contextual controls, tutorial | Browser tests all five panels at four sizes, touch stirring, keyboard activation, dialog dismissal, focus return, and horizontal overflow; screenshots inspected |
| Offline/PWA | Local resources, manifest, service-worker installation and cache | Browser verifies manifest, installed worker/control, offline reload, brewing/testing/sale, and another offline reload; resources are same-origin |
| Production | TypeScript/build and GitHub Pages workflow | Production build passed; workflow included; repository hosting status is recorded below |

### Seeds and conservation stress

The first four commissions are demonstrably achievable in each of `guild`, `moonlight`, `volcano`, `zero`, and `🍃`. These are finite balance checks of early progression, not a proof that every generated seed and later request is balanced.

Full mixed-vessel tests use `amber-load`, `glacier-load`, and `wild-load`. Each fills a 1,200-unit test vessel with six ingredients, verifies that further addition accepts only remaining capacity, closes the lid, applies heat and 100 stirring steps, and checks material accounting and finite state. A snapshot restored halfway produces an identical continuation. Browser world reproduction separately uses `qa-bellflower`, `qa-frostglass`, then `qa-bellflower` again.

### Browser flow, layouts, and offline behavior

The full commission test starts with a new shop, inspects ingredient properties, gathers resources, adds measured materials, stirs through dispatched touch input, heats, cools, opens/closes the lid, consumes a sample, reads the recorded observation, refines and retests, bottles, sells, purchases an upgrade, and reloads. Sale count, money, equipment, and journal survive; no page errors are observed.

Layout checks cover **320 × 568**, **390 × 844**, **1024 × 768**, and **844 × 390** pixels. Each checks Brew, Explore, Trials, Journal, and Shop, with primary navigation targets at least 44 pixels high and no horizontal page overflow. Twenty panel screenshots, the phone ingredient shelf, and the busy cauldron produce 22 screenshot artifacts under `work/screenshots/`; visual review found no clipping or overflow in those views. This does not replace physical-device usability or assistive-technology review.

The offline test waits for the production service worker to install and control the page, sets the browser context offline, then reloads. It adds 40 units, tests, bottles, sells, and reloads again while still offline. The saved sale and remaining mixture survive. All observed game-resource requests are same-origin. This verifies actual cached play, beyond checking that a worker file exists. Browser installation into an operating-system home screen remains a manual device check.

The sandbox test exports a real JSON download while experimenting independently, confirms that the file contains the shop state, imports it after creating a replacement world, and confirms inventory and batch preservation. An invalid JSON file is rejected without replacing the running shop.

### Performance measurement

The browser stress run uses world seed `moonlit-1347` and a sandbox mixture of 640 units of water, 400 of sun-oil, and 320 of frost-salt with maximum heat and the sandbox's automated paddle. It observes 1,701 active cells with finite cell values and finite aggregate metrics.

| Measurement | Observed result |
| --- | --- |
| Wall-clock sample duration | 3,019.9 ms |
| Frame count divided by actual elapsed time | 39.07 FPS |
| Median gameplay/simulation update time per animation frame | 16.9 ms |
| 95th-percentile gameplay/simulation update time per animation frame | 33.6 ms |
| Recent in-game frame-rate estimate | 42 FPS |

The wall-clock measurement counts application frames over the actual elapsed sample; the recent in-game estimate uses a shorter rolling window. Update timings wrap `game.tick(elapsed)` and are not timings of an isolated 30 Hz simulation substep. These values describe headless desktop Chromium in this cloud workspace. They do not prove 60 FPS on capable phones, 30 FPS on mid-range phones, or sustained performance under battery/thermal limits. The three-second busy run verifies bounded, finite behavior, not extended-session stability.

Local evidence is retained in `work/browser-report/index.html`, `work/final-browser-report.json`, `work/final-performance.json`, and `work/screenshots/`. These generated files are excluded from source control; rerun the documented commands to reproduce them. CI retains browser failure evidence as an artifact when a check fails.

Sandbox contents are independent during a running session. Automatic saves and exports preserve the shop, including its suspended batch; they do not preserve the sandbox across reloads.

## Deliberate simulation approximations

The model prioritizes understandable causes, stable bounded work, and mobile interaction. It is not a pressure-solved fluid engine or a scientific chemistry simulator.

- Liquids use cellular movement and local transfers. The grid has finite spatial resolution and approximates continuous surfaces.
- The simulation runs at a logical 30 Hz with bounded catch-up work. A single supplied time interval is capped at two seconds and sixty substeps; this is a stability policy, not proof of real-time throughput on every device.
- The browser frame loop supplies at most 50 ms of elapsed simulation time per frame and pauses it while the page is hidden. During very slow frames the simulation clock can lag wall time. Gathering regeneration uses wall-clock timestamps instead of background simulation.
- Powder friction and paste cohesion are game rules, not a full discrete-element or viscoelastic solver.
- Frozen material is represented by coherent cell structures. It does not provide arbitrary rigid-body rotation or free-form mold casting.
- Gases use cellular buoyancy, local movement, and containment rules. Pressure and real compressible thermodynamics are approximated.
- Thermal and phase-change rules approximate material transitions. They do not provide laboratory-grade energy accounting or chemical kinetics.
- A normal experiment or bottle takes a proportional composite sample from the vessel. It consumes actual material but does not select a specific spatial layer. The alembic separately collects actual vapor; evaporation is material-selective.
- A mixed cell uses a bulk phase derived from its composition and conditions. It does not solve a separate pressure or velocity field for every chemical species.
- Very small residual parcels at an immiscible interface can share a cell to prevent artificial hovering over numerical traces. Density separation remains a cellular approximation.
- Ingredient chemistry and magic are intentionally fictional, driven by generated material properties and reaction rules.
- A seed reproduces the world definitions. Repeating an experiment also requires matching quantities, preparation actions, elapsed steps, and starting state.

Electrical conductivity is ingredient metadata. An interactive electrical-potential field, electrochemistry, and free-form mold casting are not implemented. The alembic collects a measurable volatile fraction; it is not a full reflux or separation-column model.

## Verification limits

60 FPS on capable devices and stable 30 FPS on mid-range phones are targets. They have not been established by desktop browser automation. Adaptive presentation quality does not prove those targets.

Automated Chromium tests do not replace Safari/iOS, Android device, accessibility assistive-technology, audio listening, battery, thermal throttling, or extended-play checks. Those remain release evaluation work unless specific measured evidence is recorded below.

Browser storage is not guaranteed permanent or synchronized. Users should export saves. Offline use requires a successful first online installation and does not supply offline updates.

## Publication status

The source is ready on development branch `codex/potion-brewer`, with the validation and Pages workflow included. The pull request, merge, and remote CI results will be recorded after publication; no pull-request or deployment URL is asserted here yet.

Repository inspection confirmed `has_pages: false`. The connected GitHub tools report repository administrator permission, but expose no Pages configuration setter, and CLI API access is unavailable in this session. The workflow can request initial setup through an optional `PAGES_SETUP_TOKEN` with the required GitHub permissions. Otherwise an administrator must select **Settings → Pages → Build and deployment → Source → GitHub Actions**, as described in [deployment instructions](DEPLOYMENT.md).

GitHub Pages has not been verified live. The expected hostname is not deployment evidence; a playable URL will be recorded only after deployment succeeds and the actual remote game is checked.
