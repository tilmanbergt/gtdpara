/**
 * Lets the touch test's rows report their press events (Settings → Advanced
 * → Touch test). Only the test view provides a probe; everywhere else the
 * context is null, the helpers return no handlers and the rows behave
 * exactly as without them.
 *
 * Handlers go only onto elements that already have their own `onPress`:
 * `onPressIn`/`onPressOut`/`onResponderTerminate` don't make a `<Text>`
 * pressable, so the hit areas under test stay as they are.
 */
import {createContext, useContext} from 'react';
import {OutcomeKind} from '../../domain/touchDiag';

export type TouchProbe = (kind: OutcomeKind, target: string, inert?: boolean) => void;

export const TouchProbeContext = createContext<TouchProbe | null>(null);

export function useTouchProbe(): TouchProbe | null {
  return useContext(TouchProbeContext);
}

interface ProbeHandlers {
  onPressIn?: () => void;
  onPressOut?: () => void;
}

/** pressIn/pressOut reporters for a `Pressable`; empty without a probe. */
export function probePressable(probe: TouchProbe | null, target: string): ProbeHandlers {
  if (!probe) return {};
  return {onPressIn: () => probe('pressIn', target), onPressOut: () => probe('pressOut', target)};
}

/** The same for a nested `<Text onPress>` span, which also reports losing the responder. */
export function probeSpan(probe: TouchProbe | null, target: string): ProbeHandlers & {onResponderTerminate?: () => void} {
  if (!probe) return {};
  return {...probePressable(probe, target), onResponderTerminate: () => probe('responderTerminate', target)};
}
