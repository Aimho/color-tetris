const PENDING_RANKED_RUN_KEY = 'color-bomb-pending-ranked-run-v1';

export function isRetryableRankedError(error) {
  const code = String(error?.code || '');
  return ![
    'functions/invalid-argument',
    'functions/permission-denied',
    'functions/not-found',
    'functions/deadline-exceeded',
    'functions/failed-precondition',
  ].includes(code);
}

export function readPendingRankedRun(storage = globalThis.localStorage) {
  try {
    const pending = JSON.parse(storage?.getItem(PENDING_RANKED_RUN_KEY) || 'null');
    if (!pending || !/^[0-9a-f-]{36}$/.test(String(pending.runId || '')) || !pending.ledger) return null;
    return pending;
  } catch {
    return null;
  }
}

export function rememberPendingRankedRun(pending, storage = globalThis.localStorage) {
  try { storage?.setItem(PENDING_RANKED_RUN_KEY, JSON.stringify(pending)); } catch { /* private mode */ }
}

export function clearPendingRankedRun(runId, storage = globalThis.localStorage) {
  const pending = readPendingRankedRun(storage);
  if (!pending || pending.runId !== runId) return;
  try { storage?.removeItem(PENDING_RANKED_RUN_KEY); } catch { /* private mode */ }
}
