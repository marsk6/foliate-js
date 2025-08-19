/**
 * 横向滑动管理器
 * 负责管理页面的横向滑动，每次只显示一个完整页面
 */
export class HorizontalSlideManager {
  /** @type {HTMLElement} 滑动容器 */
  container;

  /** @type {HTMLCanvasElement[]} Canvas池 */
  canvasList = [];

  /** @type {CanvasRenderingContext2D[]} Canvas上下文池 */
  ctxList = [];

  /** @type {HTMLElement} 滑动内容容器 */
  scrollContent;

  /** @type {number} Canvas池大小 */
  poolSize = 4;

  /** @type {HorizontalSlideConfig} 配置 */
  config;

  /** @type {HorizontalSlideState} 当前状态 */
  state;

  /** @type {CanvasInfo[]} Canvas信息数组 */
  canvasInfoList = [];

  /** @type {boolean} 是否正在更新 */
  isUpdating = false;

  /** @type {number} 循环链表头部游标 */
  headIndex = 0;

  /** @type {number} 循环链表尾部游标 */
  tailIndex = 3;

  /** @type {number} 上次滚动位置，用于判断滚动方向 */
  lastScrollLeft = 0;

  /** @type {number} 触摸开始X坐标 */
  touchStartX = 0;

  /** @type {number} 触摸开始时间 */
  touchStartTime = 0;

  /** @type {boolean} 是否正在触摸 */
  isTouching = false;

  /** @type {number} 最小滑动距离阈值 */
  minSwipeDistance = 50;

  /** @type {number} 最大滑动时间阈值（毫秒） */
  maxSwipeTime = 300;

  /** @type {number} 动画持续时间（毫秒） */
  animationDuration = 300;

  /**
   * @param {HorizontalSlideConfig} config
   */
  constructor(config) {
    this.container = config.container;
    this.canvasList = config.canvasList;
    this.scrollContent = config.scrollContent;
    this.poolSize = config.poolSize || 4;
    this.config = {
      viewportWidth: config.viewportWidth,
      viewportHeight: config.viewportHeight,
      chunkWidth: config.chunkWidth || config.viewportWidth,
      chunkHeight: config.chunkHeight || config.viewportHeight,
      ...config,
    };

    this.state = {
      scrollTop: 0,
      viewportWidth: this.config.viewportWidth,
      contentWidth: 0,
      totalPages: 0,
      currentPage: 0,
      isAnimating: false,
    };

    this.initCanvasPool();
    this.init();
  }

  /**
   * 初始化Canvas池
   */
  initCanvasPool() {
    this.canvasInfoList = [];

    for (let i = 0; i < this.poolSize; i++) {
      const canvas = this.canvasList[i];
      const ctx = canvas.getContext('2d');

      this.canvasInfoList.push({
        canvas,
        ctx,
        contentStartY: i * this.config.chunkHeight,
        contentEndY: (i + 1) * this.config.chunkHeight,
        page: i,
        needsRerender: true, // 初始时需要渲染
      });
    }

    // 初始化循环链表游标
    this.headIndex = 0;
    this.tailIndex = this.poolSize - 1;
  }

  /**
   * 初始化
   */
  init() {
    this.setupContainer();
    this.bindEvents();
  }

  /**
   * 设置容器
   */
  setupContainer() {
    // 设置容器样式，隐藏横向溢出
    this.container.style.cssText += `
      overflow: hidden;
    `;

    // 设置 scrollContent 为横向布局，支持 translateX 变换
    this.scrollContent.style.cssText = `
      position: relative;
      height: 100%;
      width: 100%;
      transform: translateX(0px);
      will-change: transform;
    `;

    // 设置Canvas的2D上下文缩放
    const dpr = window.devicePixelRatio || 1;
    this.canvasInfoList.forEach((canvasInfo) => {
      canvasInfo.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    });
  }

  /**
   * 绑定事件
   */
  bindEvents() {
    // 触摸事件
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

    // 窗口大小变化
    window.addEventListener('resize', this.handleResize.bind(this));
  }

  /**
   * 通知视窗变化
   */
  notifyViewportChange() {
    if (this.config.onViewportChange) {
      this.config.onViewportChange();
    }
  }

  /**
   * 更新滚动位置
   */
  updateScrollPosition() {
    this.state.scrollTop = this.state.currentPage * this.config.chunkHeight;
  }

