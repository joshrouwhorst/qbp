# qbp - query, batch, process
Have thousands of items you need to loop through performing asynchronous tasks such as database or server calls? Trying to find a way to easily limit the concurrent number of calls and keep them all straight? Wishing you had a tool to queue, batch, and process all these items? This package may be right for you!

##Usage
To install run `npm install qbp`.

Using TypeScript? You should be able to import the project easily.

`import { qbp, QbpProgress } from 'qbp';`.

## Full Example
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
