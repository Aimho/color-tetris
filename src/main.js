import './style.css';
import { actionForKey, canStartPointerGesture, dragStepTarget, installCanvasInputGuards } from './input.js';
import { findColorGroups, groupSizesByCell } from './board.js';
import { configureAudioSession, createAudioContext, primeLegacyMediaChannel, resumeIfSuspended, unlockAudioContext } from './audio.js';
import { createPieceColors, rotateCellClockwise, rotateSquareCells, wallKickOffsets } from './pieces.js';
import { MusicEngine } from './music.js';
import { canResetLock, getClearIntensity, getClearScore, getDropInterval, getLevelForClears, getLockDelay } from './difficulty.js';
import { attachQueuedSpecial, createSpecialRewardQueue, earnSpecialRewards, resolveSpecialEffects } from './events.js';
import { chargeReactor, finishRun, readProfile, unlockedThemes } from './progression.js';
import { chooseMultiplierDrop, getChainPower, getClearSpecialMultiplier, getMultiplierRewards } from './reactor.js';
import {
  GAME_MODES,
  clearRunSnapshot,
  detectPlatform,
  rankedPlatformForRuntime,
  readRunSnapshot,
  saveRunSnapshot,
} from './game-session.js';
import { createOperationGuard } from './operation-guard.js';
import { createScoreLedger } from './ranking-model.js';
import { createRankedRandom } from '../functions/shared/ranked-random.js';
import { setupPwa } from './pwa.js';
import { createGameResult, createShareText } from './game-result.js';
import {
  dragSensitivityScale,
  particleScale,
  readSettings,
  saveSettings,
  shakeScale,
} from './settings.js';

const COLS = 10;
const ROWS = 20;
const MATCH = 6;
const CELL = 34;
const SPAWN_X = Math.floor((COLS - 4) / 2);
const COLORS = ['#ff6542', '#e9f65b', '#45d6a5', '#f28bd5'];
const MAX_SHARDS = 360;
const GAME_SPEED_MULTIPLIER = 1.2;
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
const reactorHud = document.querySelector('#reactorHud');
const reactorHudValue = document.querySelector('#reactorHudValue');
const callout = document.querySelector('#chainCallout');
const levelCallout = document.querySelector('#levelCallout');
const impactFlash = document.querySelector('#impactFlash');
const boardFrame = document.querySelector('#boardFrame');
const overlay = document.querySelector('#overlay');
const overlayTitle = document.querySelector('#overlayTitle');
const overlayCopy = document.querySelector('#overlayCopy');
const tutorial = document.querySelector('#tutorial');
const tutorialSheet = document.querySelector('.tutorial-sheet');
const tutorialClose = document.querySelector('#tutorialClose');
const tutorialDismiss = document.querySelector('#tutorialDismiss');
const resumeDialog = document.querySelector('#resumeDialog');
const resumeButton = document.querySelector('#resumeButton');
const resumeHelpButton = document.querySelector('#resumeHelpButton');
const resumeDiscardButton = document.querySelector('#resumeDiscardButton');
const gestureHint = document.querySelector('#gestureHint');
const gameShell = document.querySelector('.game-shell');
const scoreRecord = document.querySelector('#scoreRecord');
const scoreStatus = document.querySelector('#scoreStatus');
const resultScore = document.querySelector('#resultScore');
const resultLevel = document.querySelector('#resultLevel');
const resultSeasonBest = document.querySelector('#resultSeasonBest');
const resultRank = document.querySelector('#resultRank');
const homeRanking = document.querySelector('#homeRanking');
const homeLeaderboardList = document.querySelector('#homeLeaderboardList');
const rankingButton = document.querySelector('#rankingButton');
const rankingCloseButton = document.querySelector('#rankingCloseButton');
const rankingMyBest = document.querySelector('#rankingMyBest');
const rankingPlatformTabs = [...document.querySelectorAll('[data-ranking-platform]')];
const buildVersion = document.querySelector('#buildVersion');
const shareButton = document.querySelector('#shareButton');
const homeButton = document.querySelector('#homeButton');
const startButton = document.querySelector('#startButton');
const rankedStartButton = document.querySelector('#rankedStartButton');
const runModeStatus = document.querySelector('#runModeStatus');
const profileButton = document.querySelector('#profileButton');
const settingsButton = document.querySelector('#settingsButton');
const profilePanel = document.querySelector('#profilePanel');
const settingsPanel = document.querySelector('#settingsPanel');
const profileNickname = document.querySelector('#profileNickname');
const profileConnection = document.querySelector('#profileConnection');
const profileStatus = document.querySelector('#profileStatus');
const nicknameForm = document.querySelector('#nicknameForm');
const nicknameInput = document.querySelector('#nicknameInput');
const nicknameHint = document.querySelector('#nicknameHint');
const socialConnectButton = document.querySelector('#socialConnectButton');
const themeOptions = document.querySelector('#themeOptions');
const settingsForm = document.querySelector('#settingsForm');
const openControlsButton = document.querySelector('#openControlsButton');
const resetLocalDataButton = document.querySelector('#resetLocalDataButton');
const settingsVersion = document.querySelector('#settingsVersion');
const isTouchDevice = matchMedia('(any-pointer: coarse)').matches || navigator.maxTouchPoints > 0;
const reducedMotionMedia = matchMedia('(prefers-reduced-motion: reduce)');

let board, eventBoard, active, queue, hold, holdUsed, score, level, lines, running, paused;
let lastTime = 0, dropTimer = 0, resolving = false;
let shapeBag = [], colorBag = [];
let runId = 0, lockTimer = 0, lockResets = 0;
let piecesSinceMono = 0, particles = [];
let arrowBeams = [], bombBursts = [], multiplierBursts = [], multiplierDrops = [], clearingCells = new Set();
let specialRewards = createSpecialRewardQueue();
let tutorialStartsGame = false, piecesSpawned = 0, hintTimer;
let tutorialOpener = null, autoPaused = false;
let tutorialFromPause = false;
let gestureStart = null;
let leaderboardApiPromise;
let randomSource = Math.random;
let reactorCharge = 0, reactorPower = 0, maxChain = 0;
let profile = readProfile();
let reactorRenderKey = '';
let animationFrameId = null;
let gameMode = GAME_MODES.PRACTICE;
let runPlatform = detectPlatform({
  native:globalThis.Capacitor?.isNativePlatform?.() === true,
  coarsePointer:isTouchDevice,
  touchPoints:navigator.maxTouchPoints,
});
const rankedRuntimePlatform = rankedPlatformForRuntime({
  native:globalThis.Capacitor?.isNativePlatform?.() === true,
});
let lastStableRunState = null;
let pendingStartMode = GAME_MODES.PRACTICE;
let runMetrics = createRunMetrics();
let completedRunLedger = null;
let rankedSession = null;
let pendingRankedSession = null;
let rankedRandomCalls = 0;
let pieceSerialCounter = 0;
let rankingPlatform = rankedRuntimePlatform;
let settings = readSettings();
let prefersReducedMotion = shouldReduceMotion();
let serverProfile = null;
let currentGameResult = null;
const rankedStartGuard = createOperationGuard();

buildVersion.textContent = `VER ${__APP_VERSION__} · BUILD ${__BUILD_ID__}`;
settingsVersion.textContent = `COLOR BOMB · VER ${__APP_VERSION__} · BUILD ${__BUILD_ID__}`;

function getLeaderboardApi() {
  leaderboardApiPromise ||= import('./leaderboard.js');
  return leaderboardApiPromise;
}

function shouldReduceMotion() {
  return settings.reducedMotion === 'reduce'
    || settings.reducedMotion === 'system' && reducedMotionMedia.matches;
}

function effectsEnabled() {
  return settings.effects;
}

function musicEnabled() {
  return settings.bgm;
}

