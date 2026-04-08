import { MODULE_ID, TRIGGER_EVENTS, getTriggerEventLabels } from "./constants.mjs";

// ── Состояние ──────────────────────────────────────────────────────────────

/** Map<"actorId-triggerId", roundNumber> — трекинг "1 раз за раунд" */
const _firedThisRound = new Map();

/** Map<actorId, oldHpValue> — снапшоты HP для отслеживания урона */
const _hpSnapshots = new Map();

/** Set<actorId> — защита от рекурсии при обновлении актора */
const _processing = new Set();

// ── Публичные методы ───────────────────────────────────────────────────────

export function initTriggerEngine() {
  if (!game.user.isGM) return;

  // Очистка трекинга раундов
  Hooks.on("combatRound", _onCombatAdvance);
  Hooks.on("combatTurn",  _onCombatAdvance);

  // HP tracking (damage-taken, reduce-to-zero на жертве)
  Hooks.on("preUpdateActor", _onPreUpdateActor);
  Hooks.on("updateActor",    _onUpdateActor);

  const hasMidi = game.modules.get("midi-qol")?.active;

  if (hasMidi) {
    // ── MidiQOL mode ──────────────────────────────────────────────────────
    Hooks.on("midi-qol.RollComplete", _onMidiRollComplete);
    console.log("Resource Bridge | Trigger Engine: MidiQOL detected");
  } else {
    // ── Vanilla dnd5e ─────────────────────────────────────────────────────
    // Catches damage-dealt (damage roll chat cards) and critical-hit
    Hooks.on("createChatMessage", _onCreateChatMessage);
    console.log("Resource Bridge | Trigger Engine: Vanilla mode (no MidiQOL)");
  }

  // ── item-used: works in both vanilla and MidiQOL ──────────────────────
  // dnd5e v3+ hook: fires after any activity (weapon attack, spell, etc.) is used.
  // In MidiQOL mode this still fires; we use it only for item-used triggers so
  // there's no conflict with damage-dealt/critical-hit which MidiQOL handles.
  Hooks.on("dnd5e.postUseActivity", _onPostUseActivity);

  console.log("Resource Bridge | Trigger Engine initialized (GM-only)");
}

// ── Получение триггеров ────────────────────────────────────────────────────

function _getTriggers(actor) {
  return actor?.getFlag(MODULE_ID, "triggers") ?? [];
}

// ── Combat advance: очищаем устаревшие once-per-round записи ───────────────

function _onCombatAdvance(_combat, _data, _opts) {
  const currentRound = game.combat?.round ?? 0;
  for (const [key, round] of _firedThisRound) {
    if (round < currentRound) _firedThisRound.delete(key);
  }
}

// ── HP tracking ───────────────────────────────────────────────────────────

function _onPreUpdateActor(actor, changes) {
  if (_processing.has(actor.id)) return;
  const newHp = foundry.utils.getProperty(changes, "system.attributes.hp.value");
  if (newHp === undefined) return;
  _hpSnapshots.set(actor.id, actor.system.attributes.hp.value);
}

function _onUpdateActor(actor, changes) {
  if (_processing.has(actor.id)) return;
  const oldHp = _hpSnapshots.get(actor.id);
  if (oldHp === undefined) return;
  _hpSnapshots.delete(actor.id);

  const newHp = actor.system.attributes.hp.value;

  // damage-taken
  if (newHp < oldHp) {
    _processTriggersForActor(actor, TRIGGER_EVENTS.DAMAGE_TAKEN, {});
  }

  // reduce-to-zero (attacker gets credit)
  if (newHp <= 0 && oldHp > 0) {
    const attacker = game.combat?.combatant?.actor;
    if (attacker && attacker.id !== actor.id) {
      _processTriggersForActor(attacker, TRIGGER_EVENTS.REDUCE_TO_ZERO, { target: actor });
    }
  }
}

// ── item-used: vanilla + MidiQOL ─────────────────────────────────────────

function _onPostUseActivity(activity) {
  const actor = activity?.item?.parent;
  if (!actor) return;
  // Pass the source item so sourceItemFilter can be evaluated
  _processTriggersForActor(actor, TRIGGER_EVENTS.ITEM_USED, { item: activity.item, activity });
}

