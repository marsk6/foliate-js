import { HTMLParser } from './HTMLParser.js';

export default class HTMLParse2 {
  constructor() {
    this.cssRules = {};
    this.iframe = null;
    this.parser = new HTMLParser();
  }
  
  /**
   * 解析指定URL的页面内容
   * @param {string} url 
   * @returns {Promise<Object>}
   */
  parse(url) {
    return new Promise((resolve, reject) => {
      this.iframe = document.createElement('iframe');
      this.iframe.src = url;
      this.iframe.style.display = 'none';
      this.iframe.onload = async () => {
        try {
          const body = this.iframe.contentWindow.document.body;
          this.iframe.contentWindow.document.documentElement.style.cssText = 'font-size: 14px;';
          const root = this.parser.parse(body);
          resolve(root);
          // document.body.removeChild(this.iframe);
        } catch (error) {
          reject(error);
          if (this.iframe && this.iframe.parentNode) {
            document.body.removeChild(this.iframe);
          }
        }
      };
      this.iframe.onerror = () => {
        reject(new Error('Failed to load iframe'));
        if (this.iframe && this.iframe.parentNode) {
          document.body.removeChild(this.iframe);
        }
      };
      document.body.appendChild(this.iframe);
    });
  }

  /**
   * 直接解析DOM元素
   * @param {HTMLElement} element 
   * @returns {Object}
   */
  parseElement(element) {
    return this.parser.parse(element);
  }

  /**
   * 解析当前页面的body
   * @returns {Object}
   */
  parseCurrentPage() {
    return this.parser.parse(document.body);
  }
}
