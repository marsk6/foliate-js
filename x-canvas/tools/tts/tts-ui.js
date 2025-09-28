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
  createElement() {
    this.element = document.createElement('div');
    this.element.className = 'tts-panel';
    this.element.innerHTML = `
            <div class="tts-header">
                <h3 class="tts-title">语音朗读</h3>
                <button class="tts-close" type="button" aria-label="关闭">×</button>
            </div>
            
            <div class="tts-content">
                <!-- 主控制区 -->
                <div class="tts-main-controls">
                    <button class="tts-btn tts-play" type="button" aria-label="播放">
                        <svg class="tts-icon tts-play-icon" viewBox="0 0 24 24">
                            <path d="M8 5v14l11-7z"/>
                        </svg>
                        <svg class="tts-icon tts-pause-icon" viewBox="0 0 24 24" style="display: none;">
                            <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
                        </svg>
                    </button>
                    
                    <button class="tts-btn tts-prev" type="button" aria-label="上一段">
                        <svg class="tts-icon" viewBox="0 0 24 24">
                            <path d="M6 6h2v12H6V6zm3.5 6l8.5 6V6l-8.5 6z"/>
                        </svg>
                    </button>
                    
                    <button class="tts-btn tts-next" type="button" aria-label="下一段">
                        <svg class="tts-icon" viewBox="0 0 24 24">
                            <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/>
                        </svg>
                    </button>
                    
                    <button class="tts-btn tts-stop" type="button" aria-label="停止">
                        <svg class="tts-icon" viewBox="0 0 24 24">
                            <path d="M6 6h12v12H6z"/>
                        </svg>
                    </button>
                </div>
                
                <!-- 进度条 -->
                <div class="tts-progress-container">
                    <div class="tts-progress-bar">
                        <div class="tts-progress-fill"></div>
                    </div>
                    <span class="tts-progress-text">0%</span>
                </div>
                
                <!-- 当前播放信息 -->
                <div class="tts-info">
                    <div class="tts-current-text"></div>
                    <div class="tts-segment-info">
                        <span class="tts-segment-current">0</span> / 
                        <span class="tts-segment-total">0</span> 段
                    </div>
                </div>
                
                <!-- 设置面板 -->
                <div class="tts-settings">
                    <button class="tts-settings-toggle" type="button">⚙️ 设置</button>
                    <div class="tts-settings-panel" style="display: none;">
                        
                        <!-- 语音选择 -->
                        <div class="tts-setting-group">
                            <label for="tts-voice-select">语音：</label>
                            <select id="tts-voice-select" class="tts-voice-select">
                                <option value="">默认语音</option>
                            </select>
                        </div>
                        
                        <!-- 语速调节 -->
                        <div class="tts-setting-group">
                            <label for="tts-rate-slider">语速：</label>
                            <input id="tts-rate-slider" type="range" class="tts-rate-slider" 
                                   min="50" max="200" value="100" step="10">
                            <span class="tts-rate-value">100%</span>
                        </div>
                        
                        <!-- 音调调节 -->
                        <div class="tts-setting-group">
                            <label for="tts-pitch-slider">音调：</label>
                            <input id="tts-pitch-slider" type="range" class="tts-pitch-slider" 
                                   min="-20" max="20" value="0" step="5">
                            <span class="tts-pitch-value">0Hz</span>
                        </div>
                        
                        <!-- 音量调节 -->
                        <div class="tts-setting-group">
                            <label for="tts-volume-slider">音量：</label>
                            <input id="tts-volume-slider" type="range" class="tts-volume-slider" 
                                   min="0" max="100" value="100" step="10">
                            <span class="tts-volume-value">100%</span>
                        </div>
                        
                        <!-- 其他选项 -->
                        <div class="tts-setting-group">
                            <label>
                                <input type="checkbox" class="tts-auto-detect" checked>
                                自动检测语言
                            </label>
                        </div>
                        
                        <div class="tts-setting-group">
                            <label>
                                <input type="checkbox" class="tts-sentence-breaks" checked>
                                启用句子停顿
                            </label>
                        </div>
                    </div>
                </div>
                
                <!-- 状态指示 -->
                <div class="tts-status">
                    <span class="tts-status-text">就绪</span>
                    <div class="tts-loading" style="display: none;">
                        <div class="tts-spinner"></div>
                    </div>
                </div>
            </div>
        `;

    this.addStyles();
    this.cacheElements();
  }

  /**
   * 缓存常用元素
   */
  cacheElements() {
    this.elements = {
      panel: this.element,
      closeBtn: this.element.querySelector('.tts-close'),
      playBtn: this.element.querySelector('.tts-play'),
      prevBtn: this.element.querySelector('.tts-prev'),
      nextBtn: this.element.querySelector('.tts-next'),
      stopBtn: this.element.querySelector('.tts-stop'),

      playIcon: this.element.querySelector('.tts-play-icon'),
      pauseIcon: this.element.querySelector('.tts-pause-icon'),

      progressBar: this.element.querySelector('.tts-progress-fill'),
      progressText: this.element.querySelector('.tts-progress-text'),

      currentText: this.element.querySelector('.tts-current-text'),
      segmentCurrent: this.element.querySelector('.tts-segment-current'),
      segmentTotal: this.element.querySelector('.tts-segment-total'),

      settingsToggle: this.element.querySelector('.tts-settings-toggle'),
      settingsPanel: this.element.querySelector('.tts-settings-panel'),

      voiceSelect: this.element.querySelector('.tts-voice-select'),
      rateSlider: this.element.querySelector('.tts-rate-slider'),
      rateValue: this.element.querySelector('.tts-rate-value'),
      pitchSlider: this.element.querySelector('.tts-pitch-slider'),
      pitchValue: this.element.querySelector('.tts-pitch-value'),
      volumeSlider: this.element.querySelector('.tts-volume-slider'),
      volumeValue: this.element.querySelector('.tts-volume-value'),

      autoDetect: this.element.querySelector('.tts-auto-detect'),
      sentenceBreaks: this.element.querySelector('.tts-sentence-breaks'),

      statusText: this.element.querySelector('.tts-status-text'),
      loading: this.element.querySelector('.tts-loading'),
    };
  }

  /**
   * 绑定事件
   */
  bindEvents() {
    const { elements } = this;

    // 控制按钮
    elements.closeBtn.addEventListener('click', () => this.hide());
    elements.playBtn.addEventListener('click', () => this.togglePlay());
    elements.prevBtn.addEventListener('click', () =>
      this.controller.skipPrevious()
    );
    elements.nextBtn.addEventListener('click', () =>
      this.controller.skipNext()
    );
    elements.stopBtn.addEventListener('click', () => this.controller.stop());

    // 设置面板切换
    elements.settingsToggle.addEventListener('click', () =>
      this.toggleSettings()
    );

    // 语音设置
    elements.voiceSelect.addEventListener('change', () =>
      this.updateVoiceSettings()
    );
    elements.rateSlider.addEventListener('input', () =>
      this.updateRateSettings()
    );
    elements.pitchSlider.addEventListener('input', () =>
      this.updatePitchSettings()
    );
    elements.volumeSlider.addEventListener('input', () =>
      this.updateVolumeSettings()
    );

    // 选项设置
    elements.autoDetect.addEventListener('change', () => this.updateOptions());
    elements.sentenceBreaks.addEventListener('change', () =>
      this.updateOptions()
    );

    // 拖拽功能
    const header = this.element.querySelector('.tts-header');
    header.addEventListener('mousedown', (e) => this.startDrag(e));
    document.addEventListener('mousemove', (e) => this.drag(e));
    document.addEventListener('mouseup', () => this.endDrag());
  }

  /**
   * 设置控制器事件监听
   */
  setupControllerEvents() {
    this.controller.addEventListener('stateChange', (state) =>
      this.updateState(state)
    );
    this.controller.addEventListener('progress', (progress) =>
      this.updateProgress(progress)
    );
    this.controller.addEventListener('segmentStart', (data) =>
      this.updateSegmentInfo(data)
    );
    this.controller.addEventListener('voicesAvailable', (voices) =>
      this.updateVoices(voices)
    );
    this.controller.addEventListener('error', (error) => this.showError(error));
  }

  /**
   * 显示面板
   */
  show() {
    if (this.isVisible) return;

    this.container.appendChild(this.element);
    this.isVisible = true;

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
   * 播放选中的文本
   */
  speakSelectedText() {
    const selectedText = this.getSelectedText();
    if (selectedText) {
      this.show();
      this.controller.speak(selectedText);
    }
  }

  /**
   * 获取选中的文本
   * @returns {string} 选中的文本
   */
  getSelectedText() {
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
      return selection.toString().trim();
    }
    return '';
  }

  /**
   * 切换播放状态
   */
  togglePlay() {
    this.controller.toggle();
  }

  /**
   * 切换设置面板
   */
  toggleSettings() {
    const panel = this.elements.settingsPanel;
    const isVisible = panel.style.display !== 'none';
    panel.style.display = isVisible ? 'none' : 'block';
  }

  /**
   * 更新状态显示
   * @param {Object} state - TTS 状态
   */
  updateState(state) {
    const { elements } = this;

    // 更新播放按钮图标
    if (state.isPlaying) {
      elements.playIcon.style.display = 'none';
      elements.pauseIcon.style.display = 'block';
      elements.statusText.textContent = '播放中';
    } else if (state.isPaused) {
      elements.playIcon.style.display = 'block';
      elements.pauseIcon.style.display = 'none';
      elements.statusText.textContent = '已暂停';
    } else {
      elements.playIcon.style.display = 'block';
      elements.pauseIcon.style.display = 'none';
      elements.statusText.textContent = '就绪';
    }

    // 更新加载状态
    if (state.isLoading) {
      elements.loading.style.display = 'block';
      elements.statusText.textContent = '加载中...';
    } else {
      elements.loading.style.display = 'none';
    }

    // 显示错误
    if (state.error) {
      this.showError(state.error);
    }
  }

  /**
   * 更新进度显示
   * @param {number} progress - 进度 (0-1)
   */
  updateProgress(progress) {
    const percentage = Math.round(progress * 100);
    this.elements.progressBar.style.width = `${percentage}%`;
    this.elements.progressText.textContent = `${percentage}%`;
  }

  /**
   * 更新段落信息
   * @param {Object} data - 段落数据
   */
  updateSegmentInfo(data) {
    const { text, segment, total } = data;

    // 显示当前播放的文本（截断长文本）
    const displayText = text.length > 50 ? text.substring(0, 50) + '...' : text;
    this.elements.currentText.textContent = displayText;

    // 更新段落计数
    this.elements.segmentCurrent.textContent = segment + 1; // 从 1 开始显示
    this.elements.segmentTotal.textContent = total;
  }

  /**
   * 更新可用语音列表
   * @param {Array} voices - 语音列表
   */
  updateVoices(voices) {
    this.availableVoices = voices;
    const select = this.elements.voiceSelect;

    // 清空现有选项
    select.innerHTML = '<option value="">默认语音</option>';

    // 添加语音选项
    voices.forEach((voice) => {
      const option = document.createElement('option');
      option.value = voice.identifier;
      option.textContent = `${voice.name} (${voice.language})`;
      select.appendChild(option);
    });
  }

  /**
   * 更新语音设置
   */
  updateVoiceSettings() {
    const voice = this.elements.voiceSelect.value;
    this.controller.setOptions({ voice: voice || null });
  }

  /**
   * 更新语速设置
   */
  updateRateSettings() {
    const rate = parseInt(this.elements.rateSlider.value);
    this.elements.rateValue.textContent = `${rate}%`;
    this.controller.setOptions({ rate: `${rate}%` });
  }

  /**
   * 更新音调设置
   */
  updatePitchSettings() {
    const pitch = parseInt(this.elements.pitchSlider.value);
    this.elements.pitchValue.textContent = `${pitch}Hz`;
    this.controller.setOptions({ pitch: `${pitch}Hz` });
  }

  /**
   * 更新音量设置
   */
  updateVolumeSettings() {
    const volume = parseInt(this.elements.volumeSlider.value);
    this.elements.volumeValue.textContent = `${volume}%`;
    this.controller.setOptions({ volume: `${volume}%` });
  }

  /**
   * 更新其他选项
   */
  updateOptions() {
    const options = {
      autoDetectLanguage: this.elements.autoDetect.checked,
      enableSentenceBreaks: this.elements.sentenceBreaks.checked,
    };
    this.controller.setOptions(options);
  }

  /**
   * 显示错误信息
   * @param {string} message - 错误消息
   */
  showError(message) {
    this.elements.statusText.textContent = `错误: ${message}`;
    this.elements.statusText.style.color = '#e74c3c';

    setTimeout(() => {
      this.elements.statusText.style.color = '';
      this.elements.statusText.textContent = '就绪';
    }, 3000);
  }

  /**
   * 开始拖拽
   * @param {MouseEvent} e - 鼠标事件
   */
  startDrag(e) {
    this.isDragging = true;
    this.dragStartX = e.clientX - this.element.offsetLeft;
    this.dragStartY = e.clientY - this.element.offsetTop;
    this.element.style.cursor = 'grabbing';
  }

  /**
   * 拖拽中
   * @param {MouseEvent} e - 鼠标事件
   */
  drag(e) {
    if (!this.isDragging) return;

    e.preventDefault();

    const x = e.clientX - this.dragStartX;
    const y = e.clientY - this.dragStartY;

    this.element.style.left = `${x}px`;
    this.element.style.top = `${y}px`;
  }

  /**
   * 结束拖拽
   */
  endDrag() {
    if (this.isDragging) {
      this.isDragging = false;
      this.element.style.cursor = '';
    }
  }

  /**
   * 添加样式
   */
  addStyles() {
    if (document.getElementById('tts-ui-styles')) return;

    const style = document.createElement('style');
    style.id = 'tts-ui-styles';
    style.textContent = `
            .tts-panel {
                position: fixed;
                top: 20px;
                right: 20px;
                width: 320px;
                background: #fff;
                border: 1px solid #ddd;
                border-radius: 8px;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                font-size: 14px;
                z-index: 10000;
                user-select: none;
            }

            .tts-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 12px 16px;
                border-bottom: 1px solid #eee;
                background: #f8f9fa;
                border-radius: 8px 8px 0 0;
                cursor: grab;
            }

            .tts-header:active {
                cursor: grabbing;
            }

            .tts-title {
                margin: 0;
                font-size: 16px;
                font-weight: 600;
                color: #333;
            }

            .tts-close {
                background: none;
                border: none;
                font-size: 20px;
                cursor: pointer;
                color: #666;
                width: 24px;
                height: 24px;
                display: flex;
                align-items: center;
                justify-content: center;
                border-radius: 4px;
            }

            .tts-close:hover {
                background: #e9ecef;
                color: #333;
            }

            .tts-content {
                padding: 16px;
            }

            .tts-main-controls {
                display: flex;
                gap: 8px;
                justify-content: center;
                margin-bottom: 16px;
            }

            .tts-btn {
                width: 44px;
                height: 44px;
                border: 1px solid #ddd;
                border-radius: 50%;
                background: #fff;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.2s;
            }

            .tts-btn:hover {
                background: #f8f9fa;
                border-color: #bbb;
            }

            .tts-btn:active {
                transform: scale(0.95);
            }

            .tts-play {
                background: #007bff;
                color: white;
                border-color: #007bff;
            }

            .tts-play:hover {
                background: #0056b3;
                border-color: #0056b3;
            }

            .tts-icon {
                width: 20px;
                height: 20px;
                fill: currentColor;
            }

            .tts-progress-container {
                display: flex;
                align-items: center;
                gap: 8px;
                margin-bottom: 16px;
            }

            .tts-progress-bar {
                flex: 1;
                height: 6px;
                background: #e9ecef;
                border-radius: 3px;
                overflow: hidden;
            }

            .tts-progress-fill {
                height: 100%;
                background: #007bff;
                width: 0%;
                transition: width 0.3s ease;
            }

            .tts-progress-text {
                font-size: 12px;
                color: #666;
                min-width: 32px;
            }

            .tts-info {
                margin-bottom: 16px;
                padding: 8px;
                background: #f8f9fa;
                border-radius: 4px;
                font-size: 12px;
            }

            .tts-current-text {
                color: #333;
                margin-bottom: 4px;
                line-height: 1.4;
            }

            .tts-segment-info {
                color: #666;
                text-align: right;
            }

            .tts-settings {
                border-top: 1px solid #eee;
                padding-top: 16px;
                margin-top: 16px;
            }

            .tts-settings-toggle {
                background: none;
                border: 1px solid #ddd;
                padding: 6px 12px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 12px;
                color: #666;
                width: 100%;
            }

            .tts-settings-toggle:hover {
                background: #f8f9fa;
            }

            .tts-settings-panel {
                margin-top: 12px;
                padding: 12px;
                background: #f8f9fa;
                border-radius: 4px;
            }

            .tts-setting-group {
                display: flex;
                align-items: center;
                justify-content: space-between;
                margin-bottom: 12px;
                font-size: 12px;
            }

            .tts-setting-group:last-child {
                margin-bottom: 0;
            }

            .tts-setting-group label {
                color: #333;
                min-width: 40px;
            }

            .tts-setting-group select,
            .tts-setting-group input[type="range"] {
                flex: 1;
                margin: 0 8px;
            }

            .tts-setting-group input[type="range"] {
                max-width: 80px;
            }

            .tts-rate-value,
            .tts-pitch-value,
            .tts-volume-value {
                min-width: 32px;
                font-size: 11px;
                color: #666;
            }

            .tts-status {
                display: flex;
                align-items: center;
                justify-content: space-between;
                margin-top: 12px;
                padding-top: 12px;
                border-top: 1px solid #eee;
                font-size: 12px;
            }

            .tts-status-text {
                color: #666;
            }

            .tts-loading {
                display: flex;
                align-items: center;
            }

            .tts-spinner {
                width: 16px;
                height: 16px;
                border: 2px solid #e9ecef;
                border-top: 2px solid #007bff;
                border-radius: 50%;
                animation: spin 1s linear infinite;
            }

            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }

            /* 响应式设计 */
            @media (max-width: 768px) {
                .tts-panel {
                    width: 280px;
                    top: 10px;
                    right: 10px;
                }
            }
        `;

    document.head.appendChild(style);
  }

  /**
   * 销毁 UI
   */
  destroy() {
    this.hide();

    // 移除样式
    const style = document.getElementById('tts-ui-styles');
    if (style) {
      style.remove();
    }
  }
}
