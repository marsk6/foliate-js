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

  /** @type {ScrollManager | SlideManager} 阅读模式 滚动管理器 或 滑动管理器  */
  readMode = null;

  get activeChapter() {
    return this.chapters.get(this.currentChapterIndex);
  }

  /**
   * @param {MultiChapterConfig} config
   */
  constructor(config) {
    this.config = config;
    this.state = {
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    };
    this.theme = config.theme || {};
    this.mode = config.mode || 'vertical';
    this.setupContainer();
    window.CM = this;
  }

  /**
   * 设置主容器
   */
  setupContainer() {
    // 初始化专用管理器
    this.readMode =
      this.mode === 'vertical'
        ? new ScrollManager(this)
        : new SlideManager(this);

    this.config.el.parentNode.replaceChild(
      this.readMode.container,
      this.config.el
    );
  }

  /**
   * 初始化书籍
   * @param {Array<ChapterConfig>} chaptersConfig - 章节配置数组
   */
  async addBook(chaptersConfig) {
    this.chapterConfigs = chaptersConfig;
    this.totalChapters = chaptersConfig.length;

    // 创建章节实例（但不立即加载内容）
    for (let i = 0; i < chaptersConfig.length; i++) {
      const config = chaptersConfig[i];
      const chapterInstance = {
        sectionIndex: config.index,
        title: config.title,
        renderer: null, // 延迟创建
        baseScrollOffset: 0,
        progress: {
          totalPages: 0,
          currentPage: 0,
        },
        loadContent: config.loadContent,
      };

      this.chapters.set(config.index, chapterInstance);
    }
  }

  startRead() {
    // TODO: 根据参数从哪里开始，先默认是是 0
    this.goToChapter(0, 0);
    // this.readMode.startRead();
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
    // 手动更新当前章节索引（因为滚动事件可能还没触发）
    this.currentChapterIndex = chapterIndex;
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
        });
      }

      // 加载章节内容
      const htmlContent = await chapter.loadContent();

      // 渲染章节内容
      await chapter.renderer.render(htmlContent);
      chapter.progress.totalPages =
        chapter.renderer.fullLayoutData?.totalChunks || 0;
      chapter.progress.currentPage = 1;

      chapter.loaded = true;

      if (chapterIndex === 0) {
        chapter.baseScrollOffset = 0;
      } else {
        const previousChapter = this.chapters.get(chapterIndex - 1);
        chapter.baseScrollOffset =
          previousChapter.baseScrollOffset +
          previousChapter.progress.totalPages * this.readMode.baseOffset;
      }

      const nextChapterContainer = this.chapters.get(chapterIndex + 1).renderer
        ?.container;
      chapter.renderer.container.dataset.chapterIndex = chapterIndex;
      this.readMode.insertChapter(
        chapter.renderer.container,
        nextChapterContainer
      );

      if (chapter.progress.totalPages === 1) {
        this.loadChapter(chapterIndex - 1);
        this.loadChapter(chapterIndex + 1);
      }
    } catch (error) {
      console.error(`Failed to load chapter ${chapterIndex}:`, error);
    }
  }

  /**
   * 更新全局进度
   */
  updateGlobalProgress(currentPage) {
    const faction = currentPage / this.activeChapter.progress.totalPages;
    if (faction > 0.9) {
      this.loadChapter(this.currentChapterIndex + 1);
    }
  }

  /**
   * 下一章
   */
  async nextChapter() {
    if (this.activeChapter.sectionIndex + 1 < this.totalChapters) {
      await this.goToChapter(this.currentChapterIndex + 1, 0);
    }
  }

  /**
   * 上一章
   */
  async previousChapter() {
    if (this.activeChapter.sectionIndex > 0) {
      await this.goToChapter(this.activeChapter.sectionIndex - 1, 1);
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

class ReadMode {
  baseOffset = 0;
}

/**
 * 滚动管理器 - 处理垂直滚动逻辑
 */
class ScrollManager extends ReadMode {
  /** @type {HTMLElement} 滚动容器 */
  container = null;

  /** @type {MultiChapterManager} 管理器 */
  manager = null;

  observer = null;

  constructor(manager) {
    super();
    this.manager = manager;
    this.baseOffset = manager.state.viewportHeight;
    this.scrollThrottleId = null;
    this.globalScrollTop = 0;
    this.chapterOffsets = new Map();
    this.setupContainer();
  }

  setupContainer() {
    this.container = document.createElement('div');
    this.container.className = 'multi-chapter-container';
    const { viewportWidth, viewportHeight } = this.manager.state;
    this.container.style.cssText = `
      position: relative;
      width: ${viewportWidth}px;
      height: ${viewportHeight}px;
      overflow: auto;
    `;
    this.observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        console.log('🚨🚨🚨👉👉📢', 'entry', entry);
        if (entry.isIntersecting) {
          const chapterIndex = +entry.target.dataset.chapterIndex;
          this.manager.currentChapterIndex = chapterIndex;
        }
      });
    }, {
      root: this.container,
      threshold: 0.5,
    });
    this.observer.observe(this.container);

    this.bindScrollEvents();
  }

  insertChapter(chapter, nextChapter) {
    this.container.insertBefore(chapter, nextChapter);
    this.observer.observe(chapter);
  }

  /**
   * 绑定滚动事件
   */
  bindScrollEvents() {
    // 垂直模式：监听滚动事件
    this.container.addEventListener(
      'scroll',
      this.handleGlobalScroll.bind(this),
      {
        passive: true,
      }
    );
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

      this.globalScrollTop = this.container.scrollTop;

      const relativeScrollTop =
        this.globalScrollTop - this.manager.activeChapter.baseScrollOffset;
      // 将滚动状态传递给当前活跃的章节
      const currentPage = Math.ceil(relativeScrollTop / this.baseOffset);

      this.manager.updateGlobalProgress(currentPage);
      // 传递滚动状态给当前活跃的章节渲染器
      this.manager.activeChapter.renderer.viewport.setScrollState(
        relativeScrollTop
      );
    });
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
   * 清理滚动管理器
   */
  destroy() {
    // 清理滚动节流定时器
    if (this.scrollThrottleId) {
      cancelAnimationFrame(this.scrollThrottleId);
      this.scrollThrottleId = null;
    }

    // 移除滚动事件监听器
    if (this.container) {
      this.container.removeEventListener('scroll', this.handleGlobalScroll);
    }

    // 清理滚动管理相关数据
    this.chapterOffsets.clear();
    this.globalScrollTop = 0;
  }
}

