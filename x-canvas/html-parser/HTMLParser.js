import { getDefaultStyles, mergeStyles, normalizeStyleValue, isDefaultValue } from './DefaultStyles.js';

export class HTMLParser {
  constructor(options = {}) {
    this.pseudoElementCounter = 0;
    this.options = {
      useDefaultStyles: true,         // 是否使用默认样式
      mergeComputedStyles: true,      // 是否合并计算后的样式
      optimizeOutput: true,           // 是否优化输出（移除默认值）
      ...options
    };
  }

  /**
   * 解析 HTML 元素树，返回包含样式信息的数据结构
   * @param {HTMLElement} element - 要解析的根元素
   * @returns {Object} 解析后的元素树
   */
  parse(element = document.body) {
    return this.parseElement(element);
  }

  /**
   * 解析单个元素
   * @param {Element} element 
   * @returns {Object}
   */
  parseElement(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) {
      return null;
    }

    const computedStyle = window.getComputedStyle(element);
    
    // 检查元素是否可见
    if (!this.isVisible(computedStyle)) {
      return null;
    }

    const elementData = {
      type: 'element',
      tag: element.tagName.toLowerCase(),
      style: this.extractStyles(computedStyle, element.tagName.toLowerCase()),
      bounds: this.getBounds(element),
      children: []
    };

    // 处理伪元素 ::before
    const beforeElement = this.processPseudoElement(element, '::before');
    if (beforeElement) {
      elementData.children.push(beforeElement);
    }

    // 处理列表项前缀
    const listPrefix = this.processListItemPrefix(element);
    if (listPrefix) {
      elementData.children.push(listPrefix);
    }

    // 处理文本节点和子元素
    for (let child = element.firstChild; child; child = child.nextSibling) {
      if (child.nodeType === Node.TEXT_NODE) {
        const text = child.textContent.trim();
        if (text) {
          // 文本节点继承父元素的文本相关样式
          const textStyles = this.extractTextStyles(computedStyle);
          elementData.children.push({
            type: 'text',
            text: text,
            style: textStyles
          });
        }
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        // 特殊处理 SVG 元素
        if (child.tagName.toLowerCase() === 'svg') {
          const svgElement = this.processSVGElement(child);
          if (svgElement) {
            elementData.children.push(svgElement);
          }
        }
        // 特殊处理 IMG 元素 
        else if (child.tagName.toLowerCase() === 'img') {
          const imgElement = this.processImgElement(child);
          if (imgElement) {
            elementData.children.push(imgElement);
          }
        }
        // 特殊处理图书相关元素
        else if (this.isBookSpecialElement(child)) {
          const specialElement = this.processBookSpecialElement(child);
          if (specialElement) {
            if (Array.isArray(specialElement)) {
              elementData.children.push(...specialElement);
            } else {
              elementData.children.push(specialElement);
            }
          }
        } else {
          const childElement = this.parseElement(child);
          if (childElement) {
            elementData.children.push(childElement);
          }
        }
      }
    }

    // 处理伪元素 ::after  
    const afterElement = this.processPseudoElement(element, '::after');
    if (afterElement) {
      elementData.children.push(afterElement);
    }

