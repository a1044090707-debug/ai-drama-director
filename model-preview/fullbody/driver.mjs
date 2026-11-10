import * as T from '../../vendor/three.module.js';
const V=(p)=>new T.Vector3(p.x,-p.y,-p.z),clamp=T.MathUtils.clamp;
const valid=(p)=>p&&[p.x,p.y,p.z].every(Number.isFinite)&&(p.visibility??1)>.55;
const midpoint=(a,b)=>a.clone().add(b).multiplyScalar(.5);

/** Retargets each visible limb independently; missing lower-body data is neutral. */
export class AvatarDriver{
  constructor(avatar){this.avatar=avatar;this.targets=Object.fromEntries(avatar.boneList.map(b=>[b.name,(avatar.neutralWorldQuaternions?.[b.name]||new T.Quaternion()).clone()]));this.current={};this.expression={};this.lastSeen=-Infinity;this.legsVisible=false;this.feetVisible=false;this.rootY=0;}
  direction(name,child,direction){
    if(direction.lengthSq()<1e-7)return;
    const a=this.avatar,rest=a.rest[child].clone().sub(a.rest[name]).normalize();
    this.targets[name]=new T.Quaternion().setFromUnitVectors(rest,direction.normalize()).multiply(a.restWorldQuaternions?.[name]||new T.Quaternion());
  }
  update({worldLandmarks,landmarks,faceMatrix,blendshapes,headRotation,action},time){
    const a=this.avatar,w=worldLandmarks,p=landmarks;this.lastSeen=time;this.legsVisible=false;this.feetVisible=false;
    // Start with neutral WORLD orientations. Upper body and each limb then
    // override independently, so an occluded leg cannot keep a stale bent pose.
    for(const key of Object.keys(this.targets))this.targets[key].copy(a.neutralWorldQuaternions?.[key]||new T.Quaternion());
    const visible=(ids)=>w&&ids.every(i=>valid(w[i])&&(!p||((p[i]?.visibility??1)>.55&&p[i]?.y>=-.04&&p[i]?.y<=1.04)));
    this.contactAction=action==='forehead'||action==='head'?action:null;
    this.contactSides=['Left','Right'].filter((side,i)=>visible(i===0?[11,13,15]:[12,14,16])&&w[i===0?15:16].y<w[i===0?11:12].y);
    if(action==='forehead'&&this.contactSides.length>1){const nose=valid(w[0])?V(w[0]):new T.Vector3(0,-.6,0);this.contactSides.sort((a,b)=>V(w[a==='Left'?15:16]).distanceToSquared(nose)-V(w[b==='Left'?15:16]).distanceToSquared(nose));this.contactSides.length=1;}
    if(visible([11,12,23,24])){
      const left=V(w[11]),right=V(w[12]),hips=midpoint(V(w[23]),V(w[24])),up=midpoint(left,right).sub(hips).normalize();
      const x=left.clone().sub(right).normalize(),z=x.clone().cross(up).normalize(),y=z.clone().cross(x).normalize();
      if(z.lengthSq()>.5){const q=new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(x,y,z)),e=new T.Euler().setFromQuaternion(q,'YXZ');e.x=clamp(e.x,-.65,.65);e.y=clamp(e.y,-1,1);e.z=clamp(e.z,-.55,.55);q.setFromEuler(e);for(const [name,factor] of [['Hips',.35],['Spine',.7],['Chest',1],['Neck',1],['Head',1]])this.targets[name].identity().slerp(q,factor).multiply(a.restWorldQuaternions?.[name]||new T.Quaternion());}
    }
    for(const [side,ids] of [['Left',[11,13,15,23,25,27,29,31]],['Right',[12,14,16,24,26,28,30,32]]]){
      const [s,e,h,hip,knee,ankle,heel,toe]=ids;
      if(visible([s,e]))this.direction(side+'UpperArm',side+'ForeArm',V(w[e]).sub(V(w[s])));
      if(visible([e,h]))this.direction(side+'ForeArm',side+'Hand',V(w[h]).sub(V(w[e])));
      const armDelta=this.targets[side+'ForeArm'].clone().multiply((a.restWorldQuaternions?.[side+'ForeArm']||new T.Quaternion()).clone().invert());
      this.targets[side+'Hand'].copy(armDelta).multiply(a.restWorldQuaternions?.[side+'Hand']||new T.Quaternion());
      if(visible([hip,knee,ankle])){
        this.legsVisible=true;this.direction(side+'UpperLeg',side+'LowerLeg',V(w[knee]).sub(V(w[hip])));this.direction(side+'LowerLeg',side+'Foot',V(w[ankle]).sub(V(w[knee])));
        // Foot orientation is estimated from heel/foot-index landmarks. A missing
        // heel/toe leaves the foot level rather than inventing toe articulation.
        if(visible([ankle,heel,toe])){
          this.feetVisible=true;const forward=V(w[toe]).sub(V(w[heel]));forward.y=clamp(forward.y,-.12,.12);if(forward.lengthSq()>1e-7)this.targets[side+'Foot'].setFromUnitVectors(new T.Vector3(0,0,1),forward.normalize()).multiply(a.restWorldQuaternions?.[side+'Foot']||new T.Quaternion());
          const delta=this.targets[side+'Foot'].clone().multiply((a.restWorldQuaternions?.[side+'Foot']||new T.Quaternion()).clone().invert());this.targets[side+'Toe'].copy(delta).multiply(a.restWorldQuaternions?.[side+'Toe']||new T.Quaternion());
        }
      }
    }
    if(faceMatrix?.length===16&&faceMatrix.every(Number.isFinite)){
      const matrix=new T.Matrix4().fromArray(faceMatrix),q=new T.Quaternion();matrix.decompose(new T.Vector3(),q,new T.Vector3());q.normalize();
      const e=new T.Euler().setFromQuaternion(q,'YXZ');e.x=clamp(e.x,-.65,.65);e.y=clamp(e.y,-1.25,1.25);e.z=clamp(e.z,-.6,.6);this.targets.Head.setFromEuler(e).multiply(a.restWorldQuaternions?.Head||new T.Quaternion());
    }else if(headRotation){this.targets.Head.setFromEuler(new T.Euler(headRotation.pitch||0,headRotation.yaw||0,headRotation.roll||0,'YXZ')).multiply(a.restWorldQuaternions?.Head||new T.Quaternion());}
    const b=Object.fromEntries((blendshapes||[]).map(c=>[c.categoryName,c.score]));
    this.expression={jawOpen:clamp(b.jawOpen||0,0,1),eyeBlinkLeft:clamp(b.eyeBlinkLeft||0,0,1),eyeBlinkRight:clamp(b.eyeBlinkRight||0,0,1),mouthSmile:clamp(((b.mouthSmileLeft||0)+(b.mouthSmileRight||0))*.5,0,1)};
  }
  frame(dt,time){
    const a=this.avatar,stale=time-this.lastSeen>500,alpha=1-Math.exp(-Math.min(dt,.1)/(stale?.23:.075));
    a.root.updateMatrixWorld(true);
    // Convert desired world orientations back to each joint's parent space.
    for(const bone of a.boneList){
      if(bone.name==='Root')continue;
      const world=stale?(a.neutralWorldQuaternions?.[bone.name]||new T.Quaternion()):this.targets[bone.name],base=a.root.getWorldQuaternion(new T.Quaternion()),parent=bone.parent.getWorldQuaternion(new T.Quaternion()),local=parent.invert().multiply(base.multiply(world));
      bone.quaternion.slerp(local,alpha);bone.updateMatrixWorld(true);
    }
    if(!stale&&this.contactAction&&a.handContacts){
      // Keep hand-to-head contact after retargeting between different head and
      // arm proportions. Other joints continue to follow their measured pose.
      for(const side of this.contactSides){
        const sign=side==='Left'?1:-1,coordinates=this.contactAction==='forehead'?a.handContacts.forehead:a.handContacts.side;
        const target=new T.Vector3(this.contactAction==='head'?coordinates[0]*sign:coordinates[0],coordinates[1],coordinates[2]).sub(a.rest.Head);
        target.applyQuaternion((a.restWorldQuaternions?.Head||new T.Quaternion()).clone().invert()).applyQuaternion(a.bones.Head.getWorldQuaternion(new T.Quaternion())).add(a.bones.Head.getWorldPosition(new T.Vector3()));this.reach(side,target);
      }
    }
    const values={};for(const name of ['jawOpen','eyeBlinkLeft','eyeBlinkRight','mouthSmile']){const target=stale?0:(this.expression[name]||0);this.current[name]=(this.current[name]||0)+(target-(this.current[name]||0))*alpha;values[name]=this.current[name];}a.expression(values);
    // Keep the lowest supporting foot on the stage. This is visual floor
    // anchoring, not a recovered real-world floor or full foot-contact solver.
    a.root.position.y=0;a.ground();const targetY=a.root.position.y;this.rootY+=(targetY-this.rootY)*(1-Math.exp(-dt/.07));a.root.position.y=this.rootY;a.root.updateMatrixWorld(true);
  }
  reach(side,target){
    const a=this.avatar,upper=a.bones[side+'UpperArm'],fore=a.bones[side+'ForeArm'],hand=a.bones[side+'Hand'];
    const shoulder=upper.getWorldPosition(new T.Vector3()),oldElbow=fore.getWorldPosition(new T.Vector3()),oldHand=hand.getWorldPosition(new T.Vector3());
    const l1=shoulder.distanceTo(oldElbow),l2=oldElbow.distanceTo(oldHand),axis=target.clone().sub(shoulder),distance=clamp(axis.length(),Math.abs(l1-l2)+.001,l1+l2-.005);axis.normalize();
    const pole=new T.Vector3(side==='Left'?1:-1,0,.35).applyQuaternion(a.root.getWorldQuaternion(new T.Quaternion()));pole.addScaledVector(axis,-pole.dot(axis)).normalize();
    const along=(l1*l1-l2*l2+distance*distance)/(2*distance),height=Math.sqrt(Math.max(0,l1*l1-along*along)),elbow=shoulder.clone().addScaledVector(axis,along).addScaledVector(pole,height),wrist=shoulder.clone().addScaledVector(axis,distance);
    const upperWorld=new T.Quaternion().setFromUnitVectors(oldElbow.clone().sub(shoulder).normalize(),elbow.clone().sub(shoulder).normalize()).multiply(upper.getWorldQuaternion(new T.Quaternion()));
    upper.quaternion.copy(upper.parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(upperWorld));upper.updateMatrixWorld(true);
    const foreWorld=new T.Quaternion().setFromUnitVectors(hand.getWorldPosition(new T.Vector3()).sub(elbow).normalize(),wrist.clone().sub(elbow).normalize()).multiply(fore.getWorldQuaternion(new T.Quaternion()));
    fore.quaternion.copy(fore.parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(foreWorld));fore.updateMatrixWorld(true);
  }
}

export function matchActors(previous,poses,time,maxPlayers=4){
  const tracks=previous.filter(t=>time-t.lastSeen<1200),pairs=[];tracks.forEach(t=>t.visible=false);
  tracks.forEach((t,i)=>poses.forEach((p,j)=>{const d=Math.hypot(t.x-p.x,t.y-p.y);if(d<.25)pairs.push({i,j,d});}));pairs.sort((a,b)=>a.d-b.d);
  const usedT=new Set(),usedP=new Set();for(const {i,j} of pairs){if(usedT.has(i)||usedP.has(j))continue;Object.assign(tracks[i],poses[j],{lastSeen:time,visible:true});usedT.add(i);usedP.add(j);}
  let next=previous.reduce((m,t)=>Math.max(m,t.id),0)+1;
  poses.forEach((p,j)=>{if(!usedP.has(j)&&tracks.length<maxPlayers)tracks.push({...p,id:next++,lastSeen:time,visible:true});});return tracks;
}
