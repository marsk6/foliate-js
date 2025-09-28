import { HighlightStorage } from './highlight/storage.js';
import {
  computeLineRectsFromIndices,
  computeLineRectsFromIndicesList,
  filterRectsByYRange,
} from './highlight/geometry.js';
import { mergeHighlights } from './highlight/merge.js';

export class CanvasTools {
  static instance = null;
  startIdx = null;
  endIdx = null;
  isSelecting = false;
  /**
   * @type {HTMLDivElement}
   */
  startAnchor = null;
  /**
   * @type {HTMLDivElement}
   */
  endAnchor = null;
  /**
   * @type {HTMLDivElement}
   */
  highlightLayer = null; // 需要获取高亮层元素
  /**
   * @type {HTMLDivElement}
   */
  selectionMenu = null; // 选中菜单元素
  /**
   * @type {import('../virtual-canvas-renderer').VirtualCanvasRenderer}
   */
  renderer = null;

  // 高亮点击/菜单
  activeHighlightId = null;

  // 新增：高亮存储 - 按章节分组
  highlightsByChapter = new Map(); // 存储按章节分组的高亮，key为chapterIndex，value为该章节的高亮Map
  highlightCounter = 0; // 高亮计数器，用于生成唯一ID

  /**
   * @type {HighlightStorage}
   */
  storage = null;

  /**
   * 长按时出现的锚点, { x, y }
   */
  anchors = {
    start: null,
    end: null,
  };

  selection = {
    range: null,
  };

  constructor(renderer) {
    if (CanvasTools.instance) {
      return CanvasTools.instance;
    }
    CanvasTools.instance = this;

    this.renderer = renderer;
    this.storage = new HighlightStorage(
      this.renderer?.bookKey || 'default-book'
    );
    this.createDOMStructure();
  }

  async createDOMStructure() {
    const div = document.createElement('div');
    div.innerHTML = `
      <div class="highlight-layer"></div>
      <div class="anchor start-anchor">
        <div class="anchor-inner">
          <div class="anchor-dot"></div>
          <div class="anchor-line"></div>
        </div>
      </div>
      <div class="anchor end-anchor">
        <div class="anchor-inner">
          <div class="anchor-line"></div>
          <div class="anchor-dot"></div>
        </div>
      </div>
    `;
    const selectionMenu = document.createElement('div');
    selectionMenu.innerHTML = `
        <div class="selection-menu-arrow"></div>
        <div class="selection-menu-content">
          <div class="selection-menu-item" data-action="copy">Copy</div>
          <div class="selection-menu-item" data-action="highlight">Highlight</div>
          <div class="selection-menu-item" data-action="note">Add Note</div>
        </div>
    `;
    selectionMenu.classList.add('selection-menu');
    this.selectionMenu = selectionMenu;
    this.renderer.scrollContent.append(div);
    this.renderer.container.append(selectionMenu);
    await Promise.resolve();
    this.startAnchor = div.querySelector('.start-anchor');
    this.endAnchor = div.querySelector('.end-anchor');
    this.highlightLayer = div.querySelector('.highlight-layer'); // 需要获取高亮层元素

    // 添加菜单项点击事件
    this.setupMenuEvents();

    // 装载持久化高亮并触发一次渲染
    this.loadHighlightsFromStorage();
    this.triggerCanvasRerender();
  }

  /**
   * 设置菜单事件监听
   */
  setupMenuEvents() {
    if (!this.selectionMenu) return;

    this.selectionMenu.addEventListener('tap', (e) => {
      e.stopPropagation();
      const action = e.target.dataset.action;
      this.handleMenuAction(action);
      this.hideSelectionMenu();
    });
  }

  /**
   * 处理菜单动作
   * @param {string} action
   */
  handleMenuAction(action) {
    const selection = this.selection;
    switch (action) {
      case 'copy':
        if (this.activeHighlightId) {
          const h = this.getHighlightById(this.activeHighlightId);
          if (h && h.text && navigator.clipboard) {
            navigator.clipboard.writeText(h.text).catch(console.error);
          }
        } else if (selection.text && navigator.clipboard) {
          navigator.clipboard.writeText(selection.text).catch(console.error);
        }
        break;
      case 'highlight':
        if (selection && selection.text) {
          // 添加划线，使用默认黄色高亮
          const highlightId = this.addHighlight({
            chapterIndex: selection.chapterIndex,
            startWordId: selection.startWordId,
            endWordId: selection.endWordId,
            text: selection.text,
            style: {
              type: 'highlight',
              color: '#FFFF00',
              opacity: 0.3,
            },
          });
          // 清除选择状态
          this.handleTap();

          // 触发重新渲染以显示新高亮
          this.triggerCanvasRerender();
        }
        break;
      case 'note':
        console.log('add note', selection.text);
        // 添加带笔记的划线，使用蓝色
        break;
    }
  }

