/**
 * 多章节管理器
 * 管理多个VirtualCanvasRenderer实例，实现跨章节的阅读体验
 *
 * 功能特性：
 * - 章节元数据管理
 * - 多渲染器实例协调
 * - 全局进度计算和同步
 * - 跨章节导航和搜索
 * - 动态章节加载
 * - 统一的进度和位置管理
 *
 * 使用示例：
 * const manager = new MultiChapterManager({
 *   container: document.getElementById('book-container'),
 *   theme: { baseFontSize: 18 },
 *   onProgressChange: (info) => {
 *     console.log('全书进度:', info.globalProgress);
 *   },
 *   onChapterChange: (chapterIndex) => {
 *     console.log('当前章节:', chapterIndex);
 *   }
 * });
 *
 * // 初始化书籍
 * await manager.initBook(chapters);
 *
 * // 跳转到指定章节和位置
 * manager.goToChapter(2, 0.3); // 第3章30%位置
 *
 * // 设置全局进度
 * manager.setGlobalProgress(0.5); // 全书50%位置
 */

import VirtualCanvasRenderer from './virtual-canvas-renderer.js';

/**
 * @typedef {Object} ChapterConfig
 * @property {number} index - 章节索引
 * @property {string} title - 章节标题
 * @property {string} [id] - 章节唯一标识
 * @property {Function} loadContent - 异步加载章节内容的函数
 * @property {Object} [metadata] - 章节元数据
 * @property {number} [estimatedHeight] - 估计的章节高度
 */

/**
 * @typedef {Object} ChapterInstance
 * @property {number} index - 章节索引
 * @property {string} title - 章节标题
 * @property {VirtualCanvasRenderer} renderer - 渲染器实例
 * @property {HTMLElement} container - 章节容器DOM
 * @property {boolean} loaded - 是否已加载内容
 * @property {boolean} visible - 是否当前可见
 * @property {number} contentHeight - 章节内容高度
 * @property {number} progress - 章节内进度(0-1)
 * @property {Function} loadContent - 加载内容的函数
 * @property {Object} metadata - 章节元数据
 */

/**
 * @typedef {Object} GlobalPosition
 * @property {number} chapterIndex - 章节索引
 * @property {number} chapterProgress - 章节内进度(0-1)
 * @property {number} globalProgress - 全局进度(0-1)
 * @property {number} globalOffset - 全局偏移量
 */

/**
 * @typedef {Object} BookProgress
 * @property {number} globalProgress - 全局进度(0-1)
 * @property {number} currentChapter - 当前章节索引
 * @property {number} chapterProgress - 当前章节进度(0-1)
 * @property {number} totalChapters - 总章节数
 * @property {boolean} isAtStart - 是否在开头
 * @property {boolean} isAtEnd - 是否在结尾
 */

/**
 * @typedef {Object} MultiChapterConfig
 * @property {HTMLElement} container - 主容器元素
 * @property {Object} [theme] - 全局主题配置
 * @property {string} [mode='vertical'] - 渲染模式
 * @property {Function} [onProgressChange] - 全局进度变化回调
 * @property {Function} [onChapterChange] - 章节变化回调
 * @property {Function} [onChapterLoad] - 章节加载回调
 * @property {number} [preloadRadius=1] - 预加载半径(前后章节数)
 * @property {boolean} [enableCache=true] - 是否启用章节缓存
 * @property {number} [maxCacheSize=5] - 最大缓存章节数
 */

export class MultiChapterManager {
  /** @type {HTMLElement} 主容器 */
  container;

  /** @type {Object} 全局主题配置 */
  theme;

  /** @type {string} 渲染模式 */
  mode;

  /** @type {Map<number, ChapterInstance>} 章节实例映射 */
  chapters = new Map();

  /** @type {Array<ChapterConfig>} 章节配置数组 */
  chapterConfigs = [];

  /** @type {number} 当前活跃章节索引 */
  currentChapterIndex = 0;

  /** @type {number} 总章节数 */
  totalChapters = 0;

  /** @type {number} 全局进度(0-1) */
  globalProgress = 0;

  /** @type {Set<number>} 已加载的章节索引 */
  loadedChapters = new Set();

  /** @type {Set<number>} 当前可见的章节索引 */
  visibleChapters = new Set();

  // 回调函数
  /** @type {Function|null} 全局进度变化回调 */
  onProgressChange = null;

