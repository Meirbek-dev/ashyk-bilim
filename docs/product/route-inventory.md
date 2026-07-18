# Route Inventory

Routes use the localized App Router shell under `apps/web/src/app/[locale]`.

## Public

| Route                                        | Owner       | Audience      | Purpose                         |
| -------------------------------------------- | ----------- | ------------- | ------------------------------- |
| `/`                                          | Marketing   | All           | Home redirect or public landing |
| `/login`                                     | Auth        | Anonymous     | Sign in                         |
| `/signup`                                    | Auth        | Anonymous     | Registration                    |
| `/courses`                                   | Learning    | Learner       | Browse published courses        |
| `/course/[courseuuid]`                       | Learning    | Learner       | Course detail                   |
| `/course/[courseuuid]/activity/[activityid]` | Learning    | Learner       | Activity player                 |
| `/collections`                               | Learning    | Learner       | Browse collections              |
| `/collection/[collectionid]`                 | Learning    | Learner       | Collection detail               |
| `/trail`                                     | Learning    | Learner       | Learning trail                  |
| `/search`                                    | Learning    | Learner       | Search                          |
| `/assessments/[assessmentUuid]`              | Assessments | Learner       | Assessment attempt              |
| `/certificates/[uuid]/verify`                | Credentials | Public        | Certificate verification        |
| `/unauthorized`                              | Platform    | Authenticated | Permission denial               |

## Dashboard Shell

| Route                                      | Owner    | Audience                | Purpose                                |
| ------------------------------------------ | -------- | ----------------------- | -------------------------------------- |
| `/dash`                                    | Platform | Learner, Teacher, Admin | Role-aware work queue and Browse tools |
| `/dash/user-account/settings`              | Account  | Authenticated           | Account settings redirect              |
| `/dash/user-account/settings/general`      | Account  | Authenticated           | Profile basics                         |
| `/dash/user-account/settings/profile`      | Account  | Authenticated           | Profile details                        |
| `/dash/user-account/settings/security`     | Account  | Authenticated           | Security settings                      |
| `/dash/user-account/settings/gamification` | Account  | Authenticated           | Gamification preferences               |

## Teacher Workspace

| Route                                                     | Owner             | Audience | Purpose              |
| --------------------------------------------------------- | ----------------- | -------- | -------------------- |
| `/dash/courses`                                           | Course Management | Teacher  | Editable course list |
| `/dash/courses/new`                                       | Course Management | Teacher  | Course creation      |
| `/dash/courses/[courseuuid]`                              | Course Management | Teacher  | Course workspace     |
| `/dash/courses/[courseuuid]/details`                      | Course Management | Teacher  | Course metadata      |
| `/dash/courses/[courseuuid]/access`                       | Course Management | Teacher  | Enrollment/access    |
| `/dash/courses/[courseuuid]/certificate`                  | Course Management | Teacher  | Certificate setup    |
| `/dash/courses/[courseuuid]/collaboration`                | Course Management | Teacher  | Contributors         |
| `/dash/courses/[courseuuid]/curriculum`                   | Course Management | Teacher  | Curriculum editor    |
| `/dash/courses/[courseuuid]/gradebook`                    | Grading           | Teacher  | Course gradebook     |
| `/dash/courses/[courseuuid]/review`                       | Course Quality    | Teacher  | Course review        |
| `/dash/courses/[courseuuid]/activity/[activityid]/studio` | Authoring         | Teacher  | Activity studio      |
| `/dash/courses/[courseuuid]/activity/[activityid]/review` | Grading           | Teacher  | Activity review      |

## Analytics

| Route                                                         | Owner     | Audience      | Purpose                   |
| ------------------------------------------------------------- | --------- | ------------- | ------------------------- |
| `/dash/analytics`                                             | Analytics | Teacher       | Redirect to overview      |
| `/dash/analytics/overview`                                    | Analytics | Teacher       | Teacher overview          |
| `/dash/analytics/courses`                                     | Analytics | Teacher       | Course analytics list     |
| `/dash/analytics/courses/[courseuuid]`                        | Analytics | Teacher       | Course analytics detail   |
| `/dash/analytics/learners/at-risk`                            | Analytics | Teacher       | At-risk learner watchlist |
| `/dash/analytics/assessments`                                 | Analytics | Teacher       | Assessment analytics      |
| `/dash/analytics/assessments/[assessmentType]/[assessmentId]` | Analytics | Teacher       | Assessment detail         |
| `/dash/analytics/performance`                                 | Analytics | Teacher       | Performance analytics     |
| `/dash/analytics/watchlist`                                   | Analytics | Teacher       | Saved watchlist           |
| `/dash/analytics/operations`                                  | Analytics | Teacher/Admin | Operations view           |
| `/dash/analytics/admin`                                       | Analytics | Admin         | Admin analytics           |

## Administration

| Route                             | Owner          | Audience | Purpose                     |
| --------------------------------- | -------------- | -------- | --------------------------- |
| `/dash/users/settings`            | Access Control | Admin    | User settings redirect      |
| `/dash/users/settings/users`      | Access Control | Admin    | User management             |
| `/dash/users/settings/usergroups` | Access Control | Admin    | User group management       |
| `/dash/admin`                     | Platform Admin | Admin    | Admin hub and AI operations |
| `/dash/admin/roles`               | Platform Admin | Admin    | Role management             |
| `/dash/admin/users`               | Platform Admin | Admin    | User-role assignments       |

## Product Gaps

- Learner dashboard feed does not have a dedicated backend contract yet.
- `/dash/users/settings/users` and `/dash/admin/users` overlap; consolidate naming before a larger admin IA pass.
- Analytics routes expose several peer views; the dashboard now links only to action-oriented destinations.
- Inline quizzes are fully removed; migration `a4b5c6d7e8f9` purges stored nodes and backing records.
