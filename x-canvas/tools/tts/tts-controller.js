/**
 * TTS Controller - Web 端主控制器
 * 
 * 架构说明：
 * - Web 端完全控制 TTS 交互逻辑（分句、高亮、播放控制）
 * - Native 端仅负责语音合成和播放
 * - 高亮显示同步：播放时立即高亮，不等待 Native 反馈
 * 
 * 主要功能：
 * 1. TTS 数据预处理（分句、SSML 生成）
 * 2. 播放控制（开始、暂停、停止、切换）
 * 3. 高亮管理（实时同步句子高亮）
 * 4. 自动播放（Native 完成后自动播放下一句）
 * 
 * 事件流：
 * 1. startTTS() -> Web 端高亮句子 -> Native 播放
 * 2. Native 播放完成 -> Web 端自动播放下一句
 * 3. 所有句子完成 -> 清除高亮，发出完成事件
 * 
 * 使用方法：
 * ```javascript
 * const controller = new TTSController(renderer);
 * 
 * // 从当前位置开始朗读
 * await controller.startTTS();
 * 
 * // 选中文本朗读
 * await controller.startTTS({ text: "Hello world" });
 * 
 * // 手动控制
 * controller.pause();          // 暂停
 * controller.resume();         // 继续
 * controller.stop();           // 停止
 * controller.playNextSentence();     // 下一句
 * controller.playPreviousSentence(); // 上一句
 * controller.jumpToSentence(5);      // 跳转到第6句
 *
 * ```
 */

import { SSMLBuilder } from './ssml-builder.js';
import { TTSTextManager } from './tts-text.js';
import './bridge.js'; // 导入 bridge 初始化代码

export class TTSController {
  constructor(renderer = null) {
    this.ssmlBuilder = new SSMLBuilder();
    this.renderer = renderer;

    // TTS 状态
    this.state = {
      isPlaying: false,
      isPaused: false,
      isLoading: false,
      currentText: '',
      currentSegment: 0,
      totalSegments: 0,
      progress: 0,
      error: null,
      readingMode: 'selection', // 'selection' | 'position'
      currentPosition: 0,
    };

    // 配置选项
    this.options = {
      language: 'zh-CN',
      rate: '100%',
      pitch: '0Hz',
      volume: '100%',
      voice: null,
      autoDetectLanguage: true,
      enableSentenceBreaks: true,
      segmentMaxLength: 500,
    };

    // 初始化文本管理器（传入 SSMLBuilder 和选项）
    this.textManager = new TTSTextManager(renderer, this.ssmlBuilder, this.options);

    // 事件监听器
    this.listeners = new Map();

    // 当前播放的文本队列和分句数据
    this.textQueue = [];
    this.currentQueueIndex = 0;
    this.currentSentences = [];

    // 预处理的TTS数据结构
    this.ttsDataReady = false;
    this.lastProcessedWordsHash = null;

    this.initBridge();
    this.setupTTSHighlightEvents();

    // 如果renderer已经有数据，立即预处理
    this.initializeTTSData();
  }

  /**
   * 初始化 native bridge
   */
  initBridge() {
    // 等待 native bridge 就绪
    if (window.nativeTTSBridge) {
      this.setupEventListeners();
    } else {
      window.addEventListener('nativeTTSBridgeReady', () => {
        this.setupEventListeners();
      });
    }
  }

  /**
   * 设置事件监听器
   */
  setupEventListeners() {
    // 监听 native TTS 事件
    window.addEventListener('nativeTTSEvent', (event) => {
      this.handleNativeEvent(event.detail);
    });

    // 请求可用语音列表
    this.requestVoices();
  }

