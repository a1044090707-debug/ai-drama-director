"""Author the first orange-cap character on the converted Blender Studio Rain rig.

Run with .modeling/third-party/rain/baked/rain-web-converted.blend loaded.
This is a derivative test asset, not an exact reconstruction of the reference.
"""
from pathlib import Path
import math,json,bpy,bmesh
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'model-preview/orange-rain/assets';OUT.mkdir(parents=True,exist_ok=True)
COL=bpy.data.collections['Rain_Web_Export'];RIG=bpy.data.objects['Rain_Web_Rig']
if bpy.context.object and bpy.context.object.mode!='OBJECT':bpy.ops.object.mode_set(mode='OBJECT')
SCENE=bpy.context.scene;SCENE.render.engine='CYCLES';SCENE.cycles.device='CPU';SCENE.cycles.samples=1
SCENE.render.bake.margin=8

def linear(hex):
    a=[int(hex[i:i+2],16)/255 for i in (0,2,4)]
    return tuple(v/12.92 if v<.04045 else ((v+.055)/1.055)**2.4 for v in a)
def material(name,hex,rough=.78,metal=0):
    m=bpy.data.materials.new(name);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value=(*linear(hex),1);p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal
    return m
GREEN=material('OrangeGirl_SageHoodie','718950',.97)
RIB=material('OrangeGirl_KnitRib','667d49',.99)
CREAM=material('OrangeGirl_CreamCotton','f0e0c7',.97)
PANTS=material('OrangeGirl_CreamTrousers','eee0cc',.99)
ORANGE=material('OrangeGirl_OrangeCap','f47d22',.83)
HAIR=material('OrangeGirl_ChestnutHair','6e3820',.62)
HAIRLIGHT=material('OrangeGirl_HairHighlights','8b492a',.65)
HAIRDARK=material('OrangeGirl_HairShadow','512819',.73)
GOLD=material('OrangeGirl_GoldHoops','e2aa3e',.3,.65)
SKIN=material('OrangeGirl_Skin','eeb68e',.79)

def smooth(x):x=max(0,min(1,x));return x*x*(3-2*x)
def mesh_object(name,verts,faces,mat,weights):
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update()
    bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(mesh);bm.free()
    o=bpy.data.objects.new(name,mesh);COL.objects.link(o);mesh.materials.append(mat)
    groups={}
    for i,v in enumerate(verts):
        values=weights(Vector(v),i) if callable(weights) else [(weights,1)]
        for n,w in values:
            if n not in groups:groups[n]=o.vertex_groups.new(name=n)
            if w>0:groups[n].add([i],w,'REPLACE')
    mod=o.modifiers.new('Rain_Body_Skin','ARMATURE');mod.object=RIG;o.parent=RIG
    for p in mesh.polygons:p.use_smooth=True
    return o

def surface(name,nu,nv,fn,mat,weights,wrap=True):
    verts=[fn(i/nu,j/nv) for j in range(nv+1) for i in range(nu+1)]
    faces=[]
    for j in range(nv):
        for i in range(nu):
            a=j*(nu+1)+i;faces.append((a,a+1,a+nu+2,a+nu+1))
    return mesh_object(name,verts,faces,mat,weights)

def tube(name,path,radius,mat,bone,segments=72,sides=12,flatten=1,taper=False,grooves=0):
    centers=[Vector(path(i/segments)) for i in range(segments+1)]
    def point(u,t):
        j=round(t*segments);p=centers[j].copy();tangent=(centers[min(segments,j+1)]-centers[max(0,j-1)]).normalized()
        n=tangent.cross(Vector((0,1,0)))
        if n.length<.01:n=tangent.cross(Vector((1,0,0)))
        n.normalize();b=tangent.cross(n).normalized();a=u*math.tau
        scale=(.12+.88*math.sin(math.pi*(.08+.92*t))**.45) if taper else 1
        scale*=1+grooves*math.cos(a*5+math.sin(t*5))
        return p+radius*scale*(math.cos(a)*n+math.sin(a)*b*flatten)
    return surface(name,sides,segments,point,mat,bone)

def ellipsoid(name,center,radii,mat,bone,nu=40,nv=20):
    def f(u,t):
        a=u*math.tau;p=t*math.pi
        return (center[0]+radii[0]*math.cos(a)*math.sin(p),center[1]+radii[1]*math.sin(a)*math.sin(p),center[2]+radii[2]*math.cos(p))
    return surface(name,nu,nv,f,mat,bone)

