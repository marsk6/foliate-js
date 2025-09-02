/**
 * 划线管理器 - 处理划线的存储、恢复和渲染
 *
 * 核心思路：
 * 1. 使用自定义内容锚点系统替代CFI，适应重新排版的内容
 * 2. 支持原始内容和插入内容（翻译、提示等）的混合划线
 * 3. 基于段落ID + 段内偏移的稳定位置标识
 * 4. 多重恢复策略确保在内容变化时的可靠性
 */

import { ContentAnchorSystem } from './content-anchor-system.js';

export class HighlightManager {
  static instance = null;

  constructor(renderer) {
    if (HighlightManager.instance) {
      return HighlightManager.instance;
    }
    HighlightManager.instance = this;

    this.renderer = renderer;

    // 内容锚点系统
    this.anchorSystem = new ContentAnchorSystem();

    // 存储所有划线数据
    this.highlights = new Map();

    // 渲染层DOM元素
    this.highlightLayer = null;

    // 事件回调
    this.onHighlightAdd = null;
    this.onHighlightRemove = null;
    this.onHighlightUpdate = null;

    this.init();
  }

  /**
   * 初始化划线管理器
   */
  init() {
    this.createHighlightLayer();
    this.setupAnchorSystemContext();
    this.loadStoredHighlights();
  }

    /**
   * 创建划线渲染层（Canvas版本不需要DOM层）
   */
  createHighlightLayer() {
    // Canvas版本的划线直接在现有Canvas上渲染，不需要额外的DOM层
    this.highlightLayer = null; // 保持兼容性
    this.setupCanvasClickDetection();
  }

  /**
   * 设置Canvas点击检测
   */
  setupCanvasClickDetection() {
    // 延迟设置，等待Canvas池创建完成
    setTimeout(() => {
      if (!this.renderer || !this.renderer.canvasList) return;

      // 为所有Canvas添加点击事件监听
      this.renderer.canvasList.forEach(canvas => {
        canvas.addEventListener('click', this.handleCanvasClick.bind(this));
      });
    }, 100);
  }

  /**
   * 创建划线数据结构
   * @param {Object} selection - 选中区域数据
   * @param {Object} options - 划线选项 (颜色、样式等)
   * @returns {Object} 划线数据
   */
  createHighlight(selection, options = {}) {
    const {
      text,
      startIdx,
      endIdx,
      chapterIndex,
      relativeStartIdx,
      relativeEndIdx,
      range,
    } = selection;

    // 使用新的内容锚点系统创建位置标识
    const anchor = this.anchorSystem.createAnchor(startIdx, endIdx, text);

    if (!anchor) {
      console.error('无法创建内容锚点');
      return null;
    }

    // 生成唯一ID
    const id = this.generateHighlightId(chapterIndex, startIdx, endIdx);

    const highlight = {
      id,
      text,
      chapterIndex,
      // 使用内容锚点系统的位置标识
      position: {
        anchor: anchor,
        // 保留相对位置信息作为备用
        relativeStart: relativeStartIdx,
        relativeEnd: relativeEndIdx,
        // 当前的全局位置（可变）
        globalStart: startIdx,
        globalEnd: endIdx,
      },
      // 样式选项
      style: {
        color: options.color || '#FFFF00',
        opacity: options.opacity || 0.3,
        type: options.type || 'highlight', // highlight, underline, strikethrough
        ...options.style,
      },
      // 元数据
      metadata: {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        note: options.note || '',
        tags: options.tags || [],
        // 记录涉及的内容段落类型
        segmentTypes: anchor.anchorPath.map((p) => p.segmentType),
        ...options.metadata,
      },
    };

    return highlight;
  }

  /**
   * 添加划线
   * @param {Object} selection - 选中区域
   * @param {Object} options - 划线选项
   * @returns {Object} 创建的划线对象
   */
  addHighlight(selection, options = {}) {
    const highlight = this.createHighlight(selection, options);

    // 存储到内存
    this.highlights.set(highlight.id, highlight);

    // 持久化存储
    this.saveHighlight(highlight);

    // 渲染
    this.renderHighlight(highlight);

    // 触发回调
    if (this.onHighlightAdd) {
      this.onHighlightAdd(highlight);
    }

    return highlight;
  }

