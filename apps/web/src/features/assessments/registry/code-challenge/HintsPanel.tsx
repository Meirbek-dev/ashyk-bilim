'use client';

import { Controller, useFieldArray, useFormContext } from 'react-hook-form';
import { Lightbulb, Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldLabel } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { generateUUID } from '@/lib/utils';
import type { CodeChallengeSettingsForm } from './CodeChallengeStudio';

export default function HintsPanel() {
  const t = useTranslations('Activities.CodeChallenges');
  const form = useFormContext<CodeChallengeSettingsForm>();
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'hints' });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Lightbulb className="size-5" />
              {t('hintsPanel.title')}
            </CardTitle>
            <CardDescription>{t('hintsPanel.description')}</CardDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              append({ id: `hint_${generateUUID()}`, order: fields.length + 1, content: '', xp_penalty: 5 })
            }
          >
            <Plus className="size-4" />
            {t('hintsPanel.addHint')}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {!fields.length ? (
          <div className="text-muted-foreground rounded-md border border-dashed p-4 text-center text-sm">
            {t('hintsPanel.empty')}
          </div>
        ) : (
          fields.map((hint, index) => (
            <div
              key={hint.id}
              className="space-y-3 rounded-md border p-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="text-sm font-medium">{t('hintsPanel.hintNumber', { number: index + 1 })}</div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => remove(index)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
              <Controller
                control={form.control}
                name={`hints.${index}.content`}
                render={({ field }) => (
                  <Field>
                    <FieldLabel htmlFor={field.name}>{t('hintsPanel.content')}</FieldLabel>
                    <Textarea
                      id={field.name}
                      rows={3}
                      placeholder={t('hintsPanel.contentPlaceholder')}
                      {...field}
                    />
                  </Field>
                )}
              />
              <Controller
                control={form.control}
                name={`hints.${index}.xp_penalty`}
                render={({ field }) => (
                  <Field className="max-w-40">
                    <FieldLabel htmlFor={field.name}>{t('hintsPanel.xpPenalty')}</FieldLabel>
                    <Input
                      id={field.name}
                      type="number"
                      min={0}
                      max={100}
                      value={field.value ?? 5}
                      onChange={(e) => field.onChange(Number(e.target.value))}
                    />
                  </Field>
                )}
              />
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
