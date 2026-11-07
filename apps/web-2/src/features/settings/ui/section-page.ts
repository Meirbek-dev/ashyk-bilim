/**
 * A settings section set like a page with a margin: the heading and its one line hang in the left column, the fields
 * run in the right one, and a hairline separates it from the section above. The parent's `@container` decides when the
 * margin opens; the parent stacks sections so that `first:` drops the rule at the top.
 */
export const page =
  'grid scroll-mt-20 gap-x-12 gap-y-5 border-t pt-8 first:border-t-0 first:pt-0 @4xl:grid-cols-[13rem_minmax(0,1fr)]'
