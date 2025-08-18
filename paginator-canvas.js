import { VirtualCanvasRenderer } from './x-canvas/virtual-canvas-renderer.js';
import { CanvasTools } from './x-canvas/canvas-tools.js';

const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
/**
 * @typedef {Promise<{index: number, src: string, anchor: () => number, onLoad: (detail: {doc: Document, index: number}) => void, select: boolean}>} SectionLoad
 */

const debounce = (f, wait, immediate) => {
    let timeout
    return (...args) => {
        const later = () => {
            timeout = null
            if (!immediate) f(...args)
        }
        const callNow = immediate && !timeout
        if (timeout) clearTimeout(timeout)
        timeout = setTimeout(later, wait)
        if (callNow) f(...args)
    }
}

const lerp = (min, max, x) => x * (max - min) + min
const easeOutQuad = x => 1 - (1 - x) * (1 - x)

/**
 * 用 requestAnimationFrame 实现动画
 * @param {number} a scrollLeft 或 scrollRight
 * @param {number} b offset
 * @param {number} duration
 * @param {Function} ease
 * @param {Function} render
 * @returns {void}
 */
const animate = (a, b, duration, ease, render) => new Promise(resolve => {
    let start
    const step = now => {
        start ??= now
        const fraction = Math.min(1, (now - start) / duration)
        render(lerp(a, b, ease(fraction)))
        if (fraction < 1) requestAnimationFrame(step)
        else resolve()
    }
    requestAnimationFrame(step)
})

// collapsed range doesn't return client rects sometimes (or always?)
// try make get a non-collapsed range or element
const uncollapse = range => {
    if (!range?.collapsed) return range
    const { endOffset, endContainer } = range
    if (endContainer.nodeType === 1) {
        const node = endContainer.childNodes[endOffset]
        if (node?.nodeType === 1) return node
        return endContainer
    }
    if (endOffset + 1 < endContainer.length) range.setEnd(endContainer, endOffset + 1)
    else if (endOffset > 1) range.setStart(endContainer, endOffset - 1)
    else return endContainer.parentNode
    return range
}

const makeRange = (doc, node, start, end = start) => {
    const range = doc.createRange()
    range.setStart(node, start)
    range.setEnd(node, end)
    return range
}

// use binary search to find an offset value in a text node
const bisectNode = (doc, node, cb, start = 0, end = node.nodeValue.length) => {
    if (end - start === 1) {
        const result = cb(makeRange(doc, node, start), makeRange(doc, node, end))
        return result < 0 ? start : end
    }
    const mid = Math.floor(start + (end - start) / 2)
    const result = cb(makeRange(doc, node, start, mid), makeRange(doc, node, mid, end))
    return result < 0 ? bisectNode(doc, node, cb, start, mid)
        : result > 0 ? bisectNode(doc, node, cb, mid, end) : mid
}

const { SHOW_ELEMENT, SHOW_TEXT, SHOW_CDATA_SECTION,
    FILTER_ACCEPT, FILTER_REJECT, FILTER_SKIP } = NodeFilter

const filter = SHOW_ELEMENT | SHOW_TEXT | SHOW_CDATA_SECTION

// needed cause there seems to be a bug in `getBoundingClientRect()` in Firefox
// where it fails to include rects that have zero width and non-zero height
// (CSSOM spec says "rectangles [...] of which the height or width is not zero")
// which makes the visible range include an extra space at column boundaries
const getBoundingClientRect = target => {
    let top = Infinity, right = -Infinity, left = Infinity, bottom = -Infinity
    for (const rect of target.getClientRects()) {
        left = Math.min(left, rect.left)
        top = Math.min(top, rect.top)
        right = Math.max(right, rect.right)
        bottom = Math.max(bottom, rect.bottom)
    }
    return new DOMRect(left, top, right - left, bottom - top)
}

