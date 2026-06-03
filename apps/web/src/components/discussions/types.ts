export interface DiscussionReplyData {
  id: string
  discussion_uuid: string
  username: string
  firstName: string
  lastName: string
  replyMessage: string
  createDate: string
  updateDate: string
  upvotes: number
  downvotes: number
  userVote: 'up' | 'down' | null
  is_liked?: boolean
  is_disliked?: boolean
}

export interface DiscussionPostData {
  id: string
  discussion_uuid: string
  username: string
  firstName: string
  lastName: string
  postMessage: string
  createDate: string
  updateDate: string
  upvotes: number
  downvotes: number
  userVote: 'up' | 'down' | null
  is_liked?: boolean
  is_disliked?: boolean
  replies: DiscussionReplyData[]
  can_update?: boolean
  can_delete?: boolean
  can_moderate?: boolean
  is_owner?: boolean
  is_creator?: boolean
  available_actions?: string[]
}