  /**
   * 显示选中菜单
   */
  showSelectionMenu() {
    if (!this.selectionMenu) return;
    if (!this.renderer.fullLayoutData || !this.renderer.fullLayoutData.words)
      return;

    // 允许以下任一条件显示：
    // 1) 有选择范围；2) 命中已有高亮(activeHighlightId)
    const hasSelection = this.startIdx != null && this.endIdx != null;
    const hasActive = !!this.activeHighlightId;
    if (!hasSelection && !hasActive) return;

    const isSingleLine = this.anchors.start.y === this.anchors.end.y;

    // 根据单行/多行调整箭头样式
    const arrow = this.selectionMenu.querySelector('.selection-menu-arrow');
    this.selectionMenu.style.top = this.anchors.start.y - 12 + 'px';
    this.selectionMenu.style.left = (this.anchors.start?.x || 0) + 'px';
    this.selectionMenu.style.display = 'block';
    this.selectionMenu.style.top = this.anchors.start.y - 38 + 'px';
    if (isSingleLine) {
    } else {
      this.selectionMenu.style.top = this.anchors.start.y - 38 + 'px';
    }
  }

  /**
   * 隐藏选中菜单
   */
  hideSelectionMenu() {
    this.selectionMenu.style.display = 'none';
    this.activeHighlightId = null;
  }

  /**
   * 设置选择锚点
   * @returns {Function} 更新锚点位置的函数
   */
  updateAnchors() {
    const {
      renderer,
      startAnchor,
      endAnchor,
      highlightLayer,
      startIdx,
      endIdx,
    } = this;
    if (!startAnchor || !endAnchor || !highlightLayer) return;

    startAnchor.style.display = 'none';
    endAnchor.style.display = 'none';

    if (startIdx == null || endIdx == null) return;

    const min = Math.min(startIdx, endIdx);
    const max = Math.max(startIdx, endIdx);

    // 检查renderResult是否存在
    if (!renderer.fullLayoutData || !renderer.fullLayoutData.words) return;

    // 按行分组高亮
    let lineMap = {};
    for (let i = min; i <= max; i++) {
      if (i >= renderer.fullLayoutData.words.length) break;
      const l = renderer.fullLayoutData.words[i].line;
      if (!lineMap[l]) lineMap[l] = { start: i, end: i };
      else lineMap[l].end = i;
    }

    const linesArr = Object.values(lineMap);
    const anchorWidth = 10;
    const anchorHeight = 26;
    const anchorDotHeight = 10;

    // 获取高亮条 dom
    const bars = this.highlightLayer.querySelectorAll('.highlight-bar');
    if (linesArr.length > 0 && bars.length > 0) {
      // 首行锚点
      const bar1 = bars[0];
      const bar1Rect = bar1.getBoundingClientRect();
      this.startAnchor.style.display = 'inline-block';
      this.startAnchor.style.height = bar1Rect.height + 'px';
      this.anchors.start = {
        x: parseFloat(bar1.style.left),
        y: parseFloat(bar1.style.top),
      };
      this.startAnchor.style.left = this.anchors.start.x + 'px';
      this.startAnchor.style.top = this.anchors.start.y + 'px';
    }

    if (linesArr.length > 0 && bars.length > 0) {
      // 末行锚点
      const bar2 = bars[bars.length - 1];
      const bar2Rect = bar2.getBoundingClientRect();
      this.endAnchor.style.display = 'inline-block';
      this.endAnchor.style.height = bar2Rect.height + 'px';
      // NOTE: 因为锚点条和圆点是居中布局
      this.anchors.end = {
        x: parseFloat(bar2.style.left) + bar2Rect.width,
        y: parseFloat(bar2.style.top),
      };
      this.endAnchor.style.left = this.anchors.end.x + 'px';
      this.endAnchor.style.top = this.anchors.end.y + 'px';
    }
  }

