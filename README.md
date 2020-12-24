# qbp - queue, batch, process

[![npm version](https://badge.fury.io/js/qbp.svg)](https://badge.fury.io/js/qbp)
[![MIT license](https://img.shields.io/badge/license-MIT-brightgreen.svg)](http://opensource.org/licenses/MIT)
[![Build Status](https://travis-ci.com/joshrouwhorst/qbp.svg?branch=master)](https://travis-ci.com/joshrouwhorst/qbp)
[![Downloads](https://img.shields.io/npm/dt/qbp?color=blue)](https://www.npmjs.com/package/qbp)

qbp offers a lot of options and featues around asychronous processing.

Reach out on [Twitter](https://twitter.com/joshrouwhorst) or [GitHub](https://github.com/joshrouwhorst). Let me know if you like it or have questions.

## Contents

- [qbp - queue, batch, process](#qbp---queue-batch-process)
  - [Contents](#contents)
  - [Usage](#usage)
    - [Basic Usage Example](#basic-usage-example)
  - [Queue Object](#queue-object)
    - [queue.name](#queuename)
    - [queue.empty()](#queueempty)
    - [queue.pause()](#queuepause)
    - [queue.resume()](#queueresume)
    - [queue.add(item)](#queueadditem)
    - [queue.each([function])](#queueeachfunction)
    - [queue.threads([int])](#queuethreadsint)
    - [queue.rateLimit([rateLimit, rateLimitSeconds, [rateFidelity]])](#queueratelimitratelimit-ratelimitseconds-ratefidelity)
    - [queue.stopRateLimit()](#queuestopratelimit)
    - [queue.counts](#queuecounts)
  - [Progress Updates](#progress-updates)
  - [Throttling](#throttling)
  - [Rate Limiting](#rate-limiting)
  - [Batching](#batching)
  - [Item Statuses](#item-statuses)
    - [Statuses Example](#statuses-example)
  - [Mixing](#mixing)
    - [Mix Example](#mix-example)
  - [Error Handling](#error-handling)
  - [Empty Function](#empty-function)
  - [Testing](#testing)

## Usage

``` js
await qbp(items, (item) => each(item));
```

This is the core of qbp's functionality. It will loop through `items` and will concurrently pass every item to your `each` function and await its completion.

### Basic Usage Example

<div>
    <a href="https://joshrouwhorst.github.io/qbp/examples/basic-usage.html">
        <img src="https://media.giphy.com/media/GB4mgLDKKCiqMkXW85/giphy.gif" width="100%" />
    </a>
</div>

<a href="https://joshrouwhorst.github.io/qbp/examples/basic-usage.html">
Click here for a live example.
</a>

qbp returns an object with a few attributes:

- `queue` object (which is explained below)
- `completed` which is an array of successfully completed items
- `errors` which is an array of objects with an `error` attribute and an `item` attribute. 
  - These are items that threw an error in the `each` function. The `error` attribute is the error that was thrown.

```js
var { queue, completed, errors } = await qbp(items, (item) => each(item));
```

You can obviously forego `await` for `then()`.

```js
qbp(items, (item) => each(item))
    .then(({ queue, completed, errors }) => nextStep());
```

The constructor breaks down like this:

```js
qbp([array,] [function,] [options])
```

> **Pro Tip:** The way I'm parsing parameters allows you to enter these in any order.
> It just looks for an array, a function, and an object. You can also choose not to add any of the parameters.

## Queue Object

The queue object is returned by qbp as well as passed to all of the functions that qbp calls. The queue lets you interact with the process as it is running. Here are the attributes and functions of the queue object.

### queue.name

You can set a `name` option when calling `qbp`. If you set the `name` option, this attribute will have that value. This can be useful when you have multiple queues you've created and maybe some of them are using the same `progress` function, for example.

### queue.empty()

You can call this function if you want to remove all items yet to be processed from the queue.

``` js

qbp((...args) => each(...args), {
    error: (...args) => handleError(...args)
})

function handleError(err, item, { queue, setStatus }) => {
    // Maybe you want to end all processing when an error occurs.
    queue.empty()
}

```

### queue.pause()

Call this function to halt processing without removing items from the queue like `queue.empty()` does.

### queue.resume()

Start processing the queue again after being paused.

### queue.add([item][arrayOfItems])

Pass this function one or an array of items to add them to the queue. You can `await` this function to wait for the items to finish processing before continuing. Keep in mind that the function expects an array passed in to be an array of items to be processed. If the item you want processed is an array, you would want to wrap it in another array before adding it.

```js
var { queue } = qbp((...args) => each(...args))

async function processNewItems(newItems) {
    var { queue, completed, errors } = await queue.add(newItems)

    for (var i = 0; i < completed.length; i++) {
        var successfulItem = completed[i]
        // The completed property returned has an array of items that were successfully processed.
    }

    for (var i = 0; i < errors.length; i++) {
        var { error, item } = errors[i]
        // The errors property returned has an array of objects with an error property and an item property. These items threw errors somewhere in the each function.
    }
}
```

### queue.each([function])

You can pass or even change the `each` function for the queue at any time by calling `queue.each()`.

```js
var { queue } = qbp(items)

var { completed, errors } = await queue.each((item) => {
    // Do something with the item
})
```

### queue.threads([int])

Pass this function an integer to set how many threads you want the queue to process simultaneously.

### queue.rateLimit([rateLimit, rateLimitSeconds, [rateFidelity]])

You can tell the queue to start rate limiting at any time by calling this function and passing in your rate limit options. See [Rate Limiting](#rate-limiting).

### queue.stopRateLimit()

Call this to stop rate limiting.

### queue.counts

This is an object containing attributes: `items` for a total count of items added to the queue, `complete` for total number of items completed, `threads` for now many threads are currently running simultaenously, `queued` for how many items have yet to be processed, and `batch` which is the current batch size.

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

## Throttling

There are a few options for limiting how many items can be processed simultaenously. The simpliest is by limiting the number of threads that can run concurrently.

```js
await qbp(items, (...args) => each(...args), {
    threads: 2
})
```

By default, qbp will process all of your items concurrently. But if that's too much all at once, setting the `threads` option will limit how many items are processed concurrently, in this case only 2 items will be processed at the same time.

## Rate Limiting

If you need to limit processing your items by a number of items within a timeframe then this should help. Rate limiting adjusts the number of threads running simultaneously and makes sure each item takes a minimum amount of time to process in order to meet limit expectations.

In the options object you pass to `qbp` you can set:

- `rateLimit` which is the maximum number of items allowed to process within the a time frame.
- `rateLimitSeconds` which is that timeframe in seconds.
- `rateUpdate` which is a function that can get called with updates every time the rate limit check runs.
- `rateFidelity` which is how often you want the rate limiting check to run within `rateLimitSeconds`.
  - So a `rateFidelity` of 16 (which is the default value) with `rateLimitSeconds` set to 3600 would check and adjust the rate limiting every 225 seconds, running 16 times in 3600 seconds.

At any time **you can programmatically add rate limiting** to a queue by calling `queue.rateLimit()` and passing in the `rateLimit`, `rateLimitSeconds`, and `rateFidelity` values.

Also, at any time you can stop rate limiting by calling `queue.stopRateLimit()`.

> **Important note!** Rate limiting hijacks your `threads` setting and automatically adjusts it to get the most items processed while remaining within your limits.

```js
// Create a queue with an each function, the maximum number of threads you want to run at a time, and an empty function.
var { queue } = qbp((item) => each(item), {
        rateLimit: 500, // Need rateLimit and rateLimitSeconds for rate limiting to work, all other options are not necessary.
        rateLimitSeconds: 100,
        rateFidelity: 20,
        rateLimitOnEmpty: true, // If you're expecting items to constantly be getting added to your queue and have it sporadically be empty then this is a good option to have on for accuracy.
        rateUpdate: (update) => rateUpdate(upate),
        empty: () => itemsEmpty() });

async function processNewItems(newItems) {
    // Add the new items to be processed. It'll restart the queue if it's already been empty.
    queue.add(newItems);
}

async function each(item) {
    // Do something with the item.
}

function rateUpdate(update) {
    var {
        queue, // The queue object.
        projectedCount, // The number of items we're projecting to process at the current rate by next update.
        projectedRate, // The items per second rate we're projecting by next process
        minimumThreadTime, // The minimum amount of time a thread is allowed to run to meet rate limiting expectations, in milliseconds.
        currentThreads, // The current number of threads running.
        targetThreads, // The number of threads we're adjusting to.
        currentRatePerSecond, // The number of items we processed per second since the last update.
        currentThreadRate // The number of items per second each thread is averaging.
    } = update
}

function itemsEmpty() {
    // This gets called every time the queue runs out of items.
}
```

## Batching

Need to get a few items at a time? Use the `batch` option.

```js
async function start() {
    var { queue } = await qbp(items, (batch) => each(batch), { batch: 5 }); // Set your batch size in the options.
}

// Instead of a single item, you recieve an array of items.
async function each(batch) {
    var ids = [];
    for (var i = 0; i < batch.length; i++) {
        ids.push(batch[i].id);
    }

    await httpSvc.getDetails(ids);
}
```

## Item Statuses

This is meant to be a system for easily creating a queued process that runs in the background but will provide updates as it progresses. Think of a resource intensive process, like crawling a website. You want to limit how many of these scans can happen simultaneously, and maybe you want to display a queue of the user's requests that updates as their requests progress.

```js
var { queue } = qbp((...args) => handleItem(...args), {
    threads: 5,
    progress: (...args) => progressUpdates(...args)
})

async function processItem (newItem) {
    await queue.add(newItem)
}

async function handleItem (item, { setStatus }) {
    // You can give this item a status and make
    // the status anything you want, object or string.
    setStatus({
        name: item.name,
        process: 'Preparing',
        percent: 0.33,
        time: new Date()
    })

    await _db.insert(item)

    if (checkSomething) {
        await migrateItem(item, setStatus)
    } else {
        await doSomethingElse(item, setStatus)
    }
}

async function migrateItem (item, setStatus) {
    // You can change that status throughout the process
    setStatus({
        name: item.name,
        process: 'Migrating',
        percent: 0.66,
        time: new Date()
    })

    await _db.move(item)

    setStatus({
        name: item.name,
        process: 'Complete',
        percent: 1,
        time: new Date()
    })
}

// If you haven't defined a progressInterval option, calling setStatus will trigger a progress update.
function progressUpdate ({ statuses }) {
    console.log('Current Item Statuses:')

    for (let i = 0; i < statuses.length; i++) {
        const {
            stage, // stage is set by qbp and will be 'queued', 'processing', 'complete', or 'error'.
            status, // status is the status you set above. 'queued' items will not have a status set yet.
            item // item is the actual item in the queue we're referring to.
        } = statuses[i]

        if (!status) continue

        const {
            name,
            process,
            percent,
            time
        } = status
    }
}

```

### Statuses Example

<div>
    <a href="https://joshrouwhorst.github.io/qbp/examples/statuses.html">
        <img src="https://media.giphy.com/media/DKsUsizLhUeKT2Lo7x/giphy.gif" width="100%">
    </a>
</div>

<a href="https://joshrouwhorst.github.io/qbp/examples/statuses.html">
    Click for live example.
</a>

## Mixing

I found myself nesting queues whenever I needed to loop through multiple arrays. So I added a `mix` function to help with this. Here's what I **was** doing.

```js
// Honestly, I'm not sure how you would effeciently cap threads on this.
await qbp(teachers, (teacher) => {
    await qbp(classRooms, (classRoom) => {
        await qbp(students, (student) => {
            await addStudent(teacher, classRoom, student);
        });
    });
});

async function addStudent(teacher, classRoom, student) {
    // No one likes to nest stuff.
}
```

So instead, now we can use the `qbp.mix()` function.

```js
// Now we can definitely cap the threads if we want.
await qbp.mix([teachers, classRooms, students], (...args) => addStudent(...args), { threads: 5 });

async function addStudent(teacher, classRoom, student, { queue }) {
    // The parameters mirror the same order you gave them to qbp.
}
```

### Mix Example

<div>
    <a href="https://joshrouwhorst.github.io/qbp/examples/mix.html">
        <img src="https://media.giphy.com/media/6Ai2y8p3VyffbWaUkh/giphy.gif" width="100%">
    </a>
</div>

<a href="https://joshrouwhorst.github.io/qbp/examples/mix.html">
    Click for live example.
</a>

> One thing to keep in mind. You only have one `queue` object using this. The `queue.add()` function won't perform the mixing functionality that you get when you pass it in to the `mix()` function. But if you don't need to add any more items while processing, then this works perfect.

## Error Handling

You can provide an `error` function in qbp's options to be called if any items throw an error during their processing.

```js
await qbp(items, (item) => each(item), {
    error: (...errInfo) => onError(...errInfo) });

functon onError(error, item, { queue, setStatus }) {
    // If you're using qbp.mix() then you'll get arguments spread out, such as (error, item1, item2, item3, { queue, setStatus })
}
```

Whenever you add items to the queue, whether it is when creating the queue or adding them with `queue.add()` you will recieve an array of items that completed succesfully and an array of items that had errors.

```js
var { queue, completed, errors } = await qbp(items, (...args) => each(...args))

for (var i = 0; i < completed.length; i++) {
    var successfulItem = completed[i]
    // The completed property returned has an array of items that were successfully processed.
}

for (var i = 0; i < errors.length; i++) {
    var { error, item } = errors[i]
    // The errors property returned has an array of objects with an error property and an item property. These items threw errors somewhere in the each function.
}
```

## Empty Function

You can set an `empty` option as a function when calling qbp and it will get called whenever the queue has finished processing all of the items it has been given.

```js
var { queue } = await qbp(items, (...args) => each(...args), {
    empty: (...args) => onEmpty(...args)
})

function onEmpty (queue) {
    // Do something when the queue is empty.
}
```

## Testing

Run unit testing with `npm run test`.
