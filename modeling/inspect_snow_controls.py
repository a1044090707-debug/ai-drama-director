import bpy,json
from pathlib import Path
rig=bpy.data.objects['RIG-Snow'];data={}
for name in ['Jaw','MSTR-Eyelid_Upper.L','MSTR-Eyelid_Lower.L','MSTR-Eye_Ring_Upper.L','MSTR-Eye_Ring_Lower.L','DEF-Hips','DEF-Spine','DEF-RibCage','DEF-Chest','DEF-Neck','DEF-Head','DEF-Shoulder.L','DEF-UpperArm_1.L','DEF-Forearm_1.L','DEF-Wrist.L','DEF-Thigh_1.L','DEF-Knee_1.L','DEF-Foot.L','DEF-Toes.L']:
    b=rig.pose.bones[name];data[name]={'head':list(b.bone.head_local),'tail':list(b.bone.tail_local),'mode':b.rotation_mode,'location':list(b.location),'axes':[list(b.bone.matrix_local.to_3x3().col[i]) for i in range(3)],'props':{k:str(v) for k,v in b.items()}}
head=bpy.data.objects['GEO-snow-head'].data.shape_keys
data['shape_keys']=[k.name for k in head.key_blocks]
data['drivers']=[{'path':d.data_path,'expression':d.driver.expression,'vars':[{'name':v.name,'targets':[{'bone':t.bone_target,'transform':t.transform_type,'path':t.data_path} for t in v.targets]} for v in d.driver.variables]} for d in head.animation_data.drivers]
Path('model-preview/snow/assets/source-controls.json').write_text(json.dumps(data,indent=2))
print(json.dumps(data,indent=2))
