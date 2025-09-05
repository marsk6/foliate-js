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
 *   theme: { baseFontSize: 18 },
 *   onProgressChange: (progressInfo) => {
 *     console.log('Progress changed:', progressInfo.progress);
 *     document.getElementById('progress-bar').style.width =
 *       (progressInfo.progress * 100) + '%';
 *   }
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
 * // 进度操作
 * console.log('当前进度:', renderer.getProgress()); // 0-1之间的数值
 * renderer.setProgress(0.5); // 跳转到50%位置
 *
 * // 获取和设置模式
 * console.log(renderer.getMode()); // 'vertical' 或 'horizontal'
 * renderer.setMode('horizontal'); // 切换到横向模式
 *
 * // 图片自动居中显示
 * // 所有图片都会自动居中对齐，超宽图片会自动缩放适应页面宽度
 */

import HTMLParser2 from './html-parser/index.js';
import { HorizontalSlideManager } from './slide-canvas.js';
import { VirtualViewport } from './scroll-canvas.js';
import { CanvasTools } from './canvas-tools.js';
import { LayoutEngine } from './layout-engine/LayoutEngine.js';

/**
 * @typedef {Object} VirtualRenderConfig
 * @property {HTMLElement} mountPoint - 挂载点元素
 * @property {number} [poolSize=4] - Canvas池大小
 * @property {Object} [theme] - 主题配置
 * @property {string} [mode='vertical'] - 渲染模式：'vertical' | 'horizontal'
 * @property {Function} [onProgressChange] - 进度变化回调函数
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

/**
 * @typedef {Object} ProgressInfo
 * @property {number} progress - 当前进度（0-1）
 * @property {number} oldProgress - 之前的进度（0-1）
 * @property {number} scrollTop - 当前滚动位置
 * @property {number} contentHeight - 内容总高度
 * @property {number} viewportHeight - 视窗高度
 */

/**
 * @typedef {Object} DetailedProgressInfo
 * @property {number} progress - 当前进度（0-1）
 * @property {number} scrollTop - 当前滚动位置
 * @property {number} contentHeight - 内容总高度
 * @property {number} viewportHeight - 视窗高度
 * @property {number} maxScrollTop - 最大滚动位置
 * @property {number} scrollableHeight - 可滚动的高度
 * @property {boolean} isAtTop - 是否在顶部
 * @property {boolean} isAtBottom - 是否在底部
 * @property {boolean} canScroll - 是否可以滚动
 */

export class VirtualCanvasRenderer {
  /** @type {HTMLElement} 滚动容器 */
  container;

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

  // 进度相关
  /** @type {Function|null} 进度变化回调函数 */
  onProgressChange = null;

  // 引擎和数据
  /** @type {HTMLParser} HTML转换引擎实例 */
  htmlParser;

  /** @type {string|undefined} 当前HTML内容 */
  currentHTML;

  // 虚拟滚动相关（垂直模式）
  /** @type {VirtualViewport} 虚拟视窗管理器 */
  viewport;

  /** @type {Array} 完整的布局数据 */
  fullLayoutData = null;

  // 图片管理相关
  /** @type {Map<string, ImageElement>} 图片缓存 */
  imageCache = new Map();

  /** @type {number} 默认图片宽度 */
  defaultImageWidth = 200;

  /** @type {number} 默认图片高度 */
  defaultImageHeight = 150;

  /** @type {CanvasTools} 画布工具 */
  canvasTools;

  /** @type {HTMLCanvasElement[]} Canvas池 */
  canvasList = [];

  /** @type {number} 章节索引 */
  chapterIndex = 0;

  /**
   * @param {VirtualRenderConfig} config
   */
  constructor(config) {
    // 渲染模式配置 - 支持 'vertical' 和 'horizontal'
    this.mode = config.mode || 'vertical';
    this.chapterIndex = config.chapterIndex;

    // 进度变化回调
    this.onProgressChange = config.onProgressChange || null;

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
    this.chunkWidth = this.canvasWidth;

    // 解析后的节点数据
    /** @type {Array|null} 解析后的节点数据 */
    this.renderTree = null;

    // 创建隐藏的canvas用于测量文本
    this.measureCanvas = document.createElement('canvas');
    this.measureCtx = this.measureCanvas.getContext('2d');

    // 初始化布局引擎
    this.layoutEngine = new LayoutEngine(this);

    // 设置高DPI
    this.setupHighDPI();

    window.addEventListener('resize', this.setupHighDPI.bind(this));

    // 初始化划线工具（延迟到DOM创建后）
    this.canvasTools = null;
  }

