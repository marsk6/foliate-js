/**
 * 行样式处理器 - 负责处理行内的样式、对齐和定位
 * 这是布局的第二阶段：在确定的行内应用样式映射
 */
import { LayoutEngine } from './LayoutEngine.js';
import WordNode from './nodes/WordNode.js';
export class LineStylist {
  constructor(renderer) {
    this.renderer = renderer;
    this.measureCtx = renderer.measureCtx;
  }

  /**
   * 为行盒应用样式和定位（支持样式映射）
   * @param {Array<LineBox>} lines - 行盒数组
   * @param {Map} styleMap - segment索引到样式的映射
   * @param {Object} layoutContext - 布局上下文
   * @param {string} nodeId - text node ID，用于生成wordId
   * @returns {Array} 样式化的单词数组
   */
  applyStylesToLines(lines, styleMap, layoutContext, nodeId = null) {
    const {
      textAlign = 'left',
      startY,
      startLine,
      isInlineTextContinuation = false,
      availableWidth,
      startX,
      textIndent = 0,
    } = layoutContext;

    const styledWords = [];
    let currentLineNumber = startLine;
    const wordIndexByNodeId = new Map(); // 为每个nodeId维护独立的word索引

    // 预计算每行的行高（可能包含不同字体大小）
    const lineMetrics = this.calculateLineMetrics(lines, styleMap);

    let currentY = startY;
    if (!isInlineTextContinuation) {
      // 使用第一行的基线作为起始位置
      const firstLineHeight =
        lineMetrics[0]?.lineHeight ||
        this.renderer.theme.baseFontSize * this.renderer.theme.lineHeight;
      const baseline = LayoutEngine.instance.getTextBaseline(firstLineHeight);
      currentY = startY + baseline;
    }

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];
      const lineMetric = lineMetrics[lineIndex];

      // 计算文本对齐的偏移量（基于已有位置进行调整）
      let alignmentOffsetX = 0;
      let justifySpaceDistribution = new Map(); // 用于存储每个空格应该增加的宽度

