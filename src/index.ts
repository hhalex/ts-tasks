import { TaskCombinator, Task } from "./tasks";
import { Stream } from "./streams";

const myAction = () => console.log("myAction was executed");

const createWindowEventTask = Task.eventCreator(window);
const createHtmlElementTask = Task.eventCreator<HTMLElementEventMap, HTMLElement>(document.getElementById("test"));

const createTimeoutTask = Task.timeoutCreator(window);

const onBeforeUnloadOrTimeout = (thresholdMs: number, action: () => void) => TaskCombinator.race(
    createTimeoutTask(action, thresholdMs),
    createWindowEventTask("beforeunload", action)
);

onBeforeUnloadOrTimeout(4000, myAction);

const eventStream: Stream<number> = Stream.events(window)("click", e => e.x);
