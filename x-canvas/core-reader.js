/**
 * CoreReader - 核心阅读器
 *
 * 收拢 MultiChapterManager，提供统一的阅读器 API
 *
 * 职责：
 * 1. 多章节管理和渲染
 * 2. 阅读模式管理（垂直滚动 / 横向翻页）
 * 3. 全局进度和章节导航
 * 4. 主题和配置管理
 * 5. 插件系统集成
 *
 * 使用示例：
 * ```javascript
 * const reader = CoreReader.create({
 *   container: document.getElementById('reader'),
 *   mode: 'vertical', // 'vertical' | 'horizontal'
 *   theme: { baseFontSize: 18 }
 * });
 *
 * // 加载书籍
 * await reader.loadBook(chapters);
 *
 * // 开始阅读
 * await reader.startReading(chapterIndex, progress);
 *
 * // 导航
 * reader.goToChapter(2);
 * reader.nextPage();
 * reader.prevPage();
 *
 * // 事件监听
 * reader.on('chapter:change', ({ chapterIndex }) => {...});
 * reader.on('progress:change', ({ progress }) => {...});
 * ```
 */

import { BookController } from './controller/BookController.js';
import Theme from './model/Theme.js';

export class CoreReader {
  /** @type {Map<string, Object>} 插件注册表 */
  #plugins = new Map();

  /** @type {Theme} 主题配置 */
  theme = null;

  /**
   * @private
   */
  constructor(config) {
    // 初始化主题 - 如果传入的是 Theme 实例则直接使用，否则创建新实例
    if (config.theme instanceof Theme) {
      this.theme = config.theme;
    } else if (config.theme) {
      this.theme = new Theme(config.theme);
    } else {
      this.theme = Theme.default();
    }

    // 全局访问
    if (typeof window !== 'undefined') {
      window.coreReader = this;
    }
  }

  // ==================== 书籍管理 ====================

  async initBook({ chapters }) {
    const bookController = new BookController();
    await bookController.initBook(chapters);
    return bookController;
  }

  // ==================== 插件系统 ====================

  /**
   * 注册插件
   * @param {string} name - 插件名称
   * @param {Object} plugin - 插件实例
   */
  registerPlugin(name, plugin) {
    if (this.#plugins.has(name)) {
      console.warn(`Plugin "${name}" already registered`);
      return;
    }

    this.#plugins.set(name, plugin);

    // 初始化插件
    if (typeof plugin.init === 'function') {
      plugin.init();
    }

    this.emit('plugin:registered', { name, plugin });
  }

  /**
   * 获取插件实例
   * @param {string} name - 插件名称
   * @returns {Object|null}
   */
  getPlugin(name) {
    return this.#plugins.get(name) || null;
  }

  /**
   * 注销插件
   * @param {string} name - 插件名称
   */
  unregisterPlugin(name) {
    const plugin = this.#plugins.get(name);
    if (plugin) {
      plugin.destroy?.();
      this.#plugins.delete(name);
      this.emit('plugin:unregistered', { name });
    }
  }
}

export default CoreReader;
