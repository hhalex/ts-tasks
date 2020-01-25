export type ScheduledTask = {
    cancel: () => boolean
}
export type Task<T> = {
    flatMap:  <U>(f: ((t: T) => Task<U>)) => Task<U>
    run: <U>(then: (v: T) => U) => ScheduledTask
}

const doNothing = <_T, _U>() => () => {
    return undefined as unknown as _U;
};

const flatMapTask = <T, U>(t: Task<T>, f: ((t: T) => Task<U>)): Task<U> => {
    const taskU: Task<U> = {
        run: <V>(then: (v: U) => V = noop<U, V>()): ScheduledTask => {
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
        },
        flatMap: <V>(fu: (u: U) => Task<V>) => flatMapTask<U, V>(taskU, fu)
    };
    return taskU;
};

export module Task {

    export const lambda = <T>(action: () => T): Task<T> => {
        const taskT = {
            run: <U>(then: ((v: T) => U) = doNothing<T, U>()) => {
                then(action());
                return {
                    cancel: () => false
                };
            },
            flatMap: <U>(f: (t: T) => Task<U>): Task<U> => flatMapTask<T, U>(taskT, f)
        };
        return taskT;
    };

    export const noop = lambda(doNothing<void, void>());

    export const timeoutCreator = (w: Window) =>
        <T>(action: () => T, thresholdMs: number): Task<T> => {
            const taskT = {
                run: <U>(then: ((v: T) => U) = doNothing<T, U>()) => {
                    let executed = false;
                    const timeoutId = w.setTimeout(() => { const value = action(); then(value); executed = true; }, thresholdMs);
                    return {
                        cancel: () => {
                            w.clearTimeout(timeoutId);
                            return executed;
                        }
                    };
                },
                flatMap: <U>(f: (t: T) => Task<U>): Task<U> => flatMapTask<T, U>(taskT, f)
            };
            return taskT;
        };

    type EventListenable<EventMap extends {[key in keyof EventMap]: Event}> = {
        addEventListener: <K extends keyof EventMap>(eventName: K, action: (e: EventMap[K]) => void) => void,
        removeEventListener: <K extends keyof EventMap>(eventName: K, action: (e: EventMap[K]) => void) => void,
    };

    export const eventCreator = <EM extends {[key in keyof EM]: Event}, EL extends EventListenable<EM>>(el: EL) =>
        <K extends keyof EM, T>(eventName: K, action: (e: EM[K]) => T): Task<T> => {
            const taskT = {
                run: <U>(then: ((v: T) => U) = doNothing<T, U>()) => {
                    let executed = false;
                    const doit = (e: EM[K]) => { const value = action(e); then(value); executed = true; };
                    el.addEventListener(eventName, doit);
                    return {
                        cancel: () => {
                            el.removeEventListener(eventName, doit);
                            return executed;
                        }
                    };
                },
                flatMap: <U>(f: (t: T) => Task<U>): Task<U> => flatMapTask<T, U>(taskT, f)
            };
            return taskT;
        };
}
export module TaskCombinator {
    export const repeat = <T>(task: Task<T>, n: number): Task<T> =>
        n === 1
            ? task
            : task.flatMap(_ => repeat(task, n - 1)) as Task<T>;

    export const race = <T>(...tasks: Task<T>[]): Task<T> => {
        const taskT = {
            run: <U>(then: ((v: T) => U) = doNothing<T, U>()) => {
                const scheduledTasks = tasks.map(t => t.run(v => { const res = then(v); cancelAll(); return res; }));
                const cancelAll = () => scheduledTasks.map(t => t.cancel()).reduce((acc, current) => acc || current, false);
                return {
                    cancel: cancelAll
                };
            },
            flatMap: <U>(f: (t: T) => Task<U>): Task<U> => flatMapTask<T, U>(taskT, f)
        };
        return taskT;
    };

    export const all = <T>(...tasks: Task<T>[]): Task<T> => {
        const taskT = {
            run: <U>(then: ((v: T) => U) = doNothing<T, U>()) => {
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
            },
            flatMap: <U>(f: (t: T) => Task<U>): Task<U> => flatMapTask<T, U>(taskT, f)
        };
        return taskT;
    };
}