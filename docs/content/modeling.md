---
title: "Modeling guide"
weight: 25
---

Fileclass lets you treat your vault as a database: each note is a **record**,
each fileClass is a **schema**, and each `.base` view is an editable **query**.
This page answers the question that follows from that: when a piece of data has
structure, should it become a **dedicated fileClass**, a nested
**Object**/**ObjectList** field, or a free-form **JSON**/**YAML** field?

## The rule that decides most cases

**A row is a note.** A `.base` view queries files, so anything you want to see as
a *row* — to sort, filter, or count across your whole vault — must be a note of
its own. Values held inside `Object`, `ObjectList`, `JSON`, or `YAML` are never
rows; they are only ever part of the *column* of the note that holds them.

Everything below is a refinement of that one sentence.

## Three levels of normalization

Despite being four field types, you really have **three** choices. `Object` and
`ObjectList` are the same decision (single vs. list); `JSON` and `YAML` are the
same decision (which syntax you'd rather type).

| | Database analogy | Own identity | Schema | Can be a row in a Base |
|---|---|---|---|---|
| **Dedicated fileClass** | Table with a primary key | Yes — other notes link to it | Declared, typed | **Yes** |
| **Object / ObjectList** | Composite type / embedded document | No — lives and dies with its parent | Declared, typed | No |
| **JSON / YAML** | `jsonb` column with no constraint | No | **None** | No |

The key distinction people miss: `Object`/`ObjectList` are **not** schemaless.
Their sub-fields are declared in the fileClass just like root fields, and they
get the same typed, validated input ([Fields & input](../fields/)). They are
structured data whose structure you own — they simply have no identity of their
own. `JSON`/`YAML` are the genuinely schemaless escape hatch.

## Four questions, in order

**1. Does anything else point at it?**
If two notes must refer to the *same* instance, it needs to be a note. Otherwise
you copy the data, and copies drift: rename a company and you would have to edit
every person who works there.

**2. Do you want to see it as a row?**
*"All my reading sessions in June, longest first"* needs sessions to be notes.
*"How far am I through this book"* is a column on the book — an `Object` is
enough.

**3. Does it outlive its parent?**
A company survives an employee leaving. A postal address does not survive the
person. Independent lifecycle → fileClass. Strict composition → `Object`.

**4. Do you know the shape, and is it stable?**
Yes → `Object`/`ObjectList`, and get validation and guided input.
No, or someone else defines it → `JSON`/`YAML`.

## Worked examples

These use a schema.org-flavored vault (`Person`, `Company`, `Activity`, `Media`,
`Reading`, `Article`).

### Use a dedicated fileClass

**`Person.employer` → a `Company` note.** Several people share one employer, you
want to open the company's note, and you want a Base listing companies. Model it
as a `File` field pointing at the `Company` fileClass.

**`Reading.author` → a `Person` note.** You will eventually want *"everything I
have read by this author"*. That view needs the author to be a row, so the author
must be a note.

**`Activity.place` → a `Place` note**, if *"all activities at this place"* is a
question you expect to ask. If it isn't, a `Select` is fine — don't build a
fileClass for a value you only ever read back on the parent.

### Use an Object

**`Media.technical` = `{ duration, codec, resolution }`.** No identity, never
shared, and nobody wants a Base of resolutions.

**`Reading.progress` = `{ page, percent, lastReadAt }`.** Exactly one per book,
meaningless without it.

**`Person.address` = `{ street, zip, city, country }`** — *provided* you never
need *"everyone in Lille"*. If you do, promote the city to a `Select` or a
`Place` fileClass and keep street and zip in the `Object`. Splitting like this is
normal: promote the part you query, embed the rest.

### Use an ObjectList

**`Reading.sessions` = `[{ date, pages, notes }]`.** A log in strict composition:
homogeneous shape you control, nothing links to an individual session, and it
only makes sense attached to its book.

**`Person.phones` = `[{ type, number }]`.** Same test, same answer.

### Use JSON / YAML

**A raw payload from an external import** (Strava, TMDB, Goodreads). The shape
isn't yours and can change without notice. Store it as-is and promote to typed
fields only the parts you actually use.

**Data that is heterogeneous per note** — the specs of a `Media` have nothing in
common between a vinyl record, a film, and a podcast.

## Two traps

**ObjectList is the standing temptation.** It *looks* like a table — rows,
columns, the lot — but none of its entries is queryable as a row. The day you
want to sort, filter, or aggregate those entries across several parent notes, you
have to migrate all of them into notes. Apply the test up front:

> *Would I ever want a view listing **these things**, across all their parent
> notes at once?*

Yes → make it a fileClass now. No, you only ever look at them while the parent
note is open → `ObjectList`.

**JSON/YAML is a quarantine zone, not a shortcut** for skipping modeling. The
moment you find yourself writing a query that digs inside one, that's the signal
to promote those keys into declared fields.

## Migrating between levels

Nothing here is a one-way door, and the two directions cost differently.

- **Object → fileClass** (the common move, when a value turns out to be shared):
  create the fileClass, create one note per distinct value, and replace the
  `Object` field with a `File`/`MultiFile` field. Existing frontmatter keys are
  never regenerated from the schema, so the old value stays put until you remove
  it — you can migrate note by note.
- **JSON → Object**: declare the sub-fields with a `path` pointing at the parent,
  and the draft editor picks up the keys already present. **Unknown keys are
  preserved**, so a partial declaration is a valid intermediate state: type the
  keys you query, leave the rest untouched.

Start at the *least* normalized level that answers your questions today. Going
from `Object` to fileClass is a migration; going from a premature fileClass back
to an embedded object means deleting notes you already linked to.
