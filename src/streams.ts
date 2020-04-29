import { Pipe } from "./pipe";

export type RunningStream = {
    stop: () => void
};

type PrimitiveStream<T> = {
    map:  <U>(f: ((t: T) => U)) => Stream<U>,
    flatMap:  <U>(f: ((t: T) => NudeStream<U>)) => Stream<U>,
    filter:  (f: ((t: T) => boolean)) => Stream<T>,
    take: (n: number) => Stream<T>,
    drop: (n: number) => Stream<T>,
    chunk: <N extends number>(n: N) => Stream<Tuple<N, T>>,
    zip: <U>(otherStream: NudeStream<U>) => Stream<[T, U]>,
    merge: <U>(otherStream: NudeStream<U>) => Stream<[T | undefined, U | undefined]>,
    scan: <A>(scanner: (event: T, aac: A) => A, initialAccValue: A) => Stream<A>,
    through: <T, A>(stream: Stream<T>, pipe: Pipe<T, A>) => Stream<A>
}

export type NudeStream<T> = {
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

const flatMapStream = <T, U>(t: NudeStream<T>, f: ((t: T) => NudeStream<U>)): NudeStream<U> => ({
    start: <V>(then: (v: U) => V = doNothing<U, V>()): RunningStream =>
        t.start((v2: T) => f(v2).start(then))
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

const zipStream = <S1, S2>(stream1: NudeStream<S1>, stream2: NudeStream<S2>) => ({
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

const dropStream = <T>(nudeStream: NudeStream<T>, n: number) => ({
    start: <U>(then: ((v: T) => U) = doNothing<T, U>()) => {
        
        let remainingDroppableEvents = n;
        
        return nudeStream.start(event => { 
            if (remainingDroppableEvents-- <= 0) {
                then(event);
            }
         });
    }
});

const mergeStream = <T, U>(nudeStream1: NudeStream<T>, nudeStream2: NudeStream<U>) => ({
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

const scanStream = <T, A>(nudeStream: NudeStream<T>, scanner: (event: T, aac: A) => A, initialAccValue: A): NudeStream<A> => ({
    start: <V>(then: ((v: A) => V) = doNothing<A, V>()) => {
        let previousAccValue = initialAccValue;
        return nudeStream.start(t => {
            previousAccValue = scanner(t, previousAccValue);
            then(previousAccValue);
        });
    }
});

const throughStream = <T, A>(nudeStream: Stream<T>, pipe: Pipe<T, A>): Stream<A> => pipe(nudeStream);

const createStream = <T>(nudeStream: NudeStream<T>): Stream<T> => ({
    ...nudeStream,
    map: <V>(f: (t: T) => V) => createStream(mapStream(nudeStream, f)),
    flatMap: <U>(f: (t: T) => NudeStream<U>) => createStream(flatMapStream(nudeStream, f)),
    filter: (f: (t: T) => boolean) => createStream(filterStream(nudeStream, f)),
    take: (n: number) => createStream(takeStream(nudeStream, n)),
    drop: (n: number) => createStream(dropStream(nudeStream, n)),
    chunk: <N extends number>(n: N) => createStream(chunkStream(nudeStream, n)),
    zip: <N>(s: NudeStream<N>) => createStream(zipStream(nudeStream, s)),
    merge: <V>(s: NudeStream<V>) => createStream(mergeStream(nudeStream, s)),
    scan: <A>(scanner: (event: T, aac: A) => A, initval: A) => createStream(scanStream(nudeStream, scanner, initval)),
    through: <T, A>(stream: Stream<T>, pipe: Pipe<T, A>) => pipe(stream)
});

export module Stream {
    export const create = createStream;

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

    type createEventFunction<EM, EL> = (<K extends keyof EM>(eventName: K, el: EL) => Stream<EM[K]>)

    type eventFunction = (<K extends keyof WindowEventMap>(eventName: K, w?: Window) => Stream<WindowEventMap[K]>)
        & createEventFunction<SVGElementEventMap, SVGElement>
        & createEventFunction<HTMLBodyElementEventMap, HTMLBodyElement>
        & createEventFunction<DocumentEventMap, HTMLDocument>
        & createEventFunction<HTMLElementEventMap, HTMLElement>

    export const events = (<K extends keyof WindowEventMap>(eventName: K, el: Window = window): Stream<WindowEventMap[K]> =>
        createStream({
            start: <U>(then: ((v: WindowEventMap[K]) => U) = doNothing<WindowEventMap[K], U>()) => {
                el.addEventListener(eventName, then);
                return {
                    stop: () => {
                        el.removeEventListener(eventName, then);
                    }
                };
            }
        })) as eventFunction;
};
