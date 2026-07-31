---
fields:
  - name: publisher
    id: kQ7mzT
    type: Input
    options: {}
    path: ""
  - name: pages
    id: pG42nx
    type: Number
    options:
      min: 1
      max: 5000
    path: ""
  - name: genre
    id: gNr8wc
    type: Select
    options:
      sourceType: ValuesList
      valuesList:
        "1": Science fiction
        "2": Fantasy
        "3": Comics
    path: ""
  - name: read
    id: rD5tqB
    type: Boolean
    options: {}
    path: ""
  - name: ownership
    id: oWn5hp
    type: Cycle
    options:
      sourceType: ValuesList
      valuesList:
        "1": Wanted
        "2": Owned
        "3": Lent out
    path: ""
  - name: published
    id: pBl9dt
    type: Date
    options: {}
    path: ""
---
