const {chromium}=require('C:/Users/405/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'}),page=await browser.newPage({viewport:{width:1500,height:1100}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 for(const mode of ['landscape','portrait']){
  await page.goto('http://127.0.0.1:8765/tests/camera-integration.html?cast=imported&mode='+mode);
  const frame=page.frameLocator('#app');await frame.locator('#status').filter({hasText:'八位人物角色已就绪'}).waitFor({timeout:120000});
  await frame.locator('#soundEnabled').uncheck();await frame.locator('#start').click();
  await frame.locator('#playerCount').filter({hasText:(mode==='landscape'?'4':'1')+' / 4 人入镜'}).waitFor({timeout:30000});
  if(mode==='landscape'){
   await frame.locator('#players button').nth(3).click();await frame.locator('#avatarOptions button').filter({hasText:'动漫男孩'}).click();
  }
  const app=page.frames().find(f=>f.parentFrame());await page.waitForTimeout(600);
  const state=await app.evaluate(()=>({avatars:tracks.map(t=>t.avatar),count:tracks.filter(t=>t.visible).length,canvas:[canvas.width,canvas.height],rendered:avatar3D?.stats,performing,logs:document.getElementById('logs').textContent}));
  console.log(mode,JSON.stringify(state));if(!state.performing||state.count!==(mode==='landscape'?4:1)||state.rendered.heads!==state.count)throw new Error('Synthetic camera integration failed');
  await frame.locator('#canvas').screenshot({path:'v1.1-'+mode+'-camera-test.png'});await frame.locator('#stop').click();
 }
 await page.goto('http://127.0.0.1:8765/people-preview.html');await page.locator('#status').filter({hasText:'八款均由主页使用的实际 GLB 模型直接渲染'}).waitFor({timeout:60000});
 await page.locator('#people').screenshot({path:'.modeling/eight-people.png'});console.log('people preview PASS');console.log('errors',JSON.stringify(errors));await browser.close();if(errors.length)process.exitCode=1;
})();
