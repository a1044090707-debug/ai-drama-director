import * as T from '../../vendor/three.module.js';
import {mergeGeometries} from '../../vendor/BufferGeometryUtils.js';

const V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z),clamp=T.MathUtils.clamp,lerp=T.MathUtils.lerp;
export const MORPHS=['jawOpen','eyeBlinkLeft','eyeBlinkRight','mouthSmile'];
export const DESIGN={height:3.94,headCenter:3.10,floor:0,palette:{skin:'#edb69a',hair:'#79442c',hoodie:'#7f986c',pants:'#354d50',shoe:'#f3eddf',orange:'#ee8235'}};

function grid(cols,rows,fn){
  const pos=[],indices=[];
  for(let j=0;j<=rows;j++)for(let i=0;i<=cols;i++)pos.push(...fn(i/cols,j/rows));
  for(let j=0;j<rows;j++)for(let i=0;i<cols;i++){const a=j*(cols+1)+i,b=a+cols+1;indices.push(a,b,a+1,b,b+1,a+1);}
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setIndex(indices);g.computeVertexNormals();return g;
}
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
function surfaceNormals(g){g.computeVertexNormals();return g.attributes.normal.array.slice();}
function addMorphs(g,functions){
  const base=g.attributes.position.array,baseNormal=surfaceNormals(g);g.morphTargetsRelative=true;
  g.morphAttributes.position=[];g.morphAttributes.normal=[];
  for(const name of MORPHS){
    const moved=base.slice();
    if(functions[name])for(let i=0;i<base.length;i+=3){const p=functions[name](base[i],base[i+1],base[i+2],i/3);moved.set(p,i);}
    const tmp=new T.BufferGeometry();tmp.setAttribute('position',new T.Float32BufferAttribute(moved,3));tmp.setIndex(g.index.clone());const normal=surfaceNormals(tmp);
    const delta=new Float32Array(base.length),dn=new Float32Array(base.length);
    for(let i=0;i<base.length;i++){delta[i]=moved[i]-base[i];dn[i]=normal[i]-baseNormal[i];}
    const p=new T.Float32BufferAttribute(delta,3),n=new T.Float32BufferAttribute(dn,3);p.name=n.name=name;
    g.morphAttributes.position.push(p);g.morphAttributes.normal.push(n);tmp.dispose();
  }
  return g;
}

