import { createStart } from '@tanstack/react-start'

import { apiErrorAdapter } from '#/shared/api/errors'

// Start's instance options: an ApiError thrown during SSR reaches the browser as an ApiError (403 in place, 7.5).
export const startInstance = createStart(() => ({ serializationAdapters: [apiErrorAdapter] }))
