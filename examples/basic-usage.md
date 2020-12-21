---
layout: default
title: Basic Usage Example
---

## Usage

``` js
await qbp(items, (item) => each(item));
```

This is the core of qbp's functionality. It will loop through `items` and will concurrently pass every item to your `each` function and await its completion.

<iframe src="https://codesandbox.io/embed/qbp-basic-usage-ykzym?fontsize=14&hidenavigation=1&theme=dark"
     style="width:100%; height:500px; border:0; border-radius: 4px; overflow:hidden;"
     title="qbp - Basic Usage"
     allow="accelerometer; ambient-light-sensor; camera; encrypted-media; geolocation; gyroscope; hid; microphone; midi; payment; usb; vr; xr-spatial-tracking"
     sandbox="allow-forms allow-modals allow-popups allow-presentation allow-same-origin allow-scripts"
     ></iframe>
