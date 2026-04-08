import { MODULE_ID, TRIGGER_EVENTS, TRIGGER_EVENT_LABELS } from "./constants.mjs";

// ── Состояние ──────────────────────────────────────────────────────────────

/** Map<"actorId-triggerId", roundNumber> — трекинг "1 раз за раунд" */
const _firedThisRound = new Map();

/** Map<actorId, oldHpValue> — снапшоты HP для отслеживания урона */
const _hpSnapshots = new Map();

/** Set<actorId> — защита от рекурсии при обновлении актора */
const _processing = new Set();

// ── Публичные методы ───────────────────────────────────────────────────────

/**
 * Инициализировать движок триггеров.
 * Вызывается один раз из main.mjs при `ready`.
 */
export function initTriggerEngine() {
  if (!game.user.isGM) return;

  // Хуки боя для отслеживания раундов
  Hooks.on("combatRound", _onCombatAdvance);
  Hooks.on("combatTurn", _onCombatAdvance);

  // ── Отслеживание HP (damage-taken + reduce-to-zero) ────────────────────
  Hooks.on("preUpdateActor", _onPreUpdateActor);
  Hooks.on("updateActor", _onUpdateActor);

  // ── MidiQOL (damage-dealt, critical-hit, reduce-to-zero от атакующего) ─
  const hasMidi = game.modules.get("midi-qol")?.active;
  if (hasMidi) {
    Hooks.on("midi-qol.RollComplete", _onMidiRollComplete);
    console.log("Resource Bridge | Trigger Engine: MidiQOL detected, using workflow hooks");
  } else {
    // Vanilla dnd5e: слушаем чат для критов и бросков урона
    Hooks.on("createChatMessage", _onCreateChatMessage);
    console.log("Resource Bridge | Trigger Engine: Vanilla mode (no MidiQOL)");
  }

  console.log("Resource Bridge | Trigger Engine initialized (GM-only)");
}

// ── Получение триггеров актора ─────────────────────────────────────────────

function _getTriggers(actor) {
  return actor?.getFlag(MODULE_ID, "triggers") ?? [];
}

// ── Обработчик боя ─────────────────────────────────────────────────────────

function _onCombatAdvance(_combat, _updateData, _opts) {
  // Очищаем устаревшие записи из прошлых раундов
  const currentRound = game.combat?.round ?? 0;
  for (const [key, round] of _firedThisRound) {
    if (round < currentRound) _firedThisRound.delete(key);
  }
}

// ── HP Tracking (damage-taken, reduce-to-zero на жертве) ───────────────────

function _onPreUpdateActor(actor, changes, _options, _userId) {
  if (_processing.has(actor.id)) return;

  // Проверяем, изменяется ли HP
  const newHp = foundry.utils.getProperty(changes, "system.attributes.hp.value");
  if (newHp === undefined) return;

  // Сохраняем текущее HP перед обновлением
  _hpSnapshots.set(actor.id, actor.system.attributes.hp.value);
}

function _onUpdateActor(actor, changes, _options, _userId) {
  if (_processing.has(actor.id)) return;

  const oldHp = _hpSnapshots.get(actor.id);
  if (oldHp === undefined) return;
  _hpSnapshots.delete(actor.id);

  const newHp = actor.system.attributes.hp.value;

  // ── damage-taken: HP уменьшилось ─────────────────────────────────────
  if (newHp < oldHp) {
    _processTriggersForActor(actor, TRIGGER_EVENTS.DAMAGE_TAKEN, {});
  }

  // ── reduce-to-zero: жертва упала до 0 HP ─────────────────────────────
  // Определяем атакующего по текущему ходу в бою
  if (newHp <= 0 && oldHp > 0) {
    const attacker = game.combat?.combatant?.actor;
    if (attacker && attacker.id !== actor.id) {
      _processTriggersForActor(attacker, TRIGGER_EVENTS.REDUCE_TO_ZERO, { target: actor });
    }
  }
}

// ── MidiQOL Workflow ───────────────────────────────────────────────────────

