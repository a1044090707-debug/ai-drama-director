"""Prepare a pinned FFmpeg on first use; no pip installation is needed."""
import hashlib
import io
import os
from pathlib import Path
import shutil
import subprocess
import sys
import urllib.request
import zipfile

WHEEL_URL = 'https://files.pythonhosted.org/packages/2c/c6/fa760e12a2483469e2bf5058c5faff664acf66cadb4df2ad6205b016a73d/imageio_ffmpeg-0.6.0-py3-none-win_amd64.whl'
WHEEL_SHA256 = '02fa47c83703c37df6bfe4896aab339013f62bf02c5ebf2dce6da56af04ffc0a'


def check_ffmpeg(path):
    options = {'creationflags': subprocess.CREATE_NO_WINDOW} if os.name == 'nt' else {}
    try:
        result = subprocess.run([str(path), '-hide_banner', '-filters'], capture_output=True,
                                timeout=15, **options)
        return result.returncode == 0 and b'subtitles' in result.stdout
    except (OSError, subprocess.TimeoutExpired):
        return False


def ensure_ffmpeg(root, download=True):
    root = Path(root)
    target = root / 'tools' / 'ffmpeg' / ('ffmpeg.exe' if os.name == 'nt' else 'ffmpeg')
    for candidate in (os.environ.get('AI_DIRECTOR_FFMPEG'), str(target), shutil.which('ffmpeg')):
        if candidate and check_ffmpeg(candidate):
            return Path(candidate).resolve()
    if not download or os.name != 'nt' or sys.maxsize <= 2**32:
        raise RuntimeError('未找到支持字幕的 FFmpeg。请安装 FFmpeg，或将 ffmpeg.exe 放入 tools/ffmpeg 后重启。')
    payload = None
    last_error = None
    # Respect the system proxy first, then try direct HTTPS if that proxy is unavailable.
    for opener in (urllib.request.build_opener(), urllib.request.build_opener(urllib.request.ProxyHandler({}))):
        try:
            with opener.open(WHEEL_URL, timeout=25) as response:
                payload = response.read(40 * 1024 * 1024)
            if hashlib.sha256(payload).hexdigest() != WHEEL_SHA256:
                raise RuntimeError('视频工具下载校验失败。')
            break
        except Exception as error:
            last_error = error
            payload = None
    if payload is None:
        raise RuntimeError('视频工具下载失败。请检查网络后重启 start.cmd，或手动放入 FFmpeg。') from last_error
    target.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(io.BytesIO(payload)) as archive:
        binary = 'imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe'
        temporary = target.with_suffix('.download')
        temporary.write_bytes(archive.read(binary))
        if not check_ffmpeg(temporary):
            # Windows requires an .exe extension for CreateProcess.
            temporary.replace(target)
            if not check_ffmpeg(target):
                raise RuntimeError('视频工具不能启动，请检查系统是否允许运行 ffmpeg.exe。')
        else:
            temporary.replace(target)
        license_name = 'imageio_ffmpeg-0.6.0.dist-info/LICENSE'
        (target.parent / 'IMAGEIO-LICENSE.txt').write_bytes(archive.read(license_name))
    options = {'creationflags': subprocess.CREATE_NO_WINDOW} if os.name == 'nt' else {}
    license_info = subprocess.run([str(target), '-L'], capture_output=True, timeout=15, **options)
    (target.parent / 'FFMPEG-LICENSE.txt').write_bytes(license_info.stdout + license_info.stderr)
    return target


if __name__ == '__main__':
    print(ensure_ffmpeg(Path(__file__).resolve().parent))
