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

        var each = async function asyncTest (item, { queue }) {
            await waiter(item);
            called = true;
            if (item) recievedItem = true;
            if (queue) recievedQueue = true;
        };

        var { errors } = await qbp(testData, (...args) => each(...args));

        assert.ok(called);
        assert.ok(recievedItem);
        assert.ok(recievedQueue);
        assert.equal(errors.length, 0);
    });
    
    it('should process PROMISE functions.', async function () {
        var testData = getTestData(1);
        var called = false;
        var recievedItem = false;
        var recievedQueue = false;

        var each = function promiseTest (item, { queue }) {
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

        var { errors } = await qbp(testData, (...args) => each(...args));

        assert.ok(called);
        assert.ok(recievedItem);
        assert.ok(recievedQueue);
        assert.equal(errors.length, 0);
    });

    
    it('should process REGULAR functions.', async function () {
        var testData = getTestData(1);
        var called = false;
        var recievedItem = false;
        var recievedQueue = false;

        var each = function regularTest (item, { queue }) {
            called = true;
            if (item) recievedItem = true;
            if (queue) recievedQueue = true;
        };

        var { errors } = await qbp(testData, (...args) => each(...args));

        assert.ok(called);
        assert.ok(recievedItem);
        assert.ok(recievedQueue);
        assert.equal(errors.length, 0);
    });
});

