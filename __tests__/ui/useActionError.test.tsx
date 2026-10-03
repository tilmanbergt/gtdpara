import React from 'react';
import TestRenderer, {act} from 'react-test-renderer';

const mockLogError = jest.fn();
const mockStatuses: Array<string | null | undefined> = [];
jest.mock('../../src/utils/log', () => ({log: jest.fn(), logWarn: jest.fn(), logError: (...a: unknown[]) => mockLogError(...a)}));
jest.mock('../../src/ui/status/StatusProvider', () => ({
  useErrorStatus: (_name: string, error: string | null | undefined) => {
    mockStatuses.push(error);
  },
}));

import {ActionError, useActionError} from '../../src/ui/useActionError';

function harness(): {current: ActionError} {
  const ref = {} as {current: ActionError};
  function Probe(): null {
    ref.current = useActionError('Test.error', 'Test: action failed');
    return null;
  }
  act(() => {
    TestRenderer.create(<Probe />);
  });
  return ref;
}

describe('useActionError', () => {
  beforeEach(() => {
    mockLogError.mockClear();
    mockStatuses.length = 0;
  });

  it('runSave resolves true and leaves no error on success', async () => {
    const h = harness();
    let ok: boolean | undefined;
    await act(async () => {
      ok = await h.current.runSave(async () => undefined);
    });
    expect(ok).toBe(true);
    expect(h.current.error).toBeNull();
    expect(mockLogError).not.toHaveBeenCalled();
  });

  it('runSave resolves false, logs and shows the message on failure', async () => {
    const h = harness();
    let ok: boolean | undefined;
    await act(async () => {
      ok = await h.current.runSave(async () => {
        throw new Error('disk full');
      });
    });
    expect(ok).toBe(false);
    expect(h.current.error).toBe('disk full');
    expect(mockLogError).toHaveBeenCalledWith('Test: action failed', 'disk full');
    expect(mockStatuses).toContain('disk full');
  });

  it('run never rejects and a later success clears the error', async () => {
    const h = harness();
    await act(async () => {
      await h.current.run(async () => {
        throw 'plain string';
      });
    });
    expect(h.current.error).toBe('plain string');
    await act(async () => {
      await h.current.run(async () => undefined);
    });
    expect(h.current.error).toBeNull();
  });

  it('clear removes the error', async () => {
    const h = harness();
    await act(async () => {
      await h.current.run(async () => {
        throw new Error('x');
      });
    });
    act(() => h.current.clear());
    expect(h.current.error).toBeNull();
  });
});
