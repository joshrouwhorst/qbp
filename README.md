# qbp - queue, batch, process

[![npm version](https://badge.fury.io/js/qbp.svg)](https://badge.fury.io/js/qbp)

Have thousands of items you need to loop through performing asynchronous tasks such as database or server calls? Trying to find a way to easily limit the concurrent number of calls and keep them all straight? Wishing you had a tool to queue, batch, and process all these items? This package may be right for you!

## Contents
* [Usage](#usage)
* [Full Options Example](#full-options-example)
* [Minimal Example](#minimal-example)
* [Advanced Example](#advanced-example)
* [Alternate Example](#alternate-example)
* [Creating a Queue](#creating-a-queue)
* [Adding Items](#adding-items)
* [Emptying Items](#emptying-items)
* [Pausing](#pausing)
* [Progress Updates](#progress-updates)


## Usage
To install run `npm install qbp`.

If you're not using Typescript, you'll probably want to use this import statement.

`var qbp = require('qbp').qbp;`

Using TypeScript? You should be able to import the project easily.

`import { qbp, QbpProgress } from 'qbp';`.

## Full Options Example
```js
function runQbp(items) {
    qbp.create({
        items: items,
        name: 'ItemQueue', // Optional - The name is passed to the progress function, helpful with multiple queues running simultaneously
        process: addItemToDatabase, // Required - Function of what you want to happen to each item. Gets passed the item and a callback function.
        threads: 5, // Default 1 - Number of items getting processed concurrently
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
    console.log('Name: ' + prog.name);
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

## Minimal Example
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

## Advanced Example
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

## Alternate Example
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

## Creating a Queue
You can create a queue [aka, an instance of qbp] in a couple different ways. First, as in the examples above you can use the static function `qbp.create(options)`. This returns the instance of the queue so you could set it to a variable if you wished, `var queue = qbp.create(options);`. You could also use the `new` operator `var queue = new qbp(options);`. Both ways are valid, whatever you prefer.

## Adding Items
You can add an individual item or an array of items by passing them into `queue.add()`. Adding items immediately starts processing, but you can always add more items to the queue even after it's been empty.

## Emptying Items
If you're done with your queue and don't want any more items processed, you can call `queue.empty()` to clear out queued up items. Any items that have already begun processing will still be finished. Once those are finished, the `empty` callback function supplied in the options when creating the queue will get called. You can still add more items to start the queue back up again at any time.

## Pausing
If you need to stop your queue from processing for any reason you can call `queue.pause()`. And you can resume at any time by calling `queue.resume()`. Adding new items will also restart the queue.

## Progress Updates
You can supply a function when setting up your queue that will receive progress updates. The function will get an object.

### QbpProgress.percent
This gives you the percentage (from 0 to 1) of the number of completed items out of the total items added to the queue. Keep in mind, if you add more items as the queue is running the percentage will suddenly go down.

### QbpProgress.queue
Supplies the actual queue object. Handy if you're using multiple queues simultaneously with the same progress function.

### QbpProgress.complete
How many items have been completely processed.

### QbpProgress.total
How many items have been added to the queue.

### QbpProgress.threads
How many threads are currently running.

### QbpProgress.queued
How many items have yet to be processed.

### QbpProgress.name
The name given to the queue when setup. Helps to differentiate between multiple queues running at the same time.

### QbpProgress.itemsPerSecond
Average number of items that have been processed within a second since last time the Progress function was called.

### QbpProgress.secondsRemaining
Estimated number of seconds left to process the queue based on `QbpProgress.itemsPerSecond`.
