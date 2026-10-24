/**
 * The agreement card (docs/dev/history/technical-design-meetings-0.21.md R23,
 * §6): in Quick Add's place after one tap on an agreement, the same four
 * rows as the box and the todo card.
 *   R1 "Agreement · since 14.10.", "↳ <meeting> ›", ✕, Edit
 *   R2 the words and their tags
 *   R3 "valid till …", Change, End (an ended one shows neither)
 *   R4 "in <item> ›"
 */
import React from 'react';
import {Pressable, Text, View} from 'react-native';
import {quickAddButtons} from '../quickAdd/ActionRow';
import {cardStyles, CardRow1} from './parts';
import {AgreementCardData} from './useAgreementCard';

interface Props {
  card: AgreementCardData;
  textColor: string;
  borderColor: string;
}

export default function AgreementCard({card, textColor, borderColor}: Props): React.JSX.Element {
  const colors = {textColor, borderColor};
  const button = (label: string, onPress: () => void) => (
    <Pressable style={[quickAddButtons.ghostButton, {borderColor}]} onPress={onPress} hitSlop={6} accessibilityRole="button">
      <Text style={[quickAddButtons.ghostButtonText, {color: textColor}]}>{label}</Text>
    </Pressable>
  );
  return (
    <View testID="agreement-card">
      <CardRow1 heading={card.heading} link={card.madeIn} onClose={card.onClose} onEdit={card.onEdit} {...colors} />

      <View style={[cardStyles.row, cardStyles.row2]}>
        <Text style={[cardStyles.title, {color: textColor}, !card.active && cardStyles.struck]} numberOfLines={1}>
          {card.title}
        </Text>
        {card.tags.length > 0 ? (
          <Text style={[cardStyles.small, {color: textColor}]} numberOfLines={1}>
            {card.tags.join('  ')}
          </Text>
        ) : null}
      </View>

      <View style={[cardStyles.row, cardStyles.row3]}>
        <Text style={[cardStyles.small, {color: textColor}]} numberOfLines={1}>
          {card.validLine}
        </Text>
        <View style={cardStyles.spacer} />
        {card.active ? button('Change', card.onChange) : null}
        {card.active ? button('End', card.onEnd) : null}
      </View>

      <View style={[cardStyles.row, cardStyles.row4]}>
        <Pressable onPress={card.onOpenItem} disabled={!card.onOpenItem} hitSlop={6}>
          <Text style={[cardStyles.small, {color: textColor}]} numberOfLines={1}>
            {card.itemLabel}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
