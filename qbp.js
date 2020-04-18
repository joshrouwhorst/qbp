function qbp(items, each, opts) {
    // Figuring out which arguments are which.
    if (!opts && each && typeof each !== 'function') {
        opts = each;
        each = null;
    }
    else if (!opts && items && !(items instanceof Array) && typeof items !== 'function') {
        opts = items;
        items = null;
    }

    if (!each && items && typeof items === 'function') {
        each = items;
        items = null;
    }

    if (!opts) opts = {};

    // Set the default options.
    var options = {
        threads: null,
        progressInterval: 10000,
        batch: 1,
        progress: noop,
        empty: noop,
        error: noop,
        debug: true
    };

    // Merge default options into their options.
    for (var key in options) {
        if (opts[key] === undefined) {
            opts[key] = options[key];
        }
    }

    // Global variables
    var queueItems = [];
    var running = false;
    var itemCount = 0;
    var completeCount = 0;
    var threadCount = 0;
    var lastCompleteCount = 0;
    var process = null;
    var _resolve;
    var _reject;

    // Create the queue object;
    var queue = {};

    // Set exposed properties/functions on the queue object.
    queue.status = 'waiting';
    queue.empty = empty;
    queue.resume = resume;
    queue.pause = pause;
    queue.add = add;
    queue.threads = threads;
    queue.complete = [];
    queue.errors = [];
    queue.counts = {
        items: itemCount,
        complete: completeCount,
        threads: threadCount,
        queued: 0,
        batch: 1
    };

    // If no thread count is specified, process all items at once.
    if (opts.threads === null && items) opts.threads = items.length;

    if (items) {
        add(items);
    }

    // If no each function given, return the queue object.
    if (!each) {
        queue.each = setEach;
        return queue;
    } else if (!items) { // Haven't supplied items yet, so just return the queue.
        return queue;
    } else { // Otherwise, return the promise object from takeEach.
        return setEach(each);
    }

    // For debugging purposes
    function log(msg) {
        if (opts.debug) console.log(msg);
    }

    // Make some metrics available throughout processing.
    function updateCounts() {
        queue.counts.total = itemCount;
        queue.counts.complete = completeCount;
        queue.counts.queued = queueItems.length;
        queue.counts.threads = threadCount;
        queue.counts.batch = opts.batchSize;
    }

    function setEach(func) {
        return new Promise(async (resolve, reject) => {
            try {
                process = func;
                
                // Save the resolve and reject functions to be called when queue is finished.
                _resolve = resolve;
                _reject = reject;
                
                // Make sure we're running the queue now that we know what to do with it.
                queue.resume();
            } catch (err) {
                reject(err);
            }
        });
    }

    function threads(threadCount) {
        opts.threads = threadCount;

        // Make sure we start up more threads if needed.
        setupThreads();
    }

    function add(itemOrArray) {
        // Can take a single item or an array of items.
        if (itemOrArray instanceof Array) {
            itemCount += itemOrArray.length;
            queueItems = queueItems.concat(queueItems, itemOrArray);
        }
        else {
            itemCount++
            queueItems.push(itemOrArray);
        }

        // They didn't manually set threads and didn't pass in items, now we set threads to the first itemCount we're given.
        if (opts.threads === null) opts.threads = itemCount;

        // They passed in the each without items. Now that we have items, set the process.
        if (each && !process) setEach(each); 

        // If we have an each function and set it to process, make sure that we're running the queue.
        if (process) resume(true);
    }

    function empty() {
        // Clear out any queued items. qbp will finish naturally.
        queueItems.length = 0;
    }

    function resume(newItem) {
        // Make sure we're not currently running and make sure we're not unpausing just because we added a new item.
        // If they paused the queue, they should be able to add new items without restarting it until they manually call resume().
        if (!running && (!newItem || queue.status !== 'paused')) {
            running = true;
            queue.status = 'running';
            setupThreads();

            // Start up the progress loop.
            if (queueItems.length > 0 || completeCount < itemCount) {
                progress();
            }
        }
    }

    function pause() {
        running = false;

        // Tells us that they manually paused the queue.
        queue.status = 'paused';
    }

    function progress(once) {
        if (!running && !once) return;

        // Figure out the percentage of completion we're currently at.
        var perc;
        if (itemCount > 0) perc = completeCount / itemCount;
        else perc = 0;

        // Figure out how many items per second are being processed.
        var newItemsCompleted = completeCount - lastCompleteCount;
        var timeDiff = 1000 / opts.progressInterval;
        var itemsPerSecond = Math.round(newItemsCompleted * timeDiff);

        // Estimate how much time is left.
        var secondsRemaining;
        if (!itemsPerSecond) secondsRemaining = -1; // Signal that we currently don't have an estimate.
        else secondsRemaining = Math.ceil(queueItems.length / itemsPerSecond);

        var obj = new QbpProgress(perc, completeCount, itemCount, threadCount, queueItems.length, itemsPerSecond, secondsRemaining, opts.batch, queue);
        opts.progress(obj);

        lastCompleteCount = completeCount;

        // Set timer to fire this again.
        if (!once && running && opts.progress !== noop) {
            setTimeout(progress, opts.progressInterval);
        }
    }

    function threadComplete() {
        threadCount--;

        // Check if we're completely done processing.
        if (queueItems.length === 0 && running && threadCount === 0) {
            log('Stopping');
            running = false;
            queue.status = 'empty';

            // Send a progress update letting them know we're empty.
            if (itemCount > 0) progress(true);

            // Call their empty function if they have one.
            opts.empty(queue);

            log('Resolving');
            _resolve(queue);
        }
    }

    function setupThreads() {
        // Make sure we have as many threads as they want running.
        while(threadCount < opts.threads && running) {
            threadCount++;
            
            (async () => {
                // Run this thread as long as there are items, we still match the thread count, and we're not paused.
                while (queueItems.length > 0 && threadCount <= opts.threads && running) {
                    var item;

                    // Peel off a batch of items or a single item.
                    if (opts.batch > 1) item = queueItems.splice(0, opts.batch);
                    else item = queueItems.splice(0, 1)[0];

                    // Batch object used for debugging purposes.
                    item = new Batch(item, completeCount + threadCount);
                    log(`${item.id} Started`);

                    updateCounts();
                    
                    try {
                        // Call the each function.
                        await process(item.value, queue);
                        log(`${item.id} Done`);

                        // Keep track of completed items.
                        queue.complete.push(item.value);
                    } catch (err) {
                        // If they have an error function call that, otherwise output to console.
                        if (opts.error !== noop) opts.error(err, item.value, queue);
                        else console.error(err);

                        // Keep track of items that had errors.
                        queue.errors.push({
                            error: err,
                            item: item.value
                        });
                    }
                    
                    // The completeCount always tracks individual items within the array.
                    if (opts.batch > 1) completeCount += item.value.length;
                    else completeCount++;
                }
                
                // Figure out if we're done.
                threadComplete();
            })();
        }
    }
}

function Batch(value, id) {
    this.value = value;
    this.id = id;
}

function QbpProgress(perc, complete, total, threads, queued, itemsPerSecond, secondsRemaining, batchSize, queue) {
    this.percent = perc;
    this.complete = complete;
    this.total = total;
    this.threads = threads;
    this.queued = queued;
    this.itemsPerSecond = itemsPerSecond
    this.batch = batchSize;
    this.queue = queue;
    this.secondsRemaining = secondsRemaining;
}

function noop() {};

module.exports = qbp;