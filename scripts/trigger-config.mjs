import { MODULE_ID } from "./constants.mjs";
import { TriggerListApp } from "./actor-config/trigger-list-app.mjs";

// ── CRUD helpers (used by list/edit apps and trigger-engine) ───────────────

export function getTriggers(actor) {
  return actor?.getFlag(MODULE_ID, "triggers") ?? [];
}

export async function setTriggers(actor, triggers) {
  await actor.setFlag(MODULE_ID, "triggers", triggers);
}

// ── Header button injection ────────────────────────────────────────────────

export function injectConfigButton() {
  Hooks.on("getHeaderControlsActorSheetV2", (app, controls) => {
    if (controls.some(c => c.class === "resource-bridge-triggers")) return;

    controls.push({
      class:   game.i18n.localize("resource-bridge.header.button"),
      icon:    "fas fa-bolt",
      label:   "RB Triggers",
      onClick: () => _openForActor(app.actor),
    });
  });

  // Application v1 sheets (legacy / some community sheets)
  Hooks.on("renderActorSheet", (sheet, html) => {
    // Avoid double-injection on sheets already handled by getActorSheetHeaderButtons
    if (html.find(".resource-bridge-triggers").length) return;
    const type = sheet.actor?.type;
    if (type !== "character" && type !== "npc") return;

    const btn = $(`
      <a class="resource-bridge-triggers" title="Resource Bridge Triggers">
        <i class="fas fa-bolt"></i> RB
      </a>
    `);
    btn.on("click", () => _openForActor(sheet.actor));
    html.find(".window-title").after(btn);
  });
}

// ── Open (or focus) the list window for an actor ──────────────────────────

function _openForActor(actor) {
  // If already open just bring it to focus
  const existing = foundry.applications.instances.get(`${MODULE_ID}-triggers-${actor.id}`);
  if (existing) {
    existing.bringToTop?.();
    return;
  }
  new TriggerListApp(actor).render(true);
}
