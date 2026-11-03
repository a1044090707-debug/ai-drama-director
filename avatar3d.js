import * as THREE from './vendor/three.module.js';

// All parts are closed 3D meshes. The muzzle, eyes, ears and back of the head
// remain visible when the root group rotates; no front-facing head sprite is used.
export function createAvatarRenderer(){
  const renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,premultipliedAlpha:true,preserveDrawingBuffer:true,powerPreference:'default'});
  renderer.setPixelRatio(1);renderer.setClearColor(0,0);renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.3;
  const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(0,1,1,0,.1,6000);
  camera.position.z=3000;
  scene.add(new THREE.HemisphereLight(0xfff5dc,0x7e846d,2.2));
  const key=new THREE.DirectionalLight(0xffefd9,3.4);key.position.set(-2,4,6);scene.add(key);
  const fill=new THREE.DirectionalLight(0xc4e2c0,1.1);fill.position.set(4,1,3);scene.add(fill);
  const rim=new THREE.DirectionalLight(0xffd19e,2);rim.position.set(0,3,-5);scene.add(rim);
  const sphere=new THREE.SphereGeometry(1,32,24),cache=new Map(),materials=new Map();
  const material=(color,gloss=false)=>{
    const id=color+gloss;if(!materials.has(id))materials.set(id,new THREE.MeshStandardMaterial({color,roughness:gloss ? .18 : .83,metalness:0}));return materials.get(id);
  };
  function ball(parent,color,x,y,z,sx,sy,sz,gloss=false){
    const mesh=new THREE.Mesh(sphere,material(color,gloss));mesh.position.set(x,y,z);mesh.scale.set(sx,sy,sz);parent.add(mesh);return mesh;
  }
  function line(parent,points,color,radius=.025){
    const path=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),geo=new THREE.TubeGeometry(path,20,radius,8,false);
    const mesh=new THREE.Mesh(geo,material(color));parent.add(mesh);return mesh;
  }
  function ear(parent,x,color,inner){
    const group=new THREE.Group();group.position.set(x,.58,-.04);group.rotation.z=-Math.sign(x)*.15;parent.add(group);
    const shape=new THREE.Shape();shape.moveTo(-.37,0);shape.quadraticCurveTo(-.32,.59,0,1.02);shape.quadraticCurveTo(.32,.59,.37,0);shape.closePath();
    const geometry=new THREE.ExtrudeGeometry(shape,{depth:.22,bevelEnabled:true,bevelThickness:.1,bevelSize:.1,bevelSegments:3,steps:1,curveSegments:12});
    const outer=new THREE.Mesh(geometry,material(color));group.add(outer);
    const insert=new THREE.Mesh(geometry,material(inner));insert.scale.set(.59,.7,.15);insert.position.set(0,.13,.31);group.add(insert);
  }
  function eye(parent,x,y,z,large=1){
    const group=new THREE.Group();group.position.set(x,y,z);parent.add(group);
    ball(group,'#fff9e9',0,0,0,.27*large,.34*large,.19*large,true);
    ball(group,'#58321d',0,-.01,.165*large,.155*large,.225*large,.085*large,true);
    ball(group,'#1e1a13',0,-.01,.235*large,.09*large,.15*large,.035*large,true);
    ball(group,'#ffffff',-.045*large,.075*large,.265*large,.041*large,.056*large,.022*large,true);
    return group;
  }
  function build(type){
    const root=new THREE.Group(),face=new THREE.Group();root.add(face);
    const eyeGroups=[],parts={face,eyes:eyeGroups};
    if(type===0){
      ball(face,'#eaa052',0,0,0,1,1.03,.98);ear(face,-.72,'#d68c43','#dfaa91');ear(face,.72,'#d68c43','#dfaa91');
      ball(face,'#fff1d5',-.48,-.33,.68,.56,.43,.37);ball(face,'#fff1d5',.48,-.33,.68,.56,.43,.37);
      ball(face,'#fff0d5',0,-.68,.42,.66,.33,.43);ball(face,'#f6dfb8',0,-.26,1,.35,.23,.32);
      ball(face,'#3c2c21',0,-.1,1.27,.18,.12,.12,true);
      eyeGroups.push(eye(face,-.41,.24,.81),eye(face,.41,.24,.81));
      line(face,[[-.41,-.52,1.02],[-.2,-.61,1.1],[0,-.47,1.18],[.2,-.61,1.1],[.41,-.52,1.02]],'#664326',.024);
      for(const side of [-1,1]){const brow=ball(face,'#86512e',side*.43,.64,.79,.24,.055,.055);brow.rotation.z=-side*.15;}
    }else if(type===1){
      ball(face,'#f6ecd9',0,-.06,0,.94,.96,.95);
      for(const side of [-1,1]){
        const outer=ball(face,'#f4e8d5',side*.46,1.18,-.1,.26,.94,.3);outer.rotation.z=-side*.13;
        const inner=ball(face,'#e5afa1',side*.46,1.22,.14,.145,.68,.09);inner.rotation.z=-side*.13;
        ball(face,'#eab7a4',side*.66,-.24,.74,.22,.13,.08);
      }
      eyeGroups.push(eye(face,-.36,.19,.81),eye(face,.36,.19,.81));
      ball(face,'#fff5e4',-.22,-.4,.89,.3,.23,.2);ball(face,'#fff5e4',.22,-.4,.89,.3,.23,.2);ball(face,'#ce8e83',0,-.25,1.09,.13,.09,.09,true);
      line(face,[[-.3,-.5,1.04],[-.15,-.58,1.08],[0,-.47,1.1],[.15,-.58,1.08],[.3,-.5,1.04]],'#977263',.022);
    }else if(type===2){
      ball(face,'#b98b5b',0,0,0,1,1.01,.98);
      for(const side of [-1,1]){ball(face,'#b98b5b',side*.78,.83,-.08,.36,.39,.26);ball(face,'#805b3d',side*.78,.84,.15,.21,.24,.06);ball(face,'#d6a183',side*.68,-.23,.72,.2,.12,.07);}
      eyeGroups.push(eye(face,-.37,.22,.85,.91),eye(face,.37,.22,.85,.91));
      ball(face,'#ecd5af',0,-.36,.84,.61,.42,.36);ball(face,'#503a28',0,-.15,1.16,.23,.15,.12,true);
      line(face,[[-.34,-.54,1.08],[-.17,-.64,1.14],[0,-.51,1.19],[.17,-.64,1.14],[.34,-.54,1.08]],'#775134',.028);
    }else{
      ball(face,'#a9c36d',0,-.1,0,1.12,.83,1);
      ball(face,'#e6dfaf',0,-.49,.66,.92,.43,.38);
      for(const side of [-1,1]){ball(face,'#a9c36d',side*.6,.6,.16,.43,.49,.54);eyeGroups.push(eye(face,side*.6,.64,.62,1.14));ball(face,'#cfaa82',side*.76,-.21,.77,.2,.11,.065);}
      ball(face,'#674132',0,-.31,1,.62,.24,.1);ball(face,'#d78a78',0,-.43,1.08,.36,.09,.04);
      ball(face,'#657b42',-.22,.05,1,.027,.035,.03);ball(face,'#657b42',.22,.05,1,.027,.035,.03);
    }
    // A small mouth opening and lower lip also react to MediaPipe's jawOpen score.
    const jaw=new THREE.Group();jaw.position.set(0,-.57,type===3?1.08:1.02);face.add(jaw);
    ball(jaw,'#624033',0,0,0,type===3?.38:.18,.07,.055);ball(jaw,'#e6a090',0,-.025,.045,type===3?.25:.1,.035,.025);
    parts.jaw=jaw;root.userData=parts;return root;
  }
  const target=new THREE.Quaternion(),matrix=new THREE.Matrix4(),euler=new THREE.Euler(0,0,0,'YXZ'),translation=new THREE.Vector3(),scale=new THREE.Vector3();
  let lastWidth=0,lastHeight=0,lost=false;
  renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();lost=true;});
  function draw(items,width,height,now=performance.now()){
    if(lost)throw new Error('3D 图形上下文已丢失');
    if(width!==lastWidth||height!==lastHeight){renderer.setSize(width,height,false);camera.right=width;camera.top=height;camera.updateProjectionMatrix();lastWidth=width;lastHeight=height;}
    const used=new Set();
    for(const item of items){
      const id=String(item.id),type=item.avatar%4;let model=cache.get(id);
      if(model&&model.userData.type!==type){scene.remove(model);disposeModel(model);cache.delete(id);model=null;}
      if(!model){model=build(type);Object.assign(model.userData,{type,time:now,initialized:false});cache.set(id,model);scene.add(model);}
      used.add(id);model.visible=true;
      const o=item.observation||item,sx=Math.max(o.rx*width,o.ry*height*.72)*1.5,sy=o.ry*height*1.45;
      model.position.set(o.x*width,height-o.y*height,0);model.scale.set(sx,sy,Math.sqrt(sx*sy));
      const rotation=o.rotation||{};
      if(rotation.matrix){matrix.fromArray(rotation.matrix);matrix.decompose(translation,target,scale);target.normalize();euler.setFromQuaternion(target,'YXZ');}
      else euler.set(rotation.pitch||0,rotation.yaw||0,rotation.roll||0,'YXZ');
      euler.x=THREE.MathUtils.clamp(euler.x,-.9,.9);euler.y=THREE.MathUtils.clamp(euler.y,-1.4,1.4);euler.z=THREE.MathUtils.clamp(euler.z,-1,1);target.setFromEuler(euler);
      const dt=Math.min(250,Math.max(0,now-model.userData.time));
      if(!model.userData.initialized||item.snap)model.quaternion.copy(target);else model.quaternion.slerp(target,1-Math.exp(-dt/65));
      model.userData.initialized=true;model.userData.time=now;
      const expression=o.expression||{};
      model.userData.jaw.scale.y=1+Math.min(expression.jaw||0,1)*4;
      model.userData.jaw.position.y=-.57-Math.min(expression.jaw||0,1)*.1;
      model.userData.eyes.forEach((eye,i)=>{eye.scale.y=1-.85*Math.min(i?expression.blinkRight||0:expression.blinkLeft||0,1);});
    }
    for(const [id,model] of cache){if(!used.has(id)){scene.remove(model);disposeModel(model);cache.delete(id);}}
    renderer.render(scene,camera);return renderer.domElement;
  }
  function disposeModel(model){model.traverse(node=>{if(node.isMesh&&node.geometry!==sphere)node.geometry.dispose();});}
  return {draw,get stats(){return {heads:cache.size,meshes:renderer.info.render.calls,triangles:renderer.info.render.triangles};},dispose(){cache.forEach(disposeModel);sphere.dispose();materials.forEach(m=>m.dispose());renderer.dispose();renderer.forceContextLoss();}};
}
