"""Inspect the unmodified, officially downloaded Rain character in Blender."""
from pathlib import Path
import json
import bpy

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'model-preview/rain/assets'
OUT.mkdir(parents=True,exist_ok=True)

record={'blender':bpy.app.version_string,'file':bpy.data.filepath,'objects':[],'images':[],'materials':[]}
for o in bpy.data.objects:
    item={'name':o.name,'type':o.type,'hide_viewport':o.hide_viewport,'hide_render':o.hide_render,
          'visible':o.visible_get(),'parent':o.parent.name if o.parent else None,'location':list(o.location)}
    if o.type=='MESH':
        item.update(vertices=len(o.data.vertices),polygons=len(o.data.polygons),
            materials=[m.name if m else None for m in o.data.materials],
            modifiers=[{'name':m.name,'type':m.type,'viewport':m.show_viewport,'render':m.show_render} for m in o.modifiers],
            shape_keys=[k.name for k in o.data.shape_keys.key_blocks] if o.data.shape_keys else [],
            uv_layers=[u.name for u in o.data.uv_layers])
    if o.type=='ARMATURE':
        item['bones']=[{'name':b.name,'parent':b.parent.name if b.parent else None,'deform':b.use_deform,
                        'head':list(b.head_local),'tail':list(b.tail_local)} for b in o.data.bones]
        item['properties']={k:str(v) for k,v in o.items()}
    record['objects'].append(item)
for image in bpy.data.images:
    record['images'].append({'name':image.name,'path':image.filepath,'source':image.source,
        'size':list(image.size),'packed':bool(image.packed_file),'tiles':[t.number for t in image.tiles]})
for material in bpy.data.materials:
    item={'name':material.name,'nodes':[]}
    if material.node_tree:
        for n in material.node_tree.nodes:
            row={'name':n.name,'type':n.type}
            if n.type=='TEX_IMAGE':row['image']=n.image.name if n.image else None
            if n.type=='GROUP':row['group']=n.node_tree.name if n.node_tree else None
            if n.type=='BSDF_PRINCIPLED':row['defaults']={i.name:list(i.default_value) if hasattr(i.default_value,'__len__') else i.default_value for i in n.inputs if hasattr(i,'default_value') and not i.is_linked}
            item['nodes'].append(row)
    record['materials'].append(item)
(OUT/'source-inspection.json').write_text(json.dumps(record,indent=2,ensure_ascii=False),encoding='utf-8')
print('RAIN_INSPECT',json.dumps({'objects':len(record['objects']),'meshes':sum(o.type=='MESH' for o in bpy.data.objects),
      'images':len(record['images']),'armatures':[o.name for o in bpy.data.objects if o.type=='ARMATURE']}))
