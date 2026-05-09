'use client';

import { useEditorProvider } from '@components/Contexts/Editor/EditorContext';
import { BadgeHelp, Check, Minus, Plus, RefreshCcw } from 'lucide-react';
import { NodeViewWrapper } from '@tiptap/react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { generateUUID } from '@/lib/utils';
import { twMerge } from 'tailwind-merge';
import confetti from 'canvas-confetti';
import type { TypedNodeViewProps } from '@components/Objects/Editor/core';
import type { QuizAnswer, QuizBlockAttrs, QuizQuestion } from './QuizBlock';

interface UserAnswer {
  question_id: string;
  answer_id: string;
}

const QuizBlockComponent = (props: TypedNodeViewProps<QuizBlockAttrs>) => {
  const t = useTranslations('DashPage.Editor.QuizBlock');
  const [questions, setQuestions] = useState<QuizQuestion[]>(props.node.attrs.questions);
  const [userAnswers, setUserAnswers] = useState<UserAnswer[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [submissionMessage, setSubmissionMessage] = useState('');
  const editorState = useEditorProvider();
  const { isEditable } = editorState;

  const handleAnswerClick = (question_id: string, answer_id: string) => {
    if (submitted) return;

    const existingAnswerIndex = userAnswers.findIndex(
      (answer) => answer.question_id === question_id && answer.answer_id === answer_id,
    );

    if (existingAnswerIndex !== -1) {
      // Remove the answer if it's already selected
      setUserAnswers(userAnswers.filter((_, index) => index !== existingAnswerIndex));
    } else {
      // Add the answer
      setUserAnswers([...userAnswers, { question_id, answer_id }]);
    }
  };

  const refreshUserSubmission = () => {
    setUserAnswers([]);
    setSubmitted(false);
    setSubmissionMessage('');
  };

  const handleUserSubmission = () => {
    setSubmitted(true);

    const correctAnswers = questions.every((question) => {
      const correctAnswers = question.answers.filter((answer) => answer.correct);
      const userAnswersForQuestion = userAnswers.filter(
        (userAnswer) => userAnswer.question_id === question.question_id,
      );

      // If no correct answers are set and user didn't select any, it's correct
      if (correctAnswers.length === 0 && userAnswersForQuestion.length === 0) {
        return true;
      }

      // Check if user selected all correct answers and no incorrect ones
      return (
        correctAnswers.length === userAnswersForQuestion.length &&
        correctAnswers.every((correctAnswer) =>
          userAnswersForQuestion.some((userAnswer) => userAnswer.answer_id === correctAnswer.answer_id),
        )
      );
    });

    setSubmissionMessage(correctAnswers ? t('allCorrect') : t('someIncorrect'));
  };

  useEffect(() => {
    if (submitted && submissionMessage === t('allCorrect')) {
      confetti({ particleCount: 1400, spread: 90, disableForReducedMotion: true });
    }
  }, [submitted, submissionMessage, t]);

  const getAnswerID = (answerIndex: number, questionId: string) => {
    const alphabet = Array.from({ length: 26 }, (_, i) => String.fromCharCode('A'.charCodeAt(0) + i));
    const alphabetID = alphabet[answerIndex];

    // Get question index
    const questionIndex = questions.findIndex((question) => question.question_id === questionId);
    const _questionID = questionIndex + 1;

    return `${alphabetID}`;
  };

  const saveQuestions = (nextQuestions: QuizQuestion[]) => {
    props.updateAttributes({
      questions: nextQuestions,
    });
    setQuestions(nextQuestions);
  };

  const addSampleQuestion = () => {
    const newQuestion: QuizQuestion = {
      question_id: generateUUID(),
      question: '',
      type: 'multiple_choice',
      answers: [
        {
          answer_id: generateUUID(),
          answer: '',
          correct: false,
        },
      ],
    };
    saveQuestions([...questions, newQuestion]);
  };

  const addAnswer = (question_id: string) => {
    const newAnswer: QuizAnswer = {
      answer_id: generateUUID(),
      answer: '',
      correct: false,
    };

    // check if there is already more than 5 answers
    const question = questions.find((currentQuestion) => currentQuestion.question_id === question_id);
    if (!(question && question.answers.length < 5)) {
      return;
    }

    const newQuestions = questions.map((currentQuestion) => {
      if (currentQuestion.question_id === question_id) {
        return {
          ...currentQuestion,
          answers: [...currentQuestion.answers, newAnswer],
        };
      }

      return currentQuestion;
    });

    saveQuestions(newQuestions);
  };

  const changeAnswerValue = (question_id: string, answer_id: string, value: string) => {
    const newQuestions = questions.map((question) => {
      if (question.question_id === question_id) {
        return {
          ...question,
          answers: question.answers.map((answer) =>
            answer.answer_id === answer_id ? { ...answer, answer: value } : answer,
          ),
        };
      }

      return question;
    });
    saveQuestions(newQuestions);
  };

  const changeQuestionValue = (question_id: string, value: string) => {
    const newQuestions = questions.map((question) =>
      question.question_id === question_id ? { ...question, question: value } : question,
    );
    saveQuestions(newQuestions);
  };

  const deleteQuestion = (question_id: string) => {
    const newQuestions = questions.filter((question) => question.question_id !== question_id);
    saveQuestions(newQuestions);
  };

  const deleteAnswer = (question_id: string, answer_id: string) => {
    const newQuestions = questions.map((question) => {
      if (question.question_id === question_id) {
        return {
          ...question,
          answers: question.answers.filter((answer) => answer.answer_id !== answer_id),
        };
      }

      return question;
    });
    saveQuestions(newQuestions);
  };

  const markAnswerCorrect = (question_id: string, answer_id: string) => {
    const newQuestions = questions.map((question) => {
      if (question.question_id === question_id) {
        return {
          ...question,
          answers: question.answers.map((answer) => ({
            ...answer,
            correct: answer.answer_id === answer_id ? !answer.correct : answer.correct,
          })),
        };
      }

      return question;
    });
    saveQuestions(newQuestions);
  };

  return (
    <NodeViewWrapper className="block-quiz">
      <div className="rounded-xl bg-slate-100 px-3 py-2 transition-all ease-linear sm:px-5">
        {/* Header section */}
        <div className="z-50 flex flex-wrap items-center gap-2 pt-1 text-sm">
          <div className="flex items-center space-x-2 text-sm">
            <BadgeHelp
              className="text-slate-400"
              size={15}
            />
            <p className="py-1 text-xs font-bold tracking-widest text-slate-400 uppercase">{t('title')}</p>
          </div>

          {/* Submission message */}
          {submitted ? (
            <div
              className={`rounded-md px-2 py-1 text-xs font-medium ${
                submissionMessage === t('allCorrect') ? 'bg-lime-100 text-lime-700' : 'bg-red-100 text-red-700'
              }`}
            >
              {submissionMessage}
            </div>
          ) : null}

          <div className="grow" />

          {/* Action buttons */}
          {isEditable ? (
            <div>
              <button
                onClick={addSampleQuestion}
                className="rounded-lg bg-slate-200 px-2 py-1 text-xs font-bold text-slate-800 hover:bg-slate-300"
              >
                {t('addQuestion')}
              </button>
            </div>
          ) : (
            <div className="flex items-center space-x-1">
              <div
                onClick={() => {
                  refreshUserSubmission();
                }}
                className="cursor-pointer rounded-md p-1.5 hover:bg-slate-200"
                title={t('resetAnswers')}
              >
                <RefreshCcw
                  className="text-slate-500"
                  size={15}
                />
              </div>
              <button
                onClick={() => {
                  handleUserSubmission();
                }}
                className="rounded-lg bg-slate-200 px-2 py-1 text-xs font-bold text-slate-800 hover:bg-slate-300"
              >
                {t('submit')}
              </button>
            </div>
          )}
        </div>

        {/* Questions section */}
        {questions.map((question) => (
          <div
            key={question.question_id}
            className="space-y-2 pt-3"
          >
            <div className="question">
              <div className="flex items-center space-x-2">
                <div className="grow">
                  {isEditable ? (
                    <input
                      value={question.question}
                      placeholder={t('questionPlaceholder')}
                      onChange={(e) => {
                        changeQuestionValue(question.question_id, e.target.value);
                      }}
                      className="bg-primary/10 w-full rounded-md border-2 border-dotted border-gray-200 p-2 text-base font-bold text-slate-800"
                    />
                  ) : (
                    <p className="bg-primary/10 w-full rounded-md p-2 text-base font-bold break-words text-slate-800">
                      {question.question}
                    </p>
                  )}
                </div>
                {isEditable ? (
                  <div
                    onClick={() => {
                      deleteQuestion(question.question_id);
                    }}
                    className="flex h-[24px] w-[24px] flex-none cursor-pointer items-center rounded-lg bg-slate-200 text-sm transition-all ease-linear hover:bg-slate-300"
                    title={t('deleteQuestion')}
                  >
                    <Minus
                      className="mx-auto text-slate-500"
                      size={14}
                    />
                  </div>
                ) : null}
              </div>

              {/* Answers section - changed to vertical layout for better responsiveness */}
              <div className="answers flex flex-col space-y-2 py-2">
                {question.answers.map((answer) => (
                  <div
                    key={answer.answer_id}
                    className={twMerge(
                      'flex min-h-[36px] w-full cursor-pointer items-stretch space-x-2 rounded-lg bg-white bg-opacity-50 pr-2 text-sm shadow-sm outline-2 duration-150 ease-linear hover:bg-opacity-100 hover:shadow-md',
                      answer.correct && isEditable ? 'outline-lime-300' : 'outline-white',
                      userAnswers.some(
                        (userAnswer) =>
                          userAnswer.question_id === question.question_id &&
                          userAnswer.answer_id === answer.answer_id &&
                          !isEditable &&
                          !submitted,
                      )
                        ? 'outline-blue-400'
                        : '',
                      submitted && answer.correct ? 'text-lime outline-lime-300' : '',
                      submitted &&
                        !answer.correct &&
                        userAnswers.some(
                          (userAnswer) =>
                            userAnswer.question_id === question.question_id &&
                            userAnswer.answer_id === answer.answer_id,
                        )
                        ? 'outline-red-400'
                        : '',
                    )}
                    onClick={() => {
                      handleAnswerClick(question.question_id, answer.answer_id);
                    }}
                  >
                    <div
                      className={twMerge(
                        'flex w-[40px] items-center justify-center self-stretch rounded-l-md bg-white font-bold text-base text-slate-800',
                        answer.correct && isEditable ? 'bg-lime-300 text-lime-800 outline-hidden' : 'bg-white',
                        userAnswers.some(
                          (userAnswer) =>
                            userAnswer.question_id === question.question_id &&
                            userAnswer.answer_id === answer.answer_id &&
                            !isEditable &&
                            !submitted,
                        )
                          ? 'bg-blue-400 text-white outline-hidden'
                          : '',
                        submitted && answer.correct ? 'bg-lime-300 text-lime-800 outline-hidden' : '',
                        submitted &&
                          !answer.correct &&
                          userAnswers.some(
                            (userAnswer) =>
                              userAnswer.question_id === question.question_id &&
                              userAnswer.answer_id === answer.answer_id,
                          )
                          ? 'bg-red-400 text-red-800 outline-hidden'
                          : '',
                      )}
                    >
                      <p className="text-sm font-bold">
                        {getAnswerID(question.answers.indexOf(answer), question.question_id)}
                      </p>
                    </div>
                    {isEditable ? (
                      <input
                        value={answer.answer}
                        onChange={(e) => {
                          changeAnswerValue(question.question_id, answer.answer_id, e.target.value);
                        }}
                        placeholder={t('answerPlaceholder')}
                        className="bg-primary/10 mx-2 w-full rounded-md border-2 border-dotted border-gray-200 px-3 py-1.5 pr-6 text-sm font-bold text-neutral-600"
                      />
                    ) : (
                      <p className="bg-primary/10 mx-2 w-full rounded-md px-3 py-1.5 pr-6 text-sm font-bold wrap-break-word text-neutral-600">
                        {answer.answer}
                      </p>
                    )}
                    {isEditable ? (
                      <div className="flex items-center space-x-1">
                        <div
                          onClick={(e) => {
                            e.stopPropagation();
                            markAnswerCorrect(question.question_id, answer.answer_id);
                          }}
                          className="flex h-[24px] w-[24px] flex-none cursor-pointer items-center rounded-lg bg-lime-300 text-sm transition-all ease-linear hover:bg-lime-400"
                          title={answer.correct ? t('markIncorrect') : t('markCorrect')}
                        >
                          <Check
                            className="mx-auto text-lime-800"
                            size={14}
                          />
                        </div>
                        <div
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteAnswer(question.question_id, answer.answer_id);
                          }}
                          className="flex h-[24px] w-[24px] flex-none cursor-pointer items-center rounded-lg bg-slate-200 text-sm transition-all ease-linear hover:bg-slate-300"
                          title={t('deleteAnswer')}
                        >
                          <Minus
                            className="mx-auto text-slate-500"
                            size={14}
                          />
                        </div>
                      </div>
                    ) : null}
                  </div>
                ))}
                {isEditable ? (
                  <div
                    onClick={() => {
                      addAnswer(question.question_id);
                    }}
                    className="hover:bg-opacity-100 flex h-[36px] w-full flex-none cursor-pointer items-center justify-center rounded-lg bg-white text-sm outline-2 outline-white duration-150 ease-linear hover:scale-[1.01] hover:shadow-md active:scale-[1.02]"
                  >
                    <Plus
                      className="mr-1 text-slate-800"
                      size={15}
                    />
                    <span className="text-sm text-slate-800">{t('addAnswer')}</span>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        ))}
      </div>
    </NodeViewWrapper>
  );
};

export default QuizBlockComponent;
