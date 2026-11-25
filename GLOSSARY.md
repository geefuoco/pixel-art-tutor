# Pixel Art Tutor

A browser app that teaches pixel art through hands-on Lessons layered on a pixel editor, so the learner can make their own game assets.

## Learning

**Course**:
The built-in, ordered sequence of Lessons that introduces techniques one after another.

**Lesson**:
A guided exercise built around one Reference Sprite and split into ordered Steps, playable in each Mode.
_Avoid_: Tutorial, exercise, level

**Reference Sprite**:
The finished sprite a Lesson is working towards.
_Avoid_: Target image, answer

**Step**:
One ordered stage of a Lesson (silhouette, outline, base, shadow, highlight), or one Frame in an animation Lesson, each with a short explanation.
_Avoid_: Stage, phase

**Key pose**:
A Frame at an extreme of the motion in an animation Lesson, drawn before the in-betweens.

**In-between**:
A Frame that carries the motion from one key pose to the next, drawn after the key poses.
_Avoid_: Tween

**Role**:
The part a palette color plays in a sprite: outline, base, shadow or highlight.

**Example Sprite**:
A small illustrative sprite shown upscaled inside an explanation, often as a good and a bad version side by side.

**Personal Lesson**:
A Lesson generated automatically from a sprite the learner uploads. It sits outside the Course and is always unlocked.
_Avoid_: Custom lesson, user lesson

## Modes

**Mode**:
One of three ways to play a Lesson, unlocked in order: Trace, Hint, Freehand.
_Avoid_: Difficulty

**Trace**:
The Mode in which the Guide shows exactly which pixels to draw for the current Step.

**Hint**:
The Mode in which the learner gets each Step's explanation and the palette, and can briefly flash the Guide.

**Freehand**:
The Mode in which the learner draws from the Reference Sprite shown beside the canvas, with no Steps enforced.

**Guide**:
The faint overlay showing the exact pixels for the current Step.
_Avoid_: Overlay, ghost

**Pass**:
An Attempt that reaches its Mode's passing score. Passing a Mode unlocks the Lesson's next Mode, and passing a Lesson's Trace unlocks the next Lesson in the Course.

**Progress**:
Which Modes the learner has passed in each Lesson. A Lesson stays unlocked once any of its Modes has been passed, even if the Course order changes.

## Feedback

**Attempt**:
One play of a Lesson in a Mode, with its drawing, score, Hint flash count and date.
_Avoid_: Try, run, submission

**Sub-score**:
One of the three parts of a Freehand score: Shape (how well the silhouette matches, wherever it is drawn and give or take 2px in size), Palette (whether each Role's colors are in the right places) and Line quality (how few pixels have a Mistake). The overall score is their average.

**Mistake**:
A specific, detectable pixel art error in a drawing (such as an orphan pixel, jaggies, doubles, banding, pillow shading, too many colors, low contrast or a seam), linked to the explanation that covers it.
_Avoid_: Error, issue

## Practice

**Daily Prompt**:
The exercise for a calendar date, the same for every visitor: a Theme Prompt, a Technique Drill or a Review Drill.

**Theme Prompt**:
An unscored Daily Prompt that asks for a subject under constraints, such as "16x16 health potion, 4 colors, light from top-left".

**Technique Drill**:
A Daily Prompt that gives a starting shape and asks the learner to apply one technique the Course has already taught.

**Review Drill**:
A Daily Prompt that replays the passed Lesson practised least recently, in the next harder Mode.

## Making

**Studio**:
The free drawing area for making one's own assets, outside any Lesson.
_Avoid_: Sandbox, editor

**Frame**:
One image in an animation.

**Animation**:
The ordered Frames of a Studio drawing, played in a loop at one FPS for the whole animation (no per-Frame durations). A still drawing is an Animation of one Frame.

**Sprite Sheet**:
One PNG holding every Frame of an Animation, side by side in a strip or in a grid, exported with an Aseprite-style JSON frame map that gives where each Frame is and how long it shows.
_Avoid_: Atlas, tilesheet

**Onion Skin**:
A faint view of the previous and next Frames behind the current one, at an adjustable opacity, for lining up motion between Frames.
_Avoid_: Ghost

**Selection**:
A rectangle of pixels in the Studio that can be dragged, copied and pasted as a block.
_Avoid_: Marquee

**Palette**:
The fixed list of colors a drawing can use. A Studio drawing takes its palette from a Bundled Palette, a Custom Palette or the Studio starter colors when it is made.
_Avoid_: Color set, swatches

**Bundled Palette**:
A well-known palette that ships with the app, credited to its creator.

**Custom Palette**:
A named palette of 1 to 32 colors the learner makes and keeps.

**Mirror Symmetry**:
A Studio-only toggle that repeats each pencil, eraser or fill flipped left to right across the middle of the canvas.

**Tile**:
A 16x16 drawing made to be repeated edge to edge in a game level. Each tile says which of its opposite edges repeat: left-right, top-bottom, both or neither.

**Tileset Lesson**:
A Lesson that teaches a small set of tiles, such as a ground tile and its edges, with one Step per tile. Autotile sets are out of scope.

**Seam**:
A Mistake on a tile where opposite edges that repeat meet in a pairing of colors the tile never puts side by side anywhere else, so the edges of each copy show in the repeat. Seams are only checked in tile mode: in a Tileset Lesson, or in the Studio with the Tiling Preview on.

**Tiling Preview**:
A live 3x3 repetition of the canvas that shows how a tile looks when repeated.

**Gallery**:
The learner's saved record of drawings and Attempts over time. It holds every Studio drawing, every passed Attempt, every finished Freehand Attempt, and any other Attempt the learner saves to it.
_Avoid_: Portfolio, history
