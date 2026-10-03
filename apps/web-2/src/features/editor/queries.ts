import { createBlockMutation } from '#/shared/api/gen/@tanstack/react-query.gen'

/**
 * Claims a finalized upload as a file block of the activity (otherwise storage reaps the object). No block list is
 * read: saving the content releases the upload of a block that left it (server BUG-263).
 */
export const createBlockOptions = () => createBlockMutation()
