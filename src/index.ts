import { TaskCombinator, Task } from "./tasks";
import { Stream, StreamCombinator } from "./streams";

const myAction = () => console.log("myAction was executed");

const createHtmlElementTask = Task.event<HTMLElementEventMap, HTMLElement>("click", document.getElementById("test"));

const Tevent = Task.event("beforeunload", window) 

const onBeforeUnloadOrTimeout = (thresholdMs: number) => TaskCombinator.race(
    Task.timeout(thresholdMs),
    Task.event("beforeunload", window)
).map(myAction);

const eventStream = Stream.events("click", window)
    .map<[number, number]>(e => [e.x, e.y]);

const timeStream = Stream.interval(1000)
    .map(((i=0) => () => i++)());

const zipStream = StreamCombinator
    .zip(eventStream, timeStream)
    .map(([[x, y], time]) => `Click event [${x}, ${y}] recorded at ${time} seconds`);

zipStream.start(console.log);
