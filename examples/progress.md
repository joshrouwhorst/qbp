---
layout: default
title: Progress Updates Example
---

## Progress Updates

You can setup a `progress` function to get called to inform your users how the processing is going.

```js
function start () {
    await qbp(items, (...args) => each(...args), {
        progress: (...args) => progressUpdate(...args)
    })
}

function progressUpdate (update) {
    var {
        total, // Total number of items that have been added to the queue
        complete, // Number of items have completed the queue.
        queued, // Number of items currently in the queue.
        percent, // Percentage of completion.
        threads, // Number of threads currently running.
        itemsPerSecond, // Average rate of items per second since the last time a progress update was sent.
        secondsRemaining, // An estimate of how many seconds are left based on itemsPerSecond. This will be -1 if there is no current estimate.
        batch, // The current batch size. (See Batching section below)
        dateTime, // Date object for when this was sent out.
        statuses, // The statuses of items being processed (see Item Statuses section below)
        queue // The queue object
    } = update
}
```

With this configuration the `progress` function will be called basically everytime there is a change. But if you would rather just get updates on a regular interval, you can set the `progressInterval` option.

```js
await qbp(items, (...args) => each(...args), {
    progress: (...args) => progressUpdate(...args),
    progressInterval: 5000
})
```

This will have the progress function called every 5 seconds. It will also be called when the queue is empty regardless of the interval.

### Progress Updates Example

<iframe src="https://codesandbox.io/embed/qbp-progress-updates-example-5g9sm?fontsize=14&hidenavigation=1&theme=dark"
     style="width:100%; height:500px; border:0; border-radius: 4px; overflow:hidden;"
     title="qbp - Progress Updates Example"
     allow="accelerometer; ambient-light-sensor; camera; encrypted-media; geolocation; gyroscope; hid; microphone; midi; payment; usb; vr; xr-spatial-tracking"
     sandbox="allow-forms allow-modals allow-popups allow-presentation allow-same-origin allow-scripts"
   ></iframe>