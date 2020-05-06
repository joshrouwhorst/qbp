# qbp - queue, batch, process

[![npm version](https://badge.fury.io/js/qbp.svg)](https://badge.fury.io/js/qbp)
[![MIT license](https://img.shields.io/badge/license-MIT-brightgreen.svg)](http://opensource.org/licenses/MIT)
[![Build Status](https://travis-ci.com/joshrouwhorst/qbp.svg?branch=master)](https://travis-ci.com/joshrouwhorst/qbp)
[![Downloads](https://img.shields.io/npm/dt/qbp?color=blue)](https://www.npmjs.com/package/qbp)

Have thousands of items you need to loop through performing asynchronous tasks such as database or server calls? Trying to find a way to easily limit the number of simultaneous functions and keep them all straight? Wishing you had a tool to queue, batch, and process all these items? This package may be right for you!

Reach out on [Twitter](https://twitter.com/joshrouwhorst) or [GitHub](https://github.com/joshrouwhorst). Let me know if you like it or have questions.

## Contents

- [qbp - queue, batch, process](#qbp---queue-batch-process)
  - [Contents](#contents)
  - [Usage](#usage)
    - [Full Options Example](#full-options-example)
  - [Batching](#batching)
  - [Throttling](#throttling)
  - [Rate Limiting](#rate-limiting)
    - [Example](#example)
  - [Mixing](#mixing)
  - [Error Handling and Completed Items](#error-handling-and-completed-items)
  - [Getting the Queue](#getting-the-queue)
  - [Queue Object](#queue-object)
    - [queue.name](#queuename)
    - [queue.empty()](#queueempty)
    - [queue.pause()](#queuepause)
    - [queue.add([item][arrayOfItems])](#queueadditem)
    - [queue.addAwait([item])](#queueaddawaititem)
    - [queue.progressState([string])](#queueprogressstatestring)
    - [queue.threads([int])](#queuethreadsint)
    - [queue.rateLimit([rateLimit, rateLimitSeconds, [rateFidelity]])](#queueratelimitratelimit-ratelimitseconds-ratefidelity)
    - [queue.stopRateLimit()](#queuestopratelimit)
    - [queue.complete[]](#queuecomplete)
    - [queue.errors[]](#queueerrors)
    - [queue.counts](#queuecounts)
  - [Progress Updates](#progress-updates)
    - [Progress Updates on Change Example](#progress-updates-on-change-example)
    - [Progress Updates on Interval Example](#progress-updates-on-interval-example)
    - [Child Queues](#child-queues)
  - [Progress Update Object](#progress-update-object)
    - [update.percent](#updatepercent)
    - [update.children](#updatechildren)
    - [update.state](#updatestate)
    - [update.queue](#updatequeue)
    - [update.complete](#updatecomplete)
    - [update.total](#updatetotal)
    - [update.threads](#updatethreads)
    - [update.batch](#updatebatch)
    - [update.queued](#updatequeued)
    - [update.name](#updatename)
    - [update.itemsPerSecond](#updateitemspersecond)
    - [update.secondsRemaining](#updatesecondsremaining)

## Usage

I made some pretty significant changes to the qbp 'footprint' in v2. Say goodbye to the bulky code, say hello to streamlined batchy goodness.

``` js
await qbp(items, (item) => each(item));
```

This is all you really need. It will loop through `items` and will asyncronously pass every item to your `each` function and await its completion. Or you can obviously forego `await` for `then()`.

```js
qbp(items, (item) => each(item))
    .then(() => nextStep());
```

The constructor breaks down like this:

```js
qbp([array,] [function,] [options])
```

> **Pro Tip:** The way I'm parsing parameters allows you to enter these in any order.
> It just looks for an array, a function, and an object.

### Full Options Example

```js
var qbp = require('qbp');

async function start(items) {
    await qbp(
        items,
        (item, queue) => each(item, queue),
        {
            threads: 5, // How many items you want to process simultaneously. Default is now the total count of items you initially provide, running them all at once.
            batch: 10, // Default 1 - Anything above 1 will pass that many items as an array to your `each` function.
            name: 'Demo Queue', // An identifier you can use to differentiate multiple queues. Does not need to be a string.
            parent: parentQueue, // You can supply a queue object as a parent for progress updates to bubble up.
            rateLimit: 500, // Set a maximum number of items that can be processed within rateLimitSeconds.
            rateLimitSeconds: 100, // The timeframe for rate limiting.
            rateFidelity: 20, // Default 16 - How many times you want rate limiting to be checked and adjusted during rateLimitSeconds timeframe.
            rateLimitOnEmpty: true, // Default false - Set this to true to have rate limiting keep going even when there are no items in the queue.
            rateUpdate: (update) => rateUpdate(update),
            progress: (prog) => progressFunc(prog), // Function that gets called with status updates on how the process is going.
            progressInterval: 1000, // Default 'change' - How often to get status updates in milliseconds. By default it will run the progress function whenever there is a change.
            empty: () => emptyFunc(), // Function that gets called when we're out of items.
            error: (err, item, queue) => errorFunc(err, item, queue) // Gets called if an error is thrown by your `each` function. If this isn't supplied, errors will output to console.error().
        }
    );
}

// This function will receive the current item in the items array,
// and the instance of the queue you created.
async function each(item, queue) { // You can also return a promise or provide a non-asynchronous function.
    var results = await _db.insert(item); // If your `batch` option was greater than 1 then this function gets an array of items passed to it.

    if (checkSomething) {
        queue.empty(); // Clears out all queued items.
    } else if (somethingElse) {
        queue.pause(); // Temporarily stops processing items.
    } else if (yetAnotherCheck) {
        queue.resume(); // Starts a queue back up after being paused.
    } else if (oneMore) {
        queue.theads(queue.counts.threads + 1) // Change the number of threads on the fly.
    } else if (lastCheck) {
        queue.add(results); // Add more items to the queue at any time. Even after it's already completed.
    }
}

function progressFunc(update) {
    console.log('Percent Complete: ' + update.percent);
    console.log('Items Complete: ' + update.complete);
    console.log('Total Items: ' + update.total);
    console.log('Queued Items: ' + update.queued);
    console.log('Threads: ' + update.threads);
    console.log('Batch Size: ' + update.batch);
    console.log('Items Per Second: ' + update.itemsPerSecond);
    console.log('Seconds Remaining: ' + update.secondsRemaining);
    console.log('Queue Name: ' + update.name); // Only if a name has been given in the options.
}

// If you use queue.add() to add more items after the queue has already completed, the empty function will get called every time you run out of items.
function emptyFunc() {
    console.log('Done!');
}

function rateUpdate(update) {
    update.queue; // The queue object.
    update.projectedCount; // The number of items we're projecting to process at the current rate by next update.
    update.projectedRate; // The items per second rate we're projecting by next process
    update.minimumThreadTime; // The minimum amount of time a thread is allowed to run to meet rate limiting expectations, in milliseconds.
    update.currentThreads; // The current number of threads running.
    update.targetThreads; // The number of threads we're adjusting to.
    update.currentRatePerSecond; // The number of items we processed per second since the last update.
    update.currentThreadRate; // The number of items per second each thread is averaging.
}

// If your `each` function throws an error, it won't stop the queue from processing. However, you can stop the queue in the error function if you'd like by calling queue.empty() or queue.pause().
function errorFunc(err, item, queue) {
    console.error(`Error found processing item ${item}, stopping process.`)
    console.error(err);
    queue.empty();
}
```

## Batching

Need to get a few items at a time? Use the `batch` option.

```js
async function start() {
    var queue = await qbp(items, (batch) => each(batch), { batch: 5 }); // Set your batch size in the options.
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

## Throttling

An interesting application of this package is using it to throttle processing of items. For instance, if you have a project that is constantly taking in new data to be processed and you want to cap the number that get processed at once, you might want to try something like this.

```js
// Create a queue with an each function, the maximum number of threads you want to run at a time, and an empty function.
var processQueue = qbp((item) => each(item), {
        threads: 20,
        empty: () => itemsEmpty() });

async function processNewItems(newItems) {
    // Add the new items to be processed. It'll restart the queue if it's already been empty.
    processQueue.add(newItems);
}

async function each(item) {
    // Do something with the item.
}

function itemsEmpty() {
    // This gets called every time the queue runs out of items.
}
```

## Rate Limiting

If you need to limit processing your items by a number of items within a timeframe then this should help. Rate limiting adjusts the number of threads running simultaneously and makes sure each item takes a minimum amount of time to process in order to meet limit expectations.

In the options object you pass to `qbp` you can set `rateLimit` which is the maximum number of items allowed to process within the a time frame, `rateLimitSeconds` which is that timeframe in seconds, `rateUpdate` which is a function that can get called with updates every time the rate limit check runs, and `rateFidelity` which is how often you want the rate limiting check to run within `rateLimitSeconds`. So a fidelity of 16 (which is the default value) in with a `rateLimitSeconds` of 3600 would check and adjust the rate limiting every 225 seconds, running 16 times in 3600 seconds.

At any time you can add rate limiting to a queue by calling `queue.rateLimit()` and passing in the `rateLimit`, `rateLimitSeconds`, and `rateFidelity` values.

Also, at any time you can stop rate limiting by calling `queue.stopRateLimit()`.

> **Important note!** Rate limiting hijacks your `threads` setting and automatically adjusts it to get the most items processed while remaining within your limits.

### Example

Modifying the Throttling example above, here's how you could do it with rate limiting.

```js
// Create a queue with an each function, the maximum number of threads you want to run at a time, and an empty function.
var processQueue = qbp((item) => each(item), {
        rateLimit: 500, // Need rateLimit and rateLimitSeconds for rate limiting to work, all other options are not necessary.
        rateLimitSeconds: 100,
        rateFidelity: 20,
        rateLimitOnEmpty: true, // If you're expecting items to constantly be getting added to your queue and have it sporadically be empty then this is a good option to have on for accuracy.
        rateUpdate: (update) => rateUpdate(upate),
        empty: () => itemsEmpty() });

async function processNewItems(newItems) {
    // Add the new items to be processed. It'll restart the queue if it's already been empty.
    processQueue.add(newItems);
}

async function each(item) {
    // Do something with the item.
}

function rateUpdate(update) {
    update.queue; // The queue object.
    update.projectedCount; // The number of items we're projecting to process at the current rate by next update.
    update.projectedRate; // The items per second rate we're projecting by next process
    update.minimumThreadtime; // The minimum amount of time a thread is allowed to run to meet rate limiting expectations, in milliseconds.
    update.currentThreads; // The current number of threads running.
    update.targetThreads; // The number of threads we're adjusting to.
    update.currentRatePerSecond; // The number of items we processed per second since the last update.
    update.currentThreadRate; // The number of items per second each thread is averaging.
}

function itemsEmpty() {
    // This gets called every time the queue runs out of items.
}
```

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

async function addStudent(teacher, classRoom, student, queue) {
    // The parameters mirror the same order you gave them to qbp.
}
```

So if you had an arrays such as:

```js
var teachers = ['Mrs. Robinson', 'Mr. Knox', 'Mr. Anderson'];
var classRooms = [102, 203];
var students = ['Billy', 'Jane'];
```

The `each` function would get called with every combination of those.

```js
async function each(teacher, classRoom, student, queue) {
    // 'Mrs. Robinson', 102, 'Billy'
    // 'Mrs. Robinson', 102, 'Jane'
    // 'Mrs. Robinson', 203, 'Billy'
    // 'Mrs. Robinson', 203, 'Jane'
    // 'Mr. Knox', 102, 'Billy'
    // etc...
}
```

> One thing to keep in mind. You only have one `queue` object using this. The `queue.add()` function won't perform the mixing functionality that you get when you pass it in to the `mix()` function. But if you don't need to add any more items while processing, then this works perfect.

## Error Handling and Completed Items

If you need to, you can access all items that completed successfully (did not error out) after or throughout processing with `queue.complete`. Similarly, you can access all items that errored with `queue.errors`, which gets an object with the error and the item.

```js
var queue = await qbp(items, (item) => handler(item));

// Items in `complete` will be an array of items if your batch option is greater than 1.
for (var i = 0; i < queue.complete.length; i++) {
    var item = queue.complete[i];
    // Do something with a completed item.
}

// Items in `errors` will be an array of items if your batch option is greater than 1.
for (var i = 0; i < queue.errors.length; i++) {
    var {error, item} = queue.errors[i];
    // Do something with an error and item.
}
```

Also, don't forget you can pass an `error` function in the options.

```js
await qbp(items, (item) => each(item), {
    error: (...errInfo) => onError(...errInfo) });

functon onError(error, item, queue) {
    // If you're using qbp.mix() then you'll get arguments spread out, such as (error, item1, item2, item3, queue)
}
```

If you don't supply an `error` function and your `each` function throws an error, it will get output to `console.error()`. So it's recommended to use proper error handling in your `each` function.

## Getting the Queue

```js
var globalQueue;

// This option gives you the queue after the process has ran.
async function option1() {
    globalQueue = await qbp(items, (item) => handler(item), { threads: 5 });
}

// This option is good if you need the queue object available immediately.
async function option2() {
    globalQueue = qbp(items, { threads: 5 });
    await globalQueue.each((item) => handler(item));
}
```

The `queue` object is also passed to `each`, `error`, `progress`, and `empty` functions whenever they are called.

## Queue Object

The queue object is returned by qbp as well as passed to all of the functions you would pass qbp in the options. The queue lets you interact with the process as it is running. Here are the attributes and functions of the queue object.

### queue.name

If you set the `name` option, this will have that value.

### queue.empty()

You can call this function if you want to remove all items yet to be processed from the queue.

### queue.pause()

Call this function to halt processing without removing items from the queue like `queue.empty()` does.

### queue.add([item][arrayOfItems])

Pass this function one or an array of items to add them to the queue. Keep in mind that the function expects an array passed in to be an array of items to be processed. If the item you want processed is an array, you would want to wrap it in another array before adding it.

### queue.addAwait([item])

Use this function when you want to add an item to an existing queue and wait for it to complete. This will return a `Promise` object which lets you use `await` or `.then()` on the `addAwait()` function. The item will be returned once it is complete. If the item has an unhandled error in your `each` function, the `Promise` will trigger a rejection and return an object with an `error` attribute and an `item` attribute.

### queue.progressState([string])

This gets passed to the progress function. The intent is to call this function at the begining of your each function to tell the user what is currently being processed.

### queue.threads([int])

Pass this function an integer to set how many threads you want the queue to process simultaneously.

### queue.rateLimit([rateLimit, rateLimitSeconds, [rateFidelity]])

You can tell the queue to start rate limiting at any time by calling this function and passing in your rate limit options. See [Rate Limiting](#rate-limiting).

### queue.stopRateLimit()

Call this to stop rate limiting.

### queue.complete[]

See [Error Handling and Completed Items](#error-handling-and-completed-items).

### queue.errors[]

See [Error Handling and Completed Items](#error-handling-and-completed-items).

### queue.counts

This is an object containing attributes: `items` for a total count of items added to the queue, `complete` for total number of items completed, `threads` for now many threads are currently running simultaenously, `queued` for how many items have yet to be processed, and `batch` which is the current batch size.

## Progress Updates

You can supply a `progress` function in your queue options that will receive progress updates, allowing you to create progress bars and status updates to the user.

### Progress Updates on Change Example

If you supply a `progress` function in your options but not a `progressInterval` option, then your progress function will get called everytime there is a change such as a when `queue.progressState()` gets called or an item has finished processing.

```js
const qbp = require('qbp');

async function start (items) {
    await qbp(items, (...args) => each(...args), {
        progress: (...args) => progress(...args)
    })
}

async function each (item, queue) {
    queue.progressState(`Currently processing ${item.name}.`)
    // Do something with the item.
}

function progress (update) {
    console.log('Percent Complete: ' + update.percent);
    console.log('State: ' + update.state);
    console.log('Items Complete: ' + update.complete);
    console.log('Total Items: ' + update.total);
    console.log('Queued Items: ' + update.queued);
    console.log('Threads: ' + update.threads);
    console.log('Batch Size: ' + update.batch);
    console.log('Items Per Second: ' + update.itemsPerSecond);
    console.log('Seconds Remaining: ' + update.secondsRemaining);
}
```

### Progress Updates on Interval Example

The `progressInterval` option takes a value of milliseconds. Your `progress` function will get called that often and won't be called by items being completed or `queue.progressState()` getting called.

```js
const qbp = require('qbp');

async function start (items) {
    await qbp(items, (...args) => each(...args), {
        progress: (...args) => progress(...args),
        progressInterval: 1000 // Run every second.
    })
}

async function each (item, queue) {
    queue.progressState(`Currently processing ${item.name}.`)
    // Do something with the item.
}

function progress (update) {
    console.log('Percent Complete: ' + update.percent);
    console.log('State: ' + update.state);
    console.log('Items Complete: ' + update.complete);
    console.log('Total Items: ' + update.total);
    console.log('Queued Items: ' + update.queued);
    console.log('Threads: ' + update.threads);
    console.log('Batch Size: ' + update.batch);
    console.log('Items Per Second: ' + update.itemsPerSecond);
    console.log('Seconds Remaining: ' + update.secondsRemaining);
}
```

### Child Queues

Here's a great way to setup tiered progress updates. Like when you need to have a secondary progress bar for a "child process" that could be slow to make a noticable change in your primary progress bar. You can set the `parent` option in `qbp` to register this new queue as a child queue. Now progress updates will be reported to its parent. There's no limit to how deep this can go, so your child queues can have child queues of their own and the progress updates will bubble up to the parent. Child queues can have their own `progress` functions and `progressInterval` settings for their own output, and their progress will still be reported up the chain.

Children remove themselves from the parent when the queue is empty and re-add themselves to the parent when more items have been added.

```js
const qbp = require('qbp');
const classes = ['Biology', 'Calculus', 'AP English', 'Intro To Web Development'];

async function processStudents (students) {
    await qbp(students, (...args) => each(...args), {
        progress: (...args) => progress(...args)
    })
}

async function processStudent (student, queue) {
    queue.progressState(`Currently processing ${student.name}.`)
    student.classes = []; // Do some stuff to the student item
    await qbp(classes, (...args) => addStudentToClass(student, ...args), { parent: queue }) // Setting the parent option
}

async function addStudentToClass (student, class, queue) {
    // The queue you're getting here is a child of the queue setup in processStudents()
    queue.progressState(`Adding ${student.name} to ${class}.`);
    // Do whatever to add the student to the class.
}

function progress (update) {
    console.log('State: ' + update.state); // Use this for your main progress output.
    console.log('Percent Complete: ' + update.percent); // Update your progress bar with this.
    for (var i = 0; i < update.children.length; i++) {
        console.log('Child State: ' + update.children[i].state); // Use this for a secondary progress output.
        console.log('Children Percent Complete: ' + update.children[i].percent); // Update a secondary progress bar with this.
    }
}
```

## Progress Update Object

The `progress` function will get an object with these attributes.

### update.percent

This gives you the percentage (from 0 to 1) of the number of completed items out of the total items added to the queue. Keep in mind, if you add more items as the queue is running the percentage will suddenly go down.

### update.children

If you set this queue as the parent of another queue or queues this will be set to an array of update objects from those child queues. This allows you to have one progress update function from your top-most queue and report out the updates from all queues below it.

### update.state

A text value of what your queue is currently doing based on what you pass into `queue.progressState()`.

### update.queue

Supplies the actual queue object. Handy if you're using multiple queues simultaneously with the same progress function.

### update.complete

How many items have been completely processed.

### update.total

How many items have been added to the queue.

### update.threads

How many threads are currently running.

### update.batch

The max size of each batch getting passed to the `each` function.

### update.queued

How many items have yet to be processed.

### update.name

The name given to the queue when setup. Helps to differentiate between multiple queues running at the same time.

### update.itemsPerSecond

Average number of items that have been processed within a second since last time the Progress function was called.

### update.secondsRemaining

Estimated number of seconds left to process the queue based on `itemsPerSecond`. If, for some reason, `itemsPerSecond` is `0`, this will be `-1` to signify we can't currently estimate time left. For instance, the first time the `progress` function gets called `secondsRemaining` will be set to `-1`.
