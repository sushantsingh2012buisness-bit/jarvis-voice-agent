import sys
import unittest
from pathlib import Path
from unittest.mock import Mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "stack" / "backtalk"))

from backtalk.gesture_mode import (  # noqa: E402
    GESTURE_BOARD_URL,
    is_gesture_mode_on,
    open_gesture_board,
)
from backtalk.wake import WakeGate  # noqa: E402


class GestureModeTests(unittest.TestCase):
    def test_explicit_phrases_match(self):
        for phrase in (
            "gesture mode on",
            "turn gesture mode on!",
            "enable gesture-mode",
            "open the gesture board",
        ):
            with self.subTest(phrase=phrase):
                self.assertTrue(is_gesture_mode_on(phrase))

    def test_wake_phrase_passes_following_command(self):
        gate = WakeGate()
        self.assertEqual(gate.accept("Hey Jarvis"), "")
        self.assertEqual(gate.accept("gesture mode on"), "gesture mode on")

    def test_unrelated_conversation_does_not_match(self):
        self.assertFalse(is_gesture_mode_on("How does gesture mode work?"))
        self.assertFalse(is_gesture_mode_on("Open the browser"))

    def test_board_opens_only_local_stage_page(self):
        opener = Mock(return_value=True)
        self.assertTrue(open_gesture_board(opener))
        opener.assert_called_once_with(GESTURE_BOARD_URL, new=2)

    def test_browser_failure_is_reported(self):
        opener = Mock(side_effect=OSError("browser unavailable"))
        self.assertFalse(open_gesture_board(opener))


if __name__ == "__main__":
    unittest.main()
