import { CaretsToAxisDashedVertical, FilePlus, FolderOpen, ImageDown, Images } from 'lucide-react';
import { useState, useSyncExternalStore, type ChangeEvent, type FormEvent } from 'react';
import { MAX_DRAWING_SIZE, type Drawing } from '../core/drawing';
import type { CustomPalette } from '../core/palettes';
import { drawingFromImage, exportPng, MAX_EXPORT_SCALE } from '../core/png';
import type { SavedDrawing, StorageProblem } from '../persistence/store';
import type { CurrentDrawing } from '../persistence/studio';
import type { Control } from './controls';
import { downloadFile } from './download';
import { DrawingEditor } from './DrawingEditor';
import { Nav } from './Nav';
import { WarningBanner } from './WarningBanner';
import { BUNDLED_CHOICES, choiceMatching, customChoices, STARTER_CHOICE } from './palette-choices';
import { PaletteSwatches } from './PaletteSwatches';
import { decodePng } from './png-image';
import { dateTime, thumbnail } from './thumbnail';
import { routeHref } from './router';
import { blankStudioDrawing, studio, useStudio } from './studio-store';

type Panel = 'new-drawing' | 'export' | 'drawings' | null;

const STORAGE_MESSAGES: Record<StorageProblem, string> = {
  unavailable:
    'drawings will not be saved due to site store data being blocked. Try non-private mode, or another browser.',
  full: "browser storage is full, so your latest changes aren't saved. Export a PNG to keep a copy, or free up space and keep drawing.",
};

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

const EXPORT_SCALES = Array.from({ length: MAX_EXPORT_SCALE }, (_, i) => i + 1);

function downloadPng(drawing: Drawing, scale: number) {
  const bytes = exportPng(drawing, scale);
  downloadFile(
    new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'image/png' }),
    `drawing-${drawing.width * scale}x${drawing.height * scale}.png`,
  );
}

async function readPng(file: File): Promise<Drawing> {
  const signature = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  if (!PNG_SIGNATURE.every((b, i) => signature[i] === b)) {
    throw new Error(`${file.name} is not a PNG file.`);
  }
  let image: ImageData;
  try {
    image = await decodePng(file);
  } catch {
    throw new Error(`${file.name} could not be read as a PNG image.`);
  }
  return drawingFromImage(image);
}

export function Studio() {
  const state = useStudio();
  if (state.status === 'loading') {
    return (
      <div className="page studio">
        <Nav current="studio" />
        <main className="studio-main" aria-busy="true" />
      </div>
    );
  }
  return (
    <StudioEditor
      current={state.current}
      drawings={state.drawings}
      palettes={state.palettes}
      problem={state.problem}
    />
  );
}

