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

import MultiChapterManager from './controller/multi-chapter-manager.js';

export class CoreReader {
  /** @type {CoreReader|null} 全局单例 */
  static instance = null;

  /** @type {MultiChapterManager} 多章节管理器 */
  #manager = null;

  /** @type {Map<string, Function[]>} 事件监听器 */
  #eventBus = new Map();

  /** @type {Map<string, Object>} 插件注册表 */
  #plugins = new Map();

  /** @type {Object} 核心状态 */
  #state = {
    mode: 'vertical',
    currentChapter: 0,
    totalChapters: 0,
    globalProgress: 0,
    isReady: false,
    isDestroyed: false,
  };

  /** @type {Object} 主题配置 */
  #theme = {};

  /**
   * 获取全局单例
   * @returns {CoreReader}
   */
  static getInstance() {
    if (!CoreReader.instance) {
      throw new Error('CoreReader not initialized. Call CoreReader.create() first.');
    }
    return CoreReader.instance;
  }

  /**
   * 创建核心阅读器实例
   * @param {Object} config - 配置项
   * @param {HTMLElement} config.container - 容器元素
   * @param {string} [config.mode='vertical'] - 阅读模式：'vertical' | 'horizontal'
   * @param {Object} [config.theme] - 主题配置
   * @param {Function} [config.onProgressChange] - 进度变化回调
   * @param {Function} [config.onChapterChange] - 章节变化回调
   * @returns {CoreReader}
   */
  static create(config) {
    if (CoreReader.instance && !CoreReader.instance.#state.isDestroyed) {
      console.warn('CoreReader already exists, returning existing instance');
      return CoreReader.instance;
    }
    CoreReader.instance = new CoreReader(config);
    return CoreReader.instance;
  }

  /**
   * @private
   */
  constructor(config) {
    this.#state.mode = config.mode || 'vertical';
    this.#theme = config.theme || {};

    // 创建多章节管理器
    this.#manager = new MultiChapterManager({
      el: config.container,
      mode: this.#state.mode,
      theme: this.#theme,
    });

    // 绑定管理器事件
    this.#bindManagerEvents();

    // 保存配置回调
    if (config.onProgressChange) {
      this.on('progress:change', config.onProgressChange);
    }
    if (config.onChapterChange) {
      this.on('chapter:change', config.onChapterChange);
    }

    // 全局访问
    if (typeof window !== 'undefined') {
      window.coreReader = this;
    }
  }

  // ==================== 生命周期管理 ====================

  /**
   * 初始化阅读器
   */
  async init() {
    this.#state.isReady = true;
    this.emit('ready', { coreReader: this });
  }

  /**
   * 销毁阅读器
   */
  destroy() {
    // 销毁所有插件
    this.#plugins.forEach(plugin => plugin.destroy?.());
    this.#plugins.clear();

    // 清理事件监听
    this.#eventBus.clear();

    // 销毁管理器
    if (this.#manager) {
      this.#manager.destroy();
      this.#manager = null;
    }

    this.#state.isDestroyed = true;
    CoreReader.instance = null;

    if (typeof window !== 'undefined') {
      delete window.coreReader;
    }
  }

  // ==================== 事件系统 ====================

  /**
   * 监听事件
   * @param {string} event - 事件名称
   * @param {Function} handler - 事件处理器
   * @returns {Function} 取消监听的函数
   */
  on(event, handler) {
    if (!this.#eventBus.has(event)) {
      this.#eventBus.set(event, []);
    }
    this.#eventBus.get(event).push(handler);

    return () => this.off(event, handler);
  }

  /**
   * 取消监听事件
   * @param {string} event - 事件名称
   * @param {Function} handler - 事件处理器
   */
  off(event, handler) {
    const handlers = this.#eventBus.get(event);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  /**
   * 触发事件
   * @param {string} event - 事件名称
   * @param {*} data - 事件数据
   */
  emit(event, data) {
    const handlers = this.#eventBus.get(event);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(data);
        } catch (error) {
          console.error(`Error in event handler for "${event}":`, error);
        }
      });
    }
  }

  /**
   * 一次性事件监听
   * @param {string} event - 事件名称
   * @param {Function} handler - 事件处理器
   */
  once(event, handler) {
    const onceHandler = (data) => {
      handler(data);
      this.off(event, onceHandler);
    };
    this.on(event, onceHandler);
  }

  // ==================== 书籍管理 ====================

  /**
   * 加载书籍
   * @param {Array<Object>} chapters - 章节配置数组
   * @param {number} chapters[].index - 章节索引
   * @param {string} chapters[].title - 章节标题
   * @param {Function} chapters[].loadContent - 加载内容的函数
   * @returns {Promise<void>}
   */
  async loadBook(chapters) {
    await this.#manager.addBook(chapters);
    this.#state.totalChapters = chapters.length;
    this.emit('book:loaded', { totalChapters: chapters.length });
  }

  /**
   * 开始阅读
   * @param {number} [chapterIndex=0] - 起始章节索引
   * @param {number} [progress=0] - 起始章节进度(0-1)
   * @returns {Promise<void>}
   */
  async startReading(chapterIndex = 0, progress = 0) {
    await this.#manager.startRead(chapterIndex, progress);
    this.#state.currentChapter = chapterIndex;
    this.emit('reading:started', { chapterIndex, progress });
  }

  // ==================== 导航控制 ====================

  /**
   * 跳转到指定章节
   * @param {number} chapterIndex - 章节索引
   * @returns {Promise<void>}
   */
  async goToChapter(chapterIndex) {
    await this.#manager.goToChapter(chapterIndex);
    this.#state.currentChapter = chapterIndex;
    this.emit('chapter:change', { chapterIndex });
  }

  /**
   * 下一页（横向模式）
   */
  nextPage() {
    if (this.#state.mode === 'horizontal' && this.#manager.readMode?.nextPage) {
      this.#manager.readMode.nextPage();
      this.emit('page:next');
    } else {
      console.warn('nextPage() only works in horizontal mode');
    }
  }

  /**
   * 上一页（横向模式）
   */
  prevPage() {
    if (this.#state.mode === 'horizontal' && this.#manager.readMode?.previousPage) {
      this.#manager.readMode.previousPage();
      this.emit('page:prev');
    } else {
      console.warn('prevPage() only works in horizontal mode');
    }
  }

  /**
   * 滚动到指定位置（垂直模式）
   * @param {number} offset - 滚动偏移量
   */
  scrollTo(offset) {
    if (this.#state.mode === 'vertical' && this.#manager.readMode?.setOffset) {
      this.#manager.readMode.setOffset(offset);
      this.emit('scroll:to', { offset });
    } else {
      console.warn('scrollTo() only works in vertical mode');
    }
  }

  // ==================== 主题和配置 ====================

  /**
   * 设置主题
   * @param {Object} theme - 主题配置
   */
  setTheme(theme) {
    this.#theme = { ...this.#theme, ...theme };
    this.#manager.setTheme(theme);
    this.emit('theme:change', { theme: this.#theme });
  }

  /**
   * 获取主题
   * @returns {Object}
   */
  getTheme() {
    return { ...this.#theme };
  }

  /**
   * 设置阅读模式
   * @param {string} mode - 'vertical' | 'horizontal'
   */
  setMode(mode) {
    if (mode !== this.#state.mode) {
      this.#state.mode = mode;
      // TODO: 重新创建管理器以切换模式
      console.warn('Mode switching requires recreating the reader');
      this.emit('mode:change', { mode });
    }
  }

  /**
   * 获取阅读模式
   * @returns {string}
   */
  getMode() {
    return this.#state.mode;
  }

  // ==================== 状态访问 ====================

  /**
   * 获取当前章节索引
   * @returns {number}
   */
  getCurrentChapter() {
    return this.#manager.currentChapterIndex;
  }

  /**
   * 获取总章节数
   * @returns {number}
   */
  getTotalChapters() {
    return this.#state.totalChapters;
  }

  /**
   * 获取当前章节对象
   * @returns {Object|null}
   */
  getActiveChapter() {
    return this.#manager.activeChapter || null;
  }

  /**
   * 获取当前章节进度
   * @returns {number} 0-1之间的进度值
   */
  getChapterProgress() {
    const chapter = this.#manager.activeChapter;
    return chapter?.progress?.faction || 0;
  }

  /**
   * 获取全局进度
   * @returns {number} 0-1之间的进度值
   */
  getGlobalProgress() {
    return this.#state.globalProgress;
  }

  /**
   * 获取阅读器状态
   * @returns {Object}
   */
  getState() {
    return {
      mode: this.#state.mode,
      currentChapter: this.getCurrentChapter(),
      totalChapters: this.#state.totalChapters,
      chapterProgress: this.getChapterProgress(),
      globalProgress: this.#state.globalProgress,
      isReady: this.#state.isReady,
    };
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

  // ==================== 内部访问（供插件使用）====================

  /**
   * 获取管理器实例（供内部使用）
   * @private
   * @returns {MultiChapterManager}
   */
  _getManager() {
    return this.#manager;
  }

  /**
   * 获取当前章节渲染器（供插件使用）
   * @returns {VirtualCanvasRenderer|null}
   */
  _getActiveRenderer() {
    return this.#manager.activeChapter?.renderer || null;
  }

  /**
   * 获取容器元素
   * @returns {HTMLElement|null}
   */
  getContainer() {
    return this.#manager.readMode?.container || null;
  }

  // ==================== 私有方法 ====================

  /**
   * 绑定管理器事件到核心事件系统
   * @private
   */
  #bindManagerEvents() {
    // 监听章节变化
    const checkChapterChange = () => {
      const newChapter = this.#manager.currentChapterIndex;
      if (newChapter !== this.#state.currentChapter) {
        this.#state.currentChapter = newChapter;
        this.emit('chapter:change', { chapterIndex: newChapter });
      }
    };

    // 监听进度变化（通过定时检查或滚动事件）
    const checkProgressChange = () => {
      const chapter = this.#manager.activeChapter;
      if (chapter) {
        const chapterProgress = chapter.progress?.faction || 0;
        
        // 计算全局进度（简化版）
        const globalProgress = (this.#state.currentChapter + chapterProgress) / this.#state.totalChapters;
        
        if (Math.abs(globalProgress - this.#state.globalProgress) > 0.001) {
          this.#state.globalProgress = globalProgress;
          
          this.emit('progress:change', {
            chapterIndex: this.#state.currentChapter,
            chapterProgress,
            globalProgress,
          });
        }
      }
    };

    // 定时检查状态变化（或可以通过 MutationObserver 等方式）
    setInterval(() => {
      if (this.#state.isReady && !this.#state.isDestroyed) {
        checkChapterChange();
        checkProgressChange();
      }
    }, 100);
  }
}

/**
 * 全局快捷访问代理
 * 使用方式: 
 *   import { coreReader } from './core/core-reader.js'
 *   coreReader.on('ready', () => {...})
 */
export const coreReader = new Proxy({}, {
  get(target, prop) {
    const instance = CoreReader.getInstance();
    const value = instance[prop];
    return typeof value === 'function' ? value.bind(instance) : value;
  }
});

export default CoreReader;
