---
layout: default
title: Mix Example
---

## Mixing

I found myself nesting queues whenever I needed to loop through multiple arrays. So I added a `mix` function to help with this. Here's what I **was** doing.

```js
// Honestly, I'm not sure how you would effeciently cap threads on this.
await qbp(teachers, (teacher) => {
    await qbp(classRooms, (classRoom) => {
        await qbp(students, (student) => {
            await addStudent(teacher, classRoom, student);
        });
    });
});

async function addStudent(teacher, classRoom, student) {
    // No one likes to nest stuff.
}
```

So instead, now we can use the `qbp.mix()` function.

```js
// Now we can definitely cap the threads if we want.
await qbp.mix([teachers, classRooms, students], (...args) => addStudent(...args), { threads: 5 });

async function addStudent(teacher, classRoom, student, { queue }) {
    // The parameters mirror the same order you gave them to qbp.
}
```

<iframe src="https://codesandbox.io/embed/charming-snowflake-5evkt?fontsize=14&hidenavigation=1&theme=dark"
     style="width:100%; height:500px; border:0; border-radius: 4px; overflow:hidden;"
     title="qbp - Mix Example"
     allow="accelerometer; ambient-light-sensor; camera; encrypted-media; geolocation; gyroscope; hid; microphone; midi; payment; usb; vr; xr-spatial-tracking"
     sandbox="allow-forms allow-modals allow-popups allow-presentation allow-same-origin allow-scripts"
   ></iframe>
