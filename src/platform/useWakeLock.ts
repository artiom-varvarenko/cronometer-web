import { useEffect } from 'react';

// Minimal structural typing so this works in older lib.dom.d.ts and in test
// environments (jsdom has no wakeLock).
interface WakeLockSentinelLike {
  release(): Promise<void>;
  addEventListener(type: 'release', listener: () => void): void;
  removeEventListener(type: 'release', listener: () => void): void;
}

interface WakeLockLike {
  request(type: 'screen'): Promise<WakeLockSentinelLike>;
}

function getWakeLock(): WakeLockLike | null {
  if (typeof navigator === 'undefined') return null;
  const nav = navigator as Navigator & { wakeLock?: WakeLockLike };
  return nav.wakeLock ?? null;
}

// Holds a screen wake-lock while `active` is true. The browser automatically
// drops the lock when the document becomes hidden, so we re-request it on
// `visibilitychange`. Silent no-op on browsers without the API.
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const wakeLock = getWakeLock();
    if (!wakeLock) return;

    let sentinel: WakeLockSentinelLike | null = null;
    let cancelled = false;

    const onRelease = () => {
      sentinel = null;
    };

    const acquire = async () => {
      if (cancelled) return;
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        return;
      }
      try {
        const s = await wakeLock.request('screen');
        if (cancelled) {
          void s.release().catch(() => undefined);
          return;
        }
        s.addEventListener('release', onRelease);
        sentinel = s;
      } catch {
        // NotAllowedError etc. — nothing we can do from here.
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible' && sentinel === null) {
        void acquire();
      }
    };

    void acquire();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      if (sentinel) {
        const s = sentinel;
        sentinel = null;
        s.removeEventListener('release', onRelease);
        void s.release().catch(() => undefined);
      }
    };
  }, [active]);
}
