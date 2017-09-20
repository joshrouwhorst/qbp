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
        process(item: any, done: Function): void;
        progress(progress: Progress): void;
        progressInterval: number;
        finished(): void;
    }

    export class Progress {
        percent: number;
        complete: number;
        total: number;
        threads: number;
    }
}

declare module "qbp" {
    export = qbp;
}
