/**
 * TTS文本处理和管理模块
 * 负责FocusLines计算、SSML生成和TTS播放控制
 *
 * 架构更新 - FocusLines 设计：
 * =====================================
 *
 * 问题：原来的 boundingBox 基于像素坐标，主题变更时失效
 * 解决：使用 focusLines 记录基于行的word对象引用
 *
 * focusLines 数据结构：
 * [
 *   {
 *     startWord: word对象,  // 该行第一个词的完整对象引用
 *     endWord: word对象     // 该行最后一个词的完整对象引用
 *   },
 *   // ... 更多行
 * ]
 *
 * 优势：
 * 1. 主题变更时仍然准确（直接引用word对象，获取最新位置）
 * 2. 渲染时逐行计算（每行的 x, y, width, height）
 * 3. 支持多行句子的精确高亮
 * 4. 更简洁的数据结构（无需存储冗余信息）
 * 5. 更高的性能（直接引用，无需索引查找）
 */

import { TextSegmenter } from './segment-text.js';

export class TTSTextManager {
  constructor(renderer, ssmlBuilder = null, options = {}) {
    this.renderer = renderer;
    this.ssmlBuilder = ssmlBuilder;
    this.ttsOptions = options; // TTS播放选项
    this.currentSentences = [];
    this.currentPosition = 0;
    this.highlightedSentenceIndex = -1;

    // 分句参数配置
    const segmentOptions = {
      // 字符长度配置
      minCharLength: 80, // 最小字符长度
      maxCharLength: 400, // 最大字符长度
      preferredCharLength: 200, // 理想字符长度
      secondarySplitCharLength: 400, // 二次切分阈值（字符）

      // 词数配置
      minWordCount: 15, // 最小词数
      maxWordCount: 50, // 最大词数
      preferredWordCount: 30, // 理想词数
      secondarySplitWordCount: 40, // 二次切分阈值（词数）

      // 标点符号配置
      sentenceEndMarkers: ['。', '！', '？', '.', '!', '?'], // 句子结束符
      naturalBreakMarkers: ['，', '；', '、', ',', ';'], // 自然断点符

      ...options.segmentOptions // 允许外部覆盖分句选项
    };

    // 初始化文本分句器
    this.textSegmenter = new TextSegmenter(segmentOptions);
  }

  /**
   * 基于words数组的智能分句算法
   * @param {Array} words - words数组，每个word包含text和坐标信息
   * @returns {Array} 分句结果数组
   */
  smartSentenceSplitFromWords(words) {
    if (!words || !Array.isArray(words) || words.length === 0) {
      return [];
    }

    // 使用TextSegmenter进行分句
    const baseSentences = this.textSegmenter.segmentFromWords(words);

    // 为每个句子添加TTS特定的属性
    const enhancedSentences = baseSentences.map((sentence, index) => {
      return this.enhanceSentenceWithTTSData(sentence, index);
    });

    return enhancedSentences;
  }

  /**
   * 为句子添加TTS相关的数据（focusLines, SSML等）
   * @param {Object} sentence - 基础句子对象
   * @param {number} sentenceIndex - 句子索引
   * @returns {Object} 增强后的句子对象
   */
  enhanceSentenceWithTTSData(sentence, sentenceIndex) {
    const focusLines = this.calculateFocusLinesFromWords(sentence.words);
    
    // 生成 SSML 属性
    const ssmlAttrs = this.generateSSML(sentence.text, sentenceIndex);

    // 如果有 SSMLBuilder，生成完整的 SSML 字符串
    const ssmlString = this.buildFullSSML(sentence.text, ssmlAttrs);

    return {
      ...sentence,
      focusLines: focusLines, // 基于行的焦点框信息
      ssmlAttrs: ssmlAttrs, // SSML 属性（保留用于调试）
      ssml: ssmlString, // 完整的 SSML 字符串
      highlighted: false,
    };
  }


