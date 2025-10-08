/**
 * EventEmitter - 自定义事件发布订阅基类
 * 
 * 提供完整的事件发布订阅功能，自动支持同步和异步监听器
 * 
 * 使用方法:
 * 1. 继承此类
 * 2. 使用 emit() 触发事件（自动检测异步监听器）
 * 3. 使用 on() 订阅事件
 * 4. 使用 off() 取消订阅
 * 5. 使用 once() 订阅一次性事件
 * 
 * @example 同步事件
 * class MyClass extends EventEmitter {
 *   doSomething() {
 *     this.emit('action', { data: 'value' });
 *     console.log('emit 后立即执行'); // 同步监听器执行完立即执行
 *   }
 * }
 * 
 * const obj = new MyClass();
 * obj.on('action', (data) => console.log(data)); // 同步监听器
 * obj.doSomething();
 * 
 * @example 异步事件（自动检测）
 * class MyClass extends EventEmitter {
 *   async doSomething() {
 *     // emit 自动检测异步监听器并返回 Promise
 *     await this.emit('async-action', { data: 'value' });
 *     console.log('所有异步监听器执行完成后才执行这里');
 *   }
 * }
 * 
 * const obj = new MyClass();
 * obj.on('async-action', async (data) => {
 *   await fetch('/api/data', { method: 'POST', body: JSON.stringify(data) });
 *   console.log('异步操作完成');
 * });
 * await obj.doSomething();
 * 
 * @example 混合使用（可选 await）
 * class MyClass extends EventEmitter {
 *   // 不需要 await（全是同步监听器）
 *   doSync() {
 *     this.emit('sync-event', 'data');
 *     console.log('立即执行');
 *   }
 * 
 *   // 需要 await（有异步监听器）
 *   async doAsync() {
 *     await this.emit('async-event', 'data');
 *     console.log('等待完成后执行');
 *   }
 * }
 */
export class EventEmitter {
  constructor() {
    /**
     * 事件监听器映射表
     * @type {Map<string, Set<Function>>}
     * @private
     */
    this._events = new Map();
  }

  /**
   * 订阅事件
   * @param {string} event - 事件名称
   * @param {Function} listener - 事件监听器
   * @returns {this} - 返回自身，支持链式调用
   */
  on(event, listener) {
    if (typeof listener !== 'function') {
      throw new TypeError('监听器必须是一个函数');
    }

    if (!this._events.has(event)) {
      this._events.set(event, new Set());
    }

    this._events.get(event).add(listener);
    return this;
  }

  /**
   * 订阅一次性事件（触发一次后自动取消订阅）
   * @param {string} event - 事件名称
   * @param {Function} listener - 事件监听器
   * @returns {this} - 返回自身，支持链式调用
   */
  once(event, listener) {
    if (typeof listener !== 'function') {
      throw new TypeError('监听器必须是一个函数');
    }

    const onceWrapper = (...args) => {
      listener.apply(this, args);
      this.off(event, onceWrapper);
    };

    // 保存原始监听器的引用，以便后续可以通过原始监听器取消订阅
    onceWrapper.listener = listener;

    return this.on(event, onceWrapper);
  }

  /**
   * 取消订阅事件
   * @param {string} event - 事件名称
   * @param {Function} listener - 要移除的监听器（可选，如果不提供则移除该事件的所有监听器）
   * @returns {this} - 返回自身，支持链式调用
   */
  off(event, listener) {
    if (!this._events.has(event)) {
      return this;
    }

    // 如果没有提供监听器，移除该事件的所有监听器
    if (!listener) {
      this._events.delete(event);
      return this;
    }

    const listeners = this._events.get(event);
    
    // 处理普通监听器和 once 包装的监听器
    for (const fn of listeners) {
      if (fn === listener || fn.listener === listener) {
        listeners.delete(fn);
      }
    }

    // 如果该事件没有监听器了，删除该事件
    if (listeners.size === 0) {
      this._events.delete(event);
    }

    return this;
  }

  /**
   * 触发事件，自动检测异步监听器
   * - 如果有异步监听器（返回 Promise），返回 Promise<boolean>
   * - 如果全是同步监听器，返回 boolean
   * 
   * @param {string} event - 事件名称
   * @param {...any} args - 传递给监听器的参数
   * @returns {boolean | Promise<boolean>} - 同步返回 boolean，或异步返回 Promise<boolean>
   */
  emit(event, ...args) {
    if (!this._events.has(event)) {
      return false;
    }

    const listeners = this._events.get(event);
    
    // 复制监听器数组，避免在执行过程中修改导致问题
    const listenersArray = Array.from(listeners);

    // 收集所有监听器的返回值（可能是 Promise）
    const promises = [];

    for (const listener of listenersArray) {
      try {
        const result = listener.apply(this, args);
        // 如果监听器返回 Promise，收集起来
        if (result instanceof Promise) {
          promises.push(result);
        }
      } catch (error) {
        console.error(`事件 "${event}" 的监听器执行出错:`, error);
      }
    }

    // 如果有异步监听器，返回 Promise
    if (promises.length > 0) {
      return Promise.allSettled(promises).then(() => true);
    }

    // 否则同步返回
    return true;
  }

  /**
   * 移除所有事件监听器
   * @param {string} event - 可选，如果提供则只移除该事件的所有监听器
   * @returns {this} - 返回自身，支持链式调用
   */
  removeAllListeners(event) {
    if (event) {
      this._events.delete(event);
    } else {
      this._events.clear();
    }
    return this;
  }

  /**
   * 获取指定事件的监听器数量
   * @param {string} event - 事件名称
   * @returns {number} - 监听器数量
   */
  listenerCount(event) {
    if (!this._events.has(event)) {
      return 0;
    }
    return this._events.get(event).size;
  }

  /**
   * 获取指定事件的所有监听器
   * @param {string} event - 事件名称
   * @returns {Function[]} - 监听器数组
   */
  listeners(event) {
    if (!this._events.has(event)) {
      return [];
    }
    return Array.from(this._events.get(event));
  }

  /**
   * 获取所有事件名称
   * @returns {string[]} - 事件名称数组
   */
  eventNames() {
    return Array.from(this._events.keys());
  }
}
