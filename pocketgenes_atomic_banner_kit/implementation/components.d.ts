export interface AtomicGraphicOptions {
  color?: string;
}
export interface AtomicPartOptions extends AtomicGraphicOptions {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  zIndex?: number;
  opacity?: number;
  rotation?: number;
  position?: 'absolute' | 'relative' | 'static';
}
declare global {
  interface Window {
    createAtomicGraphic: (id: string, options?: AtomicGraphicOptions) => SVGSVGElement;
    mountAtomicPart: (parent: Element | string, id: string, options?: AtomicPartOptions) => HTMLElement;
  }
}
