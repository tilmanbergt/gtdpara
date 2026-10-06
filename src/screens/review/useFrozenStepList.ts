/**
 * A Review step's frozen list and its acted-on set.
 *
 * The list is captured once, when the step is entered (the step component
 * mounts) and the aggregate is there, and kept until the step is left: an
 * item the user just fixed stays in the list, checkmarked and still
 * selectable, instead of vanishing mid-step. What a row shows is still read
 * live from the cache; only membership is frozen. `resetKey` re-freezes
 * (and clears the checkmarks) when it changes.
 */
import {useCallback, useEffect, useState} from 'react';

export interface FrozenStepList<T> {
  list: T[];
  /** Keys of rows already acted on in this visit. */
  actedOn: Set<string>;
  markActed: (key: string, acted?: boolean) => void;
  /** Adds a row to the frozen list (no-op before it is frozen). */
  append: (row: T, key: (row: T) => string) => void;
}

export function useFrozenStepList<T>(source: T[] | null | undefined, resetKey: number): FrozenStepList<T> {
  const [list, setList] = useState<T[] | null>(source ?? null);
  const [actedOn, setActedOn] = useState<Set<string>>(() => new Set());
  const [frozenFor, setFrozenFor] = useState(resetKey);

  if (frozenFor !== resetKey) {
    // Re-entry (or reload): freeze again from the current source.
    setFrozenFor(resetKey);
    setList(source ?? null);
    setActedOn(new Set());
  }

  useEffect(() => {
    if (list === null && source) setList(source);
  }, [list, source]);

  const markActed = useCallback((key: string, acted = true) => {
    setActedOn(prev => {
      const next = new Set(prev);
      if (acted) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);

  const append = useCallback((row: T, key: (row: T) => string) => {
    setList(prev => (prev === null || prev.some(r => key(r) === key(row)) ? prev : [...prev, row]));
  }, []);

  return {list: list ?? source ?? [], actedOn, markActed, append};
}
