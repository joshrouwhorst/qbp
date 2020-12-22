// TODO:
// Need to have the progress function provide status on all currently queued items.
// Need to have thread function utilize the Item, AddGroup, and ItemPackage classes.
// Need to make sure that the user knows when an item is complete.
// Should probably provide our own statuses somehow so they know if an item is queued, processing, or complete as well as pass along their status.

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
    var activeItems = []
    var running = false
    var itemCount = 0
    var completeCount = 0
    var threadCount = 0
    var process = null

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
    var progressLoopRunning = false

    // Create the queue object.
    var queue = new Queue()

    // Set exposed properties/functions on the queue object.
    queue.name = opts.name
    queue.status = 'initializing'
    queue.empty = empty
    queue.resume = resume
    queue.pause = pause
    queue.add = add
    queue.each = setEach
    queue.threads = threads
    queue.rateLimit = setRateLimit
    queue.stopRateLimit = stopRateLimit
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
        setItemStatus,
        progress: QbpProgress.Default(queue) // Set the initial progress object.
    }

    // If no thread count is specified, process all items at once.
    if (opts.threads === null && items) opts.threads = items.length

    queue.rateLimit(opts.rateLimit, opts.rateLimitSeconds, opts.rateFidelity)

    var returnValue = null

    if (each) {
        setEach(each)
    }

    if (items) {
        returnValue = add(items)
    } else {
        returnValue = { queue }
    }

    // Make sure we're not already running yet.
    if (queue.status === 'initializing') {
        // Now we can tell the difference between when we're initially setting up the queue,
        // and when it has already digested all of the parameters.
        queue.status = 'waiting'
    }

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
        process = func
        // Make sure we're running the queue now that we know what to do with it.
        resume()

        // If we already have items, return the promise for their AddGroup so they can await queue.each()
        if (queueItems.length > 0) {
            return queueItems[0].addGroup.promise
        }
    }

    function threads (threadCount) {
        opts.threads = threadCount

        // Make sure we start up more threads if needed.
        setupThreads()
    }

    function add (itemOrArray) {
        // Can take a single item or an array of items.
        if (!(itemOrArray instanceof Array)) {
            itemOrArray = [itemOrArray]
        } else {
            // Get rid of original array reference so we're not
            // filling their array with Item objects.
            itemOrArray = [].concat(itemOrArray)
        }

        itemCount += itemOrArray.length

        var addGroup

        // If we don't have an each function yet, add all the items to the same AddGroup.
        // Lets us return one promise when the each function gets set.
        if (!progress && queueItems.length > 0) {
            addGroup = queueItems[0].addGroup
            addGroup.addItems(itemOrArray)
        } else {
            addGroup = new AddGroup(itemOrArray, queue)
        }

        queueItems = queueItems.concat(itemOrArray)

        updateCounts()

        // They didn't manually set threads and didn't pass in items, now we set threads to the first itemCount we're given.
        if (opts.threads === null) opts.threads = itemCount

        // If we have an each function and set it to process, make sure that we're running the queue.
        if (process) resume(true)

        return addGroup.promise
    }

    function empty () {
    // Clear out any queued items. qbp will finish naturally.
        queueItems.length = 0
    }

    function resume (newItem) {
        var canRun = queueItems.length > 0 && !!progress && (!running || opts.threads > threadCount)
        // Make sure we're not currently running and make sure we're not unpausing just because we added a new item.
        // If they paused the queue, they should be able to add new items without restarting it until they manually call resume().
        if (canRun && (!newItem || queue.status !== 'paused')) {
            queue.status = 'running'
            running = true
            rateLimitCanRun = true
            rateLimit()

            // Start up the progress loop.
            ensureProgressLoopRunning()

            setupThreads()
        }
    }

    function pause () {
        running = false

        // Tells us that they manually paused the queue.
        queue.status = 'paused'
        ratePause = false
    }

    async function ensureProgressLoopRunning () {
        if (progressLoopRunning) return
        progressLoopRunning = true

        // Set timer to fire this again.
        while (running && !progressOnChange && opts.progress) {
            progress()
            await waiter(opts.progressInterval)
        }

        progressLoopRunning = false
    }

    function progress (once) {
        if (!running && !once) return

        var now = new Date()

        // Figure out the percentage of completion we're currently at.
        var perc
        var lastCompleteCount = queue._.progress.complete
        if (itemCount > 0) perc = completeCount / itemCount
        else perc = 0

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

        var statuses = queueItems.map(i => { return { item: i.value, stage: i.stage } })
        statuses = statuses.concat(activeItems.map(i => { return { item: i.value, stage: i.stage, status: i.status } }))

        queue._.progress = new QbpProgress({
            percent: perc,
            statuses,
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
    }

    function setItemStatus () {
        if (progressOnChange) progress(true)
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
        }
    }

    function setupThreads () {
        // Make sure we have as many threads as they want running.
        while (threadCount < opts.threads && running && queueItems.length > threadCount) {
            threadCount++

            setupThread()
        }
    }

    async function setupThread () {
        let isRunning = running

        // Run this thread as long as there are items, we still match the thread count, and we're not paused.
        while (queueItems.length > 0 && threadCount <= opts.threads && isRunning) {
            var startTime

            // For rate limiting. If we're going faster than we should, slow down.
            if (slowDownThreads) startTime = new Date()
            if (rateLimitArr.length > 0) rateLimitArr[0]++

            var items = queueItems.splice(0, opts.batch)
            var values = items.map(i => i.value)

            items.forEach(i => { i.stage = 'processing' })
            activeItems = activeItems.concat(items)

            updateCounts()

            var pack = new ItemPackage(items, queue)

            try {
                // Call the each function.
                if (opts.spreadItem) await process(...values[0], pack)
                else if (opts.batch > 1) await process(values, pack)
                else await process(values[0], pack)

                // Keep track of completed items.
                items.forEach((item) => { item.complete() })
            } catch (err) {
                // If they have an error function call that.
                if (opts.error !== noop && opts.spreadItem) opts.error(err, ...values, pack)
                else if (opts.error !== noop && opts.batch > 1) opts.error(err, values, pack)
                else if (opts.error !== noop) opts.error(err, values[0], pack)

                // Keep track of items that had errors and pass it to the resolve.
                items.forEach((item) => {
                    var errObj = { error: err, item: item.value }
                    item.error(errObj)
                })
            }

            // The completeCount always tracks individual items within the array.
            completeCount += items.length

            // For rate limiting. If we're going faster than we should, slow down.
            if (startTime) {
                var threadTime = ((new Date()) - startTime)
                if (threadTime < minimumThreadTime) await waiter(minimumThreadTime - threadTime)
            }

            isRunning = running
            if (progressOnChange) progress(true)

            // Remove from active items
            items.forEach((item) => {
                var idx = activeItems.findIndex(i => i === item)
                activeItems.splice(idx, 1)
            })
        }

        // Figure out if we're done.
        threadComplete()
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

function Item (value, addGroup) {
    this.value = value
    this.addGroup = addGroup
    this.stage = 'queued'
    this.status = null

    this.setStatus = (status) => {
        this.status = status
        this.addGroup.queue._.setItemStatus()
    }

    this.complete = () => {
        this.stage = 'complete'
        this.addGroup.complete(this)
    }

    this.error = (err) => {
        this.stage = 'error'
        this.addGroup.error(err)
    }
}

function ItemPackage (items, queue) {
    this._items = items
    this.queue = queue
    this.setStatus = (status) => {
        this._items.forEach(i => i.setStatus(status))
    }
}

function AddGroup (items, queue) {
    this.resolve = null
    this.promise = null
    this.total = 0
    this.completed = []
    this.errors = []

    this.queue = queue

    this.promise = new Promise((resolve) => {
        this.resolve = resolve
    })

    // Allows us to add more items after initilization
    this.addItems = (items) => {
        this.total = items.length + this.total
        for (let i = 0; i < items.length; i++) {
            items[i] = new Item(items[i], this)
        }
    }

    this.complete = (item) => {
        this.completed.push(item.value)
        if ((this.completed.length + this.errors.length) >= this.total) this.resolve({ queue: this.queue, completed: this.completed, errors: this.errors })
    }

    this.error = (err) => {
        this.errors.push(err)
        if ((this.completed.length + this.errors.length) >= this.total) this.resolve({ queue: this.queue, completed: this.completed, errors: this.errors })
    }

    this.addItems(items)
}

function QbpProgress ({ percent, statuses, children, dateTime, complete, total, threads, queued, itemsPerSecond, secondsRemaining, batchSize, queue }) {
    this.percent = percent
    this.statuses = statuses
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

QbpProgress.Default = (queue) => {
    return new QbpProgress({
        percent: 0,
        statuses: [],
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

function parseArgs (...args) {
    // Figuring out which arguments are which.
    var items = args.find((arg) => Array.isArray(arg))
    var each = args.find((arg) => typeof arg === 'function')
    var opts = args.find((arg) => arg !== items && arg !== each)

    if (!opts) opts = {}

    return { items, each, opts }
}

function noop () {};

module.exports = qbp
