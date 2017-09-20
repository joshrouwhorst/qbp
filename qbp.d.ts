declare namespace qbp {
    export class qbp {
        constructor (options: Options);
        add(item: any): void;
        add(arr: any[]): void;
        start(): void;
        pause(): void;
    }

    export class Options {
        threads: number;
        process<T>(item: T, done: Function): void;
        progress(progress: Progress): void;
        progressInterval: number;
        empty(): void;
    }

    export class Progress {
        percent: number;
        complete: number;
        total: number;
        threads: number;
        queued: number;
    }
}

declare module "qbp" {
    export = qbp;
}
