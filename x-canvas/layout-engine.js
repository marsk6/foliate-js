/**
 * HTML到数据结构转换器
 * 将HTML内容转换为渲染器可用的数据结构
 * 专门处理EPUB格式的HTML
 */

/**
 * @typedef {Object} TextNode
 * @property {string} tag - 'text'
 * @property {string} text - 文本内容
 */

/**
 * @typedef {Object} ImageNode
 * @property {string} tag - 'img'
 * @property {Object} style - 样式对象
 * @property {string} src - 图片源地址
 * @property {string} alt - 图片描述文字
 * @property {number} [width] - 图片宽度（可选，从样式或属性中解析）
 * @property {number} [height] - 图片高度（可选，从样式或属性中解析）
 * @property {Array} children - 子节点（图片通常为空数组）
 */

/**
 * @typedef {Object} ElementNode
 * @property {string} tag - 标签名
 * @property {Object} style - 样式对象（不包含默认样式）
 * @property {string} [src] - 图片源（仅img标签）
 * @property {string} [alt] - 图片描述（仅img标签）
 * @property {number} [width] - 元素宽度（可选）
 * @property {number} [height] - 元素高度（可选）
 * @property {(ElementNode|TextNode|ImageNode)[]} children - 子节点
 */

/**
 * @typedef {Object} ImageElement
 * @property {string} type - 'image'
 * @property {number} x - X坐标
 * @property {number} y - Y坐标
 * @property {number} width - 图片宽度
 * @property {number} height - 图片高度
 * @property {string} src - 图片源地址
 * @property {string} alt - 图片描述文字
 * @property {HTMLImageElement} [imageElement] - 加载的图片DOM元素
 * @property {boolean} [loaded] - 图片是否已加载完成
 * @property {boolean} [loading] - 图片是否正在加载
 * @property {string} [error] - 加载错误信息
 */

/**
 * @typedef {Object} ParseResult
 * @property {ElementNode[]} nodes - 解析后的节点树
 * @property {Object} pageStyle - 页面级样式（从head中提取）
 */

export class TransferEngine {
  constructor() {
    // 默认样式映射
    this.defaultStyles = {
      h1: {
        fontSize: '2em',
        fontWeight: 'bold',
        display: 'block',
        marginTop: '0.67em',
        marginBottom: '0.67em',
      },
      h2: {
        fontSize: '1.5em',
        fontWeight: 'bold',
        display: 'block',
        marginTop: '0.75em',
        marginBottom: '0.75em',
      },
      h3: {
        fontSize: '1.17em',
        fontWeight: 'bold',
        display: 'block',
        marginTop: '1em',
        marginBottom: '1em',
      },
      h4: {
        fontSize: '1em',
        fontWeight: 'bold',
        display: 'block',
        marginTop: '1.12em',
        marginBottom: '1.12em',
      },
      h5: {
        fontSize: '0.83em',
        fontWeight: 'bold',
        display: 'block',
        marginTop: '1.5em',
        marginBottom: '1.5em',
      },
      h6: {
        fontSize: '0.67em',
        fontWeight: 'bold',
        display: 'block',
        marginTop: '1.67em',
        marginBottom: '1.67em',
      },
      p: { display: 'block', marginTop: '1em', marginBottom: '1em' },
      div: { display: 'block' },
      strong: { fontWeight: 'bold' },
      b: { fontWeight: 'bold' },
      em: { fontStyle: 'italic' },
      i: { fontStyle: 'italic' },
      img: { display: 'inline-block' },
    };

    // 动态解析的EPUB CSS类样式映射，每个EPUB都不同
    this.epubClassStyles = {};
  }

