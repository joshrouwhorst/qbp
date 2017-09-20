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
    var itemCount = 0;
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

        start();
    }

    function start() {
        running = true;
        setupThreads(true);
        progress();
    }

    function pause() {
        running = false;
    }

    function progress() {
        var perc = completeCount / itemCount;

        var obj = {
            perc: perc,
            complete: completeCount,
            total: itemCount,
            threads: threadCount
        };

        opts.progress(obj);

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
