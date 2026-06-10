import { createElement } from 'react'
import { Edit, GripVertical, Trash2 } from 'lucide-react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { getSectionTypesConfig } from '../types'
import type { ProfileSection } from '../types'

interface SortableProfileSectionProps {
  deleteSection: (index: number) => void
  index: number
  section: ProfileSection
  selectedSection: number | null
  setSelectedSection: (index: number) => void
  t: AppTranslator
}

export function SortableProfileSection({
  section,
  index,
  t,
  selectedSection,
  setSelectedSection,
  deleteSection,
}: SortableProfileSectionProps) {
  const { id } = section
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 'auto',
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={() => {
        setSelectedSection(index)
      }}
      className={`group cursor-pointer rounded-lg border p-4 transition-all ${
        selectedSection === index
          ? 'border-primary bg-primary/5 ring-primary/20 shadow-sm ring-1'
          : 'bg-card/50 hover:bg-accent border-border hover:border-accent-foreground/20 hover:shadow-xs'
      } ${isDragging ? 'ring-primary/20 rotate-2 shadow-lg ring-2' : ''}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div
            {...attributes}
            {...listeners}
            className={`cursor-grab rounded-md p-1.5 transition-colors duration-200 active:cursor-grabbing ${
              selectedSection === index
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground'
            }`}
          >
            <GripVertical size={16} />
          </div>
          <div
            className={`rounded-md p-1.5 ${
              selectedSection === index ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
            }`}
          >
            {createElement(getSectionTypesConfig(t)[section.type].icon, {
              size: 16,
            })}
          </div>
          <span
            className={`truncate text-sm font-medium ${selectedSection === index ? 'text-primary' : 'text-foreground'}`}
          >
            {section.title}
          </span>
        </div>
        <div className="flex space-x-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
          <button
            type="button"
            onClick={e => {
              e.stopPropagation()
              setSelectedSection(index)
            }}
            className={`rounded-md p-1.5 transition-colors duration-200 ${
              selectedSection === index ? 'text-primary hover:bg-primary/10' : 'text-muted-foreground hover:bg-accent'
            }`}
          >
            <Edit size={14} />
          </button>
          <button
            type="button"
            onClick={e => {
              e.stopPropagation()
              deleteSection(index)
            }}
            className="text-destructive hover:bg-destructive/10 rounded-md p-1.5 transition-colors duration-200"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}
