/**
 * 布局引擎类
 * 负责处理所有布局计算相关的功能
 */

import { InlineFlowManager } from './inline-flow-manager.js';
import { LineBreaker } from './line-breaker.js';
import { LineStylist } from './line-stylist.js';

export class LayoutEngine {
  /**
   * @param {Object} renderer - VirtualCanvasRenderer实例
   */
  constructor(renderer) {
    this.renderer = renderer;

    // 初始化布局工具
    this.inlineFlowManager = new InlineFlowManager(renderer);
    this.lineBreaker = new LineBreaker(renderer);
    this.lineStylist = new LineStylist(renderer);

    // 布局树结构
    /** @type {Array} 布局节点列表，与parsedNodes保持相同树形结构 */
    this.layoutNodesList = null;
  }

  /**
   * 计算完整布局（不进行Canvas渲染）
   */
  calculateFullLayout() {
    let x = this.renderer.theme.paddingX; // 从左内边距开始
    let y = 0;
    let currentLine = 0;

    // 初始化渲染块管理
    this.renderer.initRenderChunks();

    // 设置初始的继承样式（从主题中获取）
    const initialInheritedStyle = {
      color: this.renderer.theme.textColor,
      fontFamily: this.renderer.theme.fontFamily,
      fontSize: this.renderer.theme.baseFontSize,
      lineHeight: this.renderer.theme.lineHeight,
      fontWeight: 'normal',
      fontStyle: 'normal',
    };

    // 使用布局算法计算所有位置，同时创建layoutNodesList
    const result = this.layoutNodes(
      this.renderer.parsedNodes,
      x,
      y,
      currentLine,
      initialInheritedStyle
    );

    // 保存布局节点列表
    this.layoutNodesList = result.layoutNodes;

    // 从布局节点列表中一次性提取words和elements
    const { words, elements } = this.extractWordsAndElementsFromLayoutNodes();

    // 📐 正确的总高度计算方式：使用实际的Y坐标
    const contentHeight = result.y;
    // 计算需要的总块数
    const chunkHeight = this.renderer.chunkHeight;
    const chunkWidth = this.renderer.chunkWidth;
    const totalChunks = Math.ceil(contentHeight / chunkHeight);

    // scrollContent 的高度基于块数量，而不是内容高度
    const scrollContentHeight = totalChunks * chunkHeight;
    const scrollContentWidth = totalChunks * chunkWidth;
    this.renderer.fullLayoutData = {
      words, // 从layoutNodesList提取的words
      elements, // 从layoutNodesList提取的elements
      contentHeight, // 实际内容高度
      scrollContentHeight, // 滚动容器高度
      totalHeight: scrollContentHeight, // 兼容性，使用滚动容器高度
      totalWidth: scrollContentWidth,
      totalChunks,
      layoutNodesList: this.layoutNodesList, // 包含布局节点列表
    };
  }

