const {chromium}=require('C:/Users/405/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'}),page=await browser.newPage({viewport:{width:1500,height:1100}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:8765/tests/nine-actions.html');await page.waitForFunction(()=>window.testResult,{timeout:120000});
 const result=await page.evaluate(()=>window.testResult);console.log(JSON.stringify({...result,details:result.pass?undefined:result.details?.slice(-1)}));console.log((await page.locator('#result').textContent()).split('\n').slice(-5).join('\n'));
 await page.locator('#mouths').screenshot({path:'.modeling/nine-mouths.png'});console.log('errors',JSON.stringify(errors));await browser.close();if(!result.pass||errors.length)process.exitCode=1;
})();
