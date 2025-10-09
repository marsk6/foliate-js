export interface EPUBConstructorOptions {
    loadText: (uri: string) => Promise<string>
    loadBlob: (uri: string) => Promise<Blob>
    getSize: (uri: string) => number | Promise<number>
    sha1?: (str: string) => Promise<Uint8Array>
}

export interface LanguageMap {
    [lang: string]: string
}

export interface Contributor {
    name: string | LanguageMap
    sortAs?: string | LanguageMap
    role?: string[]
    code?: string
    scheme?: string
}

export interface Collection {
    name: string | LanguageMap
    position?: number | string
}

export interface BelongsTo {
    collection?: Collection | Collection[]
    series?: Collection | Collection[]
}

export interface Metadata {
    identifier?: string
    title?: string | LanguageMap
    sortAs?: string | LanguageMap
    subtitle?: string
    language?: string[]
    description?: string
    publisher?: Contributor
    published?: string
    modified?: string
    subject?: Contributor[]
    belongsTo?: BelongsTo
    altIdentifier?: string | Array<string | { scheme: string; value: string }>
    source?: string | Array<string | { scheme: string; value: string }>
    rights?: string
    author?: Contributor[]
    translator?: Contributor[]
    editor?: Contributor[]
    illustrator?: Contributor[]
    artist?: Contributor[]
    colorist?: Contributor[]
    narrator?: Contributor[]
    contributor?: Contributor[]
}

export interface Rendition {
    layout?: string
    orientation?: string
    spread?: string
    viewport?: string
    flow?: string
}

export interface Media {
    duration?: number
    narrator?: string
    activeClass?: string
    playbackActiveClass?: string
}

export interface ManifestItem {
    href: string
    id: string
    mediaType: string
    properties?: string[]
    mediaOverlay?: string
}

export interface SpineItem {
    idref: string
    id?: string
    linear?: string
    properties?: string[]
}

export interface Section {
    id: string
    load: () => Promise<string>
    unload: () => void
    createDocument: () => Promise<Document>
    size: number | Promise<number>
    cfi: string
    linear?: string
    pageSpread?: 'left' | 'right' | 'center'
    resolveHref: (href: string) => string
    mediaOverlay?: ManifestItem | null
}

export interface TOCItem {
    label: string
    href?: string
    subitems?: TOCItem[]
    type?: string[]
}

export interface NavList {
    label: string
    type?: string[]
    list: TOCItem[]
}

export interface GuideItem {
    label: string
    type: string[]
    href: string
}

export interface ResolvedCFI {
    index: number
    anchor: (doc: Document) => Range | number
}

export interface ResolvedHref {
    index: number
    anchor: (doc: Document) => Element | number
}

export class Resources {
    opf: Document
    manifest: ManifestItem[]
    manifestById: Map<string, ManifestItem>
    spine: SpineItem[]
    pageProgressionDirection?: string
    navPath?: string
    ncxPath?: string
    guide?: GuideItem[]
    cover?: ManifestItem
    cfis: string[]
    
    getItemByID(id: string): ManifestItem | undefined
    getItemByHref(href: string): ManifestItem | undefined
    getItemByProperty(prop: string): ManifestItem | undefined
    resolveCFI(cfi: string): ResolvedCFI
}

export class Loader {
    allowScript: boolean
    eventTarget: EventTarget
    manifest: ManifestItem[]
    assets: ManifestItem[]
    
    loadItem(item: ManifestItem, parents?: string[]): Promise<string | null>
    unloadItem(item: ManifestItem): void
    destroy(): void
}

export class MediaOverlay extends EventTarget {
    book: EPUB
    
    constructor(book: EPUB, loadXML: (uri: string) => Promise<Document>)
    
    start(sectionIndex: number, filter?: (item: any, index: number, items: any[]) => boolean): Promise<void>
    pause(): void
    resume(): void
    stop(): void
    prev(): void
    next(): void
    setVolume(volume: number): void
    setRate(rate: number): void
}

export class EPUB {
    parser: DOMParser
    loadText: (uri: string) => Promise<string>
    loadBlob: (uri: string) => Promise<Blob>
    getSize: (uri: string) => number | Promise<number>
    
    resources: Resources
    transformTarget: EventTarget
    sections: Section[]
    toc?: TOCItem[]
    pageList?: TOCItem[]
    landmarks?: TOCItem[] | GuideItem[]
    metadata: Metadata
    rendition: Rendition
    media: Media
    dir?: string
    
    constructor(options: EPUBConstructorOptions)
    
    init(): Promise<this>
    loadDocument(item: ManifestItem): Promise<Document>
    getMediaOverlay(): MediaOverlay
    resolveCFI(cfi: string): ResolvedCFI
    resolveHref(href: string): ResolvedHref | null
    splitTOCHref(href: string): string[]
    getTOCFragment(doc: Document, id: string): Element | null
    isExternal(uri: string): boolean
    getCover(): Promise<Blob | null>
    getCalibreBookmarks(): Promise<any>
    destroy(): void
}

