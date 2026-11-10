const {chromium}=require('C:/Users/405/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'}),page=await browser.newPage({viewport:{width:1500,height:1100}});
 await page.goto('http://127.0.0.1:8765/assets/');await page.setContent('<body style="margin:0"></body>');
 await page.evaluate(async()=>{
  const T=await import('/vendor/three.module.js'),{GLTFLoader}=await import('/vendor/GLTFLoader.js');
  const scene=new T.Scene();scene.background=new T.Color('#dfe4d7');const camera=new T.OrthographicCamera(-3.1,3.1,2.3,-2.3,.01,100);camera.position.set(0,0,8);
  const renderer=new T.WebGLRenderer({antialias:true});renderer.setSize(1500,1100);renderer.outputColorSpace=T.SRGBColorSpace;document.body.append(renderer.domElement);
  scene.add(new T.HemisphereLight(0xffffff,0x9aa18f,2));const light=new T.DirectionalLight(0xffffff,2.4);light.position.set(-3,5,6);scene.add(light);
  for(const [row,id] of ['anime-boy-mascot','forest-ranger'].entries())for(let col=0;col<3;col++){
   const {scene:obj}=await new GLTFLoader().loadAsync('/assets/imported-characters/'+id+'/'+id+'.glb');const box=new T.Box3().setFromObject(obj),center=box.getCenter(new T.Vector3()),scale=2/(box.max.y-box.min.y);
   obj.scale.setScalar(scale);obj.position.copy(center).multiplyScalar(-scale);const group=new T.Group();group.add(obj);group.rotation.y=col*Math.PI/2;group.position.set((col-1)*2,1.12-row*2.24,0);scene.add(group);
  }renderer.render(scene,camera);
 });await page.screenshot({path:'.modeling/imported-sides.png'});await browser.close();
})();
