# Changelog

## [2.1.0] — 2025-04-XX

### Added
- **Trigger System UI** — полноценный интерфейс настройки триггеров на каждом персонаже/НПС прямо из листа актора (кнопка ⚡ в меню «⋮»). Реализован как ApplicationV2 без зависимости от устаревшего Dialog API.
- **Multi-event triggers** — один триггер теперь может срабатывать на несколько событий одновременно (например, «Получил урон + Критический удар»). Поле `event` мигрировало в `events: []`, старые триггеры конвертируются автоматически.
- **Новое событие `item-used`** — срабатывает при использовании любого предмета/активности (через `dnd5e.postUseActivity`). Работает и в vanilla, и с MidiQOL. Поддерживает `sourceItemFilter` — ограничить триггер конкретным предметом.
- **UUID парсинг в полях ID** — можно вставить полный UUID вида `Actor.xxx.Item.yyy` в поля `targetItem` и `sourceItemFilter`, модуль автоматически возьмёт последний сегмент (`yyy`).
- **`ResourceBridge.incrementResource()`** и **`ResourceBridge.modifyItemUses()`** — два новых метода публичного API.
- **Локализация** — добавлены `lang/ru.json` и `lang/en.json`, все строки интерфейса вынесены из кода.

### Fixed
- **`reduce-to-zero` с MidiQOL** — переработана детекция: вместо `hitTargets` (пустой в ряде конфигураций MidiQOL) теперь используется `damageList` с полями `oldHP`/`newHP`. Событие корректно срабатывает независимо от настроек авто-хита.
- **`damage-dealt` с MidiQOL** — аналогично использует `damageList`, а не `hitTargets`.
- **`loadTemplates`** — исправлен вызов устаревшего глобального `loadTemplates` на `foundry.applications.handlebars.loadTemplates` (v13).

### Changed
- `TRIGGER_EVENT_LABELS`, `TRIGGER_ACTION_LABELS` и остальные константы-лейблы заменены на функции `getTriggerEventLabels()` и т.д. — вызываются в момент рендера, когда `game.i18n` уже загружен.
- Кнопка в хедере листа актора регистрируется через хук `getHeaderControlsActorSheetV2` (правильный хук для dnd5e v4+).

## [1.1.0] — 2025-04-07

### Fixed
- `_resolveItem` теперь корректно пропускает вспомогательные активности MidiQOL с пустым `uses.max` (`""`)
- Запись в `system.uses.spent` вместо `system.uses.value` (вычисляемое поле в D&D 5e 5.x)

### Changed
- Debug-логирование в `_resolveItem`
- `module.json`: добавлены поля `url`, `manifest`, `download`, `changelog`, `readme`, `license`, `systems`; версия 1.1.0

## [1.0.0] — initial release

- GM-socket API: `resolve()`, `setCharges()`, `deductCharges()`
- Поддержка activity-level и item-level uses
- Foundry v12/v13, D&D 5e 3.x/4.x
