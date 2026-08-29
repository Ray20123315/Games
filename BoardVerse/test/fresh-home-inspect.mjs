import puppeteer from 'puppeteer-core';

const target = process.env.TARGET_URL;
const chrome = process.env.CHROME;
if (!target || !chrome) throw new Error('TARGET_URL and CHROME are required');
console.log('INSPECT_START', target);
const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
console.log('BROWSER_LAUNCHED');
try {
  const page = await browser.newPage();
  console.log('PAGE_CREATED');
  await page.setViewport({ width: 1365, height: 768 });
  const errors = [];
  page.on('pageerror', (err) => { const x=`PAGEERROR ${err?.stack || err}`; errors.push(x); console.log(x); });
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') { const x=`CONSOLE ${msg.type()} ${msg.text()}`; errors.push(x); console.log(x); }
  });
  page.on('requestfailed', (req) => { const x=`REQUESTFAILED ${req.url()} ${req.failure()?.errorText || ''}`; errors.push(x); console.log(x); });

  const started = Date.now();
  console.log('GOTO_BEGIN');
  const response = await Promise.race([
    page.goto(target, { waitUntil: 'domcontentloaded', timeout: 15000 }),
    new Promise((_, reject) => setTimeout(() => reject(new Error('external navigation watchdog')), 18000)),
  ]);
  console.log('GOTO_DONE', response?.status());
  await new Promise((resolve) => setTimeout(resolve, 3000));
  console.log('EVAL_BEGIN');
  const state = await Promise.race([
    page.evaluate(() => ({
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
    })),
    new Promise((_, reject) => setTimeout(() => reject(new Error('evaluation watchdog')), 8000)),
  ]);
  console.log('EVAL_DONE');
  console.log(JSON.stringify({ target, status: response?.status(), elapsedMs: Date.now() - started, state, errors }, null, 2));
  if (state.readyState !== 'complete') throw new Error(`document did not reach complete: ${state.readyState}`);
  if (!state.createForm || state.gameCount < 1) throw new Error('homepage interactive content missing');
  if (errors.some((x) => x.startsWith('PAGEERROR'))) throw new Error(`page errors detected: ${errors.join('\n')}`);
} finally {
  console.log('BROWSER_CLOSE');
  await Promise.race([browser.close(), new Promise((resolve) => setTimeout(resolve, 3000))]);
}
