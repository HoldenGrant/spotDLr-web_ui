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

The teal/yellow art direction combines a botanical hero, a decorative listening
card linking to the app preview, and illustrated feature tiles. There is no audio
player on this static site. The layout uses Manrope for display text and Figtree
for body copy, with responsive layouts and reduced-motion support.

`assets/botanical.webp` was created with the built-in imagegen tool and compressed
to WebP. Generation prompt:

> Use case: ads-marketing. Asset type: background photograph for a music app landing page hero, wide 16:9 landscape. Create an atmospheric editorial image of delicate yellow wildflowers and a single large soft golden bloom, photographed through textured glass with subtle intentional motion blur, against a rich muted teal background. Dreamlike, analog album-cover mood, fine film grain, natural light, deep teal shadows. Place the luminous flowers around the middle third; keep the far left and right darker and calm so white website typography and a floating player card can overlay them. Palette: deep petrol teal #194c4b, sea green #48766b, warm yellow #ffdf73. This is only photographic artwork, not a screenshot or UI. No people, text, lettering, logos, interface elements, borders, or watermark.

The Python server, credentials, music files, and app data are not part of the
website. GitHub Pages hosts the landing page; it does not run the music player.
