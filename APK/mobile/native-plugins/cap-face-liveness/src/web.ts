import { WebPlugin } from '@capacitor/core';
import type { FaceCaptureResult, FaceLivenessOptions, FaceLivenessPlugin } from './definitions';

export class FaceLivenessWeb extends WebPlugin implements FaceLivenessPlugin {
  capture(_options?: FaceLivenessOptions): Promise<FaceCaptureResult> {
    return Promise.reject(new Error('Android only plugin'));
  }
}
