import './style.css';
import { actionForKey, dragStepTarget } from './input.js';
import { findColorGroups, groupSizesByCell, hasOccupiedCell } from './board.js';
import { configureAudioSession, createAudioContext, primeLegacyMediaChannel, resumeIfSuspended, unlockAudioContext } from './audio.js';
import { createPieceColors, createPieceEvent, rotateCellClockwise, rotateSquareCells, wallKickOffsets } from './pieces.js';
import { MusicEngine } from './music.js';
import { canResetLock, getClearIntensity, getClearScore, getDropInterval, getLevelForClears, getLockDelay } from './difficulty.js';
import { resolveArrowEffects } from './events.js';
import { chargeReactor, finishRun, getPace, readProfile, unlockedThemes } from './progression.js';
import { createReactorState, finishReactor as finishReactorState, getReactorDuration, isReactorActive, isReactorExpired, pauseReactor, reactorSecondsLeft, recolorConnectedGroup, resumeReactor, startReactor } from './reactor.js';
import { setupPwa } from './pwa.js';

const COLS = 10;
const ROWS = 20;
const MATCH = 6;
const CELL = 34;
const SPAWN_X = Math.floor((COLS - 4) / 2);
const COLORS = ['#ff6542', '#e9f65b', '#45d6a5', '#f28bd5'];
const MAX_SHARDS = 360;
const SHAPES = {
  I: [[0,1],[1,1],[2,1],[3,1]], O: [[1,0],[2,0],[1,1],[2,1]],
  T: [[1,0],[0,1],[1,1],[2,1]], S: [[1,0],[2,0],[0,1],[1,1]],
  Z: [[0,0],[1,0],[1,1],[2,1]], J: [[0,0],[0,1],[1,1],[2,1]],
  L: [[2,0],[0,1],[1,1],[2,1]],
};

const canvas = document.querySelector('#gameCanvas');
const ctx = canvas.getContext('2d');
const holdCtx = document.querySelector('#holdCanvas').getContext('2d');
const nextCtx = document.querySelector('#nextCanvas').getContext('2d');
const scoreEl = document.querySelector('#score');
const levelEl = document.querySelector('#level');
const chainEl = document.querySelector('#chain');
const callout = document.querySelector('#chainCallout');
const levelCallout = document.querySelector('#levelCallout');
const impactFlash = document.querySelector('#impactFlash');
const boardFrame = document.querySelector('#boardFrame');
const overlay = document.querySelector('#overlay');
const overlayTitle = document.querySelector('#overlayTitle');
const overlayCopy = document.querySelector('#overlayCopy');
const tutorial = document.querySelector('#tutorial');
const tutorialClose = document.querySelector('#tutorialClose');
const gestureHint = document.querySelector('#gestureHint');
const gameShell = document.querySelector('.game-shell');
const scoreRecord = document.querySelector('#scoreRecord');
const scoreForm = document.querySelector('#scoreForm');
const playerNameInput = document.querySelector('#playerName');
const scoreStatus = document.querySelector('#scoreStatus');
const leaderboardList = document.querySelector('#leaderboardList');
const leaderboardTitle = document.querySelector('#leaderboardTitle');
const buildVersion = document.querySelector('#buildVersion');
const shareButton = document.querySelector('#shareButton');
const reactorStatus = document.querySelector('#reactorStatus');
const reactorValue = document.querySelector('#reactorValue');
const reactorInstruction = document.querySelector('#reactorInstruction');
const paceButton = document.querySelector('#paceButton');
const themeButton = document.querySelector('#themeButton');
const isTouchDevice = matchMedia('(any-pointer: coarse)').matches || navigator.maxTouchPoints > 0;
const prefersReducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

let board, eventBoard, active, queue, hold, holdUsed, score, level, lines, running, paused;
let lastTime = 0, dropTimer = 0, resolving = false, muted = false;
let shapeBag = [], colorBag = [];
let runId = 0, lockTimer = 0, lockResets = 0;
let piecesSinceMono = 0, piecesSinceEvent = 0, particles = [];
let arrowBeams = [], clearingCells = new Set();
let tutorialStartsGame = false, piecesSpawned = 0, hintTimer;
let tutorialOpener = null, autoPaused = false;
let gestureStart = null;
let scoreSubmitted = false;
let leaderboardApiPromise;
let randomSource = Math.random;
let reactorCharge = 0, reactor = createReactorState(), maxChain = 0;
let reactorGuideActive = false;
let profile = readProfile(), pace = getPace(profile);
let reactorRenderKey = '';

buildVersion.textContent = `VER ${__APP_VERSION__} · BUILD ${__BUILD_ID__}`;

function getLeaderboardApi() {
  leaderboardApiPromise ||= import('./leaderboard.js');
  return leaderboardApiPromise;
}

