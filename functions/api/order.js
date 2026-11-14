// Keep the Pages Function and Advanced Mode order routes on the same implementation.
import worker from '../../public/_worker.js';

export function onRequest(context) {
  return worker.fetch(context.request, context.env, context);
}
