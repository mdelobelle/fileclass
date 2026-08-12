---
filesPaths:
  - Reading list
icon: book
extends: Media
fields:
  - name: lent to
    id: lNtTo1
    type: Input
    options: {}
    path: ""
  - name: author
    id: aU7hor
    type: File
    options:
      baseFile: Authors.base
      viewName: All authors
      required: true
    path: ""
  - name: editions
    id: eDitns
    type: ObjectList
    options:
      displayTemplate: "{{format}} · {{year}}"
    path: ""
  - name: format
    id: eFrmat
    type: Select
    options:
      sourceType: ValuesList
      valuesList:
        "1": Hardcover
        "2": Paperback
        "3": Ebook
    path: eDitns
  - name: year
    id: eYear1
    type: Number
    options:
      min: 1400
      max: 2100
    path: eDitns
  - name: publisher
    id: ePubl1
    type: Input
    options: {}
    path: eDitns
  - name: storage
    id: sHelf1
    type: Input
    options:
      template: '{{room:["Study","Living room"]}} · {{unit}}-{{level}}'
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
      defaultInsertAsLink: true
      dateLinkPath: Daily/{{YYYY}}/{{MM}}/
      dateLinkAlias: true
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
  - name: cover
    id: cO1ver
    type: Media
    options:
      baseFile: Images.base
      viewName: All covers
    path: ""
baseFile: Books.base
baseView: Book
---
