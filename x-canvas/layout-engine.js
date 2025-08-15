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
 * @property {Object} style - 样式对象
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

    // EPUB特定的CSS类样式映射
    this.epubClassStyles = {
      calibre: {},
      calibre1: {},
      calibre2: { fontSize: '1.5em', fontWeight: 'bold', textAlign: 'center' },
      calibre3: { display: 'block' },
      calibre4: { fontSize: '1.17em', fontWeight: 'bold', textAlign: 'center' },
      calibre5: { fontStyle: 'italic' },
    };
  }

  /**
   * 解析HTML并生成数据结构
   * @param {string} htmlContent - EPUB HTML内容
   * @returns {ParseResult}
   */
  parse(htmlContent) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlContent, 'text/html');

    // 提取head中的样式
    const pageStyle = this.extractHeadStyles(doc);

    // 转换body节点
    const bodyNode = this.convertNode(doc.body, pageStyle);

    return {
      nodes: bodyNode.children || [],
      pageStyle: pageStyle,
    };
  }

  /**
   * 提取head中的样式信息
   * @param {Document} doc
   * @returns {Object}
   */
  extractHeadStyles(doc) {
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
      this.parseClassStyles(cssText);
    });

    // 提取link标签中的样式表引用
    const linkElements = doc.head.querySelectorAll('link[rel="stylesheet"]');
    linkElements.forEach((linkEl) => {
      const href = linkEl.getAttribute('href');
      // 这里可以根据需要加载外部样式表
      // 目前先记录引用
      pageStyle.stylesheets = pageStyle.stylesheets || [];
      pageStyle.stylesheets.push(href);
    });

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
   */
  parseClassStyles(cssText) {
    // 匹配.className { ... }模式
    const classMatches = cssText.matchAll(/\.([a-zA-Z][\w-]*)\s*\{([^}]+)\}/g);

    for (const match of classMatches) {
      const className = match[1];
      const rules = this.parseCSSRules(match[2]);

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
   * @param {Object} inheritedStyle
   * @returns {ElementNode|TextNode|null}
   */
  convertNode(node, inheritedStyle = {}) {
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

      // 获取样式
      const elementStyle = this.getElementStyle(element);
      const defaultStyle = this.defaultStyles[tagName] || {};
      const mergedStyle = {
        ...inheritedStyle,
        ...defaultStyle,
        ...elementStyle,
      };

      // 创建节点
      const nodeData = {
        tag: tagName,
        style: mergedStyle,
        children: [],
      };

      // 处理特殊属性
      if (tagName === 'img') {
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
        if (mergedStyle.width) {
          nodeData.width = parseFloat(mergedStyle.width) || null;
        }
        if (mergedStyle.height) {
          nodeData.height = parseFloat(mergedStyle.height) || null;
        }
      }

      // 递归处理子节点
      for (const child of node.childNodes) {
        const childNode = this.convertNode(child, mergedStyle);
        if (childNode) {
          nodeData.children.push(childNode);
        }
      }

      return nodeData;
    }

    return null;
  }

  /**
   * 获取元素样式
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
   * 获取EPUB特定的类样式
   * @param {string} className
   * @returns {Object}
   */
  getEpubClassStyle(className) {
    return this.epubClassStyles[className] || {};
  }
}

export default TransferEngine;
