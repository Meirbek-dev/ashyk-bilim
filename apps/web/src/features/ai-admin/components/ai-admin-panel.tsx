'use client'

import { useTranslations } from 'next-intl'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AIErrorRecovery } from '@/features/ai-experience'

import { useAIUsage } from '../api/use-ai-usage'
import { AIFeatureToggles } from './ai-feature-toggles'
import { BudgetStatus } from './budget-status'
import { TokenUsageChart } from './token-usage-chart'

export function AIAdminPanel() {
  const t = useTranslations('AiExperience.aiAdminPanel')
  const usage = useAIUsage()

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">{t('title')}</h2>
      </div>
      {usage.error ? <AIErrorRecovery message={usage.error.message} /> : null}
      {usage.data ? (
        <div className="grid gap-4 lg:grid-cols-[1fr_24rem]">
          <div className="space-y-4">
            <TokenUsageChart usage={usage.data} />
            <BudgetStatus usage={usage.data} />
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('featureFlags')}</CardTitle>
              <CardDescription>{t('flagsDescription')}</CardDescription>
            </CardHeader>
            <CardContent>
              <AIFeatureToggles />
            </CardContent>
          </Card>
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">{t('loading')}</p>
      )}
    </section>
  )
}
