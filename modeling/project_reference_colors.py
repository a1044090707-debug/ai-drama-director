"""A diagnostic appearance pass: project the reference views onto the real mesh.

This is not neural texture generation and does not create expression topology.
The uncolored reconstruction is kept as a separate file for geometry review.
"""
from pathlib import Path
import json
import numpy as np
from PIL import Image
from scipy.ndimage import maximum_filter
from scipy.spatial import cKDTree
import trimesh
from pygltflib import GLTF2, BufferView, Accessor, Material, PbrMetallicRoughness

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'model-preview/reconstructed'


def run():
    mesh = trimesh.load(DEST / 'orange-girl-shape.glb', force='mesh', process=False)
    vertices = np.asarray(mesh.vertices)
    normals = np.asarray(mesh.vertex_normals)
    minimum, maximum = mesh.bounds
    dimensions = maximum - minimum
    center = (minimum + maximum) * .5
    rgb_sum = np.zeros((len(vertices), 3), dtype=np.float64)
    weights = np.zeros(len(vertices))
    # Horizontal image axis and outward view direction in Hunyuan's Y-up frame.
    views = [('front', 0, 1, 2, 1), ('right', 2, 1, 0, -1),
             ('back', 0, -1, 2, -1), ('left_mirrored', 2, -1, 0, 1)]
    for name, horizontal_axis, horizontal_sign, depth_axis, depth_sign in views:
        if name == 'left_mirrored':
            image = Image.open(ROOT / '.modeling/inputs/right.png').convert('RGBA')
            image = image.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
        else:
            image = Image.open(ROOT / '.modeling/inputs' / f'{name}.png').convert('RGBA')
        pixels = np.asarray(image)
        bbox = image.getchannel('A').getbbox()
        x0, y0, x1, y1 = bbox
        u = (vertices[:, horizontal_axis] - center[horizontal_axis]) / dimensions[horizontal_axis]
        u = .5 + horizontal_sign * u
        v = (maximum[1] - vertices[:, 1]) / dimensions[1]
        px = np.clip(np.rint(x0 + u * (x1 - x0 - 1)), 0, image.width - 1).astype(int)
        py = np.clip(np.rint(y0 + v * (y1 - y0 - 1)), 0, image.height - 1).astype(int)
        samples = pixels[py, px]
        facing = np.maximum(0, normals[:, depth_axis] * depth_sign)
        # A vertex depth buffer rejects most occluded surfaces. It is a diagnostic
        # color projection, not a replacement for a proper UV bake with ray tests.
        bx = np.clip(np.rint(u * 511), 0, 511).astype(int)
        by = np.clip(np.rint(v * 511), 0, 511).astype(int)
        depth = vertices[:, depth_axis] * depth_sign
        zbuffer = np.full((512, 512), -np.inf)
        np.maximum.at(zbuffer, (by, bx), depth)
        zbuffer = maximum_filter(zbuffer, size=3)
        visible = depth >= zbuffer[by, bx] - dimensions.max() * .035
        weight = facing ** 6 * visible * (samples[:, 3] / 255)
        rgb_sum += samples[:, :3] * weight[:, None]
        weights += weight
    valid = weights > 1e-7
    if valid.sum() < 100:
        raise RuntimeError('Too few visible reference samples; check mesh orientation')
    colors = np.empty((len(vertices), 4), dtype=np.uint8)
    colors[valid, :3] = np.clip(rgb_sum[valid] / weights[valid, None], 0, 255).astype(np.uint8)
    if not valid.all():
        _, nearest = cKDTree(vertices[valid]).query(vertices[~valid])
        colors[~valid, :3] = colors[valid, :3][nearest]
    colors[:, 3] = 255
    mesh.visual = trimesh.visual.ColorVisuals(mesh=mesh, vertex_colors=colors)
    color_path = DEST / 'orange-girl-reference-colors.glb'
    mesh.export(color_path)
    # PNG samples are sRGB; glTF vertex colors are linear. Store Float32 linear
    # colors to avoid washed-out output and dark-tone quantization.
    srgb = colors.astype(np.float32) / 255
    linear = srgb.copy()
    linear[:, :3] = np.where(srgb[:, :3] <= .04045, srgb[:, :3] / 12.92,
                             ((srgb[:, :3] + .055) / 1.055) ** 2.4)
    gltf = GLTF2().load(str(color_path))
    binary = gltf.binary_blob()
    padding = b'\0' * ((-len(binary)) % 4)
    raw = linear.astype('<f4').tobytes()
    gltf.bufferViews.append(BufferView(buffer=0, byteOffset=len(binary) + len(padding),
                                      byteLength=len(raw), target=34962))
    gltf.accessors.append(Accessor(bufferView=len(gltf.bufferViews) - 1,
                                   componentType=5126, count=len(vertices), type='VEC4'))
    gltf.materials = [Material(name='ReferenceProjection_Unlit',
                              pbrMetallicRoughness=PbrMetallicRoughness(
                                  baseColorFactor=[1, 1, 1, 1], metallicFactor=0, roughnessFactor=1),
                              doubleSided=True, extensions={'KHR_materials_unlit': {}})]
    gltf.extensionsUsed = list(set(gltf.extensionsUsed or []) | {'KHR_materials_unlit'})
    for part in gltf.meshes:
        for primitive in part.primitives:
            primitive.attributes.COLOR_0 = len(gltf.accessors) - 1
            primitive.material = 0
    gltf.set_binary_blob(binary + padding + raw)
    gltf.buffers[0].byteLength = len(binary) + len(padding) + len(raw)
    gltf.save_binary(str(color_path))
    info = {'method': 'multiview reference color projection onto reconstructed geometry',
            'geometry': 'orange-girl-shape.glb', 'sampled_vertex_fraction': float(valid.mean()),
            'left_side': 'mirrored right-view reference',
            'limitations': ['not a learned texture', 'visibility uses vertex depth buffer',
                            'no rig or expression deformation']}
    (DEST / 'appearance.json').write_text(json.dumps(info, indent=2), encoding='utf-8')
    print('PROJECTED', len(vertices), 'vertices', valid.mean(), flush=True)


if __name__ == '__main__':
    run()
