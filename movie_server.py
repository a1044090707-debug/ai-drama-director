"""Local short-film rendering. Python standard library + a standalone FFmpeg."""
import concurrent.futures
import hashlib
import http.server
import json
import math
import os
from pathlib import Path
import re
import shutil
import subprocess
import threading
import time
import uuid
import wave
from urllib.parse import quote, urlparse

ACTION_FILES = {key: key + '.mp3' for key in (
    'forehead', 'head', 'turn', 'raise', 'handsup', 'wave', 'arms', 'tilt', 'mouth')}
SOUND_LENGTHS = {'arms':3.34,'forehead':4.41,'handsup':5.14,'head':4.78,'mouth':2.44,'raise':2.58,'tilt':2.54,'turn':1.38,'wave':1.54}
MAX_UPLOAD = 80 * 1024 * 1024
ID_PATTERN = re.compile(r'^[a-f0-9]{32}$')


def hidden_process_options():
    return {'creationflags': subprocess.CREATE_NO_WINDOW} if os.name == 'nt' else {}


def clean_text(value, limit=180):
    if not isinstance(value, str):
        raise ValueError('字幕必须是文字。')
    return ''.join(c for c in value if c >= ' ' or c == '\n')[:limit]


def number(value, low, high):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError('时间或坐标无效。')
    if not low <= value <= high:
        raise ValueError('时间或坐标超出范围。')
    return float(value)


def validate_plan(payload):
    duration = number(payload.get('duration'), 0.5, 185)
    events = payload.get('events')
    if not isinstance(events, list) or not 1 <= len(events) <= 128:
        raise ValueError('需要至少一个有效动作，最多保留 128 个动作。')
    by_id = {}
    for event in events:
        if not isinstance(event, dict) or event.get('action') not in ACTION_FILES:
            raise ValueError('存在不支持的动作。')
        key = event.get('id')
        if not isinstance(key, str) or not 1 <= len(key) <= 80 or key in by_id:
            raise ValueError('动作编号重复或无效。')
        stamp = number(event.get('timeMs'), 0, duration * 1000 + 100)
        by_id[key] = {
            'id': key, 'action': event['action'], 'time': stamp / 1000,
            'actor': clean_text(event.get('actorName', '演员'), 16),
            'actorId': clean_text(event.get('actorId', event.get('actorName', '演员')), 40),
            'line': clean_text(event.get('originalLine', ''), 120),
            'focus': number(event.get('focusX', 0.5), 0, 1),
        }
        if 'clipStartMs' in event or 'clipEndMs' in event:
            start = number(event.get('clipStartMs'), 0, duration * 1000)
            end = number(event.get('clipEndMs'), 0, duration * 1000 + 100)
            if not start <= stamp < end or not 300 <= end - start <= 185000:
                raise ValueError('动作素材窗口无效。')
            by_id[key]['clipStart'] = start / 1000
            by_id[key]['clipLength'] = min(end / 1000, duration) - start / 1000
            by_id[key]['guideStep'] = clean_text(event.get('guideStep', ''), 30)
    plan = payload.get('plan')
    if not isinstance(plan, dict):
        raise ValueError('缺少剧情分镜。')
    scenes = plan.get('scenes')
    if not isinstance(scenes, list) or not 1 <= len(scenes) <= 128:
        raise ValueError('分镜数量必须为 1 至 128。')
    result = []
    selected = set()
    for scene in scenes:
        if not isinstance(scene, dict) or scene.get('eventId') not in by_id:
            raise ValueError('分镜引用了本局没有的动作。')
        if scene['eventId'] in selected:
            raise ValueError('同一动作片段不能重复使用。')
        selected.add(scene['eventId'])
        item = dict(by_id[scene['eventId']])
        item['narration'] = clean_text(scene.get('narration', ''), 120)
        item['duration'] = number(scene.get('duration', 4), 0.3, 185)
        item['effect'] = scene.get('effect') if scene.get('effect') in ('zoom', 'normal') else 'normal'
        # Never seek beyond the uploaded round, including events close to its end.
        item['start'] = item.get('clipStart', max(0, min(item['time'] - 1.0, duration - 0.3)))
        result.append(item)
    guided = bool(plan.get('guided', False))
    if guided:
        specification = payload.get('guide')
        expected = specification.get('scenes') if isinstance(specification, dict) else None
        if not isinstance(expected, list) or len(expected) != 6 or len(result) != 6:
            raise ValueError('引导拍摄需要完成六个指定分镜。')
        for step, actual in zip(expected, result):
            if (not isinstance(step, dict) or actual.get('guideStep') != step.get('id')
                    or actual['action'] != step.get('action') or actual['actorId'] != step.get('actorId')
                    or 'clipLength' not in actual):
                raise ValueError('已拍动作或演员与开拍前的剧本不一致。')
    participating = {event['actorId'] for event in by_id.values()}
    if not participating.issubset({item['actorId'] for item in result}):
        raise ValueError('分镜遗漏了本局做出有效动作的演员。')
    return {
        'title': clean_text(plan.get('title', '本场离谱小剧场'), 45),
        'opening': clean_text(plan.get('opening', ''), 100),
        'ending': clean_text(plan.get('ending', ''), 100),
        'theme': clean_text(plan.get('themeName', '破冰小剧场'), 20),
        'scenes': result, 'duration': duration,
        'music': bool(payload.get('music', True)),
        'sound': bool(payload.get('sound', True)),
        'demo': bool(payload.get('demo', False)),
        'guided': guided,
        'mode': 'full' if plan.get('exportMode') == 'full' else 'actions',
        'completeActions': plan.get('exportMode') in ('full', 'actions'),
    }


