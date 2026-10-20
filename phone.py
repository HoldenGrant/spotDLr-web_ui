"""
Phone access: open spotDLr in a phone's browser on the same Wi-Fi, by scanning a QR code.

spotDLr normally answers only this computer (127.0.0.1). With phone access on, a second server
listens on this computer's Wi-Fi address too (e.g. 192.168.1.23:8000), and every request that
arrives there must carry a key:

- The QR code holds http://<wifi address>:<port>/?pair=<key>. Opening it sets a cookie (HttpOnly,
  SameSite=Lax, a year) and redirects to the app without the key in the address bar.
- The cookie is a hash of the key, so a new key ("New QR code") or turning phone access off signs
  every phone out at once. The key is 32 random bytes: guessing it isn't a thing.
- SameSite=Lax means another website open on the phone can't make the phone's browser send
  requests to spotDLr with the cookie (the existing Origin check stays too).
- Managing phone access itself (on/off, new key) only works from this computer.

The Wi-Fi address can change (DHCP, another network), so it's re-checked every 20 s and the
second server moves with it.

Away from home: with Tailscale on (tailscale.py), https://<this computer>.<tailnet>.ts.net/ forwards to
spotDLr too, and the QR code points there instead, so the same bookmark works at home and away.
"""

import hashlib
import hmac
import json
import logging
import os
import secrets
import re
import socket
import subprocess
import sys
import threading
import time
from pathlib import Path

import tailscale

logger = logging.getLogger(__name__)

COOKIE = "spotdlr_phone"
LOOPBACK = {"127.0.0.1", "::1", "localhost"}


_local_name = {"value": None, "at": 0.0}


def local_name():
    """Cached for a minute: it's checked on every request from a phone."""
    if time.time() - _local_name["at"] > 60:
        _local_name.update(value=_read_local_name(), at=time.time())
    return _local_name["value"]


def _read_local_name():
    """This computer's name on the home network ("Holdens-MacBook-Pro.local"), which, unlike its number
    address, doesn't change when the router hands out a new one. Bonjour/mDNS: iPhones, Macs and most
    Android phones resolve .local names. Only on a Mac, where the name is guaranteed to answer."""
    if sys.platform != "darwin":
        return None
    try:
        name = subprocess.run(["scutil", "--get", "LocalHostName"], capture_output=True, text=True, timeout=3).stdout.strip()
    except (OSError, subprocess.TimeoutExpired):
        return None
    return f"{name}.local" if re.fullmatch(r"[A-Za-z0-9-]{1,63}", name or "") else None


def wifi_address():
    """This computer's address on the local network, or None. Connecting a UDP socket sends nothing;
    it only asks the OS which interface would be used to reach the internet."""
    for target in ("192.168.0.1", "10.255.255.255", "8.8.8.8"):
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
                s.connect((target, 1))
                ip = s.getsockname()[0]
            if ip and not ip.startswith("127.") and not ip.startswith("169.254."):
                return ip
        except OSError:
            continue
    return None


