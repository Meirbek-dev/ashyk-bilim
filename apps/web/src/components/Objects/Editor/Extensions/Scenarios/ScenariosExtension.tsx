import { ArrowRight, CheckCircle, GitBranch, RefreshCcw, RotateCcw } from 'lucide-react'
import { useEditorProvider } from '@components/Contexts/Editor/EditorContext'
import NextImage from '@components/ui/NextImage'
import { NodeViewWrapper } from '@tiptap/react'
import ScenariosModal from './ScenariosModal'
import { useTranslations } from 'next-intl'
import React, { useState } from 'react'
import type { TypedNodeViewProps } from '@components/Objects/Editor/core/nodeview-types'
import { Button } from '@/components/ui/button'

interface ScenarioOption {
  id: string
  text: string
  nextScenarioId: string | null
}

interface Scenario {
  id: string
  text: string
  imageUrl?: string
  options: ScenarioOption[]
}

interface ScenarioNodeAttrs {
  title: string
  scenarios: Scenario[]
  currentScenarioId: string
}

const ScenariosExtension: React.FC<TypedNodeViewProps<ScenarioNodeAttrs>> = props => {
  // use translations for any UI text or fallbacks
  const t = useTranslations('DashPage.Editor.Scenarios')

  // Initialize node-local state with localized fallbacks when node attrs are empty
  const initialNodeTitle: string = props.node?.attrs?.title || ''
  const initialNodeScenarios: Scenario[] = props.node?.attrs?.scenarios || []
  const initialNodeCurrentId: string = props.node?.attrs?.currentScenarioId || (initialNodeScenarios[0]?.id ?? '1')

  const [title, setTitle] = useState(initialNodeTitle || t('interactiveScenario'))
  const [scenarios, setScenarios] = useState(initialNodeScenarios.length > 0 ? initialNodeScenarios : [])
  const [currentScenarioId, setCurrentScenarioId] = useState(initialNodeCurrentId)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [scenarioComplete, setScenarioComplete] = useState(false)
  const editorState = useEditorProvider()
  const isEditable = editorState?.isEditable ?? true

  const getCurrentScenario = (scenarioId: string = currentScenarioId): Scenario | null => {
    return scenarios.find(s => s.id === scenarioId) || null
  }

  const handleSave = (newTitle: string, newScenarios: Scenario[], newCurrentScenarioId: string) => {
    setTitle(newTitle)
    setScenarios(newScenarios)
    setCurrentScenarioId(newCurrentScenarioId)

    props.updateAttributes({
      title: newTitle,
      scenarios: newScenarios,
      currentScenarioId: newCurrentScenarioId,
    })
  }

  const handleOptionClick = (nextScenarioId: string | null) => {
    if (nextScenarioId) {
      setCurrentScenarioId(nextScenarioId)
      setScenarioComplete(false)
    } else {
      setScenarioComplete(true)
    }
  }

  const resetScenario = () => {
    setCurrentScenarioId(scenarios[0]?.id || '1')
    setScenarioComplete(false)
  }

  const getOptionLetter = (index: number) => {
    return String.fromCharCode('A'.charCodeAt(0) + index)
  }

  // NOTE: `t` is already declared above to keep hooks in order

  return (
    <NodeViewWrapper className="block-scenarios">
      <div className="border-border bg-muted/40 rounded-xl border px-3 py-2 transition-all ease-linear sm:px-5">
        {/* Header section */}
        <div className="flex flex-wrap items-center gap-2 pt-1 text-sm">
          <div className="flex items-center space-x-2 text-sm">
            <GitBranch className="text-muted-foreground" size={15} />
            <p className="text-muted-foreground py-1 text-xs font-bold tracking-widest uppercase">
              {t('interactiveScenario')}
            </p>
          </div>

          {/* Completion message */}
          {scenarioComplete && !isEditable && (
            <div className="rounded-md border border-lime-500/20 bg-lime-500/10 px-2 py-1 text-xs font-medium text-lime-600 dark:text-lime-400">
              {t('scenarioComplete')}
            </div>
          )}

          <div className="grow" />

          {/* Action buttons */}
          {isEditable ? (
            <div>
              <Button size="sm" variant="secondary" onClick={() => setIsModalOpen(true)}>
                {t('editScenarios')}
              </Button>
            </div>
          ) : (
            <div className="flex items-center space-x-1">
              <div
                onClick={resetScenario}
                className="hover:bg-accent cursor-pointer rounded-md p-1.5"
                title={t('resetScenario')}
              >
                <RefreshCcw className="text-muted-foreground" size={15} />
              </div>
            </div>
          )}
        </div>

        {/* Scenario content */}
        {isEditable ? (
          <div className="space-y-2 pt-3">
            <div className="scenario-editor">
              <div className="flex items-center space-x-2">
                <div className="grow">
                  <input
                    value={title}
                    placeholder={t('scenarioTitlePlaceholder')}
                    onChange={e => {
                      setTitle(e.target.value)
                      props.updateAttributes({ title: e.target.value })
                    }}
                    className="text-foreground text-md bg-primary/10 border-border w-full rounded-md border border-dashed p-2 font-bold"
                  />
                </div>
              </div>

              <div className="border-border bg-card mt-3 rounded-lg border border-dashed p-3">
                <p className="text-muted-foreground text-center text-sm">
                  {t('scenariosConfigured', { count: scenarios.length, max: 40 })}
                </p>
                <p className="text-muted-foreground mt-1 text-center text-xs">{t('clickEditToConfigure')}</p>
              </div>
            </div>
          </div>
        ) : scenarioComplete ? (
          <div className="space-y-2 pt-3">
            <div className="mx-auto max-w-md py-8 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-emerald-500/20 bg-emerald-500/10">
                <CheckCircle size={24} className="text-emerald-600 dark:text-emerald-400" />
              </div>
              <h4 className="text-foreground mb-2 text-xl font-bold">{t('scenarioComplete')}</h4>
              <p className="text-muted-foreground mb-6 leading-relaxed">{t('scenarioCompleteDescription')}</p>
              <Button onClick={resetScenario} variant="default" className="mx-auto flex items-center gap-2">
                <RotateCcw size={16} />
                {t('startOver')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-2 pt-3">
            {(() => {
              const currentScenario = getCurrentScenario()
              if (!currentScenario) {
                return (
                  <div className="mx-auto max-w-md py-8 text-center">
                    <div className="bg-muted mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full">
                      <GitBranch size={20} className="text-muted-foreground" />
                    </div>
                    <h3 className="text-foreground mb-2 text-base font-medium">{t('scenarioNotFound')}</h3>
                    <p className="text-muted-foreground text-sm">{t('scenarioNotFoundDescription')}</p>
                  </div>
                )
              }

              return (
                <div className="mx-auto w-full max-w-xl space-y-4 p-4">
                  {/* Scenario Text */}
                  <div className="border-border bg-card rounded-xl border p-6 shadow-xs">
                    {currentScenario.imageUrl && (
                      <div className="border-border relative mb-4 h-48 w-full overflow-hidden rounded-lg border">
                        <NextImage
                          src={currentScenario.imageUrl}
                          alt={t('scenarioIllustrationAlt')}
                          fill
                          className="object-cover"
                          sizes="100vw"
                          onError={() => undefined}
                        />
                      </div>
                    )}
                    <p className="text-foreground text-base leading-relaxed font-medium">{currentScenario.text}</p>
                  </div>

                  {/* Response Options */}
                  <div className="space-y-2">
                    {currentScenario.options.map((option, index) => (
                      <button
                        key={option.id}
                        onClick={() => handleOptionClick(option.nextScenarioId)}
                        className="group border-border bg-card hover:border-primary/50 hover:bg-accent w-full rounded-lg border p-3 text-left shadow-xs transition-all"
                      >
                        <div className="flex items-center gap-3">
                          <div className="bg-muted group-hover:bg-accent flex h-6 w-6 shrink-0 items-center justify-center rounded transition-colors">
                            <span className="text-muted-foreground group-hover:text-accent-foreground text-sm font-bold">
                              {getOptionLetter(index)}
                            </span>
                          </div>
                          <div className="text-foreground group-hover:text-foreground flex-1 font-medium transition-colors">
                            {option.text}
                          </div>
                          <ArrowRight
                            size={16}
                            className="text-muted-foreground group-hover:text-primary transition-all group-hover:translate-x-1"
                          />
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )
            })()}
          </div>
        )}

        <ScenariosModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title={title}
          scenarios={scenarios}
          currentScenarioId={currentScenarioId}
          onSave={handleSave}
        />
      </div>
    </NodeViewWrapper>
  )
}

export default ScenariosExtension
