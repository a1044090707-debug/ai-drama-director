"""Build a full-body female Rain derivative with long black hair and soft features.

Run with Blender --background --factory-startup --python this_file.
Original Rain, Snow and the blonde derivative are never overwritten.
"""
from pathlib import Path
import bpy,math,json,runpy,numpy as np
from mathutils import Vector,Matrix

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'model-preview/chinese-female';OUT.mkdir(parents=True,exist_ok=True)
ASSET=ROOT/'model-preview/snow/assets/chinese-female-v3.glb'
bpy.ops.wm.read_factory_settings(use_empty=True)
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=1
bpy.ops.import_scene.gltf(filepath=str(ROOT/'model-preview/rain/assets/rain-web.glb'))
rig=next(o for o in scene.objects if o.type=='ARMATURE')
meshes=[]
for o in list(scene.objects):
    if o.type!='MESH':continue
    if not o.name.startswith('Rain_') or any(x in o.name.lower() for x in ['hair','scarf','eye_dots']):
        bpy.data.objects.remove(o,do_unlink=True)
    else:meshes.append(o)

def s(t):t=max(0,min(1,t));return t*t*(3-2*t)
def lin(rgb):
    rgb=np.asarray(rgb,dtype=float)
    return np.where(rgb<=.04045,rgb/12.92,((rgb+.055)/1.055)**2.4)
def hexlin(h):return lin([int(h[i:i+2],16)/255 for i in [0,2,4]])

def surface_map(v,kind):
    # The approved Rain face is retained, including its eyes, lips and nose.
    # All local sculpting from earlier derivatives is deliberately omitted.
    return v.copy()

for o in meshes:
    original_nodes=o.data.materials[0].node_tree.nodes
    uv_names=[n.uv_map for n in original_nodes if n.type=='UVMAP' and n.uv_map in o.data.uv_layers]
    if uv_names:o['base_uv']=uv_names[0]
    kind=o.name.removeprefix('Rain_')
    if kind in ['head','eyes','eyelashes','eyebrows','gums_upper','gums_lower','teeth_upper','teeth_lower','tongue']:
        world=o.matrix_world.copy();inv=world.inverted()
        for key in (o.data.shape_keys.key_blocks if o.data.shape_keys else [None]):
            for v in (key.data if key else o.data.vertices):v.co=inv@surface_map(world@v.co,kind)
    for poly in o.data.polygons:poly.use_smooth=True
    if o.data.has_custom_normals:
        bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o
        bpy.ops.mesh.customdata_custom_splitnormals_clear()

def simple_material(name,rgb,rough=.75):
    m=bpy.data.materials.new(name);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value=(*hexlin(rgb),1);p.inputs['Roughness'].default_value=rough
    return m

def portable_graph(m,o,image,rough):
    # Imported Rain GLBs include sculpt-paint COLOR layers. The albedo is
    # already baked, so use its actual UV map directly, without multiplying
    # those ancillary paint masks into the visible material a second time.
    names=[n.uv_map for n in m.node_tree.nodes if n.type=='UVMAP' and n.uv_map in o.data.uv_layers]
    uvname=names[0] if names else o.data.uv_layers.active.name
    nodes=m.node_tree.nodes;links=m.node_tree.links;nodes.clear()
    p=nodes.new('ShaderNodeBsdfPrincipled');p.inputs['Roughness'].default_value=rough
    tex=nodes.new('ShaderNodeTexImage');tex.image=image
    uv=nodes.new('ShaderNodeUVMap');uv.uv_map=uvname
    output=nodes.new('ShaderNodeOutputMaterial')
    links.new(uv.outputs[0],tex.inputs['Vector']);links.new(tex.outputs['Color'],p.inputs['Base Color']);links.new(p.outputs[0],output.inputs[0])
    o.data.uv_layers.active=o.data.uv_layers[uvname]
    for layer in o.data.uv_layers:layer.active_render=layer.name==uvname
    return p

