# spotDLr website

Public landing page: https://holdengrant.github.io/spotDLr-web_ui/

Edit `index.html`, `style.css`, or the files in `assets/`. No build step is needed.
Preview from the repository root:

```sh
python3 -m http.server 18765 --directory website
```

Open http://localhost:18765. Check desktop and mobile layouts before publishing.

The `Publish website` GitHub Actions workflow deploys **only `website/`** when
these files change on `main`. GitHub Pages must use **GitHub Actions** as its
publishing source. The workflow can also be run manually.

This page links to the latest Windows installer and the published Mac setup
guide. Update the copy if packaging changes. `assets/library.webp` is a screenshot
of the current development app; its caption distinguishes it from a release.

The Python server, credentials, music files, and app data are not part of the
website. GitHub Pages hosts the landing page; it does not run the music player.
