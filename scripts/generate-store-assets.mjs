import { chromium } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const assets = resolve(root, 'store-assets');
const output = resolve(assets, 'play-store-v2');
await mkdir(output, { recursive: true });

const imageData = async (name) => `data:image/png;base64,${(await readFile(resolve(assets, name))).toString('base64')}`;
const browser = await chromium.launch({ headless: true });

const palette = {
  ink: '#080b09',
  paper: '#f2f3ed',
  acid: '#dfff00',
  coral: '#ff5b3d',
  mint: '#38d8b0',
  pink: '#ef78d2',
};

const shots = [
  {
    file: 'phone-02-game.png',
    eyebrow: 'CHAIN REACTION',
    title: '6개를 연결하면\n한 번에 폭발',
    body: '같은 색을 모으고 터뜨리는 순간,\n보드 전체가 연쇄 반응을 시작합니다.',
    accent: palette.coral,
    position: 'center',
  },
  {
    file: 'phone-02-game.png',
    eyebrow: 'REACTOR BOOST',
    title: '연쇄할수록\n더 강해진다',
    body: '리액터를 채우고 점수 배율을 끌어올려\n나만의 최고 기록을 만드세요.',
    accent: palette.acid,
    position: 'center bottom',
  },
  {
    file: 'phone-01-home.png',
    eyebrow: 'COLOR × CHAIN',
    title: '낙하가 끝나면\n연쇄가 시작된다',
    body: '블록을 놓는 간단한 선택 하나가\n보드 전체의 폭발로 이어집니다.',
    accent: palette.mint,
    position: 'center top',
    cropHero: true,
  },
  {
    file: 'phone-04-shop.png',
    eyebrow: 'CUSTOM SHOP',
    title: 'SPARK로 여는\n새로운 스타일',
    body: '보드 스킨부터 블록, 이펙트까지\n플레이할수록 선택지가 늘어납니다.',
    accent: palette.pink,
    position: 'center',
    landscape: true,
  },
  {
    file: 'phone-03-help.png',
    eyebrow: 'QUICK START',
    title: '한 번에 배우는\n직관적인 규칙',
    body: '복잡한 설명 없이 바로 시작하고\n연결과 연쇄의 손맛에 집중하세요.',
    accent: palette.acid,
    position: 'center top',
  },
  {
    file: 'phone-04-settings.png',
    eyebrow: 'CONTROL ROOM',
    title: '손맛까지\n내 취향대로',
    body: '음향, 진동, 화면 효과와 조작 감도를\n플레이 스타일에 맞춰 조정하세요.',
    accent: palette.coral,
    position: 'center top',
  },
];

function baseCss() {
  return `
    * { box-sizing: border-box; }
    html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; }
    body {
      font-family: "Apple SD Gothic Neo", "Noto Sans KR", sans-serif;
      color: ${palette.paper};
      background: ${palette.ink};
      -webkit-font-smoothing: antialiased;
    }
  `;
}

