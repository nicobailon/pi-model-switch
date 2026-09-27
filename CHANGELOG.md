# Changelog

## [Unreleased]

## [0.3.0] - 2026-09-26

### Highlights
- Set a thinking level when switching models, either directly or as part of an alias.
- See a heads-up before a model switch makes your next request re-pay for the whole conversation, with an estimated token count and cost.
- The agent is more careful about switching models on its own mid-conversation.
- Works with Pi 0.87.

### Added
- `switch_model` accepts an optional thinking level, and aliases can set one too. If the model doesn't support the requested level, the result shows the level Pi actually used. Leaving it out keeps the previous behavior. Thanks to [@mii9000](https://github.com/mii9000) for #5.
- A footer warning appears when switching models (`/model`, Ctrl+P, or `switch_model`) would throw away a still-warm prompt cache, showing roughly how many tokens and dollars the next request will re-bill. It clears once that request starts, and `switch_model` results include the same note. Switching back to a model whose cache is still warm doesn't warn.

### Changed
- The agent is now told to switch models mid-conversation only when you ask or the benefit is clear, since each switch re-bills the full conversation.

### Fixed
- `switch_model` works with Pi 0.87's tool API again.
- Added type checks, tests, and CI so future Pi API changes are caught before release.

## [0.2.0] - 2026-08-23

### Highlights
- Check the active model directly with the new `current` action.
- Keep project-specific aliases close to each project while still supporting user and package defaults.
- See which alias file is active when listing models.
- Install against Pi's current extension runtime packages.

### Added
- Added `switch_model` action `current` to identify the active model without listing all available models. Thanks to [@ajitid](https://github.com/ajitid) for #2.

### Changed
- Added project, user, and extension alias-file fallback locations with source reporting in `list`. Thanks to [@pcaro](https://github.com/pcaro) for #1.

### Fixed
- Migrated extension tool schemas from `@sinclair/typebox` to `typebox` 1.x so packaged installs follow Pi's current extension runtime contract.

## [0.1.4] - 2026-04-14

### Fixed
- Constrained the `switch_model.action` schema to explicit enum values with `Type.Union` literals.
- Fixed malformed `aliases.json` handling so invalid alias shapes fail with explicit config errors instead of crashing later during `switch_model`.

## [0.1.3] - 2026-04-11

### Changed
- Added AGENTS.md workflow example for intent → coding → review model switching
- Simplified update instructions to use `pi install npm:pi-model-switch` only
- Added `promptSnippet` guidance so the agent uses `switch_model` more reliably

### Fixed
- Constrained `action` parameter schema to explicit enum values (`list`, `search`, `switch`)

## [0.1.2] - 2026-02-01

### Changed
- Added package keywords for npm discoverability

## [0.1.1] - 2026-02-01

### Fixed
- Adapt execute signature to pi v0.51.0: insert signal as 3rd parameter

## 0.1.0 - 2026-01-24

- Initial release
