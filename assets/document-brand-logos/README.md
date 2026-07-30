# Document brand logos

Optical reference assets for OpenAI document-icon generation. Matched **only** when Paperless correspondent or finance vendor equals one of these Absender/Provider names (not OCR/title text). Then the image is passed into `images.edit` (`input_fidelity: low`) as inspiration.

| File | Absender / Provider | Match |
|------|---------------------|--------|
| `uri-wappen.svg` | `Kanton Uri`, `Uri` | Uri |
| `ang-icon.png` | `ANG`, `ANG Schweiz` | ANG |
| `altdorf-ref.png` | `Altdorf`, `Altdorf UR` | Altdorf |

Sources: [Wappen Uri](https://commons.wikimedia.org/wiki/File:Wappen_Uri_matt.svg), [an-group.one](https://www.an-group.one/), [Altdorf UR](https://vereins.fandom.com/wiki/Altdorf_UR).

Add further brands in `lib/paperless/brand-logos.ts`.