  /**
   * 设置内容总宽度和页面数量
   * @param {number} width
   */
  setContentRange(width) {
    if (this.state.contentWidth !== width) {
      this.state.contentWidth = width;

      // 计算总页面数
      const totalPages = Math.ceil(width / this.config.viewportWidth);
      this.state.totalPages = totalPages;

      // 设置滚动内容的总宽度（基于页面数量）
      // this.scrollContent.style.width = (totalPages * this.config.viewportWidth) + 'px';
    }
  }

  /**
   * 处理触摸开始
   */
  handleTouchStart(event) {
    if (this.state.isAnimating) return;

    this.isTouching = true;
    this.touchStartX = event.touches[0].clientX;
    this.touchStartTime = Date.now();
  }

  /**
   * 处理触摸移动
   */
  handleTouchMove(event) {
    if (!this.isTouching || this.state.isAnimating) return;

    const currentX = event.touches[0].clientX;
    const deltaX = currentX - this.touchStartX;

    // 实时更新滚动内容位置（但不改变页面状态）
    this.updateScrollContentTransform(deltaX);
  }

  /**
   * 处理触摸结束
   */
  handleTouchEnd(event) {
    if (!this.isTouching) return;

    this.isTouching = false;

    const endX = event.changedTouches[0].clientX;
    const deltaX = endX - this.touchStartX;
    const deltaTime = Date.now() - this.touchStartTime;

    this.handleSwipeGesture(deltaX, deltaTime);
  }

  /**
   * 处理窗口大小变化
   */
  handleResize() {
    // 重新设置Canvas的高DPI
    const dpr = window.devicePixelRatio || 1;
    this.ctxList.forEach((ctx) => ctx.setTransform(dpr, 0, 0, dpr, 0, 0));

    // 重新渲染当前页面
    this.notifyViewportChange();
  }

  /**
   * 处理滑动手势
   */
  handleSwipeGesture(deltaX, deltaTime) {
    const absDeltaX = Math.abs(deltaX);
    const isQuickSwipe =
      deltaTime < this.maxSwipeTime && absDeltaX > this.minSwipeDistance;
    const isLongSwipe = absDeltaX > this.config.viewportWidth * 0.3; // 超过30%宽度

    if (isQuickSwipe || isLongSwipe) {
      if (deltaX > 0) {
        // 向右滑动，显示上一页
        this.previousPage();
      } else {
        // 向左滑动，显示下一页
        this.nextPage();
      }
    } else {
      // 回弹到当前页面
      this.snapToCurrentPage();
    }
  }

  /**
   * 更新滚动内容变换（实时预览）
   * 通过移动整个 scrollContent 来实现滑动效果，而不是移动单个 Canvas
   */
  updateScrollContentTransform(deltaX) {
    const maxDelta = this.config.viewportWidth * 0.5; // 最大拖拽距离
    const clampedDelta = Math.max(-maxDelta, Math.min(maxDelta, deltaX));

    // 计算当前页面的基础偏移
    const baseOffset = -this.state.currentPage * this.config.viewportWidth;
    const totalOffset = baseOffset + clampedDelta;

    // 只对 scrollContent 应用变换，所有 Canvas 会一起移动
    this.scrollContent.style.transform = `translateX(${totalOffset}px)`;
  }

  /**
   * 下一页
   */
  nextPage() {
    if (this.state.currentPage < this.state.totalPages - 1) {
      this.goToPage(this.state.currentPage + 1);
    } else {
      if (!this.config.isLastChapter) {
        this.config.chapterManager.this.animateToPage(
          this.state.totalPages + 1
        );
        this.config.chapterManager.slideChapter().then(() => {
          this.config.chapterManager.activateChapter.renderer.viewport.slideContainer();
        });
      } else {
        this.snapToCurrentPage();
      }
    }
  }

  /**
   * 上一页
   */
  previousPage() {
    if (this.state.currentPage > 0) {
      this.goToPage(this.state.currentPage - 1);
    } else {
      this.snapToCurrentPage();
    }
  }

  /**
   * 跳转到指定页面
   */
  goToPage(pageIndex) {
    if (
      pageIndex < 0 ||
      pageIndex >= this.state.totalPages ||
      this.state.isAnimating
    ) {
      return;
    }
    const oldPage = this.state.currentPage;
    this.state.currentPage = pageIndex;
    if (pageIndex > oldPage) {
      this.handleSwipeLeft();
    } else {
      this.handleSwipeRight();
    }
    this.state.isAnimating = true;

    // 执行滑动动画
    this.animateToPage(pageIndex, () => {
      this.updateScrollPosition();
      this.state.isAnimating = false;
      this.notifyViewportChange();
    });
  }

