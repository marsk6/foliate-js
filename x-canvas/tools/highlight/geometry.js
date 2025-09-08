/**
 * 根据词索引范围，计算每一行的矩形（内容坐标系）
 * @param {Array} words fullLayoutData.words
 * @param {number} startIdx
 * @param {number} endIdx
 * @param {Object} theme { baseFontSize }
 * @returns {Array<{x:number,y:number,width:number,height:number}>}
 */
export function computeLineRectsFromIndices(words, startIdx, endIdx, theme) {
  if (!words || startIdx == null || endIdx == null) return [];
  const min = Math.max(0, Math.min(startIdx, endIdx));
  const max = Math.min(words.length - 1, Math.max(startIdx, endIdx));
  const byLine = new Map();
  for (let i = min; i <= max; i++) {
    const w = words[i];
    if (!w) continue;
    const line = w.line;
    const slot = byLine.get(line);
    if (!slot) byLine.set(line, { start: i, end: i });
    else slot.end = i;
  }
  const result = [];
  byLine.forEach(({ start, end }) => {
    const w1 = words[start];
    const w2 = words[end];
    if (!w1 || !w2) return;
    const height = (theme?.baseFontSize || 18) + 2;
    result.push({
      x: w1.x,
      y: w1.y - (theme?.baseFontSize || 18) + 2,
      width: w2.x + w2.width - w1.x,
      height,
    });
  });
  return result;
}

/**
 * 过滤与可视Y范围相交的矩形
 */
export function filterRectsByYRange(rects, startY, endY) {
  if (!Array.isArray(rects)) return [];
  return rects.filter((r) => r.y + r.height >= startY && r.y <= endY);
}

/**
 * 矩形命中测试
 */
export function rectContainsPoint(rect, x, y) {
  return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
}

/**
 * 计算菜单锚点（使用首段矩形顶部中点）
 */
export function anchorForRects(rects) {
  if (!rects || rects.length === 0) return null;
  const r = rects[0];
  return { x: r.x + r.width / 2, y: r.y - 8 };
}

/**
 * 工具：根据 wordId 查找索引
 */
export function findWordIndexByWordId(words, wordId) {
  if (!Array.isArray(words)) return null;
  for (let i = 0; i < words.length; i++) {
    if (words[i]?.wordId === wordId) return i;
  }
  return null;
}



