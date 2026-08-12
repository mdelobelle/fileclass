## Today

![[Habit.base]]

Everything I am reading, wherever the note happens to sit.

```base
views:
  - type: fileclass-table
    name: Reading
    filters:
      and:
        - fileClass.containsAny("Book")
    order:
      - file.name
      - author
      - read
```
