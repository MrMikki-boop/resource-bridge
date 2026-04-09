# Resource Bridge

Модуль для [Foundry VTT](https://foundryvtt.com/), который делает две вещи:

1. **Глобальный API** `ResourceBridge.*` — надёжное чтение и запись uses/charges на предметах и активностях любого актора через GM-сокет.
2. **Система триггеров** — per-actor автоматические реакции на боевые события (получил урон, нанёс урон, крит, снизил врага до 0 HP, использовал предмет). Настраивается прямо в листе персонажа, без макросов.

---

## Зачем это нужно

В D&D 5e v3/v4/v5.x запись в `item.system.uses.value` молча игнорируется — `value` вычисляемое поле (`max − spent`). Активности MidiQOL имеют свои особенности с пустыми `uses`. Этот модуль скрывает все эти детали за чистым API.

---

## Требования

| Зависимость | Версия |
|---|---|
| Foundry VTT | v12+ (проверено v13) |
| [socketlib](https://github.com/manuelVo/foundryvtt-socketlib) | 1.0+ |
| D&D 5e system | 3.0+ (проверено 5.2.5) |

MidiQOL не обязателен — модуль работает и в vanilla режиме.

---

## Установка

**Через Manifest URL** (рекомендуется):
```
https://github.com/MrMikki-boop/resource-bridge/releases/latest/download/module.json
```

**Вручную**: скачай `resource-bridge.zip` из [Releases](https://github.com/MrMikki-boop/resource-bridge/releases), распакуй в `Data/modules/`.

---

## Система триггеров

Открой лист персонажа или НПС → меню **⋮** в правом верхнем углу → **⚡ RB Триггеры**.

### Доступные события

| Событие | Описание |
|---|---|
| Получил урон | HP актора уменьшилось |
| Нанёс урон | Атака нанесла урон цели (MidiQOL: через `damageList`; vanilla: бросок урона в чате) |
| Критический удар | Атака была критической |
| Снизил врага до 0 HP | Цель упала до 0 HP от этой атаки |
| Использовал предмет / атаковал | Любая активность использована (оружие, заклинание и т.д.) |

Один триггер может быть привязан к **нескольким событиям одновременно**.

### Доступные действия

- **Увеличить ресурс актора** — Primary / Secondary / Tertiary из бланка персонажа.
- **Изменить uses предмета** — с выбором режима:
    - `+spent` — увеличивает «израсходовано» (ОГ: `spent` 0→1→2…)
    - `+value / −spent` — уменьшает «израсходовано», увеличивает остаток (ОБ: `spent` 4→3→2…)

### Дополнительные опции

- **Один раз за раунд** — триггер не срабатывает повторно в том же раунде боя.
- **Фильтр предмета-источника** — для событий `Нанёс урон` и `Использовал предмет`: указать конкретный предмет (по имени или ID). Можно вставить полный UUID вида `Actor.xxx.Item.yyy` — модуль сам возьмёт нужный сегмент.
- **Исключить типы существ** — триггер не сработает, если все цели — нежить, конструкты и т.д.

### Примеры

**Очки Гнева (ОГ)** — накапливаются в бою:
- События: `Получил урон` + `Критический удар` + `Снизил врага до 0 HP`
- Действие: Изменить uses предмета «Очки Гнева (ОГ)»
- Режим: `+spent` (накапливается)
- Один раз за раунд: ✓ (для «Получил урон»; крит и снижение до 0 — отдельные триггеры без ограничения)

**Очки Бешенства (ОБ)** — за каждое попадание по существу с кровью:
- Событие: `Использовал предмет / атаковал`
- Фильтр: `Короткий меч` (или ID оружия)
- Действие: Изменить uses предмета «Очки Бешенства (ОБ)»
- Режим: `+value / −spent` (убывает от max к 0)
- Исключить: Нежить, Конструкт

---

## Публичный API

Все методы доступны глобально как `ResourceBridge.*` после загрузки модуля.

### `ResourceBridge.resolve(actor, itemIdOrName)`

Синхронное чтение зарядов предмета. Не требует GM-сокета.

```js
const result = ResourceBridge.resolve(actor, "6GOFHZRGJkvvkqgT");
// или по подстроке имени:
const result = ResourceBridge.resolve(actor, "порча");

// Возвращает:
// {
//   item:     Item,
//   activity: Activity | null,
//   mode:     "activity" | "item" | "none",
//   charges:  number
// }
// null если предмет не найден
```

### `await ResourceBridge.setCharges(actor, itemIdOrName, newValue)`

Установить точное значение зарядов (через GM-сокет).

```js
await ResourceBridge.setCharges(actor, "6GOFHZRGJkvvkqgT", 10);
```

### `await ResourceBridge.deductCharges(actor, itemIdOrName, amount)`

Вычесть заряды (через GM-сокет). Не уходит ниже 0.

```js
await ResourceBridge.deductCharges(actor, "порча", 3);
```

### `await ResourceBridge.incrementResource(actor, resourceKey, delta)`

Увеличить ресурс актора (primary / secondary / tertiary).

```js
await ResourceBridge.incrementResource(actor, "primary", 1);
```

### `await ResourceBridge.modifyItemUses(actor, itemIdOrName, delta, useMode)`

Изменить uses предмета.

```js
// useMode "spent" — увеличить израсходовано (ОГ: 0→1→2)
await ResourceBridge.modifyItemUses(actor, "Очки Гнева", 1, "spent");

// useMode "value" — уменьшить израсходовано (ОБ: 4→3→2)
await ResourceBridge.modifyItemUses(actor, "Очки Бешенства", 1, "value");
```

---

## Примечание о D&D 5e 5.x

`system.uses.value` вычисляется как `max − spent` и не может быть записано напрямую. Resource Bridge автоматически пишет в `system.uses.spent`:

```
setCharges(actor, item, newValue)
  → item.update({ "system.uses.spent": max − newValue })
```

---

## Changelog

См. [CHANGELOG.md](CHANGELOG.md).

## License

[MIT](LICENSE)
