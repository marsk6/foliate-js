# HTML Canvas 编排引擎

这是一个将HTML内容转换为Canvas渲染的编排引擎，专为电子书阅读器设计。

## 功能特性

### 核心功能
- ✅ HTML解析和文本提取
- ✅ 智能文本布局和自动换行
- ✅ 多种HTML标签支持（h1-h6、p、strong、em、i、b等）
- ✅ Canvas高性能渲染
- ✅ 高DPI显示屏支持
- ✅ 文本选择功能
- ✅ 高亮标注功能
- ✅ 主题自定义

### 交互功能
- 鼠标拖拽选择文本
- 双击选择单词
- 右键清除选择
- 添加/移除高亮标注
- 实时主题切换

## 文件结构

```
web/foliate-js/
├── layout-engine.js        # 核心编排引擎
├── canvas-renderer.js      # Canvas渲染器
├── layout-engine-demo.html # 演示页面
└── README-layout-engine.md # 说明文档
```

## 使用方法

### 基本用法

```javascript
import TransferEngine from './layout-engine.js';
import CanvasRenderer from './canvas-renderer.js';

// 创建Canvas渲染器
const canvas = document.getElementById('myCanvas');
const renderer = new CanvasRenderer({
    canvas: canvas,
    theme: {
        backgroundColor: '#fff',
        textColor: '#222',
        selectionColor: '#007aff',
        selectionOpacity: 0.2,
        highlightColor: '#ffeb3b',
        highlightOpacity: 0.3
    },
    enableSelection: true,
    enableHighlight: true
});

// 渲染HTML内容
const htmlContent = `
<h1>标题</h1>
<p>这是一段文本内容。</p>
<p><strong>粗体文本</strong>和<em>斜体文本</em>。</p>
`;

renderer.render(htmlContent);
```

### 配置选项

#### TransferEngine 配置

```javascript
const config = {
    canvasWidth: 400,      // Canvas宽度
    canvasHeight: 600,     // Canvas高度
    paddingX: 16,          // 水平内边距
    paddingY: 20,          // 垂直内边距
    fontSize: 20,          // 基础字体大小
    lineHeight: 36,        // 行高
    fontFamily: 'system-ui, sans-serif', // 字体族
    textColor: '#222'      // 文本颜色
};

const layoutEngine = new TransferEngine(config);
```

#### CanvasRenderer 配置

```javascript
const config = {
    canvas: canvasElement,
    theme: {
        backgroundColor: '#fff',    // 背景色
        textColor: '#222',         // 文本色
        selectionColor: '#007aff', // 选择色
        selectionOpacity: 0.2,     // 选择透明度
        highlightColor: '#ffeb3b', // 高亮色
        highlightOpacity: 0.3      // 高亮透明度
    },
    enableSelection: true,         // 启用文本选择
    enableHighlight: true          // 启用高亮功能
};
```

## API 文档

### TransferEngine

#### 方法

- `layout(htmlContent)` - 解析HTML并生成布局数据
- `measureText(text, style)` - 测量文本宽度
- `getCharIndexAt(x, y, chars)` - 根据坐标获取字符索引
- `getHighlightRects(startIndex, endIndex, chars)` - 获取高亮区域

#### 返回数据结构

```javascript
{
    chars: [         // 字符位置信息数组
        {
            x: 16,           // X坐标
            y: 40,           // Y坐标
            width: 12,       // 字符宽度
            height: 20,      // 字符高度
            line: 0,         // 行号
            char: '文',      // 字符内容
            style: {...}     // 样式信息
        }
    ],
    lines: [         // 行信息数组
        {
            startIndex: 0,   // 行开始字符索引
            endIndex: 25,    // 行结束字符索引
            y: 40,          // 行Y坐标
            height: 36,     // 行高度
            baseline: 32    // 基线位置
        }
    ],
    totalHeight: 400,    // 总高度
    elements: []         // 非文本元素（图片等）
}
```

### CanvasRenderer

#### 方法

- `render(htmlContent)` - 渲染HTML内容
- `setSelection(start, end)` - 设置选择范围
- `clearSelection()` - 清除选择
- `addHighlight(start, end, options)` - 添加高亮
- `removeHighlight(id)` - 移除高亮
- `clearHighlights()` - 清除所有高亮
- `getSelectedText()` - 获取选中文本
- `getCharIndexAt(x, y)` - 根据坐标获取字符索引
- `setTheme(theme)` - 设置主题
- `getLayoutResult()` - 获取布局结果

## 支持的HTML标签

| 标签 | 支持 | 描述 |
|------|------|------|
| h1-h6 | ✅ | 标题标签，自动调整字体大小 |
| p | ✅ | 段落标签，添加段落间距 |
| strong, b | ✅ | 粗体文本 |
| em, i | ✅ | 斜体文本 |
| br | ✅ | 换行标签 |
| img | ⚠️ | 图片占位符（计划完整支持） |
| div | ✅ | 通用容器 |

## 演示页面

打开 `layout-engine-demo.html` 查看完整的演示页面，包含：

- HTML内容编辑器
- 实时Canvas渲染
- 文本选择功能
- 高亮标注功能
- 主题自定义
- 布局信息显示

## 性能优化

### 已实现的优化
- Canvas高DPI支持
- 字体状态缓存（避免重复设置）
- 按需重渲染
- 二分查找字符位置

### 计划中的优化
- 虚拟滚动支持
- 文本缓存机制
- 增量渲染
- Web Worker支持

## 扩展功能

### 计划支持的功能
- [ ] 图片完整渲染
- [ ] CSS样式解析
- [ ] 表格支持
- [ ] 列表支持
- [ ] 链接交互
- [ ] 分页功能
- [ ] 搜索高亮
- [ ] 注释功能

## 集成到EPUB阅读器

```javascript
// 集成示例
import { TransferEngine, CanvasRenderer } from './foliate-js/index.js';

class EpubReader {
    constructor(container) {
        this.canvas = document.createElement('canvas');
        container.appendChild(this.canvas);
        
        this.renderer = new CanvasRenderer({
            canvas: this.canvas,
            enableSelection: true,
            enableHighlight: true
        });
    }
    
    loadChapter(htmlContent) {
        this.renderer.render(htmlContent);
    }
    
    addBookmark(position) {
        // 添加书签逻辑
    }
    
    addHighlight(start, end, note) {
        this.renderer.addHighlight(start, end, {
            color: '#ffeb3b',
            note: note
        });
    }
}
```

## 技术特点

1. **模块化设计** - 布局引擎和渲染器分离，便于扩展
2. **高性能** - 使用Canvas原生渲染，支持大量文本
3. **跨平台** - 纯Web技术，支持所有现代浏览器
4. **可定制** - 丰富的配置选项和主题支持
5. **易集成** - 简单的API设计，易于集成到现有项目

## 浏览器兼容性

- Chrome 60+
- Firefox 55+
- Safari 12+
- Edge 79+

## 许可证

与foliate-js主项目保持一致的MIT许可证。 