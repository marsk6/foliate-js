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
 * renderer.pageDown(); // 向下翻页
 * renderer.goToEnd(); // 跳转到结尾
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

/**
 * @typedef {Object} VirtualRenderConfig
 * @property {HTMLElement} mountPoint - 挂载点元素
 * @property {number} [poolSize=4] - Canvas池大小
 * @property {Object} [theme] - 主题配置
 * @property {string} [mode='vertical'] - 渲染模式：'vertical' | 'horizontal'
 * @property {boolean} [adjustCrossChunkContent=true] - 是否自动调整跨块内容
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

/**
 * 内联流管理器 - 负责收集块级元素内的所有内联内容，形成统一的文本流
 * 这是布局的第0阶段：收集整个内联流，而不是单个text node
 */
class InlineFlowManager {
  constructor(renderer) {
    this.renderer = renderer;
  }

  /**
   * 收集块级元素内的所有内联内容，形成统一的文本流
   * @param {Array} inlineNodes - 同一块级元素下的所有内联节点
   * @param {Object} inheritedStyle - 继承的样式
   * @returns {Object} 包含segments和styleMap的统一文本流
   */
  collectInlineFlow(inlineNodes, inheritedStyle = {}) {
    const segments = [];
    const styleMap = new Map(); // 记录每个segment对应的样式

    let globalTextIndex = 0;
    let segmentIndex = 0;

    for (const node of inlineNodes) {
      if (node.type === 'text' || node.type === 'link') {
        // 合并继承样式和节点样式
        const nodeStyle = this.renderer.mergeInheritedStyle(inheritedStyle, node.style || {});

        // 分割文本为segments（传递样式用于空白符处理）
        const nodeSegments = this.renderer.segmentText(node.text, nodeStyle);

        for (const segment of nodeSegments) {
          const globalSegment = {
            ...segment,
            // 调整为全局文本索引
            startIndex: globalTextIndex + segment.startIndex,
            endIndex: globalTextIndex + segment.endIndex,
            originalNodeId: node.id || `${node.type}_${segmentIndex}`, // 用于调试
            originalSegmentIndex: segmentIndex // 用于样式映射
          };

          segments.push(globalSegment);

          // 建立segment到样式的映射
          styleMap.set(segmentIndex, nodeStyle);

          segmentIndex++;
        }

        globalTextIndex += node.text.length;
      }
    }

    return { segments, styleMap };
  }

  /**
   * 从节点树中提取所有内联节点
   * @param {Array} children - 子节点数组
   * @param {Object} inheritedStyle - 继承的样式
   * @returns {Array} 内联节点数组
   */
  extractInlineNodes(children, inheritedStyle = {}) {
    const inlineNodes = [];

    for (const child of children) {
      if (child.type === 'text' || child.type === 'link') {
        inlineNodes.push(child);
      } else if (child.type === 'element' && this.renderer.isInlineNode(child)) {
        // 内联元素：递归提取其子内容
        const childInheritedStyle = this.renderer.mergeInheritedStyle(
          inheritedStyle,
          this.renderer.extractInheritableStyles(child.style || {})
        );
        const childInlineNodes = this.extractInlineNodes(child.children || [], childInheritedStyle);
        inlineNodes.push(...childInlineNodes);
      }
    }

    return inlineNodes;
  }
}

/**
 * 行分割器 - 负责将统一的文本流按照可用宽度分行
 * 这是布局的第一阶段：确定哪些内容在同一行
 */
class LineBreaker {
  constructor(renderer) {
    this.renderer = renderer;
    this.measureCtx = renderer.measureCtx;

    // 定义不能出现在行首的英语标点符号
    this.englishEndPunctuation = new Set([
      ',', '.', ';', ':', '?', '!', ')', ']', '}',
      '»', '"', "'", '…'
    ]);

    // 定义不能出现在行末的英语标点符号
    this.englishStartPunctuation = new Set([
      '(', '[', '{', '«', '"', "'"
    ]);
  }

  /**
   * 检查标点符号是否不应该出现在行首
   * @param {string} punctuation - 标点符号
   * @returns {boolean}
   */
  isEnglishEndPunctuation(punctuation) {
    return this.englishEndPunctuation.has(punctuation);
  }

  /**
   * 检查标点符号是否不应该出现在行末
   * @param {string} punctuation - 标点符号
   * @returns {boolean}
   */
  isEnglishStartPunctuation(punctuation) {
    return this.englishStartPunctuation.has(punctuation);
  }

  /**
   * 将文本段落分解为行（优化版：边测量边排版边决定换行点）
   * @param {Array} segments - 文本段落数组
   * @param {Object} layoutContext - 布局上下文
   * @param {Map} [styleMap] - segment索引到样式的映射（用于准确测量）
   * @returns {Array<LineBox>} 行盒数组
   */
  breakIntoLines(segments, layoutContext, styleMap = null) {
    const {
      availableWidth,
      textIndent = 0,
      startX,
      isInlineTextContinuation = false
    } = layoutContext;

    const lines = [];
    let currentLine = new LineBox();
    let isFirstLine = !isInlineTextContinuation; // 如果是续接文本，则不是首行

    // 关键修复：正确设置当前X位置
    let currentX = isFirstLine ? startX + textIndent : startX;

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];

