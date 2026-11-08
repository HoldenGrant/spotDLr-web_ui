import unittest
from unittest import mock

import ytmusic

# Spotify and YouTube Music often write a Japanese, Chinese or Korean song in different scripts ("Lemon" by 米津玄師 on
# Spotify, "Lemon" by Kenshi Yonezu on YouTube Music). Comparing letters then says "different song", so those songs could
# not be downloaded from Spotify. The results below are what YouTube Music really returned for each song.


def result(video_id, title, artist, seconds):
    names = [artist] if isinstance(artist, str) else artist  # YouTube Music lists each artist on its own
    return {"videoId": video_id, "title": title, "artists": [{"name": n} for n in names], "duration_seconds": seconds}


def match(name, artists, ms, *searches):
    """match_song against canned YouTube Music results: one list per search it makes."""
    client = mock.Mock()
    client.search.side_effect = list(searches) + [[]] * 3
    with mock.patch.object(ytmusic, "_client", return_value=client):
        return ytmusic.match_song(name, artists, ms)


class MatchSongTests(unittest.TestCase):
    def test_a_title_in_english_matches_the_same_song_written_in_japanese(self):
        found = match("Idol", ["YOASOBI"], 213000, [result("cover", "Idol", "Hikarin", 190), result("official", "アイドル", "YOASOBI", 214)])
        self.assertEqual(found["videoId"], "official")

    def test_a_chinese_song_named_in_english_matches_by_length_and_rank(self):
        found = match("Sunny Day", ["Jay Chou"], 269000, [result("official", "晴天", "周杰倫", 270), result("other", "A Sunny Day", "Various", 180)])
        self.assertEqual(found["videoId"], "official")

    def test_an_artist_written_in_japanese_matches_the_same_artist_in_english(self):
        found = match("Lemon", ["米津玄師"], 255000, [result("official", "Lemon", "Kenshi Yonezu", 257), result("karaoke", "Lemon (Karaoke)", "Sing King", 258)])
        self.assertEqual(found["videoId"], "official")

    def test_a_compilation_upload_loses_to_the_artists_own_song(self):
        found = match("좋은 날", ["아이유"], 233000, [result("compilation", "좋은날", "Various Artists", 234), result("official", "Good day (좋은 날)", "IU", 236)])
        self.assertEqual(found["videoId"], "official")

    def test_same_script_songs_still_match_as_before(self):
        found = match("Spring Day", ["BTS"], 274000, [result("official", "Spring Day", "BTS", 275)])
        self.assertEqual(found["videoId"], "official")

    def test_when_the_letters_cannot_be_compared_a_different_length_is_not_accepted(self):
        # a 3-minute song is not the 4-minute one, whatever the search ranked first
        self.assertIsNone(match("Idol", ["YOASOBI"], 60000, [result("official", "アイドル", "YOASOBI", 214)], [result("official", "アイドル", "YOASOBI", 214)]))

    def test_a_song_that_is_not_there_finds_nothing(self):
        self.assertIsNone(match("Zzzq Xqwv", ["Nobody Atall"], 200000, [result("x", "Something Else Entirely", "Someone", 200)], []))

    def test_a_second_search_by_title_alone_rescues_a_missed_first_one(self):
        found = match("晴天", ["周杰伦"], 269000, [result("wrong", "Unrelated", "Other", 100)], [result("official", "晴天", "周杰倫", 270)])
        self.assertEqual(found["videoId"], "official")

    def test_a_sped_up_or_remixed_version_is_still_kept_out(self):
        self.assertIsNone(match("Spring Day", ["BTS"], 274000, [result("sped", "Spring Day (Sped Up)", "BTS", 220)], [result("sped", "Spring Day (Sped Up)", "BTS", 220)]))
        self.assertIsNone(match("Spring Day", ["BTS"], 274000, [result("remix", "Spring Day (Club Remix)", "BTS", 330)], [result("remix", "Spring Day (Club Remix)", "BTS", 330)]))

    def test_an_exact_title_and_artist_still_matches_when_the_length_differs_a_little(self):
        # as before: a longer upload of the same song (an intro, say) is the song
        found = match("Spring Day", ["BTS"], 274000, [result("longer", "Spring Day", "BTS", 290)])
        self.assertEqual(found["videoId"], "longer")

    def test_a_native_and_romanized_title_matches_either_half(self):
        # YouTube Music writes many Japanese releases as "シンプル・ラブ - Simple Love"
        found = match("シンプル・ラブ", ["Junko Ohashi"], 240000, [result("official", "シンプル・ラブ - Simple Love", ["Junko Ohashi", "Minoya Central Station"], 226)])
        self.assertEqual(found["videoId"], "official")
        found = match("Simple Love", ["Junko Ohashi"], 226000, [result("official", "シンプル・ラブ - Simple Love", ["Junko Ohashi", "Minoya Central Station"], 226)])
        self.assertEqual(found["videoId"], "official")

    def test_another_song_by_the_same_artist_is_not_taken_for_one_that_cannot_be_compared(self):
        # a different Junko Ohashi song, far down the results, of nearly the same length
        others = [result(f"o{i}", f"Other Song {i}", "Junko Ohashi", 100 + i * 7) for i in range(6)]
        found = match("シンプル・ラブ", ["Junko Ohashi"], 240000, others + [result("mister", "Mister Smile", "Junko Ohashi", 242)], [])
        self.assertIsNone(found)

    def test_scripts_are_told_apart(self):
        self.assertFalse(ytmusic._comparable("Idol", "アイドル"))
        self.assertFalse(ytmusic._comparable("米津玄師", "Kenshi Yonezu"))
        self.assertTrue(ytmusic._comparable("周杰伦", "周杰倫"))     # simplified and traditional Chinese share characters
        self.assertTrue(ytmusic._comparable("夜に駆ける", "晴天"))   # kana and Chinese characters are one Japanese text
        self.assertTrue(ytmusic._comparable("Track 1", "Track 2"))
        self.assertTrue(ytmusic._comparable("1999", "Idol"))        # digits alone say nothing


if __name__ == "__main__":
    unittest.main()
