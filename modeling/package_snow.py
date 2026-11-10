"""Package only character 01, its runnable viewer, and conversion code."""
from pathlib import Path
import zipfile,json
ROOT=Path(__file__).resolve().parents[1]
files=[
 'model-preview/snow/index.html','model-preview/snow/stage.css','model-preview/snow/stage.mjs',
 'model-preview/snow/avatar.mjs','model-preview/snow/README.md',
 'model-preview/snow/assets/snow-web.glb','model-preview/snow/assets/conversion.json',
 'model-preview/rain/avatar.mjs','model-preview/fullbody/driver.mjs','model-preview/fullbody/tracking-worker.mjs',
 'vendor/three.module.js','vendor/GLTFLoader.js','vendor/BufferGeometryUtils.js',
 'motion.js','modeling/convert_snow_web.py','tests/snow-avatar.test.mjs']
for path in ['model-preview/snow/assets/preview-fullbody.png','model-preview/snow/assets/preview-face.png']:
 if (ROOT/path).exists():files.append(path)
with zipfile.ZipFile(ROOT/'character-01-snow-model-and-code.zip','w',zipfile.ZIP_DEFLATED) as z:
 for name in files:z.write(ROOT/name,name)
 z.writestr('README.txt','Character 01 / Snow\nSnow Rig (CC) Blender Foundation | studio.blender.org\nCC BY 4.0\n\nStart a static HTTP server in this directory:\npython -m http.server 8765 --bind 127.0.0.1\n\nOpen http://127.0.0.1:8765/model-preview/snow/\n\nDetails and original source links: model-preview/snow/README.md\n')
with zipfile.ZipFile(ROOT/'character-01-snow-model-and-code.zip') as z:
 assert z.testzip() is None
 assert all(not p.startswith('.modeling/') for p in z.namelist())
 print('SNOW_PACKAGE_PASS',len(z.namelist()),(ROOT/'character-01-snow-model-and-code.zip').stat().st_size)
