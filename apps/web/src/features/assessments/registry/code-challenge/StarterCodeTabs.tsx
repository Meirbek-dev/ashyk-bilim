'use client'

import { Controller, useFormContext, useWatch } from 'react-hook-form'
import { useMemo } from 'react'
import { useTranslations } from 'next-intl'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { CodeEditor } from '@/components/features/courses/code-challenges/CodeEditor'
import { useJudge0Languages } from '@/features/assessments/hooks/code-challenge'
import type { CodeChallengeSettingsForm } from './CodeChallengeStudio'

export default function StarterCodeTabs() {
  const t = useTranslations('Activities.CodeChallenges.form')
  const form = useFormContext<CodeChallengeSettingsForm>()
  const { data: judge0Languages = [] } = useJudge0Languages()
  const watchedLanguages = useWatch({
    control: form.control,
    name: 'allowed_languages',
  })
  const languages = useMemo(
    () => (watchedLanguages ?? []).map(id => judge0Languages.find(language => language.id === id)).filter(Boolean),
    [judge0Languages, watchedLanguages],
  )

  if (!languages.length) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('starterCode')}</CardTitle>
        <CardDescription>{t('starterCodeHint')}</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue={String(languages[0]?.id)}>
          <TabsList className="mb-3 flex h-auto flex-wrap justify-start">
            {languages.map(language => (
              <TabsTrigger key={language!.id} value={String(language!.id)}>
                {language!.name}
              </TabsTrigger>
            ))}
          </TabsList>
          {languages.map(language => (
            <TabsContent key={language!.id} value={String(language!.id)}>
              <Controller
                control={form.control}
                name={`starter_code.${language!.id}`}
                render={({ field }) => (
                  <CodeEditor
                    value={field.value ?? ''}
                    onChange={field.onChange}
                    languageId={language!.id}
                    monacoLanguage={language!.monaco_language}
                    height={260}
                    options={{ minimap: { enabled: false } }}
                  />
                )}
              />
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  )
}
