import {
  MODULE_ID,
  TRIGGER_EVENTS, TRIGGER_EVENT_LABELS,
  TRIGGER_ACTIONS, TRIGGER_ACTION_LABELS,
  ITEM_USE_MODES, ITEM_USE_MODE_LABELS,
  RESOURCE_KEYS, RESOURCE_LABELS,
  CREATURE_TYPES, CREATURE_TYPE_LABELS,
} from "./constants.mjs";

// ── CRUD для триггеров (хранение в actor flags) ────────────────────────────

export function getTriggers(actor) {
  return actor?.getFlag(MODULE_ID, "triggers") ?? [];
}

export async function setTriggers(actor, triggers) {
  await actor.setFlag(MODULE_ID, "triggers", triggers);
}

// ── Инъекция кнопки в шапку листа актора ───────────────────────────────────

export function injectConfigButton() {
  // Application v1 (dnd5e sheets)
  Hooks.on("getActorSheetHeaderButtons", (sheet, buttons) => {
    if (sheet.actor?.type !== "character" && sheet.actor?.type !== "npc") return;
    buttons.unshift({
      label: "RB Triggers",
      class: "resource-bridge-triggers",
      icon: "fas fa-bolt",
      onclick: () => openTriggerConfig(sheet.actor),
    });
  });
}

// ── Главный диалог: список триггеров ───────────────────────────────────────

export function openTriggerConfig(actor) {
  const triggers = getTriggers(actor);
  const listHtml = _renderTriggerList(triggers);

  const dlg = new Dialog({
    title: `⚡ Resource Bridge — ${actor.name}`,
    content: `
      <style>${_configStyles()}</style>
      <div class="rb-config">
        <div class="rb-trigger-list" id="rb-trigger-list">${listHtml}</div>
        <button class="rb-add-btn" id="rb-add-trigger">
          <i class="fas fa-plus"></i> Добавить триггер
        </button>
      </div>
    `,
    buttons: {
      close: { label: "Закрыть", icon: '<i class="fas fa-times"></i>' },
    },
    default: "close",
    render: (html) => {
      // Добавить
      html.find("#rb-add-trigger").click(async () => {
        const newTrigger = _createDefaultTrigger();
        const result = await _openEditForm(actor, newTrigger, true);
        if (result) {
          const current = getTriggers(actor);
          current.push(result);
          await setTriggers(actor, current);
          dlg.close();
          openTriggerConfig(actor);
        }
      });

      // Редактировать
      html.find(".rb-edit-btn").click(async (ev) => {
        const idx = Number(ev.currentTarget.dataset.idx);
        const current = getTriggers(actor);
        const result = await _openEditForm(actor, current[idx], false);
        if (result) {
          current[idx] = result;
          await setTriggers(actor, current);
          dlg.close();
          openTriggerConfig(actor);
        }
      });

      // Удалить
      html.find(".rb-delete-btn").click(async (ev) => {
        const idx = Number(ev.currentTarget.dataset.idx);
        const current = getTriggers(actor);
        current.splice(idx, 1);
        await setTriggers(actor, current);
        dlg.close();
        openTriggerConfig(actor);
      });

      // Вкл/Выкл
      html.find(".rb-toggle-btn").click(async (ev) => {
        const idx = Number(ev.currentTarget.dataset.idx);
        const current = getTriggers(actor);
        current[idx].enabled = !current[idx].enabled;
        await setTriggers(actor, current);
        dlg.close();
        openTriggerConfig(actor);
      });
    },
  }, { width: 480, resizable: true });
  dlg.render(true);
}

// ── Рендер списка триггеров ────────────────────────────────────────────────