  /**
   * 布局节点
   * @param {Array} nodes
   * @param {number} startX
   * @param {number} startY
   * @param {number} startLine
   * @param {Object} inheritedStyle - 从父元素继承的样式
   * @returns {Object} {x, y, line, words, elements, layoutNodes}
   */
  layoutNodes(nodes, startX, startY, startLine, inheritedStyle = {}) {
    return this.layoutNodesWithInlineState(
      nodes,
      startX,
      startY,
      startLine,
      inheritedStyle,
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
    inheritedStyle = {},
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
        inheritedStyle,
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
   * @param {Object} inheritedStyle - 从父元素继承的样式
   * @param {boolean} isInlineTextContinuation - 是否是同一行内联文本的续接部分
   * @returns {Object} {x, y, line, layoutNode}
   */
  layoutNode(
    node,
    startX,
    startY,
    startLine,
    inheritedStyle = {},
    isInlineTextContinuation = false
  ) {
    // 创建布局节点，包含position字段记录开始位置
    const layoutNode = {
      type: node.type,
      nodeId: node._nodeId,
      children: [],
      position: {
        startX,
        startY,
        startLine,
        endX: startX, // 初始化为startX，会在后面更新
        endY: startY, // 初始化为startY，会在后面更新
        endLine: startLine, // 初始化为startLine，会在后面更新
      },
    };

    // 为文本和图片节点添加layout字段
    if (node.type === 'text' || node.type === 'link') {
      layoutNode.layout = []; // 存储words数组
    } else if (node.type === 'image') {
      layoutNode.layout = []; // 存储image元素信息
    }

    if (node.type === 'text') {
      // 文本节点的样式：继承的样式 + 节点自身的特有样式
      const nodeStyle = node.style || {};

      // 合并继承样式和节点特有样式（节点样式优先）
      const textStyle = this.mergeInheritedStyle(inheritedStyle, nodeStyle);

      const result = this.layoutText(
        node.text,
        textStyle,
        startX,
        startY,
        startLine,
        isInlineTextContinuation,
        node._nodeId
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
      // 链接节点：继承的样式 + 节点自身的样式
      const linkStyle = node.style || {};
      const textStyle = this.mergeInheritedStyle(inheritedStyle, linkStyle);

      const result = this.layoutText(
        node.text,
        textStyle,
        startX,
        startY,
        startLine,
        isInlineTextContinuation,
        node._nodeId
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

    // 直接使用节点的样式，HTMLParser已经处理了默认样式合并
    const currentNodeStyle = node.style || {};

    // 准备传递给子节点的继承样式：从当前节点提取可继承样式并与父节点继承样式合并
    const currentInheritableStyles =
      this.extractInheritableStyles(currentNodeStyle);
    const inheritedStyleForChildren = this.mergeInheritedStyle(
      inheritedStyle,
      currentInheritableStyles
    );

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
        const inlineChildren = this.inlineFlowManager.extractInlineNodes(
          node.children,
          inheritedStyleForChildren
        );

        if (inlineChildren.length > 0) {
          // 收集整个内联流
          const { segments, styleMap } =
            this.inlineFlowManager.collectInlineFlow(
              inlineChildren,
              inheritedStyleForChildren
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
              node._nodeId
            );

            // 添加到渲染系统并按nodeId分组布局节点
            let finalX = x;
            let finalY = y;
            let finalLine = line;

            const wordsByNodeId = new Map();
            const inlineLayoutNodes = [];

            for (const styledWord of styledWords) {
              const adjustedWord = this.renderer.addWordToChunk(styledWord);

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
                wordsByNodeId.get(inlineChild._nodeId) || [];

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

              const childLayoutNode = {
                type: inlineChild.type,
                nodeId: inlineChild._nodeId,
                children: [],
                position: {
                  startX: childStartX,
                  startY: childStartY,
                  startLine: childStartLine,
                  endX: childEndX,
                  endY: childEndY,
                  endLine: childEndLine,
                },
              };

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
            inheritedStyleForChildren,
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
          inheritedStyleForChildren,
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
      const adjustedWord = this.renderer.addWordToChunk(styledWord);

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
      nodeId: node._nodeId, // 添加nodeId信息
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
    const adjustedImageElement = this.renderer.addElementToChunk(imageElement);

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
   * 获取可继承的样式属性列表
   * @returns {string[]}
   */
  getInheritableStyleProperties() {
    return [
      // 字体相关
      'fontFamily',
      'fontSize',
      'fontWeight',
      'fontStyle',
      'fontVariant',
      'lineHeight',
      'letterSpacing',
      'wordSpacing',

      // 文本相关
      'color',
      'textAlign',
      'textIndent',
    ];
  }

  /**
   * 从样式对象中提取可继承的样式
   * @param {Object} style - 样式对象
   * @returns {Object} 可继承的样式
   */
  extractInheritableStyles(style) {
    const inheritableStyles = {};
    const inheritableProps = this.getInheritableStyleProperties();

    inheritableProps.forEach((prop) => {
      if (style && style[prop] !== undefined) {
        inheritableStyles[prop] = style[prop];
      }
    });

    return inheritableStyles;
  }

  /**
   * 合并继承样式和节点样式
   * @param {Object} inheritedStyle - 继承的样式
   * @param {Object} nodeStyle - 节点自身的样式
   * @returns {Object} 合并后的样式
   */
  mergeInheritedStyle(inheritedStyle = {}, nodeStyle = {}) {
    // 先应用继承样式，再覆盖节点样式（节点样式优先级更高）
    return {
      ...inheritedStyle,
      ...nodeStyle,
    };
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
              words.push(item);
            }
            // 检查是否为element（有type字段且为image）
            else if (item.type === 'image') {
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
}
