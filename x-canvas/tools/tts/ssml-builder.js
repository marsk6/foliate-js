/**
 * SSML Builder for Native TTS (原型版本)
 * 使用纯 DOM API 构建 SSML，去除所有兼容性代码
 * 
 * 核心功能：
 * - 使用 DOM API 构建标准 SSML 文档
 * - 自动处理 XML 转义和命名空间
 * - 支持嵌套 SSML 标记解析（break、emphasis、prosody 等）
 * - 智能语言检测和语音参数调整
 * - 安全的文本内容处理
 * 
 * 简化说明：
 * - 移除了所有字符串拼接方法
 * - 移除了文本分段功能（由 TTSTextManager 处理）
 * - 移除了兼容性 API，专注核心功能
 * 
 * 使用示例：
 * const builder = new SSMLBuilder();
 * const ssml = builder.build('Hello <break time="500ms"/> world', { language: 'en-US' });
 */

const NS = {
  XML: 'http://www.w3.org/XML/1998/namespace',
  SSML: 'http://www.w3.org/2001/10/synthesis',
};

/**
 * DOM API 版 SSMLBuilder：
 * 
 * 核心方法：
 * - build(text, options) -> string           // 构建完整 SSML 字符串
 * - buildDocument(text, options) -> Document // 创建 SSML DOM 文档
 * - serializeDocument(doc) -> string         // 序列化文档为字符串
 * 
 * DOM 处理方法（替代字符串版本）：
 * - addParagraphBreaks(doc, text, duration) -> Fragment  // 段落停顿
 * - addSentenceBreaks(doc, text, duration) -> Fragment   // 句子停顿
 * - addVoiceMarkers(doc, text, markers) -> Fragment      // 语音标记
 * - createVoiceElement(doc, text, type, value) -> Element // 创建语音元素
 * 
 * 工具方法：
 * - detectLanguage(text) -> string           // 检测文本语言
 * - getLanguageDefaults(lang) -> object      // 获取语言默认参数
 * - cleanText(text) -> string                // 清理文本内容
 */
export class SSMLBuilder {
  constructor() {
    this.defaultOptions = {
      language: 'zh-CN',
      rate: '100%',
      pitch: '0Hz',
      volume: '100%',
    };
    
    // XML 序列化器
    this.serializer = new XMLSerializer();
  }

  /**
   * 构建 SSML 字符串（主要入口方法）
   * @param {string} text - 要转换的文本
   * @param {Object} options - SSML 选项
   * @returns {string} 完整的 SSML 字符串
   */
  build(text, options = {}) {
    const ssmlDoc = this.buildDocument(text, options);
    return this.serializeDocument(ssmlDoc);
  }

  /**
   * 将文本内容添加到 SSML 元素中
   * 支持解析已存在的 SSML 标记（如 <break>、<emphasis> 等）
   * @param {Document} ssmlDoc - SSML 文档
   * @param {Element} parentEl - 父元素
   * @param {string} text - 文本内容
   */
  appendTextContent(ssmlDoc, parentEl, text) {
    // 如果文本中包含 SSML 标记，需要解析
    if (text.includes('<')) {
      this.parseAndAppendSSML(ssmlDoc, parentEl, text);
    } else {
      // 纯文本直接添加
      const textNode = ssmlDoc.createTextNode(text);
      parentEl.appendChild(textNode);
    }
  }

  /**
   * 解析并添加包含 SSML 标记的文本
   * @param {Document} ssmlDoc - SSML 文档
   * @param {Element} parentEl - 父元素
   * @param {string} text - 包含 SSML 标记的文本
   */
  parseAndAppendSSML(ssmlDoc, parentEl, text) {
    // 使用 DOMParser 解析 SSML 片段
    try {
      // 创建一个临时的 SSML 文档来解析内容
      const tempSSML = `<temp xmlns="${NS.SSML}">${text}</temp>`;
      const parser = new DOMParser();
      const tempDoc = parser.parseFromString(tempSSML, 'application/xml');
      
      if (tempDoc.documentElement.tagName === 'parsererror') {
        // 解析失败，回退到纯文本
        parentEl.appendChild(ssmlDoc.createTextNode(text));
        return;
      }

      // 遍历临时文档的子节点
      const tempRoot = tempDoc.documentElement;
      for (const child of tempRoot.childNodes) {
        const importedNode = this.importSSMLNode(ssmlDoc, child);
        if (importedNode) {
          parentEl.appendChild(importedNode);
        }
      }
    } catch (error) {
      console.warn('Failed to parse SSML, treating as plain text:', error);
      parentEl.appendChild(ssmlDoc.createTextNode(text));
    }
  }

