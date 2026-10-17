"""Regression checks for safe Chromium PAK edits; no browser/profile required."""
import gzip
import struct
import unittest
import ntp_night_train_patch as p


class NightTrainPatchTests(unittest.TestCase):
    def old_js(self):
        return (p.CSS_FROM + 'old stylesheet' + p.CSS_TO + '\n' +
                p.HTML_FROM + '>old markup' + p.HTML_TO + '\n' +
                p.CLOCK_TIMER + '\n' + p.SCENE_ANCHOR)

    def pack(self, js):
        # Three resources, including an unrelated compressed one and an alias.
        resources = [(1, b'untouched'), (2, gzip.compress(js.encode(), mtime=0)),
                     (3, gzip.compress(b'unrelated JavaScript', mtime=0))]
        return p.write_pak(struct.pack('<IB3x', 5, 1), resources,
                           struct.pack('<HH', 8, 0))

    def test_only_new_tab_resource_changes(self):
        original = self.pack(self.old_js())
        patched, rid = p.build_new_pak(original)
        self.assertEqual(rid, 2)
        h1, r1, a1 = p.read_pak(original)
        h2, r2, a2 = p.read_pak(patched)
        self.assertEqual((h1, a1), (h2, a2))
        self.assertEqual(r1[0], r2[0])
        self.assertEqual(r1[2], r2[2])
        js = gzip.decompress(r2[1][1]).decode()
        self.assertEqual(js.count('class="carriage-window"'), 4)
        self.assertNotIn(p.CLOCK_TIMER, js)
        self.assertIn(p.SCENE_JS, js)
        self.assertIn('prefers-reduced-motion', js)
        self.assertEqual(p.build_new_pak(patched), (None, 2))

    def test_missing_or_duplicate_anchors_fail(self):
        for js in [self.old_js().replace(p.CLOCK_TIMER, ''),
                   self.old_js() + p.SCENE_ANCHOR]:
            with self.subTest(js=js), self.assertRaises(p.Stop):
                p.build_new_pak(self.pack(js))

    def test_truncated_pak_fails(self):
        original = self.pack(self.old_js())
        for invalid in [b'', original[:11], original[:30], original[:-1]]:
            with self.subTest(length=len(invalid)), self.assertRaises(p.Stop):
                p.build_new_pak(invalid)

    def test_no_target_fails(self):
        with self.assertRaises(p.Stop):
            p.build_new_pak(self.pack('different new tab implementation'))


if __name__ == '__main__':
    unittest.main()
