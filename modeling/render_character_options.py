"""Produce front-only character choices from the real Rain / Snow meshes.

The PNGs are actual Blender renders of the exported variants, not AI concept
images. Every color and shape parameter is stored in character_options.json.
Run with Blender --background --factory-startup --python this_file.
"""
import bpy,math,json,sys,hashlib
import numpy as np
from pathlib import Path
from mathutils import Vector,Matrix,Quaternion

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'model-preview/character-options';(OUT/'images').mkdir(parents=True,exist_ok=True);(OUT/'models').mkdir(exist_ok=True)
CONFIG=json.loads((ROOT/'modeling/character_options.json').read_text(encoding='utf-8'))
params=CONFIG['render']
only=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
chars=[c for c in CONFIG['characters'] if not only or c['id'] in only]

def lin(hex):
    a=[int(hex[i:i+2],16)/255 for i in [0,2,4]]
    return tuple(v/12.92 if v<.04045 else ((v+.055)/1.055)**2.4 for v in a)
def smooth(x):x=min(1,max(0,x));return x*x*(3-2*x)
def link(m,source,to):m.node_tree.links.new(source,to)
def color_source(m):
    p=m.node_tree.nodes.get('Principled BSDF')
    return p,p.inputs['Base Color'].links[0].from_socket if p.inputs['Base Color'].is_linked else None
def ramp(m,palette):
    n=m.node_tree.nodes.new('ShaderNodeValToRGB');r=n.color_ramp
    r.elements[0].position=0;r.elements[0].color=(*lin(palette[0]),1)
    r.elements[1].position=1;r.elements[1].color=(*lin(palette[2]),1)
    r.elements.new(.52).color=(*lin(palette[1]),1);return n
def luma_limits(m):
    images=[n.image for n in m.node_tree.nodes if n.type=='TEX_IMAGE' and n.image]
    if not images:return (0,1)
    image=images[0];a=np.array(image.pixels[::16]).reshape(-1) if False else None
    a=np.empty(len(image.pixels),dtype=np.float32);image.pixels.foreach_get(a);a=a.reshape(-1,4)[::13,:3]
    y=a@np.array([.2126,.7152,.0722]);y=y[y>.004]
    return tuple(float(v) for v in np.percentile(y,[3,97])) if len(y) else (0,1)
def mapped_colors(m,source,palette,limits):
    bw=m.node_tree.nodes.new('ShaderNodeRGBToBW');link(m,source,bw.inputs[0])
    remap=m.node_tree.nodes.new('ShaderNodeMapRange');link(m,bw.outputs[0],remap.inputs['Value'])
    lo,hi=limits
    if hi-lo<.008:lo=max(0,lo-.02);hi+=.02
    remap.inputs['From Min'].default_value=lo;remap.inputs['From Max'].default_value=hi
    remap.inputs['To Min'].default_value=.18;remap.inputs['To Max'].default_value=.82
    r=ramp(m,palette);link(m,remap.outputs[0],r.inputs[0]);return r.outputs[0]