      // 使用正确的字体样式测量宽度
      let segmentWidth;
      if (styleMap && segment.originalSegmentIndex !== undefined) {
        const segmentStyle = styleMap.get(segment.originalSegmentIndex) || {};
        const fontSize = this.renderer.parseSize(this.renderer.getStyleProperty(segmentStyle, 'fontSize')) || this.renderer.theme.baseFontSize;
        const fontWeight = this.renderer.getStyleProperty(segmentStyle, 'fontWeight') || 'normal';
        const fontStyle = this.renderer.getStyleProperty(segmentStyle, 'fontStyle') || 'normal';

        // 设置正确的字体
        this.measureCtx.font = `${fontStyle} ${fontWeight} ${fontSize}px ${this.renderer.theme.fontFamily}`;
        segmentWidth = this.measureCtx.measureText(segment.content).width;
      } else {
        // 回退到默认测量
        segmentWidth = this.measureCtx.measureText(segment.content).width;
      }

      // 简化的换行判断逻辑：直接计算是否超出右边界
      const rightBoundary = startX + availableWidth;
      const willExceedBoundary = currentX + segmentWidth > rightBoundary;

      const breakResult = this.shouldBreakBefore(
        segment,
        segmentWidth,
        currentX,
        rightBoundary,
        willExceedBoundary,
        segments,
        i
      );

      if (breakResult.shouldBreak) {
        // 处理需要回溯的情况（如英语标点符号不能在行首）
        if (breakResult.needBacktrack && currentLine.segments.length > 0) {
          // 找到需要回溯的段数
          const backtrackCount = this.findBacktrackCount(currentLine.segments, segment);

          if (backtrackCount > 0) {
            // 从当前行移除需要回溯的段
            const backtrackSegments = currentLine.segments.splice(-backtrackCount);
            const backtrackPositions = currentLine.positions.splice(-backtrackCount);

            // 完成当前行（如果还有内容）
            if (currentLine.hasContent()) {
              currentLine.computeMetrics(this.measureCtx);
              lines.push(currentLine);
            }

            // 创建新行
            currentLine = new LineBox();
            currentX = startX; // 新行从基础起始位置开始
            isFirstLine = false;

            // 将回溯的段添加到新行
            for (let j = 0; j < backtrackSegments.length; j++) {
              const backtrackSegment = backtrackSegments[j];

              // 重新测量回溯段的宽度
              let backtrackWidth;
              if (styleMap && backtrackSegment.originalSegmentIndex !== undefined) {
                const segmentStyle = styleMap.get(backtrackSegment.originalSegmentIndex) || {};
                const fontSize = this.renderer.parseSize(this.renderer.getStyleProperty(segmentStyle, 'fontSize')) || this.renderer.theme.baseFontSize;
                const fontWeight = this.renderer.getStyleProperty(segmentStyle, 'fontWeight') || 'normal';
                const fontStyle = this.renderer.getStyleProperty(segmentStyle, 'fontStyle') || 'normal';

                this.measureCtx.font = `${fontStyle} ${fontWeight} ${fontSize}px ${this.renderer.theme.fontFamily}`;
                backtrackWidth = this.measureCtx.measureText(backtrackSegment.content).width;
              } else {
                backtrackWidth = this.measureCtx.measureText(backtrackSegment.content).width;
              }

              currentLine.addSegment(backtrackSegment, currentX);
              currentX += backtrackWidth;
            }
          }
        } else {
          // 完成当前行（如果有内容）
          if (currentLine.hasContent()) {
            currentLine.computeMetrics(this.measureCtx);
            lines.push(currentLine);
          }

          // 创建新行
          currentLine = new LineBox();
          currentX = startX; // 新行从基础起始位置开始（没有缩进）
          isFirstLine = false;
        }

        // 如果是空格导致的换行，跳过这个空格
        if (breakResult.skipSegment) {
          continue;
        }
      }

      // 添加段落到当前行
      currentLine.addSegment(segment, currentX);
      currentX += segmentWidth;

