// Accent "tones" for badges and status banners. In light mode they're filled
// with the pastel accent and outlined in ink. In dark mode a solid pastel
// would glare against the navy background, so the accent becomes a tint over
// the surface, with the accent itself as text and outline colour.
//
// Buttons keep their solid accent fills in both themes (see BaseButton), so
// actions stay visually distinct from status labels.
export const TONES = {
  yellow: 'border-ink text-ink bg-sun-light dark:border-sun/70 dark:bg-sun/20 dark:text-sun-light',
  blue: 'border-ink text-ink bg-sky dark:border-sky/70 dark:bg-sky/20 dark:text-sky-light',
  purple: 'border-ink text-ink bg-grape dark:border-grape/70 dark:bg-grape/25 dark:text-lavender',
  gray: 'border-ink text-ink bg-cloud dark:border-cloud/50 dark:bg-cloud/15 dark:text-cloud',
  pink: 'border-ink text-ink bg-blush dark:border-blush/70 dark:bg-blush/20 dark:text-blush',
  green: 'border-ink text-ink bg-leaf dark:border-leaf/70 dark:bg-leaf/20 dark:text-leaf',
} as const

export type Tone = keyof typeof TONES
