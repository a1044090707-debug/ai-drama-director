# 图像重建方案核查

核查日期 2026-11-03。目标是先重建橙帽女生的头部基础网格，与已确认的三视图比较，再做贴图与表情。

## 当前选择

[Tencent-Hunyuan/Hunyuan3D-2](https://github.com/Tencent-Hunyuan/Hunyuan3D-2)，模型选择 [tencent/Hunyuan3D-2mv](https://huggingface.co/tencent/Hunyuan3D-2mv)。该分支支持 front、left、back、right 多视图输入，能同时使用现有正面、侧面与背面参考。采用上游提交 f8db63096c8282cb27354314d896feba5ba6ff8a。

官网仓库报告形状生成约需 6GB 显存，形状与纹理共约需 16GB。仓库提供低显存入口。该配置仅是模型作者的运行要求，不代表当前显卡的速度或人物还原质量已经通过测试。

源码和权重公开，适用腾讯 Hunyuan 社区许可，不是 MIT 许可。许可及 NOTICE 随源码保留在 .modeling/Hunyuan3D-2。后续使用、输出和发布范围以[原始许可](https://github.com/Tencent-Hunyuan/Hunyuan3D-2/blob/main/LICENSE)为准。

## 对照方案

| 方案 | 官方说明 | 本次用途判断 |
| --- | --- | --- |
| [Microsoft TRELLIS.2](https://github.com/microsoft/TRELLIS.2) | 图像到带 PBR 材质的三维资产，MIT；官方基线为 Linux、至少 24GB NVIDIA 显存 | 保留为其他算力环境的候选。当前单卡 12GB，不能视为满足官方配置 |
| [TripoSR](https://github.com/VAST-AI-Research/TripoSR) | 单图重建，MIT；默认约 6GB 显存 | 可做低成本基线，但不能利用三视图共同约束，未证实能满足人物脸部质量 |
| [Hunyuan3D-2.1](https://github.com/Tencent-Hunyuan/Hunyuan3D-2.1) | 官方报告形状约 10GB、纹理约 21GB，形状与纹理总约 29GB | 当前先测试需求更低的 2mv 基础网格，不直接部署完整 2.1 流程 |

## 本地环境实测

- nvidia-smi 显示 4 张 NVIDIA TITAN X (Pascal)，每张 12288 MiB，驱动 560.94。多卡显存不应按单卡可用显存相加。
- 原始 Anaconda 是 Python 3.7.4、PyTorch 1.13.1+cu116，CUDA 张量运算测试通过。
- 测试依赖装在项目 .modeling/venv，使用 Python 3.10，与原始 Anaconda 隔离。
- 隔离环境已安装 PyTorch 2.5.1+cu118，CUDA scaled_dot_product_attention 实测通过。
- Hugging Face 权重站在本地连接超时。改从[魔搭社区腾讯官方仓库](https://modelscope.cn/models/Tencent-Hunyuan/Hunyuan3D-2mv)下载同一权重，文件大小 4928151562 字节，实测 SHA256 为 d36f5881bcdc56726b73e517cd444c13c60732431622da7268145355c8d38e9c，与[腾讯官方公布值](https://huggingface.co/tencent/Hunyuan3D-2mv/blob/main/hunyuan3d-dit-v2-mv/model.fp16.safetensors)一致。
- 源码、缓存和权重放在 .modeling，已加入 .gitignore。成品 index.html 不需要载入推理模型。

Pascal 测试使用 FP32 和按查询分块的注意力实现，完整保留每块对全部键和值的访问，以控制未使用 FlashAttention 时的中间显存。推理封装补齐上游 offload 方法使用的 components 字典，并显式指定 CUDA 执行设备。上游源码保持原样。

## 验收与外观

第一阶段只判断基础几何，采用正面、左右四分之三侧面、侧面、背面对照。基础网格没有通过外观检查前，不宣称角色已经按图还原。

后续纹理、口腔、眼睑、表情变形和绑定需要分别制作或修正。自动生成的网格不应直接视为已经具备可用的表情拓扑。

## 复现入口

使用 .modeling/venv/Scripts/python.exe 运行 modeling/reconstruct.py 的 prepare、download、generate 模式。generate 默认种子 12345，30 步，网格分辨率 256。输入是原始三视图，裁切与去背景只用于推理前处理。

中间输入和缓存保存在 .modeling。成功生成的基础网格保存为 model-preview/reconstructed/orange-girl-shape.glb，同时写入 generation.json。文件生成前，独立重建预览页会明确显示尚未载入模型。
