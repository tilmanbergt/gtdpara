/**
 * Lets the touch test's rows report their press events and show what was
 * hit (Settings → Advanced → Touch test). The test view wraps each sample
 * row in a TouchProbeContext provider bound to that row; everywhere else the
 * context is null, the helpers return no handlers and no highlight, and the
 * rows behave and look exactly as without them.
 *
 * - Parts are named the same everywhere: `checkbox`, `title`, `tag:<n>` (the
 *   n-th tag in the title, from 1), `label:<kind>`, `noteIcon`, `clip`,
 *   `rowBody` (a meeting's main area).
 * - Handlers go only onto elements that already have their own `onPress`:
 *   `onPressIn`/`onPressOut`/`onResponderTerminate` don't make a `<Text>`
 *   pressable, so the hit areas under test stay as they are.
 * - The hit part is drawn without moving anything: `HitFrame` is an
 *   absolutely placed border inside a `Pressable`, a span gets
 *   HIT_SPAN_STYLE (filled black, white bold text, no padding).
 */
import {createContext, useContext} from 'react';
import {TextStyle} from 'react-native';
import {OutcomeKind} from '../../domain/touchDiag';
import {COLORS} from '../theme';

export interface TouchProbe {
  /** `inert`: a press on a part that does nothing on its own (a single tap on `#next`). */
  report: (kind: OutcomeKind, part: string, inert?: boolean) => void;
  /** The part of this row the last touch hit, or null. */
  hit: string | null;
}

export const TouchProbeContext = createContext<TouchProbe | null>(null);

export function useTouchProbe(): TouchProbe | null {
  return useContext(TouchProbeContext);
}

export function isHit(probe: TouchProbe | null, part: string): boolean {
  return probe !== null && probe.hit === part;
}

interface ProbeHandlers {
  onPressIn?: () => void;
  onPressOut?: () => void;
}

/** pressIn/pressOut reporters for a `Pressable`; empty without a probe. */
export function probePressable(probe: TouchProbe | null, part: string): ProbeHandlers {
  if (!probe) return {};
  return {onPressIn: () => probe.report('pressIn', part), onPressOut: () => probe.report('pressOut', part)};
}

/** The same for a nested `<Text onPress>` span, which also reports losing the responder. */
export function probeSpan(probe: TouchProbe | null, part: string): ProbeHandlers & {onResponderTerminate?: () => void} {
  if (!probe) return {};
  return {...probePressable(probe, part), onResponderTerminate: () => probe.report('responderTerminate', part)};
}

/** A hit span: a black box with white bold text. No padding, so the text doesn't move. */
export const HIT_SPAN_STYLE: TextStyle = {backgroundColor: COLORS.accent, color: COLORS.accentText, fontWeight: '700'};
