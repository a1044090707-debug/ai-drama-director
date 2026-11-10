# 本地视频工具

项目通过独立进程调用 FFmpeg 剪辑视频，不需要安装 Python 第三方库。

Windows 64 位环境首次双击 start.cmd 后，后台会准备视频工具。下载器使用 PyPI 上固定版本 imageio-ffmpeg 0.6.0 的 Windows wheel，下载约 31 MB，只提取其中的 FFmpeg 7.1 可执行文件，并校验整个下载包的 SHA-256。无需运行 pip。

本项目压缩包不附带 FFmpeg 二进制。下载完成后，可执行文件保存在本目录，后续启动直接复用。如果网络失败，原有动作游戏仍可使用。请联网后重启 start.cmd，或自行把支持 libx264 和 subtitles 滤镜的 ffmpeg.exe 放在本目录。

也可以设置 AI_DIRECTOR_FFMPEG 环境变量，指定已有的 FFmpeg 文件。其他系统需要自行安装 FFmpeg，并保证在 PATH 中可用。

## 上游与许可

- imageio-ffmpeg 源码与说明 https://github.com/imageio/imageio-ffmpeg
- PyPI 固定版本 https://pypi.org/project/imageio-ffmpeg/0.6.0/
- Windows 构建来源 https://www.gyan.dev/ffmpeg/builds/
- FFmpeg 源码与版本 https://ffmpeg.org/releases/ffmpeg-7.1.tar.xz
- FFmpeg 许可说明 https://ffmpeg.org/legal.html

下载的 Windows FFmpeg 标识为 7.1 essentials_build-www.gyan.dev，启用 GPL 和 version3。下载器会保存 imageio-ffmpeg 包的许可文件及 FFmpeg 自身的 -L 输出。imageio-ffmpeg 包的 BSD 许可与其中 FFmpeg 构建的许可分别适用。

下载校验值为 02fa47c83703c37df6bfe4896aab339013f62bf02c5ebf2dce6da56af04ffc0a。
