export const RESULT_KINDS = Object.freeze({
  PRACTICE:'practice',
  PENDING:'pending',
  FIRST:'first',
  BEST:'best',
  EXISTING:'existing',
  OFFLINE:'offline',
});

export function createGameResult({
  ranked,
  score,
  level,
  submission = null,
  leaderboard = null,
  offline = false,
}) {
  const normalizedScore = Math.max(0, Math.round(score || 0));
  const normalizedLevel = Math.max(1, Math.round(level || 1));
  if (!ranked) return base(RESULT_KINDS.PRACTICE, '멋진 연쇄였어요!', normalizedScore, normalizedLevel);
  if (offline) {
    return {
      ...base(RESULT_KINDS.OFFLINE, '기록은 잘 챙겨뒀어요!', normalizedScore, normalizedLevel),
      detail:'연결되면 시즌 기록을 다시 확인할게요.',
    };
  }
  if (!submission) {
    return {
      ...base(RESULT_KINDS.PENDING, '기록을 확인하고 있어요', normalizedScore, normalizedLevel),
      detail:'안전하게 점수를 검증하는 중입니다.',
    };
  }

  const myBest = leaderboard?.myBest || null;
  const entries = leaderboard?.entries || [];
  const rank = myBest ? entries.findIndex(entry => entry.playerId === myBest.playerId) + 1 : 0;
  const seasonBest = Number(myBest?.score ?? submission.bestScore ?? normalizedScore);
  const first = Boolean(submission.firstRecord);
  const improved = Boolean(submission.updated);
  const kind = first ? RESULT_KINDS.FIRST : improved ? RESULT_KINDS.BEST : RESULT_KINDS.EXISTING;
  const title = first
    ? '첫 기록이 생겼어요!'
    : improved ? '기록을 제대로 터뜨렸어요! 🎉' : '멋진 연쇄였어요!';
  const difference = Math.max(0, seasonBest - normalizedScore);
  return {
    ...base(kind, title, normalizedScore, normalizedLevel),
    detail:rank
      ? `이번 시즌 ${rank}위에 올랐어요.`
      : difference > 0 ? `시즌 최고까지 ${difference.toLocaleString()}점 남았어요.` : 'TOP 50 진입에 도전해보세요.',
    seasonBest,
    rank:rank || null,
  };
}

export function createShareText(result, platformLabel = '') {
  const rankText = result.rank ? ` · ${platformLabel ? `${platformLabel} ` : ''}시즌 ${result.rank}위` : '';
  return `COLOR BOMB ${result.score.toLocaleString()}점 · LV ${result.level}${rankText}! 같은 색 6칸부터 연쇄가 시작됩니다.`;
}

function base(kind, title, score, level) {
  return {kind, title, detail:`${score.toLocaleString()}점 · LV ${level}`, score, level, seasonBest:null, rank:null};
}
