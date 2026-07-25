import test from 'node:test';
import assert from 'node:assert/strict';
import { RESULT_KINDS, createGameResult, createShareText } from '../src/game-result.js';

test('연습 결과는 서버 기록 없이 친근하게 안내한다', () => {
  const result = createGameResult({ranked:false, score:1234, level:7});
  assert.equal(result.kind, RESULT_KINDS.PRACTICE);
  assert.equal(result.title, '멋진 연쇄였어요!');
});

test('랭킹 첫 기록과 신기록을 구분한다', () => {
  const leaderboard = {
    myBest:{playerId:'me', score:2000},
    entries:[{playerId:'other', score:3000}, {playerId:'me', score:2000}],
  };
  const first = createGameResult({
    ranked:true, score:2000, level:8, submission:{firstRecord:true, updated:true}, leaderboard,
  });
  const best = createGameResult({
    ranked:true, score:2000, level:8, submission:{firstRecord:false, updated:true}, leaderboard,
  });
  assert.equal(first.kind, RESULT_KINDS.FIRST);
  assert.equal(best.kind, RESULT_KINDS.BEST);
  assert.equal(best.rank, 2);
});

test('기존 기록과 오프라인 결과를 구분하고 공유 문구에 순위를 넣는다', () => {
  const existing = createGameResult({
    ranked:true,
    score:1200,
    level:5,
    submission:{firstRecord:false, updated:false, bestScore:1500},
    leaderboard:{myBest:{playerId:'me', score:1500}, entries:[]},
  });
  const offline = createGameResult({ranked:true, score:1200, level:5, offline:true});
  assert.equal(existing.kind, RESULT_KINDS.EXISTING);
  assert.match(existing.detail, /300점/);
  assert.equal(offline.kind, RESULT_KINDS.OFFLINE);
  assert.match(createShareText({...existing, rank:4}, '모바일'), /모바일 시즌 4위/);
});
