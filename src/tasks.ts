export type ScheduledTask = {
    cancel: () => boolean
};

type NudeTask<T> = {
    run: <U>(then: (v: T) => U) => ScheduledTask
};

type PrimitiveTask<T> = {
    flatMap:  <U>(f: ((t: T) => Task<U>)) => Task<U>,
    map: <U>(f: (t: T) => U) => Task<U>,
    repeat: (n: number) => Task<T>
};

export type Task<T> = PrimitiveTask<T> & NudeTask<T>;

const doNothing = <_T, _U>() => () => {
    return undefined as unknown as _U;
};

const mapTask = <T, U>(t: NudeTask<T>, f: ((t: T) => U)): NudeTask<U> => ({
    run: <V>(then: (v: U) => V = doNothing<U, V>()): ScheduledTask =>
        t.run(v => then(f(v)))
});

const flatMapTask = <T, U>(t: NudeTask<T>, f: ((t: T) => NudeTask<U>)): NudeTask<U> => ({
    run: <V>(then: (v: U) => V = doNothing<U, V>()): ScheduledTask => {
        let scheduledSnd: ScheduledTask;
        const scheduledFst = t.run((v2: T) => {
            scheduledSnd = f(v2).run(then);
        });
        return {
            cancel: () => {
                const fstCancelRes = scheduledFst.cancel();
                return scheduledSnd ? fstCancelRes || scheduledSnd.cancel() : fstCancelRes;
            }
        };
    }
});

const repeatTask = <T>(task: NudeTask<T>, n: number): NudeTask<T> => ({
    run: <U>(then: (t: T) => U = doNothing<T, U>()): ScheduledTask =>
        task.run((n === 1)
            ? (_t: T) => task.run(then)
            : (_t: T) => { repeatTask(task, n - 1).run(then); })
});

const createTask = <T>(nudeTask: NudeTask<T>) => {
    const taskT: Task<T> = {
        ...nudeTask,
        map: <V>(f: (v: T) => V) => createTask(mapTask<T, V>(taskT, f)),
        flatMap: <V>(f: (t: T) => Task<V>) => createTask(flatMapTask<T, V>(taskT, f)),
        repeat: (n: number) => createTask(repeatTask(taskT, n))
    }
    return taskT;
} 

export module Task {

    export const lambda = <T>(action: () => T): Task<T> => {
        const taskT = {
            run: <U>(then: ((v: T) => U) = doNothing<T, U>()) => {
                then(action());
                return {
                    cancel: () => false
                };
            }
        };
        return createTask(taskT);
    };

    export const noop = lambda(doNothing<void, void>());

    export const timeout = (thresholdMs: number, w: Window = window): Task<void> => {
        const taskT = {
            run: <U>(then: ((t: void) => U) = doNothing<void, U>()) => {
                let executed = false;
                const timeoutId = w.setTimeout(() => { then(); executed = true; }, thresholdMs);
                return {
                    cancel: () => {
                        w.clearTimeout(timeoutId);
                        return !executed;
                    }
                };
            }
        };
        return createTask(taskT);
    };

    export const raf = (w: Window = window): Task<number> => createTask({
        run: <U>(then: ((t: number) => U) = doNothing<number, U>()) => {
            let executed = false;
            const rafId = w.requestAnimationFrame(t => { then(t); executed = true; });
            return {
                cancel: () => {
                    w.cancelAnimationFrame(rafId);
                    return !executed;
                }
            };
        }
    });

    type EventListenable<EventMap extends {[key in keyof EventMap]: Event}> = {
        addEventListener: <K extends keyof EventMap>(eventName: K, action: (e: EventMap[K]) => void) => void,
        removeEventListener: <K extends keyof EventMap>(eventName: K, action: (e: EventMap[K]) => void) => void,
    };

    export const event = <
        K extends keyof EM,
        EM extends {[key in keyof EM]: Event} = WindowEventMap,
        EL extends EventListenable<EM> = Window
    >(eventName: K, el: EL): Task<EM[K]> => {
        type TaskEvent = EM[K];
        const taskT = {
            run: <U>(then: ((v: TaskEvent) => U) = doNothing<TaskEvent, U>()) => {
                let executed = false;
                const doit = (e: TaskEvent) => { then(e); executed = true; };
                el.addEventListener(eventName, doit);
                return {
                    cancel: () => {
                        el.removeEventListener(eventName, doit);
                        return !executed;
                    }
                };
            }
        };
        return createTask(taskT);
    };
}
export module TaskCombinator {

    type raceFunction = (<T1, T2>(t1: Task<T1>, t2: Task<T2>) => Task<T1 | T2>)
        & (<T1, T2, T3>(t1: Task<T1>, t2: Task<T2>, t3: Task<T3>) => Task<T1 | T2 | T3>)
        & (<T1, T2, T3, T4>(t1: Task<T1>, t2: Task<T2>, t3: Task<T3>, t4: Task<T4>) => Task<T1 | T2 | T3 | T4>)
        & (<T1, T2, T3, T4, T5>(t1: Task<T1>, t2: Task<T2>, t3: Task<T3>, t4: Task<T4>, t5: Task<T5>) => Task<T1 | T2 | T3 | T4 | T5>);

    export const race = (<T>(...tasks: Task<T | void>[]): Task<T | void> => {
        const taskT = {
            run: <U>(then: ((v: T | void) => U) = doNothing<T, U>()) => {
                const scheduledTasks = tasks.map(t => t.run(v => { const res = then(v); cancelAll(); return res; }));
                const cancelAll = () => scheduledTasks.map(t => t.cancel()).reduce((acc, current) => acc || current, false);
                return {
                    cancel: cancelAll
                };
            }
        };
        return createTask(taskT);
    }) as raceFunction;

    type allFunction = (<T1, T2>(t1: Task<T1>, t2: Task<T2>) => Task<[T1, T2]>)
        & (<T1, T2, T3>(t1: Task<T1>, t2: Task<T2>, t3: Task<T3>) => Task<[T1, T2, T3]>)
        & (<T1, T2, T3, T4>(t1: Task<T1>, t2: Task<T2>, t3: Task<T3>, t4: Task<T4>) => Task<[T1, T2, T3, T4]>)
        & (<T1, T2, T3, T4, T5>(t1: Task<T1>, t2: Task<T2>, t3: Task<T3>, t4: Task<T4>, t5: Task<T5>) => Task<[T1, T2, T3, T4, T5]>);

    export const all = (<T>(...tasks: Task<T>[]): Task<T[]> => {
        const taskT = {
            run: <U>(then: ((v: T[]) => U) = doNothing<T, U>()) => {
                let remainingTasks = tasks.length;
                const taskValues: T[] = [];
                const scheduledTasks = tasks.map((t, i) =>
                    t.run(v => {
                        taskValues[i] = v;
                        if (--remainingTasks == 0) {
                            then(taskValues);
                        }
                    })
                );
                return {
                    cancel: () => scheduledTasks.map(t => t.cancel()).reduce((acc, current) => acc || current, false)
                };
            }
        };
        return createTask(taskT);
    }) as allFunction;
}
