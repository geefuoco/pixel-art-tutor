# Lesson content

`course.json` lists the Course's Lesson ids in order. Each Lesson lives in `lessons/<id>/`:

- `reference.png`: the Reference Sprite, 8x8, 16x16 or 32x32, every pixel fully opaque or fully transparent. Its colors are the Lesson's fixed palette.
- `manifest.json`: what the image can't say.
- `examples/*.png`: Example Sprites the explanations show.
- `CREDITS.md`: author, source and licence of every image. Art must be good-quality CC0.

```json
{
  "id": "red-potion",
  "title": "Red potion",
  "roles": { "#849be4": "outline", "#df3e23": "base", "#b4202a": "shadow", "#e3e6ff": "highlight" },
  "explanations": {
    "silhouette": "Markdown. ![Caption](examples/silhouette.png)",
    "outline": "...",
    "base": "...",
    "shadow": "...",
    "highlight": "..."
  },
  "overrides": { "silhouetteColor": "#df3e23" }
}
```

- `id` matches the folder name.
- `roles` gives every sprite color one Role: `outline`, `base`, `shadow` or `highlight`.
- Steps follow from the Roles: Silhouette is every opaque pixel, blocked in one color, then one Step per Role that has colors, in the order outline, base, shadow, highlight. `explanations` has one entry per Step the sprite has, and no others.
- Explanations are a Markdown subset: paragraphs, `- ` lists, `**strong**`, `*emphasis*`, `` `code` `` and images. A paragraph of only images shows them side by side, each captioned with its alt text. Images must be files in `examples/`.
- `overrides` is optional. `silhouetteColor` picks the color the Silhouette Step is blocked in; by default it is the most used base color. While checking the Silhouette Step, a pixel already drawn in its final color also counts as right, so drawing ahead is never marked wrong.

To turn a Personal Lesson into a built-in one, use its **Copy manifest** and **Download reference.png** buttons on the Lessons page, put both in `lessons/<id>/`, add the id to `course.json`, and rewrite the templated explanations.

The app reads a Lesson with `readLesson` in `src/core/lesson-content.ts`, which rejects content that breaks these rules.
