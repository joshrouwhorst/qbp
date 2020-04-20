const assert = require('assert');
const qbp = require('../qbp');

const MIN_WAIT = 10;
const MAX_WAIT = 20;

describe('Function Types', function () {
    this.timeout(MAX_WAIT + 1000);

    it('should process ASYNC functions.', async function () {
        var testData = getTestData(1);
        var called = false;
        var recievedItem = false;
        var recievedQueue = false;

        var each = async function asyncTest (item, queue) {
            await waiter(item);
            called = true;
            if (item) recievedItem = true;
            if (queue) recievedQueue = true;
        };

        var queue = await qbp(testData, (item, queue) => each(item, queue));

        assert.ok(called);
        assert.ok(recievedItem);
        assert.ok(recievedQueue);
        assert.equal(queue.errors.length, 0);
    });
    
    it('should process PROMISE functions.', async function () {
        var testData = getTestData(1);
        var called = false;
        var recievedItem = false;
        var recievedQueue = false;

        var each = function promiseTest (item, queue) {
            return new Promise(async (resolve, reject) => {
                try {
                    await waiter(item);
                    called = true;
                    if (item) recievedItem = true;
                    if (queue) recievedQueue = true;
                    resolve();
                } catch (err) {
                    reject(err);
                }
            });
        };

        var queue = await qbp(testData, (item, queue) => each(item, queue));

        assert.ok(called);
        assert.ok(recievedItem);
        assert.ok(recievedQueue);
        assert.equal(queue.errors.length, 0);
    });

    
    it('should process REGULAR functions.', async function () {
        var testData = getTestData(1);
        var called = false;
        var recievedItem = false;
        var recievedQueue = false;

        var each = function regularTest (item, queue) {
            called = true;
            if (item) recievedItem = true;
            if (queue) recievedQueue = true;
        };

        var queue = await qbp(testData, (item, queue) => each(item, queue));

        assert.ok(called);
        assert.ok(recievedItem);
        assert.ok(recievedQueue);
        assert.equal(queue.errors.length, 0);
    });
});

describe('Adding Items', function () {
    this.timeout(MAX_WAIT + 1000);

    
    it('should take new items during processing', async function () {
        var items = getTestData(5, 10, 10);
        var readded = false;

        var each = async function (item, queue) {
            await waiter(item);
            if (queue.counts.queued === 3 && !readded) {
                readded = true;
                var newItem = getTestData(1, 10, 10);
                queue.add(newItem);
            }
        };

        var queue = await qbp(items, (...args) => each(...args), { threads: 1 });
        
        assert.equal(queue.complete.length, 6);
        assert.equal(queue.errors.length, 0);
    });

    it('should take new items and restart process after being empty', function () {
        return new Promise(async (resolve, reject) => {
            try {
                var items = getTestData(5, 10, 10);
                var emptied = false;
                var gotQueue = false;
                var ranAgain = false;

                var each = async function (item, queue) {
                    await waiter(item);
                    if (emptied) ranAgain = true;
                };

                var empty = function (queue) {
                    if (queue) gotQueue = true;
                    
                    if (emptied) {
                        assert.ok(gotQueue);
                        assert.ok(ranAgain);
                        assert.equal(queue.complete.length, 10);
                        assert.equal(queue.errors.length, 0);
                        resolve();
                    }

                    if (!emptied) emptied = true;
                };

                var queue = await qbp(items, (...args) => each(...args), { 
                                threads: 1, 
                                empty: (...args) => empty(...args) });

                assert.equal(queue.complete.length, 5);
                assert.ok(emptied);

                var newItems = getTestData(5, 10, 10);
                queue.add(newItems);

            } catch (err) {
                reject(err);
            }
        });
        
    });
});

