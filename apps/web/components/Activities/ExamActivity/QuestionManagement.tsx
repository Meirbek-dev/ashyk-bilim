'use client';

import { apiFetch } from '@/lib/api-client';

import { createInitialEditorState, questionEditorReducer } from './state/questionEditorReducer';
import { Download, Edit2, GripVertical, Plus, Trash2, Upload } from 'lucide-react';
import { DragDropContext, Draggable, Droppable } from '@hello-pangea/dnd';
import type { Question } from './state/questionEditorReducer';
import { useTranslations } from 'next-intl';
import { useReducer, useRef } from 'react';
import { toast } from 'sonner';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from '@components/ui/alert-dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@components/ui/card';
import { Dialog, DialogContent, DialogDescription } from '@components/ui/dialog';
import { Button } from '@components/ui/button';
import QuestionEditor from './QuestionEditor';

interface QuestionManagementProps {
  examUuid: string;
  questions: Question[];
  onQuestionsChange: () => void;
}

export default function QuestionManagement({ examUuid, questions, onQuestionsChange }: QuestionManagementProps) {
  const t = useTranslations('Components.QuestionManagement');

  // Centralized state management with reducer,
  const [state, dispatch] = useReducer(questionEditorReducer, createInitialEditorState());
  const inlineEditorRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Extract current state,
  const isDialogOpen = state.mode === 'editing-modal';
  const inlineEditorOpen = state.mode === 'editing-inline';
  const editingQuestion = state.mode === 'editing-inline' || state.mode === 'editing-modal' ? state.question : null;
  const deleteDialogOpen = state.mode === 'deleting';
  const pendingDeleteUuid = state.mode === 'deleting' ? state.questionUuid : null;
  const isDeleting = state.mode === 'deleting' ? state.isDeleting : false;

  const handleAddQuestion = () => {
    const newQuestion: Question = {
      question_text: '',
      question_type: 'SINGLE_CHOICE',
      points: 1,
      explanation: '',
      answer_options: [{ text: '', is_correct: false }],
      order_index: questions.length,
    };
    dispatch({ type: 'START_INLINE_EDIT', question: newQuestion });
    // scroll the inline editor into view after render,
    setTimeout(() => inlineEditorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
  };

  const handleExportCSV = async () => {
    try {
      const response = await apiFetch(`exams/${examUuid}/questions/export-csv`, { method: 'GET' });

      if (!response.ok) throw new Error('Failed to export questions');

      const blob = await response.blob();
      const url = globalThis.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `exam_${examUuid}_questions.csv`;
      document.body.appendChild(a);
      a.click();
      globalThis.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.success(t('questionsExported'));
    } catch (error) {
      console.error('Error exporting questions:', error);
      toast.error(t('errorExportingQuestions'));
    }
  };

  const handleImportCSV = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await apiFetch(`exams/${examUuid}/questions/import-csv`, { method: 'POST', body: formData });

      if (!response.ok) throw new Error('Failed to import questions');

      const result = await response.json();

      if (result.errors && result.errors.length > 0) {
        toast.warning(
          t('questionsImportedWithErrors', {
            imported: result.imported,
            errors: result.errors.length,
          }),
        );
        console.error('Import errors:', result.errors);
      } else {
        toast.success(t('questionsImported', { count: result.imported }));
      }

      onQuestionsChange();
    } catch (error) {
      console.error('Error importing questions:', error);
      toast.error(t('errorImportingQuestions'));
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleEditQuestion = (question: Question) => {
    dispatch({ type: 'START_MODAL_EDIT', question });
  };

  const promptDeleteQuestion = (questionUuid: string) => {
    dispatch({ type: 'START_DELETE', questionUuid });
  };

  const handleDeleteQuestion = async (questionUuid?: string) => {
    const uuid = questionUuid ?? pendingDeleteUuid;
    if (!uuid) {
      dispatch({ type: 'CANCEL_DELETE' });
      return;
    }

    dispatch({ type: 'CONFIRM_DELETE' });
    try {
      const response = await apiFetch(`exams/questions/${uuid}`, { method: 'DELETE' });

      if (!response.ok) throw new Error('Failed to delete question');

      toast.success(t('questionDeleted'));
      onQuestionsChange();
    } catch (error) {
      console.error('Error deleting question:', error);
      toast.error(t('errorDeletingQuestion'));
    } finally {
      dispatch({ type: 'RESET_TO_IDLE' });
    }
  };

  const handleDragEnd = async (result: any) => {
    if (!result.destination) return;

    const items = [...questions];
    const [reorderedItem] = items.splice(result.source.index, 1);
    if (!reorderedItem) return;
    items.splice(result.destination.index, 0, reorderedItem);

    // Update order_index for all questions using bulk endpoint,
    const questionOrder = items.map((question, index) => ({
      question_uuid: question.question_uuid,
      order_index: index,
    }));

    try {
      const response = await apiFetch(`exams/${examUuid}/questions/reorder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(questionOrder),
      });

      if (!response.ok) throw new Error('Failed to reorder questions');

      toast.success(t('questionsReordered'));
      onQuestionsChange();
    } catch (error) {
      console.error('Error reordering questions:', error);
      toast.error(t('errorReorderingQuestions'));
    }
  };

  return (
    <div className="space-y-4">
      <AlertDialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            dispatch({ type: 'CANCEL_DELETE' });
          }
        }}
      >
        <AlertDialogContent size="default">
          <AlertDialogTitle>{t('confirmDelete')}</AlertDialogTitle>
          <AlertDialogDescription>{t('confirmDelete')}</AlertDialogDescription>
          <div className="mt-4 flex justify-end gap-2">
            <AlertDialogCancel
              onClick={() => {
                dispatch({ type: 'CANCEL_DELETE' });
              }}
            >
              {t('cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => void handleDeleteQuestion()}
            >
              {t('delete')}
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">{t('questionBank')}</h2>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCSV}
          >
            <Download className="mr-2 h-4 w-4" />
            {t('exportCSV')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="mr-2 h-4 w-4" />
            {t('importCSV')}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleImportCSV}
            className="hidden"
          />
          <Dialog
            open={isDialogOpen}
            onOpenChange={(open) => !open && dispatch({ type: 'CANCEL_EDIT' })}
          >
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[600px]">
              <DialogDescription className="sr-only">{t('fillInQuestionDetails')}</DialogDescription>
              <QuestionEditor
                question={editingQuestion}
                examUuid={examUuid}
                onSave={() => {
                  dispatch({ type: 'RESET_TO_IDLE' });
                  onQuestionsChange();
                }}
                onCancel={() => {
                  dispatch({ type: 'CANCEL_EDIT' });
                }}
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {questions.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-gray-500">{t('noQuestions')}</CardContent>
          <div className="flex justify-center p-4">
            {inlineEditorOpen ? (
              <Card>
                <CardContent ref={inlineEditorRef}>
                  <QuestionEditor
                    question={editingQuestion}
                    examUuid={examUuid}
                    onSave={() => {
                      dispatch({ type: 'RESET_TO_IDLE' });
                      onQuestionsChange();
                    }}
                    onCancel={() => {
                      dispatch({ type: 'CANCEL_EDIT' });
                    }}
                  />
                </CardContent>
              </Card>
            ) : (
              <Button
                variant="outline"
                onClick={handleAddQuestion}
              >
                <Plus className="mr-2 h-4 w-4" />
                {t('addQuestion')}
              </Button>
            )}
          </div>
        </Card>
      ) : (
        <DragDropContext onDragEnd={handleDragEnd}>
          <Droppable droppableId="questions">
            {(provided) => (
              <div
                {...provided.droppableProps}
                ref={provided.innerRef}
                className="space-y-2"
              >
                {questions.map((question, index) => (
                  <Draggable
                    key={question.question_uuid || index}
                    draggableId={question.question_uuid || `temp-${index}`}
                    index={index}
                  >
                    {(provided) => (
                      <Card
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        className="transition-shadow hover:shadow-md"
                      >
                        <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                          <div className="flex flex-1 items-start gap-3">
                            <div
                              {...provided.dragHandleProps}
                              className="cursor-move pt-1"
                            >
                              <GripVertical className="h-5 w-5 text-gray-400" />
                            </div>
                            <div className="flex-1">
                              <CardTitle className="text-base">{t('questionNumber', { number: index + 1 })}</CardTitle>
                              <p className="mt-2 text-sm text-gray-700">{question.question_text}</p>
                              <div className="mt-2 flex items-center gap-4 text-sm text-gray-500">
                                <span>{t(question.question_type.toLowerCase())}</span>
                                <span>•</span>
                                <span>{t('pointsValue', { points: question.points })}</span>
                              </div>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEditQuestion(question)}
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                if (question.question_uuid) {
                                  promptDeleteQuestion(question.question_uuid);
                                }
                              }}
                              disabled={isDeleting}
                            >
                              <Trash2 className="h-4 w-4 text-red-600" />
                            </Button>
                          </div>
                        </CardHeader>
                      </Card>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}

                {/* Inline add button / editor */}
                <div className="pt-2">
                  {inlineEditorOpen ? (
                    <Card>
                      <CardContent ref={inlineEditorRef}>
                        <QuestionEditor
                          question={editingQuestion}
                          examUuid={examUuid}
                          onSave={() => {
                            dispatch({ type: 'RESET_TO_IDLE' });
                            onQuestionsChange();
                          }}
                          onCancel={() => {
                            dispatch({ type: 'CANCEL_EDIT' });
                          }}
                        />
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="flex justify-center">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleAddQuestion}
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        {t('addQuestion')}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </Droppable>
        </DragDropContext>
      )}
    </div>
  );
}
