/**
 * The panel's header (docs/dev/history/technical-design-engage.md §3.7): the
 * owner's kind pill, name and parent, and ✕ - or ‹ Back on the focus screens
 * when there is an owner to go back to.
 */
import React from 'react';
import {Pressable, Text, View} from 'react-native';
import {OwnerTitle} from '../../domain/engageOwner';
import {ENGAGE_TEXT} from '../../domain/engageText';
import {engageStyles as styles} from './engageStyles';

interface Props {
  title: OwnerTitle | null;
  /** Shown instead of the owner on the focus screens (S9/S11) and S10. */
  heading?: string;
  onClose: () => void;
  onBack?: () => void;
  textColor: string;
}

export default function EngageHeader({title, heading, onClose, onBack, textColor}: Props): React.JSX.Element {
  return (
    <View style={styles.headerRow}>
      {onBack ? (
        <Pressable onPress={onBack} hitSlop={10} style={styles.headerButton}>
          <Text style={[styles.headerButtonText, {color: textColor}]}>{ENGAGE_TEXT.back}</Text>
        </Pressable>
      ) : null}
      {title && !heading ? (
        <>
          <View style={[styles.kindPill, {borderColor: textColor}]}>
            <Text style={[styles.kindPillText, {color: textColor}]}>{title.kindLabel}</Text>
          </View>
          <Text style={[styles.ownerName, {color: textColor}]} numberOfLines={1}>
            {title.name}
            {title.parent ? <Text style={styles.ownerParent}>{`  · ${title.parent}`}</Text> : null}
          </Text>
        </>
      ) : (
        <Text style={[styles.ownerName, {color: textColor}]} numberOfLines={1}>
          {heading ?? ENGAGE_TEXT.heading}
        </Text>
      )}
      <Pressable onPress={onClose} hitSlop={10} style={styles.headerButton}>
        <Text style={[styles.headerButtonText, {color: textColor}]}>✕</Text>
      </Pressable>
    </View>
  );
}