class PhoneAccess:
    def __init__(self, path: Path, app):
        self.path = path
        self.app = app
        self.lock = threading.Lock()
        self.server = None       # the uvicorn.Server on the Wi-Fi address
        self.bound = None        # (ip, port) it listens on
        self.error = None
        self.watcher = None
        try:
            self.state = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            self.state = {}
        self.state.setdefault("enabled", False)
        self.state.setdefault("port", 8000)
        self.state.setdefault("tailscale", False)   # also reachable through Tailscale (HTTPS)
        self.state.setdefault("funnel", False)      # …and from the public internet (Tailscale Funnel)
        self._own, self._own_at = set(), 0.0
        self.ts_error = None

    # ---------- state ----------

    def _save(self):
        tmp = self.path.with_suffix(".tmp")
        tmp.write_text(json.dumps(self.state), encoding="utf-8")
        os.replace(tmp, self.path)

    @property
    def enabled(self):
        return bool(self.state.get("enabled") and self.state.get("key"))

    def session_value(self):
        key = self.state.get("key") or ""
        return hmac.new(key.encode(), b"spotdlr phone session", hashlib.sha256).hexdigest()

    def ts_address(self):
        name, port = self.state.get("ts_name"), self.state.get("ts_port")
        if not (self.state.get("tailscale") and name and port):
            return None
        return f"https://{name}" + ("" if port == 443 else f":{port}")

    def status(self, with_tailscale=True):
        ip, port = self.bound or (None, None)
        ts = self.ts_address() if self.enabled else None
        name = local_name() if ip else None
        host = name or ip  # the name when there is one: it survives the router changing the number
        out = {
            "enabled": self.enabled,
            "running": bool(self.server and self.bound),
            "address": f"http://{host}:{port}" if ip else None,
            "url": f"http://{host}:{port}/?pair={self.state['key']}" if ip and self.enabled else None,
            "ip_url": f"http://{ip}:{port}/?pair={self.state['key']}" if ip and name and self.enabled else None,  # if the name doesn't work
            "error": self.error,
            "tailscale": {"enabled": bool(self.state.get("tailscale")), "funnel": bool(self.state.get("funnel") and ts), "address": ts,
                          "url": f"{ts}/?pair={self.state['key']}" if ts else None, "error": self.ts_error},
        }
        if with_tailscale:
            out["tailscale"]["status"] = tailscale.status()  # installed / running / name / https
        return out

    # ---------- requests ----------

    @staticmethod
    def is_local(request):
        return (request.client.host if request.client else "") in LOOPBACK

    def own_addresses(self):
        """This computer's Wi-Fi and Tailscale addresses (cached for a minute)."""
        if time.time() - self._own_at > 60:
            ips = set(tailscale.status().get("ips") or [])
            ip = wifi_address()
            if ip:
                ips.add(ip)
            self._own, self._own_at = ips, time.time()
        return self._own

    def is_remote(self, request):
        """From another device: another address, or through Tailscale (which forwards from 127.0.0.1, passing the
        real address in X-Forwarded-For, which uvicorn takes from the last entry: the one Tailscale adds, so a
        phone can't fake it). This computer opening its own Wi-Fi or Tailscale address is not another device."""
        host = request.headers.get("host", "").rsplit(":", 1)[0]
        client = request.client.host if request.client else ""
        if client in self.own_addresses():
            return False
        return not self.is_local(request) or host.endswith(".ts.net")

    def allowed_host(self, host):
        if self.bound and (host == self.bound[0] or host.lower() == (local_name() or "").lower()):
            return True
        return bool(self.state.get("tailscale")) and host == self.state.get("ts_name")

    def check(self, request):
        """For a request from another device: 'ok', 'pair' (a valid ?pair= key: set the cookie), or None."""
        if not self.enabled:
            return None
        cookie = request.cookies.get(COOKIE, "")
        if cookie and hmac.compare_digest(cookie, self.session_value()):
            return "ok"
        given = request.query_params.get("pair", "")
        if given and hmac.compare_digest(given, self.state["key"]):
            return "pair"
        return None

    # ---------- on / off ----------

    def enable(self, port):
        with self.lock:
            self.state["enabled"] = True
            self.state["port"] = port or self.state.get("port") or 8000
            if not self.state.get("key"):
                self.state["key"] = secrets.token_urlsafe(32)
            self._save()
        self.start()
        return self.status()

    def disable(self):
        """A pause: nothing answers phones until it's turned on again, but the key and the Tailscale/Funnel
        choices are kept, so phones that scanned the code get straight back in. (New QR code signs them out.)"""
        with self.lock:
            self.state["enabled"] = False
            self._save()
        self.stop()
        name, port = self.state.get("ts_name"), self.state.get("ts_port")
        if self.state.get("tailscale") and name and port:  # take the Tailscale address down too; start() restores it
            try:
                if tailscale.funnel_active(name, port):
                    tailscale._run("funnel", f"--https={port}", "off", timeout=20)
                tailscale.serve_off(port)
            except tailscale.TailscaleError as e:
                self.ts_error = str(e)
        return self.status()

    def set_tailscale(self, on):
        """Turn the https://<name>.ts.net address on or off (only spotDLr's own Tailscale entry)."""
        self.ts_error = None
        try:
            if on:
                st = tailscale.status()
                if not st.get("installed"):
                    raise tailscale.TailscaleError("Tailscale isn't installed on this computer")
                if not st.get("running") or not st.get("name"):
                    raise tailscale.TailscaleError("Tailscale is off on this computer. Turn it on (menu bar → Tailscale → Connect), then try again.")
                if not st.get("https"):
                    raise tailscale.TailscaleError("HTTPS certificates are off for your Tailscale network. Turn on “HTTPS Certificates” at login.tailscale.com → DNS, then try again.")
                ts_port = tailscale.serve_on(st["name"], int(self.state.get("port") or 8000), st.get("ips") or [])
                with self.lock:
                    self.state.update(tailscale=True, ts_name=st["name"], ts_port=ts_port)
                    self._save()
            else:
                if self.state.get("funnel"):
                    self.set_funnel(False)
                port = self.state.get("ts_port")
                with self.lock:
                    self.state.update(tailscale=False)
                    self._save()
                if port:
                    tailscale.serve_off(port)
        except tailscale.TailscaleError as e:
            self.ts_error = str(e)
        return self.status()

    def new_key(self):
        with self.lock:
            self.state["key"] = secrets.token_urlsafe(32)
            self._save()
        return self.status()

    # ---------- the second server ----------

    def set_funnel(self, on):
        """The Tailscale address, also from the public internet (devices without Tailscale). The key still applies."""
        self.ts_error = None
        name, port, local = self.state.get("ts_name"), self.state.get("ts_port"), int(self.state.get("port") or 8000)
        try:
            if on and not (self.state.get("tailscale") and name and port):
                raise tailscale.TailscaleError("Turn on “Also away from home, with Tailscale” first")
            if on:
                tailscale.funnel_on(name, port, local)
            elif name and port:
                tailscale.funnel_off(name, port, local)
            with self.lock:
                self.state["funnel"] = bool(on)
                self._save()
        except tailscale.TailscaleError as e:
            self.ts_error = str(e)
        return self.status()

    def start(self):
        """Listen on the Wi-Fi address (when enabled), and keep following it."""
        if not self.enabled:
            return
        self._bind()
        if self.state.get("tailscale"):  # make sure Tailscale still forwards to us (the port may have changed)
            st = tailscale.status()
            if st.get("running") and st.get("name"):
                try:
                    port = tailscale.serve_on(st["name"], int(self.state.get("port") or 8000), st.get("ips") or [])
                    if self.state.get("funnel") and not tailscale.funnel_active(st["name"], port):
                        tailscale.funnel_on(st["name"], port, int(self.state.get("port") or 8000))
                    if port != self.state.get("ts_port"):
                        with self.lock:
                            self.state["ts_port"] = port
                            self._save()
                except tailscale.TailscaleError as e:
                    self.ts_error = str(e)
        if not self.watcher:
            self.watcher = threading.Thread(target=self._watch, daemon=True)
            self.watcher.start()

    def _bind(self):
        import uvicorn

        ip = wifi_address()
        base = int(self.state.get("port") or 8000)
        with self.lock:
            # Already listening there, on the usual port (or on a fallback while the usual one is still taken)
            if self.bound and self.bound[0] == ip and self.server and (self.bound[1] == base or not self._port_free(ip, base)):
                return
            old = self.server
        if old:
            self.stop()
        if not ip:
            self.error = "This computer isn't connected to a network"
            return
        for _ in range(16):  # a spotDLr that was just restarted may still be letting go of the usual port: wait up to 8 s
            if self._port_free(ip, base):
                break
            time.sleep(0.5)
        for port in (base, base + 1, base + 2, base + 3):  # the bookmark on phones has the port in it: keep it if at all possible
            if not self._port_free(ip, port):
                continue
            config = uvicorn.Config(self.app, host=ip, port=port, log_level="warning", lifespan="off")
            server = uvicorn.Server(config)
            thread = threading.Thread(target=server.run, daemon=True, name="phone-access")
            thread.start()
            for _ in range(50):  # up to 5 s for it to start listening
                if server.started or not thread.is_alive():
                    break
                time.sleep(0.1)
            if server.started:
                with self.lock:
                    self.server, self.bound, self.error = server, (ip, port), None
                logger.info("Phone access on http://%s:%s", ip, port)
                return
        self.error = f"Couldn't listen on {ip} (ports {base}–{base + 3} are in use)"

    @staticmethod
    def _port_free(ip, port):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            # Like uvicorn: reuse the address, so the port of a just-stopped spotDLr (connections still
            # closing) counts as free. Without this a restart moved phones to the next port, breaking bookmarks.
            s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                s.bind((ip, port))
                return True
            except OSError:
                return False

    def stop(self):
        with self.lock:
            server, self.server, self.bound = self.server, None, None
        if server:
            server.should_exit = True

    def _watch(self):
        while True:
            time.sleep(20)
            if not self.enabled:
                self.watcher = None
                return
            try:
                self._bind()  # no-op unless the Wi-Fi address changed
            except Exception as e:  # never die silently on a thread
                self.error = str(e)[:200]
