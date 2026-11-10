(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();else root.Characters=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const all=[
    {name:'狐狸',alias:'阿狐',group:'animal',color:'#eca455',light:'#f8e5bd',type:'fox',sprite:0,face:[.5,.65,.78,.6]},
    {name:'兔子',alias:'小兔',group:'animal',color:'#f3e7d6',light:'#fff8e8',type:'rabbit',sprite:1,face:[.5,.7,.78,.54]},
    {name:'小熊',alias:'小熊',group:'animal',color:'#c0936d',light:'#ead8be',type:'bear',sprite:2,face:[.5,.56,.84,.76]},
    {name:'青蛙',alias:'呱呱',group:'animal',color:'#b6c780',light:'#ecedcb',type:'frog',sprite:3,face:[.5,.56,.9,.75]},
    {name:'Snow',alias:'Snow',group:'human',color:'#bc8767',light:'#efd2ac',type:'snow',face:[.5,.5,.78,.78]},
    {name:'金发男生',alias:'小金',group:'human',color:'#edc7b0',light:'#fff1d9',type:'gentle',face:[.5,.5,.78,.78]},
    {name:'锁骨发女生',alias:'小岚',group:'human',color:'#e4bda8',light:'#fff0dd',type:'chinese',face:[.5,.5,.78,.78]},
    {name:'长发女生',alias:'小墨',group:'human',color:'#e4bda8',light:'#fff0dd',type:'chinese-long',face:[.5,.5,.78,.78]},
    {name:'Rain',alias:'Rain',group:'human',color:'#be947b',light:'#efdbbb',type:'rain',face:[.5,.5,.78,.78]},
    {name:'动漫男孩',alias:'小蓝',group:'human',color:'#80a6cc',light:'#e1edfa',type:'anime-boy-mascot',jawOnly:true,face:[.5,.5,.78,.78]},
    {name:'森林游侠',alias:'游侠',group:'human',color:'#7b8961',light:'#e8eddc',type:'forest-ranger',jawOnly:true,face:[.5,.5,.78,.78]},
    {name:'精灵女生',alias:'银叶',group:'human',color:'#92a795',light:'#eaf0e9',type:'elf-woman',jawOnly:true,face:[.5,.5,.78,.78]}

  ];
  return {all,validIndex:index=>Number.isInteger(index)&&index>=0&&index<all.length};
});

