import { useSyncExternalStore } from 'react';
import { readTechniqueDrills, type TechniqueDrill } from '../core/technique-drill';
import { courseLessonIds } from './lessons-store';
import { decodePng } from './png-image';

const DRILLS_DIR = '/content/drills/';

const techniques = import.meta.glob<unknown>('/content/drills/techniques.json', {
  eager: true,
  import: 'default',
})['/content/drills/techniques.json'];
const manifests = import.meta.glob<unknown>('/content/drills/*/manifest.json', {
  eager: true,
  import: 'default',
});
const starts = import.meta.glob<string>('/content/drills/*/start.png', {
  eager: true,
  query: '?url',
  import: 'default',
});

async function decodeStart(dir: string) {
  const url = starts[`${dir}start.png`];
  if (url === undefined) throw new Error(`The drill in ${dir} has no start.png`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`The starting sprite in ${dir} did not load`);
  return decodePng(await response.blob());
}

async function readShippedDrills(): Promise<readonly TechniqueDrill[]> {
  const drills = await Promise.all(
    Object.entries(manifests).map(async ([path, manifest]) => {
      const dir = path.slice(0, -'manifest.json'.length);
      return { dir, manifest, start: await decodeStart(dir) };
    }),
  );
  const reading = readTechniqueDrills({ techniques, course: courseLessonIds, drills });
  if (!reading.ok) throw new Error(`The Technique Drills are broken: ${reading.problem}`);
  drills.forEach(({ dir }, i) => {
    const id = reading.drills[i]!.id;
    if (dir !== `${DRILLS_DIR}${id}/`) throw new Error(`The drill in ${dir} says its id is ${id}`);
  });
  return reading.drills;
}

let loading: Promise<readonly TechniqueDrill[]> | undefined;
let loaded: readonly TechniqueDrill[] = [];
const listeners = new Set<() => void>();

export function loadTechniqueDrills(): Promise<readonly TechniqueDrill[]> {
  loading ??= readShippedDrills().then((drills) => {
    loaded = drills;
    for (const listener of listeners) listener();
    return drills;
  });
  return loading;
}

function subscribe(listener: () => void) {
  void loadTechniqueDrills().catch(() => {});
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useTechniqueDrills(): readonly TechniqueDrill[] {
  return useSyncExternalStore(subscribe, () => loaded);
}