function _renderTriggerList(triggers) {
  if (!triggers.length) {
    return `<div class="rb-empty">Нет настроенных триггеров. Нажмите «Добавить триггер».</div>`;
  }

  return triggers.map((t, i) => {
    const eventLabel = TRIGGER_EVENT_LABELS[t.event] ?? t.event;
    const actionLabel = TRIGGER_ACTION_LABELS[t.action] ?? t.action;
    const target = t.action === "increment-resource"
      ? `Ресурс: ${RESOURCE_LABELS[t.targetResource] ?? t.targetResource}`
      : `Предмет: ${t.targetItem || "?"}`;
    const excludes = t.excludeTypes?.length
      ? `Исключ.: ${t.excludeTypes.map(ct => CREATURE_TYPE_LABELS[ct] ?? ct).join(", ")}`
      : "";

    return `
      <div class="rb-trigger-card ${t.enabled ? "" : "rb-disabled"}">
        <div class="rb-trigger-header">
          <span class="rb-trigger-name">${t.name || "Без названия"}</span>
          <div class="rb-trigger-actions">
            <button class="rb-toggle-btn" data-idx="${i}" title="${t.enabled ? "Отключить" : "Включить"}">
              <i class="fas ${t.enabled ? "fa-toggle-on" : "fa-toggle-off"}"></i>
            </button>
            <button class="rb-edit-btn" data-idx="${i}" title="Редактировать">
              <i class="fas fa-edit"></i>
            </button>
            <button class="rb-delete-btn" data-idx="${i}" title="Удалить">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </div>
        <div class="rb-trigger-details">
          <div><strong>Событие:</strong> ${eventLabel} ${t.oncePerRound ? "(1/раунд)" : ""}</div>
          <div><strong>Действие:</strong> ${actionLabel} (+${t.delta})</div>
          <div><strong>Цель:</strong> ${target}</div>
          ${excludes ? `<div><strong>${excludes}</strong></div>` : ""}
        </div>
      </div>
    `;
  }).join("");
}

// ── Форма редактирования триггера ──────────────────────────────────────────

function _openEditForm(actor, trigger, isNew) {
  return new Promise(resolve => {
    const eventOptions = Object.entries(TRIGGER_EVENT_LABELS)
      .map(([k, v]) => `<option value="${k}" ${trigger.event === k ? "selected" : ""}>${v}</option>`)
      .join("");

    const actionOptions = Object.entries(TRIGGER_ACTION_LABELS)
      .map(([k, v]) => `<option value="${k}" ${trigger.action === k ? "selected" : ""}>${v}</option>`)
      .join("");

    const resourceOptions = RESOURCE_KEYS
      .map(k => `<option value="${k}" ${trigger.targetResource === k ? "selected" : ""}>${RESOURCE_LABELS[k]}</option>`)
      .join("");

    const useModeOptions = Object.entries(ITEM_USE_MODE_LABELS)
      .map(([k, v]) => `<option value="${k}" ${(trigger.itemUseMode ?? "spent") === k ? "selected" : ""}>${v}</option>`)
      .join("");

    const creatureTypeChecks = CREATURE_TYPES
      .map(ct => `<label class="rb-check">
        <input type="checkbox" name="exclude-${ct}" ${trigger.excludeTypes?.includes(ct) ? "checked" : ""}>
        ${CREATURE_TYPE_LABELS[ct]}
      </label>`)
      .join("");

    const content = `
      <style>${_configStyles()}</style>
      <form class="rb-edit-form">
        <div class="rb-field">
          <label>Название</label>
          <input type="text" name="name" value="${trigger.name ?? ""}" placeholder="Например: Очки Гнева">
        </div>

        <div class="rb-field">
          <label>Событие (триггер)</label>
          <select name="event">${eventOptions}</select>
        </div>

        <div class="rb-field">
          <label>Действие</label>
          <select name="action">${actionOptions}</select>
        </div>

        <div class="rb-field rb-resource-fields" style="${trigger.action === "increment-resource" ? "" : "display:none"}">
          <label>Ресурс актора</label>
          <select name="targetResource">${resourceOptions}</select>
        </div>

        <div class="rb-field rb-item-fields" style="${trigger.action === "increment-item" ? "" : "display:none"}">
          <label>Название предмета (или ID)</label>
          <input type="text" name="targetItem" value="${trigger.targetItem ?? ""}" placeholder="Очки Бешенства">
          <label style="margin-top:6px">Режим изменения uses</label>
          <select name="itemUseMode">${useModeOptions}</select>
        </div>

        <div class="rb-field">
          <label>Значение (+/-)</label>
          <input type="number" name="delta" value="${trigger.delta ?? 1}" min="1" step="1">
        </div>

        <div class="rb-field">
          <label class="rb-check">
            <input type="checkbox" name="oncePerRound" ${trigger.oncePerRound ? "checked" : ""}>
            Один раз за раунд
          </label>
        </div>

        <div class="rb-field">
          <label>Исключить типы существ (для damage-dealt)</label>
          <div class="rb-check-group">${creatureTypeChecks}</div>
        </div>
      </form>
    `;

    const dlg = new Dialog({
      title: isNew ? "Новый триггер" : `Редактирование: ${trigger.name}`,
      content,
      buttons: {
        save: {
          label: "Сохранить",
          icon: '<i class="fas fa-save"></i>',
          callback: (html) => {
            const form = html.find("form.rb-edit-form");
            const excludeTypes = CREATURE_TYPES.filter(ct =>
              form.find(`[name="exclude-${ct}"]`).is(":checked")
            );

            resolve({
              id: trigger.id,
              name: form.find('[name="name"]').val().trim() || "Без названия",
              event: form.find('[name="event"]').val(),
              action: form.find('[name="action"]').val(),
              targetResource: form.find('[name="targetResource"]').val(),
              targetItem: form.find('[name="targetItem"]').val().trim(),
              itemUseMode: form.find('[name="itemUseMode"]').val(),
              delta: Math.max(1, parseInt(form.find('[name="delta"]').val()) || 1),
              oncePerRound: form.find('[name="oncePerRound"]').is(":checked"),
              excludeTypes,
              enabled: trigger.enabled ?? true,
            });
          },
        },
        cancel: {
          label: "Отмена",
          icon: '<i class="fas fa-times"></i>',
          callback: () => resolve(null),
        },
      },
      default: "save",
      render: (html) => {
        // Показ/скрытие полей в зависимости от action
        html.find('[name="action"]').change((ev) => {
          const val = ev.target.value;
          html.find(".rb-resource-fields").toggle(val === "increment-resource");
          html.find(".rb-item-fields").toggle(val === "increment-item");
        });
      },
      close: () => resolve(null),
    }, { width: 420 });
    dlg.render(true);
  });
}

