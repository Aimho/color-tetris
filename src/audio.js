export function getAudioContextClass(scope=globalThis) {
  return scope.AudioContext || scope.webkitAudioContext || null;
}

export function configureAudioSession(navigatorScope=globalThis.navigator) {
  try {
    if (!navigatorScope?.audioSession) return false;
    navigatorScope.audioSession.type = 'playback';
    return navigatorScope.audioSession.type === 'playback';
  } catch {
    return false;
  }
}

export function primeLegacyMediaChannel(scope=globalThis) {
  if (!scope.Audio || !scope.Blob || !scope.URL?.createObjectURL) return Promise.resolve(false);
  try {
    const wav = new Uint8Array([
      82,73,70,70,38,0,0,0,87,65,86,69,102,109,116,32,16,0,0,0,1,0,1,0,
      68,172,0,0,136,88,1,0,2,0,16,0,100,97,116,97,2,0,0,0,0,0,
    ]);
    const url = scope.URL.createObjectURL(new scope.Blob([wav], {type:'audio/wav'}));
    const media = new scope.Audio(url);
    media.setAttribute?.('playsinline', '');
    const played = media.play();
    return Promise.resolve(played).then(() => true, () => false).finally(() => {
      media.pause?.();
      scope.URL.revokeObjectURL(url);
    });
  } catch {
    return Promise.resolve(false);
  }
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
