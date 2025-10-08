/**
 * 主题配置类
 * 管理渲染器的主题设置，包括颜色、字体、间距等
 */

export class Theme {
  /**
   * @param {Object} config - 主题配置对象
   * @param {string} [config.backgroundColor='#fff'] - 背景色
   * @param {string} [config.textColor='#222'] - 文字颜色
   * @param {number} [config.baseFontSize=20] - 基础字体大小
   * @param {string} [config.fontFamily='system-ui, sans-serif'] - 字体族
   * @param {number} [config.paddingX=16] - 水平内边距
   * @param {number} [config.lineHeight=1.4] - 行高倍数
   * @param {boolean} [config.showImageBorder=false] - 是否显示图片边框
   * @param {string} [config.imageBorderColor='#ddd'] - 图片边框颜色
   * @param {number} [config.viewportWidth] - 视窗宽度
   * @param {number} [config.viewportHeight] - 视窗高度
   */
  constructor(config = {}) {
    this.backgroundColor = config.backgroundColor || '#fff';
    this.textColor = config.textColor || '#222';
    this.baseFontSize = config.baseFontSize || 20;
    this.fontFamily = config.fontFamily || 'system-ui, sans-serif';
    this.paddingX = config.paddingX || 16;
    this.lineHeight = config.lineHeight || 1.4;
    this.showImageBorder = config.showImageBorder !== undefined ? config.showImageBorder : false;
    this.imageBorderColor = config.imageBorderColor || '#ddd';
    this.viewportWidth = config.viewportWidth || window.innerWidth;
    this.viewportHeight = config.viewportHeight || window.innerHeight;
  }

  /**
   * 更新主题配置
   * @param {Object} updates - 要更新的配置项
   * @returns {Theme} 返回自身以支持链式调用
   */
  update(updates) {
    Object.assign(this, updates);
    return this;
  }

  /**
   * 克隆当前主题
   * @returns {Theme} 新的主题实例
   */
  clone() {
    return new Theme({
      backgroundColor: this.backgroundColor,
      textColor: this.textColor,
      baseFontSize: this.baseFontSize,
      fontFamily: this.fontFamily,
      paddingX: this.paddingX,
      lineHeight: this.lineHeight,
      showImageBorder: this.showImageBorder,
      imageBorderColor: this.imageBorderColor,
    });
  }

  /**
   * 转换为普通对象
   * @returns {Object}
   */
  toObject() {
    return {
      backgroundColor: this.backgroundColor,
      textColor: this.textColor,
      baseFontSize: this.baseFontSize,
      fontFamily: this.fontFamily,
      paddingX: this.paddingX,
      lineHeight: this.lineHeight,
      showImageBorder: this.showImageBorder,
      imageBorderColor: this.imageBorderColor,
      viewportWidth: this.viewportWidth,
      viewportHeight: this.viewportHeight,
    };
  }

  /**
   * 转换为 JSON 字符串
   * @returns {string}
   */
  toJSON() {
    return JSON.stringify(this.toObject());
  }

  /**
   * 从对象创建主题
   * @param {Object} obj - 主题配置对象
   * @returns {Theme}
   */
  static fromObject(obj) {
    return new Theme(obj);
  }

  /**
   * 从 JSON 字符串创建主题
   * @param {string} json - JSON 字符串
   * @returns {Theme}
   */
  static fromJSON(json) {
    try {
      const obj = JSON.parse(json);
      return Theme.fromObject(obj);
    } catch (error) {
      console.error('Failed to parse theme JSON:', error);
      return Theme.default();
    }
  }

  /**
   * 默认主题
   * @returns {Theme}
   */
  static default() {
    return new Theme({
      backgroundColor: '#fff',
      textColor: '#222',
      baseFontSize: 20,
      fontFamily: 'system-ui, sans-serif',
      paddingX: 16,
      lineHeight: 1.4,
      showImageBorder: false,
      imageBorderColor: '#ddd',
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    });
  }

  /**
   * 深色主题
   * @returns {Theme}
   */
  static dark() {
    return new Theme({
      backgroundColor: '#1e1e1e',
      textColor: '#e0e0e0',
      baseFontSize: 20,
      fontFamily: 'system-ui, sans-serif',
      paddingX: 16,
      lineHeight: 1.4,
      showImageBorder: true,
      imageBorderColor: '#444',
    });
  }

  /**
   * 护眼主题（米黄色）
   * @returns {Theme}
   */
  static sepia() {
    return new Theme({
      backgroundColor: '#f4ecd8',
      textColor: '#5b4636',
      baseFontSize: 20,
      fontFamily: 'system-ui, sans-serif',
      paddingX: 16,
      lineHeight: 1.4,
      showImageBorder: false,
      imageBorderColor: '#d4c4a8',
    });
  }

  /**
   * 夜间主题（纯黑）
   * @returns {Theme}
   */
  static night() {
    return new Theme({
      backgroundColor: '#000',
      textColor: '#bbb',
      baseFontSize: 20,
      fontFamily: 'system-ui, sans-serif',
      paddingX: 16,
      lineHeight: 1.4,
      showImageBorder: true,
      imageBorderColor: '#333',
    });
  }

  /**
   * 获取所有预设主题
   * @returns {Object<string, Theme>}
   */
  static presets() {
    return {
      default: Theme.default(),
      dark: Theme.dark(),
      sepia: Theme.sepia(),
      night: Theme.night(),
    };
  }

  /**
   * 验证颜色格式是否有效
   * @param {string} color - 颜色值
   * @returns {boolean}
   */
  static isValidColor(color) {
    // 支持 hex 格式：#fff, #ffffff
    const hexPattern = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
    // 支持 rgb/rgba 格式
    const rgbPattern = /^rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(,\s*[\d.]+\s*)?\)$/;
    
    return hexPattern.test(color) || rgbPattern.test(color);
  }

  /**
   * 验证主题配置是否有效
   * @returns {boolean}
   */
  validate() {
    if (!Theme.isValidColor(this.backgroundColor)) {
      console.warn('Invalid backgroundColor:', this.backgroundColor);
      return false;
    }
    
    if (!Theme.isValidColor(this.textColor)) {
      console.warn('Invalid textColor:', this.textColor);
      return false;
    }
    
    if (this.baseFontSize <= 0 || this.baseFontSize > 100) {
      console.warn('Invalid baseFontSize:', this.baseFontSize);
      return false;
    }
    
    if (this.paddingX < 0) {
      console.warn('Invalid paddingX:', this.paddingX);
      return false;
    }
    
    if (this.lineHeight < 1 || this.lineHeight > 3) {
      console.warn('Invalid lineHeight:', this.lineHeight);
      return false;
    }
    
    return true;
  }
}

export default Theme;
