"""Continuous long straight mesh hair and fine fringe, weighted for a web rig."""
import bpy,bmesh,math
from mathutils import Vector,Matrix
from mathutils.bvhtree import BVHTree


def build_hair(rig,head):
    made=[]
    mat=bpy.data.materials.new('CNGirl_InkHair');mat.use_nodes=True
    p=mat.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value=(.006,.0045,.006,1)
    p.inputs['Roughness'].default_value=.57;p.inputs['Specular IOR Level'].default_value=.24
    deps=bpy.context.evaluated_depsgraph_get();evaluated=head.evaluated_get(deps);data=evaluated.to_mesh()
    tree=BVHTree.FromPolygons([evaluated.matrix_world@v.co for v in data.vertices],[tuple(p.vertices) for p in data.polygons]);evaluated.to_mesh_clear()
    def project_front(p):
        hit,_,_,_=tree.ray_cast(Vector((p.x,-.7,p.z)),Vector((0,1,0)),1)
        if hit is not None:p.y=min(p.y,hit.y-.007)
        return p

    def mesh(name,verts,faces):
        data=bpy.data.meshes.new(name);data.from_pydata(verts,[],faces);data.update()
        bm=bmesh.new();bm.from_mesh(data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(data);bm.free()
        obj=bpy.data.objects.new(name,data);bpy.context.scene.collection.objects.link(obj)
        data.materials.append(mat);made.append(obj);return obj

    # The scalp is a continuous shell. Bang roots overlap it; small separations
    # occur only below the hairline, where they show the forehead rather than sky.
    nu=96;nv=40;verts=[];faces=[]
    center=Vector((0,-.002,1.508))
    for j in range(nv+1):
        t=j/nv
        for i in range(nu):
            a=math.tau*i/nu;edge=1.83-.58*math.cos(a);phi=max(.001,t*edge)
            r=1+.004*math.cos(a*34+phi*.5)*math.sin(phi)
            regular=center+Vector((.116*r*math.sin(phi)*math.sin(a),-.112*r*math.sin(phi)*math.cos(a),.146*math.cos(phi)))
            direction=(regular-center).normalized();hit,normal,_,_=tree.ray_cast(center,direction,.40)
            if hit is not None:
                if normal.dot(direction)<0:normal=-normal
                fitted=hit+normal*(.008+.017*max(0,math.cos(phi))**4)
                blend=max(0,min(1,(phi-1.1)/.5));blend=blend*blend*(3-2*blend)
                regular=fitted.lerp(regular,blend)
            verts.append(regular)
    for j in range(nv):
        for i in range(nu):
            a=j*nu+i;b=j*nu+(i+1)%nu;faces.append((a,b,b+nu,a+nu))
    scalp=mesh('CNGirl_Scalp',verts,faces)
    bpy.ops.object.select_all(action='DESELECT');scalp.select_set(True);bpy.context.view_layer.objects.active=scalp
    thick=scalp.modifiers.new('Scalp volume','SOLIDIFY');thick.thickness=.008;thick.offset=-1;bpy.ops.object.modifier_apply(modifier=thick.name)

    # Closed outer/inner curtain, with a broad back and soft staggered ends.
    nu=96;nv=72;verts=[];faces=[]
    for inner in [False,True]:
        for j in range(nv+1):
            t=j/nv;z=1.590-.503*t
            join=max(0,min(1,t/.22));join=join*join*(3-2*join)
            rx=.080*(1-join)+(.116+.023*math.sin(t*math.pi*.78))*join
            ry=.072*(1-join)+(.104+.005*math.sin(t*math.pi))*join;cy=.006+.026*t
            for i in range(nu+1):
                a=.75+(math.tau-1.50)*i/nu
                groove=.00075*math.cos(a*40+t*.8)*(math.sin(math.pi*t)**.4)
                inset=.011 if inner else 0
                zz=z+.009*math.cos(a*3+.4)*t**7
                verts.append(((rx-inset+groove)*math.sin(a),cy-(ry-inset+groove)*math.cos(a),zz))
    layer=(nu+1)*(nv+1)
    for j in range(nv):
        for i in range(nu):
            a=j*(nu+1)+i;b=a+1;c=b+nu+1;d=a+nu+1
            faces.extend([(a,b,c,d),(a+layer,d+layer,c+layer,b+layer)])
    for j in range(nv):
        for i in [0,nu]:
            a=j*(nu+1)+i;b=a+nu+1;faces.append((a,b,b+layer,a+layer))
    for j in [0,nv]:
        for i in range(nu):
            a=j*(nu+1)+i;b=a+1;faces.append((a,a+layer,b+layer,b))
    mesh('CNGirl_LongBack',verts,faces)

    def curve(points,t):
        a,b,c,d=[Vector(p) for p in points];u=1-t
        return u**3*a+3*u*u*t*b+3*u*t*t*c+t**3*d

    def lock(name,points,width,depth,project=False):
        verts=[];faces=[];n=54;sides=16
        for j in range(n+1):
            t=j/n;c=curve(points,t)
            if project:c=project_front(c)
            tangent=(curve(points,min(1,t+.002))-curve(points,max(0,t-.002))).normalized()
            normal=Vector((0,-1,.15));across=tangent.cross(normal).normalized();normal=across.cross(tangent).normalized()
            taper=(.62+.38*math.sin(math.pi*t)**.6)*max(.004,1-t**3)**.6
            for k in range(sides):
                a=math.tau*k/sides
                verts.append(c+across*(math.cos(a)*width*taper)+normal*(math.sin(a)*depth*taper))
        for j in range(n):
            for k in range(sides):
                a=j*sides+k;b=j*sides+(k+1)%sides;faces.append((a,b,b+sides,a+sides))
        faces.extend([tuple(reversed(range(sides))),tuple(n*sides+i for i in range(sides))])
        return mesh(name,verts,faces)

    # A continuous thin fringe avoids the raised cylindrical roots of separate
    # locks. Only the lower edge has shallow notches for a lighter bang shape.
    nu=120;nv=48;verts=[];faces=[]
    for inner in [False,True]:
        for j in range(nv+1):
            t=j/nv
            for i in range(nu+1):
                u=i/nu;xe=(u*2-1)*.103;norm=abs(xe)/.103;xr=xe*.61
                zr=1.508+.146*math.sqrt(max(.01,1-(xr/.116)**2-((-.035+.002)/.112)**2))
                ze=1.527-.036*norm**1.4+.025*math.exp(-((xe-.010)/.026)**2)+.004*((1+math.cos(u*math.tau*11))*.5)**6
                p=curve([(xr,-.035,zr),(xe*.77,-.113+.010*norm,1.600-.012*norm),(xe,-.152+.018*norm,1.563-.019*norm),(xe,-.155+.018*norm,ze)],t)
                p.y+=.00055*math.cos(u*math.tau*10+t*.8)*math.sin(math.pi*t)
                p=project_front(p)
                if inner:p.y+=.006
                verts.append(p)
    layer=(nu+1)*(nv+1)
    for j in range(nv):
        for i in range(nu):
            a=j*(nu+1)+i;b=a+1;c=b+nu+1;d=a+nu+1
            faces.extend([(a,b,c,d),(a+layer,d+layer,c+layer,b+layer)])
    for j in range(nv):
        for i in [0,nu]:
            a=j*(nu+1)+i;b=a+nu+1;faces.append((a,b,b+layer,a+layer))
    for j in [0,nv]:
        for i in range(nu):
            a=j*(nu+1)+i;b=a+1;faces.append((a,a+layer,b+layer,b))
    mesh('CNGirl_ContinuousFringe',verts,faces)
    vertices=[];faces=[]
    for o in made:
        offset=len(vertices);vertices.extend(tuple(v.co) for v in o.data.vertices)
        faces.extend(tuple(offset+i for i in p.vertices) for p in o.data.polygons)
    result=mesh('CNGirl_Hair',vertices,faces)
    bpy.ops.object.select_all(action='DESELECT');result.select_set(True);bpy.context.view_layer.objects.active=result
    remesh=result.modifiers.new('Continuous hair volume','REMESH');remesh.mode='VOXEL';remesh.voxel_size=.00125;remesh.use_smooth_shade=True;bpy.ops.object.modifier_apply(modifier=remesh.name)
    smooth=result.modifiers.new('Soft transitions','SMOOTH');smooth.factor=.40;smooth.iterations=6;bpy.ops.object.modifier_apply(modifier=smooth.name)
    triangles=sum(len(p.vertices)-2 for p in result.data.polygons)
    reduce=result.modifiers.new('Realtime surface','DECIMATE');reduce.ratio=min(1,48000/triangles);bpy.ops.object.modifier_apply(modifier=reduce.name)
    for o in made:
        if o!=result:bpy.data.objects.remove(o,do_unlink=True)
    result.parent=rig;result.matrix_world=Matrix.Identity(4)
    groups={name:result.vertex_groups.new(name=name) for name in ['Head','Neck','Chest']}
    def s(t):t=max(0,min(1,t));return t*t*(3-2*t)
    for v in result.data.vertices:
        z=v.co.z;h=s((z-1.425)/.095);c=1-s((z-1.27)/.13);n=max(0,1-h-c)
        for name,w in [('Head',h),('Neck',n),('Chest',c)]:
            if w>0:groups[name].add([v.index],w,'REPLACE')
    mod=result.modifiers.new('Hair follows head and shoulders','ARMATURE');mod.object=rig
    for p in result.data.polygons:p.use_smooth=True
    print('FEMALE_HAIR',len(result.data.vertices),len(result.data.polygons),flush=True)
    return result
