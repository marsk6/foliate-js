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
 * @property {number} sectionIndex - 章节索引
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
 * @property {string} [mode='vertical'] - 渲染模式：'vertical' | 'horizontal'
 * @property {Function} [onProgressChange] - 全局进度变化回调
 * @property {Function} [onChapterChange] - 章节变化回调
 * @property {Function} [onChapterLoad] - 章节加载回调
 * @property {number} [preloadRadius=1] - 预加载半径(前后章节数)
 * @property {number} [preloadThreshold=0.95] - 预加载触发阈值(0-1)
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

  /** @type {number} 预加载触发阈值 */
  preloadThreshold = 0.95;

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

  // 统一滚动管理（新增）
  /** @type {number} 滚动事件节流定时器 */
  scrollThrottleId = null;

  /** @type {Map<number, number>} 章节起始位置映射 */
  chapterOffsets = new Map();

  /** @type {number} 全局滚动位置 */
  globalScrollTop = 0;

  get activeChapter() {
    return this.chapters.get(this.currentChapterIndex);
  }

  /**
   * @param {MultiChapterConfig} config
   */
  constructor(config) {
    this.config = config;
    this.theme = config.theme || {};
    this.mode = config.mode || 'vertical';

    // 设置回调函数
    this.onProgressChange = config.onProgressChange;
    this.onChapterChange = config.onChapterChange;
    this.onChapterLoad = config.onChapterLoad;

    // 配置选项
    this.preloadRadius = config.preloadRadius ?? 1;
    this.preloadThreshold = config.preloadThreshold ?? 0.95;
    this.enableCache = config.enableCache ?? true;
    this.maxCacheSize = config.maxCacheSize ?? 5;
    
    this.setupContainer();
  }

  /**
   * 设置主容器
   */
  setupContainer() {
    this.container = document.createElement('div');
    this.container.className = 'multi-chapter-container';
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    this.container.style.cssText = `
      position: relative;
      width: ${viewportWidth}px;
      height: ${viewportHeight}px;
      overflow: auto;
    `;
    this.config.el.parentNode.replaceChild(this.container, this.config.el);
    
    // 绑定统一的滚动事件监听
    this.bindScrollEvents();
  }

  /**
   * 绑定滚动事件
   */
  bindScrollEvents() {
    this.container.addEventListener('scroll', this.handleGlobalScroll.bind(this), {
      passive: true,
    });
    let lastTouchY = 0;
    let lastScrollTop = 0;
    this.container.addEventListener('touchmove', (e) => {
      e.preventDefault();
      const touchY = e.touches[0].clientY;
      if (touchY > lastTouchY && this.container.scrollTop === lastScrollTop) {
        this.preloadNextChapter(this.currentChapterIndex);
      }
      lastTouchY = touchY;
      lastScrollTop = this.container.scrollTop;
    });
  }

  /**
   * 处理全局滚动事件
   */
  handleGlobalScroll() {
    // 节流处理
    if (this.scrollThrottleId) {
      return;
    }

    this.scrollThrottleId = requestAnimationFrame(() => {
      this.scrollThrottleId = null;
      this.updateGlobalScrollState();
    });
  }

  /**
   * 更新全局滚动状态
   */
  updateGlobalScrollState() {
    this.globalScrollTop = this.container.scrollTop;

    // 计算当前应该活跃的章节
    const activeChapterIndex = this.calculateActiveChapter(this.globalScrollTop);
    
    // 如果章节发生变化，更新当前章节
    if (activeChapterIndex !== this.currentChapterIndex) {
      this.currentChapterIndex = activeChapterIndex;
      if (this.onChapterChange) {
        this.onChapterChange(activeChapterIndex);
      }
    }

    // 将滚动状态传递给当前活跃的章节
    this.distributeScrollState(activeChapterIndex, this.globalScrollTop);

    // 更新全局进度
    this.updateGlobalProgress();
  }

  /**
   * 根据全局滚动位置计算当前活跃的章节
   * @param {number} globalScrollTop - 全局滚动位置
   * @returns {number} 章节索引
   */
  calculateActiveChapter(globalScrollTop) {
    let activeChapterIndex = 0;

    for (const [chapterIndex, offset] of this.chapterOffsets) {
      if (globalScrollTop >= offset) {
        activeChapterIndex = chapterIndex;
      } else {
        break;
      }
    }

    return activeChapterIndex;
  }

  /**
   * 将滚动状态分发给相应的章节
   * @param {number} activeChapterIndex - 活跃章节索引
   * @param {number} globalScrollTop - 全局滚动位置
   */
  distributeScrollState(activeChapterIndex, globalScrollTop) {
    const activeChapter = this.chapters.get(activeChapterIndex);
    if (!activeChapter || !activeChapter.renderer) {
      return;
    }

    // 计算相对于当前章节的滚动位置
    const chapterOffset = this.chapterOffsets.get(activeChapterIndex) || 0;
    const relativeScrollTop = globalScrollTop - chapterOffset;

    // 传递滚动状态给当前活跃的章节渲染器
    activeChapter.renderer.setScrollState(relativeScrollTop, window.innerHeight);
  }

  /**
   * 预加载下一章节
   * @param {number} currentChapterIndex - 当前章节索引
   */
  async preloadNextChapter(currentChapterIndex) {
    const nextChapterIndex = currentChapterIndex + 1;

    // 检查是否有下一章节且未加载
    if (
      nextChapterIndex < this.totalChapters &&
      !this.loadedChapters.has(nextChapterIndex)
    ) {
      try {
        // 异步预加载下一章节，不阻塞当前滚动
        await this.loadChapter(nextChapterIndex);
      } catch (error) {
        console.error(`预加载章节 ${nextChapterIndex} 失败:`, error);
      }
    }
  }

  /**
   * 初始化书籍
   * @param {Array<ChapterConfig>} chaptersConfig - 章节配置数组
   */
  async initBook(chaptersConfig) {
    this.chapterConfigs = chaptersConfig;
    this.totalChapters = chaptersConfig.length;

    // 创建章节实例（但不立即加载内容）
    for (let i = 0; i < chaptersConfig.length; i++) {
      const config = chaptersConfig[i];
      const chapterInstance = {
        sectionIndex: config.index,
        title: config.title,
        renderer: null, // 延迟创建
        contentHeight: 0,
        progress: 0,
        loadContent: config.loadContent,
        metadata: config.metadata || {},
      };

      this.chapters.set(config.index, chapterInstance);
    }
  }

  async slideChapter() {
    this.currentChapterIndex++;
    await this.goToChapter(this.currentChapterIndex, 0, true);
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
    
    // 获取章节偏移量
    const chapterOffset = this.chapterOffsets.get(chapterIndex) || 0;
    
    // 计算章节内的目标位置
    const chapter = this.chapters.get(chapterIndex);
    if (!chapter) return;
    
    const chapterHeight = chapter.contentHeight || 0;
    const targetOffsetInChapter = chapterHeight * progress;
    
    // 计算全局滚动位置
    const globalScrollTop = chapterOffset + targetOffsetInChapter;
    
    // 滚动到目标位置
    this.container.scrollTo({
      top: globalScrollTop,
      behavior: smooth ? 'smooth' : 'instant'
    });

    // 手动更新当前章节索引（因为滚动事件可能还没触发）
    this.currentChapterIndex = chapterIndex;

    if (this.onChapterChange) {
      this.onChapterChange(chapterIndex);
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
      // 创建渲染器实例（如果还没有）
      if (!chapter.renderer) {
        chapter.renderer = new VirtualCanvasRenderer({
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
      await chapter.renderer.render(htmlContent);
      chapter.contentHeight = chapter.renderer.fullLayoutData?.totalHeight || 0;

      // chapter.container 就是 VirtualCanvasRenderer 的 container
      chapter.container = chapter.renderer.container;

      chapter.loaded = true;
      this.loadedChapters.add(chapterIndex);
      
      // 计算并更新章节偏移量
      this.updateChapterOffsets(chapterIndex);
      
      const nextChapterContainer = this.chapters.get(chapterIndex + 1)?.container;
      this.container.insertBefore(chapter.container, nextChapterContainer);

      if (this.onChapterLoad) {
        this.onChapterLoad(chapterIndex);
      }
    } catch (error) {
      console.error(`Failed to load chapter ${chapterIndex}:`, error);
    }
  }

  /**
   * 更新章节偏移量映射
   * @param {number} loadedChapterIndex - 刚加载的章节索引
   */
  updateChapterOffsets(loadedChapterIndex) {
    // 重新计算所有章节的偏移量
    let currentOffset = 0;
    
    for (let i = 0; i < this.totalChapters; i++) {
      this.chapterOffsets.set(i, currentOffset);
      
      const chapter = this.chapters.get(i);
      if (chapter && chapter.loaded) {
        currentOffset += chapter.contentHeight;
      } else {
        // 对于未加载的章节，使用估计高度或默认高度
        const estimatedHeight = chapter?.metadata?.estimatedHeight || window.innerHeight;
        currentOffset += estimatedHeight;
      }
    }
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

    // 当章节进度达到预设阈值时，预加载下一章节
    if (progressInfo.progress >= this.preloadThreshold) {
      this.preloadNextChapter(chapterIndex);
    }

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

    // 清理滚动节流定时器
    if (this.scrollThrottleId) {
      cancelAnimationFrame(this.scrollThrottleId);
      this.scrollThrottleId = null;
    }

    // 移除滚动事件监听器
    if (this.container) {
      this.container.removeEventListener('scroll', this.handleGlobalScroll);
    }

    // 清理所有章节
    this.clearAllChapters();

    // 清理回调函数
    this.onProgressChange = null;
    this.onChapterChange = null;
    this.onChapterLoad = null;

    // 清理滚动管理相关数据
    this.chapterOffsets.clear();
    this.globalScrollTop = 0;

    // 清理引用
    this.container = null;
    this.chapterConfigs = [];
  }
}

export default MultiChapterManager;