async function renderScreenshot(item, index) {
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  const imageUrl = await imageData(item.file);
  await page.setContent(`<!doctype html><html><head><style>
    ${baseCss()}
    .poster {
      position: relative; width: 1080px; height: 1920px; overflow: hidden;
      background:
        radial-gradient(circle at 82% 15%, color-mix(in srgb, ${item.accent} 22%, transparent), transparent 32%),
        linear-gradient(rgba(255,255,255,.026) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255,255,255,.026) 1px, transparent 1px),
        ${palette.ink};
      background-size: auto, 72px 72px, 72px 72px, auto;
    }
    .rail { position:absolute; left:0; top:0; width:18px; height:100%; background:${item.accent}; }
    .copy { position:absolute; z-index:3; top:112px; left:88px; width:900px; }
    .eyebrow { color:${item.accent}; font:800 27px/1.1 ui-monospace, monospace; letter-spacing:.18em; }
    h1 { margin:32px 0 24px; font-size:88px; line-height:1.03; letter-spacing:-.045em; white-space:pre-line; }
    p { margin:0; color:rgba(242,243,237,.72); font-size:30px; line-height:1.48; white-space:pre-line; }
    .burst { position:absolute; right:-120px; top:420px; width:600px; height:600px; border-radius:50%; background:radial-gradient(circle, color-mix(in srgb, ${item.accent} 28%, transparent), transparent 64%); filter:blur(6px); }
    .screen {
      position:absolute; z-index:2; left:${item.landscape || item.cropHero ? '60px' : '156px'}; top:${item.landscape || item.cropHero ? '850px' : '690px'};
      width:${item.landscape || item.cropHero ? '960px' : '768px'}; height:${item.landscape ? '540px' : item.cropHero ? '700px' : '1365px'};
      overflow:hidden; border-radius:${item.landscape || item.cropHero ? '34px' : '52px'};
      background:#050806; outline:2px solid rgba(255,255,255,.14); outline-offset:-2px;
      box-shadow:0 0 0 10px rgba(255,255,255,.035), 0 40px 120px color-mix(in srgb, ${item.accent} 18%, transparent);
      transform:${index % 2 === 0 ? 'rotate(-1.3deg)' : 'rotate(1.3deg)'};
    }
    .screen img { width:100%; height:100%; display:block; object-fit:${item.landscape ? 'contain' : 'cover'}; object-position:${item.position}; }
    .tag { position:absolute; z-index:4; right:70px; bottom:62px; color:${palette.ink}; background:${item.accent}; padding:16px 24px; font:900 22px/1 ui-monospace, monospace; letter-spacing:.08em; transform:rotate(-2deg); }
  </style></head><body><main class="poster">
    <div class="rail"></div><div class="burst"></div>
    <section class="copy"><div class="eyebrow">${item.eyebrow}</div><h1>${item.title}</h1><p>${item.body}</p></section>
    <figure class="screen"><img src="${imageUrl}" alt=""></figure>
    <div class="tag">COLOR BOMB / 0${index + 1}</div>
  </main></body></html>`, { waitUntil: 'load' });
  await page.locator('img').evaluate((image) => image.decode());
  await page.screenshot({ path: resolve(output, `phone-${String(index + 1).padStart(2, '0')}.png`) });
  await page.close();
}

async function renderFeature() {
  const page = await browser.newPage({ viewport: { width: 1024, height: 500 }, deviceScaleFactor: 1 });
  const keyArt = await imageData('reactor-keyart-v2.png');
  await page.setContent(`<!doctype html><html><head><style>
    ${baseCss()}
    main { position:relative; width:1024px; height:500px; overflow:hidden; background:#070908 url('${keyArt}') center/cover no-repeat; }
    main::after { content:""; position:absolute; inset:0; background:linear-gradient(90deg, rgba(7,9,8,.24) 0%, rgba(7,9,8,.08) 49%, transparent 72%); }
    .copy { position:absolute; z-index:2; left:54px; top:62px; width:480px; }
    .eyebrow { color:${palette.acid}; font:900 16px/1 ui-monospace, monospace; letter-spacing:.22em; }
    h1 { margin:20px 0 8px; font-size:74px; line-height:.9; letter-spacing:-.055em; }
    .ko { font-size:25px; font-weight:800; letter-spacing:-.025em; }
    .line { margin-top:28px; width:150px; height:8px; background:${palette.coral}; box-shadow:54px 0 ${palette.acid}, 108px 0 ${palette.mint}, 162px 0 ${palette.pink}; }
  </style></head><body><main><section class="copy"><div class="eyebrow">CHAIN REACTOR</div><h1>COLOR<br>BOMB</h1><div class="ko">터뜨릴수록 강해지는 연쇄 퍼즐</div><div class="line"></div></section></main></body></html>`, { waitUntil: 'load' });
  await page.screenshot({ path: resolve(output, 'feature-graphic-1024x500.png') });
  await page.close();
}

for (const [index, shot] of shots.entries()) await renderScreenshot(shot, index);
await renderFeature();
await browser.close();
