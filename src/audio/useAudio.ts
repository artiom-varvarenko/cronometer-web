import { createContext, useContext } from 'react';
import { AudioEngine } from './AudioEngine';

export const AudioEngineContext = createContext<AudioEngine | null>(null);

export function useAudio(): AudioEngine {
  const engine = useContext(AudioEngineContext);
  if (!engine) {
    throw new Error('useAudio must be used inside <AudioProvider>');
  }
  return engine;
}
