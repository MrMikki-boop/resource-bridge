import { MODULE_ID } from "./constants.mjs";
import { ResourceBridge, setSocket } from "./api.mjs";
import { registerSocketHandlers } from "./socket-handlers.mjs";
import { initTriggerEngine } from "./trigger-engine.mjs";
import { injectConfigButton } from "./trigger-config.mjs";

let socket;

// ── Init: прегружаем шаблоны ───────────────────────────────────────────────

Hooks.once("init", () => {
  foundry.applications.handlebars.loadTemplates([
    `modules/${MODULE_ID}/scripts/actor-config/trigger-list.hbs`,
    `modules/${MODULE_ID}/scripts/actor-config/trigger-edit.hbs`,
  ]);
});

// ── socketlib ──────────────────────────────────────────────────────────────

Hooks.once("socketlib.ready", () => {
  socket = socketlib.registerModule(MODULE_ID);
  registerSocketHandlers(socket);
  setSocket(socket);
});

// ── Ready ──────────────────────────────────────────────────────────────────

Hooks.once("ready", () => {
  globalThis.ResourceBridge = ResourceBridge;
  initTriggerEngine();
  injectConfigButton();

  console.log(`Resource Bridge | Ready (dnd5e ${game.system.version})`);
  console.log("Resource Bridge | API: ResourceBridge.resolve() / setCharges() / deductCharges() / incrementResource() / modifyItemUses()");
});
