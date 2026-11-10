(function(root){
  'use strict';
  const workerURL=new URL('vision-worker.js?v=14',document.currentScript?.src||document.baseURI);
  class VisionClient {
    constructor(onLog=()=>{}) {
      // MediaPipe 0.10.21's Wasm loader uses importScripts, requiring a classic worker.
      this.worker=new Worker(workerURL);
      this.pending=new Map(); this.nextId=1; this.closed=false;
      this.worker.onmessage=({data})=>{
        if(data.type==='log'){onLog(data.message);return;}
        const request=this.pending.get(data.id); if(!request)return;
        this.pending.delete(data.id);clearTimeout(request.timer);
        if(data.type==='error')request.reject(new Error(data.message));else request.resolve(data);
      };
      this.worker.onerror=event=>this.close(new Error(event.message||'后台识别线程启动失败'));
      this.worker.onmessageerror=()=>this.close(new Error('后台识别结果读取失败'));
    }
    request(data, transfers=[], timeout=45000) {
      if(this.closed)return Promise.reject(new Error('后台识别已关闭'));
      return new Promise((resolve,reject)=>{
        const id=this.nextId++;
        const timer=setTimeout(()=>this.close(new Error('后台识别等待超时，请检查网络后重新连接')),timeout);
        this.pending.set(id,{resolve,reject,timer});
        try{this.worker.postMessage({...data,id},transfers);}catch(error){this.pending.delete(id);clearTimeout(timer);reject(error);}
      });
    }
    init(count){return this.request({type:'init',count});}
    async detect(canvas,at) {
      const bitmap=await createImageBitmap(canvas);
      if(this.closed){bitmap.close();throw new Error('后台识别已关闭');}
      try{return await this.request({type:'detect',bitmap,at},[bitmap],20000);}
      catch(error){bitmap.close();throw error;}
    }
    close(error=new Error('后台识别已关闭')) {
      if(this.closed)return;this.closed=true;this.worker.terminate();
      for(const request of this.pending.values()){clearTimeout(request.timer);request.reject(error);}
      this.pending.clear();
    }
  }
  root.VisionClient=VisionClient;
})(globalThis);
