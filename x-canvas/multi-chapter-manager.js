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
 */

/**
 * @typedef {Object} MultiChapterConfig
 * @property {HTMLElement} container - 主容器元素
 * @property {Object} [theme] - 全局主题配置
 * @property {string} [mode='vertical'] - 渲染模式：'vertical' | 'horizontal'
 * @property {Function} [onProgressChange] - 全局进度变化回调
 * @property {Function} [onChapterChange] - 章节变化回调
 * @property {Function} [onChapterLoad] - 章节加载回调
 */

export class MultiChapterManager {
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
          faction: 0,
          scrollLength: 0,
          scrollOffset: 0,
          totalPages: 0,
          currentPage: 0,
        },
        loadContent: config.loadContent,
      };

      this.chapters.set(config.index, chapterInstance);
    }
  }

  async startRead(chapterIndex = 0, progress = 0) {
    this.currentChapterIndex = chapterIndex;
    await this.loadChapter(chapterIndex, progress);
    this.readMode.setOffset(this.activeChapter.progress.scrollOffset);
  }

  /**
   * 跳转到指定章节和位置
   * @param {number} chapterIndex - 章节索引
   */
  async goToChapter(chapterIndex) {
    // 确保章节已加载
    this.currentChapterIndex = chapterIndex;
    await this.loadChapter(chapterIndex, 0);
    // 手动更新当前章节索引（因为滚动事件可能还没触发）
  }

  async reCalculateBaseScrollOffset() {
    let baseScrollOffset = 0;
    for (let i = 0; i < this.totalChapters; i++) {
      const chapter = this.chapters.get(i);
      if (chapter.loaded) {
        chapter.baseScrollOffset = baseScrollOffset;
      }
      baseScrollOffset +=
        chapter.progress.totalPages * this.readMode.baseOffset;
    }
  }

  /**
   * 加载指定章节
   * @param {number} chapterIndex - 章节索引
   * @param {number} progress - 章节内进度(0-1)
   */
  async loadChapter(chapterIndex, progress = 0) {
    const chapter = this.chapters.get(chapterIndex);
    if (!chapter || chapter.loaded) {
      return;
    }
    chapter.loaded = true;
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
      await chapter.renderer.layout(htmlContent);

      chapter.progress.faction = progress;

      const totalPages = chapter.renderer.fullLayoutData?.totalChunks || 0;
      chapter.progress.totalPages = totalPages;
      chapter.progress.currentPage = Math.ceil(progress * totalPages) || 1;
      chapter.progress.scrollLength = totalPages * this.readMode.baseOffset;

      chapter.progress.scrollOffset =
        chapter.progress.faction * chapter.progress.scrollLength;

      chapter.renderer.viewport.setProgress(chapter.progress.scrollOffset);

      // 计算章节偏移量
      this.reCalculateBaseScrollOffset();

      chapter.renderer.render();
      const nextChapterContainer = this.chapters.get(chapterIndex + 1)?.renderer
        ?.container;

      this.readMode.insertChapter(
        chapterIndex,
        chapter.renderer.container,
        nextChapterContainer
      );
    } catch (error) {
      console.error(`Failed to load chapter ${chapterIndex}:`, error);
    }
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

  /** @type {number} 滚动位置 */
  globalScrollTop = 0;

  /** @type {string} 滚动方向 */
  scrollDirection = '';

  lastTouchY = 0;

  /** @type {IntersectionObserver} 当前活跃章节观察器 */
  activeObserver = null;

  loadIndicator = {
    node: null,
    loading: false,
  };

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
    this.setupLoadingIndicator();
    // 保留活跃章节观察器
    this.activeObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const chapterIndex = +entry.target.dataset.chapterIndex;
          if (entry.isIntersecting) {
            this.manager.currentChapterIndex = chapterIndex;
            return;
          }
          if (!entry.isIntersecting && this.scrollDirection === 'up') {
            this.manager.currentChapterIndex = chapterIndex - 1;
            return;
          }
        });
      },
      {
        root: this.container,
        threshold: 1,
      }
    );

    this.bindScrollEvents();
  }

  /**
   * 设置活跃章节哨兵
   * @param {number} chapterIndex - 章节索引
   * @param {HTMLElement} chapterContainer - 章节容器
   */
  setActiveSentinel(chapterIndex, chapterContainer) {
    const activeSentinel = document.createElement('div');
    activeSentinel.dataset.chapterIndex = chapterIndex;
    activeSentinel.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 1px;
        background-color: transparent;
        z-index: 9999;
        pointer-events: none;
      `;
    chapterContainer.appendChild(activeSentinel);
    this.activeObserver.observe(activeSentinel);
  }

  setupLoadingIndicator() {
    const node = document.createElement('div');
    node.style.cssText = `
      position: absolute;
      left: 0;
      right: 0;
      height: 50px;
      background: rgba(0, 0, 0, 0.2);
      color: white;
      font-size: 14px;
      z-index: 10000;
      display: none;
      justify-content: center;
      align-items: center;
      pointer-events: none;
      user-select: none;
    `;
    this.container.appendChild(node);
    this.loadIndicator = {
      ...this.loadIndicator,
      node,
      /**
       * @param {'top' | 'bottom'} direction
       */
      show: (direction) => {
        node?.style[direction] = 0;
        node?.style.display = 'flex';
      },
      hide: () => {
        node?.style.display = 'none';
      },
    };
  }

  /**
   * 插入章节
   * @param {number} chapterIndex - 章节索引
   * @param {HTMLElement} chapterContainer - 章节容器
   * @param {HTMLElement} nextChapterContainer - 下一章节容器
   */
  insertChapter(chapterIndex, chapterContainer, nextChapterContainer) {
    this.container.insertBefore(chapterContainer, nextChapterContainer);
    this.setActiveSentinel(chapterIndex, chapterContainer);
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

    this.container.addEventListener(
      'touchmove',
      this.handleTouchMove.bind(this),
      { passive: false }
    );

  }

  /**
   * 处理触摸移动事件
   */
  handleTouchMove(event) {
    if (this.loadIndicator.loading) {
      return;
    }
    const currentTouchY = event.touches[0].clientY;
    const deltaY = currentTouchY - this.lastTouchY;
    this.lastTouchY = currentTouchY;

    if (deltaY > 0 && this.globalScrollTop === 0) {
      this.loadPreviousChapter();
    } else if (
      deltaY < 0 &&
      this.globalScrollTop === this.container.scrollHeight - this.baseOffset
    ) {
      this.loadNextChapter();
    }
    this.loadIndicator.loading = true;
  }

  /**
   * 加载上一章
   */
  async loadPreviousChapter() {
    if (this.manager.currentChapterIndex > 0) {
      this.loadIndicator.show('top');
      await this.manager.loadChapter(this.manager.currentChapterIndex - 1, 1);
      this.loadIndicator.hide();
    }
  }

  /**
   * 加载下一章
   */
  async loadNextChapter() {
    if (this.manager.currentChapterIndex < this.manager.totalChapters - 1) {
      this.loadIndicator.show('bottom');
      await this.manager.loadChapter(this.manager.currentChapterIndex + 1, 0);
      this.loadIndicator.hide();
    }
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

      this.scrollDirection =
        this.container.scrollTop > this.globalScrollTop ? 'down' : 'up';

      this.globalScrollTop = this.container.scrollTop;

      const relativeScrollTop =
        this.globalScrollTop - this.manager.activeChapter.baseScrollOffset;
      const { activeChapter } = this.manager;

      // 将滚动状态传递给当前活跃的章节
      const currentPage = Math.floor(
        (relativeScrollTop + this.baseOffset) / this.baseOffset
      );
      activeChapter.progress.currentPage = currentPage;

      // FIXME: 不代表阅读进度，如果向下滚动 faction 就是 0
      activeChapter.progress.faction =
        (relativeScrollTop + this.baseOffset) /
        activeChapter.progress.scrollLength;

      activeChapter.progress.scrollOffset = relativeScrollTop;

      // 传递滚动状态给当前活跃的章节渲染器
      this.manager.activeChapter.renderer.viewport.setScrollState(
        relativeScrollTop
      );
    });
  }

  setOffset(offset) {
    this.container.scrollTop = offset;
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

    // 清理观察器
    if (this.activeObserver) {
      this.activeObserver.disconnect();
      this.activeObserver = null;
    }

    // 移除事件监听器
    if (this.container) {
      this.container.removeEventListener('scroll', this.handleGlobalScroll);
      this.container.removeEventListener('touchmove', this.handleTouchMove);
    }
    this.loadIndicator.node = null;
    this.loadIndicator.loading = false;

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

  setOffset(offset) {
    this.container.style.transform = `translateX(${offset}px)`;
  }

  /**
   * 插入章节
   * @param {HTMLElement} chapterContainer - 章节容器
   * @param {HTMLElement} nextChapterContainer - 下一章节容器
   */
  insertChapter(chapterIndex, chapterContainer, nextChapterContainer) {
    this.container.insertBefore(chapterContainer, nextChapterContainer);
    if (this.manager.activeChapter.progress.currentPage === 1) {
      this.manager.loadChapter(chapterIndex - 1, 1);
    }
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
  animateContainerToChapter() {
    const animationDuration = 300;
    const { currentPage } = this.activeChapter.progress;
    const scrollLeft =
      (currentPage - 1) * this.baseOffset + this.activeChapter.baseScrollOffset;

    // 对容器应用过渡动画
    this.manager.container.style.transition = `transform ${animationDuration}ms ease-out`;
    this.manager.container.style.transform = `translateX(${scrollLeft}px)`;

    setTimeout(() => {
      // 动画结束后清除过渡效果
      this.manager.container.style.transition = '';
    }, animationDuration);
  }

  setOffset(offset) {
    this.container.style.transform = `translateX(${offset}px)`;
  }

  /**
   * 回弹到当前章节
   */
  snapToCurrentChapter() {
    this.animateContainerToChapter();
  }

  /**
   * 下一页
   */
  async nextPage() {
    const activeChapter = this.manager.activeChapter;

    const { currentPage, totalPages } = activeChapter.progress;
    const nextPage = currentPage + 1;
    if (currentPage === totalPages) {
      if (activeChapter.sectionIndex < this.manager.totalChapters - 1) {
        this.manager.currentChapterIndex++;
        await this.manager.loadChapter(this.manager.currentChapterIndex, 0);
        this.goToPage(1);
      } else {
        this.snapToCurrentChapter();
      }
      return;
    }
    this.goToPage(nextPage);
  }

  /**
   * 上一页
   */
  async previousPage() {
    const activeChapter = this.manager.activeChapter;
    const { currentPage, totalPages } = activeChapter.progress;

    const previousPage = currentPage - 1;
    if (currentPage === 1) {
      if (activeChapter.sectionIndex > 0) {
        this.manager.currentChapterIndex--;
        await this.manager.loadChapter(this.manager.currentChapterIndex, 1);
        this.goToPage(totalPages);
      } else {
        this.snapToCurrentChapter();
      }
      return;
    }
    this.goToPage(previousPage);
  }

  /**
   * 跳转到指定页面
   * @param {number} pageIndex - 页面索引
   */
  goToPage(pageIndex) {
    const activeChapter = this.manager.activeChapter;

    const { currentPage: oldPage } = activeChapter.progress;

    activeChapter.progress.currentPage = pageIndex;

    activeChapter.progress.faction =
      (pageIndex * this.baseOffset) / activeChapter.progress.scrollLength;

    activeChapter.progress.scrollOffset = oldPage * this.baseOffset;
    // 设置页面状态和Canvas重定位
    activeChapter.renderer.viewport.setCurrentPage(pageIndex, oldPage);

    // 执行页面切换动画
    this.animateContainerToChapter();

    if (totalPages - currentPage < 2) {
      this.manager.loadChapter(this.manager.currentChapterIndex + 1, 0);
    }
    if (currentPage < 2) {
      this.manager.loadChapter(this.manager.currentChapterIndex - 1, 1);
    }
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
