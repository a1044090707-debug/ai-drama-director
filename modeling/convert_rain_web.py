"""Convert Blender Studio Rain to a web rig while preserving authored geometry.

Run with the original .blend already loaded. Original files are never overwritten.
Source material base colors are UV-baked without lighting. Facial poses are
evaluated through Rain's native controls, then stored as portable shape keys.
"""
from pathlib import Path
import json,math,hashlib
import bpy
import numpy as np
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'model-preview/rain/assets';OUT.mkdir(parents=True,exist_ok=True)
CACHE=ROOT/'.modeling/third-party/rain/baked';CACHE.mkdir(parents=True,exist_ok=True)
SOURCE=bpy.data.objects['RIG-rain']
if bpy.context.object and bpy.context.object.mode!='OBJECT':bpy.ops.object.mode_set(mode='OBJECT')
ORIGINAL=[o for o in bpy.context.scene.objects if o.type=='MESH' and o.visible_get() and not o.hide_render and o.name!='GEO-rain-eye_cornea']
FACIAL={'GEO-rain-head','GEO-rain-eyelashes','GEO-rain-eyebrows','GEO-rain-gums_lower','GEO-rain-gums_upper','GEO-rain-tongue'}
for o in ORIGINAL:
    for mod in o.modifiers:
        if mod.type=='SUBSURF':mod.levels=mod.render_levels=1
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=1
scene.render.bake.margin=12;scene.render.bake.use_clear=True

def freeze_uv(nodes,links,name):
    uv=nodes.new('ShaderNodeUVMap');uv.uv_map=name
    for n in list(nodes):
        if n.type=='TEX_IMAGE' and not n.inputs['Vector'].is_linked:links.new(uv.outputs['UV'],n.inputs['Vector'])
        if n.type=='TEX_COORD':
            for l in list(n.outputs['UV'].links):links.new(uv.outputs['UV'],l.to_socket)

def bake_color(obj):
    uv=obj.data.uv_layers.active
    if uv is None:raise RuntimeError('Missing UVs: '+obj.name)
    oldname=uv.name;coords=np.array([d.uv[:] for d in uv.data])
    lo=np.floor(coords.min(0)+1e-5);hi=np.ceil(coords.max(0)-1e-5);span=np.maximum(hi-lo,1)
    target=obj.data.uv_layers.new(name='WebUV');target.active_render=True
    for d,co in zip(target.data,(coords-lo)/span):d.uv=co
    obj.data.uv_layers.active=target
    path=CACHE/(obj.name+'.png')
    size=2048 if obj.name=='GEO-rain-head' else 1024 if any(x in obj.name for x in ['body','jeans','top','hair_main']) else 512
    if path.exists():image=bpy.data.images.load(str(path),check_existing=True)
    else:
        image=bpy.data.images.new(obj.name+'_Albedo',width=size,height=size,alpha=False)
        original_mats=list(obj.data.materials)
        for i,original in enumerate(original_mats):
            material=original.copy();material.name=original.name+'_Bake_'+obj.name;obj.data.materials[i]=material
            nodes=material.node_tree.nodes;links=material.node_tree.links;freeze_uv(nodes,links,oldname)
            output=next((n for n in nodes if n.type=='OUTPUT_MATERIAL' and n.is_active_output),None)
            principled=[n for n in nodes if n.type=='BSDF_PRINCIPLED' and n.outputs['BSDF'].is_linked]
            if not output:raise RuntimeError('Missing material output: '+original.name)
            emission=nodes.new('ShaderNodeEmission')
            if principled:
                p=principled[-1]
                if p.inputs['Base Color'].is_linked:links.new(p.inputs['Base Color'].links[0].from_socket,emission.inputs['Color'])
                else:emission.inputs['Color'].default_value=p.inputs['Base Color'].default_value
            else:emission.inputs['Color'].default_value=(1,1,1,1) if 'eyedot' in original.name else original.diffuse_color
            emission.inputs['Strength'].default_value=1;links.new(emission.outputs[0],output.inputs['Surface'])
            node=nodes.new('ShaderNodeTexImage');node.image=image;nodes.active=node
        bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
        print('BAKE_START',obj.name,size,flush=True);bpy.ops.object.bake(type='EMIT')
        image.filepath_raw=str(path);image.file_format='PNG';image.save()
        for i,m in enumerate(original_mats):obj.data.materials[i]=m
        print('BAKE_DONE',obj.name,path.stat().st_size,flush=True)
    return image

