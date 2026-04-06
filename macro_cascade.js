// ═══════════════════════════════════════════════════
//  К А С К А Д   С Т И Х И Й  —  П Р Е Т О Р   Г Н Е В А
//  Использует модуль resource-bridge для снятия зарядов Порчи
// ═══════════════════════════════════════════════════

const token = workflow.token || canvas.tokens.controlled[0];
const actor = workflow.actor || token?.actor;
if (!actor || !token) {
    ui.notifications.warn("Cascade | Ошибка: Токен или Актёр не найден!");
    return;
}

const level  = Number(actor.system.details.level);
const wisMod = Number(actor.system.abilities.wis.mod);

// ── ТИПЫ УРОНА ──────────────────────────────────────
const damageTypes = {
    fire:      { label: "Огонь",   icon: "🔥", color: "#ff4500" },
    cold:      { label: "Холод",   icon: "❄️", color: "#4fc3f7" },
    acid:      { label: "Кислота", icon: "🧪", color: "#76ff03" },
    thunder:   { label: "Гром",    icon: "🔊", color: "#ffd740" },
    lightning: { label: "Молния",  icon: "⚡", color: "#e040fb" },
};

const diceCount   = level >= 15 ? 2 : 1;
const baseFormula = `${diceCount}d4`;

const lastDamageRoll = workflow.damageRoll;
if (!lastDamageRoll) return;

let triggers = 0;
for (const die of lastDamageRoll.dice) {
    for (const result of die.results) {
        if (result.result === die.faces) triggers++;
    }
}
triggers = Math.min(triggers, wisMod);

// ════════════════════════════════════════════════════
//  ПОИСК ПОРЧИ И ЕЁ ЗАРЯДОВ
// ════════════════════════════════════════════════════
const CORRUPTION_ID = "6GOFHZRGJkvvkqgT";

let cItem = actor.items.get(CORRUPTION_ID)
    || actor.items.find(i => i.name.toLowerCase().includes("порча"));

let cActivity    = null;
let cCharges     = 0;
let isLegacyUses = false;

if (cItem) {
    // D&D 5e v3/v4: ищем активность с зарядами
    if (cItem.system.activities) {
        const activities = cItem.system.activities.contents
            ?? Array.from(cItem.system.activities.values?.() ?? []);
        cActivity = activities.find(a => a.uses && (a.uses.max || a.uses.value !== undefined));
        if (cActivity) {
            cCharges = cActivity.uses.value ?? 0;
        }
    }
    // Старый формат: заряды на самом предмете
    if (!cActivity && cItem.system.uses && (cItem.system.uses.max || cItem.system.uses.value !== undefined)) {
        cCharges     = cItem.system.uses.value ?? 0;
        isLegacyUses = true;
    }
} else {
    console.warn("Cascade | Предмет 'Порча' не найден на актёре.");
}

const canUseCorruption = cItem && (cActivity || isLegacyUses);

