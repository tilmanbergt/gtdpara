import {isoDateOffset} from '../../src/domain/meetingTime';
import {expectShows, openApp, tap, tapTab, type} from '../../test-helpers/scenario/app';
import {INBOX_FILE, sectionLines} from '../../test-helpers/scenario/files';
import {given, scenario, then, when} from '../../test-helpers/scenario/scenario';

const inAWeek = () => isoDateOffset(7);

scenario('Add a meeting for next week from Daily', {feature: 'Daily', design: 'technical-design-cache-subscription-and-shared-add-path.md'}, () => {
  given('an empty PARA folder', () => undefined);
  when('I open Daily, switch Quick Add to Meeting, enter "Team sync" a week from today and tap + Add', async () => {
    await openApp();
    await tapTab('Daily');
    await tap('Meeting');
    await type('New meeting title', 'Team sync');
    await type('YYYY-MM-DD', inAWeek());
    await tap('+ Add');
  });
  then('Inbox.txt has the meeting on that date', () => {
    expect(sectionLines(INBOX_FILE, 'Meetings')).toEqual([expect.stringContaining(`${inAWeek()}`)]);
    expect(sectionLines(INBOX_FILE, 'Meetings')[0]).toContain('Team sync');
  });
  then('the status line says where it went, since Daily doesn\'t show next week', () => {
    expectShows(/Added meeting "Team sync" to Inbox - next week/);
  });
});
