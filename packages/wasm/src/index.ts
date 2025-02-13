import type { Event, Integration, StackFrame } from '@sentry/types';

import { patchWebAssembly } from './patchWebAssembly';
import { getImage, getImages } from './registry';

/** plz don't */
function patchFrames(frames: Array<StackFrame>): boolean {
  let haveWasm = false;
  frames.forEach(frame => {
    if (!frame.filename) {
      return;
    }
    const match = frame.filename.match(/^(.*?):wasm-function\[\d+\]:(0x[a-fA-F0-9]+)$/);
    if (match !== null) {
      const index = getImage(match[1]);
      if (index >= 0) {
        frame.instruction_addr = match[2];
        frame.addr_mode = `rel:${index}`;
        frame.filename = match[1];
        frame.platform = 'native';
        haveWasm = true;
      }
    }
  });
  return haveWasm;
}

/**
 * Process WASM stack traces to support server-side symbolication.
 *
 * This also hooks the WebAssembly loading browser API so that module
 * registraitons are intercepted.
 */
export class Wasm implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'Wasm';

  /**
   * @inheritDoc
   */
  public name: string;

  public constructor() {
    this.name = Wasm.id;
  }

  /**
   * @inheritDoc
   */
  public setupOnce(_addGlobalEventProcessor: unknown, _getCurrentHub: unknown): void {
    patchWebAssembly();
  }

  /** @inheritDoc */
  public processEvent(event: Event): Event {
    let haveWasm = false;

    if (event.exception && event.exception.values) {
      event.exception.values.forEach(exception => {
        if (exception?.stacktrace?.frames) {
          haveWasm = haveWasm || patchFrames(exception.stacktrace.frames);
        }
      });
    }

    if (haveWasm) {
      event.debug_meta = event.debug_meta || {};
      event.debug_meta.images = [...(event.debug_meta.images || []), ...getImages()];
    }

    return event;
  }
}
