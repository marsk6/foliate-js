import { MultiChapterManager } from './x-canvas/multi-chapter-manager.js';



// NOTE: everything here assumes the so-called "negative scroll type" for RTL
// NOTE: 整体的布局 header（标题） container（book） footer（进度）

/**
 * @import { FoliatePaginatorElement } from './paginator'
 */

/**
 * @implements {FoliatePaginatorElement}
 */
export class Paginator extends HTMLElement {
    static observedAttributes = [
        'flow', 'gap', 'margin',
        'max-inline-size', 'max-block-size', 'max-column-count',
    ]
    #root = this.attachShadow({ mode: 'open' })
    /**
     * @type {CanvasView}
     */
    #view
    locked = false // while true, prevent any further navigation
    /**
     * 书的章节，或者说目录
     * @typedef {{id: string, load: () => Promise<SectionLoad>, createDocument: () => Promise<Document>, size: number, linear: string, cfi: string}} EPUBSection
     * @type {Array<EPUBSection>}
     */
    sections = []
    constructor() {
        super()
        this.#root.innerHTML = `<style>
        * {
            box-sizing: border-box;
        }
        :host {
            font-family: system-ui, sans-serif;
            background: #f8f8f8;
            -webkit-user-select: none; /* 禁止选中文本 */
            -webkit-touch-callout: none; /* 禁止长按弹出菜单 */
            touch-action: manipulation; /* 禁止双指缩放、双击放大等 */
            user-select: none;
            height: 100vh;
            margin: 0;
        }
        .canvas-wrap {
            position: relative;
            -webkit-user-select: none;
            user-select: none;
        }
        #renderCanvas {
            width: 100%;
            height: 100%;
        }
        .anchor {
            position: absolute;
            z-index: 10;
            pointer-events: auto;
            background: none;
            border: none;
            display: none;
        }
        .anchor-inner {
            position: relative;
            display: flex;
            flex-direction: column;
            align-items: center;
            height: 100%;
        }
        .anchor-line {
            width: 3px;
            height: 100%;
            background: #007aff;
        }
        .anchor-dot {
            position: absolute;
            width: 10px;
            height: 10px;
            background: #007aff;
            border-radius: 10px;
        }

        #startAnchor .anchor-dot {
            top: -10px;
        }

        #endAnchor .anchor-dot {
            bottom: -10px;
        }

        .highlight-bar {
            position: absolute;
            background: #007aff;
            opacity: 0.2;
            pointer-events: none;
        }
        .highlight-layer {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            z-index: 2;
        }

        </style>
        <div class="canvas-wrap">
            <div id="renderCanvas"></div>
        </div>
        `
    }

    open(book) {
        this.bookDir = book.dir
        this.sections = book.sections
        book.transformTarget?.addEventListener('data', ({ detail }) => {
            if (detail.type !== 'text/css') return
            const w = innerWidth
            const h = innerHeight
            detail.data = Promise.resolve(detail.data).then(data => data
                // unprefix as most of the props are (only) supported unprefixed
                .replace(/(?<=[{\s;])-epub-/gi, '')
                // replace vw and vh as they cause problems with layout
                .replace(/(\d*\.?\d+)vw/gi, (_, d) => parseFloat(d) * w / 100 + 'px')
                .replace(/(\d*\.?\d+)vh/gi, (_, d) => parseFloat(d) * h / 100 + 'px')
                // `page-break-*` unsupported in columns; replace with `column-break-*`
                .replace(/page-break-(after|before|inside)\s*:/gi, (_, x) =>
                    `-webkit-column-break-${x}:`)
                .replace(/break-(after|before|inside)\s*:\s*(avoid-)?page/gi, (_, x, y) =>
                    `break-${x}: ${y ?? ''}column`))
        })
    }

    render() {

    }
    next() {
        const el = this.#root.getElementById('renderCanvas')
        const chapterManager = new MultiChapterManager({
            el,
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
        const chapters = this.sections.map((section, index) => {
            return {
                index,
                loadContent: async () => {
                    const src = await section.load();
                    const currentHTML = await fetch(src).then(res => res.text())
                    return currentHTML;
                },
            }
        });
        chapterManager.addBook(chapters);
        chapterManager.startRead(2, 0.4);
        return chapterManager;
    }

    destroy() {
    }
}

customElements.define('foliate-paginator', Paginator)
