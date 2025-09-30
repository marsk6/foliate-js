/**
 * 英语文本智能分句算法模块
 * 
 * 功能特点：
 * - 专为英语文本优化的分句算法
 * - 支持缩写识别（Dr., Mr., U.S.等）
 * - 分句优先级：强制分句点 → 建议分句点 → 弱分句点
 * - 理想长度控制：15-30个单词，最大50个单词
 * - 连词识别和智能切分
 */

export class TextSegmenter {
  constructor(options = {}) {
    // 分句参数配置
    this.options = {
      // 词数配置（英语优化）
      minWordCount: 15, // 最小词数
      maxWordCount: 50, // 最大词数
      preferredMinWordCount: 15, // 理想最小词数
      preferredMaxWordCount: 30, // 理想最大词数
      
      // 字符长度配置（作为辅助参考）
      minCharLength: 80, // 最小字符长度
      maxCharLength: 400, // 最大字符长度
      preferredCharLength: 200, // 理想字符长度

      // 强制分句点（句号、问号、感叹号）
      forcedBreakMarkers: ['.', '?', '!'],
      
      // 建议分句点（分号、冒号）
      suggestedBreakMarkers: [';', ':'],
      
      // 弱分句点（逗号）
      weakBreakMarkers: [','],
      
      // 连词（弱分句点）
      conjunctions: ['and', 'but', 'or', 'nor', 'for', 'yet', 'so'],

      ...options
    };

    // 英语缩写词典
    this.abbreviations = new Set([
      // 称谓
      'Mr.', 'Mrs.', 'Ms.', 'Dr.', 'Prof.', 'Rev.', 'Sr.', 'Jr.',
      // 地理
      'U.S.', 'U.K.', 'U.S.A.', 'N.Y.', 'L.A.', 'D.C.',
      // 时间
      'a.m.', 'p.m.', 'A.M.', 'P.M.',
      // 常见缩写
      'etc.', 'e.g.', 'i.e.', 'vs.', 'Inc.', 'Ltd.', 'Co.',
      'Jan.', 'Feb.', 'Mar.', 'Apr.', 'Jun.', 'Jul.', 'Aug.', 'Sep.', 'Oct.', 'Nov.', 'Dec.',
      'Mon.', 'Tue.', 'Wed.', 'Thu.', 'Fri.', 'Sat.', 'Sun.'
    ]);
  }

  /**
   * 基于words数组的智能分句算法
   * @param {Array} words - words数组，每个word包含text和坐标信息
   * @returns {Array} 分句结果数组
   */
  segmentFromWords(words) {
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
        const sentence = this.createSentence(
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
      const sentence = this.createSentence(
        currentSentence,
        sentences.length
      );
      sentences.push(sentence);
    }

    // 后处理：合并过短的句子，分割过长的句子
    const processedSentences = this.postProcessSentences(sentences);

    return processedSentences;
  }

