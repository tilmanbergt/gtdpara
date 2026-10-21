/**
 * Settings → Advanced → Touch test: a diagnostic that finds out where and
 * why finger taps get lost. It changes nothing; it records.
 *
 * Top to bottom: the controls (Finger/Pen label for the records, "Log
 * touches everywhere", Clear, Save log, Close), the counts per class, mode
 * and screen band, then the target area down to the screen's bottom edge:
 * real todo and meeting rows with sample entries (touchTest/), two columns
 * like Daily, the right one with the Current tab's "+clip".
 *
 * Every touch in the target area is recorded by ui/touchDiag/TouchObserver
 * (observe only), the rows report their press events through the probe
 * (ui/touchDiag/touchProbe.ts), and OUTCOME_GRACE_MS after the touch ends
 * domain/touchDiag.ts classifies it. Then: a marker at its start point, one
 * log line (numbers only), one e-ink refresh. "Save log" writes the
 * session's records as CSV to EXPORT/gtdpara/debug.
 */
import React, {useEffect, useRef, useState} from 'react';
import {Dimensions, LayoutChangeEvent, PixelRatio, StyleSheet, Text, View} from 'react-native';
import {cellText, countTouches, OUTCOME_GRACE_MS, RawTouch, TOUCH_BANDS, touchCsv, touchEntry, touchLogLine, TouchMode} from '../../domain/touchDiag';
import {saveTouchLog} from '../../storage/touchLog';
import PillButton from '../../ui/PillButton';
import {useStatus} from '../../ui/status/StatusProvider';
import {COLORS, FONT, SPACING, useThemeColors} from '../../ui/theme';
import TouchObserver from '../../ui/touchDiag/TouchObserver';
import {
  addTouchEntry,
  clearTouchEntries,
  getOutcomes,
  getRecentTouches,
  getTouchEntries,
  rememberTouch,
  reportOutcome,
  setAppWideTouchLog,
  setTouchTestOpen,
  useAppWideTouchLog,
  useTouchEntries,
} from '../../utils/touchDiagStore';
import {TouchProbeContext} from '../../ui/touchDiag/touchProbe';
import {errorMessage} from '../../utils/errorMessage';
import {log, logError} from '../../utils/log';
import {requestEinkRefresh} from '../../utils/screenRefresh';
import TouchMarkers from './touchTest/TouchMarkers';
import TouchTestRows, {fillColumn} from './touchTest/TouchTestRows';

// Late press events (pressOut waits for a minimum press time) still count.
const CLASSIFY_DELAY_MS = OUTCOME_GRACE_MS + 20;

type Saved = {kind: 'success' | 'error'; text: string};

