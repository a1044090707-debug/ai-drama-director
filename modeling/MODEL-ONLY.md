# 橙帽女生当前模型和代码

本次只整理原聊天中最后采用的 Hunyuan3D-2mv 重建结果，以及本次局部着色修正。游戏 UI、早期手工拼接角色和摄像头代码不在交付包内。

## 当前文件

- `model-preview/reconstructed/orange-girl-shape.glb` 是已清理的基础几何。
- `model-preview/reconstructed/orange-girl-colors-v2.glb` 是本次修正后的参考色版本。
- `model-preview/reconstructed/orange-girl-reference-colors.glb` 是修正脚本需要读取的上一版颜色源。
- `modeling/reconstruct.py`、`export_saved_shape.py` 和 `refine_mesh.py` 记录形状生成与清理步骤。
- `modeling/project_reference_colors.py` 生成原始多视图投影色。
- `modeling/refine_reference_colors.py` 修正外侧发梢的绿色污染和正面下巴至脖子的重复轮廓。
- `model-preview/reconstruction-viewer.js` 是独立模型查看器。

原始几何保持不变，共 283663 个顶点、567562 个三角面。修正脚本会重新读取导出的 GLB，并检查顶点坐标、三角面索引和灰模文件哈希。

## 本次修正的范围

发梢补色从附近已有的棕色头发取样。下巴采用局部纵向对齐，使插画的下巴轮廓落到网格真实的下巴位置，并平滑脖子过渡。参数针对当前模型标定，不能直接用于其他角色。部分卷发、耳缘和帽檐仍有投影误差。

当前仍是静态参考色模型。参考图中的光影已经存在于颜色中，GLB 使用不受实时灯光影响的材质。它不等于完成了哑光彩绘材质，也没有表情变形、眼球转动或身体骨骼。

## 预览

解压后在目录中运行 `python -m http.server 8765 --bind 127.0.0.1`，然后打开 `http://127.0.0.1:8765/model-preview/`。默认载入修正后的参考色。灰模按钮可检查受灯光影响的基础形状。

## 重新上色

已有相应 Python 环境时，在目录中运行以下命令。

```powershell
python modeling/project_reference_colors.py
python modeling/refine_reference_colors.py
```

输入图在 `.modeling/inputs`。所需的 NumPy、SciPy、Pillow、trimesh 和 pygltflib 见 `requirements-appearance.txt`。上游推理代码和模型权重未打包，完整形状生成方法、版本与来源见 `README.md` 和 `SOURCES.md`。

## 摄像头演出需要继续完成的部分

1. 先选择演出范围。替换头部只需要跟随位置、大小和朝向。眨眼、张嘴需要可变形的脸。整个人物演出需要身体骨骼。
2. 保留当前形状作为造型参考，制作适合实时显示和表情变形的网格。眼睑、嘴唇、口腔和眼球需要单独检查。
3. 使用干净的基础颜色和受光材质，设置皮肤、头发、衣服和帽子的粗糙度。插画里固定的明暗不能直接当作完整材质。
4. 摄像头检测人脸朝向和表情系数，再驱动角色。无需每帧重新生成三维几何。
5. 在目标手机上测量实际帧率和延迟，再确定多人数量、网格细节和光照开销。

本包不包含已经完成绑定的实时演出角色。
