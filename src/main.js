import './style.css';
import { actionForKey } from './input.js';

const COLS = 8;
const ROWS = 16;
const MATCH = 6;
const CELL = 40;
const COLORS = ['#ff6542', '#e9f65b', '#45d6a5', '#f28bd5'];
const PATTERNS = ['dot', 'slash', 'ring', 'cross'];
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
const overlay = document.querySelector('#overlay');
const overlayTitle = document.querySelector('#overlayTitle');
const overlayCopy = document.querySelector('#overlayCopy');
const tutorial = document.querySelector('#tutorial');
const tutorialClose = document.querySelector('#tutorialClose');
const gestureHint = document.querySelector('#gestureHint');
const gameShell = document.querySelector('.game-shell');
const isTouchDevice = matchMedia('(any-pointer: coarse)').matches || navigator.maxTouchPoints > 0;

let board, active, queue, hold, holdUsed, score, level, lines, running, paused;
let lastTime = 0, dropTimer = 0, resolving = false, muted = false;
let shapeBag = [], colorBag = [];
let runId = 0, lockTimer = 0;
let tutorialStartsGame = false, piecesSpawned = 0, hintTimer;
let tutorialOpener = null, autoPaused = false;

function shuffled(values) {
  const a = [...values];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
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
  if (new Set(seed).size === 1) seed[3] = (seed[3] + 1 + Math.floor(Math.random() * 3)) % 4;
  return shuffled(seed);
}

function makePiece() {
  const type = takeShape();
  const colors = takeColors();
  return { type, cells: SHAPES[type].map((p, i) => ({ x:p[0], y:p[1], color:colors[i] })), x:2, y:-1 };
}

function refillQueue() { while (queue.length < 3) queue.push(makePiece()); }

function spawn() {
  active = queue.shift();
  active.x = 2; active.y = -1;
  holdUsed = false;
  refillQueue();
  drawRacks();
  piecesSpawned++;
  if (isTouchDevice && piecesSpawned <= 3) showGestureHint('탭 회전 · 스와이프 이동');
  if (collides(active)) endGame();
}

function reset() {
  runId++;
  document.body.classList.add('playing');
  board = Array.from({length: ROWS}, () => Array(COLS).fill(null));
  queue = []; hold = null; holdUsed = false; score = 0; level = 1; lines = 0;
  shapeBag = []; colorBag = []; resolving = false; running = true; paused = false; piecesSpawned = 0;
  refillQueue(); spawn(); updateStats();
  overlay.classList.remove('visible');
  lastTime = performance.now(); dropTimer = 0; lockTimer = 0;
  requestAnimationFrame(loop);
}

function cellsOf(piece) { return piece.cells.map(c => ({ x: c.x + piece.x, y: c.y + piece.y, color: c.color })); }

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
  if (!running || paused || resolving || active.type === 'O') return;
  const rotated = {...active, cells: active.cells.map(c => ({...c, x: 2 - c.y, y: c.x}))};
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
  const cells = cellsOf(active);
  if (cells.some(c => c.y < 0)) { endGame(); return; }
  for (const c of cells) board[c.y][c.x] = c.color;
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
    const removed = new Set(groups.flat().map(([x,y]) => `${x},${y}`));
    chainEl.textContent = `×${chain}`;
    showChain(chain);
    await pause(180);
    await waitUntilResumed(resolvingRun);
    if (resolvingRun !== runId) return;
    for (const key of removed) {
      const [x,y] = key.split(',').map(Number); board[y][x] = null;
    }
    score += Math.round(removed.size * 10 * [1,1.5,2.2,3.2,4.5][Math.min(chain - 1, 4)]);
    lines += removed.size;
    level = Math.min(20, 1 + Math.floor(lines / 40));
    updateStats(); tone(280 + chain * 110, .09);
    draw(); await pause(120);
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
    for (let y = ROWS - 1; y >= 0; y--) if (board[y][x] !== null) values.push(board[y][x]);
    for (let y = ROWS - 1, i = 0; y >= 0; y--, i++) board[y][x] = i < values.length ? values[i] : null;
  }
}

