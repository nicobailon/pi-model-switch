# Changelog

## [Unreleased]

### Added
- Added `switch_model` action `current` to identify the active model without listing all available models. Thanks to [@ajitid](https://github.com/ajitid) for #2.

### Changed
- Added project, user, and extension alias-file fallback locations with source reporting in `list`. Thanks to [@pcaro](https://github.com/pcaro) for #1.

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
