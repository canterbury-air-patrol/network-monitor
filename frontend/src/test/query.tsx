import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, type RenderResult } from '@testing-library/react'
import type { ReactElement } from 'react'

/** Renders a component that issues queries, with retries off so a rejected
 * request surfaces its error immediately instead of after a backoff. The
 * client comes back with the result so a test can force a refetch instead of
 * waiting out a polling interval. */
export function renderWithQuery(
  ui: ReactElement,
): RenderResult & { queryClient: QueryClient } {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return {
    ...render(
      <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
    ),
    queryClient,
  }
}
