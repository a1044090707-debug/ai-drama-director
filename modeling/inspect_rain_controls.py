import bpy,json
rig=bpy.data.objects['RIG-rain']
for name in ['MSTR-Jaw','MSTR-Eyering_Upper.L','MSTR-Eyering_Lower.L','MSTR-Mouth','MSTR-Eyering.L','MSTR-Eye.L']:
    b=rig.pose.bones[name]
    print('CONTROL',name,'loc',list(b.location),'rotmode',b.rotation_mode,'axes',[list(b.bone.matrix_local.col[i]) for i in range(3)],'locks',list(b.lock_location),flush=True)
    for c in b.constraints:
        print('CONSTRAINT',c.name,c.type,flush=True)
for name in ['GEO-rain-head','GEO-rain-gums_lower']:
    keys=bpy.data.objects[name].data.shape_keys
    if not keys.animation_data:continue
    for fc in keys.animation_data.drivers:
        if any(t in fc.data_path for t in ['mouth_open','EyelidsClose','Smile']):
            print('KEYDRIVER',name,fc.data_path,fc.driver.expression,[(v.name,v.type,[{'path':t.data_path,'bone':t.bone_target,'type':t.transform_type,'space':t.transform_space} for t in v.targets]) for v in fc.driver.variables],flush=True)
print('FACEBONES',[b.name for b in rig.pose.bones if b.name.startswith(('MSTR-','FK-')) and any(t in b.name for t in ['Lid','Eye','Jaw','Lip','Mouth'])],flush=True)
