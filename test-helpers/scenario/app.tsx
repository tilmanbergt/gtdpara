/**
 * Drives the real App on the fake device (docs/dev/history/technical-design-quality-hardening.md
 * §4.3): open it, tap what the user sees, type into fields by their placeholder,
 * read the status line. Queries go by visible text, so scenarios use the labels
 * the user sees.
 */
import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {act, configure, fireEvent, render, screen} from '@testing-library/react-native';
import App from '../../App';
import {DEFAULT_SETTINGS, GtdParaSettings} from '../../src/domain/settings';
import {BUILD_INFO} from '../../src/generated/buildInfo';
import {device} from '../fakeDevice/device';

const SETTINGS_KEY = 'gtdpara:settings:v1';

// Kept tabs stay mounted with display: none; queries see only what the user sees.
configure({defaultIncludeHiddenElements: false});

let mounted: ReturnType<typeof render> | null = null;

/**
 * Nothing measures in a test, so every view that asks for its size gets one the
 * size of the A5 X screen's content area once: paged lists then show what fits
 * a tall page. Whether rows really fit is checked on the device.
 */
const LAYOUT = {x: 0, y: 0, width: 1340, height: 1500};
const laidOut = new WeakSet<object>();

function layoutPass(): boolean {
  if (!mounted) return false;
  let fired = false;
  for (const node of screen.UNSAFE_root.findAll(n => typeof n.props.onLayout === 'function', {deep: true})) {
    if (laidOut.has(node.props.onLayout)) continue;
    laidOut.add(node.props.onLayout);
    fireEvent(node, 'layout', {nativeEvent: {layout: LAYOUT}});
    fired = true;
  }
  return fired;
}

/** Lets every pending promise and timer chain run (loading, cache refresh, writes) and lays out new views. */
export async function settle(rounds = 8): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    if (layoutPass()) i = Math.max(0, i - 1);
  }
}

/** Stores the settings the app will load; unset fields are the defaults. The What's-new notice is acknowledged. */
export async function storeSettings(patch: Partial<GtdParaSettings> = {}): Promise<void> {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({...DEFAULT_SETTINGS, lastSeenVersion: BUILD_INFO.version, ...patch}));
}

/** Opens gtdpara, as from the sidebar button; `fromNote` is the note it was opened from. */
export async function openApp(options: {fromNote?: string; settings?: Partial<GtdParaSettings>} = {}): Promise<void> {
  if (!(await AsyncStorage.getItem(SETTINGS_KEY)) || options.settings) await storeSettings(options.settings);
  device().sdk.currentFile = options.fromNote ?? null;
  mounted = render(<App />);
  await settle();
}

/** Closes gtdpara (unmount); the files stay. */
export async function closeApp(): Promise<void> {
  if (!mounted) return;
  mounted.unmount();
  mounted = null;
  // Let debounced work (e-ink refresh requests) finish while the test environment still exists.
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 400));
  });
}

/** Closes and opens gtdpara again, as the host does. */
export async function reopenApp(options: {fromNote?: string} = {}): Promise<void> {
  await closeApp();
  await openApp(options);
}

/** Every text on screen, in order. */
export function texts(): string[] {
  return screen
    .queryAllByText(/./)
    .map(t => [t.props.children].flat(Infinity).filter(c => typeof c === 'string' || typeof c === 'number').join(''));
}

/** The visible texts joined, for failure messages and while writing a scenario. */
export function describeScreen(): string {
  return texts()
    .filter(t => t.trim())
    .slice(0, 80)
    .join(' | ');
}

/** Taps the `nth` element showing exactly `label` (a button, a row, a tab). */
export async function tap(label: string | RegExp, nth = 0): Promise<void> {
  const found = screen.queryAllByText(label);
  if (found.length <= nth) throw new Error(`nothing to tap with text ${String(label)}; the screen shows: ${describeScreen()}`);
  fireEvent.press(found[nth]);
  await settle();
}

/** Taps a tab in the tab bar (drawn first on screen; a tab may carry a badge, like "Review ●"). */
export async function tapTab(label: string): Promise<void> {
  await tap(new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`));
}

/** Types into the field showing `placeholder` (replaces its text, like handwriting into it). */
export async function type(placeholder: string, text: string): Promise<void> {
  const field = screen.queryAllByPlaceholderText(placeholder)[0];
  if (!field) throw new Error(`no field "${placeholder}"; the screen shows: ${describeScreen()}`);
  fireEvent.changeText(field, text);
  await settle(2);
}

/** Whether `text` is on screen (exact text, or a pattern). */
export function shows(text: string | RegExp): boolean {
  return screen.queryAllByText(text).length > 0;
}

export function expectShows(text: string | RegExp): void {
  if (!shows(text)) throw new Error(`expected the screen to show ${String(text)}; it shows: ${describeScreen()}`);
}

export function expectNotShows(text: string | RegExp): void {
  if (shows(text)) throw new Error(`expected the screen not to show ${String(text)}`);
}

/** The text in the visible field showing `placeholder`. */
export function fieldValue(placeholder: string): string | undefined {
  return screen.queryAllByPlaceholderText(placeholder)[0]?.props.value;
}

/**
 * Which "☐" belongs to the row showing `rowText`: rows draw their checkbox
 * before their text, so it is the last "☐" before that text on screen.
 */
export function firstCheckboxOf(rowText: string): number {
  const all = texts();
  const at = all.indexOf(rowText);
  if (at < 0) throw new Error(`no row "${rowText}"; the screen shows: ${describeScreen()}`);
  return all.slice(0, at).filter(t => t === '☐').length - 1;
}
