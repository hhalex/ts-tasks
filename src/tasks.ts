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

const mapTask = <T, U>(t: Task<T>, f: ((t: T) => U)): Task<U> => {
    const taskU = {
        run: <V>(then: (v: U) => V = doNothing<U, V>()): ScheduledTask => t.run(v => then(f(v))),
    };

    return createTask(taskU);
};

const flatMapTask = <T, U>(t: Task<T>, f: ((t: T) => Task<U>)): Task<U> => {
    const taskU = {
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
    };
    return createTask(taskU);
};

const repeatTask = <T>(task: NudeTask<T>, n: number): NudeTask<T> => ({
    run: <U>(then: (t: T) => U = doNothing<T, U>()): ScheduledTask =>
        task.run((n === 1)
            ? then
            : (_t: T) => { repeatTask(task, n - 1).run(then); })
});

const createTask = <T>(nudeTask: NudeTask<T>) => {
    const taskT: Task<T> = {
        ...nudeTask,
        map: <V>(f: (v: T) => V) => mapTask<T, V>(taskT, f),
        flatMap: <V>(f: (t: T) => Task<V>) => flatMapTask<T, V>(taskT, f),
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
                        return executed;
                    }
                };
            }
        };
        return createTask(taskT);
    };

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
                        return executed;
                    }
                };
            }
        };
        return createTask(taskT);
    };
}
export module TaskCombinator {

    export const race = <T>(...tasks: Task<T | void>[]): Task<T | void> => {
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
    };

    export const all = <T>(...tasks: Task<T | void>[]): Task<T | void> => {
        const taskT = {
            run: <U>(then: ((v: T | void) => U) = doNothing<T, U>()) => {
                let remainingTasks = tasks.length;
                const scheduledTasks = tasks.map(t =>
                    t.run(v => {
                        if (remainingTasks-- == 0) {
                            then(v);
                        }
                    })
                );
                return {
                    cancel: () => scheduledTasks.map(t => t.cancel()).reduce((acc, current) => acc || current, false)
                };
            }
        };
        return createTask(taskT);
    };
}
