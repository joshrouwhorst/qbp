function qbp(opts) {
    var options = {
        threads: 1
    };

    var queue = [];
    var running = false;

    var threadCount = 0;

    function add(itemOrArray) {
        if (itemOrArray instanceof Array) {
            queue.concat(queue, itemOrArray);
        }
        else {
            queue.push(itemOrArray);
        }

        setupThreads();
    }

    function start() {
        running = true;
        setupThreads();
    }

    function pause() {
        running = false;
    }

    function setupThreads(newThread) {
        if (!newThread) threadCount--;

        while(threadCount < opts.threads && queue.length > 0 && running) {
            threadCount++;
            var item = queue.splice(0, 1)[0];
            options.process(item, setupThreads);
        }
    }

    this.start = start;
    this.pause = pause;
    this.add = add;
};

module.exports = qbp;