// ════════════════════════════════════════════════════
//  С Т И Л И   И Н Т Е Р Ф Е Й С А
// ════════════════════════════════════════════════════
const wrathStyle = `
<style>
@import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@700;900&family=Crimson+Text:ital,wght@0,400;0,600;1,400&display=swap');

.wrath-app, .wrath-app.app, .wrath-app .window-app { background: transparent !important; border: none !important; box-shadow: none !important; }
.wrath-app .window-content { background: transparent !important; border: none !important; box-shadow: none !important; padding: 0 !important; overflow: visible !important; }
.wrath-app header.window-header { display: none !important; }
.wrath-app .dialog-buttons { display: none !important; }

.wrath-panel { position: relative; font-family: 'Crimson Text', Georgia, serif; background: radial-gradient(ellipse at 50% 0%, rgba(180,20,0,0.18) 0%, transparent 65%), linear-gradient(175deg, #1a0a04 0%, #100704 45%, #0d0604 100%); border: 1px solid #5a1a00; border-radius: 3px; overflow: hidden; color: #e8d5c0; box-shadow: 0 0 0 1px #8b2000, 0 0 0 3px #100704, 0 0 40px rgba(180,40,0,0.35), inset 0 0 60px rgba(0,0,0,0.6); }
.wrath-panel::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px; background: linear-gradient(90deg, transparent 0%, #c83000 20%, #ff5a00 50%, #c83000 80%, transparent 100%); box-shadow: 0 0 12px rgba(255,90,0,0.8); z-index: 2; }

.wrath-header { padding: 20px 20px 14px; text-align: center; position: relative; border-bottom: 1px solid rgba(139,32,0,0.4); }
.wrath-emblem { font-size: 28px; display: block; margin-bottom: 6px; filter: drop-shadow(0 0 10px rgba(255,80,0,0.9)); animation: pulse-ember 2.5s ease-in-out infinite; }
@keyframes pulse-ember { 0%, 100% { filter: drop-shadow(0 0 8px rgba(255,80,0,0.7)); } 50% { filter: drop-shadow(0 0 18px rgba(255,120,0,1)); } }
.wrath-title { font-family: 'Cinzel', Georgia, serif; font-size: 15px; font-weight: 900; letter-spacing: 4px; text-transform: uppercase; color: #ff5a00; text-shadow: 0 0 20px rgba(255,90,0,0.6), 0 1px 3px rgba(0,0,0,0.9); margin: 0; line-height: 1.2; }
.wrath-subtitle { font-family: 'Crimson Text', Georgia, serif; font-size: 12px; color: #7a4020; letter-spacing: 2px; font-style: italic; margin-top: 4px; }

.wrath-stats { display: flex; gap: 0; border-bottom: 1px solid rgba(139,32,0,0.3); }
.wrath-stat { flex: 1; padding: 12px 8px; text-align: center; border-right: 1px solid rgba(139,32,0,0.25); position: relative; }
.wrath-stat:last-child { border-right: none; }
.wrath-stat-value { font-family: 'Cinzel', serif; font-size: 22px; font-weight: 700; color: #ff5a00; text-shadow: 0 0 12px rgba(255,90,0,0.6); display: block; line-height: 1; }
.wrath-stat-label { font-size: 10px; letter-spacing: 1.5px; color: #6a3018; text-transform: uppercase; margin-top: 4px; display: block; }

.wrath-section { padding: 14px 18px; border-bottom: 1px solid rgba(139,32,0,0.2); }
.wrath-section:last-child { border-bottom: none; }
.wrath-section-title { font-family: 'Cinzel', serif; font-size: 10px; letter-spacing: 3px; text-transform: uppercase; color: #8b3a10; margin-bottom: 10px; display: flex; align-items: center; gap: 8px; }
.wrath-section-title::after { content: ''; flex: 1; height: 1px; background: linear-gradient(90deg, rgba(139,58,16,0.5), transparent); }

.wrath-select-wrap { position: relative; }
.wrath-select-display { display: flex; align-items: center; gap: 10px; padding: 10px 36px 10px 14px; background: linear-gradient(180deg, #1a0804, #100503); border: 1px solid #5a1a00; border-radius: 3px; color: #ff8040; font-family: 'Crimson Text', Georgia, serif; font-size: 16px; font-weight: 600; cursor: pointer; user-select: none; transition: border-color 0.2s, box-shadow 0.2s; position: relative; }
.wrath-select-display::after { content: ''; position: absolute; right: 12px; top: 50%; transform: translateY(-50%); width: 0; height: 0; border-left: 5px solid transparent; border-right: 5px solid transparent; border-top: 6px solid #c83000; }
.wrath-select-display.open { border-color: #c83000; border-bottom-left-radius: 0; border-bottom-right-radius: 0; }
.wrath-select-dropdown { display: none; position: absolute; left: 0; right: 0; background: #120604; border: 1px solid #c83000; border-top: none; border-bottom-left-radius: 3px; border-bottom-right-radius: 3px; z-index: 999; box-shadow: 0 8px 20px rgba(0,0,0,0.8); }
.wrath-select-dropdown.open { display: block; }
.wrath-select-option { display: flex; align-items: center; gap: 10px; padding: 9px 14px; color: #c06030; font-family: 'Crimson Text', Georgia, serif; font-size: 15px; font-weight: 600; cursor: pointer; border-bottom: 1px solid rgba(139,32,0,0.2); transition: background 0.15s, color 0.15s; }
.wrath-select-option:last-child { border-bottom: none; }
.wrath-select-option:hover { background: rgba(200,48,0,0.12); color: #ff6020; }
.wrath-select-option.chosen { background: rgba(200,48,0,0.08); color: #ff8040; }
.wrath-select-icon { font-size: 16px; width: 20px; text-align: center; }

.wrath-toggle-group { display: flex; gap: 8px; }
.wrath-toggle { flex: 1; padding: 9px 6px; background: rgba(0,0,0,0.4); border: 1px solid #3a1400; border-radius: 3px; color: #6a3018; font-family: 'Cinzel', serif; font-size: 10px; letter-spacing: 1px; text-transform: uppercase; cursor: pointer; transition: all 0.2s ease; text-align: center; user-select: none; }
.wrath-toggle:hover { border-color: #7a2000; color: #c06030; }
.wrath-toggle.active { background: rgba(200,48,0,0.15); border-color: #c83000; color: #ff6020; box-shadow: 0 0 10px rgba(200,48,0,0.25), inset 0 0 8px rgba(200,48,0,0.1); }
.wrath-toggle-icon { font-size: 14px; display: block; margin-bottom: 3px; }

.wrath-charge-dots { display: flex; gap: 8px; align-items: center; padding: 4px 0; }
.wrath-dot { width: 18px; height: 18px; border-radius: 50%; transition: all 0.25s cubic-bezier(0.34,1.56,0.64,1); cursor: pointer; position: relative; flex-shrink: 0; }
.wrath-dot.empty { background: rgba(20,0,30,0.6); border: 1.5px solid rgba(100,0,160,0.3); box-shadow: inset 0 0 4px rgba(0,0,0,0.5); }
.wrath-dot.available { background: radial-gradient(circle at 35% 35%, #6a00bb, #38006b); border: 1.5px solid #7a10cc; box-shadow: 0 0 5px rgba(120,0,200,0.4); }
.wrath-dot.selected { background: radial-gradient(circle at 35% 35%, #cc60ff, #8800ee); border: 1.5px solid #cc60ff; box-shadow: 0 0 12px rgba(180,60,255,1), 0 0 24px rgba(139,0,255,0.5); transform: scale(1.3); }
.wrath-dot.locked { background: rgba(10,0,15,0.4); border: 1.5px dashed rgba(60,0,80,0.3); cursor: default; opacity: 0.4; }

.wrath-apply-btn { display: flex; align-items: center; justify-content: center; gap: 10px; width: 100%; padding: 13px 20px; background: transparent; border: none; border-top: 1px solid rgba(139,32,0,0.3); cursor: pointer; font-family: 'Cinzel', serif; font-size: 12px; font-weight: 700; letter-spacing: 4px; text-transform: uppercase; color: #c06030; transition: all 0.2s ease; position: relative; }
.wrath-apply-btn::before { content: ''; position: absolute; bottom: 0; left: 20%; right: 20%; height: 1px; background: linear-gradient(90deg, transparent, #c83000, transparent); opacity: 0; transition: opacity 0.2s; }
.wrath-apply-btn:hover { background: rgba(200,48,0,0.08); color: #ff6a20; }
.wrath-apply-btn:hover::before { opacity: 1; }

.wrath-chat-title { font-family: 'Cinzel', serif; font-size: 12px; letter-spacing: 2px; text-transform: uppercase; color: #c83000; text-shadow: 0 0 8px rgba(200,48,0,0.5); margin-bottom: 6px; padding-bottom: 5px; border-bottom: 1px solid rgba(139,32,0,0.3); }
.wrath-chat-row { display: flex; justify-content: space-between; align-items: center; margin-top: 4px; font-size: 13px; color: #8a5030; }
.wrath-chat-val { color: #ff7040; font-weight: 600; font-size: 16px; text-shadow: 0 0 8px rgba(255,90,40,0.5); }
</style>
`;

