/**
 * Recognizes open marks while the capture screen is open
 * (docs/dev/technical-design-lasso-0.8.md §3.7): the selected mark first,
 * then the next PREFETCH marks in list order, one at a time (the host
 * recognizer is never asked twice at once). Each result is kept in the
 * mark's private data (storage/marks.ts recognizeMark), so a mark is
 * recognized once; the mark line itself never gets the text.
 */
import {useEffect, useRef, useState} from 'react';
import {OpenMark} from '../../domain/marks';
import {recognizeMark, storedMarkText} from '../../storage/marks';
import {logWarn} from '../../utils/log';

export type RecognitionState = 'waiting' | 'recognizing' | 'done' | 'empty' | 'failed';

export interface MarkRecognition {
  state: RecognitionState;
  text: string;
  /** The private data was missing (picture and strokes gone). */
  missing?: boolean;
}

/** How many marks after the selected one are recognized ahead. */
export const PREFETCH = 3;

/** The id to recognize next, or null. Pure. */
export function nextToRecognize(
  orderedIds: string[],
  selectedId: string | null,
  results: Map<string, MarkRecognition>,
): string | null {
  const pending = (id: string) => !results.has(id);
  if (selectedId && orderedIds.includes(selectedId) && pending(selectedId)) {return selectedId;}
  const start = selectedId ? Math.max(0, orderedIds.indexOf(selectedId) + 1) : 0;
  for (let i = start; i < Math.min(orderedIds.length, start + PREFETCH); i++) {
    if (pending(orderedIds[i])) {return orderedIds[i];}
  }
  return null;
}

export function useRecognitionQueue(marks: OpenMark[], selectedId: string | null): Map<string, MarkRecognition> {
  const [results, setResults] = useState<Map<string, MarkRecognition>>(() => new Map());
  const runningRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    [],
  );

  const ids = marks.map(m => m.mark.id);
  const idsKey = ids.join('|');

  // Text recognized on an earlier open comes from the mark's data at once,
  // for every mark in the list (one small file read each) - only marks
  // without it are recognized, by the queue below.
  // The queue waits for these reads, so a mark with stored text is never
  // sent to the recognizer first.
  const preloadedRef = useRef(new Set<string>());
  const [preloading, setPreloading] = useState(0);
  // Same count, but set at once: the queue effect below runs in the same
  // commit, before the state update lands.
  const inFlightRef = useRef(0);
  useEffect(() => {
    const fresh = marks.filter(m => !preloadedRef.current.has(m.mark.id));
    if (fresh.length === 0) {return;}
    fresh.forEach(m => preloadedRef.current.add(m.mark.id));
    inFlightRef.current += 1;
    setPreloading(n => n + 1);
    Promise.all(fresh.map(m => storedMarkText(m).then(text => [m.mark.id, text] as const).catch(() => [m.mark.id, null] as const))).then(
      found => {
        inFlightRef.current -= 1;
        if (!mountedRef.current) {return;}
        const known = found.filter((f): f is readonly [string, string] => !!f[1]);
        setPreloading(n => n - 1);
        if (known.length === 0) {return;}
        setResults(prev => {
          const next = new Map(prev);
          for (const [id, text] of known) {
            if (!next.has(id)) {next.set(id, {state: 'done', text});}
          }
          return next;
        });
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  useEffect(() => {
    if (runningRef.current || preloading > 0 || inFlightRef.current > 0) {return;}
    // Text-box marks carry their text in the line already.
    const known = new Map(results);
    let added = false;
    for (const m of marks) {
      if (!known.has(m.mark.id) && m.mark.text) {
        known.set(m.mark.id, {state: 'done', text: m.mark.text});
        added = true;
      }
    }
    if (added) {
      setResults(known);
      return;
    }
    const nextId = nextToRecognize(ids, selectedId, results);
    if (!nextId) {return;}
    const open = marks.find(m => m.mark.id === nextId);
    if (!open) {return;}
    runningRef.current = nextId;
    setResults(prev => new Map(prev).set(nextId, {state: 'recognizing', text: ''}));
    recognizeMark(open)
      .then(r => {
        const text = r.text.trim();
        const state: RecognitionState = text ? 'done' : r.error ? 'failed' : 'empty';
        return {state, text, missing: r.missing} as MarkRecognition;
      })
      .catch(e => {
        logWarn('useRecognitionQueue: failed', nextId, e instanceof Error ? e.message : String(e));
        return {state: 'failed', text: ''} as MarkRecognition;
      })
      .then(result => {
        runningRef.current = null;
        if (mountedRef.current) {setResults(prev => new Map(prev).set(nextId, result));}
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, selectedId, results, preloading]);

  return results;
}