// ── MidiQOL RollComplete ──────────────────────────────────────────────────

function _onMidiRollComplete(workflow) {
  if (!workflow?.actor) return;
  const actor = workflow.actor;
  const item  = workflow.item ?? null;

  // damage-dealt
  if (workflow.damageTotal > 0 && workflow.hitTargets?.size > 0) {
    const targets = Array.from(workflow.hitTargets).map(t => t.actor).filter(Boolean);
    _processTriggersForActor(actor, TRIGGER_EVENTS.DAMAGE_DEALT, { targets, item });
  }

  // critical-hit
  if (workflow.isCritical) {
    _processTriggersForActor(actor, TRIGGER_EVENTS.CRITICAL_HIT, { item });
  }

  // reduce-to-zero (from attacker perspective)
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

// ── Vanilla createChatMessage (damage-dealt + critical-hit) ───────────────

function _onCreateChatMessage(message) {
  const flags  = message.flags?.dnd5e;
  const rolls  = message.rolls;
  if (!rolls?.length) return;

  const speaker = message.speaker;
  const actor   = game.actors.get(speaker?.actor);
  if (!actor) return;

  // Attempt to find the item that produced this message
  const itemId = flags?.use?.itemId ?? flags?.item?.id ?? null;
  const item   = itemId ? actor.items.get(itemId) : null;

  const rollType = flags?.roll?.type;

  // critical-hit detection via attack roll
  if (rollType === "attack") {
    const attackRoll = rolls[0];
    const isCrit = attackRoll?.isCritical
        ?? attackRoll?.dice?.[0]?.results?.some(r => r.result === 20 && r.active);
    if (isCrit) {
      _processTriggersForActor(actor, TRIGGER_EVENTS.CRITICAL_HIT, { item });
    }
  }

  // damage-dealt — a damage roll was made (best approximation in vanilla)
  if (rollType === "damage") {
    _processTriggersForActor(actor, TRIGGER_EVENTS.DAMAGE_DEALT, { targets: [], item });
  }
}

// ── Core: evaluate triggers ────────────────────────────────────────────────

async function _processTriggersForActor(actor, event, context = {}) {
  const triggers = _getTriggers(actor);
  if (!triggers.length) return;

  for (const trigger of triggers) {
    if (!trigger.enabled || trigger.event !== event) continue;

    // once-per-round guard
    if (trigger.oncePerRound && game.combat) {
      const round = game.combat.round ?? 0;
      const key   = `${actor.id}-${trigger.id}`;
      if (_firedThisRound.get(key) === round) {
        console.log(`Resource Bridge | Trigger "${trigger.name}" skipped (once-per-round, round=${round})`);
        continue;
      }
      _firedThisRound.set(key, round);
    }

    // sourceItemFilter — restrict trigger to a specific source item
    if (trigger.sourceItemFilter?.trim()) {
      const filter = trigger.sourceItemFilter.trim().toLowerCase();
      const item   = context.item ?? null;
      if (!item) continue; // no item in context → can't match filter
      const matchesName = item.name.toLowerCase().includes(filter);
      const matchesId   = item.id === trigger.sourceItemFilter.trim();
      if (!matchesName && !matchesId) {
        console.log(`Resource Bridge | Trigger "${trigger.name}" skipped (sourceItemFilter="${trigger.sourceItemFilter}" ≠ "${item.name}")`);
        continue;
      }
    }

    // creature-type exclusion (damage-dealt / item-used)
    if (trigger.excludeTypes?.length && context.targets?.length) {
      const allExcluded = context.targets.every(t => {
        const type = t?.system?.details?.type?.value;
        return type && trigger.excludeTypes.includes(type);
      });
      if (allExcluded) {
        console.log(`Resource Bridge | Trigger "${trigger.name}" skipped (excluded creature types)`);
        continue;
      }
    }

    try {
      await _executeAction(actor, trigger);
      _notifyTrigger(actor, trigger);
    } catch (err) {
      console.error(`Resource Bridge | Trigger "${trigger.name}" failed:`, err);
    }
  }
}

// ── Execute action ────────────────────────────────────────────────────────

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
  if (!resource) {
    console.warn(`Resource Bridge | Resource "${key}" not found on ${actor.name}`);
    return;
  }
  const max     = Number(resource.max   ?? 0);
  const current = Number(resource.value ?? 0);
  if (max > 0 && current >= max) {
    console.log(`Resource Bridge | Resource "${key}" already at max`);
    return;
  }
  const newValue = max > 0 ? Math.min(current + trigger.delta, max) : current + trigger.delta;
  await actor.update({ [`system.resources.${key}.value`]: newValue });
  console.log(`Resource Bridge | ${actor.name} resource "${key}": ${current} → ${newValue}`);
}

