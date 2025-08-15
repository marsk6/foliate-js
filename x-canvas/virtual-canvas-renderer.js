/**
 * 虚拟Canvas渲染器
 * 整合Canvas渲染和虚拟滚动功能，实现大内容的高性能渲染
 *
 * 支持两种渲染模式：
 * - vertical: 垂直滚动模式（默认）
 * - horizontal: 横向页面滑动模式
 *
 * 使用示例：
 *
 * // 垂直滚动模式（默认）
 * const renderer = new VirtualCanvasRenderer({
 *   mountPoint: document.getElementById('container'),
 *   mode: 'vertical',
 *   theme: { baseFontSize: 18 }
 * });
 *
 * // 横向滑动模式
 * const horizontalRenderer = new VirtualCanvasRenderer({
 *   mountPoint: document.getElementById('container'),
 *   mode: 'horizontal',
 *   theme: { baseFontSize: 18 }
 * });
 *
 * // 渲染内容
 * renderer.render('<p>Hello World</p>');
 *
 * // 获取和设置模式
 * console.log(renderer.getMode()); // 'vertical' 或 'horizontal'
 * renderer.setMode('horizontal'); // 切换到横向模式
 */

import TransferEngine from './layout-engine.js';

/**
 * @typedef {Object} VirtualRenderConfig
 * @property {HTMLElement} mountPoint - 挂载点元素
 * @property {number} [poolSize=4] - Canvas池大小
 * @property {Object} [theme] - 主题配置
 * @property {string} [mode='vertical'] - 渲染模式：'vertical' | 'horizontal'
 */

/**
 * @typedef {Object} ViewportConfig
 * @property {HTMLElement} container - 滚动容器元素
 * @property {HTMLCanvasElement[]} canvasList - Canvas池
 * @property {HTMLElement} scrollContent - 滚动内容容器
 * @property {number} viewportHeight - 视窗高度
 * @property {number} viewportWidth - 视窗宽度
 * @property {number} chunkHeight - 每个渲染块的高度
 * @property {number} poolSize - Canvas池大小
 * @property {Function} onViewportChange - 视窗变化回调
 */

/**
 * @typedef {Object} CanvasInfo
 * @property {HTMLCanvasElement} canvas - Canvas元素
 * @property {CanvasRenderingContext2D} ctx - Canvas上下文
 * @property {number} currentTop - 当前top位置
 * @property {number} contentStartY - 渲染内容的起始Y坐标
 * @property {number} contentEndY - 渲染内容的结束Y坐标
 */

/**
 * @typedef {Object} ViewportState
 * @property {number} scrollTop - 当前滚动位置
 * @property {number} viewportHeight - 视窗高度
 * @property {number} contentHeight - 内容总高度
 */

/**
 * 虚拟视窗管理器
 * 负责管理多Canvas的虚拟滚动，模拟Google Docs的实现方式
 */
class VirtualViewport {
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

  /** @type {number} 节流定时器ID */
  scrollThrottleId = null;

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
        currentTop: i * this.config.chunkHeight, // 初始位置
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
    this.bindEvents();
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
   * 绑定事件
   */
  bindEvents() {
    // 滚动事件（带防抖）
    this.container.addEventListener('scroll', this.handleScroll.bind(this), {
      passive: true,
    });

    // 窗口大小变化
    window.addEventListener('resize', this.handleResize.bind(this));
  }