  /**
   * 从words数组计算焦点行（基于行的结构化信息）
   * @param {Array} words - words数组
   * @returns {Array} 焦点行数组，每个元素包含该行的起始和结束word对象
   */
  calculateFocusLinesFromWords(words) {
    if (!words || words.length === 0) {
      return [];
    }

    // 按 y 坐标分组成行
    const lines = [];
    const line = {
      startWordId: '',
      endWordId: '',
    };
    words.forEach((word) => {
      if (!line.startWordId) {
        line.startWordId = word.wordId;
        line.endWordId = word.wordId;
        return;
      }
      if (line.endWordId === word.wordId) {
        line.endWordId = word.wordId;
      } else {
        lines.push({...line});
        line.startWordId = word.wordId;
        line.endWordId = word.wordId;
      }
    });
    lines.push({ ...line });

    return lines;
  }


  /**
   * 生成SSML标记
   * @param {string} text - 文本内容
   * @param {number} index - 句子索引
   * @returns {Object} SSML属性
   */
  generateSSML(text, index) {
    const language = this.detectLanguage(text);
    const rate = this.calculateSpeechRate(text);
    const pauseDuration = this.calculatePauseDuration(text, index);

    return {
      language: language,
      rate: rate,
      pitch: '0Hz',
      volume: '100%',
      pauseBefore: index > 0 ? pauseDuration : '0ms',
      pauseAfter: '300ms',
      emphasis: this.detectEmphasis(text),
    };
  }

  /**
   * 构建完整的SSML字符串
   * @param {string} text - 文本内容
   * @param {Object} ssmlAttrs - SSML属性
   * @returns {string} 完整的SSML字符串
   */
  buildFullSSML(text, ssmlAttrs) {
    if (!this.ssmlBuilder) {
      // 如果没有 SSMLBuilder，返回简单的文本包装
      return `<speak xml:lang="${ssmlAttrs.language}">${text}</speak>`;
    }

    // 合并默认选项和 SSML 属性
    const finalOptions = {
      ...this.ttsOptions,
      language: ssmlAttrs.language,
      rate: ssmlAttrs.rate,
      pitch: ssmlAttrs.pitch,
      volume: ssmlAttrs.volume,
    };

    // 添加停顿标记
    let processedText = text;
    if (ssmlAttrs.pauseBefore && ssmlAttrs.pauseBefore !== '0ms') {
      processedText = `<break time="${ssmlAttrs.pauseBefore}"/>${processedText}`;
    }
    if (ssmlAttrs.pauseAfter && ssmlAttrs.pauseAfter !== '0ms') {
      processedText = `${processedText}<break time="${ssmlAttrs.pauseAfter}"/>`;
    }

    // 添加强调标记
    if (ssmlAttrs.emphasis && ssmlAttrs.emphasis !== 'none') {
      processedText = `<emphasis level="${ssmlAttrs.emphasis}">${processedText}</emphasis>`;
    }

    // 使用 SSMLBuilder 构建完整的 SSML
    return this.ssmlBuilder.build(processedText, finalOptions);
  }

  /**
   * 检测文本语言
   * @param {string} text - 文本
   * @returns {string} 语言代码
   */
  detectLanguage(text) {
    const chineseRegex = /[\u4e00-\u9fff]/;
    const englishRegex = /[a-zA-Z]/;

    const chineseCount = (text.match(chineseRegex) || []).length;
    const englishCount = (text.match(englishRegex) || []).length;

    if (chineseCount > englishCount) {
      return 'zh-CN';
    } else if (englishCount > 0) {
      return 'en-US';
    }

    return 'zh-CN'; // 默认中文
  }

  /**
   * 计算语音速度
   * @param {string} text - 文本
   * @returns {string} 语音速度
   */
  calculateSpeechRate(text) {
    // 根据文本长度和标点密度调整语速
    const punctuationCount = (text.match(/[，。；！？、,;!?]/g) || []).length;
    const punctuationRatio = punctuationCount / text.length;

    if (punctuationRatio > 0.1) {
      return '90%'; // 标点较多，放慢语速
    } else if (text.length > 100) {
      return '95%'; // 长句子，略微放慢
    }

    return '100%';
  }

