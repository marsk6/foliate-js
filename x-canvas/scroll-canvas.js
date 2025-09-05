/**
 * 虚拟视窗管理器
 * 负责管理多Canvas的虚拟滚动，模拟Google Docs的实现方式
 * 完全由外部统一管理滚动事件，内部只负责Canvas位置管理
 */
export class VirtualViewport {
  /** @type {HTMLElement} 滚动容器 */
  container;

  /** @type {HTMLCanvasElement[]} Canvas池 */
  canvasList = [];

  /** @type {CanvasRenderingContext2D[]} Canvas上下文池 */
  ctxList = [];

  /** @type {HTMLElement} 滚动内容容器 */
  scrollContent;

  /** @type {number} Canvas池大小 */
  poolSize = 4;

  /** @type {ViewportConfig} 配置 */
  config;

  /** @type {ViewportState} 当前状态 */
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
  lastScrollTop = 0;

  /**
   * @param {ViewportConfig} config
   */
  constructor(config) {
    this.container = config.container;
    this.canvasList = config.canvasList;
    this.scrollContent = config.scrollContent;
    this.poolSize = config.poolSize || 4;

    this.config = {
      viewportHeight: config.viewportHeight, // 默认视窗高度
      viewportWidth: config.viewportWidth, // 默认视窗宽度
      chunkHeight: config.chunkHeight, // 每个渲染块高度，应该等于Canvas高度
      ...config,
    };

    this.state = {
      scrollTop: 0,
      viewportHeight: this.config.viewportHeight,
      contentHeight: 0,
      contentWidth: 0,
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
    this.updateViewport();
  }

  /**
   * 设置容器（DOM结构已经传入）
   */
  setupContainer() {
    // 设置所有Canvas的2D上下文缩放
    const dpr = window.devicePixelRatio || 1;

    this.canvasInfoList.forEach((canvasInfo) => {
      canvasInfo.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    });
  }

  /**
   * 外部设置滚动状态
   * @param {number} scrollTop - 滚动位置
   */
  setScrollState(scrollTop) {
    // 更新状态
    this.state.scrollTop = scrollTop;
    // 更新Canvas位置
    this.updateCanvasPositions();

    // 通知视窗变化
    this.notifyViewportChange();
  }

  /**
   * 处理窗口大小变化
   */
  handleResize() {
    // 重新设置所有Canvas的高DPI
    const dpr = window.devicePixelRatio || 1;

    this.canvasInfoList.forEach((canvasInfo) => {
      canvasInfo.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    });

    this.updateViewport();
    this.notifyViewportChange();
  }

  /**
   * 更新视窗状态
   */
  updateViewport() {
    // 更新Canvas池位置
    this.updateCanvasPositions();
  }

  /**
   * 更新Canvas池位置（循环链表方式）
   * 根据滚动方向决定从头部还是尾部取Canvas进行重定位
   */
  updateCanvasPositions() {
    const { contentHeight, scrollTop } = this.state;
    const { chunkHeight } = this.config;

    // 判断滚动方向
    const scrollDirection = scrollTop > this.lastScrollTop ? 'down' : 'up';
    this.lastScrollTop = scrollTop;

    if (scrollDirection === 'down') {
      // 向下滚动：检查头部Canvas是否需要移到尾部
      this.handleDownwardScroll(chunkHeight, contentHeight);
    } else {
      // 向上滚动：检查尾部Canvas是否需要移到头部
      this.handleUpwardScroll(chunkHeight);
    }
  }

  /**
   * 设置初始滚动位置并初始化canvas池
   * @param {number} targetScrollTop - 目标滚动位置
   */
  setProgress(targetScrollTop) {
    const { chunkHeight } = this.config;
    const step = chunkHeight;
    if (this.state.scrollTop < targetScrollTop) {
      while (this.state.scrollTop < targetScrollTop) {
        this.state.scrollTop += step;
        this.handleDownwardScroll(chunkHeight, this.state.contentHeight);
      }
    } else {
      while (this.state.scrollTop > targetScrollTop) {
        this.state.scrollTop -= step;
        this.handleUpwardScroll(chunkHeight);
      }
    }
    this.state.scrollTop = targetScrollTop;
  }

  /**
   * 处理向下滚动
   */
  handleDownwardScroll(chunkHeight, contentHeight) {
    const { scrollTop } = this.state;
    const headCanvas = this.canvasInfoList[this.headIndex];

    // 计算触发重定位的阈值：HEAD Canvas + 下一个Canvas的50%
    const triggerPoint =
      headCanvas.contentStartY + chunkHeight + chunkHeight * 0.5;

    // 如果滚动位置超过触发点，需要重定位HEAD Canvas
    if (scrollTop >= triggerPoint) {
      // 计算新位置：当前尾部Canvas的下方
      const tailCanvas = this.canvasInfoList[this.tailIndex];
      const newPosition = tailCanvas.contentStartY + chunkHeight;

      // 确保不超出内容范围
      if (newPosition < contentHeight) {
        this.repositionCanvas(headCanvas, newPosition);

        // 更新游标：头部向前移动，尾部指向刚移动的Canvas
        this.tailIndex = this.headIndex;
        this.headIndex = (this.headIndex + 1) % this.poolSize;
      }
    }
  }

  /**
   * 处理向上滚动
   */
  handleUpwardScroll(chunkHeight) {
    const { scrollTop } = this.state;
    const headCanvas = this.canvasInfoList[this.headIndex];
    const tailCanvas = this.canvasInfoList[this.tailIndex];

    // 计算触发重定位的阈值：HEAD Canvas开始位置 + Canvas高度的50%
    const triggerPoint = headCanvas.contentStartY + chunkHeight * 0.5;

    // 如果滚动位置低于触发点，需要将TAIL Canvas移动到HEAD Canvas前面
    if (scrollTop < triggerPoint) {
      // 计算新位置：当前头部Canvas的上方
      const newPosition = headCanvas.contentStartY - chunkHeight;

      // 确保不超出内容范围
      if (newPosition >= 0) {
        this.repositionCanvas(tailCanvas, newPosition);

        // 更新游标：TAIL Canvas变成新的HEAD，TAIL向前移动
        this.headIndex = this.tailIndex;
        this.tailIndex = (this.tailIndex - 1 + this.poolSize) % this.poolSize;
      }
    }
  }

  /**
   * 重定位Canvas到新位置
   * @param {CanvasInfo} canvasInfo
   * @param {number} newTop
   */
  repositionCanvas(canvasInfo, newTop) {
    const { chunkHeight } = this.config;

    // 更新Canvas的top位置
    canvasInfo.canvas.style.top = newTop + 'px';
    canvasInfo.contentStartY = newTop;
    canvasInfo.contentEndY = newTop + chunkHeight;

    // 触发重渲染标记
    canvasInfo.needsRerender = true;
  }

  /**
   * 设置内容总高度
   * @param {number} height
   */
  setContentRange(height) {
    if (this.state.contentHeight !== height) {
      this.state.contentHeight = height;

      // 更新滚动内容的高度
      this.scrollContent.style.height = height + 'px';
    }
  }

  /**
   * 将屏幕坐标转换为内容坐标
   * @param {number} canvasY - Canvas中的Y坐标
   * @returns {number} 内容中的Y坐标
   */
  canvasToContentY(canvasY) {
    return canvasY + this.state.scrollTop;
  }

  /**
   * 将内容坐标转换为屏幕坐标
   * @param {number} contentY - 内容中的Y坐标
   * @returns {number} Canvas中的Y坐标
   */
  contentToCanvasY(contentY) {
    return contentY - this.state.scrollTop;
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
   * 获取当前状态
   * @returns {ViewportState}
   */
  getState() {
    return { ...this.state };
  }

  /**
   * 销毁
   */
  destroy() {
    // 清理引用（DOM由主类管理）
    this.container = null;
    this.canvasList = null;
    this.canvasInfoList = [];
    this.scrollContent = null;
  }
}
