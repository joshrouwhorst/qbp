# qbp - query, batch, process
Have thousands of items you need to loop through performing asynchronous tasks such as database or server calls? Trying to find a way to easily limit the concurrent number of calls and keep them all straight? Wishing you had a tool to queue, batch, and process all these items? This package may be right for you!

##Usage
To install run `npm install qbp`.

Using TypeScript? You should be able to import the project easily.

`import { qbp, Options, Progress } from 'qbp';`.

##Example
```js
function runQbp(items) {
    var queue  = new qbp({
        name: 'ItemQueue', // Optional - The name is passed to the progress function, helpful with multiple queues running simultaneously
        process: addItemToDatabase, // Required - Function of what you want to happen to each item. Gets passed the item and a callback function.
        threads: 5, // Default 1 - Number of items getting processed concurrently
        progress: progressFunc, // Optional - Function that gets called with status updates on how the process is going
        progressInterval: 1000, // Default 10000 - How often to get status updates in milliseconds
        empty: emptyFunc // Optional - Function that gets called when we're out of items
    });

    queue.add(items);
}

function addItemToDatabase(item, done) {
    _db.insert(item, function (error, results) {
        // Whenever you're finished, simply call the
        // 'done' function to move on to the next item.
        done();
    });
}

function progressFunc(prog) {
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

## Adding Items
You can add an individual item or an array of items by passing them into `queue.add()`. Adding items immediately starts processing, but you can always add more items to the queue.

## Pausing
If you need to stop your queue from processing for any reason you can call `queue.pause()`. And you can resume at any time by calling `queue.start()`. Adding new items will also restart the queue.

## Progress Updates
You can supply a function when setting up your queue that will receive progress updates. The function will get an object.

### Progress.percent
This gives you the percentage (from 0 to 1) of the number of completed items out of the total items added to the queue. Keep in mind, if you add more items as the queue is running the percentage will suddenly go down.

### Progress.complete
How many items have been completely processed.

### Progress.total
How many items have been added to the queue.

### Progress.threads
How many threads are currently running.

### Progress.queued
How many items have yet to be processed.

### Progress.name
The name given to the queue when setup. Helps to differentiate between multiple queues running at the same time.
