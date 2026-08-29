import puppeteer from 'puppeteer-core';

const target = process.env.TARGET_URL;
const chrome = process.env.CHROME;
if (!target || !chrome) throw new Error('TARGET_URL and CHROME are required');

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1365, height: 768 });
  const errors = [];
  page.on('pageerror', (err) => errors.push(`PAGEERROR ${err?.stack || err}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') errors.push(`CONSOLE ${msg.type()} ${msg.text()}`);
  });
  page.on('requestfailed', (req) => errors.push(`REQUESTFAILED ${req.url()} ${req.failure()?.errorText || ''}`));

  const started = Date.now();
  const response = await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await new Promise((resolve) => setTimeout(resolve, 4000));
  const state = await page.evaluate(() => ({
    readyState: document.readyState,
    title: document.title,
    bodyText: (document.body?.innerText || '').slice(0, 1200),
    lobbyHidden: document.getElementById('lobby')?.classList.contains('hidden') ?? null,
    publicNav: !!document.getElementById('bvPublicNav'),
    accountLink: document.getElementById('bvAccount')?.textContent || null,
    createForm: !!document.getElementById('createForm'),
    gameCount: document.querySelectorAll('.game-card').length,
    roomRows: document.querySelectorAll('.room-row').length,
    overlaysVisible: [...document.querySelectorAll('.overlay')].filter((x) => !x.classList.contains('hidden')).map((x) => x.id),
    localStorageKeys: Object.keys(localStorage),
    activeElement: document.activeElement?.id || document.activeElement?.tagName || null,
    bodyOverflow: getComputedStyle(document.body).overflow,
  }));
  console.log(JSON.stringify({ target, status: response?.status(), elapsedMs: Date.now() - started, state, errors }, null, 2));
  if (state.readyState !== 'complete') throw new Error(`document did not reach complete: ${state.readyState}`);
  if (!state.createForm || state.gameCount < 1) throw new Error('homepage interactive content missing');
  if (errors.some((x) => x.startsWith('PAGEERROR'))) throw new Error(`page errors detected: ${errors.join('\n')}`);
} finally {
  await browser.close();
}
