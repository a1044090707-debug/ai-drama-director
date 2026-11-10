"""Make a static, view-projected texture study on the reconstructed 3D mesh.

The source photographs are never displayed as planes. Each view supplies a UV
texture to selected triangles of the actual mesh. The raw geometry stays separate.
"""
from pathlib import Path
import json
import numpy as np
from PIL import Image
from scipy.ndimage import distance_transform_edt
import trimesh
from pygltflib import GLTF2

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'model-preview/reconstructed'


def main():
    base = trimesh.load(OUT / 'orange-girl-shape.glb', force='mesh', process=False)
    low, high = base.bounds
    center, span = (low + high) * .5, high - low
    cameras = [('front', 0, 1, 2, 1), ('right', 2, 1, 0, -1),
               ('back', 0, -1, 2, -1), ('left_mirrored', 2, -1, 0, 1)]
    # Partition broad continuous regions by position, rather than changing cameras
    # on every curl's local normal. Per-triangle normal selection creates a noisy
    # mosaic of unrelated view samples, especially around eyelids and hair grooves.
    centers = np.asarray(base.triangles_center)
    azimuth = np.degrees(np.arctan2(centers[:, 0] - center[0], centers[:, 2] - center[2]))
    chosen = np.zeros(len(base.faces), dtype=np.int32)
    chosen[(azimuth < -72) & (azimuth >= -137)] = 1
    chosen[np.abs(azimuth) > 137] = 2
    chosen[(azimuth > 72) & (azimuth <= 137)] = 3
    scene = trimesh.Scene()
    counts = {}
    for view_id, (name, horizontal, direction, _, _) in enumerate(cameras):
        image = Image.open(ROOT / '.modeling/inputs' /
                           ('right.png' if name == 'left_mirrored' else f'{name}.png')).convert('RGBA')
        if name == 'left_mirrored':
            image = image.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
        rgba = np.asarray(image)
        mask = rgba[..., 3] > 127
        # Extend foreground colors into the empty margin for safe texture filtering
        # around wisps of hair. Original opaque pixels stay unchanged.
        _, nearest = distance_transform_edt(~mask, return_indices=True)
        rgb = rgba[..., :3].copy()
        rgb[~mask] = rgb[nearest[0][~mask], nearest[1][~mask]]
        texture = Image.fromarray(rgb, 'RGB')
        x0, y0, x1, y1 = image.getchannel('A').getbbox()
        face_ids = np.flatnonzero(chosen == view_id)
        old_ids, inverse = np.unique(base.faces[face_ids].reshape(-1), return_inverse=True)
        vertices = base.vertices[old_ids]
        u = .5 + direction * (vertices[:, horizontal] - center[horizontal]) / span[horizontal]
        v = (high[1] - vertices[:, 1]) / span[1]
        uv = np.column_stack(((x0 + u * (x1 - x0 - 1) + .5) / image.width,
                              1 - (y0 + v * (y1 - y0 - 1) + .5) / image.height))
        material = trimesh.visual.material.PBRMaterial(
            name='ReferenceProjection_' + name, baseColorTexture=texture,
            baseColorFactor=[255, 255, 255, 255], metallicFactor=0,
            roughnessFactor=1, doubleSided=True)
        part = trimesh.Trimesh(vertices=vertices, faces=inverse.reshape(-1, 3),
                               vertex_normals=base.vertex_normals[old_ids],
                               visual=trimesh.visual.TextureVisuals(uv=uv, material=material),
                               process=False)
        scene.add_geometry(part, node_name=name, geom_name=name)
        counts[name] = len(face_ids)
    dest = OUT / 'orange-girl-reference-texture.glb'
    scene.export(dest)
    gltf = GLTF2().load(str(dest))
    gltf.extensionsUsed = list(set(gltf.extensionsUsed or []) | {'KHR_materials_unlit'})
    for material in gltf.materials:
        material.extensions = dict(material.extensions or {}, KHR_materials_unlit={})
    gltf.save_binary(str(dest))
    record = {'method': 'orthographic reference UV projection onto reconstructed 3D triangles',
              'geometry': 'orange-girl-shape.glb', 'faces_per_reference': counts,
              'left_side': 'mirrored right reference',
              'material': 'unlit; reference lighting is baked into the illustration',
              'limitations': ['view seams need refinement', 'not neural texture synthesis',
                              'no expression topology or rig']}
    (OUT / 'texture-projection.json').write_text(json.dumps(record, indent=2), encoding='utf-8')
    print('TEXTURED', dest.stat().st_size, counts, flush=True)


if __name__ == '__main__':
    main()
