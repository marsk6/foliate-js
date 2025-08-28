/**
 * 默认样式表 - 定义常见 HTML 元素的基础样式
 * 参考浏览器默认样式和 CSS 规范
 */

export const DEFAULT_STYLES = {
  // 根元素和文档
  'html': {
    'display': 'block',
    'font-size': '16px',
    'font-family': 'serif',
    'line-height': '1.2',
    'margin': '0px',
    'padding': '0px'
  },

  'body': {
    'display': 'block',
    'font-size': '16px',
    'font-family': 'serif',
    'line-height': '1.2',
    'margin': '8px',
    'padding': '0px',
    'color': 'rgb(0, 0, 0)',
    'background-color': 'rgb(255, 255, 255)'
  },

  // 标题元素
  'h1': {
    'display': 'block',
    'font-size': '2em',
    'font-weight': 'bold',
    'margin': '0.67em 0px',
    'padding': '0px'
  },

  'h2': {
    'display': 'block',
    'font-size': '1.5em',
    'font-weight': 'bold',
    'margin': '0.83em 0px',
    'padding': '0px'
  },

  'h3': {
    'display': 'block',
    'font-size': '1.17em',
    'font-weight': 'bold',
    'margin': '1em 0px',
    'padding': '0px'
  },

  'h4': {
    'display': 'block',
    'font-size': '1em',
    'font-weight': 'bold',
    'margin': '1.33em 0px',
    'padding': '0px'
  },

  'h5': {
    'display': 'block',
    'font-size': '0.83em',
    'font-weight': 'bold',
    'margin': '1.67em 0px',
    'padding': '0px'
  },

  'h6': {
    'display': 'block',
    'font-size': '0.67em',
    'font-weight': 'bold',
    'margin': '2.33em 0px',
    'padding': '0px'
  },

  // 文本内容
  'p': {
    'display': 'block',
    'margin': '1em 0px',
    'padding': '0px'
  },

  'div': {
    'display': 'block',
    'margin': '0px',
    'padding': '0px'
  },

  'span': {
    'display': 'inline',
    'margin': '0px',
    'padding': '0px'
  },

  // 文本样式
  'b': {
    'display': 'inline',
    'font-weight': 'bold',
    'margin': '0px',
    'padding': '0px'
  },

  'strong': {
    'display': 'inline',
    'font-weight': 'bold',
    'margin': '0px',
    'padding': '0px'
  },

  'i': {
    'display': 'inline',
    'font-style': 'italic',
    'margin': '0px',
    'padding': '0px'
  },

  'em': {
    'display': 'inline',
    'font-style': 'italic',
    'margin': '0px',
    'padding': '0px'
  },

  'u': {
    'display': 'inline',
    'text-decoration': 'underline',
    'margin': '0px',
    'padding': '0px'
  },

  's': {
    'display': 'inline',
    'text-decoration': 'line-through',
    'margin': '0px',
    'padding': '0px'
  },

  'small': {
    'display': 'inline',
    'font-size': '0.83em',
    'margin': '0px',
    'padding': '0px'
  },

  'big': {
    'display': 'inline',
    'font-size': '1.17em',
    'margin': '0px',
    'padding': '0px'
  },

  // 链接
  'a': {
    'display': 'inline',
    'color': 'rgb(0, 0, 238)',
    'text-decoration': 'underline',
    'margin': '0px',
    'padding': '0px'
  },

  // 列表
  'ul': {
    'display': 'block',
    'margin': '1em 0px',
    'padding': '0px 0px 0px 40px',
    'list-style-type': 'disc'
  },

  'ol': {
    'display': 'block',
    'margin': '1em 0px',
    'padding': '0px 0px 0px 40px',
    'list-style-type': 'decimal'
  },

  'li': {
    'display': 'list-item',
    'margin': '0px',
    'padding': '0px'
  },

  'dl': {
    'display': 'block',
    'margin': '1em 0px',
    'padding': '0px'
  },

  'dt': {
    'display': 'block',
    'font-weight': 'bold',
    'margin': '0px',
    'padding': '0px'
  },

  'dd': {
    'display': 'block',
    'margin': '0px 0px 0px 40px',
    'padding': '0px'
  },

  // 表格
  'table': {
    'display': 'table',
    'border-collapse': 'separate',
    'border-spacing': '2px',
    'margin': '0px',
    'padding': '0px'
  },

  'thead': {
    'display': 'table-header-group',
    'margin': '0px',
    'padding': '0px'
  },

  'tbody': {
    'display': 'table-row-group',
    'margin': '0px',
    'padding': '0px'
  },

  'tfoot': {
    'display': 'table-footer-group',
    'margin': '0px',
    'padding': '0px'
  },

  'tr': {
    'display': 'table-row',
    'margin': '0px',
    'padding': '0px'
  },

  'td': {
    'display': 'table-cell',
    'padding': '1px',
    'margin': '0px'
  },

  'th': {
    'display': 'table-cell',
    'padding': '1px',
    'margin': '0px',
    'font-weight': 'bold',
    'text-align': 'center'
  },

  // 表单元素
  'form': {
    'display': 'block',
    'margin': '0px',
    'padding': '0px'
  },

  'fieldset': {
    'display': 'block',
    'margin': '0px 2px',
    'padding': '0.35em 0.75em 0.625em',
    'border': '2px groove rgb(192, 192, 192)'
  },

  'legend': {
    'display': 'block',
    'padding': '0px 2px',
    'margin': '0px'
  },

  'label': {
    'display': 'inline',
    'margin': '0px',
    'padding': '0px'
  },

  'input': {
    'display': 'inline-block',
    'margin': '0px',
    'padding': '1px 0px',
    'border': '2px inset rgb(238, 238, 238)',
    'font-size': '13.33px'
  },

  'textarea': {
    'display': 'inline-block',
    'margin': '0px',
    'padding': '2px',
    'border': '1px solid rgb(169, 169, 169)',
    'font-family': 'monospace'
  },

  'select': {
    'display': 'inline-block',
    'margin': '0px',
    'padding': '1px 0px',
    'border': '1px solid rgb(169, 169, 169)'
  },

  'button': {
    'display': 'inline-block',
    'margin': '0px',
    'padding': '1px 6px',
    'border': '2px outset rgb(238, 238, 238)',
    'background-color': 'rgb(238, 238, 238)'
  },

  // 多媒体
  'img': {
    'display': 'inline',
    'margin': '0px',
    'padding': '0px',
    'border': '0px'
  },

  'audio': {
    'display': 'inline',
    'margin': '0px',
    'padding': '0px'
  },

  'video': {
    'display': 'inline',
    'margin': '0px',
    'padding': '0px'
  },

  'canvas': {
    'display': 'inline',
    'margin': '0px',
    'padding': '0px'
  },

  'svg': {
    'display': 'inline',
    'margin': '0px',
    'padding': '0px'
  },

  // 引用和代码
  'blockquote': {
    'display': 'block',
    'margin': '1em 40px',
    'padding': '0px'
  },

  'q': {
    'display': 'inline',
    'margin': '0px',
    'padding': '0px'
  },

  'cite': {
    'display': 'inline',
    'font-style': 'italic',
    'margin': '0px',
    'padding': '0px'
  },

  'code': {
    'display': 'inline',
    'font-family': 'monospace',
    'margin': '0px',
    'padding': '0px'
  },

  'pre': {
    'display': 'block',
    'font-family': 'monospace',
    'white-space': 'pre',
    'margin': '1em 0px',
    'padding': '0px'
  },

  'kbd': {
    'display': 'inline',
    'font-family': 'monospace',
    'margin': '0px',
    'padding': '0px'
  },

  'samp': {
    'display': 'inline',
    'font-family': 'monospace',
    'margin': '0px',
    'padding': '0px'
  },

  'var': {
    'display': 'inline',
    'font-style': 'italic',
    'margin': '0px',
    'padding': '0px'
  },

  // 分割线和分组
  'hr': {
    'display': 'block',
    'margin': '0.5em auto',
    'padding': '0px',
    'border': '1px inset',
    'height': '2px'
  },

  'br': {
    'display': 'block',
    'margin': '0px',
    'padding': '0px'
  },

  // 语义化元素
  'article': {
    'display': 'block',
    'margin': '0px',
    'padding': '0px'
  },

  'section': {
    'display': 'block',
    'margin': '0px',
    'padding': '0px'
  },

  'nav': {
    'display': 'block',
    'margin': '0px',
    'padding': '0px'
  },

  'aside': {
    'display': 'block',
    'margin': '0px',
    'padding': '0px'
  },

  'header': {
    'display': 'block',
    'margin': '0px',
    'padding': '0px'
  },

  'footer': {
    'display': 'block',
    'margin': '0px',
    'padding': '0px'
  },

  'main': {
    'display': 'block',
    'margin': '0px',
    'padding': '0px'
  },

  'figure': {
    'display': 'block',
    'margin': '1em 40px',
    'padding': '0px'
  },

  'figcaption': {
    'display': 'block',
    'margin': '0px',
    'padding': '0px'
  },

  // 隐藏元素
  'head': {
    'display': 'none'
  },

  'meta': {
    'display': 'none'
  },

  'title': {
    'display': 'none'
  },

  'style': {
    'display': 'none'
  },

  'script': {
    'display': 'none'
  },

  'link': {
    'display': 'none'
  }
};

