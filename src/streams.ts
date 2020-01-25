export type RunningStream = {
    stop: () => void
};

export type Stream<T> = {
    map:  <U>(f: ((t: T) => U)) => Stream<U>
    start: <U>(then: (v: T) => U) => RunningStream
};

const doNothing = <_T, _U>() => () => {
    return undefined as unknown as _U;
};

type Generator<T> = () => {val: T, next: Generator<T>};

const mapStream = <T, U>(t: Stream<T>, f: ((t: T) => U)): Stream<U> => {
    const streamU: Stream<U> = {
        start: <V>(then: (v: U) => V = doNothing<U, V>()): RunningStream =>
            t.start((v2: T) => then(f(v2))),
        map: <V>(fu: (u: U) => V) => mapStream<U, V>(streamU, fu)
    };
    return streamU;
};

export module Stream {
    export const interval = (w: Window) =>
        <T>(action: () => T, timeIntervalMs: number): Stream<T> => {
            const streamT: Stream<T> = {
                start: <V>(then: (v: T) => V = doNothing<T, V>()): RunningStream => {
                    const intervalId = w.setInterval(() => then(action()), timeIntervalMs);
                    return {
                        stop: () => w.clearInterval(intervalId)
                    };
                },
                map: <V>(fv: (u: T) => V) => mapStream<T, V>(streamT, fv)
            };
            return streamT; 
        }
};