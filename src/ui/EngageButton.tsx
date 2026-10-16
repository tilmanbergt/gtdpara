/**
 * "Engage ›" on a Project, Area, loop or thread page
 * (docs/dev/history/technical-design-engage.md §3.7, S1 of Appendix A): opens
 * the Engage panel with that owner, through ui/engageStore.ts.
 */
import React from 'react';
import {EngageOwner} from '../domain/engageOwner';
import {ENGAGE_TEXT} from '../domain/engageText';
import {log} from '../utils/log';
import {engageOwner} from './engageStore';
import PillButton from './PillButton';

interface Props {
  owner: EngageOwner;
  textColor: string;
  borderColor: string;
}

export default function EngageButton({owner, textColor, borderColor}: Props): React.JSX.Element {
  const onPress = () => {
    log('EngageButton: pressed', 'owner=' + owner.kind);
    engageOwner(owner);
  };
  return <PillButton label={ENGAGE_TEXT.ownerButton} onPress={onPress} textColor={textColor} borderColor={borderColor} />;
}
