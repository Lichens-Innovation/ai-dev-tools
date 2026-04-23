---
paths:
  - "src/**/*.py"
---

# Python style guide

## Python Best Practices

- Follow PEP 8 with 120 character line limit
- Use double quotes for Python strings
- Sort imports with `isort`
- Use f-strings for string formatting

## Naming Conventions

- When aliasing SQLAlchemy ORM models to avoid name conflicts with Pydantic models, prefix with `Db` (e.g., `from database.models import WorkOrder as DbWorkorder`).

## Code Comments

- Keep the function comments brief.
- Only add comments for more complex code.
- Do not add examples of how to use the function in your comments.
