"""Local transcript wake gate; unrelated room speech never reaches the brain."""
import re
import time

class WakeGate:
    def __init__(self, timeout=8):
        self.until = 0
        self.timeout = timeout

    def accept(self, text, now=None):
        now = time.monotonic() if now is None else now
        match = re.match(r"^\s*hey[\s,!.:;-]+jarvis\b[\s,!.:;?-]*", text, re.I)
        if match:
            command = text[match.end():].strip()
            self.until = now + self.timeout if not command else 0
            return command
        if now < self.until and text.strip():
            self.until = 0
            return text.strip()
        self.until = 0
        return None
