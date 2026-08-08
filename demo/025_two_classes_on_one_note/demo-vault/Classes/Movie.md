---
extends: Media
excludes:
  - acquired
fields:
  - name: rating
    id: vRatng
    type: Select
    options:
      sourceType: ValuesList
      valuesList:
        "1": "🎬"
        "2": "🎬🎬"
        "3": "🎬🎬🎬"
    path: ""
  - name: director
    id: vDirct
    type: Input
    options: {}
    path: ""
  - name: runtime
    id: vRunt1
    type: Duration
    options: {}
    path: ""
---