function StudioEditor({
  current,
  drawings,
  palettes,
  problem,
}: {
  current: CurrentDrawing;
  drawings: readonly SavedDrawing[];
  palettes: readonly CustomPalette[];
  problem: StorageProblem | null;
}) {
  const { editor } = current;
  const { drawing } = useSyncExternalStore(editor.subscribe, editor.getState);
  const [panel, setPanel] = useState<Panel>(null);
  const [exportScale, setExportScale] = useState(1);
  const [openError, setOpenError] = useState<string | null>(null);
  const [fileInput, setFileInput] = useState<HTMLInputElement | null>(null);
  const [mirror, setMirror] = useState(false);

  const leadingActions: Control[] = [
    {
      label: 'New drawing',
      Icon: FilePlus,
      chords: [{ key: 'n' }],
      run: () => setPanel('new-drawing'),
    },
    {
      label: 'Drawings',
      Icon: Images,
      chords: [{ key: 'd' }],
      run: () => setPanel((p) => (p === 'drawings' ? null : 'drawings')),
      pressed: panel === 'drawings',
    },
    {
      label: 'Open PNG',
      Icon: FolderOpen,
      chords: [{ key: 'o', mod: true }],
      run: () => fileInput?.click(),
    },
    {
      label: 'Export PNG',
      Icon: ImageDown,
      chords: [{ key: 'e', mod: true, shift: true }],
      run: () => setPanel('export'),
    },
  ];

  const trailingActions: Control[] = [
    {
      label: 'Mirror symmetry',
      Icon: CaretsToAxisDashedVertical,
      chords: [{ key: 's' }],
      run: () => setMirror((m) => !m),
      pressed: mirror,
    },
  ];

  function closePanels() {
    setPanel(null);
    setOpenError(null);
  }

  function startDrawing(next: Drawing) {
    studio.create(next);
    closePanels();
  }

  function openDrawing(entry: SavedDrawing) {
    studio.open(entry.id);
    if (entry.id !== current.id) closePanels();
    else setPanel(null);
  }

  async function openPng(e: ChangeEvent<HTMLInputElement>) {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = '';
    if (!file) return;
    try {
      startDrawing(await readPng(file));
    } catch (error) {
      setOpenError(error instanceof Error ? error.message : String(error));
    }
  }

  function exportDrawing(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    downloadPng(drawing, exportScale);
    setPanel(null);
  }

  return (
    <div className="page studio">
      <Nav current="studio" />
      <DrawingEditor
        editor={editor}
        canvasLabel={`Studio canvas, ${drawing.width} by ${drawing.height} pixels`}
        mirror={mirror}
        leadingActions={leadingActions}
        trailingActions={trailingActions}
      >
        <input
          ref={setFileInput}
          type="file"
          accept="image/png"
          aria-label="PNG file"
          hidden
          onChange={openPng}
        />
        {problem && <WarningBanner>{STORAGE_MESSAGES[problem]}</WarningBanner>}
        {openError && (
          <div className="card notice" role="alert">
            <p>{openError}</p>
            <button type="button" className="btn" onClick={() => setOpenError(null)}>
              Dismiss
            </button>
          </div>
        )}
        {panel === 'drawings' && (
          <section
            className="card drawings"
            aria-label="Drawings"
            onKeyDown={(e) => e.key === 'Escape' && setPanel(null)}
          >
            {drawings.length === 0 ? (
              <p className="hint">Nothing kept yet. A drawing is kept from its first change.</p>
            ) : (
              <ul className="drawing-list">
                {drawings.map((d, i) => (
                  <li key={d.id}>
                    <button
                      type="button"
                      className="drawing-item"
                      aria-current={d.id === current.id ? 'true' : undefined}
                      onClick={() => openDrawing(d)}
                      autoFocus={i === 0}
                    >
                      <img
                        src={thumbnail(d.drawing)}
                        alt=""
                        style={{ aspectRatio: `${d.drawing.width} / ${d.drawing.height}` }}
                      />
                      <span className="drawing-size">
                        {d.drawing.width}x{d.drawing.height}
                      </span>
                      <span className="hint">{dateTime.format(d.updatedAt)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <button type="button" className="btn" onClick={() => setPanel(null)}>
              Close
            </button>
          </section>
        )}
        {panel === 'export' && (
          <form
            className="card new-drawing export-png"
            aria-label="Export PNG"
            onSubmit={exportDrawing}
            onKeyDown={(e) => e.key === 'Escape' && setPanel(null)}
          >
            <label>
              Scale
              <select
                value={exportScale}
                onChange={(e) => setExportScale(Number(e.currentTarget.value))}
                autoFocus
              >
                {EXPORT_SCALES.map((s) => (
                  <option key={s} value={s}>
                    {s}x
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="btn primary">
              Export
            </button>
            <button type="button" className="btn" onClick={() => setPanel(null)}>
              Cancel
            </button>
            <p className="hint">
              Saves a {drawing.width * exportScale}x{drawing.height * exportScale} PNG. Each pixel
              becomes a sharp {exportScale}x{exportScale} block.
            </p>
          </form>
        )}
        {panel === 'new-drawing' && (
          <NewDrawingForm
            drawing={drawing}
            palettes={palettes}
            onCreate={startDrawing}
            onCancel={() => setPanel(null)}
          />
        )}
      </DrawingEditor>
    </div>
  );
}

function NewDrawingForm({
  drawing,
  palettes,
  onCreate,
  onCancel,
}: {
  drawing: Drawing;
  palettes: readonly CustomPalette[];
  onCreate: (drawing: Drawing) => void;
  onCancel: () => void;
}) {
  const ownChoices = customChoices(palettes);
  const paletteChoices = [STARTER_CHOICE, ...BUNDLED_CHOICES, ...ownChoices];
  const [newPaletteValue, setNewPaletteValue] = useState(
    () => choiceMatching(paletteChoices, drawing.palette).value,
  );
  const newPalette = paletteChoices.find((c) => c.value === newPaletteValue) ?? STARTER_CHOICE;

  function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    onCreate(
      blankStudioDrawing(Number(form.get('width')), Number(form.get('height')), newPalette.colors),
    );
  }

  return (
    <form
      className="card new-drawing"
      aria-label="New drawing"
      onSubmit={create}
      onKeyDown={(e) => e.key === 'Escape' && onCancel()}
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
      <label className="palette-choice">
        Palette
        <select
          value={newPalette.value}
          onChange={(e) => setNewPaletteValue(e.currentTarget.value)}
        >
          <option value={STARTER_CHOICE.value}>{STARTER_CHOICE.label}</option>
          <optgroup label="Bundled">
            {BUNDLED_CHOICES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </optgroup>
          {ownChoices.length > 0 && (
            <optgroup label="Yours">
              {ownChoices.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </label>
      <PaletteSwatches colors={newPalette.colors} />
      <button type="submit" className="btn primary">
        Create
      </button>
      <button type="button" className="btn" onClick={onCancel}>
        Cancel
      </button>
      <p className="hint">
        Up to {MAX_DRAWING_SIZE}x{MAX_DRAWING_SIZE}. The current drawing stays in Drawings.{' '}
        <a href={routeHref.settings}>Make your own palette in Settings.</a>
      </p>
    </form>
  );
}
