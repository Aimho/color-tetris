import {
  RANKED_ENERGY_MAX,
  RANKED_ENERGY_RECHARGE_MS,
} from '../functions/shared/ranked-energy.js';

export function createRankedEnergyClock(payload, clientNow = Date.now()) {
  const balance = Number.isInteger(payload?.balance)
    ? Math.max(0, Math.min(RANKED_ENERGY_MAX, payload.balance))
    : 0;
  const max = Number.isInteger(payload?.max) ? payload.max : RANKED_ENERGY_MAX;
  const serverNow = Number.isFinite(payload?.serverNow) ? payload.serverNow : clientNow;
  const nextRechargeAt = Number.isFinite(payload?.nextRechargeAt) ? payload.nextRechargeAt : null;
  return {balance, max, nextRechargeAt, clockOffset:serverNow - clientNow};
}

export function projectRankedEnergy(clock, clientNow = Date.now()) {
  if (!clock) return null;
  if (clock.balance >= clock.max) {
    return {...clock, balance:clock.max, nextRechargeAt:null, remainingMs:0};
  }
  if (!clock.nextRechargeAt) {
    return {...clock, remainingMs:0};
  }
  const serverNow = clientNow + clock.clockOffset;
  const elapsedIntervals = Math.max(
    0,
    Math.floor((serverNow - clock.nextRechargeAt) / RANKED_ENERGY_RECHARGE_MS) + 1,
  );
  const balance = Math.min(clock.max, clock.balance + elapsedIntervals);
  const nextRechargeAt = balance >= clock.max
    ? null
    : clock.nextRechargeAt + elapsedIntervals * RANKED_ENERGY_RECHARGE_MS;
  return {
    ...clock,
    balance,
    nextRechargeAt,
    remainingMs:nextRechargeAt ? Math.max(0, nextRechargeAt - serverNow) : 0,
  };
}

export function formatEnergyCountdown(remainingMs) {
  const seconds = Math.max(0, Math.ceil(remainingMs / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}
