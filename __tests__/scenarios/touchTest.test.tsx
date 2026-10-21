import {act, fireEvent, screen} from '@testing-library/react-native';
import {StyleSheet} from 'react-native';
import {setAppWideTouchLog} from '../../src/utils/touchDiagStore';
import {device} from '../../test-helpers/fakeDevice/device';
import {expectShows, openApp, shows, tap, tapTab} from '../../test-helpers/scenario/app';
import {dataFile, INBOX_FILE, putFile, fileText} from '../../test-helpers/scenario/files';
import {and, given, scenario, then, when} from '../../test-helpers/scenario/scenario';

const DEBUG_FOLDER = '/storage/emulated/0/EXPORT/gtdpara/debug';

/** The touch test's observer: the view that watches touches without handling them. */
function observer() {
  const node = screen.UNSAFE_root.findAll(n => typeof n.props.onTouchStart === 'function' && typeof n.props.onTouchCancel === 'function', {deep: true})[0];
  if (!node) throw new Error('no touch observer on screen');
  return node;
}

/** One finger contact at (x, y); `during` runs between touch-down and lift (the press the row would see). */
async function touch(x: number, y: number, during: () => void = () => undefined): Promise<void> {
  const point = {identifier: 0, pageX: x, pageY: y};
  fireEvent(observer(), 'touchStart', {nativeEvent: {changedTouches: [point], touches: [point]}});
  during();
  fireEvent(observer(), 'touchEnd', {nativeEvent: {changedTouches: [point], touches: []}});
  // The touch is classified once its late press events had time to arrive.
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 400));
  });
}

scenario('Record taps in the touch test without changing anything', {feature: 'Settings', design: 'technical-design-touch-test.md'}, () => {
  given('the Inbox has the todo "Call Anna"', () => {
    putFile(INBOX_FILE, dataFile('inbox', {Tasks: ['- [ ] Call Anna'], Meetings: []}));
  });
  when('I open Settings → Advanced → Touch test', async () => {
    await openApp();
    await tapTab('Settings');
    await tap('Advanced');
    await tap('Touch test');
  });
  then('numbered sample rows show, also rows that are only tags, and none of my todos', () => {
    expectShows(/^1 Buy stamps$/);
    expectShows('#phone #office');
    expect(shows(/Call Anna/)).toBe(false);
    expectShows('No touch received yet.');
  });
  when('I tap the title of row 1', async () => {
    await touch(200, 300, () => fireEvent.press(screen.getAllByText(/^1 Buy stamps$/)[0]));
  });
  then('the info column says the title of row 1 was handled', () => {
    expectShows('Row 1 · title · handled');
    expectShows(/^Taps received: 1\./);
  });
  when('I say it was intended', async () => {
    await tap('Intended');
  });
  when('I tap a spot where nothing reacts and say it was not intended', async () => {
    await touch(20, 600);
    expectShows('Nothing hit');
    await tap('Not intended');
  });
  then('it asks for a tap on what I meant', () => {
    expectShows('Tap what you meant (use the pen)');
  });
  when('I tap the title of row 2', async () => {
    await touch(200, 360, () => fireEvent.press(screen.getAllByText(/^2 Write the long summary/)[0]));
  });
  then('that tap is stored as what I meant, not counted as a test tap', () => {
    expectShows('You meant: Row 2 · title');
    expectShows(/^Taps received: 2\./);
  });
  when('I tap the #next label of row 4 once', async () => {
    await touch(300, 200, () => fireEvent.press(screen.getAllByText('#next')[0]));
  });
  then('it says the label swallowed the tap, and the label is drawn filled', () => {
    expectShows('Row 4 · label #next · swallowed (needs double tap)');
    expect(StyleSheet.flatten(screen.getAllByText('#next')[0].props.style)).toMatchObject({backgroundColor: '#000000'});
  });
  when('I swap sides, tap the checkbox of row 1 and then Save log', async () => {
    await tap('⇄ Swap sides');
    await touch(530, 300, () => fireEvent.press(screen.getAllByText('☐')[0]));
    await tap('Save log');
  });
  then('a CSV with the four test taps, their sides and verdicts is in EXPORT/gtdpara/debug, and the status line says so', () => {
    const csv = device()
      .fs.paths(DEBUG_FOLDER)
      .filter(p => /touch-.*\.csv$/.test(p));
    expect(csv).toHaveLength(1);
    expect(fileText(csv[0]).trim().split('\n')).toEqual([
      'id,mode,side,band,x,y,endX,endY,maxMove,ms,pointers,class,target,verdict,intendedTarget',
      expect.stringMatching(/^\d+,finger,left,\w+,400,600,400,600,0,\d+,1,handled,1:title,intended,$/),
      expect.stringMatching(/,left,.*,noTarget,,notIntended,2:title$/),
      expect.stringMatching(/,left,.*,swallowed,4:label:next,,$/),
      expect.stringMatching(/,right,.*,handled,1:checkbox,,$/),
    ]);
    expectShows(/^Saved 4 touches as touch-.*\.csv in EXPORT\/gtdpara\/debug\.$/);
  });
  and('the Inbox is untouched: the tapped checkbox ticked nothing', () => {
    expect(fileText(INBOX_FILE)).toContain('- [ ] Call Anna');
  });
  when('I tap Close', async () => {
    await tap('Close');
  });
  then('Settings → Advanced shows again', () => {
    expectShows('Touch test');
    expectShows('Run Integrity Check');
  });
});

/** The app-wide observer's log lines so far. */
const appTouchLines = () =>
  device()
    .logs.map(l => l.text)
    .filter(t => t.startsWith('touch(app):'));

scenario('Log touches on every screen while "Log touches everywhere" is on', {feature: 'Settings', design: 'technical-design-touch-test.md'}, () => {
  given('an empty PARA folder', () => undefined);
  when('I switch on "Log touches everywhere" in the touch test, tap once in it, close it and tap twice on Daily', async () => {
    await openApp();
    await tapTab('Settings');
    await tap('Advanced');
    await tap('Touch test');
    await tap('Log touches everywhere: OFF');
    expectShows('Log touches everywhere: ON');
    await touch(200, 300);
    await tap('Close');
    await tapTab('Daily');
    await touch(500, 1200);
    await touch(40, 90);
  });
  then('the log has one line per tap on Daily, with numbers only; the tap in the touch test has only its own line', () => {
    expect(device().logs.filter(l => l.text.startsWith('touch: '))).toHaveLength(1);
    const lines = appTouchLines();
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/touch\(app\): band=\w+ x=\d+ y=\d+ dx=0 dy=0 move=0 ms=\d+ pointers=1 end=lift$/);
  });
  when('I switch it off again', () => {
    act(() => setAppWideTouchLog(false));
  });
  then('no touch handler is attached to the app any more', () => {
    expect(() => observer()).toThrow('no touch observer on screen');
    expect(appTouchLines()).toHaveLength(2);
  });
});
