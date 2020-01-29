export type RunningStream = {
    stop: () => void
};

type PrimitiveStream<T> = {
    map:  <U>(f: ((t: T) => U)) => Stream<U>,
    filter:  (f: ((t: T) => boolean)) => Stream<T>,
    take: (n: number) => Stream<T>,
    chunk: <N extends number>(n: N) => Stream<Tuple<N, T>>
}

type NudeStream<T> = {
    start: <U>(then: (v: T) => U) => RunningStream
};

export type Stream<T> = PrimitiveStream<T> & NudeStream<T>;

const doNothing = <_T, _U>() => () => {
    return undefined as unknown as _U;
};

type Generator<T> = () => {val: T, next: Generator<T>};

const mapStream = <T, U>(t: NudeStream<T>, f: ((t: T) => U)): NudeStream<U> => ({
    start: <V>(then: (v: U) => V = doNothing<U, V>()): RunningStream =>
        t.start((v2: T) => then(f(v2)))
});

const filterStream = <T>(nudeStreamT: NudeStream<T>, f: ((t: T) => boolean)): NudeStream<T> => ({
    start: <V>(then: (v: T) => V = doNothing<T, V>()): RunningStream =>
        nudeStreamT.start((v2: T) => {
            if (f(v2)) {
                then(v2);
            }
        })
})

const takeStream = <T>(nudeStreamT: NudeStream<T>, n: number): NudeStream<T> => ({
    start: <V>(then: (v: T) => V = doNothing<T, V>()): RunningStream => {
        let countDown = n;

        const scheduledStream = nudeStreamT.start((v2: T) => {
            if (countDown-- > 0)
                then(v2);
            else
                scheduledStream.stop();
        });

        return scheduledStream;
    }
});

type Tuple<N extends number, T> = N extends 0
    ? never
    : N extends 1
        ? [T]
        : N extends 2
            ? [T, T]
            : N extends 3
                ? [T, T, T]
                : T[];

const chunkStream = <T, N extends number>(nudeStreamT: NudeStream<T>, n: N): NudeStream<Tuple<N, T>> => ({
    start: <V>(then: (v: Tuple<N, T>) => V = doNothing<T, V>()): RunningStream => {
        const tuple: T[] = [];

        const scheduledStream = nudeStreamT.start((v2: T) => {
            tuple.push(v2);
            if (tuple.length === n)
                then(tuple.splice(0) as Tuple<N, T>);
        });

        return scheduledStream;
    }
});

const createStream = <T>(nudeStream: NudeStream<T>): Stream<T> => ({
    ...nudeStream,
    map: <V>(f: (t: T) => V) => createStream(mapStream(nudeStream, f)),
    filter: (f: (t: T) => boolean) => createStream(filterStream(nudeStream, f)),
    take: (n: number) => createStream(takeStream(nudeStream, n)),
    chunk: <N extends number>(n: N) => createStream(chunkStream(nudeStream, n))
});

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
        K extends keyof EM,
        EM extends {[key in keyof EM]: Event} = WindowEventMap,
        EL extends EventListenable<EM> = Window
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
                
                const s1: S1[] = [];
                const s2: S2[] = [];
                
                const emitZipEvent = () => {
                    if (s1.length > 0 && s2.length > 0) {
                        then([s1.shift(), s2.shift()]);
                    }
                };

                const runningStream1 = stream1.start(eventS1 => { s1.push(eventS1); emitZipEvent(); });
                const runningStream2 = stream2.start(eventS2 => { s2.push(eventS2); emitZipEvent(); });

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