# Retain Rain's actual sculpted face, mouth topology, hands, shoes, and skinning.
# Omit the ponytail/scarf because this character has loose curls and a hoodie.
for name in ['Rain_hair_main','Rain_hair_ponytail','Rain_hair_strand','Rain_hairband','Rain_scarf']:
    o=bpy.data.objects.get(name)
    if o:bpy.data.objects.remove(o,do_unlink=True)

# Use color attributes on the existing Rain facial topology. Materials stay lit.
head=bpy.data.objects['Rain_head']
skin_mat=SKIN.copy();skin_mat.name='OrangeGirl_FaceWithBlush'
head.data.materials.clear();head.data.materials.append(skin_mat)
color=head.data.color_attributes.new(name='FacePaint',type='FLOAT_COLOR',domain='CORNER')
base=Vector(linear('efbd9a'));blush=Vector(linear('eaa087'));lip=Vector(linear('cf8772'))
for loop in head.data.loops:
    v=head.data.vertices[loop.vertex_index].co
    cheek=math.exp(-((abs(v.x)-.074)/.036)**2-((v.z-1.418)/.042)**2)*smooth((-v.y-.08)/.06)*.33
    mouth=math.exp(-(v.x/.041)**6-((v.z-1.390)/.014)**2)*smooth((-v.y-.11)/.04)*.75
    c=base.lerp(blush,cheek).lerp(lip,mouth);color.data[loop.index].color=(*c,1)
nodes=skin_mat.node_tree.nodes;p=nodes.get('Principled BSDF');vc=nodes.new('ShaderNodeVertexColor');vc.layer_name='FacePaint';skin_mat.node_tree.links.new(vc.outputs['Color'],p.inputs['Base Color'])
body=bpy.data.objects['Rain_body'];body.data.materials.clear();body.data.materials.append(SKIN)

# Keep the authored trouser folds and weights while opening the lower-leg cut.
pants=bpy.data.objects['Rain_jeans'];pants.data.materials.clear();pants.data.materials.append(PANTS)
for v in pants.data.vertices:
    x,y,z=v.co;s=1 if x>=0 else -1;axis=.066+.016*smooth((z-.1)/.7)
    t=1-smooth((z-.2)/.52);factor=1.12+.73*t
    v.co.x=s*max(.012,axis+(abs(x)-axis)*factor)
    v.co.y=y*(1.15+.35*t)
    v.co.z=z-.026*(1-smooth((z-.13)/.17))
    v.co.y+=.0018*math.sin(z*105+x*90)*t

# Refit Rain's existing top mesh into the body of the loose hoodie.
top=bpy.data.objects['Rain_top'];top.data.materials.clear();top.data.materials.append(GREEN)
for v in top.data.vertices:
    x,y,z=v.co;waist=math.exp(-((z-.98)/.19)**2)
    v.co.x=x*(1.1+.23*waist)
    v.co.y=y*(1.12+.13*waist)
    v.co.z=z-.025*(1-smooth((z-.85)/.12))

def torso_weights(v,i):
    t=smooth((v.z-.88)/.32);return [('Hips',1-t),('Chest',t)]
for side,s in [('Left',1),('Right',-1)]:
    a=RIG.data.bones[side+'UpperArm'].head_local.copy();b=RIG.data.bones[side+'ForeArm'].head_local.copy();c=RIG.data.bones[side+'Hand'].head_local.copy()
    def sleeve(u,t):
        if t<.5:p=a.lerp(b,t*2)
        else:p=b.lerp(c,(t-.5)*2)
        radius=(.078*(1-t)+.040*t)*(1+.20*math.sin(math.pi*t))
        angle=u*math.tau;wrinkle=.0025*math.sin(t*33+math.sin(angle*3))*math.sin(math.pi*t)**2
        # Cross section lies in YZ, since Rain's authored rest arms extend in X.
        return (p.x,p.y+math.cos(angle)*(radius+wrinkle)*1.06,p.z+math.sin(angle)*(radius+wrinkle))
    def sleeve_weights(v,i):
        t=(abs(v.x)-abs(a.x))/(abs(c.x)-abs(a.x));w=smooth((t-.32)/.36)
        return [(side+'UpperArm',1-w),(side+'ForeArm',w)]
    surface(side+'_SageSleeve',32,48,sleeve,GREEN,sleeve_weights)
    ellipsoid(side+'_ShoulderCloth',a,(.087,.079,.077),GREEN,side+'UpperArm')
    # Sleeve cuff is close to the actual Rain wrist and follows the forearm.
    def cuff(u,t):
        angle=u*math.tau;p=c.lerp(b,t*.11);r=.043+.0015*math.cos(angle*32)
        return (p.x,p.y+math.cos(angle)*r,p.z+math.sin(angle)*r)
    surface(side+'_KnittedCuff',64,5,cuff,RIB,side+'ForeArm')

