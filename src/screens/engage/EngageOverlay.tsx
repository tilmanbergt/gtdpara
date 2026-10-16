/**
 * The Engage panel over the note (docs/dev/history/technical-design-engage.md
 * §3.7). Device-spike stage (design §5, S0): a framed box with the open
 * file's name, the current page and Close, on a root that lets the note show
 * around it when `ENGAGE_BACKDROP_TRANSPARENT` is on. The path and page are
 * read once per mount; App remounts the panel on every Engage press.
 */
import React, {useEffect, useState} from 'react';
import {Text, View} from 'react-native';
import {ENGAGE_TEXT} from '../../domain/engageText';
import {getCurrentPageNum} from '../../supernote/currentPage';
import {getCurrentNotePath} from '../../supernote/fileSystem';
import PillButton from '../../ui/PillButton';
import StatusFrame from '../../ui/status/StatusFrame';
import {useThemeColors} from '../../ui/theme';
import {log} from '../../utils/log';
import {useEinkRefreshOnLoad} from '../../utils/screenRefresh';
import {engageStyles as styles} from './engageStyles';

interface Props {
  onClose: () => void;
}

interface NoteSpot {
  path: string | null;
  page: number | null;
}

export default function EngageOverlay({onClose}: Props): React.JSX.Element {
  const {textColor, borderColor, isDarkMode} = useThemeColors();
  const background = isDarkMode ? '#000000' : '#ffffff';
  const [spot, setSpot] = useState<NoteSpot | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getCurrentNotePath(), getCurrentPageNum()]).then(([path, page]) => {
      // No file names in the log (DEVELOPMENT-POLICY §5).
      log('EngageOverlay: spike', 'page=' + String(page), 'pathKnown=' + (path ? 'yes' : 'no'));
      if (!cancelled) setSpot({path, page});
    });
    return () => {
      cancelled = true;
    };
  }, []);
  useEinkRefreshOnLoad(spot === null);

  const fileName = spot?.path ? spot.path.split('/').pop() : '-';
  const pageText = spot?.page == null ? '-' : `${spot.page + 1} (index ${spot.page})`;
  return (
    <View style={styles.root}>
      <StatusFrame>
        <View style={[styles.panel, {backgroundColor: background, borderColor: textColor}]}>
          <Text style={[styles.heading, {color: textColor}]}>{ENGAGE_TEXT.heading}</Text>
          <Text style={[styles.line, {color: textColor}]}>File: {spot ? fileName : '…'}</Text>
          <Text style={[styles.line, {color: textColor}]}>Page: {spot ? pageText : '…'}</Text>
          <View style={styles.footer}>
            <PillButton label={ENGAGE_TEXT.close} onPress={onClose} primary textColor={textColor} borderColor={borderColor} />
          </View>
        </View>
      </StatusFrame>
    </View>
  );
}