function shuffled(values) {
  const a = [...values];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(randomSource() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function takeShape() {
  if (!shapeBag.length) shapeBag = shuffled(Object.keys(SHAPES));
  return shapeBag.pop();
}

function takeColors() {
  if (colorBag.length < 4) colorBag.push(...shuffled([0,0,1,1,2,2,3,3]));
  const seed = [colorBag.pop(), colorBag.pop(), colorBag.pop(), colorBag.pop()];
  if (new Set(seed).size === 1) seed[3] = (seed[3] + 1 + Math.floor(randomSource() * 3)) % 4;
  return shuffled(seed);
}

function makePiece() {
  const type = takeShape();
  const result = createPieceColors(COLORS.length, piecesSinceMono, takeColors, randomSource);
  const eventResult = createPieceEvent(piecesSinceEvent, SHAPES[type].length, randomSource);
  piecesSinceMono = result.isMono ? 0 : piecesSinceMono + 1;
  piecesSinceEvent = eventResult.nextCount;
  const colors = result.colors;
  return {
    type,
    cells: SHAPES[type].map((p, i) => ({
      x:p[0], y:p[1], color:colors[i],
      event: eventResult.event?.cellIndex === i ? eventResult.event.direction : null,
    })),
    x:SPAWN_X, y:-1, rotation:0,
  };
}

function refillQueue() { while (queue.length < 3) queue.push(makePiece()); }

function spawn() {
  active = queue.shift();
  active.x = SPAWN_X; active.y = -1;
  lockResets = 0;
  holdUsed = false;
  refillQueue();
  drawRacks();
  piecesSpawned++;
  if (isTouchDevice && piecesSpawned <= 3) showGestureHint('탭 회전 · 드래그 이동');
  if (collides(active)) endGame();
}

function reset() {
  runId++;
  randomSource = Math.random;
  document.body.classList.add('playing');
  board = Array.from({length: ROWS}, () => Array(COLS).fill(null));
  eventBoard = Array.from({length: ROWS}, () => Array(COLS).fill(null));
  queue = []; hold = null; holdUsed = false; score = 0; level = 1; lines = 0;
  shapeBag = []; colorBag = []; resolving = false; running = true; paused = false; piecesSpawned = 0;
  piecesSinceMono = 0; piecesSinceEvent = 0; particles = []; arrowBeams = []; clearingCells = new Set();
  reactorCharge = 0; reactor = createReactorState(); maxChain = 0;
  boardFrame.classList.remove('reactor-active', 'reactor-guided'); reactorGuideActive = false;
  music?.setReactor(false);
  refillQueue(); spawn(); updateStats();
  overlay.classList.remove('visible', 'game-over');
  scoreRecord.hidden = true;
  scoreSubmitted = false;
  scoreForm.querySelector('button').disabled = false;
  shareButton.hidden = true;
  lastTime = performance.now(); dropTimer = 0; lockTimer = 0;
  startMusic();
  updateReactor();
  requestAnimationFrame(loop);
}

function cellsOf(piece) { return piece.cells.map(c => ({ x: c.x + piece.x, y: c.y + piece.y, color: c.color, event: c.event })); }

function collides(piece) {
  return cellsOf(piece).some(c => c.x < 0 || c.x >= COLS || c.y >= ROWS || (c.y >= 0 && board[c.y][c.x] !== null));
}

function move(dx, dy, resetGroundTimer = false) {
  if (!running || paused || resolving) return false;
  const wasGrounded = resetGroundTimer && collides({...active, y: active.y + 1});
  const next = {...active, x: active.x + dx, y: active.y + dy};
  if (collides(next)) return false;
  active = next;
  if (canResetLock(wasGrounded, lockResets)) { lockTimer = 0; lockResets++; }
  return true;
}

function rotate() {
  if (!running || paused || resolving) return;
  const wasGrounded = collides({...active, y: active.y + 1});
  const fromRotation = active.rotation || 0;
  const toRotation = (fromRotation + 1) % 4;
  const rotated = {...active, cells: active.type === 'O'
    ? rotateSquareCells(active.cells)
    : active.cells.map(c => rotateCellClockwise(c)), rotation:toRotation};
  for (const [kickX, kickY] of wallKickOffsets(active.type, fromRotation, toRotation)) {
    const candidate = {...rotated, x: rotated.x + kickX, y: rotated.y + kickY};
    if (!collides(candidate)) {
      active = candidate;
      if (canResetLock(wasGrounded, lockResets)) { lockTimer = 0; lockResets++; }
      tone(480, .035); return;
    }
  }
}

function hardDrop() {
  if (!running || paused || resolving) return;
  let distance = 0;
  while (move(0, 1)) distance++;
  score += distance * 2;
  updateStats();
  document.querySelector('#boardFrame').animate([
    {transform:'scaleY(1)'}, {transform:'scaleY(.985)'}, {transform:'scaleY(1)'}
  ], {duration:150, easing:'cubic-bezier(.16,1,.3,1)'});
  lock();
}

function lock() {
  gestureStart = null;
  const cells = cellsOf(active);
  if (cells.some(c => c.y < 0)) { endGame(); return; }
  for (const c of cells) {
    board[c.y][c.x] = c.color;
    eventBoard[c.y][c.x] = c.event;
  }
  lockTimer = 0;
  tone(150, .05);
  resolveBoard();
}

async function resolveBoard() {
  const resolvingRun = runId;
  resolving = true;
  let chain = 0;
  while (true) {
    const groups = findGroups();
    if (!groups.length) break;
    chain++;
    maxChain = Math.max(maxChain, chain);
    const matched = new Set(groups.flat().map(([x,y]) => `${x},${y}`));
    const arrowResult = resolveArrowEffects(matched, board, eventBoard);
    const {removed, beams} = arrowResult;
    const arrowRemoved = new Set(beams.flatMap(beam => beam.cells));
    chainEl.textContent = `×${chain}`;
    clearingCells = new Set(removed);
    draw();
    if (beams.length) await playArrowBeams(beams);
    else await pause(180);
    await waitUntilResumed(resolvingRun);
    if (resolvingRun !== runId) return;
    for (const key of removed) {
      const [x,y] = key.split(',').map(Number);
      createShards(x, y, board[y][x], chain, removed.size, arrowRemoved.has(key) ? 1.5 : 1);
      board[y][x] = null;
      eventBoard[y][x] = null;
    }
    clearingCells = new Set();
    const earnedScore = getClearScore(removed.size, chain);
    score += earnedScore;
    lines += removed.size;
    reactorCharge = chargeReactor(reactorCharge, removed.size, chain, level);
    updateReactor();
    const previousLevel = level;
    level = getLevelForClears(lines);
    music?.setLevel(level);
    updateStats();
    showClearImpact(removed.size, chain, earnedScore);
    shatterSound(chain, removed.size);
    if (level > previousLevel) showLevelUp(level);
    draw(); await pause(220);
    await waitUntilResumed(resolvingRun);
    if (resolvingRun !== runId) return;
    applyGravity(); draw(); await pause(150);
    await waitUntilResumed(resolvingRun);
    if (resolvingRun !== runId) return;
  }
  resolving = false; chainEl.textContent = '—';
  if (reactorCharge >= 100) beginReactor();
  else spawn();
}

function findGroups() {
  return findColorGroups(board, MATCH);
}

function applyGravity() {
  for (let x = 0; x < COLS; x++) {
    const values = [];
    for (let y = ROWS - 1; y >= 0; y--) {
      if (board[y][x] !== null) values.push({color:board[y][x], event:eventBoard[y][x]});
    }
    for (let y = ROWS - 1, i = 0; y >= 0; y--, i++) {
      board[y][x] = i < values.length ? values[i].color : null;
      eventBoard[y][x] = i < values.length ? values[i].event : null;
    }
  }
}

function holdPiece() {
  if (!running || paused || resolving || holdUsed) return;
  const current = {...active, x:SPAWN_X, y:-1};
  if (hold) { active = hold; active.x=SPAWN_X; active.y=-1; hold = current; }
  else { hold = current; active = queue.shift(); refillQueue(); }
  holdUsed = true; lockResets = 0; drawRacks(); tone(360,.04);
  if (collides(active)) endGame();
}

function ghostY() {
  let ghost = {...active};
  while (!collides({...ghost, y: ghost.y + 1})) ghost.y++;
  return ghost.y;
}

function drawCell(context, x, y, colorIndex, size=CELL, alpha=1, event=null) {
  const pad = Math.max(1.5, size * .06), px=x*size+pad, py=y*size+pad, s=size-pad*2;
  context.globalAlpha = alpha;
  context.fillStyle = COLORS[colorIndex];
  roundRect(context, px, py, s, s, size*.17); context.fill();
  context.fillStyle = 'rgba(255,255,255,.25)';
  roundRect(context, px+size*.09, py+size*.07, s-size*.18, size*.075, size*.04); context.fill();
  if (event) drawEventArrow(context, px+s/2, py+s/2, size, event);
  context.globalAlpha = 1;
}

function drawConnectionCue(context, x, y, size, connected) {
  if (connected < 4) return;
  const pulse = connected >= MATCH && !prefersReducedMotion
    ? .68 + Math.sin(performance.now() / 95) * .22
    : connected === 5 ? .82 : .52;
  const pad = connected >= MATCH ? 2.5 : connected === 5 ? 4 : 5.5;
  context.save();
  context.globalAlpha = pulse;
  context.strokeStyle = connected >= MATCH ? '#fffbd0' : '#e9f65b';
  context.lineWidth = connected >= MATCH ? 3 : connected === 5 ? 2.25 : 1.25;
  context.shadowColor = connected >= MATCH ? '#ff6542' : '#e9f65b';
  context.shadowBlur = connected >= MATCH ? 15 : connected === 5 ? 8 : 3;
  roundRect(context, x * size + pad, y * size + pad, size - pad * 2, size - pad * 2, size * .13);
  context.stroke();
  if (connected === 5) {
    context.globalAlpha = .38;
    roundRect(context, x * size + 7, y * size + 7, size - 14, size - 14, size * .1);
    context.stroke();
  }
  context.restore();
}

function connectionPreview() {
  if (!active || !running || resolving || isReactorActive(reactor)) return new Map();
  const preview = board.map(row => [...row]);
  for (const cell of cellsOf(active)) if (cell.y >= 0 && cell.y < ROWS) preview[cell.y][cell.x] = cell.color;
  return groupSizesByCell(findColorGroups(preview, 4));
}

function drawEventArrow(context, cx, cy, size, direction) {
  const rotations = {up:0, right:Math.PI/2, down:Math.PI, left:-Math.PI/2};
  context.save();
  context.translate(cx, cy);
  context.rotate(rotations[direction] || 0);
  context.fillStyle = 'rgba(7,9,9,.72)';
  context.beginPath();
  context.moveTo(0, -size*.2);
  context.lineTo(size*.18, 0);
  context.lineTo(size*.07, 0);
  context.lineTo(size*.07, size*.2);
  context.lineTo(-size*.07, size*.2);
  context.lineTo(-size*.07, 0);
  context.lineTo(-size*.18, 0);
  context.closePath();
  context.fill();
  context.restore();
}

function createShards(x, y, colorIndex, chain, removedCount, force=1) {
  if (prefersReducedMotion) return;
  const intensity = getClearIntensity(removedCount);
  const available = Math.max(0, MAX_SHARDS - particles.length);
  const count = Math.min(intensity.shardsPerCell + Math.min(chain - 1, 3), available);
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = .055 + Math.random() * (.07 + chain * .008);
    particles.push({
      x: (x + .5) * CELL,
      y: (y + .5) * CELL,
      color: COLORS[colorIndex],
      size: (4 + Math.random() * 7) * force,
      vx: Math.cos(angle) * speed * force,
      vy: (Math.sin(angle) * speed - .075 - chain * .006) * force,
      rotation: Math.random() * Math.PI * 2,
      spin: (Math.random() - .5) * .018,
      age: 0,
      life: 380 + Math.random() * 260,
    });
  }
}

async function playArrowBeams(paths) {
  const start = performance.now();
  const duration = prefersReducedMotion ? 80 : 220;
  arrowBeams = paths.map(path => ({...path, start:start + (prefersReducedMotion ? 0 : path.delay), duration}));
  arrowBeamSound(paths.length);
  const total = Math.max(...arrowBeams.map(beam => beam.start - start + beam.duration));
  await pause(total);
  arrowBeams = [];
}

function drawArrowBeams() {
  const now = performance.now();
  for (const beam of arrowBeams) {
    const progress = Math.max(0, Math.min(1, (now - beam.start) / beam.duration));
    if (progress <= 0 || !beam.cells.length) continue;
    const visibleCount = Math.max(1, Math.ceil(beam.cells.length * progress));
    const [sx,sy] = beam.cells[0].split(',').map(Number);
    const [tx,ty] = beam.cells[visibleCount - 1].split(',').map(Number);
    const startX=(sx+.5)*CELL, startY=(sy+.5)*CELL, endX=(tx+.5)*CELL, endY=(ty+.5)*CELL;
    ctx.save();
    ctx.lineCap='round';
    ctx.shadowColor='#ff6542'; ctx.shadowBlur=18;
    ctx.strokeStyle='rgba(255,101,66,.55)'; ctx.lineWidth=CELL*.34;
    ctx.beginPath(); ctx.moveTo(startX,startY); ctx.lineTo(endX,endY); ctx.stroke();
    ctx.shadowColor='#e9f65b'; ctx.shadowBlur=12;
    ctx.strokeStyle='#e9f65b'; ctx.lineWidth=CELL*.1; ctx.stroke();
    for (let i=0;i<visibleCount;i++) {
      const [x,y]=beam.cells[i].split(',').map(Number);
      const localProgress = Math.max(0, Math.min(1, progress * beam.cells.length - i));
      ctx.globalAlpha=.25 + localProgress*.5;
      ctx.fillStyle='#fffbd0';
      const pulse=CELL*(.08*localProgress), pad=2-pulse;
      roundRect(ctx,x*CELL+pad,y*CELL+pad,CELL-pad*2,CELL-pad*2,CELL*.16); ctx.fill();
    }
    ctx.restore();
  }
}

function showClearImpact(removedCount, chain, points) {
  const intensity = getClearIntensity(removedCount);
  showChain(chain, intensity.name, points);
  if (prefersReducedMotion) return;
  impactFlash.className = 'impact-flash';
  void impactFlash.offsetWidth;
  impactFlash.className = `impact-flash ${intensity.name}`;
  boardFrame.animate([
    { transform: 'translate(0,0)' },
    { transform: `translate(${-intensity.shake}px,${intensity.shake * .35}px)` },
    { transform: `translate(${intensity.shake * .75}px,${-intensity.shake * .25}px)` },
    { transform: 'translate(0,0)' },
  ], { duration: intensity.name === 'overload' ? 420 : 280, easing: 'cubic-bezier(.16,1,.3,1)' });
}

function showLevelUp(nextLevel) {
  levelCallout.textContent = `LEVEL ${String(nextLevel).padStart(2, '0')}`;
  levelCallout.classList.remove('pop');
  void levelCallout.offsetWidth;
  levelCallout.classList.add('pop');
  levelUpSound(nextLevel);
}

function updateParticles(dt) {
  for (const particle of particles) {
    particle.age += dt;
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vy += .00035 * dt;
    particle.rotation += particle.spin * dt;
  }
  particles = particles.filter(particle => particle.age < particle.life);
}

function drawParticles() {
  for (const particle of particles) {
    const fade = Math.max(0, 1 - particle.age / particle.life);
    ctx.save();
    ctx.translate(particle.x, particle.y);
    ctx.rotate(particle.rotation);
    ctx.globalAlpha = fade;
    ctx.fillStyle = particle.color;
    ctx.beginPath();
    ctx.moveTo(0, -particle.size);
    ctx.lineTo(particle.size * .8, particle.size * .65);
    ctx.lineTo(-particle.size * .75, particle.size * .45);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

function drawClearingCells() {
  if (!clearingCells.size) return;
  const pulse = prefersReducedMotion ? .68 : .58 + Math.sin(performance.now() / 55) * .3;
  ctx.save();
  ctx.globalAlpha = pulse;
  ctx.fillStyle = '#fffbd0';
  ctx.shadowColor = '#e9f65b';
  ctx.shadowBlur = 22;
  for (const key of clearingCells) {
    const [x, y] = key.split(',').map(Number);
    roundRect(ctx, x * CELL + 3, y * CELL + 3, CELL - 6, CELL - 6, CELL * .14); ctx.fill();
  }
  ctx.restore();
}

function roundRect(context,x,y,w,h,r) {
  context.beginPath(); context.roundRect(x,y,w,h,r);
}

function draw() {
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle='#070909'; ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.strokeStyle='rgba(255,255,255,.035)'; ctx.lineWidth=1;
  for(let x=1;x<COLS;x++){ctx.beginPath();ctx.moveTo(x*CELL,0);ctx.lineTo(x*CELL,ROWS*CELL);ctx.stroke();}
  for(let y=1;y<ROWS;y++){ctx.beginPath();ctx.moveTo(0,y*CELL);ctx.lineTo(COLS*CELL,y*CELL);ctx.stroke();}
  const connected = connectionPreview();
  for(let y=0;y<ROWS;y++) for(let x=0;x<COLS;x++) if(board[y][x]!==null) {
    drawCell(ctx,x,y,board[y][x],CELL,1,eventBoard[y][x]);
    drawConnectionCue(ctx,x,y,CELL,connected.get(`${x},${y}`));
  }
  if (active && running && !resolving) {
    const landingY = ghostY();
    for (const c of active.cells) if(c.y+landingY>=0) drawCell(ctx,c.x+active.x,c.y+landingY,c.color,CELL,.18,c.event);
    for (const c of cellsOf(active)) if(c.y>=0) {
      drawCell(ctx,c.x,c.y,c.color,CELL,1,c.event);
      drawConnectionCue(ctx,c.x,c.y,CELL,connected.get(`${c.x},${c.y}`));
    }
  }
  drawArrowBeams();
  drawClearingCells();
  drawParticles();
}

function drawMini(context, piece, top, cell=15, centerX=context.canvas.width/2) {
  if (!piece) return;
  const xs=piece.cells.map(c=>c.x), ys=piece.cells.map(c=>c.y);
  const width=(Math.max(...xs)-Math.min(...xs)+1)*cell;
  const ox=(centerX-width/2)/cell-Math.min(...xs);
  piece.cells.forEach(c=>drawCell(context,c.x+ox,c.y+top,c.color,cell,1,c.event));
}

function drawRacks() {
  holdCtx.clearRect(0,0,72,72); nextCtx.clearRect(0,0,168,48);
  drawMini(holdCtx,hold,1,15);
  queue.forEach((p,i)=>drawMini(nextCtx,p,.35,11,28+i*56));
}

function updateStats() { scoreEl.textContent=String(score).padStart(6,'0'); levelEl.textContent=String(level).padStart(2,'0'); }
function updateReactor() {
  const activeReactor = isReactorActive(reactor);
  const value = activeReactor ? reactorSecondsLeft(reactor, performance.now()) : 0;
  const renderKey = `${activeReactor}:${value}:${reactorGuideActive}`;
  if (renderKey === reactorRenderKey) return;
  reactorRenderKey = renderKey;
  reactorStatus.hidden = !activeReactor;
  reactorValue.textContent = reactorGuideActive ? 'TAP' : String(value);
  reactorInstruction.textContent = reactorGuideActive ? 'TOUCH A COLOR GROUP' : 'TOUCH THE FIELD';
  reactorStatus.setAttribute('aria-label', activeReactor
    ? reactorGuideActive ? '색상 블럭을 터치해보세요' : `리액터 ${value}초 남음, 쌓인 블럭을 터치하세요`
    : '리액터 대기');
}

function beginReactor() {
  if (!running || resolving || isReactorActive(reactor) || reactorCharge < 100) return;
  if (!hasOccupiedCell(board)) { spawn(); return; }
  const now = performance.now();
  reactor = startReactor(now, getReactorDuration(level));
  reactorGuideActive = !reactorGuideSeen();
  if (reactorGuideActive) reactor = pauseReactor(reactor, now);
  active = null;
  gestureStart = null;
  callout.textContent = 'REACTOR · TOUCH';
  callout.classList.remove('pop'); void callout.offsetWidth; callout.classList.add('pop');
  boardFrame.classList.add('reactor-active');
  boardFrame.classList.toggle('reactor-guided', reactorGuideActive);
  music?.setReactor(true);
  reactorStartSound();
  levelUpSound(20); updateReactor();
}

function finishReactor() {
  if (!isReactorActive(reactor)) return;
  reactor = finishReactorState(reactor);
  reactorCharge = 0;
  boardFrame.classList.remove('reactor-active', 'reactor-guided'); reactorGuideActive = false;
  music?.setReactor(false);
  reactorFinishSound();
  callout.textContent = 'REACTOR · RESOLVE';
  callout.classList.remove('pop'); void callout.offsetWidth; callout.classList.add('pop');
  updateReactor();
  resolveBoard();
}

function pauseReactorTimer() {
  reactor = pauseReactor(reactor, performance.now());
}

function resumeReactorTimer() {
  if (!reactorGuideActive) reactor = resumeReactor(reactor, performance.now());
}

function renderMeta() {
  paceButton.textContent = `PACE · ${pace.label}`;
  const themes = unlockedThemes(profile);
  if (!themes.some(theme => theme.id === profile.theme)) profile.theme = 'reactor';
  const theme = themes.find(item => item.id === profile.theme) || themes[0];
  themeButton.textContent = `THEME · ${theme.label}`;
  document.body.dataset.theme = theme.id;
}

function cycleTheme() {
  const themes = unlockedThemes(profile);
  const index = themes.findIndex(theme => theme.id === profile.theme);
  profile.theme = themes[(index + 1) % themes.length].id;
  try { localStorage.setItem('color-tetrix-profile-v1', JSON.stringify(profile)); } catch { /* private mode */ }
  renderMeta();
}

function showChain(n, intensity = 'clear', points = 0) {
  const label = intensity === 'overload' ? 'OVERLOAD' : intensity === 'surge' ? 'SURGE' : n===1 ? 'CLEAR' : `${n} BOMB`;
  callout.textContent = `${label} · +${points.toLocaleString()}`;
  callout.classList.remove('pop'); void callout.offsetWidth; callout.classList.add('pop');
}
function pause(ms) { return new Promise(resolve=>setTimeout(resolve,ms)); }
async function waitUntilResumed(resolvingRun) {
  while (paused && resolvingRun === runId) await pause(50);
}

function tutorialSeen() {
  try { return localStorage.getItem('color-tetrix-tutorial-seen') === '1'; }
  catch { return false; }
}

function rememberTutorial() {
  try { localStorage.setItem('color-tetrix-tutorial-seen', '1'); } catch { /* private mode fallback */ }
}

function reactorGuideSeen() {
  try { return localStorage.getItem('color-tetrix-reactor-guide-seen') === '1'; }
  catch { return false; }
}

function rememberReactorGuide() {
  try { localStorage.setItem('color-tetrix-reactor-guide-seen', '1'); } catch { /* private mode fallback */ }
}

function openTutorial(startsGame = false) {
  tutorialStartsGame = startsGame;
  tutorialOpener = document.activeElement;
  if (running) { pauseReactorTimer(); paused = true; stopMusic(); }
  gameShell.inert = true;
  tutorial.hidden = false;
  tutorialClose.focus();
}

function closeTutorial() {
  const startsGame = tutorialStartsGame;
  tutorial.hidden = true;
  gameShell.inert = false;
  rememberTutorial();
  if (startsGame) reset();
  else if (running) { resumeReactorTimer(); paused = false; lastTime = performance.now(); startMusic(); }
  tutorialStartsGame = false;
  if (!startsGame) tutorialOpener?.focus?.();
  tutorialOpener = null;
}

function showGestureHint(message) {
  clearTimeout(hintTimer);
  gestureHint.textContent = message;
  gestureHint.classList.add('visible');
  hintTimer = setTimeout(() => gestureHint.classList.remove('visible'), 1500);
}

function endGame() {
  running=false; resolving=false;
  stopMusic(.32);
  overlayTitle.innerHTML='연쇄가<br />멈췄습니다';
  overlayCopy.textContent=`최종 점수 ${String(score).padStart(6,'0')} · 새로운 연쇄를 시작하시겠습니까?`;
  document.querySelector('#startButton').innerHTML='RETRY <span>↻</span>';
  shareButton.hidden = false;
  overlay.classList.add('visible', 'game-over');
  scoreRecord.hidden = false;
  playerNameInput.value = savedPlayerName();
  scoreStatus.textContent = '';
  refreshLeaderboard();
  profile = finishRun(profile, { level, clears: lines, maxChain });
  try { localStorage.setItem('color-tetrix-profile-v1', JSON.stringify(profile)); } catch { /* private mode */ }
  pace = getPace(profile); renderMeta();
  tone(90,.22);
}

function loop(time) {
  if (!running) { draw(); return; }
  if (paused) { lastTime=time; draw(); requestAnimationFrame(loop); return; }
  const dt=time-lastTime; lastTime=time; dropTimer+=dt;
  updateParticles(Math.min(dt, 32));
  if (isReactorActive(reactor)) {
    if (isReactorExpired(reactor, time)) finishReactor();
    updateReactor(); draw(); requestAnimationFrame(loop); return;
  }
  if (!resolving) {
    if (collides({...active, y:active.y+1})) {
      lockTimer += dt;
      if (lockTimer >= getLockDelay(level)) lock();
    } else {
      lockTimer = 0;
      if (dropTimer > getDropInterval(level) / pace.multiplier) { move(0,1); dropTimer=0; }
    }
  }
  updateReactor(); draw(); requestAnimationFrame(loop);
}

let audio, music, legacyMediaPrimed = false;
function ensureAudio() {
  if (!audio || audio.state === 'closed') {
    audio=createAudioContext(window);
    music = audio ? new MusicEngine(audio) : null;
    music?.setReactor(isReactorActive(reactor));
  }
  if (!audio) return null;
  resumeIfSuspended(audio).catch(()=>{});
  return audio;
}

function unlockAudioSession() {
  const sessionConfigured = configureAudioSession(navigator);
  if (!sessionConfigured && !legacyMediaPrimed) {
    legacyMediaPrimed = true;
    primeLegacyMediaChannel(window).then(primed => { legacyMediaPrimed = primed; });
  }
  const context = ensureAudio();
  if (!context) return;
  unlockAudioContext(context).then(unlocked => {
    if (unlocked) startMusic();
  });
}

function startMusic() {
  if (muted || !running || paused) return;
  const context = ensureAudio();
  if (context) music?.start(level);
}

function stopMusic(fade) { music?.stop(fade); }

function tone(freq,duration) {
  if(muted) return;
  const context=ensureAudio();
  if (!context) return;
  const osc=context.createOscillator(), gain=context.createGain();
  osc.type='square'; osc.frequency.value=freq; gain.gain.setValueAtTime(.025,context.currentTime); gain.gain.exponentialRampToValueAtTime(.001,context.currentTime+duration);
  osc.connect(gain).connect(context.destination); osc.start(); osc.stop(context.currentTime+duration);
}

function reactorStartSound() {
  if (muted) return;
  const context = ensureAudio();
  if (!context) return;
  const now = context.currentTime;
  for (const [start, end, type, volume] of [[58, 174, 'sawtooth', .09], [220, 880, 'square', .045]]) {
    const oscillator = context.createOscillator(), gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(start, now);
    oscillator.frequency.exponentialRampToValueAtTime(end, now + .42);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(.001, now + .48);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(now); oscillator.stop(now + .48);
  }
}

function reactorTouchSound(cellCount) {
  if (muted) return;
  const context = ensureAudio();
  if (!context) return;
  const now = context.currentTime;
  const oscillator = context.createOscillator(), gain = context.createGain();
  oscillator.type = 'square';
  oscillator.frequency.setValueAtTime(260 + Math.min(cellCount, 12) * 28, now);
  oscillator.frequency.exponentialRampToValueAtTime(920, now + .11);
  gain.gain.setValueAtTime(.065, now);
  gain.gain.exponentialRampToValueAtTime(.001, now + .14);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start(now); oscillator.stop(now + .14);
}

function reactorFinishSound() {
  if (muted) return;
  const context = ensureAudio();
  if (!context) return;
  const now = context.currentTime;
  const oscillator = context.createOscillator(), gain = context.createGain();
  oscillator.type = 'sawtooth';
  oscillator.frequency.setValueAtTime(760, now);
  oscillator.frequency.exponentialRampToValueAtTime(82, now + .28);
  gain.gain.setValueAtTime(.07, now);
  gain.gain.exponentialRampToValueAtTime(.001, now + .32);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start(now); oscillator.stop(now + .32);
}

function shatterSound(chain, removedCount) {
  if (muted) return;
  const context = ensureAudio();
  if (!context) return;
  const now = context.currentTime;
  const duration = Math.min(.16, .075 + removedCount * .003);
  const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * duration), context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);

  const crack = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const crackGain = context.createGain();
  crack.buffer = buffer;
  filter.type = 'highpass';
  filter.frequency.value = 650 + chain * 120;
  crackGain.gain.setValueAtTime(.075, now);
  crackGain.gain.exponentialRampToValueAtTime(.001, now + duration);
  crack.connect(filter).connect(crackGain).connect(context.destination);
  crack.start(now);

  const chime = context.createOscillator();
  const chimeGain = context.createGain();
  chime.type = 'triangle';
  chime.frequency.setValueAtTime(330 + chain * 95, now);
  chime.frequency.exponentialRampToValueAtTime(520 + chain * 125, now + .1);
  chimeGain.gain.setValueAtTime(.04, now);
  chimeGain.gain.exponentialRampToValueAtTime(.001, now + .14);
  chime.connect(chimeGain).connect(context.destination);
  chime.start(now);
  chime.stop(now + .14);
}

function arrowBeamSound(beamCount) {
  if (muted) return;
  const context = ensureAudio();
  if (!context) return;
  const now = context.currentTime;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = 'sawtooth';
  oscillator.frequency.setValueAtTime(150, now);
  oscillator.frequency.exponentialRampToValueAtTime(760 + Math.min(beamCount, 4) * 90, now + .19);
  gain.gain.setValueAtTime(.065, now);
  gain.gain.exponentialRampToValueAtTime(.001, now + .23);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start(now);
  oscillator.stop(now + .23);
}

function levelUpSound(nextLevel) {
  if (muted) return;
  [0, .065, .13].forEach((delay, index) => {
    const context = ensureAudio();
    if (!context) return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const start = context.currentTime + delay;
    oscillator.type = 'square';
    oscillator.frequency.value = [440, 554.37, 659.25][index] * (1 + Math.min(nextLevel, 20) * .004);
    gain.gain.setValueAtTime(.035, start);
    gain.gain.exponentialRampToValueAtTime(.001, start + .11);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(start); oscillator.stop(start + .11);
  });
}

function savedPlayerName() {
  try { return localStorage.getItem('color-tetrix-player-name') || ''; }
  catch { return ''; }
}

function rememberPlayerName(name) {
  try { localStorage.setItem('color-tetrix-player-name', name); }
  catch { /* private mode fallback */ }
}

async function refreshLeaderboard() {
  leaderboardTitle.textContent = '기기 내 TOP 50';
  leaderboardList.innerHTML = '<li><strong>기록 불러오는 중…</strong></li>';
  try {
    const { loadTopScores } = await getLeaderboardApi();
    const entries = await loadTopScores();
    leaderboardList.replaceChildren(...entries.map(entry => {
      const item = document.createElement('li');
      const name = document.createElement('strong');
      const points = document.createElement('span');
      name.textContent = entry.name;
      points.textContent = String(entry.score).padStart(6, '0');
      item.append(name, points);
      return item;
    }));
    if (!entries.length) leaderboardList.innerHTML = '<li><strong>첫 기록을 남겨주세요</strong></li>';
  } catch {
    leaderboardList.innerHTML = '<li><strong>순위를 불러오지 못했습니다</strong></li>';
  }
}

async function shareGame() {
  const url = `${location.origin}${location.pathname}`;
  const data = {
    title: 'COLOR BOMB',
    text: `COLOR BOMB에서 ${score.toLocaleString()}점을 기록했습니다. 같은 색 6칸 이상을 연결해 블럭을 폭파하고 연쇄를 이어나가세요.`,
    url,
  };
  try {
    if (navigator.share) {
      await navigator.share(data);
      return;
    }
    await navigator.clipboard.writeText(url);
    showShareCopied();
  } catch (error) {
    if (error?.name === 'AbortError') return;
    try {
      await navigator.clipboard.writeText(url);
      showShareCopied();
    } catch {
      scoreStatus.textContent = `공유 링크: ${url}`;
    }
  }
}

function showShareCopied() {
  shareButton.textContent = 'COPIED ✓';
  setTimeout(() => { shareButton.innerHTML = 'SHARE <span>↗</span>'; }, 1400);
}

function softDrop() {
  if (!move(0,1,true)) return false;
  score += 1; updateStats();
  return true;
}

function act(action) {
  if (paused || isReactorActive(reactor)) return false;
  if(action==='left') return move(-1,0,true);
  if(action==='right') return move(1,0,true);
  if(action==='rotate') { rotate(); return true; }
  if(action==='drop') { hardDrop(); return true; }
  if(action==='down') return softDrop();
  if(action==='hold') { holdPiece(); return true; }
  return false;
}

document.querySelector('#startButton').addEventListener('click',()=>{
  unlockAudioSession();
  document.body.classList.add('playing');
  if (!tutorialSeen()) openTutorial(true);
  else reset();
});
themeButton.addEventListener('click', cycleTheme);
paceButton.addEventListener('click',()=>showGestureHint(`추천 페이스 · ${pace.label}`));
scoreForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (scoreSubmitted) return;
  const submitButton = scoreForm.querySelector('button');
  submitButton.disabled = true;
  scoreStatus.textContent = '기록 저장 중…';
  try {
    const { normalizePlayerName, submitScore } = await getLeaderboardApi();
    const name = normalizePlayerName(playerNameInput.value);
    if (!name) {
      scoreStatus.textContent = '이름을 입력해주세요.';
      playerNameInput.focus();
      return;
    }
    const savedName = await submitScore(name, score, level);
    rememberPlayerName(savedName);
    playerNameInput.value = savedName;
    scoreSubmitted = true;
    scoreStatus.textContent = '기록되었습니다.';
    await refreshLeaderboard();
  } catch {
    scoreStatus.textContent = '저장하지 못했습니다. 다시 시도해주세요.';
  } finally {
    submitButton.disabled = scoreSubmitted;
  }
});
shareButton.addEventListener('click', shareGame);
document.querySelectorAll('[data-access-action]').forEach(button => {
  button.addEventListener('click', () => act(button.dataset.accessAction));
});
document.querySelector('#soundButton').addEventListener('click',e=>{
  muted=!muted;
  e.currentTarget.textContent=muted?'×':'♪';
  e.currentTarget.setAttribute('aria-label',muted?'소리 켜기':'소리 끄기');
  if (muted) stopMusic();
  else { unlockAudioSession(); tone(440,.05); }
});
document.querySelector('#helpButton').addEventListener('click',()=>openTutorial(false));
tutorialClose.addEventListener('click',()=>{ unlockAudioSession(); closeTutorial(); });
gameShell.addEventListener('contextmenu',e=>e.preventDefault());
window.addEventListener('keydown',e=>{
  if (!tutorial.hidden) { if (e.key === 'Escape') { e.preventDefault(); closeTutorial(); } return; }
  const action=actionForKey(e);
  if(action) { e.preventDefault(); act(action); }
});
document.addEventListener('visibilitychange',()=>{
  if(document.hidden && running) { pauseReactorTimer(); paused=true; autoPaused=true; stopMusic(); }
  else if(autoPaused) {
    autoPaused=false;
    if (tutorial.hidden) { resumeReactorTimer(); paused=false; lastTime=performance.now(); startMusic(); }
  }
});

