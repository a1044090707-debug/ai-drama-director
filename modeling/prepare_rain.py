"""Inspect controls and render the original Rain asset before web conversion."""
from pathlib import Path
import json, math
import bpy
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'model-preview/rain/assets'
OUT.mkdir(parents=True,exist_ok=True)
rig=bpy.data.objects['RIG-rain']
details={'controls':[],'materials':[],'images':[]}
for b in rig.pose.bones:
    if b.keys() or any(t in b.name.lower() for t in ['eye_close','eyelid','jaw','mouth']):
        details['controls'].append({'name':b.name,'properties':{k:str(v) for k,v in b.items()},
            'constraints':[(c.name,c.type) for c in b.constraints]})
for m in bpy.data.materials:
    if not m.node_tree:continue
    details['materials'].append({'name':m.name,'links':[(l.from_node.name,l.from_socket.name,l.to_node.name,l.to_socket.name) for l in m.node_tree.links],
        'ramps':{n.name:[{'pos':e.position,'color':list(e.color)} for e in n.color_ramp.elements] for n in m.node_tree.nodes if n.type=='VALTORGB'},
        'attributes':[(n.name,getattr(n,'attribute_name',getattr(n,'layer_name',''))) for n in m.node_tree.nodes if n.type in ['ATTRIBUTE','VERTEX_COLOR']]})
for image in bpy.data.images:
    details['images'].append({'name':image.name,'path':image.filepath,'absolute':bpy.path.abspath(image.filepath),'tiles':[t.number for t in image.tiles]})
(OUT/'source-controls.json').write_text(json.dumps(details,indent=2),encoding='utf-8')

visible=[o for o in bpy.context.scene.objects if o.type=='MESH' and o.visible_get() and not o.hide_render]
points=[o.matrix_world@Vector(c) for o in visible for c in o.bound_box]
minimum=Vector([min(p[i] for p in points) for i in range(3)])
maximum=Vector([max(p[i] for p in points) for i in range(3)])
print('SOURCE_BOUNDS',list(minimum),list(maximum),flush=True)
for o in bpy.data.objects:
    if o.type=='MESH' and o not in visible:o.hide_render=True
scene=bpy.context.scene
scene.render.engine='CYCLES'
scene.cycles.device='CPU';scene.cycles.samples=24;scene.cycles.use_denoising=True
scene.render.resolution_x=800;scene.render.resolution_y=960;scene.render.resolution_percentage=100
scene.render.film_transparent=False
scene.world=bpy.data.worlds.new('InspectionWorld');scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.78,.79,.72,1)
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.45
center=(minimum+maximum)/2;height=maximum.z-minimum.z
camera_data=bpy.data.cameras.new('InspectionCamera');camera=bpy.data.objects.new('InspectionCamera',camera_data);scene.collection.objects.link(camera)
camera.location=center+Vector((height*.80,-height*3.4,height*.25))
camera.rotation_euler=(center-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=height*1.18;scene.camera=camera
for name,position,power,size in [('Key',(-3,-4,6),650,4),('Fill',(4,-2,3),350,3),('Rim',(1,3,5),550,3)]:
    data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=size
    light=bpy.data.objects.new(name,data);scene.collection.objects.link(light);light.location=center+Vector(position)
    light.rotation_euler=(center-light.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,minimum.z-.015));floor=bpy.context.object
floor_mat=bpy.data.materials.new('InspectionFloor');floor_mat.diffuse_color=(.68,.73,.60,1);floor.data.materials.append(floor_mat)
scene.view_settings.view_transform='AgX'
scene.render.image_settings.file_format='PNG';scene.render.filepath=str(OUT/'rain-source-render.png')
bpy.ops.render.render(write_still=True)
print('SOURCE_RENDERED',scene.render.filepath,flush=True)
