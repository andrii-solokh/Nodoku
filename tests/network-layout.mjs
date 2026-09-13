import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';
import { Puzzle } from '../src/puzzle.ts';

const url = process.env.TEST_URL || 'http://127.0.0.1:4173';
const out = 'output/web-game/network-layout';
await fs.mkdir(out, { recursive: true });
const flat = new Puzzle({size: 3, depth: 1, difficulty: 'hard', seed: 517});
for (const edge of [[0,1],[0,3],[1,2],[1,4],[2,5],[3,4],[5,8],[6,7]]) flat.toggle(...edge);
const cube = new Puzzle({size: 3, depth: 3, difficulty: 'hard', seed: 0});
const removed = new Set(['6:7', '15:16']);
for (const edge of cube.solution.filter(edge => !removed.has([...edge].sort((a,b) => a-b).join(':'))).concat([[6,15],[7,16]])) cube.toggle(...edge);
assert.ok(flat.disconnected && cube.disconnected);
const browser = await chromium.launch();
const errors = [];
const state = page => page.evaluate(() => JSON.parse(window.render_game_to_text()));
async function settle(page) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}
async function geometry(page) {
  return page.evaluate(() => ({
    bounds: ['.game-main', '#game-stage', '#game-stage canvas', '.puzzle-melody', '.game-toolbar'].map(selector => {
      const {x,y,width,height} = document.querySelector(selector).getBoundingClientRect();
      return {selector,x,y,width,height};
    }),
    camera: JSON.parse(window.render_game_to_text()).view,
    canvas: {width:document.querySelector('#game-stage canvas').width, height:document.querySelector('#game-stage canvas').height},
    scroll: {x:scrollX,y:scrollY},
  }));
}
try {
  for (const [name, puzzle] of [['flat',flat], ['cube',cube]]) {
    const page = await browser.newPage({viewport:{width:1440,height:900}});
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/**', route => route.fulfill({json:{}}));
    await page.addInitScript(game => localStorage.setItem('nodoku.astra.v1', JSON.stringify({screen:'playing',settings:game.settings,game,sound:false})),puzzle.serialize());
    await page.goto(url, {waitUntil:'domcontentloaded'});
    await page.locator('#network-status').waitFor();
    await page.locator('#app-loader').waitFor({state:'hidden'});
    for (const [width,height] of [[1440,900],[1200,850],[900,1200],[390,844],[320,568],[844,390]]) {
      const label = `${name}-${width}x${height}`;
      await page.setViewportSize({width,height});
      await settle(page);
      const before = await geometry(page);
      assert.equal((await state(page)).disconnected,true);
      await page.locator('#undo-button').click();
      await settle(page);
      assert.equal(await page.locator('#network-status').isHidden(),true);
      assert.deepEqual(await geometry(page),before,`${label}: undo hides the message without moving/resizing the board or camera`);
      await page.locator('#redo-button').click();
      await settle(page);
      assert.equal(await page.locator('#network-status').isVisible(),true);
      assert.deepEqual(await geometry(page),before,`${label}: redo shows the message without moving/resizing the board or camera`);
      const originalText = await page.locator('#network-group-detail').textContent();
      await page.locator('#network-group-detail').evaluate(el => {el.textContent='Highlighted group 100 · 125 nodes';});
      await settle(page);
      assert.deepEqual(await geometry(page),before,`${label}: longer message content cannot change the board geometry`);
      await page.locator('#network-group-detail').evaluate((el,text) => {el.textContent=text;},originalText);
      await page.locator('#network-group-button').click({trial:true});
      const boxes = await page.evaluate(() => {
        const rect = el => {const {x,y,width,height}=el.getBoundingClientRect();return {x,y,width,height};};
        return {notice:rect(document.querySelector('#network-status')),buttons:[...document.querySelectorAll('.game-toolbar button')].map(rect).filter(r=>r.width&&r.height),overflow:document.documentElement.scrollWidth>innerWidth};
      });
      assert.equal(boxes.overflow,false,`${label}: no horizontal scrolling`);
      const n=boxes.notice;
      assert.ok(n.x>=0&&n.x+n.width<=width&&n.y>=0&&n.y+n.height<=height,`${label}: notice fits on screen`);
      assert.ok(boxes.buttons.every(b=>!(b.x<n.x+n.width&&b.x+b.width>n.x&&b.y<n.y+n.height&&b.y+b.height>n.y)),`${label}: controls remain clear of the notice`);
      const current=await state(page);
      const bottom=Math.max(...current.nodes.map(node=>node.screen.y+node.screen.radius));
      assert.ok(bottom <= n.y+1,`${label}: notice stays below the visible puzzle (${bottom} > ${n.y})`);
      await page.screenshot({path:`${out}/${label}.png`});
      console.log(`Passed ${label}`);
    }
    await page.close();
  }
  assert.deepEqual(errors,[]);
  console.log('Passed: notice visibility, undo/redo and content changes preserve board/camera geometry across flat/cube, desktop, tablet, phone and landscape.');
} finally {await browser.close();}
