/**
 * Whether the Tag Rules -> Note setups migration failed in this session
 * (docs/dev/history/technical-design-note-setups.md §8). Set by
 * storage/settingsStorage.ts, read by the status slot and the debug bundle.
 */
let failed = false;

export function markNoteSetupMigrationFailed(): void {
  failed = true;
}

export function didNoteSetupMigrationFail(): boolean {
  return failed;
}
