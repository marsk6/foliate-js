/**
 * 内容锚点系统 - 替代CFI，适用于重新排版的内容
 * 
 * 设计思路：
 * 1. 为每个内容段分配唯一ID（原始段落、翻译、提示等）
 * 2. 使用段落ID + 段内偏移作为稳定锚点
 * 3. 支持跨不同类型内容的划线
 * 4. 通过内容指纹和上下文验证位置准确性
 */

export class ContentAnchorSystem {
  constructor() {
    // 内容段落映射 segmentId -> segmentInfo
    this.contentSegments = new Map();
    
    // 字符位置到段落的映射 charIndex -> segmentId
    this.charToSegmentMap = new Map();
    
    // 段落类型定义
    this.segmentTypes = {
      ORIGINAL: 'original',      // 原始内容
      TRANSLATION: 'translation', // 翻译内容
      HINT: 'hint',             // 提示内容
      NOTE: 'note',             // 注释内容
      CUSTOM: 'custom'          // 自定义插入内容
    };
    
    this.segmentIdCounter = 0;
  }

  /**
   * 注册内容段落
   * @param {Object} segmentInfo 段落信息
   * @param {string} segmentInfo.type 段落类型 (original/translation/hint等)
   * @param {string} segmentInfo.content 段落文本内容
   * @param {number} segmentInfo.startChar 起始字符位置
   * @param {number} segmentInfo.endChar 结束字符位置
   * @param {string} segmentInfo.originalId 原始段落ID（用于关联翻译等）
   * @param {Object} segmentInfo.metadata 元数据
   * @returns {string} 段落唯一ID
   */
  registerContentSegment(segmentInfo) {
    const segmentId = this.generateSegmentId(segmentInfo);
    
    const segment = {
      id: segmentId,
      type: segmentInfo.type,
      content: segmentInfo.content,
      startChar: segmentInfo.startChar,
      endChar: segmentInfo.endChar,
      originalId: segmentInfo.originalId || null,
      metadata: segmentInfo.metadata || {},
      contentHash: this.hashContent(segmentInfo.content),
      createdAt: Date.now()
    };
    
    this.contentSegments.set(segmentId, segment);
    
    // 建立字符位置映射
    for (let i = segmentInfo.startChar; i <= segmentInfo.endChar; i++) {
      this.charToSegmentMap.set(i, segmentId);
    }
    
    return segmentId;
  }

  /**
   * 创建位置锚点
   * @param {number} startChar 起始字符位置
   * @param {number} endChar 结束字符位置
   * @param {string} selectedText 选中的文本
   * @returns {Object} 锚点信息
   */
  createAnchor(startChar, endChar, selectedText) {
    const segments = this.getSegmentsInRange(startChar, endChar);
    
    if (segments.length === 0) {
      console.warn('无法找到字符位置对应的段落');
      return null;
    }

    // 创建锚点路径
    const anchorPath = segments.map(segment => {
      const segmentInfo = this.contentSegments.get(segment.segmentId);
      const relativeStart = Math.max(0, startChar - segmentInfo.startChar);
      const relativeEnd = Math.min(segmentInfo.content.length - 1, endChar - segmentInfo.startChar);
      
      return {
        segmentId: segment.segmentId,
        segmentType: segmentInfo.type,
        originalId: segmentInfo.originalId,
        relativeStart: relativeStart,
        relativeEnd: relativeEnd,
        segmentContent: segmentInfo.content.substring(relativeStart, relativeEnd + 1)
      };
    });

    // 创建验证数据
    const verification = {
      text: selectedText,
      textHash: this.hashContent(selectedText),
      textLength: selectedText.length,
      contextBefore: this.getContextText(startChar - 20, startChar),
      contextAfter: this.getContextText(endChar + 1, endChar + 21),
      segmentCount: segments.length,
      firstSegmentType: segments[0] ? this.contentSegments.get(segments[0].segmentId).type : null
    };

    return {
      anchorPath,
      verification,
      globalStart: startChar,
      globalEnd: endChar,
      createdAt: Date.now(),
      version: '1.0'
    };
  }