# Folded hood around the back of the neck; front ends sit beside the drawstrings.
def hood(u,t):
    a=(-.92+3.14159*1.59*u);center=Vector((math.sin(a)*.100,math.cos(a)*.066,1.275-.032*math.cos(a)))
    radius=.036+.020*math.sin(math.pi*u)
    return center+Vector((math.sin(a)*math.cos(t*math.tau)*radius,math.cos(a)*math.cos(t*math.tau)*radius,math.sin(t*math.tau)*radius*.80))
surface('OrangeGirl_FoldedHood',72,20,hood,GREEN,'Chest')
ellipsoid('OrangeGirl_HoodBack',(0,.082,1.235),(.107,.045,.088),GREEN,'Chest')
for s in [-1,1]:
    tube('OrangeGirl_Drawstring',lambda t,s=s:(s*(.044+.004*math.sin(t*3)), -.110-.019*math.sin(t*math.pi),1.265-.16*t),.0032,CREAM,'Chest',32,8)
    ellipsoid('OrangeGirl_DrawstringTip',(s*.045,-.113,1.103),(.004,.004,.010),CREAM,'Chest',16,8)
    tube('OrangeGirl_PocketSeam',lambda t,s=s:(s*(.103-.038*t),-.143-.004*math.sin(t*math.pi),.985-.050*t),.0014,RIB,torso_weights,24,6)
def hem(u,t):
    a=u*math.tau;r=1+.006*math.cos(a*96)
    return (.161*math.sin(a)*r,.105*math.cos(a)*r,.824+.027*t)
surface('OrangeGirl_HoodieHem',128,4,hem,RIB,'Hips')

# Broad, tapered ribbon locks with fine grooves, bound to Rain's actual head.
ellipsoid('OrangeGirl_HairBackMass',(0,.048,1.430),(.146,.093,.190),HAIRDARK,'Head')
for k in range(11):
    x=(k-5)*.027;length=.335+.03*math.sin(k*1.3)
    def back(t,k=k,x=x,length=length):
        return (x+.017*math.sin(t*math.tau*1.8+k*.8),.111+.014*math.cos(t*math.tau*1.8+k),1.583-length*t)
    tube('OrangeGirl_BackCurl_%02d'%k,back,.025,HAIR if k%3 else HAIRLIGHT,'Head',64,16,flatten=.74,taper=True,grooves=.06)
for s in [-1,1]:
    for k in range(5):
        def curl(t,s=s,k=k):
            phase=t*math.tau*1.65+k*.7
            return (s*(.119+k*.011+.022*math.sin(phase)), -.091+k*.036+.012*math.cos(phase),1.589-(.333+k*.007)*t)
        tube('OrangeGirl_SideCurl_%s_%d'%(s,k),curl,.024,HAIR if k%2 else HAIRLIGHT,'Head',72,16,flatten=.8,taper=True,grooves=.055)
def fringe(t):return(-.113+.225*t,-.126-.022*math.sin(t*math.pi),1.592-.069*t+.014*math.sin(t*math.pi))
tube('OrangeGirl_SweptFringe',fringe,.030,HAIR,'Head',64,20,flatten=.62,taper=True,grooves=.075)

# Six-panel baseball cap. Its lower rim fits the Rain cranium under the curls.
def crown(u,t):
    a=u*math.tau;p=.01+t*math.pi*.50
    return(.158*math.sin(p)*math.sin(a),-.022-.146*math.sin(p)*math.cos(a),1.573+.129*math.cos(p))
cap=surface('OrangeGirl_CapCrown',96,32,crown,ORANGE,'Head');cap.data.materials.append(CREAM)
for poly in cap.data.polygons:
    center=poly.center if poly.area else Vector((0,0,0))
    # Derive the center explicitly; MeshPolygon.center can be stale after creation.
    center=sum((cap.data.vertices[i].co for i in poly.vertices),Vector())/len(poly.vertices)
    angle=math.atan2(center.x,-(center.y+.022));poly.material_index=1 if abs(angle)<.66 else 0
