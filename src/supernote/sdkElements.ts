/**
 * Loose types and small helpers for the element-level SDK calls the lasso
 * features use (docs/dev/technical-design-lasso-0.8.md §3.4, §3.8): reading
 * a lasso's strokes, building stroke copies for recognition, and the mark
 * icons. The SDK hands out plain objects (sn-plugin-lib model/Element.ts);
 * only the fields read or written here are typed.
 */
import {PluginCommAPI} from 'sn-plugin-lib';
import {logWarn} from '../utils/log';
import {PxPoint, PxRect} from '../domain/marks';

export const ELEMENT_TYPE_STROKE = 0;
export const ELEMENT_TYPE_GEO = 700;

/** Text box types (normal, digest quote, digest create). */
export function isTextBoxType(type: number): boolean {
  return type === 500 || type === 501 || type === 502;
}

export interface SdkResponse<T> {
  success: boolean;
  result?: T | null;
  error?: {code: number; message: string} | null;
}

export function errText(r: SdkResponse<unknown> | null | undefined, fallback: string): string {
  return r?.error ? `${r.error.code}: ${r.error.message}` : fallback;
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** The parts of the SDK's ElementDataAccessor used here. */
export interface Accessor<T> {
  size(): Promise<number>;
  getRange(start: number, count: number): Promise<T[]>;
  add(index: number, value: T): Promise<boolean>;
  setRange(index: number, endIndex: number, values: T[]): Promise<boolean>;
}

export interface SdkGeometry {
  type?: string;
  points?: PxPoint[];
  penColor?: number;
  penType?: number;
  penWidth?: number;
}

export interface SdkElement {
  uuid: string;
  type: number;
  numInPage: number;
  pageNum?: number;
  layerNum?: number;
  thickness?: number;
  userData?: string | null;
  textBox?: {textContentFull?: string | null; textRect?: PxRect | null} | null;
  stroke?: {
    penColor?: number;
    penType?: number;
    points?: Accessor<PxPoint>;
    pressures?: Accessor<number>;
  } | null;
  geometry?: SdkGeometry | null;
}

/** Frees the host's element cache entries (SDK memory rule). Never throws. */
export function recycleElements(elements: Array<{uuid?: string} | null | undefined>): void {
  for (const el of elements) {
    try {
      if (el?.uuid) PluginCommAPI.recycleElement(el.uuid);
    } catch (e) {
      logWarn('sdkElements: recycle failed', errorMessage(e));
    }
  }
}

/** Fills an empty accessor: one batch setRange first, else one add() per value. */
export async function fillAccessor<T>(acc: Accessor<T>, values: T[]): Promise<boolean> {
  if (values.length === 0) return true;
  try {
    const ok = await acc.setRange(0, values.length - 1, values);
    if (ok && (await acc.size()) === values.length) return true;
  } catch {
    // fall through to add()
  }
  let size = 0;
  try {
    size = await acc.size();
  } catch {
    size = 0;
  }
  if (size > values.length) return false;
  for (let i = size; i < values.length; i++) {
    if (!(await acc.add(i, values[i]))) return false;
  }
  return true;
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
