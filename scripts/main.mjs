/**
 * Resource Bridge — модуль для обновления ресурсов (uses/charges)
 * на предметах и активностях через GM-сокет.
 *
 * API для макросов:
 *   await ResourceBridge.updateItemUses(actorId, itemId, newValue)
 *   await ResourceBridge.updateActivityUses(actorId, itemId, activityId, newValue)
 *   await ResourceBridge.deductItemUses(actorId, itemId, amount)
 *   await ResourceBridge.deductActivityUses(actorId, itemId, activityId, amount)
 */

const MODULE_ID = "resource-bridge";
let socket;

// ── GM-side handlers ────────────────────────────────

async function _gmUpdateItemUses(actorId, itemId, newValue) {
  const actor = game.actors.get(actorId);
  if (!actor) throw new Error(`Resource Bridge: Actor ${actorId} not found`);
  const item = actor.items.get(itemId);
  if (!item) throw new Error(`Resource Bridge: Item ${itemId} not found on actor ${actor.name}`);
  await item.update({ "system.uses.value": newValue });
  return newValue;
}

async function _gmUpdateActivityUses(actorId, itemId, activityId, newValue) {
  const actor = game.actors.get(actorId);
  if (!actor) throw new Error(`Resource Bridge: Actor ${actorId} not found`);
  const item = actor.items.get(itemId);
  if (!item) throw new Error(`Resource Bridge: Item ${itemId} not found on actor ${actor.name}`);

  // D&D 5e v3/v4: активности хранятся в item.system.activities
  if (!item.system.activities) {
    throw new Error(`Resource Bridge: Item ${item.name} has no activities`);
  }

  // Пробуем найти активность и вызвать её update
  const activities = item.system.activities.contents
    ?? Array.from(item.system.activities.values?.() ?? []);
  const activity = activities.find(a => a.id === activityId)
    ?? item.system.activities.get?.(activityId);

  if (activity && typeof activity.update === "function") {
    await activity.update({ "uses.value": newValue });
  } else {
    // Фоллбэк: прямое обновление через путь
    await item.update({ [`system.activities.${activityId}.uses.value`]: newValue });
  }
  return newValue;
}

async function _gmDeductItemUses(actorId, itemId, amount) {
  const actor = game.actors.get(actorId);
  if (!actor) throw new Error(`Resource Bridge: Actor ${actorId} not found`);
  const item = actor.items.get(itemId);
  if (!item) throw new Error(`Resource Bridge: Item ${itemId} not found on actor ${actor.name}`);
  const current = item.system.uses?.value ?? 0;
  const newValue = Math.max(0, current - amount);
  await item.update({ "system.uses.value": newValue });
  return newValue;
}

async function _gmDeductActivityUses(actorId, itemId, activityId, amount) {
  const actor = game.actors.get(actorId);
  if (!actor) throw new Error(`Resource Bridge: Actor ${actorId} not found`);
  const item = actor.items.get(itemId);
  if (!item) throw new Error(`Resource Bridge: Item ${itemId} not found on actor ${actor.name}`);

  // Получаем текущее значение зарядов
  let current = 0;
  const activities = item.system.activities?.contents
    ?? Array.from(item.system.activities?.values?.() ?? []);
  const activity = activities.find(a => a.id === activityId)
    ?? item.system.activities?.get?.(activityId);

  if (activity) {
    current = activity.uses?.value ?? 0;
  }

  const newValue = Math.max(0, current - amount);
  return _gmUpdateActivityUses(actorId, itemId, activityId, newValue);
}

// ── Public API ──────────────────────────────────────

class ResourceBridge {
  /**
   * Установить значение uses на предмете
   * @param {string} actorId
   * @param {string} itemId
   * @param {number} newValue
   */
  static async updateItemUses(actorId, itemId, newValue) {
    return socket.executeAsGM("updateItemUses", actorId, itemId, newValue);
  }

  /**
   * Установить значение uses на активности предмета (D&D 5e v3/v4)
   * @param {string} actorId
   * @param {string} itemId
   * @param {string} activityId
   * @param {number} newValue
   */
  static async updateActivityUses(actorId, itemId, activityId, newValue) {
    return socket.executeAsGM("updateActivityUses", actorId, itemId, activityId, newValue);
  }

  /**
   * Вычесть amount из uses предмета
   * @param {string} actorId
   * @param {string} itemId
   * @param {number} amount
   */
  static async deductItemUses(actorId, itemId, amount) {
    return socket.executeAsGM("deductItemUses", actorId, itemId, amount);
  }

  /**
   * Вычесть amount из uses активности (D&D 5e v3/v4)
   * @param {string} actorId
   * @param {string} itemId
   * @param {string} activityId
   * @param {number} amount
   */
  static async deductActivityUses(actorId, itemId, activityId, amount) {
    return socket.executeAsGM("deductActivityUses", actorId, itemId, activityId, amount);
  }
}

// ── Init ────────────────────────────────────────────

Hooks.once("socketlib.ready", () => {
  socket = socketlib.registerModule(MODULE_ID);
  socket.register("updateItemUses", _gmUpdateItemUses);
  socket.register("updateActivityUses", _gmUpdateActivityUses);
  socket.register("deductItemUses", _gmDeductItemUses);
  socket.register("deductActivityUses", _gmDeductActivityUses);
});

Hooks.once("ready", () => {
  // Глобальный API — доступен из макросов как ResourceBridge.*
  globalThis.ResourceBridge = ResourceBridge;
  console.log("Resource Bridge | Ready — API: ResourceBridge.updateItemUses / deductItemUses / updateActivityUses / deductActivityUses");
});