def recolor(o,palette,iris=False):
    m=o.data.materials[0].copy();o.data.materials.clear();o.data.materials.append(m)
    p=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
    old=next(n.image for n in m.node_tree.nodes if n.type=='TEX_IMAGE' and n.image)
    a=np.empty(len(old.pixels),dtype=np.float32);old.pixels.foreach_get(a);a=a.reshape(-1,4)
    rgb=a[:,:3];lum=rgb@np.array([.2126,.7152,.0722]);valid=lum>.003
    if iris:
        t=np.clip(lum*3.5,0,1);mask=np.clip((rgb.max(1)-rgb.min(1))*24,0,1)
    else:
        lo,hi=np.percentile(lum[valid],[3,97]);t=.18+.64*np.clip((lum-lo)/max(.01,hi-lo),0,1);mask=valid.astype(float)
    colors=np.array([hexlin(h) for h in palette]);v=np.clip(t/.52,0,1)[:,None]
    low=colors[0]*(1-v)+colors[1]*v;v=np.clip((t-.52)/.48,0,1)[:,None]
    high=colors[1]*(1-v)+colors[2]*v;mapped=np.where((t<.52)[:,None],low,high)
    a[:,:3]=rgb*(1-mask[:,None])+mapped*mask[:,None]
    image=bpy.data.images.new('CNGirl_'+o.name,width=old.size[0],height=old.size[1],alpha=True)
    image.pixels.foreach_set(a.astype(np.float32).reshape(-1));image.update();image.pack()
    rough=.29 if iris else .80 if any(k in o.name for k in ['head','body']) else .88
    portable_graph(m,o,image,rough)
    print('RECOLOR',o.name,flush=True)

skin=['bd927e','eac5b0','f7dfca']
for o in meshes:
    kind=o.name.removeprefix('Rain_')
    if kind in ['head','body']:
        o.data.materials.clear();o.data.materials.append(simple_material('CNGirl_Skin_'+kind,'edc7b0',.80))
    elif kind=='eyes':recolor(o,['211813','684531','bd9568'],iris=True)
    elif kind=='top':recolor(o,['b7b5aa','e5e4da','faf7ee'])
    elif kind=='jeans':recolor(o,['152c2e','2c494b','506968'])
    elif kind=='shoes':recolor(o,['89958c','cbd1c5','f0eee0'])
    elif kind in ['eyebrows','eyelashes']:
        o.data.materials.clear();o.data.materials.append(simple_material('CNGirl_'+kind,'292027'))
    else:
        m=o.data.materials[0]
        image=next((n.image for n in m.node_tree.nodes if n.type=='TEX_IMAGE' and n.image),None)
        if image:portable_graph(m,o,image,.78)

# Direct vertex paint keeps the skin continuous across Rain's UV islands.
# Clear imported sculpt masks before creating one explicit visible color layer.
for o in meshes:
    for name in [a.name for a in o.data.color_attributes]:
        o.data.color_attributes.remove(o.data.color_attributes[name])
head=next(o for o in meshes if o.name=='Rain_head')
attr=head.data.color_attributes.new(name='FemaleSkinColor',type='FLOAT_COLOR',domain='POINT')
head.data.color_attributes.active_color=attr
basis=head.data.shape_keys.key_blocks['Basis'].data if head.data.shape_keys else head.data.vertices
base=hexlin('edc7b0');blush=hexlin('df9e96');lip=hexlin('b87572')
for i,vertex in enumerate(basis):
    v=head.matrix_world@vertex.co
    front=s((-v.y-.080)/.055)
    cheek=math.exp(-((abs(v.x)-.073)/.036)**2-((v.z-1.429)/.029)**2)*front*.16
    lips=math.exp(-(v.x/.044)**4-((v.z-1.391)/.0065)**2)*front*.62
    rgb=base*(1-cheek)+blush*cheek;rgb=rgb*(1-lips)+lip*lips
    attr.data[i].color=(*rgb,1)
