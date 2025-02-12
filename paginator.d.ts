import { Overlayer } from './overlayer'

export declare interface FoliatePaginatorElement extends HTMLElement {
  #margin: string;
  getContents: () => Array<{
    index: number;
    overlayer: Overlayer;
    /**
     * iframe contentDocument
     */
    doc: Document;
  }>;
}
