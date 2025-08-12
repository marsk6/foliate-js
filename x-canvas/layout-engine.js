/**
 * HTML到Canvas编排引擎
 * 将HTML内容转换为Canvas渲染所需的数据结构
 */

/**
 * @typedef {Object} LayoutConfig
 * @property {number} canvasWidth - Canvas宽度
 * @property {number} canvasHeight - Canvas高度
 * @property {number} paddingX - 水平内边距
 * @property {number} paddingY - 垂直内边距
 * @property {number} fontSize - 字体大小
 * @property {number} lineHeight - 行高
 * @property {string} fontFamily - 字体族
 * @property {string} textColor - 文本颜色
 * @property {number} maxWidth - 最大文本宽度
 */

/**
 * @typedef {Object} CharPosition
 * @property {number} x - X坐标
 * @property {number} y - Y坐标
 * @property {number} width - 字符宽度
 * @property {number} height - 字符高度
 * @property {number} line - 所在行号
 * @property {string} char - 字符内容
 * @property {Object} style - 样式信息
 */

/**
 * @typedef {Object} LineInfo
 * @property {number} startIndex - 行开始字符索引
 * @property {number} endIndex - 行结束字符索引
 * @property {number} y - 行Y坐标
 * @property {number} height - 行高度
 * @property {number} baseline - 基线位置
 */

/**
 * @typedef {Object} LayoutResult
 * @property {CharPosition[]} chars - 所有字符位置信息
 * @property {LineInfo[]} lines - 行信息
 * @property {number} totalHeight - 总高度
 * @property {Object[]} elements - 元素信息（图片、链接等）
 */

export class LayoutEngine {
  /**
   * @param {LayoutConfig} config
   */
  constructor(config = {}) {
    this.config = {
      canvasWidth: 320,
      canvasHeight: 940,
      paddingX: 16,
      paddingY: 20,
      fontSize: 20,
      lineHeight: 36,
      fontFamily: 'system-ui, sans-serif',
      textColor: '#222',
      ...config,
    };

    this.maxWidth = this.config.canvasWidth - this.config.paddingX * 2;

    // 创建隐藏的canvas用于测量文本
    this.measureCanvas = document.createElement('canvas');
    this.measureCtx = this.measureCanvas.getContext('2d');
    this.measureCtx.font = `${this.config.fontSize}px ${this.config.fontFamily}`;
  }

  /**
   * 解析HTML并生成布局数据
   * @param {string} htmlContent - HTML内容
   * @returns {LayoutResult}
   */
  layout(htmlContent) {
    // 创建临时DOM来解析HTML
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlContent, 'text/html');

    // 提取文本内容和样式
    const extractedContent = this.extractContent(doc.body);

    // 执行文本布局
    const layoutResult = this.performLayout(extractedContent);

