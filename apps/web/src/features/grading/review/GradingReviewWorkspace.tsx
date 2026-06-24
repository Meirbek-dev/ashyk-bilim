'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

import type { KindModule } from '@/features/assessments/registry'
import { useSubmissionStats } from '@/hooks/useSubmissionStats'
import { useSubmissions } from '@/hooks/useSubmissions'
import { AnnotationProvider } from './AnnotationContext'
import ReviewLayout from './components/ReviewLayout'
import SubmissionList from './components/SubmissionList'
import SubmissionInspector from './components/SubmissionInspector'
import GradeForm from './components/GradeForm'
import type { StatusFilter } from './types'

interface GradingReviewWorkspaceProps {
  activityId: number
  assessmentUuid?: string
  activityUuid?: string
  title?: string
  initialSubmissionUuid?: string | null
  kindModule?: KindModule
  initialFilter?: StatusFilter
}

export default function GradingReviewWorkspace({
  activityId,
  assessmentUuid,
  activityUuid,
  title,
  initialSubmissionUuid,
  kindModule,
  initialFilter,
}: GradingReviewWorkspaceProps) {
  const searchParams = useSearchParams()
  const router = useRouter()

  // ── URL-persisted filters ─────────────────────────────────────────────────
  const filterFromUrl = (searchParams.get('filter') as StatusFilter | null) ?? initialFilter ?? 'NEEDS_GRADING'
  const sortFromUrl = searchParams.get('sort') ?? 'submitted_at'
  const searchFromUrl = searchParams.get('q') ?? ''

  const [activeFilter, setActiveFilter] = useState<StatusFilter>(filterFromUrl)
  const [search, setSearch] = useState(searchFromUrl)
  const [sortBy, setSortBy] = useState(sortFromUrl)

  const [prevFilterFromUrl, setPrevFilterFromUrl] = useState(filterFromUrl)
  const [prevSearchFromUrl, setPrevSearchFromUrl] = useState(searchFromUrl)
  const [prevSortFromUrl, setPrevSortFromUrl] = useState(sortFromUrl)

  if (filterFromUrl !== prevFilterFromUrl || searchFromUrl !== prevSearchFromUrl || sortFromUrl !== prevSortFromUrl) {
    setPrevFilterFromUrl(filterFromUrl)
    setPrevSearchFromUrl(searchFromUrl)
    setPrevSortFromUrl(sortFromUrl)
    setActiveFilter(filterFromUrl)
    setSearch(searchFromUrl)
    setSortBy(sortFromUrl)
  }

  const updateUrl = useCallback(
    (updates: Partial<{ filter: StatusFilter; sort: string; q: string }>) => {
      const next = new URLSearchParams(searchParams.toString())
      if (updates.filter !== undefined) {
        if (updates.filter === 'NEEDS_GRADING') next.delete('filter')
        else next.set('filter', updates.filter)
      }
      if (updates.sort !== undefined) {
        if (updates.sort === 'submitted_at') next.delete('sort')
        else next.set('sort', updates.sort)
      }
      if (updates.q !== undefined) {
        if (updates.q === '') next.delete('q')
        else next.set('q', updates.q)
      }
      router.replace(`?${next.toString()}`, { scroll: false })
    },
    [router, searchParams],
  )
  const [selectedUuid, setSelectedUuid] = useState<string | null>(initialSubmissionUuid ?? null)
  const [selectedUuids, setSelectedUuids] = useState<Set<string>>(new Set())

  const [prevInitialSubmissionUuid, setPrevInitialSubmissionUuid] = useState(initialSubmissionUuid)
  if (initialSubmissionUuid !== prevInitialSubmissionUuid) {
    setPrevInitialSubmissionUuid(initialSubmissionUuid)
    setSelectedUuid(initialSubmissionUuid ?? null)
  }

  const submissionOptions = {
    activityId,
    assessmentUuid: assessmentUuid ?? null,
    sortBy,
    pageSize: 20,
    ...(activeFilter === 'ALL' ? {} : { status: activeFilter }),
    ...(search ? { search } : {}),
  }

  const { submissions, total, pages, page, setPage, isLoading, mutate } = useSubmissions(submissionOptions)
  const { stats, mutate: mutateStats } = useSubmissionStats(activityId, assessmentUuid ?? null)

  const hasSubmissions = submissions.length > 0
  const firstSubmissionUuid = submissions[0]?.submission_uuid ?? null
  const isSelectedUuidValid = selectedUuid && submissions.some(s => s.submission_uuid === selectedUuid)
  const shouldSelectDefault = hasSubmissions && (!selectedUuid || (!isSelectedUuidValid && selectedUuid !== initialSubmissionUuid))

  if (shouldSelectDefault) {
    setSelectedUuid(firstSubmissionUuid)
  }

  const selectedSubmission = submissions.find(submission => submission.submission_uuid === selectedUuid) ?? null
  const selectedSubmissions = useMemo(
    () => submissions.filter(submission => selectedUuids.has(submission.submission_uuid)),
    [selectedUuids, submissions],
  )
  const selectedIndex = selectedUuid
    ? submissions.findIndex(submission => submission.submission_uuid === selectedUuid)
    : -1

  const refresh = useCallback(async () => {
    await Promise.all([mutate(), mutateStats()])
  }, [mutate, mutateStats])

  const selectByOffset = useCallback(
    (offset: number) => {
      const next = submissions[Math.min(submissions.length - 1, Math.max(0, selectedIndex + offset))]
      if (next) setSelectedUuid(next.submission_uuid)
    },
    [selectedIndex, submissions],
  )

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return
      if (event.key === 'j' || event.key === 'ArrowDown') {
        event.preventDefault()
        selectByOffset(1)
      }
      if (event.key === 'k' || event.key === 'ArrowUp') {
        event.preventDefault()
        selectByOffset(-1)
      }
      if (event.key === 'g' || event.key === 'G') {
        event.preventDefault()
        // Focus the score input in GradeForm (or first item score input)
        const scoreEl =
          (document.getElementById('review-score') as HTMLInputElement | null) ??
          document.querySelector('[data-grade-input]')
        scoreEl?.focus()
        scoreEl?.select()
      }
    }
    globalThis.addEventListener('keydown', handleKeyDown)
    return () => globalThis.removeEventListener('keydown', handleKeyDown)
  }, [selectByOffset])

  const navigation = {
    selectedIndex,
    hasPrevious: selectedIndex > 0,
    hasNext: selectedIndex >= 0 && selectedIndex < submissions.length - 1,
    goPrevious: () => selectByOffset(-1),
    goNext: () => selectByOffset(1),
  }

  return (
    <AnnotationProvider>
      <ReviewLayout
        activityId={activityId}
        total={total}
        selectedSubmissions={selectedSubmissions}
        onBulkRefresh={async () => {
          setSelectedUuids(new Set())
          await refresh()
        }}
        {...(assessmentUuid !== undefined ? { assessmentUuid } : {})}
        {...(title !== undefined ? { title } : {})}
        {...(stats !== undefined ? { stats } : {})}
      >
        <SubmissionList
          submissions={submissions}
          total={total}
          pages={pages}
          page={page}
          activeFilter={activeFilter}
          search={search}
          sortBy={sortBy}
          isLoading={isLoading}
          selectedUuid={selectedUuid}
          selectedUuids={selectedUuids}
          onFilterChange={value => {
            setActiveFilter(value)
            setPage(1)
            updateUrl({ filter: value })
          }}
          onSearchChange={value => {
            setSearch(value)
            setPage(1)
            updateUrl({ q: value })
          }}
          onSortChange={value => {
            setSortBy(value)
            setPage(1)
            updateUrl({ sort: value })
          }}
          onPageChange={setPage}
          onSelectSubmission={setSelectedUuid}
          onToggleSelected={(uuid, checked) =>
            setSelectedUuids(current => {
              const next = new Set(current)
              if (checked) next.add(uuid)
              else next.delete(uuid)
              return next
            })
          }
        />
        <SubmissionInspector
          selectedUuid={selectedUuid}
          fallbackSubmission={selectedSubmission}
          {...(assessmentUuid !== undefined ? { assessmentUuid } : {})}
          {...(activityUuid !== undefined ? { activityUuid } : {})}
          {...(kindModule?.ReviewDetail ? { ReviewDetail: kindModule.ReviewDetail } : {})}
        />
        <GradeForm
          submissionUuid={selectedUuid}
          onSaved={refresh}
          navigation={navigation}
          {...(assessmentUuid !== undefined ? { assessmentUuid } : {})}
        />
      </ReviewLayout>
    </AnnotationProvider>
  )
}