canvas.addEventListener('pointerdown',e=>{
  if (!running || paused) return;
  unlockAudioSession();
  const rect=canvas.getBoundingClientRect();
  if (isReactorActive(reactor)) {
    const x = Math.floor((e.clientX - rect.left) / rect.width * COLS);
    const y = Math.floor((e.clientY - rect.top) / rect.height * ROWS);
    const result = recolorConnectedGroup(board, x, y, COLORS.length, randomSource);
    if (result.changed) {
      board = result.board;
      if (reactorGuideActive) {
        reactorGuideActive = false;
        boardFrame.classList.remove('reactor-guided');
        reactor = resumeReactor(reactor, performance.now());
        rememberReactorGuide(); updateReactor();
      }
      reactorTouchSound(result.cells.length);
      if (!prefersReducedMotion) {
        reactorStatus.animate([
          {opacity:1, transform:'scale(1)'},
          {opacity:.42, transform:'scale(1.08)'},
          {opacity:1, transform:'scale(1)'},
        ], {duration:180, easing:'cubic-bezier(.16,1,.3,1)'});
      }
      draw(); showGestureHint('색상 변환');
    }
    e.preventDefault(); return;
  }
  if (!['touch','pen'].includes(e.pointerType)) return;
  gestureStart = {
    x:e.clientX, y:e.clientY, time:performance.now(), id:e.pointerId,
    axis:null, appliedX:0, appliedY:0, moved:false,
    cellWidth:rect.width/COLS, cellHeight:rect.height/ROWS,
  };
  canvas.setPointerCapture(e.pointerId);
  e.preventDefault();
});
canvas.addEventListener('pointermove',e=>{
  if (!gestureStart || e.pointerId !== gestureStart.id) return;
  const dx=e.clientX-gestureStart.x, dy=e.clientY-gestureStart.y;
  if (!gestureStart.axis && Math.max(Math.abs(dx),Math.abs(dy)) > 10) {
    gestureStart.axis=Math.abs(dx)>Math.abs(dy)?'x':'y';
  }
  if (gestureStart.axis==='x') {
    const target=dragStepTarget(dx,gestureStart.cellWidth);
    while (gestureStart.appliedX < target) {
      if (!move(1,0,true)) break;
      gestureStart.appliedX++; gestureStart.moved=true;
    }
    while (gestureStart.appliedX > target) {
      if (!move(-1,0,true)) break;
      gestureStart.appliedX--; gestureStart.moved=true;
    }
  } else if (gestureStart.axis==='y' && dy>0) {
    const target=Math.max(0,dragStepTarget(dy,gestureStart.cellHeight));
    while (gestureStart.appliedY < target) {
      if (!softDrop()) break;
      gestureStart.appliedY++; gestureStart.moved=true;
    }
  }
  e.preventDefault();
});
canvas.addEventListener('pointerup',e=>{
  if (!gestureStart || e.pointerId !== gestureStart.id) return;
  const dx=e.clientX-gestureStart.x, dy=e.clientY-gestureStart.y;
  const duration=Math.max(1,performance.now()-gestureStart.time);
  const moved=gestureStart.moved;
  gestureStart=null;
  if (!moved && Math.hypot(dx,dy) < 14 && duration < 280) { act('rotate'); showGestureHint('회전'); return; }
  if (Math.abs(dx)>Math.abs(dy) && moved) showGestureHint(dx<0?'왼쪽 이동':'오른쪽 이동');
  else if (dy < -45) { act('hold'); showGestureHint('조각 보관'); }
  else if (dy > 70 && dy/duration > 1.1 && Math.abs(dx) < dy*.45) { act('drop'); showGestureHint('한 번에 내리기'); }
  else if (dy > 24 && moved) showGestureHint('천천히 내리기');
});
canvas.addEventListener('pointercancel',()=>{ gestureStart=null; });
document.addEventListener('gesturestart', event => event.preventDefault(), {passive:false});
document.addEventListener('gesturechange', event => event.preventDefault(), {passive:false});

board=Array.from({length:ROWS},()=>Array(COLS).fill(null)); eventBoard=Array.from({length:ROWS},()=>Array(COLS).fill(null)); queue=[]; active=null; hold=null; score=0; level=1; running=false; paused=false;
draw(); drawRacks(); updateStats(); updateReactor(); renderMeta();
setupPwa();
