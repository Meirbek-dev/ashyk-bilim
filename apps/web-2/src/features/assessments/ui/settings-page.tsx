import { useSuspenseQuery } from '@tanstack/react-query'
import { useParams } from '@tanstack/react-router'

import { ActivitySettingsPage } from '#/features/course-studio'
import { m } from '#/paraglide/messages'
import { Link } from '#/shared/components/link'
import { SettingsPage } from '#/shared/components/templates/settings-page'

import { can } from '../model/route'
import { assessmentOptions, learnersOptions } from '../queries'
import { AccessSection } from './access-section'
import { CopySection } from './copy-section'
import { DetailsSection } from './details-section'
import { JournalSection } from './journal-section'
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
      <div id="name">
        <ActivitySettingsPage />
      </div>
      <div id="details">
        <DetailsSection activityId={activityId} assessment={assessment} />
      </div>
      <div id="rules">
        <PolicySection activityId={activityId} assessment={assessment} />
      </div>
      <div id="access">
        <AccessSection activityId={activityId} assessment={assessment} learners={people} />
      </div>
      <div id="exceptions">
        <OverridesSection assessment={assessment} learners={people} />
      </div>
      <div id="publishing">
        <PublishingSection
          courseId={courseId}
          activityId={activityId}
          title={assessment.title}
          assessment={assessment}
        />
      </div>
      {can(assessment, 'duplicate') ? (
        <div id="copy">
          <CopySection title={assessment.title} assessment={assessment} />
        </div>
      ) : null}
      <div id="journal">
        <JournalSection assessmentId={assessment.id} />
      </div>
    </SettingsPage>
  )
}
