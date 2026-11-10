import * as T from './vendor/three.module.js';
import {GLTFLoader} from './vendor/GLTFLoader.js';
import {addJawMorph,createMouthInterior} from './jaw-morph.mjs';

// The supplied GLBs are static scans. These landmarks and smooth skin weights
// provide body articulation; the source files and their textures stay intact.
const profiles={
  'anime-boy-mascot':{head:2.63,neck:2.55,chest:2.29,spine:1.94,hip:1.42,hipX:.23,knee:.76,ankle:.18,shoulder:[.34,2.46,-.10],elbow:[.65,1.99,-.15],wrist:[.93,1.52,-.22],hand:[1.04,1.36,-.24],bodyWidth:.32},
  'forest-ranger':{head:3.26,neck:3.14,chest:2.82,spine:2.36,hip:1.88,hipX:.25,knee:.98,ankle:.20,shoulder:[.36,3.03,0],elbow:[.50,2.40,.03],wrist:[.61,1.92,.08],hand:[.62,1.73,.10],bodyWidth:.32,sourceYaw:-.42,armDepth:[-.23,-.16]},
  'elf-woman':{head:3.28,neck:3.15,chest:2.86,spine:2.38,hip:1.91,hipX:.24,knee:1.02,ankle:.19,shoulder:[.29,3.04,0],elbow:[.52,2.53,0],wrist:[.76,2.05,.015],hand:[.84,1.87,.025],bodyWidth:.30,softArms:true}
};
const templates=new Map(),loader=new GLTFLoader(),v=(x,y,z=0)=>new T.Vector3(x,y,z);
const mouths={
  'anime-boy-mascot':{x:0,y:2.72,width:.055,drop:.065,front:.22},
  'forest-ranger':{x:-.105,y:3.353,width:.05,drop:.060,front:.20},
  'elf-woman':{x:.005,y:3.375,width:.047,drop:.060,front:.28}
};
const smooth=(a,b,x)=>T.MathUtils.smoothstep(x,a,b);

