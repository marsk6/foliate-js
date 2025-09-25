/**
 * 布局节点类
 */
export default class LayoutNode {
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
