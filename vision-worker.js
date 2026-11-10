// One frame at a time. Both detectors see the same image and timestamp.
let face, pose;
async function detector(Class, files, path, options) {
  let failure;
  // Leave the GPU available to Three.js; inference runs on the worker's CPU.
  for (const delegate of ['CPU', 'GPU']) {
    try {
      const result = await Class.createFromOptions(files, {
        baseOptions: {modelAssetPath:path, delegate}, runningMode:'VIDEO', ...options
      });
      self.postMessage({type:'log', message:'后台识别 '+delegate+' 已就绪'});
      return result;
    } catch(error) { failure = error; }
  }
  throw failure;
}
self.onmessage = async ({data}) => {
  const {id, type} = data;
  try {
    if (type === 'init') {
      const base = 'https://storage.googleapis.com/mediapipe-models/';
      let failure;
      for (const source of ['https://cdn.jsdelivr.net/npm', 'https://unpkg.com']) {
        try {
          const root = source+'/@mediapipe/tasks-vision@0.10.21';
          const mod = await import(root+'/vision_bundle.mjs'), lib = mod.FaceLandmarker ? mod : mod.default;
          const files = await lib.FilesetResolver.forVisionTasks(root+'/wasm');
          face ??= await detector(lib.FaceLandmarker, files, base+'face_landmarker/face_landmarker/float16/1/face_landmarker.task', {
            numFaces:data.count, outputFaceBlendshapes:true, outputFacialTransformationMatrixes:true,
            minFaceDetectionConfidence:.5, minFacePresenceConfidence:.5, minTrackingConfidence:.5
          });
          pose ??= await detector(lib.PoseLandmarker, files, base+'pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task', {
            numPoses:data.count, minPoseDetectionConfidence:.5, minPosePresenceConfidence:.5, minTrackingConfidence:.5
          });
          self.postMessage({id, type:'ready'}); return;
        } catch(error) { failure = error; }
      }
      throw failure;
    }
    if (type === 'detect') {
      const started = performance.now();
      try {
        const fr = face.detectForVideo(data.bitmap, data.at);
        const pr = pose.detectForVideo(data.bitmap, data.at);
        self.postMessage({id, type:'result', fr, pr, ms:performance.now()-started});
      } finally { data.bitmap.close(); }
    }
  } catch(error) {
    self.postMessage({id, type:'error', message:error?.message || String(error)});
  }
};
