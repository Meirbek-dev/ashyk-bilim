'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import { Plus, Trash2, Users } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import {
  createStudentPolicyOverride,
  deleteStudentPolicyOverride,
  listStudentPolicyOverrides,
  updateStudentPolicyOverride,
} from '@/services/assessments/assessment-actions'
import type { StudentPolicyOverride, StudentPolicyOverrideCreate } from '@/services/assessments/assessment-actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Switch } from '@/components/ui/switch'

interface StudentOverridesPanelProps {
  assessmentUuid: string
}

interface OverrideFormState {
  user_id: string
  max_attempts_override: string
  due_at_override: string
  waive_late_penalty: boolean
  note: string
}

const EMPTY_FORM: OverrideFormState = {
  user_id: '',
  max_attempts_override: '',
  due_at_override: '',
  waive_late_penalty: false,
  note: '',
}

export default function StudentOverridesPanel({ assessmentUuid }: StudentOverridesPanelProps) {
  const t = useTranslations('Overrides')
  const [overrides, setOverrides] = useState<StudentPolicyOverride[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState<OverrideFormState>(EMPTY_FORM)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [isPending, startTransition] = useTransition()

  const fetchOverrides = useCallback(async () => {
    const data = await listStudentPolicyOverrides(assessmentUuid)
    setOverrides(data)
  }, [assessmentUuid])

  useEffect(() => {
    void fetchOverrides()
  }, [fetchOverrides])

  const openCreate = () => {
    setForm(EMPTY_FORM)
    setEditingId(null)
    setDialogOpen(true)
  }

  const openEdit = (override: StudentPolicyOverride) => {
    setForm({
      user_id: String(override.user_id),
      max_attempts_override: override.max_attempts_override !== null ? String(override.max_attempts_override) : '',
      due_at_override: override.due_at_override ? new Date(override.due_at_override).toISOString().slice(0, 16) : '',
      waive_late_penalty: override.waive_late_penalty,
      note: override.note,
    })
    setEditingId(override.user_id)
    setDialogOpen(true)
  }

  const handleSave = () => {
    startTransition(async () => {
      try {
        const payload: StudentPolicyOverrideCreate = {
          user_id: Number.parseInt(form.user_id, 10),
          max_attempts_override: form.max_attempts_override ? Number.parseInt(form.max_attempts_override, 10) : null,
          due_at_override: form.due_at_override ? new Date(form.due_at_override).toISOString() : null,
          waive_late_penalty: form.waive_late_penalty,
          note: form.note || undefined,
        }

        if (editingId !== null) {
          await updateStudentPolicyOverride(assessmentUuid, editingId, payload)
          toast.success(t('toasts.updated'))
        } else {
          await createStudentPolicyOverride(assessmentUuid, payload)
          toast.success(t('toasts.created'))
        }

        setDialogOpen(false)
        await fetchOverrides()
      } catch {
        toast.error(t('toasts.failed'))
      }
    })
  }

  const handleDelete = (userId: number) => {
    startTransition(async () => {
      try {
        await deleteStudentPolicyOverride(assessmentUuid, userId)
        toast.success(t('toasts.deleted'))
        await fetchOverrides()
      } catch {
        toast.error(t('toasts.failed'))
      }
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="text-muted-foreground size-4" />
          <span className="text-sm font-medium">{t('title')}</span>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger render={<Button size="sm" variant="outline" onClick={openCreate} />}>
            <Plus className="size-4" />
            {t('addOverride')}
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingId !== null ? t('editOverride') : t('addOverride')}</DialogTitle>
              <DialogDescription>{t('description')}</DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              {editingId === null ? (
                <div className="space-y-1">
                  <Label htmlFor="override-user-id">{t('student')}</Label>
                  <Input
                    id="override-user-id"
                    type="number"
                    value={form.user_id}
                    onChange={e => setForm(prev => ({ ...prev, user_id: e.target.value }))}
                    placeholder={t('placeholders.userIdExample')}
                  />
                </div>
              ) : null}

              <div className="space-y-1">
                <Label htmlFor="override-max-attempts">{t('maxAttempts')}</Label>
                <Input
                  id="override-max-attempts"
                  type="number"
                  min={1}
                  value={form.max_attempts_override}
                  onChange={e =>
                    setForm(prev => ({
                      ...prev,
                      max_attempts_override: e.target.value,
                    }))
                  }
                  placeholder={t('placeholders.inheritBlank')}
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="override-due-at">{t('dueAt')}</Label>
                <Input
                  id="override-due-at"
                  type="datetime-local"
                  value={form.due_at_override}
                  onChange={e =>
                    setForm(prev => ({
                      ...prev,
                      due_at_override: e.target.value,
                    }))
                  }
                />
              </div>

              <div className="flex items-center gap-3">
                <Switch
                  id="override-waive-penalty"
                  checked={form.waive_late_penalty}
                  onCheckedChange={checked => setForm(prev => ({ ...prev, waive_late_penalty: checked }))}
                />
                <Label htmlFor="override-waive-penalty">{t('waiveLatePenalty')}</Label>
              </div>

              <div className="space-y-1">
                <Label htmlFor="override-note">{t('note')}</Label>
                <Input
                  id="override-note"
                  value={form.note}
                  onChange={e => setForm(prev => ({ ...prev, note: e.target.value }))}
                  placeholder={t('placeholders.optionalInternalNote')}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                {t('cancel')}
              </Button>
              <Button onClick={handleSave} disabled={isPending || !form.user_id}>
                {editingId !== null ? t('editOverride') : t('addOverride')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {overrides.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('noOverrides')}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('student')}</TableHead>
              <TableHead>{t('maxAttempts')}</TableHead>
              <TableHead>{t('dueAt')}</TableHead>
              <TableHead>{t('waiveLatePenalty')}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {overrides.map(override => (
              <TableRow key={override.id} className="cursor-pointer" onClick={() => openEdit(override)}>
                <TableCell className="font-mono text-xs">{override.user_id}</TableCell>
                <TableCell>{override.max_attempts_override ?? '—'}</TableCell>
                <TableCell className="text-xs">
                  {override.due_at_override ? new Date(override.due_at_override).toLocaleString() : '—'}
                </TableCell>
                <TableCell>{override.waive_late_penalty ? '✓' : '—'}</TableCell>
                <TableCell>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive h-7 px-2"
                    onClick={e => {
                      e.stopPropagation()
                      handleDelete(override.user_id)
                    }}
                    disabled={isPending}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
