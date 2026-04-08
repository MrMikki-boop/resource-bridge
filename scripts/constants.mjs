export const MODULE_ID = "resource-bridge";

// ── Типы событий ───────────────────────────────────────────────────────────
export const TRIGGER_EVENTS = {
  DAMAGE_TAKEN:   "damage-taken",
  DAMAGE_DEALT:   "damage-dealt",
  CRITICAL_HIT:   "critical-hit",
  REDUCE_TO_ZERO: "reduce-to-zero",
  ITEM_USED:      "item-used",
};

export function getTriggerEventLabels() {
  return {
    "damage-taken":   game.i18n.localize("resource-bridge.events.damage-taken"),
    "damage-dealt":   game.i18n.localize("resource-bridge.events.damage-dealt"),
    "critical-hit":   game.i18n.localize("resource-bridge.events.critical-hit"),
    "reduce-to-zero": game.i18n.localize("resource-bridge.events.reduce-to-zero"),
    "item-used":      game.i18n.localize("resource-bridge.events.item-used"),
  };
}

// ── Типы действий ──────────────────────────────────────────────────────────
export const TRIGGER_ACTIONS = {
  INCREMENT_RESOURCE: "increment-resource",
  INCREMENT_ITEM:     "increment-item",
};

export function getTriggerActionLabels() {
  return {
    "increment-resource": game.i18n.localize("resource-bridge.actions.increment-resource"),
    "increment-item":     game.i18n.localize("resource-bridge.actions.increment-item"),
  };
}

// ── Режим изменения uses ───────────────────────────────────────────────────
export const ITEM_USE_MODES = {
  SPENT: "spent",
  VALUE: "value",
};

export function getItemUseModeLabels() {
  return {
    spent: game.i18n.localize("resource-bridge.useModes.spent"),
    value: game.i18n.localize("resource-bridge.useModes.value"),
  };
}

// ── Ресурсы актора ─────────────────────────────────────────────────────────
export const RESOURCE_KEYS = ["primary", "secondary", "tertiary"];

export function getResourceLabels() {
  return {
    primary:   game.i18n.localize("resource-bridge.resources.primary"),
    secondary: game.i18n.localize("resource-bridge.resources.secondary"),
    tertiary:  game.i18n.localize("resource-bridge.resources.tertiary"),
  };
}

// ── Типы существ ───────────────────────────────────────────────────────────
export const CREATURE_TYPES = [
  "undead", "construct", "elemental", "fiend",
  "celestial", "ooze", "plant", "aberration",
];

export function getCreatureTypeLabels() {
  return {
    undead:     game.i18n.localize("resource-bridge.creatureTypes.undead"),
    construct:  game.i18n.localize("resource-bridge.creatureTypes.construct"),
    elemental:  game.i18n.localize("resource-bridge.creatureTypes.elemental"),
    fiend:      game.i18n.localize("resource-bridge.creatureTypes.fiend"),
    celestial:  game.i18n.localize("resource-bridge.creatureTypes.celestial"),
    ooze:       game.i18n.localize("resource-bridge.creatureTypes.ooze"),
    plant:      game.i18n.localize("resource-bridge.creatureTypes.plant"),
    aberration: game.i18n.localize("resource-bridge.creatureTypes.aberration"),
  };
}
