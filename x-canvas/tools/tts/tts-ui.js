/**
 * TTS UI Component
 * 提供 TTS 功能的用户界面控件
 */

export class TTSUI {
  constructor(controller, container) {
    this.controller = controller;
    this.container = container;

    this.isVisible = false;
    this.isDragging = false;
    this.availableVoices = [];

    this.createElement();
    this.bindEvents();
    this.setupControllerEvents();
  }

  /**
   * 创建 UI 元素
   */
  createElement() {}

  /**
   * 缓存常用元素
   */
  cacheElements() {}

  /**
   * 绑定事件
   */
  bindEvents() {
    const ttsButton = document.querySelector('#tts');
    // 基本控制按钮
    ttsButton.addEventListener('click', () => this.togglePlay());
  }

  /**
   * 设置控制器事件监听
   */
  setupControllerEvents() {
    this.controller.addEventListener('stateChange', (state) =>
      this.updateState(state)
    );
  }

  /**
   * 显示面板
   */
  show() {

    // 请求语音列表
    this.controller.requestVoices();
  }

  /**
   * 隐藏面板
   */
  hide() {
    if (!this.isVisible) return;

    if (this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
    this.isVisible = false;
  }

  /**
   * 切换显示状态
   */
  toggle() {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show();
    }
  }


  /**
   * 切换播放状态
   */
  async togglePlay() {
    const state = this.controller.state;
    
    if (state.isPlaying) {
      // 如果正在播放，暂停
      this.controller.pause();
    } else if (state.isPaused) {
      // 如果暂停中，恢复
      this.controller.resume();
    } else {
      // 如果没有播放，从当前阅读进度开始
      await this.controller.speakFromCurrentPosition();
    }
  }

  /**
   * 更新状态显示
   * @param {Object} state - TTS 状态
   */
  updateState(state) {
    // 更新播放按钮图标
    if (state.isPlaying) {
      console.log('start reading');
    } else {
      console.log('stop reading');
    }
  }

  /**
   * 销毁 UI
   */
  destroy() {}
}
