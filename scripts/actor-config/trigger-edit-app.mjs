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

export class TriggerEditApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    tag: "form",
    form: {
      handler:        TriggerEditApp.#handleChange,
      submitOnChange: true,
      closeOnSubmit:  false,
    },
    position: { height: "auto", width: 440 },
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
    this.#trigger = foundry.utils.deepClone(trigger);
    this.#idx     = idx;
    this.#listApp = listApp;
  }

  get title() {
    return this.#idx === -1
      ? game.i18n.localize("resource-bridge.edit.titleNew")
      : game.i18n.format("resource-bridge.edit.titleEdit", { name: this.#trigger.name || game.i18n.localize("resource-bridge.list.noName") });
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

    return {
      trigger: t,

      eventOptions: Object.entries(eventLabels).map(([k, v]) => ({
        value: k, label: v, selected: t.event === k,
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
      showItemFilter:   EVENTS_WITH_ITEM_FILTER.has(t.event),
      showExcludeTypes: EVENTS_WITH_EXCLUDE_TYPES.has(t.event),

      buttons: [
        { type: "button", action: "cancel", label: "resource-bridge.btn.cancel", icon: "fa-solid fa-times" },
        { type: "button", action: "save",   label: "resource-bridge.btn.save",   icon: "fa-solid fa-save"  },
      ],
    };
  }

  static async #handleChange(_event, _form, formData) {
    const v = foundry.utils.expandObject(formData.object);
    const t = this.#trigger;

    t.name             = (v.name             ?? "").trim();
    t.event            = v.event             ?? t.event;
    t.action           = v.action            ?? t.action;
    t.targetResource   = v.targetResource    ?? t.targetResource;
    t.targetItem       = (v.targetItem       ?? "").trim();
    t.sourceItemFilter = (v.sourceItemFilter ?? "").trim();
    t.itemUseMode      = v.itemUseMode       ?? t.itemUseMode ?? "spent";
    t.delta            = Math.max(1, parseInt(v.delta) || 1);
    t.oncePerRound     = Boolean(v.oncePerRound);

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