      if (
        textAlign === 'center' ||
        textAlign === 'right' ||
        textAlign === 'justify'
      ) {
        // 重新计算行的实际宽度
        let lineWidth = 0;
        for (let i = 0; i < line.segments.length; i++) {
          const segment = line.segments[i];
          const segmentStyle = styleMap.get(segment.originalSegmentIndex) || {};
          const fontSize =
            LayoutEngine.instance.parseSize(
              LayoutEngine.instance.getStyleProperty(segmentStyle, 'fontSize')
            ) || this.renderer.theme.baseFontSize;
          const fontWeight =
            LayoutEngine.instance.getStyleProperty(segmentStyle, 'fontWeight') ||
            'normal';
          const fontStyle =
            LayoutEngine.instance.getStyleProperty(segmentStyle, 'fontStyle') ||
            'normal';

          this.measureCtx.font = `${fontStyle} ${fontWeight} ${fontSize}px ${this.renderer.theme.fontFamily}`;
          lineWidth += this.measureCtx.measureText(segment.content).width;
        }

        const contentWidth =
          availableWidth - (line.isFirstLine ? textIndent : 0);
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
              const additionalSpacePerGap =
                remainingSpace / spaceSegments.length;
              spaceSegments.forEach((segmentIndex) => {
                justifySpaceDistribution.set(
                  segmentIndex,
                  additionalSpacePerGap
                );
              });
            }
          }
        }
      }

      // 计算两端对齐时的累积偏移
      let justifyOffsetX = 0;

      for (
        let segmentIndex = 0;
        segmentIndex < line.segments.length;
        segmentIndex++
      ) {
        const segment = line.segments[segmentIndex];
        const position = line.positions[segmentIndex];

        // 获取该segment的样式
        const segmentStyle = styleMap.get(segment.originalSegmentIndex) || {};

        // 解析样式属性
        const fontSize =
          LayoutEngine.instance.parseSize(
            LayoutEngine.instance.getStyleProperty(segmentStyle, 'fontSize')
          ) || this.renderer.theme.baseFontSize;
        const fontWeight =
          LayoutEngine.instance.getStyleProperty(segmentStyle, 'fontWeight') ||
          'normal';
        const fontStyle =
          LayoutEngine.instance.getStyleProperty(segmentStyle, 'fontStyle') || 'normal';
        const color =
          LayoutEngine.instance.getStyleProperty(segmentStyle, 'color') ||
          this.renderer.theme.textColor;

        // 设置测量上下文字体
        this.measureCtx.font = `${fontStyle} ${fontWeight} ${fontSize}px ${this.renderer.theme.fontFamily}`;
        const segmentWidth = this.measureCtx.measureText(segment.content).width;

        // 计算最终的X位置（包含对齐偏移和两端对齐偏移）
        let finalX = position.x + alignmentOffsetX + justifyOffsetX;

        // 如果是空格且需要两端对齐，则增加额外的宽度
        let finalWidth = segmentWidth;
        if (
          segment.type === 'space' &&
          justifySpaceDistribution.has(segmentIndex)
        ) {
          const additionalSpace = justifySpaceDistribution.get(segmentIndex);
          finalWidth += additionalSpace;
          // 这个空格之后的所有段都需要增加相应的偏移
          justifyOffsetX += additionalSpace;
        }

        // 为每个textNodeId维护独立的wordIndex
        const textNodeId = segment.textNodeId;
        const currentWordIndex = wordIndexByNodeId.get(textNodeId) || 0;
        wordIndexByNodeId.set(textNodeId, currentWordIndex + 1);

        // 使用 LineBreaker 计算的位置 + 对齐偏移 + 两端对齐偏移
        const styledWord = new WordNode({
          wordId: `${textNodeId}_${currentWordIndex}`, // wordId格式: textNodeId_wordIndex
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
        });
        styledWords.push(styledWord);
      }

      // 准备下一行
      if (lineIndex < lines.length - 1) {
        currentLineNumber++;
        const nextY = currentY + lineMetric.lineHeight;

        // 检查下一行是否会跨越视口边界
        currentY = this.adjustYForViewportBoundary(nextY, lineMetric.lineHeight);
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
    return lines.map((line) => {
      let maxFontSize = this.renderer.theme.baseFontSize;
      let maxLineHeight = maxFontSize * this.renderer.theme.lineHeight;

      // 找到行内最大的字体大小和行高
      for (const segment of line.segments) {
        const segmentStyle = styleMap.get(segment.originalSegmentIndex) || {};
        const fontSize =
          LayoutEngine.instance.parseSize(
            LayoutEngine.instance.getStyleProperty(segmentStyle, 'fontSize')
          ) || this.renderer.theme.baseFontSize;
        const lineHeight = LayoutEngine.instance.getLineHeight(segmentStyle);

        if (fontSize > maxFontSize) {
          maxFontSize = fontSize;
        }
        if (lineHeight > maxLineHeight) {
          maxLineHeight = lineHeight;
        }
      }

      return {
        maxFontSize,
        lineHeight: maxLineHeight,
      };
    });
  }

  /**
   * styleLines方法
   */
  styleLines(lines, styleContext, nodeId = null) {
    // 创建简单的样式映射（所有segment使用相同样式）
    const styleMap = new Map();
    let segmentIndex = 0;

    for (const line of lines) {
      for (const segment of line.segments) {
        styleMap.set(segmentIndex, styleContext.style || {});
        segmentIndex++;
      }
    }

    return this.applyStylesToLines(lines, styleMap, styleContext, nodeId);
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

  /**
   * 检查并调整Y坐标以避免跨越视口边界
   * @param {number} nextY - 计算出的下一行Y坐标
   * @param {number} lineHeight - 当前行高
   * @returns {number} 调整后的Y坐标
   */
  adjustYForViewportBoundary(nextY, lineHeight) {
    // 获取LayoutEngine实例以访问边界调整设置
    const layoutEngine = LayoutEngine.instance;

    if (!layoutEngine || !layoutEngine.adjustCrossChunkContent) {
      return nextY;
    }

    const viewportHeight = layoutEngine.viewportHeight;
    const baseline = layoutEngine.getTextBaseline(lineHeight);

    // 计算文字区域的top和bottom位置
    const textTop = nextY - baseline;
    const textBottom = textTop + lineHeight;

    // 计算当前所在的视口块
    const currentChunkIndex = Math.floor(textTop / viewportHeight);
    const chunkBottom = (currentChunkIndex + 1) * viewportHeight;

    // 检查文字是否会跨越视口底部边界
    if (textBottom > chunkBottom && textTop < chunkBottom) {
      // 需要调整到下一个视口块
      const nextChunkStart = chunkBottom;
      const topPadding = this.renderer.theme.paddingX || 16;

      // 计算新的Y坐标：下一个块开始 + 顶部间距 + 基线偏移
      return nextChunkStart + topPadding + baseline;
    }

    return nextY;
  }
} 