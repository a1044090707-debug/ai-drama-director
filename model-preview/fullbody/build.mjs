import {writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createFullBodyAvatar} from './model.mjs';
import {exportRigGLB} from './export-rig.mjs';
const base=new URL('./assets/',import.meta.url);await mkdir(base,{recursive:true});
const avatar=createFullBodyAvatar();
await writeFile(new URL('orange-girl-fullbody-v3.glb',base),exportRigGLB(avatar));
await writeFile(new URL('model-info.json',base),JSON.stringify({...avatar.stats(),style:'orange cap, wavy chestnut hair, sage hoodie, dark trousers, cream sneakers',geometry:'parametric full-body skin; no reference-image color projection',bones:avatar.boneList.map(b=>({name:b.name,parent:b.parent?.isBone?b.parent.name:null})),limitations:['Simplified stylized face and hair; does not reproduce every detail of the reconstructed sculpt.','Camera tracking estimates ankle and foot direction; individual toe articulation is not measured.','Real-person multi-player performance must be measured on the target device.']},null,2));
console.log('Built',fileURLToPath(new URL('orange-girl-fullbody-v3.glb',base)),avatar.stats());avatar.dispose();
