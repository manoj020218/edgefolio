import { DeviceAdapter } from './deviceAdapter.types';
import { u5Adapter } from './u5.adapter';

/**
 * Add a new device brand here — nothing outside this file needs to change.
 * Each adapter only needs to implement DeviceAdapter.parse(); dispatch is by Device.make.
 */
const ADAPTERS: Record<string, DeviceAdapter> = {
  U5: u5Adapter,
};

export function getAdapter(make: string): DeviceAdapter | undefined {
  return ADAPTERS[make?.toUpperCase()];
}
