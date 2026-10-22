/**
 * The meeting card (docs/dev/history/technical-design-item-card.md K8): in
 * Quick Add's place after one tap on a meeting, the same four rows at the
 * same heights (ui/quickAdd/QuickAddFrame.tsx), so nothing below moves.
 *   R1 "Meeting · <phase>", the thread link, ✕, Edit
 *   R2 title (with its tags) and when
 *   R3 P/R, M, note, Reflect (once over), the linked file or +clip
 *   R4 the area chip (name opens it, arrow refiles), New from this, Cancel meeting
 * Every button acts at once; what shows is decided in domain/itemCard.ts.
 */
import React from 'react';
import {Text, View} from 'react-native';
import {NotebookIcon} from '../icons';
import {CancelMeetingIcon, NewFromThisIcon, ReflectIcon} from './icons';
import {AreaChip, cardStyles, CardRow1, FileSlot, letter, SquareButton} from './parts';
import {MeetingCardData} from './useMeetingCard';

interface Props {
  card: MeetingCardData;
  /** Fills the Meeting create draft from this meeting and closes the card (QuickAddWidget). */
  onNewFromThis: () => void;
  textColor: string;
  borderColor: string;
}

export default function MeetingCard({card, onNewFromThis, textColor, borderColor}: Props): React.JSX.Element {
  const {model, busy} = card;
  const colors = {textColor, borderColor};
  return (
    <View>
      <CardRow1
        heading={model.heading}
        link={model.thread ? {label: model.thread.label, onPress: card.onOpenThread} : null}
        onClose={card.onClose}
        onEdit={card.onEdit}
        {...colors}
      />

      <View style={[cardStyles.row, cardStyles.row2]}>
        <Text style={[cardStyles.title, {color: textColor}, model.phase === 'cancelled' && cardStyles.struck]} numberOfLines={1}>
          {model.title}
        </Text>
        <View style={cardStyles.spacer} />
        <Text style={[cardStyles.small, {color: textColor}]} numberOfLines={1}>
          {model.when}
        </Text>
      </View>

      <View style={[cardStyles.row, cardStyles.row3]}>
        {model.checkpoint ? (
          <SquareButton
            label={model.checkpoint.kind === 'prep' ? 'Prepped' : 'Reviewed'}
            on={model.checkpoint.done}
            onPress={card.onCheckpoint}
            {...colors}>
            {letter(model.checkpoint.label)}
          </SquareButton>
        ) : null}
        <SquareButton label="Month highlight" on={model.monthly} onPress={card.onMonthly} {...colors}>
          {letter('M')}
        </SquareButton>
        <SquareButton label={model.note === 'open' ? 'Open note' : 'Create note'} onPress={card.onNote} {...colors}>
          {color => <NotebookIcon size={20} color={color} plus={model.note === 'create'} />}
        </SquareButton>
        {model.reflection ? (
          <SquareButton
            label={model.reflection === 'exists' ? 'Reflection' : 'Reflect'}
            on={model.reflection === 'exists'}
            disabled={model.reflection === 'unknown' || busy}
            onPress={card.onReflect}
            {...colors}>
            {color => <ReflectIcon color={color} />}
          </SquareButton>
        ) : null}
        <FileSlot file={model.file} onOpen={card.onOpenFile} onUnlink={card.onUnlink} onLink={card.onLink} {...colors} />
      </View>

      <View style={[cardStyles.row, cardStyles.row4]}>
        <AreaChip name={model.owner.name} canRefile={model.owner.canRefile} onOpen={card.onOpenOwner} onRefile={card.onRefile} {...colors} />
        <View style={cardStyles.spacer} />
        <SquareButton label="New from this" onPress={onNewFromThis} {...colors}>
          {color => <NewFromThisIcon color={color} />}
        </SquareButton>
        {model.canCancel ? (
          <SquareButton label="Cancel meeting" onPress={card.onCancelMeeting} {...colors}>
            {color => <CancelMeetingIcon color={color} />}
          </SquareButton>
        ) : null}
      </View>
    </View>
  );
}
