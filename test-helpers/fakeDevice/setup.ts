/**
 * Jest setup for the scenario tests (jest.config.js, project "scenarios"):
 * installs the fake device before any app module loads
 * (docs/dev/history/technical-design-quality-hardening.md §4.2).
 */
import {NativeModules} from 'react-native';
import {forwarding} from './device';
import {fakeTextboxMetrics} from './fakeSdk';

NativeModules.GtdParaFile = forwarding(d => d.fs.module);
NativeModules.GtdParaPdf = forwarding(d => d.pdf.module);
NativeModules.TextboxMetrics = fakeTextboxMetrics;
NativeModules.GtdParaRuntime = {
  getRuntimeDiagnostics: async () => ({
    buildId: 'scenario',
    versionCode: '0',
    loaderId: 'scenario',
    pid: 1,
    processAgeMs: 1000,
    npkPath: null,
    staleBuilds: [],
    mappedFiles: [],
    registry: [],
    scanError: null,
    model: 'Fake A5 X',
    manufacturer: 'Fake',
    display: '1404x1872',
    androidRelease: '11',
  }),
};

jest.mock('sn-plugin-lib', () => {
  const {forwarding: fwd} = require('./device');
  const part = (key: string) => fwd((d: {sdk: {module: Record<string, object>}}) => d.sdk.module[key]);
  return {
    NativePluginManager: part('NativePluginManager'),
    PluginManager: part('PluginManager'),
    PluginCommAPI: part('PluginCommAPI'),
    PluginFileAPI: part('PluginFileAPI'),
    PluginNoteAPI: part('PluginNoteAPI'),
    PluginDocAPI: part('PluginDocAPI'),
  };
});

jest.mock('../../src/utils/log', () => {
  const {device: dev} = require('./device');
  const text = (args: unknown[]) => args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
  return {
    log: (...args: unknown[]) => dev().logs.push({level: 'info', text: text(args)}),
    logWarn: (...args: unknown[]) => dev().logs.push({level: 'warn', text: text(args)}),
    logError: (...args: unknown[]) => dev().logs.push({level: 'error', text: text(args)}),
  };
});

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('@react-native-clipboard/clipboard', () => ({setString: jest.fn(), getString: jest.fn(async () => '')}));
jest.mock('react-native-svg', () => {
  const ReactLib = require('react');
  const stub = (props: object) => ReactLib.createElement('Svg', props);
  return {__esModule: true, default: stub, Svg: stub, Path: stub, Circle: stub, Rect: stub, Line: stub, Polyline: stub, G: stub, Text: stub};
});
