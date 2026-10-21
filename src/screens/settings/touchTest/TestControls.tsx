/** The touch test's controls, at the top of the info column: mode, side, app-wide logging, Clear, Save log, Close. */
import React from 'react';
import {StyleSheet, View} from 'react-native';
import {TouchMode} from '../../../domain/touchDiag';
import PillButton from '../../../ui/PillButton';
import {log} from '../../../utils/log';
import {setAppWideTouchLog, useAppWideTouchLog} from '../../../utils/touchDiagStore';

interface Props {
  mode: TouchMode;
  onMode: (mode: TouchMode) => void;
  onSwapSides: () => void;
  canSave: boolean;
  onClear: () => void;
  onSave: () => void;
  onClose: () => void;
  textColor: string;
  borderColor: string;
}

export default function TestControls(p: Props): React.JSX.Element {
  const appWide = useAppWideTouchLog();
  const pill = {textColor: p.textColor, borderColor: p.borderColor};
  const toggleAppWide = () => {
    log('TouchTest: log touches everywhere', !appWide);
    setAppWideTouchLog(!appWide);
  };
  return (
    <View style={styles.row}>
      <PillButton label="Finger" primary={p.mode === 'finger'} onPress={() => p.onMode('finger')} {...pill} />
      <PillButton label="Pen" primary={p.mode === 'pen'} onPress={() => p.onMode('pen')} {...pill} />
      <PillButton label="⇄ Swap sides" onPress={p.onSwapSides} {...pill} />
      <PillButton label={`Log touches everywhere: ${appWide ? 'ON' : 'OFF'}`} primary={appWide} onPress={toggleAppWide} {...pill} />
      <PillButton label="Clear" onPress={p.onClear} {...pill} />
      <PillButton label="Save log" onPress={p.onSave} disabled={!p.canSave} {...pill} />
      <PillButton label="Close" onPress={p.onClose} {...pill} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center'},
});
