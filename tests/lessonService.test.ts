// @vitest-environment node
//
// Lesson quizzes and their coin reward (server/utils/lessonService.ts), against
// in-memory SQLite with the project's real migrations applied.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createError } from 'h3'
import {
  activities,
  coinTransactions,
  lessons,
  quizAnswerOptions,
  quizAttempts,
  quizQuestions,
  user,
} from '../server/db/schema'
import { db } from '../server/utils/db'
import { getCoinBalance } from '../server/utils/coinService'
import {
  getAvailableLessons,
  getLessonById,
  getLessonCompletionStatus,
  gradeQuiz,
  submitQuiz,
} from '../server/utils/lessonService'

vi.mock('../server/utils/db', async () => {
  const Database = (await import('better-sqlite3')).default
  const { drizzle } = await import('drizzle-orm/better-sqlite3')
  const { migrate } = await import('drizzle-orm/better-sqlite3/migrator')
  const sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')
  const db = drizzle(sqlite)
  migrate(db, { migrationsFolder: 'drizzle' })
  return { db }
})

vi.stubGlobal('createError', createError)

// Five questions q1..q5; option `qN-right` is correct, `qN-wrong` is not.
const QUESTIONS = ['q1', 'q2', 'q3', 'q4', 'q5']

/** Answers with the first `correct` questions right and the rest wrong. */
function answersWith(correct: number) {
  return Object.fromEntries(QUESTIONS.map((q, i) => [q, i < correct ? `${q}-right` : `${q}-wrong`]))
}

beforeEach(() => {
  db.delete(coinTransactions).run()
  db.delete(quizAttempts).run()
  db.delete(lessons).run()
  db.delete(activities).run()
  db.delete(user).run()

  db.insert(user).values({ id: 'user-1', name: 'User One', email: 'one@utdallas.edu' }).run()
  db.insert(activities)
    .values({
      id: 'quest-1',
      rewardRuleId: 'seed-rule-quest-complete',
      title: 'Lesson quest',
      description: 'Watch and pass the quiz',
      activityType: 'quest',
      evidenceType: 'self_report',
      recurrence: 'once',
    })
    .run()
  db.insert(lessons)
    .values({
      id: 'lesson-1',
      activityId: 'quest-1',
      title: 'Stress',
      description: 'Managing stress',
      videoUrl: 'https://www.youtube.com/watch?v=abc',
    })
    .run()
  QUESTIONS.forEach((q, i) => {
    db.insert(quizQuestions).values({ id: q, lessonId: 'lesson-1', prompt: q, sortOrder: i }).run()
    db.insert(quizAnswerOptions)
      .values([
        { id: `${q}-right`, questionId: q, label: 'Right', isCorrect: true },
        { id: `${q}-wrong`, questionId: q, label: 'Wrong', isCorrect: false },
      ])
      .run()
  })
})

describe('gradeQuiz', () => {
  it('passes at 100% and at exactly 80%', () => {
    expect(gradeQuiz('lesson-1', answersWith(5))).toEqual({
      score: 100,
      passed: true,
      incorrectQuestionIds: [],
    })
    expect(gradeQuiz('lesson-1', answersWith(4))).toEqual({
      score: 80,
      passed: true,
      incorrectQuestionIds: ['q5'],
    })
  })

  it('fails below 80% and counts missing answers as wrong', () => {
    expect(gradeQuiz('lesson-1', answersWith(3))).toMatchObject({ score: 60, passed: false })
    expect(gradeQuiz('lesson-1', { q1: 'q1-right' })).toMatchObject({ score: 20, passed: false })
  })

  it('does not accept an option from a different question', () => {
    expect(gradeQuiz('lesson-1', { ...answersWith(5), q1: 'q2-right' })).toMatchObject({
      score: 80,
      incorrectQuestionIds: ['q1'],
    })
  })
})

describe('getLessonById', () => {
  it('returns the quiz without exposing correct answers', () => {
    const lesson = getLessonById('lesson-1')
    expect(lesson.questions).toHaveLength(5)
    expect(JSON.stringify(lesson)).not.toMatch(/isCorrect|is_correct/)
  })

  it('throws 404 for an unknown lesson', () => {
    expect(() => getLessonById('missing')).toThrow(expect.objectContaining({ statusCode: 404 }))
  })
})

describe('submitQuiz', () => {
  it('records a failed attempt and awards nothing', () => {
    expect(submitQuiz('user-1', 'lesson-1', answersWith(3))).toMatchObject({
      passed: false,
      coinsEarned: 0,
    })
    expect(db.select().from(quizAttempts).all()).toHaveLength(1)
    expect(getLessonCompletionStatus('user-1', 'lesson-1')).toEqual({ completed: false })
    expect(getCoinBalance('user-1')).toBe(0)
  })

  it('lets a student retry after failing and pays the configured reward on pass', () => {
    submitQuiz('user-1', 'lesson-1', answersWith(2))
    expect(submitQuiz('user-1', 'lesson-1', answersWith(5))).toMatchObject({
      score: 100,
      passed: true,
      coinsEarned: 5,
    })
    expect(getCoinBalance('user-1')).toBe(5)
    expect(getLessonCompletionStatus('user-1', 'lesson-1')).toEqual({ completed: true })
    expect(getAvailableLessons('user-1')[0]).toMatchObject({ id: 'lesson-1', completed: true })
  })

  it('does not pay twice for the same lesson', () => {
    submitQuiz('user-1', 'lesson-1', answersWith(5))
    expect(submitQuiz('user-1', 'lesson-1', answersWith(5))).toMatchObject({
      passed: true,
      coinsEarned: 0,
    })
    expect(getCoinBalance('user-1')).toBe(5)
    expect(db.select().from(quizAttempts).all()).toHaveLength(2)
  })
})
