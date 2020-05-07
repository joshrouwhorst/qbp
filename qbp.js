function qbp (...args) {
    var { items, each, opts } = parseArgs(...args)

    // Set the default options.
    var options = {
        name: null,
        threads: null,
        progressInterval: 'change',
        batch: 1,
        parent: null,
        children: 0,
        spreadItem: false,
        rateLimit: -1,
        rateLimitSeconds: -1,
        rateFidelity: 16, // How many times over the course of rateLimitSeconds you want to check the rate.
        rateLimitOnEmpty: false,
        rateUpdate: noop,
        progress: null,
        empty: noop,
        error: noop,
        debug: false
    }

    // Merge default options into their options.
    for (var key in options) {
        if (opts[key] === undefined) {
            opts[key] = options[key]
        }
    }

    // Global variables.
    var queueItems = []
    var running = false
    var itemCount = 0
    var completeCount = 0
    var threadCount = 0
    var process = null
    var _resolve
    var _reject

    var rateLimitValid = false
    var rateLimitArr = []
    var ratePause = false
    var rateLimitRunning = false
    var rateLimitInterval = -1
    var minimumThreadTime = 0
    var slowDownThreads = false
    var rateLimitCanRun = false
    var targetRatePerSecond = -1
    var progressOnChange = opts.progressInterval === 'change' && (opts.progress || opts.parent)

    // Create the queue object.
    var queue = new Queue()

    // Set exposed properties/functions on the queue object.
    queue.name = opts.name
    queue.status = 'initializing'
    queue.empty = empty
    queue.resume = resume
    queue.pause = pause
    queue.add = add
    queue.addAwait = addAwait
    queue.threads = threads
    queue.rateLimit = setRateLimit
    queue.stopRateLimit = stopRateLimit
    queue.progressState = setProgressState
    queue.complete = []
    queue.errors = []
    queue.counts = {
        items: itemCount,
        complete: completeCount,
        threads: threadCount,
        queued: 0,
        batch: 1
    }

    // Internally used items attached to the queue.
    queue._ = {
        children: [],
        addChild: addChild,
        removeChild: removeChild,
        childProgress: childProgress,
        progress: QbpProgress.Default(queue), // Set the initial progress object.
        progressState: null,
        completeWithChildren: 0
    }

    // If no thread count is specified, process all items at once.
    if (opts.threads === null && items) opts.threads = items.length

    var returnValue = null

    if (items) {
        add(items)
    }

    queue.rateLimit(opts.rateLimit, opts.rateLimitSeconds, opts.rateFidelity)

    // If no each function given, return the queue object.
    if (!each) {
        queue.each = setEach
        returnValue = queue
    } else if (!items) { // Haven't supplied items yet, so just return the queue.
        returnValue = queue
    } else { // Otherwise, return the promise object from takeEach.
        returnValue = setEach(each)
    }

    // Make sure we can tell the difference between when we're initially setting up the queue,
    // and when it has already digested all of the parameters.
    queue.status = 'waiting'

    return returnValue

    // For debugging purposes.
    function log (msg) {
        if (opts.debug) console.log(msg)
    }

    // Make some metrics available throughout processing.
    function updateCounts () {
        queue.counts.total = itemCount
        queue.counts.complete = completeCount
        queue.counts.queued = queueItems.length
        queue.counts.threads = threadCount
        queue.counts.batch = opts.batchSize
    }

    function setEach (func) {
        return new Promise((resolve, reject) => {
            try {
                process = func

                // Save the resolve and reject functions to be called when queue is finished.
                _resolve = resolve
                _reject = reject

                // Make sure we're running the queue now that we know what to do with it.
                queue.resume()
            } catch (err) {
                reject(err)
            }
        })
    }

    function threads (threadCount) {
        opts.threads = threadCount

        // Make sure we start up more threads if needed.
        setupThreads()
    }

    function add (itemOrArray) {
    // Can take a single item or an array of items.
        if (itemOrArray instanceof Array) {
            itemCount += itemOrArray.length
            queueItems = queueItems.concat(itemOrArray)
        } else {
            itemCount++
            queueItems.push(itemOrArray)
        }

        updateCounts()

        // They didn't manually set threads and didn't pass in items, now we set threads to the first itemCount we're given.
        if (opts.threads === null) opts.threads = itemCount

        // They passed in the each without items. Now that we have items, set the process.
        if (queue.status !== 'initializing' && each && !process) setEach(each)

        // If we have an each function and set it to process, make sure that we're running the queue.
        if (process) resume(true)
    }

    function addAwait (item) {
        return new Promise((resolve, reject) => {
            try {
                item = new Item(item)
                item.resolve = resolve
                item.reject = reject
                queue.add(item)
            } catch (err) {
                reject(err)
            }
        })
    }

    function empty () {
    // Clear out any queued items. qbp will finish naturally.
        queueItems.length = 0
    }

    function resume (newItem) {
    // Make sure we're not currently running and make sure we're not unpausing just because we added a new item.
    // If they paused the queue, they should be able to add new items without restarting it until they manually call resume().
        if (!running && (!newItem || queue.status !== 'paused')) {
            queue.status = 'running'
            running = true
            rateLimitCanRun = true
            rateLimit()

            // Register with the parent queue.
            if (opts.parent) opts.parent._.addChild(queue)

            setupThreads()

            // Start up the progress loop.
            if (queueItems.length > 0 || completeCount < itemCount) {
                progress()
            }
        }
    }

    function pause () {
        running = false

        // Tells us that they manually paused the queue.
        queue.status = 'paused'
        ratePause = false
    }

    function addChild (childQueue) {
        // Make sure we only add once.
        if (!queue._.children.find(c => c === childQueue)) {
            queue._.children.push(childQueue)
        }
    }

    function removeChild (childQueue) {
        var idx = queue._.children.findIndex(c => c === childQueue)
        if (idx > -1) queue._.children.splice(idx, 1)
    }

    function progress (once) {
        if (!running && !once) return

        var now = new Date()

        // Figure out the percentage of completion we're currently at.
        var perc
        var lastCompleteCount = queue._.progress.complete
        if (itemCount > 0) perc = completeCount / itemCount
        else perc = 0

        // Get array of updates from all the children.
        var children = queue._.children.map(c => c._.progress)

        // Figure out how many items per second are being processed.
        var newItemsCompleted = completeCount - lastCompleteCount
        var seconds = (now - queue._.progress.dateTime) / 1000
        var itemsPerSecond
        if (seconds) itemsPerSecond = newItemsCompleted / seconds
        else itemsPerSecond = 0

        // Estimate how much time is left.
        var secondsRemaining
        if (!itemsPerSecond) secondsRemaining = -1 // Signal that we currently don't have an estimate.
        else secondsRemaining = Math.ceil(queueItems.length / itemsPerSecond)

        // Setting this in other functions, so just continue the values on to the next progress update.
        var state = queue._.progress.state

        queue._.progress = new QbpProgress({
            percent: perc,
            children,
            state,
            dateTime: now,
            complete: completeCount,
            total: itemCount,
            threads: threadCount,
            queued: queueItems.length,
            itemsPerSecond,
            secondsRemaining,
            batchSize: opts.batch,
            queue
        })

        // Send notifications.
        if (opts.progress) opts.progress(queue._.progress)
        if (opts.parent) opts.parent._.childProgress(queue._.progress.state)

        // Set timer to fire this again.
        if (!once && running && !progressOnChange && (opts.progress || opts.parent)) {
            setTimeout(progress, opts.progressInterval)
        }
    }

    // Set a text state for what the queue is currently doing.
    function setProgressState (state) {
        queue._.progress.state = state
        if (progressOnChange) progress(true)
    }

    // Register the current state of progress for children.
    function childProgress (state) {
        queue._.progress.childState = state
        if (opts.parent) setProgressState(state) // If we're not the top-most queue, bubble status changes up.
        else if (progressOnChange) progress(true)
    }

    function setRateLimit (maxRate, rateLimitSeconds, fidelity) {
        opts.rateLimit = maxRate
        opts.rateLimitSeconds = rateLimitSeconds
        opts.rateFidelity = fidelity || opts.rateFidelity // Just keep it the same if none given.

        if (opts.rateLimit !== -1 && opts.rateLimitSeconds !== -1 && opts.rateFidelity !== -1) {
            rateLimitInterval = Math.floor((opts.rateLimitSeconds / opts.rateFidelity) * 1000)
            log(`Running rate limit every ${rateLimitInterval / 1000} seconds`)
            targetRatePerSecond = opts.rateLimit / opts.rateLimitSeconds
            minimumThreadTime = (opts.rateLimitSeconds * 1000) / opts.rateLimit
            slowDownThreads = true // Limit thread times immediately then adjust as needed.
            rateLimitValid = true // Make sure we have all the variables we need.
            rateLimitArr = [0] // Reset the array.
            queue.threads(1) // Limit number of threads immediately then adjust as needed.
            rateLimit() // Make sure the rate limit loop is running.
        } else {
            rateLimitValid = false
            slowDownThreads = false
        }
    }

    function stopRateLimit () {
        rateLimitCanRun = false
        slowDownThreads = false
    }

    function rateLimit (fromTheLoop) {
        try {
            if (!rateLimitValid || !rateLimitCanRun) return

            if (rateLimitArr.length === 0) rateLimitArr.unshift(0)

            if (fromTheLoop) { // Only process if the loop told us to.
                // Remove oldest records.
                rateLimitArr.length = rateLimitArr.length >= opts.rateFidelity ? opts.rateFidelity : rateLimitArr.length

                var count = 0
                rateLimitArr.forEach((c) => { count += c })

                // If we're over or at the rate limit, do a hard pause until we're not anymore.
                if (count >= opts.rateLimit && queue.status === 'running') {
                    log('Rate Limit Pause')
                    queue.pause()
                    ratePause = true

                    // Make sure we don't resume a pause that they set, check ratePause.
                } else if (count < opts.rateLimit && queue.status === 'paused' && ratePause) {
                    log('Rate Limit Resume')
                    ratePause = false
                    queue.resume()
                }

                var projectionFidelity = 2

                if (rateLimitArr.length >= projectionFidelity) {
                    projectionFidelity = rateLimitArr.length > projectionFidelity ? rateLimitArr.length - 1 : projectionFidelity
                    const projDataSet = rateLimitArr.slice(0, projectionFidelity - 1)
                    var totalRealCount = 0
                    projDataSet.forEach(c => { totalRealCount += c })

                    const currentRatePerSecond = projDataSet[0] / (rateLimitInterval / 1000)
                    const currentThreadRate = projDataSet[0] / threadCount / (rateLimitInterval / 1000)
                    const secondsInRate = opts.rateLimitSeconds
                    const currentSeconds = projDataSet.length * (rateLimitInterval / 1000)
                    const futureSeconds = secondsInRate - currentSeconds
                    const projectedFutureCount = futureSeconds * currentRatePerSecond
                    const projectedCount = totalRealCount + projectedFutureCount
                    const projectedRate = projectedCount / secondsInRate
                    const neededChange = targetRatePerSecond - projectedRate

                    const threadDiff = currentThreadRate > 0 ? neededChange / currentThreadRate : 0
                    const threadsToAdd = (threadDiff % 1) > 0.8 ? Math.ceil(threadDiff) : Math.floor(threadDiff)
                    var targetThreads = (threadCount + threadsToAdd)
                    if (queueItems.length < targetThreads) targetThreads = queueItems.length
                    if (targetThreads < 1) targetThreads = 1
                    if (rateLimitCanRun) queue.threads(targetThreads) // Make sure that we haven't been stopped while processing.

                    // Provide stats on rate limit if they want it.
                    opts.rateUpdate({ queue, projectedCount, projectedRate, threadDiff, minimumThreadTime, currentThreads: threadCount, targetThreads, currentRatePerSecond, currentThreadRate, neededChange })
                }

                rateLimitArr.unshift(0)
            }

            // Do a loop if the queue is not empty and either this call is from the timeout loop or we're not currently running.
            if ((fromTheLoop || !rateLimitRunning)) {
                rateLimitRunning = true
                setTimeout(() => rateLimit(true), rateLimitInterval)
            } else if (fromTheLoop) { // If the queue is empty, then we want to stop rate limiting.
                rateLimitRunning = false
                rateLimitArr.length = 0
            }
        } catch (err) {
            console.error(err)
        }
    };

    function waiter (milliseconds) {
        return new Promise((resolve) => {
            setTimeout(() => resolve(), milliseconds)
        })
    }

    function threadComplete () {
        threadCount--

        // Check if we're completely done processing.
        if (queueItems.length === 0 && running && threadCount === 0) {
            log('Stopping')
            updateCounts()
            running = false
            queue.status = 'empty'
            if (!opts.rateLimitOnEmpty) rateLimitCanRun = false

            // Send a progress update letting them know we're empty.
            if (itemCount > 0) progress(true)

            // Remove ourselves from the parent.
            if (opts.parent) opts.parent._.removeChild(queue)

            // Call their empty function if they have one.
            opts.empty(queue)

            log('Resolving')
            _resolve(queue)
        }
    }

    function setupThreads () {
        try {
            // Make sure we have as many threads as they want running.
            while (threadCount < opts.threads && running && queueItems.length > threadCount) {
                threadCount++;

                (async () => {
                    let isRunning = running

                    // Run this thread as long as there are items, we still match the thread count, and we're not paused.
                    while (queueItems.length > 0 && threadCount <= opts.threads && isRunning) {
                        var item, startTime

                        // For rate limiting. If we're going faster than we should, slow down.
                        if (slowDownThreads) startTime = new Date()
                        if (rateLimitArr.length > 0) rateLimitArr[0]++

                        // Peel off a batch of items or a single item.
                        if (opts.batch > 1) item = queueItems.splice(0, opts.batch)
                        else item = queueItems.splice(0, 1)[0]

                        var itemObject
                        if (item instanceof Item) {
                            itemObject = item
                            item = item.value
                        }

                        updateCounts()

                        try {
                            // Call the each function.
                            if (opts.spreadItem) await process(...item, queue)
                            else await process(item, queue)

                            // Keep track of completed items.
                            queue.complete.push(item)
                            if (itemObject) itemObject.resolve(item)
                        } catch (err) {
                            // If they have an error function call that, otherwise output to console.
                            if (opts.error !== noop && opts.spreadItem) opts.error(err, ...item, queue)
                            else if (opts.error !== noop) opts.error(err, item, queue)
                            else console.error(err)

                            // Keep track of items that had errors.
                            var errObj = { error: err, item: item }
                            queue.errors.push(errObj)

                            if (itemObject) itemObject.reject(errObj)
                        }

                        // The completeCount always tracks individual items within the array.
                        if (opts.batch > 1) completeCount += item.length
                        else completeCount++

                        // For rate limiting. If we're going faster than we should, slow down.
                        if (startTime) {
                            var threadTime = ((new Date()) - startTime)
                            if (threadTime < minimumThreadTime) await waiter(minimumThreadTime - threadTime)
                        }

                        isRunning = running
                        if (progressOnChange) progress(true)
                    }

                    // Figure out if we're done.
                    threadComplete()
                })()
            }
        } catch (err) {
            _reject(err)
        }
    }
}

