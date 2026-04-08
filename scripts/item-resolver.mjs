/**
 * Утилита для нахождения предмета на акторе и определения,
 * где у него хранятся заряды (activity-level vs item-level uses).
 *
 * @param {Actor} actor
 * @param {string} itemIdOrName — id или подстрока имени
 * @returns {{ item: Item, activity: object|null, mode: string, charges: number } | null}
 */
export function resolveItem(actor, itemIdOrName) {
  const item = actor.items.get(itemIdOrName)
    ?? actor.items.find(i => i.name.toLowerCase().includes(itemIdOrName.toLowerCase()));

  if (!item) return null;

  // ── Activity-level uses (D&D 5e v3/v4/5.x) ────────────────────────────
  if (item.system.activities) {
    const activities = item.system.activities.contents
      ?? Array.from(item.system.activities.values?.() ?? []);

    const activity = activities.find(a => {
      if (!a?.uses) return false;
      const max = a.uses.max;
      return (typeof max === "string" && max.trim() !== "") || (typeof max === "number" && max > 0);
    });

    if (activity) {
      const charges = activity.uses.value ?? 0;
      console.log(`Resource Bridge | "${item.name}": mode=activity, charges=${charges}, max=${activity.uses.max}, id=${activity.id}`);
      return { item, activity, mode: "activity", charges };
    }
  }

  // ── Item-level uses ────────────────────────────────────────────────────
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