export default function TouchTestScreen({onClose}: {onClose: () => void}): React.JSX.Element {
  const {textColor, borderColor} = useThemeColors();
  const entries = useTouchEntries();
  const appWide = useAppWideTouchLog();
  const [mode, setMode] = useState<TouchMode>('finger');
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const [saved, setSaved] = useState<Saved | null>(null);
  useStatus('TouchTest.save', saved ? {...saved, onDismiss: () => setSaved(null)} : null);

  // The target area: its size decides how many rows fit, its page position places the markers.
  const areaRef = useRef<View>(null);
  const [areaHeight, setAreaHeight] = useState<number | null>(null);
  const [origin, setOrigin] = useState<{x: number; y: number} | null>(null);
  const onAreaLayout = (e: LayoutChangeEvent) => {
    setAreaHeight(e.nativeEvent.layout.height);
    areaRef.current?.measure((_x, _y, _w, _h, pageX, pageY) => setOrigin({x: pageX, y: pageY}));
  };

  // The rows appear one render after the area is measured, without a tap of their own.
  const ready = areaHeight !== null;
  useEffect(() => {
    if (ready) requestEinkRefresh();
  }, [ready]);

  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  useEffect(() => {
    setTouchTestOpen(true);
    log('TouchTest: opened');
    const pending = timers.current;
    return () => {
      pending.forEach(clearTimeout);
      setTouchTestOpen(false);
    };
  }, []);

  const handleTouch = (touch: RawTouch) => {
    const touchMode = modeRef.current;
    rememberTouch(touch);
    const timer = setTimeout(() => {
      timers.current.delete(timer);
      const entry = touchEntry(touch, getRecentTouches(), getOutcomes(), {mode: touchMode, side: 'left', screenHeight: Dimensions.get('window').height});
      addTouchEntry(entry);
      log(touchLogLine(entry, PixelRatio.get()));
      requestEinkRefresh();
    }, CLASSIFY_DELAY_MS);
    timers.current.add(timer);
  };

  const handleSave = async () => {
    const current = getTouchEntries();
    try {
      const fileName = await saveTouchLog(touchCsv(current, PixelRatio.get()));
      log('TouchTest: log saved', current.length);
      setSaved({kind: 'success', text: `Saved ${current.length} touches as ${fileName} in EXPORT/gtdpara/debug.`});
    } catch (e) {
      const message = errorMessage(e);
      logError('TouchTest: saving the log failed', message);
      setSaved({kind: 'error', text: `Saving the touch log failed: ${message}`});
    }
  };

  const handleClear = () => {
    clearTouchEntries();
    setSaved(null);
    log('TouchTest: cleared');
  };

  const toggleAppWide = () => {
    log('TouchTest: log touches everywhere', !appWide);
    setAppWideTouchLog(!appWide);
  };

  const counts = countTouches(entries);
  const last = entries.length > 0 ? entries[entries.length - 1] : null;
  const left = areaHeight ? fillColumn(0, areaHeight) : [];
  const right = areaHeight ? fillColumn(left.length, areaHeight) : [];
  const pill = {textColor, borderColor};

  return (
    <View style={styles.screen}>
      <View style={styles.controls}>
        <PillButton label="Finger" primary={mode === 'finger'} onPress={() => setMode('finger')} {...pill} />
        <PillButton label="Pen" primary={mode === 'pen'} onPress={() => setMode('pen')} {...pill} />
        <PillButton label={`Log touches everywhere: ${appWide ? 'ON' : 'OFF'}`} primary={appWide} onPress={toggleAppWide} {...pill} />
        <PillButton label="Clear" onPress={handleClear} {...pill} />
        <PillButton label="Save log" onPress={handleSave} disabled={entries.length === 0} {...pill} />
        <View style={styles.flex} />
        <PillButton label="Close" onPress={onClose} {...pill} />
      </View>
      <Text style={[styles.summary, {color: textColor}]}>{TOUCH_BANDS.map(b => `${b} ${cellText(counts.finger.left[b])}`).join(' · ')}</Text>
      <Text style={[styles.summary, {color: textColor}]}>{TOUCH_BANDS.map(b => `${b} ${cellText(counts.pen.left[b])}`).join(' · ')}</Text>
      <Text style={[styles.summary, styles.hint, {color: textColor}]}>
        {last
          ? `Last: #${last.id} ${last.mode} ${last.band} ${last.cls}${last.target ? ` (${last.target})` : ''}. `
          : 'Tap the rows below. '}
        ● handled ○ cancelled × no target ◐ #next single tap
      </Text>
      <TouchProbeContext.Provider value={reportOutcome}>
        <TouchObserver enabled onTouch={handleTouch} style={[styles.area, {borderTopColor: borderColor}]}>
          <View ref={areaRef} style={styles.columns} onLayout={onAreaLayout}>
            <View style={[styles.column, styles.columnLeft]}>
              <TouchTestRows samples={left} armLink={false} textColor={textColor} borderColor={borderColor} />
            </View>
            <View style={styles.column}>
              <TouchTestRows samples={right} armLink textColor={textColor} borderColor={borderColor} />
            </View>
            {origin && <TouchMarkers entries={entries} originX={origin.x} originY={origin.y} />}
          </View>
        </TouchObserver>
      </TouchProbeContext.Provider>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: COLORS.background},
  controls: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    paddingTop: SPACING.sm,
    paddingHorizontal: SPACING.base,
  },
  flex: {flex: 1},
  summary: {fontSize: FONT.small, paddingHorizontal: SPACING.base},
  hint: {opacity: 0.6, marginBottom: SPACING.xs},
  area: {flex: 1, borderTopWidth: 1},
  columns: {flex: 1, flexDirection: 'row', paddingHorizontal: SPACING.base},
  column: {flex: 1},
  columnLeft: {marginRight: SPACING.base},
});
