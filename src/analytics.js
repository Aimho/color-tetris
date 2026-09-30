import { Capacitor } from '@capacitor/core';
import { FirebaseAnalytics } from '@capacitor-firebase/analytics';

const events = new Set(['app_ready','screen_open','tutorial_open','game_start','game_finish','reward_ad_request','reward_ad_complete','reward_ad_failed','attendance_claim','shop_purchase','shop_equip','share_clicked','share_completed']);
const keys = new Set(['mode','screen','level','score_bucket','reward','item_id','method']);
export function sanitizeAnalyticsParams(params = {}) {
  return Object.fromEntries(Object.entries(params).filter(([key,value]) => keys.has(key) &&
    (typeof value === 'string' || typeof value === 'number' && Number.isFinite(value)))
    .map(([key,value]) => [key, typeof value === 'string' ? value.slice(0,80) : value]));
}
export function trackEvent(name, params = {}) {
  if (!Capacitor.isNativePlatform() || !events.has(name)) return;
  Promise.resolve().then(() => FirebaseAnalytics.logEvent({name, params:sanitizeAnalyticsParams(params)})).catch(() => {});
}
