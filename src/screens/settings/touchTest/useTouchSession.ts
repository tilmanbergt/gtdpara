/**
 * The touch test's session logic: every touch in the test column is
 * classified OUTCOME_GRACE_MS after it ends (late press events still count),
 * stored, logged as one numbers-only line and answered with one e-ink
 * refresh, never per move. Also Clear and Save log (CSV to
 * EXPORT/gtdpara/debug).
 */
import {useEffect, useRef, useState} from 'react';
import {Dimensions, PixelRatio} from 'react-native';
import {OUTCOME_GRACE_MS, RawTouch, touchCsv, touchEntry, TouchEntry, touchLogLine, TouchMode, TouchSide} from '../../../domain/touchDiag';
import {saveTouchLog} from '../../../storage/touchLog';
import {useStatus} from '../../../ui/status/StatusProvider';
import {errorMessage} from '../../../utils/errorMessage';
import {log, logError} from '../../../utils/log';
import {requestEinkRefresh} from '../../../utils/screenRefresh';
import {
  addTouchEntry,
  clearTouchEntries,
  getOutcomes,
  getRecentTouches,
  getTouchEntries,
  rememberTouch,
  setTouchTestOpen,
} from '../../../utils/touchDiagStore';
import {LastHit} from './TestColumn';

const CLASSIFY_DELAY_MS = OUTCOME_GRACE_MS + 20;

export interface TouchSession {
  mode: TouchMode;
  setMode: (mode: TouchMode) => void;
  side: TouchSide;
  /** The last test tap, classified. */
  last: TouchEntry | null;
  /** What the test column draws for the last touch. */
  lastHit: LastHit | null;
  handleTouch: (touch: RawTouch) => void;
  clear: () => void;
  save: () => Promise<void>;
}

export function useTouchSession(): TouchSession {
  const [mode, setMode] = useState<TouchMode>('finger');
  const [side] = useState<TouchSide>('left');
  const [last, setLast] = useState<TouchEntry | null>(null);
  const [lastHit, setLastHit] = useState<LastHit | null>(null);
  const [saved, setSaved] = useState<{kind: 'success' | 'error'; text: string} | null>(null);
  useStatus('TouchTest.save', saved ? {...saved, onDismiss: () => setSaved(null)} : null);

  // Read when a touch ends, so a toggle during the grace time doesn't relabel it.
  const now = useRef({mode, side});
  now.current = {mode, side};

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
    const context = {...now.current, screenHeight: Dimensions.get('window').height};
    rememberTouch(touch);
    const timer = setTimeout(() => {
      timers.current.delete(timer);
      const entry = touchEntry(touch, getRecentTouches(), getOutcomes(), context);
      addTouchEntry(entry);
      log(touchLogLine(entry, PixelRatio.get()));
      setLast(entry);
      setLastHit({x: entry.x, y: entry.y, target: entry.target, noTarget: entry.cls === 'noTarget'});
      requestEinkRefresh();
    }, CLASSIFY_DELAY_MS);
    timers.current.add(timer);
  };

  const clear = () => {
    clearTouchEntries();
    setLast(null);
    setLastHit(null);
    setSaved(null);
    log('TouchTest: cleared');
  };

  const save = async () => {
    const entries = getTouchEntries();
    try {
      const fileName = await saveTouchLog(touchCsv(entries, PixelRatio.get()));
      log('TouchTest: log saved', entries.length);
      setSaved({kind: 'success', text: `Saved ${entries.length} touches as ${fileName} in EXPORT/gtdpara/debug.`});
    } catch (e) {
      const message = errorMessage(e);
      logError('TouchTest: saving the log failed', message);
      setSaved({kind: 'error', text: `Saving the touch log failed: ${message}`});
    }
  };

  return {mode, setMode, side, last, lastHit, handleTouch, clear, save};
}
