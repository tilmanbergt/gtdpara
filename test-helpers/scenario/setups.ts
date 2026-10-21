/**
 * Note setups for scenario tests: the settings a scenario hands to `openApp`
 * when its meetings or todos belong to a setup.
 */
import {GtdParaSettings} from '../../src/domain/settings';
import {NoteSetup, seedNoteSetupDefaults} from '../../src/domain/noteSetups';

/**
 * A Thread setup "Sparring" on `#sparring`: one notebook per counterpart and
 * year (`{tag} {subtag} {year}`) in the folder `Meetings`, tracking prep and
 * review; the seeded Default for everything else.
 */
export function sparringSettings(): Partial<GtdParaSettings> {
  const sparring: NoteSetup = {
    id: 's1',
    name: 'Sparring',
    kind: 'thread',
    tags: ['sparring'],
    enabled: true,
    notebook: {name: '{tag} {subtag} {year}', folder: 'Meetings'},
    pages: {},
    tracking: {trackPrep: true, trackReview: true},
  };
  return {noteSetups: [sparring], noteSetupDefaults: seedNoteSetupDefaults(), nextNoteSetupId: 2, noteSetupsMigrated: true};
}
