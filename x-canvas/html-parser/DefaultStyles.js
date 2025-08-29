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

// 通用的默认值映射（使用 camelCase 格式，只包含分解属性）
const genericDefaults = {
  // 显示
  'display': 'inline',
  'position': 'static',
  'float': 'none',
  'clear': 'none',
  'visibility': 'visible',
  zIndex: 'auto',
  
  // 盒子模型
  'width': 'auto',
  'height': 'auto',
  minWidth: '0px',
  minHeight: '0px',
  maxWidth: 'none',
  maxHeight: 'none',
  
  // 边距和内边距（只保留具体方向属性）
  marginTop: '0px',
  marginRight: '0px', 
  marginBottom: '0px',
  marginLeft: '0px',
  paddingTop: '0px',
  paddingRight: '0px',
  paddingBottom: '0px', 
  paddingLeft: '0px',
  
  // 定位
  'top': 'auto',
  'right': 'auto',
  'bottom': 'auto',
  'left': 'auto',
  
  // 字体（只保留具体属性）
  fontFamily: 'Arial, sans-serif',
  fontSize: '16px',
  fontWeight: '400',
  fontStyle: 'normal',
  lineHeight: 'normal',
  letterSpacing: 'normal',
  wordSpacing: 'normal',
  
  // 文本
  textAlign: 'start',
  textDecoration: 'none',
  textTransform: 'none',
  whiteSpace: 'normal',
  wordBreak: 'normal',
  overflowWrap: 'normal',
  
  // 颜色和背景（只保留具体属性）
  'color': 'rgb(0, 0, 0)',
  backgroundColor: 'rgba(0, 0, 0, 0)',
  backgroundImage: 'none',
  backgroundSize: 'auto auto',
  backgroundPosition: '0% 0%',
  backgroundRepeat: 'repeat',

  // 边框（只保留具体属性）
  borderTopWidth: '0px',
  borderTopStyle: 'none',
  borderTopColor: 'rgb(0, 0, 0)',
  borderRightWidth: '0px',
  borderRightStyle: 'none', 
  borderRightColor: 'rgb(0, 0, 0)',
  borderBottomWidth: '0px',
  borderBottomStyle: 'none',
  borderBottomColor: 'rgb(0, 0, 0)',
  borderLeftWidth: '0px',
  borderLeftStyle: 'none',
  borderLeftColor: 'rgb(0, 0, 0)',
  borderTopLeftRadius: '0px',
  borderTopRightRadius: '0px',
  borderBottomRightRadius: '0px',
  borderBottomLeftRadius: '0px',
  
  // 变换和效果
  'transform': 'none',
  transformOrigin: '50% 50% 0px',
  'opacity': '1',
  'filter': 'none',
  
  // 溢出
  'overflow': 'visible',
  overflowX: 'visible',
  overflowY: 'visible',
  
  // 其他
  'cursor': 'auto',
  pointerEvents: 'auto',
  userSelect: 'auto',
  boxSizing: 'content-box',
  boxShadow: 'none',
  textShadow: 'none'
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
    // 只支持具体的分解属性（camelCase 格式）
    'width', 'height', 'top', 'right', 'bottom', 'left',
    'minWidth', 'minHeight', 'maxWidth', 'maxHeight',
    'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
    'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
    'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
    'borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomRightRadius', 'borderBottomLeftRadius',
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
    // 只支持 camelCase 格式
    'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'fontVariant',
    'lineHeight', 'letterSpacing', 'wordSpacing',
    'textAlign', 'textDecoration', 'textTransform', 'textIndent', 'textShadow',
    'whiteSpace', 'wordBreak', 'overflowWrap', 'wordWrap',
    'color', 'direction', 'unicodeBidi', 'writingMode'
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