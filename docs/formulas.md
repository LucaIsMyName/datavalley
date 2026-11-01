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

An empty value is blank. Text in quotes is never a column name. Mixing a number with text in `+ - * / %` is `#VALUE`.

## How column values appear

| Column | Formula value |
| --- | --- |
| Number, currency | Number. Currency has no symbol. |
| Checkbox | `TRUE` or `FALSE`. Only a real boolean true counts as checked. |
| Text, long text, mail, url | Text. |
| Date | `YYYY-MM-DD` text. |
| Datetime | ISO text. |
| Date range | A two-item list `[from, to]`, each item a date or datetime string. `YEAR` on the list is `#VALUE`; read one end only if you store a single date. |
| Select, status, radio (one value) | The option label, not the id. |
| Select with multiple values, tags, people, legacy multi-select | A list of labels. |
| Relation | The linked row's title. `[Link -> Price]` reads a field on the linked row. |
| Formula | The inner formula's result. |
| Media | Blank. |
| Row id | The sequence number, or the uuid when the column is set to uuid. |
| Lookup column | The stored cell, not the value the grid computes. Use the `LOOKUP` function instead. |

A whole column is a list with one entry per row, including blanks. `COUNTIF` and `SUMIF` use that list in row order.

## References

A reference is written in brackets. Inside the brackets, spaces and dots are part of the name. Outside them, `.` is only a decimal. Saving rewrites brackets to stable ids.

| Form | Meaning |
| --- | --- |
| `[Price]` | This column on this row. |
| `[People -> Name -> #15]` | One cell. `#15` is the row number in the grid. |
| `[Customer -> Price]` | `Price` on the row this row's Customer link points at. Several links become a list, so wrap them in `SUM` when you need a number. |
| `[People -> Amount]` | Every row of that column. `+ - * / %` reject the list. `SUM`, `AVERAGE`, `MIN`, `MAX`, and `COUNT` fold it. |
| `LOOKUP([People -> Mail], [Email], [People -> Name])` | First row in People whose Mail equals this row's Email, then that row's Name. |

A name that contains `]` or `->` is refused. A reference you cannot view is `#REF`.

## Operators

`+ - * / %` need numbers. A blank is treated as `0`. Dividing by zero is `#DIV/0`.

`&` joins two texts. A list is `#VALUE`.

`=` and `<>` compare two numbers, two texts, or two booleans. Text comparison is exact, including case. `> < >= <=` compare two numbers or two texts. A date stored as `YYYY-MM-DD` sorts correctly as text. Comparing a list with anything is `#VALUE`.

Conditional formatting uses looser rules (case-insensitive text, a label contained in a tag or multi-select list). Those rules do not apply in a normal formula.

## Functions

Each entry says what the function returns, which values it accepts, and one example.

### Numbers

**SUM** adds numbers and skips text and blanks. A list is flattened, so a whole column works. Returns a number.

```text
SUM([Rechnungen -> Betrag (Netto)])
```

**AVERAGE** is the mean of the numbers. No numbers is `#DIV/0`.

```text
AVERAGE([Rechnungen -> Betrag])
```

**MIN** and **MAX** return the smallest or largest number. No numbers returns `0`.

```text
MIN([Rechnungen -> Betrag])
MAX([Rechnungen -> Betrag])
```

**COUNT** counts numbers only. Text and blanks are ignored.

```text
COUNT([Rechnungen -> Betrag])
```

**COUNTA** counts values that are not blank and not an empty list.

```text
COUNTA([Rechnungen -> Kostenstelle])
```

**ROUND** rounds a number to the given digits (`0` through `10`). The second argument is optional and defaults to `0`.

```text
ROUND([Betrag], 2)
```

**ABS** returns the absolute value of a number.

```text
ABS([Betrag])
```

### Logic

**IF** returns the second argument when the condition is truthy, otherwise the third. A number other than `0`, a non-empty text, and `TRUE` are truthy. A blank is not. The third argument may be omitted and is then `FALSE`. Each branch may be a number, text, or boolean.

```text
IF([Budget] > [Kosten], "Im Budget", "Budgetüberschreitung")
```

**IFNOT** is `IF` with the condition reversed.

```text
IFNOT([Paid], "Open", "Done")
```

**IFS** returns the value of the first true condition. Pairs are condition, value, condition, value. No match is `#N/A`.

```text
IFS([Amount] > 100, "High", [Amount] > 0, "Low")
```

**AND** is true when every argument is truthy. **OR** is true when one argument is truthy. **NOT** flips one boolean.

```text
AND([Amount] > 0, [Paid])
OR([Status] = "Open", [Status] = "Pending")
NOT([Paid])
```

### Lists

**FOR** walks a list. Inside the second argument, `IT` is the current number, text, or boolean. The result is a list of the same length. `IT` outside `FOR` is `#VALUE`. A nested `FOR` has its own `IT`.

`IT` is only the current item of the first list. Another whole-column reference inside the formula is still the entire column, not the same row, and comparing it to text is `#VALUE`. Filter two columns with `SUMIF` or `COUNTIF`, not with `FOR`.

```text
SUM(FOR([Rechnungen -> Betrag (Netto)], IF(IT > 0, IT, 0)))
```