  /**
   * 计算停顿时长
   * @param {string} text - 文本
   * @param {number} index - 句子索引
   * @returns {string} 停顿时长
   */
  calculatePauseDuration(text, index) {
    if (index === 0) return '0ms';

    // 根据句子结束符类型调整停顿
    const lastChar = text.slice(-1);
    switch (lastChar) {
      case '。':
      case '.':
        return '500ms';
      case '！':
      case '!':
        return '600ms';
      case '？':
      case '?':
        return '600ms';
      case '；':
      case ';':
        return '400ms';
      default:
        return '300ms';
    }
  }

  /**
   * 检测文本强调
   * @param {string} text - 文本
   * @returns {string} 强调级别
   */
  detectEmphasis(text) {
    // 检测是否包含强调标记
    if (text.includes('！') || text.includes('!')) {
      return 'strong';
    } else if (text.includes('？') || text.includes('?')) {
      return 'moderate';
    }
    return 'none';
  }


  /**
   * 根据word索引获取句子
   * @param {number} wordIndex - word索引位置
   * @returns {Object|null} 句子对象
   */
  getSentenceAtWordIndex(wordIndex) {
    return this.textSegmenter.getSentenceAtWordIndex(this.currentSentences, wordIndex);
  }

  /**
   * 设置当前分句数据
   * @param {Array} sentences - 句子数组
   */
  setCurrentSentences(sentences) {
    this.currentSentences = sentences;
    this.currentPosition = 0;
    this.highlightedSentenceIndex = -1;
  }

  /**
   * 高亮指定句子
   * @param {number} sentenceIndex - 句子索引
   */
  highlightSentence(sentenceIndex) {
    // 取消之前的高亮
    if (this.highlightedSentenceIndex >= 0) {
      this.currentSentences[this.highlightedSentenceIndex].highlighted = false;
    }

    // 设置新的高亮
    if (sentenceIndex >= 0 && sentenceIndex < this.currentSentences.length) {
      this.currentSentences[sentenceIndex].highlighted = true;
      this.highlightedSentenceIndex = sentenceIndex;
      this.currentPosition = sentenceIndex;

      // 触发高亮渲染事件
      this.triggerHighlightUpdate(this.currentSentences[sentenceIndex]);
    }
  }

  /**
   * 触发高亮更新
   * @param {Object} sentence - 当前高亮的句子
   */
  triggerHighlightUpdate(sentence) {
    if (this.renderer && sentence.focusLines) {
      // 发送高亮更新事件
      window.dispatchEvent(
        new CustomEvent('ttsHighlightUpdate', {
          detail: {
            sentence: sentence,
            focusLines: sentence.focusLines, // 传递焦点行信息
          },
        })
      );
    }
  }

  /**
   * 清除所有高亮
   */
  clearHighlights() {
    this.currentSentences.forEach((sentence) => {
      sentence.highlighted = false;
    });
    this.highlightedSentenceIndex = -1;

    // 触发清除高亮事件
    window.dispatchEvent(new CustomEvent('ttsClearHighlights'));
  }

  /**
   * 重新生成已存在句子的 SSML（当选项变更时使用）
   */
  regenerateSSMLForExistingSentences() {
    if (!this.currentSentences || this.currentSentences.length === 0) {
      return;
    }

    this.currentSentences.forEach((sentence, index) => {
      if (sentence.ssmlAttrs && sentence.text) {
        // 重新生成 SSML 属性（可能会根据新选项调整）
        const newSSMLAttrs = this.generateSSML(sentence.text, index);

        // 重新构建完整的 SSML 字符串
        const newSSML = this.buildFullSSML(sentence.text, newSSMLAttrs);

        // 更新句子对象
        sentence.ssmlAttrs = newSSMLAttrs;
        sentence.ssml = newSSML;
      }
    });

    console.log(
      `🔄 TTS: Regenerated SSML for ${this.currentSentences.length} sentences`
    );
  }
}
