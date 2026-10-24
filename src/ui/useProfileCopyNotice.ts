/**
 * The one-time copy of saved profiles into the new export folder
 * (docs/dev/history/technical-design-kept-gtd.md §3.3): runs once per start, after the
 * settings loaded, and says in the status slot how many profiles it copied. A later start
 * finds the new folder in use and copies nothing.
 */
import {useEffect, useRef, useState} from 'react';
import {GtdParaSettings} from '../domain/settings';
import {copyLegacyProfiles} from '../storage/profiles';
import {useStatus} from './status/StatusProvider';

export function useProfileCopyNotice(settings: GtdParaSettings | null): void {
  const [text, setText] = useState<string | null>(null);
  const started = useRef(false);
  const ready = settings !== null;
  useEffect(() => {
    if (!ready || started.current) return;
    started.current = true;
    void copyLegacyProfiles().then(setText);
  }, [ready]);
  useStatus('app.profileCopyNotice', text ? {kind: 'info', scope: 'global', text, onDismiss: () => setText(null)} : null);
}

