export function setupPwa(installButton) {
  if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
  let prompt;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if (ios && !standalone) {
    installButton.hidden = false;
    installButton.textContent = 'SAFARI · 공유 → 홈 화면에 추가';
  }
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault(); prompt = event; installButton.hidden = false;
  });
  installButton.addEventListener('click', async () => {
    if (!prompt) return;
    await prompt.prompt(); prompt = null; installButton.hidden = true;
  });
  window.addEventListener('appinstalled', () => { installButton.hidden = true; });
}
