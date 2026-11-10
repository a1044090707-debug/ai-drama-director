# Snow 与金发男生预览

页面保留 Blender Studio 官方 Snow 的网页转换版，并增加金发偏分男生。右侧“选择预览角色”可以切换。原版 Snow 的 GLB 独立保留。

页面还增加了以 Rain 为基础的黑发女性角色。选择“女生 · 黑发长直发”，或使用 `?character=chinese` 直接打开。模型、Blender 场景和制作代码说明见 `../chinese-female/README.md`。三个人物分别保存，不会互相覆盖。

新版沿用 Snow 的身体骨骼和基础表情，修改脸部比例、配色和发型。新版发型用连续的实体网格填补发束间隙，整体跟随头部骨骼。V6 修正了下巴、脖子的连续变形与表面法线，并在全部表情上同步平滑下巴和喉部。

## 使用

在项目目录运行 `python -m http.server 8765 --bind 127.0.0.1`，然后打开 `http://127.0.0.1:8765/model-preview/snow/`。默认显示新版金发男生。链接添加 `?character=snow` 可直接显示原版，添加 `?character=gentle` 可直接显示新版。摄像头运行期间暂时禁用角色切换，关闭摄像头后可继续切换。

页面默认显示包括双脚的全身。选择全身（含双脚）、面部特写和四个视角检查造型，再用动作按钮检查关节。点击开启摄像头跟随后允许浏览器取景，主舞台显示模型。首次加载动作识别模型需要网络。关闭按钮会停止摄像头和识别线程。

GLB 包含完整身体、脚和鞋，21 根身体骨骼，以及张嘴、左右闭眼和微笑四项表情。细分手指不单独驱动。脚趾弯曲可由示范按钮检查，普通摄像头姿态点提供的是脚部方向，不提供各脚趾动作。多人身份按画面位置匹配，交叉或遮挡时可能交换。

## 文件与代码

- `assets/snow-web.glb` 是可导入 Blender、Three.js 等软件的模型。
- `assets/gentle-v6.glb` 是新版金发偏分角色，包含连续发型、身体蒙皮和四项基础表情。
- `../gentle-draft/gentle-draft-v6.blend` 是新版可编辑场景。
- `../../modeling/render_gentle_v6.py` 生成新版造型、材质、渲染图和 GLB。
- `../../modeling/gentle_closed_hair.py` 整理连续发型，基础发束由 `gentle_swept_hair.py` 生成。
- `avatar.mjs` 加载本模型，复用 `../rain/avatar.mjs` 的带骨骼角色加载器。
- `stage.mjs`、`stage.css`、`index.html` 是独立测试页。
- `../fullbody/driver.mjs` 把检测结果转换为关节和表情。
- `../fullbody/tracking-worker.mjs` 在独立线程运行 MediaPipe 0.10.21。
- `../../modeling/convert_snow_web.py` 是 Blender 转换脚本，保留原模型并另存转换结果。

## 复现转换

先取得下方官方 Snow v4 源文件。将 zip 解压至 `.modeling/third-party/snow/source`。打开其中 `Snow/snow_v4.2.blend`，使用 Blender 4.5 运行 `modeling/convert_snow_web.py`。转换脚本把原有程序材质的基础颜色烘焙为 UV 贴图，整理身体蒙皮，并将原生面部控制转换为可移植的形态键。原始 Blender 中的复杂着色、辅助骨骼和变形修正经过简化。

在当前工作区，可执行以下 PowerShell 命令。

```powershell
& '.modeling/blender-runtime/blender-4.5.9-windows-x64/blender.exe' --background --factory-startup --disable-autoexec '.modeling/third-party/snow/source/Snow/snow_v4.2.blend' --python modeling/convert_snow_web.py
node tests/snow-avatar.test.mjs
node tests/snow-avatar.test.mjs gentle
node tests/snow-avatar.test.mjs chinese
```

自动检查覆盖独立角色骨骼、蒙皮权重、有效表情数据、动作变形与鞋底接地。识别线程已用空白画面完成初始化和推理测试。真人跟随、穿插和目标设备帧率需要实际取景检查。

## 来源与署名

[Snow v4 官方页面](https://studio.blender.org/characters/snow/v4/)  
[官方源文件](https://studio.blender.org/download-source/files/ba/0f/ba0fe6d810333b1d73c1c359e4dc03cb-6.zip)  
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)

Snow Rig (CC) Blender Foundation | studio.blender.org

本转换版保留上述署名。它是官方角色的改编资产，不是从零创作的新角色。
