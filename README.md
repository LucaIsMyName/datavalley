# Datavalley

Self-hosted CRM for projects, dynamic tables, formulas, and integrations.

The API is the source of truth. The web app talks to it through `/api/v1`. Accounts are created by an administrator. Data is private until a grant allows access. The header shows a breadcrumb trail beside search and notifications. When the trail is wider than the bar, the earlier crumbs collapse into a menu. Search finds projects, tables, columns, rows, pages, favorites, and integrations. Opening a column, row, or cell jumps to that table and highlights the target briefly, without filtering the grid. On a phone the sidebar becomes a menu, search opens from a magnifying glass, and the breadcrumb trail shortens to fit. Press Command-K or Ctrl-K to focus search.

Signed-in documentation for projects, tables, and formulas is at `/doc`. Only an administrator can create a project. A new project starts with a People table: Name, Mail, and one sample row. In the members dialog, a member can be removed or suspended for that project, and the last administrator cannot. A project opens as one workspace: its name saves as you type, and the description opens from the info button beside the name and saves the same way. Each table is a tab sized to its name, truncating past a maximum, and New table is the last tab. The active tab's name saves the same way. Projects and tables start with an icon you can change. On a phone the table scrolls sideways, the row gutter stays put, and a long-press opens the same menu as a right-click. Insert a row or column from the grid, sort and filter from the column header, and right-click for the action that belongs to that spot. Hovering a column title shows its data type. The column header menu groups data types, actions, the footer, and conditions, and every context-menu item has an icon. A filter the column cannot apply is skipped, and the rest of the table still loads. New row and bulk actions for selected rows or columns live in the bar under the grid. Click a cell to outline it. Drag the plus in its corner to copy that value up or down the column, and click the outlined cell again to edit it. The same drag copies a checkbox and replaces a formula with the origin cell's expression. Edits save themselves, including language, theme, and timezone in settings. A failed cell, column, or row edit shows a toast at the bottom right. The last 10 changes in a table can be undone. A column type change asks first when some cells would be cleared. Clicking a formula cell opens that cell's expression in a window you can drag and resize. The window stays open while you move through the app, until you open another formula cell. Each cell keeps its own formula, and an idle cell shows the calculated value. Relation columns link a row to a record in another table. Columns can be tags, people, status, dates, or a read-only id. A status badge's chevron can switch that cell, or rename and recolor the status for the whole column. A hidden column stays in place as a blank column, and the eye in its header shows it again. A project can carry a description, and each row can carry markdown notes. A forgotten password can be reset from an emailed link.

## Formulas

A formula column stores one expression on each cell. Changing a column to formula leaves the existing cells empty, and a row created later starts empty until someone writes a formula there. There is no `=` in front.

A result is a number, text, a boolean, or a list of those. The cell shows a number as a number, text as text, `TRUE` or `FALSE`, and a list joined with `, `. An empty cell is empty. Errors are `#CYCLE`, `#REF`, `#VALUE`, `#DIV/0`, `#LIM`, and `#N/A`.

Write numbers as `1` and `3.5`, text as `"High"`, and booleans as `TRUE` and `FALSE`. Text in quotes is never a column name. `+ - * / %` work on numbers. `&` and `CONCAT` join text. `=` and `<>` compare two numbers, two texts, or two booleans. `> < >= <=` compare two numbers or two texts. Mixing a number with text is `#VALUE`.

A reference is written in brackets. `[Column copy]` reads that column on this row. `[People -> Column copy -> #15]` reads one cell, and `#15` is the row number in the grid, so `1 + 2 + 7 / 4 / 3.75646 + [People -> Column copy -> #15]` adds that number. `[Customer -> Price]` reads Price on the linked Customer. One link is one number. Several links is a list, so `SUM([Customer -> Price])` folds it. `[People -> Column copy]` is every row of that column. Math rejects it until `SUM`, `AVERAGE`, `MIN`, `MAX`, or `COUNT` folds it. A column name, `People.Name`, and `People.Name@<rowId>` still work. The formula window inserts the bracket form. Its title links back to the table. A reference is a badge: Backspace removes the whole badge, and clicking it chooses another column, cell, link, or column. Typing a function name completes it, and hovering the name shows what it does and a short example. Accepting the name inserts the call with the cursor between the parentheses so another function can nest there. Enter adds a line. A formula cell updates when a cell, lookup column, or linked field it reads changes.

`IF(condition, whenTrue, whenFalse)` returns either branch, which may be a number, text, or a boolean. Omitting the false branch returns `FALSE`. `IFNOT(Paid, "Open", "Done")` is `IF` with the condition reversed. `IFS(condition1, value1, condition2, value2)` returns the value of the first true condition, or `#N/A`. `AND`, `OR`, and `NOT` return a boolean. `FOR(Amount, IF(IT > 100, "High", "Low"))` walks the list. Inside it, `IT` is the current number, text, or boolean, and the result is a list of the same length. `IT` outside `FOR` is `#VALUE`. `SUM(FOR(Amount, IF(IT > 0, IT, 0)))` folds that list back to a number.

`ISBLANK(Notes)` is true for an empty cell, an empty list, or `""`. `CONTAINS(Tags, "Lead")` is true when text contains the part, or when a list contains that label. `COUNTIF(Status, "Open")` counts matching rows. `SUMIF(Status, "Open", Amount)` adds the numbers on those rows. `YEAR`, `MONTH`, and `DAY` read a date or datetime and return a number.

Text, long text, mail, and url are text. Number and currency are numbers. A checkbox is a boolean, so `IF(Paid, "Yes", "No")` works. A date is `YYYY-MM-DD` text and a datetime is ISO text, so `>` and `<` order them. Status, select, and radio are the label, so `Status = "Open"` matches the badge. Tags, multi-select, and people are lists of labels. A relation used as a value is the linked row's title. The row id is the id shown in the grid. Another formula cell is its calculated value. Media is empty.

`SUM`, `AVERAGE`, `MIN`, `MAX`, `COUNT`, and `COUNTA` read a column and use the numbers in it. `ROUND` and `ABS` change a number. `LEFT`, `RIGHT`, `LEN`, `LOWER`, and `UPPER` read text. `TODAY` and `NOW` read the clock. `LOOKUP([People -> Mail], [Email], [People -> Name])` finds the first row whose match column equals the value on this row and returns the result column. No match is `#N/A`, and a table you cannot view is `#REF`. `[Customer -> Name]` follows this row's link and reads Name on the linked record. Several links return a list, so `SUM` still works. An empty link is empty.

## Develop

Install Node.js 22, then:

```bash
cp .env.development.example .env.development
npm install
npm run dev
```

Open `http://localhost:5173` and sign in as `admin` / `dev-admin-password`. Local setup is in [docs/local-setup.md](docs/local-setup.md). To install another copy on an Ubuntu VPS, copy `.env.production.example` to a private name such as `.env.customer1` and run `npm run deploy`. See [docs/deploy.md](docs/deploy.md).

```bash
npm test
```
