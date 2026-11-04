# Async UI, error boundaries, portals, Suspense

## Loading and async data

Assert the loading state, then `await screen.findBy...` for the result. Mock the network at the boundary (MSW, or the API client), never the component.

```tsx
it("shows the user once loaded", async () => {
  renderWithProviders(<UserCard id="1" />);

  expect(screen.getByRole("progressbar")).toBeInTheDocument();
  expect(await screen.findByText("Ana")).toBeInTheDocument();
  expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
});
```

For the error path, make the mocked request fail and assert on the visible message.

## Error boundaries

Render a child that throws and assert on the fallback. React logs the error to `console.error`, so silence it for that test and restore it afterwards.

```tsx
it("shows the fallback when a child throws", () => {
  const spy = vi.spyOn(console, "error").mockImplementation(() => {});

  render(
    <ErrorBoundary fallback={<p>Something went wrong</p>}>
      <Boom />
    </ErrorBoundary>
  );

  expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  spy.mockRestore();
});
```

## Portals

Content rendered into a portal (modals, tooltips, drag previews) is still inside `document.body`, so `screen` finds it. Do not query the render container for it.

## Suspense

Wrap in `<Suspense fallback={...}>`, assert the fallback, then `await screen.findBy...` for the resolved content.

## Timers

Use fake timers only when the code under test needs them (debounce, polling), and pass `advanceTimers` to `userEvent.setup({ advanceTimers: vi.advanceTimersByTime })` so `userEvent` does not hang. Switch back to real timers in the test's cleanup.