function syncSettingsForm() {
  for (const [key, value] of Object.entries(settings)) {
    const input = settingsForm.elements.namedItem(key);
    if (!input) continue;
    if (input.type === 'checkbox') input.checked = value;
    else input.value = value;
  }
}

function applySettings(nextSettings = settings) {
  settings = saveSettings(nextSettings);
  prefersReducedMotion = shouldReduceMotion();
  syncSettingsForm();
  if (!musicEnabled()) stopMusic();
  else if (running && !paused) startMusic();
  draw();
}

function renderLocalProfile() {
  document.querySelectorAll('[data-profile-stat]').forEach(element => {
    const value = Number(profile[element.dataset.profileStat] || 0);
    element.textContent = value.toLocaleString();
  });
  themeOptions.replaceChildren(...unlockedThemes(profile).map(theme => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.theme = theme.id;
    button.textContent = theme.label;
    button.setAttribute('aria-pressed', String(profile.theme === theme.id));
    return button;
  }));
}

function renderServerProfile(nextProfile) {
  serverProfile = nextProfile;
  profileNickname.textContent = nextProfile.nickname;
  nicknameInput.value = nextProfile.nickname;
  profileConnection.textContent = nextProfile.provider;
  socialConnectButton.disabled = nextProfile.connected;
  socialConnectButton.innerHTML = nextProfile.connected
    ? 'GOOGLE 연결됨 <span>✓</span>'
    : 'GOOGLE 계정 연결 <span>↗</span>';
  nicknameForm.querySelector('button').disabled = !nextProfile.canChangeNickname;
  nicknameHint.textContent = nextProfile.canChangeNickname
    ? '한글·영문·숫자로 2~12자까지 입력할 수 있습니다.'
    : `${new Date(nextProfile.nextNicknameChangeAt).toLocaleString('ko-KR')} 이후 다시 변경할 수 있습니다.`;
  rememberPlayerName(nextProfile.nickname);
}

async function loadProfilePanel() {
  renderLocalProfile();
  profileStatus.textContent = '프로필과 시즌 기록을 불러오는 중…';
  try {
    const [{loadPlayerProfile, formatSeasonBadge}, {loadTopScores}] = await Promise.all([
      import('./profile-service.js'),
      getLeaderboardApi(),
    ]);
    const nextProfile = await loadPlayerProfile();
    renderServerProfile(nextProfile);
    const platforms = ['mobile', 'desktop'];
    const results = await Promise.allSettled(platforms.map(platform => loadTopScores(platform)));
    const badges = (nextProfile.seasonBadges || []).map(formatSeasonBadge).filter(Boolean);
    results.forEach((result, index) => {
      const platform = platforms[index];
      const scoreElement = document.querySelector(`#profile${platform[0].toUpperCase()}${platform.slice(1)}Score`);
      const levelElement = document.querySelector(`#profile${platform[0].toUpperCase()}${platform.slice(1)}Level`);
      if (result.status !== 'fulfilled' || !result.value.myBest) {
        scoreElement.textContent = '—';
        levelElement.textContent = result.status === 'rejected' ? '오프라인' : '기록 없음';
        return;
      }
      const {entries, myBest} = result.value;
      const rank = entries.findIndex(entry => entry.playerId === myBest.playerId) + 1;
      scoreElement.textContent = myBest.score.toLocaleString();
      levelElement.textContent = `${rank ? `#${rank}` : 'TOP 50 밖'} · LV ${myBest.level}`;
      if (rank === 1) badges.push(`${platform.toUpperCase()} TOP 1`);
      else if (rank > 0 && rank <= 10) badges.push(`${platform.toUpperCase()} TOP 10`);
      else if (rank > 0 && rank <= 50) badges.push(`${platform.toUpperCase()} TOP 50`);
    });
    document.querySelector('#profileBadges').replaceChildren(...badges.map(label => {
      const badge = document.createElement('span');
      badge.textContent = label;
      return badge;
    }));
    profile.lastSyncedAt = Date.now();
    try { localStorage.setItem('color-tetrix-profile-v1', JSON.stringify(profile)); } catch { /* private mode */ }
    profileStatus.textContent = `로컬 기록 · ${new Date(profile.lastSyncedAt).toLocaleString('ko-KR')} 동기화`;
  } catch {
    profileNickname.textContent = savedPlayerName() || '게스트 플레이어';
    profileConnection.textContent = '오프라인 · 로컬 기록 표시 중';
    profileStatus.textContent = profile.lastSyncedAt
      ? `마지막 동기화 · ${new Date(profile.lastSyncedAt).toLocaleString('ko-KR')}`
      : '서버 프로필에 연결하지 못했습니다. 로컬 기록은 계속 사용할 수 있습니다.';
  }
}

function openAppPanel(panel, opener) {
  closeHomeRanking();
  panel.dataset.opener = opener?.id || '';
  gameShell.inert = true;
  panel.hidden = false;
  panel.scrollTop = 0;
  panel.querySelector('.panel-close')?.focus({preventScroll:true});
}

function closeAppPanel(panel) {
  const opener = document.querySelector(`#${panel.dataset.opener}`);
  panel.hidden = true;
  gameShell.inert = false;
  opener?.focus?.({preventScroll:true});
}

async function refreshRankedAvailability() {
  rankedStartButton.disabled = true;
  rankedStartButton.innerHTML = '로딩 중… <span>◆</span>';
  try {
    const { rankedServiceStatus } = await import('./ranked-service.js');
    const status = await rankedServiceStatus();
    rankedStartButton.disabled = !status.ready;
    rankedStartButton.innerHTML = status.ready
      ? '랭킹 도전 <span>◆</span>'
      : '로딩 중… <span>◆</span>';
    rankedStartButton.title = status.reason;
  } catch {
    rankedStartButton.disabled = true;
    rankedStartButton.title = '랭킹 서버에 연결할 수 없습니다.';
  }
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
  piecesSinceMono = result.isMono ? 0 : piecesSinceMono + 1;
  const colors = result.colors;
  return {
    serial:pieceSerialCounter++,
    type,
    cells: SHAPES[type].map((p, i) => ({
      x:p[0], y:p[1], color:colors[i],
      event: null,
    })),
    x:SPAWN_X, y:-1, rotation:0,
  };
}

function refillQueue() { while (queue.length < 3) queue.push(makePiece()); }

function spawn() {
  const assigned = attachQueuedSpecial(queue[0], specialRewards, randomSource);
  queue[0] = assigned.piece;
  specialRewards = assigned.rewards;
  active = queue.shift();
  active.x = SPAWN_X; active.y = -1;
  lockResets = 0;
  holdUsed = false;
  refillQueue();
  drawRacks();
  piecesSpawned++;
  if (isTouchDevice && piecesSpawned <= 3) showGestureHint('탭 회전 · 드래그 이동');
  if (collides(active)) endGame();
  else lastStableRunState = structuredClone(snapshotRunState());
}

function reset(mode = gameMode, session = pendingRankedSession) {
  stopLoop();
  runId++;
  gameMode = mode;
  runMetrics = createRunMetrics();
  completedRunLedger = null;
  rankedSession = mode === GAME_MODES.RANKED ? session : null;
  rankedRandomCalls = 0;
  const seededRandom = rankedSession ? createRankedRandom(rankedSession.seed) : null;
  randomSource = seededRandom
    ? () => {
        rankedRandomCalls++;
        return seededRandom();
      }
    : Math.random;
  pendingRankedSession = null;
  document.body.classList.add('playing');
  board = Array.from({length: ROWS}, () => Array(COLS).fill(null));
  eventBoard = Array.from({length: ROWS}, () => Array(COLS).fill(null));
  queue = []; hold = null; holdUsed = false; score = 0; level = 1; lines = 0;
  shapeBag = []; colorBag = []; resolving = false; running = true; paused = false; piecesSpawned = 0;
  piecesSinceMono = 0; particles = []; arrowBeams = []; bombBursts = []; multiplierBursts = []; multiplierDrops = []; clearingCells = new Set();
  pieceSerialCounter = 0;
  specialRewards = createSpecialRewardQueue();
  reactorCharge = 0; reactorPower = 0; maxChain = 0;
  refillQueue(); spawn(); updateStats();
  overlay.classList.remove('visible', 'game-over');
  closeHomeRanking();
  scoreRecord.hidden = true;
  shareButton.hidden = true;
  homeButton.hidden = true;
  startButton.hidden = false;
  rankedStartButton.hidden = true;
  runModeStatus.hidden = false;
  runModeStatus.textContent = gameMode === GAME_MODES.RANKED ? 'RANKED' : 'PRACTICE';
  lastTime = performance.now(); dropTimer = 0; lockTimer = 0;
  startMusic();
  updateReactor();
  startLoop();
}