/**
 * 获取元素的默认样式
 * @param {string} tagName - HTML 标签名
 * @returns {Object} 默认样式对象
 */
export function getDefaultStyles(tagName) {
  return DEFAULT_STYLES[tagName.toLowerCase()] || {};
}

/**
 * 合并多个样式对象，后面的样式会覆盖前面的样式
 * @param {...Object} styleObjects - 要合并的样式对象
 * @returns {Object} 合并后的样式对象
 */
export function mergeStyles(...styleObjects) {
  const result = {};
  
  for (const styleObj of styleObjects) {
    if (styleObj && typeof styleObj === 'object') {
      Object.assign(result, styleObj);
    }
  }
  
  return result;
}

/**
 * 将 CSS 样式值标准化
 * @param {string} property - CSS 属性名
 * @param {string} value - CSS 属性值
 * @returns {string} 标准化后的值
 */
export function normalizeStyleValue(property, value) {
  if (!value || value === '') return value;
  
  // 处理数值属性，确保有单位
  const numericProperties = [
    'font-size', 'line-height', 'margin', 'padding', 'border-width',
    'width', 'height', 'top', 'right', 'bottom', 'left',
    'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
    'padding-top', 'padding-right', 'padding-bottom', 'padding-left'
  ];
  
  if (numericProperties.includes(property) && /^\d+(\.\d+)?$/.test(value)) {
    return value + 'px';
  }
  
  // 处理颜色值
  if (property.includes('color') && !value.startsWith('rgb') && !value.startsWith('#')) {
    // 基本颜色名称转换
    const colorMap = {
      'black': 'rgb(0, 0, 0)',
      'white': 'rgb(255, 255, 255)',
      'red': 'rgb(255, 0, 0)',
      'green': 'rgb(0, 128, 0)',
      'blue': 'rgb(0, 0, 255)',
      'yellow': 'rgb(255, 255, 0)',
      'cyan': 'rgb(0, 255, 255)',
      'magenta': 'rgb(255, 0, 255)',
      'silver': 'rgb(192, 192, 192)',
      'gray': 'rgb(128, 128, 128)',
      'grey': 'rgb(128, 128, 128)'
    };
    
    return colorMap[value.toLowerCase()] || value;
  }
  
  return value;
}

/**
 * 检查样式值是否为默认值
 * @param {string} property - CSS 属性名
 * @param {string} value - CSS 属性值
 * @returns {boolean} 是否为默认值
 */
export function isDefaultValue(property, value) {
  const defaultValues = {
    'margin': '0px',
    'padding': '0px',
    'border': 'none',
    'color': 'rgb(0, 0, 0)',
    'background-color': 'rgba(0, 0, 0, 0)',
    'font-size': '16px',
    'font-weight': '400',
    'font-style': 'normal',
    'text-decoration': 'none',
    'display': 'block',
    'position': 'static',
    'opacity': '1',
    'visibility': 'visible'
  };
  
  return defaultValues[property] === value;
}

export default DEFAULT_STYLES; 