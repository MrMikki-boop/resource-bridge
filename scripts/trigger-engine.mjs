import { MODULE_ID, TRIGGER_EVENTS, getTriggerEventLabels } from "./constants.mjs";
import { parseItemId } from "./actor-config/trigger-edit-app.mjs";

const _firedThisRound = new Map();
const _hpSnapshots    = new Map();
const _processing     = new Set();

/**
 * Дедупликация reduce-to-zero: Set<"attackerId::targetId">.
 * DamageOnlyWorkflow от Cascade/Порчи стреляет отдельным RollComplete —
 * без этого триггер срабатывает дважды за один удар.
 */
const _reducedToZeroRecently = new Set();

/**
 * Очередь записей per-item — ключ "actorId::itemId".
 * Предотвращает race condition когда два триггера срабатывают одновременно
 * (крит + снизил до 0), оба читают одно значение spent и оба пишут +1 вместо +2.
 */
const _writeQueues = new Map();

function _enqueueItemWrite(actor, itemId, fn) {
    const key  = `${actor.id}::${itemId}`;
    const prev = _writeQueues.get(key) ?? Promise.resolve();
    const next = prev.then(fn).catch(err =>
        console.error(`Resource Bridge | queue error for ${key}:`, err)
    );
    _writeQueues.set(key, next);
    // Чистим запись после завершения, чтобы Map не рос бесконечно
    next.finally(() => {
        if (_writeQueues.get(key) === next) _writeQueues.delete(key);
    });
    return next;
}

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

    // damageList содержит oldHP/newHP для каждой цели — надёжнее hitTargets
    const damageList = workflow.damageList ?? [];

    // damage-dealt: нанёс хоть какой-то урон хоть одной цели
    const dealtDamage = damageList.some(d => (d.hpDamage ?? 0) > 0 || (d.totalDamage ?? 0) > 0);
    if (dealtDamage) {
        // Собираем акторов целей для фильтра excludeTypes
        const targets = damageList
            .map(d => d.actorId ? game.actors.get(d.actorId) : null)
            .filter(Boolean);
        _processTriggersForActor(actor, TRIGGER_EVENTS.DAMAGE_DEALT, { targets, item });
    }

    // critical-hit
    if (workflow.isCritical) {
        _processTriggersForActor(actor, TRIGGER_EVENTS.CRITICAL_HIT, { item });
    }

    // reduce-to-zero: ищем цели у которых newHP === 0 и oldHP > 0
    // Дедупликация: DamageOnlyWorkflow (Cascade, Порча) стреляет отдельным RollComplete
    // на ту же цель, уже лежащую при 0 HP — проверяем по паре attacker::target
    for (const d of damageList) {
        if ((d.newHP ?? 1) <= 0 && (d.oldHP ?? 0) > 0) {
            const targetActor = d.actorId ? game.actors.get(d.actorId) : null;
            if (!targetActor) continue;

            const dedupKey = `${actor.id}::${targetActor.id}`;
            if (_reducedToZeroRecently.has(dedupKey)) {
                console.log(`Resource Bridge | reduce-to-zero dedup: ${actor.name} → ${targetActor.name} (already fired)`);
                continue;
            }
            _reducedToZeroRecently.add(dedupKey);
            setTimeout(() => _reducedToZeroRecently.delete(dedupKey), 2000);

            _processTriggersForActor(actor, TRIGGER_EVENTS.REDUCE_TO_ZERO, { target: targetActor, item });
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

    // Все записи в этот предмет идут через очередь — исключаем race condition
    return _enqueueItemWrite(actor, item.id, async () => {
        // Перечитываем актуальное значение ВНУТРИ очереди (после предыдущей записи)
        const freshItem = actor.items.get(item.id);
        if (!freshItem) return;
        const uses    = freshItem.system.uses;
        if (!uses) return;
        const max     = Number(uses.max   ?? 0);
        const useMode = trigger.itemUseMode ?? "spent";

        if (useMode === "spent") {
            const curSpent = Number(uses.spent ?? 0);
            if (max > 0 && curSpent >= max) return;
            const newSpent = max > 0 ? Math.min(curSpent + trigger.delta, max) : curSpent + trigger.delta;
            await freshItem.update({ "system.uses.spent": newSpent });
            console.log(`Resource Bridge | ${actor.name} "${freshItem.name}" spent: ${curSpent} → ${newSpent}`);
        } else {
            const curSpent = Number(uses.spent ?? 0);
            if (curSpent <= 0) return;
            const newSpent = Math.max(0, curSpent - trigger.delta);
            await freshItem.update({ "system.uses.spent": newSpent });
            console.log(`Resource Bridge | ${actor.name} "${freshItem.name}" spent: ${curSpent} → ${newSpent} (value mode)`);
        }
    });
}

function _notifyTrigger(actor, trigger, firedEvent) {
    const eventLabels = getTriggerEventLabels();
    const eventLabel  = eventLabels[firedEvent] ?? firedEvent;
    // Собираем данные о текущем состоянии цели
    let resourceName = "";
    let currentValue = "?";
    let maxValue     = "?";

    if (trigger.action === "increment-resource") {
        const res    = actor.system.resources?.[trigger.targetResource];
        resourceName = res?.label || trigger.targetResource;
        currentValue = res?.value ?? "?";
        maxValue     = res?.max   ?? "?";
    } else if (trigger.action === "increment-item") {
        const item = actor.items.get(trigger.targetItem)
            ?? actor.items.find(i => i.name.toLowerCase().includes((trigger.targetItem ?? "").toLowerCase()));
        if (item) {
            const uses   = item.system.uses;
            resourceName = item.name;
            maxValue     = uses?.max ?? "?";
            currentValue = uses ? (Number(uses.max ?? 0) - Number(uses.spent ?? 0)) : "?";
        }
    }

    // Иконка события
    const eventIcons = {
        "damage-taken":   "🩸",
        "damage-dealt":   "⚔️",
        "critical-hit":   "💥",
        "reduce-to-zero": "⚰️",
        "item-used":      "🎯",
    };
    const icon = eventIcons[firedEvent] ?? "⚡";

    const content = `
    <div style="
      font-family: 'Cinzel', Georgia, serif;
      background: linear-gradient(135deg, #1a0804 0%, #2a0a04 100%);
      border: 2px solid #c83000;
      border-radius: 8px;
      padding: 14px 16px;
      box-shadow: 0 0 20px rgba(200,48,0,0.4), inset 0 0 30px rgba(0,0,0,0.5);
      color: #ff8040;
      text-align: center;
    ">
      <div style="font-size:22px; margin-bottom:8px; filter:drop-shadow(0 0 8px rgba(255,80,0,0.8));">
        ${icon}
      </div>

      <div style="
        font-size: 15px;
        font-weight: 900;
        letter-spacing: 3px;
        text-transform: uppercase;
        color: #ff5a00;
        text-shadow: 0 0 12px rgba(255,90,0,0.8);
        margin-bottom: 6px;
      ">${trigger.name}</div>

      <div style="
        font-size: 12px;
        color: #c06030;
        font-style: italic;
        margin-bottom: 12px;
        line-height: 1.5;
      ">${eventLabel}</div>

      <div style="
        display: flex;
        justify-content: center;
        align-items: center;
        gap: 10px;
        padding: 10px 0;
        border-top: 1px solid rgba(139,32,0,0.4);
        border-bottom: 1px solid rgba(139,32,0,0.4);
        margin-bottom: 10px;
      ">
        <span style="color:#8b3a10; font-size:13px;">Получено:</span>
        <span style="
          font-size: 30px;
          font-weight: 900;
          color: #ff6030;
          text-shadow: 0 0 18px rgba(255,96,48,0.9);
          line-height: 1;
        ">+${trigger.delta}</span>
      </div>

      <div style="font-size:12px; color:#7a4020;">
        ${resourceName}:
        <span style="color:#ff8040; font-weight:700; font-size:15px;">${currentValue}</span>
        <span style="color:#5a3010;"> / ${maxValue}</span>
      </div>
    </div>
  `;

    ChatMessage.create({
        content,
        speaker: ChatMessage.getSpeaker({ actor }),
        whisper: game.users.filter(u => u.isGM || actor.testUserPermission(u, "OWNER")).map(u => u.id),
    });
}
