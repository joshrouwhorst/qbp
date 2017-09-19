function qbp(opts) {
    var options = {
        threads: 1,
        progressInterval: 0,
        progress: noop,
        finished: noop
    };

    var queue = [];
    var running = false;
    var totalCount = 0;
    var completeCount = 0;
    var threadCount = 0;

    for (var key in options) {
        if (opts[key] === undefined) {
            opts[key] = options[key];
        }
    }

    function add(itemOrArray) {
        if (itemOrArray instanceof Array) {
            itemCount += itemOrArray.length;
            queue.concat(queue, itemOrArray);
        }
        else {
            itemCount++;
            queue.push(itemOrArray);
        }

        setupThreads();
    }

    function start() {
        running = true;
        setupThreads();
        progress();
    }

    function pause() {
        running = false;
    }

    function progress() {
        var perc = completeCount / itemCount;
        opts.progress(perc, completeCount, itemCount, threadCount);
        if (running && opts.progressInterval > 0) {
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
            opts.finished();
        }
    }

    this.start = start;
    this.pause = pause;
    this.add = add;
};

function noop() {};

module.exports = {
    qbp: qbp
};