      // 第一个非空格字符后，不再是首行
      if (segment.type !== 'space') {
        isFirstLine = false;
      }
    }

    // 添加最后一行
    if (currentLine.hasContent()) {
      currentLine.computeMetrics(this.measureCtx);
      lines.push(currentLine);
    }

    // 为行盒设置上下文信息
    lines.forEach((line, index) => {
      line.isFirstLine = index === 0 && !isInlineTextContinuation;
      line.textIndent = line.isFirstLine ? textIndent : 0;
      line.startX = startX;
    });

    return lines;
  }

  /**
   * 计算需要回溯的段数
   * @param {Array} currentSegments - 当前行的段
   * @param {Object} problematicSegment - 有问题的段（如不能出现在行首的标点符号）
   * @returns {number}
   */
  findBacktrackCount(currentSegments, problematicSegment) {
    // 对于不能出现在行首的标点符号，至少要回溯1个非空格段
    let backtrackCount = 0;

    // 从行末开始向前查找，跳过空格
    for (let i = currentSegments.length - 1; i >= 0; i--) {
      const segment = currentSegments[i];
      backtrackCount++;

      // 如果遇到非空格的段，停止回溯
      if (segment.type !== 'space') {
        break;
      }

      // 避免回溯过多
      if (backtrackCount >= 3) {
        break;
      }
    }

    return backtrackCount;
  }

  /**
   * 判断是否需要在某个段落前换行（改进版：支持英语标点符号规则）
   * @param {Object} segment - 文本段落
   * @param {number} segmentWidth - 段落宽度
   * @param {number} currentX - 当前X位置
   * @param {number} rightBoundary - 右边界位置
   * @param {boolean} willExceedBoundary - 是否会超出边界
   * @param {Array} allSegments - 所有段落数组（用于上下文判断）
   * @param {number} currentIndex - 当前段落的索引
   * @returns {Object} 分行结果
   */
  shouldBreakBefore(segment, segmentWidth, currentX, rightBoundary, willExceedBoundary, allSegments, currentIndex) {
    // 如果不会超出边界，无需换行
    if (!willExceedBoundary) {
      return { shouldBreak: false, skipSegment: false, needBacktrack: false };
    }

    // 通过比较可用宽度来判断是否已有内容在当前行
    // 如果 currentX 接近 startX 或 startX + textIndent，说明是行首
    const availableWidthFromCurrentPos = rightBoundary - currentX;
    const totalAvailableWidth = rightBoundary - this.renderer.theme.paddingX; // 总可用宽度
    const hasContentInLine = availableWidthFromCurrentPos < totalAvailableWidth * 0.95; // 有5%容差

    if (segment.type === 'word') {
      // 英文单词：整个单词必须在同一行，超出则换行
      // 但如果是行首且单词过长，强制放置以避免无限循环
      return hasContentInLine
        ? { shouldBreak: true, skipSegment: false, needBacktrack: false }
        : { shouldBreak: false, skipSegment: false, needBacktrack: false }; // 强制放置，即使超出
    }

    if (segment.type === 'cjk') {
      // 中文字符：可以在任意位置换行
      // 但如果是行首，强制放置以避免无限循环
      return hasContentInLine
        ? { shouldBreak: true, skipSegment: false, needBacktrack: false }
        : { shouldBreak: false, skipSegment: false, needBacktrack: false }; // 强制放置
    }

    if (segment.type === 'punctuation') {
      // 标点符号的特殊处理
      const punctuation = segment.content;

      // 检查是否是不能出现在行首的英语标点符号
      if (this.isEnglishEndPunctuation(punctuation)) {
        // 这类标点符号不能出现在行首
        if (hasContentInLine) {
          // 当前行有内容，需要换行并回溯
          return {
            shouldBreak: true,
            skipSegment: false,
            needBacktrack: true
          };
        } else {
          // 如果是行首，强制放置以避免无限循环
          return {
            shouldBreak: false,
            skipSegment: false,
            needBacktrack: false
          };
        }
      }

      // 其他标点符号（包括中文标点）可以正常换行
      return hasContentInLine
        ? { shouldBreak: true, skipSegment: false, needBacktrack: false }
        : { shouldBreak: false, skipSegment: false, needBacktrack: false };
    }

    if (segment.type === 'space') {
      // 空格：如果导致换行则跳过这个空格
      // 行首的空格直接跳过（不显示）
      return hasContentInLine
        ? { shouldBreak: true, skipSegment: true, needBacktrack: false }
        : { shouldBreak: false, skipSegment: true, needBacktrack: false }; // 行首空格跳过
    }

    // 其他类型默认不换行
    return { shouldBreak: false, skipSegment: false, needBacktrack: false };
  }
}

/**
 * 行盒 - 表示一行内容的容器
 */
class LineBox {
  constructor() {
    this.segments = []; // 此行包含的段落
    this.positions = []; // 每个段落的相对位置信息
    this.width = 0; // 行的总宽度
    this.isFirstLine = false; // 是否是首行
    this.textIndent = 0; // 首行缩进
    this.startX = 0; // 行的起始X坐标
  }

  /**
   * 添加段落到行中
   * @param {Object} segment - 文本段落
   * @param {number} x - 段落的X位置
   */
  addSegment(segment, x) {
    this.segments.push(segment);
    this.positions.push({ x, segment });
  }

  /**
   * 检查行是否有内容
   * @returns {boolean}
   */
  hasContent() {
    return this.segments.length > 0;
  }

