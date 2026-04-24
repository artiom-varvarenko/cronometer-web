import { useRef, type PropsWithChildren, type ReactElement } from 'react';
import { AudioEngine } from './AudioEngine';
import { AudioEngineContext } from './useAudio';

export function AudioProvider({ children }: PropsWithChildren): ReactElement {
  const engineRef = useRef<AudioEngine | null>(null);
  if (!engineRef.current) engineRef.current = new AudioEngine();
  return (
    <AudioEngineContext.Provider value={engineRef.current}>
      {children}
    </AudioEngineContext.Provider>
  );
}