def ass_time(seconds):
    ticks = round(seconds * 100)
    return f'{ticks // 360000}:{ticks // 6000 % 60:02}:{ticks // 100 % 60:02}.{ticks % 100:02}'


def ass_text(text, width=27):
    # Neutralize ASS override codes and wrap Chinese captions without a font library.
    text = text.replace('\\', '＼').replace('{', '｛').replace('}', '｝')
    lines = []
    for paragraph in text.splitlines() or ['']:
        lines.extend(paragraph[i:i + width] for i in range(0, len(paragraph), width))
    return r'\N'.join(lines)


def prepare_full_timeline(plan):
    if plan.get('mode') != 'full':
        return
    voice_end = 0
    for scene in plan['scenes']:
        scene['soundAt'] = max(2.5 + scene['time'], voice_end + .08)
        if plan['sound']:
            voice_end = scene['soundAt'] + SOUND_LENGTHS[scene['action']]
    plan['bodyDuration'] = max(plan['duration'], voice_end - 2.5 + .15)


def write_captions(plan, target):
    prepare_full_timeline(plan)
    header = '''[Script Info]
ScriptType: v4.00+
PlayResX: 1280
PlayResY: 720
WrapStyle: 2
ScaledBorderAndShadow: yes
[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Title,Microsoft YaHei,58,&H00D9F5FF,&H000000FF,&H00282C19,&H99000000,-1,0,0,0,100,100,1,0,1,2,1,5,70,70,10,1
Style: Card,Microsoft YaHei,29,&H00FFFFFF,&H000000FF,&H00282C19,&H99000000,0,0,0,0,100,100,0,0,1,2,0,2,65,65,180,1
Style: Narration,Microsoft YaHei,35,&H00FFFFFF,&H000000FF,&H00282C19,&H88000000,-1,0,0,0,100,100,0,0,3,10,0,8,50,50,35,1
Style: Original,Microsoft YaHei,29,&H00CFF4FF,&H000000FF,&H00282C19,&H88000000,0,0,0,0,100,100,0,0,3,8,0,2,60,60,45,1
Style: Label,Microsoft YaHei,22,&H00D7E3C9,&H000000FF,&H00282C19,&H88000000,0,0,0,0,100,100,0,0,1,2,0,7,35,35,15,1
Style: Theme,Microsoft YaHei,22,&H00D7E3C9,&H000000FF,&H00282C19,&H88000000,0,0,0,0,100,100,0,0,1,2,0,9,35,35,15,1
[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
'''
    records = []
    def add(start, end, style, text):
        records.append(f'Dialogue: 0,{ass_time(start)},{ass_time(end)},{style},,0,0,0,,{ass_text(text)}')
    add(0, 2.5, 'Title', plan['title'])
    add(0, 2.5, 'Card', plan['opening'])
    cursor = 2.5
    full = plan.get('mode') == 'full'
    if full:
        header = header.replace('[Events]', 'Style: FullNarration,Microsoft YaHei,30,&H00FFFFFF,&H000000FF,&H00282C19,&H88000000,-1,0,0,0,100,100,0,0,3,6,0,8,60,60,560,1\n[Events]')
        for index, scene in enumerate(plan['scenes']):
            start = scene.get('soundAt', 2.5 + scene['time'])
            end = min(2.5 + plan['bodyDuration'], start + max(2.5, SOUND_LENGTHS[scene['action']]))
            add(start, end, 'FullNarration', scene['narration'])
            add(start, end, 'Original', '现场原台词 · ' + scene['actor'] + '\n' + scene['line'])
            add(start, end, 'Label', f"动作 {index + 1} / {len(plan['scenes'])}")
        cursor += plan['bodyDuration']
    else:
        for index, scene in enumerate(plan['scenes']):
            end = cursor + scene['duration']
            add(cursor, end, 'Narration', scene['narration'])
            add(cursor, end, 'Original', '现场原台词 · ' + scene['actor'] + '\n' + scene['line'])
            add(cursor, end, 'Label', f"第 {index + 1} 幕 / {len(plan['scenes'])} 幕")
            cursor = end
    add(cursor, cursor + 2.5, 'Title', '本场，全员有戏')
    add(cursor, cursor + 2.5, 'Card', plan['ending'])
    add(0, cursor + 2.5, 'Theme', ('示例演出 · ' if plan['demo'] else '') + plan['theme'])
    target.write_text(header + '\n'.join(records) + '\n', encoding='utf-8-sig')
    return cursor + 2.5


