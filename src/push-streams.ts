export type RunningPushStream = {
    stop: () => void
};

type PrimitivePushStream<T> = {
    map:  <U>(f: ((t: T) => U)) => PushStream<U>,
    flatMap:  <U>(f: ((t: T) => NudePushStream<U>)) => PushStream<U>,
    filter:  (f: ((t: T) => boolean)) => PushStream<T>,
    take: (n: number) => PushStream<T>,
    skip: (n: number) => PushStream<T>,
    shift: (n: number) => PushStream<T>,
    chunk: <N extends number>(n: N) => PushStream<Tuple<N, T>>,
    zip: <U>(otherStream: NudePushStream<U>) => PushStream<[T, U]>,
    merge: <U>(otherStream: NudePushStream<U>) => PushStream<[T | undefined, U | undefined]>,
}

type NudePushStream<T> = {
    start: <U>(then: (v: T) => U) => RunningPushStream
};

export type PushStream<T> = PrimitivePushStream<T> & NudePushStream<T>;

const doNothing = <_T, _U>() => () => {
    return undefined as unknown as _U;
};

type Generator<T> = () => {val: T, next: Generator<T>};

const mapStream = <T, U>(t: NudePushStream<T>, f: ((t: T) => U)): NudePushStream<U> => ({
    start: <V>(then: (v: U) => V = doNothing<U, V>()): RunningPushStream =>
        t.start((v2: T) => then(f(v2)))
});

const flatMapStream = <T, U>(t: NudePushStream<T>, f: ((t: T) => NudePushStream<U>)): NudePushStream<U> => ({
    start: <V>(then: (v: U) => V = doNothing<U, V>()): RunningPushStream =>
        t.start((v2: T) => f(v2).start(then))
});

const filterStream = <T>(nudeStreamT: NudePushStream<T>, f: ((t: T) => boolean)): NudePushStream<T> => ({
    start: <V>(then: (v: T) => V = doNothing<T, V>()): RunningPushStream =>
        nudeStreamT.start((v2: T) => {
            if (f(v2)) {
                then(v2);
            }
        })
})

const takeStream = <T>(nudeStreamT: NudePushStream<T>, n: number): NudePushStream<T> => ({
    start: <V>(then: (v: T) => V = doNothing<T, V>()): RunningPushStream => {
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

const chunkStream = <T, N extends number>(nudeStreamT: NudePushStream<T>, n: N): NudePushStream<Tuple<N, T>> => ({
    start: <V>(then: (v: Tuple<N, T>) => V = doNothing<T, V>()): RunningPushStream => {
        const tuple: T[] = [];

        const scheduledStream = nudeStreamT.start((v2: T) => {
            tuple.push(v2);
            if (tuple.length === n)
                then(tuple.splice(0) as Tuple<N, T>);
        });

        return scheduledStream;
    }
});

const zipStream = <S1, S2>(stream1: NudePushStream<S1>, stream2: NudePushStream<S2>) => ({
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
});

const skipStream = <T>(nudeStream: NudePushStream<T>, n: number) => ({
    start: <U>(then: ((v: T) => U) = doNothing<T, U>()) => {
        
        let remainingSkippableEvents = n;
        
        return nudeStream.start(event => { 
            if (remainingSkippableEvents-- <= 0) {
                then(event);
            }
         });
    }
});

const shiftStream = <T>(nudeStream: NudePushStream<T>, n: number) => ({
    start: <U>(then: ((v: T) => U) = doNothing<T, U>()) => {
        
        const queue: T[] = [];
        
        return nudeStream.start(event => {
            queue.push(event);
            if (queue.length > n) {
                then(queue.shift());
            }
         });
    }
});

const mergeStream = <T, U>(nudeStream1: NudePushStream<T>, nudeStream2: NudePushStream<U>) => ({
    start: <V>(then: ((v: [T | undefined, U | undefined]) => V) = doNothing<T, V>()) => {
        const scheduledStream1 = nudeStream1.start(t => then([t, undefined]));
        const scheduledStream2 = nudeStream2.start(u => then([undefined, u]));
        return {
            stop: () => {
                scheduledStream1.stop();
                scheduledStream2.stop();
            }
        }
    }
});

const createStream = <T>(nudeStream: NudePushStream<T>): PushStream<T> => ({
    ...nudeStream,
    map: <V>(f: (t: T) => V) => createStream(mapStream(nudeStream, f)),
    flatMap: <U>(f: (t: T) => NudePushStream<U>) => createStream(flatMapStream(nudeStream, f)),
    filter: (f: (t: T) => boolean) => createStream(filterStream(nudeStream, f)),
    take: (n: number) => createStream(takeStream(nudeStream, n)),
    skip: (n: number) => createStream(skipStream(nudeStream, n)),
    shift: (n: number) => createStream(shiftStream(nudeStream, n)),
    chunk: <N extends number>(n: N) => createStream(chunkStream(nudeStream, n)),
    zip: <N>(s: NudePushStream<N>) => createStream(zipStream(nudeStream, s)),
    merge: <V>(s: NudePushStream<V>) => createStream(mergeStream(nudeStream, s))
});

export module PushStream {
    export const interval = (timeIntervalMs: number, w: Window = window): PushStream<void> => {
        const streamT = {
            start: <V>(then: (v: void) => V = doNothing<void, V>()): RunningPushStream => {
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
    >(eventName: K, el: EL): PushStream<EM[K]> => {
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
