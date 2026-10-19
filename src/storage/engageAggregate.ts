/**
 * The Engage panel's data (docs/dev/history/technical-design-engage.md §3.1):
 * a pure, synchronous transform over the warm cache, the
 * storage/threadAggregate.ts posture - no file reads here. Items that failed
 * to load are left out; the Inbox is never an owner: its lists serve the
 * thread lens's provenance and "Today next" (a thread's scope never includes
 * it).
 */
import {threadTypesOf} from '../domain/counterparts';
import {EngageInbox, EngageSource} from '../domain/engageOwner';
import {loopKindsOf} from '../domain/loops';
import {NoteSetup} from '../domain/noteSetups';
import {CachedItem} from './dataCache';
import {ProjectFileState} from './projectFile';
import {ThreadSource} from './threadAggregate';

/** The Inbox as Engage reads it: its folder and lists; null without a path. Lists are empty until the Inbox is loaded. */
export function engageInboxOf(path: string | null, inbox: Pick<ProjectFileState, 'tasks' | 'meetings'> | null): EngageInbox | null {
  return path ? {path, tasks: inbox?.tasks ?? [], meetings: inbox?.meetings ?? []} : null;
}

export function engageSourceOf(items: readonly CachedItem[], inbox: EngageInbox | null, noteSetups: readonly NoteSetup[]): EngageSource {
  return {
    items: items.filter(item => !item.loadError),
    inbox,
    loopKinds: loopKindsOf(noteSetups),
    threadTypes: threadTypesOf(noteSetups),
  };
}

/** The Projects and Areas as page-lookup sources (storage/notePageEntry.ts); the Inbox has no owner. */
export function pageSourcesOf(source: EngageSource): ThreadSource[] {
  return source.items.map(item => ({
    ref: {kind: item.kind, name: item.name, path: item.path, abbrev: item.abbrev},
    tasks: [...item.tasks],
    meetings: [...item.meetings],
  }));
}
