import { computeLineRectsFromIndicesList } from '../highlight/geometry.js';

export class TTSClient {
  constructor(renderer, highlightManager) {
    this.renderer = renderer;
    this.highlightManager = highlightManager;
    
    // TTS 相关属性
    /** @type {Object|null} TTS 实例 */
    this.ttsInstance = null;

    /** @type {Object|null} 当前TTS高亮信息 */
    this.currentTTSHighlight = null;

    /** @type {Function|null} TTS高亮渲染事件处理器 */
    this.renderTTSHighlightHandler = null;

    /** @type {Function|null} TTS高亮清除事件处理器 */
    this.clearTTSHighlightHandler = null;

    // 初始化 TTS 功能
    this.initializeTTS();

    // 设置TTS高亮事件监听
    this.setupTTSHighlightEvents();
  }

  /**
   * 初始化 TTS 功能
   */
  async initializeTTS() {
    try {
      // 动态导入 TTS 模块
      const TTSModule = await import('./index.js');

      // 初始化 TTS 实例，传递renderer参数
      this.ttsInstance = TTSModule.initNativeTTS({
        container: this.renderer.container,
        renderer: this.renderer, // 传递renderer
        autoShow: false,
        // TTS 配置
        language: 'zh-CN',
        rate: '100%',
        pitch: '0Hz',
        autoDetectLanguage: true,
        enableSentenceBreaks: true,
      });

      console.log('TTS initialized in TTSClient');
    } catch (error) {
      console.error('Failed to initialize TTS in TTSClient:', error);
    }
  }

  /**
   * 朗读指定文本
   * @param {string} text - 要朗读的文本
   * @param {Object} options - 朗读选项
   */
  speak(text, options = {}) {
    if (this.ttsInstance) {
      this.ttsInstance.speak(text, options);
    }
  }

  /**
   * 设置TTS高亮事件监听
   */
  setupTTSHighlightEvents() {
    // 绑定事件处理器（确保正确的 this 上下文）
    this.renderTTSHighlightHandler = (event) => {
      this.renderTTSHighlight(event.detail);
    };

    this.clearTTSHighlightHandler = () => {
      this.clearTTSHighlight();
    };

    // 监听TTS高亮更新事件
    window.addEventListener(
      'renderTTSHighlight',
      this.renderTTSHighlightHandler
    );

    // 监听TTS高亮清除事件
    window.addEventListener('clearTTSHighlight', this.clearTTSHighlightHandler);
  }

  /**
   * 渲染TTS高亮
   * @param {Object} data - 高亮数据，包含 focusLines
   */
  renderTTSHighlight(data) {
    const { focusLines, sentence } = data;

    // 保存当前TTS高亮信息（包含 focusLines 以供将来使用）
    this.currentTTSHighlight = {
      focusLines: focusLines, // 基于行的焦点信息
      sentence: sentence, // 句子对象
      timestamp: Date.now(),
    };

    // 触发Canvas重新渲染
    this.triggerCanvasRerender();
  }

  /**
   * 清除TTS高亮
   */
  clearTTSHighlight() {
    if (this.currentTTSHighlight) {
      this.currentTTSHighlight = null;
      this.triggerCanvasRerender();
    }
  }

  /**
   * 在Canvas上绘制TTS高亮（复用高亮渲染逻辑）
   *
   * @param {CanvasRenderingContext2D} ctx - Canvas上下文
   * @param {Object} canvasInfo - Canvas信息
   */
  renderTTSHighlightOnCanvas(ctx, canvasInfo) {
    if (!this.currentTTSHighlight || !this.currentTTSHighlight.focusLines) {
      return;
    }
    const words = this.renderer?.fullLayoutData?.words;
    if (!words) return;

    const { focusLines } = this.currentTTSHighlight;
    const { contentStartY } = canvasInfo;

    // 遍历每一行，复用高亮渲染逻辑
    focusLines.forEach((line) => {
      const { startWordId, endWordId } = line;
      if (!startWordId || !endWordId) return;

      const indexRange = this.highlightManager.getIndexRangeByWordIds(
        startWordId,
        endWordId
      );
      if (!indexRange) return;

      const { startIdx, endIdx } = indexRange;
      if (startIdx == null || endIdx == null) return;

      const rects = computeLineRectsFromIndicesList(
        words,
        startIdx,
        endIdx,
        this.renderer.theme
      );

      // 绘制TTS高亮，使用淡蓝色
      rects.forEach((r) => {
        this.highlightManager.drawHighlightShape(
          ctx,
          {
            x: r.x,
            y: r.y - contentStartY,
            width: r.width,
            height: r.height,
          },
          {
            type: 'highlight',
            color: '#87CEEB', // 淡蓝色 (SkyBlue)
            opacity: 0.3,
          }
        );
      });
    });
  }

  /**
   * 渲染TTS焦点文本高亮（独立方法）
   * @param {CanvasRenderingContext2D} ctx - Canvas上下文
   * @param {Object} canvasInfo - Canvas信息
   */
  renderTTSFocusText(ctx, canvasInfo) {
    // 绘制TTS高亮
    this.renderTTSHighlightOnCanvas(ctx, canvasInfo);
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
   * 销毁 TTS 功能
   */
  destroy() {
    // 清理 TTS 实例
    if (this.ttsInstance) {
      this.ttsInstance.destroy();
      this.ttsInstance = null;
    }

    // 清理TTS高亮事件监听器
    if (this.renderTTSHighlightHandler) {
      window.removeEventListener(
        'renderTTSHighlight',
        this.renderTTSHighlightHandler
      );
      this.renderTTSHighlightHandler = null;
    }

    if (this.clearTTSHighlightHandler) {
      window.removeEventListener(
        'clearTTSHighlight',
        this.clearTTSHighlightHandler
      );
      this.clearTTSHighlightHandler = null;
    }

    // 清理当前TTS高亮
    this.currentTTSHighlight = null;
  }
}
