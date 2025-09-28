/**
 * SSML Builder for Native TTS
 * 负责将文本转换为 SSML 格式，并支持各种语音参数设置
 */

export class SSMLBuilder {
    constructor() {
        this.defaultOptions = {
            language: 'zh-CN',
            rate: '100%',
            pitch: '0Hz',
            volume: '100%'
        };
    }

    /**
     * 创建 SSML 文档
     * @param {string} text - 要转换的文本
     * @param {Object} options - SSML 选项
     * @returns {string} SSML 字符串
     */
    build(text, options = {}) {
        const opts = { ...this.defaultOptions, ...options };
        
        // 清理文本
        const cleanText = this.cleanText(text);
        if (!cleanText.trim()) {
            return '';
        }

        // 构建 SSML
        let ssml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
        ssml += `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${opts.language}">\n`;
        
        // 添加 prosody 标签进行语音参数设置
        if (opts.rate !== '100%' || opts.pitch !== '0Hz' || opts.volume !== '100%') {
            ssml += `  <prosody rate="${opts.rate}" pitch="${opts.pitch}" volume="${opts.volume}">\n`;
            ssml += `    ${this.escapeXML(cleanText)}\n`;
            ssml += `  </prosody>\n`;
        } else {
            ssml += `  ${this.escapeXML(cleanText)}\n`;
        }
        
        ssml += `</speak>`;
        
        return ssml;
    }

    /**
     * 为段落添加停顿
     * @param {string} text - 文本
     * @param {string} pauseDuration - 停顿时长 (如 '500ms', '1s')
     * @returns {string} 带停顿的文本
     */
    addParagraphBreaks(text, pauseDuration = '500ms') {
        return text.replace(/\n\n+/g, `\n<break time="${pauseDuration}"/>\n`);
    }

    /**
     * 为句子添加停顿
     * @param {string} text - 文本
     * @param {string} pauseDuration - 停顿时长
     * @returns {string} 带停顿的文本
     */
    addSentenceBreaks(text, pauseDuration = '300ms') {
        // 匹配中文句号、英文句号、问号、感叹号等
        return text.replace(/([。！？.!?])\s*/g, `$1<break time="${pauseDuration}"/>`);
    }

    /**
     * 添加语音标记
     * @param {string} text - 文本
     * @param {Array} markers - 标记数组 [{start, end, type, value}]
     * @returns {string} 带标记的文本
     */
    addVoiceMarkers(text, markers = []) {
        if (!markers.length) return text;
        
        // 按位置排序
        markers.sort((a, b) => a.start - b.start);
        
        let result = '';
        let lastIndex = 0;
        
        markers.forEach(marker => {
            // 添加标记前的文本
            result += text.substring(lastIndex, marker.start);
            
            // 添加标记的文本
            const markedText = text.substring(marker.start, marker.end);
            result += this.wrapWithVoiceTag(markedText, marker.type, marker.value);
            
            lastIndex = marker.end;
        });
        
        // 添加剩余文本
        result += text.substring(lastIndex);
        
        return result;
    }

    /**
     * 用语音标签包装文本
     * @param {string} text - 要包装的文本
     * @param {string} type - 标签类型 (rate, pitch, volume, emphasis)
     * @param {string} value - 标签值
     * @returns {string} 包装后的文本
     */
    wrapWithVoiceTag(text, type, value) {
        switch (type) {
            case 'rate':
            case 'pitch':
            case 'volume':
                return `<prosody ${type}="${value}">${this.escapeXML(text)}</prosody>`;
            
            case 'emphasis':
                return `<emphasis level="${value}">${this.escapeXML(text)}</emphasis>`;
            
            case 'break':
                return `${this.escapeXML(text)}<break time="${value}"/>`;
            
            default:
                return this.escapeXML(text);
        }
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
            'ko-KR': { rate: '90%', pitch: '0Hz' }
        };
        
        return defaults[language] || defaults['en-US'];
    }

    /**
     * 清理文本
     * @param {string} text - 原始文本
     * @returns {string} 清理后的文本
     */
    cleanText(text) {
        if (!text) return '';
        
        return text
            // 移除多余的空白字符
            .replace(/\s+/g, ' ')
            // 移除行首行尾空格
            .trim()
            // 处理特殊字符
            .replace(/[""]/g, '"')
            .replace(/['']/g, "'")
            // 移除 HTML 标签（如果有）
            .replace(/<[^>]*>/g, '')
            // 规范化标点符号
            .replace(/\.\.\./g, '…');
    }

    /**
     * XML 转义
     * @param {string} text - 要转义的文本
     * @returns {string} 转义后的文本
     */
    escapeXML(text) {
        if (!text) return '';
        
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }

    /**
     * 为长文本分段
     * @param {string} text - 长文本
     * @param {number} maxLength - 最大长度
     * @returns {Array} 文本段落数组
     */
    segmentLongText(text, maxLength = 500) {
        if (text.length <= maxLength) {
            return [text];
        }
        
        const segments = [];
        const paragraphs = text.split(/\n\n+/);
        
        let currentSegment = '';
        
        paragraphs.forEach(paragraph => {
            if (currentSegment.length + paragraph.length <= maxLength) {
                currentSegment += (currentSegment ? '\n\n' : '') + paragraph;
            } else {
                if (currentSegment) {
                    segments.push(currentSegment);
                }
                
                // 如果单个段落太长，按句子分割
                if (paragraph.length > maxLength) {
                    const sentences = this.splitBySentences(paragraph);
                    let sentenceGroup = '';
                    
                    sentences.forEach(sentence => {
                        if (sentenceGroup.length + sentence.length <= maxLength) {
                            sentenceGroup += sentence;
                        } else {
                            if (sentenceGroup) {
                                segments.push(sentenceGroup);
                            }
                            sentenceGroup = sentence;
                        }
                    });
                    
                    if (sentenceGroup) {
                        currentSegment = sentenceGroup;
                    } else {
                        currentSegment = '';
                    }
                } else {
                    currentSegment = paragraph;
                }
            }
        });
        
        if (currentSegment) {
            segments.push(currentSegment);
        }
        
        return segments.length > 0 ? segments : [text];
    }

    /**
     * 按句子分割文本
     * @param {string} text - 要分割的文本
     * @returns {Array} 句子数组
     */
    splitBySentences(text) {
        // 按中英文句号、问号、感叹号分割
        const sentences = text.split(/([。！？.!?]+)/);
        const result = [];
        
        for (let i = 0; i < sentences.length; i += 2) {
            const sentence = sentences[i];
            const punctuation = sentences[i + 1] || '';
            
            if (sentence.trim()) {
                result.push(sentence.trim() + punctuation);
            }
        }
        
        return result.length > 0 ? result : [text];
    }
}
