import { Palette, Plus, TriangleAlert, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import {
  addPaletteColor,
  BUNDLED_PALETTES,
  changePaletteColor,
  MAX_CUSTOM_PALETTE_COLORS,
  removePaletteColor,
  type CustomPalette,
} from '../core/palettes';
import { StorageError } from '../persistence/store';
import { PaletteSwatches } from './PaletteSwatches';
import { plural } from './plural';
import { studio, useStudio } from './studio-store';

const STORAGE_REFUSED = {
  unavailable: 'Browser storage is unavailable, so palettes cannot be saved.',
  full: 'Browser storage is full, so this palette could not be saved.',
};

function messageOf(error: unknown) {
  if (error instanceof StorageError) return STORAGE_REFUSED[error.problem];
  return error instanceof Error ? error.message : String(error);
}

function newPalette(): CustomPalette {
  return { id: crypto.randomUUID(), name: '', colors: ['#000000'] };
}

export function Palettes() {
  const state = useStudio();
  const custom = state.status === 'ready' ? state.palettes : [];
  const [editing, setEditing] = useState<CustomPalette | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<void>) {
    setError(null);
    try {
      await action();
      return true;
    } catch (e) {
      setError(messageOf(e));
      return false;
    }
  }

  async function save(palette: CustomPalette) {
    if (await run(() => studio.savePalette(palette))) setEditing(null);
  }

  async function remove(id: string) {
    if (!(await run(() => studio.deletePalette(id)))) return;
    setDeleting(null);
    if (editing?.id === id) setEditing(null);
  }

  return (
    <section aria-labelledby="palettes-heading" className="settings-section">
      <h2 id="palettes-heading">Palettes</h2>
      <p className="hint">
        Pick any of these when you start a new drawing in the Studio. Make your own with up to{' '}
        {MAX_CUSTOM_PALETTE_COLORS} colors.
      </p>
      <h3>Bundled</h3>
      <ul className="palette-list">
        {BUNDLED_PALETTES.map((p) => (
          <li key={p.id}>
            <span className="palette-name">
              <strong>{p.name}</strong> <span className="hint">by {p.creator}</span>
            </span>
            <PaletteSwatches colors={p.colors} />
            <span className="hint">{plural(p.colors.length, 'color')}</span>
          </li>
        ))}
      </ul>
      <h3>Yours</h3>
      {custom.length === 0 ? (
        <p className="hint">No palettes of your own yet.</p>
      ) : (
        <ul className="palette-list">
          {custom.map((p) => (
            <li key={p.id}>
              <span className="palette-name">
                <strong>{p.name}</strong>
              </span>
              <PaletteSwatches colors={p.colors} />
              <span className="hint">{plural(p.colors.length, 'color')}</span>
              {deleting === p.id ? (
                <span className="palette-actions">
                  <button type="button" className="btn primary" onClick={() => remove(p.id)}>
                    Delete {p.name}
                  </button>
                  <button type="button" className="btn" onClick={() => setDeleting(null)}>
                    Keep
                  </button>
                </span>
              ) : (
                <span className="palette-actions">
                  <button type="button" className="btn" onClick={() => setEditing(p)}>
                    Edit
                  </button>
                  <button type="button" className="btn" onClick={() => setDeleting(p.id)}>
                    Delete
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {editing ? (
        <PaletteEditor
          key={editing.id}
          initial={editing}
          onSave={save}
          onCancel={() => setEditing(null)}
        />
      ) : (
        <button type="button" className="btn" onClick={() => setEditing(newPalette())}>
          <Palette aria-hidden size={18} /> New palette
        </button>
      )}
      {error && (
        <div className="warning-banner" role="alert">
          <TriangleAlert aria-hidden size={20} />
          <p>{error}</p>
        </div>
      )}
    </section>
  );
}

function PaletteEditor({
  initial,
  onSave,
  onCancel,
}: {
  initial: CustomPalette;
  onSave: (palette: CustomPalette) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial.name);
  const [colors, setColors] = useState(initial.colors);
  const [newColor, setNewColor] = useState('#ffffff');
  const full = colors.length >= MAX_CUSTOM_PALETTE_COLORS;
  const alreadyIn = colors.includes(newColor.toLowerCase());

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    onSave({ id: initial.id, name: name.trim(), colors });
  }

  return (
    <form
      className="card palette-editor"
      aria-label="Edit palette"
      onSubmit={submit}
      onKeyDown={(e) => e.key === 'Escape' && onCancel()}
    >
      <label>
        Name
        <input
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          required
          maxLength={40}
          autoFocus
        />
      </label>
      <ul className="palette-editor-colors">
        {colors.map((c, i) => (
          <li key={i}>
            <input
              type="color"
              value={c}
              aria-label={`Color ${i + 1}`}
              title={c}
              onChange={(e) => setColors(changePaletteColor(colors, i, e.currentTarget.value))}
            />
            <button
              type="button"
              className="tool"
              aria-label={`Remove color ${i + 1}`}
              title={`Remove ${c}`}
              disabled={colors.length === 1}
              onClick={() => setColors(removePaletteColor(colors, i))}
            >
              <X aria-hidden size={14} />
            </button>
          </li>
        ))}
      </ul>
      <div className="palette-editor-add">
        <input
          type="color"
          value={newColor}
          aria-label="New color"
          onChange={(e) => setNewColor(e.currentTarget.value)}
        />
        <button
          type="button"
          className="btn"
          disabled={full || alreadyIn}
          onClick={() => setColors(addPaletteColor(colors, newColor))}
        >
          <Plus aria-hidden size={16} /> Add color
        </button>
        <span className="hint">
          {colors.length} of {MAX_CUSTOM_PALETTE_COLORS} colors
          {full ? '. The palette is full.' : alreadyIn ? '. That color is already in it.' : ''}
        </span>
      </div>
      <div className="settings-actions">
        <button type="submit" className="btn primary" disabled={name.trim() === ''}>
          Save palette
        </button>
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
