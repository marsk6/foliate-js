
import { HighlightStorage } from './highlight/storage.js';
import { computeLineRectsFromIndices, filterRectsByYRange } from './highlight/geometry.js';
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

  // 新增：高亮存储
  highlights = new Map(); // 存储所有高亮，key为高亮ID，value为高亮对象
  highlightCounter = 0; // 高亮计数器，用于生成唯一ID

  /**
   * @type {HighlightStorage}
   */
  storage = null;

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
    this.storage = new HighlightStorage(this.renderer?.bookKey || 'default-book');
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

    // 设置点击命中测试
    this.setupHighlightHitTest();
  }

  /**
   * 设置菜单事件监听
   */
  setupMenuEvents() {
    if (!this.selectionMenu) return;

    this.selectionMenu.addEventListener('touchstart', (e) => {
      e.stopPropagation();
      e.preventDefault();
      const action = e.target.dataset.action;
      this.handleMenuAction(action);
      this.hideSelectionMenu();
    });

    this.selectionMenu.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
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
    const selection = this.getSelection();
    switch (action) {
      case 'copy':
        if (this.activeHighlightId) {
          const h = this.highlights.get(this.activeHighlightId);
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
              opacity: 0.3
            }
          });
          // 清除选择状态
          this.handleTouch();

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
    if (!this.selectionMenu || this.startIdx == null || this.endIdx == null)
      return;

    if (!this.renderer.fullLayoutData || !this.renderer.fullLayoutData.words)
      return;

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

  getSelection() {
    return this.selection;
  }

  handleTouch(e) {
    if (this.isSelecting) {
      this.isSelecting = false;
      this.startIdx = null;
      this.endIdx = null;
      this.selection = { range: null };
      this.updateHighlightBar();
      this.updateAnchors();
      this.hideSelectionMenu();
      window.native.postMessage('webviewTouch');
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

    // 合并并持久化当前章节高亮
    this.mergeAndPersistChapterHighlights(highlight.position.chapterIndex, [highlight]);
    return id;
  }

  /**
   * 获取所有高亮
   * @returns {Array} 高亮数组
   */
  getAllHighlights() {
    return Array.from(this.highlights.values());
  }

  /**
   * 移除高亮
   * @param {string} highlightId 高亮ID
   */
  removeHighlight(highlightId) {
    const ok = this.highlights.delete(highlightId);
    if (ok) this.persistAllHighlights();
    this.triggerCanvasRerender();
    return ok;
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
      return this.getIndexRangeByWordIds(highlightPosition.startWordId, highlightPosition.endWordId);
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
      canvasInfoList.forEach(canvasInfo => {
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
    // 当前章节筛选
    const currentChapter = this.renderer.chapterIndex;
    const highlights = this.getAllHighlights().filter(h => h?.position?.chapterIndex === currentChapter);
    canvasInfo.highlightRects = [];
    highlights.forEach((highlight) => {
      const indexRange = this.getHighlightIndexRange(highlight.position);
      if (!indexRange) return;
      const { startIdx, endIdx } = indexRange;
      if (startIdx == null || endIdx == null) return;
      const rects = computeLineRectsFromIndices(words, startIdx, endIdx, this.renderer.theme);
      const visibleRects = filterRectsByYRange(rects, contentStartY, contentEndY);
      // 绘制可见部分，并记录命中区域（使用内容坐标）
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
        canvasInfo.highlightRects.push({ ...r, id: highlight.id });
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
    this.highlights = new Map();
    Array.isArray(list) && list.forEach(h => {
      if (h && h.id && h.position) this.highlights.set(h.id, h);
    });
  }

  persistAllHighlights() {
    const list = Array.from(this.highlights.values());
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
    const all = this.getAllHighlights();
    const others = all.filter(h => h?.position?.chapterIndex !== chapterIndex);
    const current = all.filter(h => h?.position?.chapterIndex === chapterIndex);
    const merged = mergeHighlights([...current, ...newHighlights], words, { mergeAdjacent: true });

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
    // 重建 Map
    this.highlights = new Map();
    others.forEach(h => this.highlights.set(h.id, h));
    mergedHighlights.forEach(h => this.highlights.set(h.id, h));

    // 持久化
    this.persistAllHighlights();
    this.triggerCanvasRerender();
  }

  // =====================
  // 命中测试与菜单
  // =====================
  setupHighlightHitTest() {
    const container = this.renderer?.container;
    if (!container) return;
    const onPointer = (evt) => {
      if (this.isSelecting) return; // 正在选择时不触发高亮点击
      // 忽略在菜单上的点击
      if (evt.target && this.selectionMenu && this.selectionMenu.contains(evt.target)) return;
      const point = { x: evt.clientX, y: evt.clientY };
      const contentPoint = this.clientToContentPoint(point);
      const hit = this.findHighlightAt(contentPoint);
      if (hit) {
        evt.preventDefault();
        evt.stopPropagation();
        this.activeHighlightId = hit.id;
        // 使用命中矩形作为菜单锚点
        this.anchors.start = { x: hit.rect.x, y: hit.rect.y };
        this.anchors.end = { x: hit.rect.x + hit.rect.width, y: hit.rect.y };
        this.showSelectionMenu();
      }
    };
    container.addEventListener('pointerdown', onPointer, { passive: false });
    container.addEventListener('click', onPointer, { passive: false });
    container.addEventListener('touchstart', (e) => {
      if (e.touches && e.touches[0]) {
        const t = e.touches[0];
        onPointer({ clientX: t.clientX, clientY: t.clientY, preventDefault: () => e.preventDefault(), stopPropagation: () => e.stopPropagation(), target: e.target });
      }
    }, { passive: false });
  }

  clientToContentPoint(point) {
    const { x: clientX, y: clientY } = point;
    const containerRect = this.renderer.container.getBoundingClientRect();
    const containerX = clientX - containerRect.left;
    const containerY = clientY - containerRect.top;
    const contentX = containerX;
    const contentY = this.renderer.mode === 'vertical'
      ? containerY + this.renderer.viewport.state.scrollTop
      : containerY; // 横向模式可在需要时扩展
    return { x: contentX, y: contentY };
  }

  /**
   * 在所有 Canvas 命中矩形中查找命中高亮
   * @param {{x:number,y:number}} contentPoint
   * @returns {{id:string, rect: {x:number,y:number,width:number,height:number}}|null}
   */
  findHighlightAt(contentPoint) {
    const list = [];
    const canvasInfoList = this.renderer?.viewport?.canvasInfoList || [];
    canvasInfoList.forEach((ci) => {
      const rects = ci.highlightRects || [];
      rects.forEach(r => list.push(r));
    });
    // 从后往前遍历，优先命中最后绘制的（更靠上的）
    for (let i = list.length - 1; i >= 0; i--) {
      const r = list[i];
      if (
        contentPoint.x >= r.x && contentPoint.x <= r.x + r.width &&
        contentPoint.y >= r.y && contentPoint.y <= r.y + r.height
      ) {
        return { id: r.id, rect: r };
      }
    }
    return null;
  }
}