    return layoutResult;
  }

  /**
   * 从DOM中提取内容和样式
   * @param {Element} element
   * @returns {Object[]}
   */
  extractContent(element) {
    const content = [];
    this.traverseNode(element, content);
    return content;
  }

  /**
   * 遍历DOM节点
   * @param {Node} node
   * @param {Object[]} content
   * @param {Object} inheritedStyle
   */
  traverseNode(node, content, inheritedStyle = {}) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent.trim();
      if (text) {
        content.push({
          type: 'text',
          content: text,
          style: { ...inheritedStyle },
        });
      }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node;
      const computedStyle = this.getElementStyle(element);
      const mergedStyle = { ...inheritedStyle, ...computedStyle };

      // 处理特殊元素
      switch (element.tagName.toLowerCase()) {
        case 'h1':
        case 'h2':
        case 'h3':
        case 'h4':
        case 'h5':
        case 'h6':
          mergedStyle.fontSize = this.getHeadingFontSize(element.tagName);
          mergedStyle.fontWeight = 'bold';
          mergedStyle.marginTop = this.config.lineHeight;
          mergedStyle.marginBottom = this.config.lineHeight * 0.5;
          break;
        case 'p':
          mergedStyle.marginBottom = this.config.lineHeight * 0.5;
          break;
        case 'strong':
        case 'b':
          mergedStyle.fontWeight = 'bold';
          break;
        case 'em':
        case 'i':
          mergedStyle.fontStyle = 'italic';
          break;
        case 'br':
          content.push({
            type: 'linebreak',
            style: mergedStyle,
          });
          return;
        case 'img':
          content.push({
            type: 'image',
            src: element.src,
            alt: element.alt,
            style: mergedStyle,
          });
          return;
      }

      // 递归处理子节点
      for (const child of node.childNodes) {
        this.traverseNode(child, content, mergedStyle);
      }

      // 在块级元素后添加换行
      if (this.isBlockElement(element)) {
        content.push({
          type: 'linebreak',
          style: mergedStyle,
        });
      }
    }
  }

  /**
   * 获取元素样式
   * @param {Element} element
   * @returns {Object}
   */
  getElementStyle(element) {
    const style = {};

    // 从class中提取样式信息
    const className = element.className;
    if (className) {
      // 这里可以根据具体的CSS类来设置样式
      // 简化处理，可以根据实际需求扩展
    }

    return style;
  }

  /**
   * 获取标题字体大小
   * @param {string} tagName
   * @returns {number}
   */
  getHeadingFontSize(tagName) {
    const baseSize = this.config.fontSize;
    const scales = {
      H1: 2.0,
      H2: 1.5,
      H3: 1.17,
      H4: 1.0,
      H5: 0.83,
      H6: 0.67,
    };
    return baseSize * (scales[tagName.toUpperCase()] || 1.0);
  }

  /**
   * 判断是否为块级元素
   * @param {Element} element
   * @returns {boolean}
   */
  isBlockElement(element) {
    const blockElements = [
      'p',
      'div',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'ul',
      'ol',
      'li',
      'blockquote',
      'pre',
      'hr',
    ];
    return blockElements.includes(element.tagName.toLowerCase());
  }

  /**
   * 执行文本布局
   * @param {Object[]} content
   * @returns {LayoutResult}
   */
  performLayout(content) {
    const chars = [];
    const lines = [];
    const elements = [];

    let x = this.config.paddingX;
    let y = this.config.paddingY + this.config.fontSize;
    let currentLine = 0;
    let lineStartIndex = 0;

    for (const item of content) {
      if (item.type === 'text') {
        const result = this.layoutText(
          item.content,
          item.style,
          x,
          y,
          currentLine,
          chars.length
        );
        chars.push(...result.chars);

        // 更新行信息
        for (let i = result.startLine; i <= result.endLine; i++) {
          if (i >= lines.length) {
            lines.push({
              startIndex:
                i === result.startLine
                  ? lineStartIndex
                  : chars.length -
                    result.chars.length +
                    result.chars.findIndex((c) => c.line === i),
              endIndex: -1, // 稍后更新
              y: this.config.paddingY + (i + 1) * this.config.lineHeight,
              height: this.config.lineHeight,
              baseline:
                this.config.paddingY +
                (i + 1) * this.config.lineHeight -
                this.config.lineHeight * 0.2,
            });
          }
        }

        x = result.finalX;
        y = result.finalY;
        currentLine = result.endLine;
      } else if (item.type === 'linebreak') {
        // 换行
        if (lines[currentLine]) {
          lines[currentLine].endIndex = chars.length - 1;
        }
        currentLine++;
        x = this.config.paddingX;
        y += this.config.lineHeight;
        lineStartIndex = chars.length;
      } else if (item.type === 'image') {
        // 处理图片元素
        elements.push({
          type: 'image',
          x: x,
          y: y - this.config.fontSize,
          width: 100, // 默认宽度，可以根据实际图片调整
          height: 100, // 默认高度
          src: item.src,
          alt: item.alt,
        });

        // 图片后换行
        if (lines[currentLine]) {
          lines[currentLine].endIndex = chars.length - 1;
        }
        currentLine++;
        x = this.config.paddingX;
        y += 120; // 图片高度 + 间距
        lineStartIndex = chars.length;
      }
    }

    // 更新最后一行的结束索引
    if (lines[currentLine] && chars.length > 0) {
      lines[currentLine].endIndex = chars.length - 1;
    }

    const totalHeight = y + this.config.paddingY;

    return {
      chars,
      lines,
      totalHeight,
      elements,
    };
  }

  /**
   * 布局单段文本
   * @param {string} text
   * @param {Object} style
   * @param {number} startX
   * @param {number} startY
   * @param {number} startLine
   * @param {number} charIndexOffset
   * @returns {Object}
   */
  layoutText(text, style, startX, startY, startLine, charIndexOffset) {
    const chars = [];
    const fontSize = style.fontSize || this.config.fontSize;
    const fontWeight = style.fontWeight || 'normal';
    const fontStyle = style.fontStyle || 'normal';

    // 更新测量上下文的字体
    this.measureCtx.font = `${fontStyle} ${fontWeight} ${fontSize}px ${this.config.fontFamily}`;

    let x = startX;
    let y = startY;
    let line = startLine;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const charWidth = this.measureCtx.measureText(char).width;

      // 检查是否需要换行
      if (
        x + charWidth > this.config.canvasWidth - this.config.paddingX &&
        x > this.config.paddingX
      ) {
        line++;
        x = this.config.paddingX;
        y += this.config.lineHeight;
      }

      chars.push({
        x,
        y,
        width: charWidth,
        height: fontSize,
        line,
        char,
        index: charIndexOffset + chars.length,
        style: {
          fontSize,
          fontWeight,
          fontStyle,
          color: style.color || this.config.textColor,
        },
      });

      x += charWidth;
    }

    return {
      chars,
      startLine,
      endLine: line,
      finalX: x,
      finalY: y,
    };
  }

  /**
   * 测量文本宽度
   * @param {string} text
   * @param {Object} style
   * @returns {number}
   */
  measureText(text, style = {}) {
    const fontSize = style.fontSize || this.config.fontSize;
    const fontWeight = style.fontWeight || 'normal';
    const fontStyle = style.fontStyle || 'normal';

    this.measureCtx.font = `${fontStyle} ${fontWeight} ${fontSize}px ${this.config.fontFamily}`;
    return this.measureCtx.measureText(text).width;
  }

  /**
   * 根据坐标查找字符索引
   * @param {number} x
   * @param {number} y
   * @param {CharPosition[]} chars
   * @returns {number|null}
   */
  getCharIndexAt(x, y, chars) {
    for (let i = 0; i < chars.length; i++) {
      const char = chars[i];
      if (
        x >= char.x &&
        x <= char.x + char.width &&
        y >= char.y - char.height &&
        y <= char.y
      ) {
        return i;
      }
    }
    return null;
  }

  /**
   * 获取指定范围的高亮区域
   * @param {number} startIndex
   * @param {number} endIndex
   * @param {CharPosition[]} chars
   * @returns {Object[]}
   */
  getHighlightRects(startIndex, endIndex, chars) {
    if (startIndex > endIndex) {
      [startIndex, endIndex] = [endIndex, startIndex];
    }

    const rects = [];
    const lineGroups = {};

    // 按行分组
    for (let i = startIndex; i <= endIndex; i++) {
      const char = chars[i];
      if (!lineGroups[char.line]) {
        lineGroups[char.line] = { start: i, end: i };
      } else {
        lineGroups[char.line].end = i;
      }
    }

    // 为每行创建高亮矩形
    Object.values(lineGroups).forEach(({ start, end }) => {
      const startChar = chars[start];
      const endChar = chars[end];

      rects.push({
        x: startChar.x,
        y: startChar.y - startChar.height,
        width: endChar.x + endChar.width - startChar.x,
        height: startChar.height + 8, // 添加一些padding
      });
    });

    return rects;
  }
}

export default LayoutEngine;