  /**
   * 处理来自 native 的事件
   * @param {Object} detail - 事件详情
   */
  handleNativeEvent(detail) {
    const { type, data } = detail;

    switch (type) {
      case 'stateChanged':
        this.updateState(data);
        break;

      case 'progress':
        this.state.progress = data.progress || 0;
        this.emit('progress', this.state.progress);
        break;

      case 'speechStart':
        this.state.currentText = data.text || '';
        this.emit('speechStart', {
          text: this.state.currentText,
        });
        break;

      case 'wordHighlight':
        this.emit('wordHighlight', data);
        break;

      case 'voicesAvailable':
        this.emit('voicesAvailable', data.voices || []);
        break;

      case 'finished':
        this.handleSentenceFinished();
        break;

      case 'pause':
        this.state.isPaused = true;
        this.state.isPlaying = false;
        this.emit('pause');
        break;

      case 'resume':
        this.state.isPaused = false;
        this.state.isPlaying = true;
        this.emit('resume');
        break;

      case 'stop':
        this.resetState();
        this.emit('stop');
        break;

      case 'skipNext':
        // Native 请求跳转到下一句，Web 端处理
        this.playNextSentence();
        break;

      case 'skipPrevious':
        // Native 请求跳转到上一句，Web 端处理
        this.playPreviousSentence();
        break;
    }
  }

  /**
   * 更新状态
   * @param {Object} data - 状态数据
   */
  updateState(data) {
    const { state: newState, message } = data;

    // 重置所有状态标志
    this.state.isPlaying = false;
    this.state.isPaused = false;
    this.state.isLoading = false;
    this.state.error = null;

    switch (newState) {
      case 'loading':
        this.state.isLoading = true;
        break;
      case 'playing':
        this.state.isPlaying = true;
        break;
      case 'paused':
        this.state.isPaused = true;
        break;
      case 'error':
        this.state.error = message || '播放出错';
        break;
    }

    this.emit('stateChange', { ...this.state });
  }

  /**
   * 重置状态
   */
  resetState() {
    this.state = {
      isPlaying: false,
      isPaused: false,
      isLoading: false,
      currentText: '',
      currentSegment: 0,
      totalSegments: 0,
      progress: 0,
      error: null,
    };
  }

  /**
   * 播放文本
   * @param {string} text - 要播放的文本
   * @param {Object} options - 播放选项
   */
  async speak(text, options = {}) {
    if (!text || !text.trim()) {
      console.warn('TTS: No text provided');
      return;
    }

    if (!window.nativeTTSBridge) {
      console.error('TTS: Native bridge not available');
      this.emit('error', 'TTS 功能不可用');
      return;
    }

    // 合并选项
    const mergedOptions = { ...this.options, ...options };

    try {
      // 检测语言
      if (mergedOptions.autoDetectLanguage) {
        mergedOptions.language = this.ssmlBuilder.detectLanguage(text);

        // 根据语言调整默认参数
        const langDefaults = this.ssmlBuilder.getLanguageDefaults(
          mergedOptions.language
        );
        Object.assign(mergedOptions, langDefaults, options); // options 优先级更高
      }

      // 分段处理长文本
      const segments = this.ssmlBuilder.segmentLongText(
        text,
        mergedOptions.segmentMaxLength
      );
      this.textQueue = segments;
      this.currentQueueIndex = 0;

      // 播放第一段
      await this.speakSegment(segments[0], mergedOptions);
    } catch (error) {
      console.error('TTS: Failed to speak text:', error);
      this.emit('error', error.message || '播放失败');
    }
  }

  /**
   * 播放文本段
   * @param {string} text - 文本段
   * @param {Object} options - 选项
   */
  async speakSegment(text, options) {
    let processedText = text;

    // 添加句子停顿
    if (options.enableSentenceBreaks) {
      processedText = this.ssmlBuilder.addSentenceBreaks(processedText);
    }

    // 构建 SSML
    const ssml = this.ssmlBuilder.build(processedText, options);

    if (!ssml) {
      console.warn('TTS: Empty SSML generated');
      return;
    }

    // 发送到 native
    window.nativeTTSBridge.speak(ssml);
  }

  /**
   * 暂停播放
   */
  pause() {
    if (!window.nativeTTSBridge) return;

    if (this.state.isPlaying) {
      window.nativeTTSBridge.pause();
    }
  }

  /**
   * 继续播放
   */
  resume() {
    if (!window.nativeTTSBridge) return;

    if (this.state.isPaused) {
      window.nativeTTSBridge.resume();
    }
  }

