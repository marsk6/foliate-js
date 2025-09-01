/**
 * 默认样式处理工具
 */

// HTML 标签的默认样式定义（使用 camelCase 格式）
const defaultTagStyles = {
  // 块级元素
  'div': { display: 'block' },
  'p': { display: 'block', marginTop: '1em', marginBottom: '1em' },
  'h1': { display: 'block', fontSize: '2em', fontWeight: 'bold', marginTop: '0.67em', marginBottom: '0.67em' },
  'h2': { display: 'block', fontSize: '1.5em', fontWeight: 'bold', marginTop: '0.83em', marginBottom: '0.83em' },
  'h3': { display: 'block', fontSize: '1.17em', fontWeight: 'bold', marginTop: '1em', marginBottom: '1em' },
  'h4': { display: 'block', fontWeight: 'bold', marginTop: '1.33em', marginBottom: '1.33em' },
  'h5': { display: 'block', fontSize: '0.83em', fontWeight: 'bold', marginTop: '1.67em', marginBottom: '1.67em' },
  'h6': { display: 'block', fontSize: '0.67em', fontWeight: 'bold', marginTop: '2.33em', marginBottom: '2.33em' },
  
  // 列表元素
  'ul': { display: 'block', listStyleType: 'disc', marginTop: '1em', marginBottom: '1em', paddingLeft: '40px' },
  'ol': { display: 'block', listStyleType: 'decimal', marginTop: '1em', marginBottom: '1em', paddingLeft: '40px' },
  'li': { display: 'list-item' },
  
  // 引用元素
  'blockquote': { display: 'block', marginTop: '1em', marginBottom: '1em', marginLeft: '40px', marginRight: '40px' },
  
  // 内联元素
  'span': { display: 'inline' },
  'a': { display: 'inline', color: 'rgb(0, 0, 238)', textDecoration: 'underline' },
  'strong': { display: 'inline', fontWeight: 'bold' },
  'b': { display: 'inline', fontWeight: 'bold' },
  'em': { display: 'inline', fontStyle: 'italic' },
  'i': { display: 'inline', fontStyle: 'italic' },
  'small': { display: 'inline', fontSize: '0.83em' },
  
  // 特殊元素
  'br': { display: 'inline' },
  'img': { display: 'inline' },
  'svg': { display: 'inline' },

  // 表格元素
  'table': { display: 'table', borderCollapse: 'separate', borderSpacing: '2px' },
  'tr': { display: 'table-row' },
  'td': { display: 'table-cell', verticalAlign: 'inherit' },
  'th': { display: 'table-cell', verticalAlign: 'inherit', fontWeight: 'bold', textAlign: 'center' }
};

// 通用的默认值映射（只保留电子书阅读器需要的样式）
const genericDefaults = {
  // 显示
  'display': 'inline',
  
  // 尺寸（图片需要）
  'width': 'auto',
  'height': 'auto',
  
  // 边距和内边距
  marginTop: '0px',
  marginRight: '0px', 
  marginBottom: '0px',
  marginLeft: '0px',
  paddingTop: '0px',
  paddingRight: '0px',
  paddingBottom: '0px', 
  paddingLeft: '0px',
  
  // 字体
  fontFamily: 'Arial, sans-serif',
  fontSize: '16px',
  fontWeight: '400',
  fontStyle: 'normal',
  lineHeight: 'normal',
  letterSpacing: 'normal',
  wordSpacing: 'normal',
  
  // 文本
  textAlign: 'start',
  
  // 颜色（backgroundColor 仅用于特殊标签如 ins）
  'color': 'rgb(0, 0, 0)',
  backgroundColor: 'rgba(0, 0, 0, 0)',
};

/**
 * 获取标签的默认样式
 * @param {string} tagName 
 * @returns {Object}
 */
export function getDefaultStyles(tagName) {
  return defaultTagStyles[tagName] || {};
}

/**
 * 合并样式对象
 * @param {Object} base 
 * @param {Object} override 
 * @returns {Object}
 */
export function mergeStyles(base, override) {
  return { ...base, ...override };
}

/**
 * 标准化样式值
 * @param {string} property 
 * @param {string} value 
 * @returns {string}
 */
export function normalizeStyleValue(property, value) {
  if (!value) return '';
  
  // 标准化颜色值
  if (property === 'color' || property.includes('color')) {
    return normalizeColor(value);
  }
  
  // 标准化长度值
  if (isLengthProperty(property)) {
    return normalizeLength(value);
  }
  
  return value.toString().trim();
}

/**
 * 判断是否为默认值
 * @param {string} property 
 * @param {string} value 
 * @returns {boolean}
 */
export function isDefaultValue(property, value) {
  return genericDefaults[property] === value;
}

/**
 * 标准化颜色值
 */
function normalizeColor(color) {
  // 简化颜色处理，保持原样
  return color;
}

/**
 * 标准化长度值
 */
function normalizeLength(length) {
  // 简化长度处理，保持原样
  return length;
}

/**
 * 判断是否为长度相关属性
 */
function isLengthProperty(property) {
  const lengthProps = [
    // 电子书阅读器需要的长度属性
    'width', 'height', // 图片需要
    'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
    'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
    'fontSize', 'lineHeight', 'letterSpacing', 'wordSpacing'
  ];
  
  return lengthProps.some(prop => property.includes(prop));
}

/**
 * 判断是否为文本相关样式属性
 * @param {string} property 
 * @returns {boolean}
 */
export function isTextStyleProperty(property) {
  const textStyleProperties = [
    // 电子书阅读器需要的文本样式
    'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'fontVariant',
    'lineHeight', 'letterSpacing', 'wordSpacing',
    'textAlign', 'textIndent',
    'color'
  ];
  
  return textStyleProperties.includes(property);
}

/**
 * 获取文本样式的默认值
 * @param {string} tagName 
 * @returns {Object}
 */
export function getTextDefaults(tagName) {
  const allDefaults = getDefaultStyles(tagName);
  const textDefaults = {};
  
  for (const [property, value] of Object.entries(allDefaults)) {
    if (isTextStyleProperty(property)) {
      textDefaults[property] = value;
}
  }
  
  return textDefaults;
} 