  /**
   * 移除划线
   * @param {string} highlightId - 划线ID
   */
  removeHighlight(highlightId) {
    const highlight = this.highlights.get(highlightId);
    if (!highlight) return;

    // 从内存移除
    this.highlights.delete(highlightId);

    // 从存储移除
    this.deleteStoredHighlight(highlightId);

    // 移除渲染
    this.removeHighlightRender(highlightId);

    // 触发回调
    if (this.onHighlightRemove) {
      this.onHighlightRemove(highlight);
    }
  }

  /**
   * 根据当前渲染数据恢复所有划线的显示位置
   */
  restoreHighlights() {
    if (!this.renderer.fullLayoutData) return;

    // 清除现有渲染
    this.clearAllHighlightRenders();

    // 逐个恢复划线位置并渲染
    for (const highlight of this.highlights.values()) {
      const restoredPosition = this.restoreHighlightPosition(highlight);
      if (restoredPosition) {
        highlight.currentPosition = restoredPosition;
        this.renderHighlight(highlight);
      }
    }
  }

  /**
   * 恢复单个划线的位置
   * @param {Object} highlight - 划线对象
   * @returns {Object|null} 恢复的位置信息
   */
  restoreHighlightPosition(highlight) {
    const { position } = highlight;

    // 使用内容锚点系统恢复位置
    if (position.anchor) {
      const restoredPosition = this.anchorSystem.restoreAnchor(position.anchor);
      if (restoredPosition) {
        return restoredPosition;
      }
    }

    // 回退策略：使用相对位置
    const chapterRelativePosition = this.findPositionByChapterRelative(
      highlight.chapterIndex,
      position.relativeStart,
      position.relativeEnd
    );

    if (chapterRelativePosition) {
      // 简单验证文本长度
      const currentText = this.getContextText(
        chapterRelativePosition.globalStart,
        chapterRelativePosition.globalEnd + 1
      );
      if (currentText === highlight.text) {
        return chapterRelativePosition;
      }
    }

    // 最后的文本搜索策略
    const textSearchPosition = this.findPositionByTextSearch(highlight);
    if (textSearchPosition) {
      return textSearchPosition;
    }

    console.warn('无法恢复划线位置:', highlight.id);
    return null;
  }

  /**
   * 基于章节内相对位置查找划线位置
   * @param {number} chapterIndex - 章节索引
   * @param {number} relativeStart - 相对起始位置
   * @param {number} relativeEnd - 相对结束位置
   * @returns {Object|null}
   */
  findPositionByChapterRelative(chapterIndex, relativeStart, relativeEnd) {
    // 这里需要根据具体的章节管理实现
    // 获取当前章节的字符映射，将相对位置转换为绝对位置

    if (!this.renderer.getChapterCharacterMapping) {
      // 如果没有章节字符映射功能，尝试简单的偏移计算
      const chapterOffset = this.getChapterStartOffset(chapterIndex);
      if (chapterOffset !== null) {
        return {
          globalStart: chapterOffset + relativeStart,
          globalEnd: chapterOffset + relativeEnd,
        };
      }
      return null;
    }

    const mapping = this.renderer.getChapterCharacterMapping(chapterIndex);
    if (!mapping) return null;

    const globalStart = mapping.relativeToGlobal(relativeStart);
    const globalEnd = mapping.relativeToGlobal(relativeEnd);

    if (globalStart !== null && globalEnd !== null) {
      return { globalStart, globalEnd };
    }

    return null;
  }

