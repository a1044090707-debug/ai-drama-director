import bpy,json,numpy as np
for name in ['GEO-snow-body','GEO-snow-head','GEO-snow-hair_base']:
    o=bpy.data.objects[name];print(name,'slots',[(s.name,s.material.name if s.material else None) for s in o.material_slots])
    for u in o.data.uv_layers:
        a=np.array([v.uv[:] for v in u.data]);print(u.name,'active',u.active,'render',u.active_render,'bounds',a.min(0),a.max(0))
    for slot in o.material_slots:
        m=slot.material
        if not m or not m.node_tree:continue
        for n in m.node_tree.nodes:
            if n.type=='BSDF_PRINCIPLED':print(m.name,n.name,'color source',[(l.from_node.name,l.from_socket.name) for l in n.inputs['Base Color'].links])
            if n.type=='TEX_IMAGE' and n.image:print('image',n.image.name,n.image.size[:],n.image.filepath,'inputs',[(l.from_node.name,l.from_socket.name) for l in n.inputs['Vector'].links])
