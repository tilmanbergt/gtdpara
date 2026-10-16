/**
 * "n marks to process … ›" (S6/S8, docs/dev/history/technical-design-engage.md
 * §3.7): the open marks of the owner's item (marks belong to a Project or
 * Area, not to a loop); hidden when there are none. Opens Process marks,
 * whose Close comes back to the panel.
 */
import React from 'react';
import {Text} from 'react-native';
import {EngageOwner, ownerHomePath} from '../../domain/engageOwner';
import {marksLineText} from '../../domain/engageText';
import {MarkScope} from '../../domain/marks';
import {openMarks} from '../../ui/marksNav';
import {useOpenMarks} from '../../ui/useOpenMarks';
import {engageStyles as styles} from './engageStyles';

interface Props {
  owner: EngageOwner;
  textColor: string;
}

export default function MarksLine({owner, textColor}: Props): React.JSX.Element | null {
  const scope: MarkScope = {type: 'item', path: ownerHomePath(owner)};
  const marks = useOpenMarks(scope);
  const text = marksLineText(marks.length, owner.kind);
  if (!text) return null;
  return (
    <Text style={[styles.marksLine, {color: textColor}]} onPress={() => openMarks(scope, 'engage')} suppressHighlighting>
      {text}
    </Text>
  );
}
