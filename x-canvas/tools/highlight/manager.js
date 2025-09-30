import { HighlightStorage } from './storage.js';
import {
  computeLineRectsFromIndices,
  computeLineRectsFromIndicesList,
  filterRectsByYRange,
} from './geometry.js';
import { mergeHighlights } from './merge.js';

export class HighlightManager {
  constructor(renderer) {
    this.renderer = renderer;
    this.storage = new HighlightStorage(
      this.renderer?.bookKey || 'default-book'
    );
    
    // 高亮点击/菜单
    this.activeHighlightId = null;

    // 新增：高亮存储 - 按章节分组
    this.highlightsByChapter = new Map(); // 存储按章节分组的高亮，key为chapterIndex，value为该章节的高亮Map
    this.highlightCounter = 0; // 高亮计数器，用于生成唯一ID

    // 加载持久化的高亮数据
    this.loadHighlightsFromStorage();
  }

  /**
   * 添加新的高亮
   * @param {Object} highlightData 高亮数据 {startWordId, endWordId, text, style}
   * @returns {string} 高亮ID
   */
  addHighlight(highlightData) {
    const id = this.generateHighlightId();
    const highlight = {
      id,
      position: {
        chapterIndex: highlightData.chapterIndex ?? this.renderer.chapterIndex,
        startWordId: highlightData.startWordId,
        endWordId: highlightData.endWordId,
      },
      text: highlightData.text,
      style: highlightData.style || {
        type: 'highlight',
        color: '#FFFF00',
        opacity: 0.3,
      },
    };

    // 为相关的 words 设置 highlightId（临时）
    this.updateWordsHighlightId(highlight.position, id);

    // 合并并持久化当前章节高亮
    this.mergeAndPersistChapterHighlights(highlight.position.chapterIndex, [
      highlight,
    ]);
    return id;
  }

  /**
   * 更新相关 words 的 highlightId
   * @param {Object} position {chapterIndex, startWordId, endWordId}
   * @param {string} highlightId 高亮ID
   */
  updateWordsHighlightId(position, highlightId) {
    const words = this.renderer?.fullLayoutData?.words || [];
    if (!words.length) return;

    // 查找起始和结束索引
    let startIndex = null,
      endIndex = null;
    for (let i = 0; i < words.length; i++) {
      if (words[i]?.wordId === position.startWordId) startIndex = i;
      if (words[i]?.wordId === position.endWordId) endIndex = i;
      if (startIndex !== null && endIndex !== null) break;
    }

    if (startIndex === null || endIndex === null) return;

    // 确保顺序正确
    const min = Math.min(startIndex, endIndex);
    const max = Math.max(startIndex, endIndex);

    // 为范围内的所有 words 设置 highlightId
    for (let i = min; i <= max; i++) {
      if (words[i]) {
        words[i].highlightId = highlightId;
      }
    }
  }

  /**
   * 清除 words 中的 highlightId
   * @param {string} highlightId 要清除的高亮ID
   */
  clearWordsHighlightId(highlightId) {
    const words = this.renderer?.fullLayoutData?.words || [];
    for (let i = 0; i < words.length; i++) {
      if (words[i] && words[i].highlightId === highlightId) {
        words[i].highlightId = null;
      }
    }
  }

  /**
   * 获取指定章节的高亮Map
   * @param {number} chapterIndex 章节索引
   * @returns {Map} 该章节的高亮Map
   */
  getChapterHighlights(chapterIndex) {
    if (!this.highlightsByChapter.has(chapterIndex)) {
      this.highlightsByChapter.set(chapterIndex, new Map());
    }
    return this.highlightsByChapter.get(chapterIndex);
  }

  /**
   * 获取所有高亮
   * @returns {Array} 高亮数组
   */
  getAllHighlights() {
    const allHighlights = [];
    this.highlightsByChapter.forEach((chapterMap) => {
      allHighlights.push(...Array.from(chapterMap.values()));
    });
    return allHighlights;
  }

  /**
   * 获取当前章节的所有高亮
   * @returns {Array} 当前章节的高亮数组
   */
  getCurrentChapterHighlights() {
    const currentChapter = this.renderer?.chapterIndex ?? 0;
    const chapterMap = this.highlightsByChapter.get(currentChapter);
    return chapterMap ? Array.from(chapterMap.values()) : [];
  }