const MAX_CORRUPTION_DOTS = 10;
const typeOptionsList = Object.entries(damageTypes).map(([k, v]) => ({ key: k, ...v }));
const defaultType = typeOptionsList[0];

const typeDropdownItems = typeOptionsList.map((t, i) =>
    `<div class="wrath-select-option ${i === 0 ? "chosen" : ""}" data-type="${t.key}">
       <span class="wrath-select-icon">${t.icon}</span>${t.label}
     </div>`
).join("");

let corruptionDotsHtml = "";
for (let i = 1; i <= MAX_CORRUPTION_DOTS; i++) {
    const cls = i <= cCharges ? "available" : (canUseCorruption ? "locked" : "empty");
    corruptionDotsHtml += `<div class="wrath-dot ${cls}" data-charge="${i}"></div>`;
}

const content = `
${wrathStyle}
<div class="wrath-panel">
  <div class="wrath-header">
    <span class="wrath-emblem">⚡</span>
    <div class="wrath-title">Претор Гнева</div>
    <div class="wrath-subtitle">Каскад Стихий</div>
  </div>

  <div class="wrath-stats">
    <div class="wrath-stat">
      <span class="wrath-stat-value" style="${triggers === 0 ? "color:#4a2010;text-shadow:none" : ""}">${triggers}</span>
      <span class="wrath-stat-label">${triggers === 0 ? "Каскад — нет" : "Каскадов"}</span>
    </div>
    <div class="wrath-stat">
      <span class="wrath-stat-value" style="${triggers === 0 ? "color:#4a2010;text-shadow:none" : ""}">${triggers === 0 ? "—" : baseFormula}</span>
      <span class="wrath-stat-label">Формула</span>
    </div>
    <div class="wrath-stat">
      <span class="wrath-stat-value">${wisMod}</span>
      <span class="wrath-stat-label">Лимит (Мудр.)</span>
    </div>
  </div>

  <div class="wrath-section">
    <div class="wrath-section-title">Тип стихии</div>
    <div class="wrath-select-wrap" id="type-select-wrap">
      <div class="wrath-select-display" id="type-display">
        <span id="type-display-icon">${defaultType.icon}</span>
        <span id="type-display-label">${defaultType.label}</span>
      </div>
      <div class="wrath-select-dropdown" id="type-dropdown">${typeDropdownItems}</div>
    </div>
    <input type="hidden" id="dmgType" value="${defaultType.key}">
  </div>

  <div class="wrath-section">
    <div class="wrath-section-title">Дикий атакующий</div>
    <div class="wrath-toggle-group">
      <div class="wrath-toggle active" id="wild-yes" data-val="yes"><span class="wrath-toggle-icon">⚔️</span>Применить</div>
      <div class="wrath-toggle" id="wild-no" data-val="no"><span class="wrath-toggle-icon">💨</span>Пропустить</div>
    </div>
    <div style="font-size:11px;color:#4a2010;font-style:italic;margin-top:8px;line-height:1.4">
      Бросок урона дважды — выбирается лучший результат.<br>Один раз за ход.
    </div>
  </div>

  <div class="wrath-section">
    <div class="wrath-section-title">Порча: некротический урон</div>
    <div style="font-size:12px;color:#6a3080;margin-bottom:12px;line-height:1.4">
      ${canUseCorruption
        ? `Доступно зарядов: <span style="color:#9040c0;font-family:'Cinzel',serif">${cCharges}</span> из ${MAX_CORRUPTION_DOTS}. Каждый заряд: +2d4 некрот.`
        : `<span style="color:#4a1a30">Предмет Порчи не найден — проверьте лист персонажа!</span>`
      }
    </div>
    <div class="wrath-charge-dots" id="charge-dots">${corruptionDotsHtml}</div>
    <div style="margin-top:10px;display:flex;justify-content:space-between;align-items:center">
      <span style="font-size:11px;color:#4a2060;letter-spacing:1.5px;text-transform:uppercase">Выбрано зарядов</span>
      <span id="charges-chosen" style="font-family:'Cinzel',serif;font-size:20px;color:#9040c0;text-shadow:0 0 10px rgba(139,0,255,0.6);transition:all 0.2s">0</span>
    </div>
  </div>

  <button class="wrath-apply-btn" id="wrath-apply">
    <span style="font-size:16px">🔥</span> П Р И М Е Н И Т Ь <span style="font-size:16px">🔥</span>
  </button>
</div>
`;