function createRunMetrics() {
  return {
    playTimeMs:0,
    piecesPlaced:0,
    dropPoints:0,
    clearSteps:[],
    reactorCount:0,
    multiplierCells:0,
    bombsEarned:0,
    maxChainPower:0,
    placementLog:[],
  };
}

function createCurrentScoreLedger() {
  const directClears = runMetrics.clearSteps.reduce((total, step) => total + step.directCells, 0);
  const removedCells = runMetrics.clearSteps.reduce((total, step) => total + step.removedCells, 0);
  return createScoreLedger({
    mode:gameMode,
    platform:runPlatform,
    score,
    level,
    playTimeMs:runMetrics.playTimeMs,
    piecesPlaced:runMetrics.piecesPlaced,
    dropPoints:runMetrics.dropPoints,
    clearSteps:runMetrics.clearSteps,
    placementLog:runMetrics.placementLog,
    randomVersion:rankedSession?.randomVersion ?? null,
    season:rankedSession?.season ?? null,
    directClears,
    specialClears:removedCells - directClears,
    maxChain,
    reactorCount:runMetrics.reactorCount,
    multiplierCells:runMetrics.multiplierCells,
  });
}

function snapshotRunState() {
  return {
    mode:gameMode,
    platform:runPlatform,
    board,
    eventBoard,
    active,
    queue,
    hold,
    holdUsed,
    score,
    level,
    lines,
    shapeBag,
    colorBag,
    piecesSinceMono,
    piecesSpawned,
    specialRewards,
    reactorCharge,
    reactorPower,
    maxChain,
    lockTimer,
    lockResets,
    runMetrics,
    rankedSession,
    rankedRandomCalls,
    pieceSerialCounter,
  };
}

function persistCurrentRun() {
  if (!running) return;
  const state = resolving ? lastStableRunState : snapshotRunState();
  if (!state) return;
  try { saveRunSnapshot(state); } catch { /* private mode */ }
}

function restoreRun(snapshot) {
  const state = snapshot.state;
  stopLoop();
  runId++;
  ({
    board,
    eventBoard,
    active,
    queue,
    hold,
    holdUsed,
    score,
    level,
    lines,
    shapeBag,
    colorBag,
    piecesSinceMono,
    piecesSpawned,
    specialRewards,
    reactorCharge,
    reactorPower,
    maxChain,
    lockTimer,
    lockResets,
    runMetrics,
    rankedSession,
    rankedRandomCalls,
    pieceSerialCounter,
  } = state);
  runMetrics = {...createRunMetrics(), ...(runMetrics || {})};
  const rankedRestorable = state.mode === GAME_MODES.RANKED
    && rankedSession?.seed
    && rankedSession?.expiresAt > Date.now();
  gameMode = rankedRestorable ? GAME_MODES.RANKED : GAME_MODES.PRACTICE;
  if (rankedRestorable) {
    const seededRandom = createRankedRandom(rankedSession.seed);
    for (let index = 0; index < rankedRandomCalls; index++) seededRandom();
    randomSource = () => {
      rankedRandomCalls++;
      return seededRandom();
    };
  } else {
    rankedSession = null;
    rankedRandomCalls = 0;
    randomSource = Math.random;
  }
  runPlatform = state.platform;
  resolving = false;
  running = true;
  paused = true;
  autoPaused = true;
  particles = [];
  arrowBeams = [];
  bombBursts = [];
  multiplierBursts = [];
  multiplierDrops = [];
  clearingCells = new Set();
  lastStableRunState = structuredClone(snapshotRunState());
  document.body.classList.add('playing');
  overlay.classList.remove('visible', 'game-over', 'ranking-view');
  runModeStatus.hidden = false;
  runModeStatus.textContent = gameMode === GAME_MODES.RANKED ? 'RANKED' : 'PRACTICE';
  drawRacks();
  updateStats();
  updateReactor();
  draw();
  gameShell.inert = true;
  resumeDialog.hidden = false;
  resumeDialog.querySelector('#resumeTitle').innerHTML = '저장된 게임을<br />이어갈까요?';
  resumeDialog.querySelector('.resume-card > p:not(.overlay-kicker)').textContent =
    `${gameMode === GAME_MODES.RANKED ? '랭킹 도전' : '연습 게임'} · LV ${level}`;
  resumeButton.focus({preventScroll:true});
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
  if (gameMode !== GAME_MODES.RANKED) {
    score += distance * 2;
    runMetrics.dropPoints += distance * 2;
  }
  updateStats();
  boardFrame.animate([
    {transform:'scaleY(1)'}, {transform:'scaleY(.985)'}, {transform:'scaleY(1)'}
  ], {duration:150, easing:'cubic-bezier(.16,1,.3,1)'});
  lock();
}

function lock() {
  gestureStart = null;
  const cells = cellsOf(active);
  if (gameMode === GAME_MODES.RANKED) {
    runMetrics.placementLog.push({
      pieceSerial:active.serial,
      x:active.x,
      y:active.y,
      rotation:active.rotation || 0,
      usedHold:holdUsed,
      terminal:cells.some(cell => cell.y < 0),
    });
  }
  if (cells.some(c => c.y < 0)) { endGame(); return; }
  for (const c of cells) {
    board[c.y][c.x] = c.color;
    eventBoard[c.y][c.x] = c.event;
  }
  runMetrics.piecesPlaced++;
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
    if (!groups.length) {
      if (reactorCharge >= 100) {
        await deployReactorRewards(resolvingRun);
        if (resolvingRun !== runId) return;
        continue;
      }
      break;
    }
    chain++;
    maxChain = Math.max(maxChain, chain);
    if (!specialRewards.bomb && groups.some(group => group.length >= 9)) runMetrics.bombsEarned++;
    specialRewards = earnSpecialRewards(specialRewards, groups, chain);
    const matched = new Set(groups.flat().map(([x,y]) => `${x},${y}`));
    const specialResult = resolveSpecialEffects(matched, board, eventBoard);
    const {removed, beams, bombs} = specialResult;
    const arrowRemoved = new Set(beams.flatMap(beam => beam.cells));
    const bombRemoved = new Set(bombs.flatMap(bomb => bomb.cells));
    const multipliers = [...removed].flatMap(key => {
      const [x, y] = key.split(',').map(Number);
      const event = eventBoard[y]?.[x];
      return event === 'x2' || event === 'x3' ? [{origin:key, event}] : [];
    });
    const multiplierRemoved = new Set(multipliers.map(({origin}) => origin));
    clearingCells = new Set(removed);
    draw();
    if (beams.length || bombs.length || multipliers.length) await playSpecialEffects(beams, bombs, multipliers);
    else await pause(180);
    await waitUntilResumed(resolvingRun);
    if (resolvingRun !== runId) return;
    const specialMultiplier = getClearSpecialMultiplier(removed, eventBoard);
    for (const key of removed) {
      const [x,y] = key.split(',').map(Number);
      const specialForce = bombRemoved.has(key) ? 1.85 : multiplierRemoved.has(key) ? 1.7 : arrowRemoved.has(key) ? 1.5 : 1;
      createShards(x, y, board[y][x], chain, removed.size, specialForce);
      board[y][x] = null;
      eventBoard[y][x] = null;
    }
    clearingCells = new Set();
    const earnedScore = getClearScore(removed.size, chain, specialMultiplier);
    runMetrics.clearSteps.push({
      removedCells:removed.size,
      directCells:matched.size,
      chain,
      scoreMultiplier:specialMultiplier,
      multiplierCells:multipliers.length,
    });
    score += earnedScore;
    lines += removed.size;
    reactorPower += getChainPower(chain);
    runMetrics.maxChainPower = Math.max(runMetrics.maxChainPower, reactorPower);
    reactorCharge = chargeReactor(reactorCharge, matched.size, chain, level);
    updateReactor();
    const previousLevel = level;
    level = getLevelForClears(lines);
    music?.setLevel(level);
    updateStats();
    showClearImpact(removed.size, chain, earnedScore);
    if (settings.vibration && isTouchDevice) navigator.vibrate?.(Math.min(60, 12 + removed.size * 2));
    shatterSound(chain, removed.size);
    if (level > previousLevel) showLevelUp(level);
    draw(); await pause(220);
    await waitUntilResumed(resolvingRun);
    if (resolvingRun !== runId) return;
    applyGravity(); draw(); await pause(150);
    await waitUntilResumed(resolvingRun);
    if (resolvingRun !== runId) return;
  }
  resolving = false;
  spawn();
}