  /**
   * 计算行的度量信息
   * @param {CanvasRenderingContext2D} measureCtx - 用于测量文本的上下文
   * @param {Map} styleMap - 可选的样式映射，用于准确计算不同样式的文本宽度
   */
  computeMetrics(measureCtx = null, styleMap = null) {
    if (this.positions.length === 0) {
      this.width = 0;
      return;
    }

    // 计算行的总宽度
    let totalWidth = 0;
    for (const segment of this.segments) {
      if (measureCtx) {
        // 如果有样式映射，为每个segment设置正确的字体
        if (styleMap && segment.originalSegmentIndex !== undefined) {
          const segmentStyle = styleMap.get(segment.originalSegmentIndex) || {};
          const fontSize = segmentStyle.fontSize || '16px';
          const fontWeight = segmentStyle.fontWeight || 'normal';
          const fontStyle = segmentStyle.fontStyle || 'normal';
          const fontFamily = segmentStyle.fontFamily || 'system-ui, sans-serif';

          measureCtx.font = `${fontStyle} ${fontWeight} ${fontSize} ${fontFamily}`;
        }

        totalWidth += measureCtx.measureText(segment.content).width;
      } else {
        // 回退到近似计算
        totalWidth += segment.content.length * 10; // 粗略估算
      }
    }
    this.width = totalWidth;
  }
}

/**
 * 行样式处理器 - 负责处理行内的样式、对齐和定位
 * 这是布局的第二阶段：在确定的行内应用样式映射
 */
class LineStylist {
  constructor(renderer) {
    this.renderer = renderer;
    this.measureCtx = renderer.measureCtx;
  }

  /**
   * 为行盒应用样式和定位（支持样式映射）
   * @param {Array<LineBox>} lines - 行盒数组
   * @param {Map} styleMap - segment索引到样式的映射
   * @param {Object} layoutContext - 布局上下文
   * @returns {Array} 样式化的单词数组
   */
  applyStylesToLines(lines, styleMap, layoutContext) {
    const {
      textAlign = 'left',
      startY,
      startLine,
      isInlineTextContinuation = false,
      availableWidth,
      startX,
      textIndent = 0
    } = layoutContext;

    const styledWords = [];
    let currentLineNumber = startLine;

    // 预计算每行的行高（可能包含不同字体大小）
    const lineMetrics = this.calculateLineMetrics(lines, styleMap);

    let currentY = startY;
    if (!isInlineTextContinuation) {
      // 使用第一行的基线作为起始位置
      const firstLineHeight = lineMetrics[0]?.lineHeight || this.renderer.theme.baseFontSize * this.renderer.theme.lineHeight;
      const baseline = this.renderer.getTextBaseline(firstLineHeight);
      currentY = startY + baseline;
    }

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];
      const lineMetric = lineMetrics[lineIndex];

      // 计算文本对齐的偏移量（基于已有位置进行调整）
      let alignmentOffsetX = 0;
      let justifySpaceDistribution = new Map(); // 用于存储每个空格应该增加的宽度

      if (textAlign === 'center' || textAlign === 'right' || textAlign === 'justify') {
        // 重新计算行的实际宽度
        let lineWidth = 0;
        for (let i = 0; i < line.segments.length; i++) {
          const segment = line.segments[i];
          const segmentStyle = styleMap.get(segment.originalSegmentIndex) || {};
          const fontSize = this.renderer.parseSize(this.renderer.getStyleProperty(segmentStyle, 'fontSize')) || this.renderer.theme.baseFontSize;
          const fontWeight = this.renderer.getStyleProperty(segmentStyle, 'fontWeight') || 'normal';
          const fontStyle = this.renderer.getStyleProperty(segmentStyle, 'fontStyle') || 'normal';

          this.measureCtx.font = `${fontStyle} ${fontWeight} ${fontSize}px ${this.renderer.theme.fontFamily}`;
          lineWidth += this.measureCtx.measureText(segment.content).width;
        }

        const contentWidth = availableWidth - (line.isFirstLine ? textIndent : 0);
        const remainingSpace = contentWidth - lineWidth;

        if (textAlign === 'center') {
          alignmentOffsetX = remainingSpace / 2;
        } else if (textAlign === 'right') {
          alignmentOffsetX = remainingSpace;
        } else if (textAlign === 'justify') {
          // 两端对齐：将剩余空间均分到空格中
          // 只对非最后一行进行两端对齐，最后一行保持左对齐
          const isLastLine = lineIndex === lines.length - 1;
          if (!isLastLine && remainingSpace > 0) {
            // 计算该行中空格的数量
            const spaceSegments = [];
            for (let i = 0; i < line.segments.length; i++) {
              const segment = line.segments[i];
              if (segment.type === 'space') {
                spaceSegments.push(i);
              }
            }

            if (spaceSegments.length > 0) {
              // 将剩余空间均分到每个空格
              const additionalSpacePerGap = remainingSpace / spaceSegments.length;
              spaceSegments.forEach(segmentIndex => {
                justifySpaceDistribution.set(segmentIndex, additionalSpacePerGap);
              });
            }
          }
        }
      }

      // 计算两端对齐时的累积偏移
      let justifyOffsetX = 0;

