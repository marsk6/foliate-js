import { MultiChapterManager } from './multi-chapter-manager';

class Native {
  /**
   * @type {import('./multi-chapter-manager').MultiChapterManager}
   */
  chapterManager = null;
  eventListenerMap = {
    longPress: [],
    movePress: [],
    moveMagnifier: [],
    highlightRange: [],
  };

  constructor(chapterManager) {
    this.chapterManager = chapterManager;
  }

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
  /**
   * @param {"moveMagnifier" | "highlightRange" | "webviewTouch"} name
   * @param {any} params
   */
  postMessage(name, params) {
    if (
      window.webkit &&
      window.webkit.messageHandlers &&
      window.webkit.messageHandlers[name]
    ) {
      window.webkit.messageHandlers[name].postMessage(params);
    }
  }
  getAnchorPosition() {
    return this.chapterManager.activeChapter.renderer.tools.getAnchorPosition();
  }
}

function main() {
  const el = document.getElementById('renderCanvas');

  const chapterManager = new MultiChapterManager({
    el,
    mode: 'horizontal',
    // mode: 'vertical',
    theme: {
      backgroundColor: '#fff',
      textColor: '#222',
      selectionColor: '#007aff',
      selectionOpacity: 0.2,
      highlightColor: '#ffeb3b',
      highlightOpacity: 0.3,
    },
  });


  const native = new Native(chapterManager);

  native.on('longPress', (start, end) => {
    chapterManager.activeChapter.renderer.tools.handleLongPress(start, end);
  });

  native.on('movePress', (start) => {
    chapterManager.activeChapter.renderer.tools.handleMovePress(start);
  });

  native.on('moveAnchor', (point, type) => {
    chapterManager.activeChapter.renderer.tools.handleMoveAnchor(point, type);
  });

  native.on('touch', () => {
    chapterManager.activeChapter.renderer.tools.handleTouch();
  });

  window.native = native;

  document.addEventListener(
    'touchstart',
    function (e) {
      window.native.emit('touch');
      window.native.postMessage('webviewTouch');
      e.preventDefault();
    },
    {
      capture: true,
    }
  );
}

window.addEventListener('DOMContentLoaded', main);
