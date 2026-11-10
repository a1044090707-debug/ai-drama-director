const {chromium}=require('C:/Users/405/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});const page=await browser.newPage({viewport:{width:1500,height:820}});
 page.on('pageerror',e=>console.log(e.message));await page.goto('http://127.0.0.1:8765/');
 await page.setContent('<body style="margin:0;background:#e7e9e4"><div id="labels" style="display:flex;justify-content:space-around;font:24px sans-serif"></div></body>');
 await page.evaluate(async()=>{
  const T=await import('/vendor/three.module.js');const {GLTFLoader}=await import('/vendor/GLTFLoader.js');
  const scene=new T.Scene();scene.background=new T.Color('#e7e9e4');const camera=new T.OrthographicCamera(-3.1,3.1,1.6,-1.6,.01,100);camera.position.set(0,0,8);
  const renderer=new T.WebGLRenderer({antialias:true});renderer.setSize(1500,780);renderer.outputColorSpace=T.SRGBColorSpace;document.body.append(renderer.domElement);
  scene.add(new T.HemisphereLight(0xffffff,0x9aa18f,2));const light=new T.DirectionalLight(0xffffff,2.4);light.position.set(-3,5,6);scene.add(light);
  for(const [i,id] of ['anime-boy-mascot','forest-ranger','elf-woman'].entries()){
   const gltf=await new GLTFLoader().loadAsync('/assets/imported-characters/'+id+'/'+id+'.glb');const object=gltf.scene;
   const box=new T.Box3().setFromObject(object),center=box.getCenter(new T.Vector3()),scale=2.6/(box.max.y-box.min.y);
   object.scale.setScalar(scale);object.position.copy(center).multiplyScalar(-scale);object.position.x+=(i-1)*2;scene.add(object);
   document.getElementById('labels').append(Object.assign(document.createElement('span'),{textContent:id}));
  }renderer.render(scene,camera);
 });await page.screenshot({path:'.modeling/imported-originals.png'});await browser.close();
})();
