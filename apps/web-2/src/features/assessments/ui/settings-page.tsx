import { useSuspenseQuery } from '@tanstack/react-query'
import { useParams } from '@tanstack/react-router'

import { ActivitySettingsPage, SECTION } from '#/features/course-studio'
import { m } from '#/paraglide/messages'
import { Link } from '#/shared/components/link'
import { SettingsPage } from '#/shared/components/templates/settings-page'

import { can } from '../model/route'
import { assessmentOptions, learnersOptions } from '../queries'
import { AccessSection } from './access-section'
import { CopySection } from './copy-section'
import { DetailsSection } from './details-section'
import { JournalSection } from './journal-section'
import { wordingLock } from './labels'
import { OverridesSection } from './overrides-section'
import { PolicySection } from './policy-section'
import { PublishingSection } from './publishing-section'

const SETTINGS = '/_authed/teach/courses/$courseId_/activities/$activityId/settings'
const SECTIONS = ['name', 'details', 'rules', 'access', 'exceptions', 'publishing', 'copy', 'journal'] as const

const navLabels: Record<(typeof SECTIONS)[number], () => string> = {
  name: m.assessments_nav_name,
  details: m.assessments_nav_details,
  rules: m.assessments_nav_rules,
  access: m.assessments_nav_access,
  exceptions: m.assessments_nav_exceptions,
  publishing: m.assessments_nav_publishing,
  copy: m.assessments_nav_copy,
  journal: m.assessments_nav_journal,
}

/** `settings` of a quiz, exam or code challenge: the activity's name, then the assessment's own sections. */
export function AssessmentSettingsPage() {
  const { courseId, activityId } = useParams({ from: SETTINGS })
  const { data: assessment } = useSuspenseQuery(assessmentOptions(activityId))
  const { data: people } = useSuspenseQuery(learnersOptions(assessment.course_id))
  const nav = SECTIONS.map(section => (
    <Link
      key={section}
      to="/teach/courses/$courseId/activities/$activityId/settings"
      params={{ courseId, activityId }}
      hash={section}
      variant="tab"
      activeOptions={{ includeHash: true }}
    >
      {navLabels[section]()}
    </Link>
  ))
  return (
    <SettingsPage title={m.assessments_settings_title()} nav={nav}>
      <div id="name" className={SECTION}>
        <ActivitySettingsPage lock={wordingLock(assessment)} />
      </div>
      <div id="details" className={SECTION}>
        <DetailsSection activityId={activityId} assessment={assessment} />
      </div>
      <div id="rules" className={SECTION}>
        <PolicySection activityId={activityId} assessment={assessment} />
      </div>
      <div id="access" className={SECTION}>
        <AccessSection activityId={activityId} assessment={assessment} learners={people} />
      </div>
      <div id="exceptions" className={SECTION}>
        <OverridesSection assessment={assessment} learners={people} />
      </div>
      <div id="publishing" className={SECTION}>
        <PublishingSection
          courseId={courseId}
          activityId={activityId}
          title={assessment.title}
          assessment={assessment}
        />
      </div>
      {can(assessment, 'duplicate') ? (
        <div id="copy" className={SECTION}>
          <CopySection title={assessment.title} assessment={assessment} />
        </div>
      ) : null}
      <div id="journal" className={SECTION}>
        <JournalSection assessmentId={assessment.id} learners={people} />
      </div>
    </SettingsPage>
  )
}