describe('Pause and Resume', function () {
    const MAX_ITEMS = 20;
    this.timeout(MAX_ITEMS * MAX_WAIT + 1000);
    it('should stop running after being paused', function () {
        return new Promise(async (resolve, reject) => {
            try {
                var hasPaused = false;
                const items = getTestData(MAX_ITEMS);
                const THREADS = 5;
                const STOPPING_POINT = Math.floor(items.length / 2);
                const FINISHED_THREAD_GOAL = STOPPING_POINT + THREADS;

                var threadsFinished = 0;

                var each = async (item, queue) => {
                    
                    if (queue.counts.complete === STOPPING_POINT && !hasPaused) {
                        hasPaused = true;
                        queue.pause();
                    }

                    await waiter(item);

                    threadsFinished++;

                    if (threadsFinished === FINISHED_THREAD_GOAL) {
                        // Allow some extra time for more to finish, if there incorrectly are any.
                        setTimeout(() => wrapUp(queue), 30);
                    }
                };

                var wrapUp = (queue) => {
                    assert.equal(threadsFinished, FINISHED_THREAD_GOAL);
                    assert.equal(queue.status, 'paused');
                    assert.equal(queue.errors.length, 0);
                    resolve();
                };

                var queue = await qbp(items, (...args) => each(...args), { threads: THREADS });

                assert.fail('Should not finish await when paused.');
            } catch (err) {
                reject(err);
            }
        });
    });

    it('should resume running when told after being paused', async function () {
        var hasPaused = false;
        const items = getTestData(MAX_ITEMS);
        const THREADS = 5;
        const STOPPING_POINT = Math.floor(items.length / 2);
        const FINISHED_THREAD_GOAL = STOPPING_POINT + THREADS;

        var threadsFinished = 0;

        var each = async (item, queue) => {
            
            if (queue.counts.complete === STOPPING_POINT && !hasPaused) {
                hasPaused = true;
                queue.pause();
            }

            await waiter(item);

            threadsFinished++;

            if (threadsFinished === FINISHED_THREAD_GOAL) {
                // Allow some extra time for more to finish, if there incorrectly are any.
                setTimeout(() => restart(queue), 30);
            }
        };

        var restart = (queue) => {
            assert.equal(threadsFinished, FINISHED_THREAD_GOAL);
            assert.equal(queue.status, 'paused');
            queue.resume();
        };

        var queue = await qbp(items, (...args) => each(...args), { threads: THREADS });

        assert.ok(hasPaused);
        assert.equal(queue.complete.length, items.length);
        assert.equal(threadsFinished, items.length);
        assert.equal(queue.status, 'empty');
        assert.equal(queue.errors.length, 0);
    });
});

describe('Batching', function () {
    const MAX_ITEMS = 23;
    this.timeout(MAX_ITEMS * MAX_WAIT + 1000);

    it('should break items into batches', async function () {
        var items = getTestData(MAX_ITEMS);
        const BATCH_SIZE = 5;
        const TARGET_COMPLETE_LENGTH = Math.ceil(items.length / BATCH_SIZE);
        var equalItems = 0;
        var lessItems = 0;

        var each = async (items, queue) => {
            if (!Array.isArray(items)) {
                assert.fail('items should be an array.');
            }
            else if (items.length > BATCH_SIZE) {
                assert.fail(`Got ${items.length} items, expecting ${BATCH_SIZE}.`);
            }
            else if (items.length === BATCH_SIZE) {
                equalItems++;
            }
            else if (items.length < BATCH_SIZE) {
                lessItems++;
            }

            assert.ok(items.length <= BATCH_SIZE);
            await waiter(items[0]);
        };

        var queue = await qbp(items, (...args) => each(...args), { threads: 1, batch: BATCH_SIZE });
        assert.equal(queue.complete.length, TARGET_COMPLETE_LENGTH);
        assert.ok(equalItems >= 1);
        assert.ok(lessItems <= 1);
        assert.equal(queue.errors.length, 0);
    });
});

