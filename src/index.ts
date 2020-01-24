import { race, Task, timeoutTask, windowEventTask } from "./lib";

const myAction = () => console.log("myAction was executed");

const onBeforeUnloadOrTimeout = (thresholdMs: number, action: () => void): Task => race(
    timeoutTask(thresholdMs, action),
    windowEventTask(window, "beforeunload", action)
);

onBeforeUnloadOrTimeout(4000, myAction);