const getVisibleRange = (doc, start, end, mapRect) => {
    // first get all visible nodes
    const acceptNode = node => {
        const name = node.localName?.toLowerCase()
        // ignore all scripts, styles, and their children
        if (name === 'script' || name === 'style') return FILTER_REJECT
        if (node.nodeType === 1) {
            const { left, right } = mapRect(node.getBoundingClientRect())
            // no need to check child nodes if it's completely out of view
            if (right < start || left > end) return FILTER_REJECT
            // elements must be completely in view to be considered visible
            // because you can't specify offsets for elements
            if (left >= start && right <= end) return FILTER_ACCEPT
            // TODO: it should probably allow elements that do not contain text
            // because they can exceed the whole viewport in both directions
            // especially in scrolled mode
        } else {
            // ignore empty text nodes
            if (!node.nodeValue?.trim()) return FILTER_SKIP
            // create range to get rect
            const range = doc.createRange()
            range.selectNodeContents(node)
            const { left, right } = mapRect(range.getBoundingClientRect())
            // it's visible if any part of it is in view
            if (right >= start && left <= end) return FILTER_ACCEPT
        }
        return FILTER_SKIP
    }
    const walker = doc.createTreeWalker(doc.body, filter, { acceptNode })
    const nodes = []
    for (let node = walker.nextNode(); node; node = walker.nextNode())
        nodes.push(node)

    // we're only interested in the first and last visible nodes
    const from = nodes[0] ?? doc.body
    const to = nodes[nodes.length - 1] ?? from

    // find the offset at which visibility changes
    const startOffset = from.nodeType === 1 ? 0
        : bisectNode(doc, from, (a, b) => {
            const p = mapRect(getBoundingClientRect(a))
            const q = mapRect(getBoundingClientRect(b))
            if (p.right < start && q.left > start) return 0
            return q.left > start ? -1 : 1
        })
    const endOffset = to.nodeType === 1 ? 0
        : bisectNode(doc, to, (a, b) => {
            const p = mapRect(getBoundingClientRect(a))
            const q = mapRect(getBoundingClientRect(b))
            if (p.right < end && q.left > end) return 0
            return q.left > end ? -1 : 1
        })

    const range = doc.createRange()
    range.setStart(from, startOffset)
    range.setEnd(to, endOffset)
    return range
}

const selectionIsBackward = sel => {
    const range = document.createRange()
    range.setStart(sel.anchorNode, sel.anchorOffset)
    range.setEnd(sel.focusNode, sel.focusOffset)
    return range.collapsed
}

const setSelectionTo = (target, collapse) => {
    let range
    if (target.startContainer) range = target.cloneRange()
    else if (target.nodeType) {
        range = document.createRange()
        range.selectNode(target)
    }
    if (range) {
        const sel = range.startContainer.ownerDocument.defaultView.getSelection()
        if (sel) {
            sel.removeAllRanges()
            if (collapse === -1) range.collapse(true)
            else if (collapse === 1) range.collapse()
            sel.addRange(range)
        }
    }
}

const getDirection = doc => {
    const { defaultView } = doc
    const { writingMode, direction } = defaultView.getComputedStyle(doc.body)
    const vertical = writingMode === 'vertical-rl'
        || writingMode === 'vertical-lr'
    const rtl = doc.body.dir === 'rtl'
        || direction === 'rtl'
        || doc.documentElement.dir === 'rtl'
    return { vertical, rtl }
}

const getBackground = doc => {
    const bodyStyle = doc.defaultView.getComputedStyle(doc.body)
    return bodyStyle.backgroundColor === 'rgba(0, 0, 0, 0)'
        && bodyStyle.backgroundImage === 'none'
        ? doc.defaultView.getComputedStyle(doc.documentElement).background
        : bodyStyle.background
}

const makeMarginals = (length, part) => Array.from({ length }, () => {
    const div = document.createElement('div')
    const child = document.createElement('div')
    div.append(child)
    child.setAttribute('part', part)
    return div
})

const setStylesImportant = (el, styles) => {
    const { style } = el
    for (const [k, v] of Object.entries(styles)) style.setProperty(k, v, 'important')
}

class CanvasView {
    #observer = new ResizeObserver(() => this.expand())
    // NOTE: 宽度等于屏幕宽度，固定
    #element = document.createElement('div')
    // NOTE: book 内容的完整宽度，用 css 多列布局
    #iframe = document.createElement('iframe')
    #contentRange = document.createRange()
    #overlayer
    #vertical = false
    #rtl = false
    #column = true
    #size
    #layout = {}
    canvasTools = null;
    renderer = null;
    constructor({ container, mountPoint }) {
        this.container = container

    }