  updateHighlightBar() {
    const { renderer, highlightLayer, startIdx, endIdx } = this;
    highlightLayer.innerHTML = '';
    if (startIdx == null || endIdx == null) return;

    // 创建 range 对象用于 getCFI
    const min = Math.min(startIdx, endIdx);
    const max = Math.max(startIdx, endIdx);

    // 从字符位置数据中获取选中的文本
    const charPos = renderer.fullLayoutData.words;
    let selectedText = '';
    for (let i = min; i <= max; i++) {
      if (i < charPos.length) {
        selectedText += charPos[i].text;
      }
    }

    // 创建一个伪造的 range 对象，包含 getCFI 需要的信息
    const range = {
      toString: () => selectedText,
      startContainer: document.body, // 使用 body 作为容器
      endContainer: document.body,
      startOffset: min, // 使用章节内相对位置
      endOffset: max, // 使用章节内相对位置
      collapsed: min === max,
      commonAncestorContainer: document.body,
      // 添加必要的方法
      getBoundingClientRect: () => {
        // 计算选中区域的边界矩形
        if (min >= charPos.length || max >= charPos.length) {
          return { left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 };
        }
        const startChar = charPos[min];
        const endChar = charPos[max];
        return {
          left: Math.min(startChar.x, endChar.x),
          top: Math.min(startChar.y, endChar.y),
          right: Math.max(startChar.x, endChar.x),
          bottom: Math.max(startChar.y, endChar.y),
          width: Math.abs(endChar.x - startChar.x),
          height: Math.abs(endChar.y - startChar.y),
        };
      },
      // 添加全局位置信息（用于调试和其他用途）
      _globalStartOffset: min,
      _globalEndOffset: max,
    };

    // 获取起始和结束词的wordId
    const startWordId = charPos[min] ? charPos[min].wordId : null;
    const endWordId = charPos[max] ? charPos[max].wordId : null;

    this.selection = {
      range: range,
      text: selectedText,
      startIdx: min,
      endIdx: max,
      startWordId: startWordId,
      endWordId: endWordId,
      chapterIndex: renderer.chapterIndex, // 添加章节索引
    };

    // 按行分组高亮
    let lineMap = {};
    for (let i = min; i <= max; i++) {
      const l = charPos[i].line;
      if (!lineMap[l]) lineMap[l] = { start: i, end: i };
      else lineMap[l].end = i;
    }

    let offsetTop = 0;
    let offsetLeft = 0;
    if (renderer.mode === 'horizontal') {
      offsetTop = -renderer.canvasHeight * renderer.viewport.state.currentPage;
      offsetLeft = renderer.canvasWidth * renderer.viewport.state.currentPage;
    }

    Object.values(lineMap).forEach(({ start, end }) => {
      const c1 = charPos[start];
      const c2 = charPos[end];
      const bar = document.createElement('div');
      bar.className = 'highlight-bar';
      bar.style.left = c1.x + offsetLeft + 'px';
      bar.style.top = c1.y + offsetTop - renderer.theme.baseFontSize + 2 + 'px';
      bar.style.width = c2.x + c2.width - c1.x + 'px';
      bar.style.height = renderer.theme.baseFontSize + 2 + 'px';
      this.highlightLayer.appendChild(bar);
    });
  }

  handleTap({ x, y } = { x: 0, y: 0 }) {
    if (this.isSelecting) {
      this.isSelecting = false;
      this.startIdx = null;
      this.endIdx = null;
      this.selection = { range: null };
      this.updateHighlightBar();
      this.updateAnchors();
      this.hideSelectionMenu();
      window.native.postMessage('webviewTouch');
    } else {
      this.handleHighlightTap({ x, y });
    }
  }

  handleLongPress(start, end) {
    this.isSelecting = true;
    this.startIdx = this.renderer.getCharIndexAt(start);
    this.endIdx = this.renderer.getCharIndexAt(end);
    this.updateHighlightBar();
    this.updateAnchors();
  }

  handleMovePress(start) {
    if (!this.isSelecting) return;
    requestAnimationFrame(() => {
      this.endIdx = this.renderer.getCharIndexAt(start);
      this.updateHighlightBar();
      this.updateAnchors();
    });
  }

  handleLongPressEnd() {
    requestAnimationFrame(() => {
      this.showSelectionMenu();
    });
  }

  /**
   * @param {Point} point
   * @param {"start" | "end"} type
   */
  handleMoveAnchor(point, type) {
    if (type === 'start') {
      this.startIdx = this.renderer.getCharIndexAt(point);
    } else {
      this.endIdx = this.renderer.getCharIndexAt(point);
    }
    this.hideSelectionMenu();
    requestAnimationFrame(() => {
      this.updateHighlightBar();
      this.updateAnchors();
    });
  }

