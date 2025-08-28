export class HTMLParser {
  constructor() {
    this.pseudoElementCounter = 0;
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
      style: this.extractStyles(computedStyle),
      bounds: this.getBounds(element),
      children: []
    };

    // 处理伪元素 ::before
    const beforeElement = this.processPseudoElement(element, '::before');
    if (beforeElement) {
      elementData.children.push(beforeElement);
    }

    // 处理文本节点和子元素
    for (let child = element.firstChild; child; child = child.nextSibling) {
      if (child.nodeType === Node.TEXT_NODE) {
        const text = child.textContent.trim();
        if (text) {
          elementData.children.push({
            type: 'text',
            text: text
          });
        }
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        // 特殊处理 SVG 元素
        if (child.tagName.toLowerCase() === 'svg') {
          const svgElement = this.processSVGElement(child);
          if (svgElement) {
            elementData.children.push(svgElement);
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
   * 提取关键样式属性
   * @param {CSSStyleDeclaration} style 
   * @returns {Object}
   */
  extractStyles(style) {
    const styles = {};

    // 显示和布局
    if (style.display !== 'block') styles.display = style.display;
    if (style.position !== 'static') styles.position = style.position;
    if (style.float !== 'none') styles.float = style.float;

    // 盒子模型
    this.addBoxModelStyles(styles, style);

    // 字体相关
    this.addFontStyles(styles, style);

    // 颜色和背景
    this.addColorStyles(styles, style);

    // 边框
    this.addBorderStyles(styles, style);

    // Transform 和 transition
    if (style.transform !== 'none') styles.transform = style.transform;
    if (style.opacity !== '1') styles.opacity = style.opacity;

    // 溢出处理
    if (style.overflow !== 'visible') styles.overflow = style.overflow;
    if (style.overflowX !== 'visible') styles['overflow-x'] = style.overflowX;
    if (style.overflowY !== 'visible') styles['overflow-y'] = style.overflowY;

    return styles;
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
      
      if (width !== '0px' && style_prop !== 'none') {
        styles[`border-${side.toLowerCase()}`] = `${width} ${style_prop} ${color}`;
      }
    });

    // 边框圆角
    const borderRadius = style.borderRadius;
    if (borderRadius && borderRadius !== '0px') {
      styles['border-radius'] = borderRadius;
    }
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
   * 处理伪元素
   */
  processPseudoElement(element, pseudo) {
    const pseudoStyle = window.getComputedStyle(element, pseudo);
    const content = pseudoStyle.content;
    
    if (!content || content === 'none' || content === 'normal') {
      return null;
    }

    // 移除引号
    let textContent = content.replace(/^["'](.*)["']$/, '$1');
    
    // 处理特殊内容
    if (textContent === '') {
      textContent = '';  // 空内容但仍然要渲染样式
    }

    return {
      type: 'pseudo-element',
      pseudo: pseudo,
      style: this.extractStyles(pseudoStyle),
      content: textContent,
      bounds: {
        x: 0, y: 0, width: 0, height: 0  // 伪元素边界需要特殊计算
      }
    };
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
export const parseHTML = (element) => {
  const parser = new HTMLParser();
  return parser.parse(element);
};

export default HTMLParser; 