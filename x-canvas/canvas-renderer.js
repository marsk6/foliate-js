/**
 * Canvas渲染器
 * 将布局引擎生成的数据结构渲染到Canvas上
 */

// import LayoutEngine from './layout-engine.js';

/**
 * @typedef {Object} RenderConfig
 * @property {HTMLCanvasElement} canvas - Canvas元素
 * @property {Object} theme - 主题配置
 */

export class CanvasRenderer {
    /**
     * @param {RenderConfig} config 
     */
    constructor(config) {
        this.canvas = config.canvas;
        this.ctx = this.canvas.getContext('2d');
        this.theme = {
            backgroundColor: '#fff',
            textColor: '#222',
            ...config.theme
        };
        
        // 布局引擎实例
        this.layoutEngine = new LayoutEngine({
            canvasWidth: this.canvas.width,
            canvasHeight: this.canvas.height
        });
        
        // 渲染状态
        this.layoutResult = null;
        
        // 设置高DPI支持
        this.setupHighDPI();
    }

    /**
     * 设置高DPI支持
     */
    setupHighDPI() {
        const dpr = window.devicePixelRatio || 1;
        const rect = this.canvas.getBoundingClientRect();
        
        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;
        this.canvas.style.width = rect.width + 'px';
        this.canvas.style.height = rect.height + 'px';
        
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        
        // 更新布局引擎配置
        this.layoutEngine.config.canvasWidth = rect.width;
        this.layoutEngine.config.canvasHeight = rect.height;
    }

    /**
     * 渲染HTML内容
     * @param {string} htmlContent 
     */
    render(htmlContent) {
        // 保存当前HTML内容
        this.currentHTML = htmlContent;
        
        // 使用布局引擎解析HTML
        this.layoutResult = this.layoutEngine.layout(htmlContent);
        
        // 清空画布
        this.clear();
        
        // 渲染背景
        this.renderBackground();
        
        // 渲染文本
        this.renderText();
        
        // 渲染元素（图片等）
        this.renderElements();
    }

    /**
     * 清空画布
     */
    clear() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    /**
     * 渲染背景
     */
    renderBackground() {
        this.ctx.fillStyle = this.theme.backgroundColor;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }

    /**
     * 渲染文本
     */
    renderText() {
        if (!this.layoutResult) return;
        
        const { chars } = this.layoutResult;
        let currentFont = '';
        
        chars.forEach(char => {
            const { style } = char;
            const font = `${style.fontStyle || 'normal'} ${style.fontWeight || 'normal'} ${style.fontSize}px ${this.layoutEngine.config.fontFamily}`;
            
            // 优化：只在字体改变时更新
            if (font !== currentFont) {
                this.ctx.font = font;
                currentFont = font;
            }
            
            this.ctx.fillStyle = style.color || this.theme.textColor;
            this.ctx.fillText(char.char, char.x, char.y);
        });
    }

    /**
     * 渲染元素（图片等）
     */
    renderElements() {
        if (!this.layoutResult) return;
        
        const { elements } = this.layoutResult;
        
        elements.forEach(element => {
            if (element.type === 'image') {
                // 绘制图片占位符
                this.ctx.strokeStyle = '#ccc';
                this.ctx.strokeRect(element.x, element.y, element.width, element.height);
                
                // 绘制图片图标或文字
                this.ctx.fillStyle = '#999';
                this.ctx.font = '14px system-ui';
                this.ctx.fillText(
                    element.alt || 'Image',
                    element.x + 10,
                    element.y + element.height / 2
                );
            }
        });
    }

    /**
     * 根据坐标获取字符索引
     * @param {number} x 
     * @param {number} y 
     * @returns {number|null}
     */
    getCharIndexAt(x, y) {
        if (!this.layoutResult) return null;
        
        const rect = this.canvas.getBoundingClientRect();
        const canvasX = x - rect.left;
        const canvasY = y - rect.top;
        
        return this.layoutEngine.getCharIndexAt(canvasX, canvasY, this.layoutResult.chars);
    }

    /**
     * 获取当前HTML内容
     * @returns {string}
     */
    getCurrentHTML() {
        return this.currentHTML || '';
    }

    /**
     * 设置主题
     * @param {Object} theme 
     */
    setTheme(theme) {
        this.theme = { ...this.theme, ...theme };
        
        // 重新渲染
        if (this.layoutResult) {
            this.render(this.getCurrentHTML());
        }
    }

    /**
     * 获取布局信息
     * @returns {LayoutResult|null}
     */
    getLayoutResult() {
        return this.layoutResult;
    }

    /**
     * 滚动到指定字符
     * @param {number} charIndex 
     */
    scrollToChar(charIndex) {
        if (!this.layoutResult || charIndex >= this.layoutResult.chars.length) {
            return;
        }
        
        const char = this.layoutResult.chars[charIndex];
        const rect = this.canvas.getBoundingClientRect();
        
        // 这里需要根据实际的滚动容器来实现滚动
        // 例如：container.scrollTop = char.y - rect.height / 2;
    }

    /**
     * 销毁渲染器
     */
    destroy() {
        this.clear();
        this.layoutResult = null;
    }
}

export default CanvasRenderer; 