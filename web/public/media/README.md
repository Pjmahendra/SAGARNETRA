# Sign-in backdrop

`web/src/components/SeaBackdrop.tsx` layers three things, each covering the one below if present.

    login.jpg           the Chennai–Ennore coast. This is what normally shows.
    login.webm / .mp4   optional looping clip; fades in over the still if you add one.
    (canvas)            a sea drawn in code, underneath both, so the page is never blank.

## Swapping the image

Save any photo over `login.jpg` and it appears on next reload. Nothing else to change: the darken
and desaturate live in CSS (`SeaBackdrop.tsx`), not baked into the file, so a replacement is graded
the same way and the sign-in panel stays readable over it. Landscape, ideally 2000 px or wider.

**Check you are allowed to use it.** Press photographs of real spills are almost always
copyrighted, and this is going in front of judges. Safe sources: your own captures, satellite
imagery you stitch yourself (see below), NASA/ESA/Copernicus, or anything explicitly CC0.

## login.jpg (current)

Esri World Imagery — the same tile service the console's maps use — for 80.12–80.62 E, 12.94–13.34 N
at zoom 13, stitched into one image, then softened and graded down so the sign-in panel reads over
it. The blur is not only for depth of field: Esri mosaics captures of different dates along this
coast, and the joins show as rectangular tonal steps.

Regenerate with `scripts/stitch_login_bg.py`. **Credit is required** and is rendered bottom-right of
the page; keep it if you change the image.

## A clip instead

Keep it short (8–15 s), silent and seamlessly looping — it is muted and looped. Keep it small: there
is no git-lfs here and the demo has to work with the network off, so it is bundled, not streamed.
Under ~4 MB. Crop to roughly 16:9; it is drawn with `object-fit: cover`.