      for (let segmentIndex = 0; segmentIndex < line.segments.length; segmentIndex++) {
        const segment = line.segments[segmentIndex];
        const position = line.positions[segmentIndex];

        // 获取该segment的样式
        const segmentStyle = styleMap.get(segment.originalSegmentIndex) || {};

        // 解析样式属性
        const fontSize = this.renderer.parseSize(this.renderer.getStyleProperty(segmentStyle, 'fontSize')) || this.renderer.theme.baseFontSize;
        const fontWeight = this.renderer.getStyleProperty(segmentStyle, 'fontWeight') || 'normal';
        const fontStyle = this.renderer.getStyleProperty(segmentStyle, 'fontStyle') || 'normal';
        const color = this.renderer.getStyleProperty(segmentStyle, 'color') || this.renderer.theme.textColor;

        // 设置测量上下文字体
        this.measureCtx.font = `${fontStyle} ${fontWeight} ${fontSize}px ${this.renderer.theme.fontFamily}`;
        const segmentWidth = this.measureCtx.measureText(segment.content).width;

        // 计算最终的X位置（包含对齐偏移和两端对齐偏移）
        let finalX = position.x + alignmentOffsetX + justifyOffsetX;

        // 如果是空格且需要两端对齐，则增加额外的宽度
        let finalWidth = segmentWidth;
        if (segment.type === 'space' && justifySpaceDistribution.has(segmentIndex)) {
          const additionalSpace = justifySpaceDistribution.get(segmentIndex);
          finalWidth += additionalSpace;
          // 这个空格之后的所有段都需要增加相应的偏移
          justifyOffsetX += additionalSpace;
        }

        // 使用 LineBreaker 计算的位置 + 对齐偏移 + 两端对齐偏移
        const styledWord = {
          x: finalX,
          y: currentY,
          width: finalWidth,
          height: fontSize,
          line: currentLineNumber,
          text: segment.content,
          type: segment.type,
          style: {
            ...segmentStyle,
            fontSize,
            fontWeight,
            fontStyle,
            color,
          },
          startIndex: segment.startIndex,
          endIndex: segment.endIndex,
        };

        styledWords.push(styledWord);
      }

