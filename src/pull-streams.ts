type StreamPuller<T> = (t: T) => any;

type NudePullStream<T> = {
    pull: (i: StreamPuller<T>) => NudePullStream<T>
};

const createSyncPullStream = (startIndex: number = 0): NudePullStream<number> => ({
    pull: (streamPuller: StreamPuller<number>) => {
        streamPuller(startIndex); 
        return createSyncPullStream(startIndex + 1);
    }
});
