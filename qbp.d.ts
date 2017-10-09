declare namespace qbp {
    export class qbp {
        constructor (options: any);
        add(item: any): void;
        add(arr: any[]): void;
        resume(): void;
        pause(): void;
        empty(): void;
        status: string;
        static create(options: any): qbp;
    }

    export class QbpProgress {
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
