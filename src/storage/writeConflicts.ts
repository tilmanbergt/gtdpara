/**
 * The open question "which version wins?" after a save met an outside edit to
 * the same part of a data file (docs/dev/history/technical-design-quality-hardening.md
 * §3.2). storage/dataFileWrite.ts asks and waits; ui/useWriteConflicts.ts shows
 * the question in the status slot and answers it.
 *
 * Questions wait in order, one shown at a time. Without the UI installed
 * (tests, before App mounts) and on a profile switch the answer is "file":
 * the choice that writes nothing.
 */
import {onActiveProfileChange} from './profileKeys';

export type ConflictChoice = 'mine' | 'file';

export interface WriteConflict {
  id: number;
  /** The Project's or Area's name, or "Inbox". */
  fileName: string;
  /** The parts changed on both sides (domain/writeGuard.ts). */
  parts: string[];
}

interface Waiting {
  conflict: WriteConflict;
  resolve: (choice: ConflictChoice) => void;
}

const waiting: Waiting[] = [];
const listeners = new Set<() => void>();
let nextId = 1;
let uiInstalled = 0;

function notify(): void {
  Array.from(listeners).forEach(listener => listener());
}

/** The question shown now, or null. */
export function getWriteConflict(): WriteConflict | null {
  return waiting[0]?.conflict ?? null;
}

export function subscribeWriteConflicts(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Marks the UI as able to answer; returns the uninstall. */
export function installWriteConflictUi(): () => void {
  uiInstalled += 1;
  return () => {
    uiInstalled -= 1;
  };
}

/** Asks which version wins; resolves 'file' at once when no UI can answer. */
export function askWriteConflict(fileName: string, parts: string[]): Promise<ConflictChoice> {
  if (uiInstalled === 0) return Promise.resolve('file');
  return new Promise(resolve => {
    waiting.push({conflict: {id: nextId++, fileName, parts}, resolve});
    if (waiting.length === 1) notify();
  });
}

/** Answers question `id`; ignored unless it is the one shown. */
export function answerWriteConflict(id: number, choice: ConflictChoice): void {
  if (waiting[0]?.conflict.id !== id) return;
  const [answered] = waiting.splice(0, 1);
  answered.resolve(choice);
  notify();
}

/** Answers every open question with 'file' - nothing is written. */
export function dropWriteConflicts(): void {
  if (waiting.length === 0) return;
  waiting.splice(0).forEach(w => w.resolve('file'));
  notify();
}

onActiveProfileChange(dropWriteConflicts);