    return elementData;
  }

  /**
   * 检查元素是否可见
   * @param {CSSStyleDeclaration} style 
   * @returns {boolean}
   */
  isVisible(style) {
    return style.display !== 'none' && 
           style.visibility !== 'hidden' && 
           parseFloat(style.opacity) > 0;
  }

  /**
   * 提取和合并样式属性
   * @param {CSSStyleDeclaration} computedStyle 
   * @param {string} tagName 
   * @returns {Object}
   */
  extractStyles(computedStyle, tagName) {
    let finalStyles = {};
    
    // 1. 先获取默认样式（如果启用）
    if (this.options.useDefaultStyles) {
      const defaultStyles = getDefaultStyles(tagName);
      finalStyles = { ...defaultStyles };
    }

    // 2. 提取计算后的样式（如果启用）
    if (this.options.mergeComputedStyles) {
      const computedStyles = this.extractComputedStyles(computedStyle);
      finalStyles = mergeStyles(finalStyles, computedStyles);
    }

    // 3. 优化输出（移除默认值）
    if (this.options.optimizeOutput) {
      finalStyles = this.optimizeStyles(finalStyles, tagName);
    }

    return finalStyles;
  }

  /**
   * 从计算样式中提取关键属性
   * @param {CSSStyleDeclaration} style 
   * @returns {Object}
   */
  extractComputedStyles(style) {
    const styles = {};

    // 显示和布局
    this.addDisplayStyles(styles, style);

    // 盒子模型
    this.addBoxModelStyles(styles, style);

    // 字体相关
    this.addFontStyles(styles, style);

    // 颜色和背景
    this.addColorStyles(styles, style);

    // 边框
    this.addBorderStyles(styles, style);

    // 变换和效果
    this.addTransformStyles(styles, style);

    // 其他样式
    this.addMiscStyles(styles, style);

    return styles;
  }

  /**
   * 添加显示和布局相关样式
   */
  addDisplayStyles(styles, style) {
    if (style.display) styles.display = style.display;
    if (style.position && style.position !== 'static') styles.position = style.position;
    if (style.float && style.float !== 'none') styles.float = style.float;
    if (style.clear && style.clear !== 'none') styles.clear = style.clear;
    if (style.visibility && style.visibility !== 'visible') styles.visibility = style.visibility;
    if (style.zIndex && style.zIndex !== 'auto') styles['z-index'] = style.zIndex;
  }

  /**
   * 添加盒子模型相关样式
   */
  addBoxModelStyles(styles, style) {
    // 宽度和高度
    if (style.width && style.width !== 'auto') styles.width = style.width;
    if (style.height && style.height !== 'auto') styles.height = style.height;
    if (style.minWidth && style.minWidth !== '0px') styles['min-width'] = style.minWidth;
    if (style.minHeight && style.minHeight !== '0px') styles['min-height'] = style.minHeight;
    if (style.maxWidth && style.maxWidth !== 'none') styles['max-width'] = style.maxWidth;
    if (style.maxHeight && style.maxHeight !== 'none') styles['max-height'] = style.maxHeight;

    // 内边距
    this.addSpacingStyles(styles, style, 'padding');

    // 外边距  
    this.addSpacingStyles(styles, style, 'margin');

    // 定位
    ['top', 'right', 'bottom', 'left'].forEach(prop => {
      if (style[prop] && style[prop] !== 'auto') {
        styles[prop] = style[prop];
      }
    });
  }

  /**
   * 添加间距样式（margin/padding）
   */
  addSpacingStyles(styles, style, property) {
    const top = style[`${property}Top`];
    const right = style[`${property}Right`];
    const bottom = style[`${property}Bottom`];
    const left = style[`${property}Left`];

    if (top !== '0px' || right !== '0px' || bottom !== '0px' || left !== '0px') {
      if (top === right && right === bottom && bottom === left) {
        styles[property] = top;
      } else if (top === bottom && right === left) {
        styles[property] = `${top} ${right}`;
      } else {
        styles[`${property}-top`] = top;
        styles[`${property}-right`] = right;  
        styles[`${property}-bottom`] = bottom;
        styles[`${property}-left`] = left;
      }
    }
  }

  /**
   * 添加字体相关样式
   */
  addFontStyles(styles, style) {
    if (style.fontFamily) styles['font-family'] = style.fontFamily;
    if (style.fontSize !== '16px') styles['font-size'] = style.fontSize;
    if (style.fontWeight !== '400') styles['font-weight'] = style.fontWeight;
    if (style.fontStyle !== 'normal') styles['font-style'] = style.fontStyle;
    if (style.lineHeight !== 'normal') styles['line-height'] = style.lineHeight;
    if (style.letterSpacing !== 'normal') styles['letter-spacing'] = style.letterSpacing;
    if (style.wordSpacing !== 'normal') styles['word-spacing'] = style.wordSpacing;
    if (style.textAlign !== 'start') styles['text-align'] = style.textAlign;
    if (style.textDecoration !== 'none') styles['text-decoration'] = style.textDecoration;
    if (style.textTransform !== 'none') styles['text-transform'] = style.textTransform;
  }

  /**
   * 提取文本相关样式（用于文本节点）
   */
  extractTextStyles(style) {
    const textStyles = {};
    
    // 字体相关
    if (style.fontFamily) textStyles['font-family'] = style.fontFamily;
    if (style.fontSize && style.fontSize !== '16px') textStyles['font-size'] = style.fontSize;
    if (style.fontWeight && style.fontWeight !== '400') textStyles['font-weight'] = style.fontWeight;
    if (style.fontStyle && style.fontStyle !== 'normal') textStyles['font-style'] = style.fontStyle;
    if (style.lineHeight && style.lineHeight !== 'normal') textStyles['line-height'] = style.lineHeight;
    if (style.letterSpacing && style.letterSpacing !== 'normal') textStyles['letter-spacing'] = style.letterSpacing;
    if (style.wordSpacing && style.wordSpacing !== 'normal') textStyles['word-spacing'] = style.wordSpacing;
    
    // 文本样式
    if (style.textDecoration && style.textDecoration !== 'none') textStyles['text-decoration'] = style.textDecoration;
    if (style.textTransform && style.textTransform !== 'none') textStyles['text-transform'] = style.textTransform;
    if (style.textAlign && style.textAlign !== 'start') textStyles['text-align'] = style.textAlign;
    if (style.whiteSpace && style.whiteSpace !== 'normal') textStyles['white-space'] = style.whiteSpace;
    if (style.wordBreak && style.wordBreak !== 'normal') textStyles['word-break'] = style.wordBreak;
    if (style.overflowWrap && style.overflowWrap !== 'normal') textStyles['overflow-wrap'] = style.overflowWrap;
    
    // 颜色
    if (style.color && style.color !== 'rgb(0, 0, 0)') textStyles.color = style.color;
    
    // 阴影
    if (style.textShadow && style.textShadow !== 'none') textStyles['text-shadow'] = style.textShadow;
    
    return textStyles;
  }

  /**
   * 添加颜色相关样式
   */
  addColorStyles(styles, style) {
    if (style.color && style.color !== 'rgb(0, 0, 0)') styles.color = style.color;
    if (style.backgroundColor && style.backgroundColor !== 'rgba(0, 0, 0, 0)') {
      styles['background-color'] = style.backgroundColor;
    }
    if (style.backgroundImage && style.backgroundImage !== 'none') {
      styles['background-image'] = style.backgroundImage;
    }
    if (style.backgroundSize && style.backgroundSize !== 'auto auto') {
      styles['background-size'] = style.backgroundSize;
    }
    if (style.backgroundPosition && style.backgroundPosition !== '0% 0%') {
      styles['background-position'] = style.backgroundPosition;
    }
    if (style.backgroundRepeat && style.backgroundRepeat !== 'repeat') {
      styles['background-repeat'] = style.backgroundRepeat;
    }
  }

  /**
   * 添加边框相关样式
   */
  addBorderStyles(styles, style) {
    const borderProperties = ['Top', 'Right', 'Bottom', 'Left'];
    
    borderProperties.forEach(side => {
      const width = style[`border${side}Width`];
      const style_prop = style[`border${side}Style`];
      const color = style[`border${side}Color`];
      
      if (width && width !== '0px' && style_prop && style_prop !== 'none') {
        styles[`border-${side.toLowerCase()}`] = `${width} ${style_prop} ${color}`;
      }
    });

    // 边框圆角
    const borderRadius = style.borderRadius;
    if (borderRadius && borderRadius !== '0px') {
      styles['border-radius'] = borderRadius;
    }

    // 边框样式简写
    if (style.border && style.border !== 'none') {
      styles.border = style.border;
    }
  }

  /**
   * 添加变换和效果相关样式
   */
  addTransformStyles(styles, style) {
    if (style.transform && style.transform !== 'none') {
      styles.transform = style.transform;
    }
    if (style.transformOrigin && style.transformOrigin !== '50% 50% 0px') {
      styles['transform-origin'] = style.transformOrigin;
    }
    if (style.opacity && style.opacity !== '1') {
      styles.opacity = style.opacity;
    }
    if (style.filter && style.filter !== 'none') {
      styles.filter = style.filter;
    }
  }

  /**
   * 添加其他样式
   */
  addMiscStyles(styles, style) {
    // 溢出处理
    if (style.overflow && style.overflow !== 'visible') {
      styles.overflow = style.overflow;
    }
    if (style.overflowX && style.overflowX !== 'visible') {
      styles['overflow-x'] = style.overflowX;
    }
    if (style.overflowY && style.overflowY !== 'visible') {
      styles['overflow-y'] = style.overflowY;
    }

    // 光标和用户交互
    if (style.cursor && style.cursor !== 'auto') {
      styles.cursor = style.cursor;
    }
    if (style.pointerEvents && style.pointerEvents !== 'auto') {
      styles['pointer-events'] = style.pointerEvents;
    }
    if (style.userSelect && style.userSelect !== 'auto') {
      styles['user-select'] = style.userSelect;
    }

    // 滚动行为
    if (style.overflowWrap && style.overflowWrap !== 'normal') {
      styles['overflow-wrap'] = style.overflowWrap;
    }
    if (style.wordBreak && style.wordBreak !== 'normal') {
      styles['word-break'] = style.wordBreak;
    }
    if (style.whiteSpace && style.whiteSpace !== 'normal') {
      styles['white-space'] = style.whiteSpace;
    }

    // 盒子尺寸
    if (style.boxSizing && style.boxSizing !== 'content-box') {
      styles['box-sizing'] = style.boxSizing;
    }

    // 阴影
    if (style.boxShadow && style.boxShadow !== 'none') {
      styles['box-shadow'] = style.boxShadow;
    }
    if (style.textShadow && style.textShadow !== 'none') {
      styles['text-shadow'] = style.textShadow;
    }
  }

  /**
   * 优化样式输出，移除默认值和重复值
   * @param {Object} styles 
   * @param {string} tagName 
   * @returns {Object}
   */
  optimizeStyles(styles, tagName) {
    const optimized = {};
    const defaultStyles = getDefaultStyles(tagName);
    
    for (const [property, value] of Object.entries(styles)) {
      const normalizedValue = normalizeStyleValue(property, value);
      
      // 跳过空值
      if (!normalizedValue) continue;
      
      // 跳过与默认样式相同的值
      if (defaultStyles[property] === normalizedValue) continue;
      
      // 跳过通用默认值
      if (isDefaultValue(property, normalizedValue)) continue;
      
      optimized[property] = normalizedValue;
    }
    
    return optimized;
  }

  /**
   * 获取元素边界信息
   */
  getBounds(element) {
    const rect = element.getBoundingClientRect();
    return {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height
    };
  }

  /**
   * 判断是否为图书特有的需要特殊处理的元素
   */
  isBookSpecialElement(element) {
    const tagName = element.tagName.toLowerCase();
    const specialTags = ['br', 'sup', 'sub', 'del', 'ins', 'mark', 'small', 'a'];
    return specialTags.includes(tagName);
  }

  /**
   * 处理图书特有的元素
   */
  processBookSpecialElement(element) {
    const tagName = element.tagName.toLowerCase();
    const computedStyle = window.getComputedStyle(element);

    switch (tagName) {
      case 'br':
        return this.processBrElement();
        
      case 'sup':
      case 'sub':
        return this.processSupSubElement(element, tagName, computedStyle);
        
      case 'del':
      case 'ins':
        return this.processDelInsElement(element, tagName, computedStyle);
        
      case 'mark':
        return this.processMarkElement(element, computedStyle);
        
      case 'small':
        return this.processSmallElement(element, computedStyle);
        
      case 'a':
        return this.processLinkElement(element, computedStyle);
        
      default:
        return null;
    }
  }

  /**
   * 处理 br 元素，转换为换行符
   */
  processBrElement() {
    return {
      type: 'text',
      text: '\n',
      style: {}
    };
  }

  /**
   * 处理上标/下标元素
   */
  processSupSubElement(element, tagName, computedStyle) {
    const textContent = element.textContent.trim();
    if (!textContent) return null;

    const textStyles = this.extractTextStyles(computedStyle);
    
    // 添加上标/下标特有样式
    if (tagName === 'sup') {
      textStyles['vertical-align'] = 'super';
      textStyles['font-size'] = '0.75em';
    } else if (tagName === 'sub') {
      textStyles['vertical-align'] = 'sub';
      textStyles['font-size'] = '0.75em';
    }

    return {
      type: 'text',
      text: textContent,
      style: textStyles
    };
  }

  /**
   * 处理删除/插入元素
   */
  processDelInsElement(element, tagName, computedStyle) {
    const textContent = element.textContent.trim();
    if (!textContent) return null;

    const textStyles = this.extractTextStyles(computedStyle);
    
    // 添加删除/插入特有样式
    if (tagName === 'del') {
      textStyles['text-decoration'] = 'line-through';
    } else if (tagName === 'ins') {
      textStyles['text-decoration'] = 'underline';
      textStyles['background-color'] = 'rgba(255, 255, 0, 0.3)'; // 浅黄色背景
    }

    return {
      type: 'text',
      text: textContent,
      style: textStyles
    };
  }

  /**
   * 处理标记元素
   */
  processMarkElement(element, computedStyle) {
    const textContent = element.textContent.trim();
    if (!textContent) return null;

    const textStyles = this.extractTextStyles(computedStyle);
    textStyles['background-color'] = 'rgba(255, 255, 0, 0.5)'; // 高亮背景

    return {
      type: 'text',
      text: textContent,
      style: textStyles
    };
  }

  /**
   * 处理小字号元素
   */
  processSmallElement(element, computedStyle) {
    const textContent = element.textContent.trim();
    if (!textContent) return null;

    const textStyles = this.extractTextStyles(computedStyle);
    textStyles['font-size'] = '0.83em'; // 与默认样式保持一致

    return {
      type: 'text',
      text: textContent,
      style: textStyles
    };
  }

  /**
   * 处理图片元素
   */
  processImgElement(element) {
    const src = element.getAttribute('src');
    const alt = element.getAttribute('alt') || '';
    const rect = element.getBoundingClientRect();

    // 返回图片信息，如果有 alt 文本也包含进来
    const imgData = {
      type: 'image',
      src: src,
      alt: alt,
      bounds: {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height
      }
    };

    // 如果图片无法加载且有 alt 文本，可以选择返回 alt 文本作为备选
    return imgData;
  }

  /**
   * 处理链接元素
   */
  processLinkElement(element, computedStyle) {
    const textContent = element.textContent.trim();
    if (!textContent) return null;

    const href = element.getAttribute('href') || '';
    const textStyles = this.extractTextStyles(computedStyle);
    
    // 添加链接特有样式（如果没有被 CSS 覆盖）
    if (!textStyles.color) {
      textStyles.color = 'rgb(0, 0, 238)'; // 默认链接颜色
    }
    if (!textStyles['text-decoration']) {
      textStyles['text-decoration'] = 'underline'; // 默认下划线
    }

    return {
      type: 'link',
      text: textContent,
      href: href,
      style: textStyles
    };
  }

  /**
   * 处理列表项前缀
   */
  processListItemPrefix(element) {
    // 只处理 li 元素
    if (element.tagName.toLowerCase() !== 'li') {
      return null;
    }

    const parent = element.parentElement;
    if (!parent) {
      return null;
    }

    const parentTag = parent.tagName.toLowerCase();
    let prefixText = '';

    if (parentTag === 'ul') {
      // 无序列表使用实心圆点
      prefixText = '• ';
    } else if (parentTag === 'ol') {
      // 有序列表使用阿拉伯数字
      const listItems = Array.from(parent.children).filter(child => 
        child.tagName.toLowerCase() === 'li'
      );
      const itemIndex = listItems.indexOf(element);
      
      // 获取起始数字（默认为 1）
      const startValue = parseInt(parent.getAttribute('start') || '1');
      const actualIndex = startValue + itemIndex;
      
      prefixText = `${actualIndex}. `;
    }

    if (!prefixText) {
      return null;
    }

    // 获取父列表的样式，用于前缀文本
    const parentStyle = window.getComputedStyle(parent);
    
    return {
      type: 'text',
      text: prefixText,
      style: this.extractTextStyles(parentStyle)
    };
  }

  /**
   * 处理伪元素，转换为普通文本节点
   */
  processPseudoElement(element, pseudo) {
    const pseudoStyle = window.getComputedStyle(element, pseudo);
    const content = pseudoStyle.content;
    
    if (!content || content === 'none' || content === 'normal') {
      return null;
    }

    // 解析伪元素内容
    let textContent = this.parsePseudoContent(content, element.tagName.toLowerCase(), pseudo);
    
    // 如果没有文本内容，返回 null
    if (!textContent) {
      return null;
    }

    // 返回包含样式的文本节点
    return {
      type: 'text',
      text: textContent,
      style: this.extractTextStyles(pseudoStyle)
    };
  }

  /**
   * 解析伪元素的 content 属性
   */
  parsePseudoContent(content, tagName, pseudo) {
    // 处理引号包围的字符串
    if (content.match(/^["'].*["']$/)) {
      return content.replace(/^["'](.*)["']$/, '$1');
    }

    // 处理 CSS 计数器
    if (content.includes('counter(')) {
      // 简化处理，返回占位符
      return content.includes('counter(') ? '1.' : '';
    }

    // 处理特殊的 CSS 关键字
    switch (content) {
      case 'open-quote':
        return this.getOpenQuote(tagName);
      case 'close-quote':
        return this.getCloseQuote(tagName);
      case 'no-open-quote':
      case 'no-close-quote':
        return '';
      default:
        // 处理其他复杂内容（如 attr() 等）
        if (content.includes('attr(')) {
          return ''; // 简化处理，忽略属性值
        }
        return content;
    }
  }

  /**
   * 获取开始引号
   */
  getOpenQuote(tagName) {
    const quoteMap = {
      'blockquote': '"',
      'q': '"',
      'cite': '"'
    };
    return quoteMap[tagName] || '"';
  }

  /**
   * 获取结束引号
   */
  getCloseQuote(tagName) {
    const quoteMap = {
      'blockquote': '"',
      'q': '"', 
      'cite': '"'
    };
    return quoteMap[tagName] || '"';
  }



  /**
   * 处理 SVG 元素，转换为图片
   */
  processSVGElement(svgElement) {
    try {
      // 获取 SVG 的边界
      const rect = svgElement.getBoundingClientRect();
      
      // 设置 SVG 的宽高属性以确保正确序列化
      const clonedSvg = svgElement.cloneNode(true);
      clonedSvg.setAttribute('width', rect.width.toString());
      clonedSvg.setAttribute('height', rect.height.toString());

      // 序列化 SVG
      const serializer = new XMLSerializer();
      const svgString = serializer.serializeToString(clonedSvg);
      const svgDataUrl = `data:image/svg+xml,${encodeURIComponent(svgString)}`;

      return {
        type: 'image',
        src: svgDataUrl,
        alt: 'SVG Image',
        bounds: {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height
        }
      };
    } catch (error) {
      console.warn('Failed to process SVG element:', error);
      return null;
    }
  }
}

// 导出解析函数
export const parseHTML = (element, options) => {
  const parser = new HTMLParser(options);
  return parser.parse(element);
};

export default HTMLParser; 