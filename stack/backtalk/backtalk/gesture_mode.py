"""Local voice commands for the optional Barehands gesture board."""
import webbrowser


GESTURE_BOARD_URL = "http://127.0.0.1:8794/stage.html"


def is_gesture_mode_on(text: str) -> bool:
    """Match only short, explicit commands so normal conversation is safe."""
    normalized = " ".join(text.lower().replace("-", " ").split()).strip(" .,!?;")
    return normalized in {
        "gesture mode on",
        "turn gesture mode on",
        "enable gesture mode",
        "open gesture mode",
        "open the gesture board",
        "show the gesture board",
    }


def open_gesture_board(opener=webbrowser.open) -> bool:
    """Open the local gesture board in a new browser tab."""
    try:
        return bool(opener(GESTURE_BOARD_URL, new=2))
    except Exception:
        return False
