import test from 'node:test';
import assert from 'node:assert/strict';
import { findColorGroups, groupSizesByCell, hasOccupiedCell } from '../src/board.js';

test('최소 크기 이상의 상하좌우 연결 그룹만 찾는다', () => {
  const board = [
    [0, 0, null, 1],
    [0, 0, null, 1],
    [null, null, 1, 1],
  ];
  assert.deepEqual(findColorGroups(board, 4).map(group => group.length).sort(), [4, 4]);
  assert.deepEqual(findColorGroups(board, 5), []);
});

test('연결 그룹 크기를 각 셀 좌표에 매핑한다', () => {
  const groups = [[[0, 0], [1, 0], [1, 1], [2, 1]]];
  assert.equal(groupSizesByCell(groups).get('1,1'), 4);
});

test('리액터가 조작할 수 있는 점유 셀이 있는지 판별한다', () => {
  assert.equal(hasOccupiedCell([[null, null], [null, null]]), false);
  assert.equal(hasOccupiedCell([[null, 0], [null, null]]), true);
});
