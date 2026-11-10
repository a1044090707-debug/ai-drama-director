"""Repair reference-color projection on the unchanged reconstructed mesh.

Reference views are illustrations with different silhouettes. Semantic masks keep
cloth samples out of curls, and facial color is taken continuously from the front
reference rather than switching views on each triangle normal.
"""
from pathlib import Path
import hashlib
import json

import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import distance_transform_edt, maximum_filter
from scipy.sparse import coo_matrix
from scipy.spatial import cKDTree
import trimesh
from pygltflib import GLTF2, Accessor, BufferView, Material, PbrMetallicRoughness

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'model-preview/reconstructed'
HAIR, SKIN, CLOTH, CAP = range(4)


def reference(name):
    source = 'right' if name == 'left_mirrored' else name
    image = Image.open(ROOT / '.modeling/inputs' / f'{source}.png').convert('RGBA')
    rgb = np.asarray(image)[..., :3].astype(float)
    r, g, b = rgb.transpose(2, 0, 1)
    labels = np.full(r.shape, HAIR, dtype=np.int8)
    labels[(g > r * .82) & (g > b * 1.12)] = CLOTH
    yy = np.indices(r.shape)[0]
    labels[yy < {'front': 198, 'right': 258, 'back': 263}[source]] = CAP
    # Coordinates belong to the cropped, recorded input images, not the viewport.
    polygons = {
        'front': [(250,191),(296,157),(370,157),(410,190),(429,239),
                  (435,274),(466,272),(481,292),(475,328),(452,350),
                  (430,356),(416,383),(379,414),(377,471),(407,510),
                  (362,535),(310,535),(255,510),(282,476),(283,417),
                  (247,396),(225,369),(216,350),(195,344),(180,325),
                  (180,294),(196,278),(219,283),(230,240)],
        'right': [(399,181),(420,186),(416,255),(429,290),(442,306),
                  (429,323),(427,350),(418,366),(422,386),(413,411),
                  (391,424),(344,417),(329,438),(315,478),(336,489),
                  (302,511),(221,489),(254,452),(256,402),(239,359),
                  (222,333),(227,300),(248,280),(274,282),(291,304),
                  (302,302),(311,265),(333,246),(359,224),(383,188)],
    }
    if source in polygons:
        face = Image.new('1', image.size)
        ImageDraw.Draw(face).polygon(polygons[source], fill=1)
        labels[np.asarray(face).astype(bool)] = SKIN
    # Off-foreground samples borrow the closest opaque pixel in the SAME view.
    opaque = np.asarray(image)[..., 3] > 180
    _, nearest = distance_transform_edt(~opaque, return_indices=True)
    rgb[~opaque] = rgb[nearest[0][~opaque], nearest[1][~opaque]]
    labels[~opaque] = labels[nearest[0][~opaque], nearest[1][~opaque]]
    if name == 'left_mirrored':
        image = image.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
        rgb, labels, opaque = rgb[:, ::-1], labels[:, ::-1], opaque[:, ::-1]
    return image, rgb, labels, opaque


def export_colors(mesh, colors, path):
    rgba = np.column_stack((np.clip(colors, 0, 255), np.full(len(colors), 255)))
    mesh.visual = trimesh.visual.ColorVisuals(mesh=mesh, vertex_colors=rgba.astype('uint8'))
    mesh.export(path, include_normals=True)
    srgb = rgba.astype(np.float32) / 255
    linear = srgb.copy()
    linear[:, :3] = np.where(srgb[:, :3] <= .04045, srgb[:, :3] / 12.92,
                             ((srgb[:, :3] + .055) / 1.055) ** 2.4)
    gltf = GLTF2().load(str(path))
    binary = gltf.binary_blob()
    padding = b'\0' * ((-len(binary)) % 4)
    raw = linear.astype('<f4').tobytes()
    gltf.bufferViews.append(BufferView(buffer=0, byteOffset=len(binary)+len(padding),
                                      byteLength=len(raw), target=34962))
    gltf.accessors.append(Accessor(bufferView=len(gltf.bufferViews)-1,
                                   componentType=5126, count=len(colors), type='VEC4'))
    gltf.materials = [Material(name='ReferenceColors_RegionCorrected',
        pbrMetallicRoughness=PbrMetallicRoughness(baseColorFactor=[1,1,1,1],
            metallicFactor=0, roughnessFactor=1), doubleSided=True,
        extensions={'KHR_materials_unlit': {}})]
    gltf.extensionsUsed = list(set(gltf.extensionsUsed or []) | {'KHR_materials_unlit'})
    for part in gltf.meshes:
        for primitive in part.primitives:
            primitive.attributes.COLOR_0 = len(gltf.accessors)-1
            primitive.material = 0
    gltf.set_binary_blob(binary+padding+raw)
    gltf.buffers[0].byteLength = len(binary)+len(padding)+len(raw)
    gltf.save_binary(str(path))


