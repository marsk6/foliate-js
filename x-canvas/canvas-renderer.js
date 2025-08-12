/**
 * Canvas渲染器
 * 包含布局计算和Canvas渲染功能
 */

/**
 * 渲染流程：
 * HTML → layout-engine.parse() → 数据结构
 * 数据结构 → canvas-renderer.performLayout() → 字符位置
 * 字符位置 → canvas-renderer.render() → Canvas显示
 */

import TransferEngine from './layout-engine.js';

/**
 * @typedef {Object} ThemeConfig
 * @property {string} backgroundColor - 背景色
 * @property {string} textColor - 文字颜色
 * @property {number} baseFontSize - 基础字体大小
 * @property {string} fontFamily - 字体族
 */

/**
 * @typedef {Object} LayoutConfig
 * @property {number} paddingX - 水平内边距
 * @property {number} paddingY - 垂直内边距
 * @property {number} lineHeight - 行高倍数
 */

/**
 * @typedef {Object} RenderConfig
 * @property {HTMLCanvasElement} canvas - Canvas元素
 * @property {ThemeConfig} theme - 主题配置
 * @property {LayoutConfig} layout - 布局配置
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

export class CanvasRenderer {
  // Canvas相关属性
  /** @type {HTMLCanvasElement} Canvas元素 */
  canvas;

  /** @type {CanvasRenderingContext2D} Canvas 2D上下文 */
  ctx;

  /** @type {HTMLCanvasElement} 隐藏的测量canvas */
  measureCanvas;

  /** @type {CanvasRenderingContext2D} 测量用的2D上下文 */
  measureCtx;

  // 配置对象
  /** @type {ThemeConfig} 主题配置 */
  theme;

  /** @type {LayoutConfig} 布局配置 */
  layout;

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

  /**
   * @param {RenderConfig} config
   */
  constructor(config) {
    this.canvas = config.canvas;
    this.ctx = this.canvas.getContext('2d');

    // 主题配置
    this.theme = {
      backgroundColor: '#fff',
      textColor: '#222',
      baseFontSize: 20,
      fontFamily: 'system-ui, sans-serif',
      ...config.theme,
    };

    // 布局配置
    this.layout = {
      paddingX: 16,
      paddingY: 20,
      lineHeight: 1.8, // 相对于字体大小的倍数
      ...config.layout,
    };

    // 转换引擎实例
    this.transferEngine = new TransferEngine();

    // 渲染状态
    this.renderResult = null;
    this.parsedNodes = null;
    this.pageStyle = null; // 从head中提取的页面样式

    // 创建隐藏的canvas用于测量文本
    this.measureCanvas = document.createElement('canvas');
    this.measureCtx = this.measureCanvas.getContext('2d');

    window.addEventListener('resize', this.setupHighDPI.bind(this));
  }

  /**
   * 设置高DPI支持
   */
  setupHighDPI() {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();

    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.canvas.style.width = rect.width + 'px';
    this.canvas.style.height = rect.height + 'px';

    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /**
   * 渲染HTML内容
   * @param {string} htmlContent
   */
  render(htmlContent) {
    this.setupHighDPI();

    // 保存当前HTML内容
    this.currentHTML = htmlContent;

    // 使用转换引擎解析HTML为数据结构
    const parseResult = this.transferEngine.parse(htmlContent);
    this.parsedNodes = parseResult.nodes;
    this.pageStyle = parseResult.pageStyle;

    // 应用页面样式到布局配置
    this.applyPageStyle();

    // 执行布局计算
    this.renderResult = this.performLayout(this.parsedNodes);

    // 清空画布
    this.clear();

    // 渲染背景
    this.renderBackground();

    // 渲染文本
    this.renderText();

    // 渲染元素（图片等）
    this.renderElements();
  }

  /**
   * 应用从head中提取的页面样式
   */
  applyPageStyle() {
    if (!this.pageStyle) return;

    // 应用页面边距
    if (this.pageStyle.marginTop) {
      const marginTop = this.parseSize(this.pageStyle.marginTop);
      this.layout.paddingY = Math.max(this.layout.paddingY, marginTop);
    }

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

    let x = this.layout.paddingX;
    let y = this.layout.paddingY;
    let currentLine = 0;

    // 遍历节点树进行布局
    this.layoutNodes(nodes, x, y, currentLine, words, elements);

    const totalHeight = y + this.layout.paddingY;

    return {
      words,
      elements,
      totalHeight,
    };
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
      if (x > this.layout.paddingX) {
        line++;
        x = this.layout.paddingX;
        y += this.getLineHeight(node.style);
      }
    }

    // 处理特殊元素
    if (node.tag === 'img') {
      elements.push({
        type: 'image',
        x: x,
        y: y,
        width: 100, // 默认宽度
        height: 100, // 默认高度
        src: node.src,
        alt: node.alt,
      });

      // 图片后换行
      line++;
      x = this.layout.paddingX;
      y += 120; // 图片高度 + 间距
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
      x = this.layout.paddingX;
      y += this.getLineHeight(node.style);
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

    // 将文本按照单词和中文字符分割
    const segments = this.segmentText(text);

    for (const segment of segments) {
      const segmentWidth = this.measureCtx.measureText(segment.content).width;

      // 检查是否需要换行
      const canvasWidth = this.canvas.style.width
        ? parseFloat(this.canvas.style.width)
        : this.canvas.width;

      let needNewLine = false;

      if (segment.type === 'word') {
        // 英文单词：整个单词必须在同一行
        if (
          x + segmentWidth > canvasWidth - this.layout.paddingX &&
          x > this.layout.paddingX
        ) {
          needNewLine = true;
        }
      } else if (segment.type === 'cjk' || segment.type === 'punctuation') {
        // 中文字符和标点：可以在任意位置换行
        if (
          x + segmentWidth > canvasWidth - this.layout.paddingX &&
          x > this.layout.paddingX
        ) {
          needNewLine = true;
        }
      } else if (segment.type === 'space') {
        // 空格：如果导致换行则不渲染
        if (
          x + segmentWidth > canvasWidth - this.layout.paddingX &&
          x > this.layout.paddingX
        ) {
          line++;
          x = this.layout.paddingX;
          y += lineHeight;
          continue; // 跳过这个空格
        }
      }

      if (needNewLine) {
        line++;
        x = this.layout.paddingX;
        y += lineHeight;
      }

      // 添加到words数组
      words.push({
        x,
        y,
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

      x += segmentWidth;
    }

    return { x, y, line };
  }

  /**
   * 将文本分割为单词、字符和空格段
   * 使用正则表达式进行精确分词
   * @param {string} text
   * @returns {Array}
   */
  segmentText(text) {
    const segments = [];

    // 使用正则表达式匹配不同类型的文本片段
    // 1. 英文单词（包含字母、数字、连字符、撇号）
    // 2. 中文字符（CJK统一汉字）
    // 3. 空白字符（空格、制表符等）
    // 4. 标点符号
    // 5. 其他字符
    const regex =
      /(\w+(?:[-']\w+)*)|([\u4e00-\u9fff\u3400-\u4dbf\u20000-\u2a6df\u2a700-\u2b73f\u2b740-\u2b81f\u2b820-\u2ceaf\uf900-\ufaff\u3300-\u33ff])|(\s+)|([\p{P}\p{S}])|(.)/gu;

    let match;
    let lastIndex = 0;

    while ((match = regex.exec(text)) !== null) {
      const [fullMatch, englishWord, cjkChar, whitespace, punctuation, other] =
        match;
      const startIndex = match.index;
      const endIndex = startIndex + fullMatch.length;

      if (englishWord) {
        // 英文单词
        segments.push({
          type: 'word',
          content: englishWord,
          startIndex,
          endIndex,
        });
      } else if (cjkChar) {
        // 中文字符
        segments.push({
          type: 'cjk',
          content: cjkChar,
          startIndex,
          endIndex,
        });
      } else if (whitespace) {
        // 空白字符
        segments.push({
          type: 'space',
          content: whitespace,
          startIndex,
          endIndex,
        });
      } else if (punctuation) {
        // 标点符号
        segments.push({
          type: 'punctuation',
          content: punctuation,
          startIndex,
          endIndex,
        });
      } else if (other) {
        // 其他字符
        segments.push({
          type: 'other',
          content: other,
          startIndex,
          endIndex,
        });
      }

      lastIndex = endIndex;
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
  getLineHeight(style) {
    const fontSize = this.parseSize(style.fontSize) || this.theme.baseFontSize;
    return fontSize * this.layout.lineHeight;
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
   * 根据坐标获取字符索引
   * 命中检测
   * @param {Object} point
   * @param {number} point.x
   * @param {number} point.y
   * @returns {number|null}
   */
  getCharIndexAt(point) {
    if (!this.renderResult) return null;
    const { x: clientX, y: clientY } = point

    const rect = this.canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    const { words } = this.renderResult;

    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      if (
        y > word.y - this.theme.lineHeight / 2 &&
        y < word.y + this.theme.lineHeight / 2 &&
        x >= word.x &&
        x <= word.x + word.width
      ) {
        return i;
      }
    }

    return null;
  }

  /**
   * 获取当前HTML内容
   * @returns {string}
   */
  getCurrentHTML() {
    return this.currentHTML || '';
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
   * 滚动到指定字符
   * @param {number} charIndex
   */
  scrollToChar(charIndex) {
    if (!this.renderResult || charIndex >= this.renderResult.words.length) {
      return;
    }

    const word = this.renderResult.words[charIndex];
    const rect = this.canvas.getBoundingClientRect();

    // 这里需要根据实际的滚动容器来实现滚动
    // 例如：container.scrollTop = char.y - rect.height / 2;
  }

  /**
   * 销毁渲染器
   */
  destroy() {
    this.clear();
    this.renderResult = null;
    this.parsedNodes = null;
    this.pageStyle = null;
  }

  /**
   * 设置选择锚点
   * @returns {Function} 更新锚点位置的函数
   */
  setupAnchors() {
    const startAnchor = document.getElementById('startAnchor');
    const endAnchor = document.getElementById('endAnchor');
    const highlightLayer = document.getElementById('highlightLayer'); // 需要获取高亮层元素

    const updateAnchors = () => {
      if (!startAnchor || !endAnchor || !highlightLayer) return;

      startAnchor.style.display = 'none';
      endAnchor.style.display = 'none';

      if (this.startIdx == null || this.endIdx == null) return;

      const min = Math.min(this.startIdx, this.endIdx);
      const max = Math.max(this.startIdx, this.endIdx);

      // 检查renderResult是否存在
      if (!this.renderResult || !this.renderResult.words) return;

      // 按行分组高亮
      let lineMap = {};
      for (let i = min; i <= max; i++) {
        if (i >= this.renderResult.words.length) break;
        const l = this.renderResult.words[i].line;
        if (!lineMap[l]) lineMap[l] = { start: i, end: i };
        else lineMap[l].end = i;
      }

      const linesArr = Object.values(lineMap);
      const anchorWidth = 10;
      const anchorHeight = 36;
      const anchorDotHeight = 10;

      // 获取高亮条 dom
      const bars = highlightLayer.querySelectorAll('.highlight-bar');

      if (linesArr.length > 0 && bars.length > 0) {
        // TODO: 锚点的高度使用高亮条的高度
        // 首行锚点
        const bar1 = bars[0];
        const bar1Rect = bar1.getBoundingClientRect();
        const wrapRect = this.canvas.getBoundingClientRect();
        startAnchor.style.display = 'block';
        startAnchor.style.left =
          bar1Rect.left - wrapRect.left - anchorWidth / 2 + 'px';
        startAnchor.style.top =
          bar1Rect.bottom - wrapRect.top - anchorHeight + 'px';
      }

      if (linesArr.length > 0 && bars.length > 0) {
        // 末行锚点
        const bar2 = bars[bars.length - 1];
        const bar2Rect = bar2.getBoundingClientRect();
        const wrapRect = this.canvas.getBoundingClientRect();
        endAnchor.style.display = 'block';
        endAnchor.style.left =
          bar2Rect.right - wrapRect.left - anchorWidth / 2 + 'px';
        endAnchor.style.top =
          bar2Rect.bottom -
          wrapRect.top -
          anchorHeight +
          anchorDotHeight +
          'px';
      }
    };

    // 可以调用updateAnchors或者返回它以便外部调用
    return updateAnchors;
  }

  setupHighlightBar() {
    // 高亮层 DOM
    const highlightLayer = document.getElementById('highlightLayer');
    const updateHighlightBar = () => {
      highlightLayer.innerHTML = '';
      if (this.startIdx == null || this.endIdx == null) return;
      const min = Math.min(this.startIdx, this.endIdx);
      const max = Math.max(this.startIdx, this.endIdx);
      // 按行分组高亮
      let lineMap = {};
      for (let i = min; i <= max; i++) {
        const l = this.renderResult.words[i].line;
        if (!lineMap[l]) lineMap[l] = { start: i, end: i };
        else lineMap[l].end = i;
      }
      Object.values(lineMap).forEach(({ start, end }) => {
        const c1 = this.renderResult.words[start];
        const c2 = this.renderResult.words[end];
        const bar = document.createElement('div');
        bar.className = 'highlight-bar';
        bar.style.left = c1.x + 'px';
        bar.style.top = c1.y - this.theme.lineHeight + 'px';
        bar.style.width = c2.x + c2.width - c1.x + 'px';
        bar.style.height = this.theme.lineHeight + 8 + 'px';
        highlightLayer.appendChild(bar);
      });
    };

    return updateHighlightBar;
  }

}

export default CanvasRenderer;