// ════════════════════════════════════════════════════
//  Д И А Л О Г О В О Е   О К Н О
// ════════════════════════════════════════════════════
const result = await new Promise(resolve => {
    const dlg = new Dialog({
        title: "",
        content,
        buttons: {},
        render: (html) => {
            const display    = html.find("#type-display");
            const dropdown   = html.find("#type-dropdown");
            const hiddenInput = html.find("#dmgType");

            display.click(ev => {
                ev.stopPropagation();
                dropdown.toggleClass("open");
                display.toggleClass("open");
            });

            html.find(".wrath-select-option").click(ev => {
                const el   = ev.currentTarget;
                const type = el.dataset.type;
                const info = damageTypes[type];
                html.find("#type-display-icon").text(info.icon);
                html.find("#type-display-label").text(info.label);
                hiddenInput.val(type);
                html.find(".wrath-select-option").removeClass("chosen");
                el.classList.add("chosen");
                dropdown.removeClass("open");
                display.removeClass("open");
            });

            html[0].addEventListener("click", () => {
                dropdown.removeClass("open");
                display.removeClass("open");
            });

            html.find(".wrath-toggle").click(ev => {
                html.find(".wrath-toggle").removeClass("active");
                ev.currentTarget.classList.add("active");
            });

            let selectedCharges = 0;
            function updateDots() {
                html.find(".wrath-dot").each((i, dot) => {
                    const idx = Number(dot.dataset.charge);
                    dot.className = "wrath-dot";
                    if (idx <= selectedCharges)      dot.classList.add("selected");
                    else if (idx <= cCharges)         dot.classList.add("available");
                    else                              dot.classList.add(canUseCorruption ? "locked" : "empty");
                });
                html.find("#charges-chosen").text(selectedCharges);
            }

            html.find(".wrath-dot").click(ev => {
                const dot = ev.currentTarget;
                if (dot.classList.contains("locked") || dot.classList.contains("empty")) return;
                const idx = Number(dot.dataset.charge);
                if (idx > cCharges) return;
                selectedCharges = (idx === selectedCharges) ? idx - 1 : idx;
                updateDots();
            });

            updateDots();

            let applied = false;
            html.find("#wrath-apply").click(() => {
                if (applied) return;
                applied = true;
                resolve({
                    dmgType:  hiddenInput.val(),
                    useWild:  html.find(".wrath-toggle.active").data("val") === "yes",
                    charges:  selectedCharges,
                });
                dlg.close();
            });
        },
        close: () => resolve(null),
    }, { classes: ["wrath-app"] });
    dlg.render(true);
});

