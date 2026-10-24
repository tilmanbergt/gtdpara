// The fake SDK's page content must behave like PluginFileAPI's element calls, or the
// scenarios that create note pages with pieces prove nothing (technical-design-meeting-reflection.md, Part C H1).
import {FakeFs} from '../../test-helpers/fakeDevice/fakeFs';
import {FakeElement, FakeSdk, fakeTextboxMetrics} from '../../test-helpers/fakeDevice/fakeSdk';

const NOTE = '/N/2 Areas/Coaching/Meetings/sparring.note';

let sdk: FakeSdk;
beforeEach(() => {
  sdk = new FakeSdk(new FakeFs());
  sdk.putNote(NOTE, [{keywords: ['2026-10-18']}, {}]);
});

async function element(type: number, extra: Partial<FakeElement>): Promise<FakeElement> {
  const {result} = await sdk.module.PluginCommAPI.createElement(type);
  return {...result!, ...extra};
}

const textbox = (text: string, userData: string) => element(500, {userData, textBox: {textContentFull: text}});

it('keeps inserted elements per page, numbered from 1, and deletes by number', async () => {
  const api = sdk.module.PluginFileAPI;
  await api.insertElements(NOTE, 1, [await textbox('Heading', 'a'), await textbox('What did I notice?', 'b')]);
  const {result} = (await api.getElements(1, NOTE)) as {result: Array<{numInPage: number; userData: string}>};
  expect(result.map(e => [e.numInPage, e.userData])).toEqual([[1, 'a'], [2, 'b']]);
  expect(((await api.getElements(0, NOTE)) as {result: unknown[]}).result).toEqual([]);

  await api.deleteElements(NOTE, 1, [1]);
  const after = (await api.getElements(1, NOTE)) as {result: Array<{numInPage: number; userData: string}>};
  expect(after.result.map(e => [e.numInPage, e.userData])).toEqual([[1, 'b']]);
});

it('reports title elements through getTitles and keeps elements when a page is inserted before them', async () => {
  const api = sdk.module.PluginFileAPI;
  await api.insertElements(NOTE, 0, [await textbox('18.10.2026 · Sparring', 'a')]);
  await api.insertElements(NOTE, 0, [await element(100, {title: {controlTrailNums: [1]}})]);
  expect(((await api.getTitles(NOTE, [0, 1])) as {result: unknown[]}).result).toEqual([{controlTrailNums: [1]}]);
  await api.insertNotePage({notePath: NOTE, page: 0});
  expect(sdk.note(NOTE)!.pages.map(p => p.elements.length)).toEqual([0, 2, 0]);
});

it('measures text with a simple fake size', async () => {
  expect(await fakeTextboxMetrics.measureTextLayout({text: 'ab\ncdef', width: 600, fontSize: 36})).toEqual({layoutHeight: 87, lineCount: 2, maxLineWidth: 72});
});
