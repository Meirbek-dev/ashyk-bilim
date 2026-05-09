import { ArrowRight, CheckCircle, GitBranch, RefreshCcw, RotateCcw } from 'lucide-react';
import { useEditorProvider } from '@components/Contexts/Editor/EditorContext';
import NextImage from '@components/ui/NextImage';
import { NodeViewWrapper } from '@tiptap/react';
import ScenariosModal from './ScenariosModal';
import { useTranslations } from 'next-intl';
import React, { useState } from 'react';
import type { TypedNodeViewProps } from '@components/Objects/Editor/core';

interface ScenarioOption {
  id: string;
  text: string;
  nextScenarioId: string | null;
}

interface Scenario {
  id: string;
  text: string;
  imageUrl?: string;
  options: ScenarioOption[];
}

interface ScenarioNodeAttrs {
  title: string;
  scenarios: Scenario[];
  currentScenarioId: string;
}

const ScenariosExtension: React.FC<TypedNodeViewProps<ScenarioNodeAttrs>> = (props) => {
  // use translations for any UI text or fallbacks
  const t = useTranslations('DashPage.Editor.Scenarios');

  // Initialize node-local state with localized fallbacks when node attrs are empty
  const initialNodeTitle: string = props.node?.attrs?.title || '';
  const initialNodeScenarios: Scenario[] = props.node?.attrs?.scenarios || [];
  const initialNodeCurrentId: string = props.node?.attrs?.currentScenarioId || (initialNodeScenarios[0]?.id ?? '1');

  const [title, setTitle] = useState(initialNodeTitle || t('interactiveScenario'));
  const [scenarios, setScenarios] = useState(initialNodeScenarios.length > 0 ? initialNodeScenarios : []);
  const [currentScenarioId, setCurrentScenarioId] = useState(initialNodeCurrentId);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [scenarioComplete, setScenarioComplete] = useState(false);
  const editorState = useEditorProvider();
  const isEditable = editorState?.isEditable ?? true;

  const getCurrentScenario = (scenarioId: string = currentScenarioId): Scenario | null => {
    return scenarios.find((s) => s.id === scenarioId) || null;
  };

  const handleSave = (newTitle: string, newScenarios: Scenario[], newCurrentScenarioId: string) => {
    setTitle(newTitle);
    setScenarios(newScenarios);
    setCurrentScenarioId(newCurrentScenarioId);

    props.updateAttributes({
      title: newTitle,
      scenarios: newScenarios,
      currentScenarioId: newCurrentScenarioId,
    });
  };

  const handleOptionClick = (nextScenarioId: string | null) => {
    if (nextScenarioId) {
      setCurrentScenarioId(nextScenarioId);
      setScenarioComplete(false);
    } else {
      setScenarioComplete(true);
    }
  };

  const resetScenario = () => {
    setCurrentScenarioId(scenarios[0]?.id || '1');
    setScenarioComplete(false);
  };

  const getOptionLetter = (index: number) => {
    return String.fromCharCode('A'.charCodeAt(0) + index);
  };

  // NOTE: `t` is already declared above to keep hooks in order

  return (
    <NodeViewWrapper className="block-scenarios">
      <div className="rounded-xl bg-slate-100 px-3 py-2 transition-all ease-linear sm:px-5">
        {/* Header section */}
        <div className="flex flex-wrap items-center gap-2 pt-1 text-sm">
          <div className="flex items-center space-x-2 text-sm">
            <GitBranch
              className="text-slate-400"
              size={15}
            />
            <p className="py-1 text-xs font-bold tracking-widest text-slate-400 uppercase">
              {t('interactiveScenario')}
            </p>
          </div>

          {/* Completion message */}
          {scenarioComplete && !isEditable && (
            <div className="rounded-md bg-lime-100 px-2 py-1 text-xs font-medium text-lime-700">
              {t('scenarioComplete')}
            </div>
          )}

          <div className="grow" />

          {/* Action buttons */}
          {isEditable ? (
            <div>
              <button
                onClick={() => setIsModalOpen(true)}
                className="rounded-lg bg-slate-200 px-2 py-1 text-xs font-bold text-slate-800 hover:bg-slate-300"
              >
                {t('editScenarios')}
              </button>
            </div>
          ) : (
            <div className="flex items-center space-x-1">
              <div
                onClick={resetScenario}
                className="cursor-pointer rounded-md p-1.5 hover:bg-slate-200"
                title={t('resetScenario')}
              >
                <RefreshCcw
                  className="text-slate-500"
                  size={15}
                />
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
                    onChange={(e) => {
                      setTitle(e.target.value);
                      props.updateAttributes({ title: e.target.value });
                    }}
                    className="text-md bg-primary/10 w-full rounded-md border-2 border-dotted border-gray-200 p-2 font-bold text-slate-800"
                  />
                </div>
              </div>

              <div className="mt-3 rounded-lg border-2 border-dotted border-gray-200 bg-white p-3">
                <p className="text-center text-sm text-slate-600">
                  {t('scenariosConfigured', { count: scenarios.length, max: 40 })}
                </p>
                <p className="mt-1 text-center text-xs text-slate-500">{t('clickEditToConfigure')}</p>
              </div>
            </div>
          </div>
        ) : scenarioComplete ? (
          <div className="space-y-2 pt-3">
            <div className="mx-auto max-w-md py-8 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
                <CheckCircle
                  size={24}
                  className="text-emerald-600"
                />
              </div>
              <h4 className="mb-2 text-xl font-bold text-slate-900">{t('scenarioComplete')}</h4>
              <p className="mb-6 leading-relaxed text-slate-600">{t('scenarioCompleteDescription')}</p>
              <button
                onClick={resetScenario}
                className="mx-auto flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-slate-800 hover:shadow-md"
              >
                <RotateCcw size={16} />
                {t('startOver')}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2 pt-3">
            {(() => {
              const currentScenario = getCurrentScenario();
              if (!currentScenario) {
                return (
                  <div className="mx-auto max-w-md py-8 text-center">
                    <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
                      <GitBranch
                        size={20}
                        className="text-slate-400"
                      />
                    </div>
                    <h3 className="mb-2 text-base font-medium text-slate-900">{t('scenarioNotFound')}</h3>
                    <p className="text-sm text-slate-500">{t('scenarioNotFoundDescription')}</p>
                  </div>
                );
              }

              return (
                <div className="mx-auto w-full max-w-xl space-y-4 p-4">
                  {/* Scenario Text */}
                  <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                    {currentScenario.imageUrl && (
                      <div className="relative mb-4 h-48 w-full overflow-hidden rounded-lg border border-slate-200">
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
                    <p className="text-base leading-relaxed font-medium text-slate-800">{currentScenario.text}</p>
                  </div>

                  {/* Response Options */}
                  <div className="space-y-2">
                    {currentScenario.options.map((option, index) => (
                      <button
                        key={option.id}
                        onClick={() => handleOptionClick(option.nextScenarioId)}
                        className="group w-full rounded-lg border border-slate-200 bg-white p-3 text-left shadow-sm transition-all hover:border-blue-300 hover:bg-blue-50 hover:shadow-md"
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-slate-100 transition-colors group-hover:bg-blue-100">
                            <span className="text-sm font-bold text-slate-600 group-hover:text-blue-600">
                              {getOptionLetter(index)}
                            </span>
                          </div>
                          <div className="flex-1 font-medium text-slate-800 transition-colors group-hover:text-blue-900">
                            {option.text}
                          </div>
                          <ArrowRight
                            size={16}
                            className="text-slate-400 transition-all group-hover:translate-x-1 group-hover:text-blue-500"
                          />
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              );
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
  );
};

export default ScenariosExtension;
