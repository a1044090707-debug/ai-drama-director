# 橙帽女生的多视图重建

使用腾讯公开的 Hunyuan3D-2mv 推理代码与权重，从已确认的中性三视图生成基础网格。表情图保留作后续表情制作参考，不能把不同表情当作同一中性头部的多视图输入。

## 目录

- `.modeling/Hunyuan3D-2` 保存上游源码和许可。上游代码未修改。
- `.modeling/venv` 保存 Python 3.10 隔离环境。
- `.modeling/weights` 保存权重，不上传 GitHub。
- `.modeling/inputs` 保存推理前处理的正面、右侧、背面图及来源记录。
- `model-preview/reconstructed` 保存生成的 GLB 与运行记录。
- `model-preview/reconstruction.html` 是独立评审页。

## 运行

在项目根目录，使用 PowerShell。

```powershell
.modeling/venv/Scripts/python.exe modeling/reconstruct.py prepare
.modeling/venv/Scripts/python.exe modeling/reconstruct.py download
.modeling/venv/Scripts/python.exe -u modeling/reconstruct.py generate --steps 30 --resolution 256
# 若生成已完成而网格提取失败，从保存的结果继续，不重复生成。
.modeling/venv/Scripts/python.exe -u modeling/export_saved_shape.py --resolution 256
.modeling/venv/Scripts/python.exe modeling/refine_mesh.py
.modeling/venv/Scripts/python.exe modeling/project_reference_colors.py
```

`prepare` 从已确认的三视图分离三个视角，并以 U2Net 提取人物前景。原图不变。侧面图朝画面右侧，按上游示例映射为 `right`。已有输入不会重复生成。

`download` 优先检查本地文件。已经下载的 4928151562 字节权重需要通过官方 SHA256 校验。官方下载不可达时，本次从魔搭社区腾讯官方仓库下载，哈希与腾讯 Hugging Face 公布值一致。

`generate` 先保存生成的 latent，再提取基础几何和运行参数。Pascal 显卡采用 FP32、CPU offload 和查询分块注意力。分块仍访问全部键和值，不截断注意力范围。CPU 数值对照测试最大误差为 0。首次网格提取因梯度开启导致显存不足，已将提取代码放入 inference_mode。恢复脚本只加载 VAE，并关闭参数梯度。

`project_reference_colors.py` 将参考图颜色投影到基础几何上，另存 GLB。原始灰模保留，方便判断形状。投影使用顶点深度判断可见性，未提供左侧视图时镜像右侧参考补充左侧。因此它是外观对照稿，还需要处理接缝、遮挡和正式纹理。

`refine_mesh.py` 保留原始重建结果到 .modeling/orange-girl-shape-raw.glb，再清理少于 100 面的微小孤立碎片并进行 8 次 Taubin 平滑。本轮移除 38 个小碎片，输出 283663 顶点、567562 面。拓扑和法线检查通过。另一次逐视图 UV 投影试验仍有明显接缝，未作为默认材质交付。

## 预览

启动静态服务器。

```powershell
python -m http.server 8765 --bind 127.0.0.1
```

打开 `http://127.0.0.1:8765/model-preview/reconstruction.html`。页面提供正面、左右转、侧面、背面、网格线与自动环绕，也可以读取浏览器本地选择的 GLB。

评审页不申请摄像头权限，不接入成品 `index.html`。

## 当前交付边界

基础几何和参考色用于造型评审。网格尚未通过外观检查时，不标记为完成角色。眨眼、张嘴需要单独制作口腔、眼睑和表情拓扑，自动重建模型不等于已经绑定的实时头像。

模型、依赖与许可核查见 [SOURCES.md](SOURCES.md)。生成成功后，具体顶点数、面数、种子、耗时和版本记录在 `generation.json` 中。
