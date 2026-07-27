export const RANKED_ENERGY_MAX = 3;
export const RANKED_ENERGY_RECHARGE_MS = 10 * 60 * 1000;

export function calculateRankedEnergy(state, nowMs = Date.now()) {
  const storedBalance = Number.isInteger(state?.balance)
    ? Math.max(0, Math.min(RANKED_ENERGY_MAX, state.balance))
    : RANKED_ENERGY_MAX;
  const storedAt = toMillis(state?.chargedAt);
  const chargedAtMs = Number.isFinite(storedAt) && storedAt <= nowMs ? storedAt : nowMs;

  if (storedBalance >= RANKED_ENERGY_MAX) {
    return energyResult(RANKED_ENERGY_MAX, nowMs, nowMs);
  }

  const recovered = Math.floor((nowMs - chargedAtMs) / RANKED_ENERGY_RECHARGE_MS);
  const balance = Math.min(RANKED_ENERGY_MAX, storedBalance + recovered);
  const nextChargedAtMs = balance >= RANKED_ENERGY_MAX
    ? nowMs
    : chargedAtMs + recovered * RANKED_ENERGY_RECHARGE_MS;
  return energyResult(balance, nextChargedAtMs, nowMs);
}

export function spendRankedEnergy(state, nowMs = Date.now()) {
  const current = calculateRankedEnergy(state, nowMs);
  if (current.balance <= 0) return {...current, spent:false};
  const wasFull = current.balance === RANKED_ENERGY_MAX;
  return {
    ...energyResult(current.balance - 1, wasFull ? nowMs : current.chargedAtMs, nowMs),
    spent:true,
  };
}

export function rewardRankedEnergy(state, nowMs = Date.now()) {
  const current = calculateRankedEnergy(state, nowMs);
  if (current.balance >= RANKED_ENERGY_MAX) return {...current, rewarded:false};
  const balance = current.balance + 1;
  return {
    ...energyResult(balance, balance >= RANKED_ENERGY_MAX ? nowMs : current.chargedAtMs, nowMs),
    rewarded:true,
  };
}

function energyResult(balance, chargedAtMs, nowMs) {
  const nextRechargeAt = balance >= RANKED_ENERGY_MAX
    ? null
    : chargedAtMs + RANKED_ENERGY_RECHARGE_MS;
  return {
    balance,
    max:RANKED_ENERGY_MAX,
    chargedAtMs,
    nextRechargeAt,
    serverNow:nowMs,
  };
}

function toMillis(value) {
  if (typeof value?.toMillis === 'function') return value.toMillis();
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : NaN;
}
