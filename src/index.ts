import { race, Task, createEventTaskCreator, createTimeoutTaskCreator } from "./lib";

const myAction = () => console.log("myAction was executed");


const createWindowEventTask = createEventTaskCreator<WindowEventMap, Window>(window);
const createHtmlElementTask = createEventTaskCreator<HTMLElementEventMap, HTMLElement>(document.getElementById("test"));

const createTimeoutTask = createTimeoutTaskCreator(window);

const onBeforeUnloadOrTimeout = (thresholdMs: number, action: () => void) => race(
    createTimeoutTask(action, thresholdMs),
    createWindowEventTask("beforeunload", action)
);

onBeforeUnloadOrTimeout(4000, myAction);
