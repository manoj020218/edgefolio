import { registerPlugin } from '@capacitor/core';
import type { ThermalPrinterPlugin } from './definitions';

const ThermalPrinter = registerPlugin<ThermalPrinterPlugin>('JenixThermalPrinter', {
  web: () => import('./web').then((m) => new m.ThermalPrinterWeb()),
});

export * from './bytes';
export * from './definitions';
export * from './errors';
export * from './transport';
export { ThermalPrinter };
