"""Generate a first multiview shape with the upstream Hunyuan3D-2mv model.

This is a local ML inference workflow, not a replacement for the approved art.
All masks/crops are intermediate model inputs; the original artwork is unchanged.
"""
from pathlib import Path
import argparse
import hashlib
import json
import os
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / '.modeling'
os.environ.setdefault('HF_HOME', str(WORK / 'hf-cache'))
os.environ.setdefault('HY3DGEN_MODELS', str(WORK / 'weights'))
os.environ.setdefault('U2NET_HOME', str(WORK / 'u2net'))
os.environ.setdefault('HF_HUB_DISABLE_XET', '1')
os.environ.setdefault('HF_HUB_DOWNLOAD_TIMEOUT', '120')
os.environ.setdefault('CA_USE_SAGEATTN', '0')
sys.path.insert(0, str(WORK / 'Hunyuan3D-2'))


def prepare():
    from PIL import Image
    from rembg import new_session, remove
    source = ROOT / 'design-demos/orange-girl-modeling-v1/01-head-turnaround.png'
    sheet = Image.open(source).convert('RGB')
    w, h = sheet.size
    # Bounds of the three illustrated panels, excluding orientation captions.
    # Upstream sample left.png faces image-left; our image-right profile is RIGHT.
    boxes = {'front': (0, .045, .351, .916),
             'right': (.351, .045, .655, .916),
             'back': (.655, .045, 1, .916)}
    directory = WORK / 'inputs'
    directory.mkdir(parents=True, exist_ok=True)
    session = new_session('u2net', providers=['CPUExecutionProvider'])
    for name, b in boxes.items():
        path = directory / f'{name}.png'
        if path.exists():
            continue
        panel = sheet.crop(tuple(round(v * (w if i % 2 == 0 else h)) for i, v in enumerate(b)))
        cutout = remove(panel, session=session, post_process_mask=True)
        cutout.save(path)
        print('PREPARED', name, panel.size, 'alpha', cutout.getchannel('A').getextrema(), flush=True)
    manifest = {'source': str(source.relative_to(ROOT)),
                'source_sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
                'normalized_panel_bounds': boxes, 'side_key': 'right',
                'preprocessing': 'panel crop and U2Net foreground mask for ML input'}
    (directory / 'manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')


def download():
    from huggingface_hub import hf_hub_download
    dest = WORK / 'weights/tencent/Hunyuan3D-2mv'
    # Download only the safetensors variant, not the duplicate pickle checkpoint.
    for filename in ['hunyuan3d-dit-v2-mv/config.yaml',
                     'hunyuan3d-dit-v2-mv/model.fp16.safetensors']:
        existing = dest / filename
        if existing.is_file():
            if filename.endswith('config.yaml') and existing.stat().st_size == 1608:
                continue
            if filename.endswith('safetensors') and existing.stat().st_size == 4928151562:
                digest = hashlib.sha256()
                with existing.open('rb') as handle:
                    for block in iter(lambda: handle.read(8 * 1024 * 1024), b''):
                        digest.update(block)
                if digest.hexdigest() != 'd36f5881bcdc56726b73e517cd444c13c60732431622da7268145355c8d38e9c':
                    raise RuntimeError('Downloaded model hash differs from the official SHA256')
                print('VERIFIED official SHA256', digest.hexdigest(), flush=True)
                continue
        print('DOWNLOAD', filename, flush=True)
        hf_hub_download('tencent/Hunyuan3D-2mv', filename, local_dir=dest)
    return dest / 'hunyuan3d-dit-v2-mv'


