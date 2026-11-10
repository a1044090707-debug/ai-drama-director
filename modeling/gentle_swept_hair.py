"""Editable, head-skinned mesh hair with a scalp shell and swept tapered locks.

Coordinates are metres in Blender world Z-up. No image billboards or particles.
"""
import bpy, bmesh, math
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree


def build_swept_hair(rig, head, smooth_shell=False):
    scene=bpy.context.scene
    center=Vector((0,-.005,1.645))
    deps=bpy.context.evaluated_depsgraph_get()
    evaluated=head.evaluated_get(deps)
    data=evaluated.to_mesh()
    points=[evaluated.matrix_world@v.co for v in data.vertices]
    tree=BVHTree.FromPolygons(points,[tuple(p.vertices) for p in data.polygons])
    evaluated.to_mesh_clear()
    made=[]

    def material(name, rgb):
        m=bpy.data.materials.new(name);m.use_nodes=True
        p=m.node_tree.nodes.get('Principled BSDF')
        def linear(v):return v/12.92 if v<.04045 else ((v+.055)/1.055)**2.4
        p.inputs['Base Color'].default_value=(*(linear(v) for v in rgb),1)
        p.inputs['Roughness'].default_value=.48
        p.inputs['Specular IOR Level'].default_value=.28
        return m
    base=material('SweptHair_Base',(.69,.55,.33))
    colors=[material('SweptHair_Gold',(.78,.65,.43)),
            material('SweptHair_LightGold',(.83,.72,.51)),
            material('SweptHair_AshGold',(.74,.62,.43))]

    def mesh(name, verts, faces, mat):
        data=bpy.data.meshes.new(name);data.from_pydata(verts,[],faces);data.update()
        bm=bmesh.new();bm.from_mesh(data)
        bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
        bm.to_mesh(data);bm.free()
        obj=bpy.data.objects.new(name,data);scene.collection.objects.link(obj)
        obj.parent=rig;obj.matrix_world=Matrix.Identity(4)
        group=obj.vertex_groups.new(name='Head');group.add(list(range(len(verts))),1,'REPLACE')
        mod=obj.modifiers.new('Head skin','ARMATURE');mod.object=rig
        data.materials.append(mat)
        for p in data.polygons:p.use_smooth=True
        made.append(obj)
        return obj

    # The shell is fitted to the edited skull rather than an unrelated sphere.
    def shell(phi,theta,extra=0):
        direction=Vector((math.sin(phi)*math.sin(theta),-math.sin(phi)*math.cos(theta),math.cos(phi)))
        hit,normal,_,_=tree.ray_cast(center,direction,.40)
        if hit is None:
            hit=center+Vector((.108*direction.x,.100*direction.y,.110*direction.z))
            normal=direction
        if smooth_shell:
            # Lower scalp rays can hit the ears. Blend to a regular skull
            # envelope there so locks do not inherit the ear's small folds.
            t=max(0,min(1,(phi-1.05)/.45));t=t*t*(3-2*t)
            regular=center+Vector((.112*direction.x,.101*direction.y,.111*direction.z))
            hit=hit.lerp(regular,t)
            regular_normal=Vector((direction.x/.112,direction.y/.101,direction.z/.111)).normalized()
            normal=normal.lerp(regular_normal,t).normalized()
        if normal.dot(direction)<0:normal=-normal
        # A continuous crown volume fills the space beneath the longer fringe.
        lift=.007+.020*max(0,math.cos(phi))**4
        return hit+normal*(lift+extra)

    nu=112;nv=40
    verts=[];faces=[]
    for j in range(nv+1):
        t=j/nv
        for i in range(nu):
            theta=math.tau*i/nu
            edge=1.65-.67*math.cos(theta)
            phi=max(.001,t*edge)
            verts.append(shell(phi,theta,.00035*math.cos(theta*34+phi*4)*math.sin(phi)))
    for j in range(nv):
        for i in range(nu):
            a=j*nu+i;b=j*nu+(i+1)%nu
            faces.append((a,b,b+nu,a+nu))
    mesh('SweptHair_Scalp',verts,faces,base)

    def catmull(points,t):
        t=min(.999999,max(0,t))*(len(points)-1);i=int(t);u=t-i
        a=points[max(0,i-1)];b=points[i];c=points[min(len(points)-1,i+1)];d=points[min(len(points)-1,i+2)]
        return .5*((2*b)+(-a+c)*u+(2*a-5*b+4*c-d)*u*u+(-a+3*b-3*c+d)*u*u*u)

    def lock(name,points,width,depth,mat):
        points=[Vector(p) for p in points]
        n=48;sides=24;verts=[];faces=[]
        for j in range(n+1):
            t=j/n;c=catmull(points,t)
            tangent=(catmull(points,min(1,t+.003))-catmull(points,max(0,t-.003))).normalized()
            radial=Vector((c.x/.110**2,(c.y+.005)/.105**2,(c.z-1.645)/.115**2)).normalized()
            across=tangent.cross(radial).normalized()
            normal=across.cross(tangent).normalized()
            taper=(.48+.52*math.sin(math.pi*t)**.6)*max(.003,1-t**2.1)**.70
            for k in range(sides):
                a=math.tau*k/sides
                # A broad, flattened lens cross-section with shallow grooves.
                u=math.cos(a)
                ridge=1-.06*math.cos(u*math.pi*6+.3*math.sin(t*5))
                verts.append(c+across*(width*taper*u)+normal*(depth*taper*math.sin(a)*ridge))
        for j in range(n):
            for k in range(sides):
                a=j*sides+k;b=j*sides+(k+1)%sides
                faces.append((a,b,b+sides,a+sides))
        faces.extend([tuple(reversed(range(sides))),tuple(n*sides+k for k in range(sides))])
        return mesh(name,verts,faces,mat)

    # Back and temples follow the scalp. Staggered ends avoid a helmet rim.
    for i in range(22):
        theta=.95+(math.tau-1.9)*i/21
        edge=1.65-.67*math.cos(theta)
        path=[shell(phi,theta+.12*math.sin(phi),.0025) for phi in [.34,.70,1.05,edge+.07]]
        lock('SweptHair_Back_%02d'%i,path,.014,.0045,colors[i%3])

    # Long diagonal locks make the fringe; their roots overlap under the part.
    bangs=[
      ([(.058,-.035,1.771),(.020,-.103,1.775),(-.055,-.124,1.727),(-.092,-.107,1.668)],.025,.007),
      ([(.061,-.019,1.774),(.007,-.094,1.784),(-.058,-.126,1.745),(-.102,-.109,1.699)],.024,.007),
      ([(.050,-.050,1.762),(.013,-.117,1.757),(-.041,-.137,1.711),(-.060,-.130,1.663)],.023,.007),
      ([(.043,-.064,1.748),(.019,-.124,1.744),(-.006,-.141,1.708),(-.012,-.141,1.674)],.021,.006),
      ([(.058,-.055,1.749),(.052,-.116,1.735),(.070,-.132,1.704),(.082,-.116,1.661)],.020,.006),
      ([(.068,-.032,1.759),(.084,-.100,1.742),(.101,-.108,1.702),(.107,-.085,1.648)],.018,.006),
      ([(.025,-.006,1.782),(-.025,-.075,1.791),(-.092,-.098,1.755),(-.115,-.075,1.712)],.022,.006),
      ([(.005,.019,1.784),(-.052,-.035,1.791),(-.104,-.067,1.758),(-.121,-.041,1.720)],.021,.006),
      ([(.058,.009,1.775),(.096,-.035,1.758),(.116,-.061,1.716),(.114,-.060,1.670)],.019,.006),
    ]
    for i,(path,width,depth) in enumerate(bangs):
        lock('SweptHair_Fringe_%02d'%i,path,width,depth,colors[i%3])
    # Short sideburns cover the shell ends above the ears.
    for sign in [-1,1]:
        lock('SweptHair_Temple_'+str(sign),[(sign*.102,-.065,1.720),(sign*.112,-.078,1.687),(sign*.110,-.078,1.648),(sign*.105,-.075,1.614)],.013,.0045,colors[2])
    return made