async function _incrementItem(actor, trigger) {
  const item = actor.items.get(trigger.targetItem)
      ?? actor.items.find(i => i.name.toLowerCase().includes(trigger.targetItem?.toLowerCase?.() ?? ""));

  if (!item) {
    console.warn(`Resource Bridge | Item "${trigger.targetItem}" not found on ${actor.name}`);
    return;
  }

  const uses = item.system.uses;
  if (!uses) {
    console.warn(`Resource Bridge | Item "${item.name}" has no uses`);
    return;
  }

  const max      = Number(uses.max   ?? 0);
  const useMode  = trigger.itemUseMode ?? "spent";

  if (useMode === "spent") {
    // +spent: накапливаем (Очки Гнева: 0→1→2…)
    const curSpent = Number(uses.spent ?? 0);
    if (max > 0 && curSpent >= max) {
      console.log(`Resource Bridge | Item "${item.name}" spent already at max`);
      return;
    }
    if (curSpent <= 0) {
      console.log(`Resource Bridge | Item "${item.name}" spent already at 0 (value at max)`);
      return;
    }
    const newSpent = max > 0 ? Math.min(curSpent + trigger.delta, max) : curSpent + trigger.delta;
    await item.update({ "system.uses.spent": newSpent });
    console.log(`Resource Bridge | ${actor.name} "${item.name}" spent: ${curSpent} → ${newSpent}`);
  } else {
    // +value = −spent: убываем (Очки Бешенства: spent=4→3→2…)
    const curSpent = Number(uses.spent ?? 0);
    if (curSpent <= 0) {
      console.log(`Resource Bridge | Item "${item.name}" spent already at 0 (value at max)`);
      return;
    }
    const newSpent = Math.max(0, curSpent - trigger.delta);
    await item.update({ "system.uses.spent": newSpent });
    console.log(`Resource Bridge | ${actor.name} "${item.name}" spent: ${curSpent} → ${newSpent} (value mode)`);
  }
}

// ── Chat notification ─────────────────────────────────────────────────────

function _notifyTrigger(actor, trigger) {
  const eventLabel = getTriggerEventLabels()[trigger.event] ?? trigger.event;
  let targetDesc   = "";

  if (trigger.action === "increment-resource") {
    const res   = actor.system.resources?.[trigger.targetResource];
    const label = res?.label || trigger.targetResource;
    targetDesc  = `${label}: ${res?.value ?? "?"}/${res?.max ?? "?"}`;
  } else if (trigger.action === "increment-item") {
    const item = actor.items.find(i =>
        i.name.toLowerCase().includes(trigger.targetItem?.toLowerCase?.() ?? "")
    ) ?? actor.items.get(trigger.targetItem);
    if (item) {
      const uses = item.system.uses;
      // Show value (= max − spent) so the player sees remaining, not consumed
      const value = uses ? (Number(uses.max ?? 0) - Number(uses.spent ?? 0)) : "?";
      targetDesc  = `${item.name}: ${value}/${uses?.max ?? "?"}`;
    }
  }

  ChatMessage.create({
    content: `
      <div style="font-family:var(--font-primary);padding:4px 0">
        <strong style="color:#c83000">⚡ ${trigger.name}</strong>
        <span style="color:#666;font-size:.85em"> — ${eventLabel}</span>
        <div style="margin-top:3px;font-size:.9em;color:#444">
          +${trigger.delta} → ${targetDesc}
        </div>
      </div>`,
    speaker: ChatMessage.getSpeaker({ actor }),
    whisper: game.users
        .filter(u => u.isGM || actor.testUserPermission(u, "OWNER"))
        .map(u => u.id),
  });
}