baked={o.name:bake_color(o) for o in ORIGINAL}
# Restore all source face controls before evaluating every pose.
controls=['MSTR-Jaw','MSTR-Eyering_Upper.L','MSTR-Eyering_Lower.L','MSTR-Eyering_Upper.R','MSTR-Eyering_Lower.R']
neutral={name:SOURCE.pose.bones[name].matrix_basis.copy() for name in controls}
head_keys=bpy.data.objects['GEO-rain-head'].data.shape_keys
def pose(name):
    for key,matrix in neutral.items():SOURCE.pose.bones[key].matrix_basis=matrix
    for key in ['Smile.L','Smile.R']:
        if key in head_keys.key_blocks:
            # Smile is a source-authored corrective, converted to an explicit key.
            if head_keys.animation_data:
                for fc in head_keys.animation_data.drivers:
                    if fc.data_path=='key_blocks["'+key+'"].value':fc.mute=True
            head_keys.key_blocks[key].value=0
    if name=='jawOpen':SOURCE.pose.bones['MSTR-Jaw'].rotation_euler.x=.36
    if name.startswith('eyeBlink'):
        s='L' if name.endswith('Left') else 'R'
        SOURCE.pose.bones['MSTR-Eyering_Upper.'+s].location.y=-.040
        SOURCE.pose.bones['MSTR-Eyering_Lower.'+s].location.y=.008
    if name=='mouthSmile':
        for key in ['Smile.L','Smile.R']:head_keys.key_blocks[key].value=.7
    SOURCE.update_tag();bpy.context.view_layer.update()

def evaluated(obj):
    deps=bpy.context.evaluated_depsgraph_get()
    return bpy.data.meshes.new_from_object(obj.evaluated_get(deps),preserve_all_data_layers=True,depsgraph=deps)

pose('neutral');meshes={o.name:evaluated(o) for o in ORIGINAL}
facial_positions={}
for name in ['jawOpen','eyeBlinkLeft','eyeBlinkRight','mouthSmile']:
    pose(name);facial_positions[name]={}
    for o in ORIGINAL:
        if o.name not in FACIAL:continue
        mesh=evaluated(o);base=meshes[o.name]
        if len(mesh.vertices)!=len(base.vertices):raise RuntimeError('Topology changed in expression '+o.name)
        a=np.empty(len(mesh.vertices)*3,dtype=np.float32);mesh.vertices.foreach_get('co',a)
        facial_positions[name][o.name]=a.reshape(-1,3);bpy.data.meshes.remove(mesh)
    print('MORPH_CAPTURED',name,flush=True)
pose('neutral')

collection=bpy.data.collections.new('Rain_Web_Export');scene.collection.children.link(collection)
armature=bpy.data.armatures.new('Rain_Web_Skeleton');rig=bpy.data.objects.new('Rain_Web_Rig',armature);collection.objects.link(rig)
bpy.ops.object.select_all(action='DESELECT');rig.select_set(True);bpy.context.view_layer.objects.active=rig;bpy.ops.object.mode_set(mode='EDIT')
mapping={};bone_specs=[]
def joint(name,source,parent,tail_source=None):
    b=SOURCE.data.bones[source];head=b.head_local.copy();tail=SOURCE.data.bones[tail_source].head_local.copy() if tail_source else b.tail_local.copy()
    e=armature.edit_bones.new(name);e.head=head;e.tail=tail
    if (tail-head).length<1e-5:e.tail=head+Vector((0,0,.03))
    if parent:e.parent=armature.edit_bones[parent]
    bone_specs.append({'name':name,'source':source,'parent':parent,'head':list(head),'tail':list(tail)})
    mapping[source]=name
joint('Hips','DEF-Pelvis',None,'DEF-Spine2')
joint('Spine','DEF-Spine2','Hips','DEF-Spine3')
joint('Chest','DEF-Spine3','Spine','DEF-Neck')
joint('Neck','DEF-Neck','Chest','DEF-Head');joint('Head','DEF-Head','Neck')
for side,s in [('Left','L'),('Right','R')]:
    joint(side+'Shoulder','DEF-Clavicle.'+s,'Chest','DEF-Upperarm1.'+s)
    joint(side+'UpperArm','DEF-Upperarm1.'+s,side+'Shoulder','DEF-Forearm1.'+s)
    joint(side+'ForeArm','DEF-Forearm1.'+s,side+'UpperArm','DEF-Hand.'+s)
    joint(side+'Hand','DEF-Hand.'+s,side+'ForeArm')
    joint(side+'UpperLeg','DEF-Thigh1.'+s,'Hips','DEF-Shin1.'+s)
    joint(side+'LowerLeg','DEF-Shin1.'+s,side+'UpperLeg','DEF-Foot.'+s)
    joint(side+'Foot','DEF-Foot.'+s,side+'LowerLeg','DEF-Toe.'+s)
    joint(side+'Toe','DEF-Toe.'+s,side+'Foot')
bpy.ops.object.mode_set(mode='OBJECT')

def mapped(name):
    if name in mapping:return mapping[name]
    lower=name.lower();side='Left' if name.endswith('.L') else 'Right' if name.endswith('.R') else None
    if side:
        for token,dest in [('upperarm','UpperArm'),('forearm','ForeArm'),('clavicle','Shoulder'),('thigh','UpperLeg'),('shin','LowerLeg'),('ankle','Foot'),('foot','Foot'),('toe','Toe')]:
            if token in lower:return side+dest
        if any(x in lower for x in ['hand','finger','thumb','index','middle','ring','pinky','wrist']):return side+'Hand'
    if any(x in lower for x in ['pelvis','spine1']):return 'Hips'
    if 'spine2' in lower:return 'Spine'
    if any(x in lower for x in ['spine3','scarf','chest']):return 'Chest'
    if 'neck' in lower:return 'Neck'
    return 'Head'

