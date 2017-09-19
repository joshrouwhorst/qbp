declare namespace qbp {
    export class qbp {
        constructor (options: any);
        add(item: any): void;
        add(arr: any[]): void;
        start(): void;
        pause(): void;
    }
}

declare module "qbp" {
    export = qbp;
}
