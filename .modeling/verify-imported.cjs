const {chromium}=require('C:/Users/405/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'}),page=await browser.newPage({viewport:{width:1500,height:1100}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8765/tests/imported-characters.html');await page.waitForFunction(()=>window.testResult,{timeout:120000});
 const result=await page.evaluate(()=>window.testResult);console.log(JSON.stringify(result));console.log(await page.locator('#result').textContent());if(!result.pass)throw new Error(result.error);
 await page.locator('#poses').screenshot({path:'.modeling/imported-poses.png'});
 await page.goto('http://127.0.0.1:8765/');await page.waitForFunction(()=>document.getElementById('status').textContent.includes('八位人物角色已就绪'),{timeout:120000});
 console.log('cards',await page.locator('#avatarOptions button').count());
 for(const [i,name] of ['动漫男孩','森林游侠','精灵女生'].entries()){
  await page.locator('#players button').nth(i).click();await page.locator('#avatarOptions button').filter({hasText:name}).click();
 }
 await page.screenshot({path:'v1.1-eight-characters-preview.png',fullPage:true});
 await page.locator('#preview3d').click();await page.waitForFunction(()=>document.getElementById('previewMessage').textContent.includes('八位人物与主页共用模型'),{timeout:60000});
 await page.locator('#previewAnimal').selectOption('10');await page.locator('#previewAuto').uncheck();await page.locator('#previewAction').selectOption('wave');
 await page.waitForTimeout(400);await page.locator('#previewDialog').screenshot({path:'.modeling/imported-preview-wave.png'});
 console.log('preview',await page.locator('#previewMessage').textContent());await page.locator('#closePreview').click();
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'.modeling/imported-mobile.png',fullPage:true});
 console.log('mobileOverflow',await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth));console.log('errors',JSON.stringify(errors));
 await browser.close();if(errors.length)process.exitCode=1;
})();