  /**
   * 恢复锚点位置
   * @param {Object} anchor 锚点信息
   * @returns {Object|null} 恢复的位置信息 {globalStart, globalEnd}
   */
  restoreAnchor(anchor) {
    if (!anchor || !anchor.anchorPath) {
      return null;
    }

    // 策略1: 尝试通过段落ID精确恢复
    const exactPosition = this.restoreBySegmentPath(anchor.anchorPath);
    if (exactPosition && this.verifyPosition(exactPosition, anchor.verification)) {
      return exactPosition;
    }

    // 策略2: 通过原始段落ID关联恢复（处理翻译等插入内容变化）
    const relatedPosition = this.restoreByOriginalId(anchor.anchorPath, anchor.verification);
    if (relatedPosition && this.verifyPosition(relatedPosition, anchor.verification)) {
      return relatedPosition;
    }

    // 策略3: 文本内容搜索恢复
    const textSearchPosition = this.restoreByTextSearch(anchor.verification);
    if (textSearchPosition) {
      return textSearchPosition;
    }

    console.warn('无法恢复锚点位置', anchor);
    return null;
  }

  /**
   * 通过段落路径精确恢复
   * @param {Array} anchorPath 锚点路径
   * @returns {Object|null}
   */
  restoreBySegmentPath(anchorPath) {
    let globalStart = null;
    let globalEnd = null;

    for (const pathItem of anchorPath) {
      const segment = this.contentSegments.get(pathItem.segmentId);
      if (!segment) {
        return null; // 段落不存在，无法恢复
      }

      // 验证段落内容是否匹配
      const expectedContent = pathItem.segmentContent;
      const actualContent = segment.content.substring(
        pathItem.relativeStart, 
        pathItem.relativeEnd + 1
      );

      if (actualContent !== expectedContent) {
        return null; // 内容不匹配，可能已经变化
      }

      // 计算全局位置
      const segmentGlobalStart = segment.startChar + pathItem.relativeStart;
      const segmentGlobalEnd = segment.startChar + pathItem.relativeEnd;

      if (globalStart === null) {
        globalStart = segmentGlobalStart;
      }
      globalEnd = segmentGlobalEnd;
    }

    return globalStart !== null ? { globalStart, globalEnd } : null;
  }

  /**
   * 通过原始段落ID关联恢复
   * @param {Array} anchorPath 锚点路径
   * @param {Object} verification 验证信息
   * @returns {Object|null}
   */
  restoreByOriginalId(anchorPath, verification) {
    // 查找具有相同originalId的段落
    const originalIds = anchorPath
      .map(path => path.originalId)
      .filter(id => id !== null);

    if (originalIds.length === 0) {
      return null;
    }

    // 在相关段落中搜索匹配的文本
    for (const originalId of originalIds) {
      const relatedSegments = Array.from(this.contentSegments.values())
        .filter(seg => seg.originalId === originalId);

      for (const segment of relatedSegments) {
        const position = this.searchTextInSegment(segment, verification.text);
        if (position) {
          return position;
        }
      }
    }

    return null;
  }

  /**
   * 通过文本搜索恢复
   * @param {Object} verification 验证信息
   * @returns {Object|null}
   */
  restoreByTextSearch(verification) {
    const { text, contextBefore, contextAfter } = verification;
    
    // 构建搜索字符串（包含上下文）
    const searchPattern = contextBefore + text + contextAfter;
    
    // 在所有段落中搜索
    for (const segment of this.contentSegments.values()) {
      const fullContent = this.getSegmentWithContext(segment);
      const index = fullContent.indexOf(searchPattern);
      
      if (index !== -1) {
        const textStart = index + contextBefore.length;
        const textEnd = textStart + text.length - 1;
        
        return {
          globalStart: segment.startChar + textStart,
          globalEnd: segment.startChar + textEnd
        };
      }
    }

    return null;
  }

