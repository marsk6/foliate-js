/**
 * 布局引擎类
 * 负责处理所有布局计算相关的功能
 */

import { InlineFlowManager } from './inline-flow-manager.js';
import { LineBreaker } from './line-breaker.js';
import { LineStylist } from './line-stylist.js';

/**
 * 布局节点类
 */
export class LayoutNode {
  constructor(node, startX, startY, startLine) {
    this.type = node.type;
    this.nodeId = node.nodeId;
    this.style = node.style;
    this.children = [];
    this.position = {
      startX,
      startY,
      startLine,
      endX: startX, // 初始化为startX，会在后面更新
      endY: startY, // 初始化为startY，会在后面更新
      endLine: startLine, // 初始化为startLine，会在后面更新
    };

    // 为文本和图片节点添加layout字段
    if (node.type === 'text' || node.type === 'link' || node.type === 'image') {
      this.layout = []; // 存储words数组或image元素信息
    }
  }
}

export class LayoutEngine {
  static instance = null;
  /** @type {Map<number, RenderChunk>} 渲染块缓存 */
  renderChunks = new Map();

  /**
   * @param {Object} renderer - VirtualCanvasRenderer实例
   */
  constructor(renderer) {
    if (LayoutEngine.instance) {
      return LayoutEngine.instance;
    }
    LayoutEngine.instance = this;
    this.renderer = renderer;

    // 初始化布局工具
    this.inlineFlowManager = new InlineFlowManager(renderer);
    this.lineBreaker = new LineBreaker(renderer);
    this.lineStylist = new LineStylist(renderer);

    // 布局计算模式 - 是否自动调整跨块内容
    this.adjustCrossChunkContent = this.renderer.mode === 'horizontal'; // 默认启用

    // 布局树结构
    /** @type {Array} 布局节点列表，与parsedNodes保持相同树形结构 */
    this.layoutNodesList = null;
  }

  get viewportHeight() {
    return this.renderer.viewportHeight;
  }

  get viewportWidth() {
    return this.renderer.viewportWidth;
  }

  /**
   * 计算完整布局（不进行Canvas渲染）
   */
  calculateFullLayout() {
    let x = this.renderer.theme.paddingX; // 从左内边距开始
    let y = 0;
    let currentLine = 0;

    // 初始化渲染块管理
    this.initRenderChunks();

    // 使用布局算法计算所有位置，同时创建layoutNodesList
    // 注意：样式继承现在在HTMLParser阶段完成，这里不再需要处理
    const result = this.layoutNodes(
      this.renderer.parsedNodes,
      x,
      y,
      currentLine
    );

    // 保存布局节点列表
    this.layoutNodesList = result.layoutNodes;

    // 从布局节点列表中一次性提取words和elements
    const { words, elements } = this.extractWordsAndElementsFromLayoutNodes();

    // 📐 正确的总高度计算方式：使用实际的Y坐标
    const contentHeight = result.y;
    // 计算需要的总块数
    const viewportHeight = this.viewportHeight;
    const viewportWidth = this.viewportWidth;
    const totalChunks = Math.ceil(contentHeight / viewportHeight);

    // scrollContent 的高度基于块数量，而不是内容高度
    const scrollContentHeight = totalChunks * viewportHeight;
    const scrollContentWidth = totalChunks * viewportWidth;
    return {
      words, // 从layoutNodesList提取的words
      elements, // 从layoutNodesList提取的elements
      contentHeight, // 实际内容高度
      scrollContentHeight, // 滚动容器高度
      totalHeight: scrollContentHeight, // 兼容性，使用滚动容器高度
      totalWidth: scrollContentWidth,
      totalChunks,
      layoutNodesList: this.layoutNodesList, // 包含布局节点列表
      renderChunks: this.renderChunks,
    };
  }

  /**
   * 布局节点
   * @param {Array} nodes
   * @param {number} startX
   * @param {number} startY
   * @param {number} startLine
   * @returns {Object} {x, y, line, layoutNodes}
   */
  layoutNodes(nodes, startX, startY, startLine) {
    return this.layoutNodesWithInlineState(
      nodes,
      startX,
      startY,
      startLine,
      false
    );
  }

