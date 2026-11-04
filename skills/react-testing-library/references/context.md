# Testing context and providers

Use the `wrapper` option, or a custom render that wraps everything the component needs.

```tsx
// test-utils.tsx
import { render, type RenderOptions } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

export function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

export function renderWithProviders(ui: React.ReactElement, options?: Omit<RenderOptions, "wrapper">) {
  return render(ui, { wrapper: createWrapper(), ...options });
}
```

## Several providers

Nest them in one wrapper, outermost first, and accept overrides so a test can change only what it needs:

```tsx
type WrapperOptions = { theme?: Theme; initialRoute?: string };

export function createWrapper({ theme = defaultTheme, initialRoute = "/" }: WrapperOptions = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <ThemeProvider value={theme}>
          <MemoryRouter initialEntries={[initialRoute]}>{children}</MemoryRouter>
        </ThemeProvider>
      </QueryClientProvider>
    );
  };
}
```

## Rules

- Create fresh provider state (a new `QueryClient`, a new store) for every test, so tests cannot leak into each other.
- Test a context consumer by rendering it inside the real provider with the value you need, not by mocking `useContext`.
- To test a provider itself, render a small consumer and assert on what it shows, then trigger an update and assert again.
- Store libraries: reset the store between tests (a `beforeEach` that calls the store's reset, or a fresh store per test).
- Disable retries and animations in test providers, or failures and transitions will make tests slow and flaky.
