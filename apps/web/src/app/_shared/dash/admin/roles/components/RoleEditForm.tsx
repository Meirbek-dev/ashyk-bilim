import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { RoleWithPermissions } from '@/types/permissions'

type RoleDialogMode = 'create' | 'edit' | 'clone'

interface RoleEditFormProps {
  mode: RoleDialogMode
  role?: RoleWithPermissions
  maxPriority: number
  isSuperAdmin: boolean
  onSubmit: (data: { name: string; slug: string; description: string; priority: number }) => Promise<void>
  onCancel: () => void
}

export function RoleEditForm({ mode, role, maxPriority, isSuperAdmin, onSubmit, onCancel }: RoleEditFormProps) {
  const t = useTranslations('Components.Roles')
  const [name, setName] = useState(role?.name || '')
  const [description, setDescription] = useState(role?.description || '')
  const [priority, setPriority] = useState(role?.priority ?? 0)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const isEditMode = mode === 'edit'

  const autoSlug = isEditMode
    ? (role?.slug ?? '')
    : name
        .toLowerCase()
        .replace(/\s+/g, '_')
        .replace(/[^a-z0-9_]/g, '')

  const [slug, setSlug] = useState(role?.slug ?? autoSlug)

  const handleNameChange = (value: string) => {
    setName(value)
    if (!isEditMode) {
      setSlug(
        value
          .toLowerCase()
          .replace(/\s+/g, '_')
          .replace(/[^a-z0-9_]/g, ''),
      )
    }
  }

  const handleSubmit = async (formData: FormData) => {
    setIsSubmitting(true)
    try {
      await onSubmit({
        name: String(formData.get('name') ?? name).trim(),
        slug: String(formData.get('slug') ?? slug).trim(),
        description: String(formData.get('description') ?? description).trim(),
        priority: Number(formData.get('priority') ?? priority),
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form action={handleSubmit}>
      <DialogHeader>
        <DialogTitle>
          {mode === 'edit' ? t('editRoleTitle') : mode === 'clone' ? t('cloneRoleTitle') : t('createRoleTitle')}
        </DialogTitle>
        <DialogDescription>
          {mode === 'edit'
            ? t('editRoleDescription')
            : mode === 'clone'
              ? t('cloneRoleDescription')
              : t('createRoleDescription')}
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-4 py-4">
        <div className="grid gap-2">
          <Label htmlFor="name">{t('fieldName')}</Label>
          <Input
            id="name"
            name="name"
            value={name}
            onChange={e => handleNameChange(e.target.value)}
            placeholder={t('namePlaceholder')}
            required
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="slug">{t('fieldSlug')}</Label>
          {isEditMode && <input type="hidden" name="slug" value={slug} />}
          <Input
            id="slug"
            name="slug"
            value={slug}
            onChange={e => setSlug(e.target.value)}
            placeholder={t('slugPlaceholder')}
            disabled={isEditMode}
            required
          />
          <p className="text-muted-foreground text-xs">{isEditMode ? t('slugImmutableHelp') : t('slugCreateHelp')}</p>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="priority">{t('tableHead.priority')}</Label>
          <Input
            id="priority"
            name="priority"
            type="number"
            min={0}
            max={isSuperAdmin ? undefined : maxPriority}
            value={priority}
            onChange={e => setPriority(Number(e.target.value || 0))}
            required
          />
          {!isSuperAdmin && (
            <p className="text-muted-foreground text-xs">{t('priorityMaxHelp', { max: maxPriority })}</p>
          )}
        </div>

        <div className="grid gap-2">
          <Label htmlFor="description">{t('fieldDescription')}</Label>
          <Input
            id="description"
            name="description"
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder={t('descriptionPlaceholder')}
          />
        </div>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
          {t('AddRole.cancel')}
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {mode === 'edit' ? t('updateRole') : mode === 'clone' ? t('cloneRole') : t('createRole')}
        </Button>
      </DialogFooter>
    </form>
  )
}