// ── Создание триггера по умолчанию ─────────────────────────────────────────

function _createDefaultTrigger() {
  return {
    id: foundry.utils.randomID(),
    name: "",
    event: TRIGGER_EVENTS.DAMAGE_TAKEN,
    action: TRIGGER_ACTIONS.INCREMENT_RESOURCE,
    targetResource: "primary",
    targetItem: "",
    itemUseMode: ITEM_USE_MODES.SPENT,
    delta: 1,
    oncePerRound: false,
    excludeTypes: [],
    enabled: true,
  };
}

// ── Стили для диалогов конфигурации ────────────────────────────────────────

function _configStyles() {
  return `
    .rb-config { font-family: var(--font-primary); }
    .rb-trigger-list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 10px; max-height: 400px; overflow-y: auto; }
    .rb-empty { padding: 20px; text-align: center; color: #888; font-style: italic; }

    .rb-trigger-card {
      background: rgba(0,0,0,0.04); border: 1px solid #ccc; border-radius: 4px; padding: 8px 10px;
      transition: opacity 0.2s;
    }
    .rb-trigger-card.rb-disabled { opacity: 0.5; }
    .rb-trigger-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
    .rb-trigger-name { font-weight: bold; font-size: 13px; color: #c83000; }
    .rb-trigger-actions { display: flex; gap: 4px; }
    .rb-trigger-actions button {
      background: none; border: 1px solid #ccc; border-radius: 3px;
      cursor: pointer; padding: 2px 6px; font-size: 11px; color: #555;
    }
    .rb-trigger-actions button:hover { border-color: #999; color: #222; }
    .rb-trigger-details { font-size: 11px; color: #555; line-height: 1.5; }

    .rb-add-btn {
      width: 100%; padding: 8px; background: rgba(200,48,0,0.08); border: 1px dashed #c83000;
      border-radius: 4px; color: #c83000; cursor: pointer; font-weight: bold; font-size: 12px;
    }
    .rb-add-btn:hover { background: rgba(200,48,0,0.15); }

    .rb-edit-form .rb-field { margin-bottom: 8px; }
    .rb-edit-form label { display: block; font-weight: bold; font-size: 11px; margin-bottom: 3px; color: #444; }
    .rb-edit-form input[type="text"],
    .rb-edit-form input[type="number"],
    .rb-edit-form select { width: 100%; }

    .rb-check { display: inline-flex; align-items: center; gap: 4px; font-weight: normal !important; cursor: pointer; }
    .rb-check input { margin: 0; }
    .rb-check-group { display: flex; flex-wrap: wrap; gap: 6px 14px; }
  `;
}