function buildTemplate(source,profile,mouth){
  const content=new T.Group(),bones={},boneList=[],rest={},segments=[];
  function bone(name,parent,position){
    const joint=new T.Bone();joint.name=name;rest[name]=position.clone();
    joint.position.copy(position).sub(parent?rest[parent]:v(0,0));
    (parent?bones[parent]:content).add(joint);bones[name]=joint;boneList.push(joint);
  }
  bone('Root',null,v(0,0));bone('Hips','Root',v(0,profile.hip));
  bone('Spine','Hips',v(0,profile.spine));bone('Chest','Spine',v(0,profile.chest));
  bone('Neck','Chest',v(0,profile.neck));bone('Head','Neck',v(0,profile.head));
  for(const [side,sign] of [['Left',1],['Right',-1]]){
    const signed=values=>v(sign*values[0],values[1],values[2]);
    bone(side+'UpperArm','Chest',signed(profile.shoulder));
    bone(side+'ForeArm',side+'UpperArm',signed(profile.elbow));
    bone(side+'Hand',side+'ForeArm',signed(profile.wrist));
    bone(side+'UpperLeg','Hips',v(sign*profile.hipX,profile.hip));
    bone(side+'LowerLeg',side+'UpperLeg',v(sign*profile.hipX,profile.knee));
    bone(side+'Foot',side+'LowerLeg',v(sign*profile.hipX,profile.ankle));
    bone(side+'Toe',side+'Foot',v(sign*profile.hipX,.09,.20));
  }
  const index=Object.fromEntries(boneList.map((b,i)=>[b.name,i]));
  function segment(name,end,group){segments.push({name,index:index[name],start:rest[name],end:typeof end==='string'?rest[end]:end,group});}
  segment('Hips','Spine','body');segment('Spine','Chest','body');segment('Chest','Neck','body');
  for(const [side,sign] of [['Left',1],['Right',-1]]){
    segment(side+'UpperArm',side+'ForeArm',side+'Arm');segment(side+'ForeArm',side+'Hand',side+'Arm');
    segment(side+'Hand',v(sign*profile.hand[0],profile.hand[1],profile.hand[2]),side+'Arm');
    segment(side+'UpperLeg',side+'LowerLeg',side+'Leg');segment(side+'LowerLeg',side+'Foot',side+'Leg');
    segment(side+'Foot',side+'Toe',side+'Leg');segment(side+'Toe',v(sign*profile.hipX,.08,.32),side+'Leg');
  }
  source.rotation.y+=profile.sourceYaw||0;source.updateMatrixWorld(true);
  const box=new T.Box3().setFromObject(source),center=box.getCenter(v(0,0)),scale=3.8/(box.max.y-box.min.y);
  const normalize=new T.Matrix4().makeScale(scale,scale,scale);
  normalize.setPosition(-center.x*scale,-box.min.y*scale,-center.z*scale);
  const point=v(0,0),delta=v(0,0),offset=v(0,0);
  function distance(segment){
    delta.copy(segment.end).sub(segment.start);offset.copy(point).sub(segment.start);
    const t=T.MathUtils.clamp(offset.dot(delta)/delta.lengthSq(),0,1);
    return offset.addScaledVector(delta,-t).lengthSq();
  }
  function armRegion(){
    const x=Math.abs(point.x),y=point.y;
    const armX=T.MathUtils.lerp(profile.wrist[0],profile.shoulder[0],T.MathUtils.clamp((y-profile.wrist[1])/(profile.shoulder[1]-profile.wrist[1]),0,1));
    const boundary=(profile.bodyWidth+armX)*.5;
    let arm=(profile.softArms?smooth(Math.min(profile.bodyWidth,armX-.10),Math.max(profile.bodyWidth+.09,armX-.015),x):smooth(boundary-.045,boundary+.045,x))
      *(1-smooth(profile.shoulder[1]+.03,profile.neck+.05,y))*smooth(profile.hand[1]-.20,profile.hand[1]-.03,y)
      *(profile.armDepth?smooth(...profile.armDepth,point.z):1);
    // The static scans fuse gloves/sleeves to rear accessories. Below the
    // shoulder these surfaces must separate, rather than stretch as a sheet.
    if(profile.armDepth&&y<profile.shoulder[1]-.25)arm=arm>.5?1:0;
    return arm;
  }
  function weights(){
    const side=point.x>=0?'Left':'Right',y=point.y;
    const head=smooth(profile.neck-.02,profile.head+.05,y);
    if(head>.999)return [[index.Head,1]];
    // Gate the limbs by anatomical region so hands beside a hip do not pull
    // the belt along, and the two trouser legs have independent influences.
    const arm=armRegion();
    const leg=(1-smooth(profile.hip-.18,profile.hip+.08,y))*(1-arm);
    const scored=segments.map(s=>{
      const gate=s.group===side+'Arm'?arm:s.group===side+'Leg'?leg:s.group==='body'?(1-arm)*(1-leg):0;
      return [s.index,gate/Math.pow(distance(s)+.015,2.5)];
    }).filter(([,weight])=>weight>0).sort((a,b)=>b[1]-a[1]).slice(0,head>0?3:4);
    const sum=scored.reduce((n,s)=>n+s[1],0)||1;
    for(const score of scored)score[1]=score[1]/sum*(1-head);
    if(head>0)scored.push([index.Head,head]);
    return scored;
  }
  const skeleton=new T.Skeleton(boneList);content.updateMatrixWorld(true);skeleton.calculateInverses();
  source.traverse(object=>{
    if(!object.isMesh)return;
    const geometry=object.geometry.clone();geometry.applyMatrix4(new T.Matrix4().multiplyMatrices(normalize,object.matrixWorld));
    addJawMorph(geometry,mouth);
    const positions=geometry.attributes.position,ids=new Uint16Array(positions.count*4),influences=new Float32Array(positions.count*4),regions=new Uint8Array(positions.count);
    for(let i=0;i<positions.count;i++){
      point.fromBufferAttribute(positions,i);
      weights().forEach(([joint,weight],j)=>{ids[i*4+j]=joint;influences[i*4+j]=weight;});
      regions[i]=point.y<profile.shoulder[1]-.25&&armRegion()>.5?(point.x>0?1:2):0;
    }
    if(profile.armDepth){
      const sourceIndex=geometry.index,triangles=[];
      for(let i=0;i<(sourceIndex?.count||positions.count);i+=3){
        const a=sourceIndex?sourceIndex.getX(i):i,b=sourceIndex?sourceIndex.getX(i+1):i+1,c=sourceIndex?sourceIndex.getX(i+2):i+2;
        const below=Math.max(positions.getY(a),positions.getY(b),positions.getY(c))<profile.shoulder[1]-.25;
        if(below&&(regions[a]!==regions[b]||regions[b]!==regions[c]))continue;
        triangles.push(a,b,c);
      }
      geometry.setIndex(triangles);
    }
    geometry.setAttribute('skinIndex',new T.Uint16BufferAttribute(ids,4));geometry.setAttribute('skinWeight',new T.Float32BufferAttribute(influences,4));
    const mesh=new T.SkinnedMesh(geometry,object.material);mesh.name=object.name;mesh.frustumCulled=false;
    content.add(mesh);mesh.bind(skeleton,new T.Matrix4());
  });
  content.add(createMouthInterior(content.children.filter(o=>o.isMesh).map(o=>o.geometry),mouth,skeleton,index.Head));
  return content;
}

