/**
 * 内联流管理器 - 负责收集块级元素内的所有内联内容，形成统一的文本流
 * 这是布局的第0阶段：收集整个内联流，而不是单个text node
 */
import { LayoutEngine } from './LayoutEngine.js';
export class InlineFlowManager {
  constructor(renderer) {
    this.renderer = renderer;
  }

  /**
   * 收集块级元素内的所有内联内容，形成统一的文本流
   * @param {Array} inlineNodes - 同一块级元素下的所有内联节点
   * @returns {Object} 包含segments和styleMap的统一文本流
   */
  collectInlineFlow(inlineNodes) {
    const segments = [];
    const styleMap = new Map(); // 记录每个segment对应的样式

    let globalTextIndex = 0;
    let segmentIndex = 0;

    for (const node of inlineNodes) {
      if (node.type === 'text' || node.type === 'link') {
        // 样式已经在HTMLParser阶段处理了继承，直接使用节点样式
        const nodeStyle = node.style || {};

        // 分割文本为segments（传递样式用于空白符处理）
        const nodeSegments = LayoutEngine.instance.segmentText(node.text, nodeStyle);

        for (const segment of nodeSegments) {
          const globalSegment = {
            ...segment,
            // 调整为全局文本索引
            startIndex: globalTextIndex + segment.startIndex,
            endIndex: globalTextIndex + segment.endIndex,
            textNodeId: node.nodeId, // 使用正确的nodeId字段
            originalSegmentIndex: segmentIndex, // 用于样式映射
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
   * @returns {Array} 内联节点数组
   */
  extractInlineNodes(children) {
    const inlineNodes = [];

    for (const child of children) {
      if (child.type === 'text' || child.type === 'link') {
        inlineNodes.push(child);
      } else if (
        child.type === 'element' &&
        LayoutEngine.instance.isInlineNode(child)
      ) {
        // 内联元素：递归提取其子内容
        // 样式继承已在HTMLParser阶段处理，直接递归提取子节点
        const childInlineNodes = this.extractInlineNodes(
          child.children || []
        );
        inlineNodes.push(...childInlineNodes);
      }
    }

    return inlineNodes;
  }
} 