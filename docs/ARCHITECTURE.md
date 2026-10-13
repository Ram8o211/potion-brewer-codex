# Architecture

Potion Brewer is a static browser application written from scratch. TypeScript modules divide the world model, material simulation, shop progression, rendering, UI, persistence, and audio. Canvas 2D presents the cauldron and illustrated environments; HTML controls provide readable, accessible touch interactions. Vite compiles and bundles the application. There are no third-party runtime JavaScript dependencies or mandatory remote services. DM Sans and Fraunces font files are bundled locally under their SIL Open Font License notices.

| Module | Responsibility |
| --- | --- |
| `src/core/types.ts` | Shared material, sample, commission, discovery, and save contracts |
| `src/core/simulation.ts` | Authoritative material grid, local interactions, tools, metrics, and sampling |
| `src/game/world.ts` | Seeded material catalogue and reaction definitions |
| `src/game/game.ts` | Inventory, commissions, experiments, gathering, upgrades, and sandbox separation |
| `src/render/laboratory.ts` | Cauldron artwork and material presentation |
| `src/render/audio.ts` | Original synthesized ambience and event tones |
| `src/render/fonts.css` and `src/assets/fonts/` | Bundled typefaces with retained third-party license notices |
| `src/ui/app.ts` and `src/ui/styles.css` | Screens, touch controls, contextual feedback, and responsive layout |
| `src/core/persistence.ts` | Versioned save encoding, validation, local backup, and export |
| `src/main.ts` | Application lifecycle, frame scheduling, automatic save, audio unlock, and service-worker registration |
| `public/` and `vite.config.ts` | App manifest, original icon, worker template, and build-time precache generation |

## Authoritative material state

The cauldron uses a bounded 64 × 56 cellular grid. A cell contains material composition and mass, phase, temperature, agitation, and local motion. Ingredients define density, viscosity, miscibility, solubility, thermal properties, transition thresholds, flammability, acidity, stability, and magical effects. Products use the same material representation as starting ingredients.

Simulation uses fixed 30 Hz substeps to apply local transport and interactions. Each input step is capped at two seconds and sixty iterations. The browser supplies at most 50 ms per animation frame and pauses brewing while hidden; gathering regeneration instead uses wall-clock timestamps. Gravity and vessel boundaries constrain movement. Density and compatibility affect separation and diffusion. Stirring acts around the touched location. Bottom heating and cooling propagate through neighboring cells. Phase changes depend on local material and temperature; a lid affects vapor escape and oxygen availability. Contact, temperature, and agitation govern reactions.

The model aggregates actual cell compositions by quantity when computing sample metrics. Experiment reports, bottles, and customer scores use those sample metrics. Rendering does not determine potion properties or invent reaction outcomes. Visual quality can change presentation without changing authoritative material quantities.

The fixed grid, bounded update work, and capped journal, recipe, preparation, and simulation-event collections limit the cost of common actions. This model deliberately approximates continuum flow, rigid-body mechanics, and thermodynamics. Its limits and verification status are recorded in [the development report](DEVELOPMENT_REPORT.md).

## World generation and feasibility

A deterministic seed varies properties, advanced ingredient names, and reaction thresholds around designed fantasy material families. This combines reproducibility with starter feasibility; it does not generate arbitrary chemistry from unconstrained random values. Starting materials expose useful basic effects. Progression unlocks further ingredients and gathering regions. Commissions use quantitative targets, ranges, minima, maxima, and weights against real potion properties.

Seeds reproduce world definitions. Experimental repeatability additionally depends on the full material state and preparation history. A save stores the seed and simulation snapshot; it is more complete than a seed alone.

## The connected gameplay loop

Inventory limits ingredient addition in shop mode. Gathering and purchases replenish inventory. Measured experiments remove material from the cauldron and reveal only the subject's supported properties. The journal records the sample signature, observed results, composition, and preparation history, so a changed preparation does not inherit a previous sample's verification.

Bottling transfers a real sample into bottle inventory. Delivery evaluates that bottle against the active commission, then awards money and reputation. Equipment purchases change usable preparation capabilities. Named recipes preserve knowledge and preparation steps; they do not replace simulation with a predefined potion.

Sandbox mode owns independent brewing state and unlimited supplies. Switching modes preserves the shop's cauldron and finances. Sandbox observations are separate from paid shop progression. Persistence and export retain the shop while sandbox mode is active; sandbox contents are session-local.

## Persistence and offline operation

Versioned saves hold progression, inventory, settings, knowledge, bottles, preparation steps, and the cauldron snapshot. The snapshot includes cell composition, local temperatures, gas escape, oxygen, lid thermal history, substep remainder, and iteration count. The export envelope identifies `format: 'potion-brewer'` and contains state version 1. JSON export/import provides manual backup and transfer. Import accepts at most 4,000,000 bytes and validates supported versions, bounded numeric values, collection lengths, grid dimensions, and material cells before replacing the active game. This edition supports version 1 and rejects unsupported versions; migration from an earlier released format is not claimed.

Local browser storage saves every five seconds while active and on visibility/page lifecycle events. Before writing a new save, the previous valid state is retained under a backup key. Startup can recover from that backup if the primary stored save is invalid. A storage failure is surfaced so the player can export manually.

The web app manifest and service worker support installation and offline loading of bundled resources after a successful first visit. Vite's production close-bundle step enumerates the emitted files, excludes source maps, and injects an exact precache list and content-derived cache identifier into the worker. Relative asset URLs and Vite's `base: './'` allow repository-subpath hosting. Registration scopes the worker to the app's path.

No cloud synchronization is provided. Removing browser data, changing browser profiles, or changing host origins can make the local save unavailable. Export is the portable backup mechanism.

## Presentation, input, and sound

The portrait-first interface keeps the cauldron prominent and groups secondary activities into dedicated screens. Pointer interaction supports touchscreen and mouse. Direct stirring and crushing affect the material near the pointer; measured controls provide an alternative to freehand interactions. Layout handles phone widths, landscape, and safe-area insets.

Original art uses drawn geometry, gradients, and character illustrations rather than downloaded asset packs. The original app icon is supplied as SVG and 192/512-pixel PNG installation icons. Typography uses locally bundled licensed fonts, so it remains available offline. Audio provides synthesized ambient notes and event tones through Web Audio after a user gesture, with persisted mute and volume controls. It does not bundle recorded music. Reduced-motion and quality settings control presentation cost. The auto setting reduces presentation frequency after sustained slow frames while keeping gameplay updates separate.

## Development inspection

Open the app with `?debug=1` to expose `window.__POTION_DEV__` in browser developer tools. Its `game` getter provides the current authoritative game, `snapshot()` exports the current state, `save()` persists it, and `performance` provides recent frame rate, frame time, simulation time, and frame count. This is an opt-in inspection utility; the normal UI does not require it. Timing estimates in a desktop tab are diagnostics, not measured smartphone performance.

## Verification boundaries

Unit tests target model behavior and invariants; browser tests target the playable flow, persistence, and mobile interaction. Production build checks TypeScript and bundling. Device frame rate, long-session behavior, Safari differences, and perceived polish need separate physical-device evaluation. A passing automated suite does not establish those outcomes.
