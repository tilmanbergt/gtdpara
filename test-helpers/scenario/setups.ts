/**
 * Note setups for scenario tests: the settings a scenario hands to `openApp`
 * when its meetings or todos belong to a setup.
 */
import {GtdParaSettings} from '../../src/domain/settings';
import {createDefaultReviewPage, NoteSetup, seedNoteSetupDefaults} from '../../src/domain/noteSetups';
import {addPiece, addTextItem, PageLayout} from '../../src/domain/pageLayout';

/** A Reflection page with its heading (Date & title) and one guiding question as a text piece. */
export function reflectionPageWith(question: string): PageLayout {
  const {layout, id} = addTextItem(createDefaultReviewPage(), question, question);
  return addPiece(layout, 'text', question, id);
}

/**
 * A Thread setup "Sparring" on `#sparring`: one notebook per counterpart and
 * year (`{tag} {subtag} {year}`) in the folder `Meetings`, tracking prep and
 * review, with an own Reflection page asking "What did I notice?"; the seeded
 * Default for everything else.
 */
export function sparringSettings(): Partial<GtdParaSettings> {
  const sparring: NoteSetup = {
    id: 's1',
    name: 'Sparring',
    kind: 'thread',
    tags: ['sparring'],
    enabled: true,
    notebook: {name: '{tag} {subtag} {year}', folder: 'Meetings'},
    pages: {review: reflectionPageWith('What did I notice?')},
    tracking: {trackPrep: true, trackReview: true},
  };
  return {noteSetups: [sparring], noteSetupDefaults: seedNoteSetupDefaults(), nextNoteSetupId: 2, noteSetupsMigrated: true};
}
