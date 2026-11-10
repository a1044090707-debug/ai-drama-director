import * as T from './vendor/three.module.js';

// Split the closed lip seam before lowering the lower lip. Stretching the
// original closed surface alone would leave skin across the mouth opening.
export function addJawMorph(geometry,mouth){
  const attributes=Object.fromEntries(Object.entries(geometry.attributes).map(([name,a])=>[name,{size:a.itemSize,values:Array.from(a.array)}]));
  const p=attributes.position.values,lower=Array.from({length:p.length/3},(_,i)=>p[i*3+1]<mouth.y),indices=[];
  const source=geometry.index,read=i=>source?source.getX(i):i;
  const y=i=>p[i*3+1],x=i=>p[i*3],z=i=>p[i*3+2];
  function vertex(a,b,t,isLower){
    const id=p.length/3;
    for(const {size,values} of Object.values(attributes))for(let j=0;j<size;j++)values.push(T.MathUtils.lerp(values[a*size+j],values[b*size+j],t));
    lower.push(isLower);return id;
  }
  function intersection(a,b,isLower){return vertex(a,b,(mouth.y-y(a))/(y(b)-y(a)),isLower);}
  function half(triangle,isLower){
    const polygon=[];for(let i=0;i<3;i++){
      const a=triangle[i],b=triangle[(i+1)%3],inside=isLower?y(a)<=mouth.y:y(a)>=mouth.y,next=isLower?y(b)<=mouth.y:y(b)>=mouth.y;
      if(inside)polygon.push(a);if(inside!==next)polygon.push(intersection(a,b,isLower));
    }
    for(let i=1;i<polygon.length-1;i++)indices.push(polygon[0],polygon[i],polygon[i+1]);
  }
  const refined=[];
  function refine(a,b,c,depth=0){
    const ids=[a,b,c],nearby=ids.some(i=>Math.abs(x(i)-mouth.x)<.35&&y(i)>mouth.y-.34&&y(i)<mouth.y+.08&&z(i)>mouth.front-.08);
    const edge=(a,b)=>(x(a)-x(b))**2+(y(a)-y(b))**2+(z(a)-z(b))**2;
    if(nearby&&depth<3&&Math.max(edge(a,b),edge(b,c),edge(c,a))>(mouth.width*.36)**2){
      const ab=vertex(a,b,.5,(y(a)+y(b))*.5<mouth.y),bc=vertex(b,c,.5,(y(b)+y(c))*.5<mouth.y),ca=vertex(c,a,.5,(y(c)+y(a))*.5<mouth.y);
      refine(a,ab,ca,depth+1);refine(ab,b,bc,depth+1);refine(ca,bc,c,depth+1);refine(ab,bc,ca,depth+1);
    }else refined.push(a,b,c);
  }
  for(let i=0;i<(source?.count||geometry.attributes.position.count);i+=3)refine(read(i),read(i+1),read(i+2));
  for(let i=0;i<refined.length;i+=3){
    const triangle=refined.slice(i,i+3),crosses=Math.min(...triangle.map(y))<mouth.y&&Math.max(...triangle.map(y))>mouth.y;
    const nearby=triangle.some(id=>Math.abs(x(id)-mouth.x)<mouth.width*1.6&&z(id)>mouth.front);
    if(crosses&&nearby){half(triangle,false);half(triangle,true);}else indices.push(...triangle);
  }
  for(const [name,{size,values}] of Object.entries(attributes))geometry.setAttribute(name,new T.Float32BufferAttribute(values,size));
  geometry.setIndex(indices);const delta=new Float32Array(p.length);
  for(let i=0;i<lower.length;i++){
    if(!lower[i]||z(i)<mouth.front-.04)continue;
    const dy=mouth.y-y(i),width=mouth.width*(1+T.MathUtils.clamp(dy/.07,0,1)*4),dx=(x(i)-mouth.x)/width;
    const weight=Math.pow(Math.max(0,1-dx*dx),.45)*T.MathUtils.smoothstep(y(i),mouth.y-.22,mouth.y-.08)*T.MathUtils.smoothstep(z(i),mouth.front-.04,mouth.front+.03);
    delta[i*3+1]=-mouth.drop*weight;delta[i*3+2]=-.012*weight;
  }
  const morph=new T.Float32BufferAttribute(delta,3);morph.name='jawOpen';geometry.morphTargetsRelative=true;geometry.morphAttributes.position=[morph];
}

export function createMouthInterior(geometries,mouth,skeleton,headIndex){
  const material=new T.MeshBasicMaterial({side:T.DoubleSide}),surfaces=geometries.map(geometry=>new T.Mesh(geometry,material));
  const ray=new T.Raycaster(),positions=[],deltas=[],triangles=[],columns=24;
  for(let i=0;i<=columns;i++){
    const x=mouth.x+(i/columns*2-1)*mouth.width;
    ray.set(new T.Vector3(x,mouth.y,3),new T.Vector3(0,0,-1));const hit=ray.intersectObjects(surfaces)[0];
    const z=(hit?.point.z??mouth.front+.04)-.006,opening=Math.pow(Math.max(0,1-Math.pow((x-mouth.x)/mouth.width,2)),.65);
    positions.push(x,mouth.y,z,x,mouth.y,z);deltas.push(0,0,0,0,-mouth.drop*opening,-.012*opening);
    if(i<columns){const a=i*2;triangles.push(a,a+1,a+2,a+1,a+3,a+2);}
  }
  material.dispose();const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.setIndex(triangles);
  const delta=new T.Float32BufferAttribute(deltas,3);delta.name='jawOpen';geometry.morphTargetsRelative=true;geometry.morphAttributes.position=[delta];
  const ids=new Uint16Array(positions.length/3*4),weights=new Float32Array(ids.length);for(let i=0;i<ids.length;i+=4){ids[i]=headIndex;weights[i]=1;}
  geometry.setAttribute('skinIndex',new T.Uint16BufferAttribute(ids,4));geometry.setAttribute('skinWeight',new T.Float32BufferAttribute(weights,4));
  const mesh=new T.SkinnedMesh(geometry,new T.MeshBasicMaterial({color:0x291018,side:T.DoubleSide,toneMapped:false}));mesh.name='mouth_interior';mesh.frustumCulled=false;mesh.bind(skeleton,new T.Matrix4());return mesh;
}
