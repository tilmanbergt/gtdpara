/**
 * The touch test's session logic (docs/dev/history/technical-design-touch-test.md):
 *
 * - Every touch in the test column is classified OUTCOME_GRACE_MS after it
 *   ends (late press events still count), stored, logged as one
 *   numbers-only line and answered with one e-ink refresh, never per move.
 * - Verdict: Intended / Not intended / Skip apply to the last test tap.
 *   After "Not intended" the next test-column touch is not a test tap: what
 *   it hits is stored as that tap's `intendedTarget`.
 * - Finger/Pen and the side of the test column label every tap as it ends.
 * - Clear, Save log (CSV to EXPORT/gtdpara/debug).
 */
import {useEffect, useRef, useState} from 'react';
import {Dimensions, PixelRatio} from 'react-native';
import {
  intendedLogLine,
  NO_TARGET,
  OUTCOME_GRACE_MS,
  RawTouch,
  touchCsv,
  touchEntry,
  TouchEntry,
  touchLogLine,
  TouchMode,
  TouchSide,
  TouchVerdict,
  verdictLogLine,
} from '../../../domain/touchDiag';
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
  setTouchIntendedTarget,
  setTouchTestOpen,
  setTouchVerdict,
  useTouchEntries,
} from '../../../utils/touchDiagStore';
import {LastHit} from './TestColumn';

const CLASSIFY_DELAY_MS = OUTCOME_GRACE_MS + 20;

export interface TouchSession {
  mode: TouchMode;
  setMode: (mode: TouchMode) => void;
  side: TouchSide;
  swapSides: () => void;
  entries: readonly TouchEntry[];
  /** The last test tap, with its current verdict. */
  last: TouchEntry | null;
  /** What the test column draws for the last touch (a test tap or the "what I meant" tap). */
  lastHit: LastHit | null;
  /** True after "Not intended" until the next test-column touch. */
  awaitingIntended: boolean;
  handleTouch: (touch: RawTouch) => void;
  judge: (verdict: TouchVerdict | null) => void;
  clear: () => void;
  save: () => Promise<void>;
}

export function useTouchSession(): TouchSession {
  const entries = useTouchEntries();
  const [mode, setMode] = useState<TouchMode>('finger');
  const [side, setSide] = useState<TouchSide>('left');
  const [lastId, setLastId] = useState<number | null>(null);
  const [lastHit, setLastHit] = useState<LastHit | null>(null);
  const [awaitingFor, setAwaitingFor] = useState<number | null>(null);
  const [saved, setSaved] = useState<{kind: 'success' | 'error'; text: string} | null>(null);
  useStatus('TouchTest.save', saved ? {...saved, onDismiss: () => setSaved(null)} : null);

  // Read when a touch ends, so a toggle during the grace time doesn't relabel it.
  const now = useRef({mode, side, awaitingFor});
  now.current = {mode, side, awaitingFor};

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
    const {awaitingFor: judgedId, ...labels} = now.current;
    const context = {...labels, screenHeight: Dimensions.get('window').height};
    rememberTouch(touch);
    if (judgedId !== null) setAwaitingFor(null);
    const timer = setTimeout(() => {
      timers.current.delete(timer);
      const entry = touchEntry(touch, getRecentTouches(), getOutcomes(), context);
      setLastHit({x: entry.x, y: entry.y, target: entry.target, noTarget: entry.cls === 'noTarget'});
      if (judgedId !== null) {
        const intended = entry.target ?? NO_TARGET;
        setTouchIntendedTarget(judgedId, intended);
        log(intendedLogLine(judgedId, intended));
      } else {
        addTouchEntry(entry);
        log(touchLogLine(entry, PixelRatio.get()));
        setLastId(entry.id);
      }
      requestEinkRefresh();
    }, CLASSIFY_DELAY_MS);
    timers.current.add(timer);
  };

  const judge = (verdict: TouchVerdict | null) => {
    if (lastId === null) return;
    setTouchVerdict(lastId, verdict);
    log(verdictLogLine(lastId, verdict));
    setAwaitingFor(verdict === 'notIntended' ? lastId : null);
  };

  const swapSides = () => {
    setSide(s => (s === 'left' ? 'right' : 'left'));
    // The marker's position belongs to the old layout.
    setLastHit(null);
    log('TouchTest: sides swapped');
  };

  const clear = () => {
    clearTouchEntries();
    setLastId(null);
    setLastHit(null);
    setAwaitingFor(null);
    setSaved(null);
    log('TouchTest: cleared');
  };

  const save = async () => {
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

  return {
    mode,
    setMode,
    side,
    swapSides,
    entries,
    last: entries.find(e => e.id === lastId) ?? null,
    lastHit,
    awaitingIntended: awaitingFor !== null,
    handleTouch,
    judge,
    clear,
    save,
  };
}