function _onMidiRollComplete(workflow) {
  if (!workflow?.actor) return;
  const actor = workflow.actor;

  // ── damage-dealt: нанёс урон хотя бы одной цели ─────────────────────
  if (workflow.damageTotal > 0 && workflow.hitTargets?.size > 0) {
    // Собираем цели для проверки типов существ
    const targets = Array.from(workflow.hitTargets).map(t => t.actor).filter(Boolean);
    _processTriggersForActor(actor, TRIGGER_EVENTS.DAMAGE_DEALT, { targets });
  }

  // ── critical-hit ─────────────────────────────────────────────────────
  if (workflow.isCritical) {
    _processTriggersForActor(actor, TRIGGER_EVENTS.CRITICAL_HIT, {});
  }

  // ── reduce-to-zero: проверяем цели, которые упали до 0 HP ───────────
  if (workflow.hitTargets?.size > 0) {
    for (const targetToken of workflow.hitTargets) {
      const targetActor = targetToken.actor;
      if (targetActor && targetActor.system.attributes.hp.value <= 0) {
        _processTriggersForActor(actor, TRIGGER_EVENTS.REDUCE_TO_ZERO, { target: targetActor });
        break; // одно событие за атаку
      }
    }
  }
}

// ── Vanilla dnd5e: крит-детекция через чат ─────────────────────────────────

function _onCreateChatMessage(message, _options, _userId) {
  // Проверяем, является ли это атакой с критом
  const rolls = message.rolls;
  if (!rolls?.length) return;

  // Ищем бросок атаки
  const flags = message.flags?.dnd5e;
  const isAttack = flags?.roll?.type === "attack";
  if (!isAttack) return;

  // Находим актора-спикера
  const speaker = message.speaker;
  const actor = game.actors.get(speaker?.actor);
  if (!actor) return;

  // Проверяем крит (d20 = 20 или isCritical)
  const attackRoll = rolls[0];
  const isCrit = attackRoll?.isCritical
    ?? attackRoll?.dice?.[0]?.results?.some(r => r.result === 20 && r.active);

  if (isCrit) {
    _processTriggersForActor(actor, TRIGGER_EVENTS.CRITICAL_HIT, {});
  }

  // Vanilla: damage-dealt приблизительно — бросок урона от этого актора
  if (flags?.roll?.type === "damage") {
    _processTriggersForActor(actor, TRIGGER_EVENTS.DAMAGE_DEALT, { targets: [] });
  }
}

// ── Ядро: обработка триггеров ──────────────────────────────────────────────

async function _processTriggersForActor(actor, event, context = {}) {
  const triggers = _getTriggers(actor);
  if (!triggers.length) return;

  for (const trigger of triggers) {
    if (!trigger.enabled || trigger.event !== event) continue;

    // ── Once per round ──────────────────────────────────────────────────
    if (trigger.oncePerRound && game.combat) {
      const round = game.combat.round ?? 0;
      const key = `${actor.id}-${trigger.id}`;
      if (_firedThisRound.get(key) === round) {
        console.log(`Resource Bridge | Trigger "${trigger.name}" skipped (once per round, round=${round})`);
        continue;
      }
      _firedThisRound.set(key, round);
    }

    // ── Фильтр типов существ (для damage-dealt) ────────────────────────
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

    // ── Выполнение действия ─────────────────────────────────────────────
    try {
      await _executeAction(actor, trigger);
      _notifyTrigger(actor, trigger);
    } catch (err) {
      console.error(`Resource Bridge | Trigger "${trigger.name}" failed:`, err);
    }
  }
}

// ── Выполнение действия триггера ───────────────────────────────────────────

async function _executeAction(actor, trigger) {
  _processing.add(actor.id);
  try {
    if (trigger.action === "increment-resource") {
      await _incrementResource(actor, trigger);
    } else if (trigger.action === "increment-item") {
      await _incrementItem(actor, trigger);
    }
  } finally {
    // Небольшая задержка перед снятием блокировки, чтобы updateActor успел пройти
    setTimeout(() => _processing.delete(actor.id), 200);
  }
}

