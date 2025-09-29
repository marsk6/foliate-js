/**
 * TTS文本处理和管理模块
 * 负责智能分句、FocusLines计算和SSML生成
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

export class TTSTextManager {
  constructor(renderer, ssmlBuilder = null, options = {}) {
    this.renderer = renderer;
    this.ssmlBuilder = ssmlBuilder;
    this.ttsOptions = options; // TTS播放选项
    this.currentSentences = [];
    this.currentPosition = 0;
    this.highlightedSentenceIndex = -1;

    // 分句参数配置
    this.options = {
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
    };
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

    const sentences = [];
    let currentSentence = {
      text: '',
      words: [],
      startWordIndex: 0,
      endWordIndex: 0,
      length: 0,
    };

    for (let wordIndex = 0; wordIndex < words.length; wordIndex++) {
      const word = words[wordIndex];
      const wordText = word.text || '';

      // 添加当前word到句子
      currentSentence.text += wordText;
      currentSentence.words.push(word);
      currentSentence.endWordIndex = wordIndex;
      currentSentence.length = currentSentence.text.length;

      // 检查是否应该在此处分句
      const shouldBreak = this.shouldBreakAtWord(
        word,
        wordText,
        currentSentence,
        words,
        wordIndex,
        sentences.length === 0
      );

      if (shouldBreak) {
        // 创建完整的句子对象
        const sentence = this.createSentenceFromWords(
          currentSentence,
          sentences.length
        );

        sentences.push(sentence);

        // 重置为下一个句子
        currentSentence = {
          text: '',
          words: [],
          startWordIndex: wordIndex + 1,
          endWordIndex: wordIndex + 1,
          length: 0,
        };
      }
    }

    // 处理最后一个句子
    if (currentSentence.text.trim() && currentSentence.words.length > 0) {
      const sentence = this.createSentenceFromWords(
        currentSentence,
        sentences.length
      );
      sentences.push(sentence);
    }

    // 后处理：合并过短的句子，分割过长的句子
    const processedSentences = this.postProcessSentencesFromWords(sentences);

    return processedSentences;
  }

  /**
   * 判断是否应该在当前word处分句
   * @param {Object} word - 当前word对象
   * @param {string} wordText - word文本
   * @param {Object} currentSentence - 当前句子状态
   * @param {Array} allWords - 所有words数组
   * @param {number} wordIndex - 当前word索引
   * @param {boolean} isFirstSentence - 是否为第一个句子
   * @returns {boolean}
   */
  shouldBreakAtWord(
    word,
    wordText,
    currentSentence,
    allWords,
    wordIndex,
    isFirstSentence
  ) {
    // 检查是否包含句子结束标记
    const hasSentenceEnd = this.options.sentenceEndMarkers.some((marker) =>
      wordText.includes(marker)
    );

    if (!hasSentenceEnd) {
      return false;
    }

    const currentCharLength = currentSentence.length;
    const currentWordCount = currentSentence.words.length;

    // 太短不分割（字符数和词数都要考虑）
    if (
      (currentCharLength < this.options.minCharLength ||
        currentWordCount < this.options.minWordCount) &&
      !isFirstSentence
    ) {
      return false;
    }

    // 超过最大长度必须分割（字符数或词数任一超限）
    if (
      currentCharLength >= this.options.maxCharLength ||
      currentWordCount >= this.options.maxWordCount
    ) {
      return true;
    }

    // 在理想长度附近，寻找自然断点（字符数和词数都达到理想范围）
    if (
      currentCharLength >= this.options.preferredCharLength ||
      currentWordCount >= this.options.preferredWordCount
    ) {
      return true;
    }

    // 检查后续内容是否会导致过长
    if (
      this.wouldExceedMaxLength(
        allWords,
        wordIndex + 1,
        currentCharLength,
        currentWordCount
      )
    ) {
      return true;
    }

    // 检查是否在段落边界（基于word的y坐标变化或特殊标记）
    if (this.isAtParagraphBoundary(word, allWords, wordIndex)) {
      return (
        currentCharLength >= this.options.minCharLength &&
        currentWordCount >= this.options.minWordCount
      );
    }

    return false;
  }

  /**
   * 检查后续内容是否会导致句子过长
   * @param {Array} allWords - 所有words
   * @param {number} startIndex - 起始索引
   * @param {number} currentCharLength - 当前字符长度
   * @param {number} currentWordCount - 当前词数
   * @returns {boolean}
   */
  wouldExceedMaxLength(
    allWords,
    startIndex,
    currentCharLength,
    currentWordCount
  ) {
    let additionalCharLength = 0;
    let additionalWordCount = 0;

    for (let i = startIndex; i < allWords.length && i < startIndex + 50; i++) {
      const word = allWords[i];
      const wordText = word.text || '';
      additionalCharLength += wordText.length;
      additionalWordCount += 1;

      // 如果遇到句子结束符，停止计算
      if (
        this.options.sentenceEndMarkers.some((marker) =>
          wordText.includes(marker)
        )
      ) {
        break;
      }

      // 如果当前长度 + 额外长度超过最大值（字符数或词数任一超限）
      if (
        currentCharLength + additionalCharLength > this.options.maxCharLength ||
        currentWordCount + additionalWordCount > this.options.maxWordCount
      ) {
        return true;
      }
    }

    return false;
  }

  /**
   * 检查是否在段落边界
   * @param {Object} word - 当前word
   * @param {Array} allWords - 所有words
   * @param {number} wordIndex - word索引
   * @returns {boolean}
   */
  isAtParagraphBoundary(word, allWords, wordIndex) {
    if (wordIndex >= allWords.length - 1) {
      return true; // 最后一个word
    }

    const nextWord = allWords[wordIndex + 1];
    if (!word || !nextWord) {
      return false;
    }

    // 检查y坐标是否有显著变化（可能是新段落）
    const yDiff = Math.abs((nextWord.y || 0) - (word.y || 0));
    const lineHeight = word.height || 20; // 估算行高

    // 如果y坐标差异超过1.5倍行高，可能是段落分隔
    if (yDiff > lineHeight * 1.5) {
      return true;
    }

    // 检查是否有特殊的段落标记（如大量空格）
    const wordText = word.text || '';
    const nextWordText = nextWord.text || '';

    if (wordText.match(/\n\s*\n/) || nextWordText.match(/^\s{4,}/)) {
      return true;
    }

    return false;
  }

  /**
   * 从words数据创建句子对象
   * @param {Object} sentenceData - 句子数据
   * @param {number} sentenceIndex - 句子索引
   * @returns {Object} 句子对象
   */
  createSentenceFromWords(sentenceData, sentenceIndex) {
    const { text, words, startWordIndex, endWordIndex } = sentenceData;
    const focusLines = this.calculateFocusLinesFromWords(words);
    const trimmedText = text.trim();

    // 生成 SSML 属性
    const ssmlAttrs = this.generateSSML(trimmedText, sentenceIndex);

    // 如果有 SSMLBuilder，生成完整的 SSML 字符串
    const ssmlString = this.buildFullSSML(trimmedText, ssmlAttrs);

    return {
      id: `sentence_${sentenceIndex}`,
      index: sentenceIndex,
      text: trimmedText,
      startWordIndex: startWordIndex,
      endWordIndex: endWordIndex,
      length: trimmedText.length, // 字符长度
      wordCount: words ? words.length : 0, // 词数
      words: words,
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
      startWord: null,
      endWord: null,
    };
    words.forEach((word) => {
      if (!line.startWord) {
        line.startWord = word;
        line.endWord = word;
        return;
      }
      if (line.endWord.y === word.y) {
        line.endWord = word;
      } else {
        lines.push({...line});
        line.startWord = word;
        line.endWord = word;
      }
    });
    lines.push({ ...line });

    return lines;
  }

  /**
   * 判断是否为句子结束符
   * @param {string} char - 字符
   * @returns {boolean}
   */
  isSentenceEnd(char) {
    return this.options.sentenceEndMarkers.includes(char);
  }

  /**
   * 判断是否为自然断点符号
   * @param {string} char - 字符
   * @returns {boolean}
   */
  isNaturalBreak(char) {
    return this.options.naturalBreakMarkers.includes(char);
  }

  /**
   * 判断是否可以在当前位置切分
   * @param {string} currentSegment - 当前片段
   * @param {string} fullText - 完整文本
   * @param {number} position - 当前位置
   * @param {boolean} isFirstSentence - 是否为第一个句子
   * @returns {boolean}
   */
  canBreakAtPosition(currentSegment, fullText, position, isFirstSentence) {
    const length = currentSegment.length;

    // 太短不分割（除非是第一个句子且已达到最小长度）
    if (length < this.options.minCharLength && !isFirstSentence) {
      return false;
    }

    // 超过最大长度必须分割
    if (length >= this.options.maxCharLength) {
      return true;
    }

    // 在理想长度附近，寻找自然断点
    if (length >= this.options.preferredCharLength) {
      return true;
    }

    // 如果当前长度适中，检查后续内容是否会导致过长
    const remainingText = fullText.substring(position + 1);
    const nextSentenceEnd = this.findNextSentenceEnd(remainingText);

    if (
      nextSentenceEnd > 0 &&
      length + nextSentenceEnd > this.options.maxCharLength
    ) {
      return true;
    }

    return false;
  }

  /**
   * 查找下一个句子结束位置
   * @param {string} text - 文本
   * @returns {number} 下一个句子结束位置
   */
  findNextSentenceEnd(text) {
    for (let i = 0; i < text.length; i++) {
      if (this.isSentenceEnd(text[i])) {
        return i;
      }
    }
    return text.length;
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
   * 基于words的后处理句子数组
   * @param {Array} sentences - 原始句子数组
   * @returns {Array} 处理后的句子数组
   */
  postProcessSentencesFromWords(sentences) {
    const processed = [];
    let i = 0;

    while (i < sentences.length) {
      const current = sentences[i];
      const currentCharLength = current.length;
      const currentWordCount = current.words ? current.words.length : 0;

      // 处理过短的句子（字符数或词数不足）
      if (
        (currentCharLength < this.options.minCharLength ||
          currentWordCount < this.options.minWordCount) &&
        i < sentences.length - 1
      ) {
        const next = sentences[i + 1];
        const merged = this.mergeSentencesFromWords(current, next);
        const mergedCharLength = merged.length;
        const mergedWordCount = merged.words ? merged.words.length : 0;

        // 合并后不能超过最大限制
        if (
          mergedCharLength <= this.options.maxCharLength &&
          mergedWordCount <= this.options.maxWordCount
        ) {
          processed.push(merged);
          i += 2; // 跳过下一个句子
          continue;
        }
      }

      // 处理过长的句子（需要二次切分：字符数>400或词数>40）
      if (
        currentCharLength > this.options.secondarySplitCharLength ||
        currentWordCount > this.options.secondarySplitWordCount
      ) {
        const split = this.splitLongSentenceFromWords(current);
        processed.push(...split);
      } else {
        processed.push(current);
      }

      i++;
    }

    // 重新分配索引
    processed.forEach((sentence, index) => {
      sentence.index = index;
      sentence.id = `sentence_${index}`;
    });

    return processed;
  }

  /**
   * 基于words合并两个句子
   * @param {Object} sentence1 - 第一个句子
   * @param {Object} sentence2 - 第二个句子
   * @returns {Object} 合并后的句子
   */
  mergeSentencesFromWords(sentence1, sentence2) {
    const mergedText = sentence1.text + ' ' + sentence2.text;
    const mergedWords = [...sentence1.words, ...sentence2.words];

    return this.createSentenceFromWords(
      {
        text: mergedText,
        words: mergedWords,
        startWordIndex: sentence1.startWordIndex,
        endWordIndex: sentence2.endWordIndex,
      },
      sentence1.index
    );
  }

  /**
   * 基于words分割过长的句子
   * @param {Object} sentence - 长句子
   * @returns {Array} 分割后的句子数组
   */
  splitLongSentenceFromWords(sentence) {
    const words = sentence.words;
    if (!words || words.length === 0) {
      return [sentence];
    }

    // 寻找自然分割点（包含逗号、分号等的word）
    const naturalBreakIndices = [];
    words.forEach((word, index) => {
      const wordText = word.text || '';
      if (
        this.options.naturalBreakMarkers.some((marker) =>
          wordText.includes(marker)
        )
      ) {
        naturalBreakIndices.push(index);
      }
    });

    if (naturalBreakIndices.length === 0) {
      // 没有自然分割点，按长度强制分割
      return this.forceSplitSentenceFromWords(sentence);
    }

    // 选择最佳分割点（以字符数为主，词数为辅）
    const targetCharLength = Math.floor(this.options.preferredCharLength);
    const targetWordCount = Math.floor(this.options.preferredWordCount);
    let bestBreakIndex = -1;
    let bestScore = Infinity;

    for (const breakIndex of naturalBreakIndices) {
      // 计算到这个分割点的字符长度和词数
      let charLengthToBreak = 0;
      let wordCountToBreak = breakIndex + 1;

      for (let i = 0; i <= breakIndex; i++) {
        charLengthToBreak += (words[i].text || '').length;
      }

      // 检查是否在合理范围内
      if (
        charLengthToBreak >= this.options.minCharLength &&
        charLengthToBreak <= this.options.maxCharLength &&
        wordCountToBreak >= this.options.minWordCount &&
        wordCountToBreak <= this.options.maxWordCount
      ) {
        // 计算与理想长度的距离（字符数权重更高）
        const charDistance = Math.abs(charLengthToBreak - targetCharLength);
        const wordDistance = Math.abs(wordCountToBreak - targetWordCount) * 10; // 词数权重较低
        const score = charDistance + wordDistance;

        if (bestBreakIndex === -1 || score < bestScore) {
          bestBreakIndex = breakIndex;
          bestScore = score;
        }
      }
    }

    if (bestBreakIndex === -1) {
      // 没找到合适的分割点
      return [sentence];
    }

    // 在最佳分割点分割
    const firstWords = words.slice(0, bestBreakIndex + 1);
    const secondWords = words.slice(bestBreakIndex + 1);

    const results = [];

    if (firstWords.length > 0) {
      const firstText = firstWords.map((w) => w.text || '').join('');
      results.push(
        this.createSentenceFromWords(
          {
            text: firstText,
            words: firstWords,
            startWordIndex: sentence.startWordIndex,
            endWordIndex: sentence.startWordIndex + bestBreakIndex,
          },
          sentence.index
        )
      );
    }

    if (secondWords.length > 0) {
      const secondText = secondWords.map((w) => w.text || '').join('');
      results.push(
        this.createSentenceFromWords(
          {
            text: secondText,
            words: secondWords,
            startWordIndex: sentence.startWordIndex + bestBreakIndex + 1,
            endWordIndex: sentence.endWordIndex,
          },
          sentence.index + 1
        )
      );
    }

    return results;
  }

  /**
   * 强制分割句子（基于words）
   * @param {Object} sentence - 句子对象
   * @returns {Array} 分割结果
   */
  forceSplitSentenceFromWords(sentence) {
    const words = sentence.words;
    const targetWordsPerSentence = Math.ceil(words.length / 2); // 简单的对半分

    const results = [];
    let start = 0;

    while (start < words.length) {
      const end = Math.min(start + targetWordsPerSentence, words.length);
      const partWords = words.slice(start, end);
      const partText = partWords.map((w) => w.text || '').join('');

      results.push(
        this.createSentenceFromWords(
          {
            text: partText,
            words: partWords,
            startWordIndex: sentence.startWordIndex + start,
            endWordIndex: sentence.startWordIndex + end - 1,
          },
          sentence.index + results.length
        )
      );

      start = end;
    }

    return results;
  }

  /**
   * 根据word索引获取句子
   * @param {number} wordIndex - word索引位置
   * @returns {Object|null} 句子对象
   */
  getSentenceAtWordIndex(wordIndex) {
    return this.currentSentences.find(
      (sentence) =>
        wordIndex >= sentence.startWordIndex &&
        wordIndex <= sentence.endWordIndex
    );
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
