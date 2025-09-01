/**
 * 英语文本规范化工具
 * 用于修复 epub 中常见的英语排版问题
 */
export class EnglishTextNormalizer {
  constructor() {
    // 初始化规范化规则
    this.initRules();
  }

  /**
   * 初始化所有规范化规则
   */
  initRules() {
    // 标点符号规则：标点后应该有空格的情况
    this.punctuationRules = [
      // 句号、逗号、问号、感叹号后需要空格（但不是行末）
      { pattern: /\.(?=[A-Z])/g, replacement: '. ' }, // 句号后跟大写字母
      { pattern: /,(?=[A-Za-z])/g, replacement: ', ' }, // 逗号后跟字母
      { pattern: /\?(?=[A-Z])/g, replacement: '? ' }, // 问号后跟大写字母
      { pattern: /!(?=[A-Z])/g, replacement: '! ' }, // 感叹号后跟大写字母
      { pattern: /:(?=[A-Za-z])/g, replacement: ': ' }, // 冒号后跟字母
      { pattern: /;(?=[A-Za-z])/g, replacement: '; ' }, // 分号后跟字母
    ];

    // 缩写形式规则：去除不应该有的空格
    this.contractionRules = [
      // 常见的英语缩写形式 - 使用更宽松的空白匹配
      { pattern: /\bI\s+'ve\b/gi, replacement: "I've" },
      { pattern: /\bI\s+'m\b/gi, replacement: "I'm" },
      { pattern: /\bI\s+'ll\b/gi, replacement: "I'll" },
      { pattern: /\bI\s+'d\b/gi, replacement: "I'd" },

      { pattern: /\byou\s+'re\b/gi, replacement: "you're" },
      { pattern: /\byou\s+'ve\b/gi, replacement: "you've" },
      { pattern: /\byou\s+'ll\b/gi, replacement: "you'll" },
      { pattern: /\byou\s+'d\b/gi, replacement: "you'd" },

      { pattern: /\bhe\s+'s\b/gi, replacement: "he's" },
      { pattern: /\bhe\s+'ll\b/gi, replacement: "he'll" },
      { pattern: /\bhe\s+'d\b/gi, replacement: "he'd" },

      { pattern: /\bshe\s+'s\b/gi, replacement: "she's" },
      { pattern: /\bshe\s+'ll\b/gi, replacement: "she'll" },
      { pattern: /\bshe\s+'d\b/gi, replacement: "she'd" },

      { pattern: /\bit\s+'s\b/gi, replacement: "it's" },
      { pattern: /\bit\s+'ll\b/gi, replacement: "it'll" },
      { pattern: /\bit\s+'d\b/gi, replacement: "it'd" },

      {
        pattern: /\b[Ww]e\s+'re\b/g,
        replacement: (match) => (match.startsWith('W') ? "We're" : "we're"),
      },
      {
        pattern: /\b[Ww]e\s+'ve\b/g,
        replacement: (match) => (match.startsWith('W') ? "We've" : "we've"),
      },
      {
        pattern: /\b[Ww]e\s+'ll\b/g,
        replacement: (match) => (match.startsWith('W') ? "We'll" : "we'll"),
      },
      {
        pattern: /\b[Ww]e\s+'d\b/g,
        replacement: (match) => (match.startsWith('W') ? "We'd" : "we'd"),
      },

      {
        pattern: /\b[Tt]hey\s+'re\b/g,
        replacement: (match) => (match.startsWith('T') ? "They're" : "they're"),
      },
      {
        pattern: /\b[Tt]hey\s+'ve\b/g,
        replacement: (match) => (match.startsWith('T') ? "They've" : "they've"),
      },
      {
        pattern: /\b[Tt]hey\s+'ll\b/g,
        replacement: (match) => (match.startsWith('T') ? "They'll" : "they'll"),
      },
      {
        pattern: /\b[Tt]hey\s+'d\b/g,
        replacement: (match) => (match.startsWith('T') ? "They'd" : "they'd"),
      },

      { pattern: /\bthat\s+'s\b/g, replacement: "that's" },
      { pattern: /\bthat\s+'ll\b/g, replacement: "that'll" },
      { pattern: /\bthat\s+'d\b/g, replacement: "that'd" },

      { pattern: /\bwhat\s+'s\b/g, replacement: "what's" },
      { pattern: /\bwhat\s+'ll\b/g, replacement: "what'll" },
      { pattern: /\bwhat\s+'d\b/g, replacement: "what'd" },

      { pattern: /\bwho\s+'s\b/g, replacement: "who's" },
      { pattern: /\bwho\s+'ll\b/g, replacement: "who'll" },
      { pattern: /\bwho\s+'d\b/g, replacement: "who'd" },

      { pattern: /\bwhere\s+'s\b/g, replacement: "where's" },
      { pattern: /\bwhere\s+'ll\b/g, replacement: "where'll" },
      { pattern: /\bwhere\s+'d\b/g, replacement: "where'd" },

      { pattern: /\bwhen\s+'s\b/g, replacement: "when's" },
      { pattern: /\bwhen\s+'ll\b/g, replacement: "when'll" },
      { pattern: /\bwhen\s+'d\b/g, replacement: "when'd" },

      { pattern: /\bhow\s+'s\b/g, replacement: "how's" },
      { pattern: /\bhow\s+'ll\b/g, replacement: "how'll" },
      { pattern: /\bhow\s+'d\b/g, replacement: "how'd" },

      // 否定缩写
      { pattern: /\bisn\s+'t\b/g, replacement: "isn't" },
      { pattern: /\baren\s+'t\b/g, replacement: "aren't" },
      { pattern: /\bwasn\s+'t\b/g, replacement: "wasn't" },
      { pattern: /\bweren\s+'t\b/g, replacement: "weren't" },
      { pattern: /\bhasn\s+'t\b/g, replacement: "hasn't" },
      { pattern: /\bhaven\s+'t\b/g, replacement: "haven't" },
      { pattern: /\bhadn\s+'t\b/g, replacement: "hadn't" },
      { pattern: /\bwon\s+'t\b/g, replacement: "won't" },
      { pattern: /\bwouldn\s+'t\b/g, replacement: "wouldn't" },
      { pattern: /\bshouldn\s+'t\b/g, replacement: "shouldn't" },
      { pattern: /\bcouldn\s+'t\b/g, replacement: "couldn't" },
      { pattern: /\bcan\s+'t\b/g, replacement: "can't" },
      { pattern: /\bdon\s+'t\b/g, replacement: "don't" },
      { pattern: /\bdoesn\s+'t\b/g, replacement: "doesn't" },
      { pattern: /\bdidn\s+'t\b/g, replacement: "didn't" },
      { pattern: /\bneedn\s+'t\b/g, replacement: "needn't" },
      { pattern: /\bmustn\s+'t\b/g, replacement: "mustn't" },

      // 其他常见缩写
      { pattern: /\blet\s+'s\b/g, replacement: "let's" },
      { pattern: /\bthere\s+'s\b/g, replacement: "there's" },
      { pattern: /\bthere\s+'ll\b/g, replacement: "there'll" },
      { pattern: /\bthere\s+'d\b/g, replacement: "there'd" },
      { pattern: /\bhere\s+'s\b/g, replacement: "here's" },
      { pattern: /\bhere\s+'ll\b/g, replacement: "here'll" },
      { pattern: /\bhere\s+'d\b/g, replacement: "here'd" },

      // 年代缩写
      { pattern: /\b(\d{2})\s+'s\b/g, replacement: "$1's" }, // 如 "90 's" → "90's"

      // 所有格形式
      { pattern: /\b([A-Za-z]+)\s+'s\b/g, replacement: "$1's" }, // 如 "John 's" → "John's"

      // 时间表达式
      { pattern: /\bo\s+'clock\b/g, replacement: "o'clock" },

      // 其他常见缩写
      { pattern: /\b'em\b/g, replacement: "'em" }, // them的缩写
      { pattern: /\b'cause\b/g, replacement: "'cause" }, // because的缩写
      { pattern: /\b'til\b/g, replacement: "'til" }, // until的缩写
      { pattern: /\b'bout\b/g, replacement: "'bout" }, // about的缩写
    ];

    // 引号规则
    this.quoteRules = [
      // 开引号前应该有空格，后面不应该有空格
      { pattern: /(\S)\s*"\s*/g, replacement: '$1 "' },
      // 闭引号前不应该有空格，后面应该有空格（如果后面跟字母）
      { pattern: /\s*"\s*([A-Za-z])/g, replacement: '" $1' },
      // 单引号类似处理
      { pattern: /(\S)\s*'\s*([A-Za-z])/g, replacement: "$1'$2" },
    ];

    // 数字和单位规则
    this.numberRules = [
      // 数字和单位之间不应该有空格
      {
        pattern:
          /(\d+)\s+(percent|%|degrees?|°|pounds?|lbs?|kilograms?|kgs?|meters?|feet|ft|inches?|in|miles?|kilometers?|km|hours?|hrs?|minutes?|mins?|seconds?|secs?)\b/gi,
        replacement: '$1$2',
      },
      // 序数词
      { pattern: /(\d+)\s+(st|nd|rd|th)\b/g, replacement: '$1$2' },
    ];

    // 特殊词汇规则
    this.specialWordRules = [
      // 常见的分离词汇
      { pattern: /\bsome\s+one\b/g, replacement: 'someone' },
      { pattern: /\bsome\s+thing\b/g, replacement: 'something' },
      { pattern: /\bsome\s+where\b/g, replacement: 'somewhere' },
      { pattern: /\bsome\s+how\b/g, replacement: 'somehow' },
      { pattern: /\bsome\s+time\b/g, replacement: 'sometime' },
      { pattern: /\bany\s+one\b/g, replacement: 'anyone' },
      { pattern: /\bany\s+thing\b/g, replacement: 'anything' },
      { pattern: /\bany\s+where\b/g, replacement: 'anywhere' },
      { pattern: /\bany\s+how\b/g, replacement: 'anyhow' },
      { pattern: /\bany\s+time\b/g, replacement: 'anytime' },
      { pattern: /\bevery\s+one\b/g, replacement: 'everyone' },
      { pattern: /\bevery\s+thing\b/g, replacement: 'everything' },
      { pattern: /\bevery\s+where\b/g, replacement: 'everywhere' },
      { pattern: /\bevery\s+body\b/g, replacement: 'everybody' },
      // no one 应该保持分离，不做替换
      { pattern: /\bno\s+thing\b/g, replacement: 'nothing' },
      { pattern: /\bno\s+where\b/g, replacement: 'nowhere' },
      { pattern: /\bno\s+body\b/g, replacement: 'nobody' },

      // 常见的连字符错误
      { pattern: /\bto\s+day\b/g, replacement: 'today' },
      { pattern: /\bto\s+night\b/g, replacement: 'tonight' },
      { pattern: /\bto\s+morrow\b/g, replacement: 'tomorrow' },
      { pattern: /\byester\s+day\b/g, replacement: 'yesterday' },
      { pattern: /\bafter\s+noon\b/g, replacement: 'afternoon' },
      { pattern: /\bin\s+deed\b/g, replacement: 'indeed' },
      { pattern: /\bhow\s+ever\b/g, replacement: 'however' },
      { pattern: /\bwhat\s+ever\b/g, replacement: 'whatever' },
      { pattern: /\bwhen\s+ever\b/g, replacement: 'whenever' },
      { pattern: /\bwhere\s+ever\b/g, replacement: 'wherever' },
      { pattern: /\bwho\s+ever\b/g, replacement: 'whoever' },
    ];
  }

  /**
   * 规范化英语文本
   * @param {string} text - 原始文本
   * @returns {string} 规范化后的文本
   */
  normalize(text) {
    if (!text || typeof text !== 'string') {
      return text;
    }

    let normalizedText = text;

    // 1. 首先处理多余的空格
    normalizedText = this.normalizeWhitespace(normalizedText);

    // 2. 修复缩写形式的空格问题
    normalizedText = this.fixContractions(normalizedText);

    // 3. 修复标点符号后的空格
    normalizedText = this.fixPunctuationSpacing(normalizedText);

    // 4. 修复引号的空格
    normalizedText = this.fixQuoteSpacing(normalizedText);

    // 5. 修复数字和单位的空格
    normalizedText = this.fixNumberSpacing(normalizedText);

    // 6. 修复特殊词汇的分离问题
    normalizedText = this.fixSpecialWords(normalizedText);

    // 7. 最后清理多余的空格
    normalizedText = this.finalCleanup(normalizedText);

    return normalizedText;
  }

  /**
   * 规范化空白字符
   */
  normalizeWhitespace(text) {
    return (
      text
        // 将制表符和多个空格替换为单个空格
        .replace(/\s+/g, ' ')
        // 去除行首行尾空格
        .trim()
    );
  }

  /**
   * 修复缩写形式的空格问题
   */
  fixContractions(text) {
    let result = text;

    for (const rule of this.contractionRules) {
      result = result.replace(rule.pattern, rule.replacement);
    }

    return result;
  }

  /**
   * 修复标点符号后的空格
   */
  fixPunctuationSpacing(text) {
    let result = text;

    for (const rule of this.punctuationRules) {
      result = result.replace(rule.pattern, rule.replacement);
    }

    // 处理句子末尾的标点符号后多余的空格（保留一个空格，除非是最后）
    result = result
      // 句号后如果跟小写字母，可能是缩写，不加空格
      .replace(/\.([a-z])/g, '.$1')
      // 但如果是句子结尾的句号后跟大写，应该有空格
      .replace(/\.([A-Z])/g, '. $1');

    return result;
  }

  /**
   * 修复引号的空格
   */
  fixQuoteSpacing(text) {
    let result = text;

    for (const rule of this.quoteRules) {
      result = result.replace(rule.pattern, rule.replacement);
    }

    return result;
  }

  /**
   * 修复数字和单位的空格
   */
  fixNumberSpacing(text) {
    let result = text;

    for (const rule of this.numberRules) {
      result = result.replace(rule.pattern, rule.replacement);
    }

    return result;
  }

  /**
   * 修复特殊词汇的分离问题
   */
  fixSpecialWords(text) {
    let result = text;

    for (const rule of this.specialWordRules) {
      result = result.replace(rule.pattern, rule.replacement);
    }

    return result;
  }

  /**
   * 最终清理
   */
  finalCleanup(text) {
    return (
      text
        // 清理多个连续空格
        .replace(/\s{2,}/g, ' ')
        // 清理标点前的空格
        .replace(/\s+([.,;:!?])/g, '$1')
        // 清理开头结尾空格
        .trim()
    );
  }

  /**
   * 检测文本是否为英语
   * 简单的启发式检测：包含常见英语单词和字符
   */
  isEnglishText(text) {
    if (!text || text.length < 3) {
      return false;
    }

    // 检查是否包含英语常见词汇
    const commonEnglishWords =
      /\b(the|and|or|but|in|on|at|to|for|of|with|by|from|up|about|into|over|after|a|an|is|are|was|were|be|been|have|has|had|do|does|did|will|would|could|should|may|might|can|must|shall)\b/i;

    // 检查是否主要是拉丁字符
    const latinCharacters = /^[a-zA-Z0-9\s.,;:!?'"()\-–—\[\]{}]+$/;

    return commonEnglishWords.test(text) && latinCharacters.test(text);
  }

  /**
   * 智能规范化：只对英语文本进行规范化
   */
  smartNormalize(text) {
    if (!this.isEnglishText(text)) {
      return text; // 非英语文本不进行规范化
    }

    return this.normalize(text);
  }
}

// 创建默认实例
export const englishTextNormalizer = new EnglishTextNormalizer();

// 导出便捷函数
export function normalizeEnglishText(text) {
  return englishTextNormalizer.smartNormalize(text);
}

export default EnglishTextNormalizer;
