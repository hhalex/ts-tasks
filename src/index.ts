import { TaskCombinator, Task } from "./tasks";
import { Stream } from "./streams";

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


const test2 = Stream.events("click", window)
    .map(e => ({time: e.timeStamp, x: e.x, y: e.y}))
    .filter(e => e.x === 0 && e.y === 0)
    .chunk(2)
    .map(([e1, e2]) => e1.x + e2.x)

const timedClickStream = Stream.events("click", window)
    .merge(Stream.interval(1000).map(() => performance.now()))
    .scan<[MouseEvent, number]>(([e, t], acc) => t > 0 ? [acc[0], t] : [e, acc[1]], [undefined, 0])