  /**
   * 停止播放
   */
  stop() {
    if (window.nativeTTSBridge) {
      window.nativeTTSBridge.stop();
    }

    // 清理状态
    this.state.isPlaying = false;
    this.state.isPaused = false;
    this.state.progress = 0;
    this.textQueue = [];
    this.currentQueueIndex = 0;
    
    // 清除高亮
    if (this.textManager) {
      this.textManager.clearHighlights();
    }
    
    this.emit('stop');
  }

  /**
   * 下一句（兼容性方法，内部调用 playNextSentence）
   */
  async skipNext() {
    await this.playNextSentence();
  }

  /**
   * 上一句（兼容性方法，内部调用 playPreviousSentence）
   */
  async skipPrevious() {
    await this.playPreviousSentence();
  }

  /**
   * 切换播放状态
   */
  toggle() {
    if (this.state.isPlaying) {
      this.pause();
    } else if (this.state.isPaused) {
      this.resume();
    }
  }

  /**
   * 请求可用语音列表
   */
  requestVoices() {
    if (window.nativeTTSBridge) {
      window.nativeTTSBridge.getVoices();
    }
  }

  /**
   * 设置播放选项
   * @param {Object} newOptions - 新选项
   */
  setOptions(newOptions) {
    this.options = { ...this.options, ...newOptions };
    
    // 同步更新 textManager 的选项
    if (this.textManager) {
      this.textManager.ttsOptions = this.options;
      
      // 如果已经有预处理的数据，重新生成 SSML
      if (this.textManager.currentSentences && this.textManager.currentSentences.length > 0) {
        console.log('🔄 TTS: Regenerating SSML for existing sentences due to options change');
        this.textManager.regenerateSSMLForExistingSentences();
      }
    }
    
    this.emit('optionsChanged', this.options);
  }

  /**
   * 获取当前选项
   * @returns {Object} 当前选项
   */
  getOptions() {
    return { ...this.options };
  }

  /**
   * 获取当前状态
   * @returns {Object} 当前状态
   */
  getState() {
    return { ...this.state };
  }

