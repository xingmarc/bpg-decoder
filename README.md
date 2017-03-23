# bpg-decoder
> This repo is originated from https://github.com/mirrorer/libbpg

Use BPG format today to make your website faster!

A React component for BPG using this repo: https://github.com/xuezhma/react-bpg


## usage:

`npm install bpg-decoder`

```
var BPGDecoder = require('bpg-decoder');
canvas = document.getElementById("mycanvas");
ctx = canvas.getContext("2d");
img = new BPGDecoder(ctx);
img.load("your-bpg-picture.bpg");
```


## known issue
see issues.
