"""
Scheduled plays: "play Reanimation at 7:00 on weekdays", like an alarm.

The music plays in a spotDLr page (the computer's window, or a phone's browser), so a schedule belongs to
one device: the page that matches `device` starts it, and nothing else does. The schedules live here (so
they survive reloads and show on every device), and `fired()` makes each occurrence start exactly once,
even with two spotDLr windows open on the same device.

A schedule:
  {id, device, device_name, what: {kind, key, label, href, ids}, time: "07:00",
   days: [0..6] (Mon=0; empty = once, on `date`), date: "2026-10-20" | None,
   shuffle, fade_in, enabled, last_run: "2026-10-20T07:00" | None}
"""

import json
import os
import re
import threading
import uuid
from pathlib import Path

TIME = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")
DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
KINDS = {"collection", "liked", "songs", "artist", "genre", "track"}


class ScheduleError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


class Schedules:
    def __init__(self, path: Path):
        self.path = path
        self.lock = threading.Lock()
        try:
            self.items = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            self.items = []

    def _save(self):
        tmp = self.path.with_suffix(".tmp")
        tmp.write_text(json.dumps(self.items, ensure_ascii=False), encoding="utf-8")
        os.replace(tmp, self.path)

    def all(self):
        with self.lock:
            return [dict(s) for s in self.items]

    def save(self, data):
        """Create (no id) or update one. Returns it."""
        clean = self._validate(data)
        with self.lock:
            existing = next((s for s in self.items if s["id"] == data.get("id")), None) if data.get("id") else None
            if existing:
                if (existing["time"], existing["days"], existing["date"]) != (clean["time"], clean["days"], clean["date"]):
                    clean["last_run"] = None  # a new time: let it run again
                else:
                    clean["last_run"] = existing.get("last_run")
                existing.update(clean)
                result = existing
            else:
                result = dict(clean, id=uuid.uuid4().hex[:10], last_run=None)
                self.items.append(result)
            self._save()
            return dict(result)

    def delete(self, schedule_id):
        with self.lock:
            before = len(self.items)
            self.items = [s for s in self.items if s["id"] != schedule_id]
            if len(self.items) == before:
                raise ScheduleError("That schedule doesn't exist anymore", 404)
            self._save()

    def fired(self, schedule_id, occurrence):
        """Claim an occurrence ("2026-10-20T07:00"). True only for the first caller; a one-off turns off."""
        with self.lock:
            s = next((x for x in self.items if x["id"] == schedule_id), None)
            if not s or not s["enabled"] or s.get("last_run") == occurrence:
                return False
            s["last_run"] = occurrence
            if not s["days"]:
                s["enabled"] = False  # "once" is done
            self._save()
            return True

    @staticmethod
    def _validate(data):
        what = data.get("what") or {}
        if what.get("kind") not in KINDS or not what.get("label"):
            raise ScheduleError("Choose what to play")
        ids = [str(i) for i in (what.get("ids") or [])][:5000]
        if not ids:
            raise ScheduleError("There's nothing to play in that")
        time = str(data.get("time") or "")
        if not TIME.match(time):
            raise ScheduleError("Pick a time")
        days = sorted({int(d) for d in (data.get("days") or []) if str(d).isdigit() and 0 <= int(d) <= 6})
        date = data.get("date") or None
        if not days and not (date and DATE.match(str(date))):
            raise ScheduleError("Pick a date, or the days to repeat on")
        if not data.get("device"):
            raise ScheduleError("Missing the device it plays on")
        return {
            "device": str(data["device"])[:64], "device_name": str(data.get("device_name") or "")[:60],
            "what": {"kind": what["kind"], "key": str(what.get("key") or "")[:300], "label": str(what["label"])[:200],
                     "href": str(what.get("href") or "#/")[:400], "ids": ids},
            "time": time, "days": days, "date": None if days else str(date),
            "shuffle": bool(data.get("shuffle")), "fade_in": bool(data.get("fade_in")),
            "enabled": bool(data.get("enabled", True)),
        }
