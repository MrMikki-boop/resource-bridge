import { resolveItem } from "./item-resolver.mjs";

// ── GM-side: установить заряды предмета ────────────────────────────────────

export async function gmSetCharges(actorId, itemId, _activityId, newValue) {
  const actor = game.actors.get(actorId);
  if (!actor) throw new Error(`Resource Bridge: Actor ${actorId} not found`);

  const resolved = resolveItem(actor, itemId);
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

// ── GM-side: вычесть заряды предмета ───────────────────────────────────────

export async function gmDeductCharges(actorId, itemId, amount) {
  const actor = game.actors.get(actorId);
  if (!actor) throw new Error(`Resource Bridge: Actor ${actorId} not found`);

  const resolved = resolveItem(actor, itemId);
  if (!resolved) throw new Error(`Resource Bridge: Item "${itemId}" not found on ${actor.name}`);

  const newValue = Math.max(0, resolved.charges - amount);
  return gmSetCharges(actorId, itemId, null, newValue);
}

// ── GM-side: инкремент ресурса актора ──────────────────────────────────────

export async function gmIncrementResource(actorId, resourceKey, delta) {
  const actor = game.actors.get(actorId);
  if (!actor) throw new Error(`Resource Bridge: Actor ${actorId} not found`);

  const resource = actor.system.resources?.[resourceKey];
  if (!resource) throw new Error(`Resource Bridge: Resource "${resourceKey}" not found on ${actor.name}`);

  const max = Number(resource.max ?? 0);
  const current = Number(resource.value ?? 0);
  const newValue = max > 0 ? Math.min(current + delta, max) : current + delta;

  await actor.update({ [`system.resources.${resourceKey}.value`]: newValue });
  console.log(`Resource Bridge | incrementResource "${actor.name}".${resourceKey}: ${current} → ${newValue}`);
  return newValue;
}

// ── GM-side: изменить uses предмета (spent или value) ──────────────────────

export async function gmModifyItemUses(actorId, itemIdOrName, delta, useMode = "spent") {
  const actor = game.actors.get(actorId);
  if (!actor) throw new Error(`Resource Bridge: Actor ${actorId} not found`);

  const resolved = resolveItem(actor, itemIdOrName);
  if (!resolved) throw new Error(`Resource Bridge: Item "${itemIdOrName}" not found on ${actor.name}`);

  const { item, activity, mode } = resolved;

  if (mode === "activity" && activity) {
    const max = Number(activity.uses.max ?? 0);
    const curSpent = Number(activity.uses.spent ?? 0);
    const curValue = Number(activity.uses.value ?? 0);

    if (useMode === "spent") {
      const newSpent = Math.max(0, Math.min(curSpent + delta, max));
      if (typeof activity.update === "function") {
        await activity.update({ "uses.spent": newSpent });
      } else {
        await item.update({ [`system.activities.${activity.id}.uses.spent`]: newSpent });
      }
      console.log(`Resource Bridge | modifyItemUses "${item.name}" activity spent: ${curSpent} → ${newSpent}`);
      return max - newSpent;
    } else {
      const newValue = Math.max(0, Math.min(curValue + delta, max));
      if (typeof activity.update === "function") {
        await activity.update({ "uses.value": newValue });
      } else {
        await item.update({ [`system.activities.${activity.id}.uses.value`]: newValue });
      }
      console.log(`Resource Bridge | modifyItemUses "${item.name}" activity value: ${curValue} → ${newValue}`);
      return newValue;
    }
  }

  if (mode === "item") {
    const max = Number(item.system.uses.max ?? 0);
    const curSpent = Number(item.system.uses.spent ?? 0);
    const curValue = Number(item.system.uses.value ?? 0);

    if (useMode === "spent") {
      const newSpent = Math.max(0, Math.min(curSpent + delta, max));
      await item.update({ "system.uses.spent": newSpent });
      console.log(`Resource Bridge | modifyItemUses "${item.name}" spent: ${curSpent} → ${newSpent}`);
      return max - newSpent;
    } else {
      const newSpent = Math.max(0, max - Math.min(curValue + delta, max));
      await item.update({ "system.uses.spent": newSpent });
      console.log(`Resource Bridge | modifyItemUses "${item.name}" value: ${curValue} → ${curValue + delta}`);
      return Math.min(curValue + delta, max);
    }
  }

  throw new Error(`Resource Bridge: Item "${item.name}" has no configured uses (mode=none)`);
}

// ── Регистрация всех обработчиков на сокете ────────────────────────────────

export function registerSocketHandlers(socket) {
  socket.register("setCharges", gmSetCharges);
  socket.register("deductCharges", gmDeductCharges);
  socket.register("incrementResource", gmIncrementResource);
  socket.register("modifyItemUses", gmModifyItemUses);
}
