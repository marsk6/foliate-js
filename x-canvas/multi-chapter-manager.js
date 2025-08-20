/**
 * 多章节管理器
 * 管理多个VirtualCanvasRenderer实例，实现跨章节的阅读体验
 *
 * 核心原理（垂直滚动模式）：
 * - 利用浏览器原生的"滚动链"机制
 * - 当VirtualCanvasRenderer滚动到底时，浏览器自动让外层容器滚动
 * - 使用全局透明层和哨兵机制控制滚动事件的接收者
 * - 章节分界点哨兵出现时，显示全局透明层阻止所有章节滚动
 * - 哨兵消失时，隐藏全局透明层恢复正常滚动
 *
 * 功能特性：
 * - 章节元数据管理
 * - 多渲染器实例协调
 * - 全局透明层滚动事件隔离（仅垂直模式）
 * - 章节边界检测和切换（仅垂直模式）
 * - 智能预加载（可配置阈值触发下一章节）
 * - 全局进度计算和同步
 * - 跨章节导航和搜索
 * - 动态章节加载
 * - 统一的进度和位置管理
 *
 * 使用示例：
 * // 垂直滚动模式（支持滚动隔离）
 * const verticalManager = new MultiChapterManager({
 *   container: document.getElementById('book-container'),
 *   mode: 'vertical',
 *   theme: { baseFontSize: 18 },
 *   onProgressChange: (info) => {
 *     console.log('全书进度:', info.globalProgress);
 *   },
 *   onChapterChange: (chapterIndex) => {
 *     console.log('当前章节:', chapterIndex);
 *   }
 * });
 *
 * // 横向滑动模式（不启用滚动隔离）
 * const horizontalManager = new MultiChapterManager({
 *   container: document.getElementById('book-container'),
 *   mode: 'horizontal',
 *   theme: { baseFontSize: 18 }
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
 * @property {string} [mode='vertical'] - 渲染模式：'vertical' | 'horizontal'，滚动隔离仅在vertical模式下生效
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

  // 透明层滚动隔离机制
  /** @type {IntersectionObserver} 章节边界观察器 */
  chapterObserver = null;

  /** @type {Map<number, HTMLElement>} 章节边界哨兵映射 */
  chapterSentinels = new Map();

  /** @type {Set<number>} 已经出现过的哨兵索引（用于区分真正的消失和初次插入） */
  appearedSentinels = new Set();

  /** @type {HTMLElement} 全局透明层覆盖 */
  globalOverlayMask = null;

  /** @type {boolean} 是否启用全局透明层 */
  isGlobalMaskActive = false;

  /** @type {Set<number>} 已开始预加载的章节索引 */
  preloadingChapters = new Set();

  get activeChapter() {
    // TODO: 交叉处，返回实际操作的章节
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
    this.setupScrollIsolation();
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
    this.scrollWrapper = document.createElement('div');
    this.scrollWrapper.className = 'scroll-wrapper';
    this.scrollWrapper.style.cssText = `
      position: relative;
      width: 100%;
    `;
    this.container.appendChild(this.scrollWrapper);
    this.config.el.parentNode.replaceChild(this.container, this.config.el);
  }

  /**
   * 设置滚动隔离系统
   */
  setupScrollIsolation() {
    // 只在垂直滚动模式下启用滚动隔离系统
    if (this.mode !== 'vertical') {
      return;
    }

    // 创建全局透明覆盖层
    this.createGlobalOverlayMask();

    // 创建 IntersectionObserver 来监听章节边界
    this.chapterObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          console.log('🚨🚨🚨👉👉📢', 'entry', entry);
          const chapterIndex = parseInt(entry.target.dataset.chapterIndex);

          if (entry.isIntersecting) {
            // 哨兵出现 → 到达章节边界，需要切换控制权
            this.appearedSentinels.add(chapterIndex); // 记录这个哨兵已经出现过
            this.handleChapterBoundaryVisible(chapterIndex);
            this.preloadNextChapter(this.currentChapterIndex);
          } else {
            // 哨兵消失 → 只有之前出现过的哨兵消失才触发处理
            // 这避免了新插入的哨兵（!isIntersecting）错误触发隐藏事件
            if (this.appearedSentinels.has(chapterIndex)) {
              this.handleChapterBoundaryHidden(chapterIndex);
              this.appearedSentinels.delete(chapterIndex); // 清除记录，为下次出现做准备
            }
          }
        });
      },
      {
        root: this.container,
        rootMargin: '0px',
        threshold: 0.5,
      }
    );
  }

  /**
   * 为章节创建哨兵元素
   * @param {number} chapterIndex - 章节索引
   */
  createChapterSentinel(chapterIndex) {
    // 创建边界哨兵（作为VirtualCanvasRenderer的兄弟元素）
    const sentinel = document.createElement('div');
    sentinel.className = 'chapter-boundary-sentinel';
    sentinel.dataset.chapterIndex = chapterIndex.toString();
    sentinel.style.cssText = `
      position: relative;
      width: 100%;
      height: 1px;
      pointer-events: none;
      opacity: 0;
      background: transparent;
    `;

    // 添加到观察器
    this.chapterObserver.observe(sentinel);

    // 存储哨兵引用
    this.chapterSentinels.set(chapterIndex, sentinel);

    return sentinel;
  }

  /**
   * 创建全局透明覆盖层
   */
  createGlobalOverlayMask() {
    if (this.globalOverlayMask) return;

    const overlay = document.createElement('div');
    overlay.className = 'global-scroll-mask';
    overlay.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      bottom: 0;
      right: 0;
      background: transparent;
      z-index: 999;
      pointer-events: auto;
      display: none;
    `;
    // 覆盖在整个 multi-chapter-container 上
    this.scrollWrapper.appendChild(overlay);
    this.globalOverlayMask = overlay;

    return overlay;
  }

  /**
   * 显示全局透明覆盖层（阻止所有VirtualCanvasRenderer接收滚动事件）
   */
  showGlobalOverlayMask() {
    if (this.globalOverlayMask && !this.isGlobalMaskActive) {
      this.globalOverlayMask.style.display = 'block';
      this.isGlobalMaskActive = true;
    }
  }

  /**
   * 隐藏全局透明覆盖层（恢复所有VirtualCanvasRenderer接收滚动事件）
   */
  hideGlobalOverlayMask() {
    if (this.globalOverlayMask && this.isGlobalMaskActive) {
      this.globalOverlayMask.style.display = 'none';
      this.isGlobalMaskActive = false;
    }
  }

  /**
   * 预加载下一章节
   * @param {number} currentChapterIndex - 当前章节索引
   */
  async preloadNextChapter(currentChapterIndex) {
    const nextChapterIndex = currentChapterIndex + 1;

    // 检查是否有下一章节、未加载、且未开始预加载
    if (
      nextChapterIndex < this.totalChapters &&
      !this.loadedChapters.has(nextChapterIndex) &&
      !this.preloadingChapters.has(nextChapterIndex)
    ) {
      // 标记开始预加载，避免重复调用
      this.preloadingChapters.add(nextChapterIndex);

      try {
        // 异步预加载下一章节，不阻塞当前滚动
        await this.loadChapter(nextChapterIndex);
      } catch (error) {
        console.error(`预加载章节 ${nextChapterIndex} 失败:`, error);
      } finally {
        // 无论成功还是失败，都从预加载集合中移除
        this.preloadingChapters.delete(nextChapterIndex);
      }
    }
  }

  /**
   * 处理章节边界哨兵出现
   * @param {number} chapterIndex - 章节索引
   */
  handleChapterBoundaryVisible(chapterIndex) {
    // 只在垂直滚动模式下处理边界事件
    if (this.mode !== 'vertical') {
      return;
    }

    // 哨兵出现说明滚动到了章节分界点
    // 当前章节的VirtualCanvasRenderer已滚动到底，浏览器开始外层滚动
    // 此时显示全局透明层，强制让外层容器接管所有滚动事件

    // 显示全局透明层，阻止所有VirtualCanvasRenderer接收滚动事件
    this.showGlobalOverlayMask();
  }

  /**
   * 处理章节边界哨兵消失
   * @param {number} chapterIndex - 章节索引
   */
  handleChapterBoundaryHidden(chapterIndex) {
    // 只在垂直滚动模式下处理边界事件
    if (this.mode !== 'vertical') {
      return;
    }

    // 哨兵消失说明完全进入了新章节
    // 隐藏全局透明层，恢复该章节的VirtualCanvasRenderer内层滚动

    // 切换活跃章节
    // FIXME: 这里需要优化，因为滚动到边界时，会触发两次，导致章节切换不准确
    this.currentChapterIndex = chapterIndex;

    // 隐藏全局透明层，恢复所有VirtualCanvasRenderer内层滚动
    this.hideGlobalOverlayMask();

    if (this.onChapterChange) {
      this.onChapterChange(chapterIndex);
    }
  }

  /**
   * 初始化书籍
   * @param {Array<ChapterConfig>} chaptersConfig - 章节配置数组
   */
  async initBook(chaptersConfig) {
    this.chapterConfigs = chaptersConfig;
    this.totalChapters = chaptersConfig.length;

    // 清理现有章节
    // this.clearAllChapters();

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
    // 切换到目标章节，确保全局透明层隐藏（允许正常滚动）
    this.hideGlobalOverlayMask();
    this.currentChapterIndex = chapterIndex;

    // 设置章节内进度
    const chapter = this.chapters.get(chapterIndex);
    if (chapter && chapter.renderer) {
      chapter.renderer.setProgress(progress, smooth);
    }

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

      // 只在垂直滚动模式下创建边界哨兵
      let sentinel = null;
      if (this.mode === 'vertical') {
        sentinel = this.createChapterSentinel(chapterIndex);
      }

      chapter.loaded = true;
      this.loadedChapters.add(chapterIndex);
      const nextChapterContainer = this.chapters.get(
        chapterIndex + 1
      )?.container;
      const fragment = document.createDocumentFragment();
      fragment.appendChild(chapter.container);
      fragment.appendChild(sentinel);
      this.scrollWrapper.insertBefore(fragment, nextChapterContainer);

      if (this.onChapterLoad) {
        this.onChapterLoad(chapterIndex);
      }
    } catch (error) {
      console.error(`Failed to load chapter ${chapterIndex}:`, error);
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
    // 注意：垂直和横向模式都支持预加载
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
    // 清理观察器（只在垂直模式下存在）
    if (this.chapterObserver) {
      this.chapterObserver.disconnect();
    }

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

    // 清理滚动隔离相关（只在垂直模式下存在）
    this.chapterSentinels.clear();
    this.appearedSentinels.clear();
    this.preloadingChapters.clear();

    // 清理全局透明层（只在垂直模式下存在）
    if (this.globalOverlayMask && this.globalOverlayMask.parentNode) {
      this.globalOverlayMask.parentNode.removeChild(this.globalOverlayMask);
    }
    this.globalOverlayMask = null;
    this.isGlobalMaskActive = false;
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

    // 清理观察器
    if (this.chapterObserver) {
      this.chapterObserver.disconnect();
      this.chapterObserver = null;
    }

    // 清理所有章节
    this.clearAllChapters();

    // 清理回调函数
    this.onProgressChange = null;
    this.onChapterChange = null;
    this.onChapterLoad = null;

    // 清理滚动隔离状态
    this.appearedSentinels.clear();
    this.preloadingChapters.clear();

    // 清理引用
    this.container = null;
    this.chapterConfigs = [];
  }
}

export default MultiChapterManager;
