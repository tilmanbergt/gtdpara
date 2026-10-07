/**
 * A todo row's labels (`#next`, `#now`, `#w/f Meier`, `#someday`, `#due 5.10.`)
 * as nested text spans after the title - docs/dev/technical-design-waiting-
 * for-0.7.md §3.3. Must be rendered inside the row's title <Text>: spans in
 * one text flow wrap and clamp together with the title, so a label can never
 * end up on a line below the row (the 0.6.0 "waiting for text doesn't fit"
 * bug, where badges were separate boxes in a wrapping flex line).
 *
 * Fixed text, no tap-to-reveal. Set apart from the title by a smaller,
 * bolder font, not by color (grayscale rule). Only the `#next`/`#now` label
 * reacts to touch, and only when `onToggleNow` is passed: two taps within
 * DOUBLE_TAP_MS flip `#now` (docs/dev/history/technical-design-now-focus-mode.md §3).
 * A single tap on it does nothing. Taps on other labels go to the row
 * (start editing), since they have no onPress of their own.
 */
import React, {useRef} from 'react';
import {StyleSheet, Text} from 'react-native';
import {TaskLabel} from '../domain/taskLabels';
import {LABEL_GAP} from './taskRowLayout';
import {FONT} from './theme';

const DOUBLE_TAP_MS = 350;

interface Props {
  labels: TaskLabel[];
  onToggleNow?: () => void;
}

export default function TaskLabels({labels, onToggleNow}: Props): React.JSX.Element | null {
  const lastTapRef = useRef<number>(0);
  if (labels.length === 0) return null;

  const handleNowPress = () => {
    const now = Date.now();
    if (now - lastTapRef.current < DOUBLE_TAP_MS) {
      lastTapRef.current = 0;
      onToggleNow?.();
      return;
    }
    lastTapRef.current = now;
  };

  return (
    <>
      {labels.map((label, index) => {
        const toggles = onToggleNow && (label.kind === 'next' || label.kind === 'now');
        return (
          <React.Fragment key={`${label.kind}-${index}`}>
            {LABEL_GAP}
            <Text style={styles.label} onPress={toggles ? handleNowPress : undefined} suppressHighlighting>
              {label.text}
            </Text>
          </React.Fragment>
        );
      })}
    </>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: FONT.small,
    fontWeight: '600',
  },
});
