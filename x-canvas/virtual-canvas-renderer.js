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
import { HorizontalSlideManager } from './slide-canvas.js';
import { VirtualViewport } from './scroll-canvas.js';

/**
 * @typedef {Object} VirtualRenderConfig
 * @property {HTMLElement} mountPoint - 挂载点元素
 * @property {number} [poolSize=4] - Canvas池大小
 * @property {Object} [theme] - 主题配置
 * @property {string} [mode='vertical'] - 渲染模式：'vertical' | 'horizontal'
 * @property {boolean} [adjustCrossChunkContent=true] - 是否自动调整跨块内容位置
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
 * @property {number} x - X坐标
 * @property {number} y - Y坐标
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

  /** @type {boolean} 是否启用调试模式 */
  debug = false;

  // 引擎和数据
  /** @type {TransferEngine} HTML转换引擎实例 */
  transferEngine;

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

    // 布局计算模式 - 是否自动调整跨块内容
    this.adjustCrossChunkContent = this.mode === 'horizontal'; // 默认启用

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
    this.viewportWidth = this.debug ? this.mountPoint.clientWidth : window.innerWidth; // 使用窗口宽度作为视窗宽度
    this.viewportHeight = this.debug ? this.mountPoint.clientHeight : window.innerHeight; // 使用窗口高度作为视窗高度

    // Canvas尺寸 - 直接使用视窗尺寸
    this.canvasWidth = this.viewportWidth;
    this.canvasHeight = this.viewportHeight;

    // 块高度 - 每个渲染块的高度，等于Canvas高度
    this.chunkHeight = this.canvasHeight;
    this.chunkWidth = this.canvasWidth;

    // 创建DOM结构
    this.createDOMStructure();

    this.ctx = this.canvas.getContext('2d');

    // 转换引擎实例
    this.transferEngine = new TransferEngine();

    this.parsedNodes = null;
    this.pageStyle = null;

    // 创建隐藏的canvas用于测量文本
    this.measureCanvas = document.createElement('canvas');
    this.measureCtx = this.measureCanvas.getContext('2d');

    // 初始化垂直模式
    this.initMode(config);

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
      height: 100%;  /* 动态设置为总内容高度 */
    `;

    // 创建Canvas池，作为滚动内容的子元素
    this.canvasList = [];
    const poolSize = 4;
    const baseOffset = this.mode === 'horizontal' ? this.chunkWidth : this.chunkHeight;
    for (let i = 0; i < poolSize; i++) {
      const canvas = document.createElement('canvas');
      canvas.className = `virtual-canvas-${i}`;
      canvas.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        width: ${this.canvasWidth}px;
        height: ${this.canvasHeight}px;
        z-index: 2;
        display: block;
        pointer-events: auto;
      `;
      if (this.mode === 'horizontal') {
        canvas.style.left = `${i * baseOffset}px`;
      } else {
        canvas.style.top = `${i * baseOffset}px`;
      }

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
    this.viewportWidth = this.debug ? this.mountPoint.clientWidth : window.innerWidth;
    this.viewportHeight = this.debug ? this.mountPoint.clientHeight : window.innerHeight;
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
      this.viewport.config.chunkWidth = this.chunkWidth;
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
    this.viewport.setContentRange(this.mode === 'vertical' ? this.fullLayoutData.totalHeight : this.fullLayoutData.totalWidth);

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

    let x = this.theme.paddingX;
    let y = 0;
    let currentLine = 0;

    // 初始化渲染块管理
    this.initRenderChunks();

    // 使用原有的布局算法计算所有位置
    const result = this.layoutNodes(
      this.parsedNodes,
      x,
      y,
      currentLine,
      words,
      elements
    );

    // 📐 正确的总高度计算方式：使用实际的Y坐标
    const contentHeight = result.y;

    // 计算需要的总块数
    const chunkHeight = this.viewport.config.chunkHeight;
    const chunkWidth = this.viewport.config.chunkWidth;
    const totalChunks = Math.ceil(contentHeight / chunkHeight);

    // scrollContent 的高度基于块数量，而不是内容高度
    const scrollContentHeight = totalChunks * chunkHeight;
    const scrollContentWidth = totalChunks * chunkWidth;

    this.fullLayoutData = {
      words,
      elements,
      contentHeight, // 实际内容高度
      scrollContentHeight, // 滚动容器高度
      totalHeight: scrollContentHeight, // 兼容性，使用滚动容器高度
      totalWidth: scrollContentWidth,
      totalChunks,
    };

  }

  /**
   * 初始化渲染块管理
   */
  initRenderChunks() {
    // 清空现有块
    this.renderChunks.clear();

    // 初始化当前块索引
    this.currentChunkIndex = 0;
    this.currentChunk = null;

    // 创建第一个块
    this.createNewChunk(0);
  }

  /**
   * 创建新的渲染块
   * @param {number} chunkIndex - 块索引
   */
  createNewChunk(chunkIndex) {
    const chunkHeight = this.viewport.config.chunkHeight;
    const startY = chunkIndex * chunkHeight;
    const endY = (chunkIndex + 1) * chunkHeight;

    this.currentChunk = {
      index: chunkIndex,
      startY,
      endY,
      words: [],
      elements: [],
      rendered: false,
    };
    this.renderChunks.set(chunkIndex, this.currentChunk);
  }

  /**
 * 将单词添加到适当的渲染块
 * @param {Object} word - 单词对象
 * @returns {Object} 可能调整后的单词对象
 */
  addWordToChunk(word) {
    const lineHeight = this.getLineHeight(word.style);
    const baseline = this.getTextBaseline(lineHeight);
    const chunkHeight = this.viewport.config.chunkHeight;

    let wordTop = word.y - baseline;
    let wordBottom = wordTop + lineHeight;

    // 如果启用了跨块内容调整
    if (this.adjustCrossChunkContent) {
      const wordChunkIndex = Math.floor(wordTop / chunkHeight);
      const chunkBottom = (wordChunkIndex + 1) * chunkHeight;

      // 检查单词是否与块底部交叉
      if (wordBottom > chunkBottom && wordTop < chunkBottom) {
        // 将单词调整到下一个块的开始
        const nextChunkStart = chunkBottom;
        const adjustment = nextChunkStart - wordTop;

        // 更新单词的y坐标
        word.y += adjustment;

        // 重新计算位置
        wordTop = word.y - baseline;
        wordBottom = wordTop + lineHeight;


      }
    }

    // 计算单词所属的块索引（使用调整后的位置）
    const wordChunkIndex = Math.floor(wordTop / chunkHeight);

    // 如果需要创建新块
    if (wordChunkIndex > this.currentChunkIndex) {
      // 创建中间可能缺失的块
      for (let i = this.currentChunkIndex + 1; i <= wordChunkIndex; i++) {
        this.createNewChunk(i);
        this.currentChunkIndex = i;
      }
    }

    // 将单词添加到对应的块中
    const targetChunk = this.renderChunks.get(wordChunkIndex);

    if (targetChunk) {
      targetChunk.words.push(word);
    }

    // 检查是否仍然跨越多个块（调整后应该很少发生）
    const endChunkIndex = Math.floor((wordBottom - 1) / chunkHeight);
    if (endChunkIndex > wordChunkIndex) {
      for (let i = wordChunkIndex + 1; i <= endChunkIndex; i++) {
        if (i > this.currentChunkIndex) {
          this.createNewChunk(i);
          this.currentChunkIndex = i;
        }

        const chunk = this.renderChunks.get(i);

        if (chunk) {
          chunk.words.push(word);
        }
      }
    }

    return word; // 返回可能调整后的单词对象
  }

  /**
 * 将元素添加到适当的渲染块
 * @param {Object} element - 元素对象
 * @returns {Object} 可能调整后的元素对象
 */
  addElementToChunk(element) {
    const chunkHeight = this.viewport.config.chunkHeight;

    let elementTop = element.y;
    let elementBottom = element.y + element.height;

    // 如果启用了跨块内容调整
    if (this.adjustCrossChunkContent) {
      const elementChunkIndex = Math.floor(elementTop / chunkHeight);
      const chunkBottom = (elementChunkIndex + 1) * chunkHeight;

      // 检查元素是否与块底部交叉
      if (elementBottom > chunkBottom && elementTop < chunkBottom) {
        // 将元素调整到下一个块的开始
        const nextChunkStart = chunkBottom;
        const adjustment = nextChunkStart - elementTop;

        // 更新元素的y坐标
        element.y += adjustment;

        // 重新计算位置
        elementTop = element.y;
        elementBottom = element.y + element.height;


      }
    }

    // 计算元素所属的块索引（使用调整后的位置）
    const elementChunkIndex = Math.floor(elementTop / chunkHeight);

    // 如果需要创建新块
    if (elementChunkIndex > this.currentChunkIndex) {
      // 创建中间可能缺失的块
      for (let i = this.currentChunkIndex + 1; i <= elementChunkIndex; i++) {
        this.createNewChunk(i);
        this.currentChunkIndex = i;
      }
    }

    // 将元素添加到对应的块中
    const targetChunk = this.renderChunks.get(elementChunkIndex);

    if (targetChunk) {
      targetChunk.elements.push(element);
    }

    // 检查是否仍然跨越多个块（调整后应该很少发生）
    const endChunkIndex = Math.floor((elementBottom - 1) / chunkHeight);
    if (endChunkIndex > elementChunkIndex) {
      for (let i = elementChunkIndex + 1; i <= endChunkIndex; i++) {
        if (i > this.currentChunkIndex) {
          this.createNewChunk(i);
          this.currentChunkIndex = i;
        }

        const chunk = this.renderChunks.get(i);

        if (chunk) {
          chunk.elements.push(element);
        }
      }
    }

    return element; // 返回可能调整后的元素对象
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
   * @param {number} offsetY
   */
  renderCanvasText(words, ctx, offsetY) {
    let currentFont = '';
    words.forEach((word) => {
      const { style } = word;
      const font = `${style.fontStyle || 'normal'} ${style.fontWeight || 'normal'
        } ${style.fontSize}px ${this.theme.fontFamily}`;

      if (font !== currentFont) {
        ctx.font = font;
        currentFont = font;
      }

      ctx.fillStyle = style.color || this.theme.textColor;

      // 计算在Canvas内的相对位置
      const canvasY = word.y - offsetY;
      ctx.fillText(word.text, word.x, canvasY);
    });
  }

  /**
   * 渲染Canvas中的元素
   * TODO: 添加一个重新加载的功能
   * @param {Array<ImageElement>} elements - 元素数组
   * @param {CanvasRenderingContext2D} ctx - Canvas上下文
   * @param {number} offsetY - Y轴偏移量
   */
  renderCanvasElements(elements, ctx, offsetY) {
    elements.forEach(async (element) => {
      if (element.type === 'image') {
        const canvasY = element.y - offsetY;
        // 显示占位符
        this.drawImagePlaceholder(
          ctx,
          element,
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
              element.x,
              canvasY,
              element.width,
              element.height
            );

            // 可选：添加图片边框
            if (this.theme.showImageBorder) {
              ctx.strokeStyle = this.theme.imageBorderColor || '#ddd';
              ctx.lineWidth = 1;
              ctx.strokeRect(element.x, canvasY, element.width, element.height);
            }
          } catch (error) {
            console.warn('Failed to draw image:', element.src, error);
            this.drawImagePlaceholder(ctx, element, canvasY, 'Error');
          }
        }
      }
    });
  }

  /**
   * 绘制图片占位符
   * @param {CanvasRenderingContext2D} ctx - Canvas上下文
   * @param {ImageElement} element - 图片元素
   * @param {number} canvasY - Canvas中的Y坐标
   * @param {string} text - 显示的文本
   */
  drawImagePlaceholder(ctx, element, canvasY, text) {
    // 绘制图片占位符边框
    ctx.strokeStyle = '#ccc';
    ctx.strokeRect(element.x, canvasY, element.width, element.height);

    // 绘制图片图标或文字
    ctx.fillStyle = '#999';
    ctx.font = '14px system-ui';
    // ctx.fillText(text, element.x + 10, canvasY + element.height / 2);
  }

  /**
   * 渲染单个块
   * @param {Object} chunkInfo - 块信息
   * @param {number} scrollTop - 滚动位置
   */

  /**
   * 根据坐标获取字符索引（虚拟滚动支持）
   * @param {Object} point - 视口坐标
   * @param {number} point.x
   * @param {number} point.y
   * @returns {number|null}
   */
  getCharIndexAt(point) {
    if (!this.fullLayoutData) return null;
    const { x: clientX, y: clientY } = point;

    // 1. 获取容器边界矩形（不包含滚动偏移）
    const containerRect = this.container.getBoundingClientRect();

    // 2. 将视口坐标转换为容器内的相对坐标
    const containerX = clientX - containerRect.left;
    const containerY = clientY - containerRect.top;

    // 3. 检查点击是否在容器范围内
    if (containerX < 0 || containerX > containerRect.width ||
      containerY < 0 || containerY > containerRect.height) {
      return null;
    }
    // 4. 将容器坐标转换为内容坐标（加上滚动偏移）
    const contentX = containerX;
    const contentY = containerY + this.viewport.state.scrollTop;

    // 5. 在所有单词中查找最匹配的
    const { words } = this.fullLayoutData;
    const lineHeight = this.getLineHeight();
    const baseline = this.getTextBaseline(lineHeight);

    let bestMatchIndex = null;
    let minDistance = Infinity;

    for (let i = 0; i < words.length; i++) {
      const word = words[i];

      // 计算单词的边界
      const wordTop = word.y - baseline;
      const wordBottom = wordTop + lineHeight;
      const wordLeft = word.x;
      const wordRight = word.x + word.width;

      // 精确匹配：点击在单词范围内
      if (
        contentY >= wordTop &&
        contentY <= wordBottom &&
        contentX >= wordLeft &&
        contentX <= wordRight
      ) {
        return i;
      }

      // 计算到单词中心的距离
      const wordCenterX = wordLeft + word.width / 2;
      const wordCenterY = word.y; // 基线位置
      const distance = Math.sqrt(
        Math.pow(contentX - wordCenterX, 2) +
        Math.pow(contentY - wordCenterY, 2)
      );

      if (distance < minDistance) {
        minDistance = distance;
        bestMatchIndex = i;
      }
    }

    // 返回最近的单词索引
    return bestMatchIndex;
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

    // 计算字符所在的Y位置
    const wordY =
      word.y -
      this.getTextBaseline(this.getLineHeight(word.style));

    // 滚动到该位置，居中显示
    const targetY = wordY - this.viewport.state.viewportHeight / 2;
    this.viewport.scrollTo(Math.max(0, targetY));
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
   * 布局节点
   * @param {Array} nodes
   * @param {number} startX
   * @param {number} startY
   * @param {number} startLine
   * @param {Array} words
   * @param {Array} elements
   * @returns {Object}
   */
  layoutNodes(nodes, startX, startY, startLine, words, elements) {
    let x = startX;
    let y = startY;
    let line = startLine;

    for (const node of nodes) {
      const result = this.layoutNode(node, x, y, line, words, elements);
      x = result.x;
      y = result.y;
      line = result.line;
    }

    return { x, y, line };
  }

  /**
   * 布局单个节点
   * @param {Object} node
   * @param {number} startX
   * @param {number} startY
   * @param {number} startLine
   * @param {Array} words
   * @param {Array} elements
   * @returns {Object}
   */
  layoutNode(node, startX, startY, startLine, words, elements) {
    if (node.tag === 'text') {
      return this.layoutText(node.text, {}, startX, startY, startLine, words);
    }

    let x = startX;
    let y = startY;
    let line = startLine;

    // 处理块级元素的上边距
    if (this.transferEngine.isBlockElement(node.tag)) {
      const marginTop = this.parseSize(node.style.marginTop);
      if (marginTop > 0) {
        y += marginTop;
      }

      // 块级元素从新行开始
      if (x > this.theme.paddingX) {
        line++;
        x = this.theme.paddingX;
        y += this.getLineHeight(node.style); // 使用完整行高
      }
    }

    // 处理特殊元素
    if (node.tag === 'img') {
      // 使用节点中的尺寸信息，如果没有则使用默认值
      const imageWidth = node.width || this.defaultImageWidth;
      const imageHeight = node.height || this.defaultImageHeight;

      const imageElement = {
        type: 'image',
        x: x,
        y: y,
        width: imageWidth,
        height: imageHeight,
        src: node.src,
        alt: node.alt || '',
      };

      // 立即添加到渲染块（可能会调整位置）
      const adjustedImageElement = this.addElementToChunk(imageElement);

      // 添加调整后的元素到elements数组
      elements.push(adjustedImageElement);

      // 图片后换行，使用调整后的图片位置和高度
      line++;
      x = this.theme.paddingX;
      y = adjustedImageElement.y + adjustedImageElement.height + 20; // 使用调整后的图片高度 + 间距
    } else if (node.children && node.children.length > 0) {
      // 递归处理子节点
      const result = this.layoutNodes(
        node.children,
        x,
        y,
        line,
        words,
        elements
      );
      x = result.x;
      y = result.y;
      line = result.line;
    }

    // 处理块级元素的下边距和换行
    if (this.transferEngine.isBlockElement(node.tag)) {
      const marginBottom = this.parseSize(node.style.marginBottom);
      if (marginBottom > 0) {
        y += marginBottom;
      }

      // 块级元素后换行
      line++;
      x = this.theme.paddingX;
      y += this.getLineHeight(node.style); // 使用完整行高
    }

    return { x, y, line };
  }

  /**
   * 布局文本
   * @param {string} text
   * @param {Object} style
   * @param {number} startX
   * @param {number} startY
   * @param {number} startLine
   * @param {Array} words
   * @returns {Object}
   */
  layoutText(text, style, startX, startY, startLine, words) {
    const fontSize = this.parseSize(style.fontSize) || this.theme.baseFontSize;
    const fontWeight = style.fontWeight || 'normal';
    const fontStyle = style.fontStyle || 'normal';
    const lineHeight = this.getLineHeight(style);

    // 更新测量上下文的字体
    this.measureCtx.font = `${fontStyle} ${fontWeight} ${fontSize}px ${this.theme.fontFamily}`;

    let x = startX;
    let y = startY;
    let line = startLine;

    // 计算当前行的基线位置
    const baseline = this.getTextBaseline(lineHeight);
    let currentLineY = y + baseline;

    // 将文本按照单词和中文字符分割
    const segments = this.segmentText(text);

    for (const segment of segments) {
      const segmentWidth = this.measureCtx.measureText(segment.content).width;

      // 检查是否需要换行
      const maxWidth = this.canvasWidth - this.theme.paddingX;

      let needNewLine = false;

      if (segment.type === 'word') {
        // 英文单词：整个单词必须在同一行
        if (x + segmentWidth > maxWidth && x > this.theme.paddingX) {
          needNewLine = true;
        }
      } else if (segment.type === 'cjk' || segment.type === 'punctuation') {
        // 中文字符和标点：可以在任意位置换行
        if (x + segmentWidth > maxWidth && x > this.theme.paddingX) {
          needNewLine = true;
        }
      } else if (segment.type === 'space') {
        // 空格：如果导致换行则不渲染
        if (x + segmentWidth > maxWidth && x > this.theme.paddingX) {
          line++;
          x = this.theme.paddingX;
          y += lineHeight; // 整行高度
          currentLineY = y + baseline; // 重新计算基线位置
          continue; // 跳过这个空格
        }
      }

      if (needNewLine) {
        line++;
        x = this.theme.paddingX;
        y += lineHeight; // 整行高度
        currentLineY = y + baseline; // 重新计算基线位置
      }

      // 创建单词对象
      const word = {
        x,
        y: currentLineY, // 使用基线位置作为y坐标
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
      };

      // 立即添加到渲染块（可能会调整位置）
      const adjustedWord = this.addWordToChunk(word);

      // 如果单词位置被调整，需要同步更新布局状态
      if (adjustedWord.y !== currentLineY) {
        // 重新计算基线位置和行高
        const newY = adjustedWord.y - baseline;
        const lineAdjustment = newY - y;

        // 更新布局状态
        y = newY;
        currentLineY = adjustedWord.y;

        // 如果调整幅度较大，可能需要更新行号和重置x坐标
        // if (lineAdjustment >= lineHeight) {
        //   line += Math.floor(lineAdjustment / lineHeight);
        //   // 重置x坐标到行首，因为这相当于一个新行的开始
        //   x = this.theme.paddingX;
        //   // 更新调整后单词的x坐标
        //   adjustedWord.x = x;
        // }

      }

      // 添加调整后的单词到words数组
      words.push(adjustedWord);

      x += segmentWidth;
    }

    return { x, y, line };
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
  getTextBaseline(lineHeight) {
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

  initMode(config) {
    // 初始化虚拟视窗
    let Viewport = config.mode === 'vertical' ? VirtualViewport : HorizontalSlideManager;
    this.viewport = new Viewport({
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
}
export default VirtualCanvasRenderer;
