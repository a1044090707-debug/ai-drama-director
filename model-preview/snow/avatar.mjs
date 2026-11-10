import {createRainAvatar} from '../rain/avatar.mjs';
export const characters={
  snow:{label:'原版 Snow',description:'保留 Blender Studio 原版的脸型、发型、身材和服装。支持全身动作与基础表情测试。',asset:'./assets/snow-web.glb',credit:'Snow Rig (CC) Blender Foundation | studio.blender.org'},
  gentle:{label:'新版 · 金发偏分',description:'完整全身角色，包含双腿、双脚和鞋子。修正下巴与脖子的衔接，保留大眼睛与连续的偏分发型。',asset:'./assets/gentle-v6.glb',blend:'../gentle-draft/gentle-draft-v6.blend',credit:'Snow Rig (CC) Blender Foundation | studio.blender.org'},
  chinese:{label:'女生 · 偏分锁骨发',description:'按确认的设计制作偏分刘海、锁骨层次和内扣发尾。沿用上一版脸型，头部大小已恢复到缩小前的比例，脸型和五官保持原样。完整全身与双脚。',normalizationHeight:1.6196112214665896,asset:'./assets/chinese-female-v6.glb',blend:'../chinese-female/chinese-female-v6.blend',credit:'Rain Rig (CC) Blender Foundation | studio.blender.org'},
};
/** Omitted options still load the unchanged original Snow. */
export function createSnowAvatar({variant='snow'}={}){
  const character=characters[variant];
  if(!character)throw new Error('未知角色：'+variant);
  return createRainAvatar({assetUrl:new URL(character.asset,import.meta.url),normalizationHeight:character.normalizationHeight,name:variant==='snow'?'Snow_Character01':variant==='chinese'?'Chinese_Female_V6':'Gentle_Blond_V6'});
}
