import { FileUp } from 'lucide-react';
import { useState, type ChangeEvent, type FormEvent } from 'react';
import type { Drawing } from '../core/drawing';
import { deriveSteps, ROLES, type Role } from '../core/lesson';
import {
  MAX_PERSONAL_LESSON_COLORS,
  MAX_PERSONAL_LESSON_SIZE,
  proposeRoles,
  readUpload,
} from '../core/personal-lesson';
import { StorageError, type StorageProblem } from '../persistence/store';
import { Nav } from './Nav';
import { personalLessons } from './personal-lessons-store';
import { decodePngFile } from './png-image';
import { plural } from './plural';
import { routeHref } from './router';
import { STEP_NAMES } from './step-names';
import { thumbnail } from './thumbnail';

const ROLE_NAMES: Record<Role, string> = {
  outline: 'Outline',
  base: 'Base',
  shadow: 'Shadow',
  highlight: 'Highlight',
};

interface Proposal {
  readonly reference: Drawing;
  readonly roles: readonly Role[];
  readonly title: string;
}

function titleOf(fileName: string): string {
  return (
    fileName
      .replace(/\.png$/i, '')
      .replace(/[-_]+/g, ' ')
      .trim() || 'My sprite'
  );
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

const SAVE_PROBLEMS: Record<StorageProblem, string> = {
  full: 'Browser storage is full, so the Personal Lesson could not be saved.',
  unavailable: "Site data is blocked, so the Personal Lesson can't be saved.",
};

function saveProblem(error: unknown) {
  return SAVE_PROBLEMS[error instanceof StorageError ? error.problem : 'unavailable'];
}

export function NewPersonalLesson() {
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function chooseSprite(e: ChangeEvent<HTMLInputElement>) {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = '';
    setProblem(null);
    setProposal(null);
    if (!file) return;
    try {
      const reading = readUpload(await decodePngFile(file));
      if (!reading.ok) {
        setProblem(`${file.name} can't become a Lesson. ${reading.problem}`);
        return;
      }
      const { reference } = reading;
      setProposal({ reference, roles: proposeRoles(reference), title: titleOf(file.name) });
    } catch (error) {
      setProblem(messageOf(error));
    }
  }

  async function save(e: FormEvent<HTMLFormElement>, chosen: Proposal) {
    e.preventDefault();
    setSaving(true);
    setProblem(null);
    try {
      await personalLessons.add({ ...chosen, title: chosen.title.trim() });
      window.location.hash = routeHref.lessons;
    } catch (error) {
      setProblem(saveProblem(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page">
      <Nav current="lessons" />
      <main className="card new-personal-lesson">
        <a className="hint" href={routeHref.lessons}>
          Back to Lessons
        </a>
        <h1>Make a Personal Lesson</h1>
        <p>
          Upload a PNG sprite, up to {MAX_PERSONAL_LESSON_SIZE}x{MAX_PERSONAL_LESSON_SIZE} pixels
          and {MAX_PERSONAL_LESSON_COLORS} colors, and it becomes a Lesson you can play in every
          Mode.
        </p>
        <p className="notice licence-reminder">
          Only upload sprites that are your own art or openly licensed, such as CC0. Checking the
          licence is up to you.
        </p>
        <label className="btn primary upload-button">
          <FileUp size={18} aria-hidden="true" /> Choose a sprite
          <input
            type="file"
            accept="image/png"
            className="visually-hidden"
            onChange={chooseSprite}
          />
        </label>
        {problem && (
          <p className="warning-banner" role="alert">
            {problem}
          </p>
        )}
        {proposal && (
          <RoleReview
            proposal={proposal}
            saving={saving}
            onChange={setProposal}
            onSave={(e) => void save(e, proposal)}
          />
        )}
      </main>
    </div>
  );
}

function RoleReview({
  proposal,
  saving,
  onChange,
  onSave,
}: {
  proposal: Proposal;
  saving: boolean;
  onChange: (proposal: Proposal) => void;
  onSave: (e: FormEvent<HTMLFormElement>) => void;
}) {
  const { reference, roles, title } = proposal;
  const pixelCounts = reference.palette.map(
    (_, color) => reference.pixels.filter((p) => p === color).length,
  );
  const steps = deriveSteps(reference, roles);

  function changeRole(color: number, role: Role) {
    onChange({ ...proposal, roles: roles.map((r, i) => (i === color ? role : r)) });
  }

  return (
    <form className="role-review" aria-label="Review Roles" onSubmit={onSave}>
      <h2>Check the Roles</h2>
      <p className="hint">
        Each color got a Role from its place in the sprite. Fix any that are wrong before saving.
      </p>
      <div className="role-review-body">
        <img
          className="upload-preview"
          src={thumbnail(reference)}
          alt={`Uploaded sprite, ${reference.width} by ${reference.height} pixels`}
        />
        <table className="role-table">
          <thead>
            <tr>
              <th scope="col">Color</th>
              <th scope="col">Pixels</th>
              <th scope="col">Role</th>
            </tr>
          </thead>
          <tbody>
            {reference.palette.map((color, i) => (
              <tr key={color}>
                <td>
                  <span className="role-swatch" style={{ background: color }} aria-hidden="true" />
                  <code>{color}</code>
                </td>
                <td>{pixelCounts[i]}</td>
                <td>
                  <select
                    aria-label={`Role of ${color}`}
                    value={roles[i]}
                    onChange={(e) => changeRole(i, e.currentTarget.value as Role)}
                  >
                    {ROLES.map((role) => (
                      <option key={role} value={role}>
                        {ROLE_NAMES[role]}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p aria-label="Steps">
        {plural(steps.length, 'Step')}: {steps.map((s) => STEP_NAMES[s.kind]).join(', ')}
      </p>
      <label className="field">
        Title
        <input
          value={title}
          required
          maxLength={60}
          onChange={(e) => onChange({ ...proposal, title: e.currentTarget.value })}
        />
      </label>
      <button type="submit" className="btn primary" disabled={saving || title.trim() === ''}>
        Save Personal Lesson
      </button>
    </form>
  );
}
