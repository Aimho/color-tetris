import { createRankedRandom, RANKED_RANDOM_VERSION } from './ranked-random.js';

const COLS = 10;
const ROWS = 20;
const MATCH = 6;
const SPAWN_X = 3;
const SHAPES = {
  I:[[0,1],[1,1],[2,1],[3,1]], O:[[1,0],[2,0],[1,1],[2,1]],
  T:[[1,0],[0,1],[1,1],[2,1]], S:[[1,0],[2,0],[0,1],[1,1]],
  Z:[[0,0],[1,0],[1,1],[2,1]], J:[[0,0],[0,1],[1,1],[2,1]],
  L:[[2,0],[0,1],[1,1],[2,1]],
};
const DIRECTIONS = ['up', 'down', 'left', 'right'];
const VECTORS = {up:[0,-1], down:[0,1], left:[-1,0], right:[1,0]};
const CHAIN_MULTIPLIERS = [1, 1.8, 3, 4.8, 7];
const JLSTZ_KICKS = {
  '0>1':[[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
  '1>2':[[0,0],[1,0],[1,1],[0,-2],[1,-2]],
  '2>3':[[0,0],[1,0],[1,-1],[0,2],[1,2]],
  '3>0':[[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
};
const I_KICKS = {
  '0>1':[[0,0],[-2,0],[1,0],[-2,1],[1,-2]],
  '1>2':[[0,0],[-1,0],[2,0],[-1,-2],[2,1]],
  '2>3':[[0,0],[2,0],[-1,0],[2,-1],[-1,2]],
  '3>0':[[0,0],[1,0],[-2,0],[1,2],[-2,-1]],
};

export function replayRankedPlacements(seed, placements, randomVersion = RANKED_RANDOM_VERSION) {
  if (randomVersion !== RANKED_RANDOM_VERSION) throw new Error('unsupported-random-version');
  if (!Array.isArray(placements) || placements.length < 1 || placements.length > 2_001) {
    throw new Error('invalid-placement-log');
  }
  const state = createState(seed);
  for (const placement of placements) placeAndResolve(state, placement);
  if (!state.gameOver) throw new Error('unfinished-run');
  return summarize(state);
}

export function createReplayFixture(seed, count) {
  const state = createState(seed);
  const placements = [];
  for (let index = 0; index < count; index++) {
    if (state.gameOver) break;
    const y = landingY(state.board, state.active, SPAWN_X);
    const terminal = absoluteCells(state.active, SPAWN_X, y).some(cell => cell.y < 0);
    const placement = {
      pieceSerial:state.active.serial, x:SPAWN_X, y,
      rotation:0, usedHold:false, terminal,
    };
    placements.push(placement);
    placeAndResolve(state, placement);
  }
  return {placements, result:summarize(state)};
}

function createState(seed) {
  const random = createRankedRandom(seed);
  const state = {
    random,
    board:grid(null),
    events:grid(null),
    shapeBag:[],
    colorBag:[],
    queue:[],
    hold:null,
    piecesSinceMono:0,
    serial:0,
    rewards:{bomb:false, arrow:false},
    score:0,
    lines:0,
    maxChain:0,
    reactorCharge:0,
    reactorPower:0,
    reactorCount:0,
    multiplierCells:0,
    clearSteps:[],
    piecesPlaced:0,
    gameOver:false,
  };
  refill(state);
  spawn(state);
  return state;
}

function grid(value) {
  return Array.from({length:ROWS}, () => Array(COLS).fill(value));
}

function shuffled(state, values) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index--) {
    const target = Math.floor(state.random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

function makePiece(state) {
  if (!state.shapeBag.length) state.shapeBag = shuffled(state, Object.keys(SHAPES));
  const type = state.shapeBag.pop();
  let colors;
  const mono = state.piecesSinceMono >= 8 || state.random() < .05;
  if (mono) {
    colors = Array(4).fill(Math.floor(state.random() * 4));
    state.piecesSinceMono = 0;
  } else {
    if (state.colorBag.length < 4) state.colorBag.push(...shuffled(state, [0,0,1,1,2,2,3,3]));
    colors = [state.colorBag.pop(), state.colorBag.pop(), state.colorBag.pop(), state.colorBag.pop()];
    if (new Set(colors).size === 1) colors[3] = (colors[3] + 1 + Math.floor(state.random() * 3)) % 4;
    colors = shuffled(state, colors);
    state.piecesSinceMono++;
  }
  return {
    serial:state.serial++,
    type,
    cells:SHAPES[type].map(([x,y], index) => ({x,y,color:colors[index],event:null})),
  };
}

function refill(state) {
  while (state.queue.length < 3) state.queue.push(makePiece(state));
}

function spawn(state) {
  const piece = state.queue[0];
  const type = state.rewards.bomb ? 'bomb' : state.rewards.arrow ? 'arrow' : null;
  if (type) {
    const index = Math.floor(state.random() * piece.cells.length);
    piece.cells[index] = {
      ...piece.cells[index],
      event:type === 'bomb' ? 'bomb' : DIRECTIONS[Math.floor(state.random() * DIRECTIONS.length)],
    };
    state.rewards[type] = false;
  }
  state.active = state.queue.shift();
  refill(state);
  state.gameOver = collides(state.board, absoluteCells(state.active, SPAWN_X, -1));
}

function placeAndResolve(state, placement) {
  if (state.gameOver) throw new Error('placement-after-game-over');
  validatePlacementShape(placement);
  if (placement.usedHold) {
    const current = state.active;
    if (state.hold) [state.active, state.hold] = [state.hold, current];
    else {
      state.hold = current;
      state.active = state.queue.shift();
      refill(state);
    }
  }
  if (placement.pieceSerial !== state.active.serial) throw new Error('piece-sequence-mismatch');
  if (!isReachable(state.board, state.active, placement)) throw new Error('unreachable-piece-placement');
  let piece = state.active;
  for (let index = 0; index < placement.rotation; index++) piece = rotate(piece);
  const cells = absoluteCells(piece, placement.x, placement.y);
  if (placement.terminal) {
    if (!cells.some(({y}) => y < 0)
      || cells.some(({x,y}) => x < 0 || x >= COLS || y >= ROWS || (y >= 0 && state.board[y][x] !== null))
      || !collides(state.board, cells.map(cell => ({...cell, y:cell.y + 1})))) {
      throw new Error('invalid-terminal-placement');
    }
    state.gameOver = true;
    return;
  }
  if (cells.some(({x,y}) => x < 0 || x >= COLS || y < 0 || y >= ROWS || state.board[y][x] !== null)) {
    throw new Error('invalid-piece-placement');
  }
  if (!cells.some(({x,y}) => y === ROWS - 1 || state.board[y + 1][x] !== null)) {
    throw new Error('floating-piece');
  }
  for (const cell of cells) {
    state.board[cell.y][cell.x] = cell.color;
    state.events[cell.y][cell.x] = cell.event;
  }
  state.piecesPlaced++;
  resolveBoard(state);
  spawn(state);
}

function validatePlacementShape(placement) {
  if (!placement
    || !Number.isInteger(placement.pieceSerial)
    || !Number.isInteger(placement.x)
    || !Number.isInteger(placement.y)
    || !Number.isInteger(placement.rotation)
    || placement.rotation < 0
    || placement.rotation > 3
    || typeof placement.usedHold !== 'boolean'
    || typeof placement.terminal !== 'boolean') throw new Error('invalid-placement-log');
}

function rotate(piece) {
  const square = piece.type === 'O';
  return {
    ...piece,
    cells:piece.cells.map(cell => ({
      ...cell,
      x:2 - cell.y,
      y:square ? cell.x - 1 : cell.x,
      event:rotateEvent(cell.event),
    })),
  };
}

function rotateEvent(event) {
  return {up:'right', right:'down', down:'left', left:'up'}[event] || event;
}

function absoluteCells(piece, x, y) {
  return piece.cells.map(cell => ({...cell, x:cell.x + x, y:cell.y + y}));
}

function landingY(board, piece, x) {
  let y = -1;
  while (!collides(board, absoluteCells(piece, x, y + 1))) y++;
  return y;
}

function isReachable(board, piece, target) {
  const pending = [{x:SPAWN_X, y:-1, rotation:0}];
  const seen = new Set();
  while (pending.length) {
    const current = pending.shift();
    const key = `${current.x},${current.y},${current.rotation}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (current.x === target.x && current.y === target.y && current.rotation === target.rotation) return true;
    const oriented = rotateTimes(piece, current.rotation);
    for (const [dx,dy] of [[-1,0],[1,0],[0,1]]) {
      const next = {...current, x:current.x + dx, y:current.y + dy};
      if (!collides(board, absoluteCells(oriented, next.x, next.y))) pending.push(next);
    }
    const nextRotation = (current.rotation + 1) % 4;
    const rotated = rotate(oriented);
    for (const [kickX,kickY] of wallKicks(piece.type, current.rotation, nextRotation)) {
      const next = {
        x:current.x + kickX,
        y:current.y + kickY,
        rotation:nextRotation,
      };
      if (!collides(board, absoluteCells(rotated, next.x, next.y))) {
        pending.push(next);
        break;
      }
    }
  }
  return false;
}

function rotateTimes(piece, count) {
  let result = piece;
  for (let index = 0; index < count; index++) result = rotate(result);
  return result;
}

function wallKicks(type, from, to) {
  if (type === 'O') return [[0,0]];
  return (type === 'I' ? I_KICKS : JLSTZ_KICKS)[`${from}>${to}`] || [[0,0]];
}

function collides(board, cells) {
  return cells.some(({x,y}) => x < 0 || x >= COLS || y >= ROWS || (y >= 0 && board[y][x] !== null));
}

function resolveBoard(state) {
  let chain = 0;
  while (true) {
    const groups = findGroups(state.board);
    if (!groups.length) {
      if (state.reactorCharge >= 100) {
        deployReactor(state);
        continue;
      }
      return;
    }
    chain++;
    state.maxChain = Math.max(state.maxChain, chain);
    state.rewards.bomb ||= groups.some(group => group.length >= 9);
    state.rewards.arrow ||= chain >= 2;
    const matched = new Set(groups.flat().map(([x,y]) => `${x},${y}`));
    const removed = resolveSpecials(matched, state.board, state.events);
    let multiplier = 1;
    let multiplierCells = 0;
    for (const key of removed) {
      const [x,y] = key.split(',').map(Number);
      if (state.events[y][x] === 'x2') { multiplier *= 2; multiplierCells++; }
      if (state.events[y][x] === 'x3') { multiplier *= 3; multiplierCells++; }
    }
    multiplier = Math.min(6, multiplier);
    state.clearSteps.push({
      removedCells:removed.size,
      directCells:matched.size,
      chain,
      scoreMultiplier:multiplier,
      multiplierCells,
    });
    const chainMultiplier = CHAIN_MULTIPLIERS[Math.min(chain, 5) - 1];
    state.score += Math.round(removed.size * 10 * chainMultiplier * multiplier);
    const level = 1 + Math.floor(state.lines / 15);
    state.lines += removed.size;
    state.reactorPower += Math.min(4, Math.max(0, chain - 1));
    const rate = Math.round((1 - Math.min(1, (level - 1) / 19) * .55) * 100) / 100;
    state.reactorCharge = Math.min(100,
      state.reactorCharge + Math.round((matched.size * 1.5 + Math.max(0, chain - 1) * 2) * rate));
    for (const key of removed) {
      const [x,y] = key.split(',').map(Number);
      state.board[y][x] = null;
      state.events[y][x] = null;
    }
    collapse(state);
  }
}

function findGroups(board) {
  const seen = new Set();
  const groups = [];
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    const start = `${x},${y}`;
    if (board[y][x] === null || seen.has(start)) continue;
    const color = board[y][x];
    const group = [];
    const pending = [[x,y]];
    seen.add(start);
    while (pending.length) {
      const [cx,cy] = pending.pop();
      group.push([cx,cy]);
      for (const [nx,ny] of [[cx+1,cy],[cx-1,cy],[cx,cy+1],[cx,cy-1]]) {
        const key = `${nx},${ny}`;
        if (nx >= 0 && nx < COLS && ny >= 0 && ny < ROWS
          && !seen.has(key) && board[ny][nx] === color) {
          seen.add(key);
          pending.push([nx,ny]);
        }
      }
    }
    if (group.length >= MATCH) groups.push(group);
  }
  return groups;
}

function resolveSpecials(initial, board, events) {
  const removed = new Set(initial);
  const pending = [...removed];
  const activated = new Set();
  while (pending.length) {
    const key = pending.shift();
    if (activated.has(key)) continue;
    const [x,y] = key.split(',').map(Number);
    const event = events[y][x];
    if (event !== 'bomb' && !VECTORS[event]) continue;
    activated.add(key);
    const targets = event === 'bomb'
      ? Array.from({length:9}, (_, index) => [x + index % 3 - 1, y + Math.floor(index / 3) - 1])
      : arrowTargets(x, y, event);
    for (const [nx,ny] of targets) {
      if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS || board[ny][nx] === null) continue;
      const target = `${nx},${ny}`;
      if (!removed.has(target)) {
        removed.add(target);
        pending.push(target);
      }
    }
  }
  return removed;
}

function arrowTargets(x, y, direction) {
  const [dx,dy] = VECTORS[direction];
  const targetX = x + dx;
  const targetY = y + dy;
  return dx === 0
    ? Array.from({length:COLS}, (_, nx) => [nx,targetY])
    : Array.from({length:ROWS}, (_, ny) => [targetX,ny]);
}

function collapse(state) {
  for (let x = 0; x < COLS; x++) {
    const cells = [];
    for (let y = ROWS - 1; y >= 0; y--) {
      if (state.board[y][x] !== null) cells.push({color:state.board[y][x], event:state.events[y][x]});
    }
    for (let y = ROWS - 1, index = 0; y >= 0; y--, index++) {
      state.board[y][x] = cells[index]?.color ?? null;
      state.events[y][x] = cells[index]?.event ?? null;
    }
  }
}

function deployReactor(state) {
  const rewards = state.reactorPower >= 9 ? ['x2','x3','x3']
    : state.reactorPower >= 6 ? ['x3','x3']
      : state.reactorPower >= 4 ? ['x2','x3']
        : state.reactorPower >= 2 ? ['x2','x2'] : ['x2'];
  state.reactorCount++;
  state.reactorCharge = 0;
  state.reactorPower = 0;
  for (const event of rewards) {
    const columns = Array.from({length:COLS}, (_, x) => x).filter(x => state.board[0][x] === null);
    if (!columns.length) break;
    const x = columns[Math.floor(state.random() * columns.length)];
    let y = ROWS - 1;
    while (y >= 0 && state.board[y][x] !== null) y--;
    let best = -1;
    let colors = [];
    for (let color = 0; color < 4; color++) {
      state.board[y][x] = color;
      const size = connectedSize(state.board, x, y, color);
      state.board[y][x] = null;
      if (size > best) { best = size; colors = [color]; }
      else if (size === best) colors.push(color);
    }
    state.board[y][x] = colors[Math.floor(state.random() * colors.length)];
    state.events[y][x] = event;
    state.multiplierCells++;
  }
}

function connectedSize(board, startX, startY, color) {
  const seen = new Set([`${startX},${startY}`]);
  const pending = [[startX,startY]];
  while (pending.length) {
    const [x,y] = pending.pop();
    for (const [nx,ny] of [[x+1,y],[x-1,y],[x,y+1],[x,y-1]]) {
      const key = `${nx},${ny}`;
      if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS || seen.has(key) || board[ny][nx] !== color) continue;
      seen.add(key);
      pending.push([nx,ny]);
    }
  }
  return seen.size;
}

function summarize(state) {
  return {
    score:state.score,
    level:1 + Math.floor(state.lines / 15),
    piecesPlaced:state.piecesPlaced,
    clearSteps:state.clearSteps,
    directClears:state.clearSteps.reduce((sum, step) => sum + step.directCells, 0),
    specialClears:state.clearSteps.reduce((sum, step) => sum + step.removedCells - step.directCells, 0),
    maxChain:state.maxChain,
    reactorCount:state.reactorCount,
    multiplierCells:state.multiplierCells,
  };
}
