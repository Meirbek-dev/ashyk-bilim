import * as v from 'valibot'

/**
 * Client-side mirror of the server rules the user can fix before a round
 * trip (`ab_domain::identity::profile`): `http(s)` links and images. The
 * server remains the authority (sizes, unknown kinds → 422 field errors).
 * `t`: DashPage.Notifications.
 */
export const createProfileSchema = (t: AppTranslator) => {
  const httpUrl = v.pipe(v.string(), v.trim(), v.regex(/^https?:\/\/\S+$/, t('Form.invalidUrl')))
  const optionalHttpUrl = v.union([v.pipe(v.string(), v.trim(), v.literal('')), httpUrl])
  const rest = v.object({ id: v.string(), title: v.string() })
  return v.object({
    sections: v.array(
      v.variant('type', [
        v.object({ ...rest.entries, type: v.literal('image-gallery'), images: v.array(v.object({ url: httpUrl })) }),
        v.object({ ...rest.entries, type: v.literal('links'), links: v.array(v.object({ url: httpUrl })) }),
        v.object({
          ...rest.entries,
          type: v.literal('affiliation'),
          affiliations: v.array(v.object({ logoUrl: optionalHttpUrl })),
        }),
        v.object({ ...rest.entries, type: v.literal('text') }),
        v.object({ ...rest.entries, type: v.literal('skills') }),
        v.object({ ...rest.entries, type: v.literal('experience') }),
        v.object({ ...rest.entries, type: v.literal('education') }),
        v.object({ ...rest.entries, type: v.literal('courses') }),
        v.object({ ...rest.entries, type: v.literal('gamification') }),
      ]),
    ),
  })
}
