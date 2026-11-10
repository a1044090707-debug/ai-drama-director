/** Texture-free glTF 2.0 export preserving skins, inverse binds and morph targets. */
export function exportRigGLB(avatar){
  const root=avatar.root??avatar,blocks=[],bufferViews=[],accessors=[],nodes=[],meshes=[],materials=[],skins=[],nodeIds=new Map(),materialIds=new Map(),skeletonIds=new Map();let length=0;
  function binary(array,target){const raw=new Uint8Array(array.buffer,array.byteOffset,array.byteLength),pad=(-length)&3;if(pad){blocks.push(new Uint8Array(pad));length+=pad;}const id=bufferViews.length;bufferViews.push({buffer:0,byteOffset:length,byteLength:raw.byteLength,...(target?{target}:{})});blocks.push(raw);length+=raw.byteLength;return id;}
  function attr(attribute,target,range=false){
    const array=attribute.array,componentType=array instanceof Uint16Array?5123:array instanceof Uint32Array?5125:array instanceof Uint8Array?5121:5126;
    const result={bufferView:binary(array,target),componentType,count:attribute.count,type:{1:'SCALAR',2:'VEC2',3:'VEC3',4:'VEC4',16:'MAT4'}[attribute.itemSize]};
    if(range){const min=Array(attribute.itemSize).fill(Infinity),max=Array(attribute.itemSize).fill(-Infinity);for(let i=0;i<array.length;i++){if(!Number.isFinite(array[i]))throw new Error('Non-finite geometry');const k=i%attribute.itemSize;min[k]=Math.min(min[k],array[i]);max[k]=Math.max(max[k],array[i]);}result.min=min;result.max=max;}
    accessors.push(result);return accessors.length-1;
  }
  function material(m){if(materialIds.has(m))return materialIds.get(m);const id=materials.length;materialIds.set(m,id);materials.push({name:m.name,pbrMetallicRoughness:{baseColorFactor:[m.color.r,m.color.g,m.color.b,m.opacity],metallicFactor:m.metalness??0,roughnessFactor:m.roughness??.8},doubleSided:m.side===2});return id;}
  function node(o){const id=nodes.length;nodeIds.set(o,id);const item={name:o.name||o.type,translation:o.position.toArray(),rotation:o.quaternion.toArray(),scale:o.scale.toArray()};nodes.push(item);const children=o.children.filter(c=>c.visible).map(node);if(children.length)item.children=children;return id;}
  root.updateMatrixWorld(true);const rootId=node(root);
  root.traverse(o=>{
    if(!o.isMesh||!nodeIds.has(o))return;
    const g=o.geometry,attributes={};
    for(const [name,semantic] of [['position','POSITION'],['normal','NORMAL'],['skinIndex','JOINTS_0'],['skinWeight','WEIGHTS_0']])if(g.attributes[name])attributes[semantic]=attr(g.attributes[name],34962,name==='position');
    const primitive={attributes,material:material(o.material),mode:4};if(g.index)primitive.indices=attr(g.index,34963);
    const item={name:o.name,primitives:[primitive]};
    if(g.morphAttributes.position?.length){primitive.targets=g.morphAttributes.position.map((p,i)=>({POSITION:attr(p,34962,true),...(g.morphAttributes.normal?.[i]?{NORMAL:attr(g.morphAttributes.normal[i],34962)}:{})}));item.weights=Array(primitive.targets.length).fill(0);item.extras={targetNames:g.morphAttributes.position.map(p=>p.name)};}
    const n=nodes[nodeIds.get(o)];n.mesh=meshes.length;meshes.push(item);
    if(o.isSkinnedMesh){
      let skin=skeletonIds.get(o.skeleton);
      if(skin===undefined){skin=skins.length;skeletonIds.set(o.skeleton,skin);const matrices=new Float32Array(o.skeleton.bones.length*16);o.skeleton.boneInverses.forEach((m,i)=>matrices.set(m.elements,i*16));skins.push({name:'OrangeGirl_FullBody_Skin',joints:o.skeleton.bones.map(b=>{if(!nodeIds.has(b))throw new Error('Missing joint '+b.name);return nodeIds.get(b);}),skeleton:nodeIds.get(o.skeleton.bones[0]),inverseBindMatrices:attr({array:matrices,count:matrices.length/16,itemSize:16})});}
      n.skin=skin;
    }
  });
  const document={asset:{version:'2.0',generator:'OrangeGirl full-body parametric rig v3'},scene:0,scenes:[{nodes:[rootId]}],nodes,meshes,materials,skins,accessors,bufferViews,buffers:[{byteLength:length}],extras:{notes:'Full-body articulated avatar. Camera retargeting lives in driver.mjs, not in the GLB.'}};
  const json=new TextEncoder().encode(JSON.stringify(document)),jsonLength=(json.length+3)&~3,binLength=(length+3)&~3,total=12+8+jsonLength+8+binLength,out=new Uint8Array(total),dv=new DataView(out.buffer);
  dv.setUint32(0,0x46546c67,true);dv.setUint32(4,2,true);dv.setUint32(8,total,true);dv.setUint32(12,jsonLength,true);dv.setUint32(16,0x4e4f534a,true);out.fill(32,20,20+jsonLength);out.set(json,20);
  let cursor=20+jsonLength;dv.setUint32(cursor,binLength,true);dv.setUint32(cursor+4,0x004e4942,true);cursor+=8;for(const block of blocks){out.set(block,cursor);cursor+=block.length;}return out;
}
