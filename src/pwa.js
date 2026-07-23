export function isNativeRuntime(scope = globalThis) {
  try {
    return scope.Capacitor?.isNativePlatform?.() === true
      || ['capacitor:', 'ionic:'].includes(scope.location?.protocol);
  } catch {
    return false;
  }
}

export function setupPwa(scope = globalThis) {
  if (isNativeRuntime(scope) || !scope.navigator?.serviceWorker) return;
  scope.addEventListener('load', () => scope.navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
