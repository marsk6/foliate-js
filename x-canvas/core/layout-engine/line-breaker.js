import { LineBox } from './line-box.js';
import { LayoutEngine } from './LayoutEngine.js';

/**
 * 行分割器 - 负责将统一的文本流按照可用宽度分行
 * 这是布局的第一阶段：确定哪些内容在同一行
 */
export class LineBreaker {
  constructor(renderer) {
    this.renderer = renderer;
    this.measureCtx = renderer.measureCtx;

    // 定义不能出现在行首的英语标点符号
    this.englishEndPunctuation = new Set([
      ',',
      '.',
      ';',
      ':',
      '?',
      '!',
      ')',
      ']',
      '}',
      '»',
      '"',
      "'",
      '…',
    ]);

    // 定义不能出现在行末的英语标点符号
    this.englishStartPunctuation = new Set(['(', '[', '{', '«', '"', "'"]);
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
      isInlineTextContinuation = false,
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
        const fontSize =
          LayoutEngine.instance.parseSize(
            LayoutEngine.instance.getStyleProperty(segmentStyle, 'fontSize')
          ) || this.renderer.theme.baseFontSize;
        const fontWeight =
          LayoutEngine.instance.getStyleProperty(segmentStyle, 'fontWeight') ||
          'normal';
        const fontStyle =
          LayoutEngine.instance.getStyleProperty(segmentStyle, 'fontStyle') || 'normal';

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
          const backtrackCount = this.findBacktrackCount(
            currentLine.segments,
            segment
          );

          if (backtrackCount > 0) {
            // 从当前行移除需要回溯的段
            const backtrackSegments = currentLine.segments.splice(
              -backtrackCount
            );
            const backtrackPositions = currentLine.positions.splice(
              -backtrackCount
            );

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
              if (
                styleMap &&
                backtrackSegment.originalSegmentIndex !== undefined
              ) {
                const segmentStyle =
                  styleMap.get(backtrackSegment.originalSegmentIndex) || {};
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
                backtrackWidth = this.measureCtx.measureText(
                  backtrackSegment.content
                ).width;
              } else {
                backtrackWidth = this.measureCtx.measureText(
                  backtrackSegment.content
                ).width;
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
  shouldBreakBefore(
    segment,
    segmentWidth,
    currentX,
    rightBoundary,
    willExceedBoundary,
    allSegments,
    currentIndex
  ) {
    // 如果不会超出边界，无需换行
    if (!willExceedBoundary) {
      return { shouldBreak: false, skipSegment: false, needBacktrack: false };
    }

    // 通过比较可用宽度来判断是否已有内容在当前行
    // 如果 currentX 接近 startX 或 startX + textIndent，说明是行首
    const availableWidthFromCurrentPos = rightBoundary - currentX;
    const totalAvailableWidth = rightBoundary - this.renderer.theme.paddingX; // 总可用宽度
    const hasContentInLine =
      availableWidthFromCurrentPos < totalAvailableWidth * 0.95; // 有5%容差

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
            needBacktrack: true,
          };
        } else {
          // 如果是行首，强制放置以避免无限循环
          return {
            shouldBreak: false,
            skipSegment: false,
            needBacktrack: false,
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
