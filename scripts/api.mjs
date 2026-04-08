import { resolveItem } from "./item-resolver.mjs";

let _socket = null;

export function setSocket(sock) {
  _socket = sock;
}

/**
 * Публичный API модуля Resource Bridge.
 *
 * Все операции записи маршрутизируются через GM-сокет для безопасности.
 *
 *   ResourceBridge.resolve(actor, itemIdOrName)
 *   await ResourceBridge.setCharges(actor, itemIdOrName, newValue)
 *   await ResourceBridge.deductCharges(actor, itemIdOrName, amount)
 *   await ResourceBridge.incrementResource(actor, resourceKey, delta)
 *   await ResourceBridge.modifyItemUses(actor, itemIdOrName, delta, useMode)
 */
export class ResourceBridge {

  /**
   * Синхронно прочитать заряды предмета (локально, без сокета).
   */
  static resolve(actor, itemIdOrName) {
    return resolveItem(actor, itemIdOrName);
  }

  /**
   * Установить точное значение зарядов (через GM-сокет).
   */
  static async setCharges(actor, itemIdOrName, newValue) {
    return _socket.executeAsGM("setCharges", actor.id, itemIdOrName, null, newValue);
  }

  /**
   * Вычесть заряды (через GM-сокет).
   */
  static async deductCharges(actor, itemIdOrName, amount) {
    return _socket.executeAsGM("deductCharges", actor.id, itemIdOrName, amount);
  }

  /**
   * Увеличить ресурс актора (primary / secondary / tertiary).
   */
  static async incrementResource(actor, resourceKey, delta = 1) {
    return _socket.executeAsGM("incrementResource", actor.id, resourceKey, delta);
  }

  /**
   * Изменить uses предмета.
   * @param {"spent"|"value"} useMode — "spent" увеличивает spent (набор очков),
   *                                     "value" увеличивает оставшиеся использования
   */
  static async modifyItemUses(actor, itemIdOrName, delta = 1, useMode = "spent") {
    return _socket.executeAsGM("modifyItemUses", actor.id, itemIdOrName, delta, useMode);
  }
}
