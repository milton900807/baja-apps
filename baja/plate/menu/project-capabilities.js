function () {

    // WHAT THE PROJECT CAN DO WITH ARGUMENTS IN HAND.
    //
    // The menubar is the catalogue for everything else, and for most requests it is the
    // right one: nearly every item here opens a dialog that asks its own questions, so
    // "import a plate from a spreadsheet" is answered by opening Import. But some requests
    // arrive with the answer to that dialog's question already in them -- "a table with two
    // rows and four columns" -- and the dialog cannot accept it. Draw > Table asks for a
    // name and then takes the size from how far you drag.
    //
    // So: an operation if one can carry the request out as stated; otherwise the menu item
    // that opens the place it is done. Doing it beats opening the door to it, and opening
    // the door beats refusing.
    //
    // THE MODULE PATH LIVES HERE, NEVER IN THE ANSWER. The model returns a NAME from this
    // list and arguments for its declared parameters. Every file under baja/ is exec-able by
    // path, so an answer that could carry a path would be a shell on the user's unsaved
    // work. The name is looked up in this table and nothing else is ever run.

    const LIST = [
        {
            // A MAILBOX AS A SOURCE OF DATES. The connection is a consent screen and a token
            // kept on the server; this is the asking.
            name: 'gmail_to_timeline',
            summary: 'read recent mail from the user\u2019s connected Gmail and put the dated '
                + 'commitments in it on a timeline. THIS IS THE ANSWER to "integrate my '
                + 'gmail", "put the dates from my mail on this", "what have I committed to '
                + 'this month". It connects the mailbox first if it is not connected, and '
                + 'what is found is shown with the words it came from before anything is '
                + 'added',
            module: 'baja/plate/ops/gmail-to-timeline.js',
            params: {
                query: { type: 'string', default: 'the last fortnight, without spam or bin',
                    about: 'a Gmail search, in Gmail\u2019s own syntax, when the request narrows '
                        + 'it: from:someone, newer_than:30d, subject:kickoff, has:attachment. '
                        + 'Combine them with spaces' },
                max: { type: 'number', default: '25',
                    about: 'how many messages to read, at most 50' },
                timeline: { type: 'string', default: 'the timeline the request was made from, '
                        + 'or the only one here',
                    about: 'the NAME of the timeline to put them on' }
            }
        },
        {
            // CONNECTING OR DISCONNECTING THE MAILBOX ITSELF.
            name: 'gmail_connection',
            summary: 'connect the user\u2019s Gmail to this app, say whether it is connected, or '
                + 'disconnect it and give the access back to Google. Reading mail connects it '
                + 'on its own, so this is for "connect my gmail", "is my gmail connected", '
                + '"disconnect my gmail" asked on their own',
            module: 'baja/plate/ops/gmail-connect.js',
            params: {
                what: { type: 'enum', values: ['connect', 'status', 'disconnect'],
                    default: 'connect', about: 'which of the three was asked for' }
            }
        },
        {
            // DATES READ OUT OF TEXT. "Load milestones and intervals derived from my mail":
            // the reading is this, whatever the text comes from.
            name: 'events_from_text',
            summary: 'read dated commitments out of text -- a pasted email, a thread, notes, '
                + 'minutes -- and put them on a timeline as milestones and intervals. THIS IS '
                + 'THE ANSWER to "pull the dates out of this", "put the deadlines in this '
                + 'email on the timeline", "load milestones from my mail". What is found is '
                + 'shown with the words it came from before anything is added',
            module: 'baja/plate/ops/text-to-timeline.js',
            params: {
                text: { type: 'string', default: 'the user is asked to paste it',
                    about: 'the text to read, ONLY when the request itself contains it. A '
                        + 'request that merely refers to an email or a document does not: '
                        + 'leave this out and the user is asked to paste it' },
                sent: { type: 'string', default: 'today',
                    about: 'the date the text was written, as YYYY-MM-DD, if the request says '
                        + 'it: "tomorrow" in an old email is a day near when it was sent, not '
                        + 'near today' },
                timeline: { type: 'string', default: 'the timeline the request was made from, '
                        + 'or the only one here',
                    about: 'the NAME of the timeline to put them on' }
            }
        },
        {
            // A CALENDAR ON A TIMELINE. "Integrate my calendar" had nothing behind it.
            name: 'import_calendar',
            summary: 'put the events from a calendar onto a timeline. THIS IS THE ANSWER to '
                + '"integrate my calendar", "put my calendar on this", "import my calendar". '
                + 'It reads a calendar by its private iCal (.ics) address, which every '
                + 'calendar publishes and which needs no sign-in; if the request does not '
                + 'give one, the user is asked for it. An email address is NOT a calendar '
                + 'address, so never pass one as address: leave it out and let the user be '
                + 'asked',
            module: 'baja/plate/ops/calendar-import.js',
            params: {
                address: { type: 'string', default: 'the user is asked for it',
                    about: 'the calendar\u2019s iCal address, only if the request actually '
                        + 'contains an https:// or webcal:// link. Never an email address' },
                timeline: { type: 'string', default: 'the timeline the request was made from, '
                        + 'or the only one here',
                    about: 'the NAME of the timeline to put the events on' }
            }
        },
        {
            // ARITHMETIC ON WHAT IS SELECTED. "Increase these values by 10%" had nothing
            // behind it, and the only way was to retype eight numbers.
            name: 'change_values',
            summary: 'change the numbers in the SELECTED cells by arithmetic: raise or lower '
                + 'them by a percentage, add or subtract an amount, multiply them, or set '
                + 'them all to one number. THIS IS THE ANSWER to "increase these by 10%", '
                + '"take 5000 off these", "double these", "round these to the nearest '
                + 'thousand". Cells holding text or a formula are left alone',
            module: 'baja/plate/ops/change-values.js',
            params: {
                by_percent: { type: 'number', default: '0, meaning no percentage change',
                    about: 'raise them by this percentage; a negative number lowers them, so '
                        + '"10% off" is -10' },
                add: { type: 'number', default: '0, meaning nothing added',
                    about: 'add this to each; a negative number subtracts it' },
                multiply_by: { type: 'number', default: '0, meaning no multiplication',
                    about: 'multiply each by this ("double these" is 2)' },
                set_to: { type: 'number', default: 'not set, so the numbers that are there are '
                        + 'changed rather than replaced',
                    about: 'set every selected cell to this one number' },
                round: { type: 'enum', values: ['none', 'whole', 'cents', 'ten', 'hundred', 'thousand'],
                    default: 'none', about: 'round the result; "to the nearest thousand" is '
                        + 'thousand, "no pennies" is whole' },
                table: { type: 'string', default: 'the table the request was made from',
                    about: 'the NAME of the table the selected cells are in, if the request says it' }
            }
        },
        {
            // CONTENT FOR A TABLE WHOSE COLUMNS ALREADY EXIST. Making a new table from a
            // sentence was covered; filling in the one in front of you was not, and that is
            // the commoner job.
            name: 'fill_table',
            summary: 'put content into a table that already has its columns, worked out from '
                + 'a description. THIS IS THE ANSWER whenever the request asks to add, fill '
                + 'in, populate or generate ENTRIES, EXAMPLES or DATA for a table that is '
                + 'already there ("add a bunch of employees and salaries to this", "fill in '
                + 'some example parts"). The rows go into the empty rows at the bottom and '
                + 'nothing already written is overwritten',
            module: 'baja/plate/ops/fill-table.js',
            params: {
                what: { type: 'string', required: true,
                    about: 'what should go in it, in the user\u2019s own words, with everything '
                        + 'they said about the kind of thing it is: pass the request through '
                        + 'rather than summarising it, since the detail is what makes the '
                        + 'content fit' },
                table: { type: 'string', default: 'the table the request was made from',
                    about: 'the NAME of the table, if the request says it' },
                rows: { type: 'number', default: '0, meaning as many as the request implies',
                    about: 'how many rows, when the request says a number' }
            }
        },
        {
            // ROWS ON A TABLE THAT IS ALREADY THERE. "Add 4 rows" offered three ways to make
            // a NEW table, in answer to a request about the one in front of the user.
            name: 'table_size',
            summary: 'add or remove rows, or add columns, on a table that is already on the '
                + 'canvas. THIS IS THE ANSWER to "add 4 rows", "two more columns", "make it '
                + 'longer" and the like, which are about the table the request came from and '
                + 'never a reason to make a new one',
            module: 'baja/plate/ops/table-size.js',
            params: {
                table: { type: 'string', default: 'the table the request was made from',
                    about: 'the NAME of the table, if the request says it' },
                rows: { type: 'number', default: '0, meaning leave the rows alone',
                    about: 'how many rows to add; a negative number removes that many from '
                        + 'the bottom' },
                columns: { type: 'number', default: '0, meaning leave the columns alone',
                    about: 'how many columns to add. Removing columns is not offered' },
                names: { type: 'string', default: 'the new columns are left unnamed',
                    about: 'names for the new columns, separated by commas, if the request '
                        + 'gives them' },
                force: { type: 'enum', values: ['yes'], default: 'not set, so rows holding '
                        + 'something are kept',
                    about: 'set to yes ONLY when the request plainly says to remove rows even '
                        + 'though they have something in them' }
            }
        },
        {
            // SOMETHING ON THE CANVAS, ASKED FOR BY NAME. "Show me assumptions" matched a
            // menu item that opens a dialog of the same name; what was wanted was the table
            // of that name, sitting on the canvas somewhere off screen.
            name: 'show_object',
            summary: 'centre the canvas on an object that is already there and select it, '
                + 'named: a table, a chart, a timeline. THIS IS THE ANSWER whenever the '
                + 'request asks to see, show, find, go to or open something whose name is in '
                + 'the context\u2019s on_canvas list, and it beats any menu item that happens to '
                + 'carry the same word, because the user is asking for the thing they can '
                + 'see the name of rather than for a dialog about it',
            module: 'baja/plate/ops/focus-object.js',
            params: {
                name: { type: 'string', required: true,
                    about: 'the name of the object to show, as the request says it' }
            }
        },
        {
            name: 'new_table',
            summary: 'add a new empty table of a given size to the project',
            module: 'baja/plate/ops/new-table.js',
            params: {
                rows: { type: 'number', min: 1, max: 500, required: true,
                    about: 'how many rows of cells' },
                cols: { type: 'number', min: 1, max: 200, required: true,
                    about: 'how many columns of cells' },
                name: { type: 'string', default: 'a name the project picks',
                    about: 'what to call it, only if the request names it; otherwise leave it out '
                        + 'and the project names it' }
            }
        }
        ,
        {
            name: 'set_column_values',
            summary: 'write a list of values down one column of a table, from the top',
            module: 'baja/plate/ops/set-column-values.js',
            params: {
                values: { type: 'string[]', required: true, max: 500,
                    about: 'the values, in order, one per row' },
                // NOT REQUIRED, AND THAT IS NOT THE SAME AS LETTING THE MODEL GUESS ONE.
                // "insert from top to bottom: cogs, employees, product" says the direction
                // and never names a column, and refusing that is pedantry: the first column
                // is what it means. The default belongs to the operation, is written down
                // here, and is shown in the preview before anything runs -- so the user sees
                // "column 0 (the first)" and presses GO or does not. A model filling in a
                // column nobody mentioned would be the other thing, and is still refused.
                column: { type: 'string', default: '0, the first column',
                    about: 'which column: its number counting from 0, or its letter (A, B, C). '
                        + 'Leave it out when the request does not name one: it means the first '
                        + 'column. Never guess a different column' },
                table: { type: 'string', default: 'the selected table',
                    about: 'the table\u2019s name, if the request says it; leave it out for the '
                        + 'selected table' },
                start_row: { type: 'number', min: 0, max: 5000, default: '0, the top row',
                    about: 'the row to start at, counting from 0; leave it out for the top' }
            }
        },
        {
            name: 'timeline_add',
            summary: 'put a milestone on a date, or an interval between two dates, onto the '
                + 'timeline that is open. THE DATE DOES NOT HAVE TO FALL INSIDE THE '
                + 'TIMELINE\u2019S CURRENT WINDOW, which the context gives as start and end: a '
                + 'date outside it grows the timeline to take it in, and the reply says so. '
                + 'So work the date out from the request and today\u2019s date and use it as it '
                + 'comes out, never moved to the nearest day that happens to fit the window, '
                + 'and never refused for being outside it',
            module: 'baja/plate/ops/timeline-add.js',
            params: {
                timeline: { type: 'string', default: 'the one named in the context, or the only one here',
                    about: 'the NAME of the timeline to put it on, copied from the context\u2019s '
                        + 'timeline field when there is one: there can be several on the canvas' },
                title: { type: 'string', required: true, about: 'what it is called' },
                kind: { type: 'enum', values: ['milestone', 'interval'], default: 'milestone',
                    about: 'a milestone sits at one moment; an interval runs between two. '
                        + 'ANYTHING WITH A LENGTH IS AN INTERVAL, however short: a meeting '
                        + 'for 3 hours, a call for 30 minutes, a trip for a week' },
                date: { type: 'string', default: 'required for a milestone',
                    about: 'when a milestone is, as YYYY-MM-DD, or YYYY-MM-DDTHH:MM when the '
                        + 'request gives a time of day. Worked out from today\u2019s date in the '
                        + 'context' },
                start: { type: 'string', default: 'required for an interval',
                    about: 'when an interval starts, as YYYY-MM-DD, or YYYY-MM-DDTHH:MM' },
                end: { type: 'string', default: 'required for an interval',
                    about: 'when it ends, as YYYY-MM-DD, or YYYY-MM-DDTHH:MM. IT MUST BE '
                        + 'LATER THAN start: for something that runs for hours or minutes, '
                        + 'both ends need a TIME, since the same date twice is the same '
                        + 'instant and is refused. "For 3 hours" from 13:00 ends at 16:00. '
                        + 'Where the request says a part of the day and no clock time, read '
                        + 'morning as 09:00, afternoon as 13:00, evening as 18:00, and give '
                        + 'an unstated length one hour' }
            }
        },
        {
            // MOVING A TIMELINE'S RANGE IS A THING THAT CAN BE ASKED FOR. "Expand it by 10%
            // on both ends" used to come back as nothing matching, about the very timeline
            // the request was made from.
            name: 'timeline_range',
            summary: 'change the range of dates a timeline covers: widen it, narrow it, or '
                + 'set it to two dates. THIS IS WHAT ZOOMING A TIMELINE MEANS: zooming out, '
                + 'or showing more, widens the range; zooming in, or showing less, narrows '
                + 'it. A percentage or a number of days is applied to the '
                + 'end or ends named by edge; a negative amount narrows it. Giving start or '
                + 'end as dates sets that edge outright',
            module: 'baja/plate/ops/timeline-range.js',
            params: {
                timeline: { type: 'string', default: 'the one named in the context, or the only one here',
                    about: 'the NAME of the timeline, copied from the context\u2019s timeline field' },
                by_percent: { type: 'number', default: '0, meaning no change by percentage',
                    about: 'how much to widen each named edge by, as a percentage of the range '
                        + 'it covers now; negative narrows it' },
                by_days: { type: 'number', default: '0, meaning no change by days',
                    about: 'how many days to widen each named edge by; negative narrows it' },
                edge: { type: 'enum', values: ['start', 'end', 'both'], default: 'both',
                    about: 'which end moves' },
                start: { type: 'string', default: 'leave the start where it is',
                    about: 'a new start date, as YYYY-MM-DD; this wins over an amount' },
                end: { type: 'string', default: 'leave the end where it is',
                    about: 'a new end date, as YYYY-MM-DD; this wins over an amount' }
            }
        },
        {
            name: 'new_timeline',
            summary: 'add a timeline covering a range of dates',
            module: 'baja/plate/ops/new-timeline.js',
            params: {
                title: { type: 'string', default: 'the user is asked for one',
                    about: 'what the timeline is called, WHENEVER THE REQUEST SAYS OR IMPLIES '
                        + 'a name: "a timeline called mywork" is mywork, "my Q1 plan" is Q1 '
                        + 'plan. Leave it out only when nothing in the request names it' },
                start: { type: 'string', required: true,
                    about: 'the first date, as YYYY-MM-DD. Work it out from today\u2019s date in '
                        + 'the context: "now" and "today" mean that date' },
                end: { type: 'string', required: true,
                    about: 'the last date, as YYYY-MM-DD. Work it out from today\u2019s date in '
                        + 'the context: "the end of the year" means 31 December of that year, '
                        + '"the end of the month" the last day of that month' }
            }
        },
        {
            name: 'derive_from_new_table',
            summary: 'make a new table and point the SELECTED cells at it by formula, so their '
                + 'values come from it. Two shapes: with columns (or sum_column) given it '
                + 'builds a table with those headings, rows to fill in, and the named column '
                + 'TOTALLED at the foot, and the selected cell reads that total -- which is '
                + 'what "derive this from the sum of the salaries in a new table" asks for. '
                + 'With neither, it builds a table the shape of the selection and each cell '
                + 'reads its own',
            module: 'baja/plate/ops/derive-from-new-table.js',
            params: {
                name: { type: 'string', default: 'the user is asked for one',
                    about: 'what to call the new table, if the request says it. Leave it out '
                        + 'when it does not: the user is asked. Never invent a name' },
                columns: { type: 'string', default: 'not set, so the table is the shape of the selection',
                    about: 'the new table\u2019s column headings, separated by commas, when the '
                        + 'request says what it holds: "salaries" gives "Name, Salary". Put '
                        + 'the labels first and the numbers second' },
                sum_column: { type: 'string', default: 'the second column, where the numbers '
                        + 'sit in a table of labels and values',
                    about: 'which column is totalled at the foot, by its heading. Setting this '
                        + 'alone builds the totalled table too' },
                rows: { type: 'number', default: '8',
                    about: 'how many rows to leave to fill in, above the total' },
                table: { type: 'string', default: 'the selected table',
                    about: 'the table the selected cells are in, if the request names it' }
            }
        },
        {
            // A CELL THAT TOTALS ANOTHER TABLE is most of what a spreadsheet is for, and
            // there was no operation for it: "I want this value to be the sum of the
            // Employees table" came back as nothing matching.
            name: 'cell_from_table',
            summary: 'put a formula in the SELECTED cells that reads a whole table: its sum, '
                + 'average, smallest, largest, or how many numbers are in it. If no table of '
                + 'that name exists yet, the user is asked for its columns and values and it '
                + 'is made, so a request naming a table that is not there is still this',
            module: 'baja/plate/ops/cell-from-table.js',
            params: {
                table: { type: 'string', required: true,
                    about: 'the NAME of the table to read, as the request says it' },
                how: { type: 'enum', values: ['sum', 'average', 'min', 'max', 'count'],
                    default: 'sum', about: 'what to work out over that table. COUNT IS HOW '
                        + 'MANY ROWS IT HAS. Choose count whenever the cell stands for the '
                        + 'table itself rather than for a number in it: "how many employees", '
                        + '"the number of X", "the employees value", and a cell whose own row '
                        + 'is labelled with the table\u2019s name. A table of people, parts or '
                        + 'anything else that is not money is almost always a count. The '
                        + 'others add up, average, or pick the smallest or largest of the '
                        + 'NUMBERS in the table, and are right only when the request names a '
                        + 'quantity those numbers hold, such as total salary' },
                in_table: { type: 'string', default: 'the table the request was made from',
                    about: 'the table the selected cells are in, if the request names it' }
            }
        },
        {
            name: 'format_cells',
            summary: 'change how the SELECTED cells are shown: as money, or as plain numbers',
            module: 'baja/plate/ops/format-cells.js',
            params: {
                style: { type: 'enum', values: ['dollar', 'plain'], required: true,
                    about: 'dollar shows the number as money ($1,200.00); plain takes that '
                        + 'off. It changes how the number is shown, never the number' },
                table: { type: 'string', default: 'the selected table',
                    about: 'the table\u2019s name, if the request says it; leave it out for the '
                        + 'selected table' }
            }
        },
        {
            name: 'rearrange_column',
            summary: 'reverse, sort, close the gaps in, de-duplicate, fill down, tidy or clear '
                + 'the values already in one column',
            module: 'baja/plate/ops/rearrange-column.js',
            params: {
                action: { type: 'enum', required: true,
                    values: ['reverse', 'sort_asc', 'sort_desc', 'compact', 'dedupe',
                        'fill_down', 'trim', 'clear'],
                    about: 'reverse turns the column upside down; sort_asc and sort_desc sort '
                        + 'it (as numbers when every value is one); compact pulls the values '
                        + 'up so there are no gaps; dedupe keeps the first of each repeat; '
                        + 'fill_down copies each value into the empty cells under it; trim '
                        + 'tidies the spacing; clear empties the column' },
                column: { type: 'string', default: '0, the first column',
                    about: 'which column: its number counting from 0, or its letter. Leave it '
                        + 'out when the request does not name one: it means the first column' },
                table: { type: 'string', default: 'the selected table',
                    about: 'the table\u2019s name, if the request says it; leave it out for the '
                        + 'selected table' }
            }
        },
        {
            name: 'move_column',
            summary: 'copy one column onto another, swap two columns, or move a column to a '
                + 'different position',
            module: 'baja/plate/ops/move-column.js',
            params: {
                action: { type: 'enum', values: ['copy', 'swap', 'move'], required: true,
                    about: 'copy writes it onto the other column; swap exchanges the two; move '
                        + 'takes it out and puts it back at that position, sliding the rest over' },
                column: { type: 'string', required: true,
                    about: 'the column to act on: its number counting from 0, or its letter' },
                to: { type: 'string', required: true,
                    about: 'the other column, or for move the position it should end up at' },
                table: { type: 'string', default: 'the selected table',
                    about: 'the table\u2019s name, if the request says it; leave it out for the '
                        + 'selected table' }
            }
        },
        {
            name: 'shift_column_values',
            summary: 'move the values already in a column up or down by a number of rows',
            module: 'baja/plate/ops/shift-column-values.js',
            params: {
                by: { type: 'number', min: 1, max: 5000, required: true,
                    about: 'how many rows to move them' },
                direction: { type: 'enum', values: ['down', 'up'], required: true,
                    about: 'which way to move them' },
                column: { type: 'string', default: '0, the first column',
                    about: 'which column: its number counting from 0, or its letter. Leave it '
                        + 'out when the request does not name one: it means the first column' },
                table: { type: 'string', default: 'the selected table',
                    about: 'the table\u2019s name, if the request says it; leave it out for the '
                        + 'selected table' }
            }
        },
        {
            name: 'rename_table',
            summary: 'change a table\u2019s name, and every formula that refers to it',
            module: 'baja/plate/ops/rename-table.js',
            params: {
                to: { type: 'string', required: true,
                    about: 'the new name. Letters, digits and underscores, starting with a '
                        + 'letter, because formulas address a table by this name' },
                from: { type: 'string', default: 'the selected table',
                    about: 'the table\u2019s current name, if the request says it; leave it out '
                        + 'to rename the selected table' }
            }
        }
    ];

    const byName = (n) => LIST.filter((c) => c.name === ('' + n).trim())[0] || null;

    // The declarations only: what goes to the model. No module paths, no functions.
    const catalogue = () => LIST.map((c) => {
        const out = { name: c.name, summary: c.summary, params: {} };
        for (const k of Object.keys(c.params || {})) {
            const p = c.params[k];
            const d = { type: p.type };
            if (p.about) d.about = p.about;
            if (p.required) d.required = true;
            // SAY THE DEFAULT OUT LOUD. A parameter with no `required` flag is optional, but
            // a model reading a catalogue of operations treats a missing value as a reason to
            // refuse unless it can see what happens without one. "Move the values to the top"
            // names no column and was refused for exactly that.
            if (p.default != null) d.default = p.default;
            if (p.values) d.values = p.values;
            if (p.min != null) d.min = p.min;
            if (p.max != null) d.max = p.max;
            out.params[k] = d;
        }
        return out;
    });

    // A BAD ARGUMENT INVALIDATES THE OPERATION; IT IS NOT DROPPED AND IT IS NOT CLAMPED.
    // Dropping a required size would build a table of the default size and report it as the
    // one that was asked for, and clamping 400 columns to 200 does the same thing more
    // quietly. Either way the user is told something untrue about what just happened. An
    // unrecognised argument NAME is different and is simply dropped: that is a model adding
    // something the operation has no notion of, and without it the operation still does what
    // was asked.
    const validate = (name, rawArgs) => {
        const c = byName(name);
        if (!c) return { ok: false, problem: 'no such operation: ' + (name || '(none)') };
        const specs = c.params || {};
        const raw = (rawArgs && typeof rawArgs === 'object') ? rawArgs : {};
        const args = {};
        const dropped = [];
        for (const k of Object.keys(raw)) {
            const spec = specs[k];
            if (!spec) { dropped.push(k); continue; }
            const v = raw[k];
            if (v == null || v === '') continue;
            if (spec.type === 'number') {
                const n = Number(v);
                if (!isFinite(n) || Math.floor(n) !== n) {
                    return { ok: false, problem: k + ' must be a whole number, not ' + JSON.stringify(v) };
                }
                if (spec.min != null && n < spec.min) {
                    return { ok: false, problem: k + ' must be at least ' + spec.min };
                }
                if (spec.max != null && n > spec.max) {
                    return { ok: false, problem: k + ' can be at most ' + spec.max + ', and ' + n + ' was asked for' };
                }
                args[k] = n;
            } else if (spec.type === 'string') {
                const t = ('' + v).trim();
                if (t) args[k] = t.slice(0, 120);
            } else if (spec.type === 'enum') {
                // Case does not matter, but membership does: an unrecognised value is a
                // refusal, never the first item in the list. "shift them leftward" quietly
                // becoming "down" is the kind of help nobody wants.
                const t = ('' + v).trim().toLowerCase();
                const hit = (spec.values || []).filter((x) => ('' + x).toLowerCase() === t)[0];
                if (!hit) {
                    return { ok: false, problem: k + ' must be one of '
                        + (spec.values || []).join(', ') + ', not ' + JSON.stringify(v) };
                }
                args[k] = hit;
            } else if (spec.type === 'string[]') {
                if (!Array.isArray(v)) {
                    return { ok: false, problem: k + ' must be a list' };
                }
                const list = v.map((x) => (x == null ? '' : ('' + x)).trim()).filter((x) => x !== '');
                if (!list.length) {
                    return { ok: false, problem: k + ' is empty' };
                }
                if (spec.max != null && list.length > spec.max) {
                    return { ok: false, problem: k + ' has ' + list.length + ' items and at most '
                        + spec.max + ' can be set at once' };
                }
                args[k] = list.map((x) => x.slice(0, 400));
            } else {
                return { ok: false, problem: 'unknown parameter type for ' + k };
            }
        }
        for (const k of Object.keys(specs)) {
            if (specs[k].required && args[k] == null) {
                return { ok: false, problem: 'the request does not say ' + (specs[k].about || k) };
            }
        }
        return { ok: true, capability: c, args: args, dropped: dropped };
    };

    const preview = (name, args) => {
        if (name === 'timeline_add') {
            // The timeline is named on the card: with several on the canvas, "to the timeline"
            // did not say which one was about to be changed.
            const which = args.timeline ? ('"' + args.timeline + '"') : 'the timeline';
            // A time of day is shown as a time, not buried in an ISO stamp with a T in it.
            const when = (v) => ('' + (v == null ? '' : v)).replace('T', ' at ');
            return args.kind === 'interval'
                ? ('add ' + args.title + ' from ' + when(args.start) + ' to ' + when(args.end)
                    + ' to ' + which)
                : ('add ' + args.title + ' on ' + when(args.date) + ' to ' + which);
        }
        if (name === 'timeline_range') {
            const which = args.timeline ? ('"' + args.timeline + '"') : 'the timeline';
            if (args.start || args.end) {
                return 'set ' + which + ' to run '
                    + (args.start ? ('from ' + args.start) : 'from where it starts')
                    + ' ' + (args.end ? ('to ' + args.end) : 'to where it ends');
            }
            const amt = args.by_percent ? (Math.abs(args.by_percent) + '%')
                : (Math.abs(args.by_days || 0) + ' days');
            const dir = ((args.by_percent || args.by_days || 0) < 0) ? 'narrow' : 'widen';
            const where = args.edge === 'start' ? 'at the start'
                : (args.edge === 'end' ? 'at the end' : 'at both ends');
            return dir + ' ' + which + ' by ' + amt + ' ' + where;
        }
        if (name === 'new_timeline') {
            return 'add a timeline from ' + args.start + ' to ' + args.end
                + (args.title ? (' called "' + args.title + '"') : ' (it will ask for a title)');
        }
        if (name === 'derive_from_new_table' && (args.columns || args.sum_column)) {
            const cols = ('' + (args.columns || '')).split(',').map((x) => x.trim()).filter((x) => x);
            const totals = args.sum_column || (cols.length > 1 ? cols[1] : (cols[0] || 'the second column'));
            return 'make a new table ' + (args.name ? ('called ' + args.name + ' ') : '')
                + (cols.length ? ('with columns ' + cols.join(', ') + ' ') : '')
                + 'and ' + (args.rows || 8) + ' rows, total "' + totals + '" at the foot, '
                + 'and have the selected cells read that total';
        }
        if (name === 'derive_from_new_table') {
            return 'make a new table ' + (args.name ? ('called ' + args.name + ' ') : '')
                + 'and have the selected cells read from it'
                + (args.name ? '' : ' (it will ask for a name)');
        }
        if (name === 'gmail_to_timeline') {
            return 'read ' + (args.max || 25) + ' messages'
                + (args.query ? (' matching ' + args.query) : ' from the last fortnight')
                + ' and put the dates in them on '
                + (args.timeline ? ('"' + args.timeline + '"') : 'the timeline');
        }
        if (name === 'gmail_connection') {
            const w = args.what || 'connect';
            return w === 'status' ? 'say whether Gmail is connected'
                : (w === 'disconnect' ? 'disconnect Gmail and give the access back to Google'
                    : 'connect Gmail (Google will ask you to approve it)');
        }
        if (name === 'events_from_text') {
            return 'read the dates out of ' + (args.text ? 'that text' : 'text you paste')
                + ' and put them on ' + (args.timeline ? ('"' + args.timeline + '"') : 'the timeline');
        }
        if (name === 'import_calendar') {
            return 'put a calendar\u2019s events on '
                + (args.timeline ? ('"' + args.timeline + '"') : 'the timeline')
                + (args.address ? '' : ' (it will ask which calendar)');
        }
        if (name === 'change_values') {
            const bits = [];
            if (args.set_to != null) bits.push('set to ' + args.set_to);
            if (args.by_percent) bits.push((args.by_percent > 0 ? 'up ' : 'down ')
                + Math.abs(args.by_percent) + '%');
            if (args.multiply_by) bits.push('times ' + args.multiply_by);
            if (args.add) bits.push((args.add > 0 ? 'plus ' : 'minus ') + Math.abs(args.add));
            if (args.round && args.round !== 'none') bits.push('rounded to the nearest ' + args.round);
            return 'change the selected cells: ' + (bits.join(', ') || 'no change');
        }
        if (name === 'fill_table') {
            const which = args.table ? ('"' + args.table + '"') : 'this table';
            return 'fill ' + which + ' in' + (args.rows ? (' with ' + args.rows + ' rows') : '')
                + ': ' + args.what;
        }
        if (name === 'table_size') {
            const which = args.table ? ('"' + args.table + '"') : 'this table';
            const bits = [];
            if (args.rows > 0) bits.push('add ' + args.rows + ' row' + (args.rows === 1 ? '' : 's'));
            if (args.rows < 0) bits.push('remove ' + (-args.rows) + ' row' + (args.rows === -1 ? '' : 's'));
            if (args.columns > 0) bits.push('add ' + args.columns + ' column' + (args.columns === 1 ? '' : 's')
                + (args.names ? (' (' + args.names + ')') : ''));
            return (bits.join(' and ') || 'change the size of') + ' on ' + which;
        }
        if (name === 'show_object') {
            return 'centre on "' + args.name + '"';
        }
        if (name === 'cell_from_table') {
            const how = args.how || 'sum';
            const word = how === 'count' ? 'how many numbers are in' : ('the ' + how + ' of');
            return 'make the selected cells show ' + word + ' "' + args.table + '"'
                + ' (it will offer to make that table if it is not there)';
        }
        if (name === 'format_cells') {
            return args.style === 'dollar'
                ? 'show the selected cells as money'
                : 'show the selected cells as plain numbers';
        }
        if (name === 'rearrange_column') {
            const where = (args.column == null || args.column === '')
                ? 'column 0 (the first)' : ('column ' + args.column);
            const says = {
                reverse: 'turn upside down', sort_asc: 'sort A to Z', sort_desc: 'sort Z to A',
                compact: 'close the gaps in', dedupe: 'remove the repeats from',
                fill_down: 'fill down', trim: 'tidy the spacing in', clear: 'empty'
            };
            return (says[args.action] || args.action) + ' ' + where + ' of '
                + (args.table || 'the selected table');
        }
        if (name === 'move_column') {
            const says = { copy: 'copy column ', swap: 'swap column ', move: 'move column ' };
            const joins = { copy: ' onto column ', swap: ' with column ', move: ' to position ' };
            return (says[args.action] || args.action) + args.column + joins[args.action]
                + args.to + ' in ' + (args.table || 'the selected table');
        }
        if (name === 'shift_column_values') {
            const where = (args.column == null || args.column === '')
                ? 'column 0 (the first)' : ('column ' + args.column);
            return 'move the values in ' + where + ' of '
                + (args.table || 'the selected table') + ' ' + args.direction + ' by '
                + args.by + ' row' + (args.by === 1 ? '' : 's');
        }
        if (name === 'set_column_values') {
            const where = (args.column == null || args.column === '')
                ? 'column 0 (the first)' : ('column ' + args.column);
            return 'put ' + args.values.length + ' value'
                + (args.values.length === 1 ? '' : 's') + ' in ' + where
                + ' of ' + (args.table || 'the selected table')
                + (args.start_row ? (', from row ' + args.start_row) : '')
                + ': ' + args.values.slice(0, 6).join(', ')
                + (args.values.length > 6 ? ', \u2026' : '');
        }
        if (name === 'rename_table') {
            return 'rename ' + (args.from || 'the selected table') + ' to ' + args.to;
        }
        if (name === 'new_table') {
            return 'add a ' + args.rows + ' x ' + args.cols + ' table'
                + (args.name ? (' called ' + args.name) : '');
        }
        const c = byName(name);
        return c ? c.summary : name;
    };

    return { list: LIST, byName: byName, catalogue: catalogue, validate: validate, preview: preview };
}
