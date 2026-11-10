import bpy,json
for name in ['Snow_head','Snow_body','Snow_shirt']:
    o=bpy.data.objects[name];points=[o.matrix_world@v.co for v in o.data.vertices]
    print('PROFILE',name,'CUSTOM_NORMALS',o.data.has_custom_normals,flush=True)
    for z in [1.35,1.38,1.40,1.42,1.44,1.46,1.48,1.50,1.52]:
        pts=[p for p in points if abs(p.z-z)<.007 and abs(p.x)<.12]
        if pts:print(z,len(pts),[round(min(p[i] for p in pts),4) for i in range(3)],[round(max(p[i] for p in pts),4) for i in range(3)],flush=True)
