import { registerPlugin } from '@capacitor/core';
import type { FaceLivenessPlugin } from './definitions';

const FaceLiveness = registerPlugin<FaceLivenessPlugin>('JenixFaceLiveness', {
  web: () => import('./web').then((m) => new m.FaceLivenessWeb()),
});

export * from './definitions';
export * from './similarity';
export { FaceLiveness };
