// Start npm start after building. Supply BROWSER_CHANNEL=msedge to use an installed Edge.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const browser = await chromium.launch({channel:process.env.BROWSER_CHANNEL||undefined});
const base=process.env.TEST_URL||'http://127.0.0.1:4173';
const pages=[];
async function page(mobile=false){
  const p=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1440,height:900}});
  pages.push(p);p.setDefaultTimeout(12000);p.on('pageerror',e=>console.error('Browser error',e.message));
  return p;
}
try{
  const map=await page();await map.goto(base);await map.locator('#g2').selectOption('C');
  assert.equal(await map.locator('#score').textContent(),'90');await map.locator('#compare').click();
  assert.equal(await map.locator('#score').textContent(),'62');
  const from=await map.locator('[data-point=B]').boundingBox(), to=await map.locator('[data-point=C]').boundingBox();
  await map.mouse.move(from.x+from.width/2,from.y+from.height/2);await map.mouse.down();
  await map.mouse.move(to.x+to.width/2,to.y+to.height/2,{steps:8});await map.mouse.up();
  assert.equal(await map.locator('#score').textContent(),'90');
  await map.locator('#inspect').click();await map.waitForFunction(()=>document.querySelector('#checks').textContent.includes('verified'));
  await map.locator('#omit').click();await map.waitForFunction(()=>document.querySelector('#checks').textContent.includes('Missing contribution'));
  const host=await page();await host.goto(base+'/room.html');await host.locator('#begin').click();await host.waitForSelector('#join:visible');
  const link=await host.locator('#join').getAttribute('href'),guests=[];
  for(let i=0;i<3;i++){
    const guest=await page(true);guests.push(guest);await guest.goto(link);await guest.locator('#begin').click();
    await guest.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Joined.'));
  }
  await host.locator('#lock').click();
  for(const g of guests)await g.locator('#accept').click();
  for(const [i,g] of guests.entries()){
    await g.getByRole('checkbox',{name:['A','C','D'][i],exact:true}).check();await g.locator('#submit').click();
  }
  for(const p of [host,...guests]){await p.waitForSelector('#download:visible');assert.match(await p.locator('#status').textContent(),/A \+ B reached 1; A \+ C reached 2/);}
  console.log('Passed planner, drag, evidence, and three-browser room on one computer.');
} catch(e) {
  for(const p of pages)console.error(p.url(),await p.locator('#status').allTextContents());
  throw e;
} finally {await browser.close();}