/** A texture-free, lit, full-body avatar with an actual shared skin and morphs. */
export function createFullBodyAvatar(){
  const root=new T.Group();root.name='OrangeGirl_FullBody_v3';
  const bones=[],byName={},rest={},parts=[],morphMeshes=[],staticParts=new Map();
  function bone(name,parent,world){const b=new T.Bone();b.name=name;const p=V(...world);rest[name]=p.clone();if(parent){b.position.copy(p).sub(rest[parent]);byName[parent].add(b);}else{b.position.copy(p);root.add(b);}bones.push(b);byName[name]=b;return b;}
  bone('Root',null,[0,0,0]);bone('Hips','Root',[0,1.43,0]);bone('Spine','Hips',[0,1.77,0]);bone('Chest','Spine',[0,2.16,0]);bone('Neck','Chest',[0,2.47,0]);bone('Head','Neck',[0,2.66,0]);
  for(const [side,s] of [['Left',1],['Right',-1]]){
    bone(side+'Shoulder','Chest',[s*.30,2.27,0]);bone(side+'UpperArm',side+'Shoulder',[s*.43,2.27,0]);
    bone(side+'ForeArm',side+'UpperArm',[s*.65,1.85,.025]);bone(side+'Hand',side+'ForeArm',[s*.72,1.45,.09]);
    bone(side+'UpperLeg','Hips',[s*.19,1.40,0]);bone(side+'LowerLeg',side+'UpperLeg',[s*.19,.80,.035]);
    bone(side+'Foot',side+'LowerLeg',[s*.19,.19,.01]);bone(side+'Toe',side+'Foot',[s*.19,.105,.27]);
  }
  const index=Object.fromEntries(bones.map((b,i)=>[b.name,i]));
  const mat=(name,color,roughness=.82,metalness=0)=>{const m=new T.MeshStandardMaterial({name,color,roughness,metalness,side:T.DoubleSide});return m;};
  const mats={skin:mat('Skin_Matte',DESIGN.palette.skin,.85),hair:mat('Hair_Chestnut',DESIGN.palette.hair,.72),hairDark:mat('Hair_Deep','#57301f',.82),hairLight:mat('Hair_Warm','#925637',.75),
    green:mat('Hoodie_Sage',DESIGN.palette.hoodie,.96),greenLight:mat('Hood_Folds','#91a57c',.95),greenDark:mat('Hood_Seams','#637e54',.94),pants:mat('Trousers',DESIGN.palette.pants,.95),
    shoe:mat('Sneaker_Upper',DESIGN.palette.shoe,.88),sole:mat('Sneaker_Sole','#d8d9c7',.98),orange:mat('Cap_Orange',DESIGN.palette.orange,.9),cream:mat('Cap_Cream','#f6eddb',.9),
    white:mat('Eye_Sclera','#fff8ed',.27),iris:mat('Iris_Brown','#7c4527',.25),black:mat('Pupil_Lash','#251c18',.30),glint:mat('Eye_Glint','#ffffff',.1),
    lips:mat('Lips','#c4806e',.78),mouth:mat('Mouth_Interior','#512d2c',.98),tongue:mat('Tongue','#ce8b83',.85),gold:mat('Earrings','#d6a34c',.32,.65),blush:mat('Cheek_Blush','#e5a18b',.92)};
  function weights(g,fn){
    const p=g.attributes.position,ids=[],ws=[];
    for(let i=0;i<p.count;i++){const w=fn(p.getX(i),p.getY(i),p.getZ(i),i),sum=w.reduce((a,x)=>a+x[1],0);for(let k=0;k<4;k++){ids.push(w[k]?index[w[k][0]]:0);ws.push(w[k]?w[k][1]/sum:0);}}
    g.setAttribute('skinIndex',new T.Uint16BufferAttribute(ids,4));g.setAttribute('skinWeight',new T.Float32BufferAttribute(ws,4));g.deleteAttribute('uv');return g;
  }
  function add(g,m,name,binding='Head',morphs=null){
    if(morphs)addMorphs(g,morphs);
    weights(g,typeof binding==='function'?binding:()=>[[binding,1]]);
    if(morphs){const mesh=new T.SkinnedMesh(g,m);mesh.name=name;mesh.updateMorphTargets();parts.push(mesh);morphMeshes.push(mesh);root.add(mesh);return mesh;}
    if(!staticParts.has(m))staticParts.set(m,[]);staticParts.get(m).push(g);return null;
  }
  function ellipsoid(m,p,s,name,binding='Head',segments=20){const g=new T.SphereGeometry(1,segments,12);g.scale(...s);g.translate(...p);return add(g,m,name,binding);}
  function tube(m,points,r,name,binding='Head',segments=32,sides=8,taper=false){
    const curve=new T.CatmullRomCurve3(points.map(p=>V(...p))),frames=curve.computeFrenetFrames(segments,false);
    const g=grid(sides,segments,(u,t)=>{const i=Math.min(segments,Math.round(t*segments)),p=curve.getPointAt(t),a=u*Math.PI*2,rr=r*(taper?Math.max(.045,Math.sin(Math.PI*t)**.42):1);p.addScaledVector(frames.normals[i],Math.cos(a)*rr).addScaledVector(frames.binormals[i],Math.sin(a)*rr);return p.toArray();});
    return add(g,m,name,binding);
  }
  const hc=DESIGN.headCenter;
  const faceWidth=y=>.53*(1-.15*smooth(-.10,-.55,y));
  function faceZ(x,y){const r=(x/faceWidth(y))**2+(y/.58)**2;const gauss=(cx,cy,sx,sy)=>Math.exp(-(((x-cx)/sx)**2+((y-cy)/sy)**2));return .405*Math.sqrt(Math.max(0,1-r))+.037*gauss(0,.01,.12,.22)+.025*gauss(0,-.07,.14,.09)+.018*(gauss(-.29,-.12,.17,.18)+gauss(.29,-.12,.17,.18));}
  const mouthCenter=-.29;
  function lipPoint(t,open=0,smile=0){const a=t*Math.PI*2,x=Math.cos(a)*(.143+smile*.02),y=mouthCenter+Math.sin(a)*.013-open*.145*Math.max(0,-Math.sin(a))+smile*.044*Math.cos(a)**2;return [x,y,faceZ(x,mouthCenter)+.008];}
  // The face is an annulus with a real mouth opening. There is no face polygon
  // behind the cavity; jawOpen deforms the rim, chin and cavity together.
  const face=grid(96,30,(u,t)=>{const a=u*Math.PI*2,outerY=.58*Math.sin(a),outerX=faceWidth(outerY)*Math.cos(a),inner=lipPoint(u),x=lerp(inner[0],outerX,t),y=lerp(inner[1],outerY,t);return[x,hc+y,faceZ(x,y)];});
  add(face,mats.skin,'Face_With_MouthOpening','Head',{
    jawOpen:(x,y,z,i)=>{const t=Math.floor(i/97)/30,a=(i%97)/96*Math.PI*2,inner=-.145*Math.max(0,-Math.sin(a))*(1-t)**1.7,chin=-.035*smooth(-.2,-.55,y-hc)*t;return[x,y+inner+chin,z-.008*smooth(-.2,-.55,y-hc)];},
    mouthSmile:(x,y,z,i)=>{const t=Math.floor(i/97)/30,a=(i%97)/96*Math.PI*2;return[x+Math.cos(a)*.02*(1-t)**2,y+.044*Math.cos(a)**2*(1-t)**2,z];}
  });
  add(grid(64,24,(u,t)=>{const a=u*Math.PI*2,phi=t*Math.PI/2,yy=.58*Math.sin(a)*Math.cos(phi),x=faceWidth(yy)*Math.cos(a)*Math.cos(phi);return[x,hc+yy,-.43*Math.sin(phi)];}),mats.skin,'Cranium','Head');
  const cavity=grid(64,8,(u,t)=>{const p=lipPoint(u);return[p[0]*(1-t*.86),hc+mouthCenter+(p[1]-mouthCenter)*(1-t*.86),p[2]-.15*t];});
  add(cavity,mats.mouth,'Actual_Mouth_Cavity','Head',{
    jawOpen:(x,y,z,i)=>{const u=(i%65)/64,t=Math.floor(i/65)/8;return[x,y-.145*Math.max(0,-Math.sin(u*Math.PI*2))*(1-t*.65),z];},
    mouthSmile:(x,y,z,i)=>{const u=(i%65)/64,t=Math.floor(i/65)/8;return[x+Math.cos(u*Math.PI*2)*.02*(1-t),y+.044*Math.cos(u*Math.PI*2)**2*(1-t),z];}
  });
  const lip=grid(96,8,(u,v)=>{const p=lipPoint(u),a=v*Math.PI*2,b=u*Math.PI*2,r=.009;return[p[0]+Math.cos(b)*Math.cos(a)*r,hc+p[1]+Math.sin(b)*Math.cos(a)*r,p[2]+Math.sin(a)*r+.004];});
  add(lip,mats.lips,'Lips','Head',{
    jawOpen:(x,y,z,i)=>{const a=(i%97)/96*Math.PI*2;return[x,y-.145*Math.max(0,-Math.sin(a)),z];},
    mouthSmile:(x,y,z,i)=>{const a=(i%97)/96*Math.PI*2;return[x+Math.cos(a)*.02,y+.044*Math.cos(a)**2,z];}
  });
  ellipsoid(mats.cream,[0,hc-.315,faceZ(0,mouthCenter)-.085],[.105,.027,.025],'UpperTeeth');
  ellipsoid(mats.tongue,[0,hc-.40,faceZ(0,mouthCenter)-.10],[.085,.025,.025],'Tongue');
  ellipsoid(mats.skin,[0,hc-.055,.458],[.064,.070,.061],'Rounded_Nose');
  for(const [side,s] of [['Left',1],['Right',-1]]){
    const x=s*.205,y=hc+.135,z=faceZ(x,.135)+.004,w=.137,h=.158,d=.045;
    ellipsoid(mats.white,[x,y,z],[w,h,d],side+'_Eyeball', 'Head',32);
    ellipsoid(mats.iris,[x,y-.009,z+d*.88],[.077,.099,.020],side+'_Iris');
    ellipsoid(mats.black,[x,y-.009,z+d+.013],[.039,.062,.010],side+'_Pupil');
    ellipsoid(mats.glint,[x-.023,y+.032,z+d+.025],[.017,.022,.006],side+'_EyeHighlight', 'Head',16);
    const name='eyeBlink'+side;
    function lidPoint(u,t,closed){const a=u*2-1,hh=Math.sqrt(Math.max(0,1-a*a))*h,top=hh+.032,edge=lerp(hh*.76,-hh*.83,closed),yy=lerp(top,edge,t),surface=Math.sqrt(Math.max(0,1-a*a-(yy/h)**2));return[x+a*w,y+yy,z+d*surface+.034*Math.sqrt(Math.max(0,1-a*a))+.005];}
    const lid=grid(32,8,(u,t)=>lidPoint(u,t,0));
    add(lid,mats.skin,side+'_UpperEyelid','Head',{[name]:(a,b,c,i)=>lidPoint((i%33)/32,Math.floor(i/33)/8,1)});
    add(grid(32,4,(u,t)=>{const a=u*2-1,hh=Math.sqrt(Math.max(0,1-a*a))*h,yy=lerp(-hh-.025,-hh*.82,t),surface=Math.sqrt(Math.max(0,1-a*a-(yy/h)**2));return[x+a*w,y+yy,z+d*surface+.018];}),mats.skin,side+'_LowerEyelid','Head');
    const lash=grid(32,4,(u,v)=>{const p=lidPoint(u,1,0),a=v*Math.PI*2;return[p[0],p[1]+Math.cos(a)*.005,p[2]+Math.sin(a)*.005+.003];});
    add(lash,mats.black,side+'_Eyelash','Head',{[name]:(a,b,c,i)=>{const u=(i%33)/32,t=Math.floor(i/33)/4,p=lidPoint(u,1,1),r=t*Math.PI*2;return[p[0],p[1]+Math.cos(r)*.005,p[2]+Math.sin(r)*.005+.003];}});
    const brow=[];for(let k=0;k<=10;k++){const t=k/10,bx=x+(t-.5)*.28,by=.382+.025*Math.sin(t*Math.PI);brow.push([bx,hc+by,faceZ(bx,by)+.015]);}tube(mats.hairDark,brow,.014,side+'_Brow','Head',24,6,true);
    ellipsoid(mats.skin,[s*.505,hc-.04,0],[.092,.145,.072],side+'_Ear');
    ellipsoid(mats.blush,[s*.548,hc-.04,.055],[.028,.080,.018],side+'_InnerEar');
    const ring=new T.TorusGeometry(.054,.010,8,24);ring.rotateY(s*.25);ring.translate(s*.532,hc-.19,.035);add(ring,mats.gold,side+'_Earring');
    for(let k=0;k<6;k++){const fx=s*(.13+(k%3)*.05),fy=-.095+Math.floor(k/3)*.036;ellipsoid(mats.hairLight,[fx,hc+fy,faceZ(fx,fy)+.003],[.0035,.0035,.0018],'Freckle','Head',8);}
  }
  // Broad, tapered locks carry shape; their highlights are produced by lights.
  ellipsoid(mats.hairDark,[0,hc-.035,-.23],[.57,.61,.32],'Back_Hair_Mass');
  let lock=0;
  for(let k=0;k<11;k++){
    const x=(k-5)*.09,pts=[];for(let j=0;j<=12;j++){const t=j/12;pts.push([x+.07*Math.sin(t*Math.PI*3.5+k*.7),hc+.40-t*1.03,-.28-.20*Math.sqrt(Math.max(0,1-(x/.63)**2))+.05*Math.cos(t*10+k)]);}tube(k%3?mats.hair:mats.hairLight,pts,.10,'BackCurl'+lock++,'Head',32,10,true);
  }
  for(const s of [-1,1])for(let k=0;k<4;k++){
    const pts=[];for(let j=0;j<=15;j++){const t=j/15,phase=t*Math.PI*3.5+k*.8;pts.push([s*(.44+k*.047+.075*Math.sin(phase)),hc+.40-t*(.97+k*.035),.13-k*.115+.04*Math.cos(phase)]);}tube(k%2?mats.hair:mats.hairLight,pts,.092,'SideCurl'+lock++,'Head',32,10,true);
  }
  tube(mats.hair,[[-.37,hc+.45,.21],[-.20,hc+.43,.35],[.02,hc+.41,.39],[.21,hc+.35,.42],[.42,hc+.22,.29]],.075,'Swept_Fringe','Head',32,10,true);
  tube(mats.hairLight,[[-.35,hc+.46,.20],[-.44,hc+.32,.30],[-.45,hc+.10,.27],[-.48,hc-.04,.20]],.062,'Fringe_Left','Head',28,10,true);
  const crown=grid(48,16,(u,t)=>{const a=u*Math.PI*2,p=t*1.43;return[.58*Math.sin(p)*Math.sin(a),hc+.46+.36*Math.cos(p),-.03+.54*Math.sin(p)*Math.cos(a)];});
  const crownParts=[[],[]],ci=crown.index.array;
  for(let j=0;j<16;j++)for(let i=0;i<48;i++){const a=(i+.5)/48*Math.PI*2,part=Math.cos(a)>.75?1:0;for(let k=0;k<6;k++)crownParts[part].push(ci[(j*48+i)*6+k]);}
  for(const [i,m] of [mats.orange,mats.cream].entries()){const g=crown.clone();g.setIndex(crownParts[i]);g.computeVertexNormals();add(g,m,i?'Cap_CreamPanel':'Cap_Crown');}crown.dispose();
  const brim=grid(48,12,(u,t)=>{const a=lerp(-1.22,1.22,u),extend=Math.sin(u*Math.PI)**.6*t;return[Math.sin(a)*(.57+extend*.11),hc+.515-.065*extend**2+.025*Math.sin(a)**2,-.03+Math.cos(a)*(.53+extend*.36)];});add(brim,mats.orange,'Cap_Brim');
  const edge=[];for(let i=0;i<=48;i++){const u=i/48,a=lerp(-1.22,1.22,u),e=Math.sin(u*Math.PI)**.6;edge.push([Math.sin(a)*(.57+e*.11),hc+.515-.065*e*e+.025*Math.sin(a)**2,-.03+Math.cos(a)*(.53+e*.36)]);}tube(mats.orange,edge,.012,'Brim_Rim','Head',48,6);
  ellipsoid(mats.orange,[0,hc+.83,-.03],[.038,.017,.035],'Cap_Button');
  const capSeam=[];for(let i=0;i<=20;i++){const p=i/20*1.43;capSeam.push([0,hc+.46+.362*Math.cos(p),-.03-.542*Math.sin(p)]);}tube(mats.orange,capSeam,.003,'Cap_Seam','Head',24,5);

  // Neck, torso, sleeves and trousers are skinned independently of the head.
  ellipsoid(mats.skin,[0,2.53,0],[.14,.23,.14],'Neck','Neck');
  const torsoRows=[[1.37,.32,.215],[1.48,.35,.22],[1.76,.37,.235],[2.05,.41,.235],[2.25,.41,.20],[2.38,.30,.17],[2.45,.16,.13]];
  function bodySection(y){let k=0;while(k<torsoRows.length-2&&y>torsoRows[k+1][0])k++;const a=torsoRows[k],b=torsoRows[k+1],t=smooth(a[0],b[0],y);return[lerp(a[1],b[1],t),lerp(a[2],b[2],t)];}
  const torsoWeight=(x,y)=>{if(y<1.70){const t=smooth(1.43,1.77,y);return[['Hips',1-t],['Spine',t]];}const t=smooth(1.80,2.16,y);return[['Spine',1-t],['Chest',t]];};
  add(grid(48,32,(u,t)=>{const y=lerp(1.37,2.45,t),[w,d]=bodySection(y),a=u*Math.PI*2,fold=.004*Math.sin(a*7+y*11);return[Math.sin(a)*(w+fold),y,Math.cos(a)*(d+fold)];}),mats.green,'Hoodie_Body',torsoWeight);
  ellipsoid(mats.greenLight,[0,2.30,-.20],[.33,.27,.15],'Hood_Back','Chest');
  for(const s of [-1,1]){
    tube(mats.greenLight,[[0,2.38,-.23],[s*.23,2.40,-.17],[s*.29,2.38,.02],[s*.20,2.31,.17],[s*.07,2.32,.16]],.065,'Hood_Collar','Chest',28,8);
    tube(mats.cream,[[s*.10,2.32,.20],[s*.12,2.10,.253],[s*.12,1.96,.254]],.010,'Drawstring','Chest',12,6);
    ellipsoid(mats.cream,[s*.12,1.95,.254],[.013,.025,.013],'Drawstring_Tip','Chest',12);
  }
  const hem=grid(48,4,(u,t)=>{const a=u*Math.PI*2,y=lerp(1.37,1.44,t);return[Math.sin(a)*.331,y,Math.cos(a)*.224];});add(hem,mats.greenDark,'Hoodie_RibHem','Hips');
  tube(mats.greenDark,[[-.22,1.70,.215],[-.16,1.62,.24],[0,1.60,.245],[.16,1.62,.24],[.22,1.70,.215]],.006,'KangarooPocket',torsoWeight,28,6);
  ellipsoid(mats.pants,[0,1.39,0],[.335,.16,.19],'Pants_Pelvis','Hips');
  function limb(side,kind){
    const arm=kind==='Arm',a=rest[side+(arm?'UpperArm':'UpperLeg')],b=rest[side+(arm?'ForeArm':'LowerLeg')],c=rest[side+(arm?'Hand':'Foot')];
    const curve=new T.CatmullRomCurve3([a,b,c]),frames=curve.computeFrenetFrames(28,false);
    const g=grid(16,28,(u,t)=>{const p=curve.getPointAt(t),i=Math.round(t*28),angle=u*Math.PI*2,r=arm?lerp(.148,.093,t):lerp(.183,.102,t),wrinkle=1+.018*Math.cos(t*24);p.addScaledVector(frames.normals[i],Math.cos(angle)*r*wrinkle).addScaledVector(frames.binormals[i],Math.sin(angle)*r*(arm?1:.94)*wrinkle);return p.toArray();});
    const bind=(x,y,z,i)=>{const t=Math.floor(i/17)/28,w=smooth(.32,.68,t);return[[side+(arm?'UpperArm':'UpperLeg'),1-w],[side+(arm?'ForeArm':'LowerLeg'),w]];};
    add(g,arm?mats.green:mats.pants,side+(arm?'Sleeve':'TrouserLeg'),bind);
    if(arm){
      ellipsoid(mats.green,[a.x,a.y,a.z],[.158,.17,.155],side+'_ShoulderCloth',side+'UpperArm');
      ellipsoid(mats.greenDark,[c.x,c.y+.025,c.z],[.097,.065,.098],side+'_Cuff',side+'ForeArm');
      const s=side==='Left'?1:-1;ellipsoid(mats.skin,[c.x+s*.015,c.y-.105,c.z+.018],[.075,.12,.056],side+'_Palm',side+'Hand');
      for(let k=0;k<4;k++)ellipsoid(mats.skin,[c.x+(k-1.5)*.029,c.y-.205-(k===0||k===3?-.01:.006),c.z+.022],[.016,.055,.023],side+'_Finger'+k,side+'Hand',12);
      ellipsoid(mats.skin,[c.x-s*.071,c.y-.10,c.z+.035],[.034,.062,.034],side+'_Thumb',side+'Hand',16);
    }else{
      const footBinding=(x,y,z)=>{const t=smooth(.19,.35,z);return[[side+'Foot',1-t],[side+'Toe',t]];};
      ellipsoid(mats.sole,[c.x,.066,.15],[.151,.055,.29],side+'_Sole',footBinding,32);
      ellipsoid(mats.shoe,[c.x,.15,.115],[.14,.096,.268],side+'_Sneaker',footBinding,32);
      ellipsoid(mats.cream,[c.x,.145,.31],[.135,.066,.12],side+'_ToeCap',footBinding,24);
      for(let k=0;k<3;k++)tube(mats.cream,[[c.x-.073,.231-k*.008,.11+k*.043],[c.x,.245-k*.008,.12+k*.043],[c.x+.073,.231-k*.008,.11+k*.043]],.008,side+'_Lace'+k,footBinding,8,5);
      ellipsoid(mats.greenDark,[c.x,.17,-.09],[.10,.040,.025],side+'_HeelTab',side+'Foot',16);
    }
  }
  for(const side of ['Left','Right']){limb(side,'Arm');limb(side,'Leg');}
  for(const [m,gs] of staticParts){const g=mergeGeometries(gs,false);if(!g)throw new Error('Cannot merge material '+m.name);const mesh=new T.SkinnedMesh(g,m);mesh.name=m.name;parts.push(mesh);root.add(mesh);gs.forEach(g=>g.dispose());}
  root.updateMatrixWorld(true);const skeleton=new T.Skeleton(bones);
  for(const mesh of parts){mesh.bind(skeleton);mesh.normalizeSkinWeights();mesh.frustumCulled=false;mesh.castShadow=true;mesh.receiveShadow=true;}
  const restQuaternions=Object.fromEntries(bones.map(b=>[b.name,b.quaternion.clone()]));
  function resetPose(){for(const b of bones)b.quaternion.copy(restQuaternions[b.name]);byName.Hips.position.copy(rest.Hips);root.position.y=0;root.updateMatrixWorld(true);}
  function expression(values={}){for(const mesh of morphMeshes)for(const [i,name] of MORPHS.entries())mesh.morphTargetInfluences[i]=clamp(values[name]??0,0,1);}
  function ground(){root.updateMatrixWorld(true);let min=Infinity;for(const side of ['Left','Right']){const f=byName[side+'Foot'];for(const p of [V(0,-.175,-.10),V(0,-.175,.19)])min=Math.min(min,f.localToWorld(p).y);const toe=byName[side+'Toe'];min=Math.min(min,toe.localToWorld(V(0,-.09,.13)).y);}root.position.y-=min;root.updateMatrixWorld(true);return min;}
  function demo(name,time=0,amount=1){
    resetPose();const b=byName;
    if(name==='arms'){b.LeftUpperArm.rotation.z=1.58*amount;b.RightUpperArm.rotation.z=-1.58*amount;}
    if(name==='wave'){b.LeftUpperArm.rotation.z=2.25;b.LeftForeArm.rotation.z=.60+Math.sin(time*5)*.38;b.LeftHand.rotation.z=Math.sin(time*5)*.15;}
    if(name==='squat'){for(const s of ['Left','Right']){b[s+'UpperLeg'].rotation.x=-.72*amount;b[s+'LowerLeg'].rotation.x=1.44*amount;b[s+'Foot'].rotation.x=-.72*amount;}b.Chest.rotation.x=.15*amount;b.LeftUpperArm.rotation.x=-.65*amount;b.RightUpperArm.rotation.x=-.65*amount;}
    if(name==='step'){b.LeftUpperLeg.rotation.x=-.65*amount;b.LeftLowerLeg.rotation.x=1.12*amount;b.LeftFoot.rotation.x=-.47*amount;b.RightUpperArm.rotation.x=-.22*amount;b.LeftUpperArm.rotation.x=.22*amount;}
    if(name==='tiptoe'){for(const s of ['Left','Right']){b[s+'Foot'].rotation.x=.42*amount;b[s+'Toe'].rotation.x=-.42*amount;}}
    if(name==='toe'){b.LeftToe.rotation.x=-.6*amount;}
    ground();
  }
  function stats(){let triangles=0,vertices=0;for(const p of parts){triangles+=(p.geometry.index?.count??p.geometry.attributes.position.count)/3;vertices+=p.geometry.attributes.position.count;}return{triangles,vertices,bones:bones.length,drawCalls:parts.length,morphTargets:MORPHS.slice()};}
  function dispose(){for(const p of parts)p.geometry.dispose();for(const m of Object.values(mats))m.dispose();skeleton.dispose();}
  expression();
  return{root,bones:byName,boneList:bones,skeleton,rest,parts,morphMeshes,materials:mats,expression,resetPose,ground,demo,stats,dispose};
}