if (!result) return;
const { dmgType, useWild, charges } = result;
const dmgInfo = damageTypes[dmgType];

// ════════════════════════════════════════════════════
//  Д И К И Й   А Т А К У Ю Щ И Й
// ════════════════════════════════════════════════════
if (useWild && workflow.damageRoll) {
    const originalTotal = workflow.damageRoll.total;
    const reroll = await new Roll(workflow.damageRoll.formula).evaluate({ async: true });

    if (reroll.total > originalTotal) {
        const bonus = reroll.total - originalTotal;
        await reroll.toMessage({
            flavor: `<div class="wrath-chat-title" style="color:#c83000">⚔️ Дикий атакующий — лучший результат</div>
                     <div style="font-size:11px;color:#5a2010;font-style:italic">Оригинал: ${originalTotal} → Реролл: ${reroll.total} ✓</div>`,
            rollMode: CONST.DICE_ROLL_MODES.PUBLIC,
            flags: { dnd5e: { roll: { type: "damage" } } },
        });
        await MidiQOL.applyTokenDamage(
            [{ damage: bonus, type: workflow.defaultDamageType ?? "bludgeoning" }],
            bonus, workflow.targets
        );
    } else {
        await reroll.toMessage({
            flavor: `<div style="font-family:'Cinzel',serif;font-size:11px;letter-spacing:2px;color:#5a2010;margin-bottom:3px">⚔️ Дикий атакующий — оставлен оригинал</div>
                     <div style="font-size:11px;color:#4a1808;font-style:italic">Оригинал: ${originalTotal} → Реролл: ${reroll.total} (хуже)</div>`,
            rollMode: CONST.DICE_ROLL_MODES.PUBLIC,
            flags: { dnd5e: { roll: { type: "damage" } } },
        });
    }
}

