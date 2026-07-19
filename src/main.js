import './style.css';
import { actionForKey, isBottomCellTouch } from './input.js';
import { configureAudioSession, createAudioContext, primeLegacyMediaChannel, resumeIfSuspended, unlockAudioContext } from './audio.js';
import { createPieceColors, createPieceEvent, rotateSquareCells } from './pieces.js';
import { MusicEngine } from './music.js';
import { getClearIntensity, getDropInterval, getLevelForClears, getLockDelay } from './difficulty.js';
import { resolveArrowEffects } from './events.js';
import { chargeReactor, createSeededRandom, finishRun, getKstDay, getKstWeek, getPace, OVERDRIVE_MS, readProfile, unlockedThemes } from './progression.js';
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
const dailyButton = document.querySelector('#dailyButton');
const reactorButton = document.querySelector('#reactorButton');
const reactorFill = document.querySelector('#reactorFill');
const reactorValue = document.querySelector('#reactorValue');
const paceButton = document.querySelector('#paceButton');
const themeButton = document.querySelector('#themeButton');
const weeklyProgress = document.querySelector('#weeklyProgress');
const isTouchDevice = matchMedia('(any-pointer: coarse)').matches || navigator.maxTouchPoints > 0;
const prefersReducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

let board, eventBoard, active, queue, hold, holdUsed, score, level, lines, running, paused;
let lastTime = 0, dropTimer = 0, resolving = false, muted = false;
let shapeBag = [], colorBag = [];
let runId = 0, lockTimer = 0;
let piecesSinceMono = 0, piecesSinceEvent = 0, particles = [];
let arrowBeams = [];
let tutorialStartsGame = false, piecesSpawned = 0, hintTimer;
let tutorialOpener = null, autoPaused = false;
let gestureStart = null;
let scoreSubmitted = false;
let leaderboardApiPromise;
let randomSource = Math.random, gameMode = 'endless', dailyDay = '';
let reactorCharge = 0, overdriveUntil = 0, maxChain = 0, runStartedAt = 0;
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
    x:SPAWN_X, y:-1,
  };
}

function refillQueue() { while (queue.length < 3) queue.push(makePiece()); }

function spawn() {
  active = queue.shift();
  active.x = SPAWN_X; active.y = -1;
  holdUsed = false;
  refillQueue();
  drawRacks();
  piecesSpawned++;
  if (isTouchDevice && piecesSpawned <= 3) showGestureHint('탭 회전 · 드래그 이동');
  if (collides(active)) endGame();
}

function reset(mode = gameMode) {
  runId++;
  gameMode = mode;
  dailyDay = mode === 'daily' ? getKstDay() : '';
  randomSource = mode === 'daily' ? createSeededRandom(`color-tetrix:${dailyDay}:v1`) : Math.random;
  document.body.classList.add('playing');
  board = Array.from({length: ROWS}, () => Array(COLS).fill(null));
  eventBoard = Array.from({length: ROWS}, () => Array(COLS).fill(null));
  queue = []; hold = null; holdUsed = false; score = 0; level = 1; lines = 0;
  shapeBag = []; colorBag = []; resolving = false; running = true; paused = false; piecesSpawned = 0;
  piecesSinceMono = 0; piecesSinceEvent = 0; particles = []; arrowBeams = [];
  reactorCharge = 0; overdriveUntil = 0; maxChain = 0; runStartedAt = Date.now();
  refillQueue(); spawn(); updateStats();
  overlay.classList.remove('visible', 'game-over');
  scoreRecord.hidden = true;
  scoreSubmitted = false;
  scoreForm.querySelector('button').disabled = false;
  shareButton.hidden = true;
  dailyButton.hidden = true;
  lastTime = performance.now(); dropTimer = 0; lockTimer = 0;
  startMusic();
  updateReactor();
  requestAnimationFrame(loop);
}

function cellsOf(piece) { return piece.cells.map(c => ({ x: c.x + piece.x, y: c.y + piece.y, color: c.color, event: c.event })); }

function collides(piece) {
  return cellsOf(piece).some(c => c.x < 0 || c.x >= COLS || c.y >= ROWS || (c.y >= 0 && board[c.y][c.x] !== null));
}

function move(dx, dy) {
  if (!running || paused || resolving) return false;
  const next = {...active, x: active.x + dx, y: active.y + dy};
  if (collides(next)) return false;
  active = next; return true;
}