async function deployReactorRewards(resolvingRun) {
  const rewards = getMultiplierRewards(reactorPower);
  runMetrics.reactorCount++;
  reactorCharge = 0;
  reactorPower = 0;
  gestureStart = null;

  for (const event of rewards) {
    const target = chooseMultiplierDrop(board, COLORS.length, randomSource);
    if (!target) break;
    callout.textContent = `REACTOR · ${event.toUpperCase()} DROP`;
    callout.classList.remove('pop');
    void callout.offsetWidth;
    callout.classList.add('pop');
    board[target.y][target.x] = target.color;
    eventBoard[target.y][target.x] = event;
    runMetrics.multiplierCells++;
    const duration = prefersReducedMotion ? 100 : 480;
    const dropEffect = {...target, event, start:performance.now(), duration};
    multiplierDrops = [dropEffect];
    showMultiplierDropImpact(event);
    multiplierDropSound(event);
    draw();
    await waitForActiveEffect(duration, resolvingRun, elapsed => {
      dropEffect.start = performance.now() - elapsed;
    });
    if (resolvingRun !== runId) return;
    multiplierDrops = [];
  }

  updateReactor();
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
  let current = {...active, x:SPAWN_X, y:-1};
  while (current.rotation) {
    current = {
      ...current,
      cells:current.type === 'O'
        ? rotateSquareCells(current.cells)
        : current.cells.map(cell => rotateCellClockwise(cell)),
      rotation:(current.rotation + 1) % 4,
    };
  }
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
  if (settings.colorAssist) {
    const corner = Math.max(3, size * .13);
    context.fillStyle = 'rgba(7,9,9,.72)';
    const markers = [
      () => context.fillRect(px + 2, py + 2, corner, corner),
      () => { context.beginPath(); context.arc(px + s - corner * .55, py + corner * .55, corner * .55, 0, Math.PI * 2); context.fill(); },
      () => { context.beginPath(); context.moveTo(px + 2, py + corner + 2); context.lineTo(px + corner + 2, py + 2); context.lineTo(px + corner + 2, py + corner + 2); context.closePath(); context.fill(); },
      () => { context.fillRect(px + s - corner - 2, py + 2, corner, Math.max(2, corner * .35)); context.fillRect(px + s - corner - 2, py + 2, Math.max(2, corner * .35), corner); },
    ];
    markers[colorIndex]?.();
  }
  if (event) drawSpecialIcon(context, px+s/2, py+s/2, size, event);
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
  if (!active || !running || resolving) return new Map();
  const preview = board.map(row => [...row]);
  for (const cell of cellsOf(active)) if (cell.y >= 0 && cell.y < ROWS) preview[cell.y][cell.x] = cell.color;
  return groupSizesByCell(findColorGroups(preview, 4));
}

function drawSpecialIcon(context, cx, cy, size, special) {
  if (special === 'bomb') {
    drawBombIcon(context, cx, cy, size);
    return;
  }
  if (special === 'x2' || special === 'x3') {
    context.save();
    context.fillStyle = 'rgba(7,9,9,.88)';
    context.shadowColor = 'rgba(255,255,255,.42)';
    context.shadowBlur = size * .08;
    context.font = `900 ${Math.round(size * .35)}px system-ui, sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(`×${special.slice(1)}`, cx, cy + size * .015);
    context.restore();
    return;
  }
  const rotations = {up:0, right:Math.PI/2, down:Math.PI, left:-Math.PI/2};
  context.save();
  context.translate(cx, cy);
  context.rotate(rotations[special] || 0);
  context.fillStyle = 'rgba(7,9,9,.82)';
  context.shadowColor = 'rgba(255,255,255,.38)';
  context.shadowBlur = size * .08;
  context.beginPath();
  context.moveTo(0, -size*.25);
  context.lineTo(size*.22, -size*.01);
  context.lineTo(size*.09, -size*.01);
  context.lineTo(size*.09, size*.22);
  context.lineTo(-size*.09, size*.22);
  context.lineTo(-size*.09, -size*.01);
  context.lineTo(-size*.22, -size*.01);
  context.closePath();
  context.fill();
  context.restore();
}

function drawBombIcon(context, cx, cy, size) {
  context.save();
  context.translate(cx, cy);
  context.fillStyle = 'rgba(7,9,9,.86)';
  context.shadowColor = 'rgba(255,255,255,.38)';
  context.shadowBlur = size * .08;
  context.beginPath();
  context.arc(-size*.015, size*.045, size*.205, 0, Math.PI*2);
  context.fill();
  context.shadowBlur = 0;
  context.strokeStyle = 'rgba(7,9,9,.86)';
  context.lineWidth = Math.max(1.5, size*.065);
  context.lineCap = 'round';
  context.beginPath();
  context.moveTo(size*.08, -size*.14);
  context.quadraticCurveTo(size*.12, -size*.29, size*.25, -size*.25);
  context.stroke();
  context.fillStyle = '#fffbd0';
  context.beginPath();
  context.arc(size*.27, -size*.255, size*.055, 0, Math.PI*2);
  context.fill();
  context.restore();
}

function createShards(x, y, colorIndex, chain, removedCount, force=1) {
  if (prefersReducedMotion) return;
  const intensity = getClearIntensity(removedCount);
  const available = Math.max(0, MAX_SHARDS - particles.length);
  const baseCount = intensity.shardsPerCell + Math.min(chain - 1, 3);
  const count = Math.min(Math.max(1, Math.round(baseCount * particleScale(settings.particles))), available);
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

async function playSpecialEffects(paths, bombs, multipliers = []) {
  const start = performance.now();
  const duration = prefersReducedMotion ? 80 : 220;
  arrowBeams = paths.map(path => ({...path, start:start + (prefersReducedMotion ? 0 : path.delay), duration}));
  bombBursts = bombs.map(bomb => ({
    ...bomb,
    start:start + (prefersReducedMotion ? 0 : bomb.delay),
    duration:prefersReducedMotion ? 90 : 280,
  }));
  multiplierBursts = multipliers.map(multiplier => ({
    ...multiplier,
    start,
    duration:prefersReducedMotion ? 90 : 340,
  }));
  if (paths.length) arrowBeamSound(paths.length);
  if (bombs.length) bombBurstSound(bombs.length);
  if (multipliers.length) multiplierBurstSound(multipliers);
  const effects = [...arrowBeams, ...bombBursts, ...multiplierBursts];
  const total = Math.max(...effects.map(effect => effect.start - start + effect.duration));
  await pause(total);
  arrowBeams = [];
  bombBursts = [];
  multiplierBursts = [];
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

function drawBombBursts() {
  const now = performance.now();
  for (const burst of bombBursts) {
    const progress = Math.max(0, Math.min(1, (now - burst.start) / burst.duration));
    if (progress <= 0) continue;
    const [x,y] = burst.origin.split(',').map(Number);
    const cx = (x+.5)*CELL, cy = (y+.5)*CELL;
    const eased = 1 - Math.pow(1-progress, 4);
    ctx.save();
    ctx.globalAlpha = 1-progress;
    ctx.strokeStyle = '#fffbd0';
    ctx.lineWidth = Math.max(2, CELL*.12*(1-progress));
    ctx.shadowColor = '#ff6542';
    ctx.shadowBlur = 24;
    ctx.beginPath();
    ctx.arc(cx, cy, CELL*(.25+eased*1.45), 0, Math.PI*2);
    ctx.stroke();
    ctx.rotate(progress * Math.PI * .5);
    ctx.strokeStyle = `rgba(233,246,91,${.9 * (1-progress)})`;
    ctx.lineWidth = Math.max(1.5, CELL * .07 * (1-progress));
    for (let ray = 0; ray < 10; ray++) {
      const angle = ray * Math.PI / 5;
      const inner = CELL * (.3 + eased * .45);
      const outer = CELL * (.6 + eased * 1.25);
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
      ctx.lineTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer);
      ctx.stroke();
    }
    ctx.rotate(-progress * Math.PI * .5);
    ctx.fillStyle = `rgba(255,101,66,${.38*(1-progress)})`;
    for (const key of burst.cells) {
      const [bx,by] = key.split(',').map(Number);
      roundRect(ctx,bx*CELL+2,by*CELL+2,CELL-4,CELL-4,CELL*.16);
      ctx.fill();
    }
    ctx.restore();
  }
}

function drawMultiplierBursts() {
  const now = performance.now();
  for (const burst of multiplierBursts) {
    const progress = Math.max(0, Math.min(1, (now - burst.start) / burst.duration));
    if (progress <= 0) continue;
    const [x, y] = burst.origin.split(',').map(Number);
    const cx = (x + .5) * CELL;
    const cy = (y + .5) * CELL;
    const eased = 1 - Math.pow(1 - progress, 4);
    const accent = burst.event === 'x3' ? '#f28bd5' : '#45d6a5';
    ctx.save();
    ctx.globalAlpha = 1 - progress;
    ctx.strokeStyle = accent;
    ctx.shadowColor = accent;
    ctx.shadowBlur = 22;
    ctx.lineWidth = Math.max(2, CELL * .1 * (1-progress));
    for (let ring = 0; ring < 2; ring++) {
      ctx.beginPath();
      ctx.arc(cx, cy, CELL * (.22 + ring * .18 + eased * (1.05 + ring * .35)), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = '#fffbd0';
    ctx.font = `900 ${Math.round(CELL * (.48 + eased * .42))}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`×${burst.event.slice(1)}`, cx, cy - eased * CELL * .65);
    ctx.restore();
  }
}

