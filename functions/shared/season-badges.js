export function getUnprocessedClosedSeasons({
  createdAt,
  now = new Date(),
  processed = [],
  limit = 12,
  submissionGraceMs = 24 * 60 * 60 * 1000,
}) {
  const current = seasonId(new Date(now.getTime() - submissionGraceMs));
  const cursor = new Date(createdAt);
  if (!Number.isFinite(cursor.getTime())) return [];
  cursor.setUTCDate(1);
  const processedSet = new Set(processed);
  const seasons = [];
  while (seasonId(cursor) < current && seasons.length < limit) {
    const season = seasonId(cursor);
    if (!processedSet.has(season)) seasons.push(season);
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return seasons;
}

export function createSeasonBadgeIds(season, platform, rank, hasRecord = true) {
  if (!hasRecord) return [];
  const badges = [`${season}:${platform}:best`];
  if (rank === 1) badges.push(`${season}:${platform}:top1`);
  else if (rank > 0 && rank <= 10) badges.push(`${season}:${platform}:top10`);
  else if (rank > 0 && rank <= 50) badges.push(`${season}:${platform}:top50`);
  return badges;
}

export function appendSeasonResult(results, nextResult, limit = 24) {
  const validSeason = value => /^\d{4}-(0[1-9]|1[0-2])$/.test(value || '');
  const bySeason = new Map(
    (Array.isArray(results) ? results : [])
      .filter(result => validSeason(result?.season))
      .map(result => [result.season, result]),
  );
  if (validSeason(nextResult?.season)) {
    bySeason.set(nextResult.season, nextResult);
  }
  return [...bySeason.values()]
    .sort((a, b) => a.season.localeCompare(b.season))
    .slice(-Math.max(1, limit));
}

export function formatSeasonBadge(badgeId) {
  const [season, platform, tier] = String(badgeId || '').split(':');
  if (!/^\d{4}-\d{2}$/.test(season) || !['mobile', 'desktop'].includes(platform)) return '';
  const label = {
    best:'시즌 기록',
    top50:'TOP 50',
    top10:'TOP 10',
    top1:'TOP 1',
  }[tier];
  return label ? `${season} · ${platform.toUpperCase()} ${label}` : '';
}

function seasonId(date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone:'Asia/Seoul', year:'numeric', month:'2-digit',
  }).format(date);
}