// ════════════════════════════════════════════════════
//  К А С К А Д   С Т И Х И Й
// ════════════════════════════════════════════════════
if (triggers > 0) {
    let diceResults      = [];
    let cascadesRemaining = triggers;
    let cascadesUsed      = triggers;

    while (cascadesRemaining > 0) {
        for (let i = 0; i < diceCount; i++) {
            let roll  = await new Roll("1d4").evaluate({ async: true });
            let value = roll.total;
            if (value === 1) {
                const reroll = await new Roll("1d4").evaluate({ async: true });
                value = reroll.total;
            }
            diceResults.push(value);
            if (value === 4 && cascadesUsed < wisMod) {
                cascadesRemaining++;
                cascadesUsed++;
            }
        }
        cascadesRemaining--;
    }

    const cascadeRoll = await new Roll(diceResults.join("+") + `[${dmgType}]`).evaluate({ async: true });
    await cascadeRoll.toMessage({
        flavor: `<div class="wrath-chat-title">${dmgInfo.icon} Каскад Стихий — ${dmgInfo.label}</div>
                 <div class="wrath-chat-row"><span>Каскадов сработало</span><span class="wrath-chat-val">${cascadesUsed}</span></div>
                 <div class="wrath-chat-row"><span>Кубов брошено</span><span class="wrath-chat-val">${diceResults.length}</span></div>`,
        rollMode: CONST.DICE_ROLL_MODES.PUBLIC,
        flags: { dnd5e: { roll: { type: "damage" } } },
    });

    await new MidiQOL.DamageOnlyWorkflow(
        actor, token, cascadeRoll.total, dmgType, workflow.targets, cascadeRoll,
        { flavor: `Каскад Стихий — ${dmgInfo.icon} ${dmgInfo.label}`, itemCardId: workflow.itemCardId }
    );
}

// ════════════════════════════════════════════════════
//  П О Р Ч А   —   В Ы Ч И Т А Н И Е   З А Р Я Д О В
// ════════════════════════════════════════════════════
if (charges > 0 && canUseCorruption) {
    const newCharges = Math.max(0, cCharges - charges);
    let deducted     = false;

    try {
        if (!globalThis.ResourceBridge) {
            throw new Error("Модуль resource-bridge не активен!");
        }
        if (cActivity) {
            await ResourceBridge.deductActivityUses(actor.id, cItem.id, cActivity.id, charges);
        } else {
            // isLegacyUses — заряды хранятся на самом предмете
            await ResourceBridge.deductItemUses(actor.id, cItem.id, charges);
        }
        deducted = true;
    } catch (e) {
        console.warn("Cascade | Ошибка снятия зарядов через ResourceBridge:", e);
        ui.notifications.warn("Cascade | Не удалось снять заряды Порчи — снимите вручную!");
    }

    const necroRoll = await new Roll(`${charges * 2}d4[necrotic]`).evaluate({ async: true });
    await necroRoll.toMessage({
        flavor: `<div class="wrath-chat-title" style="color:#9040c0">💀 Порча — некротический урон</div>
                 <div class="wrath-chat-row"><span>Зарядов потрачено</span><span class="wrath-chat-val" style="color:#9040c0">${charges}</span></div>
                 <div class="wrath-chat-row"><span>Осталось зарядов</span><span style="color:#6a2090;font-size:14px">${deducted ? newCharges : "? (снять вручную)"}</span></div>`,
        rollMode: CONST.DICE_ROLL_MODES.PUBLIC,
        flags: { dnd5e: { roll: { type: "damage" } } },
    });

    await new MidiQOL.DamageOnlyWorkflow(
        actor, token, necroRoll.total, "necrotic", workflow.targets, necroRoll,
        { flavor: "Порча — некротический урон", itemCardId: workflow.itemCardId }
    );
}