  /**
   * 验证恢复的位置是否正确
   * @param {Object} position 位置信息
   * @param {Object} verification 验证信息
   * @returns {boolean}
   */
  verifyPosition(position, verification) {
    const { globalStart, globalEnd } = position;
    const currentText = this.getContextText(globalStart, globalEnd + 1);
    
    return currentText === verification.text &&
           currentText.length === verification.textLength &&
           this.hashContent(currentText) === verification.textHash;
  }

  /**
   * 获取指定范围内的段落
   * @param {number} startChar 起始字符位置
   * @param {number} endChar 结束字符位置
   * @returns {Array} 段落列表
   */
  getSegmentsInRange(startChar, endChar) {
    const segments = [];
    const segmentIds = new Set();

    for (let i = startChar; i <= endChar; i++) {
      const segmentId = this.charToSegmentMap.get(i);
      if (segmentId && !segmentIds.has(segmentId)) {
        segmentIds.add(segmentId);
        segments.push({ segmentId });
      }
    }

    return segments;
  }

  /**
   * 在段落中搜索文本
   * @param {Object} segment 段落信息
   * @param {string} searchText 搜索文本
   * @returns {Object|null}
   */
  searchTextInSegment(segment, searchText) {
    const index = segment.content.indexOf(searchText);
    if (index !== -1) {
      return {
        globalStart: segment.startChar + index,
        globalEnd: segment.startChar + index + searchText.length - 1
      };
    }
    return null;
  }

  /**
   * 获取段落及其上下文
   * @param {Object} segment 段落信息
   * @returns {string}
   */
  getSegmentWithContext(segment) {
    // 获取前后段落作为上下文
    const beforeContext = this.getContextText(segment.startChar - 50, segment.startChar);
    const afterContext = this.getContextText(segment.endChar + 1, segment.endChar + 51);
    
    return beforeContext + segment.content + afterContext;
  }

  /**
   * 获取上下文文本
   * @param {number} start 起始位置
   * @param {number} end 结束位置
   * @returns {string}
   */
  getContextText(start, end) {
    // 这个方法会在 HighlightManager 中被重写
    // 提供默认实现以避免错误
    return '';
  }

  /**
   * 生成段落唯一ID
   * @param {Object} segmentInfo 段落信息
   * @returns {string}
   */
  generateSegmentId(segmentInfo) {
    const prefix = segmentInfo.type.substring(0, 3).toUpperCase();
    const counter = ++this.segmentIdCounter;
    const hash = this.hashContent(segmentInfo.content).substring(0, 8);
    return `${prefix}_${counter}_${hash}`;
  }

  /**
   * 计算内容哈希
   * @param {string} content 内容
   * @returns {string}
   */
  hashContent(content) {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
  }

  /**
   * 更新段落位置信息（内容重新排版后调用）
   * @param {string} segmentId 段落ID
   * @param {number} newStartChar 新的起始位置
   * @param {number} newEndChar 新的结束位置
   */
  updateSegmentPosition(segmentId, newStartChar, newEndChar) {
    const segment = this.contentSegments.get(segmentId);
    if (!segment) return;

    // 清除旧的字符映射
    for (let i = segment.startChar; i <= segment.endChar; i++) {
      this.charToSegmentMap.delete(i);
    }

    // 更新段落位置
    segment.startChar = newStartChar;
    segment.endChar = newEndChar;

    // 重新建立字符映射
    for (let i = newStartChar; i <= newEndChar; i++) {
      this.charToSegmentMap.set(i, segmentId);
    }
  }

  /**
   * 清空所有段落数据
   */
  clear() {
    this.contentSegments.clear();
    this.charToSegmentMap.clear();
    this.segmentIdCounter = 0;
  }

  /**
   * 导出锚点系统数据（用于调试和备份）
   */
  exportData() {
    return {
      segments: Array.from(this.contentSegments.entries()),
      charMap: Array.from(this.charToSegmentMap.entries()),
      counter: this.segmentIdCounter
    };
  }

  /**
   * 导入锚点系统数据
   */
  importData(data) {
    this.contentSegments = new Map(data.segments);
    this.charToSegmentMap = new Map(data.charMap);
    this.segmentIdCounter = data.counter;
  }
} 