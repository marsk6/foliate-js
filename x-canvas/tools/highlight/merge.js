/**
 * 高亮合并：同章节下，按词索引区间合并相交或相邻（可配置）
 * highlight.position: { chapterIndex, startWordId, endWordId }
 */

function compareByStart(a, b) {
  if (a.startIndex !== b.startIndex) return a.startIndex - b.startIndex;
  return a.endIndex - b.endIndex;
}

/**
 * @param {Array} highlights
 * @param {Array} words
 * @param {Object} options { mergeAdjacent: boolean }
 * @returns {Array}
 */
export function mergeHighlights(highlights, words, options = {}) {
  const { mergeAdjacent = true } = options;
  if (!Array.isArray(highlights) || highlights.length === 0) return [];

  // 需要把 wordId 映射为索引
  const wordIndexById = new Map();
  if (Array.isArray(words)) {
    for (let i = 0; i < words.length; i++) {
      const id = words[i]?.wordId;
      if (id) wordIndexById.set(id, i);
    }
  }

  // 按章节分组
  const byChapter = new Map();
  for (const h of highlights) {
    const { position } = h || {};
    if (!position) continue;
    const chapter = position.chapterIndex ?? 0;
    const startIndex = wordIndexById.get(position.startWordId);
    const endIndex = wordIndexById.get(position.endWordId);
    if (startIndex == null || endIndex == null) continue;
    const norm = {
      ...h,
      _chapter: chapter,
      startIndex: Math.min(startIndex, endIndex),
      endIndex: Math.max(startIndex, endIndex),
    };
    const list = byChapter.get(chapter) || [];
    list.push(norm);
    byChapter.set(chapter, list);
  }

  // 对每个章节内排序并合并
  const merged = [];
  byChapter.forEach((list) => {
    list.sort(compareByStart);
    let current = null;
    for (const h of list) {
      if (!current) {
        current = { ...h };
        continue;
      }
      const overlap = h.startIndex <= current.endIndex;
      const adjacent = mergeAdjacent && h.startIndex === current.endIndex + 1;
      const sameStyle = JSON.stringify(h.style || {}) === JSON.stringify(current.style || {});
      if ((overlap || adjacent) && sameStyle) {
        current.endIndex = Math.max(current.endIndex, h.endIndex);
        // 文本可拼接（可选）：省略，避免大内存
      } else {
        merged.push(current);
        current = { ...h };
      }
    }
    if (current) merged.push(current);
  });

  // 去掉内部字段
  return merged.map((h) => {
    const { _chapter, startIndex, endIndex, ...rest } = h;
    // 保留 wordIds：用于隐藏文本时保留可见交集
    const wordIds = [];
    for (let i = startIndex; i <= endIndex; i++) {
      const wid = words[i]?.wordId;
      if (wid) wordIds.push(wid);
    }
    return { ...rest, startIndex, endIndex, position: { ...rest.position, wordIds } };
  });
}



