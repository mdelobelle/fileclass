---
extends: Media
fields:
  - name: series
    id: sEries1
    type: File
    options:
      baseFile: Series.base
      viewName: "Fileclass · All series · publisher = this.publisher"
      dependsOn: publisher
      matchProperty: publisher
    path: ""
  - name: publisher
    id: cP1ubl
    type: Input
    options: {}
    path: ""
  - name: pages
    id: cP2ags
    type: Number
    options:
      min: 1
      max: 5000
    path: ""
  - name: contributors
    id: cO1ntr
    type: MultiFile
    options:
      baseFile: Authors.base
      viewName: All authors
    path: ""
  - name: storage
    id: sTorag
    type: Object
    options:
      displayTemplate: "{{room}} · {{shelf}}"
    path: ""
  - name: room
    id: sRoom1
    type: Select
    options:
      sourceType: ValuesList
      valuesList:
        "1": Attic
        "2": Living room
        "3": Study
    path: "sTorag"
  - name: shelf
    id: sShelf
    type: Object
    options:
      displayTemplate: "{{unit}}-{{level}}"
    path: "sTorag"
  - name: unit
    id: sUnit1
    type: Input
    options: {}
    path: "sTorag____sShelf"
  - name: level
    id: sLevel1
    type: Number
    options:
      min: 1
      max: 9
    path: "sTorag____sShelf"
---
