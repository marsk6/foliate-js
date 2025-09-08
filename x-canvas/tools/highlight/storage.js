// 简单的本地存储实现，可被宿主替换
export class HighlightStorage {
  /**
   * @param {string} bookKey 存储命名空间（通常为书籍ID）
   */
  constructor(bookKey) {
    this.bookKey = bookKey || 'default-book';
    this.storageKey = `xcanvas:highlights:${this.bookKey}`;
  }

  /**
   * 读取全部高亮
   * @returns {Array}
   */
  load() {
    try {
      const raw = (typeof localStorage !== 'undefined')
        ? localStorage.getItem(this.storageKey)
        : null;
      if (!raw) return [];
      const list = JSON.parse(raw);
      return Array.isArray(list) ? list : [];
    } catch (e) {
      console.error('[HighlightStorage] load error', e);
      return [];
    }
  }

  /**
   * 覆盖式保存全部高亮
   * @param {Array} highlights
   */
  save(highlights) {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(this.storageKey, JSON.stringify(highlights || []));
      }
      // 如有宿主桥接，可在此同步：window.native.postMessage(JSON.stringify(...))
    } catch (e) {
      console.error('[HighlightStorage] save error', e);
    }
  }

  /**
   * 新增或更新单个高亮
   * @param {Object} highlight
   */
  upsert(highlight) {
    const list = this.load();
    const idx = list.findIndex(h => h.id === highlight.id);
    if (idx >= 0) list[idx] = highlight; else list.push(highlight);
    this.save(list);
  }

  /**
   * 按ID删除
   * @param {string} id
   */
  removeById(id) {
    const list = this.load();
    const next = list.filter(h => h.id !== id);
    this.save(next);
  }
}



