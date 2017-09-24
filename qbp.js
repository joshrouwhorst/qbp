function qbp(opts) {
    var options = {
        threads: 1,
        progressInterval: 10000,
        progress: noop,
        empty: noop
    };

    var queue = [];
    var running = false;
    var totalCount = 0;
    var itemCount = 0;
    var completeCount = 0;
    var threadCount = 0;
    var lastCompleteCount = 0;

    for (var key in options) {
        if (opts[key] === undefined) {
            opts[key] = options[key];
        }
    }

    if (opts.items) {
        add(opts.items);
    }

    function add(itemOrArray) {
        if (itemOrArray instanceof Array) {
            itemCount += itemOrArray.length;
            queue = queue.concat(queue, itemOrArray);
        }
        else {
            itemCount++;
            queue.push(itemOrArray);
        }

        start();
    }

    function create(newoptions) {
        for (var key in opts) {
            if (newoptions[key] === undefined) {
                newoptions[key] = opts[key];
            }
        }

        return new qbp(newoptions);
    }

    function resume() {
        running = true;
        setupThreads(true);
        progress();
    }

    function pause() {
        running = false;
    }

    function progress(once) {
        if (!running && !once) return;

        var perc;
        if (itemCount > 0) perc = completeCount / itemCount;
        else perc = 0;

        var newItemsCompleted = completeCount - lastCompleteCount;
        var timeDiff = 1000 / opts.progressInterval;
        var itemsPerSecond = Math.round(newItemsCompleted * timeDiff);

        var obj = new Progress(perc, completeCount, itemCount, threadCount, queue.length, opts.name, itemsPerSecond);

        opts.progress(obj);

        lastCompleteCount = completeCount;

        if (!once && running && opts.progress !== noop) {
            setTimeout(progress, opts.progressInterval);
        }
    }

    function setupThreads(newThread) {
        if (!newThread) {
            threadCount--;
            completeCount++;
        }

        while(threadCount < opts.threads && queue.length > 0 && running) {
            threadCount++;
            var item = queue.splice(0, 1)[0];
            opts.process(item, setupThreads);
        }

        if (queue.length === 0 && running && threadCount === 0) {
            running = false;
            progress(true);
            opts.empty();
        }
    }

    this.create = create;
    this.resume = resume;
    this.pause = pause;
    this.add = add;
};

function Options() {}

function Progress(perc, complete, total, threads, queued, name, itemsPerSecond) {
    this.percent = perc;
    this.complete = complete;
    this.total = total;
    this.threads = threads;
    this.queued = queued;
    this.itemsPerSecond = itemsPerSecond

    if (name) {
        this.name = name;
    }
}

function noop() {};

module.exports = {
    qbp: qbp,
    Options: Options,
    Progress: Progress
};
