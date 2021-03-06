export type ScheduledTask = {
    cancel: () => boolean
};

export type NudeTask<T> = {
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

    export const create = createTask;

    export const lambda = <T>(action: () => T): Task<T> => createTask({
        run: <U>(then: ((v: T) => U) = doNothing<T, U>()) => {
            then(action());
            return {
                cancel: () => false
            };
        }
    });

    export const noop = lambda(doNothing<void, void>());

    export const timeout = (thresholdMs: number, w: Window = window): Task<void> => createTask({
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
    });

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

    type createEventFunction<EM, EL> = (<K extends keyof EM>(eventName: K, el: EL) => Task<EM[K]>)

    type eventFunction = (<K extends keyof WindowEventMap>(eventName: K, w?: Window) => Task<WindowEventMap[K]>)
        & createEventFunction<SVGElementEventMap, SVGElement>
        & createEventFunction<HTMLBodyElementEventMap, HTMLBodyElement>
        & createEventFunction<DocumentEventMap, HTMLDocument>
        & createEventFunction<HTMLElementEventMap, HTMLElement>

    export const event = (<K extends keyof WindowEventMap>(eventName: K, el: Window = window): Task<WindowEventMap[K]> => 
        createTask({
            run: <U>(then: ((v: WindowEventMap[K]) => U) = doNothing<WindowEventMap[K], U>()) => {
                let executed = false;
                const doit = (e: WindowEventMap[K]) => {
                    el.removeEventListener(eventName, doit);
                    then(e);
                    executed = true;
                };
                el.addEventListener(eventName, doit);
                return {
                    cancel: () => {
                        el.removeEventListener(eventName, doit);
                        return !executed;
                    }
                };
            }
        })) as eventFunction;

    type raceFunction = (<T1, T2>(t1: Task<T1>, t2: Task<T2>) => Task<[T1, undefined] | [undefined, T2]>)
        & (<T1, T2, T3>(t1: Task<T1>, t2: Task<T2>, t3: Task<T3>) => Task<[T1 | undefined, T2 | undefined, T3 | undefined]>)
        & (<T1, T2, T3, T4>(t1: Task<T1>, t2: Task<T2>, t3: Task<T3>, t4: Task<T4>) => Task<[T1 | undefined, T2 | undefined, T3 | undefined, T4 | undefined]>)
        & (<T1, T2, T3, T4, T5>(t1: Task<T1>, t2: Task<T2>, t3: Task<T3>, t4: Task<T4>, t5: Task<T5>) => Task<[T1 | undefined, T2 | undefined, T3 | undefined, T4 | undefined, T5 | undefined]>);

    // race(t1: Task<number>, t2: Task<number>) will return Task<[number, undefined] | [undefined, number]>
    export const race = (<T>(...tasks: Task<T>[]): Task<T[]> => createTask({
            run: <U>(then: ((v: T[]) => U) = doNothing<T, U>()) => {
                const tab = new Array(tasks.length);
                const scheduledTasks = tasks.map((t, taskIndex) =>
                    t.run(v => {
                        cancelAll();
                        tab[taskIndex] = v;
                        return then(tab);
                    })
                );
                const cancelAll = () => scheduledTasks.map(t => t.cancel()).reduce((acc, current) => acc || current, false);
                return {
                    cancel: cancelAll
                };
            }
    })) as raceFunction;

    type allFunction = (<T1, T2>(t1: Task<T1>, t2: Task<T2>) => Task<[T1, T2]>)
        & (<T1, T2, T3>(t1: Task<T1>, t2: Task<T2>, t3: Task<T3>) => Task<[T1, T2, T3]>)
        & (<T1, T2, T3, T4>(t1: Task<T1>, t2: Task<T2>, t3: Task<T3>, t4: Task<T4>) => Task<[T1, T2, T3, T4]>)
        & (<T1, T2, T3, T4, T5>(t1: Task<T1>, t2: Task<T2>, t3: Task<T3>, t4: Task<T4>, t5: Task<T5>) => Task<[T1, T2, T3, T4, T5]>);

    export const all = (<T>(...tasks: Task<T>[]): Task<T[]> => createTask({
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
                cancel: () => 
                    scheduledTasks
                        .map(t => t.cancel())
                        .reduce((acc, current) => acc || current, false)
            };
        }
    })) as allFunction;
}