  /** @type {Function|null} 章节变化回调 */
  onChapterChange = null;

  /** @type {Function|null} 章节加载回调 */
  onChapterLoad = null;

  // 配置选项
  /** @type {number} 预加载半径 */
  preloadRadius = 1;

  /** @type {boolean} 是否启用缓存 */
  enableCache = true;

  /** @type {number} 最大缓存章节数 */
  maxCacheSize = 5;

  /** @type {Array<number>} 缓存LRU队列 */
  cacheQueue = [];

  // 内部状态
  /** @type {boolean} 是否正在更新进度 */
  isUpdatingProgress = false;

  /** @type {number} 进度更新防抖定时器 */
  progressUpdateTimer = null;

  /**
   * @param {MultiChapterConfig} config
   */
    constructor(config) {
    this.container = config.container;
    this.theme = config.theme || {};
    this.mode = config.mode || 'vertical';
    
    // 回调函数
    this.onProgressChange = config.onProgressChange || null;
    this.onChapterChange = config.onChapterChange || null;
    this.onChapterLoad = config.onChapterLoad || null;
    
    // 配置选项
    this.preloadRadius = config.preloadRadius ?? 1;
    this.enableCache = config.enableCache ?? true;
    this.maxCacheSize = config.maxCacheSize ?? 5;

    this.setupContainer();
  }

  /**
   * 设置主容器
   */
  setupContainer() {
    this.container.className = 'multi-chapter-container';
    this.container.style.cssText = `
      position: relative;
      width: 100%;
      height: 100%;
      overflow: hidden;
    `;
  }

  /**
   * 初始化书籍
   * @param {Array<ChapterConfig>} chaptersConfig - 章节配置数组
   */
  async initBook(chaptersConfig) {
    this.chapterConfigs = chaptersConfig;
    this.totalChapters = chaptersConfig.length;

    // 清理现有章节
    this.clearAllChapters();

    // 创建章节实例（但不立即加载内容）
    for (let i = 0; i < chaptersConfig.length; i++) {
      const config = chaptersConfig[i];
      await this.createChapterInstance(config, i);
    }

    // 加载初始章节（通常是第一章）
    await this.loadChapter(0);
    this.setCurrentChapter(0);
  }