function cloneTemplate(source){
  const content=source.clone(true),lookup=new Map();
  function pairs(a,b){lookup.set(a,b);a.children.forEach((child,i)=>pairs(child,b.children[i]));}pairs(source,content);
  const skeletons=new Map();
  source.traverse(a=>{if(!a.isSkinnedMesh)return;const b=lookup.get(a);
    if(!skeletons.has(a.skeleton))skeletons.set(a.skeleton,new T.Skeleton(a.skeleton.bones.map(bone=>lookup.get(bone)),a.skeleton.boneInverses.map(m=>m.clone())));
    b.bind(skeletons.get(a.skeleton),a.bindMatrix);
  });return content;
}

export async function createImportedAvatar({assetUrl,name}){
  const url=String(assetUrl),profile=profiles[name];if(!profile)throw new Error('缺少人物骨骼配置：'+name);
  if(!templates.has(url))templates.set(url,loader.loadAsync(url).then(gltf=>buildTemplate(gltf.scene,profile,mouths[name])).catch(error=>{templates.delete(url);throw error;}));
  const content=cloneTemplate(await templates.get(url)),root=new T.Group();root.name=name;root.add(content);root.updateMatrixWorld(true);
  const bones={},boneList=[],rest={},restWorldQuaternions={},restLocal={},parts=[],materials={};
  root.traverse(object=>{
    if(object.isBone){bones[object.name]=object;boneList.push(object);rest[object.name]=object.getWorldPosition(v(0,0));restWorldQuaternions[object.name]=object.getWorldQuaternion(new T.Quaternion());restLocal[object.name]={position:object.position.clone(),quaternion:object.quaternion.clone()};}
    if(object.isMesh){parts.push(object);for(const material of Array.isArray(object.material)?object.material:[object.material])materials[material.name]=material;}
  });
  const soles=[];
  for(const mesh of parts){const positions=mesh.geometry.attributes.position,ids=[];
    for(let i=0;i<positions.count;i++)if(positions.getY(i)<.10)ids.push(i);
    const step=Math.max(1,Math.floor(ids.length/96));for(let i=0;i<ids.length;i+=step)soles.push({mesh,index:ids[i]});
  }
  function resetPose(){for(const joint of boneList){joint.position.copy(restLocal[joint.name].position);joint.quaternion.copy(restLocal[joint.name].quaternion);}root.position.y=0;root.updateMatrixWorld(true);}
  function worldOrientation(name,q){const joint=bones[name];joint.quaternion.copy(joint.parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(q));joint.updateMatrixWorld(true);}
  function direction(name,child,desired){worldOrientation(name,new T.Quaternion().setFromUnitVectors(rest[child].clone().sub(rest[name]).normalize(),desired.normalize()));}
  function ground(){root.updateMatrixWorld(true);for(const skeleton of new Set(parts.map(mesh=>mesh.skeleton)))skeleton.update();let min=Infinity;const point=v(0,0);
    for(const {mesh,index} of soles){mesh.getVertexPosition(index,point);mesh.localToWorld(point);min=Math.min(min,point.y);}if(Number.isFinite(min))root.position.y-=min;root.updateMatrixWorld(true);return min;}
  function demo(action,time=0,amount=1){
    resetPose();
    for(const [side,sign] of [['Left',1],['Right',-1]]){
      direction(side+'UpperArm',side+'ForeArm',v(sign*.13,-1));direction(side+'ForeArm',side+'Hand',v(sign*.10,-1));
      worldOrientation(side+'Hand',bones[side+'ForeArm'].getWorldQuaternion(new T.Quaternion()));
    }
    if(action==='arms')for(const [side,sign] of [['Left',1],['Right',-1]]){
      direction(side+'UpperArm',side+'ForeArm',v(sign,-.05));direction(side+'ForeArm',side+'Hand',v(sign,-.05));worldOrientation(side+'Hand',bones[side+'ForeArm'].getWorldQuaternion(new T.Quaternion()));
    }
    if(action==='wave'){
      direction('LeftUpperArm','LeftForeArm',v(.8,.40));direction('LeftForeArm','LeftHand',v(Math.sin(time*4.2)*.35,1));
      worldOrientation('LeftHand',bones.LeftForeArm.getWorldQuaternion(new T.Quaternion()));
    }
    const rotate=(joint,angle)=>worldOrientation(joint,new T.Quaternion().setFromAxisAngle(v(1,0),angle));
    if(action==='squat'){for(const side of ['Left','Right']){rotate(side+'UpperLeg',-.65*amount);rotate(side+'LowerLeg',.65*amount);rotate(side+'Foot',0);rotate(side+'Toe',0);}rotate('Chest',.14*amount);}
    if(action==='step'){rotate('LeftUpperLeg',-.68*amount);rotate('LeftLowerLeg',.35*amount);rotate('LeftFoot',.12*amount);rotate('LeftToe',.12*amount);}
    ground();
  }
  demo('stand');const neutralWorldQuaternions=Object.fromEntries(boneList.map(joint=>[joint.name,joint.getWorldQuaternion(new T.Quaternion())]));resetPose();
  const morphMeshes=parts.filter(mesh=>mesh.morphTargetDictionary?.jawOpen!==undefined);
  function expression(values={}){for(const mesh of morphMeshes)mesh.morphTargetInfluences[mesh.morphTargetDictionary.jawOpen]=T.MathUtils.clamp(values.jawOpen||0,0,1);}
  return {root,content,bones,boneList,rest,restWorldQuaternions,neutralWorldQuaternions,parts,materials,morphMeshes,skeleton:parts[0].skeleton,
    capabilities:{body:true,head:true,face:true,jawOpen:true,eyeBlink:false},expression,resetPose,ground,demo,
    stats(){return {bones:boneList.length,vertices:parts.reduce((n,mesh)=>n+mesh.geometry.attributes.position.count,0),triangles:parts.reduce((n,mesh)=>n+(mesh.geometry.index?.count||mesh.geometry.attributes.position.count)/3,0),morphTargets:['jawOpen'],drawCalls:parts.length};},
    dispose(){for(const skeleton of new Set(parts.map(mesh=>mesh.skeleton)))skeleton.dispose();root.removeFromParent();}
  };
}
