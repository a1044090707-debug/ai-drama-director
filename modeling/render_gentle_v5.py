"""A front-only, softer-faced draft made from the actual Snow-derived W01 mesh.

Load character-options/models/W01.blend before running. Shape edits are applied
to Basis and every face shape key. The editable scene is saved with the renders.
"""
from pathlib import Path
import bpy,math,json,runpy
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'model-preview/gentle-draft';OUT.mkdir(parents=True,exist_ok=True)
scene=bpy.context.scene
meshes=[o for o in scene.objects if o.type=='MESH' and o.name.startswith('Snow_')]
rig=next(o for o in scene.objects if o.type=='ARMATURE')
for o in scene.objects:
    if o.type=='MESH' and o not in meshes and o.name!='StudioFloor':o.hide_render=True

def s(x):x=max(0,min(1,x));return x*x*(3-2*x)
def g(x,z,cx,cz,sx,sz):return math.exp(-((x-cx)/sx)**2-((z-cz)/sz)**2)
def shorter_face_z(z):
    # Keep the base of the neck fixed. Shorten the lower face around eye level,
    # and reduce the high forehead with the same map on skin, eyes and hair.
    eye=1.622;join=1.465;neck=1.390
    if z<=neck:return z
    if z<join:return z+(eye-join)*.20*s((z-neck)/(join-neck))
    return eye+(z-eye)*(.80 if z<eye else .86)
def torso(v):
    v=v.copy();x,y,z=v
    # Narrow the shoulder span while preserving the length of the distal arms.
    upper=s((z-1.08)/.20)
    v.x-=math.copysign(.022*s(abs(x)/.18)*upper,x)
    # Thin the neck surface, blending into the jaw and collar rather than
    # shrinking the entire head or leaving a separate cylindrical neck.
    neck=math.exp(-((z-1.428)/.078)**4)*math.exp(-(x/.095)**4)
    v.x*=1-.13*neck;v.y=-.018+(v.y+.018)*(1-.10*neck)
    arm=s((abs(x)-.22)/.08)*(1-s((abs(x)-.57)/.09))*s((z-1.12)/.08)
    center_y=.012;center_z=1.36-.065*max(0,abs(x)-.188)
    v.y=center_y+(v.y-center_y)*(1-.10*arm)
    v.z=center_z+(v.z-center_z)*(1-.07*arm)
    return v

def face(v):
    v=v.copy();x,y,z=v;front=s((-y-.070)/.065)
    lower=math.exp(-((z-1.514)/.065)**2)
    # A narrower jaw and chin; keep the original eye sockets and upper cranium.
    v.x*=1-.145*lower
    v.x*=1-.045*math.exp(-((z-1.566)/.045)**2)
    chin=g(x,z,0,1.471,.058,.027)*front
    v.y+=.008*chin;v.z+=.0035*chin
    # Soften the bridge/tip and brow projection, without constructing new parts.
    nose=math.exp(-(x/.065)**4-((z-1.584)/.033)**4)*front
    eye_clearance=math.exp(-((abs(x)-.045)/.040)**4-((z-1.625)/.037)**4)
    nose*=1-eye_clearance
    v.x*=1-.28*nose;v.y+=.009*nose
    brow=math.exp(-((z-1.653)/.023)**2)*front
    v.y+=.0035*brow
    # Reduce lip volume and the downturned neutral mouth.
    mouth=g(x,z,0,1.532,.057,.018)*front
    v.y+=.004*mouth
    v.z=1.532+(v.z-1.532)*(1-.18*mouth)
    corners=math.exp(-((abs(x)-.038)/.016)**2-((z-1.531)/.015)**2)*front
    v.z+=.0060*corners
    # Slightly fuller cheeks replace the very angular cheek-to-jaw transition.
    cheek=g(abs(x),z,.073,1.563,.040,.035)*front
    v.y+=.0010*cheek
    # Reduce the oversized projecting ears without moving the eye sockets.
    ear=s((abs(x)-.090)/.060)*math.exp(-((z-1.624)/.085)**4)
    v.x*=1-.16*ear
    v.z=1.624+(v.z-1.624)*(1-.13*ear)
    v.y+=.007*ear
    return v