  /**
   * 通过文本搜索恢复位置
   * @param {Object} highlight - 划线对象
   * @returns {Object|null}
   */
  findPositionByTextSearch(highlight) {
    const { text } = highlight;
    const words = this.renderer.fullLayoutData.words;

    if (!words) return null;

    // 在全局范围内搜索匹配的文本
    for (let i = 0; i <= words.length - text.length; i++) {
      let candidateText = '';
      for (let j = 0; j < text.length && i + j < words.length; j++) {
        if (words[i + j] && words[i + j].char) {
          candidateText += words[i + j].char;
        }
      }

      if (candidateText === text) {
        return {
          globalStart: i,
          globalEnd: i + text.length - 1,
        };
      }
    }

    return null;
  }

    /**
   * 渲染单个划线（Canvas版本通过render触发，这里只更新数据）
   * @param {Object} highlight - 划线对象
   */
  renderHighlight(highlight) {
    // Canvas版本不需要DOM操作，划线会在renderCanvasHighlights中绘制
    // 这里只需要确保划线数据被正确存储
    if (!highlight.currentPosition) {
      // 如果没有当前位置，使用存储的位置
      highlight.currentPosition = {
        globalStart: highlight.position.globalStart,
        globalEnd: highlight.position.globalEnd
      };
    }
    
    // 触发渲染更新
    if (this.renderer && this.renderer.render) {
      this.renderer.render();
    }
  }

  /**
   * 处理Canvas点击事件
   * @param {MouseEvent} event 
   */
  handleCanvasClick(event) {
    const clickedHighlight = this.getHighlightAtPoint(event);
    
    if (clickedHighlight) {
      // 显示划线菜单
      this.showHighlightMenu(clickedHighlight, event);
    }
  }

  /**
   * 获取点击位置的划线
   * @param {MouseEvent} event 
   * @returns {Object|null} 点击的划线对象
   */
  getHighlightAtPoint(event) {
    const canvas = event.target;
    const rect = canvas.getBoundingClientRect();
    
    // 计算Canvas内的相对坐标
    const canvasX = event.clientX - rect.left;
    const canvasY = event.clientY - rect.top;
    
    // 计算对应的内容坐标
    const contentY = canvasY + this.renderer.viewport.state.scrollTop;
    
    // 获取点击位置的字符索引
    const charIndex = this.renderer.getCharIndexAt({
      x: event.clientX,
      y: event.clientY
    });
    
    if (charIndex === null) return null;
    
    // 检查是否有划线包含这个字符位置
    const highlights = this.getAllHighlights();
    
    for (const highlight of highlights) {
      if (!highlight.currentPosition) continue;
      
      const { globalStart, globalEnd } = highlight.currentPosition;
      
      if (charIndex >= globalStart && charIndex <= globalEnd) {
        return highlight;
      }
    }
    
    return null;
  }

  /**
   * 显示划线菜单
   * @param {Object} highlight 划线对象
   * @param {MouseEvent} event 原始点击事件
   */
  showHighlightMenu(highlight, event) {
    // 创建划线菜单（如果不存在）
    if (!this.highlightMenu) {
      this.createHighlightMenu();
    }
    
    // 设置菜单位置
    const rect = event.target.getBoundingClientRect();
    const menuX = event.clientX - rect.left;
    const menuY = event.clientY - rect.top;
    
         this.highlightMenu.style.left = menuX + 'px';
     this.highlightMenu.style.top = (menuY - 120) + 'px'; // 菜单显示在点击位置上方
     this.highlightMenu.style.display = 'block';
     this.highlightMenu.classList.add('show');
    
    // 存储当前操作的划线
    this.currentHighlight = highlight;
    
    // 更新菜单内容
    this.updateHighlightMenuContent(highlight);
  }

  /**
   * 创建划线菜单
   */
  createHighlightMenu() {
    if (!this.renderer || !this.renderer.scrollContent) return;
    
    const menu = document.createElement('div');
    menu.className = 'highlight-menu';
    menu.innerHTML = `
      <div class="highlight-menu-arrow"></div>
      <div class="highlight-menu-content">
        <div class="highlight-menu-item" data-action="edit-note">编辑笔记</div>
        <div class="highlight-menu-item" data-action="change-color">更改颜色</div>
        <div class="highlight-menu-item" data-action="copy-text">复制文本</div>
        <div class="highlight-menu-item" data-action="delete" style="color: #ff4444;">删除划线</div>
      </div>
    `;
    
    // 添加样式
    menu.style.cssText = `
      position: absolute;
      background: white;
      border: 1px solid #ddd;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      z-index: 1000;
      display: none;
      min-width: 120px;
    `;
    
    this.renderer.scrollContent.appendChild(menu);
    this.highlightMenu = menu;
    
    // 添加菜单事件监听
    this.setupHighlightMenuEvents();
  }