function rotate() {
  if (!running || paused || resolving) return;
  const rotated = {...active, cells: active.type === 'O'
    ? rotateSquareCells(active.cells)
    : active.cells.map(c => ({...c, x: 2 - c.y, y: c.x}))};
  for (const kick of [0,-1,1,-2,2]) {
    const candidate = {...rotated, x: rotated.x + kick};
    if (!collides(candidate)) { active = candidate; tone(480, .035); return; }
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
    const overdriveMultiplier = performance.now() < overdriveUntil ? 2 : 1;
    score += Math.round(removed.size * 10 * [1,1.5,2.2,3.2,4.5][Math.min(chain - 1, 4)] * overdriveMultiplier);
    lines += removed.size;
    reactorCharge = chargeReactor(reactorCharge, removed.size, chain);
    updateReactor();
    const previousLevel = level;
    level = getLevelForClears(lines);
    music?.setLevel(level);
    updateStats();
    showClearImpact(removed.size, chain);
    shatterSound(chain, removed.size);
    if (level > previousLevel) showLevelUp(level);
    draw(); await pause(220);
    await waitUntilResumed(resolvingRun);
    if (resolvingRun !== runId) return;
    applyGravity(); draw(); await pause(150);
    await waitUntilResumed(resolvingRun);
    if (resolvingRun !== runId) return;
  }
  resolving = false; chainEl.textContent = '—'; spawn();
}

function findGroups() {
  const seen = new Set(), result = [];
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    if (board[y][x] === null || seen.has(`${x},${y}`)) continue;
    const color = board[y][x], group = [], stack = [[x,y]];
    seen.add(`${x},${y}`);
    while (stack.length) {
      const [cx,cy] = stack.pop(); group.push([cx,cy]);
      for (const [nx,ny] of [[cx+1,cy],[cx-1,cy],[cx,cy+1],[cx,cy-1]]) {
        const key = `${nx},${ny}`;
        if (nx>=0 && nx<COLS && ny>=0 && ny<ROWS && !seen.has(key) && board[ny][nx]===color) { seen.add(key); stack.push([nx,ny]); }
      }
    }
    if (group.length >= MATCH) result.push(group);
  }
  return result;
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
  holdUsed = true; drawRacks(); tone(360,.04);
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