  /**
   * 根据ID获取高亮（从指定章节或所有章节查找）
   * @param {string} highlightId 高亮ID
   * @param {number} [chapterIndex] 可选的章节索引，如果提供则只在该章节查找
   * @returns {object|null} 高亮对象
   */
  getHighlightById(highlightId, chapterIndex) {
    if (chapterIndex !== undefined) {
      const chapterMap = this.highlightsByChapter.get(chapterIndex);
      return chapterMap?.get(highlightId) || null;
    }

    // 在所有章节中查找
    for (const [, chapterMap] of this.highlightsByChapter) {
      const highlight = chapterMap.get(highlightId);
      if (highlight) return highlight;
    }
    return null;
  }

  /**
   * 向指定章节添加高亮
   * @param {number} chapterIndex 章节索引
   * @param {object} highlight 高亮对象
   */
  addHighlightToChapter(chapterIndex, highlight) {
    const chapterMap = this.getChapterHighlights(chapterIndex);
    chapterMap.set(highlight.id, highlight);
  }

  /**
   * 从指定章节删除高亮
   * @param {number} chapterIndex 章节索引
   * @param {string} highlightId 高亮ID
   * @returns {boolean} 是否成功删除
   */
  removeHighlightFromChapter(chapterIndex, highlightId) {
    const chapterMap = this.highlightsByChapter.get(chapterIndex);
    return chapterMap ? chapterMap.delete(highlightId) : false;
  }

  /**
   * 移除高亮
   * @param {string} highlightId 高亮ID
   * @param {number} [chapterIndex] 可选的章节索引，如果未提供则在所有章节中查找
   */
  removeHighlight(highlightId, chapterIndex) {
    let removed = false;

    if (chapterIndex !== undefined) {
      // 从指定章节删除
      removed = this.removeHighlightFromChapter(chapterIndex, highlightId);
    } else {
      // 从所有章节中查找并删除
      for (const [chapter, chapterMap] of this.highlightsByChapter) {
        if (chapterMap.delete(highlightId)) {
          removed = true;
          break;
        }
      }
    }

    if (removed) {
      // 清理 words 中的 highlightId
      this.clearWordsHighlightId(highlightId);
      this.persistAllHighlights();
    }
    return removed;
  }

  /**
   * 根据wordId查找word在words数组中的索引
   * @param {string} wordId 格式：nodeId_wordIndex
   * @returns {number|null} word索引，如果未找到返回null
   */
  findWordIndexByWordId(wordId) {
    if (!this.renderer.fullLayoutData || !this.renderer.fullLayoutData.words) {
      return null;
    }

    const words = this.renderer.fullLayoutData.words;
    for (let i = 0; i < words.length; i++) {
      if (words[i].wordId === wordId) {
        return i;
      }
    }
    return null;
  }

  /**
   * 根据wordId范围获取对应的索引范围
   * @param {string} startWordId
   * @param {string} endWordId
   * @returns {Object|null} {startIdx, endIdx} 或 null
   */
  getIndexRangeByWordIds(startWordId, endWordId) {
    const startIdx = this.findWordIndexByWordId(startWordId);
    const endIdx = this.findWordIndexByWordId(endWordId);

    if (startIdx === null || endIdx === null) {
      return null;
    }

    return { startIdx, endIdx };
  }

  /**
   * 根据highlight position获取索引范围
   * @param {Object} highlightPosition
   * @returns {Object|null}
   */
  getHighlightIndexRange(highlightPosition) {
    // 使用wordId获取索引范围
    if (highlightPosition.position.startWordId && highlightPosition.position.endWordId) {
      return this.getIndexRangeByWordIds(
        highlightPosition.position.startWordId,
        highlightPosition.position.endWordId
      );
    }

    return null;
  }

