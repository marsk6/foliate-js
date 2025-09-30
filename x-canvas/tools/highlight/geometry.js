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

  const isVisible = (w) => {
    if (!w) return false;
    const display = w.style?.display;
    const visibility = w.style?.visibility;
    if (display === 'none' || visibility === 'hidden') return false;
    if (w.hidden === true) return false;
    if (typeof w.width === 'number' && w.width <= 0) return false;
    return true;
  };

  // 按行分割为多个连续可见段
  /** @type {Map<number, Array<{start:number,end:number}>>} */
  const segmentsByLine = new Map();
  for (let i = min; i <= max; i++) {
    const w = words[i];
    if (!w) continue;
    const line = w.line;
    if (!segmentsByLine.has(line)) segmentsByLine.set(line, []);
    const segments = segmentsByLine.get(line);
    const visible = isVisible(w);
    if (!visible) {
      // 结束当前活动段
      const last = segments[segments.length - 1];
      if (last && !last._closed) last._closed = true;
      continue;
    }
    const last = segments[segments.length - 1];
    if (!last || last._closed) {
      segments.push({ start: i, end: i, _closed: false });
    } else {
      last.end = i;
    }
  }

  const height = (theme?.baseFontSize || 18) + 2;
  const result = [];
  segmentsByLine.forEach((segments) => {
    segments.forEach((seg) => {
      const w1 = words[seg.start];
      const w2 = words[seg.end];
      if (!w1 || !w2) return;
      result.push({
        x: w1.x,
        y: w1.y - (theme?.baseFontSize || 18) + 2,
        width: w2.x + w2.width - w1.x,
        height,
      });
    });
  });
  return result;
}

/**
 * 根据词索引范围计算行矩形，并过滤隐藏词
 * @param {Array} words
 * @param {number} startIdx
 * @param {number} endIdx
 * @param {Object} theme
 * @returns {Array<{x:number,y:number,width:number,height:number}>}
 */
export function computeLineRectsFromIndicesList(words, startIdx, endIdx, theme) {
  if (!Array.isArray(words) || startIdx == null || endIdx == null) return [];
  
  const min = Math.max(0, Math.min(startIdx, endIdx));
  const max = Math.min(words.length - 1, Math.max(startIdx, endIdx));
  
  const isVisible = (w) => {
    if (!w) return false;
    const display = w.style?.display;
    const visibility = w.style?.visibility;
    if (display === 'none' || visibility === 'hidden') return false;
    if (w.hidden === true) return false;
    if (typeof w.width === 'number' && w.width <= 0) return false;
    return true;
  };
  
  // 直接按行分段
  const segments = [];
  let current = null;
  
  for (let idx = min; idx <= max; idx++) {
    const w = words[idx];
    
    if (!isVisible(w)) {
      if (current) { segments.push(current); current = null; }
      continue;
    }
    
    if (!current || w.line !== current.line) {
      if (current) segments.push(current);
      current = { line: w.line, start: idx, end: idx };
    } else {
      current.end = idx;
    }
  }
  if (current) segments.push(current);

  const height = (theme?.baseFontSize || 18) + 2;
  const rects = [];
  for (const seg of segments) {
    const w1 = words[seg.start];
    const w2 = words[seg.end];
    if (!w1 || !w2) continue;
    rects.push({
      x: w1.x,
      y: w1.y - (theme?.baseFontSize || 18) + 2,
      width: w2.x + w2.width - w1.x,
      height,
    });
  }
  return rects;
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



