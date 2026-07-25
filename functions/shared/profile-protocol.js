export const NICKNAME_CHANGE_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export const FUNNY_ADJECTIVES = Object.freeze([
  '졸린', '급한', '용감한', '엉뚱한', '말랑한',
  '신난', '수상한', '배고픈', '느긋한', '반짝인',
]);

export const COLOR_BOMB_NOUNS = Object.freeze([
  '폭탄', '젤리', '도화선', '불꽃', '연쇄',
  '큐브', '블록', '별사탕', '팝콘', '번개',
]);

export function normalizeNickname(value) {
  const nickname = String(value ?? '')
    .normalize('NFKC')
    .replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/g, '')
    .trim()
    .replace(/\s+/g, ' ');
  if (nickname.length < 2 || nickname.length > 12) return '';
  if (!/^[가-힣A-Za-z0-9 ]+$/.test(nickname)) return '';
  return nickname;
}

export function nicknameKey(value) {
  return normalizeNickname(value).toLocaleLowerCase('ko-KR').replaceAll(' ', '');
}

export function createFunnyNickname(random = Math.random) {
  const adjective = FUNNY_ADJECTIVES[Math.floor(random() * FUNNY_ADJECTIVES.length)];
  const noun = COLOR_BOMB_NOUNS[Math.floor(random() * COLOR_BOMB_NOUNS.length)];
  const number = String(Math.floor(random() * 1000)).padStart(3, '0');
  return `${adjective}${noun}${number}`;
}

export function canChangeNickname(profile, now = Date.now()) {
  if (!profile?.isCustom) return { allowed:true, nextChangeAt:now };
  const changedAt = Number(profile.lastNicknameChangeAtMs || 0);
  const nextChangeAt = changedAt + NICKNAME_CHANGE_COOLDOWN_MS;
  return { allowed:now >= nextChangeAt, nextChangeAt };
}
