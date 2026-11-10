const {chromium}=require('C:/Users/405/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
const browser=await chromium.launch({headless:true,channel:'msedge'}),page=await browser.newPage({viewport:{width:1500,height:700}});
await page.goto('http://127.0.0.1:8765/assets/');await page.setContent('<body style="margin:0"></body>');
console.log(JSON.stringify(await page.evaluate(async()=>{
 const T=await import('/vendor/three.module.js'),{createCharacterAvatar}=await import('/character-models.mjs');
 const renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(1500,700);document.body.append(renderer.domElement);renderer.setScissorTest(true);const result=[];
 for(let i=0;i<3;i++){
  const a=await createCharacterAvatar(i+9),scene=new T.Scene();a.resetPose();scene.background=new T.Color('#dfe4d7');scene.add(a.root);scene.add(new T.HemisphereLight(0xffffff,0x9aa18f,2));const light=new T.DirectionalLight(0xffffff,2.4);light.position.set(-3,5,6);scene.add(light);
  const cy=i===0?3.03:3.46,camera=new T.OrthographicCamera(-.48,.48,.67,-.67,.01,100);camera.position.set(0,cy,8);camera.lookAt(0,cy,0);
  for(let y=2.6;y<3.85;y+=.1){const line=new T.Line(new T.BufferGeometry().setFromPoints([new T.Vector3(-.45,y,.8),new T.Vector3(.45,y,.8)]),new T.LineBasicMaterial({color:0xd3956a,transparent:true,opacity:.4}));scene.add(line);}
  for(let x=-.4;x<.45;x+=.1){scene.add(new T.Line(new T.BufferGeometry().setFromPoints([new T.Vector3(x,cy-.65,.8),new T.Vector3(x,cy+.65,.8)]),new T.LineBasicMaterial({color:0xd3956a,transparent:true,opacity:.4})));}
  renderer.setViewport(i*500,0,500,700);renderer.setScissor(i*500,0,500,700);renderer.render(scene,camera);
  const ray=new T.Raycaster(new T.Vector3(0,i===0?2.72:3.35,4),new T.Vector3(0,0,-1));result.push({name:a.root.name,head:a.rest.Head.toArray(),hits:ray.intersectObjects(a.parts).slice(0,3).map(h=>h.point.toArray())});
 }return result;
})));await page.screenshot({path:'.modeling/mouth-calibration.png'});await browser.close();})();

