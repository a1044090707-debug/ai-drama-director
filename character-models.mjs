import {createRainAvatar} from './model-preview/rain/avatar.mjs';
import {createImportedAvatar} from './imported-avatar.mjs';

// Actual preview assets, shared by the main stage and its character cards.
export const HUMAN_MODELS=[
  {index:4,id:'snow',name:'Snow',asset:'./model-preview/snow/assets/snow-web.glb',credit:'Snow Rig (CC) Blender Foundation | studio.blender.org'},
  {index:5,id:'gentle',name:'金发男生',asset:'./model-preview/snow/assets/gentle-v6.glb',credit:'Snow Rig (CC) Blender Foundation | studio.blender.org'},
  {index:6,id:'chinese',name:'锁骨发女生',asset:'./model-preview/snow/assets/chinese-female-v6.glb',normalizationHeight:1.6196112214665896,credit:'Rain Rig (CC) Blender Foundation | studio.blender.org'},
  {index:7,id:'chinese-long',name:'长发女生',asset:'./model-preview/snow/assets/chinese-female-v4.glb',credit:'Rain Rig (CC) Blender Foundation | studio.blender.org'},
  {index:8,id:'rain',name:'Rain',asset:'./model-preview/rain/assets/rain-web.glb',credit:'Rain Rig (CC) Blender Foundation | studio.blender.org'},
  {index:9,id:'anime-boy-mascot',name:'动漫男孩',asset:'./assets/imported-characters/anime-boy-mascot/anime-boy-mascot.glb',rig:'imported',credit:'Anime Boy Mascot | AssetFurnace'},
  {index:10,id:'forest-ranger',name:'森林游侠',asset:'./assets/imported-characters/forest-ranger/forest-ranger.glb',rig:'imported',credit:'Forest Ranger | AssetFurnace'},
  {index:11,id:'elf-woman',name:'精灵女生',asset:'./assets/imported-characters/elf-woman/elf-woman.glb',rig:'imported',credit:'Elf Woman | AssetFurnace'},
];

export async function createCharacterAvatar(index){
  const model=HUMAN_MODELS.find(m=>m.index===index);
  if(!model)throw new Error('未知人物模型：'+index);
  const create=model.rig==='imported'?createImportedAvatar:createRainAvatar;
  const avatar=await create({assetUrl:new URL(model.asset,import.meta.url),normalizationHeight:model.normalizationHeight,name:model.id});
  const head=avatar.rest.Head;
  const contacts=model.index===9?{forehead:[0,3.26,.27],side:[.34,3.12,.02]}:model.index===10?{forehead:[-.06,3.62,.19],side:[.24,3.47,.03]}:model.index===11?{forehead:[0,3.62,.28],side:[.24,3.48,.04]}:{forehead:[head.x,head.y+.36,head.z+.28],side:[.28,head.y+.16,head.z+.02]};
  avatar.handContacts=contacts;
  avatar.demo('stand');return avatar;
}

/** Independent bones/morphs for four actors; geometry and textures stay shared. */
export async function createCharacterPool(maxInstances=4,{initialModels=[]}={}){
  const pools=new Map(),pending=new Map(),used=new Set();let disposed=false;
  async function prepare(indices){
    const counts=new Map();
    for(const index of indices)if(HUMAN_MODELS.some(m=>m.index===index))counts.set(index,Math.min(maxInstances,(counts.get(index)||0)+1));
    await Promise.all([...counts].map(async([index,count])=>{
      // Serialize requests for the same asset; each actor still gets independent bones.
      const previous=pending.get(index)||Promise.resolve();
      const next=previous.catch(()=>{}).then(async()=>{
        const pool=pools.get(index)||[];pools.set(index,pool);
        while(!disposed&&pool.length<count){const avatar=await createCharacterAvatar(index);if(disposed){avatar.dispose();return;}pool.push(avatar);}
      });
      pending.set(index,next);
      try{await next;}finally{if(pending.get(index)===next)pending.delete(index);}
    }));
  }
  await prepare(initialModels);
  return {
    prepare,
    acquire(index){const avatar=pools.get(index)?.find(a=>!used.has(a));if(!avatar)return null;used.add(avatar);avatar.demo('stand');avatar.expression();return avatar;},
    release(avatar){avatar.root.removeFromParent();used.delete(avatar);},
    dispose(){disposed=true;for(const pool of pools.values())for(const avatar of pool)avatar.dispose();used.clear();},
    get size(){return [...pools.values()].reduce((n,p)=>n+p.length,0);},
    get modelCount(){return [...pools.values()].filter(p=>p.length).length;}
  };
}
