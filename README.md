# Resource Bridge

A [Foundry VTT](https://foundryvtt.com/) module that exposes a global `ResourceBridge` API for macros to reliably read and modify item uses/charges on any actor — routing all writes through the GM socket for permission safety.

## Why?

In D&D 5e v3/v4/5.x, writing to `item.system.uses.value` directly is silently ignored because `value` is a computed field (`max − spent`). Activity-level uses have their own quirks with MidiQOL utility activities that carry an empty `uses` object. This module handles all of that transparently.

## Requirements

| Dependency | Version |
|---|---|
| Foundry VTT | v12+ (verified v13) |
| [socketlib](https://github.com/manuelVo/foundryvtt-socketlib) | 1.0+ |
| D&D 5e system | 3.0+ (verified 5.2.5) |

## Installation

**Via Manifest URL** (recommended):
```
https://github.com/MrMikki-boop/resource-bridge/releases/latest/download/module.json
```

**Manual**: Download the latest `resource-bridge.zip` from [Releases](https://github.com/MrMikki-boop/resource-bridge/releases), unzip into your `Data/modules/` folder.

## API

All methods are available globally as `ResourceBridge.*` once the module is loaded.

---

### `ResourceBridge.resolve(actor, itemIdOrName)`

Synchronously reads an item's current charges. Does **not** require a GM socket — safe to call anywhere.

```js
const result = ResourceBridge.resolve(actor, "6GOFHZRGJkvvkqgT");
// or by name substring:
const result = ResourceBridge.resolve(actor, "порча");

// Returns:
// {
//   item:     Item,                          — the found item
//   activity: Activity | null,               — activity if mode === "activity"
//   mode:     "activity" | "item" | "none",  — where uses are stored
//   charges:  number                         — current uses value
// }
// Returns null if item not found.
```

**How mode is determined:**
- `"activity"` — item has an activity with a non-empty `uses.max` (e.g. `"10"` or `10`)
- `"item"` — item has `system.uses.max > 0` (standard item-level uses)
- `"none"` — no uses configured

---

### `await ResourceBridge.deductCharges(actor, itemIdOrName, amount)`

Subtracts `amount` from the item's current charges. Routes through GM socket.

```js
// Spend 3 charges of the item with this ID:
await ResourceBridge.deductCharges(actor, "6GOFHZRGJkvvkqgT", 3);

// By name:
await ResourceBridge.deductCharges(actor, "порча", 3);
```

Will not go below 0. Returns the new value.

---

### `await ResourceBridge.setCharges(actor, itemIdOrName, newValue)`

Sets charges to an exact value. Routes through GM socket.

```js
await ResourceBridge.setCharges(actor, "6GOFHZRGJkvvkqgT", 10); // full recharge
```

---

## D&D 5e 5.x note — `spent` vs `value`

In dnd5e 5.x, `system.uses.value` is computed as `max − spent` and cannot be written directly. Resource Bridge automatically writes to `system.uses.spent` instead:

```
setCharges(actor, item, newValue)
  → item.update({ "system.uses.spent": max − newValue })
```

For activity-level uses, `activity.update({ "uses.value": newValue })` is used when available, with a direct path fallback.

---

## Usage example (macro)

```js
// Get corruption item from a different actor
const CORRUPTION_UUID = "Actor.MQWAMoUwevyyvvaO.Item.6GOFHZRGJkvvkqgT";
const corruptionItem  = await fromUuid(CORRUPTION_UUID);
const corruptionActor = corruptionItem?.parent;

// Read charges (sync)
const { charges } = ResourceBridge.resolve(corruptionActor, corruptionItem.id);
console.log(`Current charges: ${charges}`);

// Spend 3 charges (async, goes through GM socket)
await ResourceBridge.deductCharges(corruptionActor, corruptionItem.id, 3);
```

---

## Changelog

See [CHANGELOG.md](CHANGELOG.md).

## License

[MIT](LICENSE)
