# 黑发长直发女性角色

以 Blender Studio Rain 的身体、面部拓扑和骨骼为基础，保留 Rain 的大眼睛、鼻唇比例，适度收窄脸颊与下颌，制作黑色长直发与碎刘海，搭配棕色眼睛、素白上衣和墨青长裤。

这是可编辑、可驱动的三维角色。第六版按已确认的 `hair-approved-design.png` 制作偏分刘海、锁骨层次和内扣发尾。脸型和五官沿用第四版，撤销第五版额外的 10% 缩小，恢复第四版的头部大小，不再调整脸型和五官比例。

头部缩放采用相同中心和相同三轴比例，覆盖头部网格、眼睛、眉毛、睫毛、口腔、瞳孔、完整头发及面部形态键。身体仅在脖子接缝处过渡，衣服、鞋子和其余身体尺寸保留。网页采用第四版的固定显示比例，保持与恢复前一致的身体显示尺寸。

## 预览与文件

- 在 Snow 页面选择“女生 · 偏分锁骨发”，或打开 `/model-preview/snow/?character=chinese`。
- `../snow/assets/chinese-female-v6.glb` 是网页使用的完整全身角色，保留双腿、双脚和鞋子。
- `chinese-female-v6.blend` 是可编辑 Blender 场景。
- `female-front-v6.png` 与 `female-face-v6.png` 是同一模型的正面全身和面部渲染。
- `../../modeling/build_chinese_female_v6.py` 制作模型、材质、渲染和 GLB。
- `../../modeling/build_chinese_female_hair_v5.py` 制作连续头皮、偏分刘海和内扣的锁骨层次发，处理发根接缝。

## 驱动范围

保留 21 根身体骨骼和张嘴、左右闭眼、微笑四项表情。长发上部绑定头部，下部通过颈部、胸部权重过渡跟随肩颈，当前没有发丝物理模拟。可在页面转侧检查，并使用动作与表情控件测试。

## 复现与检查

在项目目录执行以下 PowerShell 命令。

```powershell
& '.modeling/blender-runtime/blender-4.5.9-windows-x64/blender.exe' --background --factory-startup --disable-autoexec --python modeling/build_chinese_female_v6.py
node tests/snow-avatar.test.mjs chinese
.modeling/venv/Scripts/python.exe tests/check_chinese_head_scale.py v6
```

## 来源

Rain Rig (CC) Blender Foundation | studio.blender.org

基础模型来自 [Blender Studio Rain](https://studio.blender.org/characters/rain/v3/)，按 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) 使用并保留署名。身体与原生面部表情来自 Rain，修改内容见 `character.json`。

第六版撤销额外缩小，所有面部形态键、口腔、瞳孔、头发与骨骼静止位置一同恢复。第一至第五版 GLB、Blender 文件、渲染和代码仍保留，原版 Snow 与金发角色没有覆盖。

`head-scale-verification-v6.json` 记录导出后的各部件三轴比例和位置误差，通过和第四版 GLB 的几何坐标直接比较，验证脸型、五官及表情已原样恢复到第四版的大小。旧版本和原版 Snow 均保留。
