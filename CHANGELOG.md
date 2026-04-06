# Changelog

## [1.1.0] — 2025-04-07

### Fixed
- `_resolveItem` now correctly skips MidiQOL utility activities that have an empty `uses.max` (`""`), falling through to item-level uses instead of reading a false `0`
- Item-level uses now write to `system.uses.spent` instead of `system.uses.value`, which was silently ignored in D&D 5e 5.x (`value` is a computed field: `max − spent`)

### Changed
- Debug logging added to `_resolveItem`: logs `mode`, `charges`, and `max` on every resolve so macro authors can verify detection in the browser console
- `module.json`: added `url`, `manifest`, `download`, `changelog`, `readme`, `license` fields; added `systems` relationship for dnd5e 3.0+; bumped version to 1.1.0

## [1.0.0] — initial release

- GM-socket API: `resolve()`, `setCharges()`, `deductCharges()`
- Supports activity-level and item-level uses
- Foundry v12/v13, D&D 5e 3.x/4.x
