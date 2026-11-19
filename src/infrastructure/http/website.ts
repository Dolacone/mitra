const site = 'https://mitracal.com'

/** A page of the documentation, by its slug (`agents`, `views/week`). */
export const docsPage = (page: string) => new URL(`/docs/${page}`, site).href
