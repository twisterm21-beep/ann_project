// Local, isolated headless Edge check. No npm dependencies, hosting or user profile access.
// Usage: node tools/check-browser.cjs [output-directory]
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '..');
const out = path.resolve(process.argv[2] || path.join(root, 'site-preview-checks'));
fs.mkdirSync(out, { recursive: true });
const port = 9437;
const executable = process.env.EDGE_BINARY || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const browserProcess = spawn(executable, ['--headless=new', '--no-first-run', '--no-default-browser-check', `--remote-debugging-port=${port}`, `--user-data-dir=${path.join(out, 'browser-profile')}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
let startupErrors = '';
browserProcess.stderr.on('data', data => { startupErrors += data.toString(); });
browserProcess.on('error', error => { startupErrors += error.message; });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const failures = [];
const report = { widths: [], interactions: {}, errors: [], canceledRequests: 0 };
let socket;
const check = (ok, message) => { if (!ok) failures.push(message); };
(async () => {
  let target;
  for (let attempt = 0; attempt < 80; attempt++) {
    try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(item => item.type === 'page'); } catch {}
    if (target) break;
    await sleep(150);
  }
  assert(target, 'Headless Edge did not start: ' + startupErrors);
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let seq = 0;
  const pending = new Map();
  socket.onmessage = event => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject, timer } = pending.get(message.id);
      clearTimeout(timer); pending.delete(message.id);
      if (message.error) reject(new Error(JSON.stringify(message.error))); else resolve(message.result);
    }
    if (message.method === 'Runtime.exceptionThrown') report.errors.push(message.params.exceptionDetails.text + ': ' + JSON.stringify(message.params.exceptionDetails.exception));
    if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') report.errors.push(message.params.entry.text);
    if (message.method === 'Network.loadingFailed') {
      if (message.params.canceled) report.canceledRequests++;
      else report.errors.push(message.params.errorText);
    }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++seq;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Timeout: ${method}`)); }, 15000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const press = async (key, code, windowsVirtualKeyCode) => {
    const text = key === 'Enter' ? '\r' : key === ' ' ? ' ' : undefined;
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode, text, unmodifiedText: text });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode });
    await sleep(40);
  };
  const screenshot = async (name, clip) => {
    const result = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip });
    fs.writeFileSync(path.join(out, name), Buffer.from(result.data, 'base64'));
  };
  await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable'); await send('Network.enable');
  await send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  for (const width of [1440, 1280, 1024, 768, 430, 390, 375]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url: pathToFileURL(path.join(root, 'index.html')).href });
    for (let attempt = 0; attempt < 100; attempt++) {
      if (await evaluate("document.readyState === 'complete' && !!document.querySelector('.program-block') && document.documentElement.classList.contains('menu-ready')")) break;
      await sleep(50);
    }
    await sleep(120);
    const sections = await evaluate("Array.from(document.querySelectorAll('main>section:not([hidden]),footer')).map((el,i)=>({index:i,id:el.id||el.className.split(' ')[0]}))");
    for (const section of sections) {
      await evaluate(`document.querySelectorAll('main>section:not([hidden]),footer')[${section.index}].scrollIntoView()`);
      await sleep(80);
    }
    await sleep(200);
    const layout = await evaluate(`(() => {
      const visible = el => el.getClientRects().length > 0;
      const overflow = [...document.querySelectorAll('body *')].filter(visible).filter(el => {
        if (el.classList.contains('skip-link')) return false;
        const r=el.getBoundingClientRect(); return r.left < -1 || r.right > innerWidth + 1;
      }).map(el=>el.tagName+'.'+el.className);
      const clippedText = [...document.querySelectorAll('h1,h2,h3,p,li,a,summary,dt,dd')].filter(visible).filter(el=>el.scrollWidth > el.clientWidth+2 && getComputedStyle(el).display!=='inline').map(el=>el.textContent.slice(0,90));
      const headings=[...document.querySelectorAll('h1,h2,h3')].filter(visible).map(el=>({level:Number(el.tagName[1]),text:el.textContent}));
      const header=[...document.querySelector('.header-inner').children].filter(visible).map(el=>{const r=el.getBoundingClientRect();return {name:el.className,x:r.x,right:r.right,y:r.y,bottom:r.bottom}});
      const overlaps=header.flatMap((a,i)=>header.slice(i+1).filter(b=>Math.min(a.right,b.right)-Math.max(a.x,b.x)>1 && Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y)>1).map(b=>a.name+' / '+b.name));
      return {width:innerWidth,scrollWidth:document.documentElement.scrollWidth,overflow,clippedText,overlaps,headings,images:[...document.images].map(el=>({src:el.currentSrc,loaded:el.complete&&el.naturalWidth>0,alt:el.alt})),mentorHidden:!visible(document.getElementById('mentor')),audienceColumns:getComputedStyle(document.querySelector('.audience-grid')).gridTemplateColumns,menuVisible:visible(document.querySelector('.menu-toggle'))};
    })()`);
    check(layout.scrollWidth <= width, `Horizontal page overflow at ${width}`);
    check(!layout.overflow.length, `Element overflow at ${width}: ${layout.overflow}`);
    check(!layout.clippedText.length, `Text overflow at ${width}: ${layout.clippedText}`);
    check(!layout.overlaps.length, `Header overlaps at ${width}: ${layout.overlaps}`);
    check(layout.images.every(img => img.loaded && img.alt), `Image failed at ${width}`);
    check(layout.mentorHidden, `Unverified mentor shown at ${width}`);
    check(layout.headings.filter(h=>h.level===1).length===1, 'One visible H1');
    for(let i=1;i<layout.headings.length;i++) check(layout.headings[i].level<=layout.headings[i-1].level+1, 'Heading level skipped');
    const anchorResults = [];
    const links = await evaluate("Array.from(document.querySelectorAll('.nav a')).map(a=>a.hash)");
    for (const hash of links) {
      if (layout.menuVisible) await evaluate("document.querySelector('.menu-toggle').click()");
      await evaluate(`document.querySelector('.nav a[href="${hash}"]').click()`);
      await sleep(60);
      const anchor = await evaluate(`(() => { const el=document.querySelector('${hash}');const heading=el.querySelector('h2');return {hash:location.hash,headingTop:heading.getBoundingClientRect().top,headerBottom:document.querySelector('.site-header').getBoundingClientRect().bottom,closed:document.querySelector('.menu-toggle').getAttribute('aria-expanded')==='false'}; })()`);
      check(anchor.headingTop >= anchor.headerBottom - 1, `Anchor hidden by header: ${hash} at ${width}`);
      check(anchor.closed, `Menu remained open at ${width}`);
      anchorResults.push(anchor);
    }
    await evaluate('window.scrollTo(0,0)');
    await sleep(60);
    for (const section of sections) {
      const bounds = await evaluate(`(() => {const r=document.querySelectorAll('main>section:not([hidden]),footer')[${section.index}].getBoundingClientRect();return {x:0,y:Math.max(0,r.top+scrollY),width:innerWidth,height:Math.ceil(r.height),scale:1}})()`);
      await screenshot(`${width}-${String(section.index).padStart(2,'0')}-${section.id}.png`, bounds);
    }
    await screenshot(`${width}-header.png`, { x:0, y:0, width, height:130, scale:1 });
    report.widths.push({ ...layout, anchors: anchorResults });
    console.log(`${width}px: ${layout.overflow.length} overflowing elements, ${layout.overlaps.length} header overlaps, ${layout.images.length} loaded images`);
  }
  await evaluate("document.querySelector('.menu-toggle').focus()");
  await press('Enter','Enter',13);
  check(await evaluate("document.querySelector('.menu-toggle').getAttribute('aria-expanded')==='true'"), 'Menu keyboard Enter');
  await press('Escape','Escape',27);
  report.interactions.escapeReturnsFocus = await evaluate("document.activeElement===document.querySelector('.menu-toggle') && document.activeElement.getAttribute('aria-expanded')==='false'");
  check(report.interactions.escapeReturnsFocus, 'Escape closes menu and restores focus');
  await evaluate("document.querySelector('summary').focus()");
  await press('Enter','Enter',13);
  report.interactions.faqEnter = await evaluate("document.querySelector('details').open");
  await press(' ','Space',32);
  report.interactions.faqSpace = await evaluate("!document.querySelector('details').open");
  check(report.interactions.faqEnter && report.interactions.faqSpace, 'Native FAQ keyboard interaction');
  const summaries = await evaluate("document.querySelectorAll('summary').length");
  for(let i=0;i<summaries;i++) {
    await evaluate(`document.querySelectorAll('summary')[${i}].focus()`); await press('Enter','Enter',13);
    check(await evaluate(`document.querySelectorAll('details')[${i}].open`), `FAQ ${i+1} failed`);
  }
  report.interactions.allFaqOpen = summaries;
  report.interactions.reducedMotion = await evaluate("getComputedStyle(document.documentElement).scrollBehavior==='auto'");
  check(report.interactions.reducedMotion, 'Reduced motion');
  report.interactions.focusOutline = await evaluate("getComputedStyle(document.activeElement).outlineStyle");
  check(report.interactions.focusOutline!=='none', 'Visible keyboard focus');
  const ctas = await evaluate("[...document.querySelectorAll('a.button')].map(a=>({text:a.childNodes[0].textContent.trim(),href:a.getAttribute('href')}))");
  const labels = ['Посмотреть программу','Получить программу','Получить консультацию','Задать вопрос о поступлении'];
  ctas.forEach(a => {check(labels.includes(a.text), `Unexpected CTA ${a.text}`);check(a.href===(a.text===labels[0]?'#program':'https://t.me/movetoviet2026'), `Wrong CTA target ${a.text}`);});
  report.interactions.ctas = ctas.length;
  await evaluate("document.querySelector('.menu-toggle').click(); window.scrollTo(0,0)");
  await screenshot('375-menu-open.png', { x:0, y:0, width:375, height:520, scale:1 });
  await evaluate("document.querySelector('.menu-toggle').click(); document.querySelector('#faq').scrollIntoView()");
  const faqBounds = await evaluate("(() => { const r=document.querySelector('#faq').getBoundingClientRect(); return {x:0,y:r.top+scrollY,width:375,height:Math.ceil(r.height),scale:1}; })()");
  await screenshot('375-faq-open.png', faqBounds);
  const creditBounds = await evaluate("(() => { const r=document.querySelector('.photo-credits').getBoundingClientRect(); return {x:0,y:r.top+scrollY,width:375,height:Math.ceil(r.height),scale:1}; })()");
  await screenshot('375-credits.png', creditBounds);
  await send('Emulation.setScriptExecutionDisabled', { value: true });
  await send('Page.navigate', { url: pathToFileURL(path.join(root, 'index.html')).href });
  await sleep(400);
  report.interactions.withoutJavaScript = await evaluate("getComputedStyle(document.querySelector('.nav')).display !== 'none' && document.querySelector('.menu-toggle').hidden && document.querySelector('#mentor').hidden");
  check(report.interactions.withoutJavaScript, 'Navigation and hidden mentor without JavaScript');
  check(report.errors.length===0, `Browser errors: ${report.errors.join('; ')}`);
  report.failures = failures;
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ interactions:report.interactions,errors:report.errors,failures },null,2));
  await send('Browser.close');
  socket.close();
  process.exitCode = failures.length ? 1 : 0;
})().catch(error => { console.error(error); process.exitCode=1; }).finally(() => { if(socket)socket.close(); browserProcess.kill(); });
