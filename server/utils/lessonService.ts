import { and, asc, eq, inArray } from 'drizzle-orm'
import { lessons, quizAnswerOptions, quizAttempts, quizQuestions } from '../db/schema'
import { db } from './db'
import { grantActivityReward } from './rewardService'

export const PASSING_SCORE = 80

/** Question id -> chosen option id. */
export type QuizAnswers = Record<string, string>

function hasPassed(userId: string, lessonId: string): boolean {
  return !!db
    .select({ id: quizAttempts.id })
    .from(quizAttempts)
    .where(
      and(
        eq(quizAttempts.userId, userId),
        eq(quizAttempts.lessonId, lessonId),
        eq(quizAttempts.passed, true)
      )
    )
    .get()
}

export function getAvailableLessons(userId: string) {
  const passed = new Set(
    db
      .selectDistinct({ lessonId: quizAttempts.lessonId })
      .from(quizAttempts)
      .where(and(eq(quizAttempts.userId, userId), eq(quizAttempts.passed, true)))
      .all()
      .map((row) => row.lessonId)
  )

  return db
    .select({
      id: lessons.id,
      title: lessons.title,
      description: lessons.description,
      videoUrl: lessons.videoUrl,
    })
    .from(lessons)
    .orderBy(asc(lessons.sortOrder))
    .all()
    .map((lesson) => ({ ...lesson, completed: passed.has(lesson.id) }))
}

/** The lesson and its quiz. Correct answers are never included. */
export function getLessonById(lessonId: string) {
  const lesson = db
    .select({
      id: lessons.id,
      title: lessons.title,
      description: lessons.description,
      videoUrl: lessons.videoUrl,
    })
    .from(lessons)
    .where(eq(lessons.id, lessonId))
    .get()

  if (!lesson) {
    throw createError({ statusCode: 404, statusMessage: 'Lesson not found' })
  }

  const questions = db
    .select({ id: quizQuestions.id, prompt: quizQuestions.prompt })
    .from(quizQuestions)
    .where(eq(quizQuestions.lessonId, lessonId))
    .orderBy(asc(quizQuestions.sortOrder))
    .all()

  const options = questions.length
    ? db
        .select({
          id: quizAnswerOptions.id,
          label: quizAnswerOptions.label,
          questionId: quizAnswerOptions.questionId,
        })
        .from(quizAnswerOptions)
        .where(
          inArray(
            quizAnswerOptions.questionId,
            questions.map((q) => q.id)
          )
        )
        .all()
    : []

  return {
    ...lesson,
    questions: questions.map((q) => ({
      ...q,
      options: options.filter((o) => o.questionId === q.id).map(({ id, label }) => ({ id, label })),
    })),
  }
}

/** Scores answers against the stored correct options. Missing or invalid answers count as wrong. */
export function gradeQuiz(
  lessonId: string,
  answers: QuizAnswers,
  reader: Pick<typeof db, 'select'> = db
) {
  const correct = reader
    .select({ questionId: quizQuestions.id, optionId: quizAnswerOptions.id })
    .from(quizQuestions)
    .innerJoin(
      quizAnswerOptions,
      and(eq(quizAnswerOptions.questionId, quizQuestions.id), eq(quizAnswerOptions.isCorrect, true))
    )
    .where(eq(quizQuestions.lessonId, lessonId))
    .all()

  if (!correct.length) {
    throw createError({ statusCode: 404, statusMessage: 'Lesson quiz not found' })
  }

  const incorrectQuestionIds = correct
    .filter((c) => answers[c.questionId] !== c.optionId)
    .map((c) => c.questionId)
  const score = Math.round(((correct.length - incorrectQuestionIds.length) / correct.length) * 100)

  return { score, passed: score >= PASSING_SCORE, incorrectQuestionIds }
}

export function getLessonCompletionStatus(userId: string, lessonId: string) {
  return { completed: hasPassed(userId, lessonId) }
}

/** Grades and records an attempt. The first passing attempt earns the lesson reward. */
export function submitQuiz(userId: string, lessonId: string, answers: QuizAnswers) {
  getLessonById(lessonId)

  return db.transaction(
    (tx) => {
      const result = gradeQuiz(lessonId, answers, tx)

      tx.insert(quizAttempts)
        .values({ userId, lessonId, score: result.score, passed: result.passed })
        .run()

      // The ledger's unique source_key makes repeat passes pay nothing.
      const coinsEarned = result.passed
        ? grantActivityReward(userId, 'lesson_quiz_completion', lessonId, {
            writer: tx,
            skipIfDisabled: true,
          }).amount
        : 0

      return { ...result, coinsEarned }
    },
    { behavior: 'immediate' }
  )
}
