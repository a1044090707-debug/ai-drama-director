(function(root, factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.MovieStory=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const ACTIONS={forehead:'扶额',head:'双手抱头',turn:'转头',raise:'单手举高',handsup:'双手举高',wave:'挥手',arms:'展开双臂',tilt:'歪头',mouth:'张嘴'};
  const VERBS={forehead:'扶了扶额头',head:'抱住了脑袋',turn:'转过头',raise:'举起一只手',handsup:'举起双手',wave:'挥了挥手',arms:'展开双臂',tilt:'歪了歪头',mouth:'张大了嘴'};
  const TIPS={forehead:'一只手靠近额头，另一只手放下，保持片刻。',head:'双手放在头部两侧，让两只手腕都留在镜头里。',turn:'手臂放松，缓慢向左或右转头，脸仍要能被镜头看见。',raise:'只举起一只手，手腕超过头顶，另一只手放下并保持不动。',handsup:'两只手同时举过头顶，手腕留在镜头里，保持不动。',wave:'举起一只手，左右挥动至少两个来回。',arms:'双臂向左右展开，手腕接近肩膀高度。',tilt:'双手放下，头向一侧肩膀倾斜，避免同时左右转头。',mouth:'双手放下，面向镜头，明显张开嘴巴。'};
  const SEQUENCES={
    date:[['turn','wave','mouth','head','forehead','arms'],['wave','tilt','mouth','forehead','handsup','head'],['wave','turn','tilt','mouth','raise','handsup']],
    company:[['raise','handsup','mouth','head','forehead','arms'],['wave','raise','tilt','mouth','head','handsup'],['turn','handsup','mouth','forehead','arms','raise']],
    tea:[['turn','raise','mouth','head','tilt','wave'],['wave','arms','tilt','mouth','head','handsup'],['raise','arms','turn','mouth','forehead','wave']]
  };
  const THEMES={
    date:{name:'离谱相亲',titles:['相亲对象，怎么成了我的债主','相亲对象，竟然只会自动回复','我的相亲对象，是拼单群主'],
      opening:'一场普通相亲，正在朝着不普通的方向发展。',
      ending:'本次相亲成功建立长期联系。下次见面，记得带还款计划。',
      prefer:['turn','wave','mouth','head','forehead'],
      beats:[
        n=>`${n}，相亲现场终于有人打破沉默。`,
        n=>`${n}。介绍人说，今天讲究一个坦诚相见。`,
        n=>`${n}。桌上递来的文件，竟是一份还款计划。`,
        n=>`${n}。原来今天的主题，是先还钱再谈缘分。`,
        n=>`${n}。围观亲友已经开始帮忙计算分期。`,
        n=>`${n}。最后双方达成一致，咖啡费也先记账。`]},
    company:{name:'公司继承人',titles:['老板失踪后，全公司只剩三块钱','今天你继承公司，明天你负责加班','我们公司，终于轮到我当家'],
      opening:'老板留下一封信。所有人都以为，自己的机会来了。',
      ending:'继承仪式圆满结束。公司归大家，加班也归大家。',
      prefer:['raise','handsup','arms','head','forehead'],
      beats:[
        n=>`${n}，临时股东大会正式开始。`,
        n=>`${n}。大家纷纷表示，自己早就有管理天赋。`,
        n=>`${n}。秘书打开账本，公司余额只有三块钱。`,
        n=>`${n}。继承人的第一项任务，是替公司充电费。`,
        n=>`${n}。刚才的竞争对手，瞬间成为共同债务人。`,
        n=>`${n}。最后全票通过，先凑钱再谈商业帝国。`]},
    tea:{name:'奶茶争夺战',titles:['最后一杯奶茶，喝出了家族恩怨','这杯全糖，是我们最后的体面','为了奶茶，我们暂时绝交三分钟'],
      opening:'办公室里只剩最后一杯奶茶。每个人都说，那杯属于自己。',
      ending:'奶茶争夺战结束。大家决定重新下单，这次一人一杯。',
      prefer:['turn','arms','wave','tilt','mouth'],
      beats:[
        n=>`${n}，最后一杯奶茶引起了全场注意。`,
        n=>`${n}。大家开始证明，自己才是这杯奶茶的主人。`,
        n=>`${n}。订单小票显示，真正的收件人还没到。`,
        n=>`${n}。争夺暂时停止，所有人开始装作路过。`,
        n=>`${n}。外卖员回来说，这其实是一杯白开水。`,
        n=>`${n}。刚才的恩怨，决定留到下一单再算。`]}
  };
  const ALTERNATES={
    date:[
      {opening:'介绍人保证，这次的嘉宾情绪稳定，而且从不迟到。',ending:'本次相亲没有失败。只是对方需要充电，明天才能继续。',beats:[
        n=>`${n}，准时抵达了这场精心安排的相亲。`,
        n=>`${n}。对方无论听到什么，都回答好的，收到。`,
        n=>`${n}。介绍人终于承认，嘉宾是自动回复机器人。`,
        n=>`${n}。大家决定先试试，它能不能自动买单。`,
        n=>`${n}。机器人回复，您的请求已转交人工处理。`,
        n=>`${n}。人工客服恰好就是介绍人，他正在装忙。`]},
      {opening:'两位嘉宾都说，自己特别重视生活品质。',ending:'缘分最终修成正果。两人加了好友，只为一起凑满减。',beats:[
        n=>`${n}，相亲现场的气氛逐渐热络。`,
        n=>`${n}。大家发现，彼此都特别会精打细算。`,
        n=>`${n}。一个熟悉的群头像，揭开了神秘身份。`,
        n=>`${n}。原来相亲对象，就是每天催拼单的群主。`,
        n=>`${n}。爱情暂时让位，最后一单还差两个人。`,
        n=>`${n}。本场最先确定的关系，是共同收货人。`]}
    ],
    company:[
      {opening:'公司宣布，今天所有人都能竞争总裁职位。',ending:'全员升职成功。从明天起，每个人都是自己的加班负责人。',beats:[
        n=>`${n}，总裁竞选大会正式拉开帷幕。`,
        n=>`${n}。竞选宣言只有一句，我想早点下班。`,
        n=>`${n}。老板点头，说这正是管理层该有的梦想。`,
        n=>`${n}。随后人事宣布，所有人都当选了总裁。`,
        n=>`${n}。大家才发现，总裁只是值班群的新名称。`,
        n=>`${n}。群公告随即更新，今晚由全体总裁值班。`]},
      {opening:'一份神秘遗嘱，把几位普通同事推到了公司顶端。',ending:'商业帝国正式起航。第一笔收入，来自大家合伙卖废纸。',beats:[
        n=>`${n}，准备接手传说中的商业帝国。`,
        n=>`${n}。律师宣布，每个人都能分到核心资产。`,
        n=>`${n}。仓库门打开，里面只有一台打印机。`,
        n=>`${n}。原来公司的核心业务，就是打印创业计划。`,
        n=>`${n}。大家决定，不如先把计划书印成菜单。`,
        n=>`${n}。新任董事会一致同意，先解决午饭。`]}
    ],
    tea:[
      {opening:'最后一杯奶茶就在桌上，所有人都觉得自己最有资格。',ending:'大家终于团结起来。新的共同目标，是追上那位外卖员。',beats:[
        n=>`${n}，发现桌上出现了最后一杯奶茶。`,
        n=>`${n}。为了公平，大家决定先讲清购买经过。`,
        n=>`${n}。故事越讲越长，吸管却已经不见了。`,
        n=>`${n}。外卖员探头问，这杯能不能当辛苦费。`,
        n=>`${n}。所有人同时发现，杯子已经空了。`,
        n=>`${n}。刚才的对手，当场成立了追奶茶联盟。`]},
      {opening:'导演组留下一杯奶茶，说它能看出谁最有戏。',ending:'试镜结束，全员通过。片酬是一杯奶茶，预计下次发放。',beats:[
        n=>`${n}，决定争取这杯命运般的奶茶。`,
        n=>`${n}。竞争越来越激烈，现场开始像一场试镜。`,
        n=>`${n}。导演突然喊停，宣布这一条非常有戏。`,
        n=>`${n}。原来奶茶只是道具，刚才全是临时试镜。`,
        n=>`${n}。大家立刻追问，道具能不能当作片酬。`,
        n=>`${n}。导演答应加预算，给每个人画一杯。`]}
    ]
  };
  function normalize(events){
    const ids=new Set();
    return events.filter(e=>e&&Object.prototype.hasOwnProperty.call(ACTIONS,e.action)&&
      typeof e.id==='string'&&!ids.has(e.id)&&ids.add(e.id)&&Number.isFinite(e.timeMs)&&e.timeMs>=0)
      .map(e=>({...e,actorId:String(e.actorId),actorName:String(e.actorName||'演员').slice(0,16)}))
      .sort((a,b)=>a.timeMs-b.timeMs);
  }
  function chooseTheme(events){
    let best='date',score=-1;
    for(const [key,theme] of Object.entries(THEMES)){
      const found=new Set(events.map(e=>e.action));
      const candidate=theme.prefer.reduce((sum,a)=>sum+(found.has(a)?1:0),0);
      if(candidate>score){best=key;score=candidate;}
    }
    return best;
  }
  function selectEvents(events,theme,limit=6,variant=0){
    const chosen=[],selected=new Set(),actorIds=[...new Set(events.map(e=>e.actorId))];
    const add=e=>{if(e&&!selected.has(e.id)){chosen.push(e);selected.add(e.id);}};
    // Guarantee a shot for every participating actor, then favor varied actions.
    for(const actor of actorIds){
      const choices=events.filter(e=>e.actorId===actor);
      add(choices[variant%choices.length]);
    }
    while(chosen.length<Math.max(limit,actorIds.length)&&chosen.length<events.length){
      const usedActions=new Set(chosen.map(e=>e.action));
      const counts=new Map(actorIds.map(id=>[id,chosen.filter(e=>e.actorId===id).length]));
      const candidates=events.filter(e=>!selected.has(e.id)).map((e,i)=>({e,
        score:(!usedActions.has(e.action)?8:0)+(theme.prefer.includes(e.action)?2:0)-counts.get(e.actorId)*2,
        order:(i+variant)%Math.max(1,events.length)}));
      candidates.sort((a,b)=>b.score-a.score||a.order-b.order);add(candidates[0]?.e);
    }
    return chosen.sort((a,b)=>a.timeMs-b.timeMs).slice(0,8);
  }
  function buildStory(input,{theme='auto',variant=0}={}){
    const events=normalize(input);
    if(!events.length)throw new Error('本局还没有有效动作。请至少触发一次动作台词。');
    const actors=new Set(events.map(e=>e.actorId));
    if(actors.size>4)throw new Error('一局最多保留四位演员，请固定演员席位后重新录制。');
    const key=Object.prototype.hasOwnProperty.call(THEMES,theme)?theme:chooseTheme(events);
    const template=THEMES[key],selected=selectEvents(events,template,6,variant);
    const version=variant%3,story=version?ALTERNATES[key][version-1]:template;
    const scenes=selected.map((event,index)=>{
      const beat=selected.length===1?0:Math.round(index/(selected.length-1)*(story.beats.length-1));
      return {eventId:event.id,actorId:event.actorId,actorName:event.actorName,action:event.action,
        actionName:ACTIONS[event.action],originalLine:event.originalLine,
        narration:story.beats[beat](event.actorName+VERBS[event.action]),
        duration:4,effect:['mouth','head','forehead'].includes(event.action)?'zoom':'normal'};
    });
    return {theme:key,themeName:template.name,title:template.titles[variant%template.titles.length],
      opening:story.opening,ending:story.ending,scenes,
      duration:5+scenes.reduce((total,s)=>total+s.duration,0),
      short:events.length<6};
  }
  function createGuide({theme='date',variant=0,actorNames=['演员甲']}={}){
    const key=Object.prototype.hasOwnProperty.call(THEMES,theme)?theme:'date';
    const version=((Math.trunc(variant)||0)%3+3)%3;
    if(!Array.isArray(actorNames)||!actorNames.length||actorNames.length>4)throw new Error('请选择一至四位演员。');
    const names=actorNames.map(name=>String(name).slice(0,16));
    const template=THEMES[key],story=version?ALTERNATES[key][version-1]:template;
    return {guided:true,theme:key,variant:version,themeName:template.name,title:template.titles[version],
      opening:story.opening,ending:story.ending,duration:29,
      scenes:SEQUENCES[key][version].map((action,index)=>{
        const actor=index%names.length,name=names[actor];
        return {id:'guide-'+index,actorId:'actor-'+actor,actorName:name,action,actionName:ACTIONS[action],
          tip:TIPS[action],narration:story.beats[index](name+VERBS[action]),duration:4,
          effect:['mouth','head','forehead'].includes(action)?'zoom':'normal'};
      })};
  }
  function buildGuidedStory(guide,input){
    const events=normalize(input);
    if(!guide||guide.scenes.length!==6)throw new Error('缺少拍摄剧本，请重新选择短片。');
    const scenes=guide.scenes.map(step=>{
      const event=events.find(e=>e.guideStep===step.id&&e.action===step.action&&e.actorId===step.actorId);
      if(!event)throw new Error('剧本尚未拍完，请完成六个分镜后再生成。');
      return {...step,eventId:event.id,originalLine:event.originalLine};
    });
    return {...guide,scenes,short:false};
  }
  return {ACTIONS,TIPS,THEMES,SEQUENCES,normalize,chooseTheme,selectEvents,buildStory,createGuide,buildGuidedStory};
});
