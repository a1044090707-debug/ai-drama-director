"""Optional real encoding regression test. Requires prepared tools/ffmpeg."""
import json
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import time
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from movie_server import MovieManager
from movie_tools import ensure_ffmpeg


class RenderTests(unittest.TestCase):
    def test_full_process_keeps_late_frames_and_complete_speech(self):
        try:
            executable = ensure_ffmpeg(ROOT, download=False)
        except RuntimeError:
            self.skipTest('FFmpeg is required.')
        manager = MovieManager(ROOT)
        manager.ffmpeg = executable
        try:
            with tempfile.TemporaryDirectory(dir=str(manager.storage)) as temporary:
                source = Path(temporary) / 'full-source.mp4'
                subprocess.run([str(executable), '-v', 'error', '-f', 'lavfi', '-i', 'color=blue:s=960x540:r=24:d=4',
                    '-f', 'lavfi', '-i', 'color=red:s=960x540:r=24:d=4', '-filter_complex',
                    '[0:v][1:v]concat=n=2:v=1:a=0[v]', '-map', '[v]', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', str(source)],check=True,capture_output=True)
                manager.records['full'] = source
                job_id = manager.create_job({'recordingId':'full','duration':8,'sound':True,'music':False,
                    'events':[{'id':'late','action':'handsup','timeMs':7500,'actorName':'甲'}],
                    'plan':{'exportMode':'full','title':'完整过程','scenes':[{'eventId':'late','duration':5.4,'narration':'后段动作'}]}})
                deadline=time.time()+120
                while manager.jobs[job_id]['state'] in ('queued','rendering') and time.time()<deadline:
                    time.sleep(.2)
                self.assertEqual(manager.jobs[job_id]['state'],'done',manager.public_job(job_id))
                movie=manager.jobs[job_id]['folder']/'movie.mp4'
                pixels=subprocess.run([str(executable),'-v','error','-ss','9.5','-i',str(movie),'-frames:v','1','-vf',
                    'format=rgb24,crop=1:1:640:300','-f','rawvideo','-pix_fmt','rgb24','-'],capture_output=True,check=True).stdout
                self.assertGreater(pixels[0],pixels[2]+100)
                pcm=subprocess.run([str(executable),'-v','error','-ss','14','-i',str(movie),'-t','0.35','-vn','-f','f32le','-ac','1','-'],capture_output=True,check=True).stdout
                import array,math
                values=array.array('f');values.frombytes(pcm)
                self.assertGreater(math.sqrt(sum(x*x for x in values)/len(values)),.001)
        finally:
            manager.pool.shutdown(wait=True)

    def test_action_window_excludes_preparation_and_waiting_frames(self):
        try:
            executable = ensure_ffmpeg(ROOT, download=False)
        except RuntimeError:
            self.skipTest('Run python movie_tools.py to prepare FFmpeg first.')
        manager = MovieManager(ROOT)
        manager.ffmpeg = executable
        with tempfile.TemporaryDirectory(dir=str(manager.storage)) as temporary:
            source = Path(temporary) / 'window.mp4'
            command = [str(executable), '-v', 'error', '-f', 'lavfi', '-i', 'color=red:s=960x540:r=24:d=3',
                       '-f', 'lavfi', '-i', 'color=green:s=960x540:r=24:d=2',
                       '-f', 'lavfi', '-i', 'color=red:s=960x540:r=24:d=3',
                       '-filter_complex', '[0:v][1:v][2:v]concat=n=3:v=1:a=0[v]', '-map', '[v]',
                       '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', str(source)]
            subprocess.run(command, check=True, capture_output=True)
            manager.records['window'] = source
            job_id = manager.create_job({'recordingId': 'window', 'duration': 8, 'sound': False, 'music': False,
                'events': [{'id': 'action', 'action': 'mouth', 'actorName': '甲', 'timeMs': 3250,
                            'clipStartMs': 3000, 'clipEndMs': 5000, 'guideStep': 'guide-0'}],
                'plan': {'scenes': [{'eventId': 'action', 'duration': 4}]}})
            deadline = time.time() + 120
            while manager.jobs[job_id]['state'] in ('queued', 'rendering') and time.time() < deadline:
                time.sleep(.2)
            self.assertEqual(manager.jobs[job_id]['state'], 'done', manager.public_job(job_id))
            scene = manager.jobs[job_id]['folder'] / 'scene-00.mp4'
            pixels = subprocess.run([str(executable), '-v', 'error', '-i', str(scene), '-vf', 'scale=1:1',
                                     '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], capture_output=True, check=True).stdout
            self.assertEqual(len(pixels), 96 * 3)
            self.assertTrue(all(pixels[i] < 25 and pixels[i+1] > 70 and pixels[i+2] < 25
                                for i in range(0, len(pixels), 3)), 'Waiting frames leaked into the action shot.')
        manager.pool.shutdown(wait=True)

    def test_shot_cuts_have_no_black_frames_and_late_events_keep_exact_duration(self):
        try:
            executable = ensure_ffmpeg(ROOT, download=False)
        except RuntimeError:
            self.skipTest('Run python movie_tools.py to prepare FFmpeg first.')
        manager = MovieManager(ROOT)
        manager.ffmpeg = executable
        with tempfile.TemporaryDirectory(dir=str(manager.storage)) as temporary:
            folder = Path(temporary)
            source = folder / 'test.webm'
            subprocess.run([str(executable), '-v', 'error', '-f', 'lavfi', '-i',
                            'testsrc2=s=960x540:r=12:d=5', '-c:v', 'libvpx', '-b:v', '600k',
                            str(source)], check=True, capture_output=True)
            manager.records['fixture'] = source
            event = {'id': 'last', 'action': 'head', 'timeMs': 4900,
                     'actorName': '演员甲', 'originalLine': '保留原台词', 'focusX': .5}
            earlier = dict(event, id='earlier', action='turn', timeMs=1000)
            job_id = manager.create_job({'recordingId': 'fixture', 'duration': 5,
                                        'events': [earlier, event], 'music': False, 'sound': False,
                                        'plan': {'title': '尾部动作检查', 'opening': '测试开场',
                                                 'ending': '测试结束', 'scenes': [
                                                     {'eventId': 'earlier', 'duration': 4, 'effect': 'normal', 'narration': '前一个动作镜头'},
                                                     {'eventId': 'last', 'duration': 4, 'effect': 'zoom', 'narration': '这是剧情字幕'}]}})
            deadline = time.time() + 120
            while manager.jobs[job_id]['state'] in ('queued', 'rendering') and time.time() < deadline:
                time.sleep(.2)
            self.assertEqual(manager.jobs[job_id]['state'], 'done', manager.public_job(job_id))
            output = manager.jobs[job_id]['folder'] / 'movie.mp4'
            result = subprocess.run([str(executable), '-hide_banner', '-i', str(output),
                                     '-map', '0:v:0', '-c', 'copy', '-f', 'null', '-'], capture_output=True)
            log = result.stderr.decode('utf-8', errors='replace')
            self.assertIn('1280x720', log)
            self.assertIn('h264', log)
            self.assertIn('aac', log)
            frames = int(re.findall(r'frame=\s*(\d+)', log)[-1])
            self.assertEqual(frames, 13 * 24, log)
            # Check the encoded pixels, including the cut between a normal shot
            # and a zoom/freeze shot. A source-code check would miss encoder faults.
            checked = subprocess.run([str(executable), '-hide_banner', '-i', str(output),
                                      '-vf', 'blackdetect=d=0.02:pix_th=0.10:pic_th=0.90',
                                      '-an', '-f', 'null', '-'], capture_output=True)
            self.assertEqual(checked.returncode, 0)
            self.assertNotIn('black_start:', checked.stderr.decode('utf-8', errors='replace'))
        manager.pool.shutdown(wait=True)


if __name__ == '__main__':
    unittest.main()
