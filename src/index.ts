import { TaskCombinator, Task } from "./tasks";
import { Stream, StreamCombinator } from "./streams";

const myAction = () => console.log("myAction was executed");

const createHtmlElementTask = Task.event<HTMLElementEventMap, HTMLElement>(document.getElementById("test"), "click");

const timeout = Task.timeoutCreator(window);

const onBeforeUnloadOrTimeout = (thresholdMs: number) => TaskCombinator.race(
    timeout(thresholdMs),
    Task.event(window, "beforeunload").map(() => {})
).map(myAction);

const eventStream = Stream.events(window, "click")
    .map<[number, number]>(e => [e.x, e.y]);

const timeStream = Stream.interval(window)(1000)
    .map(((i=0) => () => i++)());

const zipStream = StreamCombinator
    .zip(eventStream, timeStream)
    .map(([[x, y], time]) => `Click event [${x}, ${y}] recorded at ${time} seconds`);

zipStream.start(console.log);