describe('Threads', function () {
    const MAX_ITEMS = 1000;
    this.timeout(MAX_ITEMS * MAX_WAIT + 1000);

    it('should be able to increase/decrease threads during processing', async function () {
        var items = getTestData(MAX_ITEMS);
        const INCREASE_THREADS_COUNT = Math.floor(items.length / 3);
        const DECREASE_THREADS_COUNT = Math.floor(items.length / 2);
        const INCREASE_AMOUNT = 7;
        const DECREASE_AMOUNT = 2;
        const START_AMOUNT = 5;
        
        var threadsIncreased = false;
        var threadsDecreased = false;

        var increaseAmountReached = false;
        var decreaseAmountReached = false;
        var startAmountReached = false;

        var each = async (item, queue) => {
            if (threadsIncreased && !threadsDecreased) {
                assert.ok(queue.counts.threads <= INCREASE_AMOUNT && queue.counts.threads >= START_AMOUNT);
            }
            else if (threadsDecreased) {
                assert.ok(queue.counts.threads >= DECREASE_AMOUNT && queue.counts.threads <= INCREASE_AMOUNT);
            }
            else {
                assert.ok(queue.counts.threads <= START_AMOUNT);
            }

            if (queue.counts.complete === INCREASE_THREADS_COUNT && !threadsIncreased) {
                threadsIncreased = true;
                queue.threads(INCREASE_AMOUNT);
            }
            else if (queue.counts.complete === DECREASE_THREADS_COUNT && !threadsDecreased) {
                threadsDecreased = true;
                queue.threads(DECREASE_AMOUNT);
            }

            if (queue.counts.threads === INCREASE_AMOUNT) {
                increaseAmountReached = true;
            }
            else if (queue.counts.threads === DECREASE_AMOUNT) {
                decreaseAmountReached = true;
            }
            else if (queue.counts.thread === START_AMOUNT) {
                startAmountReached = true;
            }

            await waiter(item);
        };

        var queue = await qbp(items, (...args) => each(...args), { threads: START_AMOUNT });
        assert.ok(threadsIncreased);
        assert.ok(threadsDecreased);
        assert.equal(queue.counts.threads, 0);
        assert.equal(queue.errors.length, 0);
        assert.ok(increaseAmountReached);
        assert.ok(decreaseAmountReached);
    });
});

describe('Parameters', function () {
    const MAX_ITEMS = 10;
    this.timeout(MAX_ITEMS * MAX_WAIT + 1000);

    it('should let you define the queue and add each function and items later, and allow you to await qbp.each()', async function () {
        var testData = getTestData(MAX_ITEMS);
        
        var queue = qbp();
        
        assert.ok(queue);
        assert.ok(!(queue instanceof Promise));
        assert.ok(queue.each);
        assert.ok(queue.add);

        assert.equal(queue.counts.queued, 0);
        assert.equal(queue.status, 'waiting');

        queue.add(testData);

        assert.equal(queue.counts.queued, testData.length);
        assert.equal(queue.status, 'waiting');

        var ran = false;
        var each = async (item, queue) => {
            ran = true;
            await waiter(item);
        };

        assert.ok(!ran);
        await queue.each((...args) => each(...args));
        assert.ok(ran);
        assert.equal(queue.counts.queued, 0);
        assert.equal(queue.errors.length, 0);
        assert.equal(queue.status, 'empty');
    });

    it('should let you define parameters in any order', async function () {
        var items = getTestData(MAX_ITEMS);

        var ran = false;
        var each = async (item, queue) => {
            ran = true;
            assert.ok(item);
            assert.equal(queue.counts.threads, 1);
            await waiter(item);
        };
        
        assert.ok(!ran);
        var queue = await qbp({ threads: 1 }, items, (...args) => each(...args));
        assert.ok(ran);
        assert.equal(queue.counts.threads, 0);
        assert.equal(queue.errors.length, 0);
        assert.equal(queue.complete.length, items.length);
        assert.equal(queue.complete.length, queue.counts.complete);
    });
});

describe('Progress', function () {
    const MAX_ITEMS = 10;
    this.timeout(MAX_ITEMS * 500 + 1000);

    it('should send progress updates', async function () {
        var items = getTestData(MAX_ITEMS, 10, 50);
        const NAME = 'Test';

        var eachRan = false;
        var each = async (item, queue) => {
            eachRan = true;
            await waiter(item);
        };

        var progressRan = false;
        var progress = (prog) => {
            if (prog.itemsPerSecond === 0) {
                assert.equal(prog.secondsRemaining, -1);
            }
            else {
                assert.ok(prog.secondsRemaining >= 0);
            }

            progressRan = true;
            assert.ok(prog);
            assert.ok(prog.percent >= 0 && prog.percent <= 1);
            assert.ok(prog.complete >= 0);
            assert.equal(prog.total, items.length);
            assert.ok(prog.queued <= items.length);
            assert.ok(prog.itemsPerSecond >= 0);
            assert.equal(prog.batch, 1);
            assert.ok(prog.queue);
            assert.equal(prog.name, NAME);
            assert.equal(prog.queue.name, NAME);

            if (prog.queue.status === 'empty') {
                assert.equal(prog.threads, 0);
            }
            else {
                assert.equal(prog.threads, 1);
            }
        }
        
        assert.ok(!eachRan);
        assert.ok(!progressRan);
        
        var queue = await qbp(items, (...args) => each(...args), {
            threads: 1,
            name: NAME,
            progress: (...args) => progress(...args),
            progressInterval: 50
        });

        assert.ok(eachRan);
        assert.ok(progressRan);
        assert.equal(queue.name, NAME);
        assert.equal(queue.errors.length, 0);
    });
});

