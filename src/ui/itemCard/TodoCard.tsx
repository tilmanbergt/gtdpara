/**
 * The todo card (docs/dev/history/technical-design-item-card.md K9): in
 * Quick Add's place after one tap on a todo, the same four rows as the box.
 *   R1 "Todo · <due / waiting / …>", "↳ <meeting> ›" when it was agreed in one, ✕, Edit
 *   R2 the title and its labels
 *   R3 done, the flow chips (w/f · Maybe · Someday · Next) and Now, the note
 *   R4 the area chip (name opens it, arrow refiles), the linked file or +clip, delete
 * Every button acts at once; what shows is decided in domain/itemCard.ts.
 */
import React from 'react';
import {Text, View} from 'react-native';
import FlowStateChips from '../FlowStateChips';
import {NotebookIcon, TrashIcon} from '../icons';
import {AreaChip, cardStyles, CardRow1, FileSlot, letter, SquareButton} from './parts';
import {TodoCardData} from './useTodoCard';

interface Props {
  card: TodoCardData;
  textColor: string;
  borderColor: string;
}

export default function TodoCard({card, textColor, borderColor}: Props): React.JSX.Element {
  const {model} = card;
  const colors = {textColor, borderColor};
  return (
    <View>
      <CardRow1
        heading={model.heading}
        link={model.origin ? {label: model.origin.label, onPress: card.onOpenOrigin} : null}
        onClose={card.onClose}
        onEdit={card.onEdit}
        {...colors}
      />

      <View style={[cardStyles.row, cardStyles.row2]}>
        <Text style={[cardStyles.title, {color: textColor}, (model.done || !model.canDelete) && cardStyles.struck]} numberOfLines={1}>
          {model.title}
        </Text>
        {model.labels.length > 0 ? (
          <Text style={[cardStyles.small, {color: textColor}]} numberOfLines={1}>
            {model.labels.join('  ')}
          </Text>
        ) : null}
      </View>

      <View style={[cardStyles.row, cardStyles.row3]}>
        <SquareButton label="Done" on={model.done} onPress={card.onToggleDone} {...colors}>
          {letter(model.done ? '✓' : '☐')}
        </SquareButton>
        <FlowStateChips value={model.flowState} onChange={card.onFlow} compact textColor={textColor} borderColor={borderColor} />
        {model.nowOffered ? (
          <SquareButton label="Now" on={model.now} onPress={card.onToggleNow} {...colors}>
            {letter('Now')}
          </SquareButton>
        ) : null}
        <SquareButton label={model.note === 'open' ? 'Open note' : 'Create note'} onPress={card.onNote} {...colors}>
          {color => <NotebookIcon size={20} color={color} plus={model.note === 'create'} />}
        </SquareButton>
      </View>

      <View style={[cardStyles.row, cardStyles.row4]}>
        <AreaChip name={model.owner.name} canRefile={model.owner.canRefile} onOpen={card.onOpenOwner} onRefile={card.onRefile} {...colors} />
        <FileSlot file={model.file} onOpen={card.onOpenFile} onUnlink={card.onUnlink} onLink={card.onLink} {...colors} />
        <View style={cardStyles.spacer} />
        {model.canDelete ? (
          <SquareButton label="Delete" onPress={card.onDelete} {...colors}>
            {color => <TrashIcon size={18} color={color} />}
          </SquareButton>
        ) : null}
      </View>
    </View>
  );
}
