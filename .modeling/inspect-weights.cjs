const {chromium}=require('C:/Users/405/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'}),page=await browser.newPage({viewport:{width:1500,height:850}});
 await page.goto('http://127.0.0.1:8765/assets/');await page.setContent('<body style="margin:0"></body>');
 console.log(await page.evaluate(async()=>{
  const T=await import('/vendor/three.module.js'),{createCharacterAvatar}=await import('/character-models.mjs');
  const scene=new T.Scene();scene.background=new T.Color('#dfe4d7');const camera=new T.OrthographicCamera(-3.5,3.5,2,-2,.01,100);camera.position.set(0,0,8);
  const renderer=new T.WebGLRenderer({antialias:true});renderer.setSize(1500,850);document.body.append(renderer.domElement);const summary=[];
  for(let col=0;col<3;col++){
   const a=await createCharacterAvatar(10);a.resetPose();a.root.position.set((col-1)*2.3,-1.9,0);a.root.rotation.y=col*Math.PI/2;scene.add(a.root);
   for(const mesh of a.parts){const {position:p,skinIndex:ids,skinWeight:w}=mesh.geometry.attributes;const colors=new Float32Array(p.count*3),counts={};
    for(let i=0;i<p.count;i++){let arm=0;for(let j=0;j<4;j++){const name=mesh.skeleton.bones[ids.array[i*4+j]].name;counts[name]=(counts[name]||0)+w.array[i*4+j];if(/Arm|Hand/.test(name))arm+=w.array[i*4+j];}
     colors.set([.2+arm*.8,.3*(1-arm),.4*(1-arm)],i*3);
    }
    const g=mesh.geometry.clone();g.setAttribute('color',new T.Float32BufferAttribute(colors,3));mesh.geometry=g;mesh.material=new T.MeshBasicMaterial({vertexColors:true,side:T.DoubleSide});if(col===0)summary.push(counts);
   }
  }renderer.render(scene,camera);return summary;
 }));await page.screenshot({path:'.modeling/imported-weights.png'});await browser.close();
})();