function drawMultiplierDrops() {
  const now = performance.now();
  for (const drop of multiplierDrops) {
    const progress = Math.max(0, Math.min(1, (now - drop.start) / drop.duration));
    const eased = 1 - Math.pow(1 - progress, 5);
    const cx = (drop.x + .5) * CELL;
    const cy = (drop.y + .5) * CELL;
    const accent = drop.event === 'x3' ? '#f28bd5' : '#45d6a5';
    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - progress * .82);
    ctx.strokeStyle = accent;
    ctx.shadowColor = accent;
    ctx.shadowBlur = 28;
    ctx.lineCap = 'round';
    ctx.lineWidth = CELL * (.22 - progress * .12);
    ctx.beginPath();
    ctx.moveTo(cx, 0);
    ctx.lineTo(cx, Math.max(CELL * .5, cy * eased));
    ctx.stroke();
    ctx.globalAlpha = 1 - progress;
    ctx.lineWidth = Math.max(2, CELL * .13 * (1-progress));
    ctx.beginPath();
    ctx.ellipse(cx, cy, CELL * (.25 + eased * 1.65), CELL * (.12 + eased * .48), 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#fffbd0';
    ctx.font = `900 ${Math.round(CELL * (.52 + .34 * (1-progress)))}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`×${drop.event.slice(1)}`, cx, cy - CELL * (.55 + progress * .4));
    ctx.restore();
  }
}

function showMultiplierDropImpact(event) {
  if (prefersReducedMotion) return;
  impactFlash.className = 'impact-flash';
  void impactFlash.offsetWidth;
  impactFlash.className = 'impact-flash overload';
  const force = (event === 'x3' ? 9 : 6) * shakeScale(settings.shake);
  boardFrame.animate([
    { transform:'translate(0,0) scale(1)' },
    { transform:`translate(0,${force}px) scale(.99,1.012)` },
    { transform:`translate(${-force*.45}px,${-force*.25}px) scale(1.006,.996)` },
    { transform:'translate(0,0) scale(1)' },
  ], {duration:360, easing:'cubic-bezier(.16,1,.3,1)'});
}

function showClearImpact(removedCount, chain, points) {
  const intensity = getClearIntensity(removedCount);
  showChain(chain, intensity.name, points);
  if (prefersReducedMotion) return;
  impactFlash.className = 'impact-flash';
  void impactFlash.offsetWidth;
  impactFlash.className = `impact-flash ${intensity.name}`;
  const force = intensity.shake * shakeScale(settings.shake);
  boardFrame.animate([
    { transform: 'translate(0,0)' },
    { transform: `translate(${-force}px,${force * .35}px)` },
    { transform: `translate(${force * .75}px,${-force * .25}px)` },
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
  let aliveCount = 0;
  for (const particle of particles) {
    particle.age += dt;
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vy += .00035 * dt;
    particle.rotation += particle.spin * dt;
    if (particle.age < particle.life) particles[aliveCount++] = particle;
  }
  particles.length = aliveCount;
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
  drawBombBursts();
  drawMultiplierBursts();
  drawMultiplierDrops();
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
  const value = Math.min(100, reactorCharge);
  const renderKey = `${value}`;
  if (renderKey === reactorRenderKey) return;
  reactorRenderKey = renderKey;
  reactorHudValue.textContent = `${value}%`;
  reactorHud.setAttribute('aria-label', `리액터 충전 ${value}퍼센트`);
}

function applyProfileTheme() {
  const themes = unlockedThemes(profile);
  if (!themes.some(theme => theme.id === profile.theme)) profile.theme = 'reactor';
  const theme = themes.find(item => item.id === profile.theme) || themes[0];
  document.body.dataset.theme = theme.id;
}

function showChain(n, intensity = 'clear', points = 0) {
  const label = intensity === 'overload' ? 'OVERLOAD' : intensity === 'surge' ? 'SURGE' : n===1 ? 'CLEAR' : `CHAIN ×${n}`;
  callout.textContent = `${label} · +${points.toLocaleString()}`;
  callout.classList.remove('pop'); void callout.offsetWidth; callout.classList.add('pop');
}
function pause(ms) { return new Promise(resolve=>setTimeout(resolve,ms)); }
async function waitForActiveEffect(duration, resolvingRun, updateStart) {
  let elapsed = 0;
  let previous = performance.now();
  while (elapsed < duration && resolvingRun === runId) {
    await pause(16);
    const now = performance.now();
    if (!paused) elapsed += now - previous;
    previous = now;
    updateStart(Math.min(elapsed, duration));
  }
}
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
  if (running) { paused = true; stopLoop(); stopMusic(); }
  gameShell.inert = true;
  tutorial.hidden = false;
  tutorialSheet.scrollTop = 0;
  tutorialDismiss.focus({ preventScroll: true });
}

function closeTutorial() {
  if (tutorialFromPause) {
    tutorial.hidden = true;
    tutorialFromPause = false;
    resumeDialog.hidden = false;
    resumeHelpButton.focus({preventScroll:true});
    return;
  }
  const startsGame = tutorialStartsGame;
  tutorial.hidden = true;
  gameShell.inert = false;
  rememberTutorial();
  if (startsGame) reset(pendingStartMode, pendingRankedSession);
  else if (running) { paused = false; lastTime = performance.now(); startLoop(); startMusic(); }
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
  stopLoop();
  clearRunSnapshot();
  completedRunLedger = createCurrentScoreLedger();
  updateReactor();
  stopMusic(.32);
  currentGameResult = createGameResult({
    ranked:gameMode === GAME_MODES.RANKED,
    score,
    level,
  });
  renderGameResult(currentGameResult);
  startButton.hidden = true;
  shareButton.hidden = false;
  homeButton.hidden = false;
  rankingButton.hidden = true;
  overlay.classList.add('visible', 'game-over');
  scoreRecord.hidden = false;
  if (gameMode === GAME_MODES.RANKED) submitCompletedRankedRun(runId, score, level);
  profile = finishRun(profile, {
    score,
    level,
    clears:lines,
    bombsEarned:runMetrics.bombsEarned || 0,
    reactorUses:runMetrics.reactorCount,
    maxChain,
    maxChainPower:runMetrics.maxChainPower || 0,
  });
  try { localStorage.setItem('color-tetrix-profile-v1', JSON.stringify(profile)); } catch { /* private mode */ }
  applyProfileTheme();
  tone(90,.22);
}

function renderGameResult(result) {
  overlayTitle.textContent = result.title;
  overlayCopy.textContent = result.detail;
  scoreStatus.textContent = result.kind === 'pending' ? result.detail : '';
  resultScore.textContent = result.score.toLocaleString();
  resultLevel.textContent = `LV ${result.level}`;
  resultSeasonBest.textContent = result.seasonBest == null ? '—' : result.seasonBest.toLocaleString();
  resultRank.textContent = result.rank ? `#${result.rank}` : '—';
}

async function submitCompletedRankedRun(resultRunId, finalScore, finalLevel) {
  if (!rankedSession || !completedRunLedger) return;
  let nextResult;
  try {
    const [{submitRankedRun}, {loadTopScores}] = await Promise.all([
      import('./ranked-service.js'),
      getLeaderboardApi(),
    ]);
    const submission = await submitRankedRun(rankedSession.runId, completedRunLedger);
    const leaderboard = await loadTopScores(runPlatform, rankedSession.season).catch(() => null);
    nextResult = createGameResult({
      ranked:true,
      score:finalScore,
      level:finalLevel,
      submission,
      leaderboard,
    });
  } catch {
    nextResult = createGameResult({ranked:true, score:finalScore, level:finalLevel, offline:true});
  }
  if (runId !== resultRunId || !overlay.classList.contains('game-over')) return;
  currentGameResult = nextResult;
  renderGameResult(currentGameResult);
}

function startLoop() {
  if (!running || paused || animationFrameId !== null) return;
  animationFrameId = requestAnimationFrame(loop);
}

function stopLoop() {
  if (animationFrameId === null) return;
  cancelAnimationFrame(animationFrameId);
  animationFrameId = null;
}

function loop(time) {
  animationFrameId = null;
  if (!running) { draw(); return; }
  if (paused) return;
  const dt=time-lastTime; lastTime=time; dropTimer+=dt;
  runMetrics.playTimeMs += Math.min(dt, 1000);
  updateParticles(Math.min(dt, 32));
  if (!resolving) {
    if (collides({...active, y:active.y+1})) {
      lockTimer += dt;
      if (lockTimer >= getLockDelay(level)) lock();
    } else {
      lockTimer = 0;
      if (dropTimer > getDropInterval(level) / GAME_SPEED_MULTIPLIER) { move(0,1); dropTimer=0; }
    }
  }
  updateReactor(); draw(); startLoop();
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
  if (!musicEnabled() || !running || paused) return;
  const context = ensureAudio();
  if (context) music?.start(level);
}

function stopMusic(fade) { music?.stop(fade); }

function tone(freq,duration) {
  if(!effectsEnabled()) return;
  const context=ensureAudio();
  if (!context) return;
  const osc=context.createOscillator(), gain=context.createGain();
  osc.type='square'; osc.frequency.value=freq; gain.gain.setValueAtTime(.025,context.currentTime); gain.gain.exponentialRampToValueAtTime(.001,context.currentTime+duration);
  osc.connect(gain).connect(context.destination); osc.start(); osc.stop(context.currentTime+duration);
}

function shatterSound(chain, removedCount) {
  if (!effectsEnabled()) return;
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
  if (!effectsEnabled()) return;
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

function bombBurstSound(bombCount) {
  if (!effectsEnabled()) return;
  const context = ensureAudio();
  if (!context) return;
  const now = context.currentTime;
  const duration = .24;
  const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * duration), context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    const decay = Math.pow(1 - i / data.length, 2.4);
    data[i] = (Math.random() * 2 - 1) * decay;
  }
  const blast = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();
  blast.buffer = buffer;
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(420 + Math.min(bombCount, 3) * 80, now);
  filter.frequency.exponentialRampToValueAtTime(110, now + duration);
  gain.gain.setValueAtTime(.12, now);
  gain.gain.exponentialRampToValueAtTime(.001, now + duration);
  blast.connect(filter).connect(gain).connect(context.destination);
  blast.start(now);
}

