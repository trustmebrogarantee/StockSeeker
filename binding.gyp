{
  "targets": [
    {
      "target_name": "extremum_detector",
      "include_dirs" : [
        "<!(node -e \"require('nan')\")"
      ],
      "sources": [ "addon.cpp" ],
    }
  ]
}