for o in meshes:
    wm=o.matrix_world.copy();inv=wm.inverted();name=o.name.lower()
    is_face=any(k in name for k in ['head','eyebrow','eyes','gums','teeth','tongue'])
    def modify(co):
        world=wm@co
        if name in ['snow_body','snow_shirt']:world=torso(world)
        if is_face:
            if 'head' in name or any(k in name for k in ['gums','teeth','tongue']):world=face(world)
            if 'head' in name and world.z<1.485:
                world=torso(world)
            if 'eyebrow' in name:
                world.z=1.657+(world.z-1.657)*.76
                world.z-=.004
                world.z+=.0015*math.exp(-(world.x/.028)**2)
        # Include the collar/torso in the neck-height map so the separately
        # authored head and body still overlap at their original attachment.
        if is_face or 'hair' in name or name in ['snow_body','snow_shirt']:
            world.z=shorter_face_z(world.z)
        return inv@world
    if o.data.shape_keys:
        for key in o.data.shape_keys.key_blocks:
            for v in key.data:v.co=modify(v.co)
    else:
        for v in o.data.vertices:v.co=modify(v.co)
    for poly in o.data.polygons:poly.use_smooth=True

# Match the shoulder joint positions to the edited rest mesh.
if bpy.context.object and bpy.context.object.mode!='OBJECT':bpy.ops.object.mode_set(mode='OBJECT')
bpy.ops.object.select_all(action='DESELECT');rig.select_set(True);bpy.context.view_layer.objects.active=rig
rw=rig.matrix_world.copy();ri=rw.inverted();bpy.ops.object.mode_set(mode='EDIT')
for b in rig.data.edit_bones:
    for field in ['head','tail']:
        v=rw@getattr(b,field);z=v.z;x=v.x
        v.x-=math.copysign(.022*s(abs(x)/.18)*s((z-1.08)/.20),x)
        setattr(b,field,ri@v)
bpy.ops.object.mode_set(mode='OBJECT')

# Keep the natural standing pose, with a small amount of eyelid relaxation.
for o in meshes:
    if o.data.shape_keys:
        for key in o.data.shape_keys.key_blocks:
            if key.name in ['eyeBlinkLeft','eyeBlinkRight']:key.value=0
            elif key.name=='mouthSmile':key.value=.15
            elif key.name=='jawOpen':key.value=0
    if 'eyebrow' in o.name.lower():
        m=o.data.materials[0];p=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
        for l in list(p.inputs['Base Color'].links):m.node_tree.links.remove(l)
        p.inputs['Base Color'].default_value=(.32,.21,.09,1);p.inputs['Roughness'].default_value=.75
    if 'hair' in o.name.lower():
        m=o.data.materials[0];nodes=m.node_tree.nodes;p=next(n for n in nodes if n.type=='BSDF_PRINCIPLED')
        source=p.inputs['Base Color'].links[0].from_socket
        mix=nodes.new('ShaderNodeMixRGB');mix.blend_type='MULTIPLY';mix.inputs[0].default_value=1;mix.inputs[2].default_value=(.68,.52,.28,1)
        m.node_tree.links.new(source,mix.inputs[1]);m.node_tree.links.new(mix.outputs[0],p.inputs['Base Color'])
    if 'head' in o.name.lower():
        attr=o.data.color_attributes.new(name='GentleLipTint',type='FLOAT_COLOR',domain='CORNER')
        for loop in o.data.loops:
            v=o.matrix_world@o.data.vertices[loop.vertex_index].co
            weight=g(v.x,v.z,0,shorter_face_z(1.532),.049,.009)*s((-v.y-.10)/.04)*.52
            attr.data[loop.index].color=(.58,.27,.23,weight)
        m=o.data.materials[0];nodes=m.node_tree.nodes;p=next(n for n in nodes if n.type=='BSDF_PRINCIPLED');source=p.inputs['Base Color'].links[0].from_socket
        vc=nodes.new('ShaderNodeVertexColor');vc.layer_name=attr.name;mix=nodes.new('ShaderNodeMixRGB')
        for a,b in [(vc.outputs['Alpha'],mix.inputs[0]),(source,mix.inputs[1]),(vc.outputs['Color'],mix.inputs[2]),(mix.outputs[0],p.inputs['Base Color'])]:m.node_tree.links.new(a,b)

