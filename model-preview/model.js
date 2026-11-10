import * as T from '../vendor/three.module.js';

const clamp=T.MathUtils.clamp, mix=T.MathUtils.lerp;
const G=(x,y,cx,cy,sx,sy)=>Math.exp(-(((x-cx)/sx)**2+((y-cy)/sy)**2));
const rings=[[-.69,.025,.075,.43],[-.635,.29,.26,.27],[-.51,.52,.40,.17],[-.33,.68,.60,.025],[-.065,.785,.71,-.02],[.23,.79,.745,-.035],[.60,.765,.74,-.055],[.90,.665,.65,-.075],[1.12,.40,.42,-.08],[1.23,.02,.05,-.08]];
// C1-continuous interpolation avoids the horizontal ridges produced by
// easing each ring independently to a zero slope.
function interpolate(rows,y){let k=0;while(k<rows.length-2&&y>rows[k+1][0])k++;const a=rows[k],b=rows[k+1],prev=rows[Math.max(0,k-1)],next=rows[Math.min(rows.length-1,k+2)],span=b[0]-a[0],t=clamp((y-a[0])/span,0,1),t2=t*t,t3=t2*t;return a.slice(1).map((_,i)=>{const j=i+1,m0=(b[j]-prev[j])/(b[0]-prev[0]),m1=(next[j]-a[j])/(next[0]-a[0]);return (2*t3-3*t2+1)*a[j]+(t3-2*t2+t)*m0*span+(-2*t3+3*t2)*b[j]+(t3-t2)*m1*span;});}
function section(y){return interpolate(rings,y);}
function front(x,y){const [w,d,c]=section(y);let z=c+d*Math.sqrt(Math.max(0,1-(x/w)**2));
  let detail=.145*G(x,y,0,-.055,.12,.11)+.075*G(x,y,0,.13,.10,.26)+.044*G(x,y,0,-.12,.155,.075);
  for(const s of [-1,1]){detail-=.028*G(x,y,s*.34,.245,.26,.21);detail+=.055*G(x,y,s*.43,-.13,.27,.23);}
  detail+=.026*G(x,y,0,-.39,.25,.15);return z+detail*Math.max(0,1-(x/w)**4);
}
function grid(uCount,vCount,fn){const pos=[],uv=[],colors=[],indices=[];
  for(let j=0;j<=vCount;j++)for(let i=0;i<=uCount;i++){const r=fn(i/uCount,j/vCount);pos.push(...r.p);uv.push(i/uCount,j/vCount);if(r.c)colors.push(...r.c);}
  for(let j=0;j<vCount;j++)for(let i=0;i<uCount;i++){const a=j*(uCount+1)+i,b=a+uCount+1;indices.push(a,a+1,b,b,a+1,b+1);}
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));if(colors.length)g.setAttribute('color',new T.Float32BufferAttribute(colors,3));g.setIndex(indices);g.computeVertexNormals();return g;
}
function noiseTexture(kind){const c=document.createElement('canvas');c.width=c.height=256;const ctx=c.getContext('2d'),im=ctx.createImageData(256,256);let seed=2731;
  for(let y=0;y<256;y++)for(let x=0;x<256;x++){seed=(1664525*seed+1013904223)>>>0;const r=seed/4294967296,n=kind==='cloth'?128+(r-.5)*19+Math.sin(x*Math.PI)*5:128+(r-.5)*8;const k=(y*256+x)*4;im.data[k]=im.data[k+1]=im.data[k+2]=n;im.data[k+3]=255;}ctx.putImageData(im,0,0);const tex=new T.CanvasTexture(c);tex.wrapS=tex.wrapT=T.RepeatWrapping;tex.repeat.set(kind==='cloth'?5:2,kind==='cloth'?5:2);return tex;
}
function hairTexture(){const c=document.createElement('canvas');c.width=512;c.height=256;const ctx=c.getContext('2d'),im=ctx.createImageData(c.width,c.height);for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++){const p=x/c.width*Math.PI*2,v=128+18*Math.sin(p*52+.27*Math.sin(y*.025))+8*Math.sin(p*91+.4*Math.cos(y*.018));const i=(y*c.width+x)*4;im.data[i]=im.data[i+1]=im.data[i+2]=v;im.data[i+3]=255;}ctx.putImageData(im,0,0);const t=new T.CanvasTexture(c);t.wrapS=t.wrapT=T.RepeatWrapping;return t;}
function eyeTexture(){const c=document.createElement('canvas');c.width=c.height=512;const ctx=c.getContext('2d'),im=ctx.createImageData(512,512);
  for(let j=0;j<512;j++)for(let i=0;i<512;i++){const x=(i/511-.5)*.57,y=(j/511-.5)*.40,r=Math.hypot(x,y+.006),a=Math.atan2(y,x);let rgb=[250,244,229];if(r<.151){const f=r/.151,streak=(Math.sin(a*67+f*19)+Math.sin(a*113-f*28))*.5;const edge=1-.55*Math.exp(-(((f-.98)/.06)**2));rgb=[(103+55*(1-f)+streak*18)*edge,(52+28*(1-f)+streak*11)*edge,(24+9*(1-f)+streak*5)*edge];if(r<.071)rgb=[22,12,8];}const spot=Math.hypot((x+.047)/.027,(y+.067)/.037);if(spot<1)rgb=[255,252,236];if(Math.hypot((x-.05)/.012,(y-.044)/.016)<1)rgb=[244,215,161];const k=(j*512+i)*4;im.data[k]=rgb[0];im.data[k+1]=rgb[1];im.data[k+2]=rgb[2];im.data[k+3]=255;}ctx.putImageData(im,0,0);const tex=new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace;return tex;
}

