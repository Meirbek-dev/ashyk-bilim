import { ArrowRight, CheckCircle, GitBranch, Image, Play, Plus, RotateCcw, Save, Settings, Trash2 } from 'lucide-react';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import SimpleAlertDialog from '@/components/ui/alert-dialog-simple';
import Modal from '@/components/Objects/Elements/Modal/Modal';
import { Textarea } from '@components/ui/textarea';
import React, { useEffect, useState } from 'react';
import NextImage from '@components/ui/NextImage';
import { Button } from '@components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@components/ui/input';
import { useTranslations } from 'next-intl';

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

interface ScenariosModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  scenarios: Scenario[];
  currentScenarioId: string;
  onSave: (title: string, scenarios: Scenario[], currentScenarioId: string) => void;
}

const ScenariosModal: React.FC<ScenariosModalProps> = ({
  isOpen,
  onClose,
  title: initialTitle,
  scenarios: initialScenarios,
  currentScenarioId: initialCurrentScenarioId,
  onSave,
}) => {
  const [title, setTitle] = useState(initialTitle);
  const [scenarios, setScenarios] = useState(initialScenarios);
  const [currentScenarioId, setCurrentScenarioId] = useState(initialCurrentScenarioId);

  const [showPreview, setShowPreview] = useState(false);
  const [previewCurrentId, setPreviewCurrentId] = useState('1');
  const [showImageInputs, setShowImageInputs] = useState<Record<string, boolean>>({});

  const t = useTranslations('DashPage.Editor.Scenarios');

  const nextScenarioOptions = [
    { value: '__end', label: t('endScenarioOption') },
    ...scenarios.map((s) => ({ value: s.id, label: t('scenarioOptionLabel', { id: s.id }) })),
  ];

  const [dialogAlertOpen, setDialogAlertOpen] = useState(false);
  const [dialogAlertMessage, setDialogAlertMessage] = useState('');

  useEffect(() => {
    // Schedule updates asynchronously to avoid synchronous setState inside an effect
    // which can trigger cascading renders and cause lint warnings.
    void Promise.resolve().then(() => {
      setTitle(initialTitle);
      setScenarios(initialScenarios);
      setCurrentScenarioId(initialCurrentScenarioId);
      setPreviewCurrentId(initialCurrentScenarioId);
      setShowImageInputs({});
    });
  }, [initialTitle, initialScenarios, initialCurrentScenarioId]);

  const handleSave = () => {
    onSave(title, scenarios, currentScenarioId);
    onClose();
  };

  const handleClose = () => {
    setShowPreview(false);
    onClose();
  };

  const getPreviewScenario = (): Scenario | null => {
    return scenarios.find((s) => s.id === previewCurrentId) || null;
  };

  const handleOptionClick = (nextScenarioId: string | null) => {
    if (nextScenarioId) {
      setPreviewCurrentId(nextScenarioId);
    } else {
      setPreviewCurrentId('end');
    }
  };

  const addNewScenario = () => {
    if (scenarios.length >= 40) {
      setDialogAlertMessage(t('maxScenariosAllowed'));
      setDialogAlertOpen(true);
      return;
    }

    const newId = (Math.max(...scenarios.map((s) => Number.parseInt(s.id))) + 1).toString();
    const newScenario: Scenario = {
      id: newId,
      text: t('newScenarioText'),
      imageUrl: '',
      options: [
        { id: `opt${Date.now()}`, text: t('newOptionText'), nextScenarioId: null },
        { id: `opt${Date.now() + 1}`, text: t('newOptionText'), nextScenarioId: null },
      ],
    };
    setScenarios([...scenarios, newScenario]);
  };

  const deleteScenario = (scenarioId: string) => {
    if (scenarios.length <= 1) {
      setDialogAlertMessage(t('atLeastOneScenarioRequired'));
      setDialogAlertOpen(true);
      return;
    }

    const updatedScenarios = scenarios.filter((s) => s.id !== scenarioId);
    setScenarios(updatedScenarios);

    // Update references to deleted scenario
    const cleanedScenarios = updatedScenarios.map((scenario) => ({
      ...scenario,
      options: scenario.options.map((option) => ({
        ...option,
        nextScenarioId: option.nextScenarioId === scenarioId ? null : option.nextScenarioId,
      })),
    }));
    setScenarios(cleanedScenarios);

    if (currentScenarioId === scenarioId) {
      setCurrentScenarioId(updatedScenarios[0]?.id || '1');
    }
  };

  const updateScenario = (scenarioId: string, updates: Partial<Scenario>) => {
    setScenarios(scenarios.map((s) => (s.id === scenarioId ? { ...s, ...updates } : s)));
  };

  const addOption = (scenarioId: string) => {
    const scenario = scenarios.find((s) => s.id === scenarioId);
    if (!scenario || scenario.options.length >= 4) {
      setDialogAlertMessage(t('maxOptionsPerScenario'));
      setDialogAlertOpen(true);
      return;
    }

    const newOption: ScenarioOption = {
      id: `opt${Date.now()}`,
      text: t('newOptionText'),
      nextScenarioId: null,
    };

    updateScenario(scenarioId, {
      options: [...scenario.options, newOption],
    });
  };

  const deleteOption = (scenarioId: string, optionId: string) => {
    const scenario = scenarios.find((s) => s.id === scenarioId);
    if (!scenario || scenario.options.length <= 1) {
      setDialogAlertMessage('At least one option is required per scenario');
      setDialogAlertOpen(true);
      return;
    }

    updateScenario(scenarioId, {
      options: scenario.options.filter((opt) => opt.id !== optionId),
    });
  };

  const updateOption = (scenarioId: string, optionId: string, updates: Partial<ScenarioOption>) => {
    const scenario = scenarios.find((s) => s.id === scenarioId);
    if (!scenario) return;

    updateScenario(scenarioId, {
      options: scenario.options.map((opt) => (opt.id === optionId ? Object.assign(opt, updates) : opt)),
    });
  };

  const resetPreview = () => {
    setPreviewCurrentId(currentScenarioId);
  };

  const toggleImageInput = (scenarioId: string) => {
    setShowImageInputs((prev) => ({
      ...prev,
      [scenarioId]: !prev[scenarioId],
    }));
  };

  const renderPreviewContent = () => {
    const previewScenario = getPreviewScenario();

    return (
      <div className="flex h-[calc(75vh-220px)] flex-col p-2">
        {/* Preview Header */}
        <div className="-mx-2 -mt-2 mb-4 shrink-0 border border-blue-200 bg-linear-to-r from-blue-50 to-indigo-50 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100">
                <Play
                  size={16}
                  className="text-blue-600"
                />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">{title}</h3>
                <p className="text-sm text-slate-600">{t('interactivePreview')}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={resetPreview}
                className="flex items-center gap-2"
              >
                <RotateCcw size={14} />
                {t('reset')}
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={() => setShowPreview(false)}
                className="flex items-center gap-2"
              >
                <Settings size={14} />
                {t('backToEdit')}
              </Button>
            </div>
          </div>
        </div>

        {/* Preview Content */}
        <div className="flex flex-1 items-center justify-center overflow-y-auto">
          {previewCurrentId === 'end' ? (
            <div className="mx-auto max-w-md py-8 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
                <CheckCircle
                  size={24}
                  className="text-emerald-600"
                />
              </div>
              <h4 className="mb-2 text-xl font-bold text-slate-900">{t('scenarioComplete')}</h4>
              <p className="mb-6 leading-relaxed text-slate-600">{t('scenarioCompleteDescription')}</p>
              <Button
                onClick={resetPreview}
                className="mx-auto flex items-center gap-2"
                variant="default"
                size="sm"
              >
                <RotateCcw size={16} />
                {t('startOver')}
              </Button>
            </div>
          ) : previewScenario ? (
            <div className="mx-auto w-full max-w-xl space-y-4 p-4">
              {/* Scenario Text */}
              <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                {previewScenario.imageUrl && (
                  <div className="relative mb-4 h-48 w-full overflow-hidden rounded-lg border border-slate-200">
                    <NextImage
                      src={previewScenario.imageUrl}
                      alt={t('scenarioIllustrationAlt')}
                      fill
                      className="object-cover"
                      sizes="100vw"
                    />
                  </div>
                )}
                <p className="text-base leading-relaxed font-medium text-slate-800">{previewScenario.text}</p>
              </div>

              {/* Response Options */}
              <div className="space-y-2">
                {previewScenario.options.map((option, index) => (
                  <button
                    key={option.id}
                    onClick={() => handleOptionClick(option.nextScenarioId)}
                    className="group w-full rounded-lg border border-slate-200 bg-white p-3 text-left shadow-sm transition-all hover:border-blue-300 hover:bg-blue-50 hover:shadow-md"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-slate-100 transition-colors group-hover:bg-blue-100">
                        <span className="text-sm font-bold text-slate-600 group-hover:text-blue-600">
                          {String.fromCharCode('A'.charCodeAt(0) + index)}
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
          ) : (
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
          )}
        </div>
      </div>
    );
  };

  const renderEditContent = () => (
    <div className="flex h-[calc(75vh-220px)] flex-col p-2">
      {/* Header Section */}
      <div className="-mx-2 -mt-2 mb-4 shrink-0 border-b border-slate-200 bg-white p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0 flex-1">
            <Label className="mb-2 block text-sm font-semibold text-slate-900">{t('scenarioTitleLabel')}</Label>
            <Input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full"
              placeholder={t('enterScenarioTitlePlaceholder')}
            />
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 rounded-lg bg-slate-100 px-2 py-1.5">
              <div className="h-2 w-2 rounded-full bg-slate-400" />
              <span className="text-xs font-medium text-slate-600">{scenarios.length}/40</span>
            </div>
            <Button
              variant="default"
              size="sm"
              onClick={() => setShowPreview(true)}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700"
            >
              <Play size={14} />
              {t('preview')}
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={addNewScenario}
              disabled={scenarios.length >= 40}
              className="flex items-center gap-2"
            >
              <Plus size={14} />
              {t('add')}
            </Button>
          </div>
        </div>
      </div>

      {/* Scenarios List */}
      <div className="min-h-0 flex-1 overflow-hidden">
        <div className="scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent hover:scrollbar-thumb-gray-400 h-full overflow-y-auto pr-1">
          <div className="space-y-4 pb-4">
            {scenarios.map((scenario, scenarioIndex) => (
              <div
                key={scenario.id}
                className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md"
              >
                {/* Scenario Header */}
                <div className="border-b border-slate-200 bg-linear-to-r from-slate-50 to-slate-100 px-4 py-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-200">
                        <span className="text-sm font-bold text-slate-700">{scenarioIndex + 1}</span>
                      </div>
                      <div>
                        <h3 className="text-base font-semibold text-slate-900">
                          {t('scenarioOptionLabel', { id: scenario.id })}
                        </h3>
                        {scenario.id === currentScenarioId && (
                          <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                            <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            {t('startingPoint')}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        onClick={() => setCurrentScenarioId(scenario.id)}
                        className={`${scenario.id === currentScenarioId ? 'bg-emerald-500 text-white hover:bg-emerald-600' : 'bg-slate-200 text-slate-700'}`}
                        title={t('setAsStartingScenario')}
                      >
                        {scenario.id === currentScenarioId ? t('start') : t('setStart')}
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        onClick={() => deleteScenario(scenario.id)}
                        disabled={scenarios.length <= 1}
                        className="hover:text-destructive"
                        title={t('deleteScenario')}
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Scenario Content */}
                <div className="space-y-4 p-4">
                  {/* Scenario Text */}
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <Label className="text-sm font-medium text-slate-700">{t('scenarioDescriptionLabel')}</Label>
                      <Button
                        variant={
                          showImageInputs[scenario.id] || (scenario.imageUrl && scenario.imageUrl.trim() !== '')
                            ? 'outline'
                            : 'default'
                        }
                        size="sm"
                        onClick={() => toggleImageInput(scenario.id)}
                        className="flex items-center gap-2 text-xs"
                        title={scenario.imageUrl && scenario.imageUrl.trim() !== '' ? t('editImage') : t('addImage')}
                      >
                        <Image size={14} />
                        <span>{scenario.imageUrl && scenario.imageUrl.trim() !== '' ? t('image') : t('addImage')}</span>
                        {scenario.imageUrl && scenario.imageUrl.trim() !== '' && (
                          <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
                            1
                          </span>
                        )}
                      </Button>
                    </div>
                    <Textarea
                      value={scenario.text}
                      onChange={(e) => updateScenario(scenario.id, { text: e.target.value })}
                      className="w-full"
                      rows={2}
                      placeholder={t('describeScenarioPlaceholder')}
                    />
                  </div>

                  {/* Scenario Image */}
                  {showImageInputs[scenario.id] && (
                    <div>
                      <Label className="mb-2 block text-sm font-medium text-slate-700">{t('imageUrlLabel')}</Label>
                      <Input
                        type="url"
                        value={scenario.imageUrl || ''}
                        onChange={(e) => updateScenario(scenario.id, { imageUrl: e.target.value })}
                        className="w-full"
                        placeholder={t('imageUrlPlaceholder')}
                      />
                      {scenario.imageUrl && (
                        <div className="mt-2">
                          <img
                            src={scenario.imageUrl}
                            alt={t('scenarioPreviewAlt')}
                            className="h-32 w-full rounded-lg border border-slate-200 object-cover"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                            }}
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {/* Response Options */}
                  <div>
                    <div className="mb-3 flex items-center justify-between">
                      <Label className="text-sm font-medium text-slate-700">
                        {t('responseOptionsLabel', { count: scenario.options.length })}
                      </Label>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => addOption(scenario.id)}
                        disabled={scenario.options.length >= 4}
                        className="flex items-center gap-1 text-xs"
                        title={t('addResponseOption')}
                      >
                        <Plus size={12} />
                        {t('add')}
                      </Button>
                    </div>

                    <div className="space-y-2">
                      {scenario.options.map((option, index) => (
                        <div
                          key={option.id}
                          className="group rounded-lg border border-slate-200 bg-slate-50 p-3 transition-all hover:bg-slate-100"
                        >
                          <div className="flex items-start gap-2">
                            <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded border border-slate-300 bg-white">
                              <span className="text-xs font-bold text-slate-600">
                                {String.fromCharCode('A'.charCodeAt(0) + index)}
                              </span>
                            </div>
                            <div className="flex-1 space-y-2">
                              <Input
                                type="text"
                                value={option.text}
                                onChange={(e) => updateOption(scenario.id, option.id, { text: e.target.value })}
                                className="w-full"
                                placeholder={t('enterResponseOptionPlaceholder')}
                              />
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-medium text-slate-500">→</span>
                                <NativeSelect
                                  value={option.nextScenarioId ?? '__end'}
                                  onChange={(event) =>
                                    updateOption(scenario.id, option.id, {
                                      nextScenarioId: event.target.value === '__end' ? null : event.target.value,
                                    })
                                  }
                                  className="flex-1 text-xs"
                                  aria-label={t('endScenarioOption')}
                                >
                                  <NativeSelectOption value="__end">
                                    {t('endScenarioOption')}
                                  </NativeSelectOption>
                                  {nextScenarioOptions.map((item) => (
                                    <NativeSelectOption
                                      key={item.value}
                                      value={item.value}
                                    >
                                      {item.label}
                                    </NativeSelectOption>
                                  ))}
                                </NativeSelect>
                              </div>
                            </div>
                            <Button
                              size="icon-sm"
                              variant="destructive"
                              onClick={() => deleteOption(scenario.id, option.id)}
                              disabled={scenario.options.length <= 1}
                              className="shrink-0 opacity-0 group-hover:opacity-100"
                              title={t('deleteOption')}
                            >
                              <Trash2 size={12} />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {scenarios.length === 0 && (
              <div className="py-8 text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
                  <GitBranch
                    size={20}
                    className="text-slate-400"
                  />
                </div>
                <h3 className="mb-2 text-base font-medium text-slate-900">{t('noScenariosYet')}</h3>
                <p className="mb-4 text-sm text-slate-500">{t('createFirstScenarioDescription')}</p>
                <Button
                  onClick={addNewScenario}
                  className="mx-auto flex items-center gap-2"
                  variant="default"
                  size="sm"
                >
                  <Plus size={14} />
                  {t('createFirstScenario')}
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <SimpleAlertDialog
        open={dialogAlertOpen}
        onOpenChange={setDialogAlertOpen}
        description={dialogAlertMessage}
      />
      <Modal
        isDialogOpen={isOpen}
        onOpenChange={handleClose}
        dialogTitle={showPreview ? t('modal.previewTitle') : t('modal.editTitle')}
        dialogDescription={showPreview ? t('modal.previewDescription') : t('modal.editDescription')}
        customHeight="max-h-[75vh]"
        customWidth="!w-[70vw] !max-w-[70vw] !sm:w-[70vw] !sm:max-w-[70vw] !md:w-[70vw] !md:max-w-[70vw] !lg:max-w-[70vw] !xl:max-w-[70vw]"
        dialogContent={showPreview ? renderPreviewContent() : renderEditContent()}
        dialogClose={
          <div className="flex items-center gap-2">
            <Button onClick={handleClose}>{t('cancel')}</Button>
            {!showPreview && (
              <Button onClick={handleSave}>
                <div className="flex items-center gap-2">
                  <Save size={16} />
                  {t('saveChanges')}
                </div>
              </Button>
            )}
          </div>
        }
      />
    </>
  );
};

export default ScenariosModal;
