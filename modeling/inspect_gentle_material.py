import bpy,numpy as np
o=bpy.data.objects['Snow_head']
print('UVS',[(u.name,u.active_render,u==o.data.uv_layers.active) for u in o.data.uv_layers])
for n in o.data.materials[0].node_tree.nodes:
    if n.type=='UVMAP':print('MATERIAL_UV',n.uv_map)
    if n.type=='TEX_IMAGE' and n.image:
        a=np.array(n.image.pixels[:]).reshape(-1,4)
        print('IMAGE',n.image.name,n.image.size[:],np.percentile(a[:,:3],[0,25,50,75,100]),flush=True)
