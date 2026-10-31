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

An empty value is null. `+ - * / %` work on numbers. `&` and `CONCAT` join text. Text in quotes is never a column name. `=` and `<>` compare two numbers, two texts, or two booleans. `> < >= <=` compare two numbers or two texts. Mixing a number with text is `#VALUE`.

`IF(condition, whenTrue, whenFalse)` returns either branch. A branch may be a number, text, or a boolean. The false branch may be omitted and is then `FALSE`. `IFNOT` reverses the condition. `IFS(condition1, value1, condition2, value2)` returns the value of the first true condition, or `#N/A`. `AND`, `OR`, and `NOT` return a boolean.

`FOR(list, formula)` walks the list. Inside `formula`, `IT` is the current number, text, or boolean. The result is a list of the same length. `IT` outside `FOR` is `#VALUE`. A nested `FOR` uses its own `IT`. Each step counts toward the step limit.

A column or a single cell can store conditional rules. Each rule is a formula, and the first true rule sets that cell's text color and background color. In a rule, `IT` is the cell being painted, including outside `FOR`. A blank cell is blank, so `IT = ""` and `ISBLANK(IT)` are true, and `IT <> ""` is false. `IF(IT = 1)` and `IF(IT = 1, "High", "Low")` match when the condition is true. The branches are ignored. `IFNOT` matches when its condition is false, and `IFS` matches when any condition is true. Any other formula matches when its result is truthy. A false result, a blank formula, or an error does not match. Text `=` and `<>` ignore case. A number compared with numeric text compares as a number, so `IT > 10` matches the text `"20"`. `IT = "Lead"` matches a tag, people, or multi-select list that contains that label. `[Column]` reads another column on this row. `LOOKUP`, a link to another table, and a whole-column list are rejected. When a cell has any rules of its own, those rules replace the column rules for that cell, even if none of them match. Clearing the cell's rules restores the column rules. These comparison rules apply only inside a condition. A normal formula still compares text exactly, and `IT` outside `FOR` is still `#VALUE`.

```text
FOR(Amount, IF(IT > 100, "High", "Low"))
SUM(FOR(Amount, IF(IT > 0, IT, 0)))
IFNOT(Paid, "Open", "Done")
```

`ISBLANK` is true for null, `""`, or an empty list. `CONTAINS` is true when text contains the part, or when a list contains that label. `COUNTIF(column, condition)` counts equal values. `SUMIF(column, condition, numbers)` adds the numbers on those rows. `YEAR`, `MONTH`, and `DAY` read `YYYY-MM-DD` or an ISO datetime and return a UTC number.

`SUM`, `AVERAGE`, `MIN`, and `MAX` add only numbers. `COUNT` counts numbers. `COUNTA` counts values that are not empty. `ROUND` and `ABS` change a number. `LEFT`, `RIGHT`, `LEN`, `LOWER`, and `UPPER` read text. `TODAY` and `NOW` use the clock supplied by the caller.

A reference is written in brackets. Inside the brackets, spaces and dots are part of the name. Outside them, `.` is only a decimal. Saving rewrites brackets, and the older column name, `Table.Column`, and `Table.Column@rowId` forms, to stable ids.

```text
[Column copy]
1 + 2 + 7 / 4 / 3.75646 + [People -> Column copy -> #15]
[Customer -> Price]
SUM([People -> Column copy])
LOOKUP([People -> Mail], [Email], [People -> Name])
```

`[Column copy]` is that column on this row. `[People -> Column copy -> #15]` is one cell, and `#15` is the row number shown in the grid. `[Customer -> Price]` follows this row's Customer link and reads Price on the linked record. A link and a table that share a name follow the link when there are two names. Three names are always one cell. `[People -> Column copy]` is every row of that column. `+ - * / %` reject that list and the caller reports that the column is every row. `SUM`, `AVERAGE`, `MIN`, `MAX`, and `COUNT` fold it. A name that contains `]` or `->` is refused.

The formula window stays open over the app and does not block the table. It can be dragged and resized. Its title names the column and links the table, so the window can be open on another page and still return there. A bracket is a badge. Backspace or Delete removes the whole badge, and clicking the badge replaces that one reference. Typing a function name lists matching functions, including the example on each one. Hovering a function name shows what it does and a short example. Accepting a function inserts it with the cursor between the parentheses, so the next function nests inside. Enter inserts a new line, which the parser skips.

Stored references look like `{columnId}` for the current row, `{tableId}.{columnId}` for a whole column, and `{tableId}.{columnId}@{rowId}` for one cell. Opening a formula shows the bracket form built from those ids. `LOOKUP` finds the first equal row and returns the result column. A two-name link is stored as `RELATION`, which the caller resolves by following the row's link. A reference the caller cannot view becomes `#REF`. The hidden cell is not read.

The caller maps grid values before evaluation. Text, long text, mail, and url are text. Number and currency are numbers. A checkbox is a boolean. A date is `YYYY-MM-DD` and a datetime is ISO text. Status, select, and radio are labels. Tags, multi-select, and people are lists of labels. A relation value is the linked row's title. Media is null. A whole column keeps that list, including text and empty cells, so `COUNTIF` can see the labels.

Limits are 2,000 characters, AST depth 32, 10,000 steps, dependency depth 16, and 50 milliseconds. `IT` is its own syntax node, not a column name.

Same-table results are cached per row version and the versions of referenced rows. A whole column, lookup, or linked field also follows that table's row count, latest change, and the sum of its row versions, so editing an older row still refreshes the formula. Formulas that read other tables are cached per permission-set hash, so two users with different visibility do not share a cache entry.
