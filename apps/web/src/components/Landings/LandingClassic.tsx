import NewCollectionButton from '@/components/Objects/Elements/Buttons/NewCollectionButton'
import TypeOfContentTitle from '@/components/Objects/Elements/Titles/TypeOfContentTitle'
import { LoginBonusHandler } from '@/app/_shared/withmenu/_components/LoginBonusHandler'
import CollectionThumbnail from '@components/Objects/Thumbnails/CollectionThumbnail'
import GeneralWrapper from '@/components/Objects/Elements/Wrappers/GeneralWrapper'
import { GamificationProvider } from '@/components/Contexts/GamificationContext'
import { HeroSection } from '@/components/Dashboard/Gamification/hero-section'
import PermissionGuard from '@components/Security/PermissionGuard'
import { Actions, Resources, Scopes } from '@/types/permissions'
import type { DashboardData } from '@/types/gamification'
import { getAbsoluteUrl } from '@services/config/config'
import CreateCourseTrigger from './CreateCourseTrigger'
import { BookOpen, FolderKanban } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import CourseGridClient from './CourseGridClient'
import Link from '@/components/ui/ServerLink'
import { cn } from '@/lib/utils'

// Types
interface LandingClassicProps {
  courses: AppCourse[]
  totalCourses: number
  collections: AppCollection[]
  gamificationData?: DashboardData | null
  trailData: AppTrailData | null
  isAuthenticated: boolean
}

interface EmptyStateProps {
  t: AppTranslator
}

interface GridProps {
  collections: AppCollection[]
}

// Empty State Components
const EmptyState = ({
  icon: Icon,
  title,
  description,
  className,
}: {
  icon: React.ElementType
  title: string
  description: React.ReactNode
  className?: string
}) => (
  <div className={cn('col-span-full flex items-center justify-center py-16', className)}>
    <div className="max-w-md space-y-3 text-center">
      <Icon className="text-muted-foreground mx-auto h-8 w-8" strokeWidth={1.5} />
      <div className="space-y-1.5">
        <h3 className="text-foreground text-base font-semibold">{title}</h3>
        <p className="text-muted-foreground text-sm leading-relaxed">{description}</p>
      </div>
    </div>
  </div>
)

const EmptyCollectionsState = ({ t }: EmptyStateProps) => (
  <EmptyState
    icon={FolderKanban}
    title={t('Collections.noContent')}
    description={t('Collections.noContentDescription')}
  />
)

const EmptyCoursesState = ({ t }: EmptyStateProps) => (
  <EmptyState icon={BookOpen} title={t('Courses.noContent')} description={t('Courses.noContentDescription')} />
)

// Collection Grid Component
const CollectionGrid = ({ collections }: GridProps) => (
  <div className="grid w-full grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
    {collections.map((collection: AppCollection) => (
      <CollectionThumbnail key={collection.collection_uuid} collection={collection} />
    ))}
  </div>
)

// Section Header Component
const SectionHeader = ({ title, type, action }: { title: string; type: 'cou' | 'col'; action?: React.ReactNode }) => (
  <div className="flex items-center justify-between gap-4">
    <TypeOfContentTitle title={title} type={type} />
    {action && <div className="flex-shrink-0">{action}</div>}
  </div>
)

// Main Component
const LandingClassic = async ({
  courses,
  totalCourses,
  collections,
  gamificationData,
  trailData,
  isAuthenticated,
}: LandingClassicProps) => {
  const t = await getTranslations('HomePage')
  const gamificationProfile = gamificationData?.profile
  const userRank = gamificationData?.user_rank

  const hasCourses = courses.length > 0 || totalCourses > 0
  const hasCollections = collections.length > 0

  return (
    <GamificationProvider initialData={gamificationData === undefined ? undefined : { dashboard: gamificationData }}>
      <LoginBonusHandler />
      <div className="min-h-screen w-full">
        <GeneralWrapper>
          <div className="space-y-12">
            {gamificationProfile && (
              <section>
                <HeroSection profile={gamificationProfile} {...(userRank === undefined ? {} : { userRank })} />
              </section>
            )}

            {/* Courses Section */}
            <section className="space-y-6">
              <SectionHeader title={t('Courses.title')} type="cou" action={<CreateCourseTrigger />} />

              <div className="min-h-[200px]">
                {hasCourses ? (
                  <CourseGridClient
                    initialCourses={courses}
                    initialTotal={totalCourses}
                    trailData={trailData}
                    currentPage={1}
                    isAuthenticated={isAuthenticated}
                  />
                ) : (
                  <EmptyCoursesState t={t} />
                )}
              </div>
            </section>

            {/* Collections Section */}
            <section className="space-y-6 pb-12">
              <SectionHeader
                title={t('Collections.title')}
                type="col"
                action={
                  <PermissionGuard action={Actions.CREATE} resource={Resources.COLLECTION} scope={Scopes.APP}>
                    <Link
                      href={getAbsoluteUrl('/collections/new')}
                      className="focus:ring-primary inline-block rounded focus:ring-2 focus:ring-offset-2 focus:outline-none"
                    >
                      <NewCollectionButton />
                    </Link>
                  </PermissionGuard>
                }
              />

              <div className="min-h-[200px]">
                {hasCollections ? <CollectionGrid collections={collections} /> : <EmptyCollectionsState t={t} />}
              </div>
            </section>
          </div>
        </GeneralWrapper>
      </div>
    </GamificationProvider>
  )
}

export default LandingClassic