def recolor(obj,palette,kind,c):
    m=obj.data.materials[0].copy();obj.data.materials.clear();obj.data.materials.append(m)
    p,source=color_source(m)
    if not source:return
    nodes=m.node_tree.nodes
    if kind=='hair':
        tex=nodes.new('ShaderNodeTexNoise');tex.inputs['Scale'].default_value=18;tex.inputs['Detail'].default_value=1.3
        r=ramp(m,palette);link(m,tex.outputs['Fac'],r.inputs[0]);source=r.outputs[0]
    elif kind=='eyes':
        sep=nodes.new('ShaderNodeSeparateColor');link(m,source,sep.inputs['Color'])
        def op(mode,a,b=None):
            n=nodes.new('ShaderNodeMath');n.operation=mode;link(m,a,n.inputs[0])
            if isinstance(b,(int,float)):n.inputs[1].default_value=b
            elif b is not None:link(m,b,n.inputs[1])
            return n.outputs[0]
        high=op('MAXIMUM',op('MAXIMUM',sep.outputs[0],sep.outputs[1]),sep.outputs[2]);low=op('MINIMUM',op('MINIMUM',sep.outputs[0],sep.outputs[1]),sep.outputs[2]);mask=op('MULTIPLY',op('SUBTRACT',high,low),24)
        mask.node.use_clamp=True
        bw=nodes.new('ShaderNodeRGBToBW');link(m,source,bw.inputs[0]);gain=op('MULTIPLY',bw.outputs[0],3.5)
        r=ramp(m,palette);link(m,gain,r.inputs[0]);mix=nodes.new('ShaderNodeMixRGB');mix.blend_type='MIX';link(m,mask,mix.inputs[0]);link(m,source,mix.inputs[1]);link(m,r.outputs[0],mix.inputs[2]);source=mix.outputs[0]
    else:
        source=mapped_colors(m,source,palette,luma_limits(m))
        if kind=='face':
            attr=obj.data.color_attributes.new(name='OptionFaceTint',type='FLOAT_COLOR',domain='CORNER')
            zmouth=1.508 if c['base']=='snow' else 1.390;zcheek=1.566 if c['base']=='snow' else 1.420
            lip=lin('c68b80');blush=lin('dfab99')
            for loop in obj.data.loops:
                v=obj.matrix_world@obj.data.vertices[loop.vertex_index].co
                face=smooth((-v.y-.08)/.07)
                cheek=math.exp(-((abs(v.x)-.076)/.04)**2-((v.z-zcheek)/.042)**2)*face*.25
                mouth=math.exp(-(v.x/.041)**6-((v.z-zmouth)/.011)**2)*face*.65
                weight=min(.7,cheek+mouth);t=mouth/max(weight,1e-5);rgb=[blush[i]*(1-t)+lip[i]*t for i in range(3)];attr.data[loop.index].color=(*rgb,weight)
            vc=nodes.new('ShaderNodeVertexColor');vc.layer_name=attr.name;mix=nodes.new('ShaderNodeMixRGB');link(m,vc.outputs['Alpha'],mix.inputs[0]);link(m,source,mix.inputs[1]);link(m,vc.outputs['Color'],mix.inputs[2]);source=mix.outputs[0]
    link(m,source,p.inputs['Base Color'])
    # Re-bake the actual edited material into its actual texture coordinates.
    uv_names=[n.uv_map for n in nodes if n.type=='UVMAP' and n.uv_map in obj.data.uv_layers]
    uv=obj.data.uv_layers.get(uv_names[0]) if uv_names else obj.data.uv_layers.active
    for u in obj.data.uv_layers:u.active_render=u==uv
    obj.data.uv_layers.active=uv
    size=1536 if kind=='face' else 1024 if kind in ['skin','shirt','pants'] else 512
    image=bpy.data.images.new(c['id']+'_'+obj.name,width=size,height=size)
    target=nodes.new('ShaderNodeTexImage');target.image=image;nodes.active=target
    output=next(n for n in nodes if n.type=='OUTPUT_MATERIAL' and n.is_active_output);em=nodes.new('ShaderNodeEmission');link(m,source,em.inputs['Color']);link(m,em.outputs[0],output.inputs['Surface'])
    bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
    bpy.ops.object.bake(type='EMIT')
    # A simple portable PBR graph is used for both the rendered image and GLB.
    rough=.53 if kind=='hair' else .27 if kind=='eyes' else .78 if kind in ['skin','face'] else .92
    nodes.clear();output=nodes.new('ShaderNodeOutputMaterial');p=nodes.new('ShaderNodeBsdfPrincipled');p.inputs['Roughness'].default_value=rough
    t=nodes.new('ShaderNodeTexImage');t.image=image;uvnode=nodes.new('ShaderNodeUVMap');uvnode.uv_map=uv.name;link(m,uvnode.outputs['UV'],t.inputs['Vector']);link(m,t.outputs['Color'],p.inputs['Base Color']);link(m,p.outputs[0],output.inputs['Surface'])
    image.pack()

def shape(obj,c):
    name=obj.name.lower()
    is_head=any(k in name for k in ['head','eyes','eyebrow','gums','teeth','tongue','hair','eye_dot'])
    if not is_head:return
    # Small recorded rest-shape changes; apply the same mapping to every shape
    # key so the existing native blink/jaw geometry remains consistent.
    world=obj.matrix_world.copy();inv=world.inverted()
    def modify(co):
        v=world@co;v.x*=c['head_width']
        if 'head' in name:
            zn=1.574 if c['base']=='snow' else 1.438
            nose=math.exp(-(v.x/.038)**2-((v.z-zn)/.033)**2)*smooth((-v.y-.10)/.055)
            v.x*=1+(c['nose_width']-1)*nose
        if 'hair' in name:
            floor=1.675 if c['base']=='snow' else 1.565
            if v.z>floor:v.z=floor+(v.z-floor)*c['hair_height']
        return inv@v
    if obj.data.shape_keys:
        for key in obj.data.shape_keys.key_blocks:
            for v in key.data:v.co=modify(v.co)
    else:
        for v in obj.data.vertices:v.co=modify(v.co)

def setup_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    s=bpy.context.scene;s.render.engine='CYCLES';s.cycles.device='CPU';s.cycles.samples=params['samples'];s.cycles.use_denoising=True
    s.render.resolution_x=params['width'];s.render.resolution_y=params['height'];s.render.resolution_percentage=100;s.render.image_settings.file_format='PNG';s.render.film_transparent=False
    s.render.bake.margin=12;s.render.bake.use_clear=True;s.view_settings.view_transform='AgX'
    s.world=bpy.data.worlds.new('FrontOptionWorld');s.world.use_nodes=True;s.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.85,.87,.87,1);s.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.22
    return s

