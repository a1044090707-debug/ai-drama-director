const fs=require('node:fs');let s=fs.readFileSync('index.html','utf8').replace(/\r\n/g,'\n');
function replace(a,b){if(!s.includes(a))throw Error('Missing '+a.slice(0,90));s=s.replace(a,b);}
function section(a,b,value){const start=s.indexOf(a),end=s.indexOf(b,start);if(start<0||end<0)throw Error('Missing '+a);s=s.slice(0,start)+value+s.slice(end);}
replace('style.css?v=8','style.css?v=9');replace('avatar3d.js?v=8','avatar3d.js?v=9');
replace('<script src="motion.js?v=8"></script>','<script src="characters.js?v=9"></script>\n<script src="motion.js?v=9"></script>');
replace("APP_BUILD = 'V0.8 · 立体动物片场'","APP_BUILD = 'V0.9 · 人物与动物片场'");
replace('3D 动物转头预览','3D 角色转头预览');
replace('实时 3D 动物模型已就绪','实时 3D 人物与动物模型已就绪');
replace('<span><svg aria-hidden="true"><use href="#i-mask"/></svg>卡通身份</span></div><div class="avatar-options" id="avatarOptions"></div>', '<span><svg aria-hidden="true"><use href="#i-mask"/></svg>选择角色</span><span class="role-count">人物 + 动物</span></div><div class="role-tabs" role="group" aria-label="角色类别"><button type="button" id="humanTab" aria-pressed="true">人物 · 4</button><button type="button" id="animalTab" aria-pressed="false">动物 · 4</button></div><div class="avatar-options" id="avatarOptions"></div>');
replace('<select id="previewAnimal"><option value="-1">全部角色</option><option value="0">狐狸</option><option value="1">兔子</option><option value="2">小熊</option><option value="3">青蛙</option></select>','<select id="previewAnimal"><option value="-2">人物 · 四款</option><option value="-1">动物 · 四款</option><option value="4">橙帽女生</option><option value="5">眼镜男生</option><option value="6">丸子头</option><option value="7">耳机青年</option><option value="0">狐狸</option><option value="1">兔子</option><option value="2">小熊</option><option value="3">青蛙</option></select>');
section('const avatars = [','const artwork =',"const avatars=Characters.all.map(character=>({...character}));\nlet avatarGroup='human';\n");
replace('let previewAvatars = [0,1,2], selectedPreview = 0;','let previewAvatars = [4,0,5], selectedPreview = 0;');
replace('defaultAvatar = 0','defaultAvatar = 4');
section('function spriteStyle(','const texts=',`function spriteStyle(element,avatar) {
  const a=avatars[avatar];element.setAttribute('data-character',String(avatar));
  if(a.group==='human'){
    element.className+=' human-portrait';const portrait=element.className.includes('player-icon')?a.bust:a.portrait;
    if(portrait)element.style.setProperty('--portrait-image','url("'+portrait+'")');else element.textContent='人';
  }else{
    const index=a.sprite;element.className+=' animal-sprite';element.style.setProperty('--sprite-x',(index%2)*100+'%');element.style.setProperty('--sprite-y',Math.floor(index/2)*100+'%');
  }
}
async function loadHumanPortraits(){
  let renderer;
  const imageFrom=src=>new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=reject;img.src=src;});
  try{
    const humans=avatars.map((a,i)=>({a,i})).filter(item=>item.a.group==='human');
    if(humans.every(item=>item.a.headAsset&&item.a.bustAsset)){
      await Promise.all(humans.map(async({a})=>{a.portrait=a.headAsset;a.bust=a.bustAsset;[a.headImage,a.bustImage]=await Promise.all([imageFrom(a.portrait),imageFrom(a.bust)]);}));
    }else{
      const module=await loadAvatarModule();renderer=module.createAvatarRenderer();
      for(const {a,i} of humans){
        a.portrait=renderer.draw([{id:'thumb-'+i,avatar:i,snap:true,observation:{x:.5,y:.55,rx:.19,ry:.22,rotation:{yaw:.1,pitch:0,roll:0}}}],512,512).toDataURL('image/png');
        a.bust=renderer.draw([{id:'thumb-'+i,avatar:i,portrait:true,snap:true,observation:{x:.5,y:.45,rx:.19,ry:.19,rotation:{yaw:.1,pitch:0,roll:0}}}],512,512).toDataURL('image/png');
        [a.headImage,a.bustImage]=await Promise.all([imageFrom(a.portrait),imageFrom(a.bust)]);
      }
    }
    renderAvatars();renderPlayers(true);if(!stream)drawDemo(demoMode?performance.now()-demoStarted:0);log('人物角色预览已就绪');
  }catch(e){log('人物预览暂未生成：'+errorText(e));}
  finally{renderer?.dispose();}
}
`);
replace("avatars.forEach((a,i)=>{","$('humanTab').setAttribute('aria-pressed',String(avatarGroup==='human'));$('animalTab').setAttribute('aria-pressed',String(avatarGroup==='animal'));\n  avatars.forEach((a,i)=>{if(a.group!==avatarGroup)return;");
replace("selectedPreview=i;}renderPlayers(true);renderAvatars();","selectedPreview=i;}avatarGroup=avatars[currentAvatar()].group;renderPlayers(true);renderAvatars();");
replace("selectedId=tracks[0]?.id??null;renderAvatars();","selectedId=tracks[0]?.id??null;avatarGroup=avatars[currentAvatar()].group;renderAvatars();");
replace("const a=avatars[avatar],image=artwork.heads;","const a=avatars[avatar],image=a.group==='human'?a.headImage:artwork.heads;");
replace("const cell=image.naturalWidth/2,[fx,fy,fw,fh]=a.face;", "const cell=a.group==='human'?image.naturalWidth:image.naturalWidth/2,[fx,fy,fw,fh]=a.face;");
replace("ctx.drawImage(image,(a.sprite%2)*cell,Math.floor(a.sprite/2)*cell,cell,cell,-width*fx,-height*fy,width,height);", "ctx.drawImage(image,a.group==='human'?0:(a.sprite%2)*cell,a.group==='human'?0:Math.floor(a.sprite/2)*cell,cell,cell,-width*fx,-height*fy,width,height);");
replace("ellipse(0,0,rx*1.6,ry*1.6,gradient);", "ellipse(0,0,rx*1.6,ry*1.6,gradient);if(a.group==='human'){ellipse(-rx*.5,-ry*.1,rx*.12,ry*.12,'#44352b');ellipse(rx*.5,-ry*.1,rx*.12,ry*.12,'#44352b');ellipse(0,ry*.5,rx*.28,ry*.07,'#bc796c');}");
replace("if(image?.complete&&image.naturalWidth){const cell=image.naturalWidth/2,size=570;ctx.drawImage(image,(a%2)*cell,Math.floor(a/2)*cell,cell,cell,positions[i]-size/2,95+bob,size,size);}", "if(avatars[a].group==='human'&&avatars[a].bustImage?.complete){ctx.drawImage(avatars[a].bustImage,positions[i]-285,95+bob,570,570);}\n    else if(avatars[a].group==='animal'&&image?.complete&&image.naturalWidth){const cell=image.naturalWidth/2,size=570,index=avatars[a].sprite;ctx.drawImage(image,(index%2)*cell,Math.floor(index/2)*cell,cell,cell,positions[i]-size/2,95+bob,size,size);}");
replace("all=+$('previewAnimal').value<0,types=all?[0,1,2,3]:[+$('previewAnimal').value];", "choice=+$('previewAnimal').value,all=choice<0,types=choice===-2?[4,5,6,7]:choice===-1?[0,1,2,3]:[choice];");
replace("$('preview3d').addEventListener", "$('humanTab').addEventListener('click',()=>{avatarGroup='human';renderAvatars();});$('animalTab').addEventListener('click',()=>{avatarGroup='animal';renderAvatars();});\n$('preview3d').addEventListener");
replace("renderActionGuide();loadArtwork();renderAvatars();", "renderActionGuide();loadArtwork();loadHumanPortraits();renderAvatars();");
fs.writeFileSync('index.html',s);
console.log('Human and animal role groups integrated.');
