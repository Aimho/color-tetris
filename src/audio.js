export function getAudioContextClass(scope=globalThis) {
  return scope.AudioContext || scope.webkitAudioContext || null;
}

export function createAudioContext(scope=globalThis) {
  const AudioContextClass=getAudioContextClass(scope);
  if (!AudioContextClass) return null;
  try { return new AudioContextClass(); }
  catch { return null; }
}

export function resumeIfSuspended(context) {
  if (context && context.state !== 'running' && context.state !== 'closed') return context.resume();
  return Promise.resolve();
}

export async function unlockAudioContext(context) {
  if (!context || context.state === 'closed') return false;
  try {
    const resumePromise = resumeIfSuspended(context);
    const buffer = context.createBuffer(1, 1, context.sampleRate || 44100);
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    source.start(0);
    await resumePromise;
    return context.state === 'running';
  } catch {
    return false;
  }
}
