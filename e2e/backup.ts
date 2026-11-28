export function backupWithPassedTraces(lessonIds: readonly string[], finishedAt: string) {
  return JSON.stringify({
    format: 'pixel-art-tutor-backup',
    version: 11,
    studioDrawings: [],
    customPalettes: [],
    attempts: lessonIds.map((lessonId) => ({
      id: `passed-trace-${lessonId}`,
      lessonId,
      mode: 'trace',
      animation: {
        width: 8,
        height: 8,
        palette: ['#000000'],
        frames: [Array.from({ length: 64 }, () => -1)],
        fps: 8,
      },
      score: 1,
      hintFlashes: 0,
      inGallery: true,
      finishedAt: new Date(finishedAt).getTime(),
    })),
    inProgressAttempts: [],
    progress: lessonIds.map((lessonId) => ({ lessonId, passedModes: ['trace'] })),
    personalLessons: [],
    promptDrawings: [],
  });
}
