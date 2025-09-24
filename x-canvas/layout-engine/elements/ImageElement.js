/**
 * 图片元素类
 * 替换 imageElement 对象字面量
 */
export class ImageElement {
  constructor({
    type = 'image',
    nodeId,
    x,
    y,
    width,
    height,
    src,
    alt = '',
    originalWidth,
    originalHeight,
    isScaled
  }) {
    this.type = type;
    this.nodeId = nodeId;
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.src = src;
    this.alt = alt;
    this.originalWidth = originalWidth;
    this.originalHeight = originalHeight;
    this.isScaled = isScaled;
  }
}
