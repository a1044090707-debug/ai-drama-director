"""Approved off-centre fringe and collarbone layers, made as closed mesh locks.

All locks are surfaces with thickness over one shared hair envelope. Their
roots taper into a closed scalp; no cylindrical tubes or particle hair.
"""
import math
import bpy
import bmesh
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree


def build_hair(rig, head):
    vertices=[];faces=[];colors=[]
    basis=head.data.shape_keys.key_blocks['Basis'].data
    tree=BVHTree.FromPolygons([head.matrix_world@v.co for v in basis],
                             [tuple(p.vertices) for p in head.data.polygons])
    def smooth(t):
        t=max(0,min(1,t));return t*t*(3-2*t)
    def add(v,f,tints=None):
        offset=len(vertices);vertices.extend(v)
        faces.extend(tuple(offset+i for i in face) for face in f)
        colors.extend(tints or [1.0]*len(v))
    def bezier(p,t):
        a,b,c,d=[Vector(v) for v in p];u=1-t
        return a*u**3+3*b*u*u*t+3*c*u*t*t+d*t**3
    def front_y(x,z):
        q=1-(x/.143)**2-((z-1.500)/.158)**2
        y=.010-.153*math.sqrt(max(.018,q))
        if z>1.488 and abs(x)<.110:
            hit,_,_,_=tree.ray_cast(Vector((x,-.7,z)),Vector((0,1,0)),1)
            if hit is not None:
                skin=hit.y-.006
                y=.5*(y+skin-math.sqrt((y-skin)**2+.006**2))
        return y

    # Smooth cap: the same envelope supports the fringe roots and closes the
    # narrow part. It has a real inward surface and no exposed cut edge.
    nu=96;nv=36;v=[];f=[];tints=[]
    for inner in [False,True]:
        for j in range(nv+1):
            for i in range(nu):
                a=math.tau*i/nu
                phi=max(.002,j/nv*(1.90-.70*math.cos(a)))
                inset=.004 if inner else 0
                rx=.139-inset;ry=.153-inset;rz=.158-inset
                ridge=.0007*math.cos(a*42+phi*1.2)*math.sin(phi)
                x=(rx+ridge)*math.sin(phi)*math.sin(a)
                y=.010-(ry+ridge)*math.sin(phi)*math.cos(a)
                z=1.500+rz*math.cos(phi)
                v.append((x,y,z));tints.append(.94+.055*math.cos(a*59+phi))
    layer=nu*(nv+1)
    for j in range(nv):
        for i in range(nu):
            a=j*nu+i;b=j*nu+(i+1)%nu
            f.extend([(a,b,b+nu,a+nu),(a+layer,a+nu+layer,b+nu+layer,b+layer)])
    for i in range(nu):
        a=nv*nu+i;b=nv*nu+(i+1)%nu
        f.append((a,a+layer,b+layer,b))
    add(v,f,tints)

    # Closed collarbone-length back mass. The bottom curves inward and has
    # staggered ends. A small sweep breaks the rectangular curtain silhouette.
    nu=96;nv=56;v=[];f=[];tints=[]
    def profile(t):
        keys=[(0,.100,.095),(.18,.131,.119),(.48,.138,.116),(.75,.140,.106),(1,.113,.083)]
        for i in range(len(keys)-1):
            a,x1,y1=keys[i];b,x2,y2=keys[i+1]
            if t<=b:
                k=smooth((t-a)/(b-a));return x1+(x2-x1)*k,y1+(y2-y1)*k
        return keys[-1][1:]
    for inner in [False,True]:
        for j in range(nv+1):
            t=j/nv;rx,ry=profile(t)
            for i in range(nu+1):
                a=.94+(math.tau-1.88)*i/nu
                wave=.0010*math.cos(a*42+t*1.1)+.00025*math.cos(a*107)
                inset=.007 if inner else 0
                z=1.612-.426*t+(.009*math.cos(a*7)+.005*math.sin(a*13))*t**8
                x=(rx-inset+wave)*math.sin(a)
                y=.012+.020*t-(ry-inset+wave)*math.cos(a)
                v.append((x,y,z));tints.append(.94+.06*math.cos(a*64+t*.5))
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
    add(v,f,tints)

    def lock(points,width,depth=.003,fringe=False,layer_offset=0):
        # Swept, flattened surface patch, with an opaque back and real edges.
        # Its zero-width roots are buried under the scalp instead of capped tubes.
        n=48;m=12;v=[];f=[];tints=[]
        for back in [False,True]:
            for j in range(n+1):
                t=j/n;c=bezier(points,t)
                tangent=bezier(points,min(1,t+.001))-bezier(points,max(0,t-.001))
                direction=Vector((tangent.x,0,tangent.z)).normalized()
                across=Vector((-direction.z,0,direction.x))
                taper=(.025+.975*smooth(t/.15))*(.72+.28*math.sin(math.pi*t)**.7)*(1-.995*t**4.5)**.62
                for i in range(m+1):
                    u=2*i/m-1;p=c+across*(width*taper*u)
                    ridge=.00038*math.cos(u*math.pi*4+t*.7)
                    bulge=depth*(max(0,1-u*u)**.7)
                    if fringe:
                        p.y=front_y(p.x,p.z)-layer_offset
                        # Roots begin within the common cap and emerge gradually.
                        p.y+=.002*(1-smooth(t/.18))
                    p.y+=(.0011 if back else -bulge-ridge)*taper
                    v.append(p);tints.append(.91+.085*math.cos(u*math.pi*7+t*.3))
        layer=(n+1)*(m+1)
        for j in range(n):
            for i in range(m):
                a=j*(m+1)+i;b=a+1;c=b+m+1;d=a+m+1
                f.extend([(a,b,c,d),(a+layer,d+layer,c+layer,b+layer)])
        for j in range(n):
            for i in [0,m]:
                a=j*(m+1)+i;b=a+m+1;f.append((a,b,b+layer,a+layer))
        for j in [0,n]:
            for i in range(m):
                a=j*(m+1)+i;f.append((a,a+layer,a+1+layer,a+1))
        add(v,f,tints)

    # Broad left sweep, increasingly narrow inner bangs, and a smaller right
    # sweep reproduce the approved offset part without a quiff or blunt fringe.
    fringe=[
        ([(.031,0,1.643),(-.035,0,1.651),(-.130,0,1.582),(-.128,0,1.473)],.024),
        ([(.037,0,1.639),(-.015,0,1.631),(-.100,0,1.556),(-.103,0,1.501)],.022),
        ([(.038,0,1.632),(.014,0,1.604),(-.034,0,1.531),(-.069,0,1.502)],.019),
        ([(.038,0,1.624),(.032,0,1.590),(.009,0,1.531),(-.035,0,1.491)],.014),
        ([(.039,0,1.616),(.038,0,1.579),(.023,0,1.524),(.003,0,1.497)],.007),
        ([(.045,0,1.640),(.103,0,1.636),(.139,0,1.562),(.122,0,1.468)],.023),
        ([(.044,0,1.632),(.080,0,1.611),(.113,0,1.545),(.113,0,1.498)],.019),
        ([(.043,0,1.622),(.049,0,1.582),(.081,0,1.526),(.095,0,1.487)],.012),
    ]
    for i,(points,width) in enumerate(fringe):
        lock(points,width,.0021,True,.0005+(i%5)*.00075)

    # Three gently inward-turning layers on either side, with short cheek
    # framing pieces and longer ends around the collarbone.
    for sign in [-1,1]:
        def p(x,y,z):return (sign*x,y,z)
        lock([p(.112,-.065,1.553),p(.141,-.090,1.446),p(.121,-.111,1.339),p(.089,-.103,1.294)],.017,.0032)
        lock([p(.124,-.025,1.573),p(.151,-.045,1.418),p(.153,-.106,1.239),p(.085,-.103,1.189)],.023,.0040)
        lock([p(.122,.018,1.567),p(.153,.000,1.406),p(.160,-.045,1.222),p(.106,-.067,1.180)],.021,.0040)

    data=bpy.data.meshes.new('ApprovedCollarboneHair');data.from_pydata(vertices,[],faces);data.update()
    bm=bmesh.new();bm.from_mesh(data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(data);bm.free()
    obj=bpy.data.objects.new('CNGirl_Hair',data);bpy.context.scene.collection.objects.link(obj)
    # Keep clean designed edges. Subdivision relaxes the swept patches without
    # the ragged tip edges introduced by voxelizing thin hair surfaces.
    bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
    polish=obj.modifiers.new('Smooth lock edges','SUBSURF');polish.levels=1;polish.render_levels=1
    bpy.ops.object.modifier_apply(modifier=polish.name)
    count=sum(len(p.vertices)-2 for p in obj.data.polygons)
    reduce=obj.modifiers.new('Realtime hair budget','DECIMATE');reduce.ratio=min(1,65000/count)
    bpy.ops.object.modifier_apply(modifier=reduce.name)
    data=obj.data
    mat=bpy.data.materials.new('CNGirl_LayeredBlackHair');mat.use_nodes=True
    shader=mat.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Roughness'].default_value=.60;shader.inputs['Specular IOR Level'].default_value=.20
    data.materials.append(mat)
    attr=data.color_attributes.new(name='HairStrandTint',type='FLOAT_COLOR',domain='POINT');data.color_attributes.active_color=attr
    for vert in data.vertices:
        t=.94+.06*math.cos(math.atan2(vert.co.x,-vert.co.y)*59+vert.co.z*4)
        attr.data[vert.index].color=(.021*t,.016*t,.020*t,1)
    vc=mat.node_tree.nodes.new('ShaderNodeVertexColor');vc.layer_name=attr.name
    mat.node_tree.links.new(vc.outputs['Color'],shader.inputs['Base Color'])
    obj.parent=rig;obj.matrix_world=Matrix.Identity(4)
    groups={name:obj.vertex_groups.new(name=name) for name in ['Head','Neck','Chest']}
    for vert in data.vertices:
        z=vert.co.z;h=smooth((z-1.425)/.095);c=1-smooth((z-1.27)/.13);n=max(0,1-h-c)
        for name,w in [('Head',h),('Neck',n),('Chest',c)]:
            if w>0:groups[name].add([vert.index],w,'REPLACE')
    mod=obj.modifiers.new('Hair follows head and shoulders','ARMATURE');mod.object=rig
    for poly in data.polygons:poly.use_smooth=True
    print('APPROVED_HAIR',len(data.vertices),sum(len(p.vertices)-2 for p in data.polygons),flush=True)
    return obj
