import { TaskCombinator, Task } from "./tasks";
import { Stream, StreamCombinator } from "./streams";

const myAction = () => console.log("myAction was executed");

const createHtmlElementTask = Task.event<keyof HTMLElementEventMap, HTMLElementEventMap, HTMLElement>("click", document.getElementById("test"));

const Tevent = Task.event("beforeunload", window) 

const onBeforeUnloadOrTimeout = (thresholdMs: number) => TaskCombinator.race(
    Task.timeout(thresholdMs),
    Task.event("beforeunload", window)
).map(myAction);

const recursiveTimeout8 = Task.timeout(1000).repeat(8);

const eventStream = Stream.events("click", window)
    .map<[number, number]>(e => [e.x, e.y]);

const timeStream = Stream.interval(1000)
    .map(((i=0) => () => i++)())
    .filter(n => n == 1);

const test = TaskCombinator.all(recursiveTimeout8, recursiveTimeout8, recursiveTimeout8)

const zipStream = eventStream
    .zip(timeStream)
    .map(([[x, y], time]) => `Click event [${x}, ${y}] recorded at ${time} seconds`)
    .chunk(3)
    .take(1);

zipStream.start(console.log);
