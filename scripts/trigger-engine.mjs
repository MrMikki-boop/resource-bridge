import { MODULE_ID, TRIGGER_EVENTS, getTriggerEventLabels } from "./constants.mjs";
import { parseItemId } from "./actor-config/trigger-edit-app.mjs";

const _firedThisRound = new Map();
const _hpSnapshots    = new Map();
const _processing     = new Set();

export function initTriggerEngine() {
  if (!game.user.isGM) return;

  Hooks.on("combatRound", _onCombatAdvance);
  Hooks.on("combatTurn",  _onCombatAdvance);
  Hooks.on("preUpdateActor", _onPreUpdateActor);
  Hooks.on("updateActor",    _onUpdateActor);

  const hasMidi = game.modules.get("midi-qol")?.active;
  if (hasMidi) {
    Hooks.on("midi-qol.RollComplete", _onMidiRollComplete);
    console.log("Resource Bridge | Trigger Engine: MidiQOL mode");
  } else {
    Hooks.on("createChatMessage", _onCreateChatMessage);
    console.log("Resource Bridge | Trigger Engine: Vanilla mode");
  }

  Hooks.on("dnd5e.postUseActivity", _onPostUseActivity);
  console.log("Resource Bridge | Trigger Engine initialized (GM-only)");
}

function _getTriggers(actor) {
  return actor?.getFlag(MODULE_ID, "triggers") ?? [];
}

/** Возвращает массив событий триггера (поддержка старого формата event: string) */
function _getEvents(trigger) {
  if (Array.isArray(trigger.events)) return trigger.events;
  if (trigger.event) return [trigger.event];
  return [];
}

function _onCombatAdvance() {
  const currentRound = game.combat?.round ?? 0;
  for (const [key, round] of _firedThisRound) {
    if (round < currentRound) _firedThisRound.delete(key);
  }
}

function _onPreUpdateActor(actor, changes) {
  if (_processing.has(actor.id)) return;
  const newHp = foundry.utils.getProperty(changes, "system.attributes.hp.value");
  if (newHp === undefined) return;
  _hpSnapshots.set(actor.id, actor.system.attributes.hp.value);
}

function _onUpdateActor(actor) {
  if (_processing.has(actor.id)) return;
  const oldHp = _hpSnapshots.get(actor.id);
  if (oldHp === undefined) return;
  _hpSnapshots.delete(actor.id);

  const newHp = actor.system.attributes.hp.value;
  if (newHp < oldHp) {
    _processTriggersForActor(actor, TRIGGER_EVENTS.DAMAGE_TAKEN, {});
  }
  if (newHp <= 0 && oldHp > 0) {
    const attacker = game.combat?.combatant?.actor;
    if (attacker && attacker.id !== actor.id) {
      _processTriggersForActor(attacker, TRIGGER_EVENTS.REDUCE_TO_ZERO, { target: actor });
    }
  }
}

function _onPostUseActivity(activity) {
  const actor = activity?.item?.parent;
  if (!actor) return;
  _processTriggersForActor(actor, TRIGGER_EVENTS.ITEM_USED, { item: activity.item, activity });
}

function _onMidiRollComplete(workflow) {
  if (!workflow?.actor) return;
  const actor = workflow.actor;
  const item  = workflow.item ?? null;

  if (workflow.damageTotal > 0 && workflow.hitTargets?.size > 0) {
    const targets = Array.from(workflow.hitTargets).map(t => t.actor).filter(Boolean);
    _processTriggersForActor(actor, TRIGGER_EVENTS.DAMAGE_DEALT, { targets, item });
  }
  if (workflow.isCritical) {
    _processTriggersForActor(actor, TRIGGER_EVENTS.CRITICAL_HIT, { item });
  }
  if (workflow.hitTargets?.size > 0) {
    for (const token of workflow.hitTargets) {
      const targetActor = token.actor;
      if (targetActor?.system.attributes.hp.value <= 0) {
        _processTriggersForActor(actor, TRIGGER_EVENTS.REDUCE_TO_ZERO, { target: targetActor, item });
        break;
      }
    }
  }
}

function _onCreateChatMessage(message) {
  const flags = message.flags?.dnd5e;
  const rolls = message.rolls;
  if (!rolls?.length) return;

  const actor = game.actors.get(message.speaker?.actor);
  if (!actor) return;

  const itemId = flags?.use?.itemId ?? flags?.item?.id ?? null;
  const item   = itemId ? actor.items.get(itemId) : null;

  if (flags?.roll?.type === "attack") {
    const attackRoll = rolls[0];
    const isCrit = attackRoll?.isCritical
        ?? attackRoll?.dice?.[0]?.results?.some(r => r.result === 20 && r.active);
    if (isCrit) _processTriggersForActor(actor, TRIGGER_EVENTS.CRITICAL_HIT, { item });
  }
  if (flags?.roll?.type === "damage") {
    _processTriggersForActor(actor, TRIGGER_EVENTS.DAMAGE_DEALT, { targets: [], item });
  }
}