def run():
    shape_path = OUT / 'orange-girl-shape.glb'
    shape_hash = hashlib.sha256(shape_path.read_bytes()).hexdigest()
    mesh = trimesh.load(shape_path, force='mesh', process=False)
    v = np.asarray(mesh.vertices)
    low, high = mesh.bounds
    span, center = high-low, (high+low)/2
    normals = np.asarray(mesh.vertex_normals)
    samples, classes, confidence = [], [], []
    projections = []
    views = [('front',0,1,2,1),('right',2,1,0,-1),
             ('back',0,-1,2,-1),('left_mirrored',2,-1,0,1)]
    for name, axis, sign, depth_axis, depth_sign in views:
        image, rgb, labels, opaque = reference(name)
        x0,y0,x1,y1 = image.getchannel('A').getbbox()
        u = .5 + sign*(v[:,axis]-center[axis])/span[axis]
        t = (high[1]-v[:,1])/span[1]
        px = np.clip(np.rint(x0+u*(x1-x0-1)),0,image.width-1).astype(int)
        py = np.clip(np.rint(y0+t*(y1-y0-1)),0,image.height-1).astype(int)
        projections.append((px,py))
        depth = v[:,depth_axis]*depth_sign
        bx = np.clip(np.rint(u*767),0,767).astype(int)
        by = np.clip(np.rint(t*767),0,767).astype(int)
        zbuffer = np.full((768,768),-np.inf)
        np.maximum.at(zbuffer,(by,bx),depth)
        zbuffer = maximum_filter(zbuffer,size=3)
        visible = depth >= zbuffer[by,bx] - .028
        facing = np.maximum(normals[:,depth_axis]*depth_sign,0)
        weight = (facing**3+.035)*visible*opaque[py,px]
        samples.append(rgb[py,px])
        classes.append(labels[py,px])
        confidence.append(weight)
    samples, classes = np.array(samples), np.array(classes)
    confidence = np.array(confidence)
    votes = np.stack([(confidence*(classes==k)).sum(axis=0) for k in range(4)],axis=1)
    # Strong labels are shared over triangle edges. Surface connectivity avoids
    # copying the nearby sweatshirt color across the gap to an isolated hair tip.
    edges = mesh.edges_unique
    a,b = edges.T
    lengths = np.linalg.norm(v[a]-v[b],axis=1)
    w = 1/np.maximum(lengths,.002)
    graph = coo_matrix((np.r_[w,w],(np.r_[a,b],np.r_[b,a])),shape=(len(v),len(v))).tocsr()
    degree = np.asarray(graph.sum(axis=1)).ravel()
    total = votes.sum(axis=1)
    prob = votes/np.maximum(total[:,None],1e-12)
    seed_strength = np.clip(total*3,0,.94)
    for _ in range(36):
        propagated = graph@prob/degree[:,None]
        prob = seed_strength[:,None]*(votes/np.maximum(total[:,None],1e-12)) + (1-seed_strength[:,None])*propagated
    region = prob.argmax(axis=1)
    # Hair/hood contact: require corroboration from two views for cloth on a curl.
    hair_evidence = (confidence*(classes==HAIR)).sum(axis=0)
    cloth_evidence = (confidence*(classes==CLOTH)).sum(axis=0)
    near_hair = (v[:,1]>-.40) & (v[:,1]<.12)
    repaired_hair = near_hair & (hair_evidence>.045) & (hair_evidence>cloth_evidence*.42) & (region==CLOTH)
    region[repaired_hair] = HAIR
    # The dangling outer curls sit beyond the collar. All four silhouette-based
    # projections can miss their thin underside and hit the sweatshirt behind it.
    # This conservative model-space envelope covers those curls, not the hood.
    curl_envelope = (v[:,1]>-.36)&(v[:,1]<.20)&(np.abs(v[:,0])>.53)
    corrected_curls = curl_envelope & (region==CLOTH)
    region[corrected_curls] = HAIR
    repaired_hair |= corrected_curls
    # The front drawing supplies a continuous face and neck even where the nose,
    # lips or chin normals point sideways or down. Keep eye and lip detail intact.
    front_face = (classes[0]==SKIN) & (v[:,2]>.12) & (np.abs(v[:,0])<.34) & (v[:,1]>-.38)
    region[front_face] = SKIN
    color = np.zeros((len(v),3))
    mass = np.zeros(len(v))
    for i in range(4):
        weight = confidence[i]*(classes[i]==region)
        color += weight[:,None]*samples[i]
        mass += weight
    valid = mass>1e-8
    color[valid] /= mass[valid,None]
    color[front_face] = samples[0,front_face]
    valid[front_face] = True
    for k in range(4):
        source = valid & (region==k)
        target = ~valid & (region==k)
        if target.any():
            if not source.any():
                raise RuntimeError(f'No source colors for region {k}')
            _,near = cKDTree(v[source]).query(v[target])
            color[target] = color[source][near]
    # Keep the approved appearance elsewhere. The revision changes only hair
    # contamination and the continuous skin projection, avoiding new cap seams.
    original = GLTF2().load(str(OUT/'orange-girl-reference-colors.glb'))
    accessor = original.accessors[original.meshes[0].primitives[0].attributes.COLOR_0]
    view = original.bufferViews[accessor.bufferView]
    original_linear = np.frombuffer(original.binary_blob(),dtype='<f4',
        count=accessor.count*4,offset=(view.byteOffset or 0)+(accessor.byteOffset or 0)).reshape(-1,4)[:,:3]
    original_srgb = np.where(original_linear<=.0031308,original_linear*12.92,
                            1.055*original_linear**(1/2.4)-.055)*255
    original_green = (original_srgb[:,1]>original_srgb[:,0]*.82)&(original_srgb[:,1]>original_srgb[:,2]*1.12)
    hair_patch = (region==HAIR)&original_green&curl_envelope
    # Align the illustrated chin to the actual transition from jaw to neck.
    # A whole-bounds projection places the drawing's jaw outline on the neck,
    # creating a second horizontal chin below the geometric chin.
    _, front_rgb, _, _ = reference('front')
    px, _ = projections[0]
    jaw_py = np.rint(np.interp(v[:,1],[-.34,-.22,-.08,-.03,.04,.12],
                              [523,488,445,420,377,347])).astype(int)
    jaw_sample = front_rgb[jaw_py,px]
    skin_patch = (classes[0]==SKIN)&(v[:,1]<.045)&(v[:,1]>-.34)&(v[:,2]>0)&(np.abs(v[:,0])<.25)
    color[skin_patch] = jaw_sample[skin_patch]
    skin_blend = np.clip(v[:,2]/.08,0,1)*np.clip((.25-np.abs(v[:,0]))/.07,0,1)
    skin_blend *= np.clip((.045-v[:,1])/.025,0,1)*np.clip((v[:,1]+.34)/.07,0,1)
    color[skin_patch] = color[skin_patch]*skin_blend[skin_patch,None]+original_srgb[skin_patch]*(1-skin_blend[skin_patch,None])
    keep = ~(hair_patch|skin_patch)
    color[keep] = original_srgb[keep]
    trusted_hair = (region==HAIR)&(~original_green)&(original_srgb[:,0]>55)&(original_srgb[:,0]<195)
    trusted_hair &= (original_srgb[:,0]>original_srgb[:,1]*1.25)&(original_srgb[:,1]>original_srgb[:,2]*1.20)
    distances, nearest = cKDTree(v[trusted_hair]).query(v[hair_patch],k=12)
    proximity = 1/np.maximum(distances,.002)**2
    color[hair_patch] = (original_srgb[trusted_hair][nearest]*proximity[:,:,None]).sum(axis=1)/proximity.sum(axis=1)[:,None]
    # Only soften the jaw/neck transition; broad smoothing would erase features.
    jaw = skin_patch
    same = region[a]==region[b]
    smooth_graph = coo_matrix((np.r_[w[same],w[same]],
        (np.r_[a[same],b[same]],np.r_[b[same],a[same]])),shape=graph.shape).tocsr()
    smooth_degree = np.asarray(smooth_graph.sum(axis=1)).ravel()
    for _ in range(18):
        average = smooth_graph@color/np.maximum(smooth_degree[:,None],1e-12)
        color[jaw] = .35*color[jaw]+.65*average[jaw]
    path = OUT/'orange-girl-colors-v2.glb'
    export_colors(mesh,color,path)
    # Re-import validates index ordering and verifies that only appearance changed.
    checked = trimesh.load(path,force='mesh',process=False)
    assert np.array_equal(checked.vertices,mesh.vertices)
    assert np.array_equal(checked.faces,mesh.faces)
    assert hashlib.sha256(shape_path.read_bytes()).hexdigest()==shape_hash
    np.savez_compressed(OUT/'color-regions-v2.npz',region=region,
                        repaired_hair=repaired_hair,front_face=front_face,jaw=jaw)
    record = {'method':'region-constrained multiview reference vertex colors',
        'geometry':'orange-girl-shape.glb','geometry_sha256':shape_hash,
        'geometry_unchanged':True,'vertices':len(v),'faces':len(mesh.faces),
        'hair_vertices_reclassified':int(repaired_hair.sum()),
        'green_hair_vertices_recolored':int(hair_patch.sum()),
        'skin_vertices_recolored':int(skin_patch.sum()),
        'jaw_transition_vertices':int(jaw.sum()),
        'region_counts':{n:int((region==k).sum()) for k,n in enumerate(['hair','skin','cloth','cap'])},
        'left_side':'mirrored right reference',
        'calibration':'chin landmarks and curl envelope calibrated for this mesh only',
        'limits':['illustration projection, not a PBR texture bake',
                  'thin curl and ear boundaries still have projection artifacts',
                  'model-specific calibration is not a general segmentation method',
                  'no rig or expression deformation']}
    (OUT/'appearance-v2.json').write_text(json.dumps(record,indent=2),encoding='utf-8')
    print(json.dumps(record,indent=2),flush=True)


if __name__=='__main__':
    run()
