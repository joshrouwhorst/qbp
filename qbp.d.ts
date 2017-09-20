declare namespace qbp {
    export class qbp {
        constructor (options: options);
        add(item: any): void;
        add(arr: any[]): void;
        start(): void;
        pause(): void;
    }

    export class Options {
        threads: number;
        process(item: any, done: Function): void;
        progress(progress: Progress): void;
        progressInterval: number;
        finished(): void;
    }

    export class Progress {
        Percent: number = 0;
        Complete: number = 0;
        Total: number = 0;
        Threads: number = 0;
    }
}

declare module "qbp" {
    export = qbp;
}
