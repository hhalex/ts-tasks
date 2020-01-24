export type Task = {
    run: (then?: () => void) => ScheduledTask
};

export type ScheduledTask = {
    cancel: () => void
};

// Creates a task that will cancel all other tasks after one has finished
export const race = (...tasks: Task[]): Task => ({
    run: (then: () => void = () => {}) => {
        const cancels = tasks.map(t => t.run(() => {
            innerCancelAll(); 
            then();
        }));
        const innerCancelAll = () => cancels.forEach(t => t.cancel());
        return {
            cancel: innerCancelAll
        };
    }
})

// Creates a task from tasks, executing the "then" function after all tasks have finished
export const all = (...tasks: Task[]) => ({
    run: (then: () => void = () => {}) => {
        let nbRemainingTasks = tasks.length;
        const executeThenAfterAll = () => {
            if (nbRemainingTasks == 0) {
                then();
            } else nbRemainingTasks--;
        };
        const scheduledTasks = tasks.map(t => t.run(executeThenAfterAll));
        return {
            cancel: () => scheduledTasks.forEach(t => t.cancel())
        };
    }
});

// Repeat n times the task before executing the then function
// If n = 0, the task is repeated indefinitely
export const repeat = (task: Task, n: number): Task => ({
    run: (then: () => void = () => {}) => 
        task.run(n === 1 
            ? then
            : () => repeat(task, n - 1).run(then)
        )
});

// Creates a sequence Task from 2 tasks, executing the first and the second, and finally the "then" function
export const seq = (fst: Task, snd: Task): Task => ({
    run: (then: () => void = () => {}) => {
        let scheduledSnd: ScheduledTask;
        const scheduledFst = fst.run(() => scheduledSnd = snd.run(then))
        return {
            cancel: () => {
                scheduledFst.cancel();
                if (scheduledSnd) scheduledSnd.cancel();
            }
        };
    }
});

// Creates a task executing all tasks in order before executing the then function
export const sequence = (...[fst, ...remainingTasks]: [Task, ...Task[]]): Task => remainingTasks.length === 0
    ? fst 
    : {
        run: (then: () => void = () => {}) => {
            const remainingTask = sequence(...remainingTasks as [Task, ...Task[]]);
            return seq(fst, remainingTask).run(then);
        }
    };

export const timeoutTask = (thresholdMs: number, action: () => void) => ({
    run: (then: () => void = () => {}) => {
        const timeoutId = window.setTimeout(() => {action(); then();}, thresholdMs);
        return {
            cancel: () => window.clearTimeout(timeoutId)
        };
    }
});

export const windowEventTask = (w: Window, eventName: keyof WindowEventMap, action: () => void) => ({
    run: (then: () => void = () => {}) => {
        const actionOnce = () => {action(); then();};
        window.addEventListener(eventName, actionOnce);
        return {
            cancel: () => window.removeEventListener(eventName, actionOnce)
        };
    }
});

/*
export type Listenable<U extends Object> = {
    addEventListener: (eventName: keyof U, action: () => void) => void,
    removeEventListener: (eventName: keyof U, action: () => void) => void,
}

export const eventTask = <T extends Listenable<U>, U>(element: T, eventName: keyof U, action: () => void) => ({
    run: (then: () => void = () => {}) => {
        const actionOnce = () => { action(); then(); };
        element.addEventListener(eventName, actionOnce);
        return {
            cancel: () => window.removeEventListener(eventName, actionOnce)
        };
    }
});*/