function multiplierDropSound(event) {
  if (!effectsEnabled()) return;
  const context = ensureAudio();
  if (!context) return;
  const now = context.currentTime;
  const strength = event === 'x3' ? 1.18 : 1;
  for (const [frequency, delay] of [[980, 0], [490, .055], [196, .1]]) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = delay < .1 ? 'square' : 'sine';
    oscillator.frequency.setValueAtTime(frequency * strength, now + delay);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(70, frequency * .42), now + delay + .16);
    gain.gain.setValueAtTime(delay < .1 ? .052 : .1, now + delay);
    gain.gain.exponentialRampToValueAtTime(.001, now + delay + .2);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(now + delay);
    oscillator.stop(now + delay + .21);
  }
}

function multiplierBurstSound(multipliers) {
  if (!effectsEnabled()) return;
  const context = ensureAudio();
  if (!context) return;
  const now = context.currentTime;
  const strongest = multipliers.some(({event}) => event === 'x3');
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = 'triangle';
  oscillator.frequency.setValueAtTime(strongest ? 520 : 440, now);
  oscillator.frequency.exponentialRampToValueAtTime(strongest ? 1240 : 880, now + .16);
  gain.gain.setValueAtTime(.075, now);
  gain.gain.exponentialRampToValueAtTime(.001, now + .25);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start(now);
  oscillator.stop(now + .25);
}

