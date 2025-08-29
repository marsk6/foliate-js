import { getDefaultStyles, mergeStyles, normalizeStyleValue, isDefaultValue, isTextStyleProperty, getTextDefaults } from './DefaultStyles.js';

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
          const textStyles = this.extractTextStyles(computedStyle, element.tagName.toLowerCase());
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
            elementData.children.push(childElement);
                 }
     }
   }
   
   /**
    * 清理 SVG 字符串，去除可能影响 data URL 的内容
    * @param {string} svgString - 原始 SVG 字符串
    * @returns {string} 清理后的 SVG 字符串
    */
   cleanSVGString(svgString) {
     // 1. 移除可能的 XML 声明（data URL 中不需要）
     svgString = svgString.replace(/^<\?xml[^>]*\?>/, '');
     
     // 2. 移除 DOCTYPE 声明（如果存在）
     svgString = svgString.replace(/<!DOCTYPE[^>]*>/i, '');
     
     // 3. 清理多余的空白字符
     svgString = svgString.trim();
     
     // 4. 确保 SVG 根元素有正确的命名空间
     if (!svgString.includes('xmlns="http://www.w3.org/2000/svg"')) {
       svgString = svgString.replace(
         /<svg([^>]*)>/,
         '<svg$1 xmlns="http://www.w3.org/2000/svg">'
       );
     }
     
     // 5. 移除可能引起问题的注释
     svgString = svgString.replace(/<!--[\s\S]*?-->/g, '');
     
     // 6. 处理特殊字符（确保引号正确转义）
     svgString = svgString.replace(/"/g, "'"); // 将双引号替换为单引号，避免 data URL 中的引号冲突
     
     return svgString;
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
    
    // 背景色：透明色不需要
    if (property === 'backgroundColor') {
      return value !== 'rgba(0, 0, 0, 0)' && value !== 'transparent';
    }
    
    // 背景图：none 值不需要记录
    if (property === 'backgroundImage') {
      return value !== 'none';
    }
    
    // 边框：无边框不需要
    if (property.includes('border')) {
      return this.hasNonZeroValue(value, property) && value !== 'none';
    }
    
    // 变换：none 值不需要记录
    if (property === 'transform') {
      return value !== 'none' && value !== 'matrix(1, 0, 0, 1, 0, 0)';
    }
    
    // 滤镜：none 值不需要记录
    if (property === 'filter') {
      return value !== 'none';
    }
    
    // 阴影：none 值不需要记录
    if (property === 'boxShadow') {
      return value !== 'none' && !value.includes('0px 0px 0px') && 
             !value.includes('rgba(0, 0, 0, 0)');
    }
    
    // 浮动和清除：none 值不需要记录
    if (property === 'float' || property === 'clear') {
      return value !== 'none';
    }
    
    // 定位：static 值不需要记录
    if (property === 'position') {
      return value !== 'static';
    }
    
    // 可见性：visible 值不需要记录
    if (property === 'visibility') {
      return value !== 'visible';
    }
    
    return true;
  }

  /**
   * 添加显示和布局相关样式（只保留对Canvas布局有影响的样式）
   */
  addDisplayStyles(styles, style) {
    // display：Canvas布局需要知道所有显示类型
    if (style.display) {
      // Canvas 布局需要区分 block、inline 和其他类型
      styles.display = style.display;
    }
    
    // 定位相关：只有非 static 的才需要
    if (style.position && style.position !== 'static') {
      styles.position = style.position;
    }
    
    // 浮动：只有设置了浮动的才需要
    if (style.float && style.float !== 'none') {
      styles.float = style.float;
    }
    
    // 清除浮动：只有设置了的才需要  
    if (style.clear && style.clear !== 'none') {
      styles.clear = style.clear;
    }
    
    // 可见性：只有隐藏的才需要记录
    if (style.visibility && style.visibility !== 'visible') {
      styles.visibility = style.visibility;
    }
    
    // z-index：只有设置了具体数值的才需要
    if (style.zIndex && style.zIndex !== 'auto' && !isNaN(parseInt(style.zIndex))) {
      styles.zIndex = style.zIndex;
    }
  }

  /**
   * 添加盒子模型相关样式（只保留有具体数值的）
   */
  addBoxModelStyles(styles, style) {
    // 宽度和高度：只有设置了具体值的才需要
    if (style.width && style.width !== 'auto' && this.hasNonZeroValue(style.width, 'width')) {
      styles.width = style.width;
    }
    if (style.height && style.height !== 'auto' && this.hasNonZeroValue(style.height, 'height')) {
      styles.height = style.height;
    }
    
    // 最小/最大尺寸：只有设置了约束的才需要
    if (style.minWidth && style.minWidth !== '0px' && this.hasNonZeroValue(style.minWidth, 'minWidth')) {
      styles.minWidth = style.minWidth;
    }
    if (style.minHeight && style.minHeight !== '0px' && this.hasNonZeroValue(style.minHeight, 'minHeight')) {
      styles.minHeight = style.minHeight;
    }
    if (style.maxWidth && style.maxWidth !== 'none' && !style.maxWidth.includes('infinity')) {
      styles.maxWidth = style.maxWidth;
    }
    if (style.maxHeight && style.maxHeight !== 'none' && !style.maxHeight.includes('infinity')) {
      styles.maxHeight = style.maxHeight;
    }

    // 内边距：只有非零值才需要
    this.addSpacingStyles(styles, style, 'padding');

    // 外边距：只有非零值才需要
    this.addSpacingStyles(styles, style, 'margin');

    // 定位：只有在定位元素中设置了具体值的才需要
    if (style.position && style.position !== 'static') {
      ['top', 'right', 'bottom', 'left'].forEach(prop => {
        if (style[prop] && style[prop] !== 'auto' && this.hasNonZeroValue(style[prop], prop)) {
          styles[prop] = style[prop];
        }
      });
    }
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
      return numericValue !== 0;
    }
    
    // 处理无单位数字
    if (!isNaN(parseFloat(value)) && isFinite(value)) {
      return parseFloat(value) !== 0;
    }
    
    // 处理特殊的"无效果"值
    if (value === '0' || value === '0px' || value === '0%' || value === '0em') {
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
      'textDecoration': ['none'],
      'textTransform': ['none'],
      'textShadow': ['none'],
      'fontSize': ['16px', '1em', '100%'],
      'color': ['rgb(0, 0, 0)', 'black', '#000', '#000000'],
      
      // 背景样式
      'backgroundColor': ['rgba(0, 0, 0, 0)', 'transparent'],
      'backgroundImage': ['none'],
      'backgroundSize': ['auto auto'],
      'backgroundPosition': ['0% 0%'],
      'backgroundRepeat': ['repeat'],
      
      // 边框样式（分解属性）
      'borderTopWidth': ['0px', '0'],
      'borderRightWidth': ['0px', '0'],
      'borderBottomWidth': ['0px', '0'],
      'borderLeftWidth': ['0px', '0'],
      'borderTopStyle': ['none'],
      'borderRightStyle': ['none'],
      'borderBottomStyle': ['none'],
      'borderLeftStyle': ['none'],
      'borderTopColor': ['rgb(0, 0, 0)', 'currentColor', 'transparent'],
      'borderRightColor': ['rgb(0, 0, 0)', 'currentColor', 'transparent'],
      'borderBottomColor': ['rgb(0, 0, 0)', 'currentColor', 'transparent'],
      'borderLeftColor': ['rgb(0, 0, 0)', 'currentColor', 'transparent'],
      'borderTopLeftRadius': ['0px', '0'],
      'borderTopRightRadius': ['0px', '0'],
      'borderBottomRightRadius': ['0px', '0'],
      'borderBottomLeftRadius': ['0px', '0'],
      
      // 间距样式（分解属性）
      'marginTop': ['0px', '0'],
      'marginRight': ['0px', '0'],
      'marginBottom': ['0px', '0'],
      'marginLeft': ['0px', '0'],
      'paddingTop': ['0px', '0'],
      'paddingRight': ['0px', '0'],
      'paddingBottom': ['0px', '0'],
      'paddingLeft': ['0px', '0'],
      
      // 布局样式（display 除外，因为对Canvas布局很重要）
      'transform': ['none', 'matrix(1, 0, 0, 1, 0, 0)'],
      'filter': ['none'],
      'boxShadow': ['none'],
      'float': ['none'],
      'clear': ['none'],
      'position': ['static'],
      'visibility': ['visible'],
      'whiteSpace': ['normal'],
      'wordBreak': ['normal'],
      'overflowWrap': ['normal'],
      'overflow': ['visible'],
      'overflowX': ['visible'],
      'overflowY': ['visible']
    };
    
    if (defaultValues[property] && defaultValues[property].includes(value)) {
      return false;
    }
    
    // 处理边框相关的无效果值（现在都是具体属性）
    if (property && property.includes('border')) {
      // 边框宽度为 0 的无效
      if (property.includes('Width') && (value === '0px' || value === '0' || value === '0em' || value === '0rem')) {
        return false;
      }
      // 边框样式为 none 的无效
      if (property.includes('Style') && value === 'none') {
        return false;
      }
      // 边框圆角为 0 的无效
      if (property.includes('Radius') && (value === '0px' || value === '0' || value === '0em' || value === '0rem')) {
        return false;
      }
      // 边框颜色：如果是默认值或透明则无效
      if (property.includes('Color') && 
          (value === 'currentColor' || value === 'transparent' || value === 'rgba(0, 0, 0, 0)')) {
        return false;
      }
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
    
    // 文本装饰：正确解析简写属性值
    if (property === 'textDecoration') {
      // 处理 CSS text-decoration 简写属性，格式：<line> <style> <color>
      // 如果 line 部分是 'none'，则整个装饰无效
      if (!value || value === 'none') {
        return false;
      }
      
      // 检查简写属性中的 text-decoration-line 部分
      const linePart = value.split(/\s+/)[0];
      return linePart !== 'none';
    }
    
    // 文本转换：none 值不需要记录
    if (property === 'textTransform') {
      return value !== 'none';
    }
    
    // 文本阴影：none 值不需要记录
    if (property === 'textShadow') {
      return value !== 'none' && !value.includes('0px 0px 0px') && 
             !value.includes('rgba(0, 0, 0, 0)');
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
    
    // 文本装饰：正确解析简写属性，只有设置了装饰的才需要
    if (style.textDecoration) {
      // 处理 CSS text-decoration 简写属性，格式：<line> <style> <color>
      if (style.textDecoration !== 'none') {
        // 检查简写属性中的 text-decoration-line 部分
        const linePart = style.textDecoration.split(/\s+/)[0];
        if (linePart !== 'none') {
          styles.textDecoration = style.textDecoration;
        }
      }
    }
    
    // 文本转换：只有设置了转换的才需要
    if (style.textTransform && style.textTransform !== 'none') {
      styles.textTransform = style.textTransform;
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
   * 添加颜色和背景相关样式（只保留对渲染有影响的，展开简写属性）
   */
  addColorStyles(styles, style) {
    // 文本颜色：只有非默认黑色才需要记录
    if (style.color && style.color !== 'rgb(0, 0, 0)' && style.color !== 'black') {
      styles.color = style.color;
    }
    
    // 先处理 background 简写属性，展开到具体属性
    if (style.background && style.background !== 'none' && style.background !== 'transparent') {
      const backgroundValues = this.parseBackgroundShorthand(style.background);
      if (backgroundValues) {
        // 设置解析出的背景属性
        if (backgroundValues.backgroundColor) styles.backgroundColor = backgroundValues.backgroundColor;
        if (backgroundValues.backgroundImage) styles.backgroundImage = backgroundValues.backgroundImage;
        if (backgroundValues.backgroundPosition) styles.backgroundPosition = backgroundValues.backgroundPosition;
        if (backgroundValues.backgroundSize) styles.backgroundSize = backgroundValues.backgroundSize;
        if (backgroundValues.backgroundRepeat) styles.backgroundRepeat = backgroundValues.backgroundRepeat;
      }
    }
    
    // 背景色：只有非透明的才需要（会覆盖简写值）
    if (style.backgroundColor && 
        style.backgroundColor !== 'rgba(0, 0, 0, 0)' && 
        style.backgroundColor !== 'transparent') {
      styles.backgroundColor = style.backgroundColor;
    }
    
    // 背景图：只有设置了图片的才需要
    if (style.backgroundImage && style.backgroundImage !== 'none') {
      styles.backgroundImage = style.backgroundImage;
      
      // 如果有背景图，相关属性才有意义
      if (style.backgroundSize && style.backgroundSize !== 'auto auto') {
        styles.backgroundSize = style.backgroundSize;
      }
      if (style.backgroundPosition && style.backgroundPosition !== '0% 0%') {
        styles.backgroundPosition = style.backgroundPosition;
      }
      if (style.backgroundRepeat && style.backgroundRepeat !== 'repeat') {
        styles.backgroundRepeat = style.backgroundRepeat;
      }
    }
  }

  /**
   * 解析背景简写属性
   * @param {string} backgroundValue - 背景简写值，如 "red url(bg.jpg) no-repeat center"
   * @returns {Object|null} 解析后的背景属性
   */
  parseBackgroundShorthand(backgroundValue) {
    if (!backgroundValue || backgroundValue === 'none' || backgroundValue === 'transparent') {
      return null;
    }
    
    const result = {};
    
    // 简化的背景解析逻辑
    // 查找 url() 函数（背景图片）
    const urlMatch = backgroundValue.match(/url\([^)]+\)/);
    if (urlMatch) {
      result.backgroundImage = urlMatch[0];
    }
    
    // 查找颜色值（rgb, rgba, hex, 命名颜色等）
    const colorMatch = backgroundValue.match(/(rgba?\([^)]+\)|#[0-9a-fA-F]{3,6}|(?:red|blue|green|yellow|white|black|gray|grey|orange|purple|pink|brown|cyan|magenta|lime|navy|olive|maroon|teal|silver|aqua|fuchsia)\b)/i);
    if (colorMatch && !urlMatch) {
      // 只有在没有背景图的情况下才设置背景色
      result.backgroundColor = colorMatch[0];
    }
    
    // 查找重复方式
    const repeatMatch = backgroundValue.match(/\b(repeat|no-repeat|repeat-x|repeat-y)\b/);
    if (repeatMatch) {
      result.backgroundRepeat = repeatMatch[0];
    }
    
    // 查找位置信息
    const positionMatch = backgroundValue.match(/\b(left|right|center|top|bottom|\d+%|\d+px)\b/g);
    if (positionMatch && positionMatch.length >= 2) {
      result.backgroundPosition = positionMatch.slice(0, 2).join(' ');
    } else if (positionMatch && positionMatch.length === 1) {
      result.backgroundPosition = positionMatch[0];
    }
    
    return Object.keys(result).length > 0 ? result : null;
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
   * 添加边框相关样式（展开为具体方向属性）
   */
  addBorderStyles(styles, style) {
    const borderProperties = ['Top', 'Right', 'Bottom', 'Left'];
    
    // 先处理简写的 border 属性，展开到各个方向
    if (style.border && style.border !== 'none' && style.border !== '0' && style.border !== '0px' && this.hasNonZeroValue(style.border, 'border')) {
      const borderValue = this.parseBorderShorthand(style.border);
      if (borderValue && this.hasNonZeroValue(borderValue.width, 'borderWidth') && borderValue.style !== 'none') {
        // 将简写边框应用到所有方向（只有当边框有效时）
        borderProperties.forEach(side => {
          styles[`border${side}Width`] = borderValue.width;
          styles[`border${side}Style`] = borderValue.style;
          // 只有当颜色是有效颜色时才设置
          if (borderValue.color && this.isValidColor(borderValue.color) && borderValue.color !== 'currentColor') {
            styles[`border${side}Color`] = borderValue.color;
          }
        });
      }
    }
    
    // 处理各个方向的具体边框（会覆盖简写值）
    borderProperties.forEach(side => {
      const width = style[`border${side}Width`];
      const style_prop = style[`border${side}Style`];
      const color = style[`border${side}Color`];
      
      // 只有宽度大于0且样式不为none才算有边框
      if (this.hasNonZeroValue(width, `border${side}Width`) && style_prop && style_prop !== 'none') {
        styles[`border${side}Width`] = width;
        styles[`border${side}Style`] = style_prop;
        // 只有当颜色是有效颜色时才设置
        if (color && this.isValidColor(color) && color !== 'currentColor') {
          styles[`border${side}Color`] = color;
        }
      }
    });

    // 边框圆角：展开为具体角度属性
    this.addBorderRadiusStyles(styles, style);
  }

  /**
   * 解析边框简写属性
   * @param {string} borderValue - 边框简写值，如 "1px solid red"
   * @returns {Object|null} 解析后的边框属性
   */
  parseBorderShorthand(borderValue) {
    if (!borderValue || borderValue === 'none' || borderValue === '0' || borderValue === '0px') {
      return null;
    }
    
    // 解析常见的边框格式：width style color
    const parts = borderValue.trim().split(/\s+/);
    
    let width = '0px';
    let style = 'none';  
    let color = 'currentColor';
    let foundWidth = false;
    let foundStyle = false;
    
    // 改进的解析逻辑
    for (const part of parts) {
      // 检查是否为宽度值（包含数字和单位）
      if (!foundWidth && part.match(/^\d+(\.\d+)?(px|em|rem|%|pt)$/)) {
        width = part;
        foundWidth = true;
      }
      // 检查是否为样式值
      else if (!foundStyle && ['hidden', 'dotted', 'dashed', 'solid', 'double', 'groove', 'ridge', 'inset', 'outset'].includes(part)) {
        style = part;
        foundStyle = true;
      }
      // 如果不是宽度也不是样式，且看起来像颜色，当作颜色处理
      else if (!part.match(/^\d+(\.\d+)?(px|em|rem|%|pt)$/) && 
               !['hidden', 'dotted', 'dashed', 'solid', 'double', 'groove', 'ridge', 'inset', 'outset'].includes(part) &&
               this.isValidColor(part)) {
        color = part;
      }
    }
    
    // 如果边框宽度为 0，返回 null（不设置边框）
    if (!foundWidth || width === '0' || width === '0px') {
      return null;
    }
    
    // 如果没有明确的样式，默认为 solid
    if (!foundStyle || style === 'none') {
      style = 'solid';
    }
    
    return { width, style, color };
  }

  /**
   * 添加边框圆角样式（展开为具体角度属性）
   * @param {Object} styles - 样式对象
   * @param {CSSStyleDeclaration} style - 计算样式
   */
  addBorderRadiusStyles(styles, style) {
    // 处理简写的 borderRadius
    if (style.borderRadius && this.hasNonZeroValue(style.borderRadius, 'borderRadius')) {
      const radiusValue = style.borderRadius;
      
      // 如果是单一值，应用到所有角
      if (!radiusValue.includes(' ')) {
        styles.borderTopLeftRadius = radiusValue;
        styles.borderTopRightRadius = radiusValue;
        styles.borderBottomRightRadius = radiusValue;
        styles.borderBottomLeftRadius = radiusValue;
      } else {
        // 解析多值的圆角设置
        const values = radiusValue.trim().split(/\s+/);
        if (values.length === 2) {
          // 两个值：top-left/bottom-right, top-right/bottom-left
          styles.borderTopLeftRadius = values[0];
          styles.borderTopRightRadius = values[1];
          styles.borderBottomRightRadius = values[0];
          styles.borderBottomLeftRadius = values[1];
        } else if (values.length === 4) {
          // 四个值：top-left, top-right, bottom-right, bottom-left
          styles.borderTopLeftRadius = values[0];
          styles.borderTopRightRadius = values[1];
          styles.borderBottomRightRadius = values[2];
          styles.borderBottomLeftRadius = values[3];
        }
      }
    }
    
    // 处理各个具体角度的圆角（会覆盖简写值）
    const corners = ['TopLeft', 'TopRight', 'BottomRight', 'BottomLeft'];
    corners.forEach(corner => {
      const radiusProperty = `border${corner}Radius`;
      if (style[radiusProperty] && this.hasNonZeroValue(style[radiusProperty], radiusProperty)) {
        styles[radiusProperty] = style[radiusProperty];
      }
    });
  }

  /**
   * 添加变换和效果相关样式（只保留有实际效果的）
   */
  addTransformStyles(styles, style) {
    // 变换：只有设置了实际变换的才需要
    if (style.transform && style.transform !== 'none' && style.transform !== 'matrix(1, 0, 0, 1, 0, 0)') {
      styles.transform = style.transform;
      
      // 如果有变换，变换原点才有意义
      if (style.transformOrigin && style.transformOrigin !== '50% 50% 0px') {
        styles.transformOrigin = style.transformOrigin;
      }
    }
    
    // 透明度：只有非完全不透明的才需要
    if (style.opacity && parseFloat(style.opacity) !== 1) {
      styles.opacity = style.opacity;
    }
    
    // 滤镜：只有设置了滤镜的才需要
    if (style.filter && style.filter !== 'none') {
      styles.filter = style.filter;
    }
  }

  /**
   * 添加其他样式（只保留对Canvas渲染有影响的）
   */
  addMiscStyles(styles, style) {
    // 溢出处理：只有设置了裁剪的才需要（影响Canvas渲染）
    if (style.overflow && style.overflow !== 'visible' && 
        (style.overflow === 'hidden' || style.overflow === 'scroll' || style.overflow === 'auto')) {
      styles.overflow = style.overflow;
    }
    if (style.overflowX && style.overflowX !== 'visible' && 
        (style.overflowX === 'hidden' || style.overflowX === 'scroll' || style.overflowX === 'auto')) {
      styles.overflowX = style.overflowX;
    }
    if (style.overflowY && style.overflowY !== 'visible' && 
        (style.overflowY === 'hidden' || style.overflowY === 'scroll' || style.overflowY === 'auto')) {
      styles.overflowY = style.overflowY;
    }

    // 盒子尺寸模型：只有非默认的才需要（影响尺寸计算）
    if (style.boxSizing && style.boxSizing !== 'content-box') {
      styles.boxSizing = style.boxSizing;
    }

    // 阴影：只有设置了阴影的才需要（影响视觉效果）
    if (style.boxShadow && style.boxShadow !== 'none' && 
        !style.boxShadow.includes('0px 0px 0px') && 
        !style.boxShadow.includes('rgba(0, 0, 0, 0)')) {
      styles.boxShadow = style.boxShadow;
    }
    
    if (style.textShadow && style.textShadow !== 'none' && 
        !style.textShadow.includes('0px 0px 0px') && 
        !style.textShadow.includes('rgba(0, 0, 0, 0)')) {
      styles.textShadow = style.textShadow;
    }

    // 文本行为：这些会影响文本渲染，需要保留（只有非默认值）
    if (style.overflowWrap && style.overflowWrap !== 'normal') {
      styles.overflowWrap = style.overflowWrap;
    }
    if (style.wordBreak && style.wordBreak !== 'normal') {
      styles.wordBreak = style.wordBreak;
    }
    if (style.whiteSpace && style.whiteSpace !== 'normal') {
      styles.whiteSpace = style.whiteSpace;
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
      
      // display 属性对 Canvas 布局至关重要，永远保留
      if (property === 'display') {
        optimized[property] = normalizedValue;
        continue;
      }
      
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
    
    // 提取父元素的文本相关样式
    const parentTextStyles = this.extractTextStyles(parentStyle, 'span');
    
    // 合并样式：元素样式覆盖父元素样式
    const mergedStyles = mergeStyles(parentTextStyles, elementTextStyles);
    
    // 遍历子节点
    for (let child = element.firstChild; child; child = child.nextSibling) {
      if (child.nodeType === Node.TEXT_NODE) {
        const text = child.textContent.trim();
        if (text) {
          textNodes.push({
            type: 'text',
            text: text,
            style: mergedStyles
          });
        }
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        // 如果是嵌套的纯文本样式标签，递归处理
        if (this.isPureTextStyleTag(child)) {
          const nestedTextNodes = this.processTextStyleTag(child, elementStyle);
          if (nestedTextNodes && nestedTextNodes.length > 0) {
            textNodes.push(...nestedTextNodes);
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
   * 直接从计算样式中提取文本样式，不经过优化过程
   * @param {CSSStyleDeclaration} computedStyle 
   * @param {string} tagName 
   * @returns {Object} 文本样式对象
   */
  extractRawTextStyles(computedStyle, tagName) {
    const rawStyles = {};
    
    // 直接提取关键的文本样式，确保不会被优化掉
    const textStyleProperties = [
      'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'fontVariant',
      'lineHeight', 'letterSpacing', 'wordSpacing',
      'textAlign', 'textDecoration', 'textTransform', 'textIndent', 'textShadow',
      'color'
    ];
    
    textStyleProperties.forEach(property => {
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

    const textStyles = this.extractTextStyles(computedStyle, tagName);
    
    // 添加上标/下标特有样式
    if (tagName === 'sup') {
      textStyles.verticalAlign = 'super';
      textStyles.fontSize = '0.75em';
    } else if (tagName === 'sub') {
      textStyles.verticalAlign = 'sub';
      textStyles.fontSize = '0.75em';
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

    const textStyles = this.extractTextStyles(computedStyle, tagName);
    
    // 添加删除/插入特有样式
    if (tagName === 'del') {
      textStyles.textDecoration = 'line-through';
    } else if (tagName === 'ins') {
      textStyles.textDecoration = 'underline';
      textStyles.backgroundColor = 'rgba(255, 255, 0, 0.3)'; // 浅黄色背景
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

    const textStyles = this.extractTextStyles(computedStyle, 'mark');
    textStyles.backgroundColor = 'rgba(255, 255, 0, 0.5)'; // 高亮背景

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

    const textStyles = this.extractTextStyles(computedStyle, 'small');

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
      style: this.extractTextStyles(parentStyle, parentTag)
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
      style: this.extractTextStyles(pseudoStyle, element.tagName.toLowerCase())
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
      
      // 确保 SVG 命名空间存在
      if (!clonedSvg.getAttribute('xmlns')) {
        clonedSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      }

      // 序列化 SVG
      const serializer = new XMLSerializer();
      let svgString = serializer.serializeToString(clonedSvg);
      
      // 清理 SVG 字符串以提高兼容性
      svgString = this.cleanSVGString(svgString);
      
      // 生成兼容的 SVG data URL
      const svgDataUrl = this.createSVGDataURL(svgString);
      
      // 验证 data URL 是否有效
      if (!svgDataUrl) {
        console.warn('Failed to create valid SVG data URL');
        return null;
      }

      return {
        type: 'image',
        src: svgDataUrl,
        alt: 'SVG Image',
        bounds: {
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height
        }
      };
    } catch (error) {
      console.warn('Failed to process SVG element:', error);
      return null;
    }
  }
  
  /**
   * 创建兼容的 SVG data URL
   * @param {string} svgString - SVG 字符串
   * @returns {string} data URL
   */
  createSVGDataURL(svgString) {
    try {
      // 方法1：使用 charset 声明的 URL 编码（推荐，兼容性好）
      return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgString)}`;
    } catch (error1) {
      try {
        // 方法2：Base64 编码（备用方案，更安全但文件更大）
        const svgBase64 = btoa(unescape(encodeURIComponent(svgString)));
        return `data:image/svg+xml;base64,${svgBase64}`;
      } catch (error2) {
        try {
          // 方法3：简单的 URL 编码，不使用 charset（最后的备用）
          return `data:image/svg+xml,${encodeURIComponent(svgString)}`;
        } catch (error3) {
          console.warn('All SVG data URL encoding methods failed:', error1, error2, error3);
          return null;
        }
      }
    }
  }
}

// 导出解析函数
export const parseHTML = (element, options) => {
  const parser = new HTMLParser(options);
  return parser.parse(element);
};

export default HTMLParser; 