async function _processTriggersForActor(actor, event, context = {}) {
  const triggers = _getTriggers(actor);
  if (!triggers.length) return;

  for (const trigger of triggers) {
    if (!trigger.enabled) continue;

    // Проверяем вхождение события в массив events триггера
    const events = _getEvents(trigger);
    if (!events.includes(event)) continue;

    // Once per round
    if (trigger.oncePerRound && game.combat) {
      const round = game.combat.round ?? 0;
      const key   = `${actor.id}-${trigger.id}`;
      if (_firedThisRound.get(key) === round) {
        console.log(`Resource Bridge | "${trigger.name}" skipped (once-per-round)`);
        continue;
      }
      _firedThisRound.set(key, round);
    }

    // sourceItemFilter
    if (trigger.sourceItemFilter?.trim()) {
      const filter = trigger.sourceItemFilter.trim().toLowerCase();
      const item   = context.item ?? null;
      if (!item) continue;
      const matchesName = item.name.toLowerCase().includes(filter);
      const matchesId   = item.id === trigger.sourceItemFilter.trim();
      if (!matchesName && !matchesId) continue;
    }

    // Creature type exclusion
    if (trigger.excludeTypes?.length && context.targets?.length) {
      const allExcluded = context.targets.every(t => {
        const type = t?.system?.details?.type?.value;
        return type && trigger.excludeTypes.includes(type);
      });
      if (allExcluded) continue;
    }

    try {
      await _executeAction(actor, trigger);
      _notifyTrigger(actor, trigger, event);
    } catch (err) {
      console.error(`Resource Bridge | Trigger "${trigger.name}" failed:`, err);
    }
  }
}

async function _executeAction(actor, trigger) {
  _processing.add(actor.id);
  try {
    if (trigger.action === "increment-resource") {
      await _incrementResource(actor, trigger);
    } else if (trigger.action === "increment-item") {
      await _incrementItem(actor, trigger);
    }
  } finally {
    setTimeout(() => _processing.delete(actor.id), 200);
  }
}

async function _incrementResource(actor, trigger) {
  const key      = trigger.targetResource;
  const resource = actor.system.resources?.[key];
  if (!resource) return;
  const max     = Number(resource.max   ?? 0);
  const current = Number(resource.value ?? 0);
  if (max > 0 && current >= max) return;
  const newValue = max > 0 ? Math.min(current + trigger.delta, max) : current + trigger.delta;
  await actor.update({ [`system.resources.${key}.value`]: newValue });
  console.log(`Resource Bridge | ${actor.name} resource "${key}": ${current} → ${newValue}`);
}

async function _incrementItem(actor, trigger) {
  const rawId = trigger.targetItem ?? "";
  const item  = actor.items.get(rawId)
      ?? actor.items.find(i => i.name.toLowerCase().includes(rawId.toLowerCase()));

  if (!item) {
    console.warn(`Resource Bridge | Item "${rawId}" not found on ${actor.name}`);
    return;
  }

  const uses    = item.system.uses;
  if (!uses) return;
  const max     = Number(uses.max   ?? 0);
  const useMode = trigger.itemUseMode ?? "spent";

  if (useMode === "spent") {
    const curSpent = Number(uses.spent ?? 0);
    if (max > 0 && curSpent >= max) return;
    const newSpent = max > 0 ? Math.min(curSpent + trigger.delta, max) : curSpent + trigger.delta;
    await item.update({ "system.uses.spent": newSpent });
    console.log(`Resource Bridge | ${actor.name} "${item.name}" spent: ${curSpent} → ${newSpent}`);
  } else {
    const curSpent = Number(uses.spent ?? 0);
    if (curSpent <= 0) return;
    const newSpent = Math.max(0, curSpent - trigger.delta);
    await item.update({ "system.uses.spent": newSpent });
    console.log(`Resource Bridge | ${actor.name} "${item.name}" spent: ${curSpent} → ${newSpent} (value mode)`);
  }
}

function _notifyTrigger(actor, trigger, firedEvent) {
  const eventLabels = getTriggerEventLabels();
  const eventLabel  = eventLabels[firedEvent] ?? firedEvent;
  let targetDesc    = "";

  if (trigger.action === "increment-resource") {
    const res   = actor.system.resources?.[trigger.targetResource];
    const label = res?.label || trigger.targetResource;
    targetDesc  = `${label}: ${res?.value ?? "?"}/${res?.max ?? "?"}`;
  } else if (trigger.action === "increment-item") {
    const item = actor.items.get(trigger.targetItem)
        ?? actor.items.find(i => i.name.toLowerCase().includes((trigger.targetItem ?? "").toLowerCase()));
    if (item) {
      const uses  = item.system.uses;
      const value = uses ? (Number(uses.max ?? 0) - Number(uses.spent ?? 0)) : "?";
      targetDesc  = `${item.name}: ${value}/${uses?.max ?? "?"}`;
    }
  }

  ChatMessage.create({
    content: `<div style="font-family:var(--font-primary);padding:4px 0">
      <strong style="color:#c83000">⚡ ${trigger.name}</strong>
      <span style="color:#666;font-size:.85em"> — ${eventLabel}</span>
      <div style="margin-top:3px;font-size:.9em;color:#444">+${trigger.delta} → ${targetDesc}</div>
    </div>`,
    speaker: ChatMessage.getSpeaker({ actor }),
    whisper: game.users.filter(u => u.isGM || actor.testUserPermission(u, "OWNER")).map(u => u.id),
  });
}
