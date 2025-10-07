/**
 * 行盒 - 表示一行内容的容器
 */
export class LineBox {
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