      // 准备下一行
      if (lineIndex < lines.length - 1) {
        currentLineNumber++;
        currentY += lineMetric.lineHeight;
      }
    }

    return styledWords;
  }

  /**
   * 计算每行的度量信息（考虑不同字体大小）
   * @param {Array<LineBox>} lines - 行盒数组
   * @param {Map} styleMap - 样式映射
   * @returns {Array} 每行的度量信息
   */
  calculateLineMetrics(lines, styleMap) {
    return lines.map(line => {
      let maxFontSize = this.renderer.theme.baseFontSize;
      let maxLineHeight = maxFontSize * this.renderer.theme.lineHeight;

      // 找到行内最大的字体大小和行高
      for (const segment of line.segments) {
        const segmentStyle = styleMap.get(segment.originalSegmentIndex) || {};
        const fontSize = this.renderer.parseSize(this.renderer.getStyleProperty(segmentStyle, 'fontSize')) || this.renderer.theme.baseFontSize;
        const lineHeight = this.renderer.getLineHeight(segmentStyle);

        if (fontSize > maxFontSize) {
          maxFontSize = fontSize;
        }
        if (lineHeight > maxLineHeight) {
          maxLineHeight = lineHeight;
        }
      }

      return {
        maxFontSize,
        lineHeight: maxLineHeight
      };
    });
  }

  /**
   * 旧版本的styleLines方法（保持兼容性）
   * @deprecated 推荐使用applyStylesToLines方法
   */
  styleLines(lines, styleContext) {
    // 创建简单的样式映射（所有segment使用相同样式）
    const styleMap = new Map();
    let segmentIndex = 0;

    for (const line of lines) {
      for (const segment of line.segments) {
        styleMap.set(segmentIndex, styleContext.style || {});
        segmentIndex++;
      }
    }

    return this.applyStylesToLines(lines, styleMap, styleContext);
  }

  /**
   * 计算行的对齐起始位置
   * @param {LineBox} line - 行盒
   * @param {string} textAlign - 文本对齐方式
   * @param {Object} styleContext - 样式上下文
   * @returns {number} 对齐后的起始X坐标
   */
  calculateLineAlignment(line, textAlign, styleContext) {
    const { availableWidth, startX } = styleContext;

    // 重新计算行的实际宽度
    let lineWidth = 0;
    for (const segment of line.segments) {
      lineWidth += this.measureCtx.measureText(segment.content).width;
    }

    switch (textAlign) {
      case 'center':
        return startX + (availableWidth - lineWidth) / 2;

      case 'right':
        return startX + availableWidth - lineWidth;

      case 'justify':
        // 两端对齐：起始位置是左对齐，具体的空间分布在 applyStylesToLines 中处理
        return startX;

      case 'left':
      default:
        return startX;
    }
  }
}

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

  /** @type {Array|null} 解析后的节点数据 */
  parsedNodes = null;

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
    this.viewportWidth = window.innerWidth; // 使用窗口宽度作为视窗宽度
    this.viewportHeight = window.innerHeight; // 使用窗口高度作为视窗高度

    // Canvas尺寸 - 直接使用视窗尺寸
    this.canvasWidth = this.viewportWidth;
    this.canvasHeight = this.viewportHeight;

    // 块高度 - 每个渲染块的高度，等于Canvas高度
    this.chunkHeight = this.canvasHeight;
    this.chunkWidth = this.canvasWidth;

    // 转换引擎实例

    this.parsedNodes = null;

    // 创建隐藏的canvas用于测量文本
    this.measureCanvas = document.createElement('canvas');
    this.measureCtx = this.measureCanvas.getContext('2d');

    // 初始化新的布局工具
    this.inlineFlowManager = new InlineFlowManager(this);
    this.lineBreaker = new LineBreaker(this);
    this.lineStylist = new LineStylist(this);

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
      width: 100%;
      height: 100%;  /* 动态设置为总内容高度 */
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

    this.parsedNodes = root ? [root] : [];

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

  render() {
    this.renderVisibleContent();
  }

  /**
   * 计算完整布局（不进行Canvas渲染）
   * 
   * 布局说明：
   * - paddingX 代表左右对称的全局内边距
   * - 可用宽度 = canvasWidth - paddingX * 2 - 元素特定的内边距
   * - 起始X坐标 = paddingX（左内边距）
   */
  calculateFullLayout() {
    const words = [];
    const elements = [];

    let x = this.theme.paddingX; // 从左内边距开始
    let y = 0;
    let currentLine = 0;

    // 初始化渲染块管理
    this.initRenderChunks();

    // 设置初始的继承样式（从主题中获取）
    const initialInheritedStyle = {
      color: this.theme.textColor,
      fontFamily: this.theme.fontFamily,
      fontSize: this.theme.baseFontSize,
      lineHeight: this.theme.lineHeight,
      fontWeight: 'normal',
      fontStyle: 'normal',
    };

    // 使用原有的布局算法计算所有位置
    const result = this.layoutNodes(
      this.parsedNodes,
      x,
      y,
      currentLine,
      words,
      elements,
      initialInheritedStyle
    );

    // 📐 正确的总高度计算方式：使用实际的Y坐标
    const contentHeight = result.y;
    // 计算需要的总块数
    const chunkHeight = this.chunkHeight;
    const chunkWidth = this.chunkWidth;
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
    const chunkHeight = this.chunkHeight;
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
    const chunkHeight = this.chunkHeight;

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
    const chunkHeight = this.chunkHeight;

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
    const chunkHeight = this.chunkHeight;
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
      const fontStyle = this.getStyleProperty(style, 'fontStyle') || 'normal';
      const fontWeight = this.getStyleProperty(style, 'fontWeight') || 'normal';
      const fontSize = this.getStyleProperty(style, 'fontSize');
      const color =
        this.getStyleProperty(style, 'color') || this.theme.textColor;

      // 处理 fontSize - 如果是带单位的字符串，解析数值部分
      let fontSizeValue;
      if (fontSize) {
        fontSizeValue = this.parseSize(fontSize);
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
   * 计算图片的居中位置
   * @param {number} imageWidth - 图片宽度
   * @param {number} containerStart - 容器起始X坐标（默认为paddingX）
   * @param {number} containerWidth - 容器可用宽度
   * @returns {number} 图片居中的X坐标
   */
  calculateImageCenterPosition(
    imageWidth,
    containerStart = this.theme.paddingX,
    containerWidth = null
  ) {
    // 如果没有指定容器宽度，使用默认的可用宽度
    if (containerWidth === null) {
      containerWidth = this.canvasWidth - this.theme.paddingX * 2;
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
      const scaleText = `${element.originalWidth}×${element.originalHeight
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
    const wordY = word.y - this.getTextBaseline(this.getLineHeight(word.style));

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

  /**
   * 获取可继承的样式属性列表
   * @returns {string[]}
   */
  getInheritableStyleProperties() {
    return [
      // 字体相关
      'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'fontVariant',
      'lineHeight', 'letterSpacing', 'wordSpacing',

      // 文本相关  
      'color', 'textAlign', 'textIndent'
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

    inheritableProps.forEach(prop => {
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
      ...nodeStyle
    };
  }

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
   * 批量获取样式属性，返回 camelCase 格式的对象
   * @param {Object} style - 原始样式对象
   * @param {Array<string>} properties - 需要获取的属性列表（camelCase 格式）
   * @returns {Object} camelCase 格式的样式对象
   */
  extractNormalizedStyles(style, properties) {
    const normalized = {};

    properties.forEach((prop) => {
      const value = this.getStyleProperty(style, prop);
      if (value !== undefined) {
        // 特殊处理：跳过默认值，避免写入不必要的样式

        if (prop === 'textAlign' && (value === 'start' || value === 'left')) {
          return; // 跳过默认的对齐方式
        }


        normalized[prop] = value;
      }
    });

    return normalized;
  }

  /**
   * 布局节点
   * @param {Array} nodes
   * @param {number} startX
   * @param {number} startY
   * @param {number} startLine
   * @param {Array} words
   * @param {Array} elements
   * @param {Object} inheritedStyle - 从父元素继承的样式
   * @returns {Object}
   */
  layoutNodes(nodes, startX, startY, startLine, words, elements, inheritedStyle = {}) {
    return this.layoutNodesWithInlineState(nodes, startX, startY, startLine, words, elements, inheritedStyle, false);
  }

  layoutNodesWithInlineState(nodes, startX, startY, startLine, words, elements, inheritedStyle = {}, firstNodeInlineTextContinuation = false) {
    let x = startX;
    let y = startY;
    let line = startLine;
    let lastNodeWasInline = firstNodeInlineTextContinuation; // 使用传入的状态作为初始状态

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];

      // 检查当前节点是否是内联节点且前一个节点也是内联节点
      const currentNodeIsInline = this.isInlineNode(node);
      const currentNodeIsInlineText = this.isInlineTextNode(node);
      let isInlineTextContinuation = currentNodeIsInlineText && lastNodeWasInline;

      // 对于第一个节点，使用传入的状态
      if (i === 0) {
        isInlineTextContinuation = currentNodeIsInlineText && firstNodeInlineTextContinuation;
      }

      const result = this.layoutNode(node, x, y, line, words, elements, inheritedStyle, isInlineTextContinuation);

      // 更新坐标
      y = result.y;
      line = result.line;

      // X坐标的处理：
      // - 如果当前节点是块级元素，它已经在layoutNode中处理了换行，
      //   result.x 应该是 paddingX（新行的开始）
      // - 如果当前节点是内联元素，result.x 是当前行的结束位置
      // - 无论哪种情况，都直接使用 result.x，因为 layoutNode 已经正确处理了
      x = result.x;

      lastNodeWasInline = currentNodeIsInline;
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
   * @param {Object} inheritedStyle - 从父元素继承的样式
   * @param {boolean} isInlineTextContinuation - 是否是同一行内联文本的续接部分
   * @returns {Object}
   */
  layoutNode(node, startX, startY, startLine, words, elements, inheritedStyle = {}, isInlineTextContinuation = false) {
    if (node.type === 'text') {
      // 文本节点的样式：继承的样式 + 节点自身的特有样式
      const nodeStyle = node.style || {};

      // 合并继承样式和节点特有样式（节点样式优先）
      const textStyle = this.mergeInheritedStyle(inheritedStyle, nodeStyle);

      return this.layoutText(
        node.text,
        textStyle,
        startX,
        startY,
        startLine,
        words,
        isInlineTextContinuation
      );
    }

    if (node.type === 'link') {
      // 链接节点：继承的样式 + 节点自身的样式
      const linkStyle = node.style || {};
      const textStyle = this.mergeInheritedStyle(inheritedStyle, linkStyle);

      return this.layoutText(
        node.text,
        textStyle,
        startX,
        startY,
        startLine,
        words,
        isInlineTextContinuation
      );
    }

    let x = startX;
    let y = startY;
    let line = startLine;

    // 直接使用节点的样式，HTMLParser已经处理了默认样式合并
    const currentNodeStyle = node.style || {};

    // 准备传递给子节点的继承样式：从当前节点提取可继承样式并与父节点继承样式合并
    const currentInheritableStyles = this.extractInheritableStyles(currentNodeStyle);
    const inheritedStyleForChildren = this.mergeInheritedStyle(inheritedStyle, currentInheritableStyles);

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
      if (x > this.theme.paddingX) {
        line++;
        x = this.theme.paddingX;
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

    // 处理特殊元素
    if (node.type === 'image') {
      // 优先使用新 parser 提供的 bounds 信息
      let originalWidth, originalHeight;

      if (node.bounds && node.bounds.width && node.bounds.height) {
        originalWidth = node.bounds.width;
        originalHeight = node.bounds.height;
      } else {
        // 回退到手动获取或默认值
        originalWidth = node.width || this.defaultImageWidth;
        originalHeight = node.height || this.defaultImageHeight;
      }

      // 计算可用容器宽度
      const availableWidth = this.canvasWidth - this.theme.paddingX * 2;

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
        x: centeredX,
        y: y,
        width: scaleResult.width,
        height: scaleResult.height,
        src: node.src,
        alt: node.alt || '',
        originalWidth: originalWidth,
        originalHeight: originalHeight,
        isScaled: scaleResult.isScaled,
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
      // 判断是否为块级元素
      const isBlockElement = this.isBlockElement(currentNodeStyle);

      if (isBlockElement) {
        // 块级元素：使用内联流处理方式
        const inlineChildren = this.inlineFlowManager.extractInlineNodes(node.children, inheritedStyleForChildren);

        if (inlineChildren.length > 0) {
          // 收集整个内联流
          const { segments, styleMap } = this.inlineFlowManager.collectInlineFlow(inlineChildren, inheritedStyleForChildren);

          if (segments.length > 0) {
            // 计算布局参数
            const rightPadding = this.parseSize(this.getStyleProperty(currentNodeStyle, 'paddingRight')) || 0;
            const availableWidth = this.canvasWidth - this.theme.paddingX * 2 - rightPadding;
            const textIndent = this.parseSize(this.getStyleProperty(currentNodeStyle, 'textIndent')) || 0;
            const textAlign = this.getStyleProperty(currentNodeStyle, 'textAlign') || 'left';

            // 第一阶段：统一分行
            const layoutContext = {
              availableWidth,
              textIndent,
              startX: x,
              isInlineTextContinuation
            };
            const lines = this.lineBreaker.breakIntoLines(segments, layoutContext, styleMap);

            // 第二阶段：样式应用
            const styleContext = {
              textAlign,
              startY: y,
              startLine: line,
              isInlineTextContinuation,
              availableWidth,
              startX: x,
              textIndent
            };
            const styledWords = this.lineStylist.applyStylesToLines(lines, styleMap, styleContext);

            // 添加到渲染系统
            let finalX = x;
            let finalY = y;
            let finalLine = line;

            for (const styledWord of styledWords) {
              const adjustedWord = this.addWordToChunk(styledWord);
              words.push(adjustedWord);

              finalX = adjustedWord.x + adjustedWord.width;
              finalY = adjustedWord.y;
              finalLine = adjustedWord.line;
            }

            x = finalX;
            y = finalY;
            line = finalLine;
          }
        }

        // 处理非内联子节点（如图片等）
        const nonInlineChildren = node.children.filter(child =>
          !(child.type === 'text' || child.type === 'link' || (child.type === 'element' && this.isInlineNode(child)))
        );

        if (nonInlineChildren.length > 0) {
          const result = this.layoutNodesWithInlineState(
            nonInlineChildren,
            x,
            y,
            line,
            words,
            elements,
            inheritedStyleForChildren,
            false
          );
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
          words,
          elements,
          inheritedStyleForChildren,
          isInlineTextContinuation
        );
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
      x = this.theme.paddingX;
      y += this.getLineHeight(currentNodeStyle); // 使用完整行高
    }

    return { x, y, line };
  }

  /**
   * 布局文本 - 兼容性方法
   * 
   * 注意：新架构中，块级元素的内联流处理已经在layoutNode中完成。
   * 此方法主要用于向后兼容和处理单个text节点的情况。
   * 
   * @param {string} text
   * @param {Object} style
   * @param {number} startX
   * @param {number} startY
   * @param {number} startLine
   * @param {Array} words
   * @param {boolean} isInlineTextContinuation - 是否是同一行内联文本的续接部分
   * @returns {Object}
   */
  layoutText(text, style, startX, startY, startLine, words, isInlineTextContinuation = false) {
    // 解析样式属性
    const fontSize =
      this.parseSize(this.getStyleProperty(style, 'fontSize')) ||
      this.theme.baseFontSize;
    const fontWeight = this.getStyleProperty(style, 'fontWeight') || 'normal';
    const fontStyle = this.getStyleProperty(style, 'fontStyle') || 'normal';
    const lineHeight = this.getLineHeight(style);
    const textAlign = this.getStyleProperty(style, 'textAlign') || 'left';
    const textIndent = isInlineTextContinuation ? 0 :
      (this.parseSize(this.getStyleProperty(style, 'textIndent')) || 0);

    // 更新测量上下文的字体
    this.measureCtx.font = `${fontStyle} ${fontWeight} ${fontSize}px ${this.theme.fontFamily}`;

    // 计算可用宽度
    const rightPadding = this.parseSize(this.getStyleProperty(style, 'paddingRight')) || 0;
    const availableWidth = this.canvasWidth - this.theme.paddingX * 2 - rightPadding;

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
      isInlineTextContinuation
    };

    const lines = this.lineBreaker.breakIntoLines(segments, layoutContext, styleMap);

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
      startX
    };

    const styledWords = this.lineStylist.styleLines(lines, styleContext);

    // 将样式化的单词添加到渲染块并收集到words数组
    let finalX = startX;
    let finalY = startY;
    let finalLine = startLine;

    for (const styledWord of styledWords) {
      // 立即添加到渲染块（可能会调整位置）
      const adjustedWord = this.addWordToChunk(styledWord);
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

    // 返回最终位置信息
    return {
      x: finalX,
      y: finalY,
      line: finalLine
    };
  }

  /**
   * 规范化空白符（统一折叠处理）
   * @param {string} text - 原始文本
   * @returns {string} 规范化后的文本
   */
  normalizeWhitespace(text) {
    // 统一的空白符处理：折叠所有连续空白符为单个空格，移除首尾空白
    return text
      .replace(/\s+/g, ' ')  // 折叠所有连续空白符为单个空格
      .trim();               // 移除首尾空白
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
      return parseFloat(trimmedValue) * this.theme.baseFontSize;
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
      return parseFloat(trimmedValue) * this.theme.baseFontSize;
    }

    // 百分比单位（相对于容器宽度）
    if (trimmedValue.endsWith('%')) {
      const percentage = parseFloat(trimmedValue) / 100;
      return this.canvasWidth * percentage;
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
      this.theme.baseFontSize;

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
    this.parsedNodes = null;
    this.container = null;
    this.measureCanvas = null;
    this.measureCtx = null;
    this.onProgressChange = null;

    // 清理数据
    this.renderChunks.clear();
    this.fullLayoutData = null;

    // 清理图片缓存
    this.imageCache.clear();

    window.removeEventListener('resize', this.setupHighDPI.bind(this));
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

}
export default VirtualCanvasRenderer;