def brim(u,t):
    a=-1.20+2.40*u;e=math.sin(math.pi*u)**.65*t
    return (math.sin(a)*(.155+.022*e),-.022-math.cos(a)*(.144+.108*e),1.574-.020*e*e+.006*math.sin(a)**2)
surface('OrangeGirl_CapBrim',72,16,brim,ORANGE,'Head')
tube('OrangeGirl_BrimEdge',lambda t:brim(t,1),.0025,ORANGE,'Head',72,8)
ellipsoid('OrangeGirl_CapButton',(0,-.022,1.703),(.008,.007,.004),ORANGE,'Head',24,12)
for a in [-.66,.66,math.pi]:
    tube('OrangeGirl_CapSeam',lambda t,a=a:(.1585*math.sin(t*math.pi*.5)*math.sin(a),-.022-.1465*math.sin(t*math.pi*.5)*math.cos(a),1.573+.1295*math.cos(t*math.pi*.5)),.00065,ORANGE,'Head',40,6)
for s in [-1,1]:
    tube('OrangeGirl_GoldEarring',lambda t,s=s:(s*.130+.012*math.sin(t*math.tau),-.045,1.399+.018*math.cos(t*math.tau)),.0028,GOLD,'Head',48,8)

# Warm eye color, retaining the original eye UV layout and painted details.
eyes=bpy.data.objects['Rain_eyes'];m=eyes.data.materials[0];nodes=m.node_tree.nodes;links=m.node_tree.links;p=nodes.get('Principled BSDF');old=p.inputs['Base Color'].links[0].from_socket
h=nodes.new('ShaderNodeHueSaturation');h.inputs['Hue'].default_value=.96;h.inputs['Saturation'].default_value=.8;links.new(old,h.inputs['Color'])
output=next(n for n in nodes if n.type=='OUTPUT_MATERIAL');em=nodes.new('ShaderNodeEmission');links.new(h.outputs['Color'],em.inputs['Color']);links.new(em.outputs[0],output.inputs['Surface'])
image=bpy.data.images.new('OrangeGirl_AmberEyes',width=512,height=512);target=nodes.new('ShaderNodeTexImage');target.image=image;nodes.active=target
bpy.ops.object.select_all(action='DESELECT');eyes.select_set(True);bpy.context.view_layer.objects.active=eyes
bpy.ops.object.bake(type='EMIT');image.filepath_raw=str(OUT/'amber-eyes.png');image.file_format='PNG';image.save()
links.new(p.outputs['BSDF'],output.inputs['Surface']);links.new(target.outputs['Color'],p.inputs['Base Color'])
uv=nodes.new('ShaderNodeUVMap');uv.uv_map='WebUV';links.new(uv.outputs['UV'],target.inputs['Vector'])

# Export a genuine Rain derivative with its full body and face shapes.
for o in bpy.context.scene.objects:o.select_set(False)
for o in COL.objects:o.hide_set(False);o.select_set(True)
bpy.context.view_layer.objects.active=RIG
path=OUT/'orange-girl-rain-v1.glb'
bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_animations=False,export_skins=True,export_morph=True,export_morph_normal=True,export_apply=False,export_yup=True,export_image_format='AUTO',export_texcoords=True,export_normals=True,export_materials='EXPORT',export_extras=True,export_cameras=False,export_lights=False,export_def_bones=True)
metadata={'name':'Orange Girl — Rain derivative test v1','source':'https://studio.blender.org/characters/rain/v3/','credit':'Rain Rig (CC) Blender Foundation | studio.blender.org','license':'CC-BY-4.0','changes':['Rain face topology, portable expressions, hands, shoes and body skin retained','New cap, shoulder-length curls, hood, sleeves and drawstrings','Existing Rain trouser and top meshes refitted; new skin and clothing colors'],'bones':len(RIG.data.bones),'bytes':path.stat().st_size,'status':'Test asset; custom sculpt and garment fitting still require review against supplied design.'}
(OUT/'model-info.json').write_text(json.dumps(metadata,ensure_ascii=False,indent=2),encoding='utf-8')
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'orange-girl-rain-v1.blend'))
print('ORANGE_RAIN_EXPORTED',path.stat().st_size,flush=True)
