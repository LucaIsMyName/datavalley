# Formulas

The formula package parses and evaluates expressions. It does not open the database and it does not use `eval` or `Function`.

Editors can type column names and `Table.Column`. Saving rewrites those names to stable ids, so reordering columns does not change a formula.

```text
SUM(Amount)
SUM(Customers.Total)
IF(Amount > 100, "High", "Low")
```

Stored references look like `{columnId}` for the current row and `{tableId}.{columnId}` for a whole column.

`TODAY` and `NOW` use the clock supplied by the caller. Limits are 2,000 characters, AST depth 32, 10,000 steps, dependency depth 16, and 50 milliseconds.

Errors are values: `#CYCLE`, `#REF`, `#VALUE`, `#DIV/0`, `#LIM`, `#N/A`. A reference the caller cannot view becomes `#REF`. The hidden cell is not read, and the result does not include its contents.

Same-table results are cached per row version. Formulas that read other tables are cached per permission-set hash, so two users with different visibility do not share a cache entry.
