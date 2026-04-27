export interface OnboardingTitle {
  readonly gutendexId: number
  readonly title: string
  readonly author: string
  readonly language: 'en' | 'pt'
}

export const ONBOARDING_TITLES: readonly OnboardingTitle[] = [
  {
    gutendexId: 1184,
    title: 'The Count of Monte Cristo',
    author: 'Alexandre Dumas',
    language: 'en',
  },
  {
    gutendexId: 54829,
    title: 'Memórias Póstumas de Brás Cubas',
    author: 'Machado de Assis',
    language: 'pt',
  },
  {
    gutendexId: 2554,
    title: 'Crime and Punishment',
    author: 'Fyodor Dostoyevsky',
    language: 'en',
  },
] as const
