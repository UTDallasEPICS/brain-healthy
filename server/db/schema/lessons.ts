// Educational video lessons, their quizzes, and students' quiz attempts.
// Each lesson belongs to an existing quest (activities row).

import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'
import { user } from './auth'
import { activities } from './activities'

export const lessons = sqliteTable('lessons', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  activityId: text('activity_id')
    .notNull()
    .references(() => activities.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description').notNull(),
  videoUrl: text('video_url').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
})

export const quizQuestions = sqliteTable(
  'quiz_questions',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    lessonId: text('lesson_id')
      .notNull()
      .references(() => lessons.id, { onDelete: 'cascade' }),
    prompt: text('prompt').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [index('quiz_questions_lesson_idx').on(t.lessonId)]
)

export const quizAnswerOptions = sqliteTable(
  'quiz_answer_options',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    questionId: text('question_id')
      .notNull()
      .references(() => quizQuestions.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    // Never sent to the client; only lessonService reads it when grading.
    isCorrect: integer('is_correct', { mode: 'boolean' }).notNull().default(false),
  },
  (t) => [index('quiz_answer_options_question_idx').on(t.questionId)]
)

export const quizAttempts = sqliteTable(
  'quiz_attempts',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    lessonId: text('lesson_id')
      .notNull()
      .references(() => lessons.id, { onDelete: 'cascade' }),
    score: integer('score').notNull(),
    passed: integer('passed', { mode: 'boolean' }).notNull(),
    submittedAt: integer('submitted_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index('quiz_attempts_user_lesson_idx').on(t.userId, t.lessonId)]
)
