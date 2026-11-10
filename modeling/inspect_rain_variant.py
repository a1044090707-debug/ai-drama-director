import bpy,json
from pathlib import Path
from mathutils import Vector
data={}
for o in bpy.data.collections['Rain_Web_Export'].objects:
    if o.type!='MESH':continue
    pts=[o.matrix_world@v.co for v in o.data.vertices]
    data[o.name]={'vertices':len(pts),'min':[min(p[i] for p in pts) for i in range(3)],'max':[max(p[i] for p in pts) for i in range(3)],'morphs':list(o.data.shape_keys.key_blocks.keys()) if o.data.shape_keys else []}
Path('model-preview/rain/assets/variant-inspection.json').write_text(json.dumps(data,indent=2))
print(json.dumps(data,indent=2))