for o in list(meshes):
    if 'hair' in o.name.lower():
        o.hide_render=True;o.hide_set(True);meshes.remove(o)
bpy.context.view_layer.update()
new_hair=runpy.run_path(str(ROOT/'modeling/gentle_closed_hair.py'))['build_swept_hair'](rig,next(o for o in meshes if o.name.lower()=='snow_head'))
meshes.extend(new_hair)
print('SWEPT_HAIR_CREATED',len(new_hair),flush=True)

# Snow's recessed pupil relies on ray-traced occlusion in Blender. Give the
# web renderer a real dark surface behind each aperture as well.
pupil_mat=bpy.data.materials.new('Gentle_PupilDark');pupil_mat.use_nodes=True
pupil_shader=pupil_mat.node_tree.nodes.get('Principled BSDF')
pupil_shader.inputs['Base Color'].default_value=(.002,.004,.007,1)
pupil_shader.inputs['Roughness'].default_value=.34
for sign in [-1,1]:
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24,ring_count=16,radius=1,location=(sign*.0441,-.1215,1.622))
    pupil=bpy.context.object;pupil.name='Gentle_Pupil_'+str(sign)
    pupil.scale=(.0078,.0078,.0065);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    pupil.data.materials.append(pupil_mat)
    wm=pupil.matrix_world.copy();pupil.parent=rig;pupil.matrix_world=wm
    group=pupil.vertex_groups.new(name='Head');group.add(list(range(len(pupil.data.vertices))),1,'REPLACE')
    skin=pupil.modifiers.new('Head skin','ARMATURE');skin.object=rig
    for poly in pupil.data.polygons:poly.use_smooth=True
    meshes.append(pupil)

# Bake the edited lip tint into the portable albedo so the web asset matches
# the scene. The original Snow GLB is never overwritten.
head=next(o for o in meshes if o.name.lower()=='snow_head')
m=head.data.materials[0];nodes=m.node_tree.nodes;links=m.node_tree.links
p=next(n for n in nodes if n.type=='BSDF_PRINCIPLED')
source=p.inputs['Base Color'].links[0].from_socket
image=bpy.data.images.new('GentleV5_FaceAlbedo',width=1536,height=1536)
target=nodes.new('ShaderNodeTexImage');target.image=image;nodes.active=target
output=next(n for n in nodes if n.type=='OUTPUT_MATERIAL' and n.is_active_output)
em=nodes.new('ShaderNodeEmission');links.new(source,em.inputs['Color']);links.new(em.outputs[0],output.inputs['Surface'])
bpy.ops.object.select_all(action='DESELECT');head.select_set(True);bpy.context.view_layer.objects.active=head
scene.cycles.samples=1;scene.render.bake.margin=12;bpy.ops.object.bake(type='EMIT')
uv=head.data.uv_layers.active.name
nodes.clear();output=nodes.new('ShaderNodeOutputMaterial');p=nodes.new('ShaderNodeBsdfPrincipled');p.inputs['Roughness'].default_value=.78
tex=nodes.new('ShaderNodeTexImage');tex.image=image;uvnode=nodes.new('ShaderNodeUVMap');uvnode.uv_map=uv
links.new(uvnode.outputs['UV'],tex.inputs['Vector']);links.new(tex.outputs['Color'],p.inputs['Base Color']);links.new(p.outputs[0],output.inputs['Surface']);image.pack()
for o in meshes:
    for attr in list(o.data.color_attributes):o.data.color_attributes.remove(attr)

poses={b.name:b.matrix_basis.copy() for b in rig.pose.bones}
expressions={}
for b in rig.pose.bones:b.matrix_basis.identity()
for o in meshes:
    if o.data.shape_keys:
        for k in o.data.shape_keys.key_blocks:expressions[(o.name,k.name)]=k.value;k.value=0
