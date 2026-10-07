import {validateAbbrev} from '../../src/domain/abbrev';
import {deriveFlowState, deriveWaitingOn, isContextTag, setFlowStateTag} from '../../src/domain/flowState';
import {deriveTaskFields, extractContextTags} from '../../src/domain/markdown';
import {displayTaskText, taskLabels} from '../../src/domain/taskLabels';
import {task} from '../../test-helpers/fixtures';

describe('Waiting For as #wf', () => {
  it('derives Waiting For from every form', () => {
    for (const text of ['x #wf', 'x #wf/anna', 'x #wf/anna/2026', 'x #waiting-for', 'x #waiting-for:anna']) {
      expect(deriveTaskFields(text).flowState).toBe('waiting-for');
    }
    expect(deriveFlowState(['wfh'])).toBeNull();
  });

  it('reads the counterpart from #wf/<slug> and the legacy form, ignoring deeper segments', () => {
    expect(deriveWaitingOn(['wf/meier-sohn'])).toBe('meier-sohn');
    expect(deriveWaitingOn(['wf/anna/2026'])).toBe('anna');
    expect(deriveWaitingOn(['waiting-for:anna'])).toBe('anna');
    expect(deriveWaitingOn(['wf'])).toBeNull();
  });

  it('setFlowStateTag writes #wf/<slug> or #wf and strips every older form', () => {
    expect(setFlowStateTag('Ask #waiting-for:anna', 'waiting-for', 'marco')).toBe('Ask #wf/marco');
    expect(setFlowStateTag('Ask #wf/anna/2026 now', 'next')).toBe('Ask now #next');
    expect(setFlowStateTag('Ask #waiting-for', 'waiting-for')).toBe('Ask #wf');
    expect(setFlowStateTag('Ask #wf #wfh', null)).toBe('Ask #wfh');
    expect(setFlowStateTag('Ask #wf-team', null)).toBe('Ask #wf-team');
  });

  it('wf is not a context tag; nested context tags still are', () => {
    expect(isContextTag('wf')).toBe(false);
    expect(isContextTag('wf/anna')).toBe(false);
    expect(isContextTag('wfh')).toBe(true);
    expect(isContextTag('retro/alpha')).toBe(true);
    expect(extractContextTags('x #wf/anna #retro/alpha')).toEqual(['retro/alpha']);
  });

  it('refuses WF as an abbreviation', () => {
    expect(validateAbbrev('WF', [])).toEqual({valid: false, reason: {kind: 'reserved'}});
    expect(validateAbbrev('WFH', []).valid).toBe(true);
  });

  it('labels stay #w/f Name and the tag leaves the title', () => {
    const t = task('Quote from landscaper #wf/marco');
    expect(taskLabels(t, 'flat', '2026-10-07').map(l => l.text)).toEqual(['#w/f Marco']);
    expect(displayTaskText(t, 'flat')).toBe('Quote from landscaper');
    expect(taskLabels(task('Ask #wf'), 'flat', '2026-10-07').map(l => l.text)).toEqual(['#w/f']);
  });
});
