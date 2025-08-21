/**
 * 横向滑动管理器
 * 负责管理页面的横向滑动，每次只显示一个完整页面
 * 完全由外部统一管理触摸事件，内部只负责页面切换逻辑
 */
export class HorizontalSlideManager {
  /** @type {HTMLElement} 滑动容器 */
  container;

  /** @type {HTMLCanvasElement[]} Canvas池 */
  canvasList = [];

  /** @type {CanvasRenderingContext2D[]} Canvas上下文池 */
  ctxList = [];

  /** @type {number} Canvas池大小 */
  poolSize = 4;

  /** @type {HorizontalSlideConfig} 配置 */
  config;

  /** @type {HorizontalSlideState} 当前状态 */
  state;

  /** @type {CanvasInfo[]} Canvas信息数组 */
  canvasInfoList = [];

  /** @type {number} 循环链表头部游标 */
  headIndex = 0;

  /** @type {number} 循环链表尾部游标 */
  tailIndex = 3;

  /**
   * @param {HorizontalSlideConfig} config
   */
  constructor(config) {
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
  }

  /**
   * 设置容器
   */
  setupContainer() {
    // 设置Canvas的2D上下文缩放
    const dpr = window.devicePixelRatio || 1;
    this.canvasInfoList.forEach((canvasInfo) => {
      canvasInfo.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    });
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
    }
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
   * 更新滚动内容变换（实时预览）
   * 通过外部回调来实现滑动效果
   */
  updateScrollContentTransform(deltaX) {

  }

  /**
   * 处理向左滑动时的 Canvas 重定位
   */
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

  /**
   * 处理向右滑动时的 Canvas 重定位
   */
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
   * @param {number} newPage
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
   * 设置当前页面（供外部调用）
   * @param {number} pageIndex - 页面索引
   * @param {number} oldPage - 旧页面索引
   */
  setCurrentPage(pageIndex, oldPage) {
    this.state.currentPage = pageIndex;

    // 处理Canvas重定位
    if (pageIndex > oldPage) {
      this.handleSwipeLeft();
    } else {
      this.handleSwipeRight();
    }
  }

  /**
   * 设置动画状态（供外部调用）
   * @param {boolean} isAnimating
   */
  setAnimating(isAnimating) {
    this.state.isAnimating = isAnimating;
  }

  /**
   * 检查是否可以翻页
   * @param {number} pageIndex - 目标页面索引
   * @returns {boolean}
   */
  canGoToPage(pageIndex) {
    return !(
      pageIndex < 0 ||
      pageIndex >= this.state.totalPages ||
      this.state.isAnimating
    );
  }

  /**
   * 销毁
   */
  destroy() {
    // 移除窗口事件监听器（如果有的话）
    window.removeEventListener('resize', this.handleResize);

    // 清理引用
    this.container = null;
    this.canvasList = null;
    this.ctxList = null;
  }
}