describe('Adding Items', function () {
    this.timeout(MAX_WAIT + 1000);

    it('should take new items during processing', async function () {
        var items = getTestData(5, 10, 10);
        var readded = false;

        var each = async function (item, { queue }) {
            await waiter(item);
            if (queue.counts.queued === 3 && !readded) {
                readded = true;
                var newItem = getTestData(1, 10, 10);
                queue.add(newItem);
            }
        };

        var { completed, errors } = await qbp(items, (...args) => each(...args), { threads: 1 });
        
        assert.equal(completed.length, items.length);
        assert.equal(errors.length, 0);
    });

    it('should take new items and restart process after being empty', function () {
        return new Promise(async (resolve, reject) => {
            try {
                var items = getTestData(5, 10, 10);
                var emptied = false;
                var gotQueue = false;
                var ranAgain = false;

                var each = async function (item) {
                    await waiter(item);
                    if (emptied) ranAgain = true;
                };

                var empty = function (queue) {
                    if (queue) gotQueue = true;
                    
                    if (emptied) {
                        assert.ok(gotQueue);
                        assert.ok(ranAgain);
                        resolve();
                    }

                    if (!emptied) emptied = true;
                };

                var { queue, completed } = await qbp(items, (...args) => each(...args), { 
                                threads: 1, 
                                empty: (...args) => empty(...args) });

                assert.equal(completed.length, 5);
                assert.ok(emptied);

                var newItems = getTestData(5, 10, 10);
                queue.add(newItems);

            } catch (err) {
                reject(err);
            }
        });
    });

    it('should let you await an item with add()', async function () {
        var testData = getTestData(100, 10, 100);

        var eachRan = false;
        var itemFound = false;

        var each = async (item) => {
            eachRan = true;
            if (item.test) itemFound = true;
            await waiter(item);
        }

        var { queue } = await qbp(testData, (...args) => each(...args));

        var item = getTestData(1, 500, 500)[0];
        item.test = true;

        assert.ok(!itemFound);
        await queue.add(item);
        assert.ok(itemFound);
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

                var each = async (item, {queue}) => {
                    
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

                await qbp(items, (...args) => each(...args), { threads: THREADS });

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

        var each = async (item, {queue}) => {
            
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

        var { queue, completed, errors } = await qbp(items, (...args) => each(...args), { threads: THREADS });

        assert.ok(hasPaused);
        assert.equal(completed.length, items.length);
        assert.equal(threadsFinished, items.length);
        assert.equal(queue.status, 'empty');
        assert.equal(errors.length, 0);
    });
});

describe('Batching', function () {
    const MAX_ITEMS = 23;
    this.timeout(MAX_ITEMS * MAX_WAIT + 1000);

    it('should break items into batches', async function () {
        var items = getTestData(MAX_ITEMS);
        const BATCH_SIZE = 5;
        const TARGET_COMPLETE_LENGTH = items.length;
        var equalItems = 0;
        var lessItems = 0;

        var each = async (items) => {
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

        var { completed, errors } = await qbp(items, (...args) => each(...args), { threads: 1, batch: BATCH_SIZE });
        assert.equal(completed.length, TARGET_COMPLETE_LENGTH);
        assert.ok(equalItems >= 1);
        assert.ok(lessItems <= 1);
        assert.equal(errors.length, 0);
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

        var each = async (item, { queue }) => {
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

        var { queue, errors } = await qbp(items, (...args) => each(...args), { threads: START_AMOUNT });
        assert.ok(threadsIncreased);
        assert.ok(threadsDecreased);
        assert.equal(queue.counts.threads, 0);
        assert.equal(errors.length, 0);
        assert.ok(increaseAmountReached);
        assert.ok(decreaseAmountReached);
    });
});

describe('Parameters', function () {
    const MAX_ITEMS = 10;
    this.timeout(MAX_ITEMS * MAX_WAIT + 1000);

    it('should let you define the queue and add each function and items later, and allow you to await qbp.each()', async function () {
        var testData = getTestData(MAX_ITEMS);
        
        var { queue } = qbp();
        
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
        var each = async (item) => {
            ran = true;
            await waiter(item);
        };

        assert.ok(!ran);
        var { errors, completed } = await queue.each((...args) => each(...args));
        assert.ok(ran);
        assert.equal(queue.counts.queued, 0);
        assert.equal(errors.length, 0);
        assert.equal(completed.length, testData.length);
        assert.equal(queue.status, 'empty');
    });

    it('should let you define parameters in any order', async function () {
        var items = getTestData(MAX_ITEMS);

        var ran = false;
        var each = async (item, { queue }) => {
            ran = true;
            assert.ok(item);
            assert.equal(queue.counts.threads, 1);
            await waiter(item);
        };
        
        assert.ok(!ran);
        var { queue, errors, completed } = await qbp({ threads: 1 }, items, (...args) => each(...args));
        assert.ok(ran);
        assert.equal(queue.counts.threads, 0);
        assert.equal(errors.length, 0);
        assert.equal(completed.length, items.length);
        assert.equal(completed.length, queue.counts.complete);
    });
});

describe('Progress', function () {
    const MAX_ITEMS = 10;
    this.timeout(MAX_ITEMS * 500 + 1000);

    it('should send progress updates', async function () {
        var items = getTestData(MAX_ITEMS, 100, 200);
        const NAME = 'Test';

        var eachRan = false;
        var each = async (item) => {
            eachRan = true;
            await waiter(item);
        };

        var progressRan = false;
        var progress = ({ percent, statuses, complete, threads, total, queued, itemsPerSecond, secondsRemaining, batch, queue, name }) => {
            if (itemsPerSecond === 0) {
                assert.equal(secondsRemaining, -1);
            }
            else {
                assert.ok(secondsRemaining >= 0);
            }

            progressRan = true;
            assert.ok(percent >= 0 && percent <= 1);
            assert.ok(complete >= 0);
            assert.ok(statuses instanceof Array);
            assert.equal(total, items.length);
            assert.ok(queued <= items.length);
            assert.ok(itemsPerSecond >= 0);
            assert.equal(batch, 1);
            assert.ok(queue);
            assert.equal(name, NAME);
            assert.equal(queue.name, NAME);
        }
        
        assert.ok(!eachRan);
        assert.ok(!progressRan);
        
        var { queue, errors } = await qbp(items, (...args) => each(...args), {
            threads: 1,
            name: NAME,
            progress: (...args) => progress(...args),
            progressInterval: 50
        });

        assert.ok(eachRan);
        assert.ok(progressRan);
        assert.equal(queue.name, NAME);
        assert.equal(errors.length, 0);
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
        var each = async (item1, item2, { queue }) => {
            eachRan = true;
            assert.ok(item1);
            assert.ok(item2);
            assert.ok(queue);
            await waiter(item1);
        };

        assert.ok(!eachRan);
        var { queue, completed, errors } = await qbp([items1, items2, items3], (...args) => each(...args), { spreadItem: true });
        assert.ok(eachRan);
        assert.equal(queue.counts.total, EXPECTED_TOTAL);
        assert.equal(completed.length, EXPECTED_TOTAL);
        assert.equal(errors.length, 0);
    });

    it('should handle multiple arrays', async function () {
        var items1 = getTestData(10, 10, 50);
        var items2 = getTestData(4, 10, 50);
        var items3 = getTestData(3, 10, 50);
        const EXPECTED_TOTAL = items1.length * items2.length * items3.length;

        var eachRan = false;
        var each = async (item1, item2, item3, { queue }) => {
            eachRan = true;
            assert.ok(item1);
            assert.ok(item2);
            assert.ok(item3);
            assert.ok(queue);
            await waiter(item1);
        };

        assert.ok(!eachRan);
        var { queue, completed, errors } = await qbp.mix([items1, items2, items3], (...args) => each(...args));
        assert.ok(eachRan);
        assert.equal(queue.counts.total, EXPECTED_TOTAL);
        assert.equal(completed.length, EXPECTED_TOTAL);
        assert.equal(errors.length, 0);
    });
});

describe('Error Handling', function () {
    it('should call an error function its given', async function () {
        var items = getTestData(1, 10, 10);

        var eachRan = false;
        var each = async (item1) => {
            eachRan = true;
            await waiter(item1);
            throw Error('Test error');
        };

        var errorRan = false;
        var error = function (err, item, {queue}) {
            errorRan = true;
            assert.ok(err);
            assert.ok(item);
            assert.ok(queue);
        };

        assert.ok(!eachRan);
        assert.ok(!errorRan);

        var { completed, errors } = await qbp(items, (...args) => each(...args), {
            error: (...args) => error(...args)
        });

        assert.ok(eachRan);
        assert.ok(errorRan);
        assert.equal(completed.length, 0);
        assert.equal(errors.length, 1);
    });
});

describe('Rate Limiting', function () {
    const ACCEPTABLE_THRESHOLD = 1000;

    it('should slow down the number of calls if they are going to fast', function () {
        return new Promise(async (resolve, reject) => {
            try {
                var items = getTestData(100, 1, 1);
                const RATE_MAX = 100;
                const RATE_TIME = 10;
                const GOAL_TIME = (items.length / RATE_MAX) * RATE_TIME;
                this.timeout(500 * 1000);

                var itemCount = 0;

                const each = async (item) => {
                    itemCount++
                    await waiter(item);
                };

                const rateUpdate = () => {}

                const error = function (err) {
                    assert.fail(err)
                }

                var startTime = new Date();
                var timeOutRan = false;

                setTimeout(() => {
                    timeOutRan = true;
                    assert.ok(itemCount <= RATE_MAX);
                }, RATE_TIME * 1000)

                var { errors } = await qbp(items, (...args) => each(...args), {
                    rateLimit: RATE_MAX,
                    rateLimitSeconds: RATE_TIME,
                    rateUpdate: (...args) => rateUpdate(...args),
                    error: (...args) => error(...args)
                });

                var endTime = new Date();

                var timeSpan = endTime.getTime() - startTime.getTime();
                assert.equal(errors.length, 0);
                assert.ok(timeSpan + ACCEPTABLE_THRESHOLD >= (GOAL_TIME * 1000));
                assert.ok(timeOutRan);
                resolve();
            } catch (err) {
                reject(err);
            }
        });
    })

    it('should increase threads if requests are going too slow', function () {
        return new Promise(async (resolve, reject) => {
            try {
                var items = getTestData(100, 200, 200);
                const RATE_MAX = 100;
                const RATE_TIME = 10;
                const GOAL_TIME = (items.length / RATE_MAX) * RATE_TIME;
                this.timeout(500 * 1000);

                var itemCount = 0;

                const each = async (item) => {
                    itemCount++
                    await waiter(item);
                };

                var threadSum = 0;
                var updateCount = 0;
                const rateUpdate = ({ currentThreads }) => {
                    updateCount++
                    threadSum += currentThreads
                }

                const error = function (err) {
                    assert.fail(err)
                }

                var startTime = new Date();
                var timeOutRan = false;

                setTimeout(() => {
                    timeOutRan = true;
                    assert.ok(itemCount <= RATE_MAX);
                }, RATE_TIME * 1000)

                var {errors} = await qbp(items, (...args) => each(...args), {
                    rateLimit: RATE_MAX,
                    rateLimitSeconds: RATE_TIME,
                    rateLimitFidelity: 4,
                    rateUpdate: (...args) => rateUpdate(...args),
                    error: (...args) => error(...args)
                });

                var endTime = new Date();

                var timeSpan = endTime.getTime() - startTime.getTime();
                assert.equal(Math.round(threadSum / updateCount), 2); // Make sure if averages to 2 threads.
                assert.equal(errors.length, 0);
                assert.ok(timeSpan >= (GOAL_TIME * 1000));
                assert.ok(timeOutRan);
                resolve();
            } catch (err) {
                reject(err);
            }
        });
    });

    it('should handle a range of processing times', function () {
        return new Promise(async (resolve, reject) => {
            try {
                var items = getTestData(100, 1, 300);
                const RATE_MAX = 100;
                const RATE_TIME = 10;
                const GOAL_TIME = (items.length / RATE_MAX) * RATE_TIME;
                this.timeout(500 * 1000);

                var itemCount = 0;

                const each = async (item) => {
                    itemCount++
                    await waiter(item);
                };
                
                var rateUpdateRan = false;
                const rateUpdate = () => {
                    rateUpdateRan = true;
                }

                const error = function (err) {
                    assert.fail(err)
                }

                var startTime = new Date();

                var {errors} = await qbp(items, (...args) => each(...args), {
                    rateLimit: RATE_MAX,
                    rateLimitSeconds: RATE_TIME,
                    rateUpdate: (...args) => rateUpdate(...args),
                    error: (...args) => error(...args)
                });

                var endTime = new Date();

                var timeSpan = endTime.getTime() - startTime.getTime();
                assert.equal(errors.length, 0);
                assert.ok(rateUpdateRan);
                assert.ok(timeSpan >= (GOAL_TIME * 1000));
                resolve();
            } catch (err) {
                reject(err);
            }
        });
    });

    it('should let you stop rate limiting', function() {
        return new Promise(async (resolve, reject) => {
            try {
                var items = getTestData(100, 1, 1);
                const RATE_MAX = 100;
                const RATE_TIME = 10;
                const GOAL_TIME = (items.length / RATE_MAX) * RATE_TIME;
                this.timeout(500 * 1000);

                var itemCount = 0;

                const each = async (item) => {
                    itemCount++
                    await waiter(item);
                };
                
                var rateUpdateRan = false;
                const rateUpdate = ({ queue }) => {
                   rateUpdateRan = true;
                    queue.stopRateLimit();
                    queue.threads(items.length);
                }

                const error = function (err) {
                    assert.fail(err)
                }

                var startTime = new Date();
                var timeOutRan = false;

                var {errors} = await qbp(items, (...args) => each(...args), {
                    rateLimit: RATE_MAX,
                    rateLimitSeconds: RATE_TIME,
                    rateUpdate: (...args) => rateUpdate(...args),
                    error: (...args) => error(...args)
                });

                var endTime = new Date();

                var timeSpan = endTime.getTime() - startTime.getTime();
                assert.equal(errors.length, 0);
                assert.ok(timeSpan < (GOAL_TIME * 1000));
                assert.ok(rateUpdateRan);
                resolve();
            } catch (err) {
                reject(err);
            }
        });
    });
});

describe('Statuses', function () {
    it('should provide item statuses in the progress function', async function () {
        var items = getTestData(10, 1, 10)
        const TEST_DATA_COUNT = items.length
        var allStatuses = []

        var each = async (item, { setStatus }) => {
            setStatus({ id: item.id, step: 'one' })
            await waiter(item)
            setStatus({ id: item.id, step: 'two' })
        }

        var prog = ({ statuses }) => {
            allStatuses = allStatuses.concat(statuses)
        }

        var { completed } = await qbp(items, (...args) => each(...args), {
            progress: (...args) => prog(...args),
            threads: 2
        })

        var hasQueueStage = allStatuses.some(s => s.stage === 'queued')
        var hasProcessingStage = allStatuses.some(s => s.stage === 'processing')
        var hasCompleteStage = allStatuses.some(s => s.stage === 'complete')
        assert.ok(hasQueueStage)
        assert.ok(hasProcessingStage)
        assert.ok(hasCompleteStage)

        for (var i = 0; i < items.length; i++) {
            var item = items[i]

            var statuses = allStatuses.filter(s => s.item === item)
            var hasStep1 = statuses.some(s => s.status && s.status.step === 'one')
            var hasStep2 = statuses.some(s => s.status && s.status.step === 'two')

            assert.ok(hasStep1)
            assert.ok(hasStep2)
        }
    })
})

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