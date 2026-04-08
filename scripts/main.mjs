/**
 * Resource Bridge — модуль для Foundry VTT v13 / D&D 5e 5.2.5
 *
 * Функции:
 *   1. API для чтения/записи uses на предметах и активностях через GM-сокет.
 *   2. Универсальная система триггеров: per-actor настройка автоматических
 *      реакций на события боя (получил урон, нанёс урон, крит, снизил до 0 HP).
 *
 * Точка входа — этот файл подключается в module.json как esmodule.
 */

import { MODULE_ID } from "./constants.mjs";
import { ResourceBridge, setSocket } from "./api.mjs";
import { registerSocketHandlers } from "./socket-handlers.mjs";
import { initTriggerEngine } from "./trigger-engine.mjs";
import { injectConfigButton } from "./trigger-config.mjs";

let socket;

// ── socketlib ──────────────────────────────────────────────────────────────

Hooks.once("socketlib.ready", () => {
  socket = socketlib.registerModule(MODULE_ID);
  registerSocketHandlers(socket);
  setSocket(socket);
});

// ── Ready ──────────────────────────────────────────────────────────────────

Hooks.once("ready", () => {
  // Публикуем API глобально
  globalThis.ResourceBridge = ResourceBridge;

  // Запускаем движок триггеров (только на GM-клиенте)
  initTriggerEngine();

  // Добавляем кнопку конфигурации на листы акторов
  injectConfigButton();

  console.log(`Resource Bridge | Ready (dnd5e ${game.system.version})`);
  console.log("Resource Bridge | API: ResourceBridge.resolve() / setCharges() / deductCharges() / incrementResource() / modifyItemUses()");
});
