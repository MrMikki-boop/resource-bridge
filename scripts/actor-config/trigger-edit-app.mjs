import {
  MODULE_ID,
  TRIGGER_EVENTS, getTriggerEventLabels, getTriggerActionLabels,
  getItemUseModeLabels, RESOURCE_KEYS, getResourceLabels,
  CREATURE_TYPES, getCreatureTypeLabels,
} from "../constants.mjs";
import { getTriggers, setTriggers } from "../trigger-config.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const EVENTS_WITH_ITEM_FILTER   = new Set(["damage-dealt", "item-used"]);
const EVENTS_WITH_EXCLUDE_TYPES = new Set(["damage-dealt", "item-used"]);

/**
 * Принимает любой формат ID предмета и возвращает чистый itemId:
 *   "Actor.xxx.Item.jAVWOq0Qfk7RohWz" → "jAVWOq0Qfk7RohWz"
 *   "jAVWOq0Qfk7RohWz"                → "jAVWOq0Qfk7RohWz"
 *   "Короткий меч"                     → "Короткий меч"  (имя — не трогаем)
 */
export function parseItemId(raw) {
  if (!raw) return "";
  const trimmed = raw.trim();
  // Если содержит точки — берём последний сегмент
  if (trimmed.includes(".")) {
    return trimmed.split(".").pop();
  }
  return trimmed;
}

export class TriggerEditApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    tag: "form",
    form: {
      handler:        TriggerEditApp.#handleChange,
      submitOnChange: true,
      closeOnSubmit:  false,
    },
    position: { height: "auto", width: 460 },
    window: { resizable: true, minimizable: false },
    actions: {
      save:   TriggerEditApp.#onSave,
      cancel: TriggerEditApp.#onCancel,
    },
  };

  static PARTS = {
    form:   { template: `modules/${MODULE_ID}/scripts/actor-config/trigger-edit.hbs` },
    footer: { template: "templates/generic/form-footer.hbs" },
  };

  #actor;
  #trigger;
  #idx;
  #listApp;

  constructor(actor, trigger, idx, listApp) {
    super();
    this.#actor   = actor;
    // Миграция старых триггеров: event (string) → events (array)
    const t = foundry.utils.deepClone(trigger);
    if (!t.events) {
      t.events = t.event ? [t.event] : ["damage-taken"];
      delete t.event;
    }
    this.#trigger = t;
    this.#idx     = idx;
    this.#listApp = listApp;
  }

  get title() {
    return this.#idx === -1
        ? game.i18n.localize("resource-bridge.edit.titleNew")
        : game.i18n.format("resource-bridge.edit.titleEdit", {
          name: this.#trigger.name || game.i18n.localize("resource-bridge.list.noName"),
        });
  }

  get id() {
    return `${MODULE_ID}-trigger-edit-${this.#trigger.id}`;
  }

  _prepareContext(_options) {
    const t              = this.#trigger;
    const eventLabels    = getTriggerEventLabels();
    const actionLabels   = getTriggerActionLabels();
    const useModeLabels  = getItemUseModeLabels();
    const resourceLabels = getResourceLabels();
    const typeLabels     = getCreatureTypeLabels();

    // Показываем item-filter если хотя бы одно из выбранных событий его требует
    const showItemFilter   = t.events.some(e => EVENTS_WITH_ITEM_FILTER.has(e));
    const showExcludeTypes = t.events.some(e => EVENTS_WITH_EXCLUDE_TYPES.has(e));

    return {
      trigger: t,

      // Чекбоксы событий вместо селекта
      eventOptions: Object.entries(eventLabels).map(([k, v]) => ({
        value:   k,
        label:   v,
        checked: t.events.includes(k),
      })),

      actionOptions: Object.entries(actionLabels).map(([k, v]) => ({
        value: k, label: v, selected: t.action === k,
      })),

      resourceOptions: RESOURCE_KEYS.map(k => ({
        value: k, label: resourceLabels[k], selected: t.targetResource === k,
      })),

      useModeOptions: Object.entries(useModeLabels).map(([k, v]) => ({
        value: k, label: v, selected: (t.itemUseMode ?? "spent") === k,
      })),

      creatureTypeOptions: CREATURE_TYPES.map(ct => ({
        value: ct, label: typeLabels[ct], checked: t.excludeTypes?.includes(ct) ?? false,
      })),

      showResource:     t.action === "increment-resource",
      showItem:         t.action === "increment-item",
      showItemFilter,
      showExcludeTypes,

      buttons: [
        { type: "button", action: "cancel", label: "resource-bridge.btn.cancel", icon: "fa-solid fa-times" },
        { type: "button", action: "save",   label: "resource-bridge.btn.save",   icon: "fa-solid fa-save"  },
      ],
    };
  }

  static async #handleChange(_event, _form, formData) {
    const v = foundry.utils.expandObject(formData.object);
    const t = this.#trigger;

    t.name           = (v.name ?? "").trim();
    t.action         = v.action ?? t.action;
    t.targetResource = v.targetResource ?? t.targetResource;
    t.itemUseMode    = v.itemUseMode ?? t.itemUseMode ?? "spent";
    t.delta          = Math.max(1, parseInt(v.delta) || 1);
    t.oncePerRound   = Boolean(v.oncePerRound);

    // targetItem — парсим полный UUID
    t.targetItem       = parseItemId(v.targetItem ?? "");
    t.sourceItemFilter = parseItemId(v.sourceItemFilter ?? "");

    // events — мультиселект чекбоксов
    if (v.events && typeof v.events === "object") {
      t.events = Object.entries(v.events)
          .filter(([, checked]) => checked === true || checked === "on")
          .map(([k]) => k);
    } else {
      // Если пришла одна строка (single checkbox)
      t.events = v.events ? [v.events] : t.events;
    }
    // Хотя бы одно событие должно быть выбрано
    if (!t.events.length) t.events = ["damage-taken"];

    // excludeTypes
    if (v.excludeTypes && typeof v.excludeTypes === "object") {
      t.excludeTypes = Object.entries(v.excludeTypes)
          .filter(([, checked]) => checked === true || checked === "on")
          .map(([k]) => k);
    } else {
      t.excludeTypes = [];
    }

    this.render();
  }

  static async #onSave() {
    const triggers = getTriggers(this.#actor);
    if (this.#idx === -1) {
      triggers.push(this.#trigger);
    } else {
      triggers[this.#idx] = this.#trigger;
    }
    await setTriggers(this.#actor, triggers);
    this.#listApp?.render();
    this.close();
  }

  static #onCancel() {
    this.close();
  }
}
