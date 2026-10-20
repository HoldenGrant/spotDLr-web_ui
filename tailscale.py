"""
Tailscale: reach spotDLr from your phone anywhere, not only on the home Wi-Fi.

Tailscale puts your devices on a private network: each gets a 100.x.y.z address and a name like
holdens-macbook-pro.tail90c3e.ts.net that only devices signed in to your account can reach.
`tailscale serve` then gives that name a real HTTPS certificate and forwards
https://<name>/ to spotDLr on this computer (http://127.0.0.1:<port>).

Because Tailscale forwards from this computer itself, those requests arrive from 127.0.0.1. The guard in
app.py therefore treats any Host ending in .ts.net as a phone: it still needs the QR code's key.

Only spotDLr's own entry is ever added or removed (`serve --https=<port> off`); anything else you
serve with Tailscale is left alone. Port 443 is skipped (for 8443) when Tailscale already serves
something else there, or when another app on this computer listens on 443 for every address (local web
development tools like Local or MAMP do): connections to the Tailscale address can reach that app instead.
"""

import json
import re
import shutil
import socket
import subprocess
import sys
from pathlib import Path

PORTS = (443, 8443)


def cli():
    """Path to the tailscale command, or None."""
    found = shutil.which("tailscale")
    if found:
        return found
    for candidate in ("/Applications/Tailscale.app/Contents/MacOS/Tailscale",
                      r"C:\Program Files\Tailscale\tailscale.exe", r"C:\Program Files (x86)\Tailscale\tailscale.exe"):
        if Path(candidate).exists():
            return candidate
    return None


def _run(*args, timeout=20):
    exe = cli()
    if not exe:
        raise TailscaleError("Tailscale isn't installed on this computer")
    flags = 0x08000000 if sys.platform == "win32" else 0  # CREATE_NO_WINDOW
    try:
        result = subprocess.run([exe, *args], capture_output=True, text=True, timeout=timeout, creationflags=flags)
    except subprocess.TimeoutExpired:
        raise TailscaleError("Tailscale didn't answer in time")
    except OSError as e:
        raise TailscaleError(f"Couldn't run Tailscale: {e}")
    return result


class TailscaleError(Exception):
    pass


def status():
    """{installed, running, name, ips, https, account}. Never raises."""
    if not cli():
        return {"installed": False, "running": False}
    try:
        result = _run("status", "--json", timeout=8)
        data = json.loads(result.stdout)
    except (TailscaleError, ValueError):
        return {"installed": True, "running": False}
    me = data.get("Self") or {}
    name = (me.get("DNSName") or "").rstrip(".")
    return {
        "installed": True,
        "running": data.get("BackendState") == "Running",
        "name": name or None,
        "ips": data.get("TailscaleIPs") or [],
        "https": bool(data.get("CertDomains")),  # HTTPS certificates are on for this tailnet
        "account": (data.get("CurrentTailnet") or {}).get("Name"),
    }


def _serve_config():
    try:
        return json.loads(_run("serve", "status", "--json", timeout=8).stdout or "{}") or {}
    except (TailscaleError, ValueError):
        return {}


def _target_of(config, name, port):
    """What https://<name>:<port>/ forwards to now, or None."""
    handlers = ((config.get("Web") or {}).get(f"{name}:{port}") or {}).get("Handlers") or {}
    return (handlers.get("/") or {}).get("Proxy")


def _port_used_here(ips, port):
    """Does another program on this computer listen on this port for the Tailscale address?"""
    for ip in ips:
        if ":" in ip:
            continue
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind((ip, port))
            except OSError:
                return True
    return False


def serve_on(name, local_port, ips=()):
    """Forward https://<name>[:port]/ to spotDLr. Returns the https port used."""
    config = _serve_config()
    ours = f"http://127.0.0.1:{local_port}"
    for port in PORTS:
        target = _target_of(config, name, port)
        clash = port == 443 and _port_used_here(ips, port)
        if target == ours and not clash:
            return port  # already set up
        if target == ours and clash:
            serve_off(port)  # set up before the clash was known: move to the next port
            continue
        if clash:
            continue
        tcp_taken = str(port) in (config.get("TCP") or {})
        if target is None and not tcp_taken:
            result = _run("serve", "--bg", "--yes", f"--https={port}", ours, timeout=40)
            if result.returncode != 0:
                raise TailscaleError(_explain(result.stderr or result.stdout))
            return port
    raise TailscaleError("Tailscale is already serving something else on ports 443 and 8443")


def serve_off(port):
    result = _run("serve", f"--https={port}", "off", timeout=20)
    if result.returncode != 0 and "not found" not in (result.stderr + result.stdout).lower():
        raise TailscaleError(_explain(result.stderr or result.stdout))


def _explain(message):
    text = (message or "").strip()
    low = text.lower()
    if "https" in low and ("not enabled" in low or "disabled" in low):
        return "HTTPS certificates are off for your Tailscale network. Turn on “HTTPS Certificates” at login.tailscale.com → DNS, then try again."
    if "access denied" in low or "permission" in low:
        return "Tailscale refused the change. On Linux, run `sudo tailscale set --operator=$USER` once."
    return f"Tailscale said: {text[-300:]}" if text else "Tailscale couldn't set this up"


# ---------- Funnel: the same https address, reachable from the public internet ----------
# Devices without Tailscale can then open spotDLr too. It's a flag on the serve entry above, so the address
# (and every home-screen app made from it) stays the same. Allowed ports: 443, 8443, 10000.

FUNNEL_URL = re.compile(r"https://login\.tailscale\.com/\S+")


def funnel_active(name, port):
    return bool((_serve_config().get("AllowFunnel") or {}).get(f"{name}:{port}"))


def funnel_on(name, port, local_port):
    if port not in (443, 8443, 10000):
        raise TailscaleError(f"Funnel only works on ports 443, 8443 and 10000, not {port}")
    try:
        result = _run("funnel", "--bg", "--yes", f"--https={port}", f"http://127.0.0.1:{local_port}", timeout=40)
        text = (result.stdout or "") + (result.stderr or "")
    except TailscaleError as e:
        text = str(e)
    if funnel_active(name, port):
        return
    link = FUNNEL_URL.search(text)
    if link:  # the tailnet's policy doesn't allow it yet: Tailscale gives a page to allow it
        raise TailscaleError(f"Your Tailscale network needs to allow Funnel first. Open {link.group(0)} , allow it, then try again.")
    raise TailscaleError(_explain(text))


def funnel_off(name, port, local_port):
    """Back to tailnet-only: turn Funnel off for the port, then make sure the private entry is still there."""
    _run("funnel", f"--https={port}", "off", timeout=20)
    if funnel_active(name, port):
        raise TailscaleError("Tailscale didn't turn Funnel off. Try again, or run: tailscale funnel reset")
    ours = f"http://127.0.0.1:{local_port}"
    if _target_of(_serve_config(), name, port) != ours:  # "off" can drop the whole entry: put the private one back, same port
        result = _run("serve", "--bg", "--yes", f"--https={port}", ours, timeout=40)
        if result.returncode != 0:
            raise TailscaleError(_explain(result.stderr or result.stdout))