  /**
   * 创建DOM结构（虚拟滚动模式）
   */
  createDOMStructure() {
    // 创建Google Docs风格的虚拟滚动结构
    if (this.container) {
      this.container.innerHTML = '';
    } else {
      this.container = document.createElement('div');
      this.container.className = 'virtual-scroll-container';
      this.container.style.cssText = `
        width: ${this.viewportWidth}px;
        height: auto;
        min-height: ${this.viewportHeight}px;
        position: relative;
        overflow: visible;
      `;
    }

    // 创建滚动内容容器（关键！）
    this.scrollContent = document.createElement('div');
    this.scrollContent.className = 'scroll-content';
    this.scrollContent.style.cssText = `
      position: relative;
      width: ${this.viewportWidth}px;
      height: ${this.viewportHeight}px;
    `;

    // 创建Canvas池，作为滚动内容的子元素
    const poolSize =
      this.fullLayoutData.totalChunks > 4 ? 4 : this.fullLayoutData.totalChunks;
    const baseOffset =
      this.mode === 'horizontal' ? this.chunkWidth : this.chunkHeight;
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

    // 虚拟内容元素已被scrollContent替代
    this.virtualContent = this.scrollContent;

    // 组装DOM结构
    this.container.appendChild(this.scrollContent);

    // 创建画布工具（包含划线管理）
    this.canvasTools = new CanvasTools(this);
    // 初始化垂直模式
    this.initMode({
      mode: this.mode,
      poolSize,
    });
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
      this.viewport.config.chunkWidth = this.chunkWidth;
      this.viewport.state.viewportHeight = this.viewportHeight;
    }
  }

  /**
   * 布局HTML内容
   * @param {string} htmlContent
   */
  async layout(url) {
    this.currentHTML = 'htmlContent';

    // 1. 先将 HTML 字符串转换为 DOM
    const htmlParse = new HTMLParser2();
    const root = await htmlParse.parse(url);

    this.renderTree = root ? [root] : [];

    // 垂直模式：执行完整布局计算（不渲染）
    this.calculateFullLayout();

    // 创建DOM结构
    // TODO: 根据布局样式，调整 dom 结构
    this.createDOMStructure();

    // 设置虚拟内容高度
    this.viewport.setContentRange(
      this.mode === 'vertical'
        ? this.fullLayoutData.totalHeight
        : this.fullLayoutData.totalWidth
    );

    // 标记所有Canvas需要重新渲染（因为内容已更改）
    this.viewport.canvasInfoList.forEach((canvasInfo) => {
      canvasInfo.needsRerender = true;
    });
  }

  /**
   * 渲染HTML内容（公共API）
   * @returns {Promise} 渲染完成的Promise
   */
  async render() {
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
   * 计算完整布局（不进行Canvas渲染）
   */
  calculateFullLayout() {
    // 使用布局引擎计算完整布局
    this.fullLayoutData = this.layoutEngine.calculateFullLayout();
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
    const chunkHeight = this.chunkHeight;
    const startChunkIndex = Math.floor(contentStartY / chunkHeight);
    const endChunkIndex = Math.floor((contentEndY - 1) / chunkHeight);

    // 遍历相关的chunks并渲染内容
    for (
      let chunkIndex = startChunkIndex;
      chunkIndex <= endChunkIndex;
      chunkIndex++
    ) {
      const chunk = this.fullLayoutData.renderChunks.get(chunkIndex);
      if (!chunk) continue;

      // 直接使用chunk中已经分配好的单词和元素
      const canvasWords = chunk.words;
      const canvasElements = chunk.elements;

      // 渲染内容（相对于Canvas的偏移）
      this.renderCanvasText(canvasWords, ctx, contentStartY);
      this.renderCanvasElements(canvasElements, ctx, contentStartY);

      // 渲染划线
      this.canvasTools.renderCanvasHighlights(ctx, contentStartY, contentEndY);
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
      // 跳过空格的渲染 - 空格不需要在 Canvas 上绘制，只需要保留位置信息用于字符索引计算
      if (word.type === 'space') {
        return;
      }

      const { style } = word;

      // 使用兼容的样式访问方式
      const fontStyle =
        this.layoutEngine.getStyleProperty(style, 'fontStyle') || 'normal';
      const fontWeight =
        this.layoutEngine.getStyleProperty(style, 'fontWeight') || 'normal';
      const fontSize = this.layoutEngine.getStyleProperty(style, 'fontSize');
      const color =
        this.layoutEngine.getStyleProperty(style, 'color') ||
        this.theme.textColor;

      // 处理 fontSize - 如果是带单位的字符串，解析数值部分
      let fontSizeValue;
      if (fontSize) {
        fontSizeValue = this.layoutEngine.parseSize(fontSize);
      } else {
        fontSizeValue = this.theme.baseFontSize;
      }

      const font = `${fontStyle} ${fontWeight} ${fontSizeValue}px ${this.theme.fontFamily}`;

      if (font !== currentFont) {
        ctx.font = font;
        currentFont = font;
      }

      ctx.fillStyle = color;

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
    // 绘制图片占位符边框（浅色边框）
    ctx.strokeStyle = '#ddd';
    ctx.lineWidth = 1;
    ctx.strokeRect(element.x, canvasY, element.width, element.height);

    // 绘制背景填充
    ctx.fillStyle = '#f8f9fa';
    ctx.fillRect(
      element.x + 1,
      canvasY + 1,
      element.width - 2,
      element.height - 2
    );

    // 绘制图片图标（📷 emoji或简单的相机图标）
    ctx.fillStyle = '#aaa';
    ctx.font = '16px system-ui';
    const iconText = '📷';
    const iconWidth = ctx.measureText(iconText).width;
    const iconX = element.x + (element.width - iconWidth) / 2;
    const iconY = canvasY + element.height / 2 - 10;
    ctx.fillText(iconText, iconX, iconY);

    // 绘制提示文本（居中显示）
    if (text && element.height > 40) {
      ctx.fillStyle = '#666';
      ctx.font = '12px system-ui';
      const textWidth = ctx.measureText(text).width;
      const textX = element.x + (element.width - textWidth) / 2;
      const textY = canvasY + element.height / 2 + 15;
      ctx.fillText(text, textX, textY);
    }

    // 如果图片被缩放，显示缩放提示
    if (element.isScaled) {
      ctx.fillStyle = '#888';
      ctx.font = '10px system-ui';
      const scaleText = `${element.originalWidth}×${
        element.originalHeight
      } → ${Math.round(element.width)}×${Math.round(element.height)}`;
      const scaleWidth = ctx.measureText(scaleText).width;
      const scaleX = element.x + (element.width - scaleWidth) / 2;
      const scaleY = canvasY + element.height - 8;
      ctx.fillText(scaleText, scaleX, scaleY);
    }
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
    // 2. 将视口坐标转换为容器内的相对坐标，都为 0
    const containerX = clientX - containerRect.left;
    const containerY = clientY - containerRect.top;

    // 3. 检查点击是否在容器范围内
    if (
      containerX < 0 ||
      containerX > containerRect.width ||
      containerY < 0 ||
      containerY > containerRect.height
    ) {
      return null;
    }
    // 4. 将容器坐标转换为内容坐标（加上滚动偏移）
    const contentX = containerX;
    const contentY = containerY + this.viewport.state.scrollTop;

    // 5. 在所有单词中查找最匹配的
    const { words } = this.fullLayoutData;
    const lineHeight = this.layoutEngine.getLineHeight();
    const baseline = this.layoutEngine.getTextBaseline(lineHeight);

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
    this.renderTree = null;
    this.container = null;
    this.measureCanvas = null;
    this.measureCtx = null;
    this.onProgressChange = null;

    this.fullLayoutData = null;

    // 清理图片缓存
    this.imageCache.clear();

    window.removeEventListener('resize', this.setupHighDPI.bind(this));
  }

  /**
   * 根据nodeId查找节点
   * @param {string} nodeId
   * @returns {Object|null}
   */
  findNodeById(nodeId) {
    if (!this.renderTree) return null;

    const traverse = (nodeList) => {
      for (const node of nodeList) {
        if (node.nodeId === nodeId) {
          return node;
        }
        if (node.children) {
          const found = traverse(node.children);
          if (found) return found;
        }
      }
      return null;
    };

    return traverse(this.renderTree);
  }

  initMode({ mode, poolSize }) {
    // 初始化虚拟视窗
    const Viewport =
      mode === 'vertical' ? VirtualViewport : HorizontalSlideManager;

    const config = {
      container: this.container,
      canvasList: this.canvasList,
      scrollContent: this.scrollContent,
      viewportHeight: this.viewportHeight,
      viewportWidth: this.viewportWidth,
      chunkHeight: this.chunkHeight,
      poolSize,
      onViewportChange: this.handleViewportChange.bind(this),
    };
    this.viewport = new Viewport(config);
  }

  /**
   * 获取详细进度信息
   * @returns {DetailedProgressInfo}
   */
  getDetailedProgress() {
    if (!this.viewport) {
      return {
        progress: 0,
        scrollTop: 0,
        contentHeight: 0,
        viewportHeight: 0,
        maxScrollTop: 0,
        scrollableHeight: 0,
        isAtTop: true,
        isAtBottom: true,
        canScroll: false,
      };
    }

    const state = this.viewport.state;
    const scrollableHeight = Math.max(
      0,
      state.contentHeight - state.viewportHeight
    );
    const maxScrollTop = scrollableHeight;
    const progress =
      maxScrollTop > 0
        ? Math.min(1, Math.max(0, state.scrollTop / maxScrollTop))
        : 0;

    return {
      progress,
      scrollTop: state.scrollTop,
      contentHeight: state.contentHeight,
      viewportHeight: state.viewportHeight,
      maxScrollTop,
      scrollableHeight,
      isAtTop: state.scrollTop <= 0,
      isAtBottom: state.scrollTop >= maxScrollTop,
      canScroll: scrollableHeight > 0,
    };
  }

  /**
   * 获取当前进度（0-1之间的数值）
   * @returns {number}
   */
  getProgress() {
    return this.getDetailedProgress().progress;
  }

  /**
   * 设置进度
   * @param {number} progress 进度值（0-1之间）
   */
  setProgress(progress) {
    if (!this.viewport) return;

    const clampedProgress = Math.min(1, Math.max(0, progress));
    const detailedProgress = this.getDetailedProgress();
    const targetScrollTop = clampedProgress * detailedProgress.maxScrollTop;

    this.viewport.scrollTo(targetScrollTop);
  }

  /**
   * 获取当前渲染模式
   * @returns {string} 'vertical' 或 'horizontal'
   */
  getMode() {
    return this.mode;
  }

  /**
   * 设置渲染模式
   * @param {string} newMode 'vertical' 或 'horizontal'
   */
  setMode(newMode) {
    if (
      newMode !== this.mode &&
      (newMode === 'vertical' || newMode === 'horizontal')
    ) {
      this.mode = newMode;
      // 重新初始化viewport系统
      if (this.fullLayoutData) {
        this.createDOMStructure();
        this.viewport.setContentRange(
          this.mode === 'vertical'
            ? this.fullLayoutData.totalHeight
            : this.fullLayoutData.totalWidth
        );
        this.renderVisibleContent();
      }
    }
  }

  /**
   * 获取完整的布局节点列表（调试和检查用）
   * @returns {Array} layoutNodesList的深拷贝
   */
  getLayoutNodesList() {
    return this.layoutEngine ? this.layoutEngine.getLayoutNodesList() : null;
  }
}
export default VirtualCanvasRenderer;
