---
paths:
  - "src/**/*.py"
---

# Python style guide

## Python Best Practices

- Use f-strings for string formatting.

## Linting and Formatting

At the end of each task:

1. Use the project’s linter to lint the files that you updated.
2. Do the same with the project’s formatter if there is one.
3. If the project has a library to sort imports, like `isort`, make sure to use it as well.

## Naming Conventions

- When aliasing SQLAlchemy ORM models to avoid name conflicts with Pydantic models, prefix with `Db` (e.g., `from database.models import WorkOrder as DbWorkorder`).

## Code Comments

- Keep the function comments brief.
- Only add comments for more complex code.
- Do not add examples of how to use the function in your comments.
