/**
 * 样式化单词类
 * 替换 styledWord 对象字面量
 */
export class StyledWord {
  constructor({
    wordId,
    x,
    y,
    width,
    height,
    line,
    text,
    type,
    style,
    startIndex,
    endIndex
  }) {
    this.wordId = wordId;
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.line = line;
    this.text = text;
    this.type = type;
    this.style = style;
    this.startIndex = startIndex;
    this.endIndex = endIndex;
  }
}
