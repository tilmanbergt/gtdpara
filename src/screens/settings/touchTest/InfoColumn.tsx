/**
 * The touch test's info column, top to bottom: controls, the last tap, the
 * verdict, the counts. Taps here are never test taps: the column sits
 * outside the test column's observer.
 */
import React from 'react';
import {View} from 'react-native';
import LastTapInfo from './LastTapInfo';
import SummaryTable from './SummaryTable';
import TestControls from './TestControls';
import {TouchSession} from './useTouchSession';
import VerdictButtons from './VerdictButtons';

interface Props {
  session: TouchSession;
  onClose: () => void;
  textColor: string;
  borderColor: string;
}

export default function InfoColumn({session, onClose, textColor, borderColor}: Props): React.JSX.Element {
  const colors = {textColor, borderColor};
  return (
    <View>
      <TestControls
        mode={session.mode}
        onMode={session.setMode}
        onSwapSides={session.swapSides}
        canSave={session.entries.length > 0}
        onClear={session.clear}
        onSave={session.save}
        onClose={onClose}
        {...colors}
      />
      <LastTapInfo last={session.last} received={session.entries.length} textColor={textColor} />
      <VerdictButtons
        enabled={session.last !== null}
        verdict={session.last?.verdict ?? null}
        awaitingIntended={session.awaitingIntended}
        onJudge={session.judge}
        {...colors}
      />
      <SummaryTable entries={session.entries} {...colors} />
    </View>
  );
}