function levelUpSound(nextLevel) {
  if (!effectsEnabled()) return;
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

function showLeaderboardSkeleton(targetList) {
  const rows = Array.from({ length: 6 }, (_, index) => {
    const item = document.createElement('li');
    item.className = 'leaderboard-skeleton';
    item.style.setProperty('--skeleton-delay', `${index * 70}ms`);
    item.setAttribute('aria-hidden', 'true');
    for (const className of ['skeleton-name', 'skeleton-level', 'skeleton-score']) {
      const bar = document.createElement('span');
      bar.className = `skeleton-bar ${className}`;
      item.append(bar);
    }
    return item;
  });
  targetList.setAttribute('aria-busy', 'true');
  targetList.setAttribute('aria-label', 'TOP 50 랭킹을 불러오는 중');
  targetList.replaceChildren(...rows);
}

async function refreshLeaderboard(targetList = homeLeaderboardList) {
  rankingPlatformTabs.forEach(tab => {
    const selected = tab.dataset.rankingPlatform === rankingPlatform;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
  });
  showLeaderboardSkeleton(targetList);
  try {
    const { loadTopScores } = await getLeaderboardApi();
    const result = await loadTopScores(rankingPlatform);
    const { entries, myBest, season } = result;
    if (targetList === homeLeaderboardList) {
      rankingMyBest.textContent = myBest
        ? `MY BEST · ${myBest.score.toLocaleString()} · LV ${myBest.level}`
        : 'MY BEST · 아직 기록 없음';
      rankingMyBest.dataset.season = season;
    }
    targetList.replaceChildren(...entries.map(entry => {
      const item = document.createElement('li');
      const name = document.createElement('strong');
      const recordedLevel = document.createElement('span');
      const points = document.createElement('span');
      name.textContent = entry.name;
      recordedLevel.className = 'leaderboard-level';
      recordedLevel.textContent = Number.isFinite(entry.level) ? `LV ${entry.level}` : 'LV —';
      points.textContent = String(entry.score).padStart(6, '0');
      item.append(name, recordedLevel, points);
      return item;
    }));
    if (!entries.length) targetList.innerHTML = '<li><strong>아직 등록된 기록이 없습니다.</strong></li>';
    return result;
  } catch {
    targetList.innerHTML = '<li><strong>랭킹을 불러오지 못했습니다.</strong></li>';
    return null;
  } finally {
    targetList.removeAttribute('aria-busy');
    targetList.removeAttribute('aria-label');
  }
}

function openHomeRanking() {
  rankingPlatform = rankedRuntimePlatform;
  overlay.classList.add('ranking-view');
  homeRanking.hidden = false;
  rankingCloseButton.focus();
  refreshLeaderboard(homeLeaderboardList);
}

function closeHomeRanking() {
  overlay.classList.remove('ranking-view');
  homeRanking.hidden = true;
}

async function shareGame() {
  const url = `${location.origin}${location.pathname}`;
  const result = currentGameResult || createGameResult({ranked:false, score, level});
  const data = {
    title: 'COLOR BOMB',
    text: createShareText(result, runPlatform === 'mobile' ? '모바일' : '데스크탑'),
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
  shareButton.textContent = '링크 복사됨 ✓';
  setTimeout(() => { shareButton.innerHTML = '공유하기 <span>↗</span>'; }, 1400);
}

function softDrop() {
  if (!move(0,1,true)) return false;
  if (gameMode !== GAME_MODES.RANKED) {
    score += 1;
    runMetrics.dropPoints++;
  }
  updateStats();
  return true;
}

function act(action) {
  if (paused) return false;
  let applied = false;
  if(action==='left') applied = move(-1,0,true);
  else if(action==='right') applied = move(1,0,true);
  else if(action==='rotate') { rotate(); applied = true; }
  else if(action==='drop') { hardDrop(); applied = true; }
  else if(action==='down') applied = softDrop();
  else if(action==='hold') { holdPiece(); applied = true; }
  return applied;
}

async function startSelectedMode(mode) {
  const operation = rankedStartGuard.begin();
  unlockAudioSession();
  closeHomeRanking();
  rankingButton.hidden = true;
  rankedStartButton.hidden = true;
  pendingStartMode = mode;
  pendingRankedSession = null;
  if (mode === GAME_MODES.RANKED) {
    try {
      rankedStartButton.disabled = true;
      rankedStartButton.innerHTML = '연결 중… <span>◆</span>';
      const { startRankedRun } = await import('./ranked-service.js');
      const session = await startRankedRun();
      if (!rankedStartGuard.isCurrent(operation)) return;
      pendingRankedSession = session;
      runPlatform = pendingRankedSession.platform;
    } catch (error) {
      if (!rankedStartGuard.isCurrent(operation)) return;
      rankingButton.hidden = false;
      rankedStartButton.hidden = false;
      rankedStartButton.disabled = false;
      rankedStartButton.innerHTML = '랭킹 도전 <span>◆</span>';
      overlayCopy.textContent = error?.message || '랭킹 서버에 연결하지 못했습니다. 연습 모드는 계속 이용할 수 있습니다.';
      return;
    }
  }
  document.body.classList.add('playing');
  if (!tutorialSeen()) openTutorial(true);
  else reset(mode, pendingRankedSession);
}

startButton.addEventListener('click', () => startSelectedMode(GAME_MODES.PRACTICE));
rankedStartButton.addEventListener('click', () => startSelectedMode(GAME_MODES.RANKED));
rankingButton.addEventListener('click', openHomeRanking);
homeButton.addEventListener('click', returnHome);
profileButton.addEventListener('click', () => {
  openAppPanel(profilePanel, profileButton);
  loadProfilePanel();
});
settingsButton.addEventListener('click', () => {
  syncSettingsForm();
  openAppPanel(settingsPanel, settingsButton);
});
document.querySelectorAll('[data-close-panel]').forEach(button => {
  button.addEventListener('click', () => closeAppPanel(document.querySelector(`#${button.dataset.closePanel}`)));
});
nicknameForm.addEventListener('submit', async event => {
  event.preventDefault();
  const button = nicknameForm.querySelector('button');
  button.disabled = true;
  profileStatus.textContent = '새 닉네임을 확인하는 중…';
  try {
    const {changePlayerNickname} = await import('./profile-service.js');
    renderServerProfile(await changePlayerNickname(nicknameInput.value));
    profileStatus.textContent = '닉네임을 변경했습니다.';
  } catch (error) {
    profileStatus.textContent = error?.message || '닉네임을 변경하지 못했습니다.';
    button.disabled = !serverProfile?.canChangeNickname;
  }
});
socialConnectButton.addEventListener('click', async () => {
  socialConnectButton.disabled = true;
  profileStatus.textContent = 'Google 계정을 연결하는 중…';
  try {
    const {connectPlayerGoogleAccount} = await import('./profile-service.js');
    renderServerProfile(await connectPlayerGoogleAccount());
    profileStatus.textContent = 'Google 계정과 연결했습니다.';
    refreshRankedAvailability();
  } catch (error) {
    socialConnectButton.disabled = false;
    profileStatus.textContent = error?.message || 'Google 계정을 연결하지 못했습니다.';
  }
});
themeOptions.addEventListener('click', event => {
  const button = event.target.closest('[data-theme]');
  if (!button) return;
  profile.theme = button.dataset.theme;
  try { localStorage.setItem('color-tetrix-profile-v1', JSON.stringify(profile)); } catch { /* private mode */ }
  applyProfileTheme();
  renderLocalProfile();
});
settingsForm.addEventListener('change', event => {
  const input = event.target;
  const value = input.type === 'checkbox' ? input.checked : input.value;
  applySettings({...settings, [input.name]:value});
  if (input.name === 'effects' && value) tone(620, .06);
  if (input.name === 'vibration' && value) navigator.vibrate?.(18);
});
openControlsButton.addEventListener('click', () => {
  closeAppPanel(settingsPanel);
  openTutorial(false);
});
resetLocalDataButton.addEventListener('click', () => {
  const confirmed = globalThis.confirm('기기에 저장된 연습 기록과 설정을 초기화할까요? 서버 랭킹 기록은 삭제되지 않습니다.');
  if (!confirmed) return;
  for (const key of [
    'color-tetrix-profile-v1',
    'color-bomb-settings-v1',
    'color-tetrix-player-name',
    'color-tetrix-tutorial-seen',
    'color-bomb-run-snapshot-v1',
    'color-bomb-pending-best-score-v1',
    'color-bomb-pending-ranked-run-v1',
  ]) {
    try { localStorage.removeItem(key); } catch { /* private mode */ }
  }
  location.reload();
});
reducedMotionMedia.addEventListener?.('change', () => {
  if (settings.reducedMotion === 'system') {
    prefersReducedMotion = shouldReduceMotion();
    draw();
  }
});
rankingCloseButton.addEventListener('click', () => {
  closeHomeRanking();
  rankingButton.focus();
});
rankingPlatformTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    const platform = tab.dataset.rankingPlatform;
    if (platform === rankingPlatform) return;
    rankingPlatform = platform;
    refreshLeaderboard(homeLeaderboardList);
  });
});
shareButton.addEventListener('click', shareGame);
document.querySelectorAll('[data-access-action]').forEach(button => {
  button.addEventListener('click', () => act(button.dataset.accessAction));
});
document.querySelector('#pauseButton').addEventListener('click', () => {
  pauseForInterruption();
  requestResumeAfterInterruption();
});
tutorialClose.addEventListener('click',()=>{ unlockAudioSession(); closeTutorial(); });
tutorialDismiss.addEventListener('click',()=>{ unlockAudioSession(); closeTutorial(); });
gameShell.addEventListener('contextmenu',e=>e.preventDefault());
installCanvasInputGuards(canvas);
window.addEventListener('keydown',e=>{
  if (!resumeDialog.hidden) return;
  const openPanel = [profilePanel, settingsPanel].find(panel => !panel.hidden);
  if (openPanel) {
    if (e.key === 'Escape') { e.preventDefault(); closeAppPanel(openPanel); }
    return;
  }
  if (!tutorial.hidden) { if (e.key === 'Escape') { e.preventDefault(); closeTutorial(); } return; }
  const action=actionForKey(e);
  if(action) { e.preventDefault(); act(action); }
});
function pauseForInterruption() {
  if (!running || autoPaused || !tutorial.hidden) return;
  persistCurrentRun();
  paused = true;
  stopLoop();
  autoPaused = true;
  gestureStart = null;
  stopMusic();
}

