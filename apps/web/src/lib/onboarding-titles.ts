export interface OnboardingTitle {
  readonly gutendexId: number
  readonly title: string
  readonly author: string
  readonly language: 'en' | 'pt'
  readonly coverUrl: string
}

export const ONBOARDING_TITLES: readonly OnboardingTitle[] = [
  {
    gutendexId: 1184,
    title: 'The Count of Monte Cristo',
    author: 'Alexandre Dumas',
    language: 'en',
    coverUrl: 'https://www.gutenberg.org/cache/epub/1184/pg1184.cover.medium.jpg',
  },
  {
    gutendexId: 54829,
    title: 'Memórias Póstumas de Brás Cubas',
    author: 'Machado de Assis',
    language: 'pt',
    coverUrl: 'https://www.gutenberg.org/cache/epub/54829/pg54829.cover.medium.jpg',
  },
  {
    gutendexId: 2554,
    title: 'Crime and Punishment',
    author: 'Fyodor Dostoyevsky',
    language: 'en',
    coverUrl: 'https://www.gutenberg.org/cache/epub/2554/pg2554.cover.medium.jpg',
  },
] as const
