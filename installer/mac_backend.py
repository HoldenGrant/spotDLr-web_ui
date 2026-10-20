"""Bundled Mac backend. The native window owns this process and its ready file."""

import json
import os
from pathlib import Path
import socket
import threading
import time

import uvicorn
from app import app
from paths import DATA_DIR


def main():
    ready = Path(os.environ["SPOTDLR_READY_FILE"])
    port_file = DATA_DIR / "desktop-port.json"
    try:
        preferred = json.loads(port_file.read_text())["port"]
        if not isinstance(preferred, int) or not 1024 <= preferred <= 65535:
            preferred = 8001
    except (OSError, ValueError, KeyError, TypeError):
        preferred = 8001
    with socket.socket() as listener:
        try:
            listener.bind(("127.0.0.1", preferred))
        except OSError:
            listener.bind(("127.0.0.1", 0))
        port = listener.getsockname()[1]
        server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=port, log_level="info"))

        def announce():
            while not server.started and not server.should_exit:
                time.sleep(0.05)
            if server.started:
                # Reuse the origin on the next launch to retain WebKit's local preferences.
                port_file.write_text(json.dumps({"port": port}), encoding="utf-8")
                # Publish only after startup, using the socket already bound above.
                temporary = ready.with_suffix(".tmp")
                temporary.write_text(json.dumps({"port": port}), encoding="utf-8")
                temporary.replace(ready)

        threading.Thread(target=announce, daemon=True).start()
        try:
            server.run(sockets=[listener])
        finally:
            ready.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
