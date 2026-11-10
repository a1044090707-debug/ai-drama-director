"""Check exported geometry against V4: every head component is a 0.9 similarity.

Run with .modeling/venv/Scripts/python.exe tests/check_chinese_head_scale.py
This examines GLB coordinates independently of the authoring script and viewer.
"""
from pathlib import Path
import json,sys
import numpy as np
from scipy.spatial import cKDTree
from scipy.spatial.transform import Rotation
from pygltflib import GLTF2

ROOT=Path(__file__).resolve().parents[1]
DTYPES={5120:'i1',5121:'u1',5122:'<i2',5123:'<u2',5125:'<u4',5126:'<f4'}
COUNTS={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}

def load(version):
    gltf=GLTF2().load(str(ROOT/f'model-preview/snow/assets/chinese-female-{version}.glb'))
    blob=gltf.binary_blob();parents={}
    for i,node in enumerate(gltf.nodes):
        for child in node.children or []:parents[child]=i
    def world(i):
        node=gltf.nodes[i]
        if node.matrix:
            m=np.array(node.matrix).reshape(4,4,order='F')
        else:
            m=np.eye(4)
            m[:3,:3]=Rotation.from_quat(node.rotation or [0,0,0,1]).as_matrix()@np.diag(node.scale or [1,1,1])
            m[:3,3]=node.translation or [0,0,0]
        return world(parents[i])@m if i in parents else m
    def accessor(index):
        a=gltf.accessors[index]
        dtype=np.dtype(DTYPES[a.componentType]);count=COUNTS[a.type]
        if a.bufferView is None:
            result=np.zeros((a.count,count))
        else:
            view=gltf.bufferViews[a.bufferView]
            result=np.ndarray((a.count,count),dtype=dtype,buffer=blob,
                              offset=(view.byteOffset or 0)+(a.byteOffset or 0),
                              strides=(view.byteStride or dtype.itemsize*count,dtype.itemsize)).astype(float)
        if a.sparse and a.sparse.count:
            sparse=a.sparse;iv=gltf.bufferViews[sparse.indices.bufferView];vv=gltf.bufferViews[sparse.values.bufferView]
            indices=np.frombuffer(blob,dtype=np.dtype(DTYPES[sparse.indices.componentType]),count=sparse.count,
                                  offset=(iv.byteOffset or 0)+(sparse.indices.byteOffset or 0))
            values=np.frombuffer(blob,dtype=dtype,count=sparse.count*count,
                                 offset=(vv.byteOffset or 0)+(sparse.values.byteOffset or 0)).reshape(-1,count)
            result[indices]=values
        return result
    result={}
    for i,node in enumerate(gltf.nodes):
        if node.mesh is None:continue
        m=world(i);primitives=gltf.meshes[node.mesh].primitives
        points=[];shapes={}
        for primitive in primitives:
            p=accessor(primitive.attributes.POSITION)
            points.append(p@m[:3,:3].T+m[:3,3])
            for j,target in enumerate(primitive.targets or []):
                position=target.get('POSITION') if isinstance(target,dict) else target.POSITION
                shape=p+(accessor(position) if position is not None else 0)
                shapes.setdefault(j,[]).append(shape@m[:3,:3].T+m[:3,3])
        result[node.name]=np.concatenate(points)
        for j,shape in shapes.items():result[node.name+'__morph'+str(j)]=np.concatenate(shape)
    return result

version=sys.argv[1] if len(sys.argv)>1 else 'v5'
scale=1.0 if version=='v6' else .9
old=load('v4');new=load(version)
anchor=np.array([0,1.285,.005]) # Blender Z-up to glTF Y-up.
names=['Rain_head','Rain_eyes','Rain_eyelashes','Rain_eyebrows',
       'Rain_gums_upper','Rain_gums_lower','Rain_tongue','CNGirl_Pupil_-1','CNGirl_Pupil_1']
report={}
for name in names:
    expected=anchor+(old[name]-anchor)*scale
    distances=cKDTree(expected).query(new[name],k=1)[0]
    reverse=cKDTree(new[name]).query(expected,k=1)[0]
    error=max(float(distances.max()),float(reverse.max()))
    assert error<2e-6,(name,'face or feature shape changed',error)
    ratio=np.ptp(new[name],axis=0)/np.ptp(old[name],axis=0)
    assert np.max(np.abs(ratio-scale))<2e-4,(name,'nonuniform scale',ratio)
    report[name]={'maxPositionError':error,'axisScale':ratio.tolist()}
    for j in range(4):
        key=name+'__morph'+str(j)
        if key not in old:continue
        expected_shape=anchor+(old[key]-anchor)*scale
        error=float(cKDTree(expected_shape).query(new[key])[0].max())
        assert error<2e-6,(key,'expression shape changed',error)
        report[name].setdefault('morphMaxErrors',[]).append(error)
# Only the neck surface may change. Clothes, shoes and the body extremities
# must retain their exported world coordinates.
for name in ['Rain_top','Rain_jeans','Rain_shoes']:
    assert cKDTree(old[name]).query(new[name])[0].max()<2e-6,(name,'body changed')
(ROOT/f'model-preview/chinese-female/head-scale-verification-{version}.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print('UNIFORM_HEAD_SCALE_PASS',len(names),'parts; clothing and shoes unchanged')