  /**
   * 创建章节实例
   * @param {ChapterConfig} config - 章节配置
   * @param {number} index - 章节索引
   */
  async createChapterInstance(config, index) {
    // 创建章节占位符容器，确保DOM中的顺序正确
    const chapterPlaceholder = document.createElement('div');
    chapterPlaceholder.className = `chapter-placeholder chapter-${index}`;
    chapterPlaceholder.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      display: none;
      background: transparent;
    `;

    // 创建章节实例对象（暂时不创建渲染器）
    const chapterInstance = {
      index,
      title: config.title,
      renderer: null, // 延迟创建
      container: chapterPlaceholder,
      loaded: false,
      visible: false,
      contentHeight: 0,
      progress: 0,
      loadContent: config.loadContent,
      metadata: config.metadata || {},
    };

    this.chapters.set(index, chapterInstance);
    
    // 按顺序插入占位符容器
    this.insertChapterContainer(chapterPlaceholder, index);
  }

  /**
   * 按顺序插入章节容器
   * @param {HTMLElement} container - 章节容器
   * @param {number} index - 章节索引
   */
  insertChapterContainer(container, index) {
    const existingChapters = Array.from(this.container.children);
    
    // 找到第一个索引大于当前章节的容器
    let insertBeforeElement = null;
    for (const element of existingChapters) {
      const elementIndex = parseInt(element.className.match(/chapter-(\d+)/)?.[1] || '999999');
      if (elementIndex > index) {
        insertBeforeElement = element;
        break;
      }
    }

    // 插入到正确位置
    if (insertBeforeElement) {
      this.container.insertBefore(container, insertBeforeElement);
    } else {
      this.container.appendChild(container);
    }
  }

  /**
   * 加载指定章节
   * @param {number} chapterIndex - 章节索引
   */
  async loadChapter(chapterIndex) {
    const chapter = this.chapters.get(chapterIndex);
    if (!chapter || chapter.loaded) {
      return;
    }

    try {
      // 调用加载回调
      if (this.onChapterLoad) {
        this.onChapterLoad(chapterIndex, 'loading');
      }

      // 创建渲染器实例（如果还没有）
      if (!chapter.renderer) {
        // 创建临时挂载点，VirtualCanvasRenderer会替换它
        const tempMountPoint = document.createElement('div');
        
        chapter.renderer = new VirtualCanvasRenderer({
          mountPoint: tempMountPoint,
          theme: this.theme,
          mode: this.mode,
          onProgressChange: (progressInfo) => {
            this.handleChapterProgressChange(chapterIndex, progressInfo);
          },
        });
      }

      // 加载章节内容
      const htmlContent = await chapter.loadContent();
      
      // 渲染章节内容
      chapter.renderer.render(htmlContent);
      chapter.loaded = true;
      chapter.contentHeight = chapter.renderer.fullLayoutData?.totalHeight || 0;
      
      // 将渲染器的容器替换占位符
      const rendererContainer = chapter.renderer.container;
      rendererContainer.className = `chapter-container chapter-${chapterIndex}`;
      rendererContainer.style.display = 'none'; // 默认隐藏
      
      // 替换占位符
      if (chapter.container && chapter.container.parentNode) {
        chapter.container.parentNode.replaceChild(rendererContainer, chapter.container);
      }
      
      // 更新容器引用
      chapter.container = rendererContainer;
      
      this.loadedChapters.add(chapterIndex);

      // 更新缓存队列
      this.updateCacheQueue(chapterIndex);

      // 调用加载完成回调
      if (this.onChapterLoad) {
        this.onChapterLoad(chapterIndex, 'loaded');
      }
    } catch (error) {
      console.error(`Failed to load chapter ${chapterIndex}:`, error);

      // 调用加载失败回调
      if (this.onChapterLoad) {
        this.onChapterLoad(chapterIndex, 'error', error);
      }
    }
  }

  /**
   * 设置当前章节
   * @param {number} chapterIndex - 章节索引
   */
  setCurrentChapter(chapterIndex) {
    if (chapterIndex === this.currentChapterIndex) {
      return;
    }

    const oldChapter = this.chapters.get(this.currentChapterIndex);
    const newChapter = this.chapters.get(chapterIndex);

    if (!newChapter) {
      console.warn(`Chapter ${chapterIndex} not found`);
      return;
    }

    // 隐藏当前章节
    if (oldChapter) {
      oldChapter.container.style.display = 'none';
      oldChapter.visible = false;
    }

    // 显示新章节
    newChapter.container.style.display = 'block';
    newChapter.visible = true;

    // 更新当前章节索引
    this.currentChapterIndex = chapterIndex;
    this.visibleChapters.clear();
    this.visibleChapters.add(chapterIndex);

    // 预加载相邻章节
    this.preloadAdjacentChapters(chapterIndex);

    // 调用章节变化回调
    if (this.onChapterChange) {
      this.onChapterChange(chapterIndex, newChapter.title);
    }
  }

  /**
   * 预加载相邻章节
   * @param {number} centerIndex - 中心章节索引
   */
  async preloadAdjacentChapters(centerIndex) {
    const loadPromises = [];

    for (let i = -this.preloadRadius; i <= this.preloadRadius; i++) {
      const targetIndex = centerIndex + i;
      if (
        targetIndex >= 0 &&
        targetIndex < this.totalChapters &&
        !this.loadedChapters.has(targetIndex)
      ) {
        loadPromises.push(this.loadChapter(targetIndex));
      }
    }

    await Promise.all(loadPromises);
  }

  /**
   * 处理章节进度变化
   * @param {number} chapterIndex - 章节索引
   * @param {Object} progressInfo - 进度信息
   */
  handleChapterProgressChange(chapterIndex, progressInfo) {
    if (chapterIndex !== this.currentChapterIndex) {
      return;
    }

    const chapter = this.chapters.get(chapterIndex);
    if (!chapter) return;

    // 更新章节进度
    chapter.progress = progressInfo.progress;

    // 计算全局进度
    this.updateGlobalProgress();
  }

  /**
   * 更新全局进度
   */
  updateGlobalProgress() {
    if (this.isUpdatingProgress) return;

    // 防抖处理
    if (this.progressUpdateTimer) {
      clearTimeout(this.progressUpdateTimer);
    }

    this.progressUpdateTimer = setTimeout(() => {
      this.calculateGlobalProgress();
      this.progressUpdateTimer = null;
    }, 16);
  }

  /**
   * 计算全局进度
   */
  calculateGlobalProgress() {
    if (this.totalChapters === 0) {
      this.globalProgress = 0;
      return;
    }

    // 简单的线性计算：当前章节索引 + 章节内进度
    const currentChapter = this.chapters.get(this.currentChapterIndex);
    const chapterProgress = currentChapter ? currentChapter.progress : 0;

    const newGlobalProgress =
      (this.currentChapterIndex + chapterProgress) / this.totalChapters;

    // 只有进度真正变化时才通知
    if (Math.abs(newGlobalProgress - this.globalProgress) > 0.001) {
      const oldProgress = this.globalProgress;
      this.globalProgress = newGlobalProgress;

      if (this.onProgressChange) {
        this.onProgressChange({
          globalProgress: this.globalProgress,
          oldGlobalProgress: oldProgress,
          currentChapter: this.currentChapterIndex,
          chapterProgress: chapterProgress,
          totalChapters: this.totalChapters,
        });
      }
    }
  }

  /**
   * 设置全局进度
   * @param {number} progress - 全局进度(0-1)
   * @param {boolean} smooth - 是否平滑滚动
   */
  async setGlobalProgress(progress, smooth = true) {
    const clampedProgress = Math.max(0, Math.min(1, progress));

    // 计算目标章节和章节内进度
    const targetPosition = clampedProgress * this.totalChapters;
    const targetChapterIndex = Math.floor(targetPosition);
    const targetChapterProgress = targetPosition - targetChapterIndex;

    // 确保目标章节在有效范围内
    const finalChapterIndex = Math.min(
      targetChapterIndex,
      this.totalChapters - 1
    );
    const finalChapterProgress =
      finalChapterIndex === this.totalChapters - 1
        ? Math.min(targetChapterProgress, 1)
        : targetChapterProgress;

    await this.goToChapter(finalChapterIndex, finalChapterProgress, smooth);
  }

  /**
   * 跳转到指定章节和位置
   * @param {number} chapterIndex - 章节索引
   * @param {number} progress - 章节内进度(0-1)
   * @param {boolean} smooth - 是否平滑滚动
   */
  async goToChapter(chapterIndex, progress = 0, smooth = true) {
    // 确保章节已加载
    await this.loadChapter(chapterIndex);

    // 切换到目标章节
    this.setCurrentChapter(chapterIndex);

    // 设置章节内进度
    const chapter = this.chapters.get(chapterIndex);
    if (chapter && chapter.renderer) {
      chapter.renderer.setProgress(progress, smooth);
    }
  }

  /**
   * 下一章
   * @param {boolean} smooth - 是否平滑滚动
   */
  async nextChapter(smooth = true) {
    if (this.currentChapterIndex < this.totalChapters - 1) {
      await this.goToChapter(this.currentChapterIndex + 1, 0, smooth);
    }
  }

  /**
   * 上一章
   * @param {boolean} smooth - 是否平滑滚动
   */
  async previousChapter(smooth = true) {
    if (this.currentChapterIndex > 0) {
      await this.goToChapter(this.currentChapterIndex - 1, 1, smooth);
    }
  }

  /**
   * 全局向下翻页
   * @param {boolean} smooth - 是否平滑滚动
   */
  async pageDown(smooth = true) {
    const currentChapter = this.chapters.get(this.currentChapterIndex);
    if (!currentChapter) return;

    const progressInfo = currentChapter.renderer.getProgressInfo();

    // 如果当前章节还没到底部，在章节内翻页
    if (!progressInfo.isAtBottom) {
      currentChapter.renderer.pageDown(smooth);
    } else {
      // 如果已到章节底部，跳转到下一章
      await this.nextChapter(smooth);
    }
  }

  /**
   * 全局向上翻页
   * @param {boolean} smooth - 是否平滑滚动
   */
  async pageUp(smooth = true) {
    const currentChapter = this.chapters.get(this.currentChapterIndex);
    if (!currentChapter) return;

    const progressInfo = currentChapter.renderer.getProgressInfo();

    // 如果当前章节还没到顶部，在章节内翻页
    if (!progressInfo.isAtTop) {
      currentChapter.renderer.pageUp(smooth);
    } else {
      // 如果已到章节顶部，跳转到上一章末尾
      await this.previousChapter(smooth);
    }
  }

  /**
   * 跳转到书籍开头
   * @param {boolean} smooth - 是否平滑滚动
   */
  async goToStart(smooth = true) {
    await this.goToChapter(0, 0, smooth);
  }

  /**
   * 跳转到书籍结尾
   * @param {boolean} smooth - 是否平滑滚动
   */
  async goToEnd(smooth = true) {
    await this.goToChapter(this.totalChapters - 1, 1, smooth);
  }

  /**
   * 获取全局进度信息
   * @returns {BookProgress}
   */
  getBookProgress() {
    const currentChapter = this.chapters.get(this.currentChapterIndex);
    const chapterProgress = currentChapter ? currentChapter.progress : 0;

    return {
      globalProgress: this.globalProgress,
      currentChapter: this.currentChapterIndex,
      chapterProgress: chapterProgress,
      totalChapters: this.totalChapters,
      isAtStart: this.currentChapterIndex === 0 && chapterProgress === 0,
      isAtEnd:
        this.currentChapterIndex === this.totalChapters - 1 &&
        chapterProgress >= 1,
    };
  }

  /**
   * 获取章节列表
   * @returns {Array}
   */
  getChapterList() {
    return this.chapterConfigs.map((config, index) => ({
      index,
      title: config.title,
      id: config.id,
      loaded: this.loadedChapters.has(index),
      visible: this.visibleChapters.has(index),
      current: index === this.currentChapterIndex,
      progress: this.chapters.get(index)?.progress || 0,
    }));
  }

  /**
   * 设置主题
   * @param {Object} theme - 主题配置
   */
  setTheme(theme) {
    this.theme = { ...this.theme, ...theme };

    // 更新所有已加载章节的主题
    for (const chapter of this.chapters.values()) {
      if (chapter.loaded && chapter.renderer) {
        chapter.renderer.setTheme(theme);
      }
    }
  }

  /**
   * 更新缓存队列
   * @param {number} chapterIndex - 章节索引
   */
  updateCacheQueue(chapterIndex) {
    if (!this.enableCache) return;

    // 移除已存在的索引
    const existingIndex = this.cacheQueue.indexOf(chapterIndex);
    if (existingIndex > -1) {
      this.cacheQueue.splice(existingIndex, 1);
    }

    // 添加到队列末尾
    this.cacheQueue.push(chapterIndex);

    // 如果超出缓存大小限制，移除最旧的章节
    while (this.cacheQueue.length > this.maxCacheSize) {
      const oldestChapter = this.cacheQueue.shift();
      this.unloadChapter(oldestChapter);
    }
  }

  /**
   * 卸载章节
   * @param {number} chapterIndex - 章节索引
   */
  unloadChapter(chapterIndex) {
    // 不卸载当前可见的章节和相邻章节
    if (
      Math.abs(chapterIndex - this.currentChapterIndex) <= this.preloadRadius
    ) {
      return;
    }

    const chapter = this.chapters.get(chapterIndex);
    if (chapter && chapter.loaded) {
      chapter.loaded = false;
      chapter.contentHeight = 0;
      chapter.progress = 0;

      // 清理渲染器状态（但保留实例）
      if (chapter.renderer) {
        chapter.renderer.fullLayoutData = null;
        chapter.renderer.renderChunks.clear();
      }

      this.loadedChapters.delete(chapterIndex);
    }
  }

  /**
   * 清理所有章节
   */
  clearAllChapters() {
    // 销毁所有渲染器
    for (const chapter of this.chapters.values()) {
      if (chapter.renderer) {
        chapter.renderer.destroy();
      }
      if (chapter.container && chapter.container.parentNode) {
        chapter.container.parentNode.removeChild(chapter.container);
      }
    }

    this.chapters.clear();
    this.loadedChapters.clear();
    this.visibleChapters.clear();
    this.cacheQueue = [];
  }

  /**
   * 销毁管理器
   */
  destroy() {
    // 清理定时器
    if (this.progressUpdateTimer) {
      clearTimeout(this.progressUpdateTimer);
      this.progressUpdateTimer = null;
    }

    // 清理所有章节
    this.clearAllChapters();

    // 清理回调函数
    this.onProgressChange = null;
    this.onChapterChange = null;
    this.onChapterLoad = null;

    // 清理引用
    this.container = null;
    this.chapterConfigs = [];
  }
}

export default MultiChapterManager;