  /**
   * 判断是否应该在当前word处分句（英语优化版）
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
    const currentWordCount = currentSentence.words.length;
    
    // 1. 检查强制分句点（., ?, !）
    const breakInfo = this.analyzeBreakPoints(wordText, wordIndex, allWords);
    
    if (breakInfo.hasForcedBreak) {
      // 检查是否为缩写，如果是缩写则不分句
      if (this.isAbbreviation(wordText)) {
        return false;
      }
      
      // 强制分句点：如果句子已经有最小长度，就分句
      if (currentWordCount >= this.options.minWordCount || isFirstSentence) {
        return true;
      }
    }
    
    // 2. 长度检查：超过最大长度必须分句
    if (currentWordCount >= this.options.maxWordCount) {
      // 在任何可用的分句点分句
      if (breakInfo.hasForcedBreak || breakInfo.hasSuggestedBreak || breakInfo.hasWeakBreak) {
        return !this.isAbbreviation(wordText);
      }
      // 如果没有分句点，也要强制分句
      return true;
    }
    
    // 3. 理想长度范围内的智能分句
    if (currentWordCount >= this.options.preferredMaxWordCount) {
      // 优先在建议分句点分句
      if (breakInfo.hasSuggestedBreak) {
        return true;
      }
      // 其次在强制分句点分句
      if (breakInfo.hasForcedBreak && !this.isAbbreviation(wordText)) {
        return true;
      }
      // 检查后续内容，如果会导致过长，在弱分句点分句
      if (breakInfo.hasWeakBreak && this.wouldExceedIdealLength(allWords, wordIndex + 1, currentWordCount)) {
        return true;
      }
    }
    
    // 4. 段落边界检查
    if (this.isAtParagraphBoundary(word, allWords, wordIndex)) {
      if (currentWordCount >= this.options.minWordCount && 
          (breakInfo.hasForcedBreak || breakInfo.hasSuggestedBreak)) {
        return !this.isAbbreviation(wordText);
      }
    }
    
    return false;
  }

  /**
   * 分析当前word的分句点类型
   * @param {string} wordText - word文本
   * @param {number} wordIndex - word索引
   * @param {Array} allWords - 所有words
   * @returns {Object} 分句点分析结果
   */
  analyzeBreakPoints(wordText, wordIndex, allWords) {
    const result = {
      hasForcedBreak: false,
      hasSuggestedBreak: false,
      hasWeakBreak: false,
      conjunctionBreak: false
    };
    
    // 检查强制分句点
    result.hasForcedBreak = this.options.forcedBreakMarkers.some(marker => 
      wordText.includes(marker)
    );
    
    // 检查建议分句点
    result.hasSuggestedBreak = this.options.suggestedBreakMarkers.some(marker => 
      wordText.includes(marker)
    );
    
    // 检查弱分句点（逗号）
    result.hasWeakBreak = this.options.weakBreakMarkers.some(marker => 
      wordText.includes(marker)
    );
    
    // 检查连词
    const cleanWord = wordText.toLowerCase().replace(/[^\w]/g, '');
    result.conjunctionBreak = this.options.conjunctions.includes(cleanWord);
    
    // 连词也算作弱分句点
    if (result.conjunctionBreak) {
      result.hasWeakBreak = true;
    }
    
    return result;
  }

  /**
   * 检查是否为英语缩写
   * @param {string} wordText - word文本
   * @returns {boolean}
   */
  isAbbreviation(wordText) {
    const trimmed = wordText.trim();
    
    // 直接查找缩写词典
    if (this.abbreviations.has(trimmed)) {
      return true;
    }
    
    // 检查常见缩写模式
    // 1. 单个字母+点的模式（如 A. B. C.）
    if (/^[A-Z]\.$/.test(trimmed)) {
      return true;
    }
    
    // 2. 数字+点的模式（如 1. 2. 3.）
    if (/^\d+\.$/.test(trimmed)) {
      return true;
    }
    
    // 3. 短的大写字母组合+点（如 NASA. FBI.）
    if (/^[A-Z]{2,5}\.$/.test(trimmed)) {
      return true;
    }
    
    return false;
  }

