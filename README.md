# bpg-decoder


This repo is originated from https://github.com/mirrorer/libbpg

## usage:

`npm install bpg-decoder`

```
var BPGDecoder = require('bpg-decoder');
canvas = document.getElementById("mycanvas");
ctx = canvas.getContext("2d");
img = new BPGDecoder(ctx);
img.load("your-bpg-picture.bpg");
```