function showClearImpact(removedCount, chain) {
  const intensity = getClearIntensity(removedCount);
  showChain(chain, intensity.name);
  if (prefersReducedMotion || intensity.name === 'clear') return;
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

function roundRect(context,x,y,w,h,r) {
  context.beginPath(); context.roundRect(x,y,w,h,r);
}

function draw() {
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle='#070909'; ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.strokeStyle='rgba(255,255,255,.035)'; ctx.lineWidth=1;
  for(let x=1;x<COLS;x++){ctx.beginPath();ctx.moveTo(x*CELL,0);ctx.lineTo(x*CELL,ROWS*CELL);ctx.stroke();}
  for(let y=1;y<ROWS;y++){ctx.beginPath();ctx.moveTo(0,y*CELL);ctx.lineTo(COLS*CELL,y*CELL);ctx.stroke();}
  for(let y=0;y<ROWS;y++) for(let x=0;x<COLS;x++) if(board[y][x]!==null) drawCell(ctx,x,y,board[y][x],CELL,1,eventBoard[y][x]);
  if (active && running && !resolving) {
    const landingY = ghostY();
    for (const c of active.cells) if(c.y+landingY>=0) drawCell(ctx,c.x+active.x,c.y+landingY,c.color,CELL,.18,c.event);
    for (const c of cellsOf(active)) if(c.y>=0) drawCell(ctx,c.x,c.y,c.color,CELL,1,c.event);
  }
  drawArrowBeams();
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
  const activeOverdrive = performance.now() < overdriveUntil;
  const value = activeOverdrive ? Math.max(0, Math.ceil((overdriveUntil - performance.now()) / 1000)) : reactorCharge;
  const disabled = !running || resolving || activeOverdrive || reactorCharge < 100;
  const renderKey = `${activeOverdrive}:${value}:${disabled}`;
  if (renderKey === reactorRenderKey) return;
  reactorRenderKey = renderKey;
  reactorFill.style.width = `${activeOverdrive ? 100 : reactorCharge}%`;
  reactorValue.textContent = activeOverdrive ? `${value}s` : `${reactorCharge}%`;
  reactorButton.disabled = disabled;
  reactorButton.classList.toggle('ready', reactorCharge >= 100 && !activeOverdrive);
  reactorButton.classList.toggle('active', activeOverdrive);
  reactorButton.setAttribute('aria-label', activeOverdrive ? `오버드라이브 ${value}초 남음` : `리액터 충전 ${reactorCharge}%`);
}

function activateReactor() {
  if (!running || resolving || reactorCharge < 100 || performance.now() < overdriveUntil) return;
  reactorCharge = 0;
  overdriveUntil = performance.now() + OVERDRIVE_MS;
  callout.textContent = 'OVERDRIVE ×2';
  callout.classList.remove('pop'); void callout.offsetWidth; callout.classList.add('pop');
  boardFrame.classList.add('overdrive');
  setTimeout(() => boardFrame.classList.remove('overdrive'), OVERDRIVE_MS);
  levelUpSound(20); updateReactor();
}

function renderMeta() {
  paceButton.textContent = `PACE · ${gameMode === 'daily' ? 'FIXED' : pace.label}`;
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

async function refreshWeekly() {
  try {
    const { loadWeeklyClears } = await getLeaderboardApi();
    const total = await loadWeeklyClears(getKstWeek());
    weeklyProgress.textContent = `WEEKLY REACTOR · ${Math.min(total, 100000).toLocaleString()} / 100,000`;
  } catch { weeklyProgress.textContent = 'WEEKLY REACTOR · 오프라인'; }
}
function showChain(n, intensity = 'clear') {
  callout.textContent = intensity === 'overload' ? 'OVERLOAD' : intensity === 'surge' ? 'SURGE' : n===1 ? 'CLEAR' : `${n} CHAIN`;
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

function openTutorial(startsGame = false) {
  tutorialStartsGame = startsGame;
  tutorialOpener = document.activeElement;
  if (running) { paused = true; stopMusic(); }
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
  else if (running) { paused = false; lastTime = performance.now(); startMusic(); }
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
  overlayTitle.innerHTML='반응로가<br />가득 찼다';
  overlayCopy.textContent=`최종 점수 ${String(score).padStart(6,'0')} · 다시 연결하시겠습니까?`;
  document.querySelector('#startButton').innerHTML='RETRY <span>↻</span>';
  shareButton.hidden = false;
  dailyButton.hidden = false;
  overlay.classList.add('visible', 'game-over');
  scoreRecord.hidden = false;
  playerNameInput.value = savedPlayerName();
  scoreStatus.textContent = '';
  refreshLeaderboard();
  profile = finishRun(profile, { level, clears: lines, maxChain });
  try { localStorage.setItem('color-tetrix-profile-v1', JSON.stringify(profile)); } catch { /* private mode */ }
  pace = getPace(profile); renderMeta();
  getLeaderboardApi().then(({submitRunSummary}) => submitRunSummary({
    week:getKstWeek(), score, level, clears:lines, maxChain,
    durationSec:Math.max(1, Math.round((Date.now()-runStartedAt)/1000)), mode:gameMode,
  })).then(refreshWeekly).catch(()=>{});
  tone(90,.22);
}

function loop(time) {
  if (!running) { draw(); return; }
  if (paused) { lastTime=time; draw(); requestAnimationFrame(loop); return; }
  const dt=time-lastTime; lastTime=time; dropTimer+=dt;
  updateParticles(Math.min(dt, 32));
  if (!resolving) {
    if (collides({...active, y:active.y+1})) {
      lockTimer += dt;
      if (lockTimer >= getLockDelay(level)) lock();
    } else {
      lockTimer = 0;
      if (performance.now() >= overdriveUntil && dropTimer > getDropInterval(level) / (gameMode === 'daily' ? 1 : pace.multiplier)) { move(0,1); dropTimer=0; }
    }
  }
  updateReactor(); draw(); requestAnimationFrame(loop);
}

let audio, music, legacyMediaPrimed = false;
function ensureAudio() {
  if (!audio || audio.state === 'closed') {
    audio=createAudioContext(window);
    music = audio ? new MusicEngine(audio) : null;
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
  leaderboardTitle.textContent = gameMode === 'daily' ? `DAILY ${dailyDay || getKstDay()} · TOP 50` : 'TOP 50';
  leaderboardList.innerHTML = '<li><strong>기록 불러오는 중…</strong></li>';
  try {
    const { loadTopScores, loadDailyScores } = await getLeaderboardApi();
    const entries = gameMode === 'daily' ? await loadDailyScores(dailyDay || getKstDay()) : await loadTopScores();
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
    title: 'Color Tetrix',
    text: `Color Tetrix에서 ${score.toLocaleString()}점을 기록했습니다. 색을 연결하고 연쇄에 도전해보세요!`,
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
  if (!move(0,1)) return false;
  score += 1; updateStats();
  return true;
}

function act(action) {
  if (paused) return false;
  if(action==='left') return move(-1,0);
  if(action==='right') return move(1,0);
  if(action==='rotate') { rotate(); return true; }
  if(action==='drop') { hardDrop(); return true; }
  if(action==='down') return softDrop();
  if(action==='hold') { holdPiece(); return true; }
  return false;
}

document.querySelector('#startButton').addEventListener('click',()=>{
  unlockAudioSession();
  document.body.classList.add('playing');
  gameMode = overlay.classList.contains('game-over') ? gameMode : 'endless';
  if (!tutorialSeen()) openTutorial(true);
  else reset(gameMode);
});
dailyButton.addEventListener('click',()=>{
  unlockAudioSession(); document.body.classList.add('playing'); gameMode = 'daily';
  if (!tutorialSeen()) openTutorial(true);
  else reset('daily');
});
reactorButton.addEventListener('click', activateReactor);
themeButton.addEventListener('click', cycleTheme);
paceButton.addEventListener('click',()=>showGestureHint(`추천 페이스 · ${pace.label}`));
scoreForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (scoreSubmitted) return;
  const submitButton = scoreForm.querySelector('button');
  submitButton.disabled = true;
  scoreStatus.textContent = '기록 저장 중…';
  try {
    const { normalizePlayerName, submitScore, submitDailyScore } = await getLeaderboardApi();
    const name = normalizePlayerName(playerNameInput.value);
    if (!name) {
      scoreStatus.textContent = '이름을 입력해주세요.';
      playerNameInput.focus();
      return;
    }
    const savedName = gameMode === 'daily' ? await submitDailyScore(name, score, level, dailyDay) : await submitScore(name, score, level);
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
document.querySelectorAll('[data-action]').forEach(button=>button.addEventListener('pointerdown',e=>{e.preventDefault();act(button.dataset.action);}));
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
  if (e.key.toLowerCase() === 'a') { e.preventDefault(); activateReactor(); return; }
  const action=actionForKey(e);
  if(action) { e.preventDefault(); act(action); }
});
document.addEventListener('visibilitychange',()=>{
  if(document.hidden && running) { paused=true; autoPaused=true; stopMusic(); }
  else if(autoPaused) {
    autoPaused=false;
    if (tutorial.hidden) { paused=false; lastTime=performance.now(); startMusic(); }
  }
});

canvas.addEventListener('pointerdown',e=>{
  if (!['touch','pen'].includes(e.pointerType) || !running || paused) return;
  unlockAudioSession();
  const rect=canvas.getBoundingClientRect();
  if (isBottomCellTouch(e.clientY, rect, ROWS)) {
    act('drop'); showGestureHint('하드 드롭'); e.preventDefault(); return;
  }
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
    const target=Math.trunc(dx/gestureStart.cellWidth);
    while (gestureStart.appliedX < target) {
      if (!move(1,0)) break;
      gestureStart.appliedX++; gestureStart.moved=true;
    }
    while (gestureStart.appliedX > target) {
      if (!move(-1,0)) break;
      gestureStart.appliedX--; gestureStart.moved=true;
    }
  } else if (gestureStart.axis==='y' && dy>0) {
    const target=Math.trunc(dy/gestureStart.cellHeight);
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
  else if (dy < -45) { act('hold'); showGestureHint('HOLD'); }
  else if (dy > 70 && dy/duration > 1.1 && Math.abs(dx) < dy*.45) { act('drop'); showGestureHint('하드 드롭'); }
  else if (dy > 24 && moved) showGestureHint('소프트 드롭');
});
canvas.addEventListener('pointercancel',()=>{ gestureStart=null; });
document.addEventListener('gesturestart', event => event.preventDefault(), {passive:false});
document.addEventListener('gesturechange', event => event.preventDefault(), {passive:false});

board=Array.from({length:ROWS},()=>Array(COLS).fill(null)); eventBoard=Array.from({length:ROWS},()=>Array(COLS).fill(null)); queue=[]; active=null; hold=null; score=0; level=1; running=false; paused=false;
draw(); drawRacks(); updateStats(); updateReactor(); renderMeta(); refreshWeekly();
setupPwa();
