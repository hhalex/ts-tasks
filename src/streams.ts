export type RunningStream = {
    stop: () => void
};

type PrimitiveStream<T> = {
    map:  <U>(f: ((t: T) => U)) => Stream<U>,
    filter:  (f: ((t: T) => boolean)) => Stream<T>,
}

type NudeStream<T> = {
    start: <U>(then: (v: T) => U) => RunningStream
};

export type Stream<T> = PrimitiveStream<T> & NudeStream<T>;

const doNothing = <_T, _U>() => () => {
    return undefined as unknown as _U;
};

type Generator<T> = () => {val: T, next: Generator<T>};

const mapStream = <T, U>(t: Stream<T>, f: ((t: T) => U)): Stream<U> => {
    const streamU = {
        start: <V>(then: (v: U) => V = doNothing<U, V>()): RunningStream =>
            t.start((v2: T) => then(f(v2)))
    };
    return createStream(streamU);
};

const filterStream = <T>(t: Stream<T>, f: ((t: T) => boolean)): Stream<T> => {
    const streamU = {
        start: <V>(then: (v: T) => V = doNothing<T, V>()): RunningStream =>
            t.start((v2: T) => {
                if (f(v2)) {
                    then(v2);
                }
            })
    };
    return createStream(streamU);
};

const createStream = <T>(nudeStream: NudeStream<T>): Stream<T> => {
    const stream: Stream<T> = {
        ...nudeStream,
        map: <V>(f: (t: T) => V) => mapStream<T, V>(stream, f),
        filter: (f: (t: T) => boolean) => filterStream<T>(stream, f)
    };
    return stream;
};

export module Stream {
    export const interval = (timeIntervalMs: number, w: Window = window): Stream<void> => {
        const streamT = {
            start: <V>(then: (v: void) => V = doNothing<void, V>()): RunningStream => {
                const intervalId = w.setInterval(then, timeIntervalMs);
                return {
                    stop: () => w.clearInterval(intervalId)
                };
            }
        };
        return createStream(streamT); 
    }

    type EventListenable<EventMap extends {[key in keyof EventMap]: Event}> = {
        addEventListener: <K extends keyof EventMap>(eventName: K, action: (e: EventMap[K]) => void) => void,
        removeEventListener: <K extends keyof EventMap>(eventName: K, action: (e: EventMap[K]) => void) => void,
    };

    export const events = <
        EM extends {[key in keyof EM]: Event} = WindowEventMap, 
        EL extends EventListenable<EM> = Window,
        K extends keyof EM = keyof EM
    >(eventName: K, el: EL): Stream<EM[K]> => {
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
        };
        return createStream(streamT);
    };
};

export module StreamCombinator {
    export const zip = <S1, S2>(stream1: Stream<S1>, stream2: Stream<S2>) => {
        const zipStream: NudeStream<[S1, S2]> = {
            start: <U>(then: ((v: [S1, S2]) => U) = doNothing<[S1, S2], U>()) => {
                
                const initialState: [undefined, false] = [undefined, false];
                
                let s1: [S1, true] | [undefined, false] = initialState;
                let s2: [S2, true] | [undefined, false] = initialState;
                
                const emitZipEvent = () => {
                    if (s1[1] && s2[1]) {
                        then([s1[0], s2[0]]);
                        s1 = initialState;
                        s2 = initialState;
                    }
                };

                const runningStream1 = stream1.start(eventS1 => { s1 = [eventS1, true]; emitZipEvent(); });
                const runningStream2 = stream2.start(eventS2 => { s2 = [eventS2, true]; emitZipEvent(); });

                return {
                    stop: () => {
                        runningStream1.stop();
                        runningStream2.stop();
                    }
                };
            }
        }
        return createStream(zipStream);
    }
}