m=head.data.materials[0];nodes=m.node_tree.nodes;links=m.node_tree.links;nodes.clear()
p=nodes.new('ShaderNodeBsdfPrincipled');p.inputs['Roughness'].default_value=.80
vc=nodes.new('ShaderNodeVertexColor');vc.layer_name=attr.name
output=nodes.new('ShaderNodeOutputMaterial');links.new(vc.outputs['Color'],p.inputs['Base Color']);links.new(p.outputs[0],output.inputs[0])

hair=runpy.run_path(str(ROOT/'modeling/build_chinese_female_hair_v3.py'))['build_hair'](rig,head);meshes.append(hair)

def bind_head(o):
    wm=o.matrix_world.copy();o.parent=rig;o.matrix_world=wm
    group=o.vertex_groups.new(name='Head');group.add(list(range(len(o.data.vertices))),1,'REPLACE')
    skin=o.modifiers.new('Head skin','ARMATURE');skin.object=rig
    for poly in o.data.polygons:poly.use_smooth=True
    meshes.append(o)

pupilmat=simple_material('CNGirl_Pupil','0c080b',.32)
for sign in [-1,1]:
    center=Vector((sign*.0470,-.120,1.4735))
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24,ring_count=16,radius=1,location=center)
    o=bpy.context.object;o.name='CNGirl_Pupil_'+str(sign);o.scale=(.0088,.0085,.0075);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    o.data.materials.append(pupilmat)
    inv=o.matrix_world.inverted()
    for vertex in o.data.vertices:vertex.co=inv@surface_map(o.matrix_world@vertex.co,'eyes')
    bind_head(o)

# Apply one continuous world-space proportion map to skin, oral parts, all
# facial morphs, pupils, hair and rest bones. This keeps the same bind space.
# The torso and lower hair remain unchanged; the neck transition is gradual.
def proportion_map(v):
    v=v.copy();z=v.z
    w=s((z-1.275)/.065)
    # Uniform upper-head scaling preserves Rain's original face silhouette.
    factor=1-.08*w
    return Vector((v.x*factor,-.005+(v.y+.005)*factor,
                   1.285+(z-1.285)*factor))

before=[head.matrix_world@v.co for v in head.data.shape_keys.key_blocks['Basis'].data]
for o in meshes:
    world=o.matrix_world.copy();inv=world.inverted()
    keys=o.data.shape_keys.key_blocks if o.data.shape_keys else [None]
    for key in keys:
        for vertex in (key.data if key else o.data.vertices):
            vertex.co=inv@proportion_map(world@vertex.co)
    if o.data.has_custom_normals:
        bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o
        bpy.ops.mesh.customdata_custom_splitnormals_clear()
# Rest bones move with the same continuous deformation, before skin export.
bpy.ops.object.select_all(action='DESELECT');rig.select_set(True);bpy.context.view_layer.objects.active=rig
bpy.ops.object.mode_set(mode='EDIT')
world=rig.matrix_world.copy();inv=world.inverted()
for bone in rig.data.edit_bones:
    bone.head=inv@proportion_map(world@bone.head)
    bone.tail=inv@proportion_map(world@bone.tail)
bpy.ops.object.mode_set(mode='OBJECT')
bpy.context.view_layer.update()
after=[head.matrix_world@v.co for v in head.data.shape_keys.key_blocks['Basis'].data]
def head_measure(points):
    return {'width':max(v.x for v in points)-min(v.x for v in points),
            'height':max(v.z for v in points)-min(v.z for v in points)}
proportions={'before':head_measure(before),'after':head_measure(after)}
print('FEMALE_PROPORTIONS',json.dumps(proportions),flush=True)

# Rest-pose export preserves the conventional 21-bone rig and four face keys.
bpy.ops.object.select_all(action='DESELECT')
for o in meshes+[rig]:o.select_set(True)
ASSET.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(ASSET),export_format='GLB',use_selection=True,export_animations=False,export_skins=True,export_morph=True,export_morph_normal=True,export_cameras=False,export_lights=False,export_extras=True)
print('FEMALE_GLB_EXPORTED',ASSET.stat().st_size,flush=True)

