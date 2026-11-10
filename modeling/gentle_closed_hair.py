"""Create continuous sculpted hair volume beneath the swept fringe.

The crown envelope fills silhouette gaps. Voxel union removes interior overlap,
and the resulting real mesh remains attached to the avatar's Head bone.
"""
from pathlib import Path
import runpy, bpy, bmesh
from mathutils import Vector, Matrix


def build_swept_hair(rig,head):
    objects=runpy.run_path(str(Path(__file__).with_name('gentle_swept_hair.py')))['build_swept_hair'](rig,head,smooth_shell=True)
    # Use the actual lock silhouette to fill the crown, instead of inflating
    # the scalp sphere through the visible front fringe.
    cloud=[]
    for obj in objects:
        if 'Scalp' in obj.name:continue
        for v in obj.data.vertices:
            p=obj.matrix_world@v.co
            if p.z>1.706:
                inward=Vector((p.x,p.y+.005,(p.z-1.645)*.65)).normalized()
                cloud.append(p-inward*.002)
    def make_hull(name,points):
        hull=bmesh.new()
        for p in points[::3]:hull.verts.new(p)
        bmesh.ops.convex_hull(hull,input=list(hull.verts),use_existing_faces=False)
        unused=[v for v in hull.verts if not v.link_faces]
        if unused:bmesh.ops.delete(hull,geom=unused,context='VERTS')
        data=bpy.data.meshes.new(name);hull.to_mesh(data);hull.free()
        obj=bpy.data.objects.new(name,data);bpy.context.scene.collection.objects.link(obj)
        return obj
    envelopes=[make_hull('SweptCrownEnvelope',cloud)]
    for sign in [-1,1]:
        side=[]
        for obj in objects:
            for v in obj.data.vertices:
                p=obj.matrix_world@v.co
                if sign*p.x>.084 and 1.625<p.z<1.74:
                    side.append(p-Vector((sign*.0015,0,0)))
        envelopes.append(make_hull('TempleEnvelope_'+str(sign),side))

    # Close the scalp bowl before unioning it with the already closed locks.
    scalp=next(o for o in objects if 'Scalp' in o.name)
    bpy.ops.object.select_all(action='DESELECT');scalp.select_set(True);bpy.context.view_layer.objects.active=scalp
    thick=scalp.modifiers.new('Inner scalp thickness','SOLIDIFY');thick.thickness=.004;thick.offset=-1
    bpy.ops.object.modifier_apply(modifier=thick.name)
    vertices=[];faces=[]
    for obj in objects+envelopes:
        offset=len(vertices);vertices.extend(obj.matrix_world@v.co for v in obj.data.vertices)
        faces.extend(tuple(offset+i for i in p.vertices) for p in obj.data.polygons)
    data=bpy.data.meshes.new('GentleHair_Connected');data.from_pydata(vertices,[],faces);data.update()
    result=bpy.data.objects.new('GentleHair_Connected',data);bpy.context.scene.collection.objects.link(result)
    result.data.materials.append(objects[1].data.materials[0])
    bpy.ops.object.select_all(action='DESELECT');result.select_set(True);bpy.context.view_layer.objects.active=result
    remesh=result.modifiers.new('Continuous hair union','REMESH');remesh.mode='VOXEL';remesh.voxel_size=.0011;remesh.use_smooth_shade=True
    bpy.ops.object.modifier_apply(modifier=remesh.name)
    smooth=result.modifiers.new('Soften sculpt transitions','SMOOTH');smooth.factor=.5;smooth.iterations=3
    bpy.ops.object.modifier_apply(modifier=smooth.name)
    reduce=result.modifiers.new('Realtime hair surface','DECIMATE');reduce.ratio=.08
    bpy.ops.object.modifier_apply(modifier=reduce.name)
    for p in result.data.polygons:p.use_smooth=True
    for obj in objects+envelopes:bpy.data.objects.remove(obj,do_unlink=True)
    result.parent=rig;result.matrix_world=Matrix.Identity(4)
    group=result.vertex_groups.new(name='Head');group.add(list(range(len(result.data.vertices))),1,'REPLACE')
    skin=result.modifiers.new('Head skin','ARMATURE');skin.object=rig
    print('CLOSED_HAIR_VERTICES',len(result.data.vertices),flush=True)
    return [result]
