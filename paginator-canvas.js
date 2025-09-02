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
        this.#root.innerHTML = `
        <link rel="stylesheet" href="http://localhost:5173/styles.css">
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
        const sections = [
            {
                load: async () => {
                    return "http://localhost:5173/1.html";
                }
            }
        ]
        const chapters = sections.map((section, index) => {
            return {
                index,
                loadContent: async () => {
                    const src = await section.load();
                    return src;
                    // const currentHTML = await fetch(src).then(res => res.text())
                    // return currentHTML;
                },
            }
        });
        chapterManager.addBook(chapters);
        chapterManager.startRead(0, 0);
        window.native.chapterManager = chapterManager;
        return chapterManager;
    }

    destroy() {
    }
}

customElements.define('foliate-paginator', Paginator)