/**
 * 滑动管理器 - 处理横向滑动逻辑
 */
class SlideManager extends ReadMode {
  /** @type {HTMLElement} 滑动容器 */
  container = null;

  /** @type {MultiChapterManager} 管理器 */
  manager = null;

  constructor(manager) {
    super();
    this.manager = manager;
    this.baseOffset = manager.state.viewportWidth;

    this.touchStartX = 0;
    this.touchStartTime = 0;
    this.isTouching = false;
    this.isAnimating = false;
    this.setupContainer();
  }

  setupContainer() {
    this.container = document.createElement('div');
    this.container.className = 'multi-chapter-container';
    const { viewportWidth } = this.manager.state;
    this.container.style.cssText = `
        position: relative;
        height: 100%;
        min-width: ${viewportWidth}px;
        transform: translateX(0px);
        will-change: transform;
    `;
    this.bindSlideEvents();
  }


  insertChapter(chapter, nextChapter) {
    this.container.insertBefore(chapter, nextChapter);
  }

  /**
   * 绑定滑动事件
   */
  bindSlideEvents() {
    // 横向模式：监听触摸事件
    this.container.addEventListener(
      'touchstart',
      this.handleTouchStart.bind(this),
      { passive: false }
    );
    this.container.addEventListener(
      'touchmove',
      this.handleTouchMove.bind(this),
      { passive: false }
    );
    this.container.addEventListener(
      'touchend',
      this.handleTouchEnd.bind(this),
      { passive: false }
    );
  }

  /**
   * 处理触摸开始事件
   * @param {TouchEvent} event
   */
  handleTouchStart(event) {
    const startX = event.touches[0].clientX;
    if (this.isAnimating) return false;

    this.touchStartX = startX;
    this.touchStartTime = Date.now();
    this.isTouching = true;
  }

  /**
   * 处理触摸移动事件
   * @param {TouchEvent} event
   */
  handleTouchMove(event) {
    const currentX = event.touches[0].clientX;
    if (!this.isTouching || this.isAnimating) return false;

    const deltaX = currentX - this.touchStartX;

    // 实时更新滚动内容位置（但不改变页面状态）
    this.updateContainerTransform(deltaX);
  }

  /**
   * 处理触摸结束事件
   * @param {TouchEvent} event
   */
  handleTouchEnd(event) {
    const activeChapter = this.manager.chapters.get(
      this.manager.currentChapterIndex
    );
    if (
      !activeChapter ||
      !activeChapter.renderer ||
      !activeChapter.renderer.viewport
    ) {
      return;
    }
    if (!this.isTouching) return false;

    this.isTouching = false;

    const endX = event.changedTouches[0].clientX;
    const deltaX = endX - this.touchStartX;
    const deltaTime = Date.now() - this.touchStartTime;

    // 分发给当前活跃章节的滑动管理器
    this.handleSwipeGesture(deltaX, deltaTime);
  }

