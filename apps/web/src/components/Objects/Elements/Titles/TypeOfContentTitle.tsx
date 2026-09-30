import { BookOpen, Layers, Map } from 'lucide-react'

interface TypeOfContentTitleProps {
  title: string
  type: string
  as?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'
}

const icons: Record<string, AppIcon> = {
  col: Layers,
  cou: BookOpen,
  tra: Map,
}

function TypeOfContentTitle({ title, type, as: Component = 'h2' }: TypeOfContentTitleProps) {
  const Icon = icons[type] ?? Layers

  return (
    <div className="home_category_title my-5 flex items-center">
      <div className="my-auto mr-4 ml-2 rounded-full p-2 shadow-inner ring-1 ring-slate-900/5">
        <Icon size={20} aria-hidden="true" className="text-slate-900" />
      </div>
      <Component className="text-2xl font-bold">{title}</Component>
    </div>
  )
}

export default TypeOfContentTitle