  /**
   * 解析HTML并生成数据结构
   * @param {string} htmlContent - EPUB HTML内容
   * @returns {Promise<ParseResult>}
   */
  async parse(htmlContent) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlContent, 'text/html');

    // 重置类样式映射
    this.epubClassStyles = {};

    // 提取head中的样式
    const pageStyle = await this.extractHeadStyles(doc);

    // 转换body节点
    const bodyNode = this.convertNode(doc.body);

    return {
      nodes: bodyNode.children || [],
      pageStyle: pageStyle,
    };
  }

  /**
   * 提取head中的样式信息
   * @param {Document} doc
   * @returns {Promise<Object>}
   */
  async extractHeadStyles(doc) {
    const pageStyle = {};

    // 提取style标签中的CSS
    const styleElements = doc.head.querySelectorAll('style');
    styleElements.forEach((styleEl) => {
      const cssText = styleEl.textContent;

      // 解析@page规则
      const pageMatch = cssText.match(/@page\s*\{([^}]+)\}/);
      if (pageMatch) {
        const pageRules = pageMatch[1];
        const rules = this.parseCSSRules(pageRules);
        Object.assign(pageStyle, rules);
      }

      // 解析body选择器
      const bodyMatch = cssText.match(/body\s*\{([^}]+)\}/);
      if (bodyMatch) {
        const bodyRules = bodyMatch[1];
        const rules = this.parseCSSRules(bodyRules);
        Object.assign(pageStyle, rules);
      }

      // 解析其他CSS类
      this.parseClassStyles(cssText, false);
    });

    // 获取外部样式表内容并解析
    const linkElements = doc.head.querySelectorAll('link[rel="stylesheet"]');
    for (const linkEl of linkElements) {
      const href = linkEl.getAttribute('href');
      if (href) {
        try {
          // 通过fetch获取blob URL的CSS内容
          const response = await fetch(href);
          if (response.ok) {
            const cssText = await response.text();
            // 解析外部样式表中的CSS类（忽略font-size）
            this.parseClassStyles(cssText, true);
          }
        } catch (error) {
          console.warn('Failed to fetch stylesheet:', href, error);
        }
      }
    }

    return pageStyle;
  }

  /**
   * 解析CSS规则字符串
   * @param {string} rulesText
   * @returns {Object}
   */
  parseCSSRules(rulesText) {
    const rules = {};
    const declarations = rulesText.split(';');

    declarations.forEach((declaration) => {
      const [property, value] = declaration.split(':').map((s) => s.trim());
      if (property && value) {
        rules[this.camelCase(property)] = value;
      }
    });

    return rules;
  }

  /**
   * 解析CSS中的类样式
   * @param {string} cssText
   * @param {boolean} ignoreFont - 是否忽略字体相关样式（从link获取时为true）
   */
  parseClassStyles(cssText, ignoreFont = false) {
    // 匹配.className { ... }模式
    const classMatches = cssText.matchAll(/\.([a-zA-Z][\w-]*)\s*\{([^}]+)\}/g);

    for (const match of classMatches) {
      const className = match[1];
      const rules = this.parseCSSRules(match[2]);

      // 如果需要忽略字体样式，则过滤掉font-size
      if (ignoreFont) {
        delete rules.fontSize;
        delete rules['font-size'];
      }

      // 更新类样式映射
      this.epubClassStyles[className] = {
        ...this.epubClassStyles[className],
        ...rules,
      };
    }
  }

  /**
   * 转换DOM节点为数据结构
   * @param {Node} node
   * @returns {ElementNode|TextNode|null}
   */
  convertNode(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent.trim();
      if (!text) return null;

      return {
        tag: 'text',
        text: text,
      };
    }

    if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node;
      const tagName = element.tagName.toLowerCase();

      // 获取元素自身的样式（不包含默认样式）
      const elementStyle = this.getElementStyle(element);

      // 创建节点
      const nodeData = {
        tag: tagName,
        style: elementStyle,
        children: [],
      };

      // 处理特殊标签
      if (tagName === 'img') {
        this.handleImgElement(nodeData, element, elementStyle);
      } else if (tagName === 'svg') {
        // 处理SVG元素，检查是否包含image子节点
        this.handleSvgElement(nodeData, element, elementStyle);
        return nodeData;
      }

      // 递归处理子节点
      for (const child of node.childNodes) {
        const childNode = this.convertNode(child);
        if (childNode) {
          nodeData.children.push(childNode);
        }
      }

      return nodeData;
    }

    return null;
  }

  /**
   * 处理img元素的特殊属性
   * @param {ElementNode} nodeData
   * @param {Element} element
   * @param {Object} elementStyle
   */
  handleImgElement(nodeData, element, elementStyle) {
    nodeData.src = element.getAttribute('src') || '';
    nodeData.alt = element.getAttribute('alt') || '';

    // 解析图片尺寸
    const widthAttr = element.getAttribute('width');
    const heightAttr = element.getAttribute('height');

    if (widthAttr) {
      nodeData.width = parseFloat(widthAttr) || null;
    }
    if (heightAttr) {
      nodeData.height = parseFloat(heightAttr) || null;
    }

    // 从样式中获取尺寸（优先级更高）
    if (elementStyle.width) {
      nodeData.width = parseFloat(elementStyle.width) || null;
    }
    if (elementStyle.height) {
      nodeData.height = parseFloat(elementStyle.height) || null;
    }
  }

  /**
   * 处理SVG元素，将其中的image转换为img节点
   * @param {ElementNode} nodeData
   * @param {Element} svgElement
   * @param {Object} elementStyle
   */
  handleSvgElement(nodeData, svgElement, elementStyle) {
    // 获取SVG的viewBox和尺寸信息，用于计算image的相对尺寸
    const svgWidth = this.parseDimension(svgElement.getAttribute('width'));
    const svgHeight = this.parseDimension(svgElement.getAttribute('height'));
    const viewBox = svgElement.getAttribute('viewBox');
    let viewBoxWidth = null, viewBoxHeight = null;
    
    if (viewBox) {
      const parts = viewBox.split(/\s+|,/);
      if (parts.length >= 4) {
        viewBoxWidth = parseFloat(parts[2]) || null;
        viewBoxHeight = parseFloat(parts[3]) || null;
      }
    }

    // 查找SVG中的image元素
    const imageElements = svgElement.querySelectorAll('image');
    
    for (const imageEl of imageElements) {
      // 将SVG image转换为img节点
      const imgNode = {
        tag: 'img',
        style: {},
        children: [],
      };

      // 获取图片源，SVG使用xlink:href或href属性
      const xlinkHref = imageEl.getAttributeNS('http://www.w3.org/1999/xlink', 'href');
      const href = imageEl.getAttribute('href');
      imgNode.src = xlinkHref || href || '';
      imgNode.alt = imageEl.getAttribute('alt') || '';

      // 处理尺寸属性
      const imageWidth = imageEl.getAttribute('width');
      const imageHeight = imageEl.getAttribute('height');
      
      // 解析image的width和height
      if (imageWidth) {
        imgNode.width = this.parseDimension(imageWidth);
      } else if (svgWidth) {
        // 如果image没有width，尝试使用SVG的width
        imgNode.width = svgWidth;
      } else if (viewBoxWidth) {
        // 如果SVG也没有width，使用viewBox的width
        imgNode.width = viewBoxWidth;
      }
      
      if (imageHeight) {
        imgNode.height = this.parseDimension(imageHeight);
      } else if (svgHeight) {
        // 如果image没有height，尝试使用SVG的height
        imgNode.height = svgHeight;
      } else if (viewBoxHeight) {
        // 如果SVG也没有height，使用viewBox的height
        imgNode.height = viewBoxHeight;
      }

      // 处理x和y坐标（如果需要的话）
      const x = imageEl.getAttribute('x');
      const y = imageEl.getAttribute('y');
      if (x) {
        imgNode.style.left = this.parseDimension(x) + 'px';
      }
      if (y) {
        imgNode.style.top = this.parseDimension(y) + 'px';
      }

      // 将转换后的img节点添加到SVG的子节点中
      nodeData.children.push(imgNode);
    }

    // 继续处理SVG的其他子节点（除了已经处理的image）
    for (const child of svgElement.childNodes) {
      if (child.nodeType === Node.ELEMENT_NODE && child.tagName.toLowerCase() !== 'image') {
        const childNode = this.convertNode(child);
        if (childNode) {
          nodeData.children.push(childNode);
        }
      } else if (child.nodeType === Node.TEXT_NODE) {
        const childNode = this.convertNode(child);
        if (childNode) {
          nodeData.children.push(childNode);
        }
      }
    }
  }

  /**
   * 解析CSS尺寸值，支持多种单位
   * @param {string} value - 尺寸值（如"100px", "50%", "2em", "100"）
   * @returns {number|null} - 解析后的数值，如果无法解析则返回null
   */
  parseDimension(value) {
    if (!value || typeof value !== 'string') {
      return null;
    }

    // 移除空格
    value = value.trim();
    
    // 纯数字
    if (/^\d*\.?\d+$/.test(value)) {
      return parseFloat(value) || null;
    }
    
    // 带单位的数值（px, em, rem, %, pt, etc.）
    const match = value.match(/^(\d*\.?\d+)(px|em|rem|%|pt|pc|in|cm|mm|ex|ch|vw|vh|vmin|vmax)$/);
    if (match) {
      const num = parseFloat(match[1]);
      const unit = match[2];
      
      // 对于绝对单位，直接返回数值（这里简化处理，都当作px）
      // 实际使用时可能需要根据上下文进行单位转换
      switch (unit) {
        case 'px':
        case 'pt':
        case 'pc':
        case 'in':
        case 'cm':
        case 'mm':
          return num;
        case '%':
          // 百分比需要根据父元素计算，这里先返回原数值
          // 实际渲染时需要特殊处理
          return num;
        case 'em':
        case 'rem':
        case 'ex':
        case 'ch':
          // 字体相关单位，这里简化为16px基准
          return num * 16;
        case 'vw':
        case 'vh':
        case 'vmin':
        case 'vmax':
          // 视口单位，需要根据视口大小计算
          return num;
        default:
          return num;
      }
    }
    
    return null;
  }

  /**
   * 获取元素样式（不包含默认样式）
   * @param {Element} element
   * @returns {Object}
   */
  getElementStyle(element) {
    const style = {};

    // 从style属性解析内联样式
    const styleAttr = element.getAttribute('style');
    if (styleAttr) {
      const declarations = styleAttr.split(';');
      declarations.forEach((declaration) => {
        const [property, value] = declaration.split(':').map((s) => s.trim());
        if (property && value) {
          style[this.camelCase(property)] = value;
        }
      });
    }

    // 从class属性获取样式
    const className = element.getAttribute('class');
    if (className) {
      const classes = className.split(/\s+/);
      classes.forEach((cls) => {
        const classStyle = this.epubClassStyles[cls];
        if (classStyle) {
          Object.assign(style, classStyle);
        }
      });
    }

    return style;
  }

  /**
   * 获取元素的默认样式
   * @param {string} tagName - 标签名
   * @returns {Object}
   */
  getDefaultStyle(tagName) {
    return this.defaultStyles[tagName] || {};
  }

  /**
   * 获取元素的完整样式（包含默认样式）
   * @param {string} tagName - 标签名
   * @param {Object} elementStyle - 元素自身样式
   * @param {Object} inheritedStyle - 继承样式
   * @returns {Object}
   */
  getComputedStyle(tagName, elementStyle = {}, inheritedStyle = {}) {
    const defaultStyle = this.getDefaultStyle(tagName);
    return {
      ...inheritedStyle,
      ...defaultStyle,
      ...elementStyle,
    };
  }

  /**
   * 将CSS属性名转换为camelCase
   * @param {string} str
   * @returns {string}
   */
  camelCase(str) {
    return str.replace(/-([a-z])/g, (match, letter) => letter.toUpperCase());
  }

  /**
   * 判断是否为块级元素
   * @param {string} tagName
   * @returns {boolean}
   */
  isBlockElement(tagName) {
    const blockElements = [
      'div',
      'p',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'ul',
      'ol',
      'li',
      'blockquote',
      'pre',
      'hr',
      'section',
      'article',
      'header',
      'footer',
      'nav',
      'main',
    ];
    return blockElements.includes(tagName);
  }

  /**
   * 判断是否为内联元素
   * @param {string} tagName
   * @returns {boolean}
   */
  isInlineElement(tagName) {
    const inlineElements = [
      'span',
      'a',
      'strong',
      'em',
      'b',
      'i',
      'u',
      's',
      'small',
      'mark',
      'del',
      'ins',
      'sub',
      'sup',
      'code',
    ];
    return inlineElements.includes(tagName);
  }

  /**
   * 获取动态解析的EPUB类样式
   * @param {string} className
   * @returns {Object}
   */
  getEpubClassStyle(className) {
    return this.epubClassStyles[className] || {};
  }
}

export default TransferEngine;