def generate(args):
    import numpy as np
    import torch
    from PIL import Image
    if not torch.cuda.is_available():
        raise RuntimeError('CUDA is unavailable in the isolated environment')
    print('RUNTIME', torch.__version__, torch.cuda.get_device_name(args.gpu), flush=True)
    capability = torch.cuda.get_device_capability(args.gpu)
    # Query chunks preserve full-key attention while avoiding a giant score tensor
    # on GPUs without a fused attention kernel. Do not chunk causal attention.
    original_sdpa = torch.nn.functional.scaled_dot_product_attention
    def chunked_sdpa(q, k, v, attn_mask=None, dropout_p=0.0, is_causal=False, scale=None):
        if q.shape[-2] <= 256 or is_causal or dropout_p:
            return original_sdpa(q, k, v, attn_mask=attn_mask, dropout_p=dropout_p,
                                 is_causal=is_causal, scale=scale)
        values = []
        for start in range(0, q.shape[-2], 256):
            mask = attn_mask
            if mask is not None and mask.shape[-2] == q.shape[-2]:
                mask = mask[..., start:start + 256, :]
            values.append(original_sdpa(q[..., start:start + 256, :], k, v,
                                         attn_mask=mask, dropout_p=0.0,
                                         is_causal=False, scale=scale))
        return torch.cat(values, dim=-2)
    if capability[0] < 7:
        torch.nn.functional.scaled_dot_product_attention = chunked_sdpa
    from hy3dgen.shapegen import Hunyuan3DDiTFlowMatchingPipeline
    from hy3dgen.shapegen.models.autoencoders import SurfaceExtractors
    model_dir = download()
    images = {k: Image.open(WORK / 'inputs' / f'{k}.png').convert('RGBA')
              for k in ['front', 'right', 'back']}
    pipeline = Hunyuan3DDiTFlowMatchingPipeline.from_single_file(
        str(model_dir / 'model.fp16.safetensors'), str(model_dir / 'config.yaml'),
        use_safetensors=True, device='cpu',
        dtype=torch.float32 if capability[0] < 7 else torch.float16)
    # The checked upstream pipeline exposes offload methods but not the components
    # dictionary expected by them. Supply it in this wrapper, without editing upstream.
    pipeline.components = {'conditioner': pipeline.conditioner,
                           'model': pipeline.model, 'vae': pipeline.vae}
    pipeline.enable_model_cpu_offload(gpu_id=args.gpu)
    pipeline.device = torch.device(f'cuda:{args.gpu}')
    pipeline.vae.surface_extractor = SurfaceExtractors['mc']()
    # Pascal does not support FlashAttention. PyTorch's math SDPA is the baseline.
    torch.backends.cuda.enable_flash_sdp(False)
    torch.backends.cuda.enable_mem_efficient_sdp(False)
    torch.backends.cuda.enable_math_sdp(True)
    started = time.time()
    def step(i, t, outputs):
        print(f'STEP {i + 1}/{args.steps} elapsed={time.time() - started:.1f}s', flush=True)
    latent = pipeline(image=images, num_inference_steps=args.steps,
                      guidance_scale=5.0, generator=torch.Generator().manual_seed(args.seed),
                      output_type='latent', enable_pbar=False, callback=step, callback_steps=1)[0]
    # Save the latent first so export/resolution failures do not repeat diffusion.
    output = ROOT / 'model-preview/reconstructed'
    output.mkdir(parents=True, exist_ok=True)
    np.save(WORK / 'shape-latent.npy', latent.float().cpu().numpy())
    with torch.inference_mode():
        mesh = pipeline._export(latent.unsqueeze(0), output_type='trimesh',
                                octree_resolution=args.resolution, num_chunks=2048,
                                mc_algo='mc', enable_pbar=True)[0]
    if mesh is None or not len(mesh.vertices):
        raise RuntimeError('No mesh was extracted')
    mesh.export(output / 'orange-girl-shape.glb', include_normals=True)
    info = {'model': 'tencent/Hunyuan3D-2mv', 'stage': 'untextured foundation mesh',
            'seed': args.seed, 'steps': args.steps, 'resolution': args.resolution,
            'elapsed_seconds': round(time.time() - started, 1),
            'vertices': len(mesh.vertices), 'faces': len(mesh.faces),
            'bounds': mesh.bounds.tolist(), 'torch': torch.__version__,
            'gpu': torch.cuda.get_device_name(args.gpu),
            'source_repository_commit': 'f8db63096c8282cb27354314d896feba5ba6ff8a'}
    (output / 'generation.json').write_text(json.dumps(info, indent=2), encoding='utf-8')
    print('EXPORTED', output / 'orange-girl-shape.glb', info, flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('mode', choices=['prepare', 'download', 'generate'])
    parser.add_argument('--steps', type=int, default=30)
    parser.add_argument('--resolution', type=int, default=256)
    parser.add_argument('--seed', type=int, default=12345)
    parser.add_argument('--gpu', type=int, default=0)
    opts = parser.parse_args()
    if opts.mode == 'prepare':
        prepare()
    elif opts.mode == 'download':
        download()
    else:
        generate(opts)
