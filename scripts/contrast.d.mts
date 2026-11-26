export function readColour(css: string, name: string): string;
export function readThemeCss(path: string | URL): string;
export function luminance(hex: string): number;
export function contrastRatio(a: string, b: string): number;
export function blend(fg: string, bg: string, alpha: number): string;
