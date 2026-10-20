// spotDLr on a phone's home screen. Caches nothing: the app always comes fresh from your computer.
// Its one job: when the computer can't be reached, show why instead of the browser's error page.
const HOME = '__HOME_URL__'; // filled in by the server: the home Wi-Fi address, or empty
const OFFLINE = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>spotDLr</title><body style="font:16px/1.5 system-ui,sans-serif;background:#121212;color:#fff;padding:48px 24px;max-width:440px;margin:auto">
<h1 style="font-size:22px">Can't reach your computer</h1>
<p style="color:#b3b3b3">spotDLr plays music from your computer, so it has to be on and awake, with spotDLr running.
Away from home, check that the Tailscale app is connected on this phone.</p>
<p><a href="/" style="color:#1ed760">Try again</a></p>
${HOME ? `<p style="color:#b3b3b3;margin-top:28px">At home, with Tailscale off? Open spotDLr on your home Wi-Fi instead:<br>
<a href="${HOME}/" style="color:#1ed760">${HOME.replace(/^https?:\/\//, '')}</a><br>(the first time, scan the “Home Wi-Fi only” code in Settings → Phone access on your computer)</p>` : ''}</body>`;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (event) => {
    if (event.request.mode !== 'navigate') return; // everything else goes straight to the network
    event.respondWith(fetch(event.request).catch(() => new Response(OFFLINE, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })));
});
