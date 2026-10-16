// docs/dev/history/technical-design-note-setups-finish.md §3: the version Settings → About shows.
import {buildVersionText} from '../../src/domain/buildVersionText';

const towards = {version: '0.14.0', label: '0.15.0-beta+ba1ca43', nextVersion: '0.15.0', stage: 'beta', release: false};

describe('buildVersionText', () => {
  it('a release shows its version', () => {
    expect(buildVersionText({version: '0.15.0', label: '0.15.0', nextVersion: null, stage: null, release: true})).toBe('0.15.0');
  });
  it('a build towards the next version shows that version and its stage, not the last release', () => {
    expect(buildVersionText(towards)).toBe('0.15.0 beta');
    expect(buildVersionText({...towards, label: '0.15.0-alpha+ba1ca43', stage: 'alpha'})).toBe('0.15.0 alpha');
  });
  it('any other development build shows its label', () => {
    expect(buildVersionText({version: '0.14.0', label: '0.14.0+dev.a1b2c3d', nextVersion: null, stage: null, release: false})).toBe('0.14.0+dev.a1b2c3d');
  });
});
