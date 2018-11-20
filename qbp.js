function qbp(opts) {
    var options = {
        threads: 1,
        progressInterval: 10000,
        progress: noop,
        empty: noop
    };

    var _this = this;

    _this.status = 'waiting';

    var queue = [];
    var running = false;
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

        resume(true);
    }

    function empty() {
        queue.length = 0;
    }

    function resume(newItem) {
        if (!running && (!newItem || _this.status !== 'paused')) {
            running = true;
            _this.status = 'running';
            setupThreads(true);
            if (queue.length > 0 || completeCount < itemCount) {
                progress();
            }
        }
    }

    function pause() {
        running = false;
        _this.status = 'paused';
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
            secondsRemaining = Math.ceil(queue.length / itemsPerSecond);
        }

        var obj = new QbpProgress(perc, completeCount, itemCount, threadCount, queue.length, opts.name, itemsPerSecond, secondsRemaining, _this);

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
            opts.process(item, setupThreads, _this);
        }

        if (queue.length === 0 && running && threadCount === 0) {
            running = false;
            _this.status = 'empty';
            if (itemCount > 0) progress(true);
            opts.empty();
        }
    }

    this.empty = empty;
    this.resume = resume;
    this.pause = pause;
    this.add = add;
};

qbp.create = function (opts) {
    return new qbp(opts);
}

function QbpProgress(perc, complete, total, threads, queued, name, itemsPerSecond, secondsRemaining, queue) {
    this.percent = perc;
    this.complete = complete;
    this.total = total;
    this.threads = threads;
    this.queued = queued;
    this.itemsPerSecond = itemsPerSecond
    this.queue = queue;
    this.secondsRemaining = secondsRemaining;

    if (name) {
        this.name = name;
    }
}

function noop() {};

module.exports = {
    qbp: qbp,
    QbpProgress: QbpProgress
};
