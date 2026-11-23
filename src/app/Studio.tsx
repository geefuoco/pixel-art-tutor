import {
  ClipboardPaste,
  Copy,
  Eraser,
  FilePlus,
  FlipHorizontal2,
  Grid3x3,
  PaintBucket,
  Pencil,
  Pipette,
  Redo2,
  Scan,
  SquareDashed,
  SquareX,
  Undo2,
  ZoomIn,
  ZoomOut,
  type LucideIcon,
} from 'lucide-react';
import {
  useCallback,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type FormEvent,
} from 'react';
import {
  copyPixels,
  createDrawing,
  getPixel,
  MAX_DRAWING_SIZE,
  rectBetween,
  rectOnCanvas,
  TRANSPARENT,
  type Clip,
  type Command,
  type Point,
  type Rect,
} from '../core/drawing';
import { createEditor, type Editor, type EditorState } from '../core/editor';
import { STUDIO_PLACEHOLDER_PALETTE } from '../core/palettes';
import { canZoom, FIT_VIEW, panView, viewZoom, zoomView, type View } from '../core/view';
import { Nav } from './Nav';
import { PixelCanvas } from './PixelCanvas';

type Tool = 'pencil' | 'eraser' | 'fill' | 'eyedropper' | 'select';

/** A block of pixels that can be placed at a point, and where it is now. */
interface Block {
  /** Its whole rectangle, including any part off the canvas. */
  rect: Rect;
  place: (at: Point) => Command;
}

/**
 * The block last pasted or moved, for as long as nothing else has changed the drawing.
 * Dragging it again replaces that step, so it doesn't pick up what it now covers.
 */
interface Floating extends Block {
  /** The editor state right after it was placed; any other change ends it. */
  state: EditorState;
}

/** A Select tool press in progress: drawing a new selection, or dragging a block. */
type SelectGesture =
  { kind: 'select'; start: Point } | { kind: 'move'; start: Point; block: Block; replace: boolean };

/** A key press: `key` is KeyboardEvent.key lowercased. `shift` unset means either. */
interface Chord {
  key: string;
  mod?: boolean;
  shift?: boolean;
}

/** A toolbar button and its keyboard shortcuts; the first chord is the one shown. */
interface Control {
  label: string;
  Icon: LucideIcon;
  chords: Chord[];
  run: () => void;
  disabled?: boolean;
  pressed?: boolean;
}

/** How far one arrow key press pans, in screen pixels. */
const PAN_STEP = 32;
/** Wheel scroll, in pixels, that zooms one level; trackpads send many small deltas. */
const WHEEL_STEP = 40;
const DEFAULT_SIZE = 16;

function newEditor(width: number, height: number): Editor {
  return createEditor(createDrawing({ width, height, palette: STUDIO_PLACEHOLDER_PALETTE }));
}

function matches(chord: Chord, e: KeyboardEvent) {
  return (
    e.key.toLowerCase() === chord.key &&
    (e.ctrlKey || e.metaKey) === !!chord.mod &&
    (chord.shift === undefined || chord.shift === e.shiftKey)
  );
}

function chordLabel({ key, mod, shift }: Chord, ctrl = 'Ctrl', plus = '+') {
  // Named keys like "escape" read as "Escape"; single characters are upper-cased.
  const name = key === '+' ? plus : key[0]!.toUpperCase() + key.slice(1);
  return `${mod ? `${ctrl}+` : ''}${shift ? 'Shift+' : ''}${name}`;
}

function contains(rect: Rect, p: Point) {
  return p.x >= rect.x && p.y >= rect.y && p.x < rect.x + rect.width && p.y < rect.y + rect.height;
}

function ControlButton({ control, iconSize }: { control: Control; iconSize: number }) {
  const { label, Icon, chords, run, disabled, pressed } = control;
  return (
    <button
      type="button"
      className="tool"
      aria-label={label}
      title={`${label} (${chordLabel(chords[0]!)})`}
      aria-keyshortcuts={chords.map((c) => chordLabel(c, 'Control', 'Plus')).join(' ')}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={run}
    >
      <Icon aria-hidden size={iconSize} />
    </button>
  );
}

