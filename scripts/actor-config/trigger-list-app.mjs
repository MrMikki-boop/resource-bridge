import { MODULE_ID, getTriggerEventLabels, getTriggerActionLabels, getResourceLabels } from "../constants.mjs";
import { getTriggers, setTriggers } from "../trigger-config.mjs";
import { TriggerEditApp } from "./trigger-edit-app.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class TriggerListApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    tag: "div",
    position: { height: "auto", width: 500 },
    window: { resizable: true, minimizable: true },
    actions: {
      add:    TriggerListApp.#onAdd,
      edit:   TriggerListApp.#onEdit,
      delete: TriggerListApp.#onDelete,
      toggle: TriggerListApp.#onToggle,
    },
  };

  static PARTS = {
    list: { template: `modules/${MODULE_ID}/scripts/actor-config/trigger-list.hbs` },
  };

  #actor;

  constructor(actor) {
    super();
    this.#actor = actor;
  }

  get title() { return `⚡ Resource Bridge — ${this.#actor.name}`; }
  get id()    { return `${MODULE_ID}-triggers-${this.#actor.id}`; }

  _prepareContext(_options) {
    const eventLabels  = getTriggerEventLabels();
    const actionLabels = getTriggerActionLabels();
    const triggers     = getTriggers(this.#actor);

    return {
      triggers: triggers.map((t, i) => {
        // Поддержка старого формата (event: string)
        const events = Array.isArray(t.events) ? t.events : (t.event ? [t.event] : []);
        return {
          ...t,
          idx:         i,
          // Склеиваем несколько событий через " / "
          eventLabel:  events.map(e => eventLabels[e] ?? e).join(" / "),
          actionLabel: actionLabels[t.action] ?? t.action,
          targetDesc:  this.#targetDesc(t),
          sourceDesc:  t.sourceItemFilter
              ? `${game.i18n.localize("resource-bridge.list.sourceItem")}: ${t.sourceItemFilter}`
              : "",
        };
      }),
    };
  }

  #targetDesc(trigger) {
    const resourceLabels = getResourceLabels();
    if (trigger.action === "increment-resource") {
      const name = resourceLabels[trigger.targetResource] ?? trigger.targetResource;
      return game.i18n.format("resource-bridge.target.resource", { name });
    }
    const name = trigger.targetItem || "?";
    return game.i18n.format("resource-bridge.target.item", { name });
  }

  static #onAdd() {
    const blank = {
      id:               foundry.utils.randomID(),
      name:             "",
      events:           ["damage-taken"],
      action:           "increment-resource",
      targetResource:   "primary",
      targetItem:       "",
      sourceItemFilter: "",
      itemUseMode:      "spent",
      delta:            1,
      oncePerRound:     false,
      excludeTypes:     [],
      enabled:          true,
    };
    new TriggerEditApp(this.#actor, blank, -1, this).render(true);
  }

  static #onEdit(_event, target) {
    const idx      = Number(target.closest("[data-idx]").dataset.idx);
    const triggers = getTriggers(this.#actor);
    new TriggerEditApp(this.#actor, triggers[idx], idx, this).render(true);
  }

  static async #onDelete(_event, target) {
    const idx      = Number(target.closest("[data-idx]").dataset.idx);
    const triggers = getTriggers(this.#actor);
    triggers.splice(idx, 1);
    await setTriggers(this.#actor, triggers);
    this.render();
  }

  static async #onToggle(_event, target) {
    const idx      = Number(target.closest("[data-idx]").dataset.idx);
    const triggers = getTriggers(this.#actor);
    triggers[idx].enabled = !triggers[idx].enabled;
    await setTriggers(this.#actor, triggers);
    this.render();
  }
}