  /**
   * 导入 SSML 节点到目标文档
   * @param {Document} ssmlDoc - 目标 SSML 文档
   * @param {Node} sourceNode - 源节点
   * @returns {Node|null} 导入的节点
   */
  importSSMLNode(ssmlDoc, sourceNode) {
    if (sourceNode.nodeType === Node.TEXT_NODE) {
      return ssmlDoc.createTextNode(sourceNode.textContent);
    }
    
    if (sourceNode.nodeType === Node.ELEMENT_NODE) {
      const tagName = sourceNode.tagName.toLowerCase();
      
      // 只处理已知的 SSML 标记
      if (['break', 'emphasis', 'prosody', 'say-as', 'phoneme', 'voice', 'lang'].includes(tagName)) {
        const newEl = ssmlDoc.createElementNS(NS.SSML, tagName);
        
        // 复制属性
        for (const attr of sourceNode.attributes) {
          newEl.setAttribute(attr.name, attr.value);
        }
        
        // 递归处理子节点
        for (const child of sourceNode.childNodes) {
          const childNode = this.importSSMLNode(ssmlDoc, child);
          if (childNode) {
            newEl.appendChild(childNode);
          }
        }
        
        return newEl;
      } else {
        // 未知标记，只导入其子节点的文本内容
        const fragment = ssmlDoc.createDocumentFragment();
        for (const child of sourceNode.childNodes) {
          const childNode = this.importSSMLNode(ssmlDoc, child);
          if (childNode) {
            fragment.appendChild(childNode);
          }
        }
        return fragment;
      }
    }
    
    return null;
  }

  /**
   * 创建完整的 SSML 文档对象（DOM API 版本）
   * @param {string} text - 要转换的文本
   * @param {Object} options - SSML 选项
   * @returns {Document} SSML 文档对象
   */
  buildDocument(text, options = {}) {
    const opts = { ...this.defaultOptions, ...options };
    const cleanText = this.cleanText(text);
    
    if (!cleanText.trim()) {
      return null;
    }

    // 创建 SSML 文档
    const ssmlDoc = document.implementation.createDocument(NS.SSML, 'speak');
    const speakEl = ssmlDoc.documentElement;
    
    // 设置版本和命名空间
    speakEl.setAttribute('version', '1.0');
    speakEl.setAttributeNS(NS.XML, 'lang', opts.language);

    // 判断是否需要添加 prosody 标签
    const needsProsody = opts.rate !== '100%' || opts.pitch !== '0Hz' || opts.volume !== '100%';
    
    if (needsProsody) {
      // 创建 prosody 元素
      const prosodyEl = ssmlDoc.createElementNS(NS.SSML, 'prosody');
      prosodyEl.setAttribute('rate', opts.rate);
      prosodyEl.setAttribute('pitch', opts.pitch);
      prosodyEl.setAttribute('volume', opts.volume);
      
      // 处理文本内容
      this.appendTextContent(ssmlDoc, prosodyEl, cleanText);
      speakEl.appendChild(prosodyEl);
    } else {
      // 直接添加文本内容
      this.appendTextContent(ssmlDoc, speakEl, cleanText);
    }

    return ssmlDoc;
  }

  /**
   * 将 SSML 文档序列化为字符串
   * @param {Document} ssmlDoc - SSML 文档
   * @param {boolean} includeDeclaration - 是否包含 XML 声明
   * @returns {string} SSML 字符串
   */
  serializeDocument(ssmlDoc, includeDeclaration = true) {
    if (!ssmlDoc) return '';
    
    const serialized = this.serializer.serializeToString(ssmlDoc);
    
    if (includeDeclaration) {
      return `<?xml version="1.0" encoding="UTF-8"?>\n${serialized}`;
    }
    
    return serialized;
  }


  /**
   * 检测文本语言
   * @param {string} text - 要检测的文本
   * @returns {string} 语言代码
   */
  detectLanguage(text) {
    // 简单的语言检测
    const chineseRegex = /[\u4e00-\u9fff]/;
    const japaneseRegex = /[\u3040-\u309f\u30a0-\u30ff]/;
    const koreanRegex = /[\uac00-\ud7af]/;

    if (chineseRegex.test(text)) {
      return 'zh-CN';
    } else if (japaneseRegex.test(text)) {
      return 'ja-JP';
    } else if (koreanRegex.test(text)) {
      return 'ko-KR';
    } else {
      return 'en-US';
    }
  }

  /**
   * 根据语言调整语音参数
   * @param {string} language - 语言代码
   * @returns {Object} 语音参数
   */
  getLanguageDefaults(language) {
    const defaults = {
      'zh-CN': { rate: '90%', pitch: '0Hz' },
      'en-US': { rate: '100%', pitch: '0Hz' },
      'ja-JP': { rate: '85%', pitch: '+5Hz' },
      'ko-KR': { rate: '90%', pitch: '0Hz' },
    };

    return defaults[language] || defaults['en-US'];
  }

  /**
   * 为段落添加停顿（DOM 版本）
   * @param {Document} ssmlDoc - SSML 文档
   * @param {string} text - 文本
   * @param {string} pauseDuration - 停顿时长
   * @returns {DocumentFragment} 带停顿的文档片段
   */
  addParagraphBreaks(ssmlDoc, text, pauseDuration = '500ms') {
    const fragment = ssmlDoc.createDocumentFragment();
    const paragraphs = text.split(/\n\n+/);
    
    paragraphs.forEach((paragraph, index) => {
      if (paragraph.trim()) {
        fragment.appendChild(ssmlDoc.createTextNode(paragraph.trim()));
        
        // 段落间添加停顿（最后一个段落除外）
        if (index < paragraphs.length - 1) {
          const breakEl = ssmlDoc.createElementNS(NS.SSML, 'break');
          breakEl.setAttribute('time', pauseDuration);
          fragment.appendChild(breakEl);
        }
      }
    });
    
    return fragment;
  }

