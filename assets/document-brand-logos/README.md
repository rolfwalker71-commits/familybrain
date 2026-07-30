# Document brand logos

Optical reference assets for OpenAI document-icon generation. When keywords match, the image is passed into `images.edit` (`input_fidelity: low`) as **inspiration only** — the model must create a new flat app icon, not paste the reference.

| File | Source | Match |
|------|--------|--------|
| `uri-wappen.svg` | [Wikimedia Commons – Wappen Uri matt](https://commons.wikimedia.org/wiki/File:Wappen_Uri_matt.svg) | Uri / Kanton Uri |
| `ang-icon.png` | [an-group.one](https://www.an-group.one/) site icon | ANG / AN-Group |
| `altdorf-ref.png` | Visual cue for [Altdorf UR](https://vereins.fandom.com/wiki/Altdorf_UR) | Altdorf |

Add further brands in `lib/paperless/brand-logos.ts`.
