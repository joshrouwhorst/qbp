---
layout: default
title: Statuses Example
---

## Item Statuses

This is meant to be a system for easily creating a queued process that runs in the background but will provide updates as it progresses. Think of a resource intensive process, like crawling a website. You want to limit how many of these scans can happen simultaneously, and maybe you want to display a queue of the user's requests that updates as their requests progress.

```js
var { queue } = qbp((...args) => handleItem(...args), {
    threads: 5,
    progress: (...args) => progressUpdates(...args)
})

async function processItem (newItem) {
    await queue.add(newItem)
}

async function handleItem (item, { setStatus }) {
    // You can give this item a status and make
    // the status anything you want, object or string.
    setStatus({
        name: item.name,
        process: 'Preparing',
        percent: 0.33,
        time: new Date()
    })

    await _db.insert(item)

    if (checkSomething) {
        await migrateItem(item, setStatus)
    } else {
        await doSomethingElse(item, setStatus)
    }
}

async function migrateItem (item, setStatus) {
    // You can change that status throughout the process
    setStatus({
        name: item.name,
        process: 'Migrating',
        percent: 0.66,
        time: new Date()
    })

    await _db.move(item)

    setStatus({
        name: item.name,
        process: 'Complete',
        percent: 1,
        time: new Date()
    })
}

// If you haven't defined a progressInterval option, calling setStatus will trigger a progress update.
function progressUpdate ({ statuses }) {
    console.log('Current Item Statuses:')

    for (let i = 0; i < statuses.length; i++) {
        const {
            stage, // stage is set by qbp and will be 'queued', 'processing', 'complete', or 'error'.
            status, // status is the status you set above. 'queued' items will not have a status set yet.
            item // item is the actual item in the queue we're referring to.
        } = statuses[i]

        if (!status) continue

        const {
            name,
            process,
            percent,
            time
        } = status
    }
}

```

<iframe src="https://codesandbox.io/embed/rough-darkness-31wjr?fontsize=14&hidenavigation=1&theme=dark"
     style="width:100%; height:500px; border:0; border-radius: 4px; overflow:hidden;"
     title="rough-darkness-31wjr"
     allow="accelerometer; ambient-light-sensor; camera; encrypted-media; geolocation; gyroscope; hid; microphone; midi; payment; usb; vr; xr-spatial-tracking"
     sandbox="allow-forms allow-modals allow-popups allow-presentation allow-same-origin allow-scripts"
   ></iframe>