  /**
   * 检查后续内容是否会导致超过理想长度
   * @param {Array} allWords - 所有words
   * @param {number} startIndex - 起始索引
   * @param {number} currentWordCount - 当前词数
   * @returns {boolean}
   */
  wouldExceedIdealLength(allWords, startIndex, currentWordCount) {
    let additionalWordCount = 0;
    const lookAheadLimit = Math.min(startIndex + 20, allWords.length);
    
    for (let i = startIndex; i < lookAheadLimit; i++) {
      const word = allWords[i];
      const wordText = word.text || '';
      additionalWordCount += 1;
      
      // 如果遇到强制或建议分句点，停止计算
      const breakInfo = this.analyzeBreakPoints(wordText, i, allWords);
      if ((breakInfo.hasForcedBreak && !this.isAbbreviation(wordText)) || 
          breakInfo.hasSuggestedBreak) {
        break;
      }
      
      // 如果当前长度 + 额外长度超过理想最大长度
      if (currentWordCount + additionalWordCount > this.options.preferredMaxWordCount) {
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
  createSentence(sentenceData, sentenceIndex) {
    const { text, words, startWordIndex, endWordIndex } = sentenceData;
    const trimmedText = text.trim();

    return {
      id: `sentence_${sentenceIndex}`,
      index: sentenceIndex,
      text: trimmedText,
      startWordIndex: startWordIndex,
      endWordIndex: endWordIndex,
      length: trimmedText.length, // 字符长度
      wordCount: words ? words.length : 0, // 词数
      words: words,
    };
  }

  /**
   * 基于words的后处理句子数组（英语优化版）
   * @param {Array} sentences - 原始句子数组
   * @returns {Array} 处理后的句子数组
   */
  postProcessSentences(sentences) {
    const processed = [];
    let i = 0;

    while (i < sentences.length) {
      const current = sentences[i];
      const currentWordCount = current.words ? current.words.length : 0;

      // 处理过短的句子（词数不足）
      if (currentWordCount < this.options.minWordCount && i < sentences.length - 1) {
        const next = sentences[i + 1];
        const merged = this.mergeSentences(current, next);
        const mergedWordCount = merged.words ? merged.words.length : 0;

        // 合并后不能超过最大限制
        if (mergedWordCount <= this.options.maxWordCount) {
          processed.push(merged);
          i += 2; // 跳过下一个句子
          continue;
        }
      }

      // 处理过长的句子
      if (currentWordCount > this.options.maxWordCount) {
        const split = this.splitLongSentence(current);
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
  mergeSentences(sentence1, sentence2) {
    const mergedText = sentence1.text + ' ' + sentence2.text;
    const mergedWords = [...sentence1.words, ...sentence2.words];

    return this.createSentence(
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
   * 基于words分割过长的句子（英语优先级版）
   * @param {Object} sentence - 长句子
   * @returns {Array} 分割后的句子数组
   */
  splitLongSentence(sentence) {
    const words = sentence.words;
    if (!words || words.length === 0) {
      return [sentence];
    }

    // 按优先级收集分割点：; → : → , → and/but
    const breakPoints = this.collectBreakPointsByPriority(words);
    
    if (breakPoints.length === 0) {
      // 没有自然分割点，按长度强制分割
      return this.forceSplitSentence(sentence);
    }

    // 选择最佳分割点
    const bestBreakIndex = this.selectBestBreakPoint(breakPoints, words);
    
    if (bestBreakIndex === -1) {
      return [sentence];
    }

    // 在最佳分割点分割
    const firstWords = words.slice(0, bestBreakIndex + 1);
    const secondWords = words.slice(bestBreakIndex + 1);

    const results = [];

    if (firstWords.length > 0) {
      const firstText = firstWords.map((w) => w.text || '').join('');
      results.push(
        this.createSentence(
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
      const secondPart = this.createSentence(
        {
          text: secondText,
          words: secondWords,
          startWordIndex: sentence.startWordIndex + bestBreakIndex + 1,
          endWordIndex: sentence.endWordIndex,
        },
        sentence.index + 1
      );
      
      // 递归处理第二部分，如果它仍然过长
      if (secondWords.length > this.options.maxWordCount) {
        const furtherSplit = this.splitLongSentence(secondPart);
        results.push(...furtherSplit);
      } else {
        results.push(secondPart);
      }
    }

    return results;
  }

  /**
   * 按优先级收集分割点
   * @param {Array} words - words数组
   * @returns {Array} 分割点数组，按优先级排序
   */
  collectBreakPointsByPriority(words) {
    const breakPoints = [];
    
    words.forEach((word, index) => {
      const wordText = word.text || '';
      const breakInfo = this.analyzeBreakPoints(wordText, index, words);
      
      if (breakInfo.hasForcedBreak && !this.isAbbreviation(wordText)) {
        breakPoints.push({ index, priority: 1, type: 'forced' });
      } else if (breakInfo.hasSuggestedBreak) {
        const priority = wordText.includes(';') ? 2 : 3; // ; 优先于 :
        breakPoints.push({ index, priority, type: 'suggested' });
      } else if (breakInfo.hasWeakBreak) {
        const priority = breakInfo.conjunctionBreak ? 5 : 4; // , 优先于连词
        breakPoints.push({ index, priority, type: 'weak' });
      }
    });
    
    // 按优先级排序
    return breakPoints.sort((a, b) => a.priority - b.priority);
  }

  /**
   * 选择最佳分割点
   * @param {Array} breakPoints - 分割点数组
   * @param {Array} words - words数组
   * @returns {number} 最佳分割点索引
   */
  selectBestBreakPoint(breakPoints, words) {
    const targetWordCount = Math.floor(this.options.preferredMaxWordCount);
    let bestIndex = -1;
    let bestScore = Infinity;
    
    for (const breakPoint of breakPoints) {
      const wordCountToBreak = breakPoint.index + 1;
      
      // 检查是否在合理范围内
      if (wordCountToBreak >= this.options.minWordCount && 
          wordCountToBreak <= this.options.maxWordCount) {
        
        // 计算得分（优先级权重 + 与目标长度的距离）
        const priorityScore = breakPoint.priority * 10;
        const lengthScore = Math.abs(wordCountToBreak - targetWordCount);
        const totalScore = priorityScore + lengthScore;
        
        if (totalScore < bestScore) {
          bestScore = totalScore;
          bestIndex = breakPoint.index;
        }
      }
    }
    
    // 如果没找到理想的分割点，选择优先级最高的
    if (bestIndex === -1 && breakPoints.length > 0) {
      bestIndex = breakPoints[0].index;
    }
    
    return bestIndex;
  }

  /**
   * 强制分割句子（基于words，英语优化版）
   * @param {Object} sentence - 句子对象
   * @returns {Array} 分割结果
   */
  forceSplitSentence(sentence) {
    const words = sentence.words;
    // 目标每个子句子约为理想最大长度
    const targetWordsPerSentence = Math.max(
      this.options.preferredMaxWordCount,
      Math.ceil(words.length / Math.ceil(words.length / this.options.preferredMaxWordCount))
    );

    const results = [];
    let start = 0;

    while (start < words.length) {
      const end = Math.min(start + targetWordsPerSentence, words.length);
      const partWords = words.slice(start, end);
      const partText = partWords.map((w) => w.text || '').join('');

      results.push(
        this.createSentence(
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
   * 检查是否为强制分句点
   * @param {string} char - 字符
   * @returns {boolean}
   */
  isForcedBreakPoint(char) {
    return this.options.forcedBreakMarkers.includes(char);
  }

  /**
   * 检查是否为建议分句点
   * @param {string} char - 字符
   * @returns {boolean}
   */
  isSuggestedBreakPoint(char) {
    return this.options.suggestedBreakMarkers.includes(char);
  }

  /**
   * 检查是否为弱分句点
   * @param {string} char - 字符
   * @returns {boolean}
   */
  isWeakBreakPoint(char) {
    return this.options.weakBreakMarkers.includes(char);
  }

  /**
   * 根据word索引获取句子
   * @param {Array} sentences - 句子数组  
   * @param {number} wordIndex - word索引位置
   * @returns {Object|null} 句子对象
   */
  getSentenceAtWordIndex(sentences, wordIndex) {
    return sentences.find(
      (sentence) =>
        wordIndex >= sentence.startWordIndex &&
        wordIndex <= sentence.endWordIndex
    );
  }
}
