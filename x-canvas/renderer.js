import { CanvasRenderer } from './canvas-renderer.js';
let renderer;
// 初始化
window.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('renderCanvas');

  renderer = new CanvasRenderer({
    canvas: canvas,
    theme: {
      backgroundColor: '#fff',
      textColor: '#222',
      selectionColor: '#007aff',
      selectionOpacity: 0.2,
      highlightColor: '#ffeb3b',
      highlightOpacity: 0.3,
    },
  });
  renderer.render(currentHTML); // 初始渲染

  let startIdx = null;
  let endIdx = null;
  let isSelecting = false;

  const startAnchor = document.getElementById('startAnchor');
  const endAnchor = document.getElementById('endAnchor');
  const highlightLayer = document.getElementById('highlightLayer'); // 需要获取高亮层元素

  const updateAnchors = () => {
    if (!startAnchor || !endAnchor || !highlightLayer) return;

    startAnchor.style.display = 'none';
    endAnchor.style.display = 'none';

    if (startIdx == null || endIdx == null) return;

    const min = Math.min(startIdx, endIdx);
    const max = Math.max(startIdx, endIdx);

    // 检查renderResult是否存在
    if (!renderer.renderResult || !renderer.renderResult.words) return;

    // 按行分组高亮
    let lineMap = {};
    for (let i = min; i <= max; i++) {
      if (i >= renderer.renderResult.words.length) break;
      const l = renderer.renderResult.words[i].line;
      if (!lineMap[l]) lineMap[l] = { start: i, end: i };
      else lineMap[l].end = i;
    }

    const linesArr = Object.values(lineMap);
    const anchorWidth = 10;
    const anchorHeight = 36;
    const anchorDotHeight = 10;

    // 获取高亮条 dom
    const bars = highlightLayer.querySelectorAll('.highlight-bar');

    if (linesArr.length > 0 && bars.length > 0) {
      // TODO: 锚点的高度使用高亮条的高度
      // 首行锚点
      const bar1 = bars[0];
      const bar1Rect = bar1.getBoundingClientRect();
      const wrapRect = renderer.canvas.getBoundingClientRect();
      startAnchor.style.display = 'block';
      startAnchor.style.left =
        bar1Rect.left - wrapRect.left - anchorWidth / 2 + 'px';
      startAnchor.style.top =
        bar1Rect.bottom - wrapRect.top - anchorHeight + 'px';
    }

    if (linesArr.length > 0 && bars.length > 0) {
      // 末行锚点
      const bar2 = bars[bars.length - 1];
      const bar2Rect = bar2.getBoundingClientRect();
      const wrapRect = renderer.canvas.getBoundingClientRect();
      endAnchor.style.display = 'block';
      endAnchor.style.left =
        bar2Rect.right - wrapRect.left - anchorWidth / 2 + 'px';
      endAnchor.style.top =
        bar2Rect.bottom - wrapRect.top - anchorHeight + anchorDotHeight + 'px';
    }
  };
  const updateHighlightBar = () => {
    highlightLayer.innerHTML = '';
    if (startIdx == null || endIdx == null) return;
    const min = Math.min(startIdx, endIdx);
    const max = Math.max(startIdx, endIdx);
    // 按行分组高亮
    let lineMap = {};
    for (let i = min; i <= max; i++) {
      const l = renderer.renderResult.words[i].line;
      if (!lineMap[l]) lineMap[l] = { start: i, end: i };
      else lineMap[l].end = i;
    }
    Object.values(lineMap).forEach(({ start, end }) => {
      const c1 = renderer.renderResult.words[start];
      const c2 = renderer.renderResult.words[end];
      const bar = document.createElement('div');
      bar.className = 'highlight-bar';
      bar.style.left = c1.x + 'px';
      bar.style.top = c1.y - renderer.theme.lineHeight + 'px';
      bar.style.width = c2.x + c2.width - c1.x + 'px';
      bar.style.height = renderer.theme.lineHeight + 8 + 'px';
      highlightLayer.appendChild(bar);
    });
  };

  window.nativeEvent.on('longPress', (start, end) => {
    isSelecting = true;
    startIdx = renderer.getCharIndexAt(start);
    endIdx = renderer.getCharIndexAt(end);
    updateHighlightBar();
    updateAnchors();
  });

  window.nativeEvent.on('movePress', (start) => {
    if (!isSelecting) return;
    requestAnimationFrame(() => {
      endIdx = renderer.getCharIndexAt(start);
      updateHighlightBar();
      updateAnchors();
    });
  });

  window.nativeEvent.on('moveAnchor', (point, type) => {
    if (type === 'start') {
      startIdx = renderer.getCharIndexAt(point);
    } else {
      endIdx = renderer.getCharIndexAt(point);
    }
    requestAnimationFrame(() => {
      updateHighlightBar();
      updateAnchors();
    });
  });
});

class NativeEvent {
  eventListenerMap = {
    longPress: [],
    movePress: [],
    moveMagnifier: [],
    highlightRange: [],
    webviewTouch: [],
  };
  on(eventName, callback) {
    this.eventListenerMap[eventName].push(callback);
  }
  emit(eventName, params) {
    this.eventListenerMap[eventName].forEach((callback) => {
      callback(params);
    });
  }
}

window.nativeEvent = new NativeEvent();

window.native = {
  findNearestText: function (start, end) {
    // 1. 找到最近的文本索引
    // const idx1 = getCharIdxByTouch(start.x, start.y)
    // const idx2 = getCharIdxByTouch(end.x, end.y)
    // if (idx1 == null || idx2 == null) return
    // startIdx = idx1
    // endIdx = idx2
    // updateHighlightBar()
    // 2. 计算高亮区左右端点坐标
    // setAnchorsPos()
    // 3. 回传给 native
  },
  handleLongPress: function (start, end) {
    isSelecting = true;
    startIdx = getCharIdxByTouch(start);
    endIdx = getCharIdxByTouch(end);
    updateAll();
  },
  handleMovePress: function (start) {
    if (!isSelecting) return;
    requestAnimationFrame(() => {
      endIdx = getCharIdxByTouch(start);
      updateAll();
    });
  },
  /**
   * @param {Point} point
   * @param {"start" | "end"} type
   */
  handleMoveAnchor: function (point, type) {
    if (type === 'start') {
      startIdx = getCharIdxByTouch(point);
    } else {
      endIdx = getCharIdxByTouch(point);
    }
    requestAnimationFrame(() => {
      updateAll();
    });
  },
  getAnchorPosition: function () {
    const startRect = startAnchor.getBoundingClientRect();
    const endRect = endAnchor.getBoundingClientRect();
    return {
      start: {
        x: startRect.left,
        y: startRect.top,
      },
      end: {
        x: endRect.left,
        y: endRect.top,
      },
    };
  },
  handleTouch: function () {
    isSelecting = false;
    startIdx = null;
    endIdx = null;
    updateAll();
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

document.addEventListener(
  'touchstart',
  function (e) {
    if (isSelecting) {
      window.native.handleTouch();
      e.preventDefault();
    }
    window.native.postMessage('webviewTouch');
  },
  {
    capture: true,
  }
);
