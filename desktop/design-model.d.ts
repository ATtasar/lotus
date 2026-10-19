export interface DesignItem {
  kind?: 'text' | 'image';
  name: string;
  x: number;
  y: number;
  rotation: number;
  visible?: boolean;
  src?: string;
  scale?: number;
  text?: string;
  binding?: string;
  font?: string;
  color?: string;
  size?: number;
  width?: number;
  align?: string;
}
export interface Design {
  version: number;
  width: number;
  height: number;
  bg: string;
  backgroundImage: string;
  font: string;
  color: string;
  style: string;
  preset: string;
  selected: number;
  items: DesignItem[];
}
export const fonts: Record<string, [string, string]>;
export const bindings: Record<string, string>;
export function createDesign(kind: string, values?: Record<string, unknown>): Design;
export function prepareDesign(
  value?: Partial<Design>,
  kind?: string,
  values?: Record<string, unknown>,
): Design;
export function applyTextPreset(state: Design, preset: string): void;
export function validateDesign(
  state: unknown,
  safeImage: (value: unknown) => boolean,
  fail: (message: string) => void,
): void;
