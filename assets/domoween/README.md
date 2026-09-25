# Domoween official art

Everything in this folder is **official Domo artwork** supplied by Izzy (Domo ©
NHK). The files are only **resized proportionally**. Nothing has been redrawn,
recolored, flipped, rotated, or retouched. The site shows them unaltered: no
filters, no mirrored or non-proportional scaling, and no text or decorations
placed over them.

## Files

| File | Art | Source | Size |
| --- | --- | --- | --- |
| `happy-halloween-domo-kun-banner.{webp,png}` | "Happy HALLOWEEN Domo-kun" scene banner (hero) | high-res original | 1600×803 |
| `happy-halloween-domo-kun-banner-800.{webp,png}` | same, for phones | high-res original | 800×402 |
| `wc_40_mummy.{webp,png}` | wc_40 mummy Domo | high-res original | 600×466 |
| `wc_41_jack-o-lantern.{webp,png}` | wc_41 jack-o'-lantern Domo (`halloween_pumpkin-domo`) | high-res original | 542×600 |
| `wc_43_witch-broom.{webp,png}` | wc_43 witch Domo on a broom | high-res original | 584×600 |
| `wc_44_frankenstein.{webp,png}` | wc_44 Frankenstein Domo | high-res original | 556×600 |
| `wc_53_mr-usagi-pumpkin-mask.{webp,png}` | wc_53 Mr. Usagi in a pumpkin mask | high-res original | 403×600 |
| `tashanna_pumpkin-head.{webp,png}` | Tashanna with a pumpkin head (no wc_ code on the sheet) | high-res original | 432×600 |
| `wc_42_witch-cauldron_lowres.png` | wc_42 witch Domo with cauldron | screenshot crop | 81×115 |
| `wc_45_dracula_lowres.png` | wc_45 Dracula Domo | screenshot crop | 95×87 |
| `wc_46_jiangshi_lowres.png` | wc_46 jiangshi Domo (hat may be clipped at the top of the source screenshot) | screenshot crop | 82×95 |
| `wc_47_skeleton_lowres.png` | wc_47 skeleton Domo | screenshot crop | 93×89 |
| `wc_48_werewolf_lowres.png` | wc_48 werewolf Domo | screenshot crop | 93×94 |
| `wc_52_pumpkin_lowres.png` | wc_52 pumpkin Domo | screenshot crop | 76×80 |

The high-res files come from the official transparent PNG exports, which were
1700–3800px. WebP is **lossless**, so colors and edges match the originals
exactly, and the PNG is the fallback. Transparency is kept.

The banner has semi-transparent ghosts, so the site shows it on a white backing,
which matches the official composite.

`_lowres` files are color-only crops from the style-guide screenshots
(`domo-costume-wc30-44-sheet`, `domo-costume-wc45-series-sheet`). The crops
include just the figure on its white background, with the matching line-art
version left out. The site only uses them small, in the costume-crew grid.

## Swapping in high-res originals

For each wc_ figure that is still `_lowres`:

1. Resize the official PNG with
   `python3 tools/domoween-art.py path/to/original.png wc_45_dracula 600`
   (needs `pip install pillow`). This writes `wc_45_dracula.webp` and
   `wc_45_dracula.png`.
2. In `seasons/domoween/domoween.js`, update that entry in the `ART` table:
   remove `lowres: true` and set `w`/`h` to the new pixel size the script
   printed.
3. Delete the old `wc_45_dracula_lowres.png`.

To replace an existing high-res file with a newer export, overwrite it using the
same filename and update `w`/`h` if the proportions changed. The layout scales
art proportionally inside fixed boxes, so a different pixel size never
distorts it.

## Licensor usage rules (mandatory)

1. The copyright line must appear legibly on every page that shows Domo art. The
   Domoween theme adds it to the footer:
   "Domo©NHK-TYO1998-2026. Domo Animation©Domo Production Committee. All rights reserved."
   Use the short form "©NHK-TYO; ©DPC." only where space is very tight.
2. Domo only ever says "Domo". No speech bubbles, and no copy that quotes him
   saying anything else. Talking about him in the third person is fine.
3. Never flip or mirror the art, never alter facial proportions, and never add
   eye shine or glare.
4. Don't mix line art and photos in the same scene or composition.
5. No alcohol, tobacco, drugs, religion, politics, violence or gore themes. Keep
   it cute-spooky.