    /**
     * 
     * @param {string} src 是 zipLoader 提供的 blob 链接
     * @param {Function} afterLoad 
     * @param {Function} beforeRender 
     * @returns {Promise<void>}
     */
    async load(src, afterLoad, beforeRender) {
        if (typeof src !== 'string') throw new Error(`${src} is not string`)
        const currentHTML = await fetch(src).then(res => res.text())
        this.renderer.render(currentHTML);
    }
    render(layout) {
        if (!layout) return
        this.#column = layout.flow !== 'scrolled'
        this.#layout = layout
    }

    set overlayer(overlayer) {
        this.#overlayer = overlayer
        this.#element.append(overlayer.element)
    }
    get overlayer() {
        return this.#overlayer
    }
    destroy() {
        // if (this.document) this.#observer.unobserve(this.document.body)
    }
}

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
    #observer = new ResizeObserver(() => this.render())
    #top
    #background
    #container
    #header
    #footer
    /**
     * @type {CanvasView}
     */
    #view
    /**
     * NOTE: 是否垂直书写
     */
    #vertical = false
    #rtl = false
    #margin = 0
    /**
     * 索引，类似目录，页码，但又像章节
     */
    #index = -1
    #anchor = 0 // anchor view to a fraction (0-1), Range, or Element
    #justAnchored = false
    locked = false // while true, prevent any further navigation
    #styles
    #styleMap = new WeakMap()
    #mediaQuery = matchMedia('(prefers-color-scheme: dark)')
    #mediaQueryListener
    /**
     * @type {Array}
     * [offset, a, b]
     * offset 当前页码的偏移量
     * a aStart，0 或 size
     * b aEnd，0 或 size
     */
    #scrollBounds
    #touchState
    #touchScrolled
    /**
     * 上拉
     */
    #isPullUp = true
    #lastVisibleRange
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
    #createView() {
        const mountPoint = this.#root.getElementById('renderCanvas')
        this.mountPoint = mountPoint

        this.renderer = new VirtualCanvasRenderer({
            mountPoint: container,
            mode: 'horizontal',
            // mode: 'vertical',
            theme: {
              backgroundColor: '#fff',
              textColor: '#222',
              selectionColor: '#007aff',
              selectionOpacity: 0.2,
              highlightColor: '#ffeb3b',
              highlightOpacity: 0.3,
            },
          });
          this.renderer.render(currentHTML); // TODO: currentHTML 定义
          this.canvasTools = new CanvasTools(this.renderer);
        return this.renderer
    }

    render() {
        if (!this.#view) return
        this.#view.render()
        this.#scrollToAnchor(this.#anchor)
    }
    /**
     * 是否是垂直滚动布局
     */
    get scrolled() {
        return this.getAttribute('flow') === 'scrolled'
    }
    get scrollProp() {
        const { scrolled } = this
        return this.#vertical ? (scrolled ? 'scrollLeft' : 'scrollTop')
            : scrolled ? 'scrollTop' : 'scrollLeft'
    }
    /**
     * 滚动时判断用哪个边计算
     */
    get sideProp() {
        const { scrolled } = this
        return this.#vertical ? (scrolled ? 'width' : 'height')
            : scrolled ? 'height' : 'width'
    }

    scrollBy(dx, dy) {
        const delta = this.#vertical ? dy : dx
        const element = this.#container
        const { scrollProp } = this
        const [offset, a, b] = this.#scrollBounds
        const rtl = this.#rtl
        const min = rtl ? offset - b : offset - a
        const max = rtl ? offset + a : offset + b
        element[scrollProp] = Math.max(min, Math.min(max,
            element[scrollProp] + delta))
    }
    snap(vx, vy) {
        // 滑动速度
        const velocity = this.#vertical ? vy : vx
        const [offset, a, b] = this.#scrollBounds
        const { start, end, pages, size } = this
        // 上一页左边界偏移量
        const min = Math.abs(offset) - a
        // 下一页左边界偏移量
        const max = Math.abs(offset) + b
        // 这个 d 值似乎没有意义，可以理解为 d 值越大，加上当前页中间 offset 就会到下一页
        const d = velocity * (this.#rtl ? -size : size)
        // NOTE: 按 page 翻页
        const page = Math.floor(
            Math.max(min, Math.min(max, (start + end) / 2
                + (isNaN(d) ? 0 : d))) / size)

        this.#scrollToPage(page, 'snap').then(() => {
            const dir = page <= 0 ? -1 : page >= pages - 1 ? 1 : null
            // NOTE: 回到目录或首页，或跳到相邻的一章
            if (dir) return this.#goTo({
                index: this.#adjacentIndex(dir),
                anchor: dir < 0 ? () => 1 : () => 0,
            })
        })
    }
    #onTouchStart(e) {
        const touch = e.changedTouches[0]
        this.#touchState = {
            x: touch?.screenX,
            y: touch?.screenY,
            t: e.timeStamp,
            vx: 0,
            xy: 0,
        }
    }
    #onTouchMove(e) {
        if (this.locked) return
        const state = this.#touchState
        // NOTE: pinch 捏，双指缩放屏幕
        if (state.pinched) return
        state.pinched = globalThis.visualViewport.scale > 1
        if (e.touches.length > 1) {
            if (this.#touchScrolled) e.preventDefault()
                return
        }
        const touch = e.changedTouches[0]
        const x = touch.screenX
        const y = touch.screenY
        // NOTE: touch move 的距离和移动速度
        const dx = state.x - x
        const dy = state.y - y
        const dt = e.timeStamp - state.t
        state.x = x
        state.y = y
        state.t = e.timeStamp
        state.vx = dx / dt
        state.vy = dy / dt
        if (this.scrolled || state.pinched) {
            if (this.scrolled) {
                this.#isPullUp = dy > 0
            }
            return
        }
        e.preventDefault()
        this.#touchScrolled = true
        this.scrollBy(dx, dy)
    }
    #onTouchEnd() {
        this.#touchScrolled = false
        if (this.scrolled) {
            // NOTE: fraction 阅读进度，0.25 = 阅读到 25%
            // FIXME: 如果是滚动模式，无法滚动到下一章，左右滑动还能滑过来再加载展示，上下滚动无法连续展示
            const fraction = this.start / this.viewSize
            if (this.pages > 1) {
                if (fraction < 0.001 && !this.#isPullUp) {
                    this.prevSection()
                } else if (fraction > 0.999 && this.#isPullUp) {
                    this.nextSection()
                }
            } else {
                if (this.#isPullUp) {
                    this.nextSection()
                } else {
                    this.prevSection()
                }
            }
            return
        }

        // XXX: Firefox seems to report scale as 1... sometimes...?
        // at this point I'm basically throwing `requestAnimationFrame` at
        // anything that doesn't work
        requestAnimationFrame(() => {
            if (globalThis.visualViewport.scale === 1)
                this.snap(this.#touchState.vx, this.#touchState.vy)
        })
    }
    // allows one to process rects as if they were LTR and horizontal
    #getRectMapper() {
        if (this.scrolled) {
            const size = this.viewSize
            const margin = this.#margin
            return this.#vertical
                ? ({ left, right }) =>
                    ({ left: size - right - margin, right: size - left - margin })
                : ({ top, bottom }) => ({ left: top + margin, right: bottom + margin })
        }
        const pxSize = this.pages * this.size
        return this.#rtl
            ? ({ left, right }) =>
                ({ left: pxSize - right, right: pxSize - left })
            : this.#vertical
                ? ({ top, bottom }) => ({ left: top, right: bottom })
                : f => f
    }
    async #scrollToRect(rect, reason) {
        if (this.scrolled) {
            const offset = this.#getRectMapper()(rect).left - this.#margin
            return this.#scrollTo(offset, reason)
        }
        const offset = this.#getRectMapper()(rect).left
        return this.#scrollToPage(Math.floor(offset / this.size) + (this.#rtl ? -1 : 1), reason)
    }
    async #scrollTo(offset, reason, smooth) {
        const element = this.#container
        const { scrollProp, size } = this
        // TODO:
        if (element[scrollProp] === offset) {
            this.#scrollBounds = [offset, this.atStart ? 0 : size, this.atEnd ? 0 : size]
            this.#afterScroll(reason)
            return
        }
        // FIXME: vertical-rl only, not -lr
        if (this.scrolled && this.#vertical) offset = -offset
        if ((reason === 'snap' || smooth) && this.hasAttribute('animated')) return animate(
            element[scrollProp], offset, 300, easeOutQuad,
            x => element[scrollProp] = x,
        ).then(() => {
            this.#scrollBounds = [offset, this.atStart ? 0 : size, this.atEnd ? 0 : size]
            this.#afterScroll(reason)
        })
        else {
            element[scrollProp] = offset
            this.#scrollBounds = [offset, this.atStart ? 0 : size, this.atEnd ? 0 : size]
            this.#afterScroll(reason)
        }
    }
    async #scrollToPage(page, reason, smooth) {
        const offset = this.size * (this.#rtl ? -page : page)
        return this.#scrollTo(offset, reason, smooth)
    }

    /**
     * 跳到 dom
     * @param {Range} anchor 
     * @param {'selection' | 'navigation' | 'anchor' | 'highlight'} reason
     * @returns
     */
    async scrollToAnchor(anchor, reason) {
        return this.#scrollToAnchor(anchor, reason)
    }
    async #scrollToAnchor(anchor, reason = 'anchor') {
        this.#anchor = anchor
        const rects = uncollapse(anchor)?.getClientRects?.()
        // if anchor is an element or a range
        if (rects) {
            // when the start of the range is immediately after a hyphen in the
            // previous column, there is an extra zero width rect in that column
            const rect = Array.from(rects)
                .find(r => r.width > 0 && r.height > 0) || rects[0]
            if (!rect) return
            await this.#scrollToRect(rect, reason)
            return
        }
        // if anchor is a fraction
        if (this.scrolled) {
            await this.#scrollTo(anchor * this.viewSize, reason)
            return
        }
        const { pages } = this
        if (!pages) return
        const textPages = pages - 2
        const newPage = Math.round(anchor * (textPages - 1))
        await this.#scrollToPage(newPage + 1, reason)
    }
    #getVisibleRange() {
        if (this.scrolled) return getVisibleRange(this.#view.document,
            this.start + this.#margin, this.end - this.#margin, this.#getRectMapper())
        const size = this.#rtl ? -this.size : this.size
        return getVisibleRange(this.#view.document,
            this.start - size, this.end - size, this.#getRectMapper())
    }
    /**
     * 滚动后触发 relocate 事件
     * @param {'selection' | 'navigation' | 'anchor' | 'scroll'} reason
     */
    #afterScroll(reason) {
        const range = this.#getVisibleRange()
        this.#lastVisibleRange = range
        // don't set new anchor if relocation was to scroll to anchor
        if (reason !== 'selection' && reason !== 'navigation' && reason !== 'anchor' && reason !== 'highlight')
            this.#anchor = range
        else this.#justAnchored = true

        const index = this.#index
        const detail = { reason, range, index }
        // NOTE: fraction 阅读进度，0.25 = 阅读到 25%
        if (this.scrolled) detail.fraction = this.start / this.viewSize
        else if (this.pages > 0) {
            const { page, pages } = this
            this.#header.style.visibility = page > 1 ? 'visible' : 'hidden'
            detail.fraction = (page - 1) / (pages - 2)
            detail.size = 1 / (pages - 2)
        }
        this.dispatchEvent(new CustomEvent('relocate', { detail }))
    }
    /**
     * 
     * @param {SectionLoad} promise 
     * @returns
     */
    async #display(promise) {
        const { index, src, anchor, onLoad, select } = await promise
        this.#index = index
        if (src) {
            // NOTE: 创建 container 区域
            this.#createView()
            if (typeof src !== 'string') throw new Error(`${src} is not string`)
            const currentHTML = await fetch(src).then(res => res.text())
            this.renderer.render(currentHTML);
            this.dispatchEvent(new CustomEvent('create-overlayer', {
                detail: {
                    doc: view.document, index,
                    attach: overlayer => view.overlayer = overlayer,
                },
            }))
        }
        // await this.scrollToAnchor((typeof anchor === 'function'
        //     ? anchor(this.renderer.document) : anchor) ?? 0, select ? 'selection' : 'navigation')
    }
    #canGoToIndex(index) {
        return index >= 0 && index <= this.sections.length - 1
    }
    async #goTo({ index, anchor, select }) {
        if (index === this.#index) await this.#display({ index, anchor, select })
        else {
            const oldIndex = this.#index
            const onLoad = detail => {
                this.sections[oldIndex]?.unload?.()
                this.setStyles(this.#styles)
                this.dispatchEvent(new CustomEvent('load', { detail }))
            }
            await this.#display(Promise.resolve(this.sections[index].load())
                .then(src => ({ index, src, anchor, onLoad, select }))
                .catch(e => {
                    console.warn(e)
                    console.warn(new Error(`Failed to load section ${index}`))
                    return {}
                }))
        }
    }
    async goTo(target) {
        if (this.locked) return
        const resolved = await target
        if (this.#canGoToIndex(resolved.index)) return this.#goTo(resolved)
    }
    #scrollPrev(distance) {
        if (!this.#view) return true
        if (this.scrolled) {
            if (this.start > 0) return this.#scrollTo(
                Math.max(0, this.start - (distance ?? this.size)), null, true)
            return true
        }
        if (this.atStart) return
        const page = this.page - 1
        return this.#scrollToPage(page, 'page', true).then(() => page <= 0)
    }
    #scrollNext(distance) {
        if (!this.#view) return true
        if (this.scrolled) {
            if (this.viewSize - this.end > 2) return this.#scrollTo(
                Math.min(this.viewSize, distance ? this.start + distance : this.end), null, true)
            return true
        }
        if (this.atEnd) return
        const page = this.page + 1
        const pages = this.pages
        return this.#scrollToPage(page, 'page', true).then(() => page >= pages - 1)
    }
    get atStart() {
        return this.#adjacentIndex(-1) == null && this.page <= 1
    }
    get atEnd() {
        return this.#adjacentIndex(1) == null && this.page >= this.pages - 2
    }
    /**
     * adjacent 相邻的章节
     * @param {number} dir
     * @returns
     */
    #adjacentIndex(dir) {
        for (let index = this.#index + dir; this.#canGoToIndex(index); index += dir)
            if (this.sections[index]?.linear !== 'no') return index
    }
    async #turnPage(dir, distance) {
        if (this.locked) return
        this.locked = true
        const prev = dir === -1
        const shouldGo = await (prev ? this.#scrollPrev(distance) : this.#scrollNext(distance))
        if (shouldGo) await this.#goTo({
            index: this.#adjacentIndex(dir),
            anchor: prev ? () => 1 : () => 0,
        })
        if (shouldGo || !this.hasAttribute('animated')) await wait(100)
        this.locked = false
    }
    /**
     * 上一页
     * @param {*} distance 
     * @returns 
     */
    prev(distance) {
        return this.#turnPage(-1, distance)
    }
    /**
     * 下一页
     * @param {*} distance 
     * @returns 
     */
    next(distance) {
        return this.#turnPage(1, distance)
    }
    prevSection() {
        return this.goTo({ index: this.#adjacentIndex(-1) })
    }
    nextSection() {
        return this.goTo({ index: this.#adjacentIndex(1) })
    }
    firstSection() {
        const index = this.sections.findIndex(section => section.linear !== 'no')
        return this.goTo({ index })
    }
    lastSection() {
        const index = this.sections.findLastIndex(section => section.linear !== 'no')
        return this.goTo({ index })
    }
    /**
     * 获取 paginator 的一些私有属性
     */
    getContents() {
        if (this.#view) return [{
            index: this.#index,
            overlayer: this.#view.overlayer,
            doc: this.#view.document,
        }]
        return []
    }
    setStyles(styles) {
        this.#styles = styles
        const $$styles = this.#styleMap.get(this.#view?.document)
        if (!$$styles) return
        const [$beforeStyle, $style] = $$styles
        if (Array.isArray(styles)) {
            const [beforeStyle, style] = styles
            $beforeStyle.textContent = beforeStyle
            $style.textContent = style
        } else $style.textContent = styles
    }
    destroy() {
        this.#view.destroy()
        this.#view = null
    }
}

customElements.define('foliate-paginator', Paginator)
