"""Package only the current reconstructed model, inputs, viewer and pipeline."""
from pathlib import Path
import hashlib
import json
import zipfile

root = Path(__file__).resolve().parents[1]
paths = [
    'model-preview/index.html', 'model-preview/reconstruction.html',
    'model-preview/reconstruction-viewer.js',
    'model-preview/reconstructed/orange-girl-shape.glb',
    'model-preview/reconstructed/orange-girl-reference-colors.glb',
    'model-preview/reconstructed/orange-girl-colors-v2.glb',
    'model-preview/reconstructed/generation.json',
    'model-preview/reconstructed/appearance-v2.json',
    'model-preview/reconstructed/preview-colors-v2-front.png',
    'model-preview/reconstructed/preview-colors-v2-side.png',
    'model-preview/reconstructed/preview-colors-v2-back.png',
    'design-demos/orange-girl-modeling-v1/01-head-turnaround.png',
    'vendor/three.module.js', 'vendor/GLTFLoader.js',
    'vendor/BufferGeometryUtils.js', 'vendor/THREE-LICENSE.txt',
    '.modeling/inputs/front.png', '.modeling/inputs/right.png',
    '.modeling/inputs/back.png', '.modeling/inputs/manifest.json',
    'modeling/reconstruct.py', 'modeling/export_saved_shape.py',
    'modeling/refine_mesh.py', 'modeling/project_reference_colors.py',
    'modeling/refine_reference_colors.py', 'modeling/package_model.py',
    'modeling/requirements-shape.txt', 'modeling/requirements-preprocess.txt',
    'modeling/requirements-appearance.txt', 'modeling/README.md',
    'modeling/SOURCES.md', 'modeling/MODEL-ONLY.md',
]
output = root/'orange-girl-model-only-v2.zip'
manifest = {}
with zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as archive:
    for name in paths:
        data = (root/name).read_bytes()
        archive.writestr(name,data)
        manifest[name] = hashlib.sha256(data).hexdigest()
    archive.write(root/'modeling/MODEL-ONLY.md','README.md')
    archive.write(root/'.modeling/Hunyuan3D-2/LICENSE','licenses/Hunyuan3D-LICENSE.txt')
    archive.writestr('SHA256.json',json.dumps(manifest,indent=2))
    archive.writestr('index.html','<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=model-preview/">')
with zipfile.ZipFile(output) as archive:
    assert archive.testzip() is None
    for name,digest in manifest.items():
        assert hashlib.sha256(archive.read(name)).hexdigest()==digest
print(output.name,output.stat().st_size,'bytes;',len(paths),'source/assets verified')