  /**
   * 添加事件监听器
   * @param {string} event - 事件名
   * @param {Function} callback - 回调函数
   */
  addEventListener(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);
  }

  /**
   * 移除事件监听器
   * @param {string} event - 事件名
   * @param {Function} callback - 回调函数
   */
  removeEventListener(event, callback) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).delete(callback);
    }
  }

  /**
   * 触发事件
   * @param {string} event - 事件名
   * @param {*} data - 事件数据
   */
  emit(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach((callback) => {
        try {
          callback(data);
        } catch (error) {
          console.error(`TTS: Error in event callback for ${event}:`, error);
        }
      });
    }
  }

  /**
   * 初始化TTS数据结构
   */
  async initializeTTSData() {
    if (this.renderer) {
      await this.preprocessWordsToTTS();
    }
  }

  /**
   * 预处理words数据为TTS数据结构
   * @returns {Promise<boolean>} 处理是否成功
   */
  async preprocessWordsToTTS() {
    if (
      !this.renderer ||
      !this.renderer.fullLayoutData ||
      !this.renderer.fullLayoutData.words
    ) {
      this.ttsDataReady = false;
      return false;
    }

    const words = this.renderer.fullLayoutData.words;
    const wordsHash = this.generateWordsHash(words);

    // 如果数据没有变化，跳过处理
    if (this.lastProcessedWordsHash === wordsHash && this.ttsDataReady) {
      return true;
    }

    try {
      // 检查words数据是否有效
      if (words.length === 0) {
        this.ttsDataReady = false;
        return false;
      }
      // 直接使用words数组进行智能分句，避免中途处理
      const sentences = this.textManager.smartSentenceSplitFromWords(words);

      // 设置预处理的数据
      this.textManager.setCurrentSentences(sentences);
      this.currentSentences = sentences;

      // 更新状态
      this.lastProcessedWordsHash = wordsHash;
      this.ttsDataReady = true;

      console.log(`TTS data preprocessed: ${sentences.length} sentences ready`);
      this.emit('ttsDataReady', { sentenceCount: sentences.length });

      return true;
    } catch (error) {
      console.error('Failed to preprocess TTS data:', error);
      this.ttsDataReady = false;
      return false;
    }
  }

  /**
   * 生成words数据的哈希
   * @param {Array} words - words数组
   * @returns {string} 哈希值
   */
  generateWordsHash(words) {
    if (!words || !Array.isArray(words)) return '';

    // 简单的哈希算法，基于文本内容和长度
    const textContent = words.map((w) => w.text || '').join('');
    let hash = 0;
    for (let i = 0; i < textContent.length; i++) {
      const char = textContent.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return `${hash}_${words.length}`;
  }

  /**
   * 检查并更新TTS数据（如果需要）
   * @returns {Promise<boolean>} 是否更新成功
   */
  async updateTTSDataIfNeeded() {
    if (
      !this.renderer ||
      !this.renderer.fullLayoutData ||
      !this.renderer.fullLayoutData.words
    ) {
      return false;
    }

    const words = this.renderer.fullLayoutData.words;
    const currentHash = this.generateWordsHash(words);

    // 如果数据变化了，重新预处理
    if (this.lastProcessedWordsHash !== currentHash || !this.ttsDataReady) {
      return await this.preprocessWordsToTTS();
    }

    return true;
  }

  /**
   * 设置TTS高亮事件监听
   */
  setupTTSHighlightEvents() {
    // 监听高亮更新事件并转发给Canvas
    window.addEventListener('ttsHighlightUpdate', (event) => {
      const { sentence, focusLines } = event.detail;
      
      // 直接发送给Canvas渲染系统
      window.dispatchEvent(new CustomEvent('renderTTSHighlight', {
        detail: { 
          sentence: sentence,
          focusLines: focusLines 
        }
      }));
      
      // 同时发出通用的高亮更新事件
      this.emit('highlightUpdate', event.detail);
    });

    // 监听清除高亮事件
    window.addEventListener('ttsClearHighlights', () => {
      // 发送给Canvas清除高亮
      window.dispatchEvent(new CustomEvent('clearTTSHighlight'));
      this.emit('clearHighlights');
    });
  }

  /**
   * 从当前阅读位置开始朗读
   * @param {Object} options - 朗读选项
   */
  async speakFromCurrentPosition(options = {}) {
    if (!this.renderer) {
      console.error('TTS: Renderer not available for position reading');
      this.emit('error', '渲染器未初始化');
      return;
    }

    try {
      // 确保TTS数据已准备好
      const dataReady = await this.updateTTSDataIfNeeded();
      if (
        !dataReady ||
        !this.ttsDataReady ||
        this.currentSentences.length === 0
      ) {
        console.warn('TTS: No TTS data available');
        this.emit('error', '当前页面没有可朗读的内容');
        return;
      }

      // 确定起始位置
      let startSentenceIndex = 0;
      const currentWordIndex = this.getCurrentReadingWordIndex();
      if (currentWordIndex >= 0) {
        const targetSentence =
          this.textManager.getSentenceAtWordIndex(currentWordIndex);
        if (targetSentence) {
          startSentenceIndex = targetSentence.index;
        }
      }

      // 更新状态
      this.state.readingMode = 'position';
      this.state.currentPosition = startSentenceIndex;
      this.state.totalSegments = this.currentSentences.length;

      // 从指定位置开始播放
      await this.speakFromSentence(startSentenceIndex, options);
    } catch (error) {
      console.error('TTS: Failed to speak from current position:', error);
      this.emit('error', error.message || '从当前位置朗读失败');
    }
  }

  /**
   * 从指定句子开始播放
   * @param {number} sentenceIndex - 句子索引
   * @param {Object} options - 播放选项
   */
  async speakFromSentence(sentenceIndex = 0, options = {}) {
    if (sentenceIndex >= this.currentSentences.length) {
      console.warn('TTS: Sentence index out of range');
      return;
    }

    const sentence = this.currentSentences[sentenceIndex];
    if (!sentence) {
      console.warn('TTS: Sentence not found at index:', sentenceIndex);
      return;
    }

    // 合并选项
    const mergedOptions = { ...this.options, ...options };

    // 更新状态
    this.state.currentSegment = sentenceIndex;
    this.state.currentText = sentence.text;
    this.state.isPlaying = true;
    this.state.isPaused = false;

    // Web 端立即触发高亮（不等待 Native 反馈）
    this.textManager.highlightSentence(sentenceIndex);

    try {
      // 使用预生成的 SSML
      const ssml = sentence.ssml;

      if (!ssml) {
        console.warn('TTS: No pre-generated SSML found for sentence');
        return;
      }

      console.log('🎵 TTS: Speaking sentence', sentenceIndex + 1, 'of', this.currentSentences.length);
      console.log('📝 TTS: Text:', sentence.text.substring(0, 100) + '...');
      // 发送到 native 进行朗读
      if (window.nativeTTSBridge) {
        window.nativeTTSBridge.speak(ssml);
      } else {
        console.error('TTS: Native bridge not available');
        this.emit('error', 'Native TTS 不可用');
      }

    } catch (error) {
      console.error('TTS: Failed to speak sentence:', error);
      this.state.isPlaying = false;
      this.emit('error', error.message || '句子播放失败');
    }
  }

  /**
   * 处理句子播放完成
   * Native 播放完成后，Web 端自动处理下一句的播放或结束
   */
  handleSentenceFinished() {
    console.log('🏁 TTS: Sentence finished, current:', this.state.currentSegment + 1, 'of', this.currentSentences.length);

    // 检查是否还有下一句
    const nextIndex = this.state.currentSegment + 1;
    if (nextIndex < this.currentSentences.length) {
      // 自动播放下一句
      console.log('➡️ TTS: Auto-playing next sentence');
      this.speakFromSentence(nextIndex);
    } else {
      // 所有句子播放完成
      console.log('🎉 TTS: All sentences completed');
      this.state.isPlaying = false;
      this.state.isPaused = false;
      this.state.progress = 1.0;
      
      // 清除高亮
      this.textManager.clearHighlights();
      
      // 发出完成事件
      this.emit('finished'); // 保持兼容性
    }
  }

  /**
   * 手动更新TTS数据（当页面内容改变时调用）
   * @returns {Promise<boolean>} 是否更新成功
   */
  async refreshTTSData() {
    // 强制重新处理数据
    this.lastProcessedWordsHash = null;
    this.ttsDataReady = false;

    return await this.preprocessWordsToTTS();
  }

  /**
   * 检查TTS数据是否准备就绪
   * @returns {boolean} 数据是否准备好
   */
  isTTSDataReady() {
    return this.ttsDataReady && this.currentSentences.length > 0;
  }

  /**
   * 获取当前TTS句子数据
   * @returns {Array} TTS句子数组
   */
  getTTSSentences() {
    return this.currentSentences;
  }

  /**
   * 获取当前阅读位置对应的word索引
   * @returns {number} word索引
   */
  getCurrentReadingWordIndex() {
    if (
      !this.renderer ||
      !this.renderer.viewport ||
      !this.renderer.fullLayoutData
    ) {
      return 0;
    }

    try {
      const { scrollTop } = this.renderer.viewport.state;
      const words = this.renderer.fullLayoutData.words;

      if (!words || words.length === 0) return 0;

      // 找到第一个在当前可见区域的词
      for (let i = 0; i < words.length; i++) {
        const word = words[i];
        if (word && word.y >= scrollTop) {
          return i;
        }
      }

      return 0;
    } catch (error) {
      console.error('Failed to get current reading word index:', error);
      return 0;
    }
  }


  /**
   * 播放下一句（手动控制）
   */
  async playNextSentence() {
    const nextIndex = this.state.currentSegment + 1;
    if (nextIndex < this.currentSentences.length) {
      // 停止当前播放
      this.stop();
      // 播放下一句
      await this.speakFromSentence(nextIndex);
    } else {
      console.log('🚫 TTS: Already at the last sentence');
      this.emit('lastSentenceReached');
    }
  }

  /**
   * 播放上一句（手动控制）
   */
  async playPreviousSentence() {
    const prevIndex = this.state.currentSegment - 1;
    if (prevIndex >= 0) {
      // 停止当前播放
      this.stop();
      // 播放上一句
      await this.speakFromSentence(prevIndex);
    } else {
      console.log('🚫 TTS: Already at the first sentence');
      this.emit('firstSentenceReached');
    }
  }

  /**
   * 跳转到指定句子
   * @param {number} sentenceIndex - 目标句子索引
   */
  async jumpToSentence(sentenceIndex) {
    if (sentenceIndex >= 0 && sentenceIndex < this.currentSentences.length) {
      // 停止当前播放
      this.stop();
      // 播放目标句子
      await this.speakFromSentence(sentenceIndex);
    } else {
      console.warn('TTS: Invalid sentence index:', sentenceIndex);
    }
  }

  /**
   * 开始 TTS 朗读（主要入口方法）
   * @param {Object} options - 朗读选项
   * @param {boolean} options.fromPosition - 是否从当前阅读位置开始
   * @param {string} options.text - 指定文本（用于选中文本朗读）
   * @param {number} options.startIndex - 指定开始句子索引
   * @returns {Promise<boolean>} 是否成功开始朗读
   */
  async startTTS(options = {}) {
    const { fromPosition = true, text = null, startIndex = 0 } = options;
    
    try {
      if (text) {
        // 选中文本朗读模式
        this.state.readingMode = 'selection';
        await this.speakSelectedText(text, options);
        return true;
      } else {
        // 从位置朗读模式
        this.state.readingMode = 'position';
        
        if (fromPosition) {
          await this.speakFromCurrentPosition(options);
        } else {
          await this.speakFromSentence(startIndex, options);
        }
        return true;
      }
    } catch (error) {
      console.error('TTS: Failed to start TTS:', error);
      this.emit('error', error.message || 'TTS 启动失败');
      return false;
    }
  }

  /**
   * 重写原有的speak方法以支持新的模式（保持兼容性）
   */
  async speak(text, options = {}) {
    return await this.startTTS({ text, ...options });
  }

  /**
   * 选中文本朗读（原有逻辑）
   * @param {string} text - 要播放的文本
   * @param {Object} options - 播放选项
   */
  async speakSelectedText(text, options = {}) {
    if (!text || !text.trim()) {
      console.warn('TTS: No text provided');
      return;
    }

    if (!window.nativeTTSBridge) {
      console.error('TTS: Native bridge not available');
      this.emit('error', 'TTS 功能不可用');
      return;
    }

    // 合并选项
    const mergedOptions = { ...this.options, ...options };

    try {
      // 检测语言
      if (mergedOptions.autoDetectLanguage) {
        mergedOptions.language = this.ssmlBuilder.detectLanguage(text);

        // 根据语言调整默认参数
        const langDefaults = this.ssmlBuilder.getLanguageDefaults(
          mergedOptions.language
        );
        Object.assign(mergedOptions, langDefaults, options); // options 优先级更高
      }

      // 分段处理长文本
      const segments = this.ssmlBuilder.segmentLongText(
        text,
        mergedOptions.segmentMaxLength
      );
      this.textQueue = segments;
      this.currentQueueIndex = 0;

      // 播放第一段
      await this.speakSegment(segments[0], mergedOptions);
    } catch (error) {
      console.error('TTS: Failed to speak text:', error);
      this.emit('error', error.message || '播放失败');
    }
  }

  /**
   * 销毁控制器
   */
  destroy() {
    this.stop();
    this.listeners.clear();

    // 清理文本管理器
    if (this.textManager) {
      this.textManager.clearHighlights();
    }

    // 移除事件监听器
    window.removeEventListener('nativeTTSEvent', this.handleNativeEvent);
    window.removeEventListener(
      'ttsHighlightUpdate',
      this.handleTTSHighlightUpdate
    );
    window.removeEventListener(
      'ttsClearHighlights',
      this.handleTTSClearHighlights
    );
  }
}
