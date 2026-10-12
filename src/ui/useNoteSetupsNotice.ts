/**
 * The status slot's word on the Tag Rules -> Note setups migration
 * (docs/dev/history/technical-design-note-setups.md §6.6, §8): while the
 * migration report is kept, "Tag Rules are now Note setups · Show" once per
 * start (Show opens Settings → Note setups, where the report waits above
 * the list until OK); when the migration failed, an error that says the
 * notes use the Default until it works.
 */
import {useState} from 'react';
import {GtdParaSettings} from '../domain/settings';
import {didNoteSetupMigrationFail} from '../storage/noteSetupMigrationState';
import {useStatus} from './status/StatusProvider';

export function useNoteSetupsNotice(settings: GtdParaSettings | null, onShow: () => void): void {
  const [seen, setSeen] = useState(false);
  const failed = settings !== null && didNoteSetupMigrationFail();
  useStatus(
    'app.noteSetupsNotice',
    seen || settings === null
      ? null
      : failed
      ? {
          kind: 'error',
          scope: 'global',
          text: 'Updating your Tag Rules to Note setups failed - notes use the Default for now.',
          detail:
            'Your Tag Rules are kept as they are; the update is tried again on the next start. If it keeps failing, export a debug bundle (Settings → About) and attach it to an issue.',
          onDismiss: () => setSeen(true),
        }
      : settings.noteSetupsNotice
      ? {
          kind: 'info',
          scope: 'global',
          text: 'Tag Rules are now Note setups.',
          actions: [
            {
              label: 'Show',
              primary: true,
              onPress: () => {
                setSeen(true);
                onShow();
              },
            },
          ],
          onDismiss: () => setSeen(true),
        }
      : null,
  );
}