  handleMoveAnchorEnd() {
    requestAnimationFrame(() => {
      this.showSelectionMenu();
    });
  }

  getAnchorPosition() {
    const anchorDotHeight = 10;
    const startRect = this.startAnchor.getBoundingClientRect();
    const endRect = this.endAnchor.getBoundingClientRect();
    return {
      start: {
        x: startRect.left - startRect.width / 2,
        y: startRect.top - anchorDotHeight,
      },
      end: {
        x: endRect.left - endRect.width / 2,
        y: endRect.top,
      },
    };
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
    this.triggerCanvasRerender();
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
    if (highlightPosition.startWordId && highlightPosition.endWordId) {
      return this.getIndexRangeByWordIds(
        highlightPosition.startWordId,
        highlightPosition.endWordId
      );
    }

    return null;
  }

  /**
   * 触发Canvas重新渲染以显示新的高亮
   * TODO: 获取 canvas ctx 渲染
   */
  triggerCanvasRerender() {
    if (!this.renderer || !this.renderer.viewport) return;

    // 标记所有canvas需要重新渲染
    const { canvasInfoList } = this.renderer.viewport;
    if (canvasInfoList) {
      canvasInfoList.forEach((canvasInfo) => {
        canvasInfo.needsRerender = true;
      });
    }

    // 触发重新渲染
    if (this.renderer.renderMultiCanvas) {
      this.renderer.renderMultiCanvas();
    }
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
      let indicesList = [];
      const pos = highlight.position || {};
      if (Array.isArray(pos.wordIds) && pos.wordIds.length > 0) {
        for (const wid of pos.wordIds) {
          const idx = this.findWordIndexByWordId(wid);
          if (idx != null) indicesList.push(idx);
        }
      } else {
        const indexRange = this.getHighlightIndexRange(pos);
        if (indexRange) {
          const { startIdx, endIdx } = indexRange;
          if (startIdx != null && endIdx != null) {
            const min = Math.max(0, Math.min(startIdx, endIdx));
            const max = Math.min(words.length - 1, Math.max(startIdx, endIdx));
            for (let i = min; i <= max; i++) indicesList.push(i);
          }
        }
      }
      if (indicesList.length === 0) return;

      const rects = computeLineRectsFromIndicesList(
        words,
        indicesList,
        this.renderer.theme
      );
      const visibleRects = filterRectsByYRange(
        rects,
        contentStartY,
        contentEndY
      );

      // 只绘制，不再收集矩形数据
      visibleRects.forEach((r) => {
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
   * 在Canvas上绘制单个划线
   * @param {CanvasRenderingContext2D} ctx
   * @param {Object} highlight 划线对象
   * @param {number} startIdx 起始字符索引
   * @param {number} endIdx 结束字符索引
   * @param {number} offsetY Canvas偏移Y
   */
  drawCanvasHighlight(ctx, highlight, startIdx, endIdx, offsetY) {
    // 已重构：使用 renderCanvasHighlights -> geometry 计算
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
    this.triggerCanvasRerender();
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

  handleHighlightTap({ x, y }) {
    const container = this.renderer?.container;
    if (!container) return;
    if (this.isSelecting) return; // 正在选择时不触发高亮点击

    const contentPoint = this.clientToContentPoint({ x, y });

    // 使用 hitTest 作为唯一的检测方法
    const hitResult = this.hitTest(contentPoint);

    if (hitResult?.highlight) {
      this.activeHighlightId = hitResult.highlight.id;

      // 计算高亮边界框用于菜单定位
      const bounds = this.calculateHighlightBounds(hitResult.allHighlightWords);
      if (bounds) {
        this.anchors.start = { x: bounds.x, y: bounds.y };
        this.anchors.end = { x: bounds.x + bounds.width, y: bounds.y };
        this.showSelectionMenu();
        return;
      }
    }
    this.hideSelectionMenu();
  }

  clientToContentPoint(point) {
    const { x: clientX, y: clientY } = point;
    const containerRect = this.renderer.container.getBoundingClientRect();
    const containerX = clientX - containerRect.left;
    const containerY = clientY - containerRect.top;
    const contentX = containerX;
    const contentY =
      this.renderer.mode === 'vertical'
        ? containerY + this.renderer.viewport.state.scrollTop
        : containerY; // 横向模式可在需要时扩展
    return { x: contentX, y: contentY };
  }
}
