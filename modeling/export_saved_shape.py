"""Resume only the VAE/mesh extraction stage from the saved diffusion latent."""
import argparse
import json
import time
import numpy as np
from reconstruct import ROOT, WORK, download
import torch

original_sdpa = torch.nn.functional.scaled_dot_product_attention
def chunked_sdpa(q, k, v, attn_mask=None, dropout_p=0.0, is_causal=False, scale=None):
    if q.shape[-2] <= 256 or is_causal or dropout_p:
        return original_sdpa(q, k, v, attn_mask=attn_mask, dropout_p=dropout_p,
                             is_causal=is_causal, scale=scale)
    parts = []
    for start in range(0, q.shape[-2], 256):
        mask = attn_mask
        if mask is not None and mask.shape[-2] == q.shape[-2]:
            mask = mask[..., start:start+256, :]
        parts.append(original_sdpa(q[..., start:start+256, :], k, v,
                                   attn_mask=mask, dropout_p=0.0,
                                   is_causal=False, scale=scale))
    return torch.cat(parts, dim=-2)
torch.nn.functional.scaled_dot_product_attention = chunked_sdpa
torch.backends.cuda.enable_flash_sdp(False)
torch.backends.cuda.enable_mem_efficient_sdp(False)
torch.backends.cuda.enable_math_sdp(True)

from safetensors import safe_open
import yaml
from hy3dgen.shapegen.pipelines import instantiate_from_config, export_to_trimesh
from hy3dgen.shapegen.models.autoencoders import SurfaceExtractors

def main(resolution):
    folder = download()
    config = yaml.safe_load((folder / 'config.yaml').read_text(encoding='utf-8'))
    print('RESUME: loading only VAE weights, inference mode', flush=True)
    vae = instantiate_from_config(config['vae'])
    with safe_open(str(folder / 'model.fp16.safetensors'), framework='pt', device='cpu') as source:
        state = {k[4:]: source.get_tensor(k) for k in source.keys() if k.startswith('vae.')}
    vae.load_state_dict(state, strict=False)
    del state
    vae.eval().requires_grad_(False).to(device='cuda:0', dtype=torch.float32)
    vae.surface_extractor = SurfaceExtractors['mc']()
    latent = torch.from_numpy(np.load(WORK / 'shape-latent.npy')).unsqueeze(0).to('cuda:0')
    started = time.time()
    with torch.inference_mode():
        features = vae(latent / vae.scale_factor)
        print('RESUME: VAE decoded, extracting surface', flush=True)
        outputs = vae.latents2mesh(features, bounds=1.01, mc_level=0.0,
                                   num_chunks=2048, octree_resolution=resolution,
                                   enable_pbar=True)
        mesh = export_to_trimesh(outputs)[0]
    if mesh is None or not len(mesh.vertices):
        raise RuntimeError('No mesh was extracted')
    dest = ROOT / 'model-preview/reconstructed'
    dest.mkdir(parents=True, exist_ok=True)
    mesh.export(dest / 'orange-girl-shape.glb', include_normals=True)
    info = {'model': 'tencent/Hunyuan3D-2mv', 'stage': 'untextured foundation mesh',
            'seed': 12345, 'steps': 30, 'diffusion_seconds': 708.8,
            'resolution': resolution, 'export_seconds': round(time.time() - started, 1),
            'vertices': len(mesh.vertices), 'faces': len(mesh.faces),
            'bounds': mesh.bounds.tolist(), 'torch': torch.__version__,
            'dtype': 'float32', 'gpu': torch.cuda.get_device_name(0),
            'resumed_from_saved_latent': True,
            'source_repository_commit': 'f8db63096c8282cb27354314d896feba5ba6ff8a'}
    (dest / 'generation.json').write_text(json.dumps(info, indent=2), encoding='utf-8')
    print('EXPORTED', json.dumps(info), flush=True)

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--resolution', type=int, default=256)
    main(parser.parse_args().resolution)
