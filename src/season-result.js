const ACKNOWLEDGED_SEASONS_KEY = 'color-bomb-season-results-acknowledged-v1';

function validSeasonResult(result) {
  return /^\d{4}-\d{2}$/.test(result?.season || '');
}

export function readAcknowledgedSeasons(storage = globalThis.localStorage) {
  try {
    const value = JSON.parse(storage?.getItem(ACKNOWLEDGED_SEASONS_KEY) || '[]');
    return Array.isArray(value) ? value.filter(season => /^\d{4}-\d{2}$/.test(season)) : [];
  } catch {
    return [];
  }
}

export function pendingSeasonResult(profile, storage = globalThis.localStorage) {
  const acknowledged = new Set(readAcknowledgedSeasons(storage));
  return (profile?.seasonResults || [])
    .filter(validSeasonResult)
    .sort((a, b) => a.season.localeCompare(b.season))
    .find(result => !acknowledged.has(result.season)) || null;
}

export function shouldShowSeasonResult(profile, storage = globalThis.localStorage) {
  return Boolean(pendingSeasonResult(profile, storage));
}

export function acknowledgeSeasonResult(profile, storage = globalThis.localStorage) {
  const result = pendingSeasonResult(profile, storage);
  if (!result) return false;
  try {
    const acknowledged = new Set(readAcknowledgedSeasons(storage));
    acknowledged.add(result.season);
    storage?.setItem(ACKNOWLEDGED_SEASONS_KEY, JSON.stringify([...acknowledged].sort()));
    return true;
  } catch {
    return false;
  }
}

export function formatSeasonResultSummary(result) {
  const records = Object.entries(result?.platforms || {})
    .filter(([, record]) => Number.isFinite(record?.score))
    .map(([platform, record]) => {
      const rank = record.rank > 0 ? `#${record.rank}` : 'TOP 50 밖';
      return `${platform.toUpperCase()} ${record.score.toLocaleString()}점 · ${rank}`;
    });
  return records.length ? records.join(' / ') : '참가 기록 없이 시즌이 종료됐어요.';
}
