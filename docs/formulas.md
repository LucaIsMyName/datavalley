# Formulas

The formula package parses and evaluates one expression. It does not open the database and it does not use `eval` or `Function`. There is no `=` in front.

A result is a number, text, a boolean, a list of those, or an error: `#CYCLE`, `#REF`, `#VALUE`, `#DIV/0`, `#LIM`, `#N/A`.

```text
1
3.5
"High"
TRUE
FALSE
```

An empty value is null. `+ - * / %` work on numbers. `&` and `CONCAT` join text. `=` and `<>` compare two numbers, two texts, or two booleans. `> < >= <=` compare two numbers or two texts. Mixing a number with text is `#VALUE`.

`IF(condition, whenTrue, whenFalse)` returns either branch. A branch may be a number, text, or a boolean. The false branch may be omitted and is then `FALSE`. `IFNOT` reverses the condition. `IFS(condition1, value1, condition2, value2)` returns the value of the first true condition, or `#N/A`. `AND`, `OR`, and `NOT` return a boolean.

`FOR(list, formula)` walks the list. Inside `formula`, `IT` is the current number, text, or boolean. The result is a list of the same length. `IT` outside `FOR` is `#VALUE`. A nested `FOR` uses its own `IT`. Each step counts toward the step limit.

```text
FOR(Amount, IF(IT > 100, "High", "Low"))
SUM(FOR(Amount, IF(IT > 0, IT, 0)))
IFNOT(Paid, "Open", "Done")
```

`ISBLANK` is true for null, `""`, or an empty list. `CONTAINS` is true when text contains the part, or when a list contains that label. `COUNTIF(column, condition)` counts equal values. `SUMIF(column, condition, numbers)` adds the numbers on those rows. `YEAR`, `MONTH`, and `DAY` read `YYYY-MM-DD` or an ISO datetime and return a UTC number.

`SUM`, `AVERAGE`, `MIN`, and `MAX` add only numbers. `COUNT` counts numbers. `COUNTA` counts values that are not empty. `ROUND` and `ABS` change a number. `LEFT`, `RIGHT`, `LEN`, `LOWER`, and `UPPER` read text. `TODAY` and `NOW` use the clock supplied by the caller.

Editors can type a column name, `Table.Column`, and `Table.Column@rowId`. Saving rewrites those names to stable ids.

```text
SUM(Amount)
LOOKUP(People.Email, Email, People.Name)
RELATION(Customer, Name)
People.Name@44444444-4444-4444-8444-444444444444
```

Stored references look like `{columnId}` for the current row, `{tableId}.{columnId}` for a whole column, and `{tableId}.{columnId}@{rowId}` for one cell. `LOOKUP` finds the first equal row and returns the result column. `RELATION` is resolved by the caller, which follows the row's link. A reference the caller cannot view becomes `#REF`. The hidden cell is not read.

The caller maps grid values before evaluation. Text, long text, mail, and url are text. Number and currency are numbers. A checkbox is a boolean. A date is `YYYY-MM-DD` and a datetime is ISO text. Status, select, and radio are labels. Tags, multi-select, and people are lists of labels. A relation value is the linked row's title. Media is null. A whole column keeps that list, including text and empty cells, so `COUNTIF` can see the labels.

Limits are 2,000 characters, AST depth 32, 10,000 steps, dependency depth 16, and 50 milliseconds. `IT` is its own syntax node, not a column name.

Same-table results are cached per row version and the versions of referenced rows. Formulas that read other tables are cached per permission-set hash, so two users with different visibility do not share a cache entry.
