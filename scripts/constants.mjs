export const MODULE_ID = "resource-bridge";

// ── Типы событий триггеров ─────────────────────────────────────────────────
export const TRIGGER_EVENTS = {
  DAMAGE_TAKEN:    "damage-taken",
  DAMAGE_DEALT:    "damage-dealt",
  CRITICAL_HIT:    "critical-hit",
  REDUCE_TO_ZERO:  "reduce-to-zero",
};

export const TRIGGER_EVENT_LABELS = {
  "damage-taken":    "Получил урон",
  "damage-dealt":    "Нанёс урон",
  "critical-hit":    "Критический удар",
  "reduce-to-zero":  "Снизил врага до 0 HP",
};

// ── Типы действий ──────────────────────────────────────────────────────────
export const TRIGGER_ACTIONS = {
  INCREMENT_RESOURCE: "increment-resource",
  INCREMENT_ITEM:     "increment-item",
};

export const TRIGGER_ACTION_LABELS = {
  "increment-resource": "Увеличить ресурс актора",
  "increment-item":     "Изменить использования предмета",
};

// ── Режим изменения uses предмета ──────────────────────────────────────────
export const ITEM_USE_MODES = {
  SPENT: "spent",   // увеличить spent (набираем очки, например ОБ)
  VALUE: "value",   // увеличить value (восстанавливаем использования)
};

export const ITEM_USE_MODE_LABELS = {
  spent: "+spent (набор очков)",
  value: "+value (восстановление)",
};

// ── Ресурсы актора (dnd5e) ─────────────────────────────────────────────────
export const RESOURCE_KEYS = ["primary", "secondary", "tertiary"];

export const RESOURCE_LABELS = {
  primary:   "Primary",
  secondary: "Secondary",
  tertiary:  "Tertiary",
};

// ── Типы существ для фильтрации (dnd5e) ────────────────────────────────────
export const CREATURE_TYPES = [
  "undead", "construct", "elemental", "fiend",
  "celestial", "ooze", "plant", "aberration",
];

export const CREATURE_TYPE_LABELS = {
  undead:      "Нежить",
  construct:   "Конструкт",
  elemental:   "Элементаль",
  fiend:       "Исчадие",
  celestial:   "Небожитель",
  ooze:        "Слизь",
  plant:       "Растение",
  aberration:  "Аберрация",
};
