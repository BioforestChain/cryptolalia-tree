export declare namespace CryptolaliaTypes {
  export interface MessageChannel<T extends Msg> {
    postMessage(msg: MessageChannel.Event<T>): void;
    onMessage?: MessageChannel.Callback<T>;
  }
  export namespace MessageChannel {
    type Event<T> = Msg.InOut<T>;
    type Callback<T> = (msgEvent: Event<T>) => unknown;
  }

  export type Msg<I = unknown, O = unknown> = { In: I; Out: O };
  namespace Msg {
    type InOut<S> = In<S> | Out<S>;
    type In<S> = S extends Msg<infer I, infer _> ? I : never;
    type Out<S> = S extends Msg<infer _, infer O> ? O : never;
    type GetOut<S, I> = S extends Msg<infer In, infer O>
      ? I extends In
        ? O
        : never
      : never;
  }
}
