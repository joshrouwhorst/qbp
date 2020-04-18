function qbp(items, each, opts) {
    if (!items || !(items instanceof Array)) {
        throw Error('You must supply an array to qbp.');
    }

    var options = {
        threads: null,
        progressInterval: 10000,
        progress: noop,
        empty: noop,
        error: noop,
        debug: false
    };

    if (typeof each !== 'function') {
        opts = each;
        each = null;
    }

    if (!opts) opts = {};

    var queue = this;

    this.status = 'waiting';

    var queueItems = [];
    var running = false;
    var itemCount = 0;
    var completeCount = 0;
    var threadCount = 0;
    var lastCompleteCount = 0;
    var process = null;
    var _resolve;
    var _reject;

    this.empty = empty;
    this.resume = resume;
    this.pause = pause;
    this.add = add;
    this.completed = [];
    this.errors = [];
    this.counts = {
        items: itemCount,
        complete: completeCount,
        threads: threadCount
    };

    for (var key in options) {
        if (opts[key] === undefined) {
            opts[key] = options[key];
        }
    }

    // If no thread count is specified, process all items at once.
    if (opts.threads === null) opts.threads = items.length;

    if (items) {
        add(items, true);
    }

    // If no each function given, return the queue object.
    if (!each) {
        queue.each = takeEach;
        return queue;
    } else { // Otherwise, return the promise object from takeEach.
        return takeEach(each);
    }

    function log(msg) {
        if (opts.debug) console.log(msg);
    }

    function updateCounts() {
        queue.counts.total = itemCount;
        queue.counts.complete = completeCount;
        queue.counts.queued = queueItems.length;
        queue.counts.threads = threadCount;
    }

    function takeEach(func) {
        process = func;

        return new Promise(async (resolve, reject) => {
            try {
                _resolve = resolve;
                _reject = reject;
                queue.resume();
            } catch (err) {
                reject(err);
            }
        });
    }

    function add(itemOrArray, dontResume) {
        if (itemOrArray instanceof Array) {
            //queueItems = queueItems.concat(queueItems, itemOrArray);
            for (let i = 0; i < itemOrArray.length; i++) {
                const itemValue = itemOrArray[i];
                const item = new Item(itemValue, ++itemCount);
                queueItems.push(item);
            }
        }
        else {
            var item = new Item(item, ++itemCount);
            queueItems.push(item);
        }

        if (!dontResume) resume(true);
    }

    function empty() {
        queueItems.length = 0;
    }

    function resume(newItem) {
        if (!running && (!newItem || queue.status !== 'paused')) {
            running = true;
            queue.status = 'running';
            setupThreads(true);
            if (queueItems.length > 0 || completeCount < itemCount) {
                progress();
            }
        }
    }

    function pause() {
        running = false;
        queue.status = 'paused';
    }

    function progress(once) {
        if (!running && !once) return;

        var perc;
        if (itemCount > 0) perc = completeCount / itemCount;
        else perc = 0;

        var newItemsCompleted = completeCount - lastCompleteCount;
        var timeDiff = 1000 / opts.progressInterval;
        var itemsPerSecond = Math.round(newItemsCompleted * timeDiff);

        var secondsRemaining;

        if (!itemsPerSecond) {
            secondsRemaining = -1;
        }
        else {
            secondsRemaining = Math.ceil(queueItems.length / itemsPerSecond);
        }

        var obj = new QbpProgress(perc, completeCount, itemCount, threadCount, queueItems.length, itemsPerSecond, secondsRemaining, queue);

        opts.progress(obj);

        lastCompleteCount = completeCount;

        if (!once && running && opts.progress !== noop) {
            setTimeout(progress, opts.progressInterval);
        }
    }

    function threadComplete() {
        threadCount--;
        if (queueItems.length === 0 && running && threadCount === 0) {
            log('Stopping');
            running = false;
            queue.status = 'empty';
            if (itemCount > 0) progress(true);
            opts.empty(queue);
            log('Resolving');
            _resolve(queue);
        }
    }

    function setupThreads() {
        while(threadCount < opts.threads) {
            threadCount++;
            
            (async () => {
                while (queueItems.length > 0 && running) {
                    var item = queueItems.splice(0, 1)[0];
                    item.status = 'running';
                    log(`${item.id} Started`);

                    updateCounts();
                    
                    try {
                        await process(item.value, queue);
                        log(`${item.id} Done`);
                        item.status = 'done';
                        queue.complete.push(item.value);
                    } catch (err) {
                        if (opts.error !== noop) opts.error(err, item.value, queue);
                        else console.error(err);
                        queue.errors.push({
                            error: err,
                            item: item.value
                        });
                    }
                    
                    completeCount++;
                }
                
                threadComplete();
            })();
        }
    }
}

function Item(value, itemCount) {
    this.value = value;
    this.status = 'queued';
    this.id = itemCount;
}

function QbpProgress(perc, complete, total, threads, queued, itemsPerSecond, secondsRemaining, queue) {
    this.percent = perc;
    this.complete = complete;
    this.total = total;
    this.threads = threads;
    this.queued = queued;
    this.itemsPerSecond = itemsPerSecond
    this.queue = queue;
    this.secondsRemaining = secondsRemaining;
}

function noop() {};

module.exports = qbp;
