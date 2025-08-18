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
   * @type {import('./virtual-canvas-renderer').VirtualCanvasRenderer | import('./slide-canvas').HorizontalSlideManager}
   */
  renderer = null;

  constructor(renderer) {
    if (CanvasTools.instance) {
      return CanvasTools.instance;
    }
    CanvasTools.instance = this;

    this.renderer = renderer;
    this.createDOMStructure();
    this.onNativeEvent();
    this.setupMessageToNative();
  }

  async createDOMStructure() {
    const div = document.createElement('div');
    div.innerHTML = `
      <div class="highlight-layer" id="highlightLayer"></div>
      <div class="anchor" id="startAnchor">
        <div class="anchor-inner">
          <div class="anchor-dot"></div>
          <div class="anchor-line"></div>
        </div>
      </div>
      <div class="anchor" id="endAnchor">
        <div class="anchor-inner">
          <div class="anchor-line"></div>
          <div class="anchor-dot"></div>
        </div>
      </div>
    `;
    this.renderer.scrollContent.append(div);
    await Promise.resolve();
    this.startAnchor = document.getElementById('startAnchor');
    this.endAnchor = document.getElementById('endAnchor');
    this.highlightLayer = document.getElementById('highlightLayer'); // 需要获取高亮层元素
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
    const charPos = renderer.fullLayoutData.words;
    const min = Math.min(startIdx, endIdx);
    const max = Math.max(startIdx, endIdx);
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

  onNativeEvent() {
    const nativeEvent = new NativeEvent();

    nativeEvent.on('longPress', (start, end) => {
      this.isSelecting = true;
      this.startIdx = this.renderer.getCharIndexAt(start);
      this.endIdx = this.renderer.getCharIndexAt(end);
      this.updateHighlightBar();
      this.updateAnchors();
    });

    nativeEvent.on('movePress', (start) => {
      if (!this.isSelecting) return;
      requestAnimationFrame(() => {
        this.endIdx = this.renderer.getCharIndexAt(start);
        this.updateHighlightBar();
        this.updateAnchors();
      });
    });
    /**
     * @param {Point} point
     * @param {"start" | "end"} type
     */
    nativeEvent.on('moveAnchor', (point, type) => {
      if (type === 'start') {
        this.startIdx = this.renderer.getCharIndexAt(point);
      } else {
        this.endIdx = this.renderer.getCharIndexAt(point);
      }
      requestAnimationFrame(() => {
        this.updateHighlightBar();
        this.updateAnchors();
      });
    });

    nativeEvent.on('touch', () => {
      this.isSelecting = false;
      this.startIdx = null;
      this.endIdx = null;
      this.updateHighlightBar();
      this.updateAnchors();
    });
    window.nativeEvent = nativeEvent;
  }

  setupMessageToNative() {
    const canvasTools = this;
    document.addEventListener(
      'touchstart',
      function (e) {
        if (canvasTools.isSelecting) {
          window.nativeEvent.emit('touch');
          e.preventDefault();
        }
        window.native.postMessage('webviewTouch');
      },
      {
        capture: true,
      }
    );
    window.native = {
      getAnchorPosition: function () {
        const anchorDotHeight = 10;
        const startRect = canvasTools.startAnchor.getBoundingClientRect();
        const endRect = canvasTools.endAnchor.getBoundingClientRect();
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
      },
      /**
       * @param {"moveMagnifier" | "highlightRange" | "webviewTouch"} name
       * @param {any} params
       */
      postMessage: function (name, params) {
        if (
          window.webkit &&
          window.webkit.messageHandlers &&
          window.webkit.messageHandlers[name]
        ) {
          window.webkit.messageHandlers[name].postMessage(params);
        }
      },
    };
  }
}

class NativeEvent {
  eventListenerMap = {
    longPress: [],
    movePress: [],
    moveMagnifier: [],
    highlightRange: [],
  };
  on(eventName, callback) {
    if (!this.eventListenerMap[eventName]) {
      this.eventListenerMap[eventName] = [];
    }
    this.eventListenerMap[eventName].push(callback);
  }
  emit(eventName, ...rest) {
    this.eventListenerMap[eventName].forEach((callback) => {
      callback(...rest);
    });
  }
}