def write_music(target, seconds=8):
    """Original generated accompaniment. No external music recording is included."""
    import array
    sample_rate = 22050
    melody = [261.63, 329.63, 392, 329.63, 293.66, 349.23, 440, 392,
              261.63, 392, 329.63, 493.88, 440, 349.23, 293.66, 392]
    samples = array.array('h')
    for i in range(round(seconds * sample_rate)):
        t = i / sample_rate
        local = t % 0.5
        freq = melody[int(t / 0.5) % len(melody)]
        envelope = min(local / 0.015, 1) * math.exp(-local * 8)
        note = math.sin(2 * math.pi * freq * local) + 0.25 * math.sin(4 * math.pi * freq * local)
        bass = math.sin(2 * math.pi * (130.81 if int(t / 2) % 2 == 0 else 146.83) * t)
        samples.append(int(9000 * envelope * note + 1600 * bass))
    if os.sys.byteorder != 'little':
        samples.byteswap()
    with wave.open(str(target), 'wb') as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(sample_rate)
        output.writeframes(samples.tobytes())


class MovieManager:
    def __init__(self, root):
        self.root = Path(root).resolve()
        self.storage = self.root / '_shortfilm_data'
        self.storage.mkdir(exist_ok=True)
        self.records = {}
        self.jobs = {}
        self.lock = threading.RLock()
        self.pool = concurrent.futures.ThreadPoolExecutor(max_workers=1)
        self.ffmpeg = None
        self.tool_state = 'checking'
        self.tool_error = ''

    def prepare_tool(self, download=True):
        try:
            from movie_tools import ensure_ffmpeg
            self.tool_state = 'preparing'
            self.ffmpeg = ensure_ffmpeg(self.root, download=download)
            self.tool_state = 'ready'
        except Exception as error:
            self.tool_state = 'error'
            self.tool_error = str(error)

    def health(self):
        return {'state': self.tool_state, 'ready': bool(self.ffmpeg),
                'message': self.tool_error, 'maxSeconds': 180, 'maxUploadBytes': MAX_UPLOAD}

    def create_job(self, payload):
        if not self.ffmpeg:
            raise ValueError('视频工具尚未就绪。' + self.tool_error)
        record_id = payload.get('recordingId', '')
        if not isinstance(record_id, str) or record_id not in self.records:
            raise ValueError('录制素材不存在，请重新上传本局素材。')
        plan = validate_plan(payload)
        with self.lock:
            if sum(j['state'] in ('queued', 'rendering') for j in self.jobs.values()) >= 2:
                raise ValueError('已有短片正在生成，请稍后再试。')
            job_id = uuid.uuid4().hex
            folder = self.storage / job_id
            folder.mkdir()
            job = {'id': job_id, 'state': 'queued', 'progress': 0,
                   'message': '等待剪辑', 'cancel': threading.Event(), 'folder': folder,
                   'plan': plan, 'source': self.records[record_id], 'process': None}
            self.jobs[job_id] = job
        self.pool.submit(self.render, job)
        return job_id

    def public_job(self, job_id):
        job = self.jobs.get(job_id)
        if not job:
            return None
        return {k: job[k] for k in ('id', 'state', 'progress', 'message')}

    def run(self, job, arguments, timeout=180):
        if job['cancel'].is_set():
            raise InterruptedError('已取消生成。')
        command = [str(self.ffmpeg), '-hide_banner', '-loglevel', 'error', '-y', '-threads', '2'] + arguments
        process = subprocess.Popen(command, cwd=str(job['folder']), stdout=subprocess.PIPE,
                                   stderr=subprocess.PIPE, **hidden_process_options())
        with self.lock:
            job['process'] = process
        try:
            if job['cancel'].is_set():
                process.terminate()
            try:
                _, stderr = process.communicate(timeout=timeout)
            except subprocess.TimeoutExpired:
                process.kill()
                process.communicate()
                raise RuntimeError('视频处理超时，请减少录制时长后重试。')
            if job['cancel'].is_set():
                raise InterruptedError('已取消生成。')
            if process.returncode:
                detail = stderr.decode('utf-8', errors='replace')[-3000:]
                (job['folder'] / 'render-error.txt').write_text(detail, encoding='utf-8')
                raise RuntimeError('视频处理失败，详情已保存到本地 render-error.txt。')
        finally:
            with self.lock:
                job['process'] = None

    def render(self, job):
        try:
            job.update(state='rendering', progress=3, message='整理本局素材')
            folder, plan = job['folder'], job['plan']
            full = plan.get('mode') == 'full'
            total = write_captions(plan, folder / 'captions.ass')
            plan['outputDuration'] = total
            (folder / 'story.json').write_text(json.dumps(plan, ensure_ascii=False, indent=2), encoding='utf-8')
            encode = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p', '-r', '24', '-an']
            # Browser WebM can have variable timestamps and no seek index. Normalize once
            # so the last shot and all later subtitle times remain frame-aligned.
            job.update(progress=5, message='校准录制时间，整理动作画面')
            self.run(job, ['-i', str(job['source']), '-vf',
                           'setpts=PTS-STARTPTS,fps=24,scale=960:540,tpad=stop_mode=clone:stop_duration=185',
                           '-frames:v', str(round(plan['duration'] * 24))] + encode + ['source-cfr.mp4'])
            segments = []
            for name, duration in [('opening', 2.5), ('ending', 2.5)]:
                self.run(job, ['-f', 'lavfi', '-i', f'color=c=0x293826:s=1280x720:r=24:d={duration}',
                               '-t', str(duration)] + encode + [name + '.mp4'])
            segments.append('opening.mp4')
            if full:
                self.run(job, ['-i', 'source-cfr.mp4', '-vf',
                    f"scale=854:480,pad=1280:720:213:70:color=0xdce5c9,tpad=stop_mode=clone:stop_duration={plan['bodyDuration']},trim=duration={plan['bodyDuration']},setpts=PTS-STARTPTS",
                    '-t', str(plan['bodyDuration'])] + encode + ['full-process.mp4'])
                segments.append('full-process.mp4')
            for index, scene in enumerate([] if full else plan['scenes']):
                job.update(progress=8 + int(index / len(plan['scenes']) * 55),
                           message=f"剪辑第 {index + 1} / {len(plan['scenes'])} 个动作镜头")
                filters = 'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2'
                if plan.get('completeActions'):
                    filters = 'scale=854:480,pad=1280:720:213:70:color=0xdce5c9'
                if 'clipLength' in scene:
                    filters = f"trim=duration={scene['clipLength']},setpts=PTS-STARTPTS," + filters
                if scene['effect'] == 'zoom':
                    x = round(scene['focus'] * 128)
                    filters += f',scale=1408:792,crop=1280:720:{x}:36'
                frames = round(scene['duration'] * 24)
                filters += ',setpts=PTS-STARTPTS,fps=24,tpad=stop_mode=clone:stop_duration=10'
                if scene['effect'] == 'zoom':
                    filters += f',trim=end_frame={frames-12},tpad=stop_mode=clone:stop_duration=0.5'
                # Cut directly between shots. Per-shot fades through black caused
                # visible flashes at every edit, even with captions still on screen.
                filters += f',trim=end_frame={frames},setpts=N/(24*TB)'
                filename = f'scene-{index:02}.mp4'
                self.run(job, ['-ss', str(round(scene['start'], 3)), '-i', 'source-cfr.mp4',
                               '-vf', filters, '-frames:v', str(frames)] + encode + [filename])
                segments.append(filename)
            segments.append('ending.mp4')
            (folder / 'segments.txt').write_text(''.join(f"file '{name}'\n" for name in segments), encoding='ascii')
            job.update(progress=68, message='连接剧情镜头')
            self.run(job, ['-f', 'concat', '-safe', '1', '-i', 'segments.txt', '-c', 'copy', 'picture.mp4'])
            job.update(progress=76, message='添加旁白字幕、原台词和音效')
            write_music(folder / 'music.wav')
            args = ['-i', 'picture.mp4', '-stream_loop', '-1', '-i', 'music.wav']
            volume = '0.07' if plan['music'] else '0'
            filters = [f'[1:a]atrim=duration={total},asetpts=PTS-STARTPTS,volume={volume},afade=t=out:st={total-1}:d=1[music]']
            mixes = ['[music]']
            cursor = 2.5
            if plan['sound']:
                for index, scene in enumerate(plan['scenes']):
                    sound = self.root / 'assets' / 'sounds' / ACTION_FILES[scene['action']]
                    args += ['-i', str(sound)]
                    offset = max(0, scene['time'] - scene['start'])
                    delay = round((scene['soundAt'] if full else cursor + offset) * 1000)
                    filters.append(f'[{index+2}:a]asetpts=PTS-STARTPTS,volume=0.85,adelay={delay}|{delay}[s{index}]')
                    mixes.append(f'[s{index}]')
                    cursor += scene['duration']
            filters.append(''.join(mixes) + f'amix=inputs={len(mixes)}:duration=first:normalize=0,alimiter=limit=0.95[audio]')
            filters.append("[0:v]subtitles=filename=captions.ass[vout]")
            args += ['-filter_complex', ';'.join(filters), '-map', '[vout]', '-map', '[audio]',
                     '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-pix_fmt', 'yuv420p',
                     '-c:a', 'aac', '-b:a', '160k', '-t', str(total), '-movflags', '+faststart', 'movie.mp4']
            self.run(job, args, timeout=300)
            job.update(state='done', progress=100, message='短片已生成，可以预览和下载')
        except InterruptedError:
            job.update(state='cancelled', message='已取消生成')
        except Exception as error:
            job.update(state='error', message=str(error))

    def cancel(self, job_id):
        with self.lock:
            job = self.jobs.get(job_id)
            if job and job['state'] in ('queued', 'rendering'):
                job['cancel'].set()
                if job['process'] and job['process'].poll() is None:
                    job['process'].terminate()