export function Studio() {
  const [editor, setEditor] = useState(() => newEditor(DEFAULT_SIZE, DEFAULT_SIZE));
  const editorState = useSyncExternalStore(editor.subscribe, editor.getState);
  const { drawing, canUndo, canRedo } = editorState;
  const [tool, setTool] = useState<Tool>('pencil');
  const [color, setColor] = useState(0);
  const [showGrid, setShowGrid] = useState(false);
  const [view, setView] = useState<View>(FIT_VIEW);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [newDrawingOpen, setNewDrawingOpen] = useState(false);
  const [mirror, setMirror] = useState(false);
  const [selection, setSelection] = useState<Rect | null>(null);
  const [clip, setClip] = useState<Clip | null>(null);
  const [floating, setFloating] = useState<Floating | null>(null);
  const placed = floating?.state === editorState ? floating : null;
  // A selection can hang off the canvas after a move; copy and paste use the part on it.
  const visibleSelection = selection && rectOnCanvas(drawing, selection);
  const gesture = useRef<SelectGesture | null>(null);
  const panDrag = useRef<{ start: Point; pan: Point } | null>(null);
  const wheelScroll = useRef(0);

  // Wheel zoom at the cursor. Attached natively because React's wheel listener is
  // passive and can't stop the page from scrolling. Stable, so it subscribes once.
  const listenForWheel = useCallback((stage: HTMLDivElement | null) => {
    if (!stage) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      wheelScroll.current += e.deltaMode === WheelEvent.DOM_DELTA_PIXEL ? e.deltaY : e.deltaY * 16;
      if (Math.abs(wheelScroll.current) < WHEEL_STEP) return;
      // One level per event at most, however big the notch.
      const steps = wheelScroll.current < 0 ? 1 : -1;
      wheelScroll.current = 0;
      const rect = stage.getBoundingClientRect();
      const anchor = {
        x: e.clientX - rect.left - rect.width / 2,
        y: e.clientY - rect.top - rect.height / 2,
      };
      setView((v) => zoomView(v, steps, anchor));
    };
    stage.addEventListener('wheel', onWheel, { passive: false });
    return () => stage.removeEventListener('wheel', onWheel);
  }, []);

  const tools: (Control & { tool: Tool })[] = (
    [
      { tool: 'pencil', label: 'Pencil', Icon: Pencil, key: 'b' },
      { tool: 'eraser', label: 'Eraser', Icon: Eraser, key: 'e' },
      { tool: 'fill', label: 'Fill', Icon: PaintBucket, key: 'f' },
      { tool: 'eyedropper', label: 'Eyedropper', Icon: Pipette, key: 'i' },
      { tool: 'select', label: 'Select', Icon: SquareDashed, key: 'm' },
    ] as const
  ).map(({ key, ...t }) => ({
    ...t,
    chords: [{ key }],
    run: () => setTool(t.tool),
    pressed: tool === t.tool,
  }));

  const actions: Control[] = [
    {
      label: 'New drawing',
      Icon: FilePlus,
      chords: [{ key: 'n' }],
      run: () => setNewDrawingOpen(true),
    },
    {
      label: 'Undo',
      Icon: Undo2,
      chords: [{ key: 'z', mod: true, shift: false }],
      run: editor.undo,
      disabled: !canUndo,
    },
    {
      label: 'Redo',
      Icon: Redo2,
      chords: [
        { key: 'z', mod: true, shift: true },
        { key: 'y', mod: true },
      ],
      run: editor.redo,
      disabled: !canRedo,
    },
    {
      label: 'Copy',
      Icon: Copy,
      chords: [{ key: 'c', mod: true }],
      run: () => visibleSelection && setClip(copyPixels(drawing, visibleSelection)),
      disabled: !visibleSelection,
    },
    {
      label: 'Paste',
      Icon: ClipboardPaste,
      chords: [{ key: 'v', mod: true }],
      run: pasteClip,
      disabled: !clip,
    },
    {
      label: 'Deselect',
      Icon: SquareX,
      chords: [{ key: 'escape' }],
      run: deselect,
      disabled: !selection,
    },
    {
      label: 'Zoom in',
      Icon: ZoomIn,
      chords: [{ key: '+' }, { key: '=' }],
      run: () => setView((v) => zoomView(v, 1)),
      disabled: !canZoom(view, 1),
    },
    {
      label: 'Zoom out',
      Icon: ZoomOut,
      chords: [{ key: '-' }],
      run: () => setView((v) => zoomView(v, -1)),
      disabled: !canZoom(view, -1),
    },
    {
      label: 'Fit to view',
      Icon: Scan,
      chords: [{ key: '0' }],
      run: () => setView(FIT_VIEW),
      disabled: view === FIT_VIEW,
    },
    {
      label: 'Pixel grid',
      Icon: Grid3x3,
      chords: [{ key: 'g' }],
      run: () => setShowGrid((g) => !g),
      pressed: showGrid,
    },
    {
      label: 'Mirror symmetry',
      Icon: FlipHorizontal2,
      chords: [{ key: 's' }],
      run: () => setMirror((m) => !m),
      pressed: mirror,
    },
  ];

  const panKeys: Record<string, [number, number]> = {
    arrowleft: [PAN_STEP, 0],
    arrowright: [-PAN_STEP, 0],
    arrowup: [0, PAN_STEP],
    arrowdown: [0, -PAN_STEP],
  };

  function strokeCommand(points: readonly Point[]): Command {
    return tool === 'eraser'
      ? { type: 'eraser', points, mirror }
      : { type: 'pencil', color, points, mirror };
  }

  function deselect() {
    setSelection(null);
    setFloating(null);
  }

  function pasteClip() {
    if (!clip) return;
    // Over the current selection, so copy then paste lands on the original, ready to drag off.
    const at = visibleSelection ? { x: visibleSelection.x, y: visibleSelection.y } : { x: 0, y: 0 };
    const place = (p: Point): Command => ({ type: 'paste', clip, at: p });
    editor.apply(place(at));
    const rect = { ...at, width: clip.width, height: clip.height };
    setSelection(rect);
    setFloating({ rect, place, state: editor.getState() });
    setTool('select');
  }

  function press(at: Point) {
    gesture.current = null;
    // Even a command that changes nothing starts a new undo step, which a floating
    // block's next drag would replace instead of its own.
    if (tool !== 'select') setFloating(null);
    switch (tool) {
      case 'pencil':
      case 'eraser':
        editor.apply(strokeCommand([at]));
        return;
      case 'fill':
        editor.apply({ type: 'fill', color, at, mirror });
        return;
      case 'select':
        if (selection && contains(selection, at)) {
          const from = selection;
          const block = placed ?? {
            rect: from,
            place: (to: Point) => ({ type: 'move', from, to }),
          };
          gesture.current = { kind: 'move', start: at, block, replace: !!placed };
        } else {
          gesture.current = { kind: 'select', start: at };
          setSelection(rectBetween(drawing, at, at));
          setFloating(null);
        }
        return;
      case 'eyedropper': {
        const picked = getPixel(drawing, at.x, at.y);
        // Picking a transparent pixel means "draw transparency", which is the eraser.
        if (picked === TRANSPARENT) {
          setTool('eraser');
        } else {
          setColor(picked);
          setTool('pencil');
        }
        return;
      }
    }
  }

  function drag(from: Point, to: Point) {
    if (tool === 'pencil' || tool === 'eraser') {
      editor.apply(strokeCommand([from, to]), { mergeWithLast: true });
      return;
    }
    const g = gesture.current;
    if (g?.kind === 'select') {
      setSelection(rectBetween(drawing, g.start, to));
    } else if (g?.kind === 'move') {
      const { rect, place } = g.block;
      const at = { x: rect.x + to.x - g.start.x, y: rect.y + to.y - g.start.y };
      // The first drag of a fresh move is a new step; every later one replaces it.
      editor.apply(place(at), { replaceLast: g.replace });
      g.replace = true;
      const moved = { ...rect, ...at };
      setSelection(moved);
      setFloating({ rect: moved, place, state: editor.getState() });
    }
  }

  function createNewDrawing(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setEditor(newEditor(Number(form.get('width')), Number(form.get('height'))));
    setView(FIT_VIEW);
    setSelection(null);
    setNewDrawingOpen(false);
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.target instanceof HTMLInputElement || e.altKey) return;
    if (e.key === ' ') {
      setSpaceHeld(true);
      // Let Space still press a focused button.
      if (!(e.target instanceof HTMLButtonElement)) e.preventDefault();
      return;
    }
    const pan = !(e.ctrlKey || e.metaKey) && panKeys[e.key.toLowerCase()];
    if (pan) {
      setView((v) => panView(v, ...pan));
      e.preventDefault();
      return;
    }
    const control = [...tools, ...actions].find((c) => c.chords.some((chord) => matches(chord, e)));
    // A disabled control leaves the key to the browser, so Ctrl+C with no selection still copies page text.
    if (!control || control.disabled) return;
    e.preventDefault();
    control.run();
  }

  // Studio-wide keyboard shortcuts. A ref callback with cleanup (not an effect):
  // it re-subscribes each render so the handler always sees current state.
  function listenForKeys(node: HTMLDivElement | null) {
    if (!node) return;
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === ' ') setSpaceHeld(false);
    };
    const onBlur = () => setSpaceHeld(false);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }

  const zoom = viewZoom(view);
  const longest = Math.max(drawing.width, drawing.height);
  const zoomedStyle = {
    '--w': (zoom * drawing.width) / longest,
    '--h': (zoom * drawing.height) / longest,
    transform: `translate(calc(-50% + ${view.pan.x}px), calc(-50% + ${view.pan.y}px))`,
  } as CSSProperties;

  return (
    <div className="page studio" ref={listenForKeys}>
      <Nav current="studio" />
      <main className="studio-main">
        <div
          className="pill tool-pill"
          role="toolbar"
          aria-label="Tools"
          aria-orientation="vertical"
        >
          {tools.map((t) => (
            <ControlButton key={t.label} control={t} iconSize={22} />
          ))}
        </div>
        <div className="studio-center">
          <div className="pill action-pill" role="toolbar" aria-label="Actions">
            {actions.map((a) => (
              <ControlButton key={a.label} control={a} iconSize={20} />
            ))}
          </div>
          {newDrawingOpen && (
            <form
              className="card new-drawing"
              aria-label="New drawing"
              onSubmit={createNewDrawing}
              onKeyDown={(e) => e.key === 'Escape' && setNewDrawingOpen(false)}
            >
              <label>
                Width
                <input
                  name="width"
                  type="number"
                  required
                  min={1}
                  max={MAX_DRAWING_SIZE}
                  step={1}
                  defaultValue={drawing.width}
                  autoFocus
                />
              </label>
              <label>
                Height
                <input
                  name="height"
                  type="number"
                  required
                  min={1}
                  max={MAX_DRAWING_SIZE}
                  step={1}
                  defaultValue={drawing.height}
                />
              </label>
              <button type="submit" className="btn primary">
                Create
              </button>
              <button type="button" className="btn" onClick={() => setNewDrawingOpen(false)}>
                Cancel
              </button>
              <p className="hint">
                Up to {MAX_DRAWING_SIZE}x{MAX_DRAWING_SIZE}. Replaces the current drawing.
              </p>
            </form>
          )}
          <div
            ref={listenForWheel}
            className={`stage${spaceHeld ? ' panning' : ''}`}
            onMouseDown={(e) => {
              // Stop the middle button's autoscroll so it can pan instead.
              if (e.button === 1) e.preventDefault();
            }}
            onPointerDownCapture={(e) => {
              if (!(e.button === 1 || (e.button === 0 && spaceHeld))) return;
              // Pan instead of drawing: keep the press from reaching the canvas.
              e.stopPropagation();
              e.currentTarget.setPointerCapture(e.pointerId);
              panDrag.current = { start: { x: e.clientX, y: e.clientY }, pan: view.pan };
            }}
            onPointerMove={(e) => {
              const start = panDrag.current;
              if (!start) return;
              setView((v) => ({
                ...v,
                pan: {
                  x: start.pan.x + e.clientX - start.start.x,
                  y: start.pan.y + e.clientY - start.start.y,
                },
              }));
            }}
            onLostPointerCapture={() => (panDrag.current = null)}
          >
            <div className="zoomed-canvas" style={zoomedStyle}>
              <PixelCanvas
                drawing={drawing}
                onPress={press}
                onDrag={drag}
                showGrid={showGrid}
                selection={visibleSelection}
                showMirrorAxis={mirror}
                label={`Studio canvas, ${drawing.width} by ${drawing.height} pixels`}
              />
            </div>
          </div>
          <p className="hint">
            Scroll to zoom. Pan with Space+drag, the middle mouse button or the arrow keys.
          </p>
        </div>
        <div className="pill palette-pill" role="group" aria-label="Palette">
          {drawing.palette.map((c, i) => (
            <button
              key={c}
              type="button"
              className="swatch"
              style={{ background: c }}
              aria-label={`Color ${c}`}
              title={c}
              aria-pressed={color === i}
              onClick={() => setColor(i)}
            />
          ))}
        </div>
      </main>
    </div>
  );
}
