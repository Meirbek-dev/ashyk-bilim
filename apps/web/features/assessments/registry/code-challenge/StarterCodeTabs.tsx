'use client';

import { Controller, useFormContext, useWatch } from 'react-hook-form';
import { useMemo } from 'react';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { JUDGE0_LANGUAGES } from '@/components/features/courses/code-challenges/LanguageSelector';
import type { CodeChallengeSettingsForm } from './CodeChallengeStudio';

export default function StarterCodeTabs() {
  const form = useFormContext<CodeChallengeSettingsForm>();
  const watchedLanguages = useWatch({ control: form.control, name: 'allowed_languages' });
  const languages = useMemo(
    () => (watchedLanguages ?? []).map((id) => JUDGE0_LANGUAGES.find((language) => language.id === id)).filter(Boolean),
    [watchedLanguages],
  );

  if (!languages.length) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Starter code</CardTitle>
        <CardDescription>Templates students see when they open the challenge.</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue={String(languages[0]?.id)}>
          <TabsList className="mb-3 flex h-auto flex-wrap justify-start">
            {languages.map((language) => (
              <TabsTrigger
                key={language!.id}
                value={String(language!.id)}
              >
                {language!.name}
              </TabsTrigger>
            ))}
          </TabsList>
          {languages.map((language) => (
            <TabsContent
              key={language!.id}
              value={String(language!.id)}
            >
              <Controller
                control={form.control}
                name={`starter_code.${language!.id}`}
                render={({ field }) => (
                  <Textarea
                    value={field.value ?? ''}
                    onChange={field.onChange}
                    className="min-h-48 font-mono text-sm"
                    placeholder={`Starter code for ${language!.name}`}
                  />
                )}
              />
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  );
}