  /**
   * 处理滑动手势
   */
  handleSwipeGesture(deltaX, deltaTime) {
    const absDeltaX = Math.abs(deltaX);
    const minSwipeDistance = 50;
    const maxSwipeTime = 300;
    const isQuickSwipe =
      deltaTime < maxSwipeTime && absDeltaX > minSwipeDistance;
    const isLongSwipe = absDeltaX > this.manager.state.viewportWidth * 0.3; // 超过30%宽度

    if (isQuickSwipe || isLongSwipe) {
      if (deltaX > 0) {
        // 向左滑动，显示下一页
        this.nextPage();
        this.manager.activeChapter.renderer.viewport.handleSwipeLeft();
      } else {
        // 向右滑动，显示上一页
        this.previousPage();
        this.manager.activeChapter.renderer.viewport.handleSwipeRight();
      }
    } else {
      // 回弹到当前页面
      this.snapToCurrentChapter();
    }
  }

  /**
   * 更新容器变换（横向模式滑动预览）
   * @param {number} deltaX - X轴偏移量
   */
  updateContainerTransform(deltaX) {
    const maxDelta = this.manager.state.viewportWidth * 0.5; // 最大拖拽距离
    const clampedDelta = Math.max(-maxDelta, Math.min(maxDelta, deltaX));

    // 计算当前章节的基础偏移
    const baseOffset =
      -this.manager.currentChapterIndex * this.manager.state.viewportWidth;
    const totalOffset = baseOffset + clampedDelta;

    // 对整个 Manager 容器应用变换
    this.manager.container.style.transform = `translateX(${totalOffset}px)`;
  }

  /**
   * 执行容器切换动画
   * @param {number} targetChapter - 目标章节索引
   * @param {Function} [callback] - 动画完成回调
   */
  animateContainerToChapter(targetChapter, callback) {
    const animationDuration = 300;
    const targetOffset = -targetChapter * this.manager.state.viewportWidth;

    // 对容器应用过渡动画
    this.manager.container.style.transition = `transform ${animationDuration}ms ease-out`;
    this.manager.container.style.transform = `translateX(${targetOffset}px)`;

    setTimeout(() => {
      // 动画结束后清除过渡效果
      this.manager.container.style.transition = '';
      callback?.();
    }, animationDuration);
  }

  /**
   * 回弹到当前章节
   */
  snapToCurrentChapter() {
    this.animateContainerToChapter(this.manager.currentChapterIndex);
  }

  /**
   * 下一页
   */
  nextPage() {
    const activeChapter = this.manager.activeChapter;
    if (
      !activeChapter ||
      !activeChapter.renderer ||
      !activeChapter.renderer.viewport
    ) {
      return;
    }

    const viewport = activeChapter.renderer.viewport;
    const currentPage = viewport.state.currentPage;
    const totalPages = viewport.state.totalPages;

    if (currentPage < totalPages - 1) {
      // 在当前章节内翻页
      this.goToPage(currentPage + 1);
    } else {
      // 跳转到下一章节
      if (this.manager.currentChapterIndex < this.manager.totalChapters - 1) {
        this.manager.nextChapter();
      } else {
        this.snapToCurrentChapter();
      }
    }
  }

  /**
   * 上一页
   */
  previousPage() {
    const activeChapter = this.manager.activeChapter;
    if (
      !activeChapter ||
      !activeChapter.renderer ||
      !activeChapter.renderer.viewport
    ) {
      return;
    }

    const viewport = activeChapter.renderer.viewport;
    const currentPage = viewport.state.currentPage;

    if (currentPage > 0) {
      // 在当前章节内翻页
      this.goToPage(currentPage - 1);
    } else {
      // 跳转到上一章节的最后一页
      if (this.manager.currentChapterIndex > 0) {
        this.manager.previousChapter();
      } else {
        this.snapToCurrentChapter();
      }
    }
  }

  /**
   * 跳转到指定页面
   * @param {number} pageIndex - 页面索引
   */
  goToPage(pageIndex) {
    const activeChapter = this.manager.activeChapter;
    if (
      !activeChapter ||
      !activeChapter.renderer ||
      !activeChapter.renderer.viewport
    ) {
      return;
    }

    const viewport = activeChapter.renderer.viewport;

    // 检查是否可以翻页
    if (!viewport.canGoToPage(pageIndex)) {
      return;
    }

    const oldPage = viewport.state.currentPage;

    // 设置页面状态和Canvas重定位
    viewport.setCurrentPage(pageIndex, oldPage);
    viewport.setAnimating(true);

    // 执行页面切换动画
    this.animateContainerToChapter(this.manager.currentChapterIndex, () => {
      viewport.updateScrollPosition();
      viewport.setAnimating(false);
      viewport.notifyViewportChange();
    });
  }

  /**
   * 清理滑动管理器
   */
  destroy() {
    // 移除触摸事件监听器
    if (this.container) {
      this.container.removeEventListener('touchstart', this.handleTouchStart);
      this.container.removeEventListener('touchmove', this.handleTouchMove);
      this.container.removeEventListener('touchend', this.handleTouchEnd);
    }

    // 重置状态
    this.isTouching = false;
    this.isAnimating = false;
  }
}

export default MultiChapterManager;
