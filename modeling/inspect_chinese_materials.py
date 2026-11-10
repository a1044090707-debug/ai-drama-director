import bpy,numpy as np
for name in ['Rain_head','Rain_body','Rain_eyes','Rain_top','Rain_jeans','Rain_shoes']:
    o=bpy.data.objects[name];m=o.data.materials[0]
    print(name,'UVS',[(u.name,u.active_render) for u in o.data.uv_layers],flush=True)
    for n in m.node_tree.nodes:
        if n.type=='UVMAP':print('UV_NODE',n.uv_map)
        if n.type=='TEX_IMAGE' and n.image:
            a=np.array(n.image.pixels[:]).reshape(-1,4)
            print('IMAGE',n.image.name,np.percentile(a[:,:3],[0,25,50,75,99,100]),'ALPHA',np.percentile(a[:,3],[0,50,100]),flush=True)