bpy.context.view_layer.update();bpy.ops.object.select_all(action='DESELECT')
for o in meshes+[rig]:o.select_set(True)
asset=ROOT/'model-preview/snow/assets/gentle-v5.glb'
bpy.ops.export_scene.gltf(filepath=str(asset),use_selection=True,export_format='GLB',export_animations=False,export_skins=True,export_morph=True,export_morph_normal=True,export_extras=True,export_cameras=False,export_lights=False)
for b in rig.pose.bones:b.matrix_basis=poses[b.name]
for o in meshes:
    if o.data.shape_keys:
        for k in o.data.shape_keys.key_blocks:k.value=expressions[(o.name,k.name)]
print('GENTLE_GLB_EXPORTED',asset.stat().st_size,flush=True)
bpy.context.view_layer.update();deps=bpy.context.evaluated_depsgraph_get()
def bounds(objects):
    points=[]
    for o in objects:
        e=o.evaluated_get(deps);data=e.to_mesh();points.extend(e.matrix_world@v.co for v in data.vertices);e.to_mesh_clear()
    return Vector([min(p[i] for p in points) for i in range(3)]),Vector([max(p[i] for p in points) for i in range(3)])
lo,hi=bounds(meshes);height=hi.z-lo.z;center=(lo+hi)/2
floor=bpy.data.objects.get('StudioFloor');floor.location.z=lo.z-.002
floor.hide_render=False
floor_mat=floor.data.materials[0];floor_mat.use_nodes=True
floor_mat.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(.78,.77,.73,1)
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.16
scene.cycles.samples=64;scene.cycles.use_denoising=True
for o in scene.objects:
    if o.type=='LIGHT':
        o.location=center+({'Key':Vector((-2.2,-3,3.0)),'Fill':Vector((2.4,-2.5,1.5)),'Rim':Vector((1.3,2.0,2.5))}.get(o.name,Vector((2,-3,4))))
        o.rotation_euler=(center-o.location).to_track_quat('-Z','Y').to_euler()
        o.data.energy={'Key':400,'Fill':110,'Rim':300}.get(o.name,200)
camera=scene.camera;camera.data.type='ORTHO'
def camera_front(target,scale):
    camera.location=Vector(target)+Vector((0,-6,0));camera.rotation_euler=(Vector(target)-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.ortho_scale=scale
scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.view_settings.view_transform='AgX'
scene.render.resolution_x=1200;scene.render.resolution_y=1800
camera_front((center.x,center.y,lo.z+height*.505),height*1.12)
scene.render.filepath=str(OUT/'gentle-front-v5.png');bpy.ops.render.render(write_still=True)

# A second frontal view isolates the face, so the user can judge the actual
# change to the jaw, brow, lip proportions and neck without zooming a full body.
scene.render.resolution_x=1200;scene.render.resolution_y=1300
camera_front((0,-.020,1.610),.54)
scene.render.filepath=str(OUT/'gentle-face-v5.png');bpy.ops.render.render(write_still=True)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'gentle-draft-v5.blend'))
meta={'base':'Blender Studio Snow / W01 derivative','source':'https://studio.blender.org/characters/snow/v4/','credit':'Snow Rig (CC) Blender Foundation | studio.blender.org','license':'CC-BY-4.0','stage':'Fifth draft: connected hair volume and web preview','edits':['Preserved v4 face and large eyes','Filled crown silhouette gaps with real underlying volume','Unioned hair into a continuous head-skinned mesh','Baked face tint for matching web albedo'],'views':['front full body','front facial close-up'],'pose_bounds':{'min':list(lo),'max':list(hi)},'expression':{'eyeBlinkLeft':0,'eyeBlinkRight':0,'mouthSmile':.15},'editable_scene':'gentle-draft-v5.blend','web_asset':'../snow/assets/gentle-v5.glb'}
(OUT/'draft-v5.json').write_text(json.dumps(meta,ensure_ascii=False,indent=2),encoding='utf-8')
print('GENTLE_DRAFT_RENDERED',list(lo),list(hi),flush=True)
