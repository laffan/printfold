# PrintFold — GitHub Pages site

This is the **`promo-site`** branch: a standalone promotional page for
[PrintFold](https://github.com/laffan/printfold). It is intentionally an orphan
branch and contains no application code.

> Note: the `gh-pages` branch is already used to deploy the PrintFold web app
> itself, so this landing page lives on its own branch.

## Structure

```
index.html    — page markup
styles.css    — styles (minimal, print-inspired)
scripts.js    — small scroll-reveal enhancement
img/          — promotional images (placeholders for now)
.nojekyll     — serve files as-is, skip Jekyll processing
```

## Adding images

`index.html` references two placeholders. Drop the real files into `img/` and
remove the corresponding `.img-placeholder` block:

- `img/hero.png` — editor screenshot (~4:3)
- `img/imposition.png` — imposition / printed booklet (~16:7)

## Publishing

In the repo's **Settings → Pages**, set the source to the `promo-site` branch
(root). No build step is required — it's plain HTML/CSS/JS. (Note: pointing
Pages here would replace the current app deployment served from `gh-pages`.)
