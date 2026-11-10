"""Conservative geometric cleanup, retaining the untouched reconstruction."""
import json
from pathlib import Path
import shutil
import trimesh

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'model-preview/reconstructed'
RAW = ROOT / '.modeling/orange-girl-shape-raw.glb'
target = OUT / 'orange-girl-shape.glb'
if not RAW.exists():
    shutil.copy2(target, RAW)
source = trimesh.load(RAW, force='mesh', process=False)
parts = source.split(only_watertight=False)
kept = [part for part in parts if len(part.faces) >= 100]
mesh = trimesh.util.concatenate(kept)
trimesh.smoothing.filter_taubin(mesh, lamb=.5, nu=.53, iterations=8)
mesh.export(target, include_normals=True)
meta_path = OUT / 'generation.json'
meta = json.loads(meta_path.read_text(encoding='utf-8'))
meta.update(raw_vertices=len(source.vertices), raw_faces=len(source.faces),
            vertices=len(mesh.vertices), faces=len(mesh.faces), bounds=mesh.bounds.tolist(),
            discarded_small_components=len(parts)-len(kept),
            postprocessing={'minimum_component_faces':100, 'smoothing':'Taubin',
                            'iterations':8, 'lambda':.5, 'nu':.53})
meta_path.write_text(json.dumps(meta, indent=2), encoding='utf-8')
print('REFINED', len(mesh.vertices), len(mesh.faces), 'removed', len(parts)-len(kept), flush=True)