function holdPiece() {
  if (!running || paused || resolving || holdUsed) return;
  const current = {...active, x:2, y:-1};
  if (hold) { active = hold; active.x=2; active.y=-1; hold = current; }
  else { hold = current; active = queue.shift(); refillQueue(); }
  holdUsed = true; drawRacks(); tone(360,.04);
  if (collides(active)) endGame();
}

function ghostY() {
  let ghost = {...active};
  while (!collides({...ghost, y: ghost.y + 1})) ghost.y++;
  return ghost.y;
}

function drawCell(context, x, y, colorIndex, size=CELL, alpha=1) {
  const pad = Math.max(1.5, size * .06), px=x*size+pad, py=y*size+pad, s=size-pad*2;
  context.globalAlpha = alpha;
  context.fillStyle = COLORS[colorIndex];
  roundRect(context, px, py, s, s, size*.17); context.fill();
  context.fillStyle = 'rgba(255,255,255,.25)';
  roundRect(context, px+size*.09, py+size*.07, s-size*.18, size*.075, size*.04); context.fill();
  context.strokeStyle = 'rgba(20,25,22,.5)'; context.lineWidth = Math.max(1,size*.055);
  const cx=px+s/2, cy=py+s/2, r=size*.12;
  context.beginPath();
  if (PATTERNS[colorIndex]==='dot') { context.arc(cx,cy,r,0,Math.PI*2); context.fillStyle='rgba(20,25,22,.45)'; context.fill(); }
  if (PATTERNS[colorIndex]==='slash') { context.moveTo(cx-r,cy+r); context.lineTo(cx+r,cy-r); context.stroke(); }
  if (PATTERNS[colorIndex]==='ring') { context.arc(cx,cy,r,0,Math.PI*2); context.stroke(); }
  if (PATTERNS[colorIndex]==='cross') { context.moveTo(cx-r,cy); context.lineTo(cx+r,cy); context.moveTo(cx,cy-r); context.lineTo(cx,cy+r); context.stroke(); }
  context.globalAlpha = 1;
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
  for(let y=0;y<ROWS;y++) for(let x=0;x<COLS;x++) if(board[y][x]!==null) drawCell(ctx,x,y,board[y][x]);
  if (active && running && !resolving) {
    const landingY = ghostY();
    for (const c of active.cells) if(c.y+landingY>=0) drawCell(ctx,c.x+active.x,c.y+landingY,c.color,CELL,.18);
    for (const c of cellsOf(active)) if(c.y>=0) drawCell(ctx,c.x,c.y,c.color);
  }
}

function drawMini(context, piece, top, cell=15, centerX=context.canvas.width/2) {
  if (!piece) return;
  const xs=piece.cells.map(c=>c.x), ys=piece.cells.map(c=>c.y);
  const width=(Math.max(...xs)-Math.min(...xs)+1)*cell;
  const ox=(centerX-width/2)/cell-Math.min(...xs);
  piece.cells.forEach(c=>drawCell(context,c.x+ox,c.y+top,c.color,cell));
}

function drawRacks() {
  holdCtx.clearRect(0,0,72,72); nextCtx.clearRect(0,0,168,48);
  drawMini(holdCtx,hold,1,15);
  queue.forEach((p,i)=>drawMini(nextCtx,p,.35,11,28+i*56));
}

function updateStats() { scoreEl.textContent=String(score).padStart(6,'0'); levelEl.textContent=String(level).padStart(2,'0'); }
function showChain(n) { callout.textContent=n===1?'CLEAR':`${n} CHAIN`; callout.classList.remove('pop'); void callout.offsetWidth; callout.classList.add('pop'); }
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
  if (running) paused = true;
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
  else if (running) { paused = false; lastTime = performance.now(); }
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
  overlayTitle.innerHTML='반응로가<br />가득 찼다';
  overlayCopy.textContent=`최종 점수 ${String(score).padStart(6,'0')} · 다시 연결하시겠습니까?`;
  document.querySelector('#startButton').innerHTML='RETRY <span>↻</span>';
  overlay.classList.add('visible'); tone(90,.22);
}