async function _incrementResource(actor, trigger) {
  const key = trigger.targetResource;
  const resource = actor.system.resources?.[key];
  if (!resource) {
    console.warn(`Resource Bridge | Resource "${key}" not found on ${actor.name}`);
    return;
  }

  const max = Number(resource.max ?? 0);
  const current = Number(resource.value ?? 0);

  if (max > 0 && current >= max) {
    console.log(`Resource Bridge | Resource "${key}" already at max (${current}/${max})`);
    return;
  }

  const newValue = max > 0 ? Math.min(current + trigger.delta, max) : current + trigger.delta;
  await actor.update({ [`system.resources.${key}.value`]: newValue });
  console.log(`Resource Bridge | ${actor.name} resource "${key}": ${current} → ${newValue}`);
}

async function _incrementItem(actor, trigger) {
  const itemSearch = trigger.targetItem;
  const item = actor.items.get(itemSearch)
    ?? actor.items.find(i => i.name.toLowerCase().includes(itemSearch.toLowerCase()));

  if (!item) {
    console.warn(`Resource Bridge | Item "${itemSearch}" not found on ${actor.name}`);
    return;
  }

  const uses = item.system.uses;
  if (!uses) {
    console.warn(`Resource Bridge | Item "${item.name}" has no uses`);
    return;
  }

  const max = Number(uses.max ?? 0);
  const useMode = trigger.itemUseMode ?? "spent";

  if (useMode === "spent") {
    const curSpent = Number(uses.spent ?? 0);
    if (max > 0 && curSpent >= max) {
      console.log(`Resource Bridge | Item "${item.name}" spent already at max (${curSpent}/${max})`);
      return;
    }
    const newSpent = max > 0 ? Math.min(curSpent + trigger.delta, max) : curSpent + trigger.delta;
    await item.update({ "system.uses.spent": newSpent });
    console.log(`Resource Bridge | ${actor.name} item "${item.name}" spent: ${curSpent} → ${newSpent}`);
  } else {
    // value mode: увеличиваем оставшиеся (уменьшаем spent)
    const curSpent = Number(uses.spent ?? 0);
    const newSpent = Math.max(0, curSpent - trigger.delta);
    await item.update({ "system.uses.spent": newSpent });
    console.log(`Resource Bridge | ${actor.name} item "${item.name}" spent: ${curSpent} → ${newSpent} (value mode)`);
  }
}

// ── Уведомление в чат ──────────────────────────────────────────────────────

function _notifyTrigger(actor, trigger) {
  const eventLabel = TRIGGER_EVENT_LABELS[trigger.event] ?? trigger.event;
  let targetDesc = "";

  if (trigger.action === "increment-resource") {
    const res = actor.system.resources?.[trigger.targetResource];
    const label = res?.label || trigger.targetResource;
    targetDesc = `${label}: ${res?.value ?? "?"}/${res?.max ?? "?"}`;
  } else if (trigger.action === "increment-item") {
    const item = actor.items.find(i => i.name.toLowerCase().includes(trigger.targetItem?.toLowerCase?.()))
      ?? actor.items.get(trigger.targetItem);
    if (item) {
      const uses = item.system.uses;
      targetDesc = `${item.name}: ${uses?.spent ?? 0}/${uses?.max ?? "?"}`;
    }
  }

  ChatMessage.create({
    content: `<div style="font-family:var(--font-primary);padding:4px 0">
      <strong style="color:#c83000">⚡ ${trigger.name}</strong>
      <span style="color:#666;font-size:0.85em"> — ${eventLabel}</span>
      <div style="margin-top:3px;font-size:0.9em;color:#444">
        +${trigger.delta} → ${targetDesc}
      </div>
    </div>`,
    speaker: ChatMessage.getSpeaker({ actor }),
    whisper: game.users.filter(u => u.isGM || actor.testUserPermission(u, "OWNER")).map(u => u.id),
  });
}