class MovieHandler(http.server.SimpleHTTPRequestHandler):
    manager = None

    def send_json(self, status, data):
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def local_request(self):
        allowed = {f'127.0.0.1:{self.server.server_port}', f'localhost:{self.server.server_port}'}
        if self.headers.get('Host') not in allowed:
            return False
        origin = self.headers.get('Origin')
        return not origin or origin in {'http://' + host for host in allowed}

    def do_GET(self):
        path = urlparse(self.path).path
        if not self.local_request():
            self.send_error(403)
            return
        if path == '/api/movie-health':
            self.send_json(200, self.manager.health())
            return
        match = re.fullmatch(r'/api/movie-jobs/([a-f0-9]{32})(/video|/story)?', path)
        if match:
            job_id, kind = match.groups()
            public = self.manager.public_job(job_id)
            if not public:
                self.send_json(404, {'error': '生成任务不存在。'})
            elif not kind:
                self.send_json(200, public)
            elif public['state'] != 'done':
                self.send_json(409, {'error': '短片尚未生成。'})
            else:
                job = self.manager.jobs[job_id]
                name = 'movie.mp4' if kind == '/video' else 'story.json'
                self.send_result(job['folder'] / name, name)
            return
        # Uploaded recordings are accessible only to known rendering jobs.
        translated = Path(self.translate_path(path)).resolve()
        if self.manager.storage == translated or self.manager.storage in translated.parents:
            self.send_error(404)
            return
        super().do_GET()

    def do_HEAD(self):
        if not self.local_request():
            self.send_error(403)
            return
        translated = Path(self.translate_path(urlparse(self.path).path)).resolve()
        if self.manager.storage == translated or self.manager.storage in translated.parents:
            self.send_error(404)
            return
        super().do_HEAD()

    def send_result(self, path, filename):
        size = path.stat().st_size
        start, end, partial = 0, size - 1, False
        range_value = self.headers.get('Range')
        if range_value:
            match = re.fullmatch(r'bytes=(\d*)-(\d*)', range_value)
            if not match or not any(match.groups()):
                self.send_error(416)
                return
            left, right = match.groups()
            if left:
                start = int(left)
                end = min(int(right), size - 1) if right else size - 1
            else:
                start = max(0, size - int(right))
            if start >= size or start > end:
                self.send_response(416)
                self.send_header('Content-Range', f'bytes */{size}')
                self.end_headers()
                return
            partial = True
        self.send_response(206 if partial else 200)
        self.send_header('Content-Type', 'video/mp4' if filename.endswith('.mp4') else 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(end - start + 1))
        self.send_header('Accept-Ranges', 'bytes')
        self.send_header('Content-Disposition', "inline; filename*=UTF-8''" + quote(filename))
        if partial:
            self.send_header('Content-Range', f'bytes {start}-{end}/{size}')
        self.end_headers()
        try:
            with path.open('rb') as source:
                source.seek(start)
                remaining = end - start + 1
                while remaining:
                    data = source.read(min(256 * 1024, remaining))
                    if not data:
                        break
                    self.wfile.write(data)
                    remaining -= len(data)
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            pass

    def do_POST(self):
        if not self.local_request():
            self.send_json(403, {'error': '仅接受本地网页的请求。'})
            return
        path = urlparse(self.path).path
        try:
            length = int(self.headers.get('Content-Length', '0'))
            limit = MAX_UPLOAD if path == '/api/movie-recordings' else 256 * 1024
            if not 0 < length <= limit:
                self.send_json(413, {'error': '素材过大或请求为空，请缩短本局录制。'})
                return
            if path == '/api/movie-recordings':
                content_type = self.headers.get('Content-Type', '').split(';')[0]
                if content_type not in ('video/webm', 'video/mp4'):
                    raise ValueError('仅接受浏览器录制的 WebM 或 MP4。')
                record_id = uuid.uuid4().hex
                folder = self.manager.storage / record_id
                folder.mkdir()
                target = folder / ('source.webm' if content_type == 'video/webm' else 'source.mp4')
                remaining = length
                self.connection.settimeout(60)
                with target.open('wb') as output:
                    while remaining:
                        chunk = self.rfile.read(min(256 * 1024, remaining))
                        if not chunk:
                            raise ValueError('素材上传中断，请重试。')
                        output.write(chunk)
                        remaining -= len(chunk)
                self.manager.records[record_id] = target
                self.send_json(201, {'recordingId': record_id})
            elif path == '/api/movie-jobs':
                payload = json.loads(self.rfile.read(length).decode('utf-8'))
                if not isinstance(payload, dict):
                    raise ValueError('生成参数无效。')
                job_id = self.manager.create_job(payload)
                self.send_json(202, {'id': job_id})
            elif re.fullmatch(r'/api/movie-jobs/[a-f0-9]{32}/cancel', path):
                self.rfile.read(length)
                self.manager.cancel(path.split('/')[3])
                self.send_json(200, {'cancelled': True})
            else:
                self.send_json(404, {'error': '接口不存在。'})
        except (ValueError, KeyError, TypeError, UnicodeDecodeError) as error:
            self.send_json(400, {'error': str(error) or '请求参数无效。'})
        except Exception:
            self.send_json(500, {'error': '本地文件处理失败，请检查磁盘空间和文件夹权限。'})
