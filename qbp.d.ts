declare namespace qbp {
    export class qbp {
        constructor (options: any);
        add(item: any): void;
        add(arr: any[]): void;
        create(): qbp;
        resume(): void;
        pause(): void;
    }

    export class Progress {
        percent: number;
        complete: number;
        total: number;
        threads: number;
        queued: number;
        name: string;
        itemsPerSecond: number;
        queue: qbp;
    }
}

declare module "qbp" {
    export = qbp;
}
