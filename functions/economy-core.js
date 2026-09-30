import {
  ATTENDANCE_REWARDS,
  DAILY_MISSIONS,
  ENERGY_MAX,
  ENERGY_REFILL_MS,
  SCORE_PER_SPARK,
  SCORE_SPARK_DAILY_MAX,
  SCORE_SPARK_PER_RUN_MAX,
  SHOP_CATALOG,
  WEEKLY_MISSIONS,
} from './shared/economy-contract.js';

export {
  ATTENDANCE_REWARDS,
  DAILY_MISSIONS,
  ENERGY_MAX,
  ENERGY_REFILL_MS,
  SCORE_PER_SPARK,
  SCORE_SPARK_DAILY_MAX,
  SCORE_SPARK_PER_RUN_MAX,
  SHOP_CATALOG,
  WEEKLY_MISSIONS,
};

export function attendanceDayDistance(previousDay, currentDay) {
  const previous = Date.parse(`${String(previousDay || '')}T00:00:00Z`);
  const current = Date.parse(`${String(currentDay || '')}T00:00:00Z`);
  if (!Number.isFinite(previous) || !Number.isFinite(current)) return null;
  return Math.round((current - previous) / (24 * 60 * 60 * 1000));
}

export function claimAttendance(progress = {}, day) {
  const currentDay = String(day || '');
  const previousDay = String(progress.lastClaimDay || '');
  const distance = attendanceDayDistance(previousDay, currentDay);
  const previousStreak = Math.min(ATTENDANCE_REWARDS.length, Math.max(0, Math.floor(Number(progress.streak) || 0)));
  if (distance !== null && distance <= 0) {
    return {
      ...serializeAttendance(progress, currentDay),
      claimed:false,
      reward:0,
    };
  }
  const streak = distance === 1 && previousStreak < ATTENDANCE_REWARDS.length
    ? previousStreak + 1
    : 1;
  return {
    streak,
    lastClaimDay:currentDay,
    claimedToday:true,
    claimed:true,
    reward:ATTENDANCE_REWARDS[streak - 1],
    rewards:[...ATTENDANCE_REWARDS],
  };
}

export function serializeAttendance(progress = {}, day) {
  const currentDay = String(day || '');
  const streak = Math.min(ATTENDANCE_REWARDS.length, Math.max(0, Math.floor(Number(progress.streak) || 0)));
  return {
    streak,
    lastClaimDay:String(progress.lastClaimDay || ''),
    claimedToday:Boolean(currentDay && progress.lastClaimDay === currentDay),
    nextDay:attendanceDayDistance(progress.lastClaimDay, currentDay) === 1 && streak < 7 ? streak + 1 : 1,
    rewards:[...ATTENDANCE_REWARDS],
  };
}

export function scoreToSpark(score, earnedToday = 0) {
  const scoreReward = Math.min(
    SCORE_SPARK_PER_RUN_MAX,
    Math.floor(Math.max(0, Number(score) || 0) / SCORE_PER_SPARK),
  );
  const dailyRemaining = Math.max(0, SCORE_SPARK_DAILY_MAX - Math.max(0, Math.floor(Number(earnedToday) || 0)));
  return Math.min(scoreReward, dailyRemaining);
}

export function defaultEconomy() {
  return {
    rankedEnergy:ENERGY_MAX,
    sparkBalance:0,
    ownedItems:['default-theme'],
    equippedItems:{appTheme:'default-theme'},
  };
}

export function refillEnergy({energy:storedEnergy = ENERGY_MAX, updatedAtMs:storedUpdatedAtMs = 0}, now = Date.now()) {
  const safeEnergy = Math.min(ENERGY_MAX, Math.max(0, Math.floor(Number(storedEnergy) || 0)));
  const safeUpdatedAt = Number.isFinite(storedUpdatedAtMs) && storedUpdatedAtMs > 0 ? storedUpdatedAtMs : now;
  if (safeEnergy >= ENERGY_MAX) {
    return {energy:ENERGY_MAX, updatedAtMs:now, nextRefillAtMs:null};
  }
  const elapsed = Math.max(0, now - safeUpdatedAt);
  const gained = Math.floor(elapsed / ENERGY_REFILL_MS);
  const energy = Math.min(ENERGY_MAX, safeEnergy + gained);
  if (energy >= ENERGY_MAX) return {energy, updatedAtMs:now, nextRefillAtMs:null};
  const updatedAtMs = safeUpdatedAt + gained * ENERGY_REFILL_MS;
  return {energy, updatedAtMs, nextRefillAtMs:updatedAtMs + ENERGY_REFILL_MS};
}

export function consumeEnergy(state, now = Date.now()) {
  const current = refillEnergy(state, now);
  if (current.energy < 1) return {...current, consumed:false};
  return {
    energy:current.energy - 1,
    updatedAtMs:current.energy === ENERGY_MAX ? now : current.updatedAtMs,
    nextRefillAtMs:current.energy === ENERGY_MAX ? now + ENERGY_REFILL_MS : current.nextRefillAtMs,
    consumed:true,
  };
}

export function grantEnergy(state, now = Date.now()) {
  const current = refillEnergy(state, now);
  if (current.energy >= ENERGY_MAX) return {...current, granted:false};
  const energy = current.energy + 1;
  return {
    energy,
    updatedAtMs:energy >= ENERGY_MAX ? now : current.updatedAtMs,
    nextRefillAtMs:energy >= ENERGY_MAX ? null : current.nextRefillAtMs,
    granted:true,
  };
}

export function getKstWeek(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone:'Asia/Seoul', year:'numeric', month:'2-digit', day:'2-digit',
  }).format(date);
  const utc = new Date(`${parts}T00:00:00Z`);
  const weekday = (utc.getUTCDay() + 6) % 7;
  utc.setUTCDate(utc.getUTCDate() - weekday);
  return utc.toISOString().slice(0, 10);
}

export function emptyMissionProgress(period, type) {
  return {period, type, values:{games:0, clears:0, reactors:0, chainGames:0, levelGames:0}, claimed:[]};
}

export function applyMissionRun(progress, ledger) {
  const values = {...emptyMissionProgress(progress.period, progress.type).values, ...progress.values};
  values.games += 1;
  values.clears += Math.max(0, Number(ledger.removedCells) || 0);
  values.reactors += Math.max(0, Number(ledger.reactorCount) || 0);
  if ((Number(ledger.maxChain) || 0) >= 3) values.chainGames += 1;
  if ((Number(ledger.level) || 0) >= 10) values.levelGames += 1;
  const definitions = progress.type === 'daily' ? DAILY_MISSIONS : WEEKLY_MISSIONS;
  const claimed = new Set(Array.isArray(progress.claimed) ? progress.claimed : []);
  let reward = 0;
  for (const mission of definitions) {
    if (values[mission.field] >= mission.target && !claimed.has(mission.id)) {
      claimed.add(mission.id);
      reward += mission.reward;
    }
  }
  return {...progress, values, claimed:[...claimed], reward};
}

export function serializeMissions(progress, definitions) {
  const claimed = new Set(progress?.claimed || []);
  return definitions.map(mission => ({
    id:mission.id,
    label:mission.label,
    value:Math.min(mission.target, Math.max(0, progress?.values?.[mission.field] || 0)),
    target:mission.target,
    reward:mission.reward,
    complete:claimed.has(mission.id),
  }));
}

export function catalogItem(itemId) {
  return SHOP_CATALOG.find(item => item.id === itemId) || null;
}
