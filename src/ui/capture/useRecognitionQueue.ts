/**
 * Recognizes open marks while the capture screen is open
 * (docs/dev/technical-design-lasso-0.8.md §3.7): the selected mark first,
 * then the next PREFETCH marks in list order, one at a time (the host
 * recognizer is never asked twice at once). Results stay in memory for the
 * life of the screen - nothing is written back to the mark line.
 */
import {useEffect, useRef, useState} from 'react';
import {OpenMark} from '../../domain/marks';
import {recognizeMark} from '../../storage/marks';
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

  useEffect(() => {
    if (runningRef.current) {return;}
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
  }, [idsKey, selectedId, results]);

  return results;
}
