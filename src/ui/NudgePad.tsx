/**
 * The single shared position/font control for a note-creation definition's
 * pieces (docs/dev/technical-design-note-templates.md §6) - Tilman's UI-draft
 * feedback round 2: "the arrows and font controls should be present only
 * once just below the preview. And then selecting a piece either on the
 * preview or in the list below makes this the one that is displayed and can
 * be adjusted." One instance per edit form, acting on whichever piece
 * `selectedPiece` currently points at - not repeated per piece row.
 *
 * Kept dumb/reusable (plain callbacks in, no domain/tagRules.ts import)
 * rather than baked into screens/Settings.tsx, since the deferred "linked-
 * file link" piece (design doc §4) would plausibly want the same controls
 * later.
 *
 * Max-width ± control (2026-09-23, docs/dev/technical-design-textbox-metrics.md -
 * Tilman: "add a width parameter to the tag rules screen that defines the
 * maximum width for text pieces ... +25 -25 buttons to adjust"): same shape
 * as the Font ± control right above it, fixed ±25 step, independent of the
 * x/y STEPS toggle. screens/Settings.tsx resolves `piece.maxWidthPx` via
 * domain/tagRules.ts's `pieceMaxWidthPx` before passing it down here, so
 * this component still never imports that domain module itself.
 */
import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {COLORS, FONT} from './theme';

interface SelectedPiece {
  x: number;
  y: number;
  fontSize: number;
  step: number;
  /**
   * Resolved max width (device px) for this piece - always a concrete
   * number here even though domain/tagRules.ts's NotePiece.maxWidthPx
   * itself is optional (screens/Settings.tsx resolves it via
   * `pieceMaxWidthPx` before handing the piece to this component, same as
   * every other field here). 2026-09-23,
   * docs/dev/technical-design-textbox-metrics.md.
   */
  maxWidthPx: number;
}

interface Props {
  /** The currently selected piece, or null when nothing is selected - controls render disabled/greyed rather than disappearing, so the layout doesn't jump as selection changes. */
  piece: SelectedPiece | null;
  onNudge: (dx: number, dy: number) => void;
  onStepChange: (step: number) => void;
  onFontDelta: (delta: number) => void;
  /** ±25 fixed step (Tilman, 2026-09-23: "+25 -25 buttons to adjust") - independent of the x/y STEPS toggle above; there's no separate step-size choice for width. */
  onMaxWidthDelta: (delta: number) => void;
  textColor: string;
  borderColor: string;
}

const STEPS = [5, 25];
const MAX_WIDTH_STEP = 25;

export default function NudgePad({piece, onNudge, onStepChange, onFontDelta, onMaxWidthDelta, textColor, borderColor}: Props): React.JSX.Element {
  const disabled = piece === null;
  const step = piece?.step ?? STEPS[0];

  return (
    <View style={[styles.wrap, {borderColor}, disabled && styles.disabled]}>
      <View style={styles.row}>
        <View style={styles.arrowPad}>
          <View style={styles.arrowRow}>
            <ArrowButton
              label="▲"
              disabled={disabled}
              textColor={textColor}
              borderColor={borderColor}
              onPress={() => onNudge(0, -step)}
            />
          </View>
          <View style={styles.arrowRow}>
            <ArrowButton
              label="◀"
              disabled={disabled}
              textColor={textColor}
              borderColor={borderColor}
              onPress={() => onNudge(-step, 0)}
            />
            <Text style={[styles.posText, {color: textColor}]}>
              {piece ? `${piece.x}, ${piece.y}` : '—'}
            </Text>
            <ArrowButton
              label="▶"
              disabled={disabled}
              textColor={textColor}
              borderColor={borderColor}
              onPress={() => onNudge(step, 0)}
            />
          </View>
          <View style={styles.arrowRow}>
            <ArrowButton
              label="▼"
              disabled={disabled}
              textColor={textColor}
              borderColor={borderColor}
              onPress={() => onNudge(0, step)}
            />
          </View>
        </View>

        <View style={styles.sideControls}>
          <Text style={[styles.controlLabel, {color: textColor}]}>Step</Text>
          <View style={styles.stepToggle}>
            {STEPS.map(s => (
              <Pressable
                key={s}
                disabled={disabled}
                onPress={() => onStepChange(s)}
                style={[
                  styles.stepButton,
                  {borderColor},
                  s === step && styles.stepButtonActive,
                ]}>
                <Text style={[styles.stepButtonText, {color: s === step ? COLORS.accentText : textColor}]}>
                  {s}px
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={[styles.controlLabel, styles.fontLabel, {color: textColor}]}>
            Font{piece ? ` — ${piece.fontSize}` : ''}
          </Text>
          <View style={styles.stepToggle}>
            <Pressable disabled={disabled} onPress={() => onFontDelta(-1)} style={[styles.stepButton, {borderColor}]} hitSlop={6}>
              <Text style={[styles.stepButtonText, {color: textColor}]}>−</Text>
            </Pressable>
            <Pressable disabled={disabled} onPress={() => onFontDelta(1)} style={[styles.stepButton, {borderColor}]} hitSlop={6}>
              <Text style={[styles.stepButtonText, {color: textColor}]}>+</Text>
            </Pressable>
          </View>

          <Text style={[styles.controlLabel, styles.fontLabel, {color: textColor}]}>
            Max width{piece ? ` — ${piece.maxWidthPx}px` : ''}
          </Text>
          <View style={styles.stepToggle}>
            <Pressable
              disabled={disabled}
              onPress={() => onMaxWidthDelta(-MAX_WIDTH_STEP)}
              style={[styles.stepButton, {borderColor}]}
              hitSlop={6}>
              <Text style={[styles.stepButtonText, {color: textColor}]}>−</Text>
            </Pressable>
            <Pressable
              disabled={disabled}
              onPress={() => onMaxWidthDelta(MAX_WIDTH_STEP)}
              style={[styles.stepButton, {borderColor}]}
              hitSlop={6}>
              <Text style={[styles.stepButtonText, {color: textColor}]}>+</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}

function ArrowButton({
  label,
  disabled,
  textColor,
  borderColor,
  onPress,
}: {
  label: string;
  disabled: boolean;
  textColor: string;
  borderColor: string;
  onPress: () => void;
}): React.JSX.Element {
  return (
    <Pressable disabled={disabled} onPress={onPress} style={[styles.arrowButton, {borderColor}]} hitSlop={6}>
      <Text style={[styles.arrowText, {color: textColor}]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderWidth: 1,
    borderRadius: 6,
    padding: 10,
    marginTop: 8,
  },
  disabled: {
    opacity: 0.4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  arrowPad: {
    alignItems: 'center',
  },
  arrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowButton: {
    borderWidth: 1,
    borderRadius: 4,
    width: 34,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    margin: 2,
  },
  arrowText: {
    fontSize: FONT.medium,
    fontWeight: '700',
  },
  posText: {
    fontSize: FONT.small,
    width: 70,
    textAlign: 'center',
  },
  sideControls: {
    marginLeft: 16,
  },
  controlLabel: {
    fontSize: FONT.small,
    fontWeight: '600',
    marginBottom: 4,
  },
  fontLabel: {
    marginTop: 8,
  },
  stepToggle: {
    flexDirection: 'row',
  },
  stepButton: {
    borderWidth: 1,
    borderRadius: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    marginRight: 4,
  },
  stepButtonActive: {
    backgroundColor: COLORS.accent,
  },
  stepButtonText: {
    fontSize: FONT.small,
    fontWeight: '600',
  },
});
