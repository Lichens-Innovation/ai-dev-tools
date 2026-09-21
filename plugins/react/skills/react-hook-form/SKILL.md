---
name: react-hook-form
description: >
  Guide for setting up react-hook-form with Zod validation in React. Use this skill whenever the user wants to create a form component, add form validation, wire up Zod schemas to a form, use react-hook-form's Controller, handle form submission, display field errors, or reset/pre-populate a form with existing data. Also use when the user asks how to integrate react-hook-form with a UI component library (Ant Design, MUI, shadcn, etc.) or how to type form values with TypeScript.
---

# React Hook Form + Zod

A pattern for building validated form components in React using `react-hook-form` and `zod`.

## Installation

```bash
npm install react-hook-form zod @hookform/resolvers
```

## 1. Define a Zod Schema and Infer the Type

Define the schema once and derive the TypeScript type from it — no duplication.

```typescript
import { z } from "zod";

const userSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  role: z.string().optional(),
});

type UserForm = z.infer<typeof userSchema>;
```

## 2. Initialize useForm

Pass the schema to `zodResolver` and type the form with the inferred type.

```typescript
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

const {
  control,
  handleSubmit,
  reset,
  formState: { errors },
} = useForm<UserForm>({ resolver: zodResolver(userSchema) });
```

Key destructured values:

| Value | Purpose |
|-------|---------|
| `control` | Passed to `<Controller>` to connect inputs |
| `handleSubmit` | Wraps your submit handler; validates before calling it |
| `reset` | Clears the form or populates it with new values |
| `errors` | Object with validation errors per field |

## 3. Render Fields with Controller

Use `<Controller>` to connect any input — native HTML or a UI library component — to the form.

```tsx
import { Controller } from "react-hook-form";

<Controller
  name="name"
  control={control}
  render={({ field }) => <input {...field} />}
/>
```

The `field` object contains `value`, `onChange`, `onBlur`, and `ref`. Spread it directly onto the input.

## 4. Display Validation Errors

Check `errors.fieldName` to conditionally show error messages.

```tsx
<div>
  <Controller
    name="email"
    control={control}
    render={({ field }) => <input type="email" {...field} />}
  />
  {errors.email && <span>{errors.email.message}</span>}
</div>
```

For UI libraries that accept `validateStatus` / `help` props (e.g. Ant Design):

```tsx
<Form.Item
  validateStatus={errors.email ? "error" : ""}
  help={errors.email?.message}
>
  <Controller name="email" control={control} render={({ field }) => <Input {...field} />} />
</Form.Item>
```

## 5. Handle Submission

Pass your handler to `handleSubmit`. The handler receives fully-typed, validated values.

```typescript
const onSubmit = (values: UserForm) => {
  // values is typed and validated — safe to use directly
  saveUser(values);
};

// Wire to a button or form element:
<button onClick={handleSubmit(onSubmit)}>Save</button>
// or
<form onSubmit={handleSubmit(onSubmit)}>...</form>
```

## 6. Reset and Pre-populate

Call `reset()` to clear the form, or `reset(values)` to fill it with existing data (useful for edit forms).

```typescript
// Clear on cancel
const handleCancel = () => {
  reset();
  onClose();
};

// Pre-populate when editing existing data
useEffect(() => {
  if (user) {
    reset({
      name: user.name,
      email: user.email,
      role: user.role,
    });
  }
}, [user, reset]);
```

## Complete Example

A generic edit modal combining all the pieces:

```tsx
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

const userSchema = z.object({
  name: z.string().min(1, "Required"),
  email: z.string().email("Invalid email"),
});

type UserForm = z.infer<typeof userSchema>;

type Props = {
  user: { name: string; email: string } | null;
  onSave: (values: UserForm) => void;
  onClose: () => void;
};

export function EditUserModal({ user, onSave, onClose }: Props) {
  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<UserForm>({ resolver: zodResolver(userSchema) });

  useEffect(() => {
    if (user) reset({ name: user.name, email: user.email });
  }, [user, reset]);

  const onSubmit = (values: UserForm) => {
    onSave(values);
    reset();
    onClose();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <div>
        <Controller
          name="name"
          control={control}
          render={({ field }) => <input placeholder="Name" {...field} />}
        />
        {errors.name && <span>{errors.name.message}</span>}
      </div>

      <div>
        <Controller
          name="email"
          control={control}
          render={({ field }) => <input placeholder="Email" {...field} />}
        />
        {errors.email && <span>{errors.email.message}</span>}
      </div>

      <button type="button" onClick={() => { reset(); onClose(); }}>Cancel</button>
      <button type="submit">Save</button>
    </form>
  );
}
```

## Tips

- **Co-locate schema and type** — define `schema` and `type Form = z.infer<typeof schema>` in the same file as (or a utils file imported by) the component.
- **Array fields** — use `z.array(z.string())` in the schema; the `Controller` render can be a multi-select or tag input.
- **Optional fields** — use `.optional()` or `.nullable()` in Zod; react-hook-form will pass `undefined`/`null` through without triggering required errors.
- **Async validation** — Zod's `.refine()` supports async predicates; react-hook-form awaits them automatically.
