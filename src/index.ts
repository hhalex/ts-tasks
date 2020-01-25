import { TaskCombinator, Task } from "./lib";

const myAction = () => console.log("myAction was executed");

const createWindowEventTask = Task.eventCreator<WindowEventMap, Window>(window);
const createHtmlElementTask = Task.eventCreator<HTMLElementEventMap, HTMLElement>(document.getElementById("test"));

const createTimeoutTask = Task.timeoutCreator(window);

const onBeforeUnloadOrTimeout = (thresholdMs: number, action: () => void) => TaskCombinator.race(
    createTimeoutTask(action, thresholdMs),
    createWindowEventTask("beforeunload", action)
);

onBeforeUnloadOrTimeout(4000, myAction);
