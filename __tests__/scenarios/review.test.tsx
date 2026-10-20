import {expectShows, firstCheckboxOf, openApp, tap, tapTab, texts, type} from '../../test-helpers/scenario/app';
import {dataFile, INBOX_FILE, projectFile, putFile, sectionLines} from '../../test-helpers/scenario/files';
import {and, given, scenario, then, when} from '../../test-helpers/scenario/scenario';

scenario('Weekly Review: get the Inbox to zero by filing one todo and finishing the other', {feature: 'Weekly Review', design: 'technical-design-review-hub.md'}, () => {
  given('the Inbox has "Ask about hosting" and "Buy milk", and project "Website" is #WEB', () => {
    putFile(projectFile('Website'), dataFile('project', {Scope: [], Tasks: ['- [ ] Write copy #next'], Meetings: []}, ['abbrev: WEB']));
    putFile(INBOX_FILE, dataFile('inbox', {Tasks: ['- [ ] Ask about hosting', '- [ ] Buy milk'], Meetings: []}));
  });
  when('I open Review, the step "Inbox to zero", file "Ask about hosting" with #WEB and tick "Buy milk" off', async () => {
    await openApp();
    await tapTab('Review');
    await tap('Inbox to zero');
    await tap('Ask about hosting');
    await type('New task', 'Ask about hosting #WEB');
    await tap(/^File: Website/);
    await tap('☐', firstCheckboxOf('Buy milk'));
  });
  then('"Ask about hosting" is in Website\'s project.txt', () => {
    expect(sectionLines(projectFile('Website'), 'Tasks')).toContainEqual(expect.stringMatching(/^- \[ \] Ask about hosting/));
  });
  and('the Inbox has only "Buy milk", done', () => {
    expect(sectionLines(INBOX_FILE, 'Tasks')).toEqual([expect.stringMatching(/^- \[x\] Buy milk/)]);
  });
  when('I tap "Reviewed ›" and go back to the overview', async () => {
    await tap('Reviewed ›');
    expectShows(/Step 5 of 12 — Stalled projects/);
    await tap('Overview');
  });
  then('the overview says "2 inbox items cleared" and the Inbox step has nothing left to review', () => {
    expectShows('• 2 inbox items cleared');
    const all = texts();
    expect(all[all.indexOf('Inbox to zero') + 1]).toBe('nothing to review');
  });
});
