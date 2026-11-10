// Synthetic observations for the nine named previews and the regression
// fixtures. Live camera frames use the detector's landmarks, never this data.
export const ACTION_IDS=['forehead','head','turn','raise','handsup','wave','arms','tilt','mouth'];
export function actionObservation(action,time=0){
  const world=Array.from({length:33},()=>({x:0,y:0,z:0,visibility:0}));
  const set=(id,x,y,z=0)=>world[id]={x,y,z,visibility:1};
  set(0,0,-.58);set(11,.16,-.35);set(12,-.16,-.35);set(13,.23,-.08);set(14,-.23,-.08);set(15,.28,.16);set(16,-.28,.16);
  set(23,.11,.03);set(24,-.11,.03);set(25,.11,.40);set(26,-.11,.40);set(27,.11,.80);set(28,-.11,.80);
  set(29,.11,.84,.02);set(30,-.11,.84,.02);set(31,.11,.84,-.14);set(32,-.11,.84,-.14);
  if(action==='forehead'){set(13,.37,-.40,-.05);set(15,.02,-.69,-.16);}
  if(action==='head'){set(13,.37,-.40,-.02);set(14,-.37,-.40,-.02);set(15,.10,-.61,-.10);set(16,-.10,-.61,-.10);}
  if(action==='raise'||action==='handsup'){set(13,.24,-.65);set(15,.26,-.97);}
  if(action==='handsup'){set(14,-.24,-.65);set(16,-.26,-.97);}
  if(action==='wave'){set(13,.34,-.50);set(15,.34+Math.sin(time*7)*.13,-.80);}
  if(action==='arms'){set(13,.42,-.35);set(14,-.42,-.35);set(15,.68,-.35);set(16,-.68,-.35);}
  const pose=world.map(p=>({...p,x:.5+p.x*.65,y:.65+p.y*.58}));
  const points=Array.from({length:478},()=>({x:.5,y:.4,z:0}));
  points[33]={x:.4,y:.4,z:0};points[263]={x:.6,y:action==='tilt'?.50:.4,z:0};points[1]={x:action==='turn'?.57:.5,y:.45,z:-.04};
  points[10]={x:.5,y:.25,z:0};points[152]={x:.5,y:.65,z:0};points[13]={x:.5,y:.51,z:0};points[14]={x:.5,y:action==='mouth'?.60:.52,z:0};
  return {worldPose:world,pose,points,rotation:{yaw:action==='turn'?.65:0,pitch:0,roll:action==='tilt'?-.45:0},expression:{jaw:action==='mouth'?.9:0},blendshapes:[{categoryName:'jawOpen',score:action==='mouth'?.9:0}]};
}
