/**
 * The panel's footer (docs/dev/history/technical-design-engage.md §3.7): Open
 * gtdpara · Close, and on S8/S10 the Select … focus button with Close as the
 * main action.
 */
import React from 'react';
import {View} from 'react-native';
import {ENGAGE_TEXT} from '../../domain/engageText';
import PillButton from '../../ui/PillButton';
import {engageStyles as styles} from './engageStyles';

interface Props {
  select?: {kind: 'next' | 'new'; onPress: () => void};
  closeIsMain: boolean;
  onOpenGtdpara: () => void;
  onClose: () => void;
  textColor: string;
  borderColor: string;
}

export default function EngageFooter({select, closeIsMain, onOpenGtdpara, onClose, textColor, borderColor}: Props): React.JSX.Element {
  return (
    <View style={styles.footer}>
      <PillButton label={ENGAGE_TEXT.openGtdpara} onPress={onOpenGtdpara} textColor={textColor} borderColor={borderColor} />
      <View style={styles.footerRight}>
        {select ? (
          <PillButton
            label={select.kind === 'next' ? ENGAGE_TEXT.selectNextFocus : ENGAGE_TEXT.selectNewFocus}
            onPress={select.onPress}
            textColor={textColor}
            borderColor={borderColor}
          />
        ) : null}
        <PillButton label={ENGAGE_TEXT.close} onPress={onClose} primary={closeIsMain} textColor={textColor} borderColor={borderColor} />
      </View>
    </View>
  );
}