function requestResumeAfterInterruption() {
  if (!autoPaused || document.hidden || !tutorial.hidden) return;
  gameShell.inert = true;
  resumeDialog.querySelector('#resumeTitle').innerHTML = '잠시<br />멈췄습니다';
  resumeDialog.querySelector('.resume-card > p:not(.overlay-kicker)').textContent =
    '준비되면 이어서 플레이하세요.';
  resumeDialog.hidden = false;
  resumeButton.focus({ preventScroll: true });
}

function openTutorialFromPause() {
  if (!autoPaused) return;
  tutorialFromPause = true;
  resumeDialog.hidden = true;
  tutorialSheet.scrollTop = 0;
  tutorial.hidden = false;
  tutorialDismiss.focus({preventScroll:true});
}

function continueAfterInterruption() {
  if (!autoPaused) return;
  unlockAudioSession();
  resumeDialog.hidden = true;
  gameShell.inert = false;
  autoPaused = false;
  paused = false;
  lastTime = performance.now();
  startLoop();
  startMusic();
}

function discardSavedRun() {
  rankedStartGuard.cancel();
  clearRunSnapshot();
  stopLoop();
  runId++;
  running = false;
  paused = false;
  autoPaused = false;
  resumeDialog.hidden = true;
  gameShell.inert = false;
  document.body.classList.remove('playing');
  overlay.classList.add('visible');
  overlay.classList.remove('game-over', 'ranking-view');
  overlayTitle.innerHTML = '낙하가 끝나면<br />연쇄가 시작된다';
  overlayCopy.textContent = '같은 색 블록을 6칸 이상 연결하세요. 무너진 블록이 새로운 연쇄를 만듭니다.';
  startButton.innerHTML = '연습하기 <span>▶</span>';
  startButton.hidden = false;
  rankedStartButton.hidden = false;
  rankingButton.hidden = false;
  shareButton.hidden = true;
  homeButton.hidden = true;
  runModeStatus.hidden = true;
}

function returnHome() {
  rankedStartGuard.cancel();
  stopLoop();
  runId++;
  running = false;
  paused = false;
  document.body.classList.remove('playing');
  overlay.classList.add('visible');
  overlay.classList.remove('game-over', 'ranking-view');
  overlayTitle.innerHTML = '낙하가 끝나면<br />연쇄가 시작된다';
  overlayCopy.textContent = '같은 색 블록을 6칸 이상 연결하세요. 무너진 블록이 새로운 연쇄를 만듭니다.';
  scoreRecord.hidden = true;
  startButton.hidden = false;
  startButton.innerHTML = '연습하기 <span>▶</span>';
  rankedStartButton.hidden = false;
  rankingButton.hidden = false;
  shareButton.hidden = true;
  homeButton.hidden = true;
  runModeStatus.hidden = true;
  currentGameResult = null;
  refreshRankedAvailability();
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) pauseForInterruption();
  else requestResumeAfterInterruption();
});
window.addEventListener('pagehide', () => {
  persistCurrentRun();
  pauseForInterruption();
});
window.addEventListener('pageshow', requestResumeAfterInterruption);
resumeButton.addEventListener('click', continueAfterInterruption);
resumeHelpButton.addEventListener('click', openTutorialFromPause);
resumeDiscardButton.addEventListener('click', discardSavedRun);

canvas.addEventListener('pointerdown',e=>{
  if (!running || paused) return;
  if (!e.isPrimary) {
    e.preventDefault();
    return;
  }
  if (!canStartPointerGesture(e, gestureStart)) {
    e.preventDefault();
    return;
  }
  unlockAudioSession();
  const rect=canvas.getBoundingClientRect();
  const sensitivity = dragSensitivityScale(settings.dragSensitivity);
  gestureStart = {
    x:e.clientX, y:e.clientY, time:performance.now(), id:e.pointerId,
    axis:null, appliedX:0, appliedY:0, moved:false,
    cellWidth:rect.width/COLS*sensitivity, cellHeight:rect.height/ROWS*sensitivity,
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
      if (!act('right')) break;
      gestureStart.appliedX++; gestureStart.moved=true;
    }
    while (gestureStart.appliedX > target) {
      if (!act('left')) break;
      gestureStart.appliedX--; gestureStart.moved=true;
    }
  } else if (gestureStart.axis==='y' && dy>0) {
    const target=Math.max(0,dragStepTarget(dy,gestureStart.cellHeight));
    while (gestureStart.appliedY < target) {
      if (!act('down')) break;
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
  e.preventDefault();
  if (!moved && Math.hypot(dx,dy) < 14 && duration < 280) { act('rotate'); showGestureHint('회전'); return; }
  if (Math.abs(dx)>Math.abs(dy) && moved) showGestureHint(dx<0?'왼쪽 이동':'오른쪽 이동');
  else if (dy < -45) { act('hold'); showGestureHint('조각 보관'); }
  else if (dy > 70 && dy/duration > 1.1 && Math.abs(dx) < dy*.45) { act('drop'); showGestureHint('즉시 낙하'); }
  else if (dy > 24 && moved) showGestureHint('천천히 내리기');
});
canvas.addEventListener('pointercancel',()=>{ gestureStart=null; });
canvas.addEventListener('lostpointercapture',()=>{ gestureStart=null; });

board=Array.from({length:ROWS},()=>Array(COLS).fill(null)); eventBoard=Array.from({length:ROWS},()=>Array(COLS).fill(null)); queue=[]; active=null; hold=null; score=0; level=1; running=false; paused=false;
syncSettingsForm(); draw(); drawRacks(); updateStats(); updateReactor(); applyProfileTheme(); renderLocalProfile();
refreshRankedAvailability();
import('./profile-service.js')
  .then(({loadPlayerProfile}) => loadPlayerProfile())
  .then(nextProfile => renderServerProfile(nextProfile))
  .catch(() => {});
const savedRun = readRunSnapshot();
if (savedRun) restoreRun(savedRun);
setupPwa();
