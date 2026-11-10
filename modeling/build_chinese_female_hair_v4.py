"""Parted, layered opaque hair ribbons with a fitted continuous scalp.

Keep designed ridges and tapered ends instead of voxel-merging the hairstyle.
"""
import bpy, bmesh, math
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree


def build_hair(rig, head):
    verts=[]; faces=[]
    deps=bpy.context.evaluated_depsgraph_get()
    evaluated=head.evaluated_get(deps); data=evaluated.to_mesh()
    tree=BVHTree.FromPolygons([evaluated.matrix_world@v.co for v in data.vertices],
                             [tuple(p.vertices) for p in data.polygons])
    evaluated.to_mesh_clear()
    def add(v,f):
        offset=len(verts);verts.extend(v)
        faces.extend(tuple(offset+i for i in p) for p in f)
    def smooth(t):
        t=max(0,min(1,t));return t*t*(3-2*t)
    def project(p, offset=.005, exact=False):
        p=p.copy()
        hit,_,_,_=tree.ray_cast(Vector((p.x,-.7,p.z)),Vector((0,1,0)),1)
        if hit is not None:p.y=hit.y-offset if exact else min(p.y,hit.y-offset)
        return p

    # Reuse the professionally authored Rain crown and swept front strand.
    for name in ['Rain_hair_main','Rain_hair_strand']:
        source=bpy.data.objects[name]
        add([source.matrix_world@v.co for v in source.data.vertices],
            [tuple(p.vertices) for p in source.data.polygons])

    # Closed back sheet, shaped in a soft S profile with independently staggered tips.
    nu=96;nv=64;v=[];f=[]
    for inner in [False,True]:
        for j in range(nv+1):
            t=j/nv;join=smooth(t/.23)
            rx=.078*(1-join)+(.119+.008*math.sin(t*math.pi*1.6))*join
            ry=.070*(1-join)+(.109+.009*math.sin(t*math.pi))*join
            cy=.005+.034*t
            for i in range(nu+1):
                a=.88+(math.tau-1.76)*i/nu
                groove=.0012*math.cos(a*42+t*1.7)+.0003*math.cos(a*109-t)
                inset=.007 if inner else 0
                z=1.602-.518*t+(.010*math.sin(a*7)+.006*math.cos(a*13))*t**9
                v.append(((rx-inset+groove)*math.sin(a),cy-(ry-inset+groove)*math.cos(a),z))
    layer=(nu+1)*(nv+1)
    for j in range(nv):
        for i in range(nu):
            a=j*(nu+1)+i;b=a+1;c=b+nu+1;d=a+nu+1
            f.extend([(a,b,c,d),(a+layer,d+layer,c+layer,b+layer)])
    for j in range(nv):
        for i in [0,nu]:
            a=j*(nu+1)+i;b=a+nu+1;f.append((a,b,b+layer,a+layer))
    for j in [0,nv]:
        for i in range(nu):
            a=j*(nu+1)+i;f.append((a,a+layer,a+1+layer,a+1))
    add(v,f)

    def bezier(points,t):
        a,b,c,d=[Vector(p) for p in points];u=1-t
        return a*u**3+3*b*u*u*t+3*c*u*t*t+d*t**3

    def ribbon(points,width,depth=.0024,forehead=False):
        v=[];f=[];n=48;sides=12
        for j in range(n+1):
            t=j/n;c=bezier(points,t)
            if forehead and abs(c.x)<.103 and c.z>1.49:
                c=project(c,-.002+.008*smooth(t/.22),True)
            tangent=(bezier(points,min(1,t+.002))-bezier(points,max(0,t-.002))).normalized()
            across=tangent.cross(Vector((0,-1,0))).normalized()
            normal=across.cross(tangent).normalized()
            if normal.y>0:normal=-normal
            # Flat overlapping roots; distinct long tapered ends.
            taper=(.05+.95*smooth(t/.13))*(.72+.28*math.sin(math.pi*t)**.6)*max(.002,1-t**3.8)**.64
            for k in range(sides):
                a=math.tau*k/sides;u=math.cos(a)
                ridge=.00038*math.cos(u*math.pi*5+t*.8)*max(0,math.sin(a))
                p=c+across*(u*width*taper)+normal*((math.sin(a)*depth+ridge)*taper)
                
                v.append(p)
        for j in range(n):
            for k in range(sides):
                a=j*sides+k;b=j*sides+(k+1)%sides;f.append((a,b,b+sides,a+sides))
        f.extend([tuple(reversed(range(sides))),tuple(n*sides+i for i in range(sides))])
        add(v,f)

    # Face-framing layers start inside the original crown and taper below
    # the collarbone. Only a pair is needed alongside the continuous back.
    for sign in [-1,1]:
        for i in range(2):
            ribbon([(sign*(.098+i*.005),.035,1.552-i*.010),
                    (sign*(.117+i*.007),-.064,1.429),
                    (sign*(.113+i*.009),-.086,1.284-i*.029),
                    (sign*(.095+i*.012),-.058,1.168-i*.043)],.012-i*.002,.0022)

    data=bpy.data.meshes.new('ChineseLayeredHair');data.from_pydata(verts,[],faces);data.update()
    bm=bmesh.new();bm.from_mesh(data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(data);bm.free()
    obj=bpy.data.objects.new('CNGirl_Hair',data);bpy.context.scene.collection.objects.link(obj)
    mat=bpy.data.materials.new('CNGirl_NaturalInkHair');mat.use_nodes=True
    p=mat.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(.013,.009,.011,1)
    p.inputs['Roughness'].default_value=.47;p.inputs['Specular IOR Level'].default_value=.30
    data.materials.append(mat)
    # A restrained vertex tint makes longitudinal grooves readable in GLB.
    attr=data.color_attributes.new(name='HairStrandTint',type='FLOAT_COLOR',domain='POINT')
    data.color_attributes.active_color=attr
    for vert in data.vertices:
        tint=.78+.22*(.5+.5*math.cos(vert.co.x*1800+vert.co.z*7))
        attr.data[vert.index].color=(.013*tint,.009*tint,.011*tint,1)
    vc=mat.node_tree.nodes.new('ShaderNodeVertexColor');vc.layer_name=attr.name
    mat.node_tree.links.new(vc.outputs['Color'],p.inputs['Base Color'])
    obj.parent=rig;obj.matrix_world=Matrix.Identity(4)
    groups={name:obj.vertex_groups.new(name=name) for name in ['Head','Neck','Chest']}
    for vert in data.vertices:
        z=vert.co.z;h=smooth((z-1.425)/.095);c=1-smooth((z-1.27)/.13);n=max(0,1-h-c)
        for name,w in [('Head',h),('Neck',n),('Chest',c)]:
            if w>0:groups[name].add([vert.index],w,'REPLACE')
    mod=obj.modifiers.new('Hair follows head and shoulders','ARMATURE');mod.object=rig
    for poly in data.polygons:poly.use_smooth=True
    print('FEMALE_HAIR',len(data.vertices),sum(len(p.vertices)-2 for p in data.polygons),flush=True)
    return obj
