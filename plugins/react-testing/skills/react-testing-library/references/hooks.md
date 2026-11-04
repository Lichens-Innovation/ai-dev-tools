# Testing custom hooks

Use `renderHook`. Wrap state updates in `act`, which is the one place you still need it.

```tsx
import { act, renderHook } from "@testing-library/react";

it("toggles the value", () => {
  const { result } = renderHook(() => useToggle(false));

  act(() => result.current.toggle());

  expect(result.current.value).toBe(true);
});

it("reacts to prop changes", () => {
  const { result, rerender } = renderHook(({ id }) => useThing(id), { initialProps: { id: "a" } });

  rerender({ id: "b" });

  expect(result.current.id).toBe("b");
});
```

- Read `result.current` after each action: it always holds the latest return value. Do not destructure it once and reuse the old values.
- Pass changing arguments through `initialProps` and `rerender`, not through a variable captured by the callback.
- Async hooks: `await waitFor(() => expect(result.current.data).toBe(...))`.
- If a hook is only used by one component, test it through that component instead. Reserve `renderHook` for hooks reused across components.
- When mocking a custom hook, use an explicit spy on the module import (`vi.spyOn(module, "useThing")` or `jest.spyOn`), not an inline module-wide mock.
- A hook that needs providers: `renderHook(() => useThing(), { wrapper: createWrapper() })`, with the wrapper from [context.md](context.md).
