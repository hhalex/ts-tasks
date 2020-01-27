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
    export const interval = (timeIntervalMs: number, w: Window = window): Stream<void> => {
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
            map: <U>(f: (t: StreamedEvent) => U): Stream<U> => mapStream<StreamedEvent, U>(streamT, f)
        };
        return streamT;
    };
};

export module StreamCombinator {
    export const zip = <S1, S2>(stream1: Stream<S1>, stream2: Stream<S2>) => {
        const zipStream: Stream<[S1, S2]> = {
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
            },
            map: <U>(f: (t: [S1, S2]) => U): Stream<U> => mapStream<[S1, S2], U>(zipStream, f)
        }
        return zipStream;
    }
}