function Queue () {
    this.name = null
    this.status = null
    this.empty = null
    this.resume = null
    this.pause = null
    this.add = null
    this.threads = null
    this.complete = null
    this.errors = null
    this.counts = null
}

function parseArgs (...args) {
    // Figuring out which arguments are which.
    var items = args.find((arg) => Array.isArray(arg))
    var each = args.find((arg) => typeof arg === 'function')
    var opts = args.find((arg) => arg !== items && arg !== each)

    if (!opts) opts = {}

    return { items, each, opts }
}

// Allows you to loop through multiple arrays at once.
qbp.mix = function mix (items, ...args) {
    items = qbp.cartesian(items)
    var modArgs = parseArgs(items, ...args)
    modArgs.opts.spreadItem = true
    return qbp(modArgs.items, modArgs.each, modArgs.opts)
}

// Using cartesian product to mix two or more arrays.
qbp.cartesian = function cartesian (arr) {
    const f = (a, b) => [].concat(...a.map(a => b.map(b => [].concat(a, b))))
    const k = (a, b, ...c) => b ? k(f(a, b), ...c) : a
    return k(...arr)
}

function Item (value, id) {
    this.value = value
    this.id = id
    this.isQbpItem = true
}

function QbpProgress ({ percent, state, children, dateTime, complete, total, threads, queued, itemsPerSecond, secondsRemaining, batchSize, queue }) {
    this.percent = percent
    this.children = children
    this.state = state
    this.complete = complete
    this.total = total
    this.threads = threads
    this.queued = queued
    this.itemsPerSecond = itemsPerSecond
    this.batch = batchSize
    this.queue = queue
    this.secondsRemaining = secondsRemaining
    this.dateTime = dateTime

    if (queue.name) {
        this.name = queue.name
    }
}

QbpProgress.Default = function (queue) {
    return new QbpProgress({
        percent: 0,
        state: null,
        children: [],
        dateTime: new Date(),
        complete: 0,
        total: 0,
        threads: 0,
        queued: 0,
        itemsPerSecond: 0,
        seconds: -1,
        batchSize: 0,
        queue
    })
}

function noop () {};

module.exports = qbp
