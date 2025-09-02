import { HighlightManager } from './highlight-manager.js';

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
   * @type {import('./virtual-canvas-renderer').VirtualCanvasRenderer}
   */
  renderer = null;
  /**
   * @type {HighlightManager}
   */
  highlightManager = null;

  selection = {
    range: null,
  };

  constructor(renderer) {
    if (CanvasTools.instance) {
      return CanvasTools.instance;
    }
    CanvasTools.instance = this;

    this.renderer = renderer;
    this.createDOMStructure();
    
    // 初始化划线管理器
    this.highlightManager = new HighlightManager(renderer);
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
      <div class="selection-menu">
        <div class="selection-menu-arrow"></div>
        <div class="selection-menu-content">
          <div class="selection-menu-item" data-action="copy">Copy</div>
          <div class="selection-menu-item" data-action="highlight">Highlight</div>
          <div class="selection-menu-item" data-action="note">Add Note</div>
        </div>
      </div>
    `;
    this.renderer.scrollContent.append(div);
    await Promise.resolve();
    this.startAnchor = div.querySelector('.start-anchor');
    this.endAnchor = div.querySelector('.end-anchor');
    this.highlightLayer = div.querySelector('.highlight-layer'); // 需要获取高亮层元素
    this.selectionMenu = div.querySelector('.selection-menu');

    // 添加菜单项点击事件
    this.setupMenuEvents();
  }

  /**
   * 设置菜单事件监听
   */
  setupMenuEvents() {
    if (!this.selectionMenu) return;

    const menuItems = this.selectionMenu.querySelectorAll(
      '.selection-menu-item'
    );
    menuItems.forEach((item) => {
      item.addEventListener('click', (e) => {
        const action = e.target.dataset.action;
        this.handleMenuAction(action);
        this.hideSelectionMenu();
      });
    });

    // 点击其他地方隐藏菜单
    document.addEventListener('click', (e) => {
      if (!this.selectionMenu.contains(e.target) && !this.isSelecting) {
        this.hideSelectionMenu();
      }
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
        if (selection.text && navigator.clipboard) {
          navigator.clipboard.writeText(selection.text).catch(console.error);
        }
        break;
      case 'highlight':
        if (selection && selection.text && this.highlightManager) {
          // 添加划线，使用默认黄色高亮
          const highlight = this.highlightManager.addHighlight(selection, {
            color: '#FFFF00',
            opacity: 0.3,
            type: 'highlight'
          });
          console.log('添加划线:', highlight.id);
        }
        break;
      case 'note':
        if (selection && selection.text && this.highlightManager) {
          // 添加带笔记的划线，使用蓝色
          const note = prompt('请输入笔记内容:');
          if (note !== null) {
            const highlight = this.highlightManager.addHighlight(selection, {
              color: '#87CEEB',
              opacity: 0.3,
              type: 'highlight',
              note: note,
              tags: ['note']
            });
            console.log('添加笔记划线:', highlight.id, note);
          }
        }
        break;
    }
  }

  /**
   * 显示选中菜单
   */
  showSelectionMenu() {
    if (!this.selectionMenu || this.startIdx == null || this.endIdx == null)
      return;

    const min = Math.min(this.startIdx, this.endIdx);
    const max = Math.max(this.startIdx, this.endIdx);

    if (!this.renderer.fullLayoutData || !this.renderer.fullLayoutData.words)
      return;

    // 计算选中的行数
    // TODO: 计算重复
    const lineMap = {};
    for (let i = min; i <= max; i++) {
      if (i >= this.renderer.fullLayoutData.words.length) break;
      const l = this.renderer.fullLayoutData.words[i].line;
      if (!lineMap[l]) lineMap[l] = { start: i, end: i };
      else lineMap[l].end = i;
    }

    const lines = Object.keys(lineMap);
    const isSingleLine = lines.length === 1;

    // 计算菜单位置
    const menuPosition = this.calculateMenuPosition(lineMap, isSingleLine);

    // 设置菜单位置和显示
    this.selectionMenu.style.left = menuPosition.x + 'px';
    this.selectionMenu.style.top = menuPosition.y + 'px';
    this.selectionMenu.classList.add('show');

    // 根据单行/多行调整箭头样式
    const arrow = this.selectionMenu.querySelector('.selection-menu-arrow');
    if (isSingleLine) {
      arrow.classList.add('center-align');
      arrow.classList.remove('left-align');
    } else {
      arrow.classList.add('left-align');
      arrow.classList.remove('center-align');
    }
  }

  /**
   * 隐藏选中菜单
   */
  hideSelectionMenu() {
    if (this.selectionMenu) {
      this.selectionMenu.classList.remove('show');
    }
  }

  /**
   * 计算菜单位置
   * @param {Object} lineMap 行映射
   * @param {boolean} isSingleLine 是否单行
   * @returns {Object} 菜单位置 {x, y}
   */
  calculateMenuPosition(lineMap, isSingleLine) {
    const lines = Object.values(lineMap);
    const menuWidth = 120; // 菜单宽度
    const menuHeight = 100; // 菜单高度
    const arrowHeight = 8; // 箭头高度

    let targetX, targetY;

    if (isSingleLine) {
      // 单行：对齐选中区域中心上方
      const lineData = lines[0];
      const startChar = this.renderer.fullLayoutData.words[lineData.start];
      const endChar = this.renderer.fullLayoutData.words[lineData.end];

      targetX = (startChar.x + endChar.x + endChar.width) / 2 - menuWidth / 2;
      targetY =
        startChar.y -
        this.renderer.theme.baseFontSize -
        menuHeight -
        arrowHeight;
    } else {
      // 多行：对齐第一行左侧上方
      const firstLineData = lines[0];
      const startChar = this.renderer.fullLayoutData.words[firstLineData.start];

      targetX = startChar.x;
      targetY =
        startChar.y -
        this.renderer.theme.baseFontSize -
        menuHeight -
        arrowHeight;
    }

    // 处理模式偏移
    let offsetTop = 0;
    let offsetLeft = 0;
    if (this.renderer.mode === 'horizontal') {
      offsetTop =
        -this.renderer.canvasHeight * this.renderer.viewport.state.currentPage;
      offsetLeft =
        this.renderer.canvasWidth * this.renderer.viewport.state.currentPage;
    }

    // 确保菜单不超出视窗边界
    const containerRect = this.renderer.scrollContent.getBoundingClientRect();
    targetX = Math.max(
      10,
      Math.min(targetX + offsetLeft, containerRect.width - menuWidth - 10)
    );
    targetY = Math.max(10, targetY + offsetTop);

    return { x: targetX, y: targetY };
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
      this.startAnchor.style.left = parseFloat(bar1.style.left) + 'px';
      this.startAnchor.style.top = parseFloat(bar1.style.top) + 'px';
    }

    if (linesArr.length > 0 && bars.length > 0) {
      // 末行锚点
      const bar2 = bars[bars.length - 1];
      const bar2Rect = bar2.getBoundingClientRect();
      this.endAnchor.style.display = 'inline-block';
      this.endAnchor.style.height = bar2Rect.height + 'px';
      // NOTE: 因为锚点条和圆点是居中布局
      this.endAnchor.style.left =
        parseFloat(bar2.style.left) + bar2Rect.width + 'px';
      this.endAnchor.style.top = parseFloat(bar2.style.top) + 'px';
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
      if (i < charPos.length && charPos[i].char) {
        selectedText += charPos[i].char;
      }
    }

    // 获取选中文本的章节索引
    // 使用起始位置的章节索引，如果跨章节，则使用起始章节
    const chapterIndex = renderer.getChapterIndexForChar
      ? renderer.getChapterIndexForChar(min)
      : renderer.currentChapterIndex || 0;

    // 获取在章节内的相对位置（用于创建正确的DOM Range）
    const startRelative = renderer.getRelativeCharIndex
      ? renderer.getRelativeCharIndex(min)
      : { chapterIndex, relativeCharIndex: min };
    const endRelative = renderer.getRelativeCharIndex
      ? renderer.getRelativeCharIndex(max)
      : { chapterIndex, relativeCharIndex: max };

    // 创建一个伪造的 range 对象，包含 getCFI 需要的信息
    const range = {
      toString: () => selectedText,
      startContainer: document.body, // 使用 body 作为容器
      endContainer: document.body,
      startOffset: startRelative.relativeCharIndex, // 使用章节内相对位置
      endOffset: endRelative.relativeCharIndex, // 使用章节内相对位置
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

    this.selection = {
      range: range,
      text: selectedText,
      startIdx: min,
      endIdx: max,
      chapterIndex: chapterIndex, // 添加章节索引
      // 添加相对位置信息
      relativeStartIdx: startRelative.relativeCharIndex,
      relativeEndIdx: endRelative.relativeCharIndex,
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

  /**
   * 在渲染器重新布局后恢复划线
   */
  restoreHighlights() {
    if (this.highlightManager) {
      // 等待下一帧确保布局完成
      requestAnimationFrame(() => {
        this.highlightManager.restoreHighlights();
      });
    }
  }

  /**
   * 清除所有划线
   */
  clearHighlights() {
    if (this.highlightManager) {
      this.highlightManager.clearAllHighlights();
    }
  }

  /**
   * 获取所有划线
   */
  getAllHighlights() {
    return this.highlightManager ? this.highlightManager.getAllHighlights() : [];
  }

  handleTouch(e) {
    if (this.isSelecting) {
      this.isSelecting = false;
      this.startIdx = null;
      this.endIdx = null;
      this.updateHighlightBar();
      this.updateAnchors();
      this.hideSelectionMenu();
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
}