function loop(time) {
  if (!running) { draw(); return; }
  if (paused) { lastTime=time; draw(); requestAnimationFrame(loop); return; }
  const dt=time-lastTime; lastTime=time; dropTimer+=dt;
  if (!resolving) {
    if (collides({...active, y:active.y+1})) {
      lockTimer += dt;
      if (lockTimer >= 450) lock();
    } else {
      lockTimer = 0;
      if (dropTimer > Math.max(110, 820-(level-1)*38)) { move(0,1); dropTimer=0; }
    }
  }
  draw(); requestAnimationFrame(loop);
}

let audio;
function tone(freq,duration) {
  if(muted) return;
  audio ||= new AudioContext();
  const osc=audio.createOscillator(), gain=audio.createGain();
  osc.type='square'; osc.frequency.value=freq; gain.gain.setValueAtTime(.025,audio.currentTime); gain.gain.exponentialRampToValueAtTime(.001,audio.currentTime+duration);
  osc.connect(gain).connect(audio.destination); osc.start(); osc.stop(audio.currentTime+duration);
}

function act(action) {
  if (paused) return;
  if(action==='left') move(-1,0);
  if(action==='right') move(1,0);
  if(action==='rotate') rotate();
  if(action==='drop') hardDrop();
  if(action==='down' && move(0,1)) { score += 1; updateStats(); }
  if(action==='hold') holdPiece();
}

document.querySelector('#startButton').addEventListener('click',()=>{
  document.body.classList.add('playing');
  if (!tutorialSeen()) openTutorial(true);
  else reset();
});
document.querySelectorAll('[data-action]').forEach(button=>button.addEventListener('pointerdown',e=>{e.preventDefault();act(button.dataset.action);}));
document.querySelector('#soundButton').addEventListener('click',e=>{muted=!muted;e.currentTarget.textContent=muted?'×':'♪';e.currentTarget.setAttribute('aria-label',muted?'소리 켜기':'소리 끄기');});
document.querySelector('#helpButton').addEventListener('click',()=>openTutorial(false));
tutorialClose.addEventListener('click',closeTutorial);
window.addEventListener('keydown',e=>{
  if (!tutorial.hidden) { if (e.key === 'Escape') { e.preventDefault(); closeTutorial(); } return; }
  const action=actionForKey(e);
  if(action) { e.preventDefault(); act(action); }
});
document.addEventListener('visibilitychange',()=>{
  if(document.hidden && running) { paused=true; autoPaused=true; }
  else if(autoPaused) {
    autoPaused=false;
    if (tutorial.hidden) { paused=false; lastTime=performance.now(); }
  }
});

let gestureStart = null;
canvas.addEventListener('pointerdown',e=>{
  if (!['touch','pen'].includes(e.pointerType) || !running || paused) return;
  gestureStart = {x:e.clientX, y:e.clientY, time:performance.now(), id:e.pointerId};
  canvas.setPointerCapture(e.pointerId);
  e.preventDefault();
});
canvas.addEventListener('pointerup',e=>{
  if (!gestureStart || e.pointerId !== gestureStart.id) return;
  const dx=e.clientX-gestureStart.x, dy=e.clientY-gestureStart.y;
  const duration=Math.max(1,performance.now()-gestureStart.time);
  gestureStart=null;
  if (Math.hypot(dx,dy) < 14 && duration < 280) { act('rotate'); showGestureHint('회전'); return; }
  if (Math.abs(dx) > Math.abs(dy)) {
    const action=dx<0?'left':'right';
    for(let i=0;i<Math.min(4,Math.max(1,Math.round(Math.abs(dx)/34)));i++) act(action);
    showGestureHint(dx<0?'왼쪽 이동':'오른쪽 이동');
  } else if (dy < -45) { act('hold'); showGestureHint('HOLD'); }
  else if (dy > 70 && dy/duration > 1.1 && Math.abs(dx) < dy*.45) { act('drop'); showGestureHint('하드 드롭'); }
  else if (dy > 24) {
    for(let i=0;i<Math.min(5,Math.max(1,Math.round(dy/30)));i++) act('down');
    showGestureHint('소프트 드롭');
  }
});
canvas.addEventListener('pointercancel',()=>{ gestureStart=null; });

board=Array.from({length:ROWS},()=>Array(COLS).fill(null)); queue=[]; active=null; hold=null; score=0; level=1; running=false; paused=false;
draw(); drawRacks(); updateStats();