export function createOrangeGirl(){
  const root=new T.Group();root.name='OrangeGirl_HeadStudy';
  const head=new T.Group();head.name='HeadPose';root.add(head);
  const hair=new T.Group();hair.name='Sculpted_WavyHair';head.add(hair);
  const clothBump=noiseTexture('cloth'),skinBump=noiseTexture('skin');
  const standard=(color,extra={})=>new T.MeshStandardMaterial({color,roughness:.62,metalness:0,side:T.DoubleSide,...extra});
  const skin=standard('#efb69d',{roughness:.75,emissive:'#b55b45',emissiveIntensity:.025});
  const faceMat=standard('#ffffff',{vertexColors:true,roughness:.76,emissive:'#c36d58',emissiveIntensity:.025});
  const orange=standard('#ef721b',{roughness:.8,bumpMap:clothBump,bumpScale:.006,side:T.DoubleSide});
  const cream=standard('#f4ebda',{roughness:.86,bumpMap:clothBump,bumpScale:.007,side:T.DoubleSide});
  const green=standard('#819866',{roughness:.9,bumpMap:clothBump,bumpScale:.012});
  const hairMat=standard('#ffffff',{vertexColors:true,roughness:.55,bumpMap:hairTexture(),bumpScale:.008});
  const darkHair=standard('#603621',{roughness:.65});
  const gold=standard('#dfa33f',{metalness:.78,roughness:.24});
  function mesh(g,m,parent,name){const a=new T.Mesh(g,m);a.name=name||'Detail';parent.add(a);a.castShadow=false;a.receiveShadow=false;return a;}
  function ellipsoid(parent,mat,p,s,name){const a=mesh(new T.SphereGeometry(1,name==='Freckle'?8:32,name==='Freckle'?6:20),mat,parent,name);a.position.set(...p);a.scale.set(...s);return a;}
  function curveMesh(parent,pts,r,mat,name,segments=48){return mesh(new T.TubeGeometry(new T.CatmullRomCurve3(pts.map(p=>new T.Vector3(...p))),segments,r,10,false),mat,parent,name);}
  function taperedCurve(parent,pts,r,mat,name){const curve=new T.CatmullRomCurve3(pts.map(p=>new T.Vector3(...p))),frames=curve.computeFrenetFrames(48,false);return mesh(grid(12,48,(u,v)=>{const i=Math.round(v*48),a=u*Math.PI*2,p=curve.getPointAt(v),radius=r*Math.max(.015,Math.sin(Math.PI*v))**.4;p.addScaledVector(frames.normals[i],Math.cos(a)*radius).addScaledVector(frames.binormals[i],Math.sin(a)*radius*.57);return{p:p.toArray()};}),mat,parent,name);}
  const baseColor=new T.Color('#efb99f'),cheekColor=new T.Color('#e78d83');
  const faceGeo=grid(192,128,(u,v)=>{const theta=u*Math.PI*2,y=mix(-.69,1.23,v),[w,d,c]=section(y),x=Math.sin(theta)*w,facing=Math.cos(theta);const z=facing>0?front(x,y):c+facing*d;const blush=(G(x,y,-.47,-.11,.27,.21)+G(x,y,.47,-.11,.27,.21))*.57*Math.max(0,facing);const col=baseColor.clone().lerp(cheekColor,blush);return{p:[x,y,z],c:[col.r,col.g,col.b]};});
  const face=mesh(faceGeo,faceMat,head,'Continuous_SculptedFace');
  const faceBase=faceGeo.attributes.position.array.slice();
  // Ears have an outer helix, depressed concha and a separate lobe.
  const innerEar=standard('#d99580',{roughness:.72});
  for(const s of [-1,1]){
    const ear=new T.Group();ear.name=s<0?'Ear_Left':'Ear_Right';ear.position.set(s*.79,-.01,.025);ear.rotation.y=s*.2;head.add(ear);
    ellipsoid(ear,skin,[s*.018,0,0],[.145,.235,.115],'EarShell');ellipsoid(ear,innerEar,[s*.055,.005,.091],[.075,.14,.024],'Concha');
    const pts=[];for(let i=0;i<=26;i++){const a=i/26*Math.PI*1.9-.4;pts.push([s*(.035+Math.cos(a)*.083),Math.sin(a)*.18,.102]);}curveMesh(ear,pts,.022,skin,'Helix',40);
    ellipsoid(ear,skin,[s*.035,-.171,.034],[.077,.08,.077],'Lobe');
    const ring=mesh(new T.TorusGeometry(.098,.019,12,64),gold,head,'Gold_Hoop');ring.position.set(s*.858,-.27,.12);ring.rotation.y=s*.15;
  }
  // Tiny freckles lie on the shaped cheek surface, rather than on a flat portrait.
  const freckleMat=standard('#b96b43',{transparent:true,opacity:.30,roughness:.9});
  for(const s of [-1,1])for(let i=0;i<15;i++){const x=s*(.14+(i%5)*.076+Math.sin(i*7)*.013),y=-.13+Math.floor(i/5)*.048+Math.cos(i*2)*.013;const q=ellipsoid(head,freckleMat,[x,y,front(x,y)+.004],[.004+i%3*.0012,.004+i%3*.0012,.002],'Freckle');}
  const nostrilMat=standard('#b66f5a',{roughness:.9});
  for(const s of [-1,1])ellipsoid(head,nostrilMat,[s*.058,-.117,front(s*.058,-.117)+.002],[.017,.006,.004],'Nostril');
  const eyes=[],brows=[];const eyeMap=eyeTexture(),eyeMat=standard('#ffffff',{map:eyeMap,roughness:.2});
  const lashMat=standard('#653b2b',{roughness:.8});
  function eyeShape(t){const x=(t*2-1)*.253,f=Math.max(0,Math.sin(t*Math.PI))**.56;return{x,top:.214*f+.010*(t-.5),bottom:-.168*f+.010*(t-.5)};}
  for(const s of [-1,1]){
    const cx=s*.342,cy=.245;
    const eyeGeo=grid(64,24,(u,v)=>{const e=eyeShape(u),x=cx+e.x,y=cy+mix(e.bottom,e.top,v),bulge=Math.sin(u*Math.PI)*Math.sin(v*Math.PI);return{p:[x,y,front(x,y)+.014+.067*bulge]};});
    const uv=eyeGeo.attributes.uv;for(let i=0;i<uv.count;i++){const x=eyeGeo.attributes.position.getX(i),y=eyeGeo.attributes.position.getY(i);uv.setXY(i,(x-cx)/.57+.5,.5+(y-cy)/.4);}uv.needsUpdate=true;
    mesh(eyeGeo,eyeMat,head,s<0?'Eye_Left':'Eye_Right');
    const lidGeo=grid(64,2,(u,v)=>{const e=eyeShape(u),x=cx+e.x,y=cy+e.top+v*.039*Math.sin(Math.PI*u);return{p:[x,y,front(x,y)+.018]};});mesh(lidGeo,skin,head,'UpperLid');
    const lowerGeo=grid(64,2,(u,v)=>{const e=eyeShape(u),x=cx+e.x,y=cy+e.bottom-v*.026*Math.sin(Math.PI*u);return{p:[x,y,front(x,y)+.016]};});mesh(lowerGeo,skin,head,'LowerLid');
    const lashPoints=[];for(let i=0;i<=48;i++){const e=eyeShape(i/48),x=cx+e.x,y=cy+e.top;lashPoints.push([x,y,front(x,y)+.023]);}
    const upperLash=curveMesh(head,lashPoints,.0075,lashMat,'UpperLash',64);
    const browPoints=[];for(let i=0;i<=24;i++){const t=i/24,x=s*(.12+t*.46),y=.552+.077*Math.sin(t*Math.PI)-.025*t;browPoints.push([x,y,front(x,y)+.02]);}
    const brow=taperedCurve(head,browPoints,.023,darkHair,'Eyebrow');brows.push(brow);
    for(let k=0;k<3;k++){const t=s>0?.88+k*.035:.12-k*.035,b=eyeShape(t),x=cx+b.x,y=cy+b.top;curveMesh(head,[[x,y,front(x,y)+.027],[x+s*.023,y+.027,front(x,y)+.030],[x+s*(.035+k*.007),y+.045+k*.008,front(x,y)+.023]],.004,lashMat,'OuterEyelash',12);}
    eyes.push({cx,cy,eyeGeo,lidGeo,lowerGeo,upperLash,lashPoints});
  }
  // Mouth has an opening, lip surfaces, teeth and a tongue; jaw deformation affects chin.
  const mouthMat=standard('#522521',{roughness:.92,side:T.DoubleSide}),lipMat=standard('#d98c7d',{roughness:.52});
  const cavity=mesh(grid(64,16,(u,v)=>({p:[0,0,0]})),mouthMat,head,'MouthInterior');
  const upperLip=mesh(grid(64,6,(u,v)=>({p:[0,0,0]})),lipMat,head,'UpperLip');
  const lowerLip=mesh(grid(64,6,(u,v)=>({p:[0,0,0]})),standard('#e8a18e',{roughness:.49}),head,'LowerLip');
  const teeth=mesh(grid(48,4,(u,v)=>({p:[0,0,0]})),standard('#fff0d7',{roughness:.36}),head,'UpperTeeth');
  const tongue=ellipsoid(head,standard('#d58b84',{roughness:.64}),[0,-.57,.66],[.12,.03,.025],'Tongue');
  function updateMouth(jaw,smile){
    const width=.194+smile*.033,baseY=-.323,opening=.002+jaw*.128;
    function bounds(u){const x=(u*2-1)*width,f=Math.sin(Math.PI*u),corner=smile*.073*(2*u-1)**2;return{x,top:baseY+corner+f*.005,bottom:baseY+corner-opening*f*1.9};}
    for(const [g,kind] of [[cavity.geometry,'cavity'],[upperLip.geometry,'upper'],[lowerLip.geometry,'lower'],[teeth.geometry,'teeth']]){const pos=g.attributes.position,uv=g.attributes.uv;
      for(let i=0;i<pos.count;i++){const u=uv.getX(i),v=uv.getY(i),b=bounds(u),f=Math.sin(Math.PI*u);let y,z;
        if(kind==='cavity'){y=mix(b.bottom,b.top,v);z=front(b.x,baseY)+.018;}
        if(kind==='upper'){y=b.top+v*(.018*f+.006*Math.sin(Math.PI*u*3)*f);z=front(b.x,baseY)+.020+Math.sin(v*Math.PI)*.011*f;}
        if(kind==='lower'){y=b.bottom-v*.029*f;z=front(b.x,baseY)+.021+Math.sin(v*Math.PI)*.014*f;}
        if(kind==='teeth'){y=b.top-v*.045*f;z=front(b.x,baseY)+.022;}
        pos.setXYZ(i,b.x,y,z);
      }pos.needsUpdate=true;g.computeVertexNormals();}
    teeth.visible=jaw>.18;tongue.visible=jaw>.35;tongue.position.set(0,baseY-opening*1.6,front(0,baseY)+.025);
    const p=faceGeo.attributes.position;for(let i=0;i<p.count;i++){const x=faceBase[i*3],y=faceBase[i*3+1],z=faceBase[i*3+2],lower=clamp((-.30-y)/.50,0,1);p.setXYZ(i,x,y-jaw*.12*lower,z-jaw*.024*lower);}p.needsUpdate=true;faceGeo.computeVertexNormals();
  }
  function updateEye(e,blink){const factor=1-clamp(blink,0,1),mid=.008;
    for(const [g,kind] of [[e.eyeGeo,'eye'],[e.lidGeo,'upper'],[e.lowerGeo,'lower']]){const pos=g.attributes.position,uv=g.attributes.uv;
      for(let i=0;i<pos.count;i++){const col=i%65,row=Math.floor(i/65),u=col/64,v=kind==='eye'?row/24:row/2,b=eyeShape(u),top=mix(mid,b.top,factor),bottom=mix(mid,b.bottom,factor),x=e.cx+b.x;let y=e.cy+(kind==='eye'?mix(bottom,top,v):kind==='upper'?top+v*.039*Math.sin(Math.PI*u):bottom-v*.026*Math.sin(Math.PI*u));let z=front(x,y)+.014+(kind==='eye'?.067*Math.sin(u*Math.PI)*Math.sin(v*Math.PI)*factor:.004);pos.setXYZ(i,x,y,z);if(kind==='eye')uv.setXY(i,(x-e.cx)/.57+.5,.5+(y-e.cy)/.4);}
      pos.needsUpdate=true;if(kind==='eye')uv.needsUpdate=true;g.computeVertexNormals();
    }
    const pts=[];for(let i=0;i<=48;i++){const b=eyeShape(i/48),x=e.cx+b.x,y=e.cy+mix(mid,b.top,factor);pts.push(new T.Vector3(x,y,front(x,y)+.023));}e.upperLash.geometry.dispose();e.upperLash.geometry=new T.TubeGeometry(new T.CatmullRomCurve3(pts),64,.0075,10,false);
  }
  // A continuous scalp covers the back of the head; tapered sweeps define wavy locks.
  mesh(grid(96,48,(u,v)=>{const theta=mix(.99,Math.PI*2-.99,u),y=mix(1.12,-1.04,v),[w,d,c]=section(Math.max(-.4,y)),bottomFade=y<-.83?clamp((y+1.08)/.25,.05,1):1;return{p:[(w+.065)*Math.sin(theta)*bottomFade,y,c+(.11+d)*Math.cos(theta)*bottomFade]};}),darkHair,hair,'RearScalp');
  const hairColors=[new T.Color('#633820'),new T.Color('#6f3c25'),new T.Color('#7b452c')];
  const lockTaper=v=>Math.max(.012,Math.min(1,v/.055,(1-v)/.15))**.55;
  function lock(points,radius,index){const path=new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p))),segments=72,sides=20,frames=path.computeFrenetFrames(segments,false);const g=grid(sides,segments,(u,v)=>{const i=Math.min(segments,Math.round(v*segments)),p=path.getPointAt(v),a=u*Math.PI*2,r=radius*lockTaper(v),ridge=1+.024*Math.sin(a*8+v*2),n=frames.normals[i],b=frames.binormals[i];p.addScaledVector(n,Math.cos(a)*r*ridge).addScaledVector(b,Math.sin(a)*r*.82*ridge);const col=hairColors[index%3].clone().multiplyScalar(.93+.055*Math.cos(a)+.025*Math.sin(a*8));return{p:p.toArray(),c:[col.r,col.g,col.b]};});mesh(g,hairMat,hair,'Sculpted_Lock_'+index);
    // Fine longitudinal ridges follow the same sweep frames, never a camera-facing plane.
    for(let k=0;k<2;k++){const pts=[];for(let i=0;i<=48;i++){const v=i/48,j=Math.round(v*segments),a=(k+.3)*Math.PI*.57+.2,p=path.getPointAt(v),r=radius*lockTaper(v);p.addScaledVector(frames.normals[j],Math.cos(a)*r*1.009).addScaledVector(frames.binormals[j],Math.sin(a)*r*.825);pts.push(p.toArray());}curveMesh(hair,pts,.002,standard(index%2?'#9c603c':'#6e3b25',{roughness:.66}),'HairRidge',56);}
  }
  let n=0;
  // Rear hair is built first in broad overlapping locks, with variation in curl phase.
  for(let k=0;k<13;k++){const x=(k-6)*.14,pts=[];for(let i=0;i<=18;i++){const t=i/18;pts.push([x+.10*Math.sin(t*Math.PI*4+k*.60),.90-t*2.06,-.49-Math.sqrt(Math.max(0,1-(x/1.08)**2))*.33-.09*Math.cos(t*Math.PI*4+k*.6)]);}lock(pts,.15,n++);}
  const sideLengths=[1.70,1.87,1.76,2.02,1.83,1.94];
  for(const s of [-1,1])for(let k=0;k<6;k++){const pts=[];for(let i=0;i<=20;i++){const t=i/20,phase=t*Math.PI*(3.4+k*.13)+k*1.06,earGap=k<2?.20*Math.exp(-(((t-.43)/.16)**2)):0;pts.push([s*(.72+k*.073+.14*Math.sin(phase)+.13*Math.sin(t*Math.PI)-earGap),.84-t*sideLengths[k],.10-k*.16+.085*Math.cos(phase)]);}lock(pts,.144+(k%2)*.014,n++);}
  // Side-swept bangs reveal the forehead and do not form a helmet across the face.
  lock([[-.50,.86,.48],[-.24,.83,.66],[.02,.77,.75],[.23,.67,.79],[.43,.56,.74],[.65,.51,.60],[.76,.31,.39],[.76,.10,.27]],.123,n++);
  lock([[-.49,.86,.47],[-.61,.72,.65],[-.65,.52,.68],[-.73,.30,.58],[-.79,.13,.40],[-.77,-.10,.35],[-.84,-.30,.32]],.118,n++);
  lock([[.13,.88,.62],[.37,.85,.64],[.57,.73,.57],[.72,.61,.43],[.80,.42,.25]],.108,n++);
  // The baseball cap is a paneled dome with an actual curved projecting brim.
  const cap=new T.Group();cap.name='BaseballCap';head.add(cap);
  const crownGeo=grid(128,48,(u,v)=>{const theta=u*Math.PI*2,phi=v*Math.PI*.48;return{p:[.872*Math.sin(phi)*Math.sin(theta),.85+.62*Math.cos(phi),-.08+.85*Math.sin(phi)*Math.cos(theta)]};});
  crownGeo.clearGroups();const idx=crownGeo.index.array,panels=[[],[]];for(let j=0;j<48;j++)for(let i=0;i<128;i++){const theta=(i+.5)/128*Math.PI*2,mi=(theta<.67||theta>Math.PI*2-.67)?1:0,start=(j*128+i)*6;for(let k=0;k<6;k++)panels[mi].push(idx[start+k]);}crownGeo.setIndex([...panels[0],...panels[1]]);crownGeo.addGroup(0,panels[0].length,0);crownGeo.addGroup(panels[0].length,panels[1].length,1);mesh(crownGeo,[orange,cream],cap,'PaneledCapCrown');
  const brimGeo=grid(96,20,(u,v)=>{const a=mix(-1.18,1.18,u),extension=Math.sin(u*Math.PI)**.45*v;return{p:[Math.sin(a)*(.853+extension*.18),.884-.05*extension-.065*extension**2+.06*Math.sin(a)**2,-.08+Math.cos(a)*(.82+extension*.67)]};});mesh(brimGeo,orange,cap,'CurvedCapBrim');
  const piping=standard('#d9661e',{roughness:.8});
  const pts=[];for(let i=0;i<=80;i++){const u=i/80,a=mix(-1.18,1.18,u),e=Math.sin(u*Math.PI)**.45;pts.push([Math.sin(a)*(.853+e*.18),.884-.05*e-.065*e*e+.06*Math.sin(a)**2,-.08+Math.cos(a)*(.82+e*.67)]);}curveMesh(cap,pts,.012,piping,'BrimEdge',96);
  for(const theta of [-.67,.67,Math.PI/2,Math.PI,Math.PI*1.5]){const pts=[];for(let i=0;i<=32;i++){const phi=.08+i/32*1.42;pts.push([.876*Math.sin(phi)*Math.sin(theta),.85+.624*Math.cos(phi),-.08+.854*Math.sin(phi)*Math.cos(theta)]);}curveMesh(cap,pts,.0045,theta===-.67||theta===.67?cream:piping,'CapPanelSeam',40);}
  ellipsoid(cap,orange,[0,1.482,-.08],[.063,.027,.058],'CapTopButton');
  const strap=mesh(new T.BoxGeometry(.48,.074,.025),orange,cap,'RearAdjustableStrap');strap.position.set(0,.922,-.926);const buckle=mesh(new T.TorusGeometry(.047,.008,8,32),gold,cap,'StrapBuckle');buckle.position.set(.14,.924,-.944);buckle.scale.set(.74,1,1);
  cap.rotation.x=.12;
  // Neck and shoulder garment are separate from the rotating head.
  ellipsoid(root,skin,[0,-.86,.015],[.22,.27,.23],'Neck');
  const body=new T.Group();body.name='HoodieBust';body.position.y=.14;root.add(body);
  const bodyRings=[[-2.62,1.12,.48],[-2.32,1.24,.52],[-1.91,1.20,.49],[-1.61,.94,.41],[-1.39,.47,.31],[-1.29,.24,.23]];
  function bodySection(y){return interpolate(bodyRings,y);}
  mesh(grid(128,56,(u,v)=>{const y=mix(-2.62,-1.29,v),[w,d]=bodySection(y),a=u*Math.PI*2,wrinkle=.012*Math.sin(a*9+y*11)+.009*Math.sin(a*15-y*7);return{p:[Math.sin(a)*(w+wrinkle),y,-.15+Math.cos(a)*(d+wrinkle)]};}),green,body,'CottonHoodie');
  const hoodMat=standard('#8ca16e',{roughness:.9,bumpMap:clothBump,bumpScale:.012});
  for(const s of [-1,1]){const pts=[[s*.07,-1.36,.23],[s*.23,-1.27,.30],[s*.44,-1.21,.18],[s*.51,-1.16,-.08],[s*.43,-1.10,-.35],[s*.20,-1.08,-.48],[0,-1.09,-.50]];curveMesh(body,pts,.12,hoodMat,'HoodFold',64);curveMesh(body,[[s*.18,-1.36,.32],[s*.19,-1.61,.40],[s*.20,-1.87,.41],[s*.17,-2.06,.39]],.018,cream,'HoodDrawstring',48);ellipsoid(body,cream,[s*.17,-2.065,.39],[.022,.042,.022],'DrawstringTip');}
  curveMesh(body,[[-1.03,-1.73,.08],[-.8,-1.57,.25],[-.61,-1.53,.31]],.006,standard('#6c8356'),'ShoulderSeam',32);curveMesh(body,[[1.03,-1.73,.08],[.8,-1.57,.25],[.61,-1.53,.31]],.006,standard('#6c8356'),'ShoulderSeam',32);
  let lastBlinkL=-1,lastBlinkR=-1,lastJaw=-1,lastSmile=-1;
  function expression({blinkLeft=0,blinkRight=0,jaw=0,smile=.25}={}){if(Math.abs(blinkLeft-lastBlinkL)>.002){updateEye(eyes[0],blinkLeft);lastBlinkL=blinkLeft;}if(Math.abs(blinkRight-lastBlinkR)>.002){updateEye(eyes[1],blinkRight);lastBlinkR=blinkRight;}if(Math.abs(jaw-lastJaw)>.001||Math.abs(smile-lastSmile)>.001){updateMouth(jaw,smile);lastJaw=jaw;lastSmile=smile;}}
  expression();
  return{root,head,hair,body,expression,setWireframe(value){root.traverse(o=>{if(o.isMesh)for(const m of Array.isArray(o.material)?o.material:[o.material])m.wireframe=value;});}};
}

