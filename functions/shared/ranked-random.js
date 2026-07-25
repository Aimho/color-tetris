export const RANKED_RANDOM_VERSION = 1;

export function createRankedRandom(seed) {
  const state = hashSeed(String(seed));
  return function rankedRandom() {
    const value = (state[0] + state[1] + state[3]) >>> 0;
    state[3] = (state[3] + 1) >>> 0;
    state[0] = (state[1] ^ (state[1] >>> 9)) >>> 0;
    state[1] = (state[2] + (state[2] << 3)) >>> 0;
    state[2] = ((state[2] << 21) | (state[2] >>> 11)) >>> 0;
    state[2] = (state[2] + value) >>> 0;
    return value / 4294967296;
  };
}

function hashSeed(seed) {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let index = 0; index < seed.length; index++) {
    const code = seed.charCodeAt(index);
    h1 = h2 ^ Math.imul(h1 ^ code, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ code, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ code, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ code, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  return [(h1 ^ h2 ^ h3 ^ h4) >>> 0, (h2 ^ h1) >>> 0, (h3 ^ h1) >>> 0, (h4 ^ h1) >>> 0];
}
