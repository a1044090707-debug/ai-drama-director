const {chromium}=require('C:/Users/405/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'}),page=await browser.newPage({viewport:{width:1500,height:1100}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:8765/tests/nine-actions-camera.html');
 const ui=page.frameLocator('#app');await ui.locator('#status').filter({hasText:'八位人物角色已就绪'}).waitFor({timeout:120000});await ui.locator('#soundEnabled').uncheck();await ui.locator('#start').click();await ui.locator('#playerCount').filter({hasText:'1 / 4 人入镜'}).waitFor({timeout:30000}).catch(async e=>{console.log('startup',await ui.locator('#logs').textContent());throw e;});
 const app=page.frames().find(f=>f.parentFrame());
 for(const [action,name] of [['forehead','扶额'],['head','双手抱头'],['turn','转头'],['raise','单手举高'],['handsup','双手举高'],['wave','挥手'],['arms','展开双臂'],['tilt','歪头'],['mouth','张嘴']]){
  await app.evaluate(action=>window.setFixtureAction(action),action);
  await app.waitForFunction(name=>document.querySelector('#history li b')?.textContent.includes('/ '+name),name,{timeout:10000}).catch(async e=>{console.log('failure state',await app.evaluate(()=>({actions:tracks.map(t=>[t.action,t.stable,t.armed]),history:document.getElementById('history').textContent,logs:document.getElementById('logs').textContent})));throw e;});
  console.log('PASS camera -> classification -> caption -> avatar:',action);
 }
 await ui.locator('#canvas').screenshot({path:'.modeling/nine-camera-mouth.png'});await ui.locator('#stop').click();
 await page.goto('http://127.0.0.1:8765/');await page.locator('#status').filter({hasText:'八位人物角色已就绪'}).waitFor({timeout:60000});await page.locator('#preview3d').click();
 await page.waitForFunction(()=>document.getElementById('previewMessage').textContent.includes('八位人物与主页共用模型'),{timeout:60000});await page.locator('#previewAnimal').selectOption('9');await page.locator('#previewAuto').uncheck();await page.locator('#previewAction').selectOption('head');await page.waitForTimeout(500);
 await page.locator('#previewDialog').screenshot({path:'.modeling/nine-preview-head.png'});await page.locator('#previewAction').selectOption('mouth');await page.waitForTimeout(500);await page.locator('#previewDialog').screenshot({path:'.modeling/nine-preview-mouth.png'});
 console.log('preview options',await page.locator('#previewAction option').allTextContents());console.log('errors',JSON.stringify(errors));await browser.close();if(errors.length)process.exitCode=1;
})();