  /**
   * 处理滚动事件（节流版本）
   */
  handleScroll() {
    if (this.isUpdating) return;

    // 立即更新滚动位置（快速响应）
    this.updateScrollPosition();

    // 使用requestAnimationFrame进行节流，确保按帧率执行
    if (this.scrollThrottleId) {
      return; // 如果已经有待处理的更新，跳过
    }

    this.scrollThrottleId = requestAnimationFrame(() => {
      this.scrollThrottleId = null;
      this.updateViewport();
      this.notifyViewportChange();
    });
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
   * 更新滚动位置
   */
  updateScrollPosition() {
    this.state.scrollTop = this.container.scrollTop;
  }

  /**
   * 更新视窗状态
   */
  updateViewport() {
    this.updateScrollPosition();

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
    canvasInfo.currentTop = newTop;
    canvasInfo.contentStartY = newTop;
    canvasInfo.contentEndY = newTop + chunkHeight;

    // 触发重渲染标记
    canvasInfo.needsRerender = true;
  }

  /**
   * 设置内容总高度
   * @param {number} height
   */
  setContentHeight(height) {
    if (this.state.contentHeight !== height) {
      this.state.contentHeight = height;

      // 更新滚动内容的高度
      this.scrollContent.style.height = height + 'px';
      this.updateViewport();
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
   * 滚动到指定位置
   * @param {number} y - 内容中的Y坐标
   * @param {boolean} smooth - 是否平滑滚动
   */
  scrollTo(y, smooth = true) {
    this.container.scrollTo({
      top: y,
      behavior: smooth ? 'smooth' : 'instant',
    });
  }

  /**
   * 滚动到指定块
   * @param {number} chunkIndex
   * @param {boolean} smooth
   */
  scrollToChunk(chunkIndex, smooth = true) {
    const y = chunkIndex * this.config.chunkHeight;
    this.scrollTo(y, smooth);
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
    this.container.removeEventListener('scroll', this.handleScroll);
    window.removeEventListener('resize', this.handleResize);

    // 清理节流定时器
    if (this.scrollThrottleId) {
      cancelAnimationFrame(this.scrollThrottleId);
      this.scrollThrottleId = null;
    }

    // 清理引用（DOM由主类管理）
    this.container = null;
    this.canvasList = null;
    this.canvasInfoList = [];
    this.scrollContent = null;
  }
}

/**
 * @typedef {Object} ThemeConfig
 * @property {string} backgroundColor - 背景色
 * @property {string} textColor - 文字颜色
 * @property {number} baseFontSize - 基础字体大小
 * @property {string} fontFamily - 字体族
 * @property {number} paddingX - 水平内边距
 * @property {number} lineHeight - 行高倍数
 */

/**
 * @typedef {Object} WordPosition
 * @property {number} vx - 垂直模式X坐标
 * @property {number} vy - 垂直模式Y坐标
 * @property {number} hx - 水平模式X坐标
 * @property {number} hy - 水平模式Y坐标
 * @property {number} width - 单词宽度
 * @property {number} height - 单词高度
 * @property {number} line - 所在行号
 * @property {string} text - 单词内容
 * @property {string} type - 类型：'word', 'space', 'punctuation', 'cjk'
 * @property {Object} style - 样式信息
 * @property {number} startIndex - 在原文本中的开始索引
 * @property {number} endIndex - 在原文本中的结束索引
 */

/**
 * @typedef {Object} RenderResult
 * @property {WordPosition[]} words - 所有单词位置信息
 * @property {Object[]} elements - 元素信息（图片等）
 * @property {number} totalHeight - 总高度
 */

/**
 * @typedef {Object} VirtualRenderConfig
 * @property {HTMLElement} mountPoint - 挂载点元素
 * @property {ThemeConfig} theme - 主题配置
 */

/**
 * @typedef {Object} RenderChunk
 * @property {number} index - 块索引
 * @property {number} startY - 开始Y坐标
 * @property {number} endY - 结束Y坐标
 * @property {Array} words - 渲染的单词
 * @property {Array} elements - 渲染的元素
 * @property {boolean} rendered - 是否已渲染
 */

export class VirtualCanvasRenderer {
  // 挂载点和容器
  /** @type {HTMLElement} 挂载点 */
  mountPoint;

  /** @type {HTMLElement} 滚动容器 */
  container;

  /** @type {HTMLCanvasElement} Canvas元素 */
  canvas;

  /** @type {CanvasRenderingContext2D} Canvas 2D上下文 */
  ctx;

  /** @type {HTMLCanvasElement} 隐藏的测量canvas */
  measureCanvas;

  /** @type {CanvasRenderingContext2D} 测量用的2D上下文 */
  measureCtx;

  /** @type {HTMLElement} 滚动内容容器 */
  scrollContent;

  /** @type {HTMLElement} 虚拟内容元素（兼容性） */
  virtualContent;

  // 配置对象
  /** @type {ThemeConfig} 主题配置 */
  theme;

  /** @type {number} Canvas宽度 */
  canvasWidth;

  /** @type {number} Canvas高度 */
  canvasHeight;

  /** @type {string} 渲染模式：'vertical' | 'horizontal' */
  mode;

  // 引擎和数据
  /** @type {TransferEngine} HTML转换引擎实例 */
  transferEngine;

  /** @type {RenderResult|null} 渲染结果 */
  renderResult = null;

  /** @type {Array|null} 解析后的节点数据 */
  parsedNodes = null;

  /** @type {Object|null} 从head中提取的页面样式 */
  pageStyle = null;

  /** @type {string|undefined} 当前HTML内容 */
  currentHTML;

  // 虚拟滚动相关（垂直模式）
  /** @type {VirtualViewport} 虚拟视窗管理器 */
  viewport;

  /** @type {Map<number, RenderChunk>} 渲染块缓存 */
  renderChunks = new Map();

  /** @type {Array} 完整的布局数据 */
  fullLayoutData = null;

  // 图片管理相关
  /** @type {Map<string, ImageElement>} 图片缓存 */
  imageCache = new Map();

  /** @type {number} 默认图片宽度 */
  defaultImageWidth = 200;

  /** @type {number} 默认图片高度 */
  defaultImageHeight = 150;

  /**
   * @param {VirtualRenderConfig} config
   */
  constructor(config) {
    this.mountPoint = config.mountPoint;

    // 渲染模式配置 - 支持 'vertical' 和 'horizontal'
    this.mode = config.mode || 'vertical';

    // 主题配置需要先初始化，用于计算行高
    this.theme = {
      backgroundColor: '#fff',
      textColor: '#222',
      baseFontSize: 20,
      fontFamily: 'system-ui, sans-serif',
      paddingX: 16,
      lineHeight: 1.4,
      ...config.theme,
    };

    // 视窗尺寸 - 基于窗口尺寸自动计算
    this.viewportWidth = window.innerWidth; // 使用窗口宽度作为视窗宽度
    this.viewportHeight = window.innerHeight; // 使用窗口高度作为视窗高度

    // Canvas尺寸 - 直接使用视窗尺寸
    this.canvasWidth = this.viewportWidth;
    this.canvasHeight = this.viewportHeight;

    // 块高度 - 每个渲染块的高度，等于Canvas高度
    this.chunkHeight = this.canvasHeight;

    // 创建DOM结构
    this.createDOMStructure();

    this.ctx = this.canvas.getContext('2d');

    // 转换引擎实例
    this.transferEngine = new TransferEngine();

    // 渲染状态
    this.renderResult = null;
    this.parsedNodes = null;
    this.pageStyle = null;

    // 创建隐藏的canvas用于测量文本
    this.measureCanvas = document.createElement('canvas');
    this.measureCtx = this.measureCanvas.getContext('2d');

    // 初始化垂直模式
    this.initVerticalMode(config);

    // 设置高DPI
    this.setupHighDPI();

    window.addEventListener('resize', this.setupHighDPI.bind(this));
  }

  /**
   * 创建DOM结构（虚拟滚动模式）
   */
  createDOMStructure() {
    // 创建Google Docs风格的虚拟滚动结构
    this.container = document.createElement('div');
    this.container.className = 'virtual-scroll-container';
    this.container.style.cssText = `
      width: ${this.viewportWidth}px;
      height: ${this.viewportHeight}px;
      position: relative;
      overflow-y: auto;
      overflow-x: hidden;
    `;

    // 创建滚动内容容器（关键！）
    this.scrollContent = document.createElement('div');
    this.scrollContent.className = 'scroll-content';
    this.scrollContent.style.cssText = `
      position: relative;
      width: 100%;
      height: 0px;  /* 动态设置为总内容高度 */
    `;

    // 创建Canvas池，作为滚动内容的子元素
    this.canvasList = [];
    const poolSize = 4;

    for (let i = 0; i < poolSize; i++) {
      const canvas = document.createElement('canvas');
      canvas.className = `virtual-canvas-${i}`;
      canvas.style.cssText = `
        position: absolute;
        top: ${i * this.chunkHeight}px;
        left: 0;
        width: 100%;
        height: ${this.canvasHeight}px;
        z-index: 2;
        display: block;
        pointer-events: auto;
      `;

      // 设置Canvas尺寸
      const dpr = window.devicePixelRatio || 1;
      canvas.width = this.canvasWidth * dpr;
      canvas.height = this.canvasHeight * dpr;

      this.canvasList.push(canvas);
      this.scrollContent.appendChild(canvas); // 关键：Canvas在滚动内容内
    }

    // 主Canvas用于兼容
    this.canvas = this.canvasList[0];

    // 虚拟内容元素已被scrollContent替代
    this.virtualContent = this.scrollContent;

    // 组装DOM结构
    this.container.appendChild(this.scrollContent);

    // 替换挂载点
    if (this.mountPoint.parentNode) {
      this.mountPoint.parentNode.replaceChild(this.container, this.mountPoint);
    }
  }

  /**
   * 设置高DPI支持
   */
  setupHighDPI() {
    const dpr = window.devicePixelRatio || 1;

    // 重新计算尺寸（窗口大小可能已变化）
    this.viewportWidth = window.innerWidth;
    this.viewportHeight = window.innerHeight;
    this.canvasWidth = this.viewportWidth;
    this.canvasHeight = this.viewportHeight;
    this.chunkHeight = this.canvasHeight;

    // 更新容器尺寸
    if (this.container) {
      this.container.style.width = this.viewportWidth + 'px';
      this.container.style.height = this.viewportHeight + 'px';
    }

    // 更新所有Canvas的尺寸
    this.canvasList.forEach((canvas) => {
      canvas.width = this.canvasWidth * dpr;
      canvas.height = this.canvasHeight * dpr;
      canvas.style.width = this.canvasWidth + 'px';
      canvas.style.height = this.canvasHeight + 'px';

      const ctx = canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    });

    // 更新管理器配置
    if (this.viewport) {
      this.viewport.config.viewportWidth = this.viewportWidth;
      this.viewport.config.viewportHeight = this.viewportHeight;
      this.viewport.config.chunkHeight = this.chunkHeight;
      this.viewport.state.viewportHeight = this.viewportHeight;
    }
  }

  /**
   * 渲染HTML内容
   * @param {string} htmlContent
   */
  render(htmlContent) {
    this.setupHighDPI();
    this.currentHTML = htmlContent;

    // 1. 解析HTML为数据结构
    const parseResult = this.transferEngine.parse(htmlContent);
    this.parsedNodes = parseResult.nodes;
    this.pageStyle = parseResult.pageStyle;

    // 2. 应用页面样式
    this.applyPageStyle();

    // 垂直模式：执行完整布局计算（不渲染）
    this.calculateFullLayout();

    // 设置虚拟内容高度
    this.viewport.setContentHeight(this.fullLayoutData.totalHeight);

    // 标记所有Canvas需要重新渲染（因为内容已更改）
    this.viewport.canvasInfoList.forEach((canvasInfo) => {
      canvasInfo.needsRerender = true;
    });

    // 渲染当前可视区域
    this.renderVisibleContent();
  }

  /**
   * 计算完整布局（不进行Canvas渲染）
   */
  calculateFullLayout() {
    const words = [];
    const elements = [];

    // 初始化坐标
    let vx = this.theme.paddingX; // 垂直模式X坐标
    let vy = 0; // 垂直模式Y坐标
    let hx = this.theme.paddingX; // 水平模式X坐标
    let hy = 0
    let currentLine = 0;

    // 使用新的双坐标系统布局算法计算所有位置
    const result = this.layoutNodes(
      this.parsedNodes,
      vx,
      vy,
      hx,
      hy,
      currentLine,
      words,
      elements
    );

    // 根据模式计算总尺寸
    let contentHeight, contentWidth;
    
    if (this.mode === 'vertical') {
      // 垂直模式：使用垂直坐标系统
      contentHeight = result.vy;
      contentWidth = this.canvasWidth;
    } else {
      // 水平模式：使用水平坐标系统
      contentHeight = this.canvasHeight; // 水平模式高度固定为canvas高度
      contentWidth = result.hx + this.canvasWidth; // 总宽度 = 最后的hx + 一个页面宽度
    }

    // 计算需要的总块数（主要用于垂直模式）
    const chunkHeight = this.viewport.config.chunkHeight;
    const totalChunks = Math.ceil(contentHeight / chunkHeight);

    // scrollContent 的高度基于块数量，而不是内容高度
    const scrollContentHeight = totalChunks * chunkHeight;

    this.fullLayoutData = {
      words,
      elements,
      contentHeight, // 实际内容高度
      contentWidth, // 实际内容宽度
      scrollContentHeight, // 滚动容器高度
      totalHeight: scrollContentHeight, // 兼容性，使用滚动容器高度
      totalChunks,
      mode: this.mode, // 当前模式
    };
    
    // 分割为块
    this.createRenderChunks();
  }

  /**
   * 创建渲染块（优化版本：避免重复遍历）
   */
  createRenderChunks() {
    if (!this.fullLayoutData) return;

    const { words, elements, totalChunks, scrollContentHeight } =
      this.fullLayoutData;
    const chunkHeight = this.viewport.config.chunkHeight;

    // 清空现有块
    this.renderChunks.clear();

    let wordStartIndex = 0; // 跟踪下一个要检查的单词索引
    let elementStartIndex = 0; // 跟踪下一个要检查的元素索引

    for (let i = 0; i < totalChunks; i++) {
      const startY = i * chunkHeight;
      const endY = Math.min((i + 1) * chunkHeight, scrollContentHeight);

      // 优化：使用范围搜索而不是全量过滤
      const { chunkWords, nextWordIndex } = this.findWordsInRange(
        words,
        wordStartIndex,
        startY,
        endY
      );

      const { chunkElements, nextElementIndex } = this.findElementsInRange(
        elements,
        elementStartIndex,
        startY,
        endY
      );
      // 更新起始索引，避免重复检查已分配的内容
      wordStartIndex = nextWordIndex;
      elementStartIndex = nextElementIndex;

      this.renderChunks.set(i, {
        index: i,
        startY,
        endY,
        words: chunkWords,
        elements: chunkElements,
        rendered: false,
      });
    }
  }

  /**
   * 在指定范围内查找单词（优化版本）
   * @param {Array} words - 所有单词数组
   * @param {number} startIndex - 开始搜索的索引
   * @param {number} startY - 范围开始Y坐标
   * @param {number} endY - 范围结束Y坐标
   * @returns {Object} 返回找到的单词和下一个搜索索引
   */
  findWordsInRange(words, startIndex, startY, endY) {
    const chunkWords = [];
    let i = startIndex;
    let nextWordIndex = startIndex;
    let currentLine = 0;
    // 从startIndex开始搜索，避免重复检查
    while (i < words.length) {
      const word = words[i];
      const lineHeight = this.getLineHeight(word.style);
      const baseline = this.getTextBaseline(lineHeight, word.style.fontSize);
      const wordTop = word.y - baseline;
      const wordBottom = wordTop + lineHeight;

      // 如果单词完全在当前范围之前，跳过
      if (wordBottom <= startY) {
        i++;
        continue;
      }

      // 如果单词完全在当前范围之后，提前终止
      if (wordTop >= endY) {
        break;
      }
      if (word.line !== currentLine) {
        currentLine = word.line;
        nextWordIndex = i;
      }

      // 单词与当前范围有交集，加入当前块
      if (wordBottom > startY && wordTop < endY) {
        chunkWords.push(word);
      }

      i++;
    }

    return {
      chunkWords,
      nextWordIndex, // 下一个块从这个索引开始搜索
    };
  }

  /**
   * 在指定范围内查找元素（优化版本）
   * @param {Array} elements - 所有元素数组
   * @param {number} startIndex - 开始搜索的索引
   * @param {number} startY - 范围开始Y坐标
   * @param {number} endY - 范围结束Y坐标
   * @returns {Object} 返回找到的元素和下一个搜索索引
   */
  findElementsInRange(elements, startIndex, startY, endY) {
    const chunkElements = [];
    let i = startIndex;

    // 从startIndex开始搜索，避免重复检查
    while (i < elements.length) {
      const element = elements[i];

      // 如果元素完全在当前范围之前，跳过
      if (element.y < startY) {
        i++;
        continue;
      }

      // 如果元素完全在当前范围之后，提前终止
      if (element.y >= endY) {
        break;
      }

      // 元素在当前范围内，加入当前块
      chunkElements.push(element);
      i++;
    }

    return {
      chunkElements,
      nextElementIndex: i, // 下一个块从这个索引开始搜索
    };
  }

  /**
   * 处理视窗变化
   */
  handleViewportChange() {
    this.renderVisibleContent();
  }

  /**
   * 渲染可视内容
   */
  renderVisibleContent() {
    if (!this.fullLayoutData) return;

    // 多Canvas模式：分别渲染每个Canvas
    this.renderMultiCanvas();
  }

  /**
   * 多Canvas渲染（Google Docs风格）
   */
  renderMultiCanvas() {
    const { canvasInfoList } = this.viewport;

    canvasInfoList.forEach((canvasInfo) => {
      // 只渲染需要更新的Canvas
      if (canvasInfo.needsRerender !== false) {
        this.renderSingleCanvas(canvasInfo);
        canvasInfo.needsRerender = false;
      }
    });
  }

  /**
   * 渲染单个Canvas
   * @param {CanvasInfo} canvasInfo
   */
  renderSingleCanvas(canvasInfo) {
    const { canvas, ctx, contentStartY, contentEndY } = canvasInfo;

    // 清空这个Canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 渲染背景
    ctx.fillStyle = this.theme.backgroundColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 计算需要渲染的chunk范围
    const chunkHeight = this.viewport.config.chunkHeight;
    const startChunkIndex = Math.floor(contentStartY / chunkHeight);
    const endChunkIndex = Math.floor((contentEndY - 1) / chunkHeight);

    // 遍历相关的chunks并渲染内容
    for (
      let chunkIndex = startChunkIndex;
      chunkIndex <= endChunkIndex;
      chunkIndex++
    ) {
      const chunk = this.renderChunks.get(chunkIndex);
      if (!chunk) continue;

      // 直接使用chunk中已经分配好的单词和元素
      const canvasWords = chunk.words;
      const canvasElements = chunk.elements;

      // 渲染内容（相对于Canvas的偏移）
      this.renderCanvasText(canvasWords, ctx, contentStartY);
      this.renderCanvasElements(canvasElements, ctx, contentStartY);
    }
  }

  /**
   * 渲染Canvas中的文本
   * @param {Array} words
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} offsetY - Y轴偏移量（垂直模式使用）
   * @param {number} offsetX - X轴偏移量（水平模式使用）
   */
  renderCanvasText(words, ctx, offsetY = 0, offsetX = 0) {
    let currentFont = '';

    words.forEach((word) => {
      const { style } = word;
      const font = `${style.fontStyle || 'normal'} ${
        style.fontWeight || 'normal'
      } ${style.fontSize}px ${this.theme.fontFamily}`;

      if (font !== currentFont) {
        ctx.font = font;
        currentFont = font;
      }

      ctx.fillStyle = style.color || this.theme.textColor;

      // 根据模式选择坐标系统
      let canvasX, canvasY;
      
      if (this.mode === 'vertical') {
        // 垂直模式：使用垂直坐标系统
        canvasX = word.vx;
        canvasY = word.vy - offsetY;
      } else {
        // 水平模式：使用水平坐标系统
        canvasX = word.hx - offsetX;
        canvasY = word.hy;
      }

      ctx.fillText(word.text, canvasX, canvasY);
    });
  }

  /**
   * 渲染Canvas中的元素
   * TODO: 添加一个重新加载的功能
   * @param {Array<ImageElement>} elements - 元素数组
   * @param {CanvasRenderingContext2D} ctx - Canvas上下文
   * @param {number} offsetY - Y轴偏移量（垂直模式使用）
   * @param {number} offsetX - X轴偏移量（水平模式使用）
   */
  renderCanvasElements(elements, ctx, offsetY = 0, offsetX = 0) {
    elements.forEach(async (element) => {
      if (element.type === 'image') {
        // 根据模式选择坐标系统
        let canvasX, canvasY;
        
        if (this.mode === 'vertical') {
          // 垂直模式：使用垂直坐标系统
          canvasX = element.vx;
          canvasY = element.vy - offsetY;
        } else {
          // 水平模式：使用水平坐标系统
          canvasX = element.hx - offsetX;
          canvasY = element.hy;
        }

        // 显示占位符
        this.drawImagePlaceholder(
          ctx,
          element,
          canvasX,
          canvasY,
          element.alt || 'Image'
        );
        
        // 懒加载：检查图片是否已在缓存中
        const cachedImagePromise = this.imageCache.get(element.src);
        let cachedImage = null;
        if (cachedImagePromise) {
          cachedImage = await cachedImagePromise;
        } else {
          // 图片还未加载，现在开始懒加载
          if (element.src) {
            cachedImage = await this.loadImage(
              element.src,
              element.width,
              element.height
            );
          }
        }

        if (cachedImage && cachedImage.imageElement) {
          try {
            ctx.drawImage(
              cachedImage.imageElement,
              canvasX,
              canvasY,
              element.width,
              element.height
            );

            // 可选：添加图片边框
            if (this.theme.showImageBorder) {
              ctx.strokeStyle = this.theme.imageBorderColor || '#ddd';
              ctx.lineWidth = 1;
              ctx.strokeRect(canvasX, canvasY, element.width, element.height);
            }
          } catch (error) {
            console.warn('Failed to draw image:', element.src, error);
            this.drawImagePlaceholder(ctx, element, canvasX, canvasY, 'Error');
          }
        }
      }
    });
  }

  /**
   * 绘制图片占位符
   * @param {CanvasRenderingContext2D} ctx - Canvas上下文
   * @param {ImageElement} element - 图片元素
   * @param {number} canvasX - Canvas中的X坐标
   * @param {number} canvasY - Canvas中的Y坐标
   * @param {string} text - 显示的文本
   */
  drawImagePlaceholder(ctx, element, canvasX, canvasY, text) {
    // 绘制图片占位符边框
    ctx.strokeStyle = '#ccc';
    ctx.strokeRect(canvasX, canvasY, element.width, element.height);

    // 绘制图片图标或文字
    ctx.fillStyle = '#999';
    ctx.font = '14px system-ui';
    // ctx.fillText(text, canvasX + 10, canvasY + element.height / 2);
  }

  /**
   * 渲染单个块
   * @param {Object} chunkInfo - 块信息
   * @param {number} scrollTop - 滚动位置
   */

  /**
   * 根据坐标获取字符索引（重写）
   * @param {Object} point
   * @param {number} point.x
   * @param {number} point.y
   * @returns {number|null}
   */
  getCharIndexAt(point) {
    if (!this.fullLayoutData) return null;

    const { x: clientX, y: clientY } = point;
    const rect = this.canvas.getBoundingClientRect();
    const canvasX = clientX - rect.left;
    const canvasY = clientY - rect.top;

    const { words } = this.fullLayoutData;
    const lineHeight = this.getLineHeight();
    const baseline = this.getTextBaseline(lineHeight, this.theme.baseFontSize);

    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      
      // 根据模式选择坐标系统
      let wordX, wordY, contentY;
      
      if (this.mode === 'vertical') {
        // 垂直模式：使用垂直坐标系统
        wordX = word.vx;
        wordY = word.vy;
        contentY = this.viewport.canvasToContentY(canvasY);
      } else {
        // 水平模式：使用水平坐标系统
        wordX = word.hx;
        wordY = word.hy;
        contentY = canvasY; // 水平模式不需要转换Y坐标
      }
      
      // 计算行的顶部和底部
      const lineTop = wordY - baseline;
      const lineBottom = lineTop + lineHeight;

      if (
        contentY >= lineTop &&
        contentY <= lineBottom &&
        canvasX >= wordX &&
        canvasX <= wordX + word.width
      ) {
        return i;
      }
    }

    return null;
  }

  /**
   * 滚动到指定字符
   * @param {number} charIndex
   */
  scrollToChar(charIndex) {
    if (!this.fullLayoutData || charIndex >= this.fullLayoutData.words.length) {
      return;
    }

    const word = this.fullLayoutData.words[charIndex];

    if (this.mode === 'vertical') {
      // 垂直模式：滚动到指定Y位置
      const wordY =
        word.vy -
        this.getTextBaseline(this.getLineHeight(word.style), word.style.fontSize);

      // 滚动到该位置，居中显示
      const targetY = wordY - this.viewport.state.viewportHeight / 2;
      this.viewport.scrollTo(Math.max(0, targetY));
    } else {
      // 水平模式：滚动到指定位置
      // TODO: 实现水平模式的滚动逻辑
      console.log(`Horizontal mode: scroll to word at (${word.hx}, ${word.hy})`);
    }
  }

  /**
   * 启用/禁用虚拟滚动
   * @param {boolean} enabled
   */
  setVirtualScrollEnabled(enabled) {
    this.virtualScrollEnabled = enabled;

    if (this.currentHTML) {
      this.render(this.currentHTML);
    }
  }

  /**
   * 应用从head中提取的页面样式
   */
  applyPageStyle() {
    if (!this.pageStyle) return;

    // 应用页面边距 - 已移除paddingY支持

    if (this.pageStyle.marginBottom) {
      const marginBottom = this.parseSize(this.pageStyle.marginBottom);
      // 可以用于计算页面底部空间
    }

    // 应用其他页面级样式
    if (this.pageStyle.fontFamily) {
      this.theme.fontFamily = this.pageStyle.fontFamily;
    }

    if (this.pageStyle.fontSize) {
      this.theme.baseFontSize = this.parseSize(this.pageStyle.fontSize);
    }

    if (this.pageStyle.color) {
      this.theme.textColor = this.pageStyle.color;
    }

    if (this.pageStyle.backgroundColor) {
      this.theme.backgroundColor = this.pageStyle.backgroundColor;
    }
  }

  /**
   * 执行布局计算
   * @param {Array} nodes
   * @returns {RenderResult}
   */
  performLayout(nodes) {
    const words = [];
    const elements = [];

    let x = this.theme.paddingX;
    let y = 0;
    let currentLine = 0;

    // 遍历节点树进行布局
    this.layoutNodes(nodes, x, y, currentLine, words, elements);

    const totalHeight = y;

    return {
      words,
      elements,
      totalHeight,
    };
  }

  /**
   * 布局节点
   * @param {Array} nodes
   * @param {number} startVX - 垂直模式起始X坐标
   * @param {number} startVY - 垂直模式起始Y坐标
   * @param {number} startHX - 水平模式起始X坐标
   * @param {number} startHY - 水平模式起始Y坐标
   * @param {number} startLine
   * @param {Array} words
   * @param {Array} elements
   * @returns {Object}
   */
  layoutNodes(nodes, startVX, startVY, startHX, startHY, startLine, words, elements) {
    let vx = startVX;
    let vy = startVY;
    let hx = startHX;
    let hy = startHY;
    let line = startLine;

    for (const node of nodes) {
      const result = this.layoutNode(node, vx, vy, hx, hy, line, words, elements);
      vx = result.vx;
      vy = result.vy;
      hx = result.hx;
      hy = result.hy;
      line = result.line;
    }

    return { vx, vy, hx, hy, line };
  }

  /**
   * 布局单个节点
   * @param {Object} node
   * @param {number} startVX - 垂直模式起始X坐标
   * @param {number} startVY - 垂直模式起始Y坐标
   * @param {number} startHX - 水平模式起始X坐标
   * @param {number} startHY - 水平模式起始Y坐标
   * @param {number} startLine
   * @param {Array} words
   * @param {Array} elements
   * @returns {Object}
   */
  layoutNode(node, startVX, startVY, startHX, startHY, startLine, words, elements) {
    if (node.tag === 'text') {
      return this.layoutText(node.text, {}, startVX, startVY, startHX, startHY, startLine, words);
    }

    let vx = startVX;
    let vy = startVY;
    let hx = startHX;
    let hy = startHY;
    let line = startLine;

    // 处理块级元素的上边距
    if (this.transferEngine.isBlockElement(node.tag)) {
      const marginTop = this.parseSize(node.style.marginTop);
      if (marginTop > 0) {
        vy += marginTop;
        hy += marginTop;
      }

      // 块级元素从新行开始
      if (vx > this.theme.paddingX || hx > this.theme.paddingX) {
        line++;
        vx = this.theme.paddingX;
        const lineHeight = this.getLineHeight(node.style);
        vy += lineHeight;
        hy += lineHeight;
        
        // 水平模式：检查是否需要换页
        if (this.mode === 'horizontal') {
          const maxHeight = this.canvasHeight - this.theme.paddingX;
          if (hy + lineHeight > maxHeight) {
            hx += this.canvasWidth; // 移动到下一页
            hy = this.theme.paddingX; // 重置到页面顶部
          } else {
            hx = this.theme.paddingX; // 正常换行
          }
        } else {
          hx = this.theme.paddingX;
        }
      }
    }

    // 处理特殊元素
    if (node.tag === 'img') {
      // 使用节点中的尺寸信息，如果没有则使用默认值
      const imageWidth = node.width || this.defaultImageWidth;
      const imageHeight = node.height || this.defaultImageHeight;

      const imageElement = {
        type: 'image',
        vx: vx,
        vy: vy,
        hx: hx,
        hy: hy,
        width: imageWidth,
        height: imageHeight,
        src: node.src,
        alt: node.alt || '',
      };

      elements.push(imageElement);

      // 图片后换行，使用实际的图片高度
      line++;
      vx = this.theme.paddingX;
      vy += imageHeight + 20; // 图片高度 + 间距
      hy += imageHeight + 20;
      
      // 水平模式：检查是否需要换页
      if (this.mode === 'horizontal') {
        const maxHeight = this.canvasHeight - this.theme.paddingX;
        if (hy + imageHeight + 20 > maxHeight) {
          hx += this.canvasWidth; // 移动到下一页
          hy = this.theme.paddingX; // 重置到页面顶部
        } else {
          hx = this.theme.paddingX; // 正常换行
        }
      } else {
        hx = this.theme.paddingX;
      }
    } else if (node.children && node.children.length > 0) {
      // 递归处理子节点
      const result = this.layoutNodes(
        node.children,
        vx,
        vy,
        hx,
        hy,
        line,
        words,
        elements
      );
      vx = result.vx;
      vy = result.vy;
      hx = result.hx;
      hy = result.hy;
      line = result.line;
    }

    // 处理块级元素的下边距和换行
    if (this.transferEngine.isBlockElement(node.tag)) {
      const marginBottom = this.parseSize(node.style.marginBottom);
      if (marginBottom > 0) {
        vy += marginBottom;
        hy += marginBottom;
      }

      // 块级元素后换行
      line++;
      vx = this.theme.paddingX;
      const lineHeight = this.getLineHeight(node.style);
      vy += lineHeight;
      hy += lineHeight;
      
      // 水平模式：检查是否需要换页
      if (this.mode === 'horizontal') {
        const maxHeight = this.canvasHeight - this.theme.paddingX;
        if (hy + lineHeight > maxHeight) {
          hx += this.canvasWidth; // 移动到下一页
          hy = this.theme.paddingX; // 重置到页面顶部
        } else {
          hx = this.theme.paddingX; // 正常换行
        }
      } else {
        hx = this.theme.paddingX;
      }
    }

    return { vx, vy, hx, hy, line };
  }

  /**
   * 布局文本
   * @param {string} text
   * @param {Object} style
   * @param {number} startVX - 垂直模式起始X坐标
   * @param {number} startVY - 垂直模式起始Y坐标
   * @param {number} startHX - 水平模式起始X坐标
   * @param {number} startHY - 水平模式起始Y坐标
   * @param {number} startLine
   * @param {Array} words
   * @returns {Object}
   */
  layoutText(text, style, startVX, startVY, startHX, startHY, startLine, words) {
    const fontSize = this.parseSize(style.fontSize) || this.theme.baseFontSize;
    const fontWeight = style.fontWeight || 'normal';
    const fontStyle = style.fontStyle || 'normal';
    const lineHeight = this.getLineHeight(style);

    // 更新测量上下文的字体
    this.measureCtx.font = `${fontStyle} ${fontWeight} ${fontSize}px ${this.theme.fontFamily}`;

    // 垂直模式坐标
    let vx = startVX;
    let vy = startVY;
    
    // 水平模式坐标
    let hx = startHX;
    let hy = startHY;
    
    let line = startLine;

    // 计算当前行的基线位置
    const baseline = this.getTextBaseline(lineHeight, fontSize);
    let currentVLineY = vy + baseline;
    let currentHLineY = hy + baseline;

    // 将文本按照单词和中文字符分割
    const segments = this.segmentText(text);

    for (const segment of segments) {
      const segmentWidth = this.measureCtx.measureText(segment.content).width;

      // 根据模式检查是否需要换行
      let needNewLine = false;

      if (this.mode === 'vertical') {
        // 垂直模式：检查宽度限制
        const maxWidth = this.canvasWidth - this.theme.paddingX;
        
        if (segment.type === 'word') {
          // 英文单词：整个单词必须在同一行
          if (vx + segmentWidth > maxWidth && vx > this.theme.paddingX) {
            needNewLine = true;
          }
        } else if (segment.type === 'cjk' || segment.type === 'punctuation') {
          // 中文字符和标点：可以在任意位置换行
          if (vx + segmentWidth > maxWidth && vx > this.theme.paddingX) {
            needNewLine = true;
          }
        } else if (segment.type === 'space') {
          // 空格：如果导致换行则不渲染
          if (vx + segmentWidth > maxWidth && vx > this.theme.paddingX) {
            line++;
            vx = this.theme.paddingX;
            vy += lineHeight;
            currentVLineY = vy + baseline;
            continue; // 跳过这个空格
          }
        }

        if (needNewLine) {
          line++;
          vx = this.theme.paddingX;
          vy += lineHeight;
          currentVLineY = vy + baseline;
        }
      } else if (this.mode === 'horizontal') {
        // 水平模式：检查宽度和高度限制
        const maxWidth = this.canvasWidth - this.theme.paddingX;
        const maxHeight = this.canvasHeight - this.theme.paddingX;

        // 检查宽度换行
        if (segment.type === 'word') {
          if (hx + segmentWidth > maxWidth && hx > this.theme.paddingX) {
            needNewLine = true;
          }
        } else if (segment.type === 'cjk' || segment.type === 'punctuation') {
          if (hx + segmentWidth > maxWidth && hx > this.theme.paddingX) {
            needNewLine = true;
          }
        } else if (segment.type === 'space') {
          if (hx + segmentWidth > maxWidth && hx > this.theme.paddingX) {
            line++;
            hy += lineHeight;
            currentHLineY = hy + baseline;
            
            // 检查是否需要换页（超出高度限制）
            if (hy + lineHeight > maxHeight) {
              hx += this.canvasWidth; // 移动到下一页
              hy = this.theme.paddingX; // 重置到页面顶部
              currentHLineY = hy + baseline;
            } else {
              hx = this.theme.paddingX; // 正常换行
            }
            continue;
          }
        }

        if (needNewLine) {
          line++;
          hy += lineHeight;
          currentHLineY = hy + baseline;
          
          // 检查是否需要换页（超出高度限制）
          if (hy + lineHeight > maxHeight) {
            hx += this.canvasWidth; // 移动到下一页
            hy = this.theme.paddingX; // 重置到页面顶部
            currentHLineY = hy + baseline;
          } else {
            hx = this.theme.paddingX; // 正常换行
          }
        }
      }

      // 添加到words数组
      words.push({
        vx,
        vy: currentVLineY, // 垂直模式：使用基线位置作为y坐标
        hx,
        hy: currentHLineY, // 水平模式：使用基线位置作为y坐标
        width: segmentWidth,
        height: fontSize,
        line,
        text: segment.content,
        type: segment.type,
        style: {
          fontSize,
          fontWeight,
          fontStyle,
          color: style.color || this.theme.textColor,
        },
        startIndex: segment.startIndex,
        endIndex: segment.endIndex,
      });

      // 更新坐标
      vx += segmentWidth;
      hx += segmentWidth;
    }

    return { vx, vy, hx, hy, line };
  }

  /**
   * 将文本分割为单词、字符和空格段
   * @param {string} text
   * @returns {Array}
   */
  segmentText(text) {
    const segments = [];

    const regex =
      /(\w+(?:[-']\w+)*)|([\u4e00-\u9fff\u3400-\u4dbf\u20000-\u2a6df\u2a700-\u2b73f\u2b740-\u2b81f\u2b820-\u2ceaf\uf900-\ufaff\u3300-\u33ff])|(\s+)|([\p{P}\p{S}])|(.)/gu;

    let match;

    while ((match = regex.exec(text)) !== null) {
      const [fullMatch, englishWord, cjkChar, whitespace, punctuation, other] =
        match;
      const startIndex = match.index;
      const endIndex = startIndex + fullMatch.length;

      if (englishWord) {
        segments.push({
          type: 'word',
          content: englishWord,
          startIndex,
          endIndex,
        });
      } else if (cjkChar) {
        segments.push({
          type: 'cjk',
          content: cjkChar,
          startIndex,
          endIndex,
        });
      } else if (whitespace) {
        segments.push({
          type: 'space',
          content: whitespace,
          startIndex,
          endIndex,
        });
      } else if (punctuation) {
        segments.push({
          type: 'punctuation',
          content: punctuation,
          startIndex,
          endIndex,
        });
      } else if (other) {
        segments.push({
          type: 'other',
          content: other,
          startIndex,
          endIndex,
        });
      }
    }

    return segments;
  }

  /**
   * 解析尺寸值（支持em、px、pt等）
   * @param {string} value
   * @returns {number}
   */
  parseSize(value) {
    if (!value) return 0;

    if (typeof value === 'number') return value;

    if (value.endsWith('em')) {
      return parseFloat(value) * this.theme.baseFontSize;
    }

    if (value.endsWith('px')) {
      return parseFloat(value);
    }

    // EPUB常用pt单位转换 (1pt = 1.33px)
    if (value.endsWith('pt')) {
      return parseFloat(value) * 1.33;
    }

    return parseFloat(value) || 0;
  }

  /**
   * 获取行高
   * @param {Object} style
   * @returns {number}
   */
  getLineHeight(style = {}) {
    const fontSize = this.parseSize(style.fontSize) || this.theme.baseFontSize;
    return fontSize * this.theme.lineHeight;
  }

  /**
   * 获取文本基线位置
   * @param {number} lineHeight - 行高
   * @param {number} fontSize - 字体大小
   * @returns {number} 基线相对于行顶部的偏移
   */
  getTextBaseline(lineHeight, fontSize) {
    const ascentRatio = 0.8;
    return lineHeight * ascentRatio;
  }

  /**
   * 清空画布
   */
  clear() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /**
   * 渲染背景
   */
  renderBackground() {
    this.ctx.fillStyle = this.theme.backgroundColor;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /**
   * 渲染文本
   */
  renderText() {
    if (!this.renderResult) return;

    const { words } = this.renderResult;
    let currentFont = '';

    words.forEach((word) => {
      const { style } = word;
      const font = `${style.fontStyle || 'normal'} ${
        style.fontWeight || 'normal'
      } ${style.fontSize}px ${this.theme.fontFamily}`;

      // 优化：只在字体改变时更新
      if (font !== currentFont) {
        this.ctx.font = font;
        currentFont = font;
      }

      this.ctx.fillStyle = style.color || this.theme.textColor;
      this.ctx.fillText(word.text, word.x, word.y);
    });
  }

  /**
   * 渲染元素（图片等）
   */
  renderElements() {
    if (!this.renderResult) return;

    const { elements } = this.renderResult;

    elements.forEach((element) => {
      if (element.type === 'image') {
        // 绘制图片占位符
        this.ctx.strokeStyle = '#ccc';
        this.ctx.strokeRect(
          element.x,
          element.y,
          element.width,
          element.height
        );

        // 绘制图片图标或文字
        this.ctx.fillStyle = '#999';
        this.ctx.font = '14px system-ui';
        this.ctx.fillText(
          element.alt || 'Image',
          element.x + 10,
          element.y + element.height / 2
        );
      }
    });
  }

  /**
   * 设置主题
   * @param {Object} theme
   */
  setTheme(theme) {
    this.theme = { ...this.theme, ...theme };

    // 重新渲染
    if (this.currentHTML) {
      this.render(this.currentHTML);
    }
  }

  /**
   * 获取渲染结果
   * @returns {RenderResult|null}
   */
  getRenderResult() {
    return this.renderResult;
  }

  /**
   * 获取页面样式
   * @returns {Object|null}
   */
  getPageStyle() {
    return this.pageStyle;
  }

  /**
   * 获取Canvas元素（供外部访问）
   * @returns {HTMLCanvasElement}
   */
  getCanvas() {
    return this.canvas;
  }

  /**
   * 获取容器元素（供外部访问）
   * @returns {HTMLElement}
   */
  getContainer() {
    return this.container;
  }

  /**
   * 懒加载图片
   * @param {string} src - 图片源地址
   * @param {number} [width] - 期望宽度
   * @param {number} [height] - 期望高度
   * @returns {Promise<ImageElement>}
   */
  async loadImage(src, width = null, height = null) {
    // 检查缓存
    if (this.imageCache.has(src)) {
      return this.imageCache.get(src);
    }

    // 开始加载
    const promise = new Promise((resolve) => {
      const img = new Image();

      // 创建图片元素对象
      const imageElement = {
        type: 'image',
        x: 0,
        y: 0,
        width: width || this.defaultImageWidth,
        height: height || this.defaultImageHeight,
        src: src,
        alt: '',
        imageElement: img,
        error: null,
      };

      img.onload = () => {
        // 如果没有指定尺寸，使用图片的自然尺寸
        if (!width && !height) {
          imageElement.width = img.naturalWidth;
          imageElement.height = img.naturalHeight;
        } else if (!width) {
          // 只指定了高度，按比例计算宽度
          imageElement.width = (img.naturalWidth / img.naturalHeight) * height;
        } else if (!height) {
          // 只指定了宽度，按比例计算高度
          imageElement.height = (img.naturalHeight / img.naturalWidth) * width;
        }

        this.imageCache.set(src, imageElement);

        resolve(imageElement);
      };

      img.onerror = (error) => {
        imageElement.error = error.message || 'Failed to load image';
        this.imageCache.set(src, imageElement);
        imageElement.imageElement = null;
        resolve(imageElement);
      };

      // 设置跨域属性（如果需要）
      img.crossOrigin = 'anonymous';
      img.src = src;
    });
    this.imageCache.set(src, promise);
    return promise;
  }

  /**
   * 销毁渲染器
   */
  destroy() {
    this.clear();

    // 移除DOM元素
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }

    // 销毁管理器
    if (this.viewport) {
      this.viewport.destroy();
      this.viewport = null;
    }

    // 清理引用
    this.renderResult = null;
    this.parsedNodes = null;
    this.pageStyle = null;
    this.container = null;
    this.canvas = null;
    this.measureCanvas = null;
    this.measureCtx = null;

    // 清理数据
    this.renderChunks.clear();
    this.fullLayoutData = null;

    // 清理图片缓存
    this.imageCache.clear();

    window.removeEventListener('resize', this.setupHighDPI.bind(this));
  }

  /**
   * 初始化垂直模式
   */
  initVerticalMode(config) {
    // 初始化虚拟视窗
    this.viewport = new VirtualViewport({
      mountPoint: null, // 不需要挂载点，DOM已经创建
      container: this.container,
      canvasList: this.canvasList,
      scrollContent: this.scrollContent,
      viewportHeight: this.viewportHeight,
      viewportWidth: this.viewportWidth,
      chunkHeight: this.chunkHeight,
      poolSize: config.poolSize || 4,
      onViewportChange: this.handleViewportChange.bind(this),
    });
  }

  /**
   * 获取容器元素（供外部访问）
   * @returns {HTMLElement}
   */
  getContainer() {
    return this.container;
  }

  /**
   * 设置渲染模式
   * @param {string} mode - 'vertical' | 'horizontal'
   */
  setMode(mode) {
    // 验证模式参数
    if (!['vertical', 'horizontal'].includes(mode)) {
      console.warn(`Invalid mode "${mode}". Mode not changed.`);
      return;
    }

    // 如果模式没有变化，直接返回
    if (this.mode === mode) {
      return;
    }

    console.log(`Switching from ${this.mode} mode to ${mode} mode`);
    this.mode = mode;

    // TODO: 在这里添加模式切换的具体实现
    // 目前只是更新模式属性，具体的DOM重构和管理器切换将在后续实现
  }
}

export default VirtualCanvasRenderer;