  /**
   * 为句子添加停顿（DOM 版本）
   * @param {Document} ssmlDoc - SSML 文档
   * @param {string} text - 文本
   * @param {string} pauseDuration - 停顿时长
   * @returns {DocumentFragment} 带停顿的文档片段
   */
  addSentenceBreaks(ssmlDoc, text, pauseDuration = '300ms') {
    const fragment = ssmlDoc.createDocumentFragment();
    
    // 使用正则表达式分割句子，保留标点符号
    const parts = text.split(/([。！？.!?])/);
    
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (part) {
        fragment.appendChild(ssmlDoc.createTextNode(part));
        
        // 如果是句子结束符，添加停顿
        if (/[。！？.!?]/.test(part) && i < parts.length - 1) {
          const breakEl = ssmlDoc.createElementNS(NS.SSML, 'break');
          breakEl.setAttribute('time', pauseDuration);
          fragment.appendChild(breakEl);
        }
      }
    }
    
    return fragment;
  }

  /**
   * 添加语音标记（DOM 版本）
   * @param {Document} ssmlDoc - SSML 文档
   * @param {string} text - 文本
   * @param {Array} markers - 标记数组 [{start, end, type, value}]
   * @returns {DocumentFragment} 带标记的文档片段
   */
  addVoiceMarkers(ssmlDoc, text, markers = []) {
    if (!markers.length) {
      return ssmlDoc.createTextNode(text);
    }

    // 按位置排序
    markers.sort((a, b) => a.start - b.start);

    const fragment = ssmlDoc.createDocumentFragment();
    let lastIndex = 0;

    markers.forEach((marker) => {
      // 添加标记前的文本
      const beforeText = text.substring(lastIndex, marker.start);
      if (beforeText) {
        fragment.appendChild(ssmlDoc.createTextNode(beforeText));
      }

      // 添加标记的文本
      const markedText = text.substring(marker.start, marker.end);
      const voiceElement = this.createVoiceElement(ssmlDoc, markedText, marker.type, marker.value);
      fragment.appendChild(voiceElement);

      lastIndex = marker.end;
    });

    // 添加剩余文本
    const remainingText = text.substring(lastIndex);
    if (remainingText) {
      fragment.appendChild(ssmlDoc.createTextNode(remainingText));
    }

    return fragment;
  }

  /**
   * 使用 DOM API 创建语音标记元素
   * @param {Document} ssmlDoc - SSML 文档
   * @param {string} text - 要包装的文本
   * @param {string} type - 标签类型
   * @param {string} value - 标签值
   * @returns {Element|DocumentFragment} 创建的元素或文档片段
   */
  createVoiceElement(ssmlDoc, text, type, value) {
    switch (type) {
      case 'rate':
      case 'pitch':
      case 'volume': {
        const prosodyEl = ssmlDoc.createElementNS(NS.SSML, 'prosody');
        prosodyEl.setAttribute(type, value);
        prosodyEl.appendChild(ssmlDoc.createTextNode(text));
        return prosodyEl;
      }

      case 'emphasis': {
        const emphasisEl = ssmlDoc.createElementNS(NS.SSML, 'emphasis');
        emphasisEl.setAttribute('level', value);
        emphasisEl.appendChild(ssmlDoc.createTextNode(text));
        return emphasisEl;
      }

      case 'break': {
        const fragment = ssmlDoc.createDocumentFragment();
        if (text) {
          fragment.appendChild(ssmlDoc.createTextNode(text));
        }
        const breakEl = ssmlDoc.createElementNS(NS.SSML, 'break');
        breakEl.setAttribute('time', value);
        fragment.appendChild(breakEl);
        return fragment;
      }

      case 'say-as': {
        const sayAsEl = ssmlDoc.createElementNS(NS.SSML, 'say-as');
        sayAsEl.setAttribute('interpret-as', value);
        sayAsEl.appendChild(ssmlDoc.createTextNode(text));
        return sayAsEl;
      }

      default: {
        const fragment = ssmlDoc.createDocumentFragment();
        fragment.appendChild(ssmlDoc.createTextNode(text));
        return fragment;
      }
    }
  }





  /**
   * 清理文本
   * @param {string} text - 原始文本
   * @returns {string} 清理后的文本
   */
  cleanText(text) {
    if (!text) return '';

    return (
      text
        // 移除多余的空白字符，但保留已有的 SSML 标记内的格式
        .replace(/\s+/g, ' ')
        // 移除行首行尾空格
        .trim()
        // 处理特殊字符（标准化引号）
        .replace(/[""]/g, '"')
        .replace(/['']/g, "'")
        // 规范化标点符号
        .replace(/\.\.\./g, '…')
    );
  }
}
