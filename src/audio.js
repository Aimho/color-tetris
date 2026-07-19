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
