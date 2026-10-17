// The "Related items" piece of a note (storage/meetingNoteAggregate.ts): only context tags relate items.
import {relatedItemsFor} from '../../src/storage/meetingNoteAggregate';
import {item, task} from '../../test-helpers/fixtures';

const garden = item('project', 'Garden', {
  tasks: [
    task('Measure the raised beds #garden #next', {notePath: 'Todos/Measure the raised beds.note'}),
    task('Buy soil #garden'),
    task('Call plumber #next'),
    task('Read manual #someday'),
    task('Order seeds #garden', {done: true}),
  ],
});
const other = item('area', 'Home', {tasks: [task('Fix door #next #now'), task('Ask Anna #wf/anna')]});
const texts = (r: ReturnType<typeof relatedItemsFor>) => r.map(x => x.task.text);

describe('relatedItemsFor', () => {
  it('a todo picked as #next relates to its context tags only, not to every other #next todo', () => {
    const own = garden.tasks[0];
    expect(texts(relatedItemsFor([garden, other], null, own.tags, own.notePath))).toEqual(['Buy soil #garden']);
  });
  it('flow words, #now and Waiting For never relate items on their own', () => {
    expect(relatedItemsFor([garden, other], null, ['next', 'now', 'someday', 'wf/anna'])).toEqual([]);
  });
  it("a meeting's thread tag still relates its todos; #prepped does not", () => {
    const team = item('area', 'Team', {tasks: [task('Draft agenda #retro/alpha'), task('Prep slides #prepped')]});
    expect(texts(relatedItemsFor([team], null, ['retro/alpha', 'prepped']))).toEqual(['Draft agenda #retro/alpha']);
  });
});
