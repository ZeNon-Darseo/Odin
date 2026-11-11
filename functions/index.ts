import { createSiteContext, createDatabaseClient, errorResponse } from './_qoder/backend.mjs';
import { createApplication } from './router.mjs';
import { publicConfig } from './site-config.mjs';

// forwardApplicationCredentials keeps this app's own session cookie; identity is
// fully application-owned (database session digests), with no platform fallback.
const handle = createApplication({ db: createDatabaseClient(), origin: publicConfig.origin });

Deno.serve(async (request) => {
  let context;
  try {
    context = createSiteContext(request, { forwardApplicationCredentials: true });
    return await handle(context);
  } catch (error) {
    return errorResponse(error, context?.requestId);
  }
});