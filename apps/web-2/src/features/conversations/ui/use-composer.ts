import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import type { Message } from '#/shared/api/gen/types.gen'

import { readyAttachments, sendBlocker } from '../model/attachments'
import { MAX_BODY } from '../model/feed'
import { sendOptions } from '../queries'
import { useAttachments } from './use-attachments'
import { useDraft } from './use-draft'

/** What the first message is about (where the writer started from); `intervention` records it in analytics. */
export type ComposerContext = {
  course?: string | undefined
  activity?: string | undefined
  intervention?: boolean | undefined
}

const newKey = () => crypto.randomUUID()

/**
 * The composer's state: text, files, the send and its idempotency key. The key belongs to what failed: a changed
 * text or file list is a new message, «Повторить» resends the same one.
 */
export function useComposer(to: string, context: ComposerContext | undefined, onSent?: (message: Message) => void) {
  const [clientKey, setClientKey] = useState(newKey)
  const send = useMutation(sendOptions(useQueryClient()))
  const attachments = useAttachments()
  const { text, edit, setAttached } = useDraft(send.isPending)
  const blocker = sendBlocker(text, attachments.files)
  const changed = () => {
    if (!send.isError) return
    send.reset()
    setClientKey(newKey())
  }
  const submit = () => {
    if (blocker || send.isPending || text.length > MAX_BODY) return
    send.mutate(
      {
        body: {
          to_user_id: to,
          body: text,
          client_key: clientKey,
          attachments: readyAttachments(attachments.files),
          ...(context?.course ? { course_id: context.course } : {}),
          ...(context?.activity ? { activity_id: context.activity } : {}),
          ...(context?.intervention ? { intervention: true } : {}),
        },
      },
      {
        onSuccess: message => {
          edit('')
          setAttached(false)
          attachments.clear()
          setClientKey(newKey())
          onSent?.(message)
        },
      },
    )
  }
  return {
    text,
    edit: (value: string) => {
      edit(value)
      changed()
    },
    files: attachments.files,
    addFiles: (files: File[]) => {
      attachments.add(files)
      setAttached(true)
      changed()
    },
    removeFile: (key: string) => {
      attachments.remove(key)
      setAttached(attachments.files.length > 1)
      changed()
    },
    retryFile: attachments.retry,
    blocker,
    submit,
    send,
  }
}
