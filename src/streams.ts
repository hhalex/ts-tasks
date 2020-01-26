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
        (timeIntervalMs: number): Stream<void> => {
            const streamT: Stream<void> = {
                start: <V>(then: (v: void) => V = doNothing<void, V>()): RunningStream => {
                    const intervalId = w.setInterval(then, timeIntervalMs);
                    return {
                        stop: () => w.clearInterval(intervalId)
                    };
                },
                map: <V>(fv: (u: void) => V) => mapStream<void, V>(streamT, fv)
            };
            return streamT; 
        }

    type EventListenable<EventMap extends {[key in keyof EventMap]: Event}> = {
        addEventListener: <K extends keyof EventMap>(eventName: K, action: (e: EventMap[K]) => void) => void,
        removeEventListener: <K extends keyof EventMap>(eventName: K, action: (e: EventMap[K]) => void) => void,
    };

    export const events = <
        EM extends {[key in keyof EM]: Event} = WindowEventMap, 
        EL extends EventListenable<EM> = Window,
        K extends keyof EM = keyof EM
    >(el: EL, eventName: K): Stream<EM[K]> => {
        type StreamedEvent = EM[K];
        const streamT = {
            start: <U>(then: ((v: StreamedEvent) => U) = doNothing<StreamedEvent, U>()) => {
                el.addEventListener(eventName, then);
                return {
                    stop: () => {
                        el.removeEventListener(eventName, then);
                    }
                };
            },
            map: <U>(f: (t: StreamedEvent) => U): Stream<U> => mapStream<StreamedEvent, U>(streamT, f)
        };
        return streamT;
    };
};
