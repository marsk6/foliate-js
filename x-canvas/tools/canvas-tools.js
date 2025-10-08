import { HighlightManager } from './highlight/manager.js';
import { TTSClient } from './tts/tts-client.js';
import './tts/bridge.js'; // 导入 TTS bridge

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
   * @type {import('../virtual-canvas-renderer').TabRender}
   */
  renderer = null;

  /**
   * @type {HighlightManager}
   */
  highlightManager = null;

  /**
   * @type {TTSClient}
   */
  ttsClient = null;

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
    this.highlightManager = new HighlightManager(renderer);
    this.createDOMStructure();

    // 初始化 TTS 客户端
    this.ttsClient = new TTSClient(renderer, this.highlightManager);
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
          <div class="selection-menu-item" data-action="unhighlight">Unhighlight</div>
          <div class="selection-menu-item" data-action="note">Add Note</div>
          <div class="selection-menu-item" data-action="speak">🔊 Speak</div>
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

    // 触发一次渲染
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
        if (this.highlightManager.activeHighlightId) {
          const h = this.highlightManager.getHighlightById(
            this.highlightManager.activeHighlightId
          );
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
          const highlightId = this.highlightManager.addHighlight({
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
      case 'unhighlight':
        // 删除当前活跃的高亮
        if (this.highlightManager.activeHighlightId) {
          this.highlightManager.removeHighlight(
            this.highlightManager.activeHighlightId
          );
          this.highlightManager.clearActiveHighlight();
          // 清除选择状态
          this.handleTap();
        }
        break;
      case 'note':
        console.log('add note', selection.text);
        // 添加带笔记的划线，使用蓝色
        break;
      case 'speak':
        // 朗读选中的文本
        if (this.highlightManager.activeHighlightId) {
          const h = this.highlightManager.getHighlightById(
            this.highlightManager.activeHighlightId
          );
          if (h && h.text) {
            this.ttsClient.speak(h.text);
          }
        } else if (selection && selection.text) {
          this.ttsClient.speak(selection.text);
        } else {
          console.warn('No text selected to speak');
        }
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

    // 根据是否有活跃高亮来控制按钮显示
    const highlightBtn = this.selectionMenu.querySelector(
      '[data-action="highlight"]'
    );
    const unhighlightBtn = this.selectionMenu.querySelector(
      '[data-action="unhighlight"]'
    );

    if (this.highlightManager.activeHighlightId) {
      // 当前点击的是已有高亮，显示"Unhighlight"按钮
      if (highlightBtn) highlightBtn.style.display = 'none';
      if (unhighlightBtn) unhighlightBtn.style.display = 'block';
    } else {
      // 当前是新选择的文本，显示"Highlight"按钮
      if (highlightBtn) highlightBtn.style.display = 'block';
      if (unhighlightBtn) unhighlightBtn.style.display = 'none';
    }

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
    this.highlightManager.clearActiveHighlight();
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

  handleHighlightTap({ x, y }) {
    const container = this.renderer?.container;
    if (!container) return;
    if (this.isSelecting) return; // 正在选择时不触发高亮点击

    const highlightResult = this.highlightManager.handleHighlightTap(
      { x, y },
      this.clientToContentPoint.bind(this)
    );

    if (highlightResult) {
      this.anchors.start = {
        x: highlightResult.bounds.x,
        y: highlightResult.bounds.y,
      };
      this.anchors.end = {
        x: highlightResult.bounds.x + highlightResult.bounds.width,
        y: highlightResult.bounds.y,
      };
      this.showSelectionMenu();
      return;
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

  /**
   * 渲染Canvas中的所有高亮
   * @param {CanvasRenderingContext2D} ctx - Canvas上下文
   * @param {Object} canvasInfo - Canvas信息
   */
  renderCanvasHighlights(ctx, canvasInfo) {
    this.highlightManager.renderCanvasHighlights(ctx, canvasInfo);
  }

  /**
   * 渲染TTS焦点文本高亮（代理方法）
   * @param {CanvasRenderingContext2D} ctx - Canvas上下文
   * @param {Object} canvasInfo - Canvas信息
   */
  renderTTSFocusText(ctx, canvasInfo) {
    if (this.ttsClient) {
      this.ttsClient.renderTTSFocusText(ctx, canvasInfo);
    }
  }

  /**
   * 朗读指定文本（代理方法）
   * @param {string} text - 要朗读的文本
   * @param {Object} options - 朗读选项
   */
  speak(text, options = {}) {
    if (this.ttsClient) {
      this.ttsClient.speak(text, options);
    }
  }


  /**
   * 触发Canvas重新渲染以显示新的高亮
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
   * 销毁所有功能
   */
  destroy() {
    // 清理 TTS 客户端
    if (this.ttsClient) {
      this.ttsClient.destroy();
      this.ttsClient = null;
    }

    // 清理 HighlightManager
    if (this.highlightManager) {
      this.highlightManager = null;
    }
  }
}
