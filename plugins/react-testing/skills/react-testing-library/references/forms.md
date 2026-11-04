# Testing forms

Interact the way a user does: find fields by label, type, click the submit button, assert on the result.

```tsx
it("submits the entered values", async () => {
  const onSubmit = vi.fn();
  const user = userEvent.setup();
  render(<LoginForm onSubmit={onSubmit} />);

  await user.type(screen.getByLabelText(/email/i), "a@b.co");
  await user.type(screen.getByLabelText(/password/i), "secret");
  await user.click(screen.getByRole("button", { name: /sign in/i }));

  expect(onSubmit).toHaveBeenCalledWith({ email: "a@b.co", password: "secret" });
});

it("shows a validation error for an invalid email", async () => {
  const user = userEvent.setup();
  render(<LoginForm onSubmit={vi.fn()} />);

  await user.type(screen.getByLabelText(/email/i), "nope");
  await user.click(screen.getByRole("button", { name: /sign in/i }));

  expect(await screen.findByRole("alert")).toHaveTextContent(/valid email/i);
});
```

## Notes

- Validation libraries (react-hook-form, Zod and others) often run asynchronously: assert errors with `findBy*`, and assert `onSubmit` with `await waitFor(...)` when it is not called synchronously.
- Other inputs: `user.clear(input)`, `user.selectOptions(select, "value")`, `user.click(checkbox)`, `user.keyboard("{Enter}")`, `user.upload(input, file)`.
- Assert the field's state through accessible attributes: `toBeInvalid()`, `toBeDisabled()`, `toHaveValue("x")`, `toBeChecked()`.
- A controlled input is tested the same way as an uncontrolled one: type, then assert on the displayed value. Never assert on component state.
- Pre-populated forms: render with the initial data, assert the fields show it, then change one field and assert the submitted payload.
- Unlabelled inputs are an accessibility bug: fix the label rather than falling back to `getByTestId`.
