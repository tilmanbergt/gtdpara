/**
 * Whether a meeting has its Reflection page (docs/dev/history/technical-design-meeting-reflection.md
 * §2.3), looked up from its note whenever the meeting changes (another
 * meeting, note link, title or date); a stale answer is dropped. Every place
 * that offers "Reflect ›" / "Reflection ›" reads it from here.
 */
import {useCallback, useEffect, useState} from 'react';
import {ReflectionLookup} from '../domain/itemCard';
import {Meeting} from '../domain/types';
import {findReflectionPage, ReflectionState} from '../storage/reflectionPage';
import {errorMessage} from '../utils/errorMessage';
import {logWarn} from '../utils/log';
import {requestEinkRefresh} from '../utils/screenRefresh';

export interface ReflectionLookupResult {
  /** 'unknown' while the lookup runs (or for no meeting). */
  state: ReflectionLookup;
  /** Where the page is once found (null otherwise). */
  found: Extract<ReflectionState, {kind: 'exists'}> | null;
  /** After the page was created or opened: show "Reflection ›" without waiting for a new lookup. */
  markExists: () => void;
}

function keyOf(meeting: Meeting | null, itemPath: string | null): string {
  return meeting && itemPath ? [itemPath, meeting.notePath, meeting.date, meeting.title].join('\u0000') : '';
}

export function useReflectionLookup(meeting: Meeting | null, itemPath: string | null, logName: string): ReflectionLookupResult {
  const key = keyOf(meeting, itemPath);
  const [result, setResult] = useState<{key: string; state: ReflectionLookup; found: ReflectionLookupResult['found']}>({key: '', state: 'unknown', found: null});

  useEffect(() => {
    if (!meeting || !itemPath) return;
    let cancelled = false;
    findReflectionPage(meeting, itemPath)
      .then(found => {
        if (cancelled) return;
        setResult({key, state: found.kind, found: found.kind === 'exists' ? found : null});
        requestEinkRefresh();
      })
      .catch(e => {
        if (cancelled) return;
        // The label stays "Reflect ›"; tapping it shows what is wrong.
        logWarn(`${logName}: reflection lookup failed`, errorMessage(e));
        setResult({key, state: 'none', found: null});
      });
    return () => {
      cancelled = true;
    };
    // `meeting` is a fresh object on every render; `key` says when it really changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, logName]);

  const markExists = useCallback(() => setResult(r => ({key, state: 'exists', found: r.key === key ? r.found : null})), [key]);
  return result.key === key ? {state: result.state, found: result.found, markExists} : {state: 'unknown', found: null, markExists};
}
