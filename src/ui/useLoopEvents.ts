/**
 * Mounted once (App.tsx): installs the loop conversion after task saves
 * (storage/loops.ts), loads the loop kinds, and shows what the conversion
 * did in the status slot - Quick Add itself only relabels its button
 * (docs/dev/history/technical-design-loops.md §4.1).
 */
import {useEffect, useState} from 'react';
import {reloadLoopKinds} from '../storage/loopKinds';
import {installLoopConversion, LoopEvent, subscribeLoopEvents} from '../storage/loops';
import {useStatus} from './status/StatusProvider';
import {StatusMessage} from './status/types';

/** The status text for a loop event. */
export function loopEventText(event: LoopEvent): string {
  switch (event.kind) {
    case 'started':
      return `Loop ${event.tag} started in ${event.owner}${event.noteMovedTo ? ` - its note is now ${event.noteMovedTo}` : ''}`;
    case 'tracked':
      return `Loop ${event.tag} tracked in ${event.owner}`;
    case 'saved':
      return `Loop ${event.tag} saved${event.renamedFrom ? ` (was ${event.renamedFrom})` : ''}${event.noteRenamedTo ? ` - its note is now ${event.noteRenamedTo}` : ''}`;
    case 'status':
      return event.status === 'active' ? `Loop ${event.tag} reopened` : `Loop ${event.tag} closed: ${event.status}`;
    case 'linked':
      return `Loop ${event.tag} links ${event.file}`;
    case 'failed':
      return event.text;
  }
}

export function useLoopEvents(): void {
  const [event, setEvent] = useState<LoopEvent | null>(null);
  useEffect(() => {
    reloadLoopKinds().catch(() => undefined); // silent: loadSettings logs its own failure
    const uninstall = installLoopConversion();
    const unsubscribe = subscribeLoopEvents(setEvent);
    return () => {
      unsubscribe();
      uninstall();
    };
  }, []);
  const message: StatusMessage | null = event
    ? {kind: event.kind === 'failed' ? 'error' : 'success', text: loopEventText(event), onDismiss: () => setEvent(null), scope: 'global'}
    : null;
  useStatus('loops.event', message);
}