  /**
   * 设置划线菜单事件
   */
  setupHighlightMenuEvents() {
    if (!this.highlightMenu) return;

    const menuItems = this.highlightMenu.querySelectorAll('.highlight-menu-item');
    menuItems.forEach(item => {
      item.addEventListener('click', (e) => {
        const action = e.target.dataset.action;
        this.handleHighlightMenuAction(action);
        this.hideHighlightMenu();
      });
    });

    // 点击其他地方隐藏菜单
    document.addEventListener('click', (e) => {
      if (!this.highlightMenu.contains(e.target)) {
        this.hideHighlightMenu();
      }
    });
  }

  /**
   * 处理划线菜单动作
   * @param {string} action 
   */
  handleHighlightMenuAction(action) {
    if (!this.currentHighlight) return;

    switch (action) {
      case 'edit-note':
        const newNote = prompt('编辑笔记:', this.currentHighlight.metadata.note);
        if (newNote !== null) {
          this.currentHighlight.metadata.note = newNote;
          this.currentHighlight.metadata.updatedAt = new Date().toISOString();
          this.saveHighlight(this.currentHighlight);
        }
        break;
        
      case 'change-color':
        const colors = ['#FFFF00', '#87CEEB', '#FFB6C1', '#98FB98', '#F0E68C'];
        const currentColorIndex = colors.indexOf(this.currentHighlight.style.color);
        const nextColorIndex = (currentColorIndex + 1) % colors.length;
        this.currentHighlight.style.color = colors[nextColorIndex];
        this.saveHighlight(this.currentHighlight);
        this.renderer.render(); // 重新渲染以更新颜色
        break;
        
      case 'copy-text':
        if (this.currentHighlight.text && navigator.clipboard) {
          navigator.clipboard.writeText(this.currentHighlight.text).catch(console.error);
        }
        break;
        
      case 'delete':
        this.removeHighlight(this.currentHighlight.id);
        break;
    }
  }

  /**
   * 更新划线菜单内容
   * @param {Object} highlight 
   */
  updateHighlightMenuContent(highlight) {
    // 可以根据划线类型动态调整菜单项
    const noteItem = this.highlightMenu.querySelector('[data-action="edit-note"]');
    if (noteItem) {
      noteItem.textContent = highlight.metadata.note ? '编辑笔记' : '添加笔记';
    }
  }

  /**
   * 隐藏划线菜单
   */
  hideHighlightMenu() {
    if (this.highlightMenu) {
      this.highlightMenu.classList.remove('show');
      this.highlightMenu.style.display = 'none';
    }
    this.currentHighlight = null;
  }

  /**
   * 显示划线菜单
   */
  showHighlightMenu() {
    if (this.highlightMenu) {
      this.highlightMenu.style.display = 'block';
    }
  }

  // Canvas版本不需要CSS样式，样式直接在Canvas绘制时应用

    /**
   * 移除划线渲染（Canvas版本通过重新渲染实现）
   * @param {string} highlightId - 划线ID
   */
  removeHighlightRender(highlightId) {
    // Canvas版本通过重新渲染来移除划线
    if (this.renderer && this.renderer.render) {
      this.renderer.render();
    }
  }

  /**
   * 清除所有划线渲染（Canvas版本通过重新渲染实现）
   */
  clearAllHighlightRenders() {
    // Canvas版本通过重新渲染来清除所有划线
    if (this.renderer && this.renderer.render) {
      this.renderer.render();
    }
  }