describe('Mix', function () {
    const MAX_ITEMS = 10;
    this.timeout(MAX_ITEMS * 500 + 1000);

    it('should spread items when asked', async function () {
        var items1 = getTestData(2, 10, 50);
        var items2 = getTestData(2, 10, 50);
        var items3 = getTestData(2, 10, 50);
        const EXPECTED_TOTAL = 3;

        var eachRan = false;
        var each = async (item1, item2, queue) => {
            eachRan = true;
            assert.ok(item1);
            assert.ok(item2);
            assert.ok(queue);
            await waiter(item1);
        };

        assert.ok(!eachRan);
        var queue = await qbp([items1, items2, items3], (...args) => each(...args), { spreadItem: true });
        assert.ok(eachRan);
        assert.equal(queue.counts.total, EXPECTED_TOTAL);
        assert.equal(queue.complete.length, EXPECTED_TOTAL);
        assert.equal(queue.errors.length, 0);
    });

    it('should handle multiple arrays', async function () {
        var items1 = getTestData(10, 10, 50);
        var items2 = getTestData(4, 10, 50);
        var items3 = getTestData(3, 10, 50);
        const EXPECTED_TOTAL = items1.length * items2.length * items3.length;

        var eachRan = false;
        var each = async (item1, item2, item3, queue) => {
            eachRan = true;
            assert.ok(item1);
            assert.ok(item2);
            assert.ok(item3);
            assert.ok(queue);
            await waiter(item1);
        };

        assert.ok(!eachRan);
        var queue = await qbp.mix([items1, items2, items3], (...args) => each(...args));
        assert.ok(eachRan);
        assert.equal(queue.counts.total, EXPECTED_TOTAL);
        assert.equal(queue.complete.length, EXPECTED_TOTAL);
        assert.equal(queue.errors.length, 0);
    });
});

describe('Error Handling', function () {
    it('should call an error function its given', async function () {
        var items = getTestData(1, 10, 50);

        var eachRan = false;
        var each = async (item1) => {
            eachRan = true;
            await waiter(item1);
            throw Error('Test error');
        };

        var errorRan = false;
        var error = function (err, item, queue) {
            errorRan = true;
            assert.ok(err);
            assert.ok(item);
            assert.ok(queue);
        };

        assert.ok(!eachRan);
        assert.ok(!errorRan);

        var queue = await qbp(items, (...args) => each(...args), {
            error: (...args) => error(...args)
        });

        assert.ok(eachRan);
        assert.ok(errorRan);
        assert.equal(queue.complete.length, 0);
        assert.equal(queue.errors.length, 1);
    });
});

// Utility functions

function waiter(num) {
    return new Promise(async (resolve, reject) => {
        try {
            if (num.num) num = num.num;
            setTimeout(() => {
                resolve();
            }, num);
        } catch (err) {
            reject(err);
        }
    });
}

function getTestData(recordNum, minWait, maxWait) {
    var testData = [];

    if (minWait === undefined) minWait = MIN_WAIT;
    if (maxWait === undefined) maxWait = MAX_WAIT;

    for (let i = 0; i < recordNum; i++) {
        testData.push({ num: rand(minWait, maxWait), id: (i + 1) });
    }

    return testData;
}

function rand(low, high) {
    var diff = high - low;
    return Math.floor((Math.random() * diff) + low); 
}

function clone(obj) {
    var str = JSON.stringify(obj);
    return JSON.parse(str);
}