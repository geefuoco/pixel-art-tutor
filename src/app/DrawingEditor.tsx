import {
  ClipboardPaste,
  Copy,
  Eraser,
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
} from 'lucide-react';
import {
  useCallback,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { getPixel, TRANSPARENT, type Color, type Command, type Point } from '../core/drawing';
import type { Editor } from '../core/editor';
import { createSelectTool, type SelectTool } from '../core/select';
import { canZoom, FIT_VIEW, panView, viewZoom, zoomView, type View } from '../core/view';
import { ControlButton, matches, type Control } from './controls';
import { PixelCanvas, type CanvasMarks, type OnionSkinView } from './PixelCanvas';

type Tool = 'pencil' | 'eraser' | 'fill' | 'eyedropper' | 'select';

const PAN_STEP = 32;
const WHEEL_STEP = 40;

const selectTools = new WeakMap<Editor, SelectTool>();

function selectToolFor(editor: Editor): SelectTool {
  let tool = selectTools.get(editor);
  if (!tool) {
    tool = createSelectTool(editor);
    selectTools.set(editor, tool);
  }
  return tool;
}

export function DrawingEditor({
  editor,
  canvasLabel,
  mirror = false,
  leadingActions = [],
  trailingActions = [],
  marks,
  onion,
  shortcuts = [],
  below,
  children,
}: {
  editor: Editor;
  canvasLabel: string;
  mirror?: boolean;
  leadingActions?: Control[];
  trailingActions?: Control[];
  marks?: CanvasMarks;
  onion?: OnionSkinView;
  shortcuts?: Control[];
  below?: ReactNode;
  children?: ReactNode;
}) {
  const selectTool = selectToolFor(editor);
  const { drawing, canUndo, canRedo } = useSyncExternalStore(editor.subscribe, editor.getState);
  const { selection, canCopy, canPaste } = useSyncExternalStore(
    selectTool.subscribe,
    selectTool.getState,
  );
  const [tool, setTool] = useState<Tool>('pencil');
  const [colorChoice, setColorChoice] = useState<{ palette: readonly Color[]; color: number }>({
    palette: drawing.palette,
    color: 0,
  });
  const color = colorChoice.palette === drawing.palette ? colorChoice.color : 0;
  const setColor = (next: number) => setColorChoice({ palette: drawing.palette, color: next });
  const [showGrid, setShowGrid] = useState(false);
  const [viewChoice, setViewChoice] = useState<{ editor: Editor; view: View }>({
    editor,
    view: FIT_VIEW,
  });
  const view = viewChoice.editor === editor ? viewChoice.view : FIT_VIEW;
  const setView = (change: (v: View) => View) =>
    setViewChoice((c) => ({ editor, view: change(c.editor === editor ? c.view : FIT_VIEW) }));
  const [spaceHeld, setSpaceHeld] = useState(false);
  const panDrag = useRef<{ start: Point; pan: Point } | null>(null);
  const wheelScroll = useRef(0);

  const listenForWheel = useCallback(
    (stage: HTMLDivElement | null) => {
      if (!stage) return;
      const onWheel = (e: WheelEvent) => {
        e.preventDefault();
        wheelScroll.current +=
          e.deltaMode === WheelEvent.DOM_DELTA_PIXEL ? e.deltaY : e.deltaY * 16;
        if (Math.abs(wheelScroll.current) < WHEEL_STEP) return;
        const steps = wheelScroll.current < 0 ? 1 : -1;
        wheelScroll.current = 0;
        const rect = stage.getBoundingClientRect();
        const anchor = {
          x: e.clientX - rect.left - rect.width / 2,
          y: e.clientY - rect.top - rect.height / 2,
        };
        setViewChoice((c) => ({
          editor,
          view: zoomView(c.editor === editor ? c.view : FIT_VIEW, steps, anchor),
        }));
      };
      stage.addEventListener('wheel', onWheel, { passive: false });
      return () => stage.removeEventListener('wheel', onWheel);
    },
    [editor],
  );

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

  const editing: Control[] = [
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
      run: selectTool.copy,
      disabled: !canCopy,
    },
    {
      label: 'Paste',
      Icon: ClipboardPaste,
      chords: [{ key: 'v', mod: true }],
      run: () => {
        selectTool.paste();
        setTool('select');
      },
      disabled: !canPaste,
    },
    {
      label: 'Deselect',
      Icon: SquareX,
      chords: [{ key: 'escape' }],
      run: selectTool.deselect,
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
      run: () => setView(() => FIT_VIEW),
      disabled: view === FIT_VIEW,
    },
    {
      label: 'Pixel grid',
      Icon: Grid3x3,
      chords: [{ key: 'g' }],
      run: () => setShowGrid((g) => !g),
      pressed: showGrid,
    },
  ];
  const actions = [...leadingActions, ...editing, ...trailingActions];

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

  function press(at: Point) {
    switch (tool) {
      case 'pencil':
      case 'eraser':
        editor.apply(strokeCommand([at]));
        return;
      case 'fill':
        editor.apply({ type: 'fill', color, at, mirror });
        return;
      case 'select':
        selectTool.press(at);
        return;
      case 'eyedropper': {
        const picked = getPixel(drawing, at.x, at.y);
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
    } else if (tool === 'select') {
      selectTool.drag(to);
    }
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.altKey) {
      return;
    }
    if (e.key === ' ') {
      setSpaceHeld(true);
      if (!(e.target instanceof HTMLButtonElement)) e.preventDefault();
      return;
    }
    const pan = !(e.ctrlKey || e.metaKey) && panKeys[e.key.toLowerCase()];
    if (pan) {
      setView((v) => panView(v, ...pan));
      e.preventDefault();
      return;
    }
    const control = [...tools, ...actions, ...shortcuts].find((c) =>
      c.chords.some((chord) => matches(chord, e)),
    );
    if (!control || control.disabled) return;
    e.preventDefault();
    control.run();
  }

  function listenForKeys(node: HTMLElement | null) {
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
    <main className="studio-main" ref={listenForKeys}>
      <div className="pill tool-pill" role="toolbar" aria-label="Tools" aria-orientation="vertical">
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
        {children}
        <div
          ref={listenForWheel}
          className={`stage${spaceHeld ? ' panning' : ''}`}
          onMouseDown={(e) => {
            if (e.button === 1) e.preventDefault();
          }}
          onPointerDownCapture={(e) => {
            if (!(e.button === 1 || (e.button === 0 && spaceHeld))) return;
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
              selection={selection}
              showMirrorAxis={mirror}
              marks={marks}
              onion={onion}
              label={canvasLabel}
            />
          </div>
        </div>
        <p className="hint">
          Scroll to zoom. Pan with Space+drag, the middle mouse button or the arrow keys.
        </p>
        {below}
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
  );
}