  /**
   * 生成划线唯一ID
   */
  generateHighlightId(chapterIndex, globalStart, globalEnd) {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 9);
    return `highlight_${chapterIndex}_${globalStart}_${globalEnd}_${timestamp}_${random}`;
  }

  /**
   * 文本哈希
   */
  hashText(text) {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // 转换为32位整数
    }
    return hash.toString();
  }

  /**
   * 获取上下文文本
   */
  getContextText(start, end) {
    if (!this.renderer.fullLayoutData || !this.renderer.fullLayoutData.words) {
      return '';
    }

    const words = this.renderer.fullLayoutData.words;
    let text = '';

    for (let i = Math.max(0, start); i < Math.min(words.length, end); i++) {
      if (words[i] && words[i].char) {
        text += words[i].char;
      }
    }

    return text;
  }

  /**
   * 注册内容段落到锚点系统
   * @param {string} type 段落类型 (original/translation/hint等)
   * @param {string} content 段落内容
   * @param {number} startChar 起始字符位置
   * @param {number} endChar 结束字符位置
   * @param {string} originalId 原始段落ID（可选，用于关联翻译等）
   * @param {Object} metadata 元数据（可选）
   * @returns {string} 段落ID
   */
  registerContentSegment(
    type,
    content,
    startChar,
    endChar,
    originalId = null,
    metadata = {}
  ) {
    return this.anchorSystem.registerContentSegment({
      type,
      content,
      startChar,
      endChar,
      originalId,
      metadata,
    });
  }

  /**
   * 批量注册内容段落
   * @param {Array} segments 段落数组
   */
  registerContentSegments(segments) {
    segments.forEach((segment) => {
      this.registerContentSegment(
        segment.type,
        segment.content,
        segment.startChar,
        segment.endChar,
        segment.originalId,
        segment.metadata
      );
    });
  }

  /**
   * 更新内容锚点系统的上下文文本获取方法
   */
  setupAnchorSystemContext() {
    // 为内容锚点系统提供获取上下文文本的方法
    this.anchorSystem.getContextText = (start, end) => {
      return this.getContextText(start, end);
    };
  }

  /**
   * 获取章节起始偏移
   */
  getChapterStartOffset(chapterIndex) {
    // 这需要根据具体的章节管理实现
    // 返回指定章节在全局字符位置中的起始偏移
    return 0; // 临时实现
  }

  /**
   * 保存划线到持久存储
   */
  saveHighlight(highlight) {
    try {
      const stored = this.getStoredHighlights();
      stored[highlight.id] = highlight;
      localStorage.setItem('reader_highlights', JSON.stringify(stored));
    } catch (error) {
      console.error('保存划线失败:', error);
    }
  }

  /**
   * 从持久存储删除划线
   */
  deleteStoredHighlight(highlightId) {
    try {
      const stored = this.getStoredHighlights();
      delete stored[highlightId];
      localStorage.setItem('reader_highlights', JSON.stringify(stored));
    } catch (error) {
      console.error('删除划线失败:', error);
    }
  }

  /**
   * 获取存储的划线数据
   */
  getStoredHighlights() {
    try {
      const stored = localStorage.getItem('reader_highlights');
      return stored ? JSON.parse(stored) : {};
    } catch (error) {
      console.error('读取划线数据失败:', error);
      return {};
    }
  }

  /**
   * 加载存储的划线
   */
  loadStoredHighlights() {
    const stored = this.getStoredHighlights();
    for (const [id, highlight] of Object.entries(stored)) {
      this.highlights.set(id, highlight);
    }
  }

  /**
   * 获取所有划线
   */
  getAllHighlights() {
    return Array.from(this.highlights.values());
  }

  /**
   * 根据章节获取划线
   */
  getHighlightsByChapter(chapterIndex) {
    return this.getAllHighlights().filter(
      (h) => h.chapterIndex === chapterIndex
    );
  }

  /**
   * 清除所有划线
   */
  clearAllHighlights() {
    this.highlights.clear();
    this.clearAllHighlightRenders();
    localStorage.removeItem('reader_highlights');
  }
}