exported=[];record=[]
for o in ORIGINAL:
    mesh=meshes[o.name];new=bpy.data.objects.new(o.name.replace('GEO-rain-','Rain_'),mesh);collection.objects.link(new);new.matrix_world=o.matrix_world.copy()
    # Fully evaluate the authored modifiers, but transfer bone influences into a
    # conventional humanoid hierarchy rather than exporting Blender controllers.
    source_groups={g.index:g.name for g in o.vertex_groups}
    grouped={name:[] for name in armature.bones.keys()}
    all_weights=[]
    for v in mesh.vertices:
        weights={}
        for g in v.groups:
            name=source_groups.get(g.group)
            if name not in SOURCE.data.bones or not SOURCE.data.bones[name].use_deform:continue
            target=mapped(name);weights[target]=weights.get(target,0)+g.weight
        if o.name in FACIAL or any(x in o.name for x in ['hair','eyes','eye_dots']):weights={'Head':1}
        if not weights:weights={'Head' if v.co.z>1.3 else 'Chest' if v.co.z>1.05 else 'Hips':1}
        weights=sorted(weights.items(),key=lambda p:p[1],reverse=True)[:4];total=sum(w for _,w in weights)
        all_weights.append([(n,w/total) for n,w in weights])
    # Rebuild the deform layer because evaluated vertices still carry source IDs.
    for g in o.vertex_groups:new.vertex_groups.new(name=g.name)
    new.vertex_groups.clear()
    groups={name:new.vertex_groups.new(name=name) for name in armature.bones.keys()}
    for i,weights in enumerate(all_weights):
        for name,w in weights:groups[name].add([i],w,'REPLACE')
    if o.name in FACIAL:
        new.shape_key_add(name='Basis')
        for name,poses in facial_positions.items():
            positions=poses[o.name];key=new.shape_key_add(name=name)
            flat=positions.astype(np.float32).reshape(-1);key.data.foreach_set('co',flat)
    # Evaluated meshes contain virtual .vs UV layers. Keep them and explicitly
    # select the baked UV map rather than invalidating their RNA references.
    mesh.uv_layers.active=mesh.uv_layers.get('WebUV');mesh.uv_layers.active.active_render=True;mesh.materials.clear()
    material=bpy.data.materials.new(new.name+'_PBR');material.use_nodes=True
    nodes=material.node_tree.nodes;p=nodes.get('Principled BSDF');tex=nodes.new('ShaderNodeTexImage');tex.image=baked[o.name]
    uv_node=nodes.new('ShaderNodeUVMap');uv_node.uv_map='WebUV';material.node_tree.links.new(uv_node.outputs['UV'],tex.inputs['Vector'])
    material.node_tree.links.new(tex.outputs['Color'],p.inputs['Base Color']);p.inputs['Roughness'].default_value=.78
    if 'eye' in o.name:p.inputs['Roughness'].default_value=.28
    if 'hair' in o.name:p.inputs['Roughness'].default_value=.55
    mesh.materials.append(material)
    # Each baked atlas retains the color of all original material slots.
    for poly in mesh.polygons:poly.material_index=0;poly.use_smooth=True
    modifier=new.modifiers.new('Web_Skin','ARMATURE');modifier.object=rig;new.parent=rig
    exported.append(new);record.append({'name':new.name,'vertices':len(mesh.vertices),'polygons':len(mesh.polygons),'morphs':list(facial_positions) if o.name in FACIAL else []})

for o in bpy.context.scene.objects:o.select_set(False)
for o in exported+[rig]:o.hide_set(False);o.select_set(True)
bpy.context.view_layer.objects.active=rig
path=OUT/'rain-web.glb'
bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,
    export_animations=False,export_skins=True,export_morph=True,export_morph_normal=True,
    export_apply=False,export_yup=True,export_image_format='AUTO',export_texcoords=True,
    export_normals=True,export_materials='EXPORT',export_extras=True,
    export_cameras=False,export_lights=False,export_def_bones=True)
manifest={'source':'https://studio.blender.org/characters/rain/v3/','source_archive':'rain-v33.zip',
    'source_sha256':hashlib.sha256((ROOT/'.modeling/third-party/rain/rain-v33.zip').read_bytes()).hexdigest(),
    'credit':'Rain Rig (CC) Blender Foundation | studio.blender.org','license':'CC-BY-4.0',
    'changes':['Base-color UV baking without lighting','Native face controls evaluated into portable shape keys','Body weights consolidated into a conventional humanoid rig','Cornea layer omitted for a simpler realtime eye material'],
    'bones':bone_specs,'meshes':record,'bytes':path.stat().st_size,
    'limitations':['Blender-only procedural shading and deformation correctives are simplified.','Rig conversion and expression extremes require visual checking before live use.']}
(OUT/'conversion.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
bpy.ops.wm.save_as_mainfile(filepath=str(CACHE/'rain-web-converted.blend'))
print('RAIN_WEB_EXPORTED',len(bone_specs),'bones',len(exported),'meshes',path.stat().st_size,'bytes',flush=True)