def render_one(c):
    scene=setup_scene();path=ROOT/'model-preview'/c['base']/'assets'/(c['base']+'-web.glb')
    bpy.ops.import_scene.gltf(filepath=str(path));rig=next(o for o in scene.objects if o.type=='ARMATURE');meshes=[o for o in scene.objects if o.type=='MESH']
    if c['short_hair']:
        for o in list(meshes):
            if any(k in o.name for k in ['hair_ponytail','hairband']):meshes.remove(o);bpy.data.objects.remove(o,do_unlink=True)
    for o in meshes:
        shape(o,c);n=o.name.lower()
        if 'head' in n:palette,kind=c['skin'],'face'
        elif 'body' in n:palette,kind=c['skin'],'skin'
        elif 'hair' in n or 'eyebrow' in n:palette,kind=c['hair'],'hair'
        elif 'eyes' in n:palette,kind=c['iris'],'eyes'
        elif 'shirt' in n or 'top' in n:palette,kind=c['shirt'],'shirt'
        elif 'pants' in n or 'jeans' in n:palette,kind=c['pants'],'pants'
        elif 'scarf' in n or ('shoes' in n and c['base']=='snow'):palette,kind=c['accent'],'cloth'
        else:continue
        print('RECOLOR',c['id'],o.name,kind,flush=True);recolor(o,palette,kind,c)
    # Export the real geometry, material atlases, skin and face shapes first.
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes+[rig]:o.select_set(True)
    glb=OUT/'models'/(c['id']+'.glb')
    bpy.ops.export_scene.gltf(filepath=str(glb),use_selection=True,export_format='GLB',export_animations=False,export_skins=True,export_morph=True,export_morph_normal=True,export_extras=True,export_cameras=False,export_lights=False)
    # Pose the same model for a front-only design sheet.
    for side,angle in [('Left',1.22),('Right',-1.22)]:
        bone=rig.pose.bones[side+'UpperArm'];rest=bone.bone.matrix_local.copy();rot=Matrix.Rotation(angle,4,'Y')@rest.to_3x3().to_4x4();rot.translation=rest.translation;bone.matrix=rot
    for o in meshes:
        if o.data.shape_keys:
            for key in o.data.shape_keys.key_blocks:
                if key.name=='mouthSmile':key.value=.30
    bpy.context.view_layer.update()
    deps=bpy.context.evaluated_depsgraph_get();points=[]
    for o in meshes:
        e=o.evaluated_get(deps);evaluated_mesh=e.to_mesh()
        points.extend(e.matrix_world@v.co for v in evaluated_mesh.vertices)
        e.to_mesh_clear()
    lo=Vector([min(p[i] for p in points) for i in range(3)]);hi=Vector([max(p[i] for p in points) for i in range(3)])
    height=hi.z-lo.z;center=(lo+hi)/2
    print('POSE_BOUNDS',c['id'],list(lo),list(hi),flush=True)
    # Studio lighting and a truly frontal orthographic camera, with both feet.
    data=bpy.data.cameras.new('FrontCamera');camera=bpy.data.objects.new('FrontCamera',data);scene.collection.objects.link(camera);scene.camera=camera
    target=Vector((center.x,center.y,lo.z+height*.51));camera.location=target+Vector((0,-6,0));camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler();data.type='ORTHO';data.ortho_scale=height*1.18
    for name,pos,power,size in [('Key',(-2,-3,4),450,2.5),('Fill',(3,-3,2),150,3),('Rim',(1,2,4),350,2.5)]:
        ld=bpy.data.lights.new(name,'AREA');ld.energy=power;ld.shape='DISK';ld.size=size;light=bpy.data.objects.new(name,ld);scene.collection.objects.link(light);light.location=center+Vector(pos);light.rotation_euler=(center-light.location).to_track_quat('-Z','Y').to_euler()
    bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,lo.z-.005));floor=bpy.context.object;floor.name='StudioFloor';mat=bpy.data.materials.new('StudioIvory');mat.diffuse_color=(.79,.80,.77,1);floor.data.materials.append(mat)
    scene.render.filepath=str(OUT/'images'/(c['id']+'-front.png'));bpy.ops.render.render(write_still=True)
    blend=OUT/'models'/(c['id']+'.blend');bpy.ops.wm.save_as_mainfile(filepath=str(blend))
    meta={**c,'image':'images/'+c['id']+'-front.png','glb':'models/'+c['id']+'.glb','blend':'models/'+c['id']+'.blend','source_sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'source':'https://studio.blender.org/characters/'+c['base']+('/v4/' if c['base']=='snow' else '/v3/'),'credit':c['base'].title()+' Rig (CC) Blender Foundation | studio.blender.org','license':'CC-BY-4.0','camera':'front orthographic','facial_expression':{'mouthSmile':.30},'pose':{'LeftUpperArm_worldY':1.22,'RightUpperArm_worldY':-1.22}}
    (OUT/'models'/(c['id']+'.json')).write_text(json.dumps(meta,ensure_ascii=False,indent=2),encoding='utf-8')
    print('OPTION_RENDERED',c['id'],glb.stat().st_size,flush=True)

for c in chars:render_one(c)
print('FRONT_OPTIONS_COMPLETE',len(chars),flush=True)
