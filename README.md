# qbp - queue, batch, process

[![npm version](https://badge.fury.io/js/qbp.svg)](https://badge.fury.io/js/qbp)

Have thousands of items you need to loop through performing asynchronous tasks such as database or server calls? Trying to find a way to easily limit the number of simultaneous functions and keep them all straight? Wishing you had a tool to queue, batch, and process all these items? This package may be right for you!

## Contents

- [qbp - queue, batch, process](#qbp---queue-batch-process)
  - [Contents](#contents)
  - [v2.x Documentation](#v2x-documentation)
    - [Usage](#usage)
    - [Full Options Example](#full-options-example)
    - [Batching](#batching)
    - [Throttling](#throttling)
    - [Mixing](#mixing)
    - [Getting the Queue](#getting-the-queue)
    - [Error Handling and Completed Items](#error-handling-and-completed-items)
    - [Progress Updates](#progress-updates)
      - [percent](#percent)
      - [queue](#queue)
      - [complete](#complete)
      - [total](#total)
      - [threads](#threads)
      - [batch](#batch)
      - [queued](#queued)
      - [name](#name)
      - [itemsPerSecond](#itemspersecond)
      - [secondsRemaining](#secondsremaining)
  - [v1.x Documentation](#v1x-documentation)
    - [v1.x - Usage](#v1x---usage)
    - [v1.x - Full Options Example](#v1x---full-options-example)
    - [v1.x - Minimal Example](#v1x---minimal-example)
    - [v1.x - Advanced Example](#v1x---advanced-example)
    - [v1.x - Alternate Example](#v1x---alternate-example)
    - [v1.x - Creating a Queue](#v1x---creating-a-queue)
    - [v1.x - Adding Items](#v1x---adding-items)
    - [v1.x - Emptying Items](#v1x---emptying-items)
    - [v1.x - Pausing](#v1x---pausing)
    - [v1.x - Async Processing](#v1x---async-processing)
      - [v1.x - Example](#v1x---example)

## v2.x Documentation

### Usage

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
            progress: (prog) => progressFunc(prog), // Function that gets called with status updates on how the process is going.
            progressInterval: 1000, // Default 10000 - How often to get status updates in milliseconds.
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

function progressFunc(prog) {
    console.log('Percent Complete: ' + prog.percent);
    console.log('Items Complete: ' + prog.complete);
    console.log('Total Items: ' + prog.total);
    console.log('Queued Items: ' + prog.queued);
    console.log('Threads: ' + prog.threads);
    console.log('Batch Size: ' + prog.batch);
    console.log('Items Per Second: ' + prog.itemsPerSecond);
    console.log('Seconds Remaining: ' + prog.secondsRemaining);
    console.log('Queue Name: ' + prog.name); // Only if a name has been given in the options.
}

// If you use queue.add() to add more items after the queue has already completed, the empty function will get called every time you run out of items.
function emptyFunc() {
    console.log('Done!');
}

// If your `each` function throws an error, it won't stop the queue from processing. However, you can stop the queue in the error function if you'd like by calling queue.empty() or queue.pause().
function errorFunc(err, item, queue) {
    console.error(`Error found processing item ${item}, stopping process.`)
    console.error(err);
    queue.empty();
}
```

### Batching

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

### Throttling

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

### Mixing

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
function each(teacher, classRoom, student, queue) {
    // 'Mrs. Robinson', 102, 'Billy'
    // 'Mrs. Robinson', 102, 'Jane'
    // 'Mrs. Robinson', 203, 'Billy'
    // 'Mrs. Robinson', 203, 'Jane'
    // 'Mr. Knox', 102, 'Billy'
    // etc...
}
```

> One thing to keep in mind. You only have one `queue` object using this. The `queue.add()` function won't perform the mixing functionality that you get when you pass it in to the `mix()` function. But if you don't need to add any more items while processing, then this works perfect.

### Getting the Queue

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

### Error Handling and Completed Items

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

### Progress Updates

You can supply a `progress` function in your queue options that will receive progress updates, allowing you to create progress bars and status updates to the user. The function will get an object with these attributes.

#### percent

This gives you the percentage (from 0 to 1) of the number of completed items out of the total items added to the queue. Keep in mind, if you add more items as the queue is running the percentage will suddenly go down.

#### queue

Supplies the actual queue object. Handy if you're using multiple queues simultaneously with the same progress function.

#### complete

How many items have been completely processed.

#### total

How many items have been added to the queue.

#### threads

How many threads are currently running.

#### batch

The max size of each batch getting passed to the `each` function.

#### queued

How many items have yet to be processed.

#### name

The name given to the queue when setup. Helps to differentiate between multiple queues running at the same time.

#### itemsPerSecond

Average number of items that have been processed within a second since last time the Progress function was called.

#### secondsRemaining

Estimated number of seconds left to process the queue based on `itemsPerSecond`. If, for some reason, `itemsPerSecond` is `0`, this will be `-1` to signify we can't currently estimate time left. For instance, the first time the `progress` function gets called `secondsRemaining` will be set to `-1`.

-----------

## v1.x Documentation

### v1.x - Usage

To install run `npm install qbp`.

If you're not using Typescript, you'll probably want to use this import statement.

`var qbp = require('qbp').qbp;`

Using TypeScript? You should be able to import the project easily.

`import { qbp, QbpProgress } from 'qbp';`.

### v1.x - Full Options Example

```js
function runQbp(items) {
    qbp.create({
        items: items,
        name: 'ItemQueue', // Optional - The name is passed to the progress function, helpful with multiple queues running simultaneously
        process: addItemToDatabase, // Required - Function of what you want to happen to each item. Gets passed the item and a callback function.
        threads: 5, // Default 1 - Number of items getting processed concurrently
        async: false, // Default false - Allows you to specify that the progress function is an async function
        progress: progressFunc, // Optional - Function that gets called with status updates on how the process is going
        progressInterval: 1000, // Default 10000 - How often to get status updates in milliseconds
        empty: emptyFunc // Optional - Function that gets called when we're out of items
    });
}

// This function will receive the current item in the items array,
// a callback function, and the instance of the queue you created.
function addItemToDatabase(item, done, queue) {
    _db.insert(item, function (error, results) {
        // Whenever you're finished, simply call the
        // 'done' function to move on to the next item.

        if (checkSomething) {
            queue.empty(); // Clears out all queued items.
        } else if (somethingElse) {
            queue.pause(); // Temporarily stops processing items.
        } else if (yetAnotherCheck) {
            queue.resume(); // Starts a queue back up after being paused.
        } else if (lastCheck) {
            queue.add(results); // Add more items to the queue at any time.
        }

        done();
    });
}

function progressFunc(prog) { // In Typescript, this parameter is a QbpProgress object
    console.log('Percent Complete: ' + prog.percent);
    console.log('Items Complete: ' + prog.complete);
    console.log('Total Items: ' + prog.total);
    console.log('Queued Items: ' + prog.queued);
    console.log('Threads: ' + prog.threads);
    console.log('Items Per Second: ' + prog.itemsPerSecond);
    console.log('Seconds Remaining: ' + prog.secondsRemaining);
}

function emptyFunc() {
    console.log('Done!');
}
```

### v1.x - Minimal Example

```js
function runQbp(items) {
    qbp.create({
        items: items,
        process: addItemToDatabase, // Required - Function of what you want to happen to each item. Gets passed the item and a callback function.
        empty: emptyFunc // Optional - Function that gets called when we're out of items
    });
}

function addItemToDatabase(item, done, queue) {
    _db.insert(item, function (error, results) {
        // Whenever you're finished, simply call the
        // 'done' function to move on to the next item.
        done();
    });
}

function emptyFunc() {
    console.log('Done!');
}
```

### v1.x - Advanced Example

In this example we're going to pair Student records in a database with User records in a database based on their email address fields. If it can't find a user with that email address we'll assume the student record is bad and delete it. In this example, we add records to their appropriate queue immediately, processing them as they're ready and throttled by the thread counts for each queue.

```js

// Setup all the queues needed
var findUsersQueue = new qbp({
    name: 'FindUsers',
    progress: progressOutput,
    threads: 50,
    empty: onEmpty,
    process: function (student, done, queue) {
        db.getUserByEmail(student.email_address, function (result) {
            // Add student records to the queues to update or delete as needed.
            // These queues will start working immediately without this queue needing to be finished.
            if (result) {
                student.user_id = result.id;
                updateStudentsQueue.add(student); // <----<<<
            }
            else {
                deleteStudentQueue.add(student); // <----<<<
            }

            done();
        });
    }
});

var updateStudentsQueue = new qbp({
    name: 'UpdateStudents',
    progress: progressOutput,
    threads: 50,
    empty: onEmpty,
    process: function (student, done, queue) {
        db.updateStudent(student, function () {
            done();
        });
    }
});

var deleteStudentQueue = new qbp({
    name: 'DeleteBadRecords',
    progress: progressOutput,
    threads: 1000,
    empty: onEmpty,
    process: function (student, done, queue) {
        db.deleteStudent(student, function () {
            done();
        });
    }
});

// Kicking off the process here
function start() {
    db.getStudentRecords(function (students) {
        // Queueing up students for the first step
        findUsersQueue.add(students);
    });
}

function onEmpty() {
    // Once all of the queues are empty that means you're done!
    if (findUsersQueue.status === 'empty' &&
        updateStudentsQueue.status === 'empty' &&
        deleteStudentQueue.status === 'empty') {
        console.log('Done!');
    }
}

// Example output:
// DeleteBadRecords - 226063 completed items - 501914 total items - 2429/s - 113 seconds remaining
function progressOutput(vals) {
    console.log(vals.name + ' - ' + vals.complete + ' completed items - ' + vals.total + ' total items - ' + vals.itemsPerSecond + '/s - ' + vals.secondsRemaining + ' seconds remaining');
}

```

### v1.x - Alternate Example

Another way to do this would be to stage the process. And the subsequent stage doesn't run until the previous stage is finished. So this process is `Start -> Get Student Records -> Find User Records -> Update Student Records -> Delete Bad Records -> Complete`.

```js
var students = [];
var foundStudents = [];
var badStudentRecords = [];

var app = {};

app.start = function start() {
    // Using qbp to call the functions that make up this process.
    // Better than creating a nested tree of callback functions.
    var functions = [
        'getStudents',
        'findUsers',
        'updateStudents',
        'deleteBadRecords'
    ];

    console.log('Starting...');
    qbp.create({
        items: functions,
        empty: function () {
            console.log('Done!');
        },
        process: function (func, done, queue) {
            app[func](done);
        }
    })
}

app.getStudents = function getStudents(callback) {
    db.getStudentRecords(function (results) {
        students = results;
        callback();
    });
}

app.findUsers = function findUsers(callback) {
    qbp.create({
        name: 'FindUsers',
        items: students,
        progress: progressOutput,
        threads: 50,
        empty: callback,
        process: function (student, done, queue) {
            db.getUserByEmail(student.email_address, function (result) {
                if (result) {
                    student.user_id = result.id;
                    foundStudents.push(student);
                }
                else {
                    badStudentRecords.push(student);
                }

                done();
            });
        }
    });
}

app.updateStudents = function updateStudents(callback) {
    qbp.create({
        name: 'UpdateStudents',
        items: foundStudents,
        progress: progressOutput,
        threads: 50,
        empty: callback,
        process: function (student, done, queue) {
            db.updateStudent(student, function () {
                done();
            });
        }
    });
}

app.deleteBadRecords = function deleteBadRecords(callback) {
    qbp.create({
        name: 'DeleteBadRecords',
        items: badStudentRecords,
        progress: progressOutput,
        threads: 1000,
        empty: callback,
        process: function (student, done, queue) {
            db.deleteStudent(student, function () {
                done();
            });
        }
    });
}

// Example Output:
// DeleteBadRecords - 53% - 2932/s
app.progressOutput = function progressOutput(vals) {
    var perc = Math.round(vals.percent * 100);
    console.log(vals.name + ' - ' + perc + '% - ' + vals.itemsPerSecond + '/s');
}

```

### v1.x - Creating a Queue

You can create a queue [aka, an instance of qbp] in a couple different ways. First, as in the examples above you can use the static function `qbp.create(options)`. This returns the instance of the queue so you could set it to a variable if you wished, `var queue = qbp.create(options);`. You could also use the `new` operator `var queue = new qbp(options);`. Both ways are valid, whatever you prefer.

### v1.x - Adding Items

You can add an individual item or an array of items by passing them into `queue.add()`. Adding items immediately starts processing, but you can always add more items to the queue even after it's been empty.

### v1.x - Emptying Items

If you're done with your queue and don't want any more items processed, you can call `queue.empty()` to clear out queued up items. Any items that have already begun processing will still be finished. Once those are finished, the `empty` callback function supplied in the options when creating the queue will get called. You can still add more items to start the queue back up again at any time.

### v1.x - Pausing

If you need to stop your queue from processing for any reason you can call `queue.pause()`. And you can resume at any time by calling `queue.resume()`. Adding new items will also restart the queue.

### v1.x - Async Processing

By default `options.async` is set to false. But if you set it to true and supply an async function to `options.process`, you will only get `item` and `queue` parameters. You won't recieve a `done` function. You can use the `await` keyword throughout the process function or return a `Promise` object and qbp will handle it appropriately.

#### v1.x - Example

```js
function runQbp(items) {
    qbp.create({
        items: items,
        async: true,
        process: addItemToDatabase, // Required - Function of what you want to happen to each item. Gets passed the item and a callback function.
        empty: emptyFunc // Optional - Function that gets called when we're out of items
    });
}

async function addItemToDatabase(item, queue) {
    var results = await _db.insert(item);

    if (results.status === 'error') {
        await logBadRecord(item);
    }
}

async function logBadRecord(item) {
    await _db.error(item);
}

function emptyFunc() {
    console.log('Done!');
}
```
