/**
 * S9 / S11 (docs/dev/history/technical-design-engage.md §3.7): the focus's
 * owners as lines "Kind · Name · n next ›" in ring order; a tap makes that
 * owner the panel's owner. The week's list ends with one quiet line pointing
 * to gtdpara for anything beyond it.
 */
import React from 'react';
import {Pressable, Text, View} from 'react-native';
import {ownerKey} from '../../domain/engageOwner';
import {FocusRing, OwnerLine} from '../../domain/engageOptions';
import {ENGAGE_TEXT, ownerLineText} from '../../domain/engageText';
import PagedSection from '../../ui/PagedSection';
import {ENGAGE_LIST_VIEWPORT, ENGAGE_ROW_H, engageStyles as styles} from './engageStyles';

interface Props {
  ring: FocusRing;
  lines: OwnerLine[];
  onChoose: (line: OwnerLine) => void;
  textColor: string;
  borderColor: string;
}

export default function OwnerList({ring, lines, onChoose, textColor, borderColor}: Props): React.JSX.Element {
  return (
    <View>
      <PagedSection
        header={ring === 'daily' ? ENGAGE_TEXT.todayFocus : ENGAGE_TEXT.weekFocus}
        rows={lines}
        rowHeight={() => ENGAGE_ROW_H}
        viewportHeight={ENGAGE_LIST_VIEWPORT}
        resetKey={ring}
        emptyHint={ENGAGE_TEXT.noFocusLines}
        textColor={textColor}
        borderColor={borderColor}
        renderRow={line => (
          <Pressable key={ownerKey(line.owner)} onPress={() => onChoose(line)} style={[styles.row, {borderBottomColor: borderColor}]}>
            <Text style={[styles.rowText, {color: textColor}]} numberOfLines={2}>
              {ownerLineText(line)}
            </Text>
          </Pressable>
        )}
      />
      {ring === 'weekly' ? <Text style={[styles.quiet, {color: textColor}]}>{ENGAGE_TEXT.beyondWeek}</Text> : null}
    </View>
  );
}
