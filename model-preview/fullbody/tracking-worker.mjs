let face=null,pose=null,busy=false;
const VERSION='0.10.21';
async function setup(players){
  const sources=['https://cdn.jsdelivr.net/npm','https://unpkg.com'];let error;
  for(const source of sources){try{
    postMessage({type:'status',message:'正在加载动作识别模型…'});
    const root=source+'/@mediapipe/tasks-vision@'+VERSION,mod=await import(root+'/vision_bundle.mjs'),lib=mod.FaceLandmarker?mod:mod.default,vision=await lib.FilesetResolver.forVisionTasks(root+'/wasm');
    const base='https://storage.googleapis.com/mediapipe-models/';
    face=await lib.FaceLandmarker.createFromOptions(vision,{baseOptions:{modelAssetPath:base+'face_landmarker/face_landmarker/float16/1/face_landmarker.task',delegate:'CPU'},runningMode:'VIDEO',numFaces:players,outputFaceBlendshapes:true,outputFacialTransformationMatrixes:true});
    pose=await lib.PoseLandmarker.createFromOptions(vision,{baseOptions:{modelAssetPath:base+'pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',delegate:'CPU'},runningMode:'VIDEO',numPoses:players,minPosePresenceConfidence:.5,minTrackingConfidence:.5});
    postMessage({type:'ready'});return;
  }catch(e){face?.close();pose?.close();face=pose=null;error=e;}}
  throw error;
}
self.onmessage=async({data})=>{
  if(data.type==='init'){try{await setup(data.players||1);}catch(e){postMessage({type:'error',message:'识别模型未能加载：'+e.message});}return;}
  if(data.type!=='frame'||busy||!face||!pose){data.image?.close();return;}
  busy=true;const started=performance.now();
  try{const f=face.detectForVideo(data.image,data.time),p=pose.detectForVideo(data.image,data.time);postMessage({type:'result',time:data.time,ms:performance.now()-started,faces:f.faceLandmarks,matrices:(f.facialTransformationMatrixes||[]).map(m=>Array.from(m.data)),blendshapes:(f.faceBlendshapes||[]).map(x=>x.categories),poses:p.landmarks,world:p.worldLandmarks});}
  catch(e){postMessage({type:'frame-error',message:e.message});}
  finally{data.image.close();busy=false;}
};