**CONTAINS** is true when a text contains a part (case-insensitive), or when a list of labels contains that label (case-insensitive).

```text
CONTAINS([Tags], "Lead")
```

**COUNTIF** counts rows whose first column equals the second argument. The match is exact and case-sensitive. A multi-select, tag, or people cell matches when that label is one of its values.

```text
COUNTIF([Rechnungen -> Kostenstelle], "EDV Kosten")
```

**SUMIF** adds the third column on rows where the first column equals the second argument. Same match rules as `COUNTIF`, including a multi-select cell that contains the label. The two columns are aligned by row order.

```text
SUMIF([Rechnungen -> Kostenstelle], "EDV Kosten", [Rechnungen -> Betrag (Netto)])
```

**ISBLANK** is true for a blank, `""`, or an empty list.

```text
ISBLANK([Notes])
```

### Dates

**YEAR**, **MONTH**, and **DAY** read `YYYY-MM-DD` or an ISO datetime and return a UTC number. A list, including a date range, is `#VALUE`.

```text
YEAR([Invoice date])
MONTH([Invoice date])
DAY([Invoice date])
```

**TODAY** returns today's UTC date as `YYYY-MM-DD`. **NOW** returns the current UTC instant as ISO text. There is no `NOW("day")`. Use `YEAR(TODAY())`, `MONTH(TODAY())`, or `DAY(TODAY())`.

```text
YEAR(TODAY())
NOW()
```

A formula that calls `TODAY` or `NOW`, including through another formula, includes the UTC date in its cache key, so the value moves on to the next day without another cell edit.

### Text

**CONCAT** joins texts. A list argument becomes an empty string.

```text
CONCAT([First], " ", [Last])
```

**LEFT** and **RIGHT** take a text and a count. The count defaults to `1`. **LEN** is the character count. **LOWER** and **UPPER** change case.

```text
LEFT([Name], 1)
RIGHT([Code], 2)
LEN([Name])
LOWER([Email])
UPPER([Code])
```

### Lookup and links

**LOOKUP** finds the first row where the first column equals the middle value, then returns the third column from that same table. The middle value is usually a column on this row. No match is `#N/A`.

```text
LOOKUP([People -> Mail], [Email], [People -> Name])
```

A link is not a function call. `[Customer -> Price]` follows this row's Customer relation. Write `SUM([Customer -> Price])` when the link can point at more than one row.

## Recipes

**Total of another table.** `[Rechnungen -> Betrag (Netto)]` is every net amount. `SUM` folds that list into one number. The same number appears on every row of the formula column.

```text
SUM([Rechnungen -> Betrag (Netto)])
```

**Sum where a select matches.** `SUMIF` walks Kostenstelle and Betrag together, one row at a time, and adds the amount when the cell is exactly `EDV Kosten` or, for a multi-select, when that label is one of the selected values.

```text
SUMIF([Rechnungen -> Kostenstelle], "EDV Kosten", [Rechnungen -> Betrag (Netto)])
```

**Outlook from two formula columns.** `[Budget]` and `[Kosten]` are formula columns on this row. Each can itself be a `SUM` of another table. The comparison uses those results, not the source cells.

```text
IF([Budget] > [Kosten], "Im Budget", "Budgetüberschreitung")
```

**Only positive amounts.** `FOR` turns each amount into itself or `0`. `SUM` then adds that list. This does not look at a second column.

```text
SUM(FOR([Rechnungen -> Betrag (Netto)], IF(IT > 0, IT, 0)))
```

**How many rows use one label.** `COUNTIF` counts exact matches. `COUNTA` counts cells that have any label.

```text
COUNTIF([Rechnungen -> Kostenstelle], "EDV Kosten")
COUNTA([Rechnungen -> Kostenstelle])
```

**This row, and a linked field.** `[Qty] * [Price]` multiplies two numbers on the same row. `[Customer -> Price]` reads Price from the related customer instead.

```text
[Qty] * [Price]
[Customer -> Price]
```

## Conditional formatting

A column or a single cell can store conditional rules. Each rule is a formula, and the first true rule sets that cell's text color and background color. In a rule, `IT` is the cell being painted, including outside `FOR`. A blank cell is blank, so `IT = ""` and `ISBLANK(IT)` are true. `IF(IT = 1)` matches when the condition is true; the branches are ignored. `LOOKUP`, a link to another table, and a whole-column list are rejected. When a cell has any rules of its own, those rules replace the column rules for that cell. These looser comparisons apply only inside a condition. A normal formula still compares text exactly.

## Cache and limits

Results are cached per formula cell. The key includes the current row version, versions of referenced rows, and a stamp of each whole column's table (row count, latest change, and the sum of row versions). A formula that reads another formula, on this row or as a whole column, also includes that inner formula's upstream stamps, so a change in a source table refreshes the chain. Select, status, and tag labels are part of the key, so renaming a label refreshes formulas that read them. Formulas that read another table, directly or through another formula, are cached per permission set.

Limits are 2,000 characters, AST depth 32, 10,000 steps, dependency depth 16, and 50 milliseconds. `IT` is its own syntax node, not a column name. A bracket range such as `A1:A3` is not evaluated and returns `#REF`.