  /**
   * 布局节点（带内联状态）
   * @returns {Object} {x, y, line, layoutNodes}
   */
  layoutNodesWithInlineState(
    nodes,
    startX,
    startY,
    startLine,
    firstNodeInlineTextContinuation = false
  ) {
    let x = startX;
    let y = startY;
    let line = startLine;
    let lastNodeWasInline = firstNodeInlineTextContinuation; // 使用传入的状态作为初始状态

    // 创建结果容器
    const layoutNodes = [];

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];

      // 检查当前节点是否是内联节点且前一个节点也是内联节点
      const currentNodeIsInline = this.isInlineNode(node);
      const currentNodeIsInlineText = this.isInlineTextNode(node);
      let isInlineTextContinuation =
        currentNodeIsInlineText && lastNodeWasInline;

      // 对于第一个节点，使用传入的状态
      if (i === 0) {
        isInlineTextContinuation =
          currentNodeIsInlineText && firstNodeInlineTextContinuation;
      }

      const result = this.layoutNode(
        node,
        x,
        y,
        line,
        isInlineTextContinuation
      );

      // 收集结果
      layoutNodes.push(result.layoutNode);

      // 更新坐标
      y = result.y;
      line = result.line;
      x = result.x;

      lastNodeWasInline = currentNodeIsInline;
    }

    return { x, y, line, layoutNodes };
  }

  /**
   * 布局单个节点
   * @param {Object} node
   * @param {number} startX
   * @param {number} startY
   * @param {number} startLine
   * @param {boolean} isInlineTextContinuation - 是否是同一行内联文本的续接部分
   * @returns {Object} {x, y, line, layoutNode}
   */
  layoutNode(
    node,
    startX,
    startY,
    startLine,
    isInlineTextContinuation = false
  ) {
    // 创建布局节点，包含position字段记录开始位置
    const layoutNode = new LayoutNode(node, startX, startY, startLine);

    if (node.type === 'text') {
      // 文本节点的样式已经在HTMLParser阶段处理了继承
      const textStyle = node.style || {};

      const result = this.layoutText(
        node.text,
        textStyle,
        startX,
        startY,
        startLine,
        isInlineTextContinuation,
        node.nodeId
      );

      // 将words填充到布局节点
      layoutNode.layout = result.words.map((word) => ({ ...word }));

      // 更新position的结束位置
      layoutNode.position.endX = result.x;
      layoutNode.position.endY = result.y;
      layoutNode.position.endLine = result.line;

      return {
        x: result.x,
        y: result.y,
        line: result.line,
        layoutNode,
      };
    }

    if (node.type === 'link') {
      // 链接节点的样式已经在HTMLParser阶段处理了继承
      const linkStyle = node.style || {};

      const result = this.layoutText(
        node.text,
        linkStyle,
        startX,
        startY,
        startLine,
        isInlineTextContinuation,
        node.nodeId
      );

      // 将words填充到布局节点
      layoutNode.layout = result.words.map((word) => ({ ...word }));

      // 更新position的结束位置
      layoutNode.position.endX = result.x;
      layoutNode.position.endY = result.y;
      layoutNode.position.endLine = result.line;

      return {
        x: result.x,
        y: result.y,
        line: result.line,
        layoutNode,
      };
    }

    if (node.type === 'image') {
      const result = this.layoutImage(node, startX, startY, startLine);

      // 将elements填充到布局节点
      layoutNode.layout = result.elements.map((element) => ({ ...element }));

      // 更新position的结束位置
      layoutNode.position.endX = result.x;
      layoutNode.position.endY = result.y;
      layoutNode.position.endLine = result.line;

      return {
        x: result.x,
        y: result.y,
        line: result.line,
        layoutNode,
      };
    }

    // 处理容器元素（有子节点的元素）
    let x = startX;
    let y = startY;
    let line = startLine;

    // 直接使用节点的样式，HTMLParser已经处理了样式继承和合并
    const currentNodeStyle = node.style || {};

    // 处理块级元素的上边距和上内边距
    if (this.isBlockElement(currentNodeStyle)) {
      const marginTop = this.parseSize(
        this.getStyleProperty(currentNodeStyle, 'marginTop')
      );
      const paddingTop = this.parseSize(
        this.getStyleProperty(currentNodeStyle, 'paddingTop')
      );

      if (marginTop > 0) {
        y += marginTop;
      }

      if (paddingTop > 0) {
        y += paddingTop;
      }

      // 块级元素从新行开始
      if (x > this.renderer.theme.paddingX) {
        line++;
        x = this.renderer.theme.paddingX;
        y += this.getLineHeight(currentNodeStyle); // 使用完整行高
      }

      // 处理块级元素的左右内边距（影响文本宽度）
      const paddingLeft = this.parseSize(
        this.getStyleProperty(currentNodeStyle, 'paddingLeft')
      );
      const paddingRight = this.parseSize(
        this.getStyleProperty(currentNodeStyle, 'paddingRight')
      );

      if (paddingLeft > 0) {
        x += paddingLeft;
      }

      // paddingRight 会在布局文本时影响可用宽度，这里存储以备后用
      if (paddingRight > 0) {
        // 可以存储在currentNodeStyle中供其他方法使用
        currentNodeStyle.effectivePaddingRight = paddingRight;
      }
    }

    // 处理子节点
    if (node.children && node.children.length > 0) {
      // 判断是否为块级元素
      const isBlockElement = this.isBlockElement(currentNodeStyle);

      if (isBlockElement) {
        // 块级元素：使用内联流处理方式
        // 注意：样式继承已在HTMLParser阶段处理，这里直接使用节点的样式
        const inlineChildren = this.inlineFlowManager.extractInlineNodes(
          node.children
        );

        if (inlineChildren.length > 0) {
          // 收集整个内联流
          const { segments, styleMap } =
            this.inlineFlowManager.collectInlineFlow(
              inlineChildren
            );

          if (segments.length > 0) {
            // 计算布局参数
            const rightPadding =
              this.parseSize(
                this.getStyleProperty(currentNodeStyle, 'paddingRight')
              ) || 0;
            const availableWidth =
              this.renderer.canvasWidth -
              this.renderer.theme.paddingX * 2 -
              rightPadding;
            const textIndent =
              this.parseSize(
                this.getStyleProperty(currentNodeStyle, 'textIndent')
              ) || 0;
            const textAlign =
              this.getStyleProperty(currentNodeStyle, 'textAlign') || 'left';

            // 第一阶段：统一分行
            const layoutContext = {
              availableWidth,
              textIndent,
              startX: x,
              isInlineTextContinuation,
            };
            const lines = this.lineBreaker.breakIntoLines(
              segments,
              layoutContext,
              styleMap
            );

            // 第二阶段：样式应用
            const styleContext = {
              textAlign,
              startY: y,
              startLine: line,
              isInlineTextContinuation,
              availableWidth,
              startX: x,
              textIndent,
            };
            const styledWords = this.lineStylist.applyStylesToLines(
              lines,
              styleMap,
              styleContext,
              node.nodeId
            );

            // 添加到渲染系统并按nodeId分组布局节点
            let finalX = x;
            let finalY = y;
            let finalLine = line;

            const wordsByNodeId = new Map();
            const inlineLayoutNodes = [];

            for (const styledWord of styledWords) {
              const adjustedWord = this.checkWordCrossViewport(styledWord);

              // 按nodeId分组words
              const wordNodeId = adjustedWord.wordId
                ? adjustedWord.wordId.split('_')[0]
                : null;
              if (wordNodeId) {
                if (!wordsByNodeId.has(wordNodeId)) {
                  wordsByNodeId.set(wordNodeId, []);
                }
                wordsByNodeId.get(wordNodeId).push({ ...adjustedWord });
              }

              finalX = adjustedWord.x + adjustedWord.width;
              finalY = adjustedWord.y;
              finalLine = adjustedWord.line;
            }
            // 为内联子节点创建布局节点
            for (const inlineChild of inlineChildren) {
              const childWordList =
                wordsByNodeId.get(inlineChild.nodeId) || [];

              // 计算内联子节点的position
              let childStartX = x,
                childStartY = y,
                childStartLine = line;
              let childEndX = x,
                childEndY = y,
                childEndLine = line;

              if (childWordList.length > 0) {
                // 从第一个word获取开始位置
                const firstWord = childWordList[0];
                childStartX = firstWord.x;
                childStartY = firstWord.y;
                childStartLine = firstWord.line;

                // 从最后一个word获取结束位置
                const lastWord = childWordList[childWordList.length - 1];
                childEndX = lastWord.x + lastWord.width;
                childEndY = lastWord.y;
                childEndLine = lastWord.line;
              }

              const childLayoutNode = new LayoutNode(inlineChild, childStartX, childStartY, childStartLine);
              // 更新结束位置
              childLayoutNode.position.endX = childEndX;
              childLayoutNode.position.endY = childEndY;
              childLayoutNode.position.endLine = childEndLine;
              if (inlineChild.type === 'text' || inlineChild.type === 'link') {
                childLayoutNode.layout = childWordList;
              }

              inlineLayoutNodes.push(childLayoutNode);
            }

            layoutNode.children.push(...inlineLayoutNodes);

            x = finalX;
            y = finalY;
            line = finalLine;
          }
        }

        // 处理非内联子节点（如图片等）
        const nonInlineChildren = node.children.filter(
          (child) =>
            !(
              child.type === 'text' ||
              child.type === 'link' ||
              (child.type === 'element' && this.isInlineNode(child))
            )
        );

        if (nonInlineChildren.length > 0) {
          const result = this.layoutNodesWithInlineState(
            nonInlineChildren,
            x,
            y,
            line,
            false
          );

          // 合并结果
          layoutNode.children.push(...result.layoutNodes);

          x = result.x;
          y = result.y;
          line = result.line;
        }
      } else {
        // 内联元素：继续使用原有的递归处理方式
        const result = this.layoutNodesWithInlineState(
          node.children,
          x,
          y,
          line,
          isInlineTextContinuation
        );

        // 合并结果
        layoutNode.children.push(...result.layoutNodes);

        x = result.x;
        y = result.y;
        line = result.line;
      }
    }

    // 处理块级元素的下边距、下内边距和换行
    if (this.isBlockElement(currentNodeStyle)) {
      const marginBottom = this.parseSize(
        this.getStyleProperty(currentNodeStyle, 'marginBottom')
      );
      const paddingBottom = this.parseSize(
        this.getStyleProperty(currentNodeStyle, 'paddingBottom')
      );

      if (paddingBottom > 0) {
        y += paddingBottom;
      }

      if (marginBottom > 0) {
        y += marginBottom;
      }

      // 块级元素后换行
      line++;
      x = this.renderer.theme.paddingX;
      y += this.getLineHeight(currentNodeStyle); // 使用完整行高
    }

    // 更新容器元素position的结束位置
    layoutNode.position.endX = x;
    layoutNode.position.endY = y;
    layoutNode.position.endLine = line;

    return { x, y, line, layoutNode };
  }

  /**
   * 布局文本
   * @param {string} text
   * @param {Object} style
   * @param {number} startX
   * @param {number} startY
   * @param {number} startLine
   * @param {boolean} isInlineTextContinuation - 是否是同一行内联文本的续接部分
   * @param {string} nodeId - text node ID，用于生成wordId
   * @returns {Object} {x, y, line, words} (words用于填充到layoutNode.layout)
   */
  layoutText(
    text,
    style,
    startX,
    startY,
    startLine,
    isInlineTextContinuation = false,
    nodeId = null
  ) {
    // 解析样式属性
    const fontSize =
      this.parseSize(this.getStyleProperty(style, 'fontSize')) ||
      this.renderer.theme.baseFontSize;
    const fontWeight = this.getStyleProperty(style, 'fontWeight') || 'normal';
    const fontStyle = this.getStyleProperty(style, 'fontStyle') || 'normal';
    const lineHeight = this.getLineHeight(style);
    const textAlign = this.getStyleProperty(style, 'textAlign') || 'left';
    const textIndent = isInlineTextContinuation
      ? 0
      : this.parseSize(this.getStyleProperty(style, 'textIndent')) || 0;

    // 更新测量上下文的字体
    this.renderer.measureCtx.font = `${fontStyle} ${fontWeight} ${fontSize}px ${this.renderer.theme.fontFamily}`;

    // 计算可用宽度
    const rightPadding =
      this.parseSize(this.getStyleProperty(style, 'paddingRight')) || 0;
    const availableWidth =
      this.renderer.canvasWidth -
      this.renderer.theme.paddingX * 2 -
      rightPadding;

    // 将文本按照单词和中文字符分割（传递样式用于空白符处理）
    const segments = this.segmentText(text, style);

    // 为所有 segments 创建统一的样式映射
    const styleMap = new Map();
    segments.forEach((segment, index) => {
      segment.originalSegmentIndex = index; // 确保有索引
      styleMap.set(index, style);
    });

    // ===== 第一阶段：行分割 =====
    const layoutContext = {
      availableWidth,
      textIndent,
      startX,
      isInlineTextContinuation,
    };

    const lines = this.lineBreaker.breakIntoLines(
      segments,
      layoutContext,
      styleMap
    );

    // ===== 第二阶段：样式处理 =====
    const styleContext = {
      style,
      fontSize,
      fontWeight,
      fontStyle,
      lineHeight,
      textAlign,
      startY,
      startLine,
      isInlineTextContinuation,
      availableWidth,
      startX,
    };

    const styledWords = this.lineStylist.styleLines(
      lines,
      styleContext,
      nodeId
    );

    // 将样式化的单词添加到渲染块并收集到words数组
    let finalX = startX;
    let finalY = startY;
    let finalLine = startLine;

    const words = [];

    for (const styledWord of styledWords) {
      // 立即添加到渲染块（可能会调整位置）
      const adjustedWord = this.checkWordCrossViewport(styledWord);

      words.push(adjustedWord);

      // 更新最终位置信息
      finalX = adjustedWord.x + adjustedWord.width;
      finalY = adjustedWord.y;
      finalLine = adjustedWord.line;
    }

    // 如果没有生成任何单词，保持原始位置
    if (styledWords.length === 0) {
      finalX = startX;
      finalY = startY;
      finalLine = startLine;
    }

    // 返回最终位置信息和words数组
    return {
      x: finalX,
      y: finalY,
      line: finalLine,
      words,
    };
  }

  /**
   * 布局图片元素
   * @param {Object} node - 图片节点
   * @param {number} startX
   * @param {number} startY
   * @param {number} startLine
   * @returns {Object} {x, y, line, elements} (elements用于填充到layoutNode.layout)
   */
  layoutImage(node, startX, startY, startLine) {
    // 优先使用新 parser 提供的 bounds 信息
    let originalWidth, originalHeight;

    if (node.bounds && node.bounds.width && node.bounds.height) {
      originalWidth = node.bounds.width;
      originalHeight = node.bounds.height;
    } else {
      // 回退到手动获取或默认值
      originalWidth = node.width || this.renderer.defaultImageWidth;
      originalHeight = node.height || this.renderer.defaultImageHeight;
    }

    // 计算可用容器宽度
    const availableWidth =
      this.renderer.canvasWidth - this.renderer.theme.paddingX * 2;

    // 处理图片缩放
    const scaleResult = this.scaleImageToFit(
      originalWidth,
      originalHeight,
      availableWidth
    );

    // 计算图片居中位置
    const centeredX = this.calculateImageCenterPosition(scaleResult.width);

    const imageElement = {
      type: 'image',
      nodeId: node.nodeId, // 添加nodeId信息
      x: centeredX,
      y: startY,
      width: scaleResult.width,
      height: scaleResult.height,
      src: node.src,
      alt: node.alt || '',
      originalWidth: originalWidth,
      originalHeight: originalHeight,
      isScaled: scaleResult.isScaled,
    };

    // 立即添加到渲染块（可能会调整位置）
    const adjustedImageElement = this.checkElementCrossViewport(imageElement);

    const elements = [adjustedImageElement];

    // 图片后换行，使用调整后的图片位置和高度
    const line = startLine + 1;
    const x = this.renderer.theme.paddingX;
    const y = adjustedImageElement.y + adjustedImageElement.height + 20;

    return { x, y, line, elements };
  }

  // ===== 样式处理方法 =====

  /**
   * 获取样式属性值（camelCase 格式）
   * @param {Object} style - camelCase 格式的样式对象
   * @param {string} property - 属性名（camelCase 格式，如 'fontSize'）
   * @returns {string|undefined} 样式值
   */
  getStyleProperty(style, property) {
    if (!style) return undefined;

    // 直接获取 camelCase 格式的属性
    return style[property];
  }


  /**
   * 解析尺寸值（支持em、px、pt等）
   * @param {string|number} value
   * @returns {number}
   */
  parseSize(value) {
    if (!value) return 0;

    if (typeof value === 'number') return value;

    // 移除多余的空格
    const trimmedValue = value.toString().trim();

    if (trimmedValue.endsWith('em')) {
      return parseFloat(trimmedValue) * this.renderer.theme.baseFontSize;
    }

    if (trimmedValue.endsWith('px')) {
      return parseFloat(trimmedValue);
    }

    // EPUB常用pt单位转换 (1pt = 1.33px)
    if (trimmedValue.endsWith('pt')) {
      return parseFloat(trimmedValue) * 1.33;
    }

    // rem单位处理
    if (trimmedValue.endsWith('rem')) {
      return parseFloat(trimmedValue) * this.renderer.theme.baseFontSize;
    }

    // 百分比单位（相对于容器宽度）
    if (trimmedValue.endsWith('%')) {
      const percentage = parseFloat(trimmedValue) / 100;
      return this.renderer.canvasWidth * percentage;
    }

    return parseFloat(trimmedValue) || 0;
  }

  /**
   * 获取行高
   * @param {Object} style
   * @returns {number}
   */
  getLineHeight(style = {}) {
    const fontSize =
      this.parseSize(this.getStyleProperty(style, 'fontSize')) ||
      this.renderer.theme.baseFontSize;

    // 如果样式中指定了line-height，使用样式中的值
    const lineHeightValue = this.getStyleProperty(style, 'lineHeight');
    if (lineHeightValue) {
      // 如果是数值（如 1.5），直接乘以字体大小
      if (
        typeof lineHeightValue === 'number' ||
        /^[\d.]+$/.test(lineHeightValue)
      ) {
        return fontSize * parseFloat(lineHeightValue);
      }

      // 如果是具体单位（如 20px, 1.5em），解析单位
      const parsedLineHeight = this.parseSize(lineHeightValue);
      if (parsedLineHeight > 0) {
        return parsedLineHeight;
      }
    }

    // 默认使用主题的行高倍数
    return fontSize * this.renderer.theme.lineHeight;
  }

  /**
   * 获取文本基线位置
   * @param {number} lineHeight - 行高
   * @returns {number} 基线相对于行顶部的偏移
   */
  getTextBaseline(lineHeight) {
    const ascentRatio = 0.8;
    return lineHeight * ascentRatio;
  }

  // ===== 元素类型判断方法 =====

  /**
   * 判断是否为块级元素（通过样式判断）
   * @param {Object} style - 样式对象
   * @returns {boolean}
   */
  isBlockElement(style = {}) {
    const display = this.getStyleProperty(style, 'display') || 'inline';
    // 块级显示类型包括：block, list-item, table等
    return (
      display === 'block' || display === 'list-item' || display === 'table'
    );
  }

  /**
   * 判断节点是否是内联文本节点
   * @param {Object} node - 节点对象
   * @returns {boolean}
   */
  isInlineTextNode(node) {
    return node.type === 'text' || node.type === 'link';
  }

  /**
   * 判断节点是否是内联节点（包括内联文本和内联元素）
   * @param {Object} node - 节点对象
   * @returns {boolean}
   */
  isInlineNode(node) {
    if (node.type === 'text' || node.type === 'link') {
      return true;
    }

    // 检查元素节点是否为内联元素
    if (node.type === 'element') {
      const style = node.style || {};
      return !this.isBlockElement(style);
    }

    return false;
  }

  // ===== 文本处理方法 =====

  /**
   * 规范化空白符（统一折叠处理）
   * @param {string} text - 原始文本
   * @returns {string} 规范化后的文本
   */
  normalizeWhitespace(text) {
    // 统一的空白符处理：折叠所有连续空白符为单个空格，移除首尾空白
    return text
      .replace(/\s+/g, ' ') // 折叠所有连续空白符为单个空格
      .trim(); // 移除首尾空白
  }

  /**
   * 将文本分割为单词、字符和空格段
   * @param {string} text
   * @param {Object} [style] - 样式对象（保留参数以维持兼容性）
   * @returns {Array}
   */
  segmentText(text, style = {}) {
    // 首先规范化空白符
    const normalizedText = this.normalizeWhitespace(text);

    // 如果文本为空，直接返回
    if (!normalizedText) {
      return [];
    }

    const segments = [];

    const regex =
      /(\w+(?:[-']\w+)*)|([\u4e00-\u9fff\u3400-\u4dbf\u20000-\u2a6df\u2a700-\u2b73f\u2b740-\u2b81f\u2b820-\u2ceaf\uf900-\ufaff\u3300-\u33ff])|(\s+)|([\p{P}\p{S}])|(.)/gu;

    let match;

    while ((match = regex.exec(normalizedText)) !== null) {
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

  // ===== 图片处理方法 =====

  /**
   * 计算图片的居中位置
   * @param {number} imageWidth - 图片宽度
   * @param {number} containerStart - 容器起始X坐标（默认为paddingX）
   * @param {number} containerWidth - 容器可用宽度
   * @returns {number} 图片居中的X坐标
   */
  calculateImageCenterPosition(
    imageWidth,
    containerStart = this.renderer.theme.paddingX,
    containerWidth = null
  ) {
    // 如果没有指定容器宽度，使用默认的可用宽度
    if (containerWidth === null) {
      containerWidth =
        this.renderer.canvasWidth - this.renderer.theme.paddingX * 2;
    }

    // 计算居中位置
    return containerStart + (containerWidth - imageWidth) / 2;
  }

  /**
   * 处理图片缩放以适应容器
   * @param {number} originalWidth - 原始宽度
   * @param {number} originalHeight - 原始高度
   * @param {number} maxWidth - 最大宽度
   * @param {number} maxHeight - 最大高度（可选）
   * @returns {{width: number, height: number, isScaled: boolean}}
   */
  scaleImageToFit(originalWidth, originalHeight, maxWidth, maxHeight = null) {
    let finalWidth = originalWidth;
    let finalHeight = originalHeight;
    let isScaled = false;

    // 宽度缩放
    if (originalWidth > maxWidth) {
      const widthScale = maxWidth / originalWidth;
      finalWidth = maxWidth;
      finalHeight = originalHeight * widthScale;
      isScaled = true;
    }

    // 高度缩放（如果指定了最大高度）
    if (maxHeight && finalHeight > maxHeight) {
      const heightScale = maxHeight / finalHeight;
      finalWidth = finalWidth * heightScale;
      finalHeight = maxHeight;
      isScaled = true;
    }

    return {
      width: finalWidth,
      height: finalHeight,
      isScaled,
    };
  }

  // ===== 布局节点管理方法 =====

  /**
   * 根据nodeId查找布局节点（全局查找，用于向后兼容）
   * @param {string} nodeId - 节点ID
   * @returns {Object|null} 布局节点或null
   */
  findLayoutNodeById(nodeId) {
    if (!this.layoutNodesList) return null;

    const traverse = (nodeList) => {
      for (const node of nodeList) {
        if (node.nodeId === nodeId) {
          return node;
        }
        if (node.children && node.children.length > 0) {
          const found = traverse(node.children);
          if (found) return found;
        }
      }
      return null;
    };

    return traverse(this.layoutNodesList);
  }

  /**
   * 获取完整的布局节点列表（调试和检查用）
   * @returns {Array} layoutNodesList的深拷贝
   */
  getLayoutNodesList() {
    return this.layoutNodesList
      ? JSON.parse(JSON.stringify(this.layoutNodesList))
      : null;
  }

  checkWordCrossViewport(word) {
    // 如果启用了跨块内容调整
    if (this.adjustCrossChunkContent) {
      const lineHeight = this.getLineHeight(word.style);
      const baseline = this.getTextBaseline(lineHeight);
      const viewportHeight = this.viewportHeight;

      let wordTop = word.y - baseline;
      let wordBottom = wordTop + lineHeight;
      const wordChunkIndex = Math.floor(wordTop / viewportHeight);
      const chunkBottom = (wordChunkIndex + 1) * viewportHeight;

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
    return word;
  }

  checkElementCrossViewport(element) {
    // 如果启用了跨块内容调整
    if (this.adjustCrossChunkContent) {
      const viewportHeight = this.viewportHeight;

      let elementTop = element.y;
      let elementBottom = element.y + element.height;
      const elementChunkIndex = Math.floor(elementTop / viewportHeight);
      const chunkBottom = (elementChunkIndex + 1) * viewportHeight;

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
    return element;
  }

  /**
   * 从layoutNodesList中提取所有words和elements
   * @param {Array} layoutNodes - 布局节点列表（可选，默认使用this.layoutNodesList）
   * @returns {Object} {words: Array, elements: Array}
   */
  extractWordsAndElementsFromLayoutNodes(layoutNodes = null) {
    const nodes = layoutNodes || this.layoutNodesList;
    if (!nodes) return { words: [], elements: [] };

    const words = [];
    const elements = [];

    const traverse = (nodeList) => {
      for (const node of nodeList) {
        // 收集当前节点的layout数据
        if (node.layout && Array.isArray(node.layout)) {
          for (const item of node.layout) {
            // 检查是否为word（有wordId字段）
            if (item.wordId) {
              this.addWordToChunk(item);
              words.push(item);
            }
            // 检查是否为element（有type字段且为image）
            else if (item.type === 'image') {
              this.addElementToChunk(item);
              elements.push(item);
            }
          }
        }

        // 递归处理子节点
        if (node.children && node.children.length > 0) {
          traverse(node.children);
        }
      }
    };

    traverse(nodes);
    return { words, elements };
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
    const viewportHeight = this.viewportHeight;
    const startY = chunkIndex * viewportHeight;
    const endY = (chunkIndex + 1) * viewportHeight;

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
    const viewportHeight = this.viewportHeight;
    const wordTop = word.y;
    const wordBottom = word.y + word.height;
    // 计算单词所属的块索引（使用调整后的位置）
    const wordChunkIndex = Math.floor(wordTop / viewportHeight);

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
    const endChunkIndex = Math.floor((wordBottom - 1) / viewportHeight);
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
  }

  /**
   * 将元素添加到适当的渲染块
   * @param {Object} element - 元素对象
   * @returns {Object} 可能调整后的元素对象
   */
  addElementToChunk(element) {
    const viewportHeight = this.viewportHeight;
    const elementTop = element.y;
    const elementBottom = element.y + element.height;
    // 计算元素所属的块索引（使用调整后的位置）
    const elementChunkIndex = Math.floor(elementTop / viewportHeight);

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
    const endChunkIndex = Math.floor((elementBottom - 1) / viewportHeight);
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
  }
}