# Pose the same actual web geometry for two front-only renders.
for side,sign in [('Left',1),('Right',-1)]:
    bone=rig.pose.bones[side+'UpperArm'];child=rig.pose.bones[side+'ForeArm']
    wm=rig.matrix_world@bone.bone.matrix_local
    a=wm.translation;b=rig.matrix_world@child.bone.head_local
    rotation=(b-a).normalized().rotation_difference(Vector((sign*.34,0,-.94)).normalized())
    target=rotation.to_matrix().to_4x4()@wm;target.translation=a;bone.matrix=rig.matrix_world.inverted()@target
for o in meshes:
    if o.data.shape_keys:
        for k in o.data.shape_keys.key_blocks:k.value=.12 if k.name=='mouthSmile' else 0
bpy.context.view_layer.update();deps=bpy.context.evaluated_depsgraph_get();points=[]
for o in meshes:
    e=o.evaluated_get(deps);data=e.to_mesh();points.extend(e.matrix_world@v.co for v in data.vertices);e.to_mesh_clear()
lo=Vector([min(p[i] for p in points) for i in range(3)]);hi=Vector([max(p[i] for p in points) for i in range(3)]);center=(lo+hi)/2;height=hi.z-lo.z
scene.world=bpy.data.worlds.new('FemaleStudio');scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.82,.84,.82,1);scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.20
for name,pos,power,size in [('Key',(-2.2,-3,3),400,3.0),('Fill',(2.4,-2.5,1.5),140,3.0),('Rim',(1.3,2,2.5),350,2.5)]:
    data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=size;o=bpy.data.objects.new(name,data);scene.collection.objects.link(o);o.location=center+Vector(pos);o.rotation_euler=(center-o.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,lo.z-.003));floor=bpy.context.object;floor.data.materials.append(simple_material('FemaleStudioFloor','e9e7de',1))
data=bpy.data.cameras.new('FemaleFront');camera=bpy.data.objects.new('FemaleFront',data);scene.collection.objects.link(camera);scene.camera=camera;data.type='ORTHO'
def aim(target,scale):
    camera.location=Vector(target)+Vector((0,-6,0));camera.rotation_euler=(Vector(target)-camera.location).to_track_quat('-Z','Y').to_euler();data.ortho_scale=scale
scene.cycles.samples=64;scene.cycles.use_denoising=True;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.view_settings.view_transform='AgX'
scene.render.resolution_x=1200;scene.render.resolution_y=1800;aim((0,0,lo.z+height*.505),height*1.12)
scene.render.filepath=str(OUT/'female-front-v3.png');bpy.ops.render.render(write_still=True)
scene.render.resolution_x=1200;scene.render.resolution_y=1300;aim((0,-.02,1.432),.51)
scene.render.filepath=str(OUT/'female-face-v3.png');bpy.ops.render.render(write_still=True)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'chinese-female-v3.blend'))
meta={'base':'Blender Studio Rain','source':'https://studio.blender.org/characters/rain/v3/','credit':'Rain Rig (CC) Blender Foundation | studio.blender.org','license':'CC-BY-4.0','character':'Black straight hair, fine fringe, warm brown eyes, soft oval face, ivory top and ink teal trousers','changes':['Original Rain face silhouette, eye size, nose and lips restored','Uniform 8 percent head scaling with a smooth neck transition','Rest bones and all expressions follow the same uniform transform','New continuous scalp, long back hair and fringe','Hair weights blend Head, Neck and Chest','Updated normals and continuous vertex-painted skin colors','Full-body 21-bone rig, four facial expressions, both feet retained'],'asset':'../snow/assets/chinese-female-v3.glb','blend':'chinese-female-v3.blend','proportions':proportions,'bounds':{'min':list(lo),'max':list(hi)}}
(OUT/'character.json').write_text(json.dumps(meta,ensure_ascii=False,indent=2),encoding='utf-8')
print('FEMALE_COMPLETE',list(lo),list(hi),flush=True)
