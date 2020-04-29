import { Stream } from "./streams"
import { Task } from "./tasks"

export type Pipe<In, Out> = (i: Stream<In>) => Stream<Out>

export type FoldPipe<In, Out> = (i: Stream<In>) => Task<Out>

export type RecurrentPipe<In, Out> = (i: Task<In>) => Stream<Out>
