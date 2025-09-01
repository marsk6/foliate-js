import { getDefaultStyles, mergeStyles, normalizeStyleValue, isDefaultValue, isTextStyleProperty, getTextDefaults } from './DefaultStyles.js';
import { normalizeEnglishText } from './EnglishTextNormalizer.js';

export class HTMLParser {
  constructor(options = {}) {
    this.pseudoElementCounter = 0;
    this.options = {
      useDefaultStyles: true,         // 是否使用默认样式
      mergeComputedStyles: true,      // 是否合并计算后的样式
      optimizeOutput: true,           // 是否优化输出（移除默认值）
      debug: false,                   // 是否启用调试输出
      normalizeText: true,            // 是否规范化英语文本
      ...options
    };
  }

  /**
   * 创建规范化的文本节点
   * @param {string} text - 原始文本
   * @param {Object} style - 文本样式
   * @returns {Object} 文本节点对象
   */
  createTextNode(text, style = {}) {
    if (!text) return null;
    
    const trimmedText = text.trim();
    if (!trimmedText) return null;
    
    // 如果启用文本规范化，对英语文本进行规范化处理
    const finalText = this.options.normalizeText ? 
      normalizeEnglishText(trimmedText) : trimmedText;
    
    return {
      type: 'text',
      text: finalText,
      style: style
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

    // 优先处理需要忽略包装的标签（如time标签）
    if (this.isIgnoreWrapperTag(element)) {
      const contentNodes = this.processIgnoreWrapperTag(element);
      // 如果只有一个节点，直接返回；如果多个节点，用fragment包装
      if (contentNodes.length === 1) {
        return contentNodes[0];
      } else if (contentNodes.length > 1) {
        // 返回一个虚拟的fragment节点来包装多个内容
        return {
          type: 'fragment',
          children: contentNodes
        };
      }
      return null;
    }

    const computedStyle = window.getComputedStyle(element);
    
    // 检查元素是否可见
    if (!this.isVisible(computedStyle)) {
      return null;
    }

    // 按优先级提取样式：className样式 → 内联样式 → computedStyle补充
    const allStyles = this.extractAllElementStyles(element, computedStyle);
    
    const elementData = {
      type: 'element',
      tag: element.tagName.toLowerCase(),
      style: allStyles, // 合并所有来源的样式
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
        const textNode = this.createTextNode(child.textContent);
        if (textNode) {
          elementData.children.push(textNode);
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
        }
        // 处理需要忽略包装但保留内容的标签（如time标签）
        else if (this.isIgnoreWrapperTag(child)) {
          const contentNodes = this.processIgnoreWrapperTag(child);
          if (contentNodes && contentNodes.length > 0) {
            elementData.children.push(...contentNodes);
          }
        }
        // 处理纯文本样式标签：直接合并样式到文本节点，不创建element节点
        else if (this.isPureTextStyleTag(child)) {
          const textNodes = this.processTextStyleTag(child, computedStyle);
          if (textNodes && textNodes.length > 0) {
            elementData.children.push(...textNodes);
          }
        } else {
          const childElement = this.parseElement(child);
          if (childElement) {
            // 如果是fragment节点，展开其children
            if (childElement.type === 'fragment') {
              elementData.children.push(...childElement.children);
            } else {
              elementData.children.push(childElement);
            }
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
 * 提取和合并样式属性（输出 camelCase 格式）
 * @param {CSSStyleDeclaration} computedStyle 
 * @param {string} tagName 
 * @returns {Object} camelCase 格式的样式对象
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
      const computedStyles = this.extractAllStyles(computedStyle);
      finalStyles = mergeStyles(finalStyles, computedStyles);
    }

    // 3. 优化输出（移除默认值）
    if (this.options.optimizeOutput) {
      finalStyles = this.optimizeStyles(finalStyles, tagName);
    }

    // 4. 分离样式：容器元素只保留布局样式，移除文本样式
    finalStyles = this.filterLayoutStyles(finalStyles);

    return finalStyles;
  }

  /**
   * 从计算样式中提取所有样式属性
   * @param {CSSStyleDeclaration} style 
   * @returns {Object}
   */
  extractAllStyles(style) {
    const styles = {};

    // 显示和布局
    this.addDisplayStyles(styles, style);

    // 盒子模型（仅图片需要 width/height）
    this.addBoxModelStyles(styles, style);

    // 字体相关
    this.addFontStyles(styles, style);

    // 颜色和背景（仅用于特殊标签）
    this.addColorStyles(styles, style);

    return styles;
  }

  /**
   * 过滤出布局相关样式，移除文本相关样式（只保留有实际效果的）
   * @param {Object} styles 
   * @returns {Object}
   */
  filterLayoutStyles(styles) {
    const layoutStyles = {};
    
    // 只保留非文本相关且有实际效果的样式
    for (const [property, value] of Object.entries(styles)) {
      if (!isTextStyleProperty(property) && this.isEffectiveLayoutStyle(property, value)) {
        layoutStyles[property] = value;
      }
    }
    
    return layoutStyles;
  }
  


  /**
   * 判断布局样式是否有实际效果
   * @param {string} property 
   * @param {string} value 
   * @returns {boolean}
   */
  isEffectiveLayoutStyle(property, value) {
    // display：Canvas布局需要知道所有显示类型，优先处理
    if (property === 'display') {
      return value && value !== 'inherit' && value !== 'initial';
    }
    
    // 基本的无效值检查（display 之后进行）
    if (!this.hasNonZeroValue(value, property)) {
      return false;
    }
    
    // 背景色：透明色不需要（仅用于特殊标签）
    if (property === 'backgroundColor') {
      return value !== 'rgba(0, 0, 0, 0)' && value !== 'transparent';
    }
    
    return true;
  }

  /**
   * 添加显示和布局相关样式（只保留对Canvas布局有影响的样式）
   */
  addDisplayStyles(styles, style) {
    // display：Canvas布局需要知道显示类型来区分块级和内联元素
    if (style.display) {
      styles.display = style.display;
    }
  }

  /**
   * 添加盒子模型相关样式（只保留有具体数值的）
   */
  addBoxModelStyles(styles, style) {
    // 宽度和高度：图片元素需要（只有设置了具体值的才需要）
    if (style.width && style.width !== 'auto' && this.hasNonZeroValue(style.width, 'width')) {
      styles.width = style.width;
    }
    if (style.height && style.height !== 'auto' && this.hasNonZeroValue(style.height, 'height')) {
      styles.height = style.height;
    }

    // 内边距：只有非零值才需要
    this.addSpacingStyles(styles, style, 'padding');

    // 外边距：只有非零值才需要
    this.addSpacingStyles(styles, style, 'margin');
  }

  /**
   * 添加间距样式（margin/padding）- 总是展开为具体方向属性
   */
  addSpacingStyles(styles, style, property) {
    // 先处理简写属性，展开到各个方向
    if (style[property] && this.hasNonZeroValue(style[property], property)) {
      const spacingValues = this.parseSpacingShorthand(style[property]);
      if (spacingValues) {
        // 先设置简写值展开的结果
        styles[`${property}Top`] = spacingValues.top;
        styles[`${property}Right`] = spacingValues.right;
        styles[`${property}Bottom`] = spacingValues.bottom;
        styles[`${property}Left`] = spacingValues.left;
      }
    }
    
    // 处理各个方向的具体值（会覆盖简写值）
    const top = style[`${property}Top`];
    const right = style[`${property}Right`];
    const bottom = style[`${property}Bottom`];
    const left = style[`${property}Left`];

    // 分别检查每个方向的值，只保留有效果的
    if (this.hasNonZeroValue(top, `${property}Top`)) {
      styles[`${property}Top`] = top;
    }
    if (this.hasNonZeroValue(right, `${property}Right`)) {
      styles[`${property}Right`] = right;
    }
    if (this.hasNonZeroValue(bottom, `${property}Bottom`)) {
      styles[`${property}Bottom`] = bottom;
    }
    if (this.hasNonZeroValue(left, `${property}Left`)) {
      styles[`${property}Left`] = left;
    }
  }

  /**
   * 解析间距简写属性（margin/padding）
   * @param {string} spacingValue - 间距简写值，如 "10px" 或 "10px 5px" 等
   * @returns {Object|null} 解析后的方向属性
   */
  parseSpacingShorthand(spacingValue) {
    if (!spacingValue || spacingValue === '0' || spacingValue === '0px') {
      return null;
    }
    
    const values = spacingValue.trim().split(/\s+/);
    
    switch (values.length) {
      case 1:
        // 一个值：应用到所有方向
        return {
          top: values[0],
          right: values[0], 
          bottom: values[0],
          left: values[0]
        };
        
      case 2:
        // 两个值：上下, 左右
        return {
          top: values[0],
          right: values[1],
          bottom: values[0], 
          left: values[1]
        };
        
      case 3:
        // 三个值：上, 左右, 下
        return {
          top: values[0],
          right: values[1],
          bottom: values[2],
          left: values[1]
        };
        
      case 4:
        // 四个值：上, 右, 下, 左
        return {
          top: values[0],
          right: values[1], 
          bottom: values[2],
          left: values[3]
        };
        
      default:
        return null;
    }
  }





  /**
   * 判断样式值是否有实际意义（对Canvas渲染有影响）
   * @param {string} value 
   * @param {string} property 
   * @returns {boolean}
   */
  hasNonZeroValue(value, property = '') {
    if (!value) return false;
    
    // display 属性需要特殊处理，所有值都有意义（包括 'none'）
    if (property === 'display') {
      return value !== 'initial' && value !== 'inherit';
    }
    
    // textIndent 特殊处理：即使是0值也要保留，因为在继承系统中有意义
    if (property === 'textIndent') {
      return value !== 'initial' && value !== 'inherit' && value !== 'unset' && value !== 'normal';
    }
    
    // 明确的无意义值（扩展列表，包含更多 Canvas 渲染无关的值）
    const meaninglessValues = [
      'auto', 'none', 'normal', 'initial', 'inherit', 'unset',
      'transparent', 'rgba(0, 0, 0, 0)', 'rgb(0, 0, 0, 0)',
      'visible', 'static', 'content-box', 'start', 'left'
    ];
    
    if (meaninglessValues.includes(value)) {
      return false;
    }
    
    // 处理数值类型（px、%、em等）
    const numericMatch = value.match(/^(-?\d*\.?\d+)(px|%|em|rem|ex|ch|vw|vh|vmin|vmax|pt|pc|in|cm|mm|q|fr)$/);
    if (numericMatch) {
      const numericValue = parseFloat(numericMatch[1]);
      // textIndent 即使为0也保留
      if (property === 'textIndent') {
        return true;
      }
      return numericValue !== 0;
    }
    
    // 处理无单位数字
    if (!isNaN(parseFloat(value)) && isFinite(value)) {
      // textIndent 即使为0也保留
      if (property === 'textIndent') {
        return true;
      }
      return parseFloat(value) !== 0;
    }
    
    // 处理特殊的"无效果"值
    if (value === '0' || value === '0px' || value === '0%' || value === '0em') {
      // textIndent 即使为0也保留
      if (property === 'textIndent') {
        return true;
      }
      return false;
    }
    
    // 处理默认值（对 Canvas 渲染没有特殊效果的值）
    const defaultValues = {
      // 文本样式
      'fontWeight': ['400', 'normal'],
      'fontStyle': ['normal'],
      'textAlign': ['start', 'left'], 
      'lineHeight': ['normal'],
      'letterSpacing': ['normal'],
      'wordSpacing': ['normal'],
      'fontSize': ['16px', '1em', '100%'],
      'color': ['rgb(0, 0, 0)', 'black', '#000', '#000000'],
      
      // 尺寸样式（图片需要）
      'width': ['auto'],
      'height': ['auto'],
      
      // 背景样式（仅用于特殊标签）
      'backgroundColor': ['rgba(0, 0, 0, 0)', 'transparent'],
      
      // 间距样式
      'marginTop': ['0px', '0'],
      'marginRight': ['0px', '0'],
      'marginBottom': ['0px', '0'],
      'marginLeft': ['0px', '0'],
      'paddingTop': ['0px', '0'],
      'paddingRight': ['0px', '0'],
      'paddingBottom': ['0px', '0'],
      'paddingLeft': ['0px', '0']
    };
    
    if (defaultValues[property] && defaultValues[property].includes(value)) {
      return false;
    }
    


    // 处理字体相关（只支持 camelCase）
    if (property === 'fontFamily') {
      return value !== 'inherit' && value !== 'initial' && 
             !value.match(/^(serif|sans-serif|monospace|cursive|fantasy)$/i);
    }
    
    // 其他有值的都认为有意义
    return true;
  }

  /**
   * 提取文本相关样式（用于文本节点，包含继承的样式，输出 camelCase 格式）
   * @param {CSSStyleDeclaration} computedStyle 
   * @param {string} tagName 
   * @returns {Object} camelCase 格式的文本样式对象
   */
  extractTextStyles(computedStyle, tagName = 'span') {
    let allStyles = {};
    
    // 1. 先获取默认样式
    if (this.options.useDefaultStyles) {
      const defaultStyles = getDefaultStyles(tagName);
      allStyles = { ...defaultStyles };
    }

    // 2. 提取计算后的所有样式
    if (this.options.mergeComputedStyles) {
      const computedStyles = this.extractAllStyles(computedStyle);
      allStyles = mergeStyles(allStyles, computedStyles);
    }

    // 3. 优化输出（对文本样式标签保留关键样式）
    if (this.options.optimizeOutput) {
      allStyles = this.optimizeStyles(allStyles, tagName);
    }

    // 4. 只保留文本相关样式
    return this.filterTextStyles(allStyles);
  }

  /**
   * 过滤出文本相关样式（只保留有实际效果的）
   * @param {Object} styles 
   * @returns {Object}
   */
  filterTextStyles(styles) {
    const textStyles = {};
    
    // 只保留文本相关且有实际效果的样式
    for (const [property, value] of Object.entries(styles)) {
      if (isTextStyleProperty(property) && this.isEffectiveTextStyle(property, value)) {
        textStyles[property] = value;
      }
    }
    
    return textStyles;
  }

  /**
   * 判断文本样式是否有实际效果
   * @param {string} property 
   * @param {string} value 
   * @returns {boolean}
   */
  isEffectiveTextStyle(property, value) {
    // 基本的无效值检查
    if (!this.hasNonZeroValue(value, property)) {
      return false;
    }
    
    // 字体族：系统默认字体不需要记录
    if (property === 'fontFamily') {
      return !value.match(/^(serif|sans-serif|monospace|cursive|fantasy)$/i) &&
             value !== 'inherit' && value !== 'initial';
    }
    
    // 字体大小：默认大小不需要记录
    if (property === 'fontSize') {
      return value !== '16px' && value !== '1em' && value !== '100%';
    }
    
    // 字体粗细：正常粗细不需要记录
    if (property === 'fontWeight') {
      return value !== '400' && value !== 'normal';
    }
    
    // 文本对齐：默认对齐不需要记录
    if (property === 'textAlign') {
      return value !== 'start' && value !== 'left';
    }
    
    // 颜色：默认黑色不需要记录
    if (property === 'color') {
      return value !== 'rgb(0, 0, 0)' && value !== 'black' && value !== '#000' && value !== '#000000';
    }
    

    

    
    // 字体样式：normal 值不需要记录
    if (property === 'fontStyle') {
      return value !== 'normal';
    }
    
    // 行高：normal 值不需要记录
    if (property === 'lineHeight') {
      return value !== 'normal';
    }
    
    // 字符间距和词间距：normal 值不需要记录
    if (property === 'letterSpacing' || property === 'wordSpacing') {
      return value !== 'normal' && this.hasNonZeroValue(value, property);
    }
    
    return true;
  }

  /**
   * 添加字体相关样式（只保留有实际效果的，展开简写属性）
   */
  addFontStyles(styles, style) {
    // 先处理 font 简写属性，展开到具体属性
    if (style.font && style.font !== 'inherit' && style.font !== 'initial') {
      const fontValues = this.parseFontShorthand(style.font);
      if (fontValues) {
        // 设置解析出的字体属性
        if (fontValues.fontSize) styles.fontSize = fontValues.fontSize;
        if (fontValues.fontFamily) styles.fontFamily = fontValues.fontFamily;
        if (fontValues.fontWeight) styles.fontWeight = fontValues.fontWeight;
        if (fontValues.fontStyle) styles.fontStyle = fontValues.fontStyle;
        if (fontValues.lineHeight) styles.lineHeight = fontValues.lineHeight;
      }
    }
    
    // 字体族：只有设置了具体字体名的才需要（会覆盖简写值）
    if (style.fontFamily && 
        !style.fontFamily.match(/^(serif|sans-serif|monospace|cursive|fantasy)$/i) &&
        style.fontFamily !== 'inherit' && 
        style.fontFamily !== 'initial') {
      styles.fontFamily = style.fontFamily;
    }
    
    // 字体大小：只有非默认16px的才需要
    if (style.fontSize && style.fontSize !== '16px' && this.hasNonZeroValue(style.fontSize, 'fontSize')) {
      styles.fontSize = style.fontSize;
    }
    
    // 字体粗细：只有非正常粗细的才需要
    if (style.fontWeight && style.fontWeight !== '400' && style.fontWeight !== 'normal') {
      styles.fontWeight = style.fontWeight;
    }
    
    // 字体样式：只有非正常的才需要
    if (style.fontStyle && style.fontStyle !== 'normal') {
      styles.fontStyle = style.fontStyle;
    }
    
    // 行高：只有设置了具体值的才需要
    if (style.lineHeight && style.lineHeight !== 'normal' && this.hasNonZeroValue(style.lineHeight, 'lineHeight')) {
      styles.lineHeight = style.lineHeight;
    }
    
    // 字符间距：只有设置了间距的才需要
    if (style.letterSpacing && style.letterSpacing !== 'normal' && this.hasNonZeroValue(style.letterSpacing, 'letterSpacing')) {
      styles.letterSpacing = style.letterSpacing;
    }
    
    // 词间距：只有设置了间距的才需要
    if (style.wordSpacing && style.wordSpacing !== 'normal' && this.hasNonZeroValue(style.wordSpacing, 'wordSpacing')) {
      styles.wordSpacing = style.wordSpacing;
    }
    
    // 文本对齐：只有非默认的才需要
    if (style.textAlign && style.textAlign !== 'start' && style.textAlign !== 'left') {
      styles.textAlign = style.textAlign;
    }

    

  }

  /**
   * 解析字体简写属性
   * @param {string} fontValue - 字体简写值，如 "bold 16px/1.5 Arial, sans-serif"
   * @returns {Object|null} 解析后的字体属性
   */
  parseFontShorthand(fontValue) {
    if (!fontValue || fontValue === 'inherit' || fontValue === 'initial') {
      return null;
    }
    
    // 字体简写的基本格式：[font-style] [font-weight] font-size[/line-height] font-family
    // 简化解析：提取主要部分
    const parts = fontValue.trim().split(/\s+/);
    const result = {};
    
    let fontSizeIndex = -1;
    
    // 查找字体大小（包含数字和单位的部分）
    for (let i = 0; i < parts.length; i++) {
      if (parts[i].match(/^\d+(\.\d+)?(px|em|rem|%|pt)$/)) {
        fontSizeIndex = i;
        break;
      }
      // 处理带行高的字体大小，如 "16px/1.5"
      if (parts[i].includes('/')) {
        const [size, lineHeight] = parts[i].split('/');
        if (size.match(/^\d+(\.\d+)?(px|em|rem|%|pt)$/)) {
          fontSizeIndex = i;
          result.fontSize = size;
          result.lineHeight = lineHeight;
          break;
        }
      }
    }
    
    if (fontSizeIndex >= 0) {
      // 设置字体大小（如果还没设置）
      if (!result.fontSize) {
        result.fontSize = parts[fontSizeIndex];
      }
      
      // 字体族是字体大小之后的所有部分
      if (fontSizeIndex + 1 < parts.length) {
        result.fontFamily = parts.slice(fontSizeIndex + 1).join(' ');
      }
      
      // 字体样式和粗细在字体大小之前
      for (let i = 0; i < fontSizeIndex; i++) {
        const part = parts[i];
        
        // 检查字体粗细
        if (['normal', 'bold', 'bolder', 'lighter', '100', '200', '300', '400', '500', '600', '700', '800', '900'].includes(part)) {
          result.fontWeight = part;
        }
        // 检查字体样式
        else if (['normal', 'italic', 'oblique'].includes(part)) {
          result.fontStyle = part;
        }
      }
    }
    
    return Object.keys(result).length > 0 ? result : null;
  }

  /**
   * 添加颜色和背景相关样式（仅保留 backgroundColor 用于特殊标签）
   */
  addColorStyles(styles, style) {
    // 文本颜色：只有非默认黑色才需要记录
    if (style.color && style.color !== 'rgb(0, 0, 0)' && style.color !== 'black') {
      styles.color = style.color;
    }
    
    // 背景色：仅用于特殊标签（如 ins）
    if (style.backgroundColor && style.backgroundColor !== 'rgba(0, 0, 0, 0)' && style.backgroundColor !== 'transparent') {
      styles.backgroundColor = style.backgroundColor;
    }
  }

  /**
   * 验证是否为有效的颜色值
   * @param {string} value - 要验证的值
   * @returns {boolean} 是否为有效颜色
   */
  isValidColor(value) {
    if (!value || typeof value !== 'string') {
      return false;
    }
    
    const trimmedValue = value.trim();
    
    // 检查 hex 颜色
    if (trimmedValue.match(/^#[0-9a-fA-F]{3,6}$/)) {
      return true;
    }
    
    // 检查 rgb/rgba 颜色
    if (trimmedValue.match(/^rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(,\s*[\d.]+)?\s*\)$/)) {
      return true;
    }
    
    // 检查 hsl/hsla 颜色
    if (trimmedValue.match(/^hsla?\(\s*\d+\s*,\s*\d+%\s*,\s*\d+%\s*(,\s*[\d.]+)?\s*\)$/)) {
      return true;
    }
    
    // 检查命名颜色
    const namedColors = [
      'red', 'blue', 'green', 'yellow', 'white', 'black', 'gray', 'grey', 
      'orange', 'purple', 'pink', 'brown', 'cyan', 'magenta', 'lime', 
      'navy', 'olive', 'maroon', 'teal', 'silver', 'aqua', 'fuchsia',
      'darkred', 'darkblue', 'darkgreen', 'lightblue', 'lightgreen', 
      'lightgray', 'lightgrey', 'darkgray', 'darkgrey', 'transparent',
      'currentColor', 'inherit', 'initial'
    ];
    
    return namedColors.includes(trimmedValue.toLowerCase());
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
    
    // 关键样式列表 - 这些样式即使是"默认值"也要保留
    const criticalProperties = [
      'display', 'fontSize', 'textIndent', 'fontFamily', 'fontWeight', 'color'
    ];
    
    for (const [property, value] of Object.entries(styles)) {
      const normalizedValue = normalizeStyleValue(property, value);
      
      // 跳过空值
      if (!normalizedValue) continue;
      
      // 关键属性永远保留
      if (criticalProperties.includes(property)) {
        optimized[property] = normalizedValue;
        continue;
      }
      
      // 跳过与默认样式相同的值（但不包括关键属性）
      if (defaultStyles[property] === normalizedValue) continue;
      
      // 跳过通用默认值（但不包括关键属性）
      if (isDefaultValue(property, normalizedValue)) continue;
      
      optimized[property] = normalizedValue;
    }
    
    return optimized;
  }

  /**
   * 提取元素的所有样式（按优先级合并多个来源）
   * @param {Element} element - DOM元素
   * @param {CSSStyleDeclaration} computedStyle - 计算样式
   * @returns {Object} 合并后的样式对象
   */




  /**
   * 提取元素的所有样式（按优先级合并多个来源）
   * @param {Element} element - DOM元素
   * @param {CSSStyleDeclaration} computedStyle - 计算样式
   * @returns {Object} 合并后的样式对象
   */
  extractAllElementStyles(element, computedStyle) {
    const tagName = element.tagName.toLowerCase();
    let allStyles = {};

    // 1. 默认样式（优先级最低）
    if (this.options.useDefaultStyles) {
      const defaultStyles = getDefaultStyles(tagName);
      allStyles = { ...defaultStyles };
    }

    // 2. CSS类样式（从样式表中获取）
    const classStyles = this.extractClassStyles(element);
    allStyles = mergeStyles(allStyles, classStyles);

    // 3. 内联样式（style属性）
    const inlineStyles = this.extractInlineStyles(element);
    allStyles = mergeStyles(allStyles, inlineStyles);

    // 4. 从computedStyle补充有用的样式（优先级最高，但不覆盖已明确指定的样式）
    const computedStyles = this.extractComputedStyles(computedStyle, tagName, allStyles);
    allStyles = mergeStyles(allStyles, computedStyles);

    // 5. 优化输出
    if (this.options.optimizeOutput) {
      allStyles = this.optimizeStyles(allStyles, tagName);
    }

    return allStyles;
  }

  /**
   * 从元素的className中提取CSS类样式
   * @param {Element} element - DOM元素
   * @returns {Object} CSS类样式对象
   */
  extractClassStyles(element) {
    const classStyles = {};
    const classList = element.classList;
    
    if (!classList || classList.length === 0) {
      return classStyles;
    }

    try {
      // 获取所有样式表
      const styleSheets = Array.from(element.ownerDocument.styleSheets);
      
      for (const className of classList) {
        // 尝试多种选择器格式
        const selectors = [
          `.${className}`,           // 基本类选择器
          `*.${className}`,          // 通用选择器加类
          `${element.tagName.toLowerCase()}.${className}`  // 标签加类选择器
        ];
        
        let foundRule = false;
        for (const selector of selectors) {
          const classRule = this.findCSSRule(selector, styleSheets);
          if (classRule && classRule.style) {
            const ruleStyles = this.parseCSSStyleDeclaration(classRule.style);
            Object.assign(classStyles, ruleStyles);
            foundRule = true;
            
            // 调试信息
            if (this.options.debug) {
              console.log(`Found CSS rule for ${selector}:`, ruleStyles);
            }
            break; // 找到规则后跳出内层循环
          }
        }
        
        // 如果找不到规则，尝试从计算样式中推断
        if (!foundRule) {
          const inferredStyles = this.inferClassStyles(element, className);
          if (Object.keys(inferredStyles).length > 0) {
            Object.assign(classStyles, inferredStyles);
            
            if (this.options.debug) {
              console.log(`Inferred styles for class ${className}:`, inferredStyles);
            }
          }
        }
      }
    } catch (error) {
      console.warn('Failed to extract class styles:', error);
      
      // 作为后备，尝试从计算样式中推断所有类的样式
      try {
        for (const className of classList) {
          const inferredStyles = this.inferClassStyles(element, className);
          Object.assign(classStyles, inferredStyles);
        }
      } catch (inferError) {
        console.warn('Failed to infer class styles:', inferError);
      }
    }

    return classStyles;
  }

  /**
   * 从元素的style属性中提取内联样式
   * @param {Element} element - DOM元素
   * @returns {Object} 内联样式对象
   */
  extractInlineStyles(element) {
    const inlineStyles = {};
    
    if (element.style && element.style.length > 0) {
      const ruleStyles = this.parseCSSStyleDeclaration(element.style);
      Object.assign(inlineStyles, ruleStyles);
    }

    return inlineStyles;
  }

  /**
   * 从computedStyle中提取有用的样式（智能合并，避免丢失重要样式）
   * @param {CSSStyleDeclaration} computedStyle - 计算样式
   * @param {string} tagName - 标签名
   * @param {Object} existingStyles - 已存在的样式
   * @returns {Object} 计算样式对象
   */
  extractComputedStyles(computedStyle, tagName, existingStyles) {
    const computedStyles = {};

    // 提取所有相关的样式
    const relevantStyles = this.extractAllStyles(computedStyle);
    
    // 关键样式列表 - 这些样式即使存在也要检查是否需要更新
    const criticalStyleProperties = [
      'fontSize', 'textIndent', 'lineHeight', 'fontFamily', 'fontWeight',
      'color', 'backgroundColor', 'display', 'textAlign'
    ];
    
    for (const [property, value] of Object.entries(relevantStyles)) {
      // 如果属性不存在，直接添加
      if (!(property in existingStyles)) {
        computedStyles[property] = value;
      } 
      // 如果是关键样式，检查现有值是否有效
      else if (criticalStyleProperties.includes(property)) {
        const existingValue = existingStyles[property];
        
        // 如果现有值无效或是占位符，用计算值替换
        if (!this.isValidStyleValue(property, existingValue) || 
            this.isPlaceholderValue(property, existingValue)) {
          computedStyles[property] = value;
        }
      }
    }

    return computedStyles;
  }

  /**
   * 查找CSS规则
   * @param {string} selector - CSS选择器
   * @param {StyleSheet[]} styleSheets - 样式表数组
   * @returns {CSSStyleRule|null} 找到的CSS规则
   */
  findCSSRule(selector, styleSheets) {
    for (const styleSheet of styleSheets) {
      try {
        if (!styleSheet.cssRules) continue;
        
        for (const rule of Array.from(styleSheet.cssRules)) {
          if (rule instanceof CSSStyleRule && rule.selectorText === selector) {
            return rule;
          }
        }
      } catch (error) {
        // 跨域或其他访问限制，跳过这个样式表
        continue;
      }
    }
    return null;
  }

  /**
   * 从计算样式中推断类样式（当无法直接访问样式表时的后备方案）
   * @param {Element} element - DOM元素
   * @param {string} className - 类名
   * @returns {Object} 推断出的样式对象
   */
  inferClassStyles(element, className) {
    const inferredStyles = {};
    
    try {
      // 获取元素的计算样式
      const computedStyle = window.getComputedStyle(element);
      
      // 创建一个临时的相同标签元素，但不包含这个类
      const testElement = element.ownerDocument.createElement(element.tagName);
      
      // 复制除了目标类之外的所有类
      const otherClasses = Array.from(element.classList).filter(cls => cls !== className);
      if (otherClasses.length > 0) {
        testElement.className = otherClasses.join(' ');
      }
      
      // 复制内联样式
      if (element.style.cssText) {
        testElement.style.cssText = element.style.cssText;
      }
      
      // 将测试元素添加到DOM中（隐藏状态）
      testElement.style.position = 'absolute';
      testElement.style.visibility = 'hidden';
      testElement.style.top = '-9999px';
      element.parentNode.appendChild(testElement);
      
      // 获取测试元素的计算样式
      const testComputedStyle = window.getComputedStyle(testElement);
      
      // 比较两个计算样式，找出差异
      const importantProperties = [
        'fontSize', 'fontFamily', 'fontWeight', 'fontStyle',
        'color', 'backgroundColor', 'textAlign', 'textIndent',
        'lineHeight', 'marginTop', 'marginBottom', 'paddingTop', 'paddingBottom'
      ];
      
      for (const property of importantProperties) {
        const originalValue = computedStyle[property];
        const testValue = testComputedStyle[property];
        
        if (originalValue !== testValue && this.hasNonZeroValue(originalValue, property)) {
          inferredStyles[property] = originalValue;
        }
      }
      
      // 清理测试元素
      element.parentNode.removeChild(testElement);
      
    } catch (error) {
      // 如果推断失败，静默忽略
      if (this.options.debug) {
        console.warn(`Failed to infer styles for class ${className}:`, error);
      }
    }
    
    return inferredStyles;
  }

  /**
   * 解析CSSStyleDeclaration为camelCase格式的对象
   * @param {CSSStyleDeclaration} styleDeclaration - CSS样式声明
   * @returns {Object} camelCase格式的样式对象
   */
  parseCSSStyleDeclaration(styleDeclaration) {
    const styles = {};
    
    for (let i = 0; i < styleDeclaration.length; i++) {
      const property = styleDeclaration[i];
      const value = styleDeclaration.getPropertyValue(property);
      
      if (value) {
        // 转换为camelCase格式
        const camelCaseProperty = this.toCamelCase(property);
        styles[camelCaseProperty] = value;
      }
    }

    return styles;
  }

  /**
   * 将CSS属性名转换为camelCase格式
   * @param {string} property - CSS属性名（kebab-case）
   * @returns {string} camelCase格式的属性名
   */
  toCamelCase(property) {
    return property.replace(/-([a-z])/g, (match, letter) => letter.toUpperCase());
  }

  /**
   * 检查样式值是否有效
   * @param {string} property - 样式属性名
   * @param {string} value - 样式值
   * @returns {boolean} 是否为有效值
   */
  isValidStyleValue(property, value) {
    if (!value || value.trim() === '') return false;
    
    // 检查是否为明显的无效值
    const invalidValues = ['none', 'normal', 'auto', 'initial', 'inherit', 'unset', ''];
    if (invalidValues.includes(value.toLowerCase().trim())) {
      // textIndent 的 0 值是有效的
      if (property === 'textIndent' && (value === '0' || value === '0px')) {
        return true;
      }
      return false;
    }
    
    // 检查数值类型的属性
    if (['fontSize', 'lineHeight', 'textIndent'].includes(property)) {
      // 检查是否包含有效数值
      return value.match(/\d+(\.\d+)?(px|em|rem|%|pt|in|cm|mm|ex|ch|vw|vh|vmin|vmax)?/) !== null;
    }
    
    return true;
  }

  /**
   * 检查是否为占位符值（从 className 或 style 提取失败时的占位符）
   * @param {string} property - 样式属性名
   * @param {string} value - 样式值
   * @returns {boolean} 是否为占位符值
   */
  isPlaceholderValue(property, value) {
    if (!value) return true;
    
    // 常见的占位符或无效值
    const placeholderValues = [
      '', 'undefined', 'null', 'NaN', 'inherit', 'initial', 'unset'
    ];
    
    return placeholderValues.includes(value);
  }

  /**
   * 获取元素边界信息
   */
  getBounds(element) {
    const rect = element.getBoundingClientRect();
    return {
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
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
   * 判断是否为纯文本样式标签（不需要创建独立element节点）
   */
  isPureTextStyleTag(element) {
    const tagName = element.tagName.toLowerCase();
    const pureTextStyleTags = ['i', 'em', 'b', 'strong', 'u', 's', 'big'];
    return pureTextStyleTags.includes(tagName);
  }

  /**
   * 判断是否为需要忽略包装但保留内容的标签
   */
  isIgnoreWrapperTag(element) {
    const tagName = element.tagName.toLowerCase();
    const ignoreWrapperTags = ['time', 'span'];  // time标签对阅读器无用，span通常也只是语义包装
    return ignoreWrapperTags.includes(tagName);
  }

  /**
   * 处理忽略包装但保留内容的标签（如time、span等）
   * @param {Element} element - 需要忽略包装的元素
   * @returns {Array} 内容节点数组
   */
  processIgnoreWrapperTag(element) {
    const contentNodes = [];
    
    // 遍历子节点，直接提取内容，不保留包装元素
    for (let child = element.firstChild; child; child = child.nextSibling) {
      if (child.nodeType === Node.TEXT_NODE) {
        const textNode = this.createTextNode(child.textContent);
        if (textNode) {
          contentNodes.push(textNode);
        }
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        // 递归处理子元素
        const childElement = this.parseElement(child);
        if (childElement) {
          // 如果是fragment节点，展开其children
          if (childElement.type === 'fragment') {
            contentNodes.push(...childElement.children);
          } else {
            contentNodes.push(childElement);
          }
        }
      }
    }
    
    return contentNodes;
  }

  /**
   * 处理纯文本样式标签，将样式直接合并到文本节点
   * @param {Element} element - 文本样式标签元素
   * @param {CSSStyleDeclaration} parentStyle - 父元素的计算样式
   * @returns {Array} 文本节点数组
   */
  processTextStyleTag(element, parentStyle) {
    const textNodes = [];
    const tagName = element.tagName.toLowerCase();
    
    // 获取这个标签的计算样式
    const elementStyle = window.getComputedStyle(element);
    
    // 直接从计算样式中提取关键的文本样式，避免被优化过滤
    const elementTextStyles = this.extractRawTextStyles(elementStyle, tagName);
    
    // 注意：不再合并父元素样式，父元素的textStyle会在渲染时继承
    // 这里只保存元素特有的样式（如<i>的italic、<b>的bold等）
    
    // 遍历子节点
    for (let child = element.firstChild; child; child = child.nextSibling) {
      if (child.nodeType === Node.TEXT_NODE) {
        const textNode = this.createTextNode(child.textContent, elementTextStyles);
        if (textNode) {
          textNodes.push(textNode);
        }
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        // 如果是嵌套的纯文本样式标签，递归处理
        if (this.isPureTextStyleTag(child)) {
          const nestedTextNodes = this.processTextStyleTag(child, elementStyle);
          if (nestedTextNodes && nestedTextNodes.length > 0) {
            textNodes.push(...nestedTextNodes);
          }
        }
        // 处理需要忽略包装但保留内容的标签
        else if (this.isIgnoreWrapperTag(child)) {
          const contentNodes = this.processIgnoreWrapperTag(child);
          if (contentNodes && contentNodes.length > 0) {
            textNodes.push(...contentNodes);
          }
        }
        // 其他元素类型的子节点可以忽略或特殊处理
        else if (this.isBookSpecialElement(child)) {
          const specialElement = this.processBookSpecialElement(child);
          if (specialElement) {
            if (Array.isArray(specialElement)) {
              textNodes.push(...specialElement);
            } else {
              textNodes.push(specialElement);
            }
          }
        }
      }
    }
    
    return textNodes;
  }
  
  /**
   * 提取文本样式标签本身贡献的样式（不包括继承样式）
   * @param {CSSStyleDeclaration} computedStyle 
   * @param {string} tagName 
   * @returns {Object} 该标签特有的文本样式对象
   */
  extractRawTextStyles(computedStyle, tagName) {
    const rawStyles = {};
    
    // 定义各种文本样式标签应该贡献的样式
    const tagStyleContributions = {
      'i': ['fontStyle'],
      'em': ['fontStyle'], 
      'b': ['fontWeight'],
      'strong': ['fontWeight'],
      'small': ['fontSize'],
      'big': ['fontSize'],
      'u': ['textDecoration'],
      's': ['textDecoration'],
      'del': ['textDecoration'],
      'ins': ['textDecoration'],
      'mark': ['backgroundColor'],
      'sup': ['verticalAlign', 'fontSize'],
      'sub': ['verticalAlign', 'fontSize']
    };
    
    // 只提取该标签应该贡献的样式属性
    const allowedProperties = tagStyleContributions[tagName] || [];
    
    allowedProperties.forEach(property => {
      const value = computedStyle[property];
      
      if (value && this.isEffectiveTextStyleRaw(property, value, tagName)) {
        rawStyles[property] = value;
      }
    });
    
    return rawStyles;
  }
  
  /**
   * 判断原始文本样式是否有效（对文本样式标签更宽松的判断）
   * @param {string} property 
   * @param {string} value 
   * @param {string} tagName 
   * @returns {boolean}
   */
  isEffectiveTextStyleRaw(property, value, tagName) {
    // 基本无效值检查
    if (!value) return false;
    
    // 对于文本样式标签，其关键样式始终有效（即使是"默认值"）
    const keyStyleMap = {
      'i': ['fontStyle'], 
      'em': ['fontStyle'], 
      'b': ['fontWeight'], 
      'strong': ['fontWeight'], 
      'small': ['fontSize'], 
      'big': ['fontSize'], 
      'u': ['textDecoration'], 
      's': ['textDecoration'], 
    };
    
    const keyProperties = keyStyleMap[tagName];
    if (keyProperties && keyProperties.includes(property)) {
      return true; // 关键样式始终保留
    }
    
    // 对于非关键样式，使用标准的有效性判断
    return this.isEffectiveTextStyle(property, value);
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
    return this.createTextNode('\n');
  }

  /**
   * 处理上标/下标元素
   */
  processSupSubElement(element, tagName, computedStyle) {
    const textStyles = this.extractTextStyles(computedStyle, tagName);
    
    // 添加上标/下标特有样式
    if (tagName === 'sup') {
      textStyles.verticalAlign = 'super';
      textStyles.fontSize = '0.75em';
    } else if (tagName === 'sub') {
      textStyles.verticalAlign = 'sub';
      textStyles.fontSize = '0.75em';
    }

    return this.createTextNode(element.textContent, textStyles);
  }

  /**
   * 处理删除/插入元素
   */
  processDelInsElement(element, tagName, computedStyle) {
    const textStyles = this.extractTextStyles(computedStyle, tagName);
    
    // 添加删除/插入特有样式
    if (tagName === 'del') {
      // 删除线样式已移除，可以考虑用其他方式表示（如颜色变化）
      textStyles.color = 'rgba(128, 128, 128, 0.7)'; // 灰色表示删除内容
    } else if (tagName === 'ins') {
      textStyles.backgroundColor = 'rgba(255, 255, 0, 0.3)'; // 浅黄色背景表示插入内容
    }

    return this.createTextNode(element.textContent, textStyles);
  }

  /**
   * 处理标记元素
   */
  processMarkElement(element, computedStyle) {
    const textStyles = this.extractTextStyles(computedStyle, 'mark');
    textStyles.backgroundColor = 'rgba(255, 255, 0, 0.5)'; // 高亮背景

    return this.createTextNode(element.textContent, textStyles);
  }

  /**
   * 处理小字号元素
   */
  processSmallElement(element, computedStyle) {
    const textStyles = this.extractTextStyles(computedStyle, 'small');

    return this.createTextNode(element.textContent, textStyles);
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
        top: rect.top,
        left: rect.left,
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
    const textStyles = this.extractTextStyles(computedStyle, 'a');

    // 对链接文本进行规范化
    const normalizedText = this.options.normalizeText ? 
      normalizeEnglishText(textContent) : textContent;

    return {
      type: 'link',
      text: normalizedText,
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
    const textStyles = this.extractTextStyles(parentStyle, parentTag);
    
    return this.createTextNode(prefixText, textStyles);
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
    const textStyles = this.extractTextStyles(pseudoStyle, element.tagName.toLowerCase());
    return this.createTextNode(textContent, textStyles);
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
      
      // 检查 SVG 是否包含 blob URL 引用
      const hasBlobUrl = this.svgContainsBlobUrl(svgElement);
      
      if (hasBlobUrl) {
        // 如果包含 blob URL，提取内部的 image 元素直接处理
        return this.extractSVGImageElement(svgElement, rect);
      } else {
        // 如果不包含 blob URL，正常转换为 blob URL
        return this.convertSVGToBlobUrl(svgElement, rect);
      }
    } catch (error) {
      console.warn('Failed to process SVG element:', error);
      return null;
    }
  }

  /**
   * 检查 SVG 是否包含 blob URL 引用
   */
  svgContainsBlobUrl(svgElement) {
    const images = svgElement.querySelectorAll('image');
    for (const img of images) {
      const href = img.getAttribute('href') || img.getAttribute('xlink:href');
      if (href && href.startsWith('blob:')) {
        return true;
      }
    }
    return false;
  }

  /**
   * 提取 SVG 内部的 image 元素直接处理
   */
  extractSVGImageElement(svgElement, rect) {
    const imageElement = svgElement.querySelector('image');
    if (!imageElement) {
      console.warn('SVG contains blob URL but no image element found');
      return null;
    }

    const href = imageElement.getAttribute('href') || imageElement.getAttribute('xlink:href');
    if (!href) {
      console.warn('Image element has no href attribute');
      return null;
    }

    // 获取图片的尺寸信息
    const width = imageElement.getAttribute('width') || rect.width;
    const height = imageElement.getAttribute('height') || rect.height;

    return {
      type: 'image',
      src: href, // 直接使用 blob URL
      alt: 'SVG Image Content',
      bounds: {
        top: rect.top,
        left: rect.left,
        width: parseFloat(width) || rect.width,
        height: parseFloat(height) || rect.height
      }
    };
  }

  /**
   * 将 SVG 转换为 blob URL（不包含 blob URL 引用的情况）
   */
  convertSVGToBlobUrl(svgElement, rect) {
    // 设置 SVG 的宽高属性以确保正确序列化
    const clonedSvg = svgElement.cloneNode(true);
    clonedSvg.setAttribute('width', rect.width.toString());
    clonedSvg.setAttribute('height', rect.height.toString());
    
    // 确保 SVG 命名空间存在
    if (!clonedSvg.getAttribute('xmlns')) {
      clonedSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    }

    // 序列化 SVG
    const serializer = new XMLSerializer();
    let svgString = serializer.serializeToString(clonedSvg);
    
    // 清理 SVG 字符串以提高兼容性
    svgString = this.cleanSVGString(svgString);
    
    // 生成 SVG blob URL
    const svgBlobUrl = this.createSVGBlobURL(svgString);
    
    // 验证 blob URL 是否有效
    if (!svgBlobUrl) {
      console.warn('Failed to create valid SVG blob URL');
      return null;
    }

    return {
      type: 'image',
      src: svgBlobUrl,
      alt: 'SVG Image',
      bounds: {
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height
      }
    };
  }
  
  /**
   * 清理 SVG 字符串以提高兼容性
   * @param {string} svgString - 原始 SVG 字符串
   * @returns {string} 清理后的 SVG 字符串
   */
  cleanSVGString(svgString) {
    if (!svgString) return '';
    
    // 移除可能导致问题的字符和属性
    let cleaned = svgString
      // 移除 XML 声明
      .replace(/<\?xml[^>]*\?>/g, '')
      // 移除 DOCTYPE 声明
      .replace(/<!DOCTYPE[^>]*>/g, '')
      // 移除不必要的空白
      .trim()
      // 确保单引号和双引号正确转义
      .replace(/'/g, '&#39;')
      // 移除可能有问题的注释
      .replace(/<!--[\s\S]*?-->/g, '');
    
    return cleaned;
  }

  /**
   * 创建 SVG blob URL
   * @param {string} svgString - SVG 字符串
   * @returns {string} blob URL
   */
  createSVGBlobURL(svgString) {
    try {
      // 创建 blob 对象
      const blob = new Blob([svgString], { type: 'image/svg+xml' });
      
      // 创建 blob URL
      const blobUrl = URL.createObjectURL(blob);
      
      // 可选：存储 blob URL 以便后续清理（避免内存泄漏）
      if (!this.createdBlobUrls) {
        this.createdBlobUrls = new Set();
      }
      this.createdBlobUrls.add(blobUrl);
      
      return blobUrl;
    } catch (error) {
      console.warn('Failed to create SVG blob URL:', error);
      return null;
    }
  }

  /**
   * 清理创建的 blob URLs 以释放内存
   */
  cleanup() {
    if (this.createdBlobUrls) {
      this.createdBlobUrls.forEach(url => {
        try {
          URL.revokeObjectURL(url);
        } catch (error) {
          console.warn('Failed to revoke blob URL:', error);
        }
      });
      this.createdBlobUrls.clear();
    }
  }
}

// 导出解析函数
export const parseHTML = (element, options) => {
  const parser = new HTMLParser(options);
  return parser.parse(element);
};

export default HTMLParser; 