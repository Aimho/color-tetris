import * as Sentry from '@sentry/browser';

let initialized = false;

export function initializeSentry({release, platform}) {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return false;
  Sentry.init({
    dsn,
    release,
    environment:import.meta.env.MODE,
    sendDefaultPii:false,
    tracesSampleRate:0,
    attachStacktrace:true,
    beforeSend(event) {
      delete event.user;
      if (event.request?.url) event.request.url = event.request.url.split('?')[0];
      return event;
    },
  });
  Sentry.setTag('platform', platform);
  initialized = true;
  return true;
}

export function captureClientError(scope, error, context = {}) {
  const captured = error instanceof Error ? error : new Error(String(error || 'Unknown client error'));
  console.error(`[COLOR BOMB] ${scope}`, captured, context);
  if (!initialized) return null;
  return Sentry.withScope(sentryScope => {
    sentryScope.setTag('error_scope', String(scope || 'client').slice(0, 40));
    sentryScope.setContext('color_bomb', sanitizeContext(context));
    return Sentry.captureException(captured);
  });
}

function sanitizeContext(context) {
  return Object.fromEntries(Object.entries(context).map(([key, value]) => [
    String(key).slice(0, 40),
    typeof value === 'number' || typeof value === 'boolean'
      ? value
      : String(value ?? '').slice(0, 240),
  ]));
}