  /**
   * 渲染Canvas中的高亮
   * @param {CanvasRenderingContext2D} ctx - Canvas上下文
   * @param {number} contentStartY - 内容起始Y坐标
   * @param {number} contentEndY - 内容结束Y坐标
   */
  renderCanvasHighlights(ctx, canvasInfo) {
    const { contentStartY, contentEndY } = canvasInfo;
    const words = this.renderer?.fullLayoutData?.words;
    if (!words) return;

    // 直接获取当前章节的高亮
    const highlights = this.getCurrentChapterHighlights();

    highlights.forEach((highlight) => {
      const indexRange = this.getHighlightIndexRange(highlight);
      if (!indexRange) return;
      
      const { startIdx, endIdx } = indexRange;
      if (startIdx == null || endIdx == null) return;
      const rects = computeLineRectsFromIndicesList(
        words,
        startIdx,
        endIdx,
        this.renderer.theme
      );

      // 只绘制，不再收集矩形数据
      rects.forEach((r) => {
        this.drawHighlightShape(
          ctx,
          {
            x: r.x,
            y: r.y - contentStartY,
            width: r.width,
            height: r.height,
          },
          highlight.style
        );
      });
    });
  }

  /**
   * 绘制划线形状
   * @param {CanvasRenderingContext2D} ctx
   * @param {Object} rect 矩形区域 {x, y, width, height}
   * @param {Object} style 样式配置
   */
  drawHighlightShape(ctx, rect, style) {
    const { x, y, width, height } = rect;

    // 设置透明度
    ctx.globalAlpha = style.opacity || 0.3;

    switch (style.type) {
      case 'highlight':
        // 高亮背景
        ctx.fillStyle = style.color || '#FFFF00';
        ctx.fillRect(x, y, width, height);
        break;

      case 'underline':
        // 下划线
        ctx.strokeStyle = style.color || '#0000FF';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, y + height);
        ctx.lineTo(x + width, y + height);
        ctx.stroke();
        break;

      case 'strikethrough':
        // 删除线
        ctx.strokeStyle = style.color || '#FF0000';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, y + height / 2);
        ctx.lineTo(x + width, y + height / 2);
        ctx.stroke();
        break;
    }

    // 恢复透明度
    ctx.globalAlpha = 1.0;
  }

  // =====================
  // 高亮存储与合并
  // =====================
  loadHighlightsFromStorage() {
    const list = this.storage.load();
    this.highlightsByChapter = new Map();

    if (Array.isArray(list)) {
      list.forEach((h) => {
        if (h && h.id && h.position && h.position.chapterIndex !== undefined) {
          const chapterIndex = h.position.chapterIndex;
          this.addHighlightToChapter(chapterIndex, h);
          // 初始化 words 的 highlightId
          this.updateWordsHighlightId(h.position, h.id);
        }
      });
    }
  }

  persistAllHighlights() {
    const list = this.getAllHighlights();
    this.storage.save(list);
  }

  generateHighlightId() {
    return `highlight_${this.highlightCounter++}`;
  }

  /**
   * 合并并持久化指定章节的高亮
   * @param {number} chapterIndex
   * @param {Array} newHighlights 追加的新高亮（可为空）
   */
  mergeAndPersistChapterHighlights(chapterIndex, newHighlights = []) {
    const words = this.renderer?.fullLayoutData?.words || [];

    // 只获取当前章节的高亮
    const currentChapterMap = this.getChapterHighlights(chapterIndex);
    const currentHighlights = Array.from(currentChapterMap.values());

    // 记录合并前的高亮ID，用于清理
    const oldHighlightIds = new Set(currentHighlights.map((h) => h.id));

    // 合并当前章节的高亮和新增高亮
    const merged = mergeHighlights(
      [...currentHighlights, ...newHighlights],
      words,
      { mergeAdjacent: true }
    );

    // 将合并结果索引转换回 wordId，并构建文本
    const toHighlightObj = (h) => {
      const start = words[h.startIndex];
      const end = words[h.endIndex];
      if (!start || !end) return null;
      const id = h.id || this.generateHighlightId();
      let text = '';
      for (let i = h.startIndex; i <= h.endIndex; i++) {
        const w = words[i];
        if (w && typeof w.text === 'string') text += w.text;
      }
      return {
        id,
        position: {
          chapterIndex,
          startWordId: start.wordId,
          endWordId: end.wordId,
        },
        text,
        style: h.style || { type: 'highlight', color: '#FFFF00', opacity: 0.3 },
      };
    };

    const mergedHighlights = merged.map(toHighlightObj).filter(Boolean);

    // 清理旧的 word highlightId
    oldHighlightIds.forEach((id) => {
      this.clearWordsHighlightId(id);
    });

    // 清空当前章节的高亮，重新添加合并后的结果
    currentChapterMap.clear();
    mergedHighlights.forEach((highlight) => {
      currentChapterMap.set(highlight.id, highlight);
      // 为合并后的高亮更新 words 的 highlightId
      this.updateWordsHighlightId(highlight.position, highlight.id);
    });

    // 持久化
    this.persistAllHighlights();
  }

  /**
   * 根据内容坐标进行精确的单词级别命中测试
   * @param {object} contentPoint { x: number, y: number}
   * @returns {{word: object, highlight: object, allHighlightWords: Array}|null}
   */
  hitTest(contentPoint) {
    const words = this.renderer?.fullLayoutData?.words;
    if (!words || !Array.isArray(words)) return null;

    // 使用 renderer 的方法直接获取 wordIndex
    const wordIndex = this.renderer.getCharIndexAt(contentPoint);
    if (wordIndex == null || wordIndex < 0 || wordIndex >= words.length) {
      return null;
    }

    const word = words[wordIndex];
    if (!word) return null;

    // 如果该 word 有高亮ID，返回相关信息
    if (word.highlightId) {
      const highlight = this.getHighlightById(word.highlightId);
      if (highlight) {
        // 获取该高亮的所有 words
        const allHighlightWords = this.getWordsForHighlight(word.highlightId);
        return {
          word: word,
          highlight: highlight,
          allHighlightWords: allHighlightWords,
        };
      }
    }

    // 即使没有高亮，也返回 word 信息
    return {
      word: word,
      highlight: null,
      allHighlightWords: [],
    };
  }

  /**
   * 获取指定高亮ID对应的所有 words
   * @param {string} highlightId 高亮ID
   * @returns {Array} words 数组
   */
  getWordsForHighlight(highlightId) {
    const words = this.renderer?.fullLayoutData?.words;
    if (!words || !Array.isArray(words)) return [];

    return words.filter((word) => word && word.highlightId === highlightId);
  }

  /**
   * 计算高亮的边界框
   * @param {Array} highlightWords 高亮相关的 words
   * @returns {{x: number, y: number, width: number, height: number}|null}
   */
  calculateHighlightBounds(highlightWords) {
    if (!highlightWords || highlightWords.length === 0) return null;

    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;

    for (const word of highlightWords) {
      if (word && typeof word.x === 'number' && typeof word.y === 'number') {
        minX = Math.min(minX, word.x);
        minY = Math.min(minY, word.y);
        maxX = Math.max(maxX, word.x + word.width);
        maxY = Math.max(maxY, word.y + word.height);
      }
    }

    if (minX === Infinity) return null;

    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    };
  }

  /**
   * 获取当前活跃高亮的详细信息
   * @returns {{highlight: object, words: Array, bounds: object}|null}
   */
  getActiveHighlightInfo() {
    if (!this.activeHighlightId) return null;

    const highlight = this.getHighlightById(this.activeHighlightId);
    if (!highlight) return null;

    const words = this.getWordsForHighlight(this.activeHighlightId);
    const bounds = this.calculateHighlightBounds(words);

    return {
      highlight: highlight,
      words: words,
      bounds: bounds,
    };
  }

  handleHighlightTap({ x, y }, clientToContentPointFn) {
    const container = this.renderer?.container;
    if (!container) return null;

    const contentPoint = clientToContentPointFn({ x, y });

    // 使用 hitTest 作为唯一的检测方法
    const hitResult = this.hitTest(contentPoint);

    if (hitResult?.highlight) {
      this.activeHighlightId = hitResult.highlight.id;

      // 计算高亮边界框用于菜单定位
      const bounds = this.calculateHighlightBounds(hitResult.allHighlightWords);
      if (bounds) {
        return {
          highlightId: hitResult.highlight.id,
          bounds: bounds,
          highlight: hitResult.highlight,
        };
      }
    }
    
    return null;
  }

  /**
   * 清除活跃的高亮ID
   */
  clearActiveHighlight() {
    this.activeHighlightId = null;
  }
}
