import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

SPEC = importlib.util.spec_from_file_location('movie_server', Path(__file__).resolve().parents[1] / 'movie_server.py')
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def fixture():
    return {'duration': 10, 'events': [
        {'id': 'a', 'action': 'turn', 'timeMs': 1000, 'actorName': '甲', 'originalLine': '这是原句', 'focusX': .3},
        {'id': 'b', 'action': 'mouth', 'timeMs': 9900, 'actorName': '乙', 'originalLine': '这是另一个原句', 'focusX': .7}],
        'plan': {'title': '相亲现场', 'opening': '开场', 'ending': '结束', 'themeName': '离谱相亲',
                 'scenes': [{'eventId': 'a', 'duration': 4, 'narration': '剧情一'},
                            {'eventId': 'b', 'duration': 4, 'narration': '剧情二'}]}}


class PlanTests(unittest.TestCase):
    def test_original_captions_and_audio_actions_are_read_from_events(self):
        data = fixture()
        data['plan']['scenes'][0].update(originalLine='伪造字幕', action='head')
        plan = MODULE.validate_plan(data)
        self.assertEqual(plan['scenes'][0]['line'], '这是原句')
        self.assertEqual(plan['scenes'][0]['action'], 'turn')

    def test_last_shot_seek_stays_within_recording(self):
        plan = MODULE.validate_plan(fixture())
        self.assertLess(plan['scenes'][-1]['start'], plan['duration'])

    def test_nonexistent_event_cannot_be_used(self):
        data = fixture()
        data['plan']['scenes'][0]['eventId'] = 'missing'
        with self.assertRaises(ValueError):
            MODULE.validate_plan(data)

    def test_actor_cannot_be_silently_omitted(self):
        data = fixture()
        data['plan']['scenes'].pop()
        with self.assertRaisesRegex(ValueError, '遗漏'):
            MODULE.validate_plan(data)

    def test_duplicate_event_cannot_be_replayed_as_a_new_action(self):
        data = fixture()
        data['plan']['scenes'][1]['eventId'] = 'a'
        with self.assertRaisesRegex(ValueError, '重复'):
            MODULE.validate_plan(data)

    def test_nonfinite_and_out_of_range_values_rejected(self):
        for value in [float('nan'), float('inf'), -1, 1000, True]:
            with self.subTest(value=value):
                data = fixture()
                data['duration'] = value
                with self.assertRaises(ValueError):
                    MODULE.validate_plan(data)

    def test_ass_override_sequences_cannot_change_caption_format(self):
        result = MODULE.ass_text(r'{\pos(0,0)}测试')
        self.assertNotIn('{', result)
        self.assertNotIn(r'\pos', result)

    def test_caption_timeline_keeps_both_narration_and_original(self):
        with tempfile.TemporaryDirectory() as folder:
            target = Path(folder) / 'captions.ass'
            total = MODULE.write_captions(MODULE.validate_plan(fixture()), target)
            self.assertAlmostEqual(total, 13)
            text = target.read_text(encoding='utf-8-sig')
            self.assertIn('现场原台词', text)
            self.assertIn('这是原句', text)
            self.assertIn('剧情一', text)

    def test_generated_music_is_a_valid_pcm_wave(self):
        with tempfile.TemporaryDirectory() as folder:
            target = Path(folder) / 'music.wav'
            MODULE.write_music(target, seconds=.1)
            self.assertEqual(target.read_bytes()[:4], b'RIFF')

    def test_guided_clips_keep_only_the_confirmed_action_window(self):
        data = fixture()
        data['events'][0].update(clipStartMs=750, clipEndMs=2800, guideStep='guide-0')
        scene = MODULE.validate_plan(data)['scenes'][0]
        self.assertEqual(scene['start'], .75)
        self.assertAlmostEqual(scene['clipLength'], 2.05)

    def test_invalid_action_window_is_rejected(self):
        for start, end in [(2000, 3000), (750, 900), (0, 9000), (-1, 2800)]:
            data = fixture()
            data['events'][0].update(clipStartMs=start, clipEndMs=end, guideStep='guide-0')
            with self.subTest(start=start, end=end), self.assertRaises(ValueError):
                MODULE.validate_plan(data)

    def test_incomplete_guided_story_cannot_be_exported(self):
        data = fixture()
        data['plan']['guided'] = True
        data['guide'] = {'scenes': []}
        with self.assertRaisesRegex(ValueError, '六个指定分镜'):
            MODULE.validate_plan(data)

    def test_guided_export_checks_each_planned_actor_and_action(self):
        data = {'duration': 30, 'events': [], 'guide': {'scenes': []},
                'plan': {'guided': True, 'scenes': []}}
        for index, action in enumerate(['turn', 'wave', 'mouth', 'head', 'forehead', 'arms']):
            stamp = (index * 4 + 2) * 1000
            data['events'].append({'id': 'e' + str(index), 'action': action, 'timeMs': stamp,
                                   'actorId': 'actor-0', 'actorName': '甲', 'originalLine': '原句',
                                   'clipStartMs': stamp - 250, 'clipEndMs': stamp + 1800,
                                   'guideStep': 'guide-' + str(index)})
            data['guide']['scenes'].append({'id': 'guide-' + str(index), 'action': action, 'actorId': 'actor-0'})
            data['plan']['scenes'].append({'eventId': 'e' + str(index), 'duration': 4, 'narration': '剧情'})
        self.assertTrue(MODULE.validate_plan(data)['guided'])
        data['guide']['scenes'][2]['actorId'] = 'actor-1'
        with self.assertRaisesRegex(ValueError, '不一致'):
            MODULE.validate_plan(data)


if __name__ == '__main__':
    unittest.main()
