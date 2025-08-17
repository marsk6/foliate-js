// import { VirtualCanvasRenderer } from './virtual-canvas-renderer-01.js';
import { VirtualCanvasRenderer } from './virtual-canvas-renderer.js';
import { CanvasTools } from './canvas-tools.js';
/**
 * @type {VirtualCanvasRenderer}
 */
let renderer;
// 初始化
window.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('renderCanvas');

  renderer = new VirtualCanvasRenderer({
    mountPoint: container,
    // mode: 'horizontal',
    mode: 'vertical',
    theme: {
      backgroundColor: '#fff',
      textColor: '#222',
      selectionColor: '#007aff',
      selectionOpacity: 0.2,
      highlightColor: '#ffeb3b',
      highlightOpacity: 0.3,
    },
  });
  renderer.render(currentHTML); // 初始渲染
  const canvasTools = new CanvasTools(renderer);
});
