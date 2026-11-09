const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const engine = require(process.env.PLAYWRIGHT_MODULE || 'playwright')[process.env.BROWSER_ENGINE || 'chromium'];

(async () => {
  const html = fs.readFileSync(path.join(__dirname, '../index.html'));
  const server = http.createServer((req, res) => { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(html); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await engine.launch({headless:true, ...(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH} : {})});
  try {
    const page = await browser.newPage({viewport:{width:390,height:844}, deviceScaleFactor:3, isMobile:true, hasTouch:true});
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    assert.equal(await page.locator('.tw').count(), 2);
    assert.match(await page.locator('.av img').first().getAttribute('src'),/^data:image\/jpeg;base64,/);
    const beforeRandom = await page.locator('.tm').allTextContents();
    await page.locator('#btnRandom').click();
    assert.notDeepEqual(await page.locator('.tm').allTextContents(),beforeRandom);
    const ages = await page.evaluate(() => data.tweets.map(t => ageMinutes(t.time)));
    assert.ok(ages.every((n,i) => n > 0 && (!i || n <= ages[i-1])));
    const times = await page.locator('.tm').allTextContents();
    await page.locator('#statsHeat').selectOption('low');
    assert.deepEqual(await page.locator('.tm').allTextContents(),times);
    await page.locator('#statsHeat').selectOption('medium');
    const checks = await page.evaluate(() => {
      const now = new Date(2026,10,9,12);
      const parsed = ['刚刚','30秒','2分钟','3小时前','2天','1周','2h','5 minutes ago','2026-11-08','2026-02-30','2099-01-01','abc'].map(s => ageMinutes(s,now));
      const t = {time:'· 2分钟', rates:{views:100,likes:10,replies:2,retweets:3}};
      applyStats(t); const before = [t.replies,t.retweets,t.likes,t.views];
      t.time = '· 4分钟'; applyStats(t);
      return {parsed,before,after:[t.replies,t.retweets,t.likes,t.views]};
    });
    assert.deepEqual(checks.parsed,[0,.5,2,180,2880,10080,120,5,2160,null,null,null]);
    assert.deepEqual(checks.before,['4','6','20','200']);
    assert.deepEqual(checks.after,['8','12','40','400']);
    for (const key of ['replies','retweets','likes']) {
      await page.locator(`[data-f="0.${key}"]`).fill('999');
      await page.locator('#btnVf').click();
      await page.locator('#btnAdd').click();
      assert.equal(await page.locator(`[data-f="0.${key}"]`).innerText(),'999');
      await page.locator('#removePost').click();
    }
    await page.locator('[data-f="handle"]').first().fill('@a_long_handle');
    assert.equal(await page.locator('.hk').last().innerText(),'@a_long_handle');
    await page.locator('#statsMode').selectOption('auto');
    await page.locator('[data-f="0.time"]').fill('· 4分钟');
    await page.locator('#statsTitle').click();
    const savedRates = await page.evaluate(() => data.tweets[0].rates);
    await page.locator('[data-f="0.time"]').fill('· 8分钟');
    await page.locator('#statsTitle').click();
    assert.deepEqual(await page.evaluate(() => data.tweets[0].rates),savedRates);
    await page.locator('[data-f="0.time"]').fill('无效');
    await page.locator('#statsTitle').click();
    assert.match(await page.locator('#statsStatus').innerText(),/无法识别/);
    await page.locator('[data-f="0.replies"]').fill('123');
    assert.equal(await page.locator('#statsMode').inputValue(),'manual');
    await page.waitForTimeout(400);
    await page.reload();
    assert.equal(await page.locator('[data-f="0.replies"]').innerText(),'123');
    // XML serialization must preserve ampersands, line breaks and inline images.
    await page.locator('[data-f="0.text"]').fill('A & B < C\n\n第二段');
    await page.evaluate(() => {
      const c = document.createElement('canvas'); c.width=200; c.height=100;
      const ctx = c.getContext('2d'); ctx.fillStyle='#ff0000';ctx.fillRect(0,0,200,100);
      data.avatar=c.toDataURL();data.tweets[1].media=c.toDataURL();render();
    });
    await page.locator('#btnOut').click();
    await page.locator('#sheet.on').waitFor();
    const image = await page.locator('#out').evaluate(async im => {await im.decode(); return {w:im.naturalWidth,h:im.naturalHeight};});
    assert.equal(image.w,1206); assert.ok(image.h > 500);
    // Content must span the canvas rather than shrinking into its top-left third.
    const bounds = await page.locator('#out').evaluate(im => {
      const c=document.createElement('canvas');c.width=im.naturalWidth;c.height=im.naturalHeight;
      const ctx=c.getContext('2d');ctx.drawImage(im,0,0);
      const p=ctx.getImageData(0,0,c.width,c.height).data;
      let right=0,bottom=0;
      for(let y=0;y<c.height;y++) for(let x=0;x<c.width;x++) {
        const i=(y*c.width+x)*4;
        if(p[i]<180||p[i+1]<180||p[i+2]<180){right=Math.max(right,x);bottom=Math.max(bottom,y);}
      }
      return {right,bottom,width:c.width,height:c.height};
    });
    assert.ok(bounds.right > bounds.width*.85,JSON.stringify(bounds));
    assert.ok(bounds.bottom > bounds.height*.85,JSON.stringify(bounds));
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#sheet.on').count(),0);
    for (const width of [320,390,768,1440]) {
      await page.setViewportSize({width,height:900});
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),`overflow at ${width}`);
    }
    await page.setViewportSize({width:390,height:844});
    page.on('dialog', d => d.accept());
    await page.locator('#btnReset').click();
    assert.equal(await page.locator('#btnVf').getAttribute('aria-pressed'),'false');
    if (process.env.SCREENSHOT_PATH) {
      await page.screenshot({path:process.env.SCREENSHOT_PATH,fullPage:true});
      const png = await page.evaluate(async () => (await window.__export(3)).toDataURL().split(',')[1]);
      fs.writeFileSync(process.env.SCREENSHOT_PATH.replace('.png','-export.png'),Buffer.from(png,'base64'));
    }
    assert.deepEqual(errors,[]);
    console.log('PASS: time parsing, proportional growth, editing, random mode, persistence, PNG export, mobile layout and reset');
  } finally { await browser.close(); server.close(); }
})().catch(e => {console.error(e);process.exitCode=1;});
