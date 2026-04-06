/**
 * Resource Bridge — модуль для обновления ресурсов (uses/charges)
 * на предметах и активностях через GM-сокет.
 *
 * Совместимость: Foundry v13, D&D 5e 3.x / 4.x (5.2.5)
 *
 * API для макросов:
 *   ResourceBridge.resolve(actor, itemIdOrName)      → { item, charges, mode, activity }
 *   await ResourceBridge.setCharges(actor, itemIdOrName, newValue)
 *   await ResourceBridge.deductCharges(actor, itemIdOrName, amount)
 */

const MODULE_ID = "resource-bridge";
let socket;

// ── Утилита: найти предмет и определить где у него заряды ──────────────────

function _resolveItem(actor, itemIdOrName) {
  const item = actor.items.get(itemIdOrName)
    ?? actor.items.find(i => i.name.toLowerCase().includes(itemIdOrName.toLowerCase()));

  if (!item) return null;

  // ── Activity-level uses (D&D 5e v3/v4/5.x) ──────────────────────────────
  // Активность считается "с зарядами" ТОЛЬКО если у неё непустой max.
  // Пустой max ("" или 0) означает что активность не управляет зарядами —
  // они могут быть на самом предмете.
  if (item.system.activities) {
    const activities = item.system.activities.contents
      ?? Array.from(item.system.activities.values?.() ?? []);

    const activity = activities.find(a => {
      if (!a?.uses) return false;
      const max = a.uses.max;
      // max должен быть непустой строкой или числом > 0
      return (typeof max === "string" && max.trim() !== "") || (typeof max === "number" && max > 0);
    });

    if (activity) {
      const charges = activity.uses.value ?? 0;
      console.log(`Resource Bridge | "${item.name}": mode=activity, charges=${charges}, max=${activity.uses.max}, id=${activity.id}`);
      return { item, activity, mode: "activity", charges };
    }
  }

  // ── Item-level uses ──────────────────────────────────────────────────────
  if (item.system.uses) {
    const uses = item.system.uses;
    const maxNum = Number(uses.max ?? 0);
    if (maxNum > 0) {
      const charges = uses.value ?? 0;
      console.log(`Resource Bridge | "${item.name}": mode=item, charges=${charges}, max=${uses.max}`);
      return { item, activity: null, mode: "item", charges };
    }
  }

  console.warn(
    `Resource Bridge | "${item.name}": mode=none — uses не обнаружены.`,
    "\nsystem.uses:", item.system.uses,
    "\nactivities:", item.system.activities?.contents?.length ?? 0
  );
  return { item, activity: null, mode: "none", charges: 0 };
}

// ── GM-side handlers ────────────────────────────────────────────────────────

async function _gmSetCharges(actorId, itemId, _activityId, newValue) {
  const actor = game.actors.get(actorId);
  if (!actor) throw new Error(`Resource Bridge: Actor ${actorId} not found`);

  const resolved = _resolveItem(actor, itemId);
  if (!resolved) throw new Error(`Resource Bridge: Item "${itemId}" not found on ${actor.name}`);

  const { item, activity, mode } = resolved;

  if (mode === "activity" && activity) {
    if (typeof activity.update === "function") {
      await activity.update({ "uses.value": newValue });
    } else {
      await item.update({ [`system.activities.${activity.id}.uses.value`]: newValue });
    }
  } else if (mode === "item") {
    const currentMax = Number(item.system.uses.max ?? 0);
    await item.update({ "system.uses.spent": currentMax - newValue });
  } else {
    throw new Error(`Resource Bridge: Item "${item.name}" has no configured uses (mode=none)`);
  }

  console.log(`Resource Bridge | setCharges "${item.name}" → ${newValue} (mode=${mode})`);
  return newValue;
}

async function _gmDeductCharges(actorId, itemId, amount) {
  const actor = game.actors.get(actorId);
  if (!actor) throw new Error(`Resource Bridge: Actor ${actorId} not found`);

  const resolved = _resolveItem(actor, itemId);
  if (!resolved) throw new Error(`Resource Bridge: Item "${itemId}" not found on ${actor.name}`);

  const newValue = Math.max(0, resolved.charges - amount);
  return _gmSetCharges(actorId, itemId, null, newValue);
}

// ── Public API ──────────────────────────────────────────────────────────────

class ResourceBridge {
  /**
   * Синхронно прочитать заряды предмета (локально, без сокета).
   * @param {Actor} actor
   * @param {string} itemIdOrName — id или подстрока имени
   * @returns {{ item, activity, mode, charges } | null}
   */
  static resolve(actor, itemIdOrName) {
    return _resolveItem(actor, itemIdOrName);
  }

  /**
   * Установить точное значение зарядов (через GM-сокет).
   * @param {Actor} actor — актор-владелец предмета
   * @param {string} itemIdOrName
   * @param {number} newValue
   */
  static async setCharges(actor, itemIdOrName, newValue) {
    return socket.executeAsGM("setCharges", actor.id, itemIdOrName, null, newValue);
  }

  /**
   * Вычесть заряды (через GM-сокет).
   * @param {Actor} actor — актор-владелец предмета
   * @param {string} itemIdOrName
   * @param {number} amount
   */
  static async deductCharges(actor, itemIdOrName, amount) {
    return socket.executeAsGM("deductCharges", actor.id, itemIdOrName, amount);
  }
}

// ── Init ────────────────────────────────────────────────────────────────────

Hooks.once("socketlib.ready", () => {
  socket = socketlib.registerModule(MODULE_ID);
  socket.register("setCharges",    _gmSetCharges);
  socket.register("deductCharges", _gmDeductCharges);
});

Hooks.once("ready", () => {
  globalThis.ResourceBridge = ResourceBridge;
  console.log(`Resource Bridge | Ready ✓ (dnd5e ${game.system.version})`);
  console.log("Resource Bridge | API: ResourceBridge.resolve() / setCharges() / deductCharges()");
});
