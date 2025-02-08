import { Overlayer } from './overlayer'

export declare class FoliatePaginatorElement extends HTMLElement {
  getContents: () => Array<{
    index: number;
    overlayer: Overlayer;
    /**
     * iframe contentDocument
     */
    doc: Document;
  }>;
}