  handleSwipeLeft() {
    const { currentPage } = this.state;

    const headCanvas = this.canvasInfoList[this.headIndex];
    const tailCanvas = this.canvasInfoList[this.tailIndex];
    const newPage = tailCanvas.page + 1;

    if (
      newPage <= this.state.totalPages &&
      tailCanvas.page - currentPage === 1
    ) {
      this.repositionCanvas(headCanvas, newPage);
      headCanvas.page = newPage;
      this.tailIndex = this.headIndex;
      this.headIndex = (this.headIndex + 1) % this.poolSize;
    }
  }
  handleSwipeRight() {
    const { currentPage } = this.state;

    const headCanvas = this.canvasInfoList[this.headIndex];
    const tailCanvas = this.canvasInfoList[this.tailIndex];
    const newPage = headCanvas.page - 1;
    if (newPage >= 0 && currentPage === headCanvas.page) {
      this.repositionCanvas(tailCanvas, newPage);
      tailCanvas.page = newPage;
      this.headIndex = this.tailIndex;
      this.tailIndex = (this.tailIndex - 1 + this.poolSize) % this.poolSize;
    }
  }

  /**
   * 重定位Canvas到新位置
   * @param {CanvasInfo} canvasInfo
   * @param {number} newLeft
   */
  repositionCanvas(canvasInfo, newPage) {
    const { chunkWidth, chunkHeight } = this.config;

    // 更新Canvas的left位置
    canvasInfo.canvas.style.left = newPage * chunkWidth + 'px';

    const newTop = newPage * chunkHeight;
    canvasInfo.contentStartY = newTop;
    canvasInfo.contentEndY = newTop + chunkHeight;
    // 触发重渲染标记
    canvasInfo.needsRerender = true;
  }

  /**
   * 回弹到当前页面
   */
  snapToCurrentPage() {
    this.state.isAnimating = true;

    // 计算当前页面的正确位置
    const targetOffset = -this.state.currentPage * this.config.viewportWidth;

    // 对 scrollContent 应用过渡动画
    this.scrollContent.style.transition = `transform ${this.animationDuration}ms ease-out`;
    this.scrollContent.style.transform = `translateX(${targetOffset}px)`;

    setTimeout(() => {
      this.scrollContent.style.transition = '';
      this.state.isAnimating = false;
    }, this.animationDuration);
  }

  /**
   * 执行页面切换动画
   */
  slideContainer() {
    // 计算目标页面的偏移位置
    const targetOffset = this.config.viewportWidth;

    this.container.style.transition = `transform ${this.animationDuration}ms ease-out`;
    this.container.style.transform = `translateX(${targetOffset}px)`;
  }

  /**
   * 执行页面切换动画
   */
  animateToPage(toPage, callback) {
    // 计算目标页面的偏移位置
    const targetOffset = -toPage * this.config.viewportWidth;

    // 对 scrollContent 应用过渡动画
    this.scrollContent.style.transition = `transform ${this.animationDuration}ms ease-out`;
    this.scrollContent.style.transform = `translateX(${targetOffset}px)`;

    setTimeout(() => {
      // 动画结束后清除过渡效果
      this.scrollContent.style.transition = '';
      callback?.();
    }, this.animationDuration);
  }

  /**
   * 设置总页面数
   */
  setTotalPages(totalPages) {
    this.state.totalPages = totalPages;

    // 确保当前页面索引有效
    if (this.state.currentPage >= totalPages) {
      this.state.currentPage = Math.max(0, totalPages - 1);
    }
  }
  /**
   * 获取当前状态
   */
  getState() {
    return { ...this.state };
  }

  /**
   * 销毁
   */
  destroy() {
    // 移除事件监听器
    this.container.removeEventListener('touchstart', this.handleTouchStart);
    this.container.removeEventListener('touchmove', this.handleTouchMove);
    this.container.removeEventListener('touchend', this.handleTouchEnd);
    window.removeEventListener('resize', this.handleResize);

    // 清理引用
    this.container = null;
    this.canvasList = null;
    this.ctxList = null;
    this.pageDataCache.clear();
  }
}
