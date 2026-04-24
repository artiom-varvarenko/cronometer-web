import { renderHook, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useWakeLock } from '../src/platform/useWakeLock';

// Minimal in-memory stand-in for the WakeLock API. JSDOM has no wakeLock,
// so every test that exercises the live path must install this explicitly.
interface FakeSentinel {
  released: boolean;
  release: ReturnType<typeof vi.fn>;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
}

interface FakeWakeLockHarness {
  request: ReturnType<typeof vi.fn>;
  sentinels: FakeSentinel[];
}

function installFakeWakeLock(): FakeWakeLockHarness {
  const sentinels: FakeSentinel[] = [];
  const request = vi.fn(async () => {
    const sentinel: FakeSentinel = {
      released: false,
      release: vi.fn(async () => {
        sentinel.released = true;
      }),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    sentinels.push(sentinel);
    return sentinel;
  });
  Object.defineProperty(navigator, 'wakeLock', {
    configurable: true,
    value: { request },
  });
  return { request, sentinels };
}

function removeFakeWakeLock() {
  Object.defineProperty(navigator, 'wakeLock', {
    configurable: true,
    value: undefined,
  });
}

beforeEach(() => {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => 'visible',
  });
});

afterEach(() => {
  removeFakeWakeLock();
});

describe('useWakeLock', () => {
  it('is a silent no-op when navigator.wakeLock is not available', () => {
    removeFakeWakeLock();
    expect(() => {
      renderHook(({ active }) => useWakeLock(active), {
        initialProps: { active: true },
      });
    }).not.toThrow();
  });

  it('requests a screen wake-lock when active is true', async () => {
    const harness = installFakeWakeLock();
    renderHook(({ active }) => useWakeLock(active), {
      initialProps: { active: true },
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(harness.request).toHaveBeenCalledWith('screen');
    expect(harness.sentinels).toHaveLength(1);
  });

  it('releases the sentinel on unmount', async () => {
    const harness = installFakeWakeLock();
    const { unmount } = renderHook(({ active }) => useWakeLock(active), {
      initialProps: { active: true },
    });
    await act(async () => {
      await Promise.resolve();
    });
    const sentinel = harness.sentinels[0]!;

    unmount();
    await act(async () => {
      await Promise.resolve();
    });
    expect(sentinel.release).toHaveBeenCalled();
  });

  it('releases the sentinel when active flips to false', async () => {
    const harness = installFakeWakeLock();
    const { rerender } = renderHook(({ active }) => useWakeLock(active), {
      initialProps: { active: true },
    });
    await act(async () => {
      await Promise.resolve();
    });
    const sentinel = harness.sentinels[0]!;

    rerender({ active: false });
    await act(async () => {
      await Promise.resolve();
    });
    expect(sentinel.release).toHaveBeenCalled();
  });

  it('does not request a wake-lock when active starts false', async () => {
    const harness = installFakeWakeLock();
    renderHook(({ active }) => useWakeLock(active), {
      initialProps: { active: false },
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(harness.request).not.toHaveBeenCalled();
  });
});
