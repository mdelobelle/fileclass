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
  - name: next interval
    id: nXi3vq
    type: CycleDuration
    options:
      presets:
        - P90D
        - P180D
        - P360D
    path: ""
  - name: review
    id: rV7kdp
    type: Date
    options:
      nextIntervalField: next interval
    path: ""
  - name: themes
    id: tH3mes
    type: Multi
    options:
      sourceType: ValuesList
      valuesList:
        "1": Ecology
        "2": Politics
        "3": Religion
    path: ""
  - name: awards
    id: aW4rds
    type: MultiInput
    options: {}
    path: ""
  - name: author
    id: aU7hor
    type: File
    options:
      baseFile: Authors.base
      viewName: All authors
    path: ""
  - name: cover
    id: cO1ver
    type: Media
    options:
      baseFile: Images.base
      viewName: All covers
    path